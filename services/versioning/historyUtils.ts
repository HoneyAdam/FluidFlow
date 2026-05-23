/**
 * Version History Utilities Service
 *
 * Pure functions for version history file diffing.
 * Extracted from useVersionHistory for testability.
 *
 * @module services/versioning/historyUtils
 */

import type { FileSystem } from '../../types';

/**
 * Maximum number of history entries to retain.
 */
export const MAX_HISTORY_SIZE = 50;

/**
 * Calculate changed files between two file systems.
 * Uses key-based diff for O(n) comparison.
 */
export function calculateChangedFiles(oldFiles: FileSystem, newFiles: FileSystem): string[] {
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  allKeys.forEach(key => {
    if (oldFiles[key] !== newFiles[key]) {
      changed.push(key);
    }
  });

  return changed;
}

/**
 * Generate an auto-label from the number of changed files.
 */
export function buildAutoLabel(changedFileCount: number): string {
  return changedFileCount > 0
    ? `Modified ${changedFileCount} file${changedFileCount > 1 ? 's' : ''}`
    : 'Changes';
}

/**
 * Trim history to MAX_HISTORY_SIZE by removing oldest entries.
 */
export function trimHistory<T>(past: T[], maxSize: number = MAX_HISTORY_SIZE): T[] {
  const trimmed = [...past];
  while (trimmed.length > maxSize) {
    trimmed.shift();
  }
  return trimmed;
}
