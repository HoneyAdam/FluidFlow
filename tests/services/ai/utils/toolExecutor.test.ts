import { describe, it, expect, vi } from 'vitest';
import {
  PROJECT_TOOLS,
  createToolExecutor,
  validateToolArguments,
  extractToolCalls,
  formatToolResultMessage,
} from '../../../../services/ai/utils/toolExecutor';

describe('PROJECT_TOOLS', () => {
  it('exports all expected tools', () => {
    const names = PROJECT_TOOLS.map(t => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('delete_file');
    expect(names).toContain('list_files');
    expect(names).toContain('create_directory');
    expect(names).toContain('search_files');
  });

  it('each tool has name and parameters', () => {
    for (const tool of PROJECT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });
});

describe('createToolExecutor', () => {
  it('returns a function', () => {
    const executor = createToolExecutor(vi.fn().mockResolvedValue({ id: '1', name: 'test', success: true }));
    expect(typeof executor).toBe('function');
  });

  it('executes tool and returns result', async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      id: 'r1', name: 'read_file', success: true, result: 'content',
    });
    const executor = createToolExecutor(mockExecute);
    const result = await executor('read_file', { path: 'test.ts' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('content');
    expect(mockExecute).toHaveBeenCalledWith('read_file', { path: 'test.ts' }, {});
  });

  it('returns error for invalid tool name', async () => {
    const executor = createToolExecutor(vi.fn());
    const result = await executor('', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tool name');
  });

  it('returns error for null tool name', async () => {
    const executor = createToolExecutor(vi.fn());
    const result = await executor(null as unknown as string, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid tool name');
  });

  it('handles executor errors', async () => {
    const executor = createToolExecutor(vi.fn().mockRejectedValue(new Error('execution failed')));
    const result = await executor('read_file', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('execution failed');
  });
});

describe('validateToolArguments', () => {
  it('returns valid when no parameters defined', () => {
    expect(validateToolArguments({ path: 'x' })).toEqual({ valid: true });
  });

  it('returns valid when no properties in parameters', () => {
    expect(validateToolArguments({ path: 'x' }, { type: 'object' })).toEqual({ valid: true });
  });

  it('validates required parameters', () => {
    const params = {
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path'],
    };
    expect(validateToolArguments({}, params)).toEqual({
      valid: false, error: 'Missing required parameter: path',
    });
    expect(validateToolArguments({ path: 'x' }, params)).toEqual({ valid: true });
  });

  it('validates types', () => {
    const params = {
      properties: { count: { type: 'number' } },
    };
    expect(validateToolArguments({ count: 'not a number' }, params)).toEqual({
      valid: false, error: 'Invalid type for count: expected number, got string',
    });
  });

  it('allows array type', () => {
    const params = {
      properties: { items: { type: 'array' } },
    };
    expect(validateToolArguments({ items: [1, 2] }, params)).toEqual({ valid: true });
  });

  it('skips undefined/null values', () => {
    const params = {
      properties: { x: { type: 'string' } },
    };
    expect(validateToolArguments({ x: undefined }, params)).toEqual({ valid: true });
    expect(validateToolArguments({ x: null }, params)).toEqual({ valid: true });
  });

  it('skips unknown properties', () => {
    const params = {
      properties: { known: { type: 'string' } },
    };
    expect(validateToolArguments({ unknown: 'value' }, params)).toEqual({ valid: true });
  });
});

describe('extractToolCalls', () => {
  it('extracts tool calls from response', () => {
    const result = extractToolCalls({
      tool_calls: [{ id: 'c1', function: { name: 'test', arguments: '{}' } }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0].name).toBe('test');
  });

  it('returns empty for null/undefined', () => {
    expect(extractToolCalls(null)).toEqual([]);
    expect(extractToolCalls(undefined)).toEqual([]);
  });

  it('returns empty for non-object', () => {
    expect(extractToolCalls('string')).toEqual([]);
  });

  it('returns empty when no tool_calls', () => {
    expect(extractToolCalls({})).toEqual([]);
  });

  it('returns empty for non-array tool_calls', () => {
    expect(extractToolCalls({ tool_calls: 'not array' })).toEqual([]);
  });

  it('generates ID when missing', () => {
    const result = extractToolCalls({
      tool_calls: [{ function: { name: 'test', arguments: '{}' } }],
    });
    expect(result[0].id).toMatch(/^call_\d+$/);
  });

  it('uses fallback name and arguments', () => {
    const result = extractToolCalls({
      tool_calls: [{ id: 'c1', name: 'fallback', arguments: '{"a":1}' }],
    });
    expect(result[0].name).toBe('fallback');
    expect(result[0].arguments).toBe('{"a":1}');
  });
});

describe('formatToolResultMessage', () => {
  it('formats success result', () => {
    const result = formatToolResultMessage({
      id: 'r1', name: 'read_file', success: true, result: 'file content',
    });
    expect(result).toContain('succeeded');
    expect(result).toContain('file content');
  });

  it('formats success with object result', () => {
    const result = formatToolResultMessage({
      id: 'r1', name: 'test', success: true, result: { key: 'val' },
    });
    expect(result).toContain('{"key":"val"}');
  });

  it('formats failure result', () => {
    const result = formatToolResultMessage({
      id: 'r1', name: 'write_file', success: false, error: 'disk full',
    });
    expect(result).toContain('failed');
    expect(result).toContain('disk full');
  });
});
