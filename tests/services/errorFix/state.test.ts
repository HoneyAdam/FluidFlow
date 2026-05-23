/**
 * Error Fix State Tests
 *
 * Tests for fix state management and error tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixState, getErrorSignature, fixState } from '../../../services/errorFix/state';
import type { FixAttempt } from '../../../services/errorFix/types';

describe('Error Fix State', () => {
  let state: FixState;

  beforeEach(() => {
    state = new FixState();
  });

  describe('getErrorSignature', () => {
    it('should normalize error messages', () => {
      const sig1 = getErrorSignature('Cannot find module "./utils"');
      const sig2 = getErrorSignature('CANNOT FIND MODULE "./utils"');

      expect(sig1).toBe(sig2);
    });

    it('should remove line numbers', () => {
      const sig = getErrorSignature('Error at line 42: something failed');

      expect(sig).not.toContain('42');
      expect(sig).toContain('line X');
    });

    it('should remove file paths', () => {
      const sig = getErrorSignature('Error in /Users/name/project/src/App.tsx:10');

      expect(sig).not.toContain('/Users');
      expect(sig).not.toContain('src/App');
    });

    it('should truncate to 200 characters', () => {
      const longError = 'Error: ' + 'x'.repeat(300);
      const sig = getErrorSignature(longError);

      expect(sig.length).toBeLessThanOrEqual(200);
    });

    it('should keep quoted values as placeholders', () => {
      const sig = getErrorSignature("Error: 'specific-value'");

      expect(sig).toContain("'X'");
      expect(sig).not.toContain('specific-value');
    });

    it('should handle colon-separated line/column format', () => {
      const sig = getErrorSignature('Error at src/App.tsx:10:5 something');

      expect(sig).not.toContain(':10:5');
    });
  });

  describe('recordAttempt', () => {
    it('should record successful fix attempt', () => {
      state.recordAttempt('Test error message', 'local-simple', true);

      const history = state.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(true);
      expect(history[0].fixApplied).toBe('local-simple');
    });

    it('should record failed fix attempt', () => {
      state.recordAttempt('Test error', null, false);

      const history = state.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(false);
    });

    it('should increment attempt count for same error', () => {
      state.recordAttempt('Same error', 'local-simple', false);
      state.recordAttempt('Same error', 'ai-quick', false);
      state.recordAttempt('Same error', 'ai-full', true);

      expect(state.getAttemptCount('Same error')).toBe(3);
    });

    it('should trim history to max size', () => {
      for (let i = 0; i < 60; i++) {
        state.recordAttempt(`Error ${i}`, 'strategy', false);
      }

      const history = state.getHistory();
      expect(history.length).toBeLessThanOrEqual(50);
    });
  });

  describe('wasRecentlyFixed', () => {
    it('should return true for recently fixed errors', () => {
      state.recordAttempt('Recent error', 'local-simple', true);

      expect(state.wasRecentlyFixed('Recent error')).toBe(true);
    });

    it('should return false for new errors', () => {
      expect(state.wasRecentlyFixed('Brand new error')).toBe(false);
    });

    it('should return false for failed attempts', () => {
      state.recordAttempt('Failed error', 'local-simple', false);

      expect(state.wasRecentlyFixed('Failed error')).toBe(false);
    });
  });

  describe('shouldSkip', () => {
    it('should skip recently fixed errors', () => {
      state.recordAttempt('Recent fix', 'local-simple', true);

      const result = state.shouldSkip('Recent fix');

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('Recently fixed');
    });

    it('should skip after max attempts', () => {
      for (let i = 0; i < 3; i++) {
        state.recordAttempt('Stubborn error', 'strategy', false);
      }

      const result = state.shouldSkip('Stubborn error');

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('Max attempts');
    });

    it('should not skip new errors', () => {
      const result = state.shouldSkip('New error that needs fixing');

      expect(result.skip).toBe(false);
    });

    it('should not skip after fewer than max attempts', () => {
      state.recordAttempt('Error', 'strategy', false);
      state.recordAttempt('Error', 'strategy', false);

      const result = state.shouldSkip('Error');

      expect(result.skip).toBe(false);
    });
  });

  describe('getAttemptCount', () => {
    it('should return 0 for new errors', () => {
      expect(state.getAttemptCount('Unknown error')).toBe(0);
    });

    it('should return correct count for known errors', () => {
      state.recordAttempt('Test', 's1', false);
      state.recordAttempt('Test', 's2', false);
      state.recordAttempt('Test', 's3', false);
      state.recordAttempt('Test', 's4', true);

      expect(state.getAttemptCount('Test')).toBe(4);
    });
  });

  describe('resetError', () => {
    it('should clear attempt count for error', () => {
      state.recordAttempt('Error', 'strategy', false);
      state.recordAttempt('Error', 'strategy', false);

      state.resetError('Error');

      expect(state.getAttemptCount('Error')).toBe(0);
    });

    it('should clear recent fix status', () => {
      state.recordAttempt('Error', 'strategy', true);

      state.resetError('Error');

      expect(state.wasRecentlyFixed('Error')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      state.recordAttempt('Error 1', 's1', true);
      state.recordAttempt('Error 2', 's2', false);
      state.recordAttempt('Error 3', 's3', true);

      state.reset();

      expect(state.getHistory()).toEqual([]);
      expect(state.getAttemptCount('Error 1')).toBe(0);
      expect(state.wasRecentlyFixed('Error 1')).toBe(false);
    });
  });

  describe('getHistory', () => {
    it('should return copy of history', () => {
      state.recordAttempt('Error 1', 'strategy', true);
      state.recordAttempt('Error 2', 'strategy', false);

      const history1 = state.getHistory();
      const history2 = state.getHistory();

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);
    });

    it('should return entries in order', () => {
      state.recordAttempt('First', 's1', false);
      state.recordAttempt('Second', 's2', true);
      state.recordAttempt('Third', 's3', false);

      const history = state.getHistory();

      expect(history[0].errorMessage).toBe('First');
      expect(history[1].errorMessage).toBe('Second');
      expect(history[2].errorMessage).toBe('Third');
    });
  });

  describe('singleton export', () => {
    it('should export fixState singleton', () => {
      expect(fixState).toBeDefined();
      expect(fixState).toBeInstanceOf(FixState);
    });

    it('should share state across exports', () => {
      const sig1 = getErrorSignature('Shared error');
      fixState.recordAttempt('Shared error', 'strategy', true);

      expect(fixState.wasRecentlyFixed('Shared error')).toBe(true);
    });
  });
});