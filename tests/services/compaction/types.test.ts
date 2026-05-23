/**
 * Compaction Types Tests
 *
 * Tests for context compaction type definitions.
 */

import { describe, it, expect, type Mock } from 'vitest';
import * as types from '../../../services/compaction/types';

describe('Compaction Types', () => {
  describe('CompactionResult', () => {
    it('should have all required properties', () => {
      const result: types.CompactionResult = {
        compacted: true,
        beforeTokens: 1000,
        afterTokens: 500,
        messagesSummarized: 5,
        summary: 'Summarized conversation',
      };

      expect(result.compacted).toBe(true);
      expect(result.beforeTokens).toBe(1000);
      expect(result.afterTokens).toBe(500);
      expect(result.messagesSummarized).toBe(5);
      expect(result.summary).toBe('Summarized conversation');
    });

    it('should allow optional summary when compacted is false', () => {
      const result: types.CompactionResult = {
        compacted: false,
        beforeTokens: 1000,
        afterTokens: 1000,
        messagesSummarized: 0,
      };

      expect(result.compacted).toBe(false);
      expect(result.summary).toBeUndefined();
    });
  });

  describe('CompactionInfo', () => {
    it('should have all required properties', () => {
      const info: types.CompactionInfo = {
        currentTokens: 80000,
        utilizationPercent: 80,
        messageCount: 100,
        targetTokens: 40000,
        message: 'Context is 80% full. Compact to continue?',
      };

      expect(info.currentTokens).toBe(80000);
      expect(info.utilizationPercent).toBe(80);
      expect(info.messageCount).toBe(100);
      expect(info.targetTokens).toBe(40000);
      expect(info.message).toContain('80%');
    });

    it('should represent low utilization correctly', () => {
      const info: types.CompactionInfo = {
        currentTokens: 20000,
        utilizationPercent: 20,
        messageCount: 25,
        targetTokens: 40000,
        message: 'Context is 20% full.',
      };

      expect(info.utilizationPercent).toBeLessThan(50);
    });
  });

  describe('ContextStats', () => {
    it('should have all required properties', () => {
      const stats: types.ContextStats = {
        currentTokens: 60000,
        remainingTokens: 40000,
        minRemainingTokens: 10000,
        modelContextSize: 100000,
        target: 50000,
        messageCount: 75,
        needsCompaction: true,
        utilizationPercent: 60,
      };

      expect(stats.currentTokens).toBe(60000);
      expect(stats.remainingTokens).toBe(40000);
      expect(stats.minRemainingTokens).toBe(10000);
      expect(stats.modelContextSize).toBe(100000);
      expect(stats.target).toBe(50000);
      expect(stats.messageCount).toBe(75);
      expect(stats.needsCompaction).toBe(true);
      expect(stats.utilizationPercent).toBe(60);
    });

    it('should indicate when compaction is not needed', () => {
      const stats: types.ContextStats = {
        currentTokens: 30000,
        remainingTokens: 70000,
        minRemainingTokens: 10000,
        modelContextSize: 100000,
        target: 50000,
        messageCount: 30,
        needsCompaction: false,
        utilizationPercent: 30,
      };

      expect(stats.needsCompaction).toBe(false);
      expect(stats.remainingTokens).toBeGreaterThan(stats.minRemainingTokens);
    });
  });

  describe('TokenSpaceResult', () => {
    it('should indicate can proceed when space available', () => {
      const result: types.TokenSpaceResult = {
        canProceed: true,
        compacted: false,
      };

      expect(result.canProceed).toBe(true);
      expect(result.compacted).toBe(false);
    });

    it('should indicate cannot proceed with reason', () => {
      const result: types.TokenSpaceResult = {
        canProceed: false,
        compacted: false,
        reason: 'Token limit exceeded',
      };

      expect(result.canProceed).toBe(false);
      expect(result.reason).toBe('Token limit exceeded');
    });

    it('should indicate when compaction was performed', () => {
      const result: types.TokenSpaceResult = {
        canProceed: true,
        compacted: true,
      };

      expect(result.compacted).toBe(true);
    });
  });
});