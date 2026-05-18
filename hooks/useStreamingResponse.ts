/**
 * useStreamingResponse Hook
 *
 * Handles streaming AI responses and file detection during generation.
 * Extracted from useCodeGeneration to reduce complexity.
 * Supports both JSON and Marker response formats.
 *
 * Module structure:
 * - types.ts: Type definitions and error classes
 * - planParsers.ts: Plan parsing for different formats
 * - progressCalculator.ts: File progress calculation
 */

import { useCallback, useRef } from 'react';
import { debugLog } from './useDebugStore';
import { getProviderManager, GenerationRequest, GenerationResponse } from '../services/ai';
import { FilePlan } from './useGenerationState';
import { isMarkerFormat, parseMarkerPlan } from '../utils/markerFormat';

// Re-export types for backward compatibility
export type {
  StreamingFormat,
  StreamingCallbacks,
  StreamingResult,
  UseStreamingResponseReturn,
  FileProgressResult,
  ParsedFilePlan,
} from './streaming';

export { FormatMismatchError } from './streaming';

/**
 * Module-level store for the last AI response data.
 * Used for error recovery when streaming fails mid-response.
 * Replaces unsafe `(window as any).__lastAIResponse` global.
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

// Import utilities from submodules
import {
  type StreamingFormat,
  type StreamingCallbacks,
  type StreamingResult,
  type UseStreamingResponseReturn,
  markerPlanToFilePlan,
  parseFilePlanFromStream,
  parseSimpleCommentPlan,
  calculateFileProgress,
} from './streaming';

// Re-export plan parsers for backward compatibility
export { parseFilePlanFromStream } from './streaming';

/**
 * Hook for handling streaming AI responses
 *
 * Features:
 * - Format auto-detection (JSON/Marker)
 * - Plan parsing during stream
 * - Progress tracking with throttling
 * - File detection as they appear
 */
