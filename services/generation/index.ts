/**
 * Generation Services
 *
 * Service layer for code generation, providing testable business logic
 * extracted from React hooks.
 *
 * @module services/generation
 *
 * Structure:
 * - services/generation/validator.ts           - File validation
 * - services/generation/messageBuilder.ts       - ChatMessage & history entry creation
 * - services/generation/promptBuilder.ts        - Continuation/missing file prompt building
 * - services/generation/retry.ts               - Retry logic & exponential backoff
 * - services/generation/streamingProcessor.ts   - Streaming response state management
 */

// Re-export generation utilities (canonical location remains utils/generationUtils.ts
// until all consumers are migrated)
export {
  calculateFileChanges,
  createTokenUsage,
  buildSystemInstruction,
  buildPromptParts,
  markFilesAsShared,
  getFileContextStats,
  getActiveProvider,
  clearFileContext,
} from '../../utils/generationUtils';

// New generation services
export { validateGeneratedFiles, isValidFilePath, isValidFileContent } from './validator';
export { createCompletionMessage, createErrorMessage, createAIHistoryEntry } from './messageBuilder';
export type { CompletionMessageOptions, AIHistoryEntry } from './messageBuilder';
export {
  buildContinuationPrompt,
  buildMissingFilesPrompt,
  buildTruncationRecoveryPrompt,
  calculateRemainingFiles,
  isGenerationComplete,
} from './promptBuilder';
export {
  MAX_RETRY_ATTEMPTS,
  MAX_BATCHES,
  getRetryDelay,
  shouldRetry,
  shouldForceComplete,
  incrementRetryState,
} from './retry';
export {
  setLastAIResponse,
  getLastAIResponse,
  clearLastAIResponse,
} from './streamingProcessor';
export type { LastAIResponseData } from './streamingProcessor';
