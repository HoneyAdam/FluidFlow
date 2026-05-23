/**
 * Tests for services/generation/fileMerge
 */

import { describe, it, expect } from 'vitest';
import { mergeFiles, findChangedFiles, findDeletedFiles, countTotalLines } from '../../../services/generation/fileMerge';

describe('services/generation/fileMerge', () => {
  describe('mergeFiles', () => {
    it('should merge new files into existing', () => {
      const existing = { 'src/App.tsx': 'old content' };
      const newFiles = { 'src/utils.ts': 'new content' };

      const result = mergeFiles(existing, newFiles);
      expect(result).toEqual({
        'src/App.tsx': 'old content',
        'src/utils.ts': 'new content',
      });
    });

    it('should overwrite existing files with new content', () => {
      const existing = { 'src/App.tsx': 'old content' };
      const newFiles = { 'src/App.tsx': 'updated content' };

      const result = mergeFiles(existing, newFiles);
      expect(result['src/App.tsx']).toBe('updated content');
    });

    it('should delete specified files', () => {
      const existing = { 'src/App.tsx': 'content', 'src/old.ts': 'remove me' };
      const newFiles = {};

      const result = mergeFiles(existing, newFiles, ['src/old.ts']);
      expect(result).toEqual({ 'src/App.tsx': 'content' });
    });

    it('should use new files directly when no existing files', () => {
      const newFiles = { 'src/App.tsx': 'content' };
      const result = mergeFiles({}, newFiles);
      expect(result).toEqual({ 'src/App.tsx': 'content' });
    });

    it('should handle empty inputs', () => {
      expect(mergeFiles({}, {})).toEqual({});
    });
  });

  describe('findChangedFiles', () => {
    it('should find new files', () => {
      const result = findChangedFiles({}, { 'src/App.tsx': 'content' });
      expect(result).toEqual(['src/App.tsx']);
    });

    it('should find modified files', () => {
      const old = { 'src/App.tsx': 'old' };
      const newFiles = { 'src/App.tsx': 'new' };
      const result = findChangedFiles(old, newFiles);
      expect(result).toEqual(['src/App.tsx']);
    });

    it('should not list unchanged files', () => {
      const old = { 'src/App.tsx': 'same' };
      const result = findChangedFiles(old, { 'src/App.tsx': 'same' });
      expect(result).toEqual([]);
    });
  });

  describe('findDeletedFiles', () => {
    it('should find files in old but not in new', () => {
      const result = findDeletedFiles({ 'src/a.ts': 'a', 'src/b.ts': 'b' }, { 'src/a.ts': 'a' });
      expect(result).toEqual(['src/b.ts']);
    });

    it('should return empty when nothing deleted', () => {
      const result = findDeletedFiles({ 'src/a.ts': 'a' }, { 'src/a.ts': 'updated' });
      expect(result).toEqual([]);
    });
  });

  describe('countTotalLines', () => {
    it('should count lines across all files', () => {
      const files = {
        'a.ts': 'line1\nline2\nline3',
        'b.ts': 'line1\nline2',
      };
      expect(countTotalLines(files)).toBe(5);
    });

    it('should handle empty files', () => {
      expect(countTotalLines({})).toBe(0);
    });
  });
});
