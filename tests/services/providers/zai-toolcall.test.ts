/**
 * ZAI Tool Calling - Unit Test with Mocks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZAIProvider } from '../../../services/ai/providers/zai';
import { ProviderConfig } from '../../../services/ai/types';

// Mock the entire OpenAI module.
// Vitest 4 requires constructor implementations to use `function` or `class`
// so that `new MockedOpenAI(...)` is recognised as a constructor call;
// an arrow-function implementation triggers "is not a constructor".
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(function MockOpenAI(this: unknown) {
      return {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: 'Hello! I can help you create a file.',
                },
                finish_reason: 'stop',
              }],
              usage: { prompt_tokens: 10, completion_tokens: 20 },
            }),
          },
          models: {
            list: vi.fn().mockResolvedValue({ data: [] })
          }
        }
      };
    })
  };
});

describe('ZAIProvider Tool Calling', () => {
  let provider: ZAIProvider;
  let mockConfig: ProviderConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      id: 'zai-test',
      type: 'zai',
      name: 'Z.AI',
      baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      apiKey: 'test-key',
      defaultModel: 'glm-4.7',
      models: [],
      toolCallingEnabled: true,
      allowToolWrites: true,
    };
    provider = new ZAIProvider(mockConfig);
  });

  it('should create provider instance', () => {
    expect(provider).toBeDefined();
    expect(provider.config).toEqual(mockConfig);
  });

  it('should handle non-tool calling response', async () => {
    const response = await provider.generate({
      prompt: 'Create a file',
      responseFormat: 'text',
    }, 'glm-4.7');

    expect(response.text).toBeDefined();
    expect(response.finishReason).toBe('stop');
  });

  it('should pass tools to the API request', async () => {
    const tools = [{
      name: 'write_file',
      description: 'Write file',
      parameters: { type: 'object', properties: { path: {}, content: {} }, required: ['path', 'content'] }
    }];

    await provider.generate({
      prompt: 'Create a file',
      responseFormat: 'text',
      tools,
      toolExecutor: async () => ({ success: true, result: {}, id: '1', name: 'write_file' })
    }, 'glm-4.7');

    // Verify the mock was called
    const OpenAI = (await import('openai')).default;
    const createFn = vi.mocked(vi.mocked(OpenAI).mock.results[0]?.value?.chat?.completions?.create);
    expect(createFn).toHaveBeenCalled();
  });

  it('should handle tool calling response with tool_choice required', async () => {
    // Re-mock to return tool_calls
    const OpenAI = (await import('openai')).default;
    const mockInstance = vi.mocked(OpenAI).mock.results[0]?.value;
    const mockCreate = mockInstance?.chat?.completions?.create as ReturnType<typeof vi.fn>;

    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'write_file',
              arguments: '{"path":"test.ts","content":"hello world"}'
            }
          }]
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });

    const toolExecutor = vi.fn().mockResolvedValue({
      success: true,
      result: { written: true },
      id: '1',
      name: 'write_file'
    });

    const response = await provider.generate({
      prompt: 'Create a file at test.ts with hello world',
      responseFormat: 'text',
      tools: [{
        name: 'write_file',
        description: 'Write file',
        parameters: { type: 'object', properties: { path: {}, content: {} }, required: ['path', 'content'] }
      }],
      toolExecutor,
    }, 'glm-4.7');

    // Tool executor should have been called
    expect(toolExecutor).toHaveBeenCalledWith('write_file', { path: 'test.ts', content: 'hello world' });

    // Verify tool_choice was set to 'required' in the request
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tool_choice).toBe('required');
    expect(callArgs.tools).toHaveLength(1);
    console.log('[Test] Response after tool execution:', response.text);
  });
});

describe('ToolCallHandler', () => {
  it('should accumulate tool calls correctly', async () => {
    const { createToolCallHandler } = await import('../../../services/ai/utils/ToolCallHandler');

    const handler = createToolCallHandler();

    // Simulate tool call chunk
    handler.accumulate({
      choices: [{
        delta: {
          tool_calls: [{
            id: 'call_123',
            function: {
              name: 'write_file',
              arguments: '{"path":'
            }
          }]
        }
      }]
    });

    handler.accumulate({
      choices: [{
        delta: {
          tool_calls: [{
            id: 'call_123',
            function: {
              arguments: '"test.ts","content":"hello"}'
            }
          }]
        }
      }]
    });

    handler.accumulate({
      choices: [{
        finish_reason: 'tool_calls'
      }]
    });

    expect(handler.isReadyForExecution()).toBe(true);

    const toolCalls = handler.getAccumulatedToolCalls();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('write_file');
    expect(toolCalls[0].arguments).toBe('{"path":"test.ts","content":"hello"}');
  });

  it('should handle finish_reason tool_calls correctly', async () => {
    const { createToolCallHandler } = await import('../../../services/ai/utils/ToolCallHandler');

    const handler = createToolCallHandler();

    // Send finish_reason separately
    handler.accumulate({
      choices: [{
        delta: {
          tool_calls: [{
            id: 'call_456',
            function: {
              name: 'read_file',
              arguments: '{"path":"src/index.ts"}'
            }
          }]
        }
      }]
    });

    handler.accumulate({
      choices: [{
        finish_reason: 'tool_calls'
      }]
    });

    expect(handler.isReadyForExecution()).toBe(true);
    expect(handler.getFinishReason()).toBe('tool_calls');
  });
});