/**
 * Export Service
 *
 * Handles ZIP assembly and GitHub Git Data API operations.
 * Extracted from useExport hook for testability.
 *
 * @module services/export
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { FileSystem } from '../types';
import {
  getPackageJson,
  getViteConfig,
  getTsConfig,
  getTailwindConfig,
  getPostcssConfig,
  getIndexHtml,
  getMainTsx,
  getTailwindCss,
  getReadme,
} from '../utils/exportConfig';

/**
 * Default .gitignore content
 */
export const DEFAULT_GITIGNORE = `# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/

# IDE
.idea/
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;

/**
 * Generate .env.example content from .env content.
 * Replaces values with placeholder text.
 */
export function generateEnvExample(envContent: string): string {
  return envContent
    .split('\n')
    .map((line) => {
      if (!line.trim() || line.startsWith('#')) return line;
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
      const matchStr = match?.[1];
      if (matchStr) return `${matchStr}=your_${matchStr.toLowerCase()}_here`;
      return line;
    })
    .join('\n');
}

/**
 * Fix import paths: replace `from 'src/` with `from './`
 */
export function fixImportPaths(content: string): string {
  return content
    .replace(/from ['"]src\//g, "from './")
    .replace(/import ['"]src\//g, "import './");
}

/**
 * Collect all files for export, including standard config files.
 * Returns a flat record of path → content.
 */
export function collectExportFiles(
  projectFiles: FileSystem,
  repoName: string
): Record<string, string> {
  const collected: Record<string, string> = {
    'package.json': JSON.stringify(getPackageJson(repoName), null, 2),
    'vite.config.ts': getViteConfig(),
    'tsconfig.json': JSON.stringify(getTsConfig(), null, 2),
    'tailwind.config.js': getTailwindConfig(),
    'postcss.config.js': getPostcssConfig(),
    'index.html': getIndexHtml(),
    'src/main.tsx': getMainTsx(),
    'src/index.css': projectFiles['src/index.css'] || getTailwindCss(),
    'README.md': getReadme(),
  };

  // Add .gitignore if not in project files
  if (!projectFiles['.gitignore']) {
    collected['.gitignore'] = DEFAULT_GITIGNORE;
  }

  // Generate .env.example from .env
  if (projectFiles['.env']) {
    collected['.env.example'] = generateEnvExample(projectFiles['.env']);
  }

  // Add project files (skip src/index.css already handled)
  for (const [path, content] of Object.entries(projectFiles)) {
    if (path === 'src/index.css') continue;
    collected[path] = fixImportPaths(content);
  }

  return collected;
}

/**
 * Build a ZIP blob from collected export files.
 */
export async function buildZipBlob(
  files: Record<string, string>,
  zipFilename: string = 'fluidflow-app.zip'
): Promise<Blob> {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
}

/**
 * Download project files as ZIP.
 */
export async function downloadAsZip(
  projectFiles: FileSystem,
  repoName: string
): Promise<void> {
  const collected = collectExportFiles(projectFiles, repoName);
  const blob = await buildZipBlob(collected, `${repoName}.zip`);
  saveAs(blob, `${repoName}.zip`);
}

/**
 * File entry for GitHub push
 */
export interface GitHubFileEntry {
  path: string;
  content: string;
}

/**
 * Result of a GitHub push operation
 */
export interface GitHubPushResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Push files to a new GitHub repository using the Git Data API.
 * Creates the repo, blobs, tree, commit, and updates the ref.
 */
export async function pushToNewGithubRepo(
  token: string,
  repoName: string,
  projectFiles: FileSystem
): Promise<GitHubPushResult> {
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Create repository
    const createRepoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repoName,
        description: 'Generated with FluidFlow',
        private: false,
        auto_init: true,
      }),
    });

    if (!createRepoRes.ok) {
      const errorData = await createRepoRes.json();
      throw new Error(errorData.message);
    }

    const repoData = await createRepoRes.json();

    // 2. Get user info
    const userRes = await fetch('https://api.github.com/user', { headers });
    const userData = await userRes.json();

    // 3. Wait for repo to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 4. Get default branch ref
    const refRes = await fetch(
      `https://api.github.com/repos/${userData.login}/${repoName}/git/ref/heads/main`,
      { headers }
    );

    if (!refRes.ok) {
      throw new Error('Failed to get repository reference');
    }

    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 5. Collect files
    const collected = collectExportFiles(projectFiles, repoName);
    const filesToPush: GitHubFileEntry[] = Object.entries(collected).map(
      ([path, content]) => ({ path, content })
    );

    // 6. Create blobs
    const treeEntries = await Promise.all(
      filesToPush.map(async (file) => {
        const blobRes = await fetch(
          `https://api.github.com/repos/${userData.login}/${repoName}/git/blobs`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: file.content,
              encoding: 'utf-8',
            }),
          }
        );
        const blobData = await blobRes.json();
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      })
    );

    // 7. Create tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${userData.login}/${repoName}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base_tree: baseSha,
          tree: treeEntries,
        }),
      }
    );
    const treeData = await treeRes.json();

    // 8. Create commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${userData.login}/${repoName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'Initial commit from FluidFlow',
          tree: treeData.sha,
          parents: [baseSha],
        }),
      }
    );
    const commitData = await commitRes.json();

    // 9. Update ref
    await fetch(
      `https://api.github.com/repos/${userData.login}/${repoName}/git/refs/heads/main`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: commitData.sha,
        }),
      }
    );

    return { success: true, url: repoData.html_url };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to push to GitHub';
    return { success: false, error: msg };
  }
}
