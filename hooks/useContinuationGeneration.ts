/**
 * useContinuationGeneration Hook
 *
 * Handles multi-batch generation, continuation, truncation recovery,
 * and missing file requests. Extracted from ControlPanel to reduce complexity.
 *
 * Delegates to services/generation/* for business logic.
 */

import { useCallback, useEffect, useRef } from 'react';
import { FileSystem, ChatMessage } from '../types';
import { parseMultiFileResponse, parseUnifiedResponse, GenerationMeta } from '../utils/cleanCode';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from '../services/ai/utils/schemas';
import { FilePlan, ContinuationState, TruncatedContent } from './useGenerationState';
import { calculateFileChanges, createTokenUsage, getActiveProvider } from '../utils/generationUtils';
import { getFluidFlowConfig } from '../services/fluidflowConfig';
import {
  validateGeneratedFiles,
  createCompletionMessage,
  buildMissingFilesPrompt,
  buildContinuationPrompt,
  buildTruncationRecoveryPrompt,
  calculateRemainingFiles,
  isGenerationComplete,
  shouldRetry,
  shouldForceComplete,
  getRetryDelay,
  incrementRetryState,
  MAX_RETRY_ATTEMPTS,
} from '../services/generation';

// Types for the hook
export interface ContinuationGenerationOptions {
  files: FileSystem;
  selectedModel: string;
  setIsGenerating: (value: boolean) => void;
  setStreamingStatus: (status: string) => void;
  setStreamingChars: (chars: number) => void;
  setFilePlan: (plan: FilePlan | null) => void;
  setContinuationState: (state: ContinuationState | null) => void;
  setTruncatedContent: (content: TruncatedContent | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  reviewChange: (label: string, newFiles: FileSystem) => void;
}

export interface UseContinuationGenerationReturn {
  handleContinueGeneration: (
    contState?: ContinuationState | null,
    existingFiles?: FileSystem
  ) => Promise<void>;
  requestMissingFiles: (
    missingFiles: string[],
    accumulatedFiles: FileSystem,
    systemInstruction: string
  ) => Promise<{ success: boolean; files: FileSystem; explanation?: string }>;
  handleTruncationRetry: (
    truncatedContent: TruncatedContent,
    reviewChange: (label: string, newFiles: FileSystem) => void
  ) => Promise<void>;
}

export function useContinuationGeneration(
  options: ContinuationGenerationOptions
): UseContinuationGenerationReturn {
  const {
    files,
    selectedModel,
    setIsGenerating,
    setStreamingStatus,
    setStreamingChars,
    setFilePlan,
    setContinuationState,
    setTruncatedContent,
    setMessages,
    reviewChange,
  } = options;

  // Track mounted state and active timers to prevent state updates after unmount
  const mountedRef = useRef(true);
  const activeTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear all active timers - used on unmount and when clearing pending operations
  const clearAllTimers = useCallback(() => {
    activeTimers.current.forEach(t => clearTimeout(t));
    activeTimers.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const safeSetTimeout = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      activeTimers.current.delete(timer);
      if (mountedRef.current) fn();
    }, ms);
    activeTimers.current.add(timer);
    return timer;
  }, []);

  /**
   * Targeted request for specific missing files - more focused than general continuation
   */
  const requestMissingFiles = useCallback(
    async (
      missingFiles: string[],
      accumulatedFiles: FileSystem,
      systemInstruction: string
    ): Promise<{ success: boolean; files: FileSystem; explanation?: string }> => {
      if (missingFiles.length === 0) {
        return { success: true, files: accumulatedFiles };
      }

      console.log('[MissingFiles] Requesting specific files:', missingFiles);
      setStreamingStatus(`🎯 Requesting ${missingFiles.length} missing file(s)...`);

      const { manager, model: currentModel, providerType } = getActiveProvider(selectedModel);

      // Build focused prompt using service
      const targetedPrompt = buildMissingFilesPrompt({ missingFiles, accumulatedFiles });

      try {
        let fullText = '';
        const currentFormat = getFluidFlowConfig().getResponseFormat();
        await manager.generateStream(
          {
            prompt: targetedPrompt,
            systemInstruction,
            maxTokens: 32768,
            temperature: 0.7,
            responseFormat: currentFormat === 'marker' ? undefined : 'json',
            responseSchema:
              currentFormat !== 'marker' && providerType && supportsAdditionalProperties(providerType)
                ? FILE_GENERATION_SCHEMA
                : undefined,
          },
          (chunk) => {
            if (chunk.text) {
              fullText += chunk.text;
            }
          },
          currentModel
        );

        const parseResult = parseMultiFileResponse(fullText);

        if (parseResult && parseResult.files && Object.keys(parseResult.files).length > 0) {
          const newFiles = { ...accumulatedFiles, ...parseResult.files };
          console.log('[MissingFiles] Successfully generated:', Object.keys(parseResult.files));
          return { success: true, files: newFiles, explanation: parseResult.explanation };
        }

        console.warn('[MissingFiles] No files in response');
        return { success: false, files: accumulatedFiles };
      } catch (error) {
        console.error('[MissingFiles] Request failed:', error);
        return { success: false, files: accumulatedFiles };
      }
    },
    [selectedModel, setStreamingStatus]
  );

  /**
   * Smart continuation handler - automatically continues generation for remaining files
   */
  const handleContinueGeneration = useCallback(
    async (contState?: ContinuationState | null, existingFiles?: FileSystem) => {
      // Clear pending timers from previous continuation attempts to prevent leaks
      clearAllTimers();

      const state = contState;
      if (!state || state.generationMeta.isComplete) {
        console.log('[Continuation] No continuation needed or already complete');
        setContinuationState(null);
        return;
      }

      const { originalPrompt, systemInstruction, generationMeta, accumulatedFiles } = state;
      const { remainingFiles, currentBatch, totalBatches, completedFiles } = generationMeta;

      if (remainingFiles.length === 0) {
        console.log('[Continuation] All files completed');
        setContinuationState(null);
        return;
      }

      setIsGenerating(true);
      setStreamingStatus(
        `✨ Generating... ${completedFiles.length}/${generationMeta.totalFilesPlanned} files`
      );

      const { manager, model: currentModel, providerName, providerType } = getActiveProvider(selectedModel);
      const continuationStartTime = Date.now();

      try {
        // Build continuation prompt using service
        const continuationPrompt = buildContinuationPrompt({
          completedFiles,
          remainingFiles,
          originalPrompt,
        });

        let fullText = '';
        let chunkCount = 0;
        const contFormat = getFluidFlowConfig().getResponseFormat();

        const response = await manager.generateStream(
          {
            prompt: continuationPrompt,
            systemInstruction,
            maxTokens: 32768,
            temperature: 0.7,
            responseFormat: contFormat === 'marker' ? undefined : 'json',
            responseSchema:
              contFormat !== 'marker' && providerType && supportsAdditionalProperties(providerType)
                ? FILE_GENERATION_SCHEMA
                : undefined,
          },
          (chunk) => {
            fullText += chunk.text || '';
            chunkCount++;
            setStreamingChars(fullText.length);

            // Only update status occasionally to avoid flickering
            if (chunkCount % 50 === 0) {
              setStreamingStatus(
                `✨ Generating... ${completedFiles.length}/${generationMeta.totalFilesPlanned} files (${Math.round(fullText.length / 1024)}KB)`
              );
            }
          },
          currentModel
        );

        setStreamingStatus('✨ Finalizing...');
        console.log('[Continuation] Raw response length:', fullText.length);

        // Use unified parser to support both JSON and marker formats
        const unifiedResult = parseUnifiedResponse(fullText);
        const parseResult = unifiedResult ? {
          files: unifiedResult.files,
          explanation: unifiedResult.explanation,
          truncated: unifiedResult.truncated,
          generationMeta: unifiedResult.generationMeta,
        } : parseMultiFileResponse(fullText); // Fallback to JSON-only parser

        console.log('[Continuation] Parse result:', {
          hasFiles: !!parseResult?.files,
          fileCount: parseResult ? Object.keys(parseResult.files).length : 0,
          fileNames: parseResult ? Object.keys(parseResult.files) : [],
          format: unifiedResult?.format || 'json-fallback',
          generationMeta: parseResult?.generationMeta,
        });

        if (!parseResult || !parseResult.files || Object.keys(parseResult.files).length === 0) {
          console.error('[Continuation] Failed to parse - no files found');
          throw new Error('Failed to parse continuation response - no files found');
        }

        // Check for truncation and auto-retry if needed
        if (parseResult.truncated) {
          const currentRetryAttempts = state.retryAttempts || 0;

          if (shouldRetry(currentRetryAttempts)) {
            console.log(
              `[Continuation] Response truncated, auto-retry attempt ${currentRetryAttempts + 1}/${MAX_RETRY_ATTEMPTS}`
            );
            setStreamingStatus(
              `🔄 Response truncated, retrying (${currentRetryAttempts + 1}/${MAX_RETRY_ATTEMPTS})...`
            );

            // Merge any partial files we got before retrying
            const partialAccumulatedFiles = { ...accumulatedFiles, ...parseResult.files };

            const retryState: ContinuationState = incrementRetryState({
              ...state,
              accumulatedFiles: partialAccumulatedFiles,
            });
            setContinuationState(retryState);

            // Wait before retrying (exponential backoff via service)
            safeSetTimeout(() => {
              handleContinueGeneration(retryState, existingFiles);
            }, getRetryDelay(currentRetryAttempts));

            return; // Exit this attempt
          } else {
            console.warn(
              '[Continuation] Max retries for truncation reached, proceeding with partial files'
            );
          }
        }

        // Merge new files with accumulated files
        const newAccumulatedFiles = { ...accumulatedFiles, ...parseResult.files };
        const newCompletedFiles = [
          ...new Set([...completedFiles, ...Object.keys(parseResult.files)]),
        ];

        // Update remaining files using service (checks against ALL accumulated files)
        const newRemainingFiles = calculateRemainingFiles(remainingFiles, newAccumulatedFiles);

        // If we generated ANY new files, consider progress made
        const madeProgress = Object.keys(parseResult.files).length > 0;

        // Check if generation is complete using service
        const complete = isGenerationComplete({
          remainingFiles: newRemainingFiles,
          totalAccumulated: Object.keys(newAccumulatedFiles).length,
          totalPlanned: generationMeta.totalFilesPlanned,
          aiMarkedComplete: parseResult.generationMeta?.isComplete,
          aiSaysNoRemaining: parseResult.generationMeta?.remainingFiles?.length === 0,
        });

        console.log('[Continuation] Batch complete:', {
          newFilesThisBatch: Object.keys(parseResult.files).length,
          totalAccumulated: Object.keys(newAccumulatedFiles).length,
          totalPlanned: generationMeta.totalFilesPlanned,
          totalCompleted: newCompletedFiles.length,
          remaining: newRemainingFiles.length,
          remainingFiles: newRemainingFiles,
          aiGenerationMeta: parseResult.generationMeta,
          isComplete: complete,
          madeProgress,
        });

        // Seamless progress update
        setStreamingStatus(
          `✨ Generating... ${newCompletedFiles.length}/${generationMeta.totalFilesPlanned} files`
        );

        // Safety: Force complete if we've done too many batches or no progress
        const forceComplete = shouldForceComplete(currentBatch, madeProgress);

        if (complete || forceComplete) {
          // All done! Show final result
          if (forceComplete && !complete) {
            console.log('[Continuation] Forcing completion - max batches reached or no progress');
          }

          // VALIDATE: Filter out empty or malformed files
          const { validFiles, invalidFiles } = validateGeneratedFiles(newAccumulatedFiles);

          console.log('[Continuation] File validation:', {
            total: Object.keys(newAccumulatedFiles).length,
            valid: Object.keys(validFiles).length,
            invalid: invalidFiles,
          });

          // If no valid files, show error
          if (Object.keys(validFiles).length === 0) {
            console.error('[Continuation] No valid files generated!');
            setStreamingStatus('❌ Generation failed - no valid files received');
            setIsGenerating(false);
            setContinuationState(null);
            setFilePlan(null);

            const errorMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              timestamp: Date.now(),
              error: `Generation failed - files were empty or malformed.\n\nInvalid files: ${invalidFiles.join(', ')}\n\nPlease try again.`,
              snapshotFiles: { ...files },
            };
            setMessages((prev) => [...prev, errorMessage]);
            return;
          }

          // Merge with existing project files
          const finalFiles = existingFiles ? { ...existingFiles, ...validFiles } : validFiles;
          const generatedFileList = Object.keys(validFiles);

          console.log('[Continuation] Complete:', {
            fileCount: Object.keys(finalFiles).length,
            validFiles: generatedFileList,
            invalidFiles,
            forced: forceComplete && !complete,
          });

          // Calculate file changes for display
          const fileChanges = calculateFileChanges(files, finalFiles);

          // Build comprehensive explanation
          let explanationText = parseResult.explanation || 'Generation complete.';

          if (invalidFiles.length > 0) {
            explanationText += `\n\n⚠️ **${invalidFiles.length} files were invalid and excluded.**`;
          }

          // Add completion message
          const completionMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: explanationText,
            files: validFiles,
            fileChanges,
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName,
            generationTime: Date.now() - continuationStartTime,
            tokenUsage: response?.usage
              ? {
                  inputTokens: response.usage.inputTokens || 0,
                  outputTokens: response.usage.outputTokens || 0,
                  totalTokens:
                    (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0),
                }
              : undefined,
          };
          setMessages((prev) => [...prev, completionMessage]);

          // Update status to show completion
          setStreamingStatus(`✅ Generated ${generatedFileList.length} files!`);

          // Small delay to ensure message renders before modal opens
          safeSetTimeout(() => {
            setContinuationState(null);
            setIsGenerating(false);
            setFilePlan(null);

            // Apply changes (shows diff modal if auto-accept is off)
            reviewChange('Generated App', finalFiles);
          }, 100);

          return;
        } else {
          // Continue seamlessly - user doesn't notice the transition
          const newGenerationMeta: GenerationMeta = {
            totalFilesPlanned: generationMeta.totalFilesPlanned,
            filesInThisBatch: Object.keys(parseResult.files),
            completedFiles: newCompletedFiles,
            remainingFiles: newRemainingFiles,
            currentBatch: currentBatch + 1,
            totalBatches,
            isComplete: false,
          };

          const newContState: ContinuationState = {
            isActive: true,
            originalPrompt,
            systemInstruction,
            generationMeta: newGenerationMeta,
            accumulatedFiles: newAccumulatedFiles,
            currentBatch: currentBatch + 1,
            retryAttempts: 0, // Reset retry counter for new batch
          };

          setContinuationState(newContState);

          console.log('[Continuation] Starting next batch:', currentBatch + 1);

          // Continue immediately - seamless experience
          safeSetTimeout(() => {
            handleContinueGeneration(newContState, existingFiles);
          }, 50);
        }
      } catch (error) {
        console.error('[Continuation] Error:', error);

        // Auto-retry logic using service
        const currentRetryAttempts = state.retryAttempts || 0;

        if (shouldRetry(currentRetryAttempts) && generationMeta.remainingFiles.length > 0) {
          console.log(
            `[Continuation] Auto-retry attempt ${currentRetryAttempts + 1}/${MAX_RETRY_ATTEMPTS}`
          );
          setStreamingStatus(
            `🔄 Retrying batch (attempt ${currentRetryAttempts + 1}/${MAX_RETRY_ATTEMPTS})...`
          );

          // Create new state with incremented retry counter via service
          const retryState: ContinuationState = incrementRetryState({ ...state });
          setContinuationState(retryState);

          // Wait before retrying (exponential backoff via service)
          safeSetTimeout(() => {
            handleContinueGeneration(retryState, existingFiles);
          }, getRetryDelay(currentRetryAttempts));

          return;
        }

        // All retries exhausted - try targeted request for missing files
        if (
          generationMeta.remainingFiles.length > 0 &&
          Object.keys(accumulatedFiles).length > 0
        ) {
          console.log(
            '[Continuation] Retries exhausted, trying targeted request for:',
            generationMeta.remainingFiles
          );
          setStreamingStatus(
            `🎯 Requesting ${generationMeta.remainingFiles.length} missing file(s) directly...`
          );

          // Try targeted request for missing files
          const targetedResult = await requestMissingFiles(
            generationMeta.remainingFiles,
            accumulatedFiles,
            systemInstruction
          );

          if (targetedResult.success) {
            const stillMissing = generationMeta.remainingFiles.filter(
              (f) => !targetedResult.files[f]
            );
            const generatedFileList = Object.keys(targetedResult.files);
            const finalFiles = existingFiles
              ? { ...existingFiles, ...targetedResult.files }
              : targetedResult.files;

            let explanationText = targetedResult.explanation || 'Generation complete.';
            if (stillMissing.length > 0) {
              explanationText += `\n\n⚠️ **${stillMissing.length} files could not be generated:** ${stillMissing.join(', ')}`;
            }

            setMessages((prev) => [...prev, createCompletionMessage({
              explanation: explanationText,
              files: targetedResult.files,
              currentFiles: files,
              model: currentModel,
              provider: providerName,
              startTime: continuationStartTime,
              tokenUsage: createTokenUsage(undefined, undefined, explanationText, targetedResult.files),
            })]);
            setStreamingStatus(
              `✅ Generated ${generatedFileList.length} files${stillMissing.length > 0 ? ` (${stillMissing.length} missing)` : ''}`
            );

            safeSetTimeout(() => {
              setContinuationState(null);
              setIsGenerating(false);
              setFilePlan(null);
              reviewChange('Generated App', finalFiles);
            }, 100);
            return;
          }
        }

        // Targeted request also failed or no accumulated files - show what we have
        if (Object.keys(accumulatedFiles).length > 0) {
          console.log(
            '[Continuation] All attempts exhausted, showing accumulated files:',
            Object.keys(accumulatedFiles)
          );

          const generatedFileList = Object.keys(accumulatedFiles);
          const finalFiles = existingFiles
            ? { ...existingFiles, ...accumulatedFiles }
            : accumulatedFiles;

          const explanationText = `Generation complete.\n\n⚠️ **${generationMeta.remainingFiles.length} files could not be generated:** ${generationMeta.remainingFiles.join(', ')}`;

          const completionMessage = createCompletionMessage({
            explanation: explanationText,
            files: accumulatedFiles,
            currentFiles: files,
            model: currentModel,
            provider: providerName,
            startTime: continuationStartTime,
            tokenUsage: createTokenUsage(undefined, undefined, explanationText, accumulatedFiles),
          });
          setMessages((prev) => [...prev, completionMessage]);

          setStreamingStatus(
            `✅ Generated ${generatedFileList.length} files (${generationMeta.remainingFiles.length} missing)`
          );

          safeSetTimeout(() => {
            setContinuationState(null);
            setIsGenerating(false);
            setFilePlan(null);
            reviewChange('Generated App', finalFiles);
          }, 100);
        } else {
          setStreamingStatus(
            '❌ Generation failed: ' +
              (error instanceof Error ? error.message : 'Unknown error')
          );
          setIsGenerating(false);
          setContinuationState(null);
          setFilePlan(null);

          // Show error message
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: `❌ **Generation failed:** ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
            snapshotFiles: { ...files },
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      }
    },
    [
      files,
      selectedModel,
      setIsGenerating,
      setStreamingStatus,
      setStreamingChars,
      setFilePlan,
      setContinuationState,
      setMessages,
      reviewChange,
      requestMissingFiles,
      safeSetTimeout,
      clearAllTimers,
    ]
  );

  /**
   * Handle truncation retry - retries generation when response was truncated
   */
  const handleTruncationRetry = useCallback(
    async (
      truncatedContent: TruncatedContent,
      reviewChangeFn: (label: string, newFiles: FileSystem) => void
    ) => {
      // Clear pending timers from previous retry attempts
      clearAllTimers();

      const { rawResponse, prompt, systemInstruction, attempt } = truncatedContent;

      // Limit retry attempts to prevent infinite loops
      if (!shouldRetry(attempt)) {
        setStreamingStatus('❌ Maximum retry attempts reached. Please try a shorter prompt.');
        setTruncatedContent(null);
        return;
      }

      setStreamingStatus(`🔄 Retrying generation (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})...`);
      setIsGenerating(true);

      try {
        // Create a continuation prompt using service
        const continuationPrompt = buildTruncationRecoveryPrompt({
          rawResponse,
          originalPrompt: prompt,
          previewStart: 2000,
          previewEnd: 500,
        });

        const { manager, model: currentModel } = getActiveProvider(selectedModel);

        let fullText = '';

        await manager.generateStream(
          {
            prompt: continuationPrompt,
            systemInstruction,
            maxTokens: 32768,
            temperature: 0.7,
          },
          (chunk) => {
            if (chunk.text) {
              fullText += chunk.text;
            }
          },
          currentModel
        );

        // Combine original response with continuation
        const combinedResponse = rawResponse + fullText;

        setStreamingStatus('✨ Parsing combined response...');

        // Try to parse the combined response
        const parseResult = parseMultiFileResponse(combinedResponse);

        if (parseResult && parseResult.files) {
          // Apply the changes
          reviewChangeFn('Retried Generation (combined)', parseResult.files);
          setStreamingStatus('✅ Successfully recovered from truncation!');
          setTruncatedContent(null);
        } else {
          // Still failed, update truncated content for another retry
          setTruncatedContent({
            rawResponse: combinedResponse,
            prompt,
            systemInstruction,
            partialFiles: truncatedContent.partialFiles,
            attempt: attempt + 1,
          });
          setStreamingStatus('⚠️ Response still truncated after retry. Click "Retry" to try again.');
        }
      } catch (error) {
        console.error('Retry failed:', error);
        setStreamingStatus(
          '❌ Retry failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedModel, setIsGenerating, setStreamingStatus, setTruncatedContent, clearAllTimers]
  );

  return {
    handleContinueGeneration,
    requestMissingFiles,
    handleTruncationRetry,
  };
}
