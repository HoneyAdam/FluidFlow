/**
 * Tests for services/generation/streamingProcessor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setLastAIResponse,
  getLastAIResponse,
  clearLastAIResponse,
  type LastAIResponseData,
} from '../../../services/generation/streamingProcessor';

describe('services/generation/streamingProcessor', () => {
  beforeEach(() => {
    clearLastAIResponse();
  });

  describe('setLastAIResponse / getLastAIResponse', () => {
    it('should store and retrieve response data', () => {
      const data: LastAIResponseData = {
        raw: 'test response',
        timestamp: Date.now(),
        chars: 13,
        filesDetected: ['src/App.tsx'],
        format: 'tool-calling',
      };

      setLastAIResponse(data);
      const retrieved = getLastAIResponse();

      expect(retrieved).toEqual(data);
    });

    it('should return null when no response stored', () => {
      expect(getLastAIResponse()).toBeNull();
    });

    it('should overwrite previous response', () => {
      setLastAIResponse({
        raw: 'first',
        timestamp: 1,
        chars: 5,
        filesDetected: [],
        format: 'json',
      });

      setLastAIResponse({
        raw: 'second',
        timestamp: 2,
        chars: 6,
        filesDetected: ['src/App.tsx'],
        format: 'marker',
      });

      const retrieved = getLastAIResponse();
      expect(retrieved?.raw).toBe('second');
      expect(retrieved?.filesDetected).toEqual(['src/App.tsx']);
    });
  });

  describe('clearLastAIResponse', () => {
    it('should clear stored response', () => {
      setLastAIResponse({
        raw: 'test',
        timestamp: Date.now(),
        chars: 4,
        filesDetected: [],
        format: 'json',
      });

      clearLastAIResponse();
      expect(getLastAIResponse()).toBeNull();
    });
  });
});
