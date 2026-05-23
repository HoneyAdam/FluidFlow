/**
 * Tests for services/generation barrel exports
 */

import { describe, it, expect } from 'vitest';

describe('services/generation/index', () => {
  it('should export validator functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.validateGeneratedFiles).toBeDefined();
    expect(mod.isValidFilePath).toBeDefined();
    expect(mod.isValidFileContent).toBeDefined();
  });

  it('should export messageBuilder functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.createCompletionMessage).toBeDefined();
    expect(mod.createErrorMessage).toBeDefined();
    expect(mod.createAIHistoryEntry).toBeDefined();
  });

  it('should export promptBuilder functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.buildContinuationPrompt).toBeDefined();
    expect(mod.buildMissingFilesPrompt).toBeDefined();
    expect(mod.buildTruncationRecoveryPrompt).toBeDefined();
    expect(mod.calculateRemainingFiles).toBeDefined();
    expect(mod.isGenerationComplete).toBeDefined();
  });

  it('should export retry functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.shouldRetry).toBeDefined();
    expect(mod.shouldForceComplete).toBeDefined();
    expect(mod.getRetryDelay).toBeDefined();
    expect(mod.incrementRetryState).toBeDefined();
    expect(mod.MAX_RETRY_ATTEMPTS).toBe(3);
    expect(mod.MAX_BATCHES).toBe(5);
  });

  it('should export streamingProcessor functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.setLastAIResponse).toBeDefined();
    expect(mod.getLastAIResponse).toBeDefined();
    expect(mod.clearLastAIResponse).toBeDefined();
  });

  it('should re-export generationUtils functions', async () => {
    const mod = await import('../../../services/generation');
    expect(mod.calculateFileChanges).toBeDefined();
    expect(mod.createTokenUsage).toBeDefined();
    expect(mod.getActiveProvider).toBeDefined();
    expect(mod.buildSystemInstruction).toBeDefined();
  });
});
