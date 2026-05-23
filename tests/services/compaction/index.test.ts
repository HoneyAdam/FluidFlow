/**
 * Compaction Index Tests
 *
 * Tests for compaction module barrel exports.
 */

import { describe, it, expect } from 'vitest';
import * as compaction from '../../../services/compaction/index';
import type {
  CompactionResult,
  CompactionInfo,
  ContextStats,
  TokenSpaceResult,
} from '../../../services/compaction/types';

describe('Compaction Index', () => {
  describe('exports', () => {
    it('should export CompactionResult type', () => {
      const result: CompactionResult = {
        compacted: true,
        beforeTokens: 1000,
        afterTokens: 500,
        messagesSummarized: 3,
        summary: 'Previous messages summarized',
      };

      expect(result.compacted).toBe(true);
      expect(result.summary).toBe('Previous messages summarized');
    });

    it('should export CompactionInfo type', () => {
      const info: CompactionInfo = {
        currentTokens: 75000,
        utilizationPercent: 75,
        messageCount: 50,
        targetTokens: 40000,
        message: 'Context at 75% capacity',
      };

      expect(info.utilizationPercent).toBe(75);
    });

    it('should export ContextStats type', () => {
      const stats: ContextStats = {
        currentTokens: 50000,
        remainingTokens: 50000,
        minRemainingTokens: 10000,
        modelContextSize: 100000,
        target: 60000,
        messageCount: 40,
        needsCompaction: false,
        utilizationPercent: 50,
      };

      expect(stats.needsCompaction).toBe(false);
    });

    it('should export TokenSpaceResult type', () => {
      const space: TokenSpaceResult = {
        canProceed: true,
        compacted: false,
      };

      expect(space.canProceed).toBe(true);
    });
  });

  describe('type compatibility', () => {
    it('should allow assigning between compatible types', () => {
      const result: CompactionResult = {
        compacted: false,
        beforeTokens: 1000,
        afterTokens: 1000,
        messagesSummarized: 0,
      };

      const info: CompactionInfo = {
        currentTokens: result.beforeTokens,
        utilizationPercent: 50,
        messageCount: 10,
        targetTokens: 500,
        message: 'Test',
      };

      expect(info.currentTokens).toBe(result.beforeTokens);
    });
  });
});