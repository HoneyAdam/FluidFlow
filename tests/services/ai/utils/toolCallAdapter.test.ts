import { describe, it, expect } from 'vitest';
import {
  OpenAIToolCallAdapter,
  AnthropicToolCallAdapter,
  GeminiToolCallAdapter,
  getToolCallAdapter,
  getAdapterByFormat,
} from '../../../../services/ai/utils/toolCallAdapter';

describe('OpenAIToolCallAdapter', () => {
  const adapter = new OpenAIToolCallAdapter();

  it('has correct providerType', () => {
    expect(adapter.providerType).toBe('openai-compatible');
  });

  it('supports openai, openrouter, custom formats', () => {
    expect(adapter.supportsFormat('openai')).toBe(true);
    expect(adapter.supportsFormat('openrouter')).toBe(true);
    expect(adapter.supportsFormat('custom')).toBe(true);
    expect(adapter.supportsFormat('anthropic')).toBe(false);
  });

  it('extracts tool calls from chunks', () => {
    const result = adapter.extractToolCalls({
      choices: [{ delta: { tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }] } }],
    });
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('c1');
    expect(result![0].name).toBe('test');
  });

  it('returns null for chunks without tool calls', () => {
    expect(adapter.extractToolCalls({ choices: [{ delta: { content: 'text' } }] })).toBeNull();
    expect(adapter.extractToolCalls(null)).toBeNull();
    expect(adapter.extractToolCalls('string')).toBeNull();
  });

  it('handles partial arguments (isPartial)', () => {
    const result = adapter.extractToolCalls({
      choices: [{ delta: { tool_calls: [{ id: 'c1', function: { name: 'test' } }] } }],
    });
    expect(result![0].isPartial).toBe(true);
  });

  it('detects tool_calls complete', () => {
    expect(adapter.isToolCallsComplete({
      choices: [{ finish_reason: 'tool_calls' }],
    })).toBe(true);
    expect(adapter.isToolCallsComplete({ choices: [{ finish_reason: 'stop' }] })).toBe(false);
    expect(adapter.isToolCallsComplete(null)).toBe(false);
  });

  it('gets finish reason', () => {
    expect(adapter.getFinishReason({ choices: [{ finish_reason: 'stop' }] })).toBe('stop');
    expect(adapter.getFinishReason(null)).toBeUndefined();
  });

  it('formats tools', () => {
    const result = adapter.formatTools([{ name: 'read', description: 'Read file', parameters: { type: 'object' } }]);
    expect(result).toEqual([{ type: 'function', function: { name: 'read', description: 'Read file', parameters: { type: 'object' } } }]);
  });

  it('formats tool results for success', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 'read', success: true, result: 'content' }, 'c1');
    expect(result).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'content' });
  });

  it('formats tool results for failure', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 'read', success: false, error: 'fail' }, 'c1');
    expect(result).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'Error: fail' });
  });

  it('formats tool results with non-string success result', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 'test', success: true, result: { key: 'val' } }, 'c1');
    expect((result as { content: string }).content).toBe('{"key":"val"}');
  });

  it('builds follow-up messages', () => {
    const result = adapter.buildFollowUpMessages(
      [{ role: 'user', content: 'hi' }],
      { role: 'assistant', content: '' },
      [{ role: 'tool', content: 'result' }],
    );
    expect(result).toHaveLength(3);
  });
});

describe('AnthropicToolCallAdapter', () => {
  const adapter = new AnthropicToolCallAdapter();

  it('supports anthropic format only', () => {
    expect(adapter.supportsFormat('anthropic')).toBe(true);
    expect(adapter.supportsFormat('openai')).toBe(false);
  });

  it('extracts tool calls from content_block_start', () => {
    const result = adapter.extractToolCalls({
      type: 'content_block_start',
      content: [{ type: 'tool_use', name: 'test', input: '{"a":1}' }],
    });
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('test');
  });

  it('extracts partial args from content_block_delta', () => {
    const result = adapter.extractToolCalls({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"key":' },
    });
    expect(result).toHaveLength(1);
    expect(result![0].isPartial).toBe(true);
  });

  it('returns null for other event types', () => {
    expect(adapter.extractToolCalls({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } })).toBeNull();
    expect(adapter.extractToolCalls(null)).toBeNull();
  });

  it('detects message_stop as complete', () => {
    expect(adapter.isToolCallsComplete({ type: 'message_stop' })).toBe(true);
    expect(adapter.isToolCallsComplete({ type: 'content_block_delta' })).toBe(false);
    expect(adapter.isToolCallsComplete(null)).toBe(false);
  });

  it('gets finish reason for message_stop', () => {
    expect(adapter.getFinishReason({ type: 'message_stop' })).toBe('stop');
  });

  it('gets finish reason for content_block_stop', () => {
    expect(adapter.getFinishReason({ type: 'content_block_stop' })).toBe('stop');
  });

  it('gets finish reason for tool_use in message', () => {
    expect(adapter.getFinishReason({ type: 'message', content: [{ type: 'tool_use' }] })).toBe('tool_calls');
  });

  it('returns undefined for other types', () => {
    expect(adapter.getFinishReason({ type: 'ping' })).toBeUndefined();
    expect(adapter.getFinishReason(null)).toBeUndefined();
  });

  it('formats tools with input_schema', () => {
    const result = adapter.formatTools([{ name: 'test', parameters: { type: 'object' } }]);
    expect(result).toEqual([{ name: 'test', description: '', input_schema: { type: 'object' } }]);
  });

  it('formats tool results', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 't', success: true, result: 'ok' }, 'tid');
    expect(result).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tid', content: '"ok"' }] });
  });

  it('formats failed tool results', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 't', success: false, error: 'err' }, 'tid');
    expect(result).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tid', content: 'Error: err' }] });
  });
});

