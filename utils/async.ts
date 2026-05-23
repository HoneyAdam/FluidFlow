/**
 * Async Utility Functions
 *
 * Reusable utilities for common async patterns:
 * - Debouncing actions
 * - Lock-based concurrency control
 */

/**
 * Creates a debounced version of an async function
 *
 * @param fn - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns A debounced function that can be called multiple times
 *
 * @example
 * ```typescript
 * const debouncedSave = createDebouncedAction(
 *   () => saveToStorage(),
 *   300
 * );
 *
 * // Multiple rapid calls only execute once after delay
 * debouncedSave();
 * debouncedSave();
 * debouncedSave(); // Only this one executes after 300ms
 * ```
 */
export function createDebouncedAction<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, delay);
  };
}

/**
 * Lock manager for easier lock handling
 * Encapsulates the lock promise and provides a clean API
 */
export class LockManager {
  private lock: Promise<void> = Promise.resolve();
  private _locked = false;

  /**
   * Execute a function with lock protection
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previousLock = this.lock;
    let releaseLock: () => void = () => {};

    this.lock = new Promise((resolve) => {
      releaseLock = resolve;
    });
    this._locked = true;

    try {
      await previousLock;
      return await fn();
    } finally {
      this._locked = false;
      releaseLock();
    }
  }

  /**
   * Check if the lock is currently held
   */
  isLocked(): boolean {
    return this._locked;
  }
}