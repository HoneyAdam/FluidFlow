import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { isValidProjectId, isValidFilePath, sanitizeFilePath, isPathWithin } from '../utils/validation';
import { safeReadJson } from '../utils/safeJson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Projects directory - use process.cwd() for reliability
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// PROJ-002 fix: File size limits to prevent memory exhaustion
const MAX_SINGLE_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_PROJECT_SIZE = 50 * 1024 * 1024; // 50MB total per project

// Ensure projects dir exists
if (!existsSync(PROJECTS_DIR)) {
  mkdirSync(PROJECTS_DIR, { recursive: true });
}

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  gitInitialized?: boolean;
  githubRepo?: string;
  firstStartAt?: number;
  lastCommitAt?: number;
  hasNodeModules?: boolean;
  nodeModulesSize?: number;
}

interface _ProjectFile {
  path: string;
  content: string;
}

interface _Project extends ProjectMeta {
  files: Record<string, string>;
}

// Helper to get project path
const getProjectPath = (id: string) => path.join(PROJECTS_DIR, id);
const getMetaPath = (id: string) => path.join(getProjectPath(id), 'project.json');
const getFilesDir = (id: string) => path.join(getProjectPath(id), 'files');
const getContextPath = (id: string) => path.join(getProjectPath(id), 'context.json');
const getNodeModulesPath = (id: string) => path.join(getFilesDir(id), 'node_modules');
const getFluidFlowMetaPath = (id: string) => path.join(getFilesDir(id), '.fluidflow', 'project.json');

// Helper to get directory size recursively
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }
  return totalSize;
}

// Helper to get node_modules info for a project
async function getNodeModulesInfo(projectId: string): Promise<{ exists: boolean; size: number }> {
  const nodeModulesPath = getNodeModulesPath(projectId);
  try {
    const stats = await fs.stat(nodeModulesPath);
    if (stats.isDirectory()) {
      const size = await getDirectorySize(nodeModulesPath);
      return { exists: true, size };
    }
  } catch {
    // node_modules doesn't exist
  }
  return { exists: false, size: 0 };
}

// Screenshot metadata interface (matches frontend types)
interface ScreenshotMeta {
  id: string;
  filename: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  size: number;
  capturedAt: number;
  thumbnail?: string;
}

interface ProjectScreenshots {
  latest?: ScreenshotMeta;
  history: ScreenshotMeta[];
  maxHistory: number;
}

// Helper to get FluidFlow metadata (includes screenshots)
async function getFluidFlowMeta(projectId: string): Promise<{ screenshots?: ProjectScreenshots; lastScreenshot?: number } | null> {
  const metaPath = getFluidFlowMetaPath(projectId);
  try {
    const meta = await safeReadJson<{ screenshots?: ProjectScreenshots; lastScreenshot?: number }>(metaPath, null);
    return meta;
  } catch {
    return null;
  }
}

// Per-project locks to prevent concurrent file updates
// HIGH-002 FIX: Queue-based approach to eliminate TOCTOU race condition
// Previous implementation had a gap between checking for existing lock and setting new one
// This queue-based approach chains promises to ensure sequential execution
const projectLockQueues = new Map<string, { promise: Promise<void>; timestamp: number }>();

// BUG-036 FIX: Maximum number of concurrent lock queues to prevent memory exhaustion
const MAX_LOCK_QUEUES = 100;

// Periodic cleanup of stale lock queues (queues not accessed for 5 minutes).
// .unref() so this background timer doesn't block Node from exiting cleanly.
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [projectId, entry] of projectLockQueues.entries()) {
    if (now - entry.timestamp > LOCK_TIMEOUT_MS) {
      console.warn(`[Projects] Cleaning up stale lock queue for project ${projectId}`);
      projectLockQueues.delete(projectId);
    }
  }
}, 60 * 1000).unref(); // Check every minute

