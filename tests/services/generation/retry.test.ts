/**
 * Tests for services/generation/retry
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_RETRY_ATTEMPTS,
  MAX_BATCHES,
  BASE_DELAY_MS,
  getRetryDelay,
  shouldRetry,
  shouldForceComplete,
  incrementRetryState,
} from '../../../services/generation/retry';

describe('services/generation/retry', () => {
  describe('constants', () => {
    it('should export MAX_RETRY_ATTEMPTS as 3', () => {
      expect(MAX_RETRY_ATTEMPTS).toBe(3);
    });

    it('should export MAX_BATCHES as 5', () => {
      expect(MAX_BATCHES).toBe(5);
    });

    it('should export BASE_DELAY_MS as 1000', () => {
      expect(BASE_DELAY_MS).toBe(1000);
    });
  });

  describe('getRetryDelay', () => {
    it('should return baseDelay * (attempt + 1)', () => {
      expect(getRetryDelay(0)).toBe(1000);
      expect(getRetryDelay(1)).toBe(2000);
      expect(getRetryDelay(2)).toBe(3000);
    });

    it('should accept custom base delay', () => {
      expect(getRetryDelay(0, 500)).toBe(500);
      expect(getRetryDelay(1, 500)).toBe(1000);
    });

    it('should handle zero attempt', () => {
      expect(getRetryDelay(0, 1000)).toBe(1000);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when under max attempts', () => {
      expect(shouldRetry(0)).toBe(true);
      expect(shouldRetry(1)).toBe(true);
      expect(shouldRetry(2)).toBe(true);
    });

    it('should return false when at or above max attempts', () => {
      expect(shouldRetry(3)).toBe(false);
      expect(shouldRetry(4)).toBe(false);
    });

    it('should accept custom max attempts', () => {
      expect(shouldRetry(4, 5)).toBe(true);
      expect(shouldRetry(5, 5)).toBe(false);
    });
  });

  describe('shouldForceComplete', () => {
    it('should return true when batch count exceeds MAX_BATCHES', () => {
      expect(shouldForceComplete(5, true)).toBe(true);
      expect(shouldForceComplete(6, true)).toBe(true);
    });

    it('should return true when no progress was made', () => {
      expect(shouldForceComplete(1, false)).toBe(true);
      expect(shouldForceComplete(0, false)).toBe(true);
    });

    it('should return false when under batch limit and progress was made', () => {
      expect(shouldForceComplete(0, true)).toBe(false);
      expect(shouldForceComplete(4, true)).toBe(false);
    });
  });

  describe('incrementRetryState', () => {
    it('should increment retryAttempts from 0 to 1', () => {
      const state = { isActive: true, retryAttempts: 0 };
      const result = incrementRetryState(state);
      expect(result.retryAttempts).toBe(1);
    });

    it('should increment retryAttempts from undefined to 1', () => {
      const state = { isActive: true };
      const result = incrementRetryState(state as Record<string, unknown> & { retryAttempts?: number });
      expect(result.retryAttempts).toBe(1);
    });

    it('should preserve other properties', () => {
      const state = { name: 'test', value: 42, retryAttempts: 2 };
      const result = incrementRetryState(state);
      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
      expect(result.retryAttempts).toBe(3);
    });

    it('should not mutate original state', () => {
      const state = { retryAttempts: 0 };
      const result = incrementRetryState(state);
      expect(state.retryAttempts).toBe(0);
      expect(result.retryAttempts).toBe(1);
    });
  });
});
