/**
 * Anthropic Provider Tests
 *
 * Comprehensive tests for Anthropic provider including
 * connection testing, generation, and streaming.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderConfig, GenerationRequest } from '../../../services/ai/types';

// Mock functions - must be hoisted
const { mockFetchWithTimeout, mockThrowIfNotOk, mockProcessSSEStream, mockPrepareJsonRequest } =
  vi.hoisted(() => ({
    mockFetchWithTimeout: vi.fn(),
    mockThrowIfNotOk: vi.fn(),
    mockProcessSSEStream: vi.fn(),
    mockPrepareJsonRequest: vi.fn(),
  }));

// Mock dependencies
vi.mock('../../../services/ai/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  TIMEOUT_TEST_CONNECTION: 10000,
  TIMEOUT_GENERATE: 120000,
}));

vi.mock('../../../services/ai/utils/errorHandling', () => ({
  throwIfNotOk: mockThrowIfNotOk,
}));

vi.mock('../../../services/ai/utils/streamParser', () => ({
  processSSEStream: mockProcessSSEStream,
}));

vi.mock('../../../services/ai/utils/jsonOutput', () => ({
  prepareJsonRequest: mockPrepareJsonRequest,
}));

// Suppress console.log
vi.spyOn(console, 'log').mockImplementation(() => {});

// Import after mocks are set up
import { AnthropicProvider } from '../../../services/ai/providers/anthropic';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      id: 'test-anthropic',
      type: 'anthropic',
      name: 'Test Anthropic',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com',
      headers: {},
      models: [{ id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }],
      defaultModel: 'claude-3-opus-20240229',
    };

    provider = new AnthropicProvider(config);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      expect(provider.config).toBe(config);
    });

    it('should handle empty API key', () => {
      const emptyKeyConfig = { ...config, apiKey: '' };
      const emptyKeyProvider = new AnthropicProvider(emptyKeyConfig);
      expect(emptyKeyProvider.config.apiKey).toBe('');
    });
  });

  describe('testConnection', () => {
    it('should return success when connection is valid', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hi' }] }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const result = await provider.testConnection();

      expect(result).toEqual({ success: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('should return error when connection fails', async () => {
      mockFetchWithTimeout.mockRejectedValueOnce(new Error('API key invalid'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('API key invalid');
    });

    it('should return error when throwIfNotOk throws', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({ ok: false });
      mockThrowIfNotOk.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should handle non-Error objects in catch', async () => {
      mockFetchWithTimeout.mockRejectedValueOnce('string error');

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('generate', () => {
    it('should generate text with basic request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Generated response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Test prompt',
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await provider.generate(request, 'claude-3-opus-20240229');

      expect(result.text).toBe('Generated response');
      expect(result.finishReason).toBe('end_turn');
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
      });
    });

    it('should include system instruction', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Test',
        systemInstruction: 'You are a helpful assistant',
      };

      await provider.generate(request, 'claude-3-opus-20240229');

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"system":"You are a helpful assistant"'),
        })
      );
    });

    it('should include conversation history without system messages', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Continue',
        conversationHistory: [
          { role: 'system', content: 'System message' }, // Should be skipped
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      await provider.generate(request, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      // System message should be skipped in messages array
      expect(callBody.messages).toHaveLength(3); // 2 history + 1 current prompt
      expect(callBody.messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(callBody.messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should handle images in request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Image description' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Describe this image',
        images: [{ data: 'base64imagedata', mimeType: 'image/png' }],
      };

      await provider.generate(request, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      const userMessage = callBody.messages[0];
      expect(userMessage.content).toEqual([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'base64imagedata' },
        },
        { type: 'text', text: 'Describe this image' },
      ]);
    });

    it('should use native JSON schema when supported', async () => {
      mockPrepareJsonRequest.mockReturnValueOnce({
        useNativeSchema: true,
        systemInstruction: 'System with schema',
      });
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: '{"key": "value"}' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: { type: 'object', properties: { key: { type: 'string' } } },
      };

      await provider.generate(request, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.output_format).toEqual({
        type: 'json_schema',
        schema: request.responseSchema,
      });

      // Should include beta header
      const secondCall = mockFetchWithTimeout.mock.calls[0];
      expect(secondCall).toBeDefined();
      const headers = secondCall![1]?.headers as Record<string, string> | undefined;
      expect(headers?.['anthropic-beta']).toBe('structured-outputs-2025-11-13');
    });

    it('should fallback to system instruction for unsupported schemas', async () => {
      mockPrepareJsonRequest.mockReturnValueOnce({
        useNativeSchema: false,
        systemInstruction: 'Original instruction\n\nRespond in JSON format',
      });
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: '{"key": "value"}' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
        systemInstruction: 'Original instruction',
      };

      await provider.generate(request, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.output_format).toBeUndefined();
      expect(callBody.system).toContain('Respond in JSON format');
    });

    it('should handle empty content in response', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const result = await provider.generate({ prompt: 'Test' }, 'claude-3-opus-20240229');

      expect(result.text).toBe('');
    });

    it('should handle missing text content type', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'tool_use', id: 'tool1' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const result = await provider.generate({ prompt: 'Test' }, 'claude-3-opus-20240229');

      expect(result.text).toBe('');
    });

    it('should use default maxTokens when not provided', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test' }, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.max_tokens).toBe(4096);
    });

    it('should use default temperature when not provided', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test' }, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.temperature).toBe(0.7);
    });

    it('should allow temperature of 0', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test', temperature: 0 }, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.temperature).toBe(0);
    });

    it('should include custom headers from config', async () => {
      const customConfig = {
        ...config,
        headers: { 'X-Custom-Header': 'custom-value' },
      };
      const customProvider = new AnthropicProvider(customConfig);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'Response' }],
            usage: {},
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await customProvider.generate({ prompt: 'Test' }, 'claude-3-opus-20240229');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const headers = firstCall![1]?.headers as Record<string, string> | undefined;
      expect(headers?.['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('generateStream', () => {
    it('should stream text generation', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Streamed response',
      });

      const onChunk = vi.fn();
      const request: GenerationRequest = {
        prompt: 'Test streaming',
      };

      const result = await provider.generateStream(request, 'claude-3-opus-20240229', onChunk);

      expect(result.text).toBe('Streamed response');
      expect(mockProcessSSEStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'anthropic',
          onChunk,
        })
      );
    });

    it('should include stream: true in request body', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Response' });

      await provider.generateStream({ prompt: 'Test' }, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.stream).toBe(true);
    });

    it('should include conversation history in streaming', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Response' });

      const request: GenerationRequest = {
        prompt: 'Continue',
        conversationHistory: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ],
      };

      await provider.generateStream(request, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.messages).toHaveLength(3);
      expect(callBody.messages[0]).toEqual({ role: 'user', content: 'First message' });
      expect(callBody.messages[1]).toEqual({ role: 'assistant', content: 'First response' });
    });

    it('should skip system messages in conversation history for streaming', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Response' });

      const request: GenerationRequest = {
        prompt: 'Continue',
        conversationHistory: [
          { role: 'system', content: 'System instruction' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await provider.generateStream(request, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      // System message should be skipped
      expect(callBody.messages).toHaveLength(2); // 1 history + 1 current
      expect(callBody.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should handle images in streaming request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Description' });

      const request: GenerationRequest = {
        prompt: 'Describe this',
        images: [{ data: 'imagedata', mimeType: 'image/jpeg' }],
      };

      await provider.generateStream(request, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      const userMessage = callBody.messages[0];
      expect(userMessage.content).toEqual([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'imagedata' },
        },
        { type: 'text', text: 'Describe this' },
      ]);
    });

    it('should use native JSON schema in streaming when supported', async () => {
      mockPrepareJsonRequest.mockReturnValueOnce({
        useNativeSchema: true,
        systemInstruction: 'System with schema',
      });
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: '{"key": "value"}' });

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: { type: 'object' },
      };

      await provider.generateStream(request, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.output_format).toBeDefined();
      const headers = firstCall![1]?.headers as Record<string, string> | undefined;
      expect(headers?.['anthropic-beta']).toBe('structured-outputs-2025-11-13');
    });

    it('should include system instruction in streaming', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Response' });

      const request: GenerationRequest = {
        prompt: 'Test',
        systemInstruction: 'Be helpful',
      };

      await provider.generateStream(request, 'claude-3-opus-20240229', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.system).toBe('Be helpful');
    });
  });
});
