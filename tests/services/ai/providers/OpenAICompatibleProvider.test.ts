import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider, OpenAIProviderImpl, CerebrasProviderImpl, LMStudioProviderImpl } from '../../../../services/ai/providers/base/OpenAICompatibleProvider';
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
  processSSEStream: vi.fn().mockResolvedValue({ fullText: 'response text', usage: { inputTokens: 5, outputTokens: 3 } }),
  createEstimatedUsage: vi.fn().mockReturnValue({ inputTokens: 10, outputTokens: 5, isEstimated: true }),
}));

vi.mock('../../../../services/ai/utils/toolUtils', () => ({
  parseToolArguments: vi.fn((s: string) => { try { return JSON.parse(s); } catch { return {}; } }),
  formatToolError: vi.fn((n: string, e: unknown) => `Tool "${n}" failed: ${e instanceof Error ? e.message : String(e)}`),
}));

const config: ProviderConfig = {
  id: 'test', type: 'openai', name: 'Test',
  apiKey: 'key', baseUrl: 'https://api.test.com/v1',
  models: [{ id: 'model-1', name: 'Model 1' }],
  defaultModel: 'model-1',
};

describe('OpenAICompatibleProvider', () => {
  describe('OpenAIProviderImpl', () => {
    let provider: OpenAIProviderImpl;

    beforeEach(() => {
      provider = new OpenAIProviderImpl(config);
      vi.clearAllMocks();
    });

    it('returns correct endpoints', () => {
      expect((provider as any).getApiEndpoint()).toBe('https://api.test.com/v1/chat/completions');
      expect((provider as any).getModelsEndpoint()).toBe('https://api.test.com/v1/models');
    });

    it('returns Bearer token auth', () => {
      expect((provider as any).getAuthHeader()).toBe('Bearer key');
    });

    it('defaults to 16384 max tokens', () => {
      expect((provider as any).getDefaultMaxTokens()).toBe(16384);
    });

    it('returns empty additional headers by default', () => {
      expect((provider as any).getAdditionalHeaders()).toEqual({});
    });

    it('returns config headers when set', () => {
      const cfg = { ...config, headers: { 'X-Custom': 'val' } };
      const p = new OpenAIProviderImpl(cfg);
      expect((p as any).getAdditionalHeaders()).toEqual({ 'X-Custom': 'val' });
    });

    describe('testConnection', () => {
      it('returns success on ok', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({ ok: true, status: 200 });
        expect(await provider.testConnection()).toEqual({ success: true });
      });

      it('returns error on non-ok', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({ ok: false, status: 401 });
        const result = await provider.testConnection();
        expect(result.success).toBe(false);
      });

      it('returns error on exception', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockRejectedValue(new Error('Network'));
        const result = await provider.testConnection();
        expect(result.success).toBe(false);
      });
    });

    describe('generate', () => {
      it('generates text response', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({
          ok: true, status: 200,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        });
        const result = await provider.generate({ prompt: 'Hi' }, 'model-1');
        expect(result.text).toBe('Hello!');
        expect(result.finishReason).toBe('stop');
        expect(result.usage?.inputTokens).toBe(10);
      });
    });

    describe('generateStream', () => {
      it('streams without tools', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({ ok: true, status: 200 });
        const result = await provider.generateStream({ prompt: 'Hi' }, 'model-1', vi.fn());
        expect(result.text).toBe('response text');
      });
    });

    describe('listModels', () => {
      it('lists models from API', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({
          ok: true, status: 200,
          json: () => Promise.resolve({ data: [{ id: 'model-1' }] }),
        });
        const models = await provider.listModels();
        expect(models).toHaveLength(1);
      });

      it('throws on non-ok response', async () => {
        const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
        (fetchWithTimeout as any).mockResolvedValue({ ok: false, status: 500 });
        await expect(provider.listModels()).rejects.toThrow('HTTP 500');
      });
    });

    describe('buildMessages', () => {
      it('includes system instruction', () => {
        const msgs = (provider as any).buildMessages({ prompt: 'Hi', systemInstruction: 'Sys' });
        expect(msgs[0].role).toBe('system');
      });

      it('includes conversation history', () => {
        const msgs = (provider as any).buildMessages({
          prompt: 'Hi',
          conversationHistory: [{ role: 'user', content: 'Prev' }],
        });
        expect(msgs.some((m: any) => m.content === 'Prev')).toBe(true);
      });

      it('wraps images as content parts', () => {
        const msgs = (provider as any).buildMessages({
          prompt: 'Describe',
          images: [{ data: 'img1', mimeType: 'image/png' }],
        });
        const userMsg = msgs[msgs.length - 1];
        expect(Array.isArray(userMsg.content)).toBe(true);
        expect(userMsg.content.length).toBe(2); // image + text
      });

      it('handles json response format', () => {
        const msgs = (provider as any).buildMessages({
          prompt: 'JSON',
          responseFormat: 'json',
          systemInstruction: 'Base',
        });
        // prepareJsonRequest is mocked, so it returns 'sys'
        expect(msgs[0].content).toBe('sys');
      });
    });

    describe('buildRequestBody', () => {
      it('includes tools when provided', () => {
        const body = (provider as any).buildRequestBody('model-1', [], {
          tools: [{ name: 'test', parameters: {} }],
          toolChoice: 'auto',
        });
        expect(body.tools).toBeDefined();
        expect(body.tool_choice).toBe('auto');
      });

      it('normalizes function tool choice', () => {
        const body = (provider as any).buildRequestBody('model-1', [], {
          tools: [{ name: 'test', parameters: {} }],
          toolChoice: { type: 'function', name: 'test' },
        });
        expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'test' } });
      });

      it('sets stream option', () => {
        const body = (provider as any).buildRequestBody('model-1', [], { stream: true });
        expect(body.stream).toBe(true);
      });
    });

    describe('applyJsonFormat', () => {
      it('skips when not json format', () => {
        const body: any = {};
        (provider as any).applyJsonFormat(body, { responseFormat: 'text' });
        expect(body.response_format).toBeUndefined();
      });

      it('sets json_schema when native', async () => {
        const { prepareJsonRequest } = await import('../../../../services/ai/utils/jsonOutput');
        (prepareJsonRequest as any).mockReturnValueOnce({
          systemInstruction: 'sys', useNativeSchema: true, useJsonObject: false, capability: {}, parse: vi.fn(),
        });
        const body: any = {};
        (provider as any).applyJsonFormat(body, {
          responseFormat: 'json',
          responseSchema: { type: 'object' },
        });
        expect(body.response_format.type).toBe('json_schema');
      });

      it('sets json_object when json mode', async () => {
        const { prepareJsonRequest } = await import('../../../../services/ai/utils/jsonOutput');
        (prepareJsonRequest as any).mockReturnValueOnce({
          systemInstruction: 'sys', useNativeSchema: false, useJsonObject: true, capability: {}, parse: vi.fn(),
        });
        const body: any = {};
        (provider as any).applyJsonFormat(body, { responseFormat: 'json' });
        expect(body.response_format.type).toBe('json_object');
      });
    });
  });

  describe('CerebrasProviderImpl', () => {
    it('returns correct endpoints', () => {
      const p = new CerebrasProviderImpl(config);
      expect((p as any).getApiEndpoint()).toContain('chat/completions');
      expect((p as any).getDefaultMaxTokens()).toBe(8192);
    });
  });

  describe('LMStudioProviderImpl', () => {
    it('returns correct endpoints', () => {
      const p = new LMStudioProviderImpl(config);
      expect((p as any).getModelsEndpoint()).toContain('api/tags');
      expect((p as any).getAuthHeader()).toBe('Bearer key');
    });

    it('returns empty auth when no key', () => {
      const p = new LMStudioProviderImpl({ ...config, apiKey: '' });
      expect((p as any).getAuthHeader()).toBe('');
    });

    it('maps models by name', () => {
      const p = new LMStudioProviderImpl(config);
      const m = (p as any).mapModel({ name: 'llama3' });
      expect(m.id).toBe('llama3');
    });
  });
});
