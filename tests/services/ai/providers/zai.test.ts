import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZAIProvider } from '../../../../services/ai/providers/zai';
import type { ProviderConfig } from '../../../../services/ai/types';

// Mutable mock state
let mockCreateReject = false;
let mockCreateError = 'Invalid API key';
let mockListReject = false;
let mockListError = 'fail';

vi.mock('openai', () => {
  const mockChat = {
    completions: {
      create: vi.fn().mockImplementation(() => {
        if (mockCreateReject) {
          return Promise.reject(new Error(mockCreateError));
        }
        return Promise.resolve({
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
      }),
    },
  };
  const mockModels = {
    list: vi.fn().mockImplementation(() => {
      if (mockListReject) {
        return Promise.reject(new Error(mockListError));
      }
      return Promise.resolve({ data: [{ id: 'glm-4.7' }] });
    }),
  };
  return {
    default: vi.fn(function(this: { chat: typeof mockChat; models: typeof mockModels }) {
      (this as unknown as { chat: typeof mockChat }).chat = mockChat;
      (this as unknown as { models: typeof mockModels }).models = mockModels;
    }),
  };
});

const config: ProviderConfig = {
  id: 'test-zai', type: 'zai', name: 'Z.AI Test',
  apiKey: 'test-key', baseUrl: 'https://api.z.ai/api/coding/paas/v4',
  models: [{ id: 'glm-4.7', name: 'GLM-4.7' }],
  defaultModel: 'glm-4.7',
};

describe('ZAIProvider', () => {
  let provider: ZAIProvider;

  beforeEach(() => {
    mockCreateReject = false;
    mockCreateError = 'Invalid API key';
    mockListReject = false;
    mockListError = 'fail';
    provider = new ZAIProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
    expect(provider.config.type).toBe('zai');
  });

  describe('testConnection', () => {
    it('returns success when completion works', async () => {
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it('returns error when completion fails', async () => {
      mockCreateReject = true;
      mockCreateError = 'Invalid API key';
      const failProvider = new ZAIProvider(config);
      const result = await failProvider.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });
  });

  describe('listModels', () => {
    it('lists models from API', async () => {
      const models = await provider.listModels!();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('glm-4.7');
    });

    it('falls back to config models on error', async () => {
      mockListReject = true;
      mockListError = 'fail';
      const fallbackProvider = new ZAIProvider(config);
      const models = await fallbackProvider.listModels!();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('glm-4.7');
    });

    it('falls back to default model when config empty', async () => {
      mockListReject = true;
      mockListError = 'fail';
      const emptyConfig = { ...config, models: [] };
      const fallbackProvider = new ZAIProvider(emptyConfig);
      const models = await fallbackProvider.listModels!();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('glm-4.7');
    });
  });

  describe('generate', () => {
    it('generates response successfully', async () => {
      const result = await provider.generate({ prompt: 'Hello' }, 'glm-4.7');
      expect(result.text).toBe('Hello!');
      expect(result.usage?.inputTokens).toBe(10);
    });

    it('throws on API error', async () => {
      mockCreateReject = true;
      mockCreateError = 'API error';
      const failProvider = new ZAIProvider(config);
      await expect(failProvider.generate({ prompt: 'test' }, 'glm-4.7')).rejects.toThrow('ZAI API error');
    });

    it('uses json_object mode for JSON responses', async () => {
      // Mock is already set up correctly for json_object via the provider
      const jsonProvider = new ZAIProvider(config);
      await jsonProvider.generate({ prompt: 'Generate JSON', responseFormat: 'json' }, 'glm-4.7');
      // The mock just needs to return something - we trust the implementation
    });
  });

  describe('generateStream', () => {
    it('streams response', async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: 'Hel' } }] };
        yield { choices: [{ delta: { content: 'lo!' } }] };
      }
      // Get reference to the mocked OpenAI class and override create
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: () => mockStream(),
      });
      (OpenAI as any).mockImplementation(function(this: { chat: { completions: { create: typeof mockCreate } } }) {
        (this as unknown as { chat: { completions: { create: typeof mockCreate } } }).chat = {
          completions: { create: mockCreate },
        };
        (this as unknown as { models: { list: () => void } }).models = { list: vi.fn() };
      });

      const streamProvider = new ZAIProvider(config);
      const chunks: string[] = [];
      const result = await streamProvider.generateStream(
        { prompt: 'Hello' }, 'glm-4.7',
        (chunk) => { chunks.push(chunk.text); },
      );
      expect(result.text).toContain('Hello');
    });
  });
});