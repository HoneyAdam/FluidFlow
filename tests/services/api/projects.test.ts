/**
 * Projects API Tests
 *
 * Comprehensive tests for Projects API functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiCall = vi.fn();
vi.mock('../../../services/api/client', () => ({
  apiCall: mockApiCall,
}));

describe('Projects API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('projectApi.list', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      const mockProjects = [
        { id: 'proj-1', name: 'Project 1', createdAt: 0, updatedAt: 0 },
        { id: 'proj-2', name: 'Project 2', createdAt: 0, updatedAt: 0 },
      ];
      mockApiCall.mockResolvedValueOnce(mockProjects);

      const result = await projectApi.list();

      expect(mockApiCall).toHaveBeenCalledWith('/projects');
      expect(result).toHaveLength(2);
    });
  });

  describe('projectApi.get', () => {
    it('should call apiCall with project ID in path', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'My Project',
        createdAt: 0,
        updatedAt: 0,
        files: { 'src/index.ts': 'console.log("hello")' },
      });

      const result = await projectApi.get('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith('/projects/proj-123');
      expect(result.files).toBeDefined();
    });
  });

  describe('projectApi.create', () => {
    it('should call apiCall with POST method and data', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-new',
        name: 'New Project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: {},
      });

      const result = await projectApi.create({
        name: 'New Project',
        description: 'A new project',
        files: { 'README.md': '# New Project' },
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'New Project',
            description: 'A new project',
            files: { 'README.md': '# New Project' },
          }),
        })
      );
      expect(result.id).toBe('proj-new');
    });

    it('should handle create with minimal data', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-minimal',
        name: 'Minimal Project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: {},
      });

      await projectApi.create({ name: 'Minimal Project' });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects',
        expect.objectContaining({
          body: JSON.stringify({ name: 'Minimal Project' }),
        })
      );
    });
  });

  describe('projectApi.update', () => {
    it('should call apiCall with PUT method and update data', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Updated Project',
        createdAt: 0,
        updatedAt: Date.now(),
        message: 'Project updated',
      });

      const result = await projectApi.update('proj-123', {
        name: 'Updated Project',
        files: { 'src/app.ts': 'export const app = true' },
      });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Project',
            files: { 'src/app.ts': 'export const app = true' },
            force: undefined,
          }),
        })
      );
      expect(result.message).toBe('Project updated');
    });

    it('should pass force parameter when provided', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-123',
        name: 'Forced Update',
        createdAt: 0,
        updatedAt: Date.now(),
      });

      await projectApi.update('proj-123', { force: true });

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123',
        expect.objectContaining({
          body: JSON.stringify({ force: true }),
        })
      );
    });
  });

  describe('projectApi.delete', () => {
    it('should call apiCall with DELETE method', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({ message: 'Project deleted', id: 'proj-123' });

      const result = await projectApi.delete('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.message).toBe('Project deleted');
    });
  });

  describe('projectApi.duplicate', () => {
    it('should call apiCall with POST and name parameter', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-copy',
        name: 'Copy of Original',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await projectApi.duplicate('proj-123', 'Copy of Original');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/duplicate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Copy of Original' }),
        })
      );
      expect(result.name).toBe('Copy of Original');
    });

    it('should call apiCall without name parameter when not provided', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        id: 'proj-copy-2',
        name: 'Original (1)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await projectApi.duplicate('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/duplicate',
        expect.objectContaining({
          body: JSON.stringify({ name: undefined }),
        })
      );
    });
  });

  describe('projectApi.getContext', () => {
    it('should call apiCall with correct endpoint', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        history: [],
        currentIndex: 0,
        savedAt: Date.now(),
      });

      const result = await projectApi.getContext('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith('/projects/proj-123/context');
      expect(result.history).toBeDefined();
    });
  });

  describe('projectApi.saveContext', () => {
    it('should call apiCall with PUT and context data', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({ message: 'Context saved', savedAt: Date.now() });

      const context = {
        history: [{ files: {}, label: 'Snapshot', timestamp: Date.now(), type: 'manual' as const }],
        currentIndex: 0,
        savedAt: Date.now(),
      };

      const result = await projectApi.saveContext('proj-123', context);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/context',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(context),
        })
      );
      expect(result.savedAt).toBeDefined();
    });
  });

  describe('projectApi.clearContext', () => {
    it('should call apiCall with DELETE method', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({ message: 'Context cleared' });

      const result = await projectApi.clearContext('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/context',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.message).toBe('Context cleared');
    });
  });

  describe('projectApi.cleanNodeModules', () => {
    it('should call apiCall with DELETE method', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        message: 'node_modules deleted',
        id: 'proj-123',
        freedBytes: 1024000,
        freedMB: 1.0,
      });

      const result = await projectApi.cleanNodeModules('proj-123');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/node_modules',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.freedMB).toBe(1.0);
    });
  });

  describe('projectApi.readFile', () => {
    it('should call apiCall and return content only', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({
        content: 'console.log("hello")',
        path: 'src/index.ts',
      });

      const result = await projectApi.readFile('proj-123', 'src/index.ts');

      expect(mockApiCall).toHaveBeenCalledWith('/projects/proj-123/file?path=src%2Findex.ts');
      expect(result).toBe('console.log("hello")');
    });
  });

  describe('projectApi.saveFile', () => {
    it('should call apiCall with PUT and file data', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({ message: 'File saved', path: 'src/index.ts' });

      const result = await projectApi.saveFile('proj-123', 'src/index.ts', 'console.log("saved")');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/file',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ path: 'src/index.ts', content: 'console.log("saved")' }),
        })
      );
      expect(result.path).toBe('src/index.ts');
    });
  });

  describe('projectApi.deleteFile', () => {
    it('should call apiCall with DELETE and path query', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      mockApiCall.mockResolvedValueOnce({ message: 'File deleted', path: 'src/index.ts' });

      const result = await projectApi.deleteFile('proj-123', 'src/index.ts');

      expect(mockApiCall).toHaveBeenCalledWith(
        '/projects/proj-123/file?path=src%2Findex.ts',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.message).toBe('File deleted');
    });
  });

  describe('projectApi module structure', () => {
    it('should export all required functions', async () => {
      const { projectApi } = await import('../../../services/api/projects');

      expect(typeof projectApi.list).toBe('function');
      expect(typeof projectApi.get).toBe('function');
      expect(typeof projectApi.create).toBe('function');
      expect(typeof projectApi.update).toBe('function');
      expect(typeof projectApi.delete).toBe('function');
      expect(typeof projectApi.duplicate).toBe('function');
      expect(typeof projectApi.getContext).toBe('function');
      expect(typeof projectApi.saveContext).toBe('function');
      expect(typeof projectApi.clearContext).toBe('function');
      expect(typeof projectApi.cleanNodeModules).toBe('function');
      expect(typeof projectApi.readFile).toBe('function');
      expect(typeof projectApi.saveFile).toBe('function');
      expect(typeof projectApi.deleteFile).toBe('function');
    });
  });
});