/**
 * Streaming Types
 *
 * Type definitions for streaming AI response handling.
 */

import type { GenerationRequest, GenerationResponse } from '../../services/ai';
import type { FilePlan, FileProgress } from '../useGenerationState';

// ============================================================================
// Format Types
// ============================================================================

/** Detected response format */
export type StreamingFormat = 'json' | 'marker' | 'tools' | 'unknown';

// ============================================================================
// Callback Types
// ============================================================================

export interface StreamingCallbacks {
  setStreamingChars: (chars: number) => void;
  setStreamingFiles: (files: string[]) => void;
  setStreamingStatus: (status: string) => void;
  setFilePlan: (plan: FilePlan | null) => void;
  updateFileProgress?: (path: string, updates: Partial<FileProgress>) => void;
  initFileProgressFromPlan?: (plan: FilePlan) => void;
}

// ============================================================================
// Result Types
// ============================================================================

export interface StreamingResult {
  fullText: string;
  chunkCount: number;
  detectedFiles: string[];
  streamResponse: GenerationResponse | null;
  currentFilePlan: FilePlan | null;
  /** Detected response format (json or marker) */
  format: StreamingFormat;
  /** Files that were written via tool calls (tool calling mode) */
  filesWritten?: string[];
}

// ============================================================================
// Error Types
// ============================================================================

/** Error thrown when expected format doesn't match actual response */
export class FormatMismatchError extends Error {
  constructor(
    public expectedFormat: StreamingFormat,
    public actualContent: string
  ) {
    super(`Format mismatch: expected ${expectedFormat} format but response doesn't match`);
    this.name = 'FormatMismatchError';
  }
}

// ============================================================================
// Hook Return Type
// ============================================================================

export interface UseStreamingResponseReturn {
  processStreamingResponse: (
    request: GenerationRequest,
    currentModel: string,
    genRequestId: string,
    genStartTime: number,
    /** Expected format - if set, will validate early and throw FormatMismatchError if mismatch */
    expectedFormat?: StreamingFormat
  ) => Promise<StreamingResult>;
}

// ============================================================================
// Progress Types
// ============================================================================

export interface FileProgressResult {
  receivedChars: number;
  progress: number;
  status: 'pending' | 'streaming' | 'complete';
}

// ============================================================================
// Plan Types
// ============================================================================

export interface ParsedFilePlan {
  create: string[];
  delete: string[];
  total: number;
  completed: string[];
  sizes?: Record<string, number>;
}
