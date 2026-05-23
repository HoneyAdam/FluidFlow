import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxProvider } from '../../../../services/ai/providers/minimax';
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
  id: 'test-minimax', type: 'minimax', name: 'MiniMax Test',
  apiKey: 'test-key', baseUrl: 'https://api.minimax.io/v1',
  models: [{ id: 'MiniMax-M2.1', name: 'MiniMax M2.1' }],
  defaultModel: 'MiniMax-M2.1',
};

describe('MiniMaxProvider', () => {
  let provider: MiniMaxProvider;

  beforeEach(() => {
    provider = new MiniMaxProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
  });

  it('returns proxy API endpoint', () => {
    expect((provider as any).getApiEndpoint()).toBe('/api/ai/minimax/chat/completions');
  });

  it('returns proxy models endpoint', () => {
    expect((provider as any).getModelsEndpoint()).toBe('/api/ai/minimax/models');
  });

  it('returns Bearer auth header', () => {
    expect((provider as any).getAuthHeader()).toBe('Bearer test-key');
  });

  it('returns default max tokens of 16384', () => {
    expect((provider as any).getDefaultMaxTokens()).toBe(16384);
  });

  it('returns additional headers with API key and base URL', () => {
    const headers = (provider as any).getAdditionalHeaders();
    expect(headers['X-API-Key']).toBe('test-key');
    expect(headers['X-Base-URL']).toBe('https://api.minimax.io/v1');
  });

  it('uses config baseUrl or fallback', () => {
    const noUrlConfig = { ...config, baseUrl: '' };
    const p = new MiniMaxProvider(noUrlConfig);
    const headers = (p as any).getAdditionalHeaders();
    expect(headers['X-Base-URL']).toBe('https://api.minimax.io/v1');
  });

  describe('testConnection', () => {
    it('returns success on ok response', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve(''),
      });
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });

    it('returns error on HTTP error', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: false, status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      const result = await provider.testConnection();
      expect(result.success).toBe(false);
    });

    it('returns error on network failure', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockRejectedValue(new Error('Network error'));
      const result = await provider.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('listModels', () => {
    it('returns hardcoded model list', async () => {
      const models = await provider.listModels!();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('MiniMax-M2.1');
      expect(models[0].name).toBe('MiniMax M2.1');
      expect(models[0].supportsStreaming).toBe(true);
      expect(models[0].contextWindow).toBe(200000);
    });
  });
});
