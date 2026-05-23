/**
 * Retry Logic Service
 *
 * Provides retry decision-making and exponential backoff calculations.
 * Extracted from useContinuationGeneration for testability.
 *
 * @module services/generation/retry
 */

/**
 * Maximum number of retry attempts for continuation/truncation recovery
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Maximum number of batches before forcing completion
 */
export const MAX_BATCHES = 5;

/**
 * Base delay in milliseconds for exponential backoff
 */
export const BASE_DELAY_MS = 1000;

/**
 * Calculate delay for exponential backoff retry.
 * Returns delay in milliseconds: baseDelay * (attempt + 1)
 */
export function getRetryDelay(attempt: number, baseDelay: number = BASE_DELAY_MS): number {
  return baseDelay * (attempt + 1);
}

/**
 * Check if a retry should be attempted based on current attempt count.
 */
export function shouldRetry(currentAttempt: number, maxAttempts: number = MAX_RETRY_ATTEMPTS): boolean {
  return currentAttempt < maxAttempts;
}

/**
 * Check if generation should be force-completed due to too many batches or no progress.
 */
export function shouldForceComplete(currentBatch: number, madeProgress: boolean): boolean {
  return currentBatch >= MAX_BATCHES || !madeProgress;
}

/**
 * Create an updated object with incremented retryAttempts counter.
 * Returns a new object (immutable update). Works with any object that
 * optionally has retryAttempts.
 */
export function incrementRetryState<T extends Record<string, unknown>>(state: T & { retryAttempts?: number }): T & { retryAttempts: number } {
  return {
    ...state,
    retryAttempts: (state.retryAttempts || 0) + 1,
  };
}
