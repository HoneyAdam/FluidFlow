/**
 * useCodeGeneration Hook
 *
 * Handles the main code generation logic for the AI chat.
 * Orchestrates streaming, parsing, and continuation handling.
 *
 * Delegates to focused sub-hooks:
 * - useContinuationHandler: Multi-batch generation continuation
 * - useTruncationRecovery: Recovery from truncated responses
 * - useGenerationSuccess: Success handling and diff modal
 *
 * Uses services/generation/* for business logic.
 */

import { useCallback, useRef } from 'react';
import { FileSystem, ChatMessage, ChatAttachment } from '../types';
import { GenerationMeta } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { getProviderManager, GenerationRequest } from '../services/ai';
import { projectApi } from '../services/api';
import { FilePlan, TruncatedContent, ContinuationState, FileProgress } from './useGenerationState';
import { useStreamingResponse, getLastAIResponse } from './useStreamingResponse';
import { useResponseParser } from './useResponseParser';
import { useContinuationHandler } from './useContinuationHandler';
import { useTruncationRecovery } from './useTruncationRecovery';
import { useGenerationSuccess } from './useGenerationSuccess';
import { buildSystemInstruction, buildPromptParts, markFilesAsShared } from '../utils/generationUtils';
import { activityLogger } from '../services/activityLogger';
import { PROJECT_TOOLS } from '../services/ai/utils/toolExecutor';
import { createProjectToolExecutor } from '../services/ai/utils/projectToolHandler';
import { createErrorMessage, type AIHistoryEntry } from '../services/generation';

// Re-export AIHistoryEntry for backward compatibility
export type { AIHistoryEntry } from '../services/generation';

export interface CodeGenerationOptions {
  prompt: string;
  attachments: ChatAttachment[];
  isEducationMode: boolean;
  diffModeEnabled?: boolean;
  conversationHistory?: { role: 'user' | 'assistant' | 'system'; content: string }[];
}

export interface CodeGenerationResult {
  success: boolean;
  continuationStarted?: boolean;
  error?: string;
}

