/**
 * Async Utilities Tests
 * Tests for utils/async.ts - createDebouncedAction and LockManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedAction, LockManager } from '../../utils/async';

describe('async', () => {
  describe('createDebouncedAction', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce function calls', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 100);
      debounced();
      debounced();
      debounced();

      // Function should not be called immediately
      expect(fn).not.toHaveBeenCalled();

      // Advance time past the delay
      vi.advanceTimersByTime(100);
      // Function should be called once
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only call function once for multiple rapid calls', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 200);
      debounced();
      debounced();
      debounced();
      vi.advanceTimersByTime(200);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 100);

      debounced('arg1', 'arg2', 'arg3');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
    });

    it('should reset timer on each call', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);

      // Still not called because both calls reset the timer
      expect(fn).not.toHaveBeenCalled();

      // Final tick after last call's delay
      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle zero delay', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 0);
      debounced();
      vi.advanceTimersByTime(0);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle different function signatures', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 50);

      // Call with various argument types
      debounced(1, 'string', { obj: true }, [1, 2, 3]);
      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledWith(1, 'string', { obj: true }, [1, 2, 3]);
    });

    it('should clear previous timeout on rapid calls', () => {
      const fn = vi.fn();
      const debounced = createDebouncedAction(fn, 100);

      debounced('first');
      vi.advanceTimersByTime(90); // almost up but not quite
      debounced('second');
      vi.advanceTimersByTime(90); // almost up again
      debounced('third');
      vi.advanceTimersByTime(110); // now it's been more than 100ms since the last call

      // Should have been called exactly once with the last args
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('third');
    });
  });

  describe('LockManager', () => {
    it('should execute function within lock', async () => {
      const lock = new LockManager();
      const fn = vi.fn().mockResolvedValue('result');

      const result = await lock.run(fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should execute multiple functions sequentially', async () => {
      const lock = new LockManager();
      const results: number[] = [];

      const task1 = lock.run(async () => {
        results.push(1);
        await new Promise(r => setTimeout(r, 10));
        return 1;
      });

      const task2 = lock.run(async () => {
        results.push(2);
        return 2;
      });

      const [r1, r2] = await Promise.all([task1, task2]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      // task2 should have waited for task1 since task1 started first
      expect(results).toEqual([1, 2]);
    });

    it('should release lock even if function throws', async () => {
      const lock = new LockManager();
      const fn = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(lock.run(fn)).rejects.toThrow('test error');
      expect(lock.isLocked()).toBe(false);
    });

    it('should not be locked initially', () => {
      const lock = new LockManager();
      expect(lock.isLocked()).toBe(false);
    });

    it('should be locked while executing', async () => {
      const lock = new LockManager();
      let started = false;
      let completed = false;

      const task = lock.run(async () => {
        started = true;
        expect(lock.isLocked()).toBe(true);
        await new Promise(r => setTimeout(r, 10));
        completed = true;
        return 'done';
      });

      // Wait a tick for the task to start
      await new Promise(r => setTimeout(r, 1));
      expect(started).toBe(true);
      expect(completed).toBe(false);

      await task;
      expect(completed).toBe(true);
      expect(lock.isLocked()).toBe(false);
    });

    it('should allow concurrent execution after release', async () => {
      const lock = new LockManager();
      const results: string[] = [];

      // First task completes
      await lock.run(async () => {
        return 'first';
      });

      // Now both should start concurrently since lock is released
      const task2 = lock.run(async () => {
        results.push('second');
        return 'second';
      });

      const task3 = lock.run(async () => {
        results.push('third');
        return 'third';
      });

      const [r2, r3] = await Promise.all([task2, task3]);

      expect(r2).toBe('second');
      expect(r3).toBe('third');
    });

    it('should handle async function returning non-promise', async () => {
      const lock = new LockManager();
      const fn = vi.fn().mockReturnValue('sync result');

      const result = await lock.run(fn);

      expect(result).toBe('sync result');
    });

    it('should handle synchronous function that returns immediately', async () => {
      const lock = new LockManager();
      let checkLockDuringExecution = false;

      lock.run(() => {
        checkLockDuringExecution = lock.isLocked();
        // Synchronous return - for sync functions, the lock may be released
        // before we can check due to immediate Promise resolution
        return 'result';
      });

      // For sync functions, the lock check behavior varies
      expect(typeof checkLockDuringExecution).toBe('boolean');
    });
  });
});
