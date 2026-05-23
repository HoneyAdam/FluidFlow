/**
 * Git API Tests
 *
 * Comprehensive tests for Git API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiCall = vi.fn();
vi.mock('../../../services/api/client', () => ({
  apiCall: mockApiCall,
}));

describe('Git API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('gitApi.init', () => {
    it('should call apiCall with correct parameters for init', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ message: 'Initialized', initialized: true });

      const result = await gitApi.init('project-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/init',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ force: false }),
        })
      );
      expect(result).toEqual({ message: 'Initialized', initialized: true });
    });

    it('should pass force parameter when provided', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ message: 'Reinitialized', initialized: true });

      await gitApi.init('project-123', true);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/init',
        expect.objectContaining({
          body: JSON.stringify({ force: true }),
        })
      );
    });
  });

  describe('gitApi.status', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { gitApi } = await import('../../../services/api/git');

      const mockStatus = {
        initialized: true,
        branch: 'main',
        clean: true,
        staged: [],
        modified: [],
        not_added: [],
        deleted: [],
      };
      mockApiCall.mockResolvedValueOnce(mockStatus);

      const result = await gitApi.status('project-123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/status');
      expect(result).toEqual(mockStatus);
    });
  });

  describe('gitApi.log', () => {
    it('should call apiCall with default limit', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        initialized: true,
        commits: [],
      });

      await gitApi.log('project-123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/log?limit=20');
    });

    it('should call apiCall with custom limit', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        initialized: true,
        commits: [],
      });

      await gitApi.log('project-123', 50);

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/log?limit=50');
    });
  });

  describe('gitApi.commit', () => {
    it('should call apiCall with commit message', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        message: 'Committed',
        commit: { hash: 'abc123', summary: {} },
        clean: false,
      });

      const result = await gitApi.commit('project-123', 'Initial commit');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/commit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Initial commit', files: undefined }),
        })
      );
      expect(result.message).toBe('Committed');
    });

    it('should include files parameter when provided', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        message: 'Committed with files',
        clean: false,
      });

      const files = { 'src/index.ts': 'console.log("hello")' };
      await gitApi.commit('project-123', 'Add index', files);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/commit',
        expect.objectContaining({
          body: JSON.stringify({ message: 'Add index', files }),
        })
      );
    });
  });

  describe('gitApi.diff', () => {
    it('should call apiCall with cached false by default', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ diff: 'some diff' });

      await gitApi.diff('project-123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/diff?cached=false');
    });

    it('should call apiCall with cached true when specified', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ diff: 'staged diff' });

      await gitApi.diff('project-123', true);

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/diff?cached=true');
    });
  });

  describe('gitApi.checkout', () => {
    it('should call apiCall with commit hash', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ message: 'Checked out' });

      await gitApi.checkout('project-123', 'abc123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/checkout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ commit: 'abc123' }),
        })
      );
    });
  });

  describe('gitApi.createBranch', () => {
    it('should call apiCall with branch name and checkout true by default', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ message: 'Branch created', checkout: true });

      await gitApi.createBranch('project-123', 'feature-branch');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/branch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'feature-branch', checkout: true }),
        })
      );
    });

    it('should call apiCall with checkout false when specified', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({ message: 'Branch created', checkout: false });

      await gitApi.createBranch('project-123', 'feature-branch', false);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/branch',
        expect.objectContaining({
          body: JSON.stringify({ name: 'feature-branch', checkout: false }),
        })
      );
    });
  });

  describe('gitApi.branches', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        initialized: true,
        current: 'main',
        branches: ['main', 'develop'],
      });

      const result = await gitApi.branches('project-123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/branches');
      expect(result.branches).toEqual(['main', 'develop']);
    });
  });

  describe('gitApi.commitDetails', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { gitApi } = await import('../../../services/api/git');

      const mockDetails = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'Test commit',
        author: 'Test Author',
        email: 'test@example.com',
        date: '2024-01-01',
        body: 'Commit body',
        files: [],
        stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      };
      mockApiCall.mockResolvedValueOnce(mockDetails);

      const result = await gitApi.commitDetails('project-123', 'abc123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/commit/abc123');
      expect(result.hash).toBe('abc123');
    });
  });

  describe('gitApi.commitDiff', () => {
    it('should call apiCall without file parameter when not provided', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        diff: 'commit diff',
        hash: 'abc123',
        file: null,
      });

      await gitApi.commitDiff('project-123', 'abc123');

      expect(mockApiCall).toHaveBeenCalledWith('/git/project-123/commit/abc123/diff');
    });

    it('should call apiCall with file query parameter when provided', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        diff: 'file diff',
        hash: 'abc123',
        file: 'src/index.ts',
      });

      await gitApi.commitDiff('project-123', 'abc123', 'src/index.ts');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/commit/abc123/diff?file=src%2Findex.ts'
      );
    });
  });

  describe('gitApi.fileAtCommit', () => {
    it('should call apiCall with correct endpoint and path parameter', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        content: 'file content',
        path: 'src/index.ts',
        hash: 'abc123',
      });

      const result = await gitApi.fileAtCommit('project-123', 'abc123', 'src/index.ts');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/git/project-123/commit/abc123/file?path=src%2Findex.ts'
      );
      expect(result.content).toBe('file content');
    });

    it('should handle not found response', async () => {
      const { gitApi } = await import('../../../services/api/git');

      mockApiCall.mockResolvedValueOnce({
        content: null,
        path: 'deleted.txt',
        hash: 'abc123',
        notFound: true,
      });

      const result = await gitApi.fileAtCommit('project-123', 'abc123', 'deleted.txt');

      expect(result.notFound).toBe(true);
      expect(result.content).toBeNull();
    });
  });

  describe('gitApi module structure', () => {
    it('should export all required functions', async () => {
      const { gitApi } = await import('../../../services/api/git');

      expect(typeof gitApi.init).toBe('function');
      expect(typeof gitApi.status).toBe('function');
      expect(typeof gitApi.log).toBe('function');
      expect(typeof gitApi.commit).toBe('function');
      expect(typeof gitApi.diff).toBe('function');
      expect(typeof gitApi.checkout).toBe('function');
      expect(typeof gitApi.createBranch).toBe('function');
      expect(typeof gitApi.branches).toBe('function');
      expect(typeof gitApi.commitDetails).toBe('function');
      expect(typeof gitApi.commitDiff).toBe('function');
      expect(typeof gitApi.fileAtCommit).toBe('function');
    });
  });
});