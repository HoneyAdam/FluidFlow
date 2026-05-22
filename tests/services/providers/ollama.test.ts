/**
 * Ollama Provider Tests
 *
 * Comprehensive tests for Ollama provider including
 * connection testing, generation, streaming, and model listing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderConfig, GenerationRequest } from '../../../services/ai/types';

// Mock functions - must be hoisted
const { mockFetchWithTimeout, mockThrowIfNotOk, mockProcessSSEStream } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockThrowIfNotOk: vi.fn(),
  mockProcessSSEStream: vi.fn(),
}));

// Mock dependencies
vi.mock('../../../services/ai/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  TIMEOUT_TEST_CONNECTION: 10000,
  TIMEOUT_GENERATE: 120000,
  TIMEOUT_LIST_MODELS: 30000,
}));

vi.mock('../../../services/ai/utils/errorHandling', () => ({
  throwIfNotOk: mockThrowIfNotOk,
}));

vi.mock('../../../services/ai/utils/streamParser', () => ({
  processSSEStream: mockProcessSSEStream,
}));

// Suppress console.log
vi.spyOn(console, 'log').mockImplementation(() => {});

// Import after mocks are set up
import { OllamaProvider } from '../../../services/ai/providers/ollama';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      id: 'test-ollama',
      type: 'ollama',
      name: 'Test Ollama',
      baseUrl: 'http://localhost:11434',
      headers: {},
      models: [{ id: 'llama3.2', name: 'Llama 3.2' }],
      defaultModel: 'llama3.2',
    };

    provider = new OllamaProvider(config);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      expect(provider.config).toBe(config);
    });

    it('should handle missing API key (Ollama does not require API key)', () => {
      const noKeyConfig = { ...config, apiKey: undefined as string | undefined };
      const noKeyProvider = new OllamaProvider(noKeyConfig);
      expect(noKeyProvider.config.apiKey).toBeUndefined();
    });
  });

  describe('testConnection', () => {
    it('should return success when connection is valid', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const result = await provider.testConnection();

      expect(result).toEqual({ success: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('should return error when connection fails', async () => {
      mockFetchWithTimeout.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
    });

    it('should return error when HTTP status is not OK', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500');
    });

    it('should handle non-Error objects in catch', async () => {
      mockFetchWithTimeout.mockRejectedValueOnce('string error');

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed. Is Ollama running?');
    });
  });

  describe('generate', () => {
    it('should generate text with basic request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            response: 'Generated response',
            prompt_eval_count: 10,
            eval_count: 20,
          }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Test prompt',
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await provider.generate(request, 'llama3.2');

      expect(result.text).toBe('Generated response');
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
      });
    });

    it('should include system instruction', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Test',
        systemInstruction: 'You are a helpful assistant',
      };

      await provider.generate(request, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.system).toBe('You are a helpful assistant');
    });

    it('should build prompt from conversation history', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Continue',
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      await provider.generate(request, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.prompt).toContain('User: Hello');
      expect(callBody.prompt).toContain('Assistant: Hi there!');
      expect(callBody.prompt).toContain('User: Continue');
    });

    it('should handle system role in conversation history', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Hello',
        conversationHistory: [{ role: 'system', content: 'You are helpful' }],
      };

      await provider.generate(request, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.prompt).toContain('System: You are helpful');
    });

    it('should handle images for vision models', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Image description' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Describe this image',
        images: [{ data: 'base64imagedata', mimeType: 'image/png' }],
      };

      await provider.generate(request, 'llava');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.images).toEqual(['base64imagedata']);
    });

    it('should include JSON schema in system prompt when requested', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: '{"key": "value"}' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: { type: 'object', properties: { key: { type: 'string' } } },
      };

      await provider.generate(request, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.system).toContain('You MUST respond with valid JSON');
      expect(callBody.system).toContain('"type": "object"');
    });

    it('should append JSON schema to existing system instruction', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: '{"key": "value"}' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        systemInstruction: 'Be helpful',
        responseFormat: 'json',
        responseSchema: { type: 'object' },
      };

      await provider.generate(request, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.system).toContain('Be helpful');
      expect(callBody.system).toContain('You MUST respond with valid JSON');
    });

    it('should handle empty response', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      const result = await provider.generate({ prompt: 'Test' }, 'llama3.2');

      expect(result.text).toBe('');
    });

    it('should use default maxTokens when not provided', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test' }, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.options.num_predict).toBe(4096);
    });

    it('should use default temperature when not provided', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test' }, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.options.temperature).toBe(0.7);
    });

    it('should allow temperature of 0', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test', temperature: 0 }, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.options.temperature).toBe(0);
    });

    it('should set stream to false for non-streaming generate', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Response' }),
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);

      await provider.generate({ prompt: 'Test' }, 'llama3.2');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.stream).toBe(false);
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

      const result = await provider.generateStream(request, 'llama3.2', onChunk);

      expect(result.text).toBe('Streamed response');
      expect(mockProcessSSEStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'ollama',
          onChunk,
        })
      );
    });

    it('should set stream to true in request body', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      });
      mockThrowIfNotOk.mockResolvedValueOnce(undefined);
      mockProcessSSEStream.mockResolvedValueOnce({ fullText: 'Response' });

      await provider.generateStream({ prompt: 'Test' }, 'llama3.2', vi.fn());

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

      await provider.generateStream(request, 'llama3.2', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.prompt).toContain('User: First message');
      expect(callBody.prompt).toContain('Assistant: First response');
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

      await provider.generateStream(request, 'llava', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.images).toEqual(['imagedata']);
    });

    it('should include JSON schema in streaming when requested', async () => {
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

      await provider.generateStream(request, 'llama3.2', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callBody = JSON.parse(firstCall![1]?.body ?? '{}');
      expect(callBody.system).toContain('You MUST respond with valid JSON');
    });
  });

  describe('listModels', () => {
    it('should return list of available models', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama3.2', size: 4200000000 },
              { name: 'llava', size: 8000000000 },
              { name: 'mistral-vision', size: 5000000000 },
            ],
          }),
      });

      const models = await provider.listModels();

      expect(models).toHaveLength(3);
      expect(models[0]).toEqual({
        id: 'llama3.2',
        name: 'llama3.2',
        description: '4.2GB',
        supportsVision: false,
        supportsStreaming: true,
      });
    });

    it('should detect vision models by name', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llava', size: 8000000000 },
              { name: 'bakllava-vision', size: 7000000000 },
            ],
          }),
      });

      const models = await provider.listModels();
      const firstModel = models[0];
      const secondModel = models[1];
      expect(firstModel).toBeDefined();
      expect(secondModel).toBeDefined();
      expect(firstModel!.supportsVision).toBe(true);
      expect(secondModel!.supportsVision).toBe(true);
    });

    it('should handle empty models list', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const models = await provider.listModels();

      expect(models).toEqual([]);
    });

    it('should handle missing models property', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const models = await provider.listModels();

      expect(models).toEqual([]);
    });

    it('should throw error when HTTP status is not OK', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(provider.listModels()).rejects.toThrow('HTTP 500');
    });
  });
});
