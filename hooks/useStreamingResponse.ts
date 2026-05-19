/**
 * useStreamingResponse Hook
 *
 * Handles streaming AI responses for tool calling mode.
 * File operations are handled via tool calls, not text parsing.
 */

import { useCallback, useRef } from 'react';
import { debugLog } from './useDebugStore';
import { getProviderManager, GenerationRequest, GenerationResponse } from '../services/ai';

// Re-export types
export type {
  StreamingFormat,
  StreamingCallbacks,
  StreamingResult,
  UseStreamingResponseReturn,
} from './streaming';

import {
  type StreamingCallbacks,
  type StreamingResult,
  type UseStreamingResponseReturn,
  type StreamingFormat,
} from './streaming';

/**
 * Module-level store for the last AI response data.
 * Used for error recovery when streaming fails mid-response.
 */
export interface LastAIResponseData {
  raw: string;
  timestamp: number;
  chars: number;
  filesDetected: string[];
  format: string;
}

let _lastAIResponse: LastAIResponseData | null = null;

export function setLastAIResponse(data: LastAIResponseData): void {
  _lastAIResponse = data;
}

export function getLastAIResponse(): LastAIResponseData | null {
  return _lastAIResponse;
}

/**
 * Hook for handling streaming AI responses
 * Tool calling handles all file operations
 */
export function useStreamingResponse(callbacks: StreamingCallbacks): UseStreamingResponseReturn {
  const {
    setStreamingChars,
    setStreamingStatus,
    setStreamingFiles,
  } = callbacks;

  const fullTextRef = useRef('');

  /**
   * Process streaming response in tool calling mode
   * Files are written via tool calls, not parsed from text
   */
  const processStreamingResponse = useCallback(
    async (
      request: GenerationRequest,
      currentModel: string,
      genRequestId: string,
      genStartTime: number,
    ): Promise<StreamingResult> => {
      const manager = getProviderManager();
      fullTextRef.current = '';
      let fullText = '';
      let chunkCount = 0;
      let streamResponse: GenerationResponse | null = null;

      // Create initial stream log entry
      const streamLogId = `stream-${genRequestId}`;
      debugLog.stream('generation', {
        id: streamLogId,
        model: currentModel,
        response: 'Streaming started (tool calling mode)...',
        metadata: {
          chunkCount: 0,
          totalChars: 0,
          status: 'streaming',
          toolCallingEnabled: !!request.toolExecutor,
          tools: request.tools?.map(t => t.name) ?? [],
        },
      });

      // Use streaming API - tool calling handles file operations
      streamResponse = await manager.generateStream(
        request,
        (chunk) => {
          const chunkText = chunk.text || '';
          fullText += chunkText;
          fullTextRef.current = fullText;
          chunkCount++;
          setStreamingChars(fullText.length);
          setStreamingStatus(`⚡ Generating... (${Math.round(fullText.length / 1024)}KB)`);
        },
        currentModel
      );

      // Mark stream as complete
      console.log('[Generation] Stream complete:', {
        chars: fullText.length,
        chunks: chunkCount,
        filesWritten: streamResponse?.filesWritten?.length ?? 0,
      });

      try {
        debugLog.streamUpdate(
          streamLogId,
          {
            response: `Completed: ${Math.round(fullText.length / 1024)}KB, ${chunkCount} chunks`,
            metadata: {
              chunkCount,
              totalChars: fullText.length,
              status: 'complete',
              toolCallingEnabled: !!request.toolExecutor,
              filesWritten: streamResponse?.filesWritten,
            },
          },
          true
        );
      } catch (e) {
        console.debug('[Debug] Final stream update failed:', e);
      }

      // Save raw response for debugging
      setLastAIResponse({
        raw: fullText,
        timestamp: Date.now(),
        chars: fullText.length,
        filesDetected: [],
        format: 'tool-calling',
      });

      // Get files written via tool calls
      const filesWritten = streamResponse?.filesWritten;
      console.log('[Streaming] Response complete. Tool calling filesWritten:', filesWritten?.length ?? 0);

      // Update streaming status with files info
      if (filesWritten && filesWritten.length > 0) {
        setStreamingStatus(`✅ Done! ${filesWritten.length} file(s) written via tool calling`);
        setStreamingFiles(filesWritten);
      }

      return {
        fullText,
        chunkCount,
        detectedFiles: [],
        streamResponse,
        currentFilePlan: null,
        format: 'tool-calling' as StreamingFormat,
        filesWritten
      };
    },
    [setStreamingChars, setStreamingStatus, setStreamingFiles]
  );

  return { processStreamingResponse };
}