export function useStreamingResponse(callbacks: StreamingCallbacks): UseStreamingResponseReturn {
  const {
    setStreamingChars,
    setStreamingFiles,
    setStreamingStatus,
    setFilePlan,
    updateFileProgress,
    initFileProgressFromPlan,
  } = callbacks;

  // Ref to hold accumulated text across streaming chunks (for final sweep closures)
  const fullTextRef = useRef('');

  /**
   * Process streaming response and detect files as they appear
   */
  const processStreamingResponse = useCallback(
    async (
      request: GenerationRequest,
      currentModel: string,
      genRequestId: string,
      _genStartTime: number,
      expectedFormat?: StreamingFormat
    ): Promise<StreamingResult> => {
      const manager = getProviderManager();
      fullTextRef.current = '';
      let fullText = '';
      let detectedFiles: string[] = [];
      let chunkCount = 0;
      let streamResponse: GenerationResponse | null = null;
      let currentFilePlan: FilePlan | null = null;
      let planParsed = false;
      let detectedFormat: StreamingFormat = 'unknown';
      let formatValidated = false;

      // Progress tracking state
      let lastProgressUpdate = 0;
      const PROGRESS_UPDATE_INTERVAL = 100; // Throttle updates to every 100ms for smoother UI
      const fileStreamStartTimes = new Map<string, number>(); // Track when each file started streaming
      const completedFiles = new Set<string>(); // Track which files are complete
      const filesContentComplete = new Set<string>(); // Track which files have content complete (for logging)
      const MIN_STREAMING_DURATION = 500; // Minimum time a file should show as "streaming" (ms)
      const COMPLETION_STAGGER_DELAY = 200; // Delay between file completions (ms)

      // Create initial stream log entry
      const streamLogId = `stream-${genRequestId}`;
      debugLog.stream('generation', {
        id: streamLogId,
        model: currentModel,
        response: 'Streaming started...',
        metadata: { chunkCount: 0, totalChars: 0, filesDetected: 0, status: 'streaming' },
      });

      // Use streaming API
      streamResponse = await manager.generateStream(
        request,
        (chunk) => {
          const chunkText = chunk.text || '';
          fullText += chunkText;
          fullTextRef.current = fullText;
          chunkCount++;
          setStreamingChars(fullText.length);

          // Try to detect format and parse file plan from the start of response
          if (!planParsed && fullText.length > 50) {
            // Detect format first (only once)
            if (detectedFormat === 'unknown') {
              if (isMarkerFormat(fullText)) {
                detectedFormat = 'marker';
                console.log('[Stream] Detected MARKER format');
              } else if (fullText.includes('// PLAN:')) {
                detectedFormat = 'json';
                console.log('[Stream] Detected JSON format (legacy with PLAN comment)');
              } else if (fullText.trim().startsWith('{') && (fullText.includes('"meta"') || fullText.includes('"plan"'))) {
                detectedFormat = 'json';
                console.log('[Stream] Detected JSON v2 format');
              } else if (fullText.includes('{"')) {
                detectedFormat = 'json';
                console.log('[Stream] Detected JSON format');
              } else if (/\/\/\s*(?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css)\s*\n/.test(fullText)) {
                // Simple comment format: // filename.tsx followed by code
                detectedFormat = 'json'; // Will be handled by emergencyCodeBlockExtraction
                console.log('[Stream] Detected simple comment format (// filename.ext)');
              }
            }

            // Format validation disabled - parser handles both formats automatically
            // The early abort feature caused too many false positives
            if (expectedFormat === 'marker' && !formatValidated && fullText.length > 200) {
              formatValidated = true;
              console.log('[Stream] Marker format expected, parser will auto-detect');
            }

            // Parse plan based on detected format
            let parsedPlan: FilePlan | null = null;

            if (detectedFormat === 'marker') {
              const markerPlan = parseMarkerPlan(fullText);
              if (markerPlan) {
                parsedPlan = markerPlanToFilePlan(markerPlan);
              }
            } else {
              // Try JSON format first, then simple comment format
              parsedPlan = parseFilePlanFromStream(fullText);
              if (!parsedPlan) {
                parsedPlan = parseSimpleCommentPlan(fullText);
              }
            }

            if (parsedPlan) {
              currentFilePlan = parsedPlan;
              setFilePlan(currentFilePlan);
              planParsed = true;
              console.log(`[Stream] File plan detected (${detectedFormat}):`, currentFilePlan);
              const createCount = parsedPlan.create.length;
              setStreamingStatus(`📋 Plan: ${parsedPlan.total} files (${createCount} to generate)`);

              // Initialize file progress tracking if sizes are available
              if (initFileProgressFromPlan && parsedPlan.sizes) {
                initFileProgressFromPlan({
                  create: parsedPlan.create,
                  delete: parsedPlan.delete,
                  total: parsedPlan.total,
                  completed: [],
                  sizes: parsedPlan.sizes,
                });
                console.log('[Stream] File progress initialized with sizes:', parsedPlan.sizes);
              }
            }
          }

          // Update the stream log every 50 chunks
          if (chunkCount % 50 === 0) {
            try {
              debugLog.streamUpdate(streamLogId, {
                response: `Streaming... ${Math.round(fullText.length / 1024)}KB received`,
                metadata: {
                  chunkCount,
                  totalChars: fullText.length,
                  filesDetected: detectedFiles.length,
                  status: 'streaming',
                },
              });
            } catch (e) {
              console.debug('[Debug] Stream update failed:', e);
            }
          }

          // Try to detect file paths as they appear (format-aware)
          let newMatchedFiles: string[] = [];

          if (detectedFormat === 'marker') {
            // Marker format: look for <!-- FILE:path --> markers
            const markerFileMatches = fullText.match(/<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g);
            if (markerFileMatches) {
              newMatchedFiles = markerFileMatches
                .map((m) => {
                  const pathMatch = m.match(/FILE:([\w./-]+\.[a-zA-Z]+)/);
                  return pathMatch ? pathMatch[1] : '';
                })
                .filter((f) => f && !detectedFiles.includes(f));
            }
          } else {
            // JSON format: look for "path": patterns
            const jsonFileMatches = fullText.match(/"([^"]+\.(tsx?|jsx?|css|json|md|sql))"\s*:/g);
            if (jsonFileMatches) {
              newMatchedFiles = jsonFileMatches
                .map((m) => m.replace(/[":\s]/g, ''))
                .filter((f) => !detectedFiles.includes(f) && !f.includes('\\'));
            }
          }

          if (newMatchedFiles.length > 0) {
            detectedFiles = [...detectedFiles, ...newMatchedFiles];
            setStreamingFiles([...detectedFiles]);

            // Update status - show detected vs completed
            // Note: detectedFiles = files we've started receiving (path found)
            // completedFiles = files whose content is fully received
            if (currentFilePlan) {
              const completedCount = completedFiles.size;
              const streamingCount = detectedFiles.length - completedCount;

              if (completedCount >= currentFilePlan.total) {
                setStreamingStatus(`✅ ${currentFilePlan.total} files complete`);
              } else if (streamingCount > 0) {
                setStreamingStatus(
                  `📁 ${completedCount}/${currentFilePlan.total} complete, ${streamingCount} streaming...`
                );
              } else {
                setStreamingStatus(`📁 ${detectedFiles.length}/${currentFilePlan.total} files detected`);
              }
            } else {
              setStreamingStatus(`📁 ${detectedFiles.length} files detected`);
            }
          }

          // Update per-file progress during streaming (throttled for performance)
          // Each file has its own status based on content received:
          // - pending: Content hasn't started yet
          // - streaming: Content is being received (0-99%)
          // - complete: Content fully received (closing quote found) AND min duration passed
          const now = Date.now();
          if (updateFileProgress && currentFilePlan?.sizes && now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            lastProgressUpdate = now;

            for (const filePath of currentFilePlan.create) {
              // Skip already completed files
              if (completedFiles.has(filePath)) continue;

              const expectedLines = currentFilePlan.sizes[filePath] || 100;
              const progress = calculateFileProgress(fullText, filePath, expectedLines, detectedFormat);

              // Only update if not pending (content has started)
              if (progress.status !== 'pending') {
                // Track when file started streaming
                if (!fileStreamStartTimes.has(filePath)) {
                  fileStreamStartTimes.set(filePath, now);
                  console.log(`[Stream] File started streaming: ${filePath}`);
                }

                const streamStartTime = fileStreamStartTimes.get(filePath) ?? now;
                const streamingDuration = now - streamStartTime;

                // Calculate staggered completion delay based on file INDEX in the plan
                // This ensures files complete sequentially, not all at once
                // Earlier files in the list complete first, regardless of actual content completion
                const fileIndex = currentFilePlan.create.indexOf(filePath);
                const staggerOffset = Math.max(0, fileIndex) * COMPLETION_STAGGER_DELAY;
                const requiredDuration = MIN_STREAMING_DURATION + staggerOffset;

                // Only allow completion if:
                // 1. Content is actually complete (closing quote found)
                // 2. File has been streaming for minimum duration + stagger offset
                const canComplete = progress.status === 'complete' && streamingDuration >= requiredDuration;

                if (canComplete) {
                  // Mark as complete
                  completedFiles.add(filePath);
                  updateFileProgress(filePath, {
                    ...progress,
                    status: 'complete',
                    progress: 100,
                  });

                  // Update filePlan.completed with actually completed files
                  if (currentFilePlan) {
                    currentFilePlan.completed = [...completedFiles].filter((f) => currentFilePlan.create.includes(f));
                    setFilePlan({ ...currentFilePlan });

                    // Update status
                    const completedCount = completedFiles.size;
                    if (completedCount >= currentFilePlan.total) {
                      setStreamingStatus(`✅ ${currentFilePlan.total} files complete, finalizing...`);
                    } else {
                      const streamingCount = detectedFiles.length - completedCount;
                      setStreamingStatus(
                        `📁 ${completedCount}/${currentFilePlan.total} complete${streamingCount > 0 ? `, ${streamingCount} streaming...` : ''}`
                      );
                    }
                  }

                  console.log(`[Stream] ✅ File completed: ${filePath} (index: ${fileIndex}, streamed: ${streamingDuration}ms, required: ${requiredDuration}ms)`);
                } else {
                  // Still streaming - show progress smoothly
                  // If content is complete but waiting for stagger, show 99%
                  const displayProgress = progress.status === 'complete'
                    ? 99
                    : Math.min(progress.progress, 99);

                  updateFileProgress(filePath, {
                    ...progress,
                    status: 'streaming',
                    progress: displayProgress,
                  });

                  // Log ONCE when content is complete but waiting for stagger
                  if (progress.status === 'complete' && !filesContentComplete.has(filePath)) {
                    filesContentComplete.add(filePath);
                    console.log(`[Stream] ⏳ File content complete, waiting: ${filePath} (index: ${fileIndex}, need ${requiredDuration - streamingDuration}ms more)`);
                  }
                }
              }
            }
          }

          // Update status with character count
          if (detectedFiles.length === 0) {
            setStreamingStatus(`⚡ Generating... (${Math.round(fullText.length / 1024)}KB)`);
          }
        },
        currentModel
      );

      // Mark stream as complete
      console.log('[Generation] Stream complete:', {
        chars: fullText.length,
        chunks: chunkCount,
        filesDetected: detectedFiles.length,
      });

      // Final sweep: Mark all remaining files as complete (stream ended)
      // This handles files that completed between throttle intervals
      // Apply staggered completion for visual feedback
      if (updateFileProgress && currentFilePlan?.sizes) {
        const remainingFiles = currentFilePlan.create.filter((f) => !completedFiles.has(f));
        const totalFiles = currentFilePlan.total;
        const planRef = currentFilePlan; // Capture reference for closures
        const finalFormat = detectedFormat; // Capture for closures

        // Mark remaining files complete with stagger delay
        remainingFiles.forEach((filePath, index) => {
          const delay = index * 150; // 150ms between each file completion

          setTimeout(() => {
            const currentFullText = fullTextRef.current;
            const expectedLines = planRef?.sizes?.[filePath] ?? 100;
            const progress = calculateFileProgress(currentFullText, filePath, expectedLines, finalFormat);

            if (progress.status === 'complete' || progress.progress > 0) {
              // Add to completedFiles and update progress
              completedFiles.add(filePath);
              updateFileProgress(filePath, {
                ...progress,
                status: 'complete',
                progress: 100,
              });

              // Update filePlan.completed
              const newCompleted = [...completedFiles].filter((f) => planRef.create.includes(f));
              setFilePlan({
                ...planRef,
                completed: newCompleted,
              });

              // Update status
              if (newCompleted.length >= totalFiles) {
                setStreamingStatus(`✅ All ${totalFiles} files complete`);
              } else {
                setStreamingStatus(`📁 ${newCompleted.length}/${totalFiles} complete`);
              }

              console.log(`[Stream] File finalized on stream end: ${filePath} (delay: ${delay}ms, ${newCompleted.length}/${totalFiles})`);
            }
          }, delay);
        });
      }

      try {
        debugLog.streamUpdate(
          streamLogId,
          {
            response: `Completed: ${Math.round(fullText.length / 1024)}KB, ${chunkCount} chunks`,
            metadata: {
              chunkCount,
              totalChars: fullText.length,
              filesDetected: detectedFiles.length,
              status: 'complete',
            },
          },
          true
        );
      } catch (e) {
        console.debug('[Debug] Final stream update failed:', e);
      }

      // Save raw response for debugging and error recovery
      try {
        setLastAIResponse({
          raw: fullText,
          timestamp: Date.now(),
          chars: fullText.length,
          filesDetected: detectedFiles,
          format: detectedFormat,
        });
        console.log(`[Debug] Raw response saved (${fullText.length} chars, format: ${detectedFormat})`);
      } catch (e) {
        console.debug('[Debug] Could not save raw response:', e);
      }

      // Get files written via tool calls (tool calling mode)
      const filesWritten = streamResponse?.filesWritten;

      return { fullText, chunkCount, detectedFiles, streamResponse, currentFilePlan, format: detectedFormat, filesWritten };
    },
    [setStreamingChars, setStreamingFiles, setFilePlan, setStreamingStatus, updateFileProgress, initFileProgressFromPlan]
  );

  return { processStreamingResponse };
}
