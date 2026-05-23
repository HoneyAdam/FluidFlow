/**
 * File Validation Service
 *
 * Validates generated files, filtering out empty/malformed entries.
 * Extracted from useContinuationGeneration for testability.
 *
 * @module services/generation/validator
 */

import type { FileSystem } from '../../types';

/**
 * Validate generated files, filtering out empty/malformed entries.
 * Returns valid files and a list of invalid file paths.
 */
export function validateGeneratedFiles(
  files: FileSystem
): { validFiles: FileSystem; invalidFiles: string[] } {
  const validFiles: FileSystem = {};
  const invalidFiles: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!path || path.includes('/.') || !path.match(/\.[a-z]+$/i)) {
      console.warn('[Validator] Invalid file path:', path);
      invalidFiles.push(path);
      continue;
    }

    const contentStr = typeof content === 'string' ? content : '';
    if (
      contentStr.length < 20 ||
      /^(tsx|jsx|ts|js|css|json|md);?$/.test(contentStr.trim())
    ) {
      console.warn('[Validator] Empty or malformed file content:', path, '- content:', contentStr.slice(0, 50));
      invalidFiles.push(path);
      continue;
    }

    validFiles[path] = contentStr;
  }

  return { validFiles, invalidFiles };
}

/**
 * Check if a file path looks valid (has extension, no hidden dirs)
 */
export function isValidFilePath(path: string): boolean {
  if (!path) return false;
  if (path.includes('/.')) return false;
  return /\.[a-z]+$/i.test(path);
}

/**
 * Check if file content looks valid (not empty, not just a file type label)
 */
export function isValidFileContent(content: string, minLength: number = 20): boolean {
  if (!content || content.length < minLength) return false;
  if (/^(tsx|jsx|ts|js|css|json|md);?$/.test(content.trim())) return false;
  return true;
}
