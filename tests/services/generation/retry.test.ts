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
    it('should have reasonable defaults', () => {
      expect(MAX_RETRY_ATTEMPTS).toBeGreaterThan(0);
      expect(MAX_BATCHES).toBeGreaterThan(0);
      expect(BASE_DELAY_MS).toBeGreaterThan(0);
    });
  });

  describe('getRetryDelay', () => {
    it('should return increasing delays', () => {
      expect(getRetryDelay(0)).toBeLessThan(getRetryDelay(1));
      expect(getRetryDelay(1)).toBeLessThan(getRetryDelay(2));
    });

    it('should use base delay', () => {
      expect(getRetryDelay(0, 500)).toBe(500);
      expect(getRetryDelay(1, 500)).toBe(1000);
    });
  });

  describe('shouldRetry', () => {
    it('should allow retries below max', () => {
      expect(shouldRetry(0)).toBe(true);
      expect(shouldRetry(MAX_RETRY_ATTEMPTS - 1)).toBe(true);
    });

    it('should stop retrying at max', () => {
      expect(shouldRetry(MAX_RETRY_ATTEMPTS)).toBe(false);
    });
  });

  describe('shouldForceComplete', () => {
    it('should force complete when too many batches', () => {
      expect(shouldForceComplete(MAX_BATCHES, true)).toBe(true);
    });

    it('should force complete when no progress', () => {
      expect(shouldForceComplete(0, false)).toBe(true);
    });

    it('should not force complete when making progress under limit', () => {
      expect(shouldForceComplete(1, true)).toBe(false);
    });
  });

  describe('incrementRetryState', () => {
    it('should increment retryAttempts from undefined', () => {
      const result = incrementRetryState({ foo: 'bar' });
      expect(result.retryAttempts).toBe(1);
      expect(result.foo).toBe('bar');
    });

    it('should increment retryAttempts from existing value', () => {
      const result = incrementRetryState({ retryAttempts: 2, other: 42 });
      expect(result.retryAttempts).toBe(3);
      expect(result.other).toBe(42);
    });
  });
});
