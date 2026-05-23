import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../../../../services/ai/providers/anthropic';
import type { ProviderConfig } from '../../../../services/ai/types';

vi.mock('../../../../services/ai/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
  TIMEOUT_TEST_CONNECTION: 30000,
  TIMEOUT_GENERATE: 300000,
}));

vi.mock('../../../../services/ai/utils/errorHandling', () => ({
  throwIfNotOk: vi.fn().mockResolvedValue(undefined),
}));

const config: ProviderConfig = {
  id: 'test-anthropic', type: 'anthropic', name: 'Anthropic Test',
  apiKey: 'sk-ant-test', baseUrl: 'https://api.anthropic.com',
  models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' }],
  defaultModel: 'claude-sonnet-4-5-20250929',
};

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider(config);
    vi.clearAllMocks();
  });

  it('has correct config', () => {
    expect(provider.config).toBe(config);
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
          content: [{ type: 'text', text: 'Hello!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });
      const result = await provider.generate({ prompt: 'Hi' }, 'claude-sonnet-4-5-20250929');
      expect(result.text).toBe('Hello!');
    });

    it('sends system instruction as top-level parameter', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Response' }],
          usage: {},
        }),
      });
      await provider.generate({
        prompt: 'Hello', systemInstruction: 'You are helpful',
      }, 'claude-sonnet-4-5-20250929');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.system).toBe('You are helpful');
    });

    it('handles images in request', async () => {
      const { fetchWithTimeout } = await import('../../../../services/ai/utils/fetchWithTimeout');
      (fetchWithTimeout as any).mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'I see an image' }],
          usage: {},
        }),
      });
      await provider.generate({
        prompt: 'What is this?',
        images: [{ data: 'base64data', mimeType: 'image/png' }],
      }, 'claude-sonnet-4-5-20250929');
      const callArgs = (fetchWithTimeout as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0].type).toBe('image');
    });
  });
});
