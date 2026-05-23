/**
 * GitHub API Tests
 *
 * Comprehensive tests for GitHub API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiCall = vi.fn();
vi.mock('../../../services/api/client', () => ({
  apiCall: mockApiCall,
}));

describe('GitHub API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('githubApi.verifyToken', () => {
    it('should call apiCall with token in body', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        valid: true,
        user: { login: 'testuser', name: 'Test User', avatar: '', url: '' },
      });

      const result = await githubApi.verifyToken('ghp_testtoken123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/verify-token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'ghp_testtoken123' }),
        })
      );
      expect(result.valid).toBe(true);
    });

    it('should handle invalid token response', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ valid: false, error: 'Invalid token' });

      const result = await githubApi.verifyToken('bad_token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('githubApi.clone', () => {
    it('should call apiCall with url and name', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Cloned successfully',
        project: { id: 'proj-123', name: 'test-repo', createdAt: 0, updatedAt: 0 },
      });

      const result = await githubApi.clone('https://github.com/user/repo.git', 'my-project');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/clone',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://github.com/user/repo.git',
            name: 'my-project',
          }),
        })
      );
      expect(result.project.name).toBe('test-repo');
    });

    it('should handle clone without name', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Cloned successfully',
        project: { id: 'proj-123', name: 'repo', createdAt: 0, updatedAt: 0 },
      });

      await githubApi.clone('https://github.com/user/repo.git');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/clone',
        expect.objectContaining({
          body: JSON.stringify({
            url: 'https://github.com/user/repo.git',
            name: undefined,
          }),
        })
      );
    });
  });

  describe('githubApi.setRemote', () => {
    it('should call apiCall with remote URL and name', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Remote set' });

      await githubApi.setRemote('project-123', 'https://github.com/user/repo.git', 'origin');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/remote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://github.com/user/repo.git', name: 'origin' }),
        })
      );
    });
  });

  describe('githubApi.getRemotes', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        initialized: true,
        remotes: [
          { name: 'origin', fetch: 'https://github.com/user/repo.git', push: 'https://github.com/user/repo.git' },
        ],
      });

      const result = await githubApi.getRemotes('project-123');

      expect(mockApiCall).toHaveBeenCalledWith('/github/project-123/remote');
      expect(result.remotes).toHaveLength(1);
      expect(result.initialized).toBe(true);
    });
  });

  describe('githubApi.push', () => {
    it('should call apiCall with empty options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Pushed', remote: 'origin', branch: 'main' });

      const result = await githubApi.push('project-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/push',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      expect(result.branch).toBe('main');
    });

    it('should call apiCall with all options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Pushed', remote: 'custom', branch: 'develop' });

      await githubApi.push('project-123', {
        remote: 'custom',
        branch: 'develop',
        force: true,
        token: 'ghp_token',
        includeContext: true,
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/push',
        expect.objectContaining({
          body: JSON.stringify({
            remote: 'custom',
            branch: 'develop',
            force: true,
            token: 'ghp_token',
            includeContext: true,
          }),
        })
      );
    });
  });

  describe('githubApi.pull', () => {
    it('should call apiCall with empty options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Pulled', summary: {} });

      await githubApi.pull('project-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/pull',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
    });

    it('should call apiCall with remote and branch options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Pulled', summary: {} });

      await githubApi.pull('project-123', { remote: 'origin', branch: 'main' });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/pull',
        expect.objectContaining({
          body: JSON.stringify({ remote: 'origin', branch: 'main' }),
        })
      );
    });
  });

  describe('githubApi.fetch', () => {
    it('should call apiCall with empty options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Fetched' });

      await githubApi.fetch('project-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/fetch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
    });

    it('should call apiCall with remote and prune options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({ message: 'Fetched with pruning' });

      await githubApi.fetch('project-123', { remote: 'origin', prune: true });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/fetch',
        expect.objectContaining({
          body: JSON.stringify({ remote: 'origin', prune: true }),
        })
      );
    });
  });

  describe('githubApi.createRepo', () => {
    it('should call apiCall with token and options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Repository created',
        repository: {
          name: 'my-repo',
          url: 'https://github.com/user/my-repo',
          cloneUrl: 'https://github.com/user/my-repo.git',
          sshUrl: 'git@github.com:user/my-repo.git',
          private: false,
        },
      });

      const result = await githubApi.createRepo('project-123', 'ghp_token', {
        name: 'my-repo',
        description: 'My new repo',
        isPrivate: false,
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/create-repo',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'ghp_token',
            name: 'my-repo',
            description: 'My new repo',
            isPrivate: false,
          }),
        })
      );
      expect(result.repository.name).toBe('my-repo');
    });

    it('should call apiCall with minimal options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Repository created',
        repository: {
          name: 'project',
          url: '',
          cloneUrl: '',
          sshUrl: '',
          private: true,
        },
      });

      await githubApi.createRepo('project-123', 'ghp_token');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/create-repo',
        expect.objectContaining({
          body: JSON.stringify({ token: 'ghp_token' }),
        })
      );
    });
  });

  describe('githubApi.backupPush', () => {
    it('should call apiCall with empty options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        success: true,
        message: 'Backup pushed',
        branch: 'backup/auto',
        commit: 'abc123',
        timestamp: Date.now(),
      });

      const result = await githubApi.backupPush('project-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/backup-push',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      expect(result.success).toBe(true);
    });

    it('should call apiCall with custom branch and token', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        success: true,
        message: 'Backup pushed',
        branch: 'backup/custom',
        commit: 'def456',
        timestamp: Date.now(),
      });

      await githubApi.backupPush('project-123', {
        branch: 'backup/custom',
        token: 'ghp_token',
        includeContext: true,
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/project-123/backup-push',
        expect.objectContaining({
          body: JSON.stringify({
            branch: 'backup/custom',
            token: 'ghp_token',
            includeContext: true,
          }),
        })
      );
    });
  });

  describe('githubApi.importProject', () => {
    it('should call apiCall with import options', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Project imported',
        project: { id: 'proj-123', name: 'imported-repo', createdAt: 0, updatedAt: 0 },
        restored: { metadata: true, context: true },
      });

      const result = await githubApi.importProject({
        url: 'https://github.com/user/repo.git',
        token: 'ghp_token',
        branch: 'develop',
        name: 'my-import',
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/import',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://github.com/user/repo.git',
            token: 'ghp_token',
            branch: 'develop',
            name: 'my-import',
          }),
        })
      );
      expect(result.restored.metadata).toBe(true);
    });

    it('should handle import without optional params', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        message: 'Project imported',
        project: { id: 'proj-123', name: 'repo', createdAt: 0, updatedAt: 0 },
        restored: { metadata: false, context: false },
      });

      await githubApi.importProject({ url: 'https://github.com/user/repo.git' });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/import',
        expect.objectContaining({
          body: JSON.stringify({ url: 'https://github.com/user/repo.git' }),
        })
      );
    });
  });

  describe('githubApi.listRepos', () => {
    it('should call apiCall with Authorization header', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        repos: [
          {
            id: 1,
            name: 'repo1',
            fullName: 'user/repo1',
            description: null,
            url: 'https://github.com/user/repo1',
            cloneUrl: 'https://github.com/user/repo1.git',
            private: false,
            updatedAt: '2024-01-01',
            defaultBranch: 'main',
            hasFluidFlowBackup: false,
          },
        ],
      });

      const result = await githubApi.listRepos('ghp_token');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/github/repos',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer ghp_token',
          },
        })
      );
      expect(result.repos).toHaveLength(1);
    });

    it('should return repos list', async () => {
      const { githubApi } = await import('../../../services/api/github');

      mockApiCall.mockResolvedValueOnce({
        repos: [
          {
            id: 1,
            name: 'repo1',
            fullName: 'user/repo1',
            description: 'My first repo',
            url: 'https://github.com/user/repo1',
            cloneUrl: 'https://github.com/user/repo1.git',
            private: false,
            updatedAt: '2024-01-01',
            defaultBranch: 'main',
            hasFluidFlowBackup: true,
          },
          {
            id: 2,
            name: 'repo2',
            fullName: 'user/repo2',
            description: null,
            url: 'https://github.com/user/repo2',
            cloneUrl: 'https://github.com/user/repo2.git',
            private: true,
            updatedAt: '2024-01-02',
            defaultBranch: 'develop',
            hasFluidFlowBackup: false,
          },
        ],
      });

      const result = await githubApi.listRepos('ghp_token');

      expect(result.repos).toHaveLength(2);
      expect(result.repos[0].hasFluidFlowBackup).toBe(true);
      expect(result.repos[1].private).toBe(true);
    });
  });

  describe('githubApi module structure', () => {
    it('should export all required functions', async () => {
      const { githubApi } = await import('../../../services/api/github');

      expect(typeof githubApi.verifyToken).toBe('function');
      expect(typeof githubApi.clone).toBe('function');
      expect(typeof githubApi.setRemote).toBe('function');
      expect(typeof githubApi.getRemotes).toBe('function');
      expect(typeof githubApi.push).toBe('function');
      expect(typeof githubApi.pull).toBe('function');
      expect(typeof githubApi.fetch).toBe('function');
      expect(typeof githubApi.createRepo).toBe('function');
      expect(typeof githubApi.backupPush).toBe('function');
      expect(typeof githubApi.importProject).toBe('function');
      expect(typeof githubApi.listRepos).toBe('function');
    });
  });
});