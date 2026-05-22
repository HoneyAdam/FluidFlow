import { Router } from 'express';
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { isValidProjectId, isValidFilePath, sanitizeFilePath } from '../utils/validation';
import { safeReadJson } from '../utils/safeJson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Projects directory - use process.cwd() as fallback for better reliability
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Debug: log the resolved paths on startup
console.log('[Git API] __dirname:', __dirname);
console.log('[Git API] PROJECTS_DIR:', PROJECTS_DIR);

// Helper to get project paths
const getProjectPath = (id: string) => path.join(PROJECTS_DIR, id);
const getFilesDir = (id: string) => path.join(getProjectPath(id), 'files');
const getMetaPath = (id: string) => path.join(getProjectPath(id), 'project.json');

// Create a simpleGit instance with safe.directory configured
// This prevents "dubious ownership" errors when project dirs have different ownership
// Uses config option (git -c) instead of --local to avoid catch-22 when git
// refuses to enter the repo before safe.directory is set
const createGit = (dir: string): SimpleGit => {
  const safePath = dir.replace(/\\/g, '/');
  return simpleGit({
    baseDir: dir,
    config: [`safe.directory=${safePath}`],
  });
};

// Check if directory has its own .git folder (not inherited from parent)
const isOwnGitRepo = (dir: string): boolean => {
  const gitPath = path.join(dir, '.git');
  const exists = existsSync(gitPath);
  console.log('[Git API] isOwnGitRepo check:', { dir, gitPath, exists });
  return exists;
};

// Validate git commit hash (full SHA or short hash)
const isValidCommitHash = (hash: string): boolean => {
  if (!hash || typeof hash !== 'string') return false;
  // Full SHA-1 (40 chars) or short hash (7-40 chars), alphanumeric only
  return /^[a-fA-F0-9]{7,40}$/.test(hash);
};

// BUG-012 FIX: Validate git branch name with comprehensive checks
const isValidBranchName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;

  // Block git-internal ref names that could cause issues
  const reservedRefs = [
    'HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD',
    'REVERT_HEAD', 'BISECT_HEAD', 'AUTO_MERGE', 'NOTES_MERGE_PARTIAL',
    'NOTES_MERGE_REF', 'NOTES_MERGE_WORKTREE'
  ];
  const upperName = name.toUpperCase();
  if (reservedRefs.includes(upperName) || reservedRefs.some(ref => upperName.startsWith(ref + '/'))) {
    return false;
  }

  // Block names starting with dash (could be interpreted as git options)
  if (name.startsWith('-')) {
    return false;
  }

  // Block @{ which is used for reflog syntax
  if (name.includes('@{')) {
    return false;
  }

  // Git branch naming rules: no spaces, no .., no special chars except -/_
  // Must not start with -, not end with .lock
  return /^[a-zA-Z0-9][a-zA-Z0-9/_-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(name) &&
         !name.includes('..') && !name.endsWith('.lock');
};

// Initialize git in project
router.post('/:id/init', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.body || {}; // force=true to reinitialize corrupted repos

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if already initialized (check for .git folder specifically in this directory)
    if (isOwnGitRepo(filesDir)) {
      if (!force) {
        return res.json({ message: 'Git already initialized', initialized: true });
      }

      // Force reinitialize - delete existing .git folder
      console.log('[Git API] Force reinitializing - deleting existing .git folder');
      const gitDir = path.join(filesDir, '.git');
      await fs.rm(gitDir, { recursive: true, force: true });
    }

    const git: SimpleGit = createGit(filesDir);

    // Initialize
    await git.init();

    // Create .gitignore
    const gitignore = `node_modules/
.env
.env.local
dist/
.DS_Store
*.log
`;
    await fs.writeFile(path.join(filesDir, '.gitignore'), gitignore);

    // Initial commit
    await git.add('.');
    await git.commit('Initial commit - Created with FluidFlow');

    // Update meta - BUG-015 FIX: Use safe JSON parsing
    const meta = await safeReadJson<{ gitInitialized?: boolean; updatedAt?: number } | null>(getMetaPath(id), null);
    if (meta) {
      meta.gitInitialized = true;
      meta.updatedAt = Date.now();
      await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));
    }

    return res.json({ message: 'Git initialized', initialized: true });
  } catch (error) {
    console.error('Git init error:', error);
    return res.status(500).json({ error: 'Failed to initialize git' });
  }
});

