import { describe, it, expect } from 'vitest';
import {
  extractTextFromSSE,
  parseSSELine,
  createSSEProcessor,
  processSSEStream,
  createEstimatedUsage,
  estimateTokens,
} from '../../../../services/ai/utils/streamParser';

describe('extractTextFromSSE', () => {
  it('handles null/undefined data', () => {
    expect(extractTextFromSSE(null, 'openai')).toEqual({ text: '', done: false });
    expect(extractTextFromSSE(undefined, 'openai')).toEqual({ text: '', done: false });
  });

  it('handles non-object data', () => {
    expect(extractTextFromSSE('string', 'openai')).toEqual({ text: '', done: false });
  });

  describe('openai format', () => {
    it('extracts text from delta content', () => {
      const result = extractTextFromSSE({
        choices: [{ delta: { content: 'hello' }, finish_reason: null }],
      }, 'openai');
      expect(result.text).toBe('hello');
      expect(result.done).toBe(false);
    });

    it('detects done when finish_reason is set', () => {
      const result = extractTextFromSSE({
        choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
      }, 'openai');
      expect(result.done).toBe(true);
    });

    it('extracts usage when present', () => {
      const result = extractTextFromSSE({
        choices: [{ delta: {}, finish_reason: null }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }, 'openai');
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });
  });

  describe('anthropic format', () => {
    it('extracts text from content_block_delta', () => {
      const result = extractTextFromSSE({
        type: 'content_block_delta',
        delta: { text: 'hello' },
      }, 'anthropic');
      expect(result.text).toBe('hello');
      expect(result.done).toBe(false);
    });

    it('detects message_stop as done', () => {
      const result = extractTextFromSSE({ type: 'message_stop' }, 'anthropic');
      expect(result.done).toBe(true);
    });

    it('handles message_delta', () => {
      const result = extractTextFromSSE({ type: 'message_delta' }, 'anthropic');
      expect(result.text).toBe('');
      expect(result.done).toBe(false);
    });

    it('returns empty for unknown event types', () => {
      const result = extractTextFromSSE({ type: 'ping' }, 'anthropic');
      expect(result.text).toBe('');
    });
  });

  describe('ollama format', () => {
    it('extracts response text', () => {
      const result = extractTextFromSSE({ response: 'hello', done: false }, 'ollama');
      expect(result.text).toBe('hello');
      expect(result.done).toBe(false);
    });

    it('extracts message content from chat format', () => {
      const result = extractTextFromSSE({ message: { content: 'chat reply' }, done: false }, 'ollama');
      expect(result.text).toBe('chat reply');
    });

    it('detects done', () => {
      const result = extractTextFromSSE({ response: '', done: true }, 'ollama');
      expect(result.done).toBe(true);
    });
  });

  describe('gemini format', () => {
    it('extracts text field', () => {
      const result = extractTextFromSSE({ text: 'gemini text' }, 'gemini');
      expect(result.text).toBe('gemini text');
    });

    it('returns empty for no text', () => {
      const result = extractTextFromSSE({}, 'gemini');
      expect(result.text).toBe('');
    });
  });

  it('returns empty for unknown format', () => {
    const result = extractTextFromSSE({ data: 'test' }, 'unknown' as any);
    expect(result.text).toBe('');
    expect(result.done).toBe(false);
  });
});

describe('parseSSELine', () => {
  it('ignores empty lines', () => {
    expect(parseSSELine('')).toEqual({ type: 'ignore' });
    expect(parseSSELine('  ')).toEqual({ type: 'ignore' });
  });

  it('ignores comments', () => {
    expect(parseSSELine(': comment')).toEqual({ type: 'ignore' });
  });

  it('detects done marker', () => {
    expect(parseSSELine('data: [DONE]')).toEqual({ type: 'done' });
  });

  it('parses data lines', () => {
    expect(parseSSELine('data: {"key":"val"}')).toEqual({ type: 'data', data: '{"key":"val"}' });
  });

  it('parses event lines', () => {
    expect(parseSSELine('event: ping')).toEqual({ type: 'event', data: 'ping' });
  });

  it('treats JSON-like content as data', () => {
    expect(parseSSELine('{"key":"val"}')).toEqual({ type: 'data', data: '{"key":"val"}' });
  });

  it('ignores unknown formats', () => {
    expect(parseSSELine('random text')).toEqual({ type: 'ignore' });
  });
});

describe('createSSEProcessor', () => {
  it('processes chunks and accumulates text', () => {
    const chunks: string[] = [];
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: (chunk) => { chunks.push(chunk.text); },
    });

    processor.processChunk('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
    expect(chunks).toEqual(['hi']);
  });

  it('calls onRawEvent when provided', () => {
    const rawEvents: string[] = [];
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: () => {},
      onRawEvent: (e) => { rawEvents.push(e); },
    });

    processor.processChunk('data: {"choices":[{"delta":{"content":"x"}}]}\n\n');
    expect(rawEvents.length).toBeGreaterThan(0);
  });

  it('calls onError for parse errors', () => {
    const errors: Error[] = [];
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: () => {},
      onError: (e) => { errors.push(e); },
    });

    processor.processChunk('data: {invalid json}\n\n');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('flush processes remaining buffer', () => {
    const chunks: string[] = [];
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: (chunk) => { chunks.push(chunk.text); },
    });

    // Process incomplete chunk (no trailing newline)
    processor.processChunk('data: {"choices":[{"delta":{"content":"hi"}}]}');
    expect(chunks).toEqual([]); // Not processed yet (in buffer)
    processor.flush();
    expect(chunks).toEqual(['hi']);
  });

  it('complete returns fullText and calls done chunk', () => {
    const chunks: string[] = [];
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: (chunk) => { chunks.push(chunk.text); },
    });

    processor.processChunk('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
    const result = processor.complete();
    expect(result.fullText).toBe('hello');
  });

  it('getText returns current accumulated text', () => {
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: () => {},
    });

    processor.processChunk('data: {"choices":[{"delta":{"content":"world"}}]}\n\n');
    expect(processor.getText()).toBe('world');
  });

  it('getUsage returns usage when available', () => {
    const processor = createSSEProcessor({
      format: 'openai',
      onChunk: () => {},
    });

    processor.processChunk('data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":10}}\n\n');
    expect(processor.getUsage()).toEqual({ inputTokens: 5, outputTokens: 10 });
  });
});

describe('createEstimatedUsage', () => {
  it('creates estimated usage from texts', () => {
    const result = createEstimatedUsage('hello world', 'response text');
    expect(result).toEqual({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      isEstimated: true,
    });
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });
});

describe('estimateTokens', () => {
  it('estimates tokens at ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});