async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  // BUG-036 FIX: Check queue size before adding new entries
  // If this is a new project and we're at capacity, reject the request
  const existingEntry = projectLockQueues.get(projectId);
  if (!existingEntry && projectLockQueues.size >= MAX_LOCK_QUEUES) {
    throw new Error('Server is busy. Too many concurrent project operations. Please try again later.');
  }

  // Get the current queue for this project (or resolved promise if none)
  const previousLock = existingEntry?.promise || Promise.resolve();

  // Create our lock promise
  let releaseLock: () => void = () => {};
  const myLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // CRITICAL: Set our lock in the queue BEFORE any await
  // This ensures no interleaving - the set happens synchronously
  projectLockQueues.set(projectId, { promise: myLock, timestamp: Date.now() });

  try {
    // Wait for all previous operations on this project to complete
    await previousLock;
    // Now execute our function
    return await fn();
  } finally {
    // Release our lock so the next operation can proceed
    releaseLock();
    // Clean up the queue entry if this is still the latest lock
    const currentEntry = projectLockQueues.get(projectId);
    if (currentEntry && currentEntry.promise === myLock) {
      projectLockQueues.delete(projectId);
    }
  }
}

// Project context structure (version history + UI state)
interface HistoryEntry {
  files: Record<string, string>;
  label: string;
  timestamp: number;
  type: 'auto' | 'manual' | 'snapshot';
  changedFiles?: string[];
}

interface AIHistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  model: string;
  provider: string;
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  durationMs: number;
  success: boolean;
  error?: string;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  templateType?: 'auto-fix' | 'inspect-edit' | 'prompt-template' | 'chat' | 'checkpoint';
}

interface ProjectContext {
  // Version history
  history: HistoryEntry[];
  currentIndex: number;

  // UI state
  activeFile?: string;
  activeTab?: string;

  // AI generation history
  aiHistory?: AIHistoryEntry[];

  // Saved at timestamp
  savedAt: number;
}

const MAX_HISTORY = 30;
const MAX_AI_HISTORY = 100;
const MAX_CONTEXT_PAYLOAD_BYTES = 1024 * 1024;

