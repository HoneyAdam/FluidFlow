import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock errorHandling before importing retry
vi.mock('../../../../services/ai/utils/errorHandling', () => {
  return {
    isRetryableError: vi.fn(),
    AIProviderError: class AIProviderError extends Error {
      code: string;
      isRetryable: boolean;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
        this.isRetryable = false;
      }
    },
    AIErrorCode: { NETWORK_ERROR: 'NETWORK_ERROR', RATE_LIMIT: 'RATE_LIMIT' },
  };
});

import { withRetry, withRetryWrapper, withRateLimitRetry, withSimpleRetry } from '../../../../services/ai/utils/retry';
import { isRetryableError } from '../../../../services/ai/utils/errorHandling';

const mockIsRetryable = isRetryableError as ReturnType<typeof vi.fn>;

describe('withRetry', () => {
  beforeEach(() => {
    mockIsRetryable.mockReset();
  });

  it('returns result on first successful attempt', async () => {
    mockIsRetryable.mockReturnValue(false);
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on retryable error and succeeds', async () => {
    mockIsRetryable.mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { maxRetries: 3, jitter: false });
    expect(result.result).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it('does not retry on non-retryable error', async () => {
    mockIsRetryable.mockReturnValue(false);
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('throws after exhausting all retries', async () => {
    mockIsRetryable.mockReturnValue(true);
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));

    await expect(withRetry(fn, { maxRetries: 2, jitter: false, initialDelayMs: 10 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('calls onRetry callback', async () => {
    mockIsRetryable.mockReturnValue(true);
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await withRetry(fn, { maxRetries: 1, onRetry, jitter: false, initialDelayMs: 10 });
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });

  it('respects custom isRetryable function', async () => {
    mockIsRetryable.mockReturnValue(false); // default says no
    const customRetryable = vi.fn().mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('custom'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxRetries: 1, isRetryable: customRetryable, jitter: false, initialDelayMs: 10 });
    expect(result.result).toBe('ok');
    expect(customRetryable).toHaveBeenCalled();
  });

  it('supports AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    mockIsRetryable.mockReturnValue(true);

    await expect(withRetry(vi.fn().mockResolvedValue('ok'), { signal: controller.signal }))
      .rejects.toThrow();
  });

  it('tracks totalTimeMs', async () => {
    mockIsRetryable.mockReturnValue(false);
    const result = await withRetry(vi.fn().mockResolvedValue('ok'));
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('withRetryWrapper', () => {
  it('wraps a function with retry logic', async () => {
    mockIsRetryable.mockReturnValue(false);
    const fn = vi.fn().mockResolvedValue(42);
    const wrapped = withRetryWrapper(fn, { maxRetries: 1 });

    const result = await wrapped('arg1', 'arg2');
    expect(result.result).toBe(42);
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('withSimpleRetry', () => {
  it('retries once on failure', async () => {
    mockIsRetryable.mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await withSimpleRetry(fn);
    expect(result).toBe('ok');
  });

  it('throws after one retry', async () => {
    mockIsRetryable.mockReturnValue(true);
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));

    await expect(withSimpleRetry(fn)).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRateLimitRetry', () => {
  it('uses enhanced retry for rate limits', async () => {
    mockIsRetryable.mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue('ok');

    const result = await withRateLimitRetry(fn, { maxRetries: 1, jitter: false, initialDelayMs: 10 });
    expect(result.result).toBe('ok');
  });

  it('calls onRetry for rate limit errors', async () => {
    mockIsRetryable.mockReturnValue(true);
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue('ok');

    await withRateLimitRetry(fn, { maxRetries: 1, onRetry, jitter: false, initialDelayMs: 10 });
    expect(onRetry).toHaveBeenCalled();
  });
});
