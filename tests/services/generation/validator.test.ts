/**
 * Tests for services/generation/validator
 */

import { describe, it, expect } from 'vitest';
import { validateGeneratedFiles, isValidFilePath, isValidFileContent } from '../../../services/generation/validator';

describe('services/generation/validator', () => {
  describe('validateGeneratedFiles', () => {
    it('should return valid files and empty invalid list for good input', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>Hello World</div>; }',
        'src/index.ts': "import React from 'react';\nimport ReactDOM from 'react-dom';\nReactDOM.render(<App />, document.getElementById('root'));",
      };

      const result = validateGeneratedFiles(files);
      expect(Object.keys(result.validFiles)).toHaveLength(2);
      expect(result.invalidFiles).toHaveLength(0);
    });

    it('should reject files with empty paths', () => {
      const files = {
        '': 'some content that is long enough to pass',
      };

      const result = validateGeneratedFiles(files);
      expect(result.invalidFiles).toContain('');
      expect(Object.keys(result.validFiles)).toHaveLength(0);
    });

    it('should reject files with hidden directory segments', () => {
      const files = {
        'src/.hidden/file.ts': 'export const x = 1; // this is long enough content',
      };

      const result = validateGeneratedFiles(files);
      expect(result.invalidFiles).toContain('src/.hidden/file.ts');
    });

    it('should reject files without extensions', () => {
      const files = {
        'src/Dockerfile': 'FROM node:18\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000',
      };

      const result = validateGeneratedFiles(files);
      expect(result.invalidFiles).toContain('src/Dockerfile');
    });

    it('should reject files with content shorter than 20 characters', () => {
      const files = {
        'src/short.ts': 'short',
      };

      const result = validateGeneratedFiles(files);
      expect(result.invalidFiles).toContain('src/short.ts');
    });

    it('should reject files with only a file type label', () => {
      const files = {
        'src/label.tsx': 'tsx;',
        'src/label2.js': 'js',
      };

      const result = validateGeneratedFiles(files);
      expect(result.invalidFiles).toContain('src/label.tsx');
      expect(result.invalidFiles).toContain('src/label2.js');
    });

    it('should handle mix of valid and invalid files', () => {
      const files = {
        'src/App.tsx': 'export default function App() { return <div>Hello World</div>; }',
        'src/bad.ts': 'short',
        'src/.env': 'DATABASE_URL=postgres://localhost:5432/mydb',
        'src/utils.ts': 'export function add(a: number, b: number) { return a + b; }',
      };

      const result = validateGeneratedFiles(files);
      expect(Object.keys(result.validFiles)).toHaveLength(2);
      expect(result.validFiles['src/App.tsx']).toBeDefined();
      expect(result.validFiles['src/utils.ts']).toBeDefined();
      expect(result.invalidFiles).toHaveLength(2);
    });

    it('should handle empty FileSystem', () => {
      const result = validateGeneratedFiles({});
      expect(Object.keys(result.validFiles)).toHaveLength(0);
      expect(result.invalidFiles).toHaveLength(0);
    });
  });

  describe('isValidFilePath', () => {
    it('should accept normal file paths', () => {
      expect(isValidFilePath('src/App.tsx')).toBe(true);
      expect(isValidFilePath('components/Button.ts')).toBe(true);
      expect(isValidFilePath('styles.css')).toBe(true);
    });

    it('should reject empty paths', () => {
      expect(isValidFilePath('')).toBe(false);
    });

    it('should reject paths with hidden directories', () => {
      expect(isValidFilePath('src/.gitignore')).toBe(false);
      // Note: '.env' starts with '.' but doesn't contain '/.', so it passes the hidden dir check
      // It would fail on the extension check though
    });

    it('should reject paths without extensions', () => {
      expect(isValidFilePath('README')).toBe(false);
    });
  });

  describe('isValidFileContent', () => {
    it('should accept normal code content', () => {
      expect(isValidFileContent('export default function App() { return <div>Hello</div>; }')).toBe(true);
    });

    it('should reject empty content', () => {
      expect(isValidFileContent('')).toBe(false);
    });

    it('should reject content shorter than minimum length', () => {
      expect(isValidFileContent('short')).toBe(false);
      expect(isValidFileContent('a'.repeat(19))).toBe(false);
      expect(isValidFileContent('a'.repeat(20))).toBe(true);
    });

    it('should reject file type labels', () => {
      expect(isValidFileContent('tsx;')).toBe(false);
      expect(isValidFileContent('jsx')).toBe(false);
      expect(isValidFileContent('json;')).toBe(false);
    });

    it('should respect custom minimum length', () => {
      expect(isValidFileContent('abc', 5)).toBe(false);
      expect(isValidFileContent('abcdef', 5)).toBe(true);
    });
  });
});
