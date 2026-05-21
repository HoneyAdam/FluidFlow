/**
 * Fetch utility with timeout support using AbortController.
 * BUG-010 fix: Prevents indefinite hanging on unresponsive API endpoints.
 */

import {
  GENERATION_TIMEOUT_MS,
  TEST_CONNECTION_TIMEOUT_MS,
  LIST_MODELS_TIMEOUT_MS,
} from '@/constants/timing';

// Re-export with legacy names for backwards compatibility
export const TIMEOUT_TEST_CONNECTION = TEST_CONNECTION_TIMEOUT_MS;
export const TIMEOUT_GENERATE = GENERATION_TIMEOUT_MS;
export const TIMEOUT_LIST_MODELS = LIST_MODELS_TIMEOUT_MS;

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

/**
 * Performs a fetch request with a timeout.
 * If the request takes longer than the timeout, it will be aborted.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including optional timeout (defaults to TIMEOUT_GENERATE)
 * @returns Promise<Response>
 * @throws Error if timeout is reached or fetch fails
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = TIMEOUT_GENERATE, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
