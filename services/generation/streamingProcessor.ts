/**
 * Streaming Response Processor Service
 *
 * Module-level store for the last AI response data and streaming types.
 * Extracted from useStreamingResponse for testability.
 *
 * @module services/generation/streamingProcessor
 */

/**
 * Data stored for the last AI response.
 * Used for error recovery when streaming fails mid-response.
 */
export interface LastAIResponseData {
  raw: string;
  timestamp: number;
  chars: number;
  filesDetected: string[];
  format: string;
}

// Module-level store — persists across hook instances for error recovery
let _lastAIResponse: LastAIResponseData | null = null;

/**
 * Store the last AI response data (for error recovery)
 */
export function setLastAIResponse(data: LastAIResponseData): void {
  _lastAIResponse = data;
}

/**
 * Retrieve the last AI response data (for error recovery)
 */
export function getLastAIResponse(): LastAIResponseData | null {
  return _lastAIResponse;
}

/**
 * Clear the stored last AI response
 */
export function clearLastAIResponse(): void {
  _lastAIResponse = null;
}
