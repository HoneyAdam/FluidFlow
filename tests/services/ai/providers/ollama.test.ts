import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../../../../services/ai/providers/ollama';
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

vi.mock('../../../../services/ai/utils/streamParser', () => ({
  processSSEStream: vi.fn().mockResolvedValue({ fullText: 'streamed text' }),
}));

vi.mock('../../../../services/ai/utils/toolUtils', () => ({
  parseToolArguments: vi.fn((s: string) => { try { return JSON.parse(s); } catch { return {}; } }),
}));

const config: ProviderConfig = {
  id: 'test-ollama', type: 'ollama', name: 'Ollama Test',
  baseUrl: 'http://localhost:11434',
  models: [], defaultModel: 'llama3',
};

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
    expect(provider.config.type).toBe('ollama');
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
    it('generates response using /api/generate', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ response: 'Hello!', prompt_eval_count: 10, eval_count: 5 }),
      });
      const result = await provider.generate({ prompt: 'Hi' }, 'llama3');
      expect(result.text).toBe('Hello!');
      expect(result.usage?.inputTokens).toBe(10);
    });

    it('uses /api/chat when tools are provided', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          message: { content: 'Tool response' },
          prompt_eval_count: 10, eval_count: 5,
        }),
      });
      const result = await provider.generate({
        prompt: 'Use tool',
        tools: [{ name: 'test', description: 'A test tool', parameters: {} }],
        toolExecutor: vi.fn(),
      }, 'llama3');
      expect(result.text).toBe('Tool response');
      const callUrl = (fetchWithTimeout as any).mock.calls[0][0];
      expect(callUrl).toContain('/api/chat');
    });

    it('includes conversation history in prompt', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ response: 'ok' }),
      });
      await provider.generate({
        prompt: 'Follow up',
        conversationHistory: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
      }, 'llama3');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.prompt).toContain('First question');
      expect(body.prompt).toContain('Follow up');
    });

    it('includes system instruction', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ response: 'ok' }),
      });
      await provider.generate({
        prompt: 'Hi', systemInstruction: 'You are helpful',
      }, 'llama3');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.system).toBe('You are helpful');
    });

    it('includes images', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ response: 'I see an image' }),
      });
      await provider.generate({
        prompt: 'What is this?',
        images: [{ data: 'base64img', mimeType: 'image/png' }],
      }, 'llava');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.images).toEqual(['base64img']);
    });

    it('adds JSON schema instruction to system', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ response: '{"key":"val"}' }),
      });
      await provider.generate({
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: { type: 'object', properties: { key: { type: 'string' } } },
      }, 'llama3');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.system).toContain('JSON');
    });
  });

  describe('generateStream', () => {
    it('streams using /api/generate', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({ ok: true, status: 200 });
      const result = await provider.generateStream({ prompt: 'Hi' }, 'llama3', vi.fn());
      expect(result.text).toBe('streamed text');
    });
  });

  describe('listModels', () => {
    it('lists models from /api/tags', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          models: [
            { name: 'llama3:latest', size: 4661224676 },
            { name: 'llava:latest', size: 6700000000 },
          ],
        }),
      });
      const models = await provider.listModels!();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama3:latest');
      expect(models[1].supportsVision).toBe(true); // llava has vision
    });
  });
});