// Get git status
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.json({ initialized: false, message: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);
    const status = await git.status();
    const branch = await git.branchLocal();

    return res.json({
      initialized: true,
      branch: branch.current,
      clean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      deleted: status.deleted,
      ahead: status.ahead,
      behind: status.behind
    });
  } catch (error: unknown) {
    console.error('Git status error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Dubious ownership: directory owned by different user
    if (errorMessage.includes('dubious ownership')) {
      return res.status(403).json({
        initialized: true,
        error: 'Git repository ownership mismatch',
        message: 'The project directory is owned by a different user. Try re-initializing git for this project.'
      });
    }

    // Corruption errors: 409 Conflict - repo exists but is unusable
    if (errorMessage.includes('corrupt') || errorMessage.includes('inflate')) {
      return res.status(409).json({
        initialized: true,
        corrupted: true,
        error: 'Git repository is corrupted',
        message: 'The git repository may need to be re-initialized'
      });
    }

    // Other git errors: 500 Internal Server Error
    return res.status(500).json({
      initialized: true,
      error: 'Failed to get git status',
      message: errorMessage
    });
  }
});

// Get commit log
router.get('/:id/log', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // BUG-FIX: Validate and clamp limit to prevent abuse (max 100 commits)
    const MAX_LOG_LIMIT = 100;
    const parsedLimit = Math.min(Math.max(1, parseInt(String(limit), 10) || 20), MAX_LOG_LIMIT);

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.json({ initialized: false, commits: [] });
    }

    const git: SimpleGit = createGit(filesDir);
    const log = await git.log({ maxCount: parsedLimit });

    return res.json({
      initialized: true,
      commits: log.all.map(commit => ({
        hash: commit.hash,
        hashShort: commit.hash.slice(0, 7),
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email,
        date: commit.date
      }))
    });
  } catch (error) {
    console.error('Git log error:', error);
    return res.status(500).json({ error: 'Failed to get git log' });
  }
});

// Create commit
router.post('/:id/commit', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, files } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // If files provided, update them first
    if (files && typeof files === 'object') {
      const { isValidFilePath, sanitizeFilePath } = await import('../utils/validation');
      for (const [filePath, content] of Object.entries(files)) {
        // Validate file path to prevent path traversal
        if (!isValidFilePath(filePath)) {
          return res.status(400).json({ error: 'Invalid file path', invalidPath: filePath });
        }
        const safePath = sanitizeFilePath(filePath);
        const fullPath = path.join(filesDir, safePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content as string);
      }
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    // Check for changes
    const status = await git.status();
    if (status.isClean()) {
      return res.json({ message: 'Nothing to commit', clean: true });
    }

    // Stage and commit
    await git.add('.');
    const commitResult = await git.commit(message || 'Update from FluidFlow');

    // Update project meta - BUG-015 FIX: Use safe JSON parsing
    const meta = await safeReadJson<{ updatedAt?: number } | null>(getMetaPath(id), null);
    if (meta) {
      meta.updatedAt = Date.now();
      await fs.writeFile(getMetaPath(id), JSON.stringify(meta, null, 2));
    }

    return res.json({
      message: 'Committed successfully',
      commit: {
        hash: commitResult.commit,
        summary: commitResult.summary
      }
    });
  } catch (error) {
    console.error('Git commit error:', error);
    return res.status(500).json({ error: 'Failed to commit' });
  }
});

// Get diff
router.get('/:id/diff', async (req, res) => {
  try {
    const { id } = req.params;
    const { cached } = req.query;

    // BUG-S01 FIX: Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);
    const diff = cached === 'true'
      ? await git.diff(['--cached'])
      : await git.diff();

    return res.json({ diff });
  } catch (error) {
    console.error('Git diff error:', error);
    return res.status(500).json({ error: 'Failed to get diff' });
  }
});

