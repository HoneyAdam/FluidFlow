import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../../services/api/projects', () => ({
  projectApi: {
    readFile: vi.fn(),
    saveFile: vi.fn(),
    deleteFile: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('../../../../hooks/useDebugStore', () => ({
  debugLog: {
    toolCall: vi.fn(),
  },
}));

import { executeProjectTool, createProjectToolExecutor } from '../../../../services/ai/utils/projectToolHandler';
import { projectApi } from '../../../../services/api/projects';

const mockProjectApi = projectApi as unknown as {
  readFile: ReturnType<typeof vi.fn>;
  saveFile: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const VALID_UUID = '12345678-1234-4000-8000-123456789abc';

describe('executeProjectTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when no projectId', async () => {
    const result = await executeProjectTool('read_file', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('No project ID provided');
  });

  it('returns error for invalid projectId format', async () => {
    const result = await executeProjectTool('read_file', {}, { projectId: 'invalid' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid project ID');
  });

  describe('read_file', () => {
    it('reads a file successfully', async () => {
      mockProjectApi.readFile.mockResolvedValue('file contents');
      const result = await executeProjectTool('read_file', { path: 'src/App.tsx' }, { projectId: VALID_UUID });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ path: 'src/App.tsx', content: 'file contents' });
    });

    it('returns error when path missing', async () => {
      const result = await executeProjectTool('read_file', {}, { projectId: VALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter: path');
    });
  });

  describe('write_file', () => {
    it('writes a file successfully', async () => {
      mockProjectApi.saveFile.mockResolvedValue(undefined);
      const result = await executeProjectTool('write_file', { path: 'src/new.ts', content: 'hello' }, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(true);
      expect(result.filesWritten).toEqual(['src/new.ts']);
    });

    it('rejects when writes not allowed', async () => {
      const result = await executeProjectTool('write_file', { path: 'x', content: 'y' }, { projectId: VALID_UUID, allowWrites: false });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool writes are not allowed');
    });

    it('returns error when path missing', async () => {
      const result = await executeProjectTool('write_file', { content: 'y' }, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });

  describe('delete_file', () => {
    it('deletes a file successfully', async () => {
      mockProjectApi.deleteFile.mockResolvedValue(undefined);
      const result = await executeProjectTool('delete_file', { path: 'old.ts' }, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(true);
      expect(result.filesWritten).toEqual(['old.ts']);
    });

    it('rejects when writes not allowed', async () => {
      const result = await executeProjectTool('delete_file', { path: 'x' }, { projectId: VALID_UUID, allowWrites: false });
      expect(result.success).toBe(false);
    });

    it('returns error when path missing', async () => {
      const result = await executeProjectTool('delete_file', {}, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });
  });

  describe('list_files', () => {
    it('lists files successfully', async () => {
      mockProjectApi.get.mockResolvedValue({ files: { 'a.ts': 'content', 'b.ts': 'content' } });
      const result = await executeProjectTool('list_files', {}, { projectId: VALID_UUID });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ files: ['a.ts', 'b.ts'] });
    });
  });

  describe('search_files', () => {
    it('searches files by pattern', async () => {
      mockProjectApi.get.mockResolvedValue({
        files: { 'src/App.tsx': 'import React', 'src/util.ts': 'export function' },
      });
      const result = await executeProjectTool('search_files', { pattern: 'import' }, { projectId: VALID_UUID });
      expect(result.success).toBe(true);
    });

    it('returns error when pattern missing', async () => {
      const result = await executeProjectTool('search_files', {}, { projectId: VALID_UUID });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });
  });

  describe('create_directory', () => {
    it('creates directory (implicit)', async () => {
      const result = await executeProjectTool('create_directory', { path: 'src/new' }, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(true);
    });

    it('rejects when writes not allowed', async () => {
      const result = await executeProjectTool('create_directory', { path: 'x' }, { projectId: VALID_UUID, allowWrites: false });
      expect(result.success).toBe(false);
    });

    it('returns error when path missing', async () => {
      const result = await executeProjectTool('create_directory', {}, { projectId: VALID_UUID, allowWrites: true });
      expect(result.success).toBe(false);
    });
  });

  it('returns error for unknown tool', async () => {
    const result = await executeProjectTool('unknown_tool', {}, { projectId: VALID_UUID });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('handles exceptions gracefully', async () => {
    mockProjectApi.readFile.mockRejectedValue(new Error('disk error'));
    const result = await executeProjectTool('read_file', { path: 'x' }, { projectId: VALID_UUID });
    expect(result.success).toBe(false);
    expect(result.error).toBe('disk error');
  });
});

describe('createProjectToolExecutor', () => {
  it('returns executor for valid project ID', () => {
    const executor = createProjectToolExecutor(VALID_UUID);
    expect(typeof executor).toBe('function');
  });

  it('returns dummy executor for invalid project ID', async () => {
    const executor = createProjectToolExecutor('invalid');
    const result = await executor('test', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid project ID');
  });
});
