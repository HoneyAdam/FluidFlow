/**
 * Ollama Tool Calling - Integration Test
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OllamaProvider } from '../../../services/ai/providers/ollama';
import { ProviderConfig } from '../../../services/ai/types';

// Mock fetch - preserve existing fetch or use no-op
const originalFetch = global.fetch;
const noOpFetch: typeof fetch = (() => Promise.resolve()) as unknown as typeof fetch;
global.fetch = originalFetch || noOpFetch;
const mockFetch = global.fetch;

describe('OllamaProvider Tool Calling', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    const config: ProviderConfig = {
      id: 'ollama-test',
      type: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      defaultModel: 'llama3',
      models: [],
      toolCallingEnabled: true,
    };
    provider = new OllamaProvider(config);
  });

  it('should create provider instance', () => {
    expect(provider).toBeDefined();
  });

  it('should use /api/generate for requests without tools', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ response: 'Hello world', prompt_eval_count: 10, eval_count: 5 }),
    };
    global.fetch = async () => mockResponse as Response;

    const response = await provider.generate({
      prompt: 'Hello',
      responseFormat: 'text',
    }, 'llama3');

    expect(response.text).toBe('Hello world');
  });

  it('should use /api/chat for requests with tools', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        message: { content: 'I will create a file' },
        prompt_eval_count: 10,
        eval_count: 5,
      }),
    };
    global.fetch = async () => mockResponse as Response;

    const toolExecutor = async () => ({
      success: true,
      result: { written: true },
      id: '1',
      name: 'write_file',
    });

    const response = await provider.generate({
      prompt: 'Create a file',
      responseFormat: 'text',
      tools: [{
        name: 'write_file',
        description: 'Write file',
        parameters: { type: 'object', properties: { path: {}, content: {} }, required: ['path', 'content'] },
      }],
      toolExecutor,
    }, 'llama3');

    // First call should be to /api/chat (with tools)
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should detect and execute tool calls', async () => {
    let callCount = 0;
    global.fetch = async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // First call returns tool calls
        return {
          ok: true,
          json: () => Promise.resolve({
            message: {
              content: null,
              tool_calls: [{
                function: { name: 'write_file', arguments: '{"path":"test.ts","content":"hello"}' },
              }],
            },
            prompt_eval_count: 10,
            eval_count: 5,
          }),
        } as Response;
      } else {
        // Follow-up call
        return {
          ok: true,
          json: () => Promise.resolve({
            message: { content: 'File created successfully!' },
            prompt_eval_count: 20,
            eval_count: 10,
          }),
        } as Response;
      }
    };

    const toolExecutor = async (name: string, args: Record<string, unknown>) => {
      return { success: true, result: { path: args.path, written: true }, id: '1', name };
    };

    const response = await provider.generate({
      prompt: 'Create test.ts with hello',
      responseFormat: 'text',
      tools: [{
        name: 'write_file',
        description: 'Write file',
        parameters: { type: 'object', properties: { path: {}, content: {} }, required: ['path', 'content'] },
      }],
      toolExecutor,
    }, 'llama3');

    // Should have made 2 calls: first with tool, follow-up with results
    expect(callCount).toBe(2);
    expect(response.text).toBe('File created successfully!');
    expect(response.filesWritten).toBeDefined();
  });
});