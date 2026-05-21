/**
 * Server validation utilities — security-critical path/ID/integer checks.
 */

import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  isValidProjectId,
  isValidFilePath,
  sanitizeFilePath,
  isPathWithin,
  isValidInteger,
} from '../../../server/utils/validation';

describe('isValidProjectId', () => {
  it('accepts a canonical UUID v4', () => {
    expect(isValidProjectId('11111111-2222-4333-8444-555555555555')).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(isValidProjectId('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('rejects non-v4 versions', () => {
    // version nibble is '5' instead of '4'
    expect(isValidProjectId('11111111-2222-5333-8444-555555555555')).toBe(false);
  });

  it('rejects wrong variant nibble', () => {
    // variant must be 8/9/a/b — using '7'
    expect(isValidProjectId('11111111-2222-4333-7444-555555555555')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidProjectId(undefined)).toBe(false);
    expect(isValidProjectId(null)).toBe(false);
    expect(isValidProjectId(123)).toBe(false);
    expect(isValidProjectId({})).toBe(false);
    expect(isValidProjectId([])).toBe(false);
  });

  it('rejects path-traversal payloads disguised as IDs', () => {
    expect(isValidProjectId('../etc/passwd')).toBe(false);
    expect(isValidProjectId('..')).toBe(false);
  });
});

describe('isValidFilePath', () => {
  it('accepts simple relative paths', () => {
    expect(isValidFilePath('src/App.tsx')).toBe(true);
    expect(isValidFilePath('package.json')).toBe(true);
    expect(isValidFilePath('a/b/c/d.ts')).toBe(true);
  });

  it('accepts backslash-separated paths (normalized internally)', () => {
    expect(isValidFilePath('src\\components\\Foo.tsx')).toBe(true);
  });

  it('rejects parent-directory traversal', () => {
    expect(isValidFilePath('../secret')).toBe(false);
    expect(isValidFilePath('src/../../etc/passwd')).toBe(false);
    expect(isValidFilePath('..\\windows\\system32')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isValidFilePath('/etc/passwd')).toBe(false);
    expect(isValidFilePath('/usr/local/bin/node')).toBe(false);
  });

  it('rejects Windows drive letters', () => {
    expect(isValidFilePath('C:/Windows/System32')).toBe(false);
    expect(isValidFilePath('d:\\secrets')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValidFilePath('file.txt\0.png')).toBe(false);
  });

  it('rejects URL-encoded traversal attempts', () => {
    expect(isValidFilePath('%2e%2e/etc')).toBe(false);
    expect(isValidFilePath('src/%2E%2E/secret')).toBe(false);
    expect(isValidFilePath('file%00.png')).toBe(false);
  });

  it('rejects control characters', () => {
    expect(isValidFilePath('file\nname.txt')).toBe(false);
    expect(isValidFilePath('file\tname.txt')).toBe(false);
    expect(isValidFilePath('file\x7f.txt')).toBe(false);
  });

  it('rejects dangerous folder names anywhere in path', () => {
    expect(isValidFilePath('.git/config')).toBe(false);
    expect(isValidFilePath('src/.git/HEAD')).toBe(false);
    expect(isValidFilePath('.git-test/foo')).toBe(false);
    expect(isValidFilePath('.svn/entries')).toBe(false);
    expect(isValidFilePath('.hg/store')).toBe(false);
    expect(isValidFilePath('.env')).toBe(false);
    expect(isValidFilePath('config/.env')).toBe(false);
    expect(isValidFilePath('__pycache__/x.pyc')).toBe(false);
    expect(isValidFilePath('node_modules/react')).toBe(false);
  });

  it('matches dangerous prefixes case-insensitively', () => {
    expect(isValidFilePath('.GIT/HEAD')).toBe(false);
    expect(isValidFilePath('Node_Modules/x')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidFilePath(undefined)).toBe(false);
    expect(isValidFilePath(null)).toBe(false);
    expect(isValidFilePath(123)).toBe(false);
    expect(isValidFilePath({})).toBe(false);
  });
});

describe('sanitizeFilePath', () => {
  it('normalizes backslashes to forward slashes', () => {
    expect(sanitizeFilePath('a\\b\\c')).toBe('a/b/c');
  });

  it('leaves forward-slash paths unchanged', () => {
    expect(sanitizeFilePath('a/b/c')).toBe('a/b/c');
  });

  it('handles mixed separators', () => {
    expect(sanitizeFilePath('a/b\\c/d')).toBe('a/b/c/d');
  });
});

describe('isPathWithin', () => {
  const base = path.resolve('/tmp/projects/abc');

  it('accepts the exact same path', () => {
    expect(isPathWithin(base, base)).toBe(true);
  });

  it('accepts direct child paths', () => {
    expect(isPathWithin(path.join(base, 'src/App.tsx'), base)).toBe(true);
  });

  it('accepts deep descendant paths', () => {
    expect(isPathWithin(path.join(base, 'a/b/c/d/e.ts'), base)).toBe(true);
  });

  it('rejects paths that share a prefix but escape the boundary', () => {
    // Critical: /tmp/projects/abc-other must NOT be considered inside /tmp/projects/abc
    const sibling = path.resolve('/tmp/projects/abc-other/file.txt');
    expect(isPathWithin(sibling, base)).toBe(false);
  });

  it('rejects parent directories', () => {
    expect(isPathWithin(path.resolve('/tmp/projects'), base)).toBe(false);
    expect(isPathWithin(path.resolve('/tmp'), base)).toBe(false);
  });

  it('rejects unrelated absolute paths', () => {
    expect(isPathWithin('/etc/passwd', base)).toBe(false);
  });

  it('resolves traversal segments before checking', () => {
    // path.join leaves '..' in the string; only resolve normalizes it
    const escaped = path.join(base, '..', '..', 'etc');
    expect(isPathWithin(escaped, base)).toBe(false);
  });

  it('handles trailing separators in parent argument', () => {
    expect(isPathWithin(path.join(base, 'src'), base + path.sep)).toBe(true);
  });
});

describe('isValidInteger', () => {
  it('accepts safe number integers', () => {
    expect(isValidInteger(0)).toBe(true);
    expect(isValidInteger(42)).toBe(true);
    expect(isValidInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('accepts numeric strings that round-trip cleanly', () => {
    expect(isValidInteger('42')).toBe(true);
    expect(isValidInteger('0')).toBe(true);
  });

  it('rejects floats', () => {
    expect(isValidInteger(1.5)).toBe(false);
    expect(isValidInteger('1.5')).toBe(false);
  });

  it('rejects strings with leading/trailing junk', () => {
    expect(isValidInteger('42abc')).toBe(false);
    expect(isValidInteger('abc')).toBe(false);
    expect(isValidInteger(' 42')).toBe(false);
    expect(isValidInteger('042')).toBe(false); // round-trip would be '42'
  });

  it('respects min/max bounds', () => {
    expect(isValidInteger(5, 10, 20)).toBe(false);
    expect(isValidInteger(15, 10, 20)).toBe(true);
    expect(isValidInteger(25, 10, 20)).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    expect(isValidInteger(undefined)).toBe(false);
    expect(isValidInteger(null)).toBe(false);
    expect(isValidInteger({})).toBe(false);
    expect(isValidInteger(NaN)).toBe(false);
  });
});