describe('GeminiToolCallAdapter', () => {
  const adapter = new GeminiToolCallAdapter();

  it('supports gemini format', () => {
    expect(adapter.supportsFormat('gemini')).toBe(true);
    expect(adapter.supportsFormat('openai')).toBe(false);
  });

  it('extracts tool calls from candidates', () => {
    const result = adapter.extractToolCalls({
      candidates: [{
        content: { parts: [{ functionCall: { name: 'test', args: { key: 'val' } } }] },
      }],
    });
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe('test');
  });

  it('returns null when no function calls', () => {
    expect(adapter.extractToolCalls({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })).toBeNull();
    expect(adapter.extractToolCalls(null)).toBeNull();
  });

  it('detects completion from finishReason', () => {
    expect(adapter.isToolCallsComplete({ candidates: [{ finishReason: 'stop' }] })).toBe(true);
    expect(adapter.isToolCallsComplete({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toBe(true);
    expect(adapter.isToolCallsComplete({ candidates: [{ finishReason: 'other' }] })).toBe(false);
    expect(adapter.isToolCallsComplete(null)).toBe(false);
  });

  it('gets finish reason', () => {
    expect(adapter.getFinishReason({ candidates: [{ finishReason: 'stop' }] })).toBe('stop');
    expect(adapter.getFinishReason(null)).toBeUndefined();
  });

  it('formats tools with functionDeclarations', () => {
    const result = adapter.formatTools([{ name: 'test', parameters: { type: 'object' } }]);
    expect(result).toEqual([{ functionDeclarations: [{ name: 'test', description: '', parameters: { type: 'object' } }] }]);
  });

  it('formats successful tool result', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 't', success: true, result: 'ok' }, 'test');
    expect(result).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'test', response: 'ok' } }] });
  });

  it('formats failed tool result', () => {
    const result = adapter.formatToolResult({ id: 'r1', name: 't', success: false, error: 'fail' }, 'test');
    expect(result).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'test', response: { error: 'fail' } } }] });
  });
});

describe('getToolCallAdapter', () => {
  it('returns OpenAI adapter for openai', () => {
    expect(getToolCallAdapter('openai')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns OpenAI adapter for openrouter', () => {
    expect(getToolCallAdapter('openrouter')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns OpenAI adapter for cerebras', () => {
    expect(getToolCallAdapter('cerebras')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns OpenAI adapter for minimax', () => {
    expect(getToolCallAdapter('minimax')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns OpenAI adapter for lmstudio', () => {
    expect(getToolCallAdapter('lmstudio')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns OpenAI adapter for ollama', () => {
    expect(getToolCallAdapter('ollama')).toBeInstanceOf(OpenAIToolCallAdapter);
  });

  it('returns Anthropic adapter for anthropic', () => {
    expect(getToolCallAdapter('anthropic')).toBeInstanceOf(AnthropicToolCallAdapter);
  });

  it('returns Gemini adapter for gemini', () => {
    expect(getToolCallAdapter('gemini')).toBeInstanceOf(GeminiToolCallAdapter);
  });
});

describe('getAdapterByFormat', () => {
  it('returns correct adapter by format', () => {
    expect(getAdapterByFormat('openai')).toBeInstanceOf(OpenAIToolCallAdapter);
    expect(getAdapterByFormat('anthropic')).toBeInstanceOf(AnthropicToolCallAdapter);
    expect(getAdapterByFormat('gemini')).toBeInstanceOf(GeminiToolCallAdapter);
  });

  it('defaults to OpenAI adapter for unknown format', () => {
    expect(getAdapterByFormat('unknown')).toBeInstanceOf(OpenAIToolCallAdapter);
  });
});
