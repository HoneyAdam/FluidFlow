/**
 * Tests for services/generation/promptBuilder
 */

import { describe, it, expect } from 'vitest';
import {
  buildContinuationPrompt,
  buildMissingFilesPrompt,
  buildTruncationRecoveryPrompt,
  calculateRemainingFiles,
  isGenerationComplete,
} from '../../../services/generation/promptBuilder';

describe('services/generation/promptBuilder', () => {
  describe('buildContinuationPrompt', () => {
    it('should include completed and remaining files', () => {
      const prompt = buildContinuationPrompt({
        completedFiles: ['src/App.tsx', 'src/index.ts'],
        remainingFiles: ['src/utils.ts', 'src/styles.css'],
        originalPrompt: 'Build a React app',
      });

      expect(prompt).toContain('Already completed: 2 files');
      expect(prompt).toContain('Remaining: 2 files');
      expect(prompt).toContain('- src/App.tsx');
      expect(prompt).toContain('- src/utils.ts');
      expect(prompt).toContain('Build a React app');
    });

    it('should handle empty completed files', () => {
      const prompt = buildContinuationPrompt({
        completedFiles: [],
        remainingFiles: ['src/App.tsx'],
        originalPrompt: 'Test prompt',
      });

      expect(prompt).toContain('Already completed: 0 files');
    });
  });

  describe('buildMissingFilesPrompt', () => {
    it('should include missing files list', () => {
      const prompt = buildMissingFilesPrompt({
        missingFiles: ['src/Button.tsx', 'src/Header.tsx'],
        accumulatedFiles: { 'src/App.tsx': 'content' },
      });

      expect(prompt).toContain('1. src/Button.tsx');
      expect(prompt).toContain('2. src/Header.tsx');
      expect(prompt).toContain('Generate EXACTLY the 2 files');
    });

    it('should list up to 5 existing files', () => {
      const accumulatedFiles: Record<string, string> = {};
      for (let i = 0; i < 7; i++) {
        accumulatedFiles[`src/file${i}.ts`] = 'content';
      }

      const prompt = buildMissingFilesPrompt({
        missingFiles: ['src/missing.ts'],
        accumulatedFiles,
      });

      expect(prompt).toContain('- src/file0.ts');
      expect(prompt).toContain('... and 2 more files');
    });

    it('should not show "more files" when 5 or fewer exist', () => {
      const accumulatedFiles = {
        'src/a.ts': 'a',
        'src/b.ts': 'b',
      };

      const prompt = buildMissingFilesPrompt({
        missingFiles: ['src/missing.ts'],
        accumulatedFiles,
      });

      expect(prompt).not.toContain('... and');
    });
  });

  describe('buildTruncationRecoveryPrompt', () => {
    it('should include truncated response preview', () => {
      const longResponse = 'x'.repeat(5000);

      const prompt = buildTruncationRecoveryPrompt({
        rawResponse: longResponse,
        originalPrompt: 'Build an app',
        previewStart: 2000,
        previewEnd: 500,
      });

      expect(prompt).toContain('first 2000 chars');
      expect(prompt).toContain('Last 500 chars');
      expect(prompt).toContain('Build an app');
    });

    it('should use default preview values', () => {
      const prompt = buildTruncationRecoveryPrompt({
        rawResponse: 'test response',
        originalPrompt: 'prompt',
        previewStart: 100,
        previewEnd: 50,
      });

      expect(prompt).toContain('first 100 chars');
    });
  });

  describe('calculateRemainingFiles', () => {
    it('should filter out files that exist in accumulated', () => {
      const planned = ['src/App.tsx', 'src/utils.ts', 'src/styles.css'];
      const accumulated = {
        'src/App.tsx': 'content',
        'src/utils.ts': 'content',
      };

      const remaining = calculateRemainingFiles(planned, accumulated);
      expect(remaining).toEqual(['src/styles.css']);
    });

    it('should match by filename when exact path differs', () => {
      const planned = ['components/Button.tsx'];
      const accumulated = {
        'src/components/Button.tsx': 'content',
      };

      const remaining = calculateRemainingFiles(planned, accumulated);
      expect(remaining).toEqual([]);
    });

    it('should return all planned files when none accumulated', () => {
      const planned = ['src/App.tsx', 'src/utils.ts'];

      const remaining = calculateRemainingFiles(planned, {});
      expect(remaining).toEqual(planned);
    });

    it('should return empty when all planned files exist', () => {
      const planned = ['src/App.tsx'];
      const accumulated = { 'src/App.tsx': 'content' };

      const remaining = calculateRemainingFiles(planned, accumulated);
      expect(remaining).toEqual([]);
    });

    it('should handle empty planned files', () => {
      const remaining = calculateRemainingFiles([], { 'src/App.tsx': 'content' });
      expect(remaining).toEqual([]);
    });
  });

  describe('isGenerationComplete', () => {
    it('should return true when no remaining files', () => {
      expect(isGenerationComplete({
        remainingFiles: [],
        totalAccumulated: 5,
        totalPlanned: 5,
      })).toBe(true);
    });

    it('should return true when AI marked complete', () => {
      expect(isGenerationComplete({
        remainingFiles: ['src/missing.ts'],
        totalAccumulated: 4,
        totalPlanned: 5,
        aiMarkedComplete: true,
      })).toBe(true);
    });

    it('should return true when all planned files received', () => {
      expect(isGenerationComplete({
        remainingFiles: ['src/extra.ts'],
        totalAccumulated: 5,
        totalPlanned: 5,
      })).toBe(true);
    });

    it('should return true when AI says no remaining', () => {
      expect(isGenerationComplete({
        remainingFiles: ['src/extra.ts'],
        totalAccumulated: 3,
        totalPlanned: 5,
        aiSaysNoRemaining: true,
      })).toBe(true);
    });

    it('should return false when nothing signals completion', () => {
      expect(isGenerationComplete({
        remainingFiles: ['src/missing.ts'],
        totalAccumulated: 3,
        totalPlanned: 5,
      })).toBe(false);
    });

    it('should return false when AI explicitly says not complete', () => {
      expect(isGenerationComplete({
        remainingFiles: ['src/missing.ts'],
        totalAccumulated: 3,
        totalPlanned: 5,
        aiMarkedComplete: false,
      })).toBe(false);
    });
  });
});
