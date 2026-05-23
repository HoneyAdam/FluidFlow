/**
 * Prompt History Service - Full Test Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => { localStorageMock.store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageMock.store[key]; }),
  clear: vi.fn(() => { localStorageMock.store = {}; }),
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import after mocking
import * as promptHistory from '../../services/promptHistory';

describe('Prompt History Service', () => {
  beforeEach(() => {
    localStorageMock.store = {};
    localStorageMock.clear();
  });

  describe('getPromptHistory', () => {
    it('should return empty array when no history exists', () => {
      const result = promptHistory.getPromptHistory();
      expect(result).toEqual([]);
    });

    it('should return parsed history from localStorage', () => {
      const history = [
        { id: 'test-1', prompt: 'Test prompt 1', timestamp: Date.now() },
        { id: 'test-2', prompt: 'Test prompt 2', timestamp: Date.now() },
      ];
      localStorageMock.store['fluidflow_prompt_history'] = JSON.stringify(history);

      const result = promptHistory.getPromptHistory();
      expect(result).toEqual(history);
    });

    it('should return empty array for invalid JSON', () => {
      localStorageMock.store['fluidflow_prompt_history'] = 'not json';

      const result = promptHistory.getPromptHistory();
      expect(result).toEqual([]);
    });

    it('should return empty array when stored data is not an array', () => {
      localStorageMock.store['fluidflow_prompt_history'] = JSON.stringify({ not: 'array' });

      const result = promptHistory.getPromptHistory();
      expect(result).toEqual([]);
    });
  });

  describe('addPromptToHistory', () => {
    it('should add new prompt with generated id and timestamp', () => {
      const item = { prompt: 'New test prompt' };
      const id = promptHistory.addPromptToHistory(item);

      expect(id).toMatch(/^prompt-\d+-[a-z0-9]+$/);
      const history = promptHistory.getPromptHistory();
      expect(history.length).toBe(1);
      expect(history[0].prompt).toBe('New test prompt');
      expect(history[0].timestamp).toBeDefined();
    });

    it('should add new prompt to beginning of history', () => {
      const item1 = { prompt: 'First prompt' };
      const item2 = { prompt: 'Second prompt' };

      promptHistory.addPromptToHistory(item1);
      promptHistory.addPromptToHistory(item2);

      const history = promptHistory.getPromptHistory();
      expect(history[0].prompt).toBe('Second prompt');
      expect(history[1].prompt).toBe('First prompt');
    });

    it('should include optional fields', () => {
      const item = {
        prompt: 'Test prompt',
        responsePreview: 'Preview text',
        tokensUsed: 100,
        model: 'gpt-4',
        projectContext: { projectId: 'proj-1', fileCount: 5 },
        tags: ['tag1', 'tag2'],
        favorite: true,
      };

      promptHistory.addPromptToHistory(item);
      const history = promptHistory.getPromptHistory();

      expect(history[0].responsePreview).toBe('Preview text');
      expect(history[0].tokensUsed).toBe(100);
      expect(history[0].model).toBe('gpt-4');
      expect(history[0].projectContext).toEqual({ projectId: 'proj-1', fileCount: 5 });
      expect(history[0].tags).toEqual(['tag1', 'tag2']);
      expect(history[0].favorite).toBe(true);
    });
  });

  describe('updatePromptHistory', () => {
    it('should update existing prompt', () => {
      const id = promptHistory.addPromptToHistory({ prompt: 'Original prompt' });
      const updates = { prompt: 'Updated prompt', favorite: true };

      const result = promptHistory.updatePromptHistory(id, updates);

      expect(result).toBe(true);
      const history = promptHistory.getPromptHistory();
      expect(history[0].prompt).toBe('Updated prompt');
      expect(history[0].favorite).toBe(true);
    });

    it('should return false for non-existent id', () => {
      const result = promptHistory.updatePromptHistory('non-existent-id', { prompt: 'Updated' });
      expect(result).toBe(false);
    });
  });

  describe('deletePromptFromHistory', () => {
    it('should delete existing prompt', () => {
      const id = promptHistory.addPromptToHistory({ prompt: 'To delete' });
      promptHistory.addPromptToHistory({ prompt: 'To keep' });

      const result = promptHistory.deletePromptFromHistory(id);

      expect(result).toBe(true);
      const history = promptHistory.getPromptHistory();
      expect(history.length).toBe(1);
      expect(history[0].prompt).toBe('To keep');
    });

    it('should return false for non-existent id', () => {
      const result = promptHistory.deletePromptFromHistory('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('clearPromptHistory', () => {
    it('should clear all history', () => {
      promptHistory.addPromptToHistory({ prompt: 'Prompt 1' });
      promptHistory.addPromptToHistory({ prompt: 'Prompt 2' });

      promptHistory.clearPromptHistory();

      expect(localStorageMock.store['fluidflow_prompt_history']).toBeUndefined();
      expect(promptHistory.getPromptHistory()).toEqual([]);
    });
  });

  describe('togglePromptFavorite', () => {
    it('should toggle favorite from false to true', () => {
      const id = promptHistory.addPromptToHistory({ prompt: 'Test prompt' });

      const result = promptHistory.togglePromptFavorite(id);

      expect(result).toBe(true);
    });

    it('should toggle favorite from true to false', () => {
      const id = promptHistory.addPromptToHistory({ prompt: 'Test prompt', favorite: true });

      const result = promptHistory.togglePromptFavorite(id);

      expect(result).toBe(false);
    });

    it('should return null for non-existent id', () => {
      const result = promptHistory.togglePromptFavorite('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('searchPromptHistory', () => {
    it('should find prompts matching query in content', () => {
      promptHistory.addPromptToHistory({ prompt: 'Create a button component' });
      promptHistory.addPromptToHistory({ prompt: 'Create a modal dialog' });
      promptHistory.addPromptToHistory({ prompt: 'Fix CSS styling' });

      const results = promptHistory.searchPromptHistory('button');

      expect(results.length).toBe(1);
      expect(results[0].prompt).toContain('button');
    });

    it('should find prompts matching query in tags', () => {
      promptHistory.addPromptToHistory({ prompt: 'Test prompt 1', tags: ['react', 'component'] });
      promptHistory.addPromptToHistory({ prompt: 'Test prompt 2', tags: ['css', 'styling'] });

      const results = promptHistory.searchPromptHistory('react');

      expect(results.length).toBe(1);
      expect(results[0].tags).toContain('react');
    });

    it('should be case insensitive', () => {
      promptHistory.addPromptToHistory({ prompt: 'React Button Component' });

      const results = promptHistory.searchPromptHistory('REACT');

      expect(results.length).toBe(1);
    });
  });

  describe('getFavoritePrompts', () => {
    it('should return only favorite prompts', () => {
      promptHistory.addPromptToHistory({ prompt: 'Favorite 1', favorite: true });
      promptHistory.addPromptToHistory({ prompt: 'Not favorite' });
      promptHistory.addPromptToHistory({ prompt: 'Favorite 2', favorite: true });

      const results = promptHistory.getFavoritePrompts();

      expect(results.length).toBe(2);
      expect(results.every(r => r.favorite)).toBe(true);
    });
  });

  describe('getRecentPrompts', () => {
    it('should return prompts from last N days', () => {
      promptHistory.addPromptToHistory({ prompt: 'Old prompt' });
      
      // Add recent prompt
      const recentId = promptHistory.addPromptToHistory({ prompt: 'Recent prompt' });
      const history = promptHistory.getPromptHistory();
      history[1].timestamp = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days ago
      localStorageMock.store['fluidflow_prompt_history'] = JSON.stringify(history);

      const results = promptHistory.getRecentPrompts(7);

      expect(results.some(r => r.prompt === 'Recent prompt')).toBe(true);
    });
  });

  describe('getPromptHistoryStats', () => {
    it('should calculate correct statistics', () => {
      promptHistory.addPromptToHistory({ prompt: 'Prompt 1', tags: ['tag1'] });
      promptHistory.addPromptToHistory({ prompt: 'Prompt 2', tags: ['tag1', 'tag2'] });
      promptHistory.addPromptToHistory({ prompt: 'Prompt 3', favorite: true });

      const stats = promptHistory.getPromptHistoryStats();

      expect(stats.totalPrompts).toBe(3);
      expect(stats.favoriteCount).toBe(1);
      expect(stats.mostUsedTags).toContain('tag1');
    });

    it('should return zero counts for empty history', () => {
      const stats = promptHistory.getPromptHistoryStats();

      expect(stats.totalPrompts).toBe(0);
      expect(stats.favoriteCount).toBe(0);
      expect(stats.thisWeekCount).toBe(0);
      expect(stats.mostUsedTags).toEqual([]);
    });
  });

  describe('getResponsePreview', () => {
    it('should return first 200 characters', () => {
      const longResponse = 'A'.repeat(300);
      const preview = promptHistory.getResponsePreview(longResponse);

      expect(preview.length).toBe(200);
      expect(preview).toBe('A'.repeat(200));
    });

    it('should return empty string for empty input', () => {
      const preview = promptHistory.getResponsePreview('');
      expect(preview).toBe('');
    });
  });

  describe('exportPromptHistory', () => {
    it('should export history as JSON string', () => {
      promptHistory.addPromptToHistory({ prompt: 'Test prompt 1' });
      promptHistory.addPromptToHistory({ prompt: 'Test prompt 2' });

      const exported = promptHistory.exportPromptHistory();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe('importPromptHistory', () => {
    it('should import valid prompts from JSON', () => {
      const importData = [
        { prompt: 'Imported prompt 1', timestamp: Date.now() },
        { prompt: 'Imported prompt 2', timestamp: Date.now() },
      ];

      const result = promptHistory.importPromptHistory(JSON.stringify(importData));

      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);
      const history = promptHistory.getPromptHistory();
      expect(history.length).toBe(2);
    });

    it('should reject invalid format', () => {
      const result = promptHistory.importPromptHistory(JSON.stringify({ not: 'array' }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('expected array');
    });

    it('should reject when no valid prompts found', () => {
      const importData = [
        { prompt: '', timestamp: Date.now() },
        { timestamp: Date.now() },
      ];

      const result = promptHistory.importPromptHistory(JSON.stringify(importData));

      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid prompts found');
    });

    it('should handle invalid JSON', () => {
      const result = promptHistory.importPromptHistory('not valid json');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});