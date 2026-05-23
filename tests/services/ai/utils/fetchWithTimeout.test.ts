import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../../../../services/ai/utils/fetchWithTimeout';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should export timeout constants', () => {
    expect(TIMEOUT_TEST_CONNECTION).toBe(30_000);
    expect(TIMEOUT_GENERATE).toBe(300_000);
    expect(TIMEOUT_LIST_MODELS).toBe(30_000);
  });

  it('should return response on successful fetch', async () => {
    const mockResponse = new Response(null, { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com/api');
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('should pass through fetch options', async () => {
    const mockResponse = new Response(null, { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":true}',
    });

    expect(fetch).toHaveBeenCalledWith('https://example.com/api', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":true}',
      signal: expect.any(AbortSignal),
    }));
  });

  it('should use default timeout when not specified', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    await fetchWithTimeout('https://example.com/api');
    // If it resolves, default timeout was accepted
    expect(fetch).toHaveBeenCalled();
  });

  it('should use custom timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      // Verify signal exists
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response());
    });

    await fetchWithTimeout('https://example.com/api', { timeout: 5000 });
  });

  it('should throw timeout error when request exceeds timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Create an AbortError (different from DOMException on some platforms)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw abortError;
    });

    const promise = fetchWithTimeout('https://example.com/api', { timeout: 50 });

    // Advance timers to trigger the setTimeout callback
    vi.advanceTimersByTime(50);

    await expect(promise).rejects.toThrow('Request timeout after 50ms');
    vi.useRealTimers();
  });

  it('should re-throw non-timeout fetch errors', async () => {
    const error = new Error('Network error');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    await expect(fetchWithTimeout('https://example.com/api')).rejects.toThrow('Network error');
  });

  it('should clear timeout on successful response', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    await fetchWithTimeout('https://example.com/api', { timeout: 5000 });
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('should clear timeout on error', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'));

    await expect(fetchWithTimeout('https://example.com/api')).rejects.toThrow('fail');
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});