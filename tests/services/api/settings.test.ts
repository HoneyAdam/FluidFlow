/**
 * Settings API Tests
 *
 * Comprehensive tests for Settings API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiCall = vi.fn();
vi.mock('../../../services/api/client', () => ({
  apiCall: mockApiCall,
}));

describe('Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('settingsApi.get', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({
        aiProviders: [],
        activeProviderId: 'default',
        customSnippets: [],
        updatedAt: Date.now(),
      });

      const result = await settingsApi.get();

      expect(mockApiCall).toHaveBeenCalledWith('/settings');
      expect(result.activeProviderId).toBe('default');
    });
  });

  describe('settingsApi.update', () => {
    it('should call apiCall with PUT and settings data', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Settings updated', updatedAt: Date.now() });

      const result = await settingsApi.update({ activeProviderId: 'new-provider' });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ activeProviderId: 'new-provider' }),
        })
      );
      expect(result.message).toBe('Settings updated');
    });
  });

  describe('settingsApi.getAIProviders', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({
        providers: [
          { id: 'prov-1', name: 'Provider 1', type: 'openai' },
        ],
        activeId: 'prov-1',
      });

      const result = await settingsApi.getAIProviders();

      expect(mockApiCall).toHaveBeenCalledWith('/settings/ai-providers');
      expect(result.providers).toHaveLength(1);
    });
  });

  describe('settingsApi.saveAIProviders', () => {
    it('should call apiCall with PUT and provider data', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Providers saved', updatedAt: Date.now() });

      const providers = [
        { id: 'prov-1', name: 'Provider 1', type: 'openai', apiKey: 'sk-test' },
      ];
      const result = await settingsApi.saveAIProviders(providers, 'prov-1');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/ai-providers',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ providers, activeId: 'prov-1' }),
        })
      );
      expect(result.message).toBe('Providers saved');
    });
  });

  describe('settingsApi.getSnippets', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce([
        { id: 'snip-1', name: 'Snippet 1', code: 'console.log', category: 'utils', createdAt: 0 },
      ]);

      const result = await settingsApi.getSnippets();

      expect(mockApiCall).toHaveBeenCalledWith('/settings/snippets');
      expect(result).toHaveLength(1);
    });
  });

  describe('settingsApi.saveSnippets', () => {
    it('should call apiCall with PUT and snippets data', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Snippets saved', updatedAt: Date.now() });

      const snippets = [
        { id: 'snip-1', name: 'Snippet 1', code: 'console.log', category: 'utils', createdAt: 0 },
        { id: 'snip-2', name: 'Snippet 2', code: 'process.exit', category: 'utils', createdAt: 0 },
      ];
      const result = await settingsApi.saveSnippets(snippets);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/snippets',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ snippets }),
        })
      );
      expect(result.message).toBe('Snippets saved');
    });
  });

  describe('settingsApi.addSnippet', () => {
    it('should call apiCall with POST and snippet data', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({
        id: 'snip-new',
        name: 'New Snippet',
        code: 'console.log("new")',
        category: 'utils',
        createdAt: Date.now(),
      });

      const result = await settingsApi.addSnippet({
        name: 'New Snippet',
        code: 'console.log("new")',
        category: 'utils',
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/snippets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'New Snippet',
            code: 'console.log("new")',
            category: 'utils',
          }),
        })
      );
      expect(result.id).toBe('snip-new');
    });
  });

  describe('settingsApi.deleteSnippet', () => {
    it('should call apiCall with DELETE method', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Snippet deleted' });

      const result = await settingsApi.deleteSnippet('snip-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/snippets/snip-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.message).toBe('Snippet deleted');
    });
  });

  describe('settingsApi.getGitHubBackup', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({
        enabled: true,
        branchName: 'backup/auto',
        lastBackupAt: Date.now(),
      });

      const result = await settingsApi.getGitHubBackup();

      expect(mockApiCall).toHaveBeenCalledWith('/settings/github-backup');
      expect(result.enabled).toBe(true);
    });
  });

  describe('settingsApi.saveGitHubBackup', () => {
    it('should call apiCall with PUT and backup settings', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Backup settings saved', updatedAt: Date.now() });

      const result = await settingsApi.saveGitHubBackup({
        enabled: true,
        branchName: 'backup/auto',
        token: 'ghp_token',
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/github-backup',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            enabled: true,
            branchName: 'backup/auto',
            token: 'ghp_token',
          }),
        })
      );
      expect(result.message).toBe('Backup settings saved');
    });
  });

  describe('settingsApi.updateBackupStatus', () => {
    it('should call apiCall with POST and backup status', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ message: 'Backup status updated', updatedAt: Date.now() });

      const lastBackupAt = Date.now();
      const lastBackupCommit = 'abc123def';
      const result = await settingsApi.updateBackupStatus(lastBackupAt, lastBackupCommit);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/settings/github-backup/update-status',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ lastBackupAt, lastBackupCommit }),
        })
      );
      expect(result.message).toBe('Backup status updated');
    });
  });

  describe('settingsApi.getBackupToken', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      mockApiCall.mockResolvedValueOnce({ token: 'decrypted_token' });

      const result = await settingsApi.getBackupToken();

      expect(mockApiCall).toHaveBeenCalledWith('/settings/github-backup/token');
      expect(result.token).toBe('decrypted_token');
    });
  });

  describe('settingsApi module structure', () => {
    it('should export all required functions', async () => {
      const { settingsApi } = await import('../../../services/api/settings');

      expect(typeof settingsApi.get).toBe('function');
      expect(typeof settingsApi.update).toBe('function');
      expect(typeof settingsApi.getAIProviders).toBe('function');
      expect(typeof settingsApi.saveAIProviders).toBe('function');
      expect(typeof settingsApi.getSnippets).toBe('function');
      expect(typeof settingsApi.saveSnippets).toBe('function');
      expect(typeof settingsApi.addSnippet).toBe('function');
      expect(typeof settingsApi.deleteSnippet).toBe('function');
      expect(typeof settingsApi.getGitHubBackup).toBe('function');
      expect(typeof settingsApi.saveGitHubBackup).toBe('function');
      expect(typeof settingsApi.updateBackupStatus).toBe('function');
      expect(typeof settingsApi.getBackupToken).toBe('function');
    });
  });
});