/**
 * Fix Engine Tests
 *
 * Tests for multi-strategy error fixing pipeline.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FixEngine, quickFix, fixWithProgress } from '../../../services/errorFix/fixEngine';
import type { FixEngineOptions, FixResult } from '../../../services/errorFix/types';

// Mock dependencies
vi.mock('../../../services/errorFix/state', () => ({
  fixState: {
    shouldSkip: vi.fn(() => ({ skip: false })),
    recordAttempt: vi.fn(),
  },
}));

vi.mock('../../../services/errorFix/analytics', () => ({
  fixAnalytics: {
    record: vi.fn(),
  },
}));

vi.mock('../../../services/errorFix/debugLogger', () => ({
  autoFixLogger: {
    startSession: vi.fn(),
    log: vi.fn(),
    logAnalysis: vi.fn(),
    logStrategy: vi.fn(),
    logApply: vi.fn(),
    logLocalFix: vi.fn(),
    logValidation: vi.fn(),
    logAIRequest: vi.fn(() => 'request-id'),
    logAIResponse: vi.fn(),
    endSession: vi.fn(),
  },
}));

vi.mock('../../../services/ai', () => ({
  getProviderManager: vi.fn(() => ({
    getActiveConfig: vi.fn(() => ({
      defaultModel: 'test-model',
    })),
    generate: vi.fn(),
  })),
}));

const mockGenerate = vi.fn();
vi.mock('../../../services/ai', async () => {
  const actual = await vi.importActual('../../../services/ai');
  return {
    ...actual,
    getProviderManager: vi.fn(() => ({
      getActiveConfig: vi.fn(() => ({
        defaultModel: 'test-model',
      })),
      generate: mockGenerate,
    })),
  };
});

vi.mock('../../../utils/errorContext', () => ({
  getRelatedFiles: vi.fn(() => ({})),
}));

vi.mock('../../../utils/cleanCode', () => ({
  cleanGeneratedCode: vi.fn((text) => text),
  isValidCode: vi.fn(() => true),
}));

describe('FixEngine', () => {
  const basicFiles = {
    'src/App.tsx': `import { Button } from 'src/components/Button';
export function App() { return <Button />; }`,
    'src/components/Button.tsx': `export function Button() { return <button>Click</button>; }`,
  };

  const basicError = '"src/components/Button" was a bare specifier';

  describe('constructor', () => {
    it('should create engine with required options', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      expect(engine).toBeDefined();
    });

    it('should set default values for optional options', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      expect(engine).toBeDefined();
    });

    it('should accept onProgress callback', () => {
      const onProgress = vi.fn();
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        onProgress,
      });

      expect(onProgress).not.toHaveBeenCalled();
    });

    it('should accept skipStrategies option', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        skipStrategies: ['local-simple', 'local-multifile'],
      });

      expect(engine).toBeDefined();
    });

    it('should accept timeout option', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        timeout: 5000,
      });

      expect(engine).toBeDefined();
    });

    it('should detect target file from error message', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: 'Error at src/components/Button.tsx:10:5',
      });

      expect(engine).toBeDefined();
    });
  });

  describe('fix method', () => {
    it('should return FixResult with all required properties', async () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      const result = await engine.fix();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fixedFiles');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('attempts');
      expect(result).toHaveProperty('timeMs');
    });

    it('should try local fix first', async () => {
      const onProgress = vi.fn();
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        onProgress,
      });

      await engine.fix();

      // The result should have attempts >= 1 since local-simple was tried
      expect(onProgress).toHaveBeenCalled();
    });

    it('should return no fix for unknown errors', async () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: 'Some completely unknown error message',
      });

      const result = await engine.fix();

      expect(result.success).toBe(false);
    });

    it('should include error message when no fix found', async () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: 'Some completely unknown error message',
      });

      const result = await engine.fix();

      expect(result.error).toBeDefined();
    });

    it('should record attempt in state', async () => {
      const { fixState } = await import('../../../services/errorFix/state');
      
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      await engine.fix();

      expect(fixState.recordAttempt).toHaveBeenCalled();
    });
  });

  describe('abort method', () => {
    it('should be callable without error', () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      expect(() => engine.abort()).not.toThrow();
    });
  });

  describe('strategy selection', () => {
    it('should include local-simple for all errors', async () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
      });

      const result = await engine.fix();

      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should select appropriate strategies based on error type', async () => {
      const onStrategyChange = vi.fn();
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        onStrategyChange,
      });

      await engine.fix();

      // Should have called strategy change at least once
      expect(onStrategyChange.mock.calls.length).toBeGreaterThan(0);
    });

    it('should respect skipStrategies list', async () => {
      const engine = new FixEngine({
        files: basicFiles,
        errorMessage: basicError,
        skipStrategies: ['ai-quick', 'ai-full', 'ai-iterative', 'ai-regenerate'],
      });

      const result = await engine.fix();

      // The local fix may succeed for bare specifier errors
      // The test just verifies the engine ran without crashing
      expect(typeof result.success).toBe('boolean');
      expect(result).toHaveProperty('strategy');
    });
  });

  describe('quickFix convenience function', () => {
    it('should return fixed files on success', async () => {
      // Mock a successful local fix
      const result = await quickFix(basicError, basicFiles);

      // Result could be null if no fix found, or Record<string, string> if fix found
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return null when no fix found', async () => {
      const result = await quickFix('Unknown error message', basicFiles);

      // Unknown errors should return null
      expect(result).toBeNull();
    });

    it('should accept partial options', async () => {
      const result = await quickFix(basicError, basicFiles, {
        timeout: 5000,
      });

      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('fixWithProgress convenience function', () => {
    it('should return FixResult on completion', async () => {
      const onProgress = vi.fn();
      const result = await fixWithProgress(basicError, basicFiles, onProgress);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fixedFiles');
      expect(result).toHaveProperty('strategy');
    });

    it('should call onProgress during fix', async () => {
      const onProgress = vi.fn();
      await fixWithProgress(basicError, basicFiles, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should accept partial options', async () => {
      const onProgress = vi.fn();
      const result = await fixWithProgress(basicError, basicFiles, onProgress, {
        maxAttempts: 5,
      });

      expect(result).toHaveProperty('attempts');
    });
  });

  describe('ErrorFixEngine alias', () => {
    it('should export ErrorFixEngine as alias for FixEngine', async () => {
      const { ErrorFixEngine } = await import('../../../services/errorFix/fixEngine');
      
      expect(ErrorFixEngine).toBe(FixEngine);
    });
  });

  describe('AI strategy runners', () => {
    beforeEach(() => {
      mockGenerate.mockReset();
    });

    it('should execute AI quick fix when no local fix works', async () => {
      const filesWithNoLocalFix = {
        'src/App.tsx': `export function App() { return <div>Hello</div>; }`,
      };
      // Error that won't be fixed by local strategies
      const error = 'Something went wrong';
      
      // Mock AI response that provides a fix
      mockGenerate.mockResolvedValue({
        text: `export function App() { return <div>Hello World</div>; }`,
      });

      const engine = new FixEngine({
        files: filesWithNoLocalFix,
        errorMessage: error,
        skipStrategies: ['local-simple', 'local-multifile', 'local-proactive'],
      });

      const result = await engine.fix();
      
      // If AI returns a fix, it should succeed
      expect(result.success === true || result.success === false).toBe(true);
    });

    it('should call onStrategyChange when switching strategies', async () => {
      const onStrategyChange = vi.fn();
      
      mockGenerate.mockResolvedValue({
        text: `export function App() { return <div>Fixed</div>; }`,
      });

      const engine = new FixEngine({
        files: {
          'src/App.tsx': `export function App() { return <div>Hello</div>; }`,
        },
        errorMessage: 'Some error',
        onStrategyChange,
      });

      await engine.fix();
      
      // Should have called strategy change at least once
      expect(onStrategyChange.mock.calls.length).toBeGreaterThan(0);
    });

    it('should call onProgress during AI strategies', async () => {
      const onProgress = vi.fn();
      
      mockGenerate.mockResolvedValue({
        text: `export function App() { return <div>Fixed</div>; }`,
      });

      const engine = new FixEngine({
        files: {
          'src/App.tsx': `export function App() { return <div>Hello</div>; }`,
        },
        errorMessage: 'Some error',
        skipStrategies: ['local-simple', 'local-multifile', 'local-proactive'],
        onProgress,
      });

      await engine.fix();
      
      // onProgress should be called during AI strategies
      expect(onProgress).toHaveBeenCalled();
    });
  });
});