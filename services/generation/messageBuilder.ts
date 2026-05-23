/**
 * Message Builder Service
 *
 * Creates ChatMessage objects and AI history entries for generation results.
 * Extracted from useContinuationGeneration for testability.
 *
 * @module services/generation/messageBuilder
 */

import type { FileSystem, ChatMessage, FileChange } from '../../types';
import { calculateFileChanges } from '../../utils/generationUtils';

/**
 * Options for creating a completion message
 */
export interface CompletionMessageOptions {
  explanation: string;
  files?: FileSystem;
  currentFiles: FileSystem;
  model?: string;
  provider?: string;
  startTime: number;
  tokenUsage?: ChatMessage['tokenUsage'];
  error?: string;
}

/**
 * Create a ChatMessage for generation completion or error.
 * Calculates file changes automatically when files are provided.
 */
export function createCompletionMessage(opts: CompletionMessageOptions): ChatMessage {
  const fileChanges: FileChange[] | undefined = opts.files
    ? calculateFileChanges(opts.currentFiles, opts.files)
    : undefined;

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
    explanation: opts.explanation,
    ...(opts.error && { error: opts.error }),
    ...(opts.files && { files: opts.files }),
    ...(fileChanges && fileChanges.length > 0 && { fileChanges }),
    snapshotFiles: { ...opts.currentFiles },
    ...(opts.model && { model: opts.model }),
    ...(opts.provider && { provider: opts.provider }),
    generationTime: Date.now() - opts.startTime,
    ...(opts.tokenUsage && { tokenUsage: opts.tokenUsage }),
  };
}

/**
 * Create an error ChatMessage for failed generation
 */
export function createErrorMessage(error: string, currentFiles: FileSystem): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
    error,
    snapshotFiles: { ...currentFiles },
  };
}

/**
 * AI History entry for tracking generation attempts
 */
export interface AIHistoryEntry {
  timestamp: number;
  prompt: string;
  model: string;
  provider: string;
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  durationMs: number;
  success: boolean;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  error?: string;
}

/**
 * Create an AI history entry from generation results
 */
export function createAIHistoryEntry(opts: {
  prompt: string;
  model: string;
  provider: string;
  hasSketch: boolean;
  hasBrand: boolean;
  isUpdate: boolean;
  rawResponse: string;
  responseChars: number;
  responseChunks: number;
  startTime: number;
  success: boolean;
  truncated?: boolean;
  filesGenerated?: string[];
  explanation?: string;
  error?: string;
}): AIHistoryEntry {
  return {
    timestamp: Date.now(),
    prompt: opts.prompt,
    model: opts.model,
    provider: opts.provider,
    hasSketch: opts.hasSketch,
    hasBrand: opts.hasBrand,
    isUpdate: opts.isUpdate,
    rawResponse: opts.rawResponse,
    responseChars: opts.responseChars,
    responseChunks: opts.responseChunks,
    durationMs: Date.now() - opts.startTime,
    success: opts.success,
    truncated: opts.truncated,
    filesGenerated: opts.filesGenerated,
    explanation: opts.explanation,
    error: opts.error,
  };
}