// Checkout/revert to commit
router.post('/:id/checkout', async (req, res) => {
  try {
    const { id } = req.params;
    const { commit, force } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Validate commit hash to prevent command injection
    if (!commit || !isValidCommitHash(commit)) {
      return res.status(400).json({ error: 'Invalid commit hash' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    // BUG-049 FIX: Check for uncommitted changes before checkout
    const status = await git.status();
    if (!status.isClean() && !force) {
      const modifiedFiles = [...status.modified, ...status.not_added, ...status.deleted];
      return res.status(409).json({
        error: 'Uncommitted changes would be overwritten',
        code: 'UNCOMMITTED_CHANGES',
        modifiedFiles: modifiedFiles.slice(0, 10), // Limit to first 10 files
        totalModified: modifiedFiles.length,
        message: 'Please commit or discard your changes before switching versions.',
        hint: 'Use force: true to discard local changes and checkout anyway.'
      });
    }

    // Checkout to specific commit (force discards local changes)
    if (force) {
      await git.checkout([commit, '--force']);
    } else {
      await git.checkout(commit);
    }

    return res.json({ message: `Checked out to ${commit}` });
  } catch (error) {
    console.error('Git checkout error:', error);

    // BUG-049 FIX: Parse specific git errors for better user feedback
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('would be overwritten')) {
      // Extract file names from error message
      const fileMatch = errorMessage.match(/overwritten by checkout:\s*([\s\S]*?)(?:Please|Aborting)/);
      const fileMatchContent = fileMatch?.[1];
      const files = fileMatchContent ? fileMatchContent.trim().split('\n').map(f => f.trim()).filter(Boolean) : [];

      return res.status(409).json({
        error: 'Uncommitted changes would be overwritten',
        code: 'UNCOMMITTED_CHANGES',
        modifiedFiles: files.slice(0, 10),
        totalModified: files.length,
        message: 'Please commit or discard your changes before switching versions.',
        hint: 'Use force: true to discard local changes and checkout anyway.'
      });
    }

    if (errorMessage.includes('did not match any')) {
      return res.status(404).json({
        error: 'Commit not found',
        code: 'COMMIT_NOT_FOUND',
        message: 'The specified commit was not found in the repository.'
      });
    }

    return res.status(500).json({ error: 'Failed to checkout', message: errorMessage });
  }
});

// Create branch
router.post('/:id/branch', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, checkout = true } = req.body;

    // Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Branch name required' });
    }

    // Validate branch name to prevent command injection
    if (!isValidBranchName(name)) {
      return res.status(400).json({ error: 'Invalid branch name. Use only alphanumeric characters, hyphens, underscores, and forward slashes.' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    if (checkout) {
      await git.checkoutLocalBranch(name);
    } else {
      await git.branch([name]);
    }

    return res.json({ message: `Branch '${name}' created`, checkout });
  } catch (error) {
    console.error('Git branch error:', error);
    return res.status(500).json({ error: 'Failed to create branch' });
  }
});

// List branches
router.get('/:id/branches', async (req, res) => {
  try {
    const { id } = req.params;

    // BUG-S01 FIX: Validate project ID to prevent path traversal
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.json({ initialized: false, branches: [] });
    }

    const git: SimpleGit = createGit(filesDir);
    const branches = await git.branchLocal();

    return res.json({
      initialized: true,
      current: branches.current,
      branches: branches.all
    });
  } catch (error) {
    console.error('Git branches error:', error);
    return res.status(500).json({ error: 'Failed to list branches' });
  }
});

