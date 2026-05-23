import { describe, it, expect } from 'vitest';
import { withRetry as withRetryTypes, DEFAULT_PROVIDERS } from '../../../services/ai/types';

describe('types.ts', () => {
  describe('DEFAULT_PROVIDERS', () => {
    it('has config for all provider types', () => {
      const types = ['gemini', 'openai', 'anthropic', 'zai', 'cerebras', 'ollama', 'lmstudio', 'openrouter', 'minimax', 'custom'];
      for (const t of types) {
        expect(DEFAULT_PROVIDERS[t as keyof typeof DEFAULT_PROVIDERS]).toBeDefined();
        expect(DEFAULT_PROVIDERS[t as keyof typeof DEFAULT_PROVIDERS].type).toBe(t);
      }
    });

    it('has models for openai', () => {
      expect(DEFAULT_PROVIDERS.openai.models.length).toBeGreaterThan(0);
      expect(DEFAULT_PROVIDERS.openai.defaultModel).toBeTruthy();
    });

    it('has models for gemini', () => {
      expect(DEFAULT_PROVIDERS.gemini.models.length).toBeGreaterThan(0);
    });

    it('has models for anthropic', () => {
      expect(DEFAULT_PROVIDERS.anthropic.models.length).toBeGreaterThan(0);
    });

    it('ollama is local', () => {
      expect(DEFAULT_PROVIDERS.ollama.isLocal).toBe(true);
    });

    it('lmstudio is local', () => {
      expect(DEFAULT_PROVIDERS.lmstudio.isLocal).toBe(true);
    });
  });

  describe('withRetry', () => {
    it('succeeds on first try', async () => {
      const result = await withRetryTypes(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('retries on retryable errors', async () => {
      let callCount = 0;
      const result = await withRetryTypes(
        () => {
          callCount++;
          if (callCount < 2) throw new Error('network error');
          return Promise.resolve('ok');
        },
        { maxRetries: 3, baseDelayMs: 10 }
      );
      expect(result).toBe('ok');
      expect(callCount).toBe(2);
    });

    it('throws on non-retryable errors', async () => {
      await expect(
        withRetryTypes(() => Promise.reject(new Error('bad request')), { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow('bad request');
    });

    it('throws after max retries', async () => {
      await expect(
        withRetryTypes(() => Promise.reject(new Error('network timeout')), { maxRetries: 1, baseDelayMs: 10 })
      ).rejects.toThrow('network timeout');
    });

    it('wraps non-Error throws', async () => {
      await expect(
        withRetryTypes(() => Promise.reject('string error'), { maxRetries: 0 })
      ).rejects.toThrow('string error');
    });
  });
});
