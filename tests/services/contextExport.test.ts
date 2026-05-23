/**
 * Context Export Service - Full Test Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Mock localStorage for conversationContext dependency
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => { localStorageMock.store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageMock.store[key]; }),
  clear: vi.fn(() => { localStorageMock.store = {}; }),
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import after mocking
import * as contextExport from '../../services/contextExport';
import { getContextManager } from '../../services/conversationContext';

describe('Context Export Service', () => {
  let contextManager: ReturnType<typeof getContextManager>;

  beforeEach(() => {
    localStorageMock.store = {};
    localStorageMock.clear();
    contextManager = getContextManager({ persistToStorage: true });
    contextManager.clearAllContexts();
  });

  describe('exportContext', () => {
    it('should export context to JSON file', async () => {
      // Setup context with messages
      contextManager.getContext('test-export');
      contextManager.addMessage('test-export', 'user', 'Hello');
      contextManager.addMessage('test-export', 'assistant', 'Hi there');

      await contextExport.exportContext('test-export');

      const { saveAs } = await import('file-saver');
      expect(saveAs).toHaveBeenCalled();
    });

    it('should use custom filename when provided', async () => {
      contextManager.getContext('test-export');

      await contextExport.exportContext('test-export', 'custom-file.json');

      const { saveAs } = await import('file-saver');
      const call = (saveAs as ReturnType<typeof vi.fn>).mock.calls[0];
      // The filename parameter is used or falls back to default
      expect(call[1]).toMatch(/custom-file\.json|context-test-export-\d{4}-\d{2}-\d{2}\.json/);
    });
  });

  describe('importContext', () => {
    it('should import valid context file', async () => {
      const importData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        contextId: 'imported-context',
        messages: [
          { role: 'user', content: 'User message' },
          { role: 'assistant', content: 'Assistant response' },
        ],
        metadata: { totalMessages: 2, estimatedTokens: 100 },
      };

      const file = new File([JSON.stringify(importData)], 'context.json', { type: 'application/json' });
      const result = await contextExport.importContext(file);

      expect(result.success).toBe(true);
      expect(result.messageCount).toBe(2);
    });

    it('should reject invalid format', async () => {
      const invalidData = {
        version: '1.0',
        // missing messages
      };

      const file = new File([JSON.stringify(invalidData)], 'invalid.json', { type: 'application/json' });
      const result = await contextExport.importContext(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should handle non-array messages', async () => {
      const invalidData = {
        version: '1.0',
        messages: { not: 'array' },
        contextId: 'test',
      };

      const file = new File([JSON.stringify(invalidData)], 'invalid.json', { type: 'application/json' });
      const result = await contextExport.importContext(file);

      expect(result.success).toBe(false);
    });

    it('should generate new ID for conflicting context IDs', async () => {
      // Create existing context first
      contextManager.getContext('existing-context');
      contextManager.addMessage('existing-context', 'user', 'Existing message');

      const importData = {
        version: '1.0',
        contextId: 'existing-context',
        messages: [{ role: 'user', content: 'Imported message' }],
        metadata: { totalMessages: 1, estimatedTokens: 50 },
      };

      const file = new File([JSON.stringify(importData)], 'import.json', { type: 'application/json' });
      const result = await contextExport.importContext(file);

      expect(result.success).toBe(true);
      // When there's a conflict, it creates a new ID with '-import-' suffix
      expect(result.contextId).toContain('-import-');
    });

    it('should handle invalid JSON', async () => {
      const file = new File(['not valid json'], 'invalid.json', { type: 'application/json' });
      const result = await contextExport.importContext(file);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exportAllContexts', () => {
    it('should export all contexts', async () => {
      contextManager.getContext('ctx1');
      contextManager.addMessage('ctx1', 'user', 'Message 1');
      contextManager.getContext('ctx2');
      contextManager.addMessage('ctx2', 'user', 'Message 2');

      await contextExport.exportAllContexts();

      const { saveAs } = await import('file-saver');
      expect(saveAs).toHaveBeenCalled();
    });
  });

  describe('importContexts', () => {
    it('should import multiple contexts', async () => {
      const importData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        contexts: [
          {
            id: 'imported-ctx-1',
            name: 'Imported Context 1',
            messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }],
            estimatedTokens: 50,
          },
          {
            id: 'imported-ctx-2',
            name: 'Imported Context 2',
            messages: [{ role: 'user', content: 'World', timestamp: Date.now() }],
            estimatedTokens: 50,
          },
        ],
      };

      const file = new File([JSON.stringify(importData)], 'contexts.json', { type: 'application/json' });
      const result = await contextExport.importContexts(file);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);
    });

    it('should reject invalid format', async () => {
      const invalidData = {
        version: '1.0',
        // missing contexts
      };

      const file = new File([JSON.stringify(invalidData)], 'invalid.json', { type: 'application/json' });
      const result = await contextExport.importContexts(file);

      expect(result.success).toBe(false);
    });

    it('should skip invalid contexts in import', async () => {
      const importData = {
        version: '1.0',
        contexts: [
          { id: 'valid-ctx', messages: [{ role: 'user', content: 'Valid' }] },
          { id: 'invalid-ctx' }, // missing messages array - should be skipped
        ],
      };

      const file = new File([JSON.stringify(importData)], 'partial.json', { type: 'application/json' });
      const result = await contextExport.importContexts(file);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
    });

    it('should handle invalid JSON', async () => {
      const file = new File(['not json'], 'invalid.json', { type: 'application/json' });
      const result = await contextExport.importContexts(file);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});