/**
 * FluidFlow Config Service - Full Test Suite
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
import { getFluidFlowConfig } from '../../services/fluidflowConfig';

describe('FluidFlow Config Service', () => {
  let config: ReturnType<typeof getFluidFlowConfig>;

  beforeEach(() => {
    localStorageMock.store = {};
    localStorageMock.clear();
    // Get a fresh instance
    config = getFluidFlowConfig();
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const result = config.getConfig();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should return a copy, not the original', () => {
      const result1 = config.getConfig();
      const result2 = config.getConfig();
      expect(result1).not.toBe(result2);
    });
  });

  describe('getRules / setRules', () => {
    it('should get empty rules by default', () => {
      const rules = config.getRules();
      expect(rules).toBeDefined();
      expect(typeof rules).toBe('string');
    });

    it('should set and get rules', () => {
      const rulesContent = '# Custom Rules\n\nSome project rules';
      config.setRules(rulesContent);
      expect(config.getRules()).toBe(rulesContent);
    });

    it('should persist rules to localStorage', () => {
      config.setRules('Test rules');
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('getAgents / updateAgent / addAgent', () => {
    it('should get agents array', () => {
      const agents = config.getAgents();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should get only enabled agents', () => {
      const enabledAgents = config.getEnabledAgents();
      expect(enabledAgents.every(a => a.enabled)).toBe(true);
    });

    it('should add new agent', () => {
      const newAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        systemPrompt: 'You are a test agent',
        enabled: true,
      };

      config.addAgent(newAgent);
      const agents = config.getAgents();
      expect(agents.some(a => a.id === 'test-agent')).toBe(true);
    });

    it('should update existing agent', () => {
      const newAgent = {
        id: 'update-test-agent',
        name: 'Original Name',
        description: 'Description',
        systemPrompt: 'Prompt',
        enabled: false,
      };

      config.addAgent(newAgent);
      config.updateAgent('update-test-agent', { name: 'Updated Name', enabled: true });

      const agents = config.getAgents();
      const updated = agents.find(a => a.id === 'update-test-agent');
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.enabled).toBe(true);
    });

    it('should not update non-existent agent', () => {
      const initialAgents = config.getAgents().length;
      config.updateAgent('non-existent-id', { name: 'Should not work' });
      expect(config.getAgents().length).toBe(initialAgents);
    });
  });

  describe('getContextSettings / updateContextSettings', () => {
    it('should get default context settings', () => {
      const settings = config.getContextSettings();
      expect(settings).toBeDefined();
      expect(settings).toHaveProperty('minRemainingTokens');
      expect(settings).toHaveProperty('compactToTokens');
    });

    it('should update context settings', () => {
      config.updateContextSettings({ minRemainingTokens: 5000 });
      const settings = config.getContextSettings();
      expect(settings.minRemainingTokens).toBe(5000);
    });

    it('should merge with existing settings', () => {
      const original = config.getContextSettings();
      config.updateContextSettings({ minRemainingTokens: 9999 });

      const updated = config.getContextSettings();
      expect(updated.minRemainingTokens).toBe(9999);
      expect(updated.compactToTokens).toBe(original.compactToTokens);
    });
  });

  describe('getResponseFormat / setResponseFormat', () => {
    it('should get default response format', () => {
      const format = config.getResponseFormat();
      expect(['json', 'marker', 'tools']).toContain(format);
    });

    it('should set response format', () => {
      config.setResponseFormat('json');
      expect(config.getResponseFormat()).toBe('json');

      config.setResponseFormat('marker');
      expect(config.getResponseFormat()).toBe('marker');
    });
  });

  describe('compaction logs', () => {
    beforeEach(() => {
      // Clear compaction logs before each test to avoid state pollution from singleton
      config.clearCompactionLogs();
    });

    it('should add compaction log', () => {
      const log = config.addCompactionLog({
        contextId: 'test-context',
        previousTokens: 1000,
        newTokens: 500,
        reason: 'Token limit reached',
      });

      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeGreaterThan(0);
      expect(log.contextId).toBe('test-context');
      expect(log.previousTokens).toBe(1000);
      expect(log.newTokens).toBe(500);
    });

    it('should get all compaction logs', () => {
      config.addCompactionLog({ contextId: 'ctx1', previousTokens: 100, newTokens: 50, reason: 'test' });
      config.addCompactionLog({ contextId: 'ctx2', previousTokens: 200, newTokens: 75, reason: 'test' });

      const logs = config.getCompactionLogs();
      expect(logs.length).toBe(2);
    });

    it('should filter compaction logs by context', () => {
      config.addCompactionLog({ contextId: 'specific-ctx', previousTokens: 100, newTokens: 50, reason: 'test' });
      config.addCompactionLog({ contextId: 'other-ctx', previousTokens: 100, newTokens: 50, reason: 'test' });

      const logs = config.getCompactionLogs('specific-ctx');
      expect(logs.length).toBe(1);
      expect(logs[0].contextId).toBe('specific-ctx');
    });

    it('should clear compaction logs', () => {
      config.addCompactionLog({ contextId: 'ctx1', previousTokens: 100, newTokens: 50, reason: 'test' });
      config.clearCompactionLogs();

      expect(config.getCompactionLogs().length).toBe(0);
    });
  });

  describe('exportAsFiles', () => {
    it('should export config as file structure', () => {
      config.setRules('# Custom Rules');
      
      const files = config.exportAsFiles();

      expect(files['.fluidflow/rules.md']).toBe('# Custom Rules');
      expect(files['.fluidflow/agents.json']).toBeDefined();
      expect(files['.fluidflow/settings.json']).toBeDefined();
      expect(files['.fluidflow/.gitignore']).toContain('# FluidFlow');
    });

    it('should include compaction logs when enabled', () => {
      config.addCompactionLog({ contextId: 'ctx1', previousTokens: 100, newTokens: 50, reason: 'test' });

      // Enable save compaction logs
      config.updateContextSettings({ saveCompactionLogs: true } as any);

      const files = config.exportAsFiles();
      expect(files['.fluidflow/logs/compaction-logs.json']).toBeDefined();
    });
  });

  describe('importFromFiles', () => {
    it('should import config from files', () => {
      const files: Record<string, string> = {
        '.fluidflow/rules.md': '# Imported Rules',
        '.fluidflow/agents.json': JSON.stringify([]),
        '.fluidflow/settings.json': JSON.stringify({ contextSettings: { minRemainingTokens: 3000 } }),
      };

      config.importFromFiles(files);

      expect(config.getRules()).toBe('# Imported Rules');
      expect(config.getContextSettings().minRemainingTokens).toBe(3000);
    });

    it('should handle invalid agents.json', () => {
      const files: Record<string, string> = {
        '.fluidflow/rules.md': '',
        '.fluidflow/agents.json': 'not json',
        '.fluidflow/settings.json': '{}',
      };

      // Should not throw
      expect(() => config.importFromFiles(files)).not.toThrow();
    });
  });
});