function enforceContextPayloadLimit(payload: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf-8') <= MAX_CONTEXT_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

async function saveProjectContext(
  id: string,
  updates: Partial<ProjectContext>,
): Promise<number> {
  const projectPath = getProjectPath(id);

  if (!existsSync(projectPath)) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  if (!enforceContextPayloadLimit(updates)) {
    throw new Error('CONTEXT_TOO_LARGE');
  }

  const { history, currentIndex, activeFile, activeTab, aiHistory } = updates;

  const contextPath = getContextPath(id);
  let existingContext: Partial<ProjectContext> = {};
  if (existsSync(contextPath)) {
    existingContext = await safeReadJson<Partial<ProjectContext>>(contextPath, {});
  }

  let limitedHistory = history ?? existingContext.history ?? [];
  if (limitedHistory.length > MAX_HISTORY) {
    const snapshots = limitedHistory.filter((h: HistoryEntry) => h.type === 'snapshot');
    const nonSnapshots = limitedHistory.filter((h: HistoryEntry) => h.type !== 'snapshot');
    const nonSnapshotsToKeep = Math.max(0, MAX_HISTORY - snapshots.length);
    const keepNonSnapshots = nonSnapshotsToKeep > 0
      ? nonSnapshots.slice(-nonSnapshotsToKeep)
      : [];
    limitedHistory = [...snapshots, ...keepNonSnapshots]
      .sort((a: HistoryEntry, b: HistoryEntry) => a.timestamp - b.timestamp);
  }

  let limitedAiHistory = aiHistory ?? existingContext.aiHistory ?? [];
  if (limitedAiHistory.length > MAX_AI_HISTORY) {
    limitedAiHistory = limitedAiHistory.slice(0, MAX_AI_HISTORY);
  }

  const context: ProjectContext = {
    history: limitedHistory,
    currentIndex: Math.min(currentIndex ?? existingContext.currentIndex ?? 0, Math.max(0, limitedHistory.length - 1)),
    activeFile: activeFile ?? existingContext.activeFile,
    activeTab: activeTab ?? existingContext.activeTab,
    aiHistory: limitedAiHistory,
    savedAt: Date.now()
  };

  if (!enforceContextPayloadLimit(context)) {
    throw new Error('CONTEXT_TOO_LARGE');
  }

  await fs.writeFile(contextPath, JSON.stringify(context, null, 2));

  const metaPath = getMetaPath(id);
  const meta = await safeReadJson<ProjectMeta | null>(metaPath, null);
  if (meta) {
    meta.updatedAt = Date.now();
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  return context.savedAt;
}

// List all projects
router.get('/', async (req, res) => {
  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: (ProjectMeta & { screenshots?: ProjectScreenshots; lastScreenshotAt?: number })[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = getMetaPath(entry.name);
        // BUG-FIX: Use safe JSON parsing to prevent crashes
        const meta = await safeReadJson<ProjectMeta | null>(metaPath, null);
        if (meta && meta.id) {
          // Get node_modules info for each project
          const nodeModulesInfo = await getNodeModulesInfo(entry.name);
          meta.hasNodeModules = nodeModulesInfo.exists;
          meta.nodeModulesSize = nodeModulesInfo.size;

          // Get FluidFlow metadata (screenshots)
          const fluidFlowMeta = await getFluidFlowMeta(entry.name);
          const projectWithScreenshots = {
            ...meta,
            screenshots: fluidFlowMeta?.screenshots,
            lastScreenshotAt: fluidFlowMeta?.lastScreenshot,
          };

          projects.push(projectWithScreenshots);
        }
      }
    }

    // Sort by updatedAt descending
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return res.json(projects);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // BUG-FIX: Use safe JSON parsing to prevent crashes on corrupted files
    const meta = await safeReadJson<ProjectMeta | null>(getMetaPath(id), null);
    if (!meta) {
      return res.status(500).json({ error: 'Project metadata corrupted' });
    }

    const filesDir = getFilesDir(id);

    // Track first start if not set
    let metaUpdated = false;
    if (!meta.firstStartAt) {
      meta.firstStartAt = Date.now();
      metaUpdated = true;
    }

    // Get node_modules info
    const nodeModulesInfo = await getNodeModulesInfo(id);
    meta.hasNodeModules = nodeModulesInfo.exists;
    meta.nodeModulesSize = nodeModulesInfo.size;

    // Auto-create .gitignore if it doesn't exist
    const gitignorePath = path.join(filesDir, '.gitignore');
    if (existsSync(filesDir) && !existsSync(gitignorePath)) {
      const defaultGitignore = `# Dependencies
node_modules/

# Build outputs
dist/
build/
.next/
.nuxt/

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
`;
      try {
        await fs.writeFile(gitignorePath, defaultGitignore);
        console.log(`[Projects] Auto-created .gitignore for project ${id}`);
      } catch (err) {
        console.warn(`[Projects] Failed to create .gitignore for project ${id}:`, err);
      }
    }

    // Save meta if updated
    if (metaUpdated) {
      await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));
    }
    const files: Record<string, string> = {};

    // Read all files recursively (excluding .git and other system folders)
    const IGNORED_FOLDERS = ['.git', '.fluidflow', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache'];
    const IGNORED_FILES = ['.DS_Store', 'Thumbs.db'];
    const MAX_DEPTH = 15; // Prevent stack overflow from deeply nested directories
    let totalSize = 0;

    async function readFilesRecursively(dir: string, basePath: string = '', depth: number = 0) {
      // Depth limit to prevent stack overflow
      if (depth > MAX_DEPTH) {
        console.warn(`[Projects] Max depth (${MAX_DEPTH}) exceeded at: ${basePath}`);
        return;
      }

      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip ignored folders and files
        if (IGNORED_FOLDERS.includes(entry.name) || IGNORED_FILES.includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await readFilesRecursively(fullPath, relativePath, depth + 1);
        } else {
          // PROJ-002 fix: Check file size before reading
          const stat = await fs.stat(fullPath);
          if (stat.size > MAX_SINGLE_FILE_SIZE) {
            console.warn(`[Projects] Skipping large file: ${relativePath} (${stat.size} bytes)`);
            continue; // Skip files larger than limit
          }
          totalSize += stat.size;
          if (totalSize > MAX_TOTAL_PROJECT_SIZE) {
            console.warn(`[Projects] Project size limit exceeded, stopping read`);
            return; // Stop if total size exceeds limit
          }
          files[relativePath] = await fs.readFile(fullPath, 'utf-8');
        }
      }
    }

    if (existsSync(filesDir)) {
      await readFilesRecursively(filesDir);
    }

    return res.json({ ...meta, files });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to get project' });
  }
});

