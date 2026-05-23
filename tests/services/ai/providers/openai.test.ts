import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../../../services/ai/providers/openai';
import type { ProviderConfig } from '../../../../services/ai/types';

vi.mock('../../../../services/ai/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
  TIMEOUT_TEST_CONNECTION: 30000,
  TIMEOUT_GENERATE: 300000,
  TIMEOUT_LIST_MODELS: 30000,
}));

vi.mock('../../../../services/ai/utils/errorHandling', () => ({
  throwIfNotOk: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../services/ai/utils/jsonOutput', () => ({
  prepareJsonRequest: vi.fn().mockReturnValue({
    systemInstruction: 'sys', useNativeSchema: false, useJsonObject: false, capability: {}, parse: vi.fn(),
  }),
}));

vi.mock('../../../../services/ai/utils/streamParser', () => ({
  processSSEStream: vi.fn().mockResolvedValue({ fullText: 'hello', usage: undefined }),
  createEstimatedUsage: vi.fn().mockReturnValue({ inputTokens: 10, outputTokens: 5, isEstimated: true }),
}));

vi.mock('../../../../services/ai/utils/toolUtils', () => ({
  parseToolArguments: vi.fn((s: string) => { try { return JSON.parse(s); } catch { return {}; } }),
  formatToolError: vi.fn((n: string, e: unknown) => `Tool "${n}" failed: ${e instanceof Error ? e.message : String(e)}`),
}));

const config: ProviderConfig = {
  id: 'test-openai', type: 'openai', name: 'OpenAI Test',
  apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1',
  models: [{ id: 'gpt-4', name: 'GPT-4' }],
  defaultModel: 'gpt-4',
};

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
    expect(provider.config.type).toBe('openai');
  });

  it('returns correct API endpoint', () => {
    expect((provider as any).getApiEndpoint()).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('returns correct models endpoint', () => {
    expect((provider as any).getModelsEndpoint()).toBe('https://api.openai.com/v1/models');
  });

  it('returns correct auth header', () => {
    expect((provider as any).getAuthHeader()).toBe('Bearer sk-test');
  });

  describe('testConnection', () => {
    it('returns success on ok response', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({ ok: true, status: 200 });
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it('returns error on failure', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockRejectedValue(new Error('Connection failed'));
      const result = await provider.testConnection();
      expect(result.success).toBe(false);
    });
  });

  describe('generate', () => {
    it('generates response successfully', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });
      const result = await provider.generate({ prompt: 'Hi' }, 'gpt-4');
      expect(result.text).toBe('Hello!');
      expect(result.finishReason).toBe('stop');
    });

    it('uses JSON schema when responseFormat is json with schema', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"key":"val"}' }, finish_reason: 'stop' }],
          usage: {},
        }),
      });
      const result = await provider.generate({
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: { type: 'object', properties: { key: { type: 'string' } } },
      }, 'gpt-4');
      expect(result.text).toBe('{"key":"val"}');
    });
  });

  describe('listModels', () => {
    it('lists models from API', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          data: [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
          ],
        }),
      });
      const models = await provider.listModels!();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('gpt-4');
    });
  });
});
