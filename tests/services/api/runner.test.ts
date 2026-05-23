/**
 * Runner API Tests
 *
 * Comprehensive tests for Runner API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiCall = vi.fn();
vi.mock('../../../services/api/client', () => ({
  apiCall: mockApiCall,
}));

describe('Runner API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runnerApi.list', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce([
        { projectId: 'proj-1', port: 3000, status: 'running', url: 'http://localhost:3000', startedAt: 0, running: true },
      ]);

      const result = await runnerApi.list();

      expect(mockApiCall).toHaveBeenCalledWith('/runner');
      expect(result).toHaveLength(1);
    });
  });

  describe('runnerApi.status', () => {
    it('should call apiCall with project ID in path', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        projectId: 'proj-123',
        port: 3000,
        status: 'running',
        url: 'http://localhost:3000',
        startedAt: Date.now(),
        running: true,
      });

      const result = await runnerApi.status('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith('/runner/proj-123');
      expect(result.projectId).toBe('proj-123');
    });
  });

  describe('runnerApi.start', () => {
    it('should call apiCall with POST and no files', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        message: 'Project started',
        port: 3000,
        url: 'http://localhost:3000',
        status: 'running',
      });

      const result = await runnerApi.start('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/proj-123/start',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.port).toBe(3000);
    });

    it('should call apiCall with files when provided', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        message: 'Project started with files',
        port: 3000,
        url: 'http://localhost:3000',
        status: 'running',
      });

      const files = { 'src/index.ts': 'console.log("hello")' };
      await runnerApi.start('proj-123', files);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/proj-123/start',
        expect.objectContaining({
          body: JSON.stringify({ files }),
        })
      );
    });

    it('should handle temp project id', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        message: 'Temp project started',
        port: 3001,
        url: 'http://localhost:3001',
        status: 'running',
      });

      const result = await runnerApi.start('_temp');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/_temp/start',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.port).toBe(3001);
    });
  });

  describe('runnerApi.stop', () => {
    it('should call apiCall with POST method', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({ message: 'Project stopped', status: 'stopped' });

      const result = await runnerApi.stop('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/proj-123/stop',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.status).toBe('stopped');
    });
  });

  describe('runnerApi.logs', () => {
    it('should call apiCall without since parameter', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        logs: ['log line 1', 'log line 2'],
        errorLogs: [],
        status: 'running',
        totalLogs: 2,
      });

      const result = await runnerApi.logs('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith('/runner/proj-123/logs');
      expect(result.logs).toHaveLength(2);
    });

    it('should call apiCall with since timestamp', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({
        logs: ['new log'],
        errorLogs: ['error log'],
        status: 'running',
        totalLogs: 1,
      });

      const since = Date.now() - 60000;
      await runnerApi.logs('proj-123', since);

      expect(mockApiCall).toHaveBeenCalledWith(`/runner/proj-123/logs?since=${since}`);
    });
  });

  describe('runnerApi.stopAll', () => {
    it('should call apiCall with POST method', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({ message: 'All projects stopped', stopped: ['proj-1', 'proj-2'] });

      const result = await runnerApi.stopAll();

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/stop-all',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.stopped).toHaveLength(2);
    });
  });

  describe('runnerApi.cleanup', () => {
    it('should call apiCall with POST method', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      mockApiCall.mockResolvedValueOnce({ message: 'Cleanup complete' });

      const result = await runnerApi.cleanup();

      expect(mockApiCall).toHaveBeenCalledWith(
        '/runner/cleanup',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.message).toBe('Cleanup complete');
    });
  });

  describe('runnerApi module structure', () => {
    it('should export all required functions', async () => {
      const { runnerApi } = await import('../../../services/api/runner');

      expect(typeof runnerApi.list).toBe('function');
      expect(typeof runnerApi.status).toBe('function');
      expect(typeof runnerApi.start).toBe('function');
      expect(typeof runnerApi.stop).toBe('function');
      expect(typeof runnerApi.logs).toBe('function');
      expect(typeof runnerApi.stopAll).toBe('function');
      expect(typeof runnerApi.cleanup).toBe('function');
    });
  });
});