/**
 * Tests for services/generation/validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateGeneratedFiles,
  isValidFilePath,
  isValidFileContent,
} from '../../../services/generation/validator';

describe('services/generation/validator', () => {
  describe('isValidFilePath', () => {
    it('should accept normal file paths', () => {
      expect(isValidFilePath('src/App.tsx')).toBe(true);
      expect(isValidFilePath('index.html')).toBe(true);
      expect(isValidFilePath('styles/main.css')).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isValidFilePath('')).toBe(false);
    });

    it('should reject hidden directories', () => {
      expect(isValidFilePath('src/.hidden/file.ts')).toBe(false);
    });

    it('should reject paths without extensions', () => {
      expect(isValidFilePath('src/components')).toBe(false);
    });
  });

  describe('isValidFileContent', () => {
    it('should accept valid content', () => {
      expect(isValidFileContent('export default function App() { return <div>Hello</div>; }')).toBe(true);
    });

    it('should reject content that is too short', () => {
      expect(isValidFileContent('short')).toBe(false);
    });

    it('should reject content that is just a language label', () => {
      expect(isValidFileContent('tsx')).toBe(false);
      expect(isValidFileContent('jsx;')).toBe(false);
    });

    it('should respect custom minLength', () => {
      expect(isValidFileContent('a'.repeat(15), 20)).toBe(false);
      expect(isValidFileContent('a'.repeat(25), 20)).toBe(true);
    });
  });

  describe('validateGeneratedFiles', () => {
    it('should separate valid and invalid files', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>Hello World</div>; }',
        'src/bad.ts': 'short',
      };
      const result = validateGeneratedFiles(files);
      expect(result.validFiles).toHaveProperty('src/App.tsx');
      expect(result.invalidFiles).toContain('src/bad.ts');
    });

    it('should return all valid for good input', () => {
      const files = {
        'src/a.tsx': 'export default function A() { return <div>Hello World</div>; }',
        'src/b.tsx': 'export default function B() { return <span>Test Content</span>; }',
      };
      const result = validateGeneratedFiles(files);
      expect(Object.keys(result.validFiles)).toHaveLength(2);
      expect(result.invalidFiles).toHaveLength(0);
    });

    it('should return all invalid for bad input', () => {
      const files = {
        'hidden': 'no extension content that is long enough',
        'src/.hidden/file.ts': 'export const x = 1; // long enough content here',
      };
      const result = validateGeneratedFiles(files);
      expect(Object.keys(result.validFiles)).toHaveLength(0);
      expect(result.invalidFiles.length).toBeGreaterThan(0);
    });
  });
});
