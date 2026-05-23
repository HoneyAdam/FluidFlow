import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/ai/utils/errorHandling', () => ({
  isRetryableError: vi.fn(),
  AIProviderError: class extends Error { code = ''; isRetryable = false; },
  AIErrorCode: { NETWORK_ERROR: 'NETWORK_ERROR', RATE_LIMIT: 'RATE_LIMIT' },
}));

import {
  detectModelFamily,
  detectModelGroup,
  detectToolCallingSupport,
  modelsDevModelToModelOption,
  modelsDevProviderToConfig,
  fetchProvidersFromModelsDev,
  clearProviderCache,
  enrichModelOption,
  enrichModels,
  syncModelsFromProvider,
  formatPrice,
  isFreeModel,
  modelSupports,
  getModelDisplayName,
  getModelMetadata,
  applyKnownMetadata,
  applyKnownMetadataToAll,
  getProviderModelMetadata,
  KNOWN_MODEL_METADATA,
  type ProviderMetadata,
} from '../../../services/ai/types';

// Re-import from the actual module
import * as modelsSync from '../../../services/ai/modelsSync';

describe('modelsSync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    modelsSync.clearProviderCache();
  });

  describe('detectModelFamily', () => {
    it('detects gpt family', () => {
      expect(modelsSync.detectModelFamily('gpt-4')).toBe('gpt');
      expect(modelsSync.detectModelFamily('GPT-5')).toBe('gpt');
    });
    it('detects gpt for o1/o2/o3/o4', () => {
      expect(modelsSync.detectModelFamily('o1-preview')).toBe('gpt');
      expect(modelsSync.detectModelFamily('o2-model')).toBe('gpt');
      expect(modelsSync.detectModelFamily('o3-mini')).toBe('gpt');
      expect(modelsSync.detectModelFamily('o4-mini')).toBe('gpt');
    });
    it('detects claude family', () => {
      expect(modelsSync.detectModelFamily('claude-3-opus')).toBe('claude');
      expect(modelsSync.detectModelFamily('opus-4')).toBe('claude');
      expect(modelsSync.detectModelFamily('sonnet-4')).toBe('claude');
      expect(modelsSync.detectModelFamily('haiku-3')).toBe('claude');
    });
    it('detects gemini family', () => {
      expect(modelsSync.detectModelFamily('gemini-2.5-pro')).toBe('gemini');
      expect(modelsSync.detectModelFamily('Gemini-3')).toBe('gemini');
    });
    it('detects glm family', () => {
      expect(modelsSync.detectModelFamily('glm-4.7')).toBe('glm');
      expect(modelsSync.detectModelFamily('GLM-4')).toBe('glm');
      expect(modelsSync.detectModelFamily('z-ai-model')).toBe('glm');
      expect(modelsSync.detectModelFamily('zai-model')).toBe('glm');
    });
    it('detects llama family', () => {
      expect(modelsSync.detectModelFamily('llama-3.3-70b')).toBe('llama');
    });
    it('detects qwen family', () => {
      expect(modelsSync.detectModelFamily('qwen-3-32b')).toBe('qwen');
      expect(modelsSync.detectModelFamily('qwq-32b')).toBe('qwen');
    });
    it('detects mistral family', () => {
      expect(modelsSync.detectModelFamily('mistral-7b')).toBe('mistral');
      expect(modelsSync.detectModelFamily('mixtral-8x7b')).toBe('mistral');
      expect(modelsSync.detectModelFamily('magistral-model')).toBe('mistral');
    });
    it('detects phi as custom', () => {
      expect(modelsSync.detectModelFamily('phi-3')).toBe('custom');
      expect(modelsSync.detectModelFamily('phi3.5')).toBe('custom');
    });
    it('returns unknown for unrecognized', () => {
      expect(modelsSync.detectModelFamily('random-model')).toBe('unknown');
      expect(modelsSync.detectModelFamily('deepseek-v3')).toBe('unknown');
    });
  });

  describe('detectModelGroup', () => {
    it('detects gpt groups', () => {
      expect(modelsSync.detectModelGroup('gpt-5.1')).toBe('gpt-5');
      expect(modelsSync.detectModelGroup('gpt-4o-mini')).toBe('gpt-4o');
      expect(modelsSync.detectModelGroup('gpt-4-turbo')).toBe('gpt-4');
      expect(modelsSync.detectModelGroup('o4-mini')).toBe('o4');
      expect(modelsSync.detectModelGroup('o3-mini')).toBe('o3');
      expect(modelsSync.detectModelGroup('o1-preview')).toBe('o1');
    });
    it('detects claude groups', () => {
      expect(modelsSync.detectModelGroup('claude-opus-4-5')).toBe('claude-opus');
      expect(modelsSync.detectModelGroup('claude-sonnet-4')).toBe('claude-sonnet');
      expect(modelsSync.detectModelGroup('claude-haiku-4')).toBe('claude-haiku');
    });
    it('detects gemini groups', () => {
      expect(modelsSync.detectModelGroup('gemini-3.1-pro')).toBe('gemini-3');
      expect(modelsSync.detectModelGroup('gemini-2.5-flash')).toBe('gemini-2.5');
      expect(modelsSync.detectModelGroup('gemini-2.0-flash')).toBe('gemini-2');
      expect(modelsSync.detectModelGroup('gemini-1.5-pro')).toBe('gemini-1.5');
      expect(modelsSync.detectModelGroup('gemini-1.0-pro')).toBe('gemini-1');
    });
    it('detects glm groups', () => {
      expect(modelsSync.detectModelGroup('glm-4.7')).toBe('glm-4');
      expect(modelsSync.detectModelGroup('glm-3-turbo')).toBe('glm-3');
    });
    it('detects llama groups', () => {
      expect(modelsSync.detectModelGroup('llama-3.3-70b')).toBe('llama-3.3');
      expect(modelsSync.detectModelGroup('llama-3.1-8b')).toBe('llama-3.1');
      expect(modelsSync.detectModelGroup('llama-3-70b')).toBe('llama-3');
      expect(modelsSync.detectModelGroup('llama-2-70b')).toBe('llama-2');
    });
    it('detects qwen groups', () => {
      expect(modelsSync.detectModelGroup('qwen-3-32b')).toBe('qwen-3');
      expect(modelsSync.detectModelGroup('qwen-2.5-72b')).toBe('qwen-2.5');
      expect(modelsSync.detectModelGroup('qwen-2-72b')).toBe('qwen-2');
    });
    it('uses first two segments for unknown', () => {
      expect(modelsSync.detectModelGroup('my-model-v1')).toBe('my-model');
    });
  });

  describe('detectToolCallingSupport', () => {
    it('returns false for reasoning models o1/o2/o3/o4', () => {
      expect(modelsSync.detectToolCallingSupport('o1-preview', 'openai')).toBe(false);
      expect(modelsSync.detectToolCallingSupport('o2-model', 'openai')).toBe(false);
      expect(modelsSync.detectToolCallingSupport('o3-mini', 'openai')).toBe(false);
      expect(modelsSync.detectToolCallingSupport('o4-mini', 'openai')).toBe(false);
    });
    it('returns true for gpt mini on openai', () => {
      expect(modelsSync.detectToolCallingSupport('gpt-5-mini', 'openai')).toBe(true);
    });
    it('returns false for gpt nano models', () => {
      expect(modelsSync.detectToolCallingSupport('gpt-nano', 'openai')).toBe(false);
    });
    it('returns true for flash models', () => {
      expect(modelsSync.detectToolCallingSupport('gemini-flash', 'gemini')).toBe(true);
    });
    it('returns true for pro/opus/ultra models', () => {
      expect(modelsSync.detectToolCallingSupport('gemini-pro', 'gemini')).toBe(true);
      expect(modelsSync.detectToolCallingSupport('claude-opus', 'anthropic')).toBe(true);
      expect(modelsSync.detectToolCallingSupport('model-ultra', 'openai')).toBe(true);
    });
    it('returns true by default for modern models', () => {
      expect(modelsSync.detectToolCallingSupport('some-model', 'openai')).toBe(true);
    });
  });

  describe('modelsDevModelToModelOption', () => {
    it('converts full model', () => {
      const model = {
        id: 'gpt-4',
        name: 'openai: GPT-4',
        family: 'gpt',
        tool_call: true,
        reasoning: false,
        modalities: { input: ['text', 'image'], output: ['text'] },
        limit: { context: 128000, output: 4096 },
        cost: { input: 0.03, output: 0.06 },
        release_date: '2023-06',
      };
      const result = modelsSync.modelsDevModelToModelOption(model, 'openai');
      expect(result.id).toBe('gpt-4');
      expect(result.name).toBe('GPT-4');
      expect(result.supportsVision).toBe(true);
      expect(result.supportsToolCalling).toBe(true);
      expect(result.contextWindow).toBe(128000);
      expect(result.maxOutput).toBe(4096);
      expect(result.pricing).toEqual({ input: 0.03, output: 0.06 });
      expect(result.family).toBe('gpt');
      expect(result.mode).toBe('chat');
    });
    it('converts reasoning model', () => {
      const model = {
        id: 'o3', name: 'O3', family: 'gpt', tool_call: false, reasoning: true,
      };
      const result = modelsSync.modelsDevModelToModelOption(model, 'openai');
      expect(result.mode).toBe('reasoning');
      expect(result.description).toContain('No tool calling');
    });
    it('converts minimal model', () => {
      const model = { id: 'test', name: 'Test', family: 'custom', tool_call: false };
      const result = modelsSync.modelsDevModelToModelOption(model, 'custom');
      expect(result.supportsVision).toBe(false);
      expect(result.pricing).toBeUndefined();
    });
  });

  describe('modelsDevProviderToConfig', () => {
    const baseProvider: ProviderMetadata = {
      id: 'openai', name: 'OpenAI', api: 'https://api.openai.com/v1',
      models: {
        'gpt-4': { id: 'gpt-4', name: 'GPT-4', family: 'gpt', tool_call: true },
      },
    };
    it('converts provider with models', () => {
      const result = modelsSync.modelsDevProviderToConfig(baseProvider);
      expect(result.type).toBe('openai');
      expect(result.models).toHaveLength(1);
      expect(result.defaultModel).toBe('gpt-4');
    });
    it('uses provided defaultModelId', () => {
      const result = modelsSync.modelsDevProviderToConfig(baseProvider, 'gpt-4');
      expect(result.defaultModel).toBe('gpt-4');
    });
    it('detects ollama provider', () => {
      const p: ProviderMetadata = { id: 'ollama', name: 'Ollama', api: 'https://api.ollama.com', models: {} };
      const result = modelsSync.modelsDevProviderToConfig(p);
      expect(result.type).toBe('ollama');
      expect(result.baseUrl).toBe('http://localhost:11434');
    });
    it('detects lmstudio provider', () => {
      const p: ProviderMetadata = { id: 'lmstudio', name: 'LM Studio', api: 'https://api.lmstudio.com', models: {} };
      const result = modelsSync.modelsDevProviderToConfig(p);
      expect(result.type).toBe('lmstudio');
      expect(result.baseUrl).toBe('http://localhost:1234/v1');
    });
    it('detects minimax provider', () => {
      const p: ProviderMetadata = { id: 'minimax', name: 'MiniMax', api: 'https://api.minimax.io/v1', models: {} };
      const result = modelsSync.modelsDevProviderToConfig(p);
      expect(result.type).toBe('minimax');
    });
    it('defaults to custom for unknown providers', () => {
      const p: ProviderMetadata = { id: 'some-provider', name: 'Some', api: 'https://some.api', models: {} };
      const result = modelsSync.modelsDevProviderToConfig(p);
      expect(result.type).toBe('custom');
    });
  });

  describe('fetchProvidersFromModelsDev', () => {
    it('fetches and caches providers', async () => {
      const mockData = { openai: { id: 'openai', name: 'OpenAI', api: 'url', models: {} } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);
      const result = await modelsSync.fetchProvidersFromModelsDev();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('openai');
    });
    it('returns cached data on second call', async () => {
      const mockData = { openai: { id: 'openai', name: 'OpenAI', api: 'url', models: {} } };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);
      await modelsSync.fetchProvidersFromModelsDev();
      await modelsSync.fetchProvidersFromModelsDev();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    it('returns cache on fetch error if cache exists', async () => {
      const mockData = { openai: { id: 'openai', name: 'OpenAI', api: 'url', models: {} } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);
      await modelsSync.fetchProvidersFromModelsDev();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      const result = await modelsSync.fetchProvidersFromModelsDev();
      expect(result).toHaveLength(1);
    });
    it('throws when no cache and fetch fails', async () => {
      modelsSync.clearProviderCache();
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      await expect(modelsSync.fetchProvidersFromModelsDev()).rejects.toThrow('Network error');
    });
    it('throws on non-ok response', async () => {
      modelsSync.clearProviderCache();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false, status: 500,
      } as Response);
      await expect(modelsSync.fetchProvidersFromModelsDev()).rejects.toThrow('Failed to fetch: 500');
    });
  });

  describe('clearProviderCache', () => {
    it('clears cache allowing refetch', async () => {
      const mockData = { openai: { id: 'openai', name: 'OpenAI', api: 'url', models: {} } };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);
      await modelsSync.fetchProvidersFromModelsDev();
      modelsSync.clearProviderCache();
      await modelsSync.fetchProvidersFromModelsDev();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('enrichModelOption', () => {
    it('detects missing family', () => {
      const result = modelsSync.enrichModelOption({ id: 'gpt-4', name: 'GPT-4' }, 'openai');
      expect(result.family).toBe('gpt');
    });
    it('detects missing group', () => {
      const result = modelsSync.enrichModelOption({ id: 'gemini-2.5-pro', name: 'Gemini' }, 'gemini');
      expect(result.group).toBe('gemini-2.5');
    });
    it('detects missing tool calling support', () => {
      const result = modelsSync.enrichModelOption({ id: 'gpt-4', name: 'GPT-4' }, 'openai');
      expect(result.supportsToolCalling).toBe(true);
    });
    it('detects code mode', () => {
      const result = modelsSync.enrichModelOption({ id: 'codex-model', name: 'Codex' }, 'openai');
      expect(result.mode).toBe('code');
    });
    it('detects reasoning mode for o1', () => {
      const result = modelsSync.enrichModelOption({ id: 'o1-preview', name: 'O1' }, 'openai');
      expect(result.mode).toBe('reasoning');
    });
    it('detects reasoning mode for o3', () => {
      const result = modelsSync.enrichModelOption({ id: 'o3-mini', name: 'O3 Mini' }, 'openai');
      expect(result.mode).toBe('reasoning');
    });
    it('defaults to chat mode', () => {
      const result = modelsSync.enrichModelOption({ id: 'some-model', name: 'Some' }, 'openai');
      expect(result.mode).toBe('chat');
    });
    it('preserves existing values', () => {
      const result = modelsSync.enrichModelOption({
        id: 'test', name: 'Test', family: 'custom', group: 'test-group',
        supportsToolCalling: false, mode: 'embedding',
      }, 'openai');
      expect(result.family).toBe('custom');
      expect(result.group).toBe('test-group');
      expect(result.supportsToolCalling).toBe(false);
      expect(result.mode).toBe('embedding');
    });
  });

  describe('enrichModels', () => {
    it('enriches multiple models', () => {
      const result = modelsSync.enrichModels([
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'claude-3', name: 'Claude 3' },
      ], 'openai');
      expect(result).toHaveLength(2);
      expect(result[0].family).toBe('gpt');
      expect(result[1].family).toBe('claude');
    });
  });

  describe('syncModelsFromProvider', () => {
    it('returns enriched models', async () => {
      const result = await modelsSync.syncModelsFromProvider(
        [{ id: 'gpt-4', name: 'GPT-4' }], 'openai'
      );
      expect(result.models).toHaveLength(1);
      expect(result.models[0].family).toBe('gpt');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatPrice', () => {
    it('returns dash for undefined', () => {
      expect(modelsSync.formatPrice(undefined)).toBe('-');
    });
    it('formats price with dollar sign', () => {
      expect(modelsSync.formatPrice(1.5)).toBe('$1.50/M');
    });
    it('formats zero', () => {
      expect(modelsSync.formatPrice(0)).toBe('$0.00/M');
    });
  });

  describe('isFreeModel', () => {
    it('returns true for openrouter free models', () => {
      expect(modelsSync.isFreeModel('model:free', 'openrouter')).toBe(true);
    });
    it('returns false for non-free openrouter models', () => {
      expect(modelsSync.isFreeModel('gpt-4', 'openrouter')).toBe(false);
    });
    it('returns true for ollama', () => {
      expect(modelsSync.isFreeModel('llama3', 'ollama')).toBe(true);
    });
    it('returns true for lmstudio', () => {
      expect(modelsSync.isFreeModel('model', 'lmstudio')).toBe(true);
    });
    it('returns false for paid providers', () => {
      expect(modelsSync.isFreeModel('gpt-4', 'openai')).toBe(false);
    });
  });

  describe('modelSupports', () => {
    it('checks vision', () => {
      expect(modelsSync.modelSupports({ id: 'x', supportsVision: true }, 'vision')).toBe(true);
      expect(modelsSync.modelSupports({ id: 'x' }, 'vision')).toBe(false);
    });
    it('checks streaming defaults to true', () => {
      expect(modelsSync.modelSupports({ id: 'x' }, 'streaming')).toBe(true);
    });
    it('checks tool-calling with detection fallback', () => {
      expect(modelsSync.modelSupports({ id: 'gpt-4' }, 'tool-calling')).toBe(true);
    });
    it('checks json always true', () => {
      expect(modelsSync.modelSupports({ id: 'x' }, 'json')).toBe(true);
    });
  });

  describe('getModelDisplayName', () => {
    it('returns name with provider', () => {
      expect(modelsSync.getModelDisplayName({ id: 'x', name: 'GPT-4' }, 'OpenAI')).toBe('GPT-4 (OpenAI)');
    });
    it('returns name without provider', () => {
      expect(modelsSync.getModelDisplayName({ id: 'x', name: 'GPT-4' })).toBe('GPT-4');
    });
    it('falls back to id when no name', () => {
      expect(modelsSync.getModelDisplayName({ id: 'gpt-4' })).toBe('gpt-4');
    });
  });

  describe('getModelMetadata', () => {
    it('returns metadata for known model', () => {
      const meta = modelsSync.getModelMetadata('openai', 'gpt-5.1');
      expect(meta).not.toBeNull();
      expect(meta!.supportsToolCalling).toBe(true);
    });
    it('returns null for unknown model', () => {
      expect(modelsSync.getModelMetadata('openai', 'nonexistent')).toBeNull();
    });
  });

  describe('applyKnownMetadata', () => {
    it('applies known metadata', () => {
      const result = modelsSync.applyKnownMetadata({ id: 'gpt-5.1', name: 'GPT-5.1' }, 'openai');
      expect(result.supportsToolCalling).toBe(true);
      expect(result.pricing).toBeDefined();
    });
    it('falls back to enrichment for unknown models', () => {
      const result = modelsSync.applyKnownMetadata({ id: 'unknown-model', name: 'Unknown' }, 'openai');
      expect(result.family).toBeDefined();
    });
    it('preserves existing values over metadata', () => {
      const result = modelsSync.applyKnownMetadata(
        { id: 'gpt-5.1', name: 'GPT-5.1', supportsToolCalling: false },
        'openai'
      );
      expect(result.supportsToolCalling).toBe(false);
    });
  });

  describe('applyKnownMetadataToAll', () => {
    it('applies to array of models', () => {
      const result = modelsSync.applyKnownMetadataToAll(
        [{ id: 'gpt-5.1', name: 'GPT-5.1' }, { id: 'unknown', name: 'Unknown' }],
        'openai'
      );
      expect(result).toHaveLength(2);
      expect(result[0].supportsToolCalling).toBe(true);
    });
  });

  describe('getProviderModelMetadata', () => {
    it('returns empty object', () => {
      expect(modelsSync.getProviderModelMetadata('openai')).toEqual({});
    });
  });

  describe('KNOWN_MODEL_METADATA', () => {
    it('has entries for all provider types', () => {
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('gemini');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('openai');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('anthropic');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('zai');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('cerebras');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('ollama');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('lmstudio');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('openrouter');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('minimax');
      expect(modelsSync.KNOWN_MODEL_METADATA).toHaveProperty('custom');
    });
  });
});
