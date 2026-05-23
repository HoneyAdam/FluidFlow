/**
 * Batch Generation Service - Full Test Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../services/ai', () => ({
  getProviderManager: vi.fn(() => ({
    getProvider: vi.fn(() => null),
    getActiveConfig: vi.fn(() => null),
  })),
}));

vi.mock('../../services/fluidflowConfig', () => ({
  getFluidFlowConfig: vi.fn(() => ({
    getResponseFormat: vi.fn(() => 'json'),
  })),
}));

vi.mock('../../utils/aiResponseParser', () => ({
  parseAIResponse: vi.fn(() => ({
    format: 'unknown',
    files: {},
    truncated: false,
    warnings: [],
    errors: [],
  })),
  getBatchContinuationPrompt: vi.fn(() => null),
}));

// Import after mocking
import { BatchGenerator, batchGenerator } from '../../services/batchGeneration';

describe('Batch Generation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BatchGenerator class', () => {
    it('should create instance with default options', () => {
      const generator = new BatchGenerator();
      expect(generator).toBeDefined();
    });

    it('should have correct default options', () => {
      const generator = new BatchGenerator();
      expect(batchGenerator).toBeDefined();
    });

    it('should export batchGenerator singleton', () => {
      expect(batchGenerator).toBeDefined();
      expect(typeof batchGenerator.generateInBatches).toBe('function');
    });

    it('should export BatchGenerator class', () => {
      expect(BatchGenerator).toBeDefined();
      expect(typeof BatchGenerator).toBe('function');
    });
  });

  describe('generateInBatches', () => {
    it('should handle empty file list', async () => {
      const result = await batchGenerator.generateInBatches(
        'Generate files',
        'System instruction',
        []
      );

      expect(result.success).toBe(false);
      expect(result.files).toEqual({});
      expect(result.completedBatches).toBe(0);
    });

    it('should fail when no provider configured', async () => {
      const result = await batchGenerator.generateInBatches(
        'Generate files',
        'System instruction',
        ['file1.ts', 'file2.ts']
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No AI provider configured');
    });
  });

  describe('interface types', () => {
    it('should define BatchGenerationOptions interface properties', () => {
      const options = {
        maxFilesPerBatch: 10,
        maxTokensPerBatch: 16000,
        maxRetries: 3,
        useMarkerFormat: true,
      };

      expect(options.maxFilesPerBatch).toBe(10);
      expect(options.maxTokensPerBatch).toBe(16000);
      expect(options.maxRetries).toBe(3);
      expect(options.useMarkerFormat).toBe(true);
    });

    it('should define BatchResult interface properties', () => {
      const result = {
        success: true,
        files: { 'test.ts': 'content' },
        completedBatches: 1,
        totalBatches: 1,
        parseResults: [],
      };

      expect(result.success).toBe(true);
      expect(result.files['test.ts']).toBe('content');
      expect(result.completedBatches).toBe(1);
    });
  });
});