// Helper to validate all file paths in a files object
function validateFilePaths(files: Record<string, unknown>): { valid: boolean; invalidPath?: string } {
  for (const filePath of Object.keys(files)) {
    if (!isValidFilePath(filePath)) {
      return { valid: false, invalidPath: filePath };
    }
  }
  return { valid: true };
}

// PROJ-002 fix: Helper to validate file sizes
function validateFileSizes(files: Record<string, unknown>): { valid: boolean; error?: string; totalSize?: number } {
  let totalSize = 0;
  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content === 'string') {
      const fileSize = Buffer.byteLength(content, 'utf-8');
      if (fileSize > MAX_SINGLE_FILE_SIZE) {
        return {
          valid: false,
          error: `File "${filePath}" exceeds maximum size (${Math.round(fileSize / 1024 / 1024)}MB > ${MAX_SINGLE_FILE_SIZE / 1024 / 1024}MB)`
        };
      }
      totalSize += fileSize;
    }
  }
  if (totalSize > MAX_TOTAL_PROJECT_SIZE) {
    return {
      valid: false,
      error: `Total project size exceeds maximum (${Math.round(totalSize / 1024 / 1024)}MB > ${MAX_TOTAL_PROJECT_SIZE / 1024 / 1024}MB)`,
      totalSize
    };
  }
  return { valid: true, totalSize };
}