// Get commit details (changed files and stats)
router.get('/:id/commit/:hash', async (req, res) => {
  try {
    const { id, hash } = req.params;

    // GIT-002 fix: Validate project ID and commit hash
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!isValidCommitHash(hash)) {
      return res.status(400).json({ error: 'Invalid commit hash' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    // Get commit info with --stat for file changes
    const showResult = await git.show([hash, '--stat', '--format=%H%n%h%n%s%n%b%n%an%n%ae%n%aI']);
    const lines = showResult.split('\n');

    // Parse commit info
    const fullHash = lines[0];
    const shortHash = lines[1];
    const subject = lines[2];
    const body = lines.slice(3, lines.findIndex((l, i) => i > 3 && l === '')).join('\n').trim();
    const author = lines.find((_, i) => i > 3 && lines[i - 1] === '') || '';
    const email = lines[lines.indexOf(author) + 1] || '';
    const dateStr = lines[lines.indexOf(email) + 1] || '';

    // Get changed files with status using --name-status
    const nameStatusResult = await git.show([hash, '--name-status', '--format=']);
    const fileLines = nameStatusResult.trim().split('\n').filter(l => l.trim());

    const changedFiles = fileLines.map(line => {
      const parts = line.split('\t');
      const status = parts[0] ?? '';
      const filePath = parts[1] ?? '';
      const newPath = parts[2]; // For renames

      let statusLabel: string;
      switch (status[0]) {
        case 'A': statusLabel = 'added'; break;
        case 'M': statusLabel = 'modified'; break;
        case 'D': statusLabel = 'deleted'; break;
        case 'R': statusLabel = 'renamed'; break;
        case 'C': statusLabel = 'copied'; break;
        default: statusLabel = 'unknown';
      }

      return {
        path: filePath,
        newPath: newPath || undefined,
        status: statusLabel,
        statusCode: status
      };
    }).filter(f => f.path);

    // Get stats (insertions, deletions)
    const statResult = await git.show([hash, '--stat', '--format=']);
    const statLine = statResult.split('\n').filter(l => l.includes('file') && l.includes('changed')).pop() || '';
    const insertions = parseInt((statLine.match(/(\d+) insertion/) || ['0', '0'])[1] ?? '0');
    const deletions = parseInt((statLine.match(/(\d+) deletion/) || ['0', '0'])[1] ?? '0');

    return res.json({
      hash: fullHash,
      hashShort: shortHash,
      message: subject,
      body: body || undefined,
      author,
      email,
      date: dateStr,
      files: changedFiles,
      stats: {
        filesChanged: changedFiles.length,
        insertions,
        deletions
      }
    });
  } catch (error) {
    console.error('Git commit details error:', error);
    return res.status(500).json({ error: 'Failed to get commit details' });
  }
});

// Get diff for a specific commit
router.get('/:id/commit/:hash/diff', async (req, res) => {
  try {
    const { id, hash } = req.params;
    const { file } = req.query; // Optional: specific file

    // GIT-002 fix: Validate project ID and commit hash
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!isValidCommitHash(hash)) {
      return res.status(400).json({ error: 'Invalid commit hash' });
    }

    const filesDir = getFilesDir(id);

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    // Get diff for commit (compare with parent)
    const args = [`${hash}^..${hash}`];
    if (file) {
      const filePath = String(file);
      if (!isValidFilePath(filePath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      args.push('--', sanitizeFilePath(filePath));
    }

    const diff = await git.diff(args);

    return res.json({ diff, hash, file: file || null });
  } catch (error) {
    console.error('Git commit diff error:', error);
    return res.status(500).json({ error: 'Failed to get commit diff' });
  }
});

// Get file content at specific commit
router.get('/:id/commit/:hash/file', async (req, res) => {
  try {
    const { id, hash } = req.params;
    const { path: filePath } = req.query;

    // GIT-002 fix: Validate project ID and commit hash
    if (!isValidProjectId(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!isValidCommitHash(hash)) {
      return res.status(400).json({ error: 'Invalid commit hash' });
    }

    const filesDir = getFilesDir(id);

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    if (!isValidFilePath(String(filePath))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    const sanitizedPath = sanitizeFilePath(String(filePath));

    if (!existsSync(filesDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!isOwnGitRepo(filesDir)) {
      return res.status(400).json({ error: 'Git not initialized' });
    }

    const git: SimpleGit = createGit(filesDir);

    try {
      const content = await git.show([`${hash}:${sanitizedPath}`]);
      return res.json({ content, path: sanitizedPath, hash });
    } catch {
      // File might not exist at this commit
      return res.json({ content: null, path: filePath, hash, notFound: true });
    }
  } catch (error) {
    console.error('Git file content error:', error);
    return res.status(500).json({ error: 'Failed to get file content' });
  }
});

export { router as gitRouter };
