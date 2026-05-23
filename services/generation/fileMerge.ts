/**
 * File Merge Service
 *
 * Pure functions for merging generated files into existing file systems.
 * Extracted from useResponseParser for testability.
 *
 * @module services/generation/fileMerge
 */

import type { FileSystem } from '../../types';

/**
 * Merge new files into existing file system.
 * - Preserves existing files not overwritten
 * - Applies new/modified files
 * - Removes explicitly deleted files
 */
export function mergeFiles(
  existingFiles: FileSystem,
  newFiles: FileSystem,
  deletedFiles: string[] = []
): FileSystem {
  const hasExistingFiles = Object.keys(existingFiles).length > 0;

  let mergedFiles: FileSystem;

  if (hasExistingFiles) {
    // Start with existing files and apply updates
    mergedFiles = { ...existingFiles };
    Object.assign(mergedFiles, newFiles);

    // Remove deleted files
    for (const deletedPath of deletedFiles) {
      delete mergedFiles[deletedPath];
    }
  } else {
    // Truly new project - use generated files
    mergedFiles = { ...newFiles };
  }

  return mergedFiles;
}

/**
 * Find which files actually changed between old and new file systems.
 * Returns paths of files that are new or have different content.
 */
export function findChangedFiles(
  oldFiles: FileSystem,
  newFiles: FileSystem
): string[] {
  const changed: string[] = [];

  for (const [path, content] of Object.entries(newFiles)) {
    if (oldFiles[path] !== content) {
      changed.push(path);
    }
  }

  return changed;
}

/**
 * Find files that exist in old but not in new (deleted).
 */
export function findDeletedFiles(
  oldFiles: FileSystem,
  newFiles: FileSystem
): string[] {
  const deleted: string[] = [];

  for (const path of Object.keys(oldFiles)) {
    if (!(path in newFiles)) {
      deleted.push(path);
    }
  }

  return deleted;
}

/**
 * Count total lines across all files.
 */
export function countTotalLines(files: FileSystem): number {
  return Object.values(files).reduce((sum, content) => {
    return sum + (content ? content.split('\n').length : 0);
  }, 0);
}
