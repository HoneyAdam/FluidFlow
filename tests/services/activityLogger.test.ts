/**
 * Activity Logger Service - Full Test Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as activityLogger from '../../services/activityLogger';

describe('Activity Logger Service', () => {
  // Create a fresh instance for each test
  let logger: typeof activityLogger.activityLogger;

  beforeEach(() => {
    // Create a new logger instance for testing
    logger = activityLogger.activityLogger;
    // Access internals by clearing logs
    logger.clear();
  });

  describe('log', () => {
    it('should add log entry with all fields', () => {
      const entry = logger.log('info', 'ai', 'Test message', 'Test details');

      expect(entry.id).toMatch(/^log-\d+-\d+$/);
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.level).toBe('info');
      expect(entry.category).toBe('ai');
      expect(entry.message).toBe('Test message');
      expect(entry.details).toBe('Test details');
    });

    it('should limit logs to maxLogs (500)', () => {
      // Create a new instance with access to private maxLogs
      // Fill logs beyond the 500 limit to test trimming
      const logs = logger.getLogs();
      const initialCount = logs.length;
      
      // Add 501 logs to trigger the trimming logic
      for (let i = 0; i < 501; i++) {
        logger.log('info', 'system', `Log entry ${i}`);
      }
      
      // After adding 501, the old logs should be trimmed
      // The result should be close to maxLogs (500), not 501 + initial
      const finalLogs = logger.getLogs();
      expect(finalLogs.length).toBeLessThanOrEqual(500);
    });
  });

  describe('log levels', () => {
    it('should support info level', () => {
      const entry = logger.info('ai', 'Info message');
      expect(entry.level).toBe('info');
    });

    it('should support success level', () => {
      const entry = logger.success('ai', 'Success message');
      expect(entry.level).toBe('success');
    });

    it('should support warning level', () => {
      const entry = logger.warn('ai', 'Warning message');
      expect(entry.level).toBe('warning');
    });

    it('should support error level', () => {
      const entry = logger.error('ai', 'Error message');
      expect(entry.level).toBe('error');
    });

    it('should support debug level', () => {
      const entry = logger.debug('ai', 'Debug message');
      expect(entry.level).toBe('debug');
    });
  });

  describe('startTimed', () => {
    it('should return a function to complete the timed log', () => {
      const complete = logger.startTimed('generation', 'Operation name');
      
      const logs = logger.getLogs();
      expect(logs[0].message).toBe('Operation name...');
      expect(logs[0].level).toBe('info');

      // Complete the timed operation
      complete();

      const updatedLogs = logger.getLogs();
      const completedEntry = updatedLogs.find(l => l.message === 'Operation name');
      expect(completedEntry).toBeDefined();
      expect(completedEntry?.level).toBe('success');
      expect(completedEntry?.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('subscribe', () => {
    it('should call subscriber for new log entries', () => {
      const subscriber = vi.fn();
      const unsubscribe = logger.subscribe(subscriber);

      logger.log('info', 'ai', 'Test message');

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test message',
        level: 'info',
      }));

      unsubscribe();
      logger.log('info', 'ai', 'Another message');
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const subscriber = vi.fn();
      const unsubscribe = logger.subscribe(subscriber);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      logger.log('info', 'ai', 'Message after unsubscribe');
      expect(subscriber).toHaveBeenCalledTimes(0);
    });
  });

  describe('getLogs', () => {
    it('should return all logs', () => {
      logger.log('info', 'system', 'Log 1');
      logger.log('success', 'ai', 'Log 2');

      const logs = logger.getLogs();
      expect(logs.length).toBe(2);
    });

    it('should return a copy, not the original array', () => {
      logger.log('info', 'system', 'Test log');
      const logs1 = logger.getLogs();
      const logs2 = logger.getLogs();

      expect(logs1).not.toBe(logs2);
      logs1.push({} as any);
      expect(logs2.length).toBe(1);
    });
  });

  describe('getLogsByCategory', () => {
    it('should filter logs by category', () => {
      logger.log('info', 'ai', 'AI log');
      logger.log('info', 'git', 'Git log');
      logger.log('info', 'ai', 'Another AI log');

      const aiLogs = logger.getLogsByCategory('ai');
      expect(aiLogs.length).toBe(2);
      expect(aiLogs.every(l => l.category === 'ai')).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      const logs = logger.getLogsByCategory('preview');
      expect(logs.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all logs', () => {
      logger.log('info', 'system', 'Log 1');
      logger.log('info', 'ai', 'Log 2');

      logger.clear();

      const logs = logger.getLogs();
      expect(logs.length).toBe(0);
    });

    it('should notify subscribers of clear event', () => {
      const subscriber = vi.fn();
      logger.subscribe(subscriber);

      logger.clear();

      expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
        id: 'clear',
        message: 'Logs cleared',
      }));
    });
  });
});

describe('Activity Logger Helpers', () => {
  describe('formatLogTime', () => {
    it('should format timestamp as HH:MM:SS', () => {
      const timestamp = new Date('2024-01-15T14:30:45').getTime();
      const formatted = activityLogger.formatLogTime(timestamp);

      expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('getCategoryColor', () => {
    it('should return color for each category', () => {
      const categories: activityLogger.LogCategory[] = [
        'system', 'ai', 'git', 'backup', 'autocommit', 'preview', 'api', 'file', 'generation'
      ];

      categories.forEach(category => {
        const color = activityLogger.getCategoryColor(category);
        expect(color).toMatch(/^var\(--/);
      });
    });
  });

  describe('getLevelStyle', () => {
    it('should return style for each level', () => {
      const levels: activityLogger.LogLevel[] = ['info', 'success', 'warning', 'error', 'debug'];

      levels.forEach(level => {
        const style = activityLogger.getLevelStyle(level);
        expect(style).toHaveProperty('color');
        expect(style).toHaveProperty('bgColor');
        expect(style.color).toMatch(/^var\(--/);
        expect(style.bgColor).toMatch(/^var\(--/);
      });
    });

    it('should default to info style for unknown level', () => {
      const style = activityLogger.getLevelStyle('unknown' as any);
      const infoStyle = activityLogger.getLevelStyle('info');
      expect(style).toEqual(infoStyle);
    });
  });
});