// Create new project
router.post('/', async (req, res) => {
  try {
    const { name, description, files } = req.body;

    // FIX-34: Validate project name/description length
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Project name must be 100 characters or less' });
    }
    if (description && typeof description === 'string' && description.length > 500) {
      return res.status(400).json({ error: 'Project description must be 500 characters or less' });
    }

    const id = uuidv4();
    const projectPath = getProjectPath(id);
    const filesDir = getFilesDir(id);

    // Validate file paths to prevent path traversal attacks
    if (files && typeof files === 'object') {
      const pathValidation = validateFilePaths(files);
      if (!pathValidation.valid) {
        return res.status(400).json({
          error: 'Invalid file path detected',
          invalidPath: pathValidation.invalidPath
        });
      }

      // PROJ-002 fix: Validate file sizes
      const sizeValidation = validateFileSizes(files);
      if (!sizeValidation.valid) {
        return res.status(400).json({ error: sizeValidation.error });
      }
    }

    // Create directories
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(filesDir, { recursive: true });

    // Create meta file
    const meta: ProjectMeta = {
      id,
      name: name || 'Untitled Project',
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: false
    };

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    // Save files (paths already validated above)
    if (files && typeof files === 'object') {
      for (const [filePath, content] of Object.entries(files)) {
        const safePath = sanitizeFilePath(filePath);
        const fullPath = path.join(filesDir, safePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content as string);
      }
    }

    return res.status(201).json({ ...meta, files: files || {} });
  } catch (_error) {
    console.error('Create project error:', _error);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project (auto-save endpoint)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, files, force } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // FIX-34: Validate project name/description length on update
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Project name is required' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'Project name must be 100 characters or less' });
      }
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
      return res.status(400).json({ error: 'Project description must be 500 characters or less' });
    }

    // Validate file paths to prevent path traversal attacks
    if (files && typeof files === 'object') {
      const pathValidation = validateFilePaths(files);
      if (!pathValidation.valid) {
        return res.status(400).json({
          error: 'Invalid file path detected',
          invalidPath: pathValidation.invalidPath
        });
      }

      // PROJ-002 fix: Validate file sizes
      const sizeValidation = validateFileSizes(files);
      if (!sizeValidation.valid) {
        return res.status(400).json({ error: sizeValidation.error });
      }
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Use lock to prevent concurrent updates to the same project
    const result = await withProjectLock(id, async () => {
      // Update meta - BUG-FIX: Use safe JSON parsing
      const meta = await safeReadJson<ProjectMeta | null>(getMetaPath(id), null);
      if (!meta) {
        throw new Error('Project metadata corrupted');
      }
    if (name) meta.name = name;
    if (description !== undefined) meta.description = description;
    meta.updatedAt = Date.now();

    await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));

    // Update files if provided
    if (files && typeof files === 'object') {
      const fileCount = Object.keys(files).length;
      const filesDir = getFilesDir(id);

      // Count existing files to detect suspicious updates (excluding .git, .fluidflow, node_modules, etc.)
      const IGNORED_FOLDERS = ['.git', '.fluidflow', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache'];
      const IGNORED_FILES = ['.DS_Store', 'Thumbs.db'];

      let existingFileCount = 0;
      if (existsSync(filesDir)) {
        async function countFiles(dir: string): Promise<number> {
          let count = 0;
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              // Skip ignored folders and files
              if (IGNORED_FOLDERS.includes(entry.name) || IGNORED_FILES.includes(entry.name)) {
                continue;
              }
              if (entry.isDirectory()) {
                count += await countFiles(path.join(dir, entry.name));
              } else {
                count++;
              }
            }
          } catch {
            // Ignore errors
          }
          return count;
        }
        existingFileCount = await countFiles(filesDir);
      }

      // CRITICAL: Never delete all files if incoming files is empty!
      // This prevents accidental data loss from race conditions or bugs
      if (fileCount === 0) {
        console.warn(`[Projects API] BLOCKED empty files update for project ${id} - would delete ${existingFileCount} files!`);
        // do not update files at all if empty - return warning but success
        return {
          meta,
          message: 'Empty update blocked',
          warning: 'Cannot sync empty file set - this would delete all project files',
          blocked: true,
          existingFileCount,
          newFileCount: fileCount
        };
      } else if (!force && existingFileCount > 5 && fileCount < existingFileCount * 0.3) {
        // If we have more than 5 files and new update has less than 30% of them, ask for confirmation
        // Unless force=true is passed (user confirmed)
        console.warn(`[Projects API] Suspicious update for project ${id} - would reduce files from ${existingFileCount} to ${fileCount}. Requesting confirmation.`);
        return {
          meta,
          confirmationRequired: true,
          message: `This update will reduce files from ${existingFileCount} to ${fileCount}. Are you sure?`,
          existingFileCount,
          newFileCount: fileCount,
          warning: 'Significant file reduction detected'
        };
      } else {
        // Safe to update (or force=true was passed)
        if (force && existingFileCount > 5 && fileCount < existingFileCount * 0.3) {
          console.log(`[Projects API] FORCE update for project ${id} - reducing files from ${existingFileCount} to ${fileCount} (user confirmed)`);
        }

        // IMPORTANT: do not delete entire directory - preserve .git!
        // Instead: delete old files, write new files, keep .git intact

        if (existsSync(filesDir)) {
          // Get list of current files (excluding .git)
          async function getFilePaths(dir: string, basePath: string = ''): Promise<string[]> {
            const paths: string[] = [];
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                // Skip .git and other preserved folders
                if (IGNORED_FOLDERS.includes(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);
                const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                  paths.push(...await getFilePaths(fullPath, relativePath));
                } else {
                  if (!IGNORED_FILES.includes(entry.name)) {
                    paths.push(relativePath);
                  }
                }
              }
            } catch {
              // Ignore errors
            }
            return paths;
          }

          const existingPaths = await getFilePaths(filesDir);
          const newPaths = new Set(Object.keys(files));

          // Delete files that are no longer in the new set
          for (const oldPath of existingPaths) {
            if (!newPaths.has(oldPath)) {
              const fullPath = path.join(filesDir, oldPath);
              try {
                await fs.unlink(fullPath);
              } catch {
                // File might already be gone
              }
            }
          }

          // Clean up empty directories (except .git)
          async function cleanEmptyDirs(dir: string): Promise<void> {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory() && !IGNORED_FOLDERS.includes(entry.name)) {
                  const subDir = path.join(dir, entry.name);
                  await cleanEmptyDirs(subDir);
                  // Try to remove if empty
                  try {
                    await fs.rmdir(subDir);
                  } catch {
                    // Not empty, that's fine
                  }
                }
              }
            } catch {
              // Ignore errors
            }
          }
          await cleanEmptyDirs(filesDir);
        } else {
          await fs.mkdir(filesDir, { recursive: true });
        }

        // Write new/updated files (paths already validated above)
        for (const [filePath, content] of Object.entries(files)) {
          const safePath = sanitizeFilePath(filePath);
          const fullPath = path.join(filesDir, safePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content as string);
        }

        console.log(`[Projects API] Updated ${fileCount} files for project ${id} (was ${existingFileCount})`);
        }
      }

      return { meta, message: 'Project updated' };
    });

    // Handle special responses from inside the lock
    if ('confirmationRequired' in result || 'blocked' in result || 'warning' in result) {
      return res.json({ ...result.meta, ...result });
    }

    return res.json({ ...result.meta, message: result.message });
  } catch (_error) {
    console.error('Update project error:', _error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal attacks
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await fs.rm(projectPath, { recursive: true });
    return res.json({ message: 'Project deleted', id });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Delete node_modules for a project (cleanup endpoint)
router.delete('/:id/node_modules', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal attacks
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const nodeModulesPath = getNodeModulesPath(id);

    if (!existsSync(nodeModulesPath)) {
      return res.status(404).json({ error: 'node_modules not found', hasNodeModules: false });
    }

    // Get size before deletion for response
    const sizeBefore = await getDirectorySize(nodeModulesPath);

    // Delete node_modules directory
    await fs.rm(nodeModulesPath, { recursive: true, force: true });

    console.log(`[Projects] Deleted node_modules for project ${id} (${Math.round(sizeBefore / 1024 / 1024)}MB freed)`);

    return res.json({
      message: 'node_modules deleted',
      id,
      freedBytes: sizeBefore,
      freedMB: Math.round(sizeBefore / 1024 / 1024 * 100) / 100
    });
  } catch (_error) {
    console.error('Delete node_modules error:', _error);
    return res.status(500).json({ error: 'Failed to delete node_modules' });
  }
});