export interface UseCodeGenerationOptions {
  files: FileSystem;
  selectedModel: string;
  sessionId?: string;  // For context compaction
  generateSystemInstruction: () => string;
  setStreamingStatus: (status: string) => void;
  setStreamingChars: (chars: number) => void;
  setStreamingFiles: (files: string[]) => void;
  setFilePlan: (plan: FilePlan | null) => void;
  setContinuationState: (state: ContinuationState | null) => void;
  setTruncatedContent: (content: TruncatedContent | null) => void;
  setIsGenerating: (value: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  reviewChange: (label: string, newFiles: FileSystem, options?: { skipHistory?: boolean; incompleteFiles?: string[] }) => void;
  handleContinueGeneration: (
    state?: ContinuationState,
    originalFiles?: FileSystem
  ) => Promise<void>;
  addAIHistoryEntry: (entry: AIHistoryEntry) => void;
  // File progress tracking callbacks (optional)
  updateFileProgress?: (path: string, updates: Partial<FileProgress>) => void;
  initFileProgressFromPlan?: (plan: FilePlan) => void;
  setFileProgress?: (progress: Map<string, FileProgress>) => void;
}

export interface UseCodeGenerationReturn {
  generateCode: (options: CodeGenerationOptions) => Promise<CodeGenerationResult>;
}

export function useCodeGeneration(options: UseCodeGenerationOptions): UseCodeGenerationReturn {
  const {
    files,
    selectedModel,
    sessionId,
    generateSystemInstruction,
    setStreamingStatus,
    setStreamingChars,
    setStreamingFiles,
    setFilePlan,
    setContinuationState,
    setTruncatedContent: _setTruncatedContent,
    setIsGenerating: _setIsGenerating,
    setMessages,
    reviewChange,
    handleContinueGeneration,
    addAIHistoryEntry,
    updateFileProgress,
    initFileProgressFromPlan,
    setFileProgress,
  } = options;

  const existingApp = files['src/App.tsx'];

  // AbortController to cancel ongoing generation when a new one starts
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use extracted hooks
  const { processStreamingResponse } = useStreamingResponse({
    setStreamingChars,
    setStreamingFiles,
    setStreamingStatus,
    setFilePlan,
    updateFileProgress,
    initFileProgressFromPlan,
  });

  const { parseStandardResponse, parseSearchReplaceResponse } = useResponseParser({
    files,
    existingApp: !!existingApp,
    setStreamingStatus,
  });

  // Use extracted hooks for focused responsibilities
  const { handleMissingFiles, handleSmartContinuation } = useContinuationHandler({
    files,
    existingApp: !!existingApp,
    setStreamingStatus,
    setFilePlan,
    setContinuationState,
    handleContinueGeneration,
  });

  const { handleTruncationError } = useTruncationRecovery({
    files,
    existingApp: !!existingApp,
    setStreamingStatus,
    setFilePlan,
    setMessages,
    setContinuationState,
    reviewChange,
    handleContinueGeneration,
  });

  const { handleGenerationSuccess } = useGenerationSuccess({
    files,
    existingApp: !!existingApp,
    sessionId,
    setStreamingStatus,
    setFilePlan,
    setMessages,
    reviewChange,
  });

  /**
   * Main code generation function
   */
  const generateCode = useCallback(
    async (genOptions: CodeGenerationOptions): Promise<CodeGenerationResult> => {
      // Abort any previous generation still in progress
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const { prompt, attachments, isEducationMode, diffModeEnabled, conversationHistory } = genOptions;

      const sketchAtt = attachments.find((a) => a.type === 'sketch');
      const brandAtt = attachments.find((a) => a.type === 'brand');

      const manager = getProviderManager();
      const activeProvider = manager.getActiveConfig();
      const currentModel = activeProvider?.defaultModel || selectedModel;
      const providerName = activeProvider?.name || 'AI';

      activityLogger.info('generation', `Starting generation with ${providerName}`, `Model: ${currentModel}`);

      // Extract projectId from sessionId (format: main-chat-{projectId})
      const projectId = sessionId?.replace('main-chat-', '') || undefined;

      const systemInstruction = buildSystemInstruction(
        !!existingApp,
        !!brandAtt,
        isEducationMode,
        !!diffModeEnabled,
        generateSystemInstruction(),
        projectId
      );

      // Build prompt parts with smart file context tracking
      const { promptParts, images, fileContext } = buildPromptParts(prompt, attachments, files, !!existingApp);
      if (fileContext && fileContext.tokensSaved > 0) {
        activityLogger.info('generation', `Smart context: saved ~${fileContext.tokensSaved} tokens`, 'Only changed files included');
      }

      const request: GenerationRequest = {
        prompt: promptParts.join('\n\n'),
        systemInstruction,
        images,
        conversationHistory:
          conversationHistory && conversationHistory.length > 0 ? conversationHistory : undefined,
        // Pass file context for prompt confirmation modal
        fileContext: fileContext || undefined,
        // Tool calling for project file operations
        tools: PROJECT_TOOLS,
        toolExecutor: projectId
          ? createProjectToolExecutor(projectId, activeProvider?.allowToolWrites ?? true)
          : undefined,
        toolChoice: 'required', // Force tool calls on the initial request; agentic follow-ups switch to 'auto'
        allowToolWrites: activeProvider?.allowToolWrites ?? false,
        projectId,
      };

      console.log('📤 [REQUEST] tools:', request.tools?.length ?? 0, '| toolExecutor:', !!request.toolExecutor);

      // Initialize streaming state
      setStreamingStatus(`🚀 Starting generation with ${providerName}...`);
      setStreamingChars(0);
      setStreamingFiles([]);
      setFilePlan(null);
      // Clear file progress from previous generation
      if (setFileProgress) {
        setFileProgress(new Map());
      }

      // Calculate prompt tokens for debug
      const fullPromptText = request.prompt;
      const promptTokens = Math.ceil(fullPromptText.length / 4);
      const historyTokens = conversationHistory
        ? Math.ceil(conversationHistory.reduce((sum, m) => sum + m.content.length, 0) / 4)
        : 0;

      // Build conversation history summary for debug
      const historySummary = conversationHistory?.map((m, i) => {
        const preview = m.content.length > 200
          ? m.content.slice(0, 200) + `... (${m.content.length} chars total)`
          : m.content;
        return `[${i + 1}] ${m.role.toUpperCase()}: ${preview}`;
      }).join('\n\n') || '(no history)';

      const genRequestId = debugLog.request('generation', {
        model: currentModel,
        prompt: `📤 AI Generation Request\n\n` +
          `User prompt: ${prompt || '(from attachments)'}\n\n` +
          `--- CONVERSATION HISTORY (${conversationHistory?.length || 0} messages, ~${historyTokens.toLocaleString()} tokens) ---\n\n` +
          historySummary + '\n\n' +
          `--- CURRENT PROMPT (${promptTokens.toLocaleString()} tokens) ---\n\n` +
          fullPromptText,
        systemInstruction,
        attachments: attachments.map((a) => ({ type: a.type, size: a.file.size })),
        metadata: {
          mode: 'generator',
          hasExistingApp: !!existingApp,
          provider: providerName,
          promptLength: fullPromptText.length,
          promptTokens,
          historyMessages: conversationHistory?.length || 0,
          historyTokens,
          totalInputTokens: promptTokens + historyTokens,
          toolCallingEnabled: !!request.toolExecutor,
          toolsProvided: request.tools?.length ?? 0,
          toolExecutorProvided: !!request.toolExecutor,
          toolChoice: request.toolChoice,
          fileContext: fileContext ? {
            totalFiles: fileContext.totalFiles,
            filesInPrompt: fileContext.filesInPrompt,
            filesInContext: fileContext.filesInContext,
            tokensSaved: fileContext.tokensSaved,
          } : null,
        },
        tokenCount: {
          input: promptTokens + historyTokens,
          output: 0,
          isEstimated: true,
        },
      });
      const genStartTime = Date.now();
      // Track file plan outside try block so catch can access it for truncation recovery
      let recoveryFilePlan: FilePlan | null = null;

      try {
        // Process streaming response
        const { fullText, chunkCount, detectedFiles, streamResponse, currentFilePlan, filesWritten } =
          await processStreamingResponse(request, currentModel, genRequestId, genStartTime);
        recoveryFilePlan = currentFilePlan;

        // Check if generation was cancelled while streaming
        if (abortController.signal.aborted) {
          return { success: false, error: 'Generation cancelled' };
        }

        // Show parsing status
        setStreamingStatus(`✨ Processing ${detectedFiles.length} files...`);
        activityLogger.info('generation', `Received response`, `${fullText.length} chars, ${chunkCount} chunks`);

        // Check if we have files written via tool calls (tool calling mode)
        const isToolCallingMode = filesWritten && filesWritten.length > 0;
        console.log('[CodeGen] Tool calling check:', { isToolCallingMode, filesWritten: filesWritten?.length });

        // Handle tool calling mode FIRST - files were already written via tool calls
        if (isToolCallingMode && filesWritten && projectId) {
          console.log('[CodeGen] Entering tool calling mode, filesWritten:', filesWritten);
          activityLogger.info('generation', `Tool calling mode: ${filesWritten.length} files written via tools`, filesWritten.join(', '));

          // Load the written files from project
          const writtenFilesMap: Record<string, string> = {};
          for (const filePath of filesWritten) {
            try {
              const content = await projectApi.readFile(projectId, filePath);
              writtenFilesMap[filePath] = content;
            } catch (e) {
              activityLogger.error('generation', `Failed to read written file: ${filePath}`, String(e));
            }
          }

          if (Object.keys(writtenFilesMap).length > 0) {
            // Merge with existing files
            const mergedFiles = { ...files, ...writtenFilesMap };
            const newFiles = writtenFilesMap;

            // Use AI's final text as explanation
            const explanation = fullText || 'Files created via tool calling';

            // Go directly to success handling
            handleGenerationSuccess(
              newFiles,
              mergedFiles,
              explanation,
              genStartTime,
              currentModel,
              providerName,
              streamResponse,
              fullText,
              undefined,
              undefined
            );

            const fileCount = Object.keys(newFiles).length;
            const duration = Date.now() - genStartTime;
            activityLogger.success('generation', `Tool calling: ${fileCount} file${fileCount !== 1 ? 's' : ''} written`, `${duration}ms`);

            markFilesAsShared(mergedFiles);
            return { success: true, continuationStarted: false };
          }
        }

        // Parse response (for non-tool-calling mode)
        let explanation: string;
        let mergedFiles: FileSystem;
        let newFiles: Record<string, string>;
        let wasTruncated = false;
        let generationMeta: GenerationMeta | undefined;
        let incompleteFiles: string[] | undefined;
        let continuation:
          | {
              prompt: string;
              remainingFiles: string[];
              currentBatch: number;
              totalBatches: number;
            }
          | undefined;

        if (diffModeEnabled && existingApp) {
          // SEARCH/REPLACE MODE (BETA)
          const srResult = parseSearchReplaceResponse(
            fullText,
            genRequestId,
            genStartTime,
            currentModel,
            providerName,
            chunkCount
          );

          if (srResult) {
            explanation = srResult.explanation;
            newFiles = srResult.newFiles;
            mergedFiles = srResult.mergedFiles;
          } else {
            // Fallback to standard parsing
            const stdResult = parseStandardResponse(
              fullText,
              genRequestId,
              genStartTime,
              currentModel,
              providerName,
              chunkCount
            );
            explanation = stdResult.explanation;
            newFiles = stdResult.newFiles;
            mergedFiles = stdResult.mergedFiles;
            wasTruncated = stdResult.wasTruncated;
            generationMeta = stdResult.generationMeta;
            continuation = stdResult.continuation;
            incompleteFiles = stdResult.incompleteFiles;
          }
        } else {
          // Standard full-file mode
          const stdResult = parseStandardResponse(
            fullText,
            genRequestId,
            genStartTime,
            currentModel,
            providerName,
            chunkCount
          );
          explanation = stdResult.explanation;
          newFiles = stdResult.newFiles;
          mergedFiles = stdResult.mergedFiles;
          wasTruncated = stdResult.wasTruncated;
          generationMeta = stdResult.generationMeta;
          continuation = stdResult.continuation;
          incompleteFiles = stdResult.incompleteFiles;
        }

        // Check for missing files based on filePlan
        if (currentFilePlan && currentFilePlan.create.length > 0) {
          if (handleMissingFiles(currentFilePlan, newFiles, prompt, systemInstruction)) {
            return { success: true, continuationStarted: true };
          }
        }

        // Check for smart continuation
        if (generationMeta && !generationMeta.isComplete && generationMeta.remainingFiles.length > 0) {
          if (handleSmartContinuation(generationMeta, newFiles, prompt, systemInstruction)) {
            return { success: true, continuationStarted: true };
          }
        }

        // Save to AI history
        addAIHistoryEntry({
          timestamp: Date.now(),
          prompt: prompt || 'Generate app',
          model: currentModel,
          provider: providerName,
          hasSketch: !!sketchAtt,
          hasBrand: !!brandAtt,
          isUpdate: !!existingApp,
          rawResponse: fullText,
          responseChars: fullText.length,
          responseChunks: chunkCount,
          durationMs: Date.now() - genStartTime,
          success: true,
          truncated: wasTruncated,
          filesGenerated: Object.keys(newFiles),
          explanation,
        });

        // Final abort check before committing results to state
        if (abortController.signal.aborted) {
          return { success: false, error: 'Generation cancelled' };
        }

        // Handle success
        handleGenerationSuccess(
          newFiles,
          mergedFiles,
          explanation,
          genStartTime,
          currentModel,
          providerName,
          streamResponse,
          fullText,
          continuation,
          incompleteFiles
        );

        const fileCount = Object.keys(newFiles).length;
        const duration = Date.now() - genStartTime;
        activityLogger.success('generation', `Generated ${fileCount} file${fileCount !== 1 ? 's' : ''}`, `${duration}ms`);

        // Mark files as shared for next turn's delta tracking
        markFilesAsShared(mergedFiles);

        return { success: true, continuationStarted: false };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Parse error';
        activityLogger.error('generation', 'Generation failed', errorMsg);

        // Check if this is a truncation error
        const isTruncationError =
          errorMsg.includes('truncated') || errorMsg.includes('token limits');

        if (isTruncationError) {
          const lastResponse = getLastAIResponse();
          const fullText = lastResponse?.raw || '';

          const truncResult = await handleTruncationError(
            fullText,
            recoveryFilePlan,
            prompt,
            currentModel,
            providerName,
            genStartTime,
            null
          );

          if (truncResult.handled) {
            return { success: true, continuationStarted: truncResult.continuationStarted };
          }
        }

        // Log error
        debugLog.error('generation', errorMsg, {
          model: currentModel,
          duration: Date.now() - genStartTime,
          metadata: {
            mode: 'generator',
            provider: providerName,
            hasTruncationError: isTruncationError,
          },
        });

        // Save failed attempt to AI history
        addAIHistoryEntry({
          timestamp: Date.now(),
          prompt: prompt || 'Generate app',
          model: currentModel,
          provider: providerName,
          hasSketch: !!sketchAtt,
          hasBrand: !!brandAtt,
          isUpdate: !!existingApp,
          rawResponse: '',
          responseChars: 0,
          responseChunks: 0,
          durationMs: Date.now() - genStartTime,
          success: false,
          error: errorMsg,
          truncated: isTruncationError,
        });

        setStreamingStatus('❌ ' + errorMsg);

        const errorMessage = createErrorMessage(
          errorMsg + ' (Check browser console for raw response)',
          files
        );
        setMessages((prev) => [...prev, errorMessage]);

        return { success: false, continuationStarted: false, error: errorMsg };
      }
    },
    [
      sessionId,
      files,
      existingApp,
      selectedModel,
      generateSystemInstruction,
      setStreamingStatus,
      setStreamingChars,
      setStreamingFiles,
      setFilePlan,
      setFileProgress,
      setMessages,
      processStreamingResponse,
      parseStandardResponse,
      parseSearchReplaceResponse,
      handleMissingFiles,
      handleSmartContinuation,
      handleTruncationError,
      handleGenerationSuccess,
      addAIHistoryEntry,
    ]
  );

  return {
    generateCode,
  };
}
