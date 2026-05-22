/**
 * Unified Parser
 *
 * Handles both JSON and Marker format AI responses with automatic detection.
 * Provides a single entry point for parsing any AI response format.
 */

import { parseAIResponse } from './aiResponseParser';
import {
  isMarkerFormat,
  parseMarkerFormatResponse,
  extractMarkerFileList,
  getMarkerStreamingStatus,
} from './markerFormat';
import { parseMultiFileResponse, GenerationMeta } from './multiFileParser';

// ============================================================================
// Types
// ============================================================================

/** Response format type */
export type ResponseFormatType = 'json' | 'marker';

/** Unified parsed response */
export interface UnifiedParsedResponse {
  format: ResponseFormatType;
  files: Record<string, string>;
  explanation?: string;
  truncated?: boolean;
  deletedFiles?: string[];
  generationMeta?: GenerationMeta;
  /** Files that were started but not completed (missing closing marker) */
  incompleteFiles?: string[];
}

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detects the response format (JSON vs Marker)
 */
export function detectResponseFormat(response: string): ResponseFormatType {
  if (isMarkerFormat(response)) {
    return 'marker';
  }
  return 'json';
}

// ============================================================================
// Unified Parser
// ============================================================================

/**
 * Unified parser that handles both JSON and Marker formats.
 * Automatically detects the format and calls the appropriate parser.
 *
 * Uses the new aiResponseParser as backend for robust multi-format handling.
 */
export function parseUnifiedResponse(response: string): UnifiedParsedResponse | null {
  if (!response || !response.trim()) {
    return null;
  }

  // Use the new unified parser from aiResponseParser
  const result = parseAIResponse(response, { aggressiveRecovery: true });

  // Check if we got any files
  if (Object.keys(result.files).length === 0) {
    // Fall back to legacy parsers for backwards compatibility
    return tryLegacyParsers(response);
  }

  // Convert new parser result to UnifiedParsedResponse format
  return convertToUnifiedResponse(result);
}

/**
 * Try legacy parsers for backwards compatibility
 */
function tryLegacyParsers(response: string): UnifiedParsedResponse | null {
  // Check for marker format first (it's more distinctive)
  if (isMarkerFormat(response)) {
    const markerResult = parseMarkerFormatResponse(response);
    if (markerResult) {
      // Log warning if there are incomplete files
      if (markerResult.incompleteFiles && markerResult.incompleteFiles.length > 0) {
        console.warn('[parseUnifiedResponse] Response has incomplete files that will NOT be included:', markerResult.incompleteFiles);
      }

      return {
        format: 'marker',
        files: markerResult.files,
        explanation: markerResult.explanation,
        truncated: markerResult.truncated,
        deletedFiles: markerResult.plan?.delete,
        generationMeta: markerResult.generationMeta,
        incompleteFiles: markerResult.incompleteFiles,
      };
    }
  }

  // Try JSON format
  const jsonResult = parseMultiFileResponse(response, true);
  if (jsonResult) {
    return {
      format: 'json',
      files: jsonResult.files,
      explanation: jsonResult.explanation,
      truncated: jsonResult.truncated,
      deletedFiles: jsonResult.deletedFiles,
      generationMeta: jsonResult.generationMeta,
    };
  }

  return null;
}

/**
 * Convert aiResponseParser result to UnifiedParsedResponse format
 */
function convertToUnifiedResponse(result: ReturnType<typeof parseAIResponse>): UnifiedParsedResponse {
  const format: ResponseFormatType = result.format.startsWith('marker') ? 'marker' : 'json';

  // Convert batch info to generationMeta if present
  let generationMeta: GenerationMeta | undefined;
  if (result.batch) {
    generationMeta = {
      totalFilesPlanned: result.plan
        ? result.plan.create.length + result.plan.update.length
        : Object.keys(result.files).length + (result.batch.remaining?.length || 0),
      filesInThisBatch: Object.keys(result.files),
      completedFiles: result.batch.completed,
      remainingFiles: result.batch.remaining,
      currentBatch: result.batch.current,
      totalBatches: result.batch.total,
      isComplete: result.batch.isComplete,
    };
  }

  // Log warning if there are incomplete files
  if (result.incompleteFiles && result.incompleteFiles.length > 0) {
    console.warn('[parseUnifiedResponse] Response has incomplete files that will NOT be included:', result.incompleteFiles);
  }

  // Log warning if there were recovered files
  if (result.recoveredFiles && result.recoveredFiles.length > 0) {
    console.log('[parseUnifiedResponse] Files recovered from malformed response:', result.recoveredFiles);
  }

  return {
    format,
    files: result.files,
    explanation: result.explanation,
    truncated: result.truncated,
    deletedFiles: result.deletedFiles,
    generationMeta,
    incompleteFiles: result.incompleteFiles,
  };
}

// ============================================================================
// File List Extraction
// ============================================================================

/**
 * Extract file list from response (works with both formats)
 */
export function extractFileListUnified(response: string): string[] {
  if (isMarkerFormat(response)) {
    return extractMarkerFileList(response);
  }

  // JSON format - use existing extraction
  const files = new Set<string>();

  // Try to parse PLAN comment
  const planMatch = response.match(/\/\/\s*PLAN:\s*(\{[\s\S]*?\})/);
  if (planMatch) {
    try {
      const plan = JSON.parse(planMatch[1] ?? '{}');
      if (plan.create) plan.create.forEach((f: string) => files.add(f));
      if (plan.update) plan.update.forEach((f: string) => files.add(f));
    } catch {
      // Ignore parse errors
    }
  }

  // Extract from JSON keys using matchAll
  const pattern = /"([^"]+\.(tsx?|jsx?|css|json|md|sql|ts|js))"\s*:/g;
  const matches = [...response.matchAll(pattern)];
  for (const match of matches) {
    if (match[1]) files.add(match[1]);
  }

  return Array.from(files).sort();
}

// ============================================================================
// Streaming Status
// ============================================================================

/**
 * Get streaming status from response (works with both formats)
 */
export function getStreamingStatusUnified(response: string, detectedFiles: Set<string>): {
  pending: string[];
  streaming: string[];
  complete: string[];
} {
  if (isMarkerFormat(response)) {
    return getMarkerStreamingStatus(response);
  }

  // JSON format - analyze based on detected files and content
  const allFiles = extractFileListUnified(response);
  const complete: string[] = [];
  const streaming: string[] = [];

  for (const file of allFiles) {
    // Check if file content appears complete in JSON
    // A file is complete if we see its closing quote followed by comma or brace
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filePattern = new RegExp(`"${escapedFile}"\\s*:\\s*"[^"]*(?:\\\\.[^"]*)*"\\s*[,}]`);
    if (filePattern.test(response)) {
      complete.push(file);
    } else if (detectedFiles.has(file)) {
      streaming.push(file);
    }
  }

  const completeSet = new Set(complete);
  const streamingSet = new Set(streaming);
  const pending = allFiles.filter(f => !completeSet.has(f) && !streamingSet.has(f));

  return { pending, streaming, complete };
}
