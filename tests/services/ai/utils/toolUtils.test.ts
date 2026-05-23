import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseToolArguments,
  serializeToolPayload,
  deduplicateTools,
  formatToolName,
  buildMessages,
  extractMessageText,
  hasToolCalls,
  formatToolError,
  buildBaseRequestBody,
} from '../../../../services/ai/utils/toolUtils';

describe('parseToolArguments', () => {
  it('parses valid JSON string', () => {
    expect(parseToolArguments('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('returns empty object for empty string', () => {
    expect(parseToolArguments('')).toEqual({});
  });

  it('returns empty object for non-string input', () => {
    expect(parseToolArguments(null as unknown as string)).toEqual({});
    expect(parseToolArguments(undefined as unknown as string)).toEqual({});
    expect(parseToolArguments(42 as unknown as string)).toEqual({});
  });

  it('fixes missing closing brace', () => {
    expect(parseToolArguments('{"key":"value"')).toEqual({ key: 'value' });
  });

  it('fixes trailing comma before closing brace', () => {
    expect(parseToolArguments('{"key":"value",}')).toEqual({ key: 'value' });
  });

  it('fixes escaped quotes', () => {
    const result = parseToolArguments('{"key":"\\"value\\""}');
    expect(result).toEqual({ key: '"value"' });
  });

  it('returns empty object for completely invalid JSON', () => {
    expect(parseToolArguments('not json at all')).toEqual({});
  });

  it('handles complex valid JSON', () => {
    const input = '{"path":"src/App.tsx","content":"import React","options":{"overwrite":true}}';
    expect(parseToolArguments(input)).toEqual({
      path: 'src/App.tsx',
      content: 'import React',
      options: { overwrite: true },
    });
  });

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":{"deep":"value"}}}';
    expect(parseToolArguments(input)).toEqual({ outer: { inner: { deep: 'value' } } });
  });
});

describe('serializeToolPayload', () => {
  it('serializes valid data', () => {
    expect(serializeToolPayload({ key: 'value' })).toBe('{"key":"value"}');
  });

  it('returns empty object for undefined', () => {
    expect(serializeToolPayload(undefined)).toBe('{}');
  });

  it('returns empty object for null', () => {
    expect(serializeToolPayload(null)).toBe('{}');
  });

  it('handles serialization errors', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // JSON.stringify throws on circular references
    expect(serializeToolPayload(circular)).toBe('{}');
  });
});

describe('deduplicateTools', () => {
  it('removes duplicate tools by name', () => {
    const tools = [
      { function: { name: 'read_file' } },
      { function: { name: 'write_file' } },
      { function: { name: 'read_file' } },
    ];
    const result = deduplicateTools(tools);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.function.name)).toEqual(['read_file', 'write_file']);
  });

  it('returns all tools if no duplicates', () => {
    const tools = [
      { function: { name: 'read_file' } },
      { function: { name: 'write_file' } },
    ];
    expect(deduplicateTools(tools)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateTools([])).toEqual([]);
  });
});

describe('formatToolName', () => {
  it('returns name from toolCall.name', () => {
    expect(formatToolName({ name: 'read_file' })).toBe('read_file');
  });

  it('returns name from toolCall.function.name', () => {
    expect(formatToolName({ function: { name: 'write_file' } })).toBe('write_file');
  });

  it('prefers toolCall.name over function.name', () => {
    expect(formatToolName({ name: 'read', function: { name: 'write' } })).toBe('read');
  });

  it('returns unknown-tool for empty object', () => {
    expect(formatToolName({})).toBe('unknown-tool');
  });
});

describe('buildMessages', () => {
  it('builds messages with system instruction first', () => {
    const result = buildMessages({
      systemInstruction: 'You are helpful',
      currentPrompt: 'Hello',
    });
    expect(result).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('includes conversation history', () => {
    const result = buildMessages({
      systemInstruction: 'System',
      conversationHistory: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
      currentPrompt: 'How are you?',
    });
    expect(result).toEqual([
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
    ]);
  });

  it('skips system messages in history when includeSystemFirst is true', () => {
    const result = buildMessages({
      systemInstruction: 'System',
      conversationHistory: [
        { role: 'system', content: 'Should be skipped' },
        { role: 'user', content: 'Hi' },
      ],
      currentPrompt: 'Hello',
      includeSystemFirst: true,
    });
    expect(result).not.toContainEqual({ role: 'system', content: 'Should be skipped' });
  });

  it('includes system messages in history when includeSystemFirst is false', () => {
    const result = buildMessages({
      conversationHistory: [
        { role: 'system', content: 'Included' },
      ],
      currentPrompt: 'Hello',
      includeSystemFirst: false,
    });
    expect(result).toContainEqual({ role: 'system', content: 'Included' });
  });

  it('works without system instruction', () => {
    const result = buildMessages({ currentPrompt: 'Hello' });
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });
});

describe('extractMessageText', () => {
  it('returns string content', () => {
    expect(extractMessageText({ content: 'Hello' })).toBe('Hello');
  });

  it('returns empty string for null content', () => {
    expect(extractMessageText({ content: null })).toBe('');
  });

  it('returns empty string for undefined content', () => {
    expect(extractMessageText({ content: undefined })).toBe('');
  });

  it('returns empty string when no content field', () => {
    expect(extractMessageText({})).toBe('');
  });
});

describe('hasToolCalls', () => {
  it('returns true for message with tool_calls array', () => {
    expect(hasToolCalls({ tool_calls: [{ id: '1' }] })).toBe(true);
  });

  it('returns false for empty tool_calls array', () => {
    expect(hasToolCalls({ tool_calls: [] })).toBe(false);
  });

  it('returns false for non-array tool_calls', () => {
    expect(hasToolCalls({ tool_calls: 'not array' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(hasToolCalls(null)).toBe(false);
    expect(hasToolCalls(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(hasToolCalls('string')).toBe(false);
  });

  it('returns false for object without tool_calls', () => {
    expect(hasToolCalls({ content: 'hello' })).toBe(false);
  });
});

describe('formatToolError', () => {
  it('formats Error objects', () => {
    expect(formatToolError('read_file', new Error('not found'))).toBe(
      'Tool "read_file" failed: not found'
    );
  });

  it('formats non-Error values', () => {
    expect(formatToolError('write_file', 'disk full')).toBe(
      'Tool "write_file" failed: disk full'
    );
  });
});

describe('buildBaseRequestBody', () => {
  it('builds minimal request body', () => {
    const result = buildBaseRequestBody('gpt-4', [{ role: 'user', content: 'Hi' }], {});
    expect(result).toEqual({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('includes maxTokens when provided', () => {
    const result = buildBaseRequestBody('gpt-4', [], { maxTokens: 4096 });
    expect(result.max_tokens).toBe(4096);
  });

  it('includes temperature when provided', () => {
    const result = buildBaseRequestBody('gpt-4', [], { temperature: 0.5 });
    expect(result.temperature).toBe(0.5);
  });

  it('includes stream when provided', () => {
    const result = buildBaseRequestBody('gpt-4', [], { stream: true });
    expect(result.stream).toBe(true);
  });

  it('omits undefined options', () => {
    const result = buildBaseRequestBody('gpt-4', [], {});
    expect(result).not.toHaveProperty('max_tokens');
    expect(result).not.toHaveProperty('temperature');
    expect(result).not.toHaveProperty('stream');
  });
});