// Duplicate project
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validate project ID to prevent path traversal attacks
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const sourcePath = getProjectPath(id);

    if (!existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get source project - BUG-FIX: Use safe JSON parsing
    const sourceMeta = await safeReadJson<ProjectMeta | null>(getMetaPath(id), null);
    if (!sourceMeta) {
      return res.status(500).json({ error: 'Source project metadata corrupted' });
    }

    // Create new project
    const newId = uuidv4();
    const newPath = getProjectPath(newId);

    // Copy directory
    await fs.cp(sourcePath, newPath, { recursive: true });

    // Update meta
    const newMeta: ProjectMeta = {
      ...sourceMeta,
      id: newId,
      name: name || `${sourceMeta.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      gitInitialized: false,
      githubRepo: undefined
    };

    await fs.writeFile(getMetaPath(newId), JSON.stringify(newMeta, null, 2));

    // Remove .git if exists
    const gitDir = path.join(newPath, '.git');
    if (existsSync(gitDir)) {
      await fs.rm(gitDir, { recursive: true });
    }

    return res.status(201).json(newMeta);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to duplicate project' });
  }
});

// ============ PROJECT CONTEXT (VERSION HISTORY + UI STATE) ============

// Get project context
router.get('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const projectPath = getProjectPath(id);

    if (!existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const contextPath = getContextPath(id);

    // BUG-FIX: Use safe JSON parsing with fallback
    const defaultContext: ProjectContext = {
      history: [],
      currentIndex: -1,
      savedAt: 0
    };

    if (existsSync(contextPath)) {
      const context = await safeReadJson<ProjectContext>(contextPath, defaultContext);
      return res.json(context);
    } else {
      // Return empty context if not exists
      return res.json(defaultContext);
    }
  } catch (_error) {
    console.error('Get context error:', _error);
    return res.status(500).json({ error: 'Failed to get project context' });
  }
});

// Save project context (PUT for normal requests, POST for sendBeacon)
router.put('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const savedAt = await saveProjectContext(id, req.body as Partial<ProjectContext>);
    return res.json({ message: 'Context saved', savedAt });
  } catch (_error) {
    console.error('Save context error:', _error);
    if (_error instanceof Error && _error.message === 'PROJECT_NOT_FOUND') {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (_error instanceof Error && _error.message === 'CONTEXT_TOO_LARGE') {
      return res.status(413).json({ error: 'Project context payload too large' });
    }
    return res.status(500).json({ error: 'Failed to save project context' });
  }
});

// Save project context via POST (for sendBeacon on page unload)
router.post('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const savedAt = await saveProjectContext(id, req.body as Partial<ProjectContext>);
    return res.json({ message: 'Context saved', savedAt });
  } catch (_error) {
    console.error('Save context error:', _error);
    if (_error instanceof Error && _error.message === 'PROJECT_NOT_FOUND') {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (_error instanceof Error && _error.message === 'CONTEXT_TOO_LARGE') {
      return res.status(413).json({ error: 'Project context payload too large' });
    }
    return res.status(500).json({ error: 'Failed to save project context' });
  }
});

// Clear project context (useful for reset)
router.delete('/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const contextPath = getContextPath(id);

    if (existsSync(contextPath)) {
      await fs.unlink(contextPath);
    }

    return res.json({ message: 'Context cleared' });
  } catch (_error) {
    console.error('Clear context error:', _error);
    return res.status(500).json({ error: 'Failed to clear project context' });
  }
});

// ============================================================================
// File Operations (for screenshots and .fluidflow metadata)
// ============================================================================

// Read a specific file from project
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = req.query.path as string;

    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!filePath || !isValidFilePath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const sanitizedPath = sanitizeFilePath(filePath);
    const fullPath = path.join(getFilesDir(id), sanitizedPath);

    // Security: Ensure path is within project directory
    const projectFilesDir = getFilesDir(id);
    if (!isPathWithin(fullPath, projectFilesDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      // For internal metadata files (.fluidflow/), return 200 with null content
      // instead of 404 to avoid noisy errors in browser console
      if (sanitizedPath.startsWith('.fluidflow/') || sanitizedPath.startsWith('.fluidflow\\')) {
        return res.json({ content: null, path: sanitizedPath, notFound: true });
      }
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if file is binary (image)
    const ext = path.extname(fullPath).toLowerCase();
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'];

    if (binaryExtensions.includes(ext)) {
      // Read as binary and return as data URL
      const binaryData = await fs.readFile(fullPath);
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.bmp': 'image/bmp'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      const base64 = binaryData.toString('base64');
      const content = `data:${mimeType};base64,${base64}`;
      return res.json({ content, path: sanitizedPath });
    } else {
      // Read as text
      const content = await fs.readFile(fullPath, 'utf-8');
      return res.json({ content, path: sanitizedPath });
    }
  } catch (error) {
    console.error('Read file error:', error);
    return res.status(500).json({ error: 'Failed to read file' });
  }
});

// Save a specific file to project
router.put('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const { path: filePath, content } = req.body;

    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!filePath || !isValidFilePath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Check file size
    if (content.length > MAX_SINGLE_FILE_SIZE) {
      return res.status(413).json({ error: 'File too large' });
    }

    const sanitizedPath = sanitizeFilePath(filePath);
    const fullPath = path.join(getFilesDir(id), sanitizedPath);

    // Security: Ensure path is within project directory
    const projectFilesDir = getFilesDir(id);
    if (!isPathWithin(fullPath, projectFilesDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Check if content is a data URL (for images/binary files)
    const dataUrlMatch = content.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      // Convert base64 data URL to binary and save
      const base64Data = dataUrlMatch[2];
      const binaryData = Buffer.from(base64Data, 'base64');
      await fs.writeFile(fullPath, binaryData);
      console.log(`[Projects] Saved binary file: ${sanitizedPath} (${binaryData.length} bytes)`);
    } else {
      // Save as text file
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    return res.json({ message: 'File saved', path: sanitizedPath });
  } catch (error) {
    console.error('Save file error:', error);
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

// Delete a specific file from project
router.delete('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = req.query.path as string;

    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!filePath || !isValidFilePath(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const sanitizedPath = sanitizeFilePath(filePath);
    const fullPath = path.join(getFilesDir(id), sanitizedPath);

    // Security: Ensure path is within project directory
    const projectFilesDir = getFilesDir(id);
    if (!isPathWithin(fullPath, projectFilesDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
    }

    return res.json({ message: 'File deleted', path: sanitizedPath });
  } catch (error) {
    console.error('Delete file error:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

export { router as projectsRouter };
