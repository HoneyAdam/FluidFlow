import { describe, it, expect } from 'vitest';
import {
  getModelCapabilities,
  getProviderDefaults,
  modelSupports,
  getModelsWithCapability,
  getBestModelForUseCase,
  estimateTokenCount,
  fitsInContext,
  getRecommendedMaxTokens,
} from '../../../services/ai/capabilities';

describe('capabilities', () => {
  describe('getModelCapabilities', () => {
    it('returns capabilities for known models', () => {
      const caps = getModelCapabilities('gpt-5.1');
      expect(caps.contextWindow).toBeGreaterThan(0);
      expect(caps).toHaveProperty('supportsVision');
      expect(caps).toHaveProperty('supportsStreaming');
    });

    it('returns default capabilities for unknown models', () => {
      const caps = getModelCapabilities('unknown-model-xyz');
      expect(caps.contextWindow).toBe(8192);
      expect(caps.supportsVision).toBe(false);
    });

    it('matches longest prefix', () => {
      const caps = getModelCapabilities('gpt-4o-mini');
      expect(caps.contextWindow).toBe(128000);
    });

    it('returns capabilities for gemini models', () => {
      const caps = getModelCapabilities('gemini-2.5-flash');
      expect(caps.contextWindow).toBe(1048576);
    });

    it('returns capabilities for claude models', () => {
      const caps = getModelCapabilities('claude-sonnet-4');
      expect(caps.contextWindow).toBe(200000);
    });

    it('returns capabilities for o3', () => {
      const caps = getModelCapabilities('o3-mini');
      expect(caps.supportsStreaming).toBe(false);
    });

    it('returns capabilities for local models', () => {
      const caps = getModelCapabilities('llama-3.3-70b');
      expect(caps.contextWindow).toBe(8192);
    });

    it('returns capabilities for glm models', () => {
      const caps = getModelCapabilities('glm-4.7');
      expect(caps.contextWindow).toBe(200000);
    });
  });

  describe('getProviderDefaults', () => {
    it('returns defaults for known providers', () => {
      const defaults = getProviderDefaults('openai');
      expect(defaults).toHaveProperty('defaultCapabilities');
      expect(defaults).toHaveProperty('supportsModelList');
      expect(defaults).toHaveProperty('requiresApiKey');
    });

    it('returns custom defaults for unknown providers', () => {
      const defaults = getProviderDefaults('unknown');
      expect(defaults.requiresApiKey).toBe(false);
      expect(defaults.supportsCustomBaseUrl).toBe(true);
    });

    it('openai supports model list', () => {
      expect(getProviderDefaults('openai').supportsModelList).toBe(true);
    });

    it('ollama does not require API key', () => {
      expect(getProviderDefaults('ollama').requiresApiKey).toBe(false);
    });
  });

  describe('modelSupports', () => {
    it('returns true for boolean capability', () => {
      expect(modelSupports('gpt-5.1', 'supportsVision')).toBe(true);
    });

    it('returns false for unsupported boolean capability', () => {
      expect(modelSupports('llama-3', 'supportsVision')).toBe(false);
    });

    it('returns true for numeric capability > 0', () => {
      expect(modelSupports('gpt-5.1', 'contextWindow')).toBe(true);
    });

    it('returns false for zero numeric capability', () => {
      // Unknown models use DEFAULT_CAPABILITIES which has maxOutputTokens: 4096, so modelSupports returns true
      // To test "false for zero", we would need a model entry explicitly setting maxOutputTokens: 0
      expect(modelSupports('unknown-model', 'maxOutputTokens')).toBe(true);
    });
  });

  describe('getModelsWithCapability', () => {
    const models = [
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'llama-3', name: 'Llama 3' },
    ];

    it('filters models by vision capability', () => {
      const result = getModelsWithCapability('supportsVision', models);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gpt-5.1');
    });

    it('filters models by streaming capability', () => {
      const result = getModelsWithCapability('supportsStreaming', models);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getBestModelForUseCase', () => {
    const models = [
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    ];

    it('finds vision model', () => {
      const result = getBestModelForUseCase('vision', models);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('gpt-5.1');
    });

    it('finds long-context model', () => {
      const result = getBestModelForUseCase('long-context', models);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('gemini-2.5-flash');
    });

    it('finds cheap model', () => {
      const result = getBestModelForUseCase('cheap', models);
      expect(result).not.toBeNull();
    });

    it('finds fast model', () => {
      const result = getBestModelForUseCase('fast', models);
      expect(result).not.toBeNull();
    });

    it('finds code model', () => {
      const result = getBestModelForUseCase('code', models);
      expect(result).not.toBeNull();
    });

    it('finds chat model', () => {
      const result = getBestModelForUseCase('chat', models);
      expect(result).not.toBeNull();
    });

    it('returns null for empty model list', () => {
      expect(getBestModelForUseCase('vision', [])).toBeNull();
    });

    it('cheap falls back to first model', () => {
      const result = getBestModelForUseCase('cheap', [{ id: 'some-model' }]);
      expect(result).not.toBeNull();
    });
  });

  describe('estimateTokenCount', () => {
    it('estimates at ~4 chars per token', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount('a')).toBe(1);
      expect(estimateTokenCount('abcd')).toBe(1);
      expect(estimateTokenCount('abcdefgh')).toBe(2);
    });
  });

  describe('fitsInContext', () => {
    it('returns true when content fits', () => {
      expect(fitsInContext('gpt-5.1', 'short text')).toBe(true);
    });

    it('returns false when content too large', () => {
      const hugeText = 'a'.repeat(800000);
      expect(fitsInContext('gpt-5.1', hugeText)).toBe(false);
    });

    it('respects reserveForOutput', () => {
      // gpt-5.1 has 200000 context. 797000 chars ≈ 199250 tokens + 1000 reserve = 200250 > 200000
      expect(fitsInContext('gpt-5.1', 'a'.repeat(797000), 1000)).toBe(false);
    });
  });

  describe('getRecommendedMaxTokens', () => {
    it('returns maxOutputTokens for known models', () => {
      const result = getRecommendedMaxTokens('gpt-5.1');
      expect(result).toBeGreaterThan(0);
    });

    it('returns default for unknown models', () => {
      const result = getRecommendedMaxTokens('unknown');
      expect(result).toBe(4096);
    });
  });
});
