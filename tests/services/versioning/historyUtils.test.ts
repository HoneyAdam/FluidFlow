/**
 * Tests for services/versioning/historyUtils
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_HISTORY_SIZE,
  calculateChangedFiles,
  buildAutoLabel,
  trimHistory,
} from '../../../services/versioning/historyUtils';

describe('services/versioning/historyUtils', () => {
  describe('MAX_HISTORY_SIZE', () => {
    it('should be 50', () => {
      expect(MAX_HISTORY_SIZE).toBe(50);
    });
  });

  describe('calculateChangedFiles', () => {
    it('should detect added files', () => {
      const old = { 'src/a.ts': 'a' };
      const now = { 'src/a.ts': 'a', 'src/b.ts': 'b' };
      expect(calculateChangedFiles(old, now)).toEqual(['src/b.ts']);
    });

    it('should detect deleted files', () => {
      const old = { 'src/a.ts': 'a', 'src/b.ts': 'b' };
      const now = { 'src/a.ts': 'a' };
      expect(calculateChangedFiles(old, now)).toEqual(['src/b.ts']);
    });

    it('should detect modified files', () => {
      const old = { 'src/a.ts': 'old' };
      const now = { 'src/a.ts': 'new' };
      expect(calculateChangedFiles(old, now)).toEqual(['src/a.ts']);
    });

    it('should return empty for identical file systems', () => {
      const files = { 'src/a.ts': 'same' };
      expect(calculateChangedFiles(files, files)).toEqual([]);
    });

    it('should handle empty file systems', () => {
      expect(calculateChangedFiles({}, {})).toEqual([]);
    });
  });

  describe('buildAutoLabel', () => {
    it('should handle 0 files', () => {
      expect(buildAutoLabel(0)).toBe('Changes');
    });

    it('should handle 1 file', () => {
      expect(buildAutoLabel(1)).toBe('Modified 1 file');
    });

    it('should pluralize for multiple files', () => {
      expect(buildAutoLabel(5)).toBe('Modified 5 files');
    });
  });

  describe('trimHistory', () => {
    it('should not trim when under max size', () => {
      const items = [1, 2, 3];
      expect(trimHistory(items)).toEqual([1, 2, 3]);
    });

    it('should trim to max size by removing oldest', () => {
      const items = Array.from({ length: 55 }, (_, i) => i);
      const result = trimHistory(items);
      expect(result).toHaveLength(50);
      expect(result[0]).toBe(5); // First 5 removed
    });

    it('should respect custom max size', () => {
      const items = [1, 2, 3, 4, 5];
      const result = trimHistory(items, 3);
      expect(result).toEqual([3, 4, 5]);
    });

    it('should not mutate original array', () => {
      const items = [1, 2, 3, 4, 5];
      trimHistory(items, 3);
      expect(items).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
