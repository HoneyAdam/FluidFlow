/**
 * Vitest Global Setup
 * Runs before any test files are loaded
 */

import { beforeAll } from 'vitest';

// Set up browser API mocks before any module loads
beforeAll(() => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
  })();
  Object.defineProperty(global, 'localStorage', { value: localStorageMock });

  // Mock sessionStorage
  const sessionStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
    };
  })();
  Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

  // Mock document
  const documentMock = {
    getElementById: (): null => null,
    querySelector: (): null => null,
    querySelectorAll: (): never[] => [],
    createElement: () => ({
      appendChild: () => {},
      setAttribute: () => {},
      style: {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    head: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
  Object.defineProperty(global, 'document', { value: documentMock });

  // Mock window
  const windowMock = {
    location: { href: '', origin: 'http://localhost' },
    navigator: { userAgent: 'test' },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
  };
  Object.defineProperty(global, 'window', { value: windowMock });

  // Mock crypto
  if (!global.crypto) {
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
      },
    });
  }

  // Mock fetch
  if (typeof global.fetch !== 'function') {
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        blob: () => Promise.resolve(new Blob()),
        headers: new Map(),
      })) as unknown as typeof fetch;
  }

  // Mock URLSearchParams if not available
  if (typeof globalThis.URLSearchParams === 'undefined') {
    class MockURLSearchParams {
      private params: Record<string, string[]> = {};
      constructor(init?: string | Record<string, string>) {
        if (typeof init === 'object' && init !== null) {
          Object.entries(init).forEach(([key, value]) => {
            this.params[key] = [value];
          });
        }
      }
      append(_name: string, _value: string): void {}
      delete(_name: string): void {}
      get(_name: string): string | null { return null; }
      getAll(_name: string): string[] { return []; }
      has(_name: string): boolean { return false; }
      set(_name: string, _value: string): void {}
      toString(): string { return ''; }
    }
    globalThis.URLSearchParams = MockURLSearchParams as unknown as typeof URLSearchParams;
  }
});
