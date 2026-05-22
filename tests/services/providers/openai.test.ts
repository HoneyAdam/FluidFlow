/**
 * OpenAI Provider Tests
 *
 * Comprehensive tests for OpenAI provider including
 * connection testing, generation, streaming, and model listing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../services/ai/providers/openai';
import type { ProviderConfig, GenerationRequest } from '../../../services/ai/types';

// Mock fetchWithTimeout
vi.mock('../../../services/ai/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
  TIMEOUT_TEST_CONNECTION: 5000,
  TIMEOUT_GENERATE: 120000,
  TIMEOUT_LIST_MODELS: 10000,
}));

// Mock other dependencies
vi.mock('../../../services/ai/utils/jsonOutput', () => ({
  prepareJsonRequest: vi.fn((type, sysInstruction) => ({
    systemInstruction: sysInstruction,
    useNativeSchema: type === 'openai' || type === 'openrouter',
    useJsonObject: true,
  })),
}));

vi.mock('../../../services/ai/utils/errorHandling', () => ({
  throwIfNotOk: vi.fn(),
}));

vi.mock('../../../services/ai/utils/streamParser', () => ({
  processSSEStream: vi.fn(),
  createEstimatedUsage: vi.fn(() => ({
    inputTokens: 100,
    outputTokens: 50,
  })),
}));

import { fetchWithTimeout } from '../../../services/ai/utils/fetchWithTimeout';
import { throwIfNotOk } from '../../../services/ai/utils/errorHandling';
import { processSSEStream, createEstimatedUsage } from '../../../services/ai/utils/streamParser';

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);
const mockThrowIfNotOk = vi.mocked(throwIfNotOk);
const mockProcessSSEStream = vi.mocked(processSSEStream);
const mockCreateEstimatedUsage = vi.mocked(createEstimatedUsage);

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      id: 'test-openai',
      type: 'openai',
      name: 'Test OpenAI',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com/v1',
      headers: {},
      models: [{ id: 'gpt-4', name: 'GPT-4' }],
      defaultModel: 'gpt-4',
    };

    provider = new OpenAIProvider(config);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      expect(provider.config).toBe(config);
    });
  });

  describe('testConnection', () => {
    it('should return success when connection is valid', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const result = await provider.testConnection();

      expect(result).toEqual({ success: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );
    });

    it('should return error when response is not ok', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 401');
    });

    it('should return error when fetch throws', async () => {
      mockFetchWithTimeout.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
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
      const mockResponse = {
        choices: [{ message: { content: 'Generated text' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      };

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Test prompt',
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await provider.generate(request, 'gpt-4');

      expect(result.text).toBe('Generated text');
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });

    it('should include system instruction', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Test',
        systemInstruction: 'You are a helpful assistant',
      };

      await provider.generate(request, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.messages[0].role).toBe('system');
      expect(callBody.messages[0].content).toBe('You are a helpful assistant');
    });

    it('should include conversation history', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Test',
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      await provider.generate(request, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.messages).toHaveLength(3); // history + current
      expect(callBody.messages[0].role).toBe('user');
      expect(callBody.messages[0].content).toBe('Hello');
    });

    it('should handle images in request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Image description' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Describe this image',
        images: [{ data: 'base64data', mimeType: 'image/png' }],
      };

      await provider.generate(request, 'gpt-4-vision');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      const userMessage = callBody.messages[0];
      expect(userMessage.content).toBeInstanceOf(Array);
      expect(userMessage.content[0].type).toBe('image_url');
      expect(userMessage.content[0].image_url.url).toBe('data:image/png;base64,base64data');
    });

    it('should add response_format for json mode', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"key": "value"}' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
      };

      await provider.generate(request, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.response_format).toBeDefined();
    });

    it('should use json_schema when responseSchema is provided', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"name": "test"}' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Generate JSON',
        responseFormat: 'json',
        responseSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      };

      await provider.generate(request, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.response_format.type).toBe('json_schema');
    });

    it('should use default values for maxTokens and temperature', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      } as Response);

      const request: GenerationRequest = {
        prompt: 'Test',
      };

      await provider.generate(request, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.max_tokens).toBe(16384);
      expect(callBody.temperature).toBe(0.7);
    });

    it('should include custom headers', async () => {
      const customConfig = {
        ...config,
        headers: { 'X-Custom-Header': 'custom-value' },
      };
      const customProvider = new OpenAIProvider(customConfig);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      } as Response);

      await customProvider.generate({ prompt: 'Test' }, 'gpt-4');

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).toBeDefined();
      const callHeaders = firstCall![1]?.headers as Record<string, string>;
      expect(callHeaders['X-Custom-Header']).toBe('custom-value');
    });

    it('should call throwIfNotOk for error handling', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
          }),
      } as Response);

      await provider.generate({ prompt: 'Test' }, 'gpt-4');

      expect(mockThrowIfNotOk).toHaveBeenCalledWith(expect.anything(), 'openai');
    });

    it('should handle empty response choices', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [],
            usage: {},
          }),
      } as Response);

      const result = await provider.generate({ prompt: 'Test' }, 'gpt-4');

      expect(result.text).toBe('');
    });
  });

  describe('generateStream', () => {
    it('should stream text generation', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      } as Response);

      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Streamed response',
        usage: { inputTokens: 50, outputTokens: 100 },
      });

      const onChunk = vi.fn();
      const request: GenerationRequest = {
        prompt: 'Test streaming',
      };

      const result = await provider.generateStream(request, 'gpt-4', onChunk);

      expect(result.text).toBe('Streamed response');
      expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 100 });
      expect(mockProcessSSEStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          format: 'openai',
          onChunk,
        })
      );
    });

    it('should include stream options in request body', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      } as Response);

      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Response',
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      await provider.generateStream({ prompt: 'Test' }, 'gpt-4', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.stream).toBe(true);
      expect(callBody.stream_options).toEqual({ include_usage: true });
    });

    it('should estimate usage when not provided by API', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      } as Response);

      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Response without usage',
        usage: undefined,
      });

      mockCreateEstimatedUsage.mockReturnValueOnce({
        inputTokens: 100,
        outputTokens: 50,
        isEstimated: true,
      } as { inputTokens: number; outputTokens: number; isEstimated: true });

      const result = await provider.generateStream({ prompt: 'Test' }, 'gpt-4', vi.fn());

      expect(mockCreateEstimatedUsage).toHaveBeenCalled();
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, isEstimated: true });
    });

    it('should handle images in streaming request', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      } as Response);

      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Image description',
        usage: { inputTokens: 200, outputTokens: 50 },
      });

      const request: GenerationRequest = {
        prompt: 'Describe this',
        images: [{ data: 'imagebase64', mimeType: 'image/jpeg' }],
      };

      await provider.generateStream(request, 'gpt-4-vision', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      const userMessage = callBody.messages[0];
      expect(userMessage.content[0].type).toBe('image_url');
    });

    it('should include conversation history in streaming', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        body: {},
      } as Response);

      mockProcessSSEStream.mockResolvedValueOnce({
        fullText: 'Response',
        usage: { inputTokens: 50, outputTokens: 20 },
      });

      const request: GenerationRequest = {
        prompt: 'Continue',
        conversationHistory: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ],
      };

      await provider.generateStream(request, 'gpt-4', vi.fn());

      const firstCall = mockFetchWithTimeout.mock.calls[0];
      expect(firstCall).not.toBeUndefined();
      const callBody = JSON.parse(firstCall![1]?.body as string);
      expect(callBody.messages).toHaveLength(3);
    });
  });

  describe('listModels', () => {
    it('should list OpenAI models', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'whisper-1' }],
          }),
      } as Response);

      const models = await provider.listModels();

      expect(models).toHaveLength(2); // Only gpt models
      const firstModel = models[0];
      const secondModel = models[1];
      expect(firstModel).toBeDefined();
      expect(secondModel).toBeDefined();
      expect(firstModel!.id).toBe('gpt-4');
      expect(secondModel!.id).toBe('gpt-3.5-turbo');
    });

    it('should include o1 models', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'o1-preview' }, { id: 'o1-mini' }],
          }),
      } as Response);

      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      const firstModel = models[0];
      expect(firstModel).toBeDefined();
      expect(firstModel!.supportsStreaming).toBe(false); // o1 doesn't support streaming
    });

    it('should list OpenRouter models with different structure', async () => {
      const openRouterConfig: ProviderConfig = {
        id: 'test-openrouter',
        type: 'openrouter',
        name: 'Test OpenRouter',
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        headers: {},
        models: [],
        defaultModel: 'anthropic/claude-3',
      };
      const openRouterProvider = new OpenAIProvider(openRouterConfig);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'anthropic/claude-3',
                name: 'Claude 3',
                description: 'Advanced AI model',
                context_length: 100000,
                architecture: { modality: 'text+image' },
              },
              {
                id: 'openai/gpt-4:free',
                name: 'GPT-4 Free',
              },
            ],
          }),
      } as Response);

      const models = await openRouterProvider.listModels();

      expect(models).toHaveLength(1); // Free tier filtered out
      const firstModel = models[0];
      expect(firstModel).toBeDefined();
      expect(firstModel!.id).toBe('anthropic/claude-3');
      expect(firstModel!.name).toBe('Claude 3');
      expect(firstModel!.supportsVision).toBe(true);
      expect(firstModel!.contextWindow).toBe(100000);
    });

    it('should throw on HTTP error', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(provider.listModels()).rejects.toThrow('HTTP 500');
    });

    it('should handle empty model list', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const models = await provider.listModels();

      expect(models).toHaveLength(0);
    });

    it('should limit OpenRouter models to 100', async () => {
      const openRouterConfig: ProviderConfig = {
        id: 'test-openrouter-2',
        type: 'openrouter',
        name: 'Test OpenRouter 2',
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        headers: {},
        models: [],
        defaultModel: 'model-0',
      };
      const openRouterProvider = new OpenAIProvider(openRouterConfig);

      // Create 150 models
      const manyModels = Array.from({ length: 150 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
      }));

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: manyModels }),
      } as Response);

      const models = await openRouterProvider.listModels();

      expect(models.length).toBeLessThanOrEqual(100);
    });
  });
});
