import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LMStudioProvider } from '../../../../services/ai/providers/lmstudio';
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
  id: 'test-lmstudio', type: 'lmstudio', name: 'LM Studio Test',
  baseUrl: 'http://localhost:1234/v1',
  models: [], defaultModel: '',
};

describe('LMStudioProvider', () => {
  let provider: LMStudioProvider;

  beforeEach(() => {
    provider = new LMStudioProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
  });

  it('returns correct API endpoint', () => {
    expect((provider as any).getApiEndpoint()).toBe('http://localhost:1234/v1/chat/completions');
  });

  it('returns api/tags as models endpoint', () => {
    expect((provider as any).getModelsEndpoint()).toBe('http://localhost:1234/v1/api/tags');
  });

  it('returns empty auth header when no API key', () => {
    expect((provider as any).getAuthHeader()).toBe('');
  });

  it('returns Bearer auth header when API key set', () => {
    const p = new LMStudioProvider({ ...config, apiKey: 'test-key' });
    expect((p as any).getAuthHeader()).toBe('Bearer test-key');
  });

  it('returns default max tokens of 4096', () => {
    expect((provider as any).getDefaultMaxTokens()).toBe(4096);
  });

  it('returns config headers', () => {
    const p = new LMStudioProvider({ ...config, headers: { 'X-Custom': 'test' } });
    expect((p as any).getAdditionalHeaders()).toEqual({ 'X-Custom': 'test' });
  });

  it('maps models with name', () => {
    const mapped = (provider as any).mapModel({ name: 'llama-3' });
    expect(mapped.id).toBe('llama-3');
    expect(mapped.name).toBe('llama-3');
    expect(mapped.description).toBe('Local model');
    expect(mapped.supportsVision).toBe(true);
    expect(mapped.supportsStreaming).toBe(true);
  });
});
