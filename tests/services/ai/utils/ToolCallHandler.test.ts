import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToolCallHandler,
  createToolCallHandler,
  hasToolCallsInChunk,
  extractToolCallsFromResponse,
  executeSingleToolCall,
} from '../../../../services/ai/utils/ToolCallHandler';
import type { ToolExecutor, ToolResult } from '../../../../services/ai/types';

vi.mock('../../../../services/ai/utils/toolUtils', () => ({
  parseToolArguments: vi.fn((s: string) => { try { return JSON.parse(s); } catch { return {}; } }),
  formatToolError: vi.fn((n: string, e: unknown) => `Tool "${n}" failed: ${e instanceof Error ? e.message : String(e)}`),
}));

describe('ToolCallHandler', () => {
  let handler: ToolCallHandler;

  beforeEach(() => {
    handler = new ToolCallHandler(true);
  });

  describe('accumulate', () => {
    it('accumulates tool calls from streaming chunks', () => {
      const result = handler.accumulate({
        choices: [{
          delta: {
            tool_calls: [{
              id: 'call_1',
              function: { name: 'read_file', arguments: '' },
            }],
          },
          finish_reason: undefined,
        }],
      });
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('read_file');
    });

    it('merges partial arguments for same tool call ID', () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"pa' } }] },
          finish_reason: undefined,
        }],
      });
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'call_1', function: { arguments: 'th":' } }] },
          finish_reason: undefined,
        }],
      });
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'call_1', function: { arguments: '"/src/a.ts"}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const calls = handler.getAccumulatedToolCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].arguments).toBe('{"path":"/src/a.ts"}');
      expect(handler.isReadyForExecution()).toBe(true);
    });

    it('skips tool calls without ID', () => {
      const result = handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: '', function: { name: 'test' } }] },
          finish_reason: undefined,
        }],
      });
      expect(result.toolCalls).toHaveLength(0);
    });

    it('handles chunks with no tool calls', () => {
      const result = handler.accumulate({
        choices: [{ delta: { content: 'Hello' }, finish_reason: undefined }],
      });
      expect(result.toolCalls).toHaveLength(0);
      expect(result.finishReason).toBeUndefined();
    });

    it('tracks finish reason', () => {
      handler.accumulate({
        choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }],
      });
      expect(handler.getFinishReason()).toBe('stop');
    });

    it('detects hasAllContent when finishReason is tool_calls and calls present', () => {
      const result = handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      });
      expect(result.hasAllContent).toBe(true);
    });

    it('hasAllContent is false without tool_calls finishReason', () => {
      const result = handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: undefined,
        }],
      });
      expect(result.hasAllContent).toBe(false);
    });

    it('handles fallback name from tc.name when function.name missing', () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', name: 'fallback_name', arguments: '{}' }] },
          finish_reason: undefined,
        }],
      });
      expect(handler.getAccumulatedToolCalls()[0].name).toBe('fallback_name');
    });
  });

  describe('isReadyForExecution', () => {
    it('returns false initially', () => {
      expect(handler.isReadyForExecution()).toBe(false);
    });

    it('returns true after accumulating tool calls with tool_calls finish', () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      });
      expect(handler.isReadyForExecution()).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all accumulated state', () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      });
      handler.reset();
      expect(handler.getAccumulatedToolCalls()).toHaveLength(0);
      expect(handler.getFinishReason()).toBeUndefined();
      expect(handler.isReadyForExecution()).toBe(false);
    });
  });

  describe('execute', () => {
    it('executes tool calls and returns results', async () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: '{"path":"/a.ts"}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const executor: ToolExecutor = vi.fn().mockResolvedValue({
        id: 'r1', name: 'read_file', success: true, result: { content: 'file contents' },
      });

      const result = await handler.execute(executor, 'req-1');
      expect(result.toolCallsExecuted).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('tool');
    });

    it('tracks filesWritten from tool results', async () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'write_file', arguments: '{"path":"/a.ts","content":"x"}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const executor: ToolExecutor = vi.fn().mockResolvedValue({
        id: 'r1', name: 'write_file', success: true, result: 'ok', filesWritten: ['/a.ts'],
      });

      const result = await handler.execute(executor);
      expect(result.filesWritten).toEqual(['/a.ts']);
    });

    it('handles failed tool results', async () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: '{"path":"/a.ts"}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const executor: ToolExecutor = vi.fn().mockResolvedValue({
        id: 'r1', name: 'read_file', success: false, error: 'File not found',
      });

      const result = await handler.execute(executor);
      expect(result.errors).toHaveLength(1);
      expect(result.messages[0].content).toContain('Error: File not found');
    });

    it('handles tool executor throwing', async () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const executor: ToolExecutor = vi.fn().mockRejectedValue(new Error('executor crashed'));

      const result = await handler.execute(executor);
      expect(result.errors).toHaveLength(1);
      expect(result.messages[0].content).toContain('Error: executor crashed');
    });

    it('returns empty results when no tool calls', async () => {
      const executor: ToolExecutor = vi.fn();
      const result = await handler.execute(executor);
      expect(result.toolCallsExecuted).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it('uses argumentsParsed cache on second call', async () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{"a":1}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const executor: ToolExecutor = vi.fn().mockResolvedValue({
        id: 'r1', name: 'test', success: true, result: 'ok',
      });

      // First execution parses and caches
      await handler.execute(executor);
      // The parsed args should be cached on the accumulated tool call
      const calls = handler.getAccumulatedToolCalls();
      expect(calls[0].argumentsParsed).toEqual({ a: 1 });
    });
  });

  describe('buildAssistantMessage', () => {
    it('returns null when no tool calls', () => {
      expect(handler.buildAssistantMessage()).toBeNull();
    });

    it('builds assistant message with tool_calls', () => {
      handler.accumulate({
        choices: [{
          delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      });

      const msg = handler.buildAssistantMessage()!;
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('');
      expect(msg.tool_calls).toHaveLength(1);
    });
  });

  describe('buildFollowUpMessages', () => {
    it('combines existing, assistant, and tool result messages', () => {
      const existing = [{ role: 'user' as const, content: 'hi' }];
      const assistant = { role: 'assistant' as const, content: '', tool_calls: [] };
      const toolResults = [{ role: 'tool' as const, tool_call_id: 'c1', content: 'result' }];

      const result = handler.buildFollowUpMessages(existing, assistant, toolResults);
      expect(result).toHaveLength(3);
    });
  });
});

