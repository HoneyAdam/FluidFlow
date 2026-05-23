/**
 * Tests for services/generation/messageBuilder
 */

import { describe, it, expect } from 'vitest';
import { createCompletionMessage, createErrorMessage, createAIHistoryEntry } from '../../../services/generation/messageBuilder';

describe('services/generation/messageBuilder', () => {
  describe('createCompletionMessage', () => {
    it('should create a message with explanation and timing', () => {
      const msg = createCompletionMessage({
        explanation: 'Done!',
        currentFiles: { 'src/App.tsx': 'old content' },
        startTime: Date.now() - 1000,
      });

      expect(msg.role).toBe('assistant');
      expect(msg.explanation).toBe('Done!');
      expect(msg.generationTime).toBeGreaterThanOrEqual(1000);
      expect(msg.snapshotFiles).toEqual({ 'src/App.tsx': 'old content' });
    });

    it('should include files when provided', () => {
      const msg = createCompletionMessage({
        explanation: 'Generated!',
        files: { 'src/App.tsx': 'new content' },
        currentFiles: { 'src/App.tsx': 'old content' },
        startTime: Date.now(),
      });

      expect(msg.files).toEqual({ 'src/App.tsx': 'new content' });
      expect(msg.fileChanges).toBeDefined();
      expect(msg.fileChanges!.length).toBeGreaterThan(0);
    });

    it('should include error when provided', () => {
      const msg = createCompletionMessage({
        explanation: 'Failed',
        currentFiles: {},
        startTime: Date.now(),
        error: 'Something went wrong',
      });

      expect(msg.error).toBe('Something went wrong');
    });

    it('should include model and provider info', () => {
      const msg = createCompletionMessage({
        explanation: 'Done',
        currentFiles: {},
        startTime: Date.now(),
        model: 'gpt-4',
        provider: 'OpenAI',
      });

      expect(msg.model).toBe('gpt-4');
      expect(msg.provider).toBe('OpenAI');
    });

    it('should include token usage', () => {
      const msg = createCompletionMessage({
        explanation: 'Done',
        currentFiles: {},
        startTime: Date.now(),
        tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      });

      expect(msg.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 200, totalTokens: 300 });
    });

    it('should not include fileChanges when no files provided', () => {
      const msg = createCompletionMessage({
        explanation: 'Done',
        currentFiles: {},
        startTime: Date.now(),
      });

      expect(msg.fileChanges).toBeUndefined();
    });

    it('should not include empty fileChanges', () => {
      const msg = createCompletionMessage({
        explanation: 'Done',
        files: { 'src/App.tsx': 'same content' },
        currentFiles: { 'src/App.tsx': 'same content' },
        startTime: Date.now(),
      });

      // No changes since old and new are same
      expect(msg.fileChanges).toBeUndefined();
    });
  });

  describe('createErrorMessage', () => {
    it('should create an error ChatMessage', () => {
      const msg = createErrorMessage('Test error', { 'src/App.tsx': 'content' });

      expect(msg.role).toBe('assistant');
      expect(msg.error).toBe('Test error');
      expect(msg.snapshotFiles).toEqual({ 'src/App.tsx': 'content' });
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeDefined();
    });
  });

  describe('createAIHistoryEntry', () => {
    it('should create a complete history entry', () => {
      const entry = createAIHistoryEntry({
        prompt: 'Build an app',
        model: 'gpt-4',
        provider: 'OpenAI',
        hasSketch: true,
        hasBrand: false,
        isUpdate: false,
        rawResponse: 'response text',
        responseChars: 14,
        responseChunks: 5,
        startTime: Date.now() - 2000,
        success: true,
      });

      expect(entry.prompt).toBe('Build an app');
      expect(entry.model).toBe('gpt-4');
      expect(entry.provider).toBe('OpenAI');
      expect(entry.hasSketch).toBe(true);
      expect(entry.hasBrand).toBe(false);
      expect(entry.isUpdate).toBe(false);
      expect(entry.success).toBe(true);
      expect(entry.durationMs).toBeGreaterThanOrEqual(2000);
    });

    it('should include optional fields when provided', () => {
      const entry = createAIHistoryEntry({
        prompt: 'Fix',
        model: 'gpt-4',
        provider: 'OpenAI',
        hasSketch: false,
        hasBrand: false,
        isUpdate: true,
        rawResponse: '',
        responseChars: 0,
        responseChunks: 0,
        startTime: Date.now(),
        success: false,
        truncated: true,
        error: 'Failed',
      });

      expect(entry.truncated).toBe(true);
      expect(entry.error).toBe('Failed');
    });
  });
});
