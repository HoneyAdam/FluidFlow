/**
 * Server-side validation utilities for security
 */

import path from 'path';

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a project ID is a valid UUID v4
 * Prevents path traversal and injection attacks
 */
export function isValidProjectId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

/**
 * Validates a file path to prevent path traversal attacks
 * Returns true if the path is safe to use
 */
export function isValidFilePath(filePath: unknown): boolean {
  if (typeof filePath !== 'string') return false;

  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');

  // Block path traversal attempts
  if (normalized.includes('..')) return false;

  // Block absolute paths
  if (normalized.startsWith('/')) return false;

  // Block Windows drive letters (C:, D:, etc.)
  if (/^[a-zA-Z]:/.test(normalized)) return false;

  // Block null bytes
  if (normalized.includes('\0')) return false;

  // Block URL-encoded traversal attempts
  if (/%2e%2e/i.test(normalized) || /%00/.test(normalized)) return false;

  // Block control characters (intentionally using control character regex for security)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(normalized)) return false;

  // BUG-013 FIX: Block dangerous file/folder prefixes that could affect git or system
  // This catches .git, .git-test, .gitconfig at any path depth
  const dangerousPrefixes = ['.git', '.svn', '.hg', '.env', '__pycache__'];
  const pathParts = normalized.split('/');
  for (const part of pathParts) {
    const lowerPart = part.toLowerCase();
    for (const prefix of dangerousPrefixes) {
      // Block exact matches and prefix matches (e.g., .git, .git-test, .gitconfig)
      if (lowerPart === prefix || lowerPart.startsWith(prefix + '-') || lowerPart.startsWith(prefix + '/')) {
        return false;
      }
    }
    // Also block node_modules to prevent dependency confusion attacks
    if (lowerPart === 'node_modules') {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes a file path by normalizing separators
 * Should only be used AFTER validation
 */
export function sanitizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Verifies that `child` resolves to a location inside `parent`.
 *
 * Why: `startsWith` on raw joined paths is bypassable on case-insensitive
 * filesystems and misses cases where `parent` is missing a trailing separator
 * (`/a/b` would match `/a/bc`). This resolver-based check normalizes both
 * sides and requires a clean separator boundary.
 */
export function isPathWithin(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  if (resolvedChild === resolvedParent) return true;
  return resolvedChild.startsWith(resolvedParent + path.sep);
}

/**
 * Validates that a value is a safe integer (for PIDs, ports, etc.)
 */
export function isValidInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= min && value <= max;
  }
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return !isNaN(num) && String(num) === value && num >= min && num <= max;
  }
  return false;
}