describe('createToolCallHandler', () => {
  it('creates a ToolCallHandler with debug enabled', () => {
    const h = createToolCallHandler();
    expect(h).toBeInstanceOf(ToolCallHandler);
  });
});

describe('hasToolCallsInChunk', () => {
  it('returns true for chunks with tool_calls in delta', () => {
    expect(hasToolCallsInChunk({
      choices: [{ delta: { tool_calls: [{ id: '1' }] } }],
    })).toBe(true);
  });

  it('returns true for finish_reason tool_calls', () => {
    expect(hasToolCallsInChunk({
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
    })).toBe(true);
  });

  it('returns false for regular content chunks', () => {
    expect(hasToolCallsInChunk({
      choices: [{ delta: { content: 'hello' } }],
    })).toBe(false);
  });

  it('returns false for empty chunks', () => {
    expect(hasToolCallsInChunk({ choices: [{ delta: {} }] })).toBe(false);
  });
});

describe('extractToolCallsFromResponse', () => {
  it('extracts tool calls from non-streaming response', () => {
    const result = extractToolCallsFromResponse({
      choices: [{
        message: {
          tool_calls: [{
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":"/a.ts"}' },
          }],
        },
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('call_1');
    expect(result[0].name).toBe('read_file');
  });

  it('returns empty array when no tool_calls', () => {
    expect(extractToolCallsFromResponse({ choices: [{ message: {} }] })).toEqual([]);
    expect(extractToolCallsFromResponse({})).toEqual([]);
    expect(extractToolCallsFromResponse({ choices: [{ message: { tool_calls: [] } }] })).toEqual([]);
  });

  it('handles tool calls with fallback name', () => {
    const result = extractToolCallsFromResponse({
      choices: [{
        message: {
          tool_calls: [{ id: 'c1', name: 'fallback', arguments: '{}' }],
        },
      }],
    });
    expect(result[0].name).toBe('fallback');
  });

  it('generates ID when missing', () => {
    const result = extractToolCallsFromResponse({
      choices: [{
        message: {
          tool_calls: [{ function: { name: 'test', arguments: '{}' } }],
        },
      }],
    });
    expect(result[0].id).toMatch(/^call_\d+$/);
  });
});

describe('executeSingleToolCall', () => {
  it('executes a successful tool call', async () => {
    const executor: ToolExecutor = vi.fn().mockResolvedValue({
      id: 'r1', name: 'test', success: true, result: 'ok',
    });

    const result = await executeSingleToolCall(executor, {
      id: 'c1', name: 'test', arguments: '{"a":1}',
    });
    expect(result.success).toBe(true);
    expect(result.message.role).toBe('tool');
    expect(result.message.content).toBe('ok');
  });

  it('handles failed tool result', async () => {
    const executor: ToolExecutor = vi.fn().mockResolvedValue({
      id: 'r1', name: 'test', success: false, error: 'failed',
    });

    const result = await executeSingleToolCall(executor, {
      id: 'c1', name: 'test', arguments: '{}',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('failed');
  });

  it('handles executor throwing', async () => {
    const executor: ToolExecutor = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await executeSingleToolCall(executor, {
      id: 'c1', name: 'test', arguments: '{}',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('tracks filesWritten', async () => {
    const executor: ToolExecutor = vi.fn().mockResolvedValue({
      id: 'r1', name: 'write', success: true, result: 'ok', filesWritten: ['/a.ts'],
    });

    const result = await executeSingleToolCall(executor, {
      id: 'c1', name: 'write', arguments: '{}',
    });
    expect(result.filesWritten).toEqual(['/a.ts']);
  });

  it('handles non-string result', async () => {
    const executor: ToolExecutor = vi.fn().mockResolvedValue({
      id: 'r1', name: 'test', success: true, result: { key: 'value' },
    });

    const result = await executeSingleToolCall(executor, {
      id: 'c1', name: 'test', arguments: '{}',
    });
    expect(result.message.content).toBe('{"key":"value"}');
  });
});
