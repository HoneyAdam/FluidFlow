/**
 * Generation Utilities
 *
 * Pure utility functions for code generation.
 * Extracted from useCodeGeneration to improve modularity.
 */

import { FileSystem, FileChange, ChatAttachment } from '../types';
import { generateContextForPrompt } from './codemap';
import {
  SEARCH_REPLACE_MODE_INSTRUCTION,
  STANDARD_UPDATE_INSTRUCTION,
} from '../components/ControlPanel/prompts';
import { getGenerationPrompt } from '../services/promptTemplates';
import { getFileContextTracker, type FileContextDelta } from '../services/context/fileContextTracker';
import { FILE_CONTEXT_PREVIEW_LENGTH, STORAGE_KEYS } from '../constants';
import type { FileContextInfo, ProviderType } from '../services/ai/types';
import { getContextForPrompt } from '../services/projectContext';
import { getProviderManager } from '../services/ai';

/**
 * Check if file context delta mode is enabled
 */
function isFileContextDeltaEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.FILE_CONTEXT_ENABLED) !== 'false';
}

// Context ID for main chat file tracking
const MAIN_CHAT_CONTEXT = 'main-chat';

/**
 * Calculate file changes between old and new file systems
 */
export function calculateFileChanges(oldFiles: FileSystem, newFiles: FileSystem): FileChange[] {
  const changes: FileChange[] = [];
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  for (const path of allPaths) {
    const oldContent = oldFiles[path];
    const newContent = newFiles[path];

    if (!oldContent && newContent) {
      changes.push({
        path,
        type: 'added',
        additions: newContent.split('\n').length,
        deletions: 0,
      });
    } else if (oldContent && !newContent) {
      changes.push({
        path,
        type: 'deleted',
        additions: 0,
        deletions: oldContent.split('\n').length,
      });
    } else if (oldContent !== newContent) {
      const oldLines = oldContent?.split('\n').length || 0;
      const newLines = newContent?.split('\n').length || 0;
      changes.push({
        path,
        type: 'modified',
        additions: Math.max(0, newLines - oldLines),
        deletions: Math.max(0, oldLines - newLines),
      });
    }
  }

  return changes;
}

/**
 * Create token usage object from API response or estimation
 */
export function createTokenUsage(
  apiUsage?: { inputTokens?: number; outputTokens?: number },
  _prompt?: string,
  response?: string,
  newFiles?: Record<string, string>
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  // Use API usage if available
  if (apiUsage?.inputTokens || apiUsage?.outputTokens) {
    const inputTokens = apiUsage.inputTokens || 0;
    const outputTokens = apiUsage.outputTokens || 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  // Estimate from response size
  const responseTokens = Math.ceil((response?.length || 0) / 4);
  const filesTokens = newFiles
    ? Math.ceil(Object.values(newFiles).join('').length / 4)
    : 0;

  return {
    inputTokens: 0,
    outputTokens: responseTokens || filesTokens,
    totalTokens: responseTokens || filesTokens,
  };
}

/**
 * Build system instruction for code generation
 * Uses tool calling for all file operations
 * @param projectId - Optional project ID for style guide lookup
 */
export function buildSystemInstruction(
  existingApp: boolean,
  hasBrand: boolean,
  isEducationMode: boolean,
  diffModeEnabled: boolean,
  techStackInstruction: string,
  projectId?: string
): string {
  // Tool calling mode - use basic generation prompt
  let systemInstruction = getGenerationPrompt(); // No format argument
  console.log(`[buildSystemInstruction] Tool calling mode, prompt starts: ${systemInstruction.substring(0, 50)}`);

  // Include project context if available (style guide + project summary)
  if (projectId) {
    const projectContext = getContextForPrompt(projectId);
    if (projectContext) {
      systemInstruction += '\n\n' + projectContext;
      console.log(`[SystemInstruction] Including project context for: ${projectId}`);
    }
  }

  if (hasBrand) {
    systemInstruction += `\n\n**BRANDING**: Extract the PRIMARY DOMINANT COLOR from the brand logo and use it for primary actions/accents.`;
  }

  if (isEducationMode) {
    systemInstruction += `\n\n**EDUCATION MODE**: Add detailed inline comments explaining complex Tailwind classes and React hooks.`;
  }

  // Add technology stack instructions
  systemInstruction += techStackInstruction;

  // Add update mode instructions
  if (existingApp) {
    if (diffModeEnabled) {
      systemInstruction += SEARCH_REPLACE_MODE_INSTRUCTION;
    } else {
      systemInstruction += STANDARD_UPDATE_INSTRUCTION;
    }
  }

  return systemInstruction;
}

/**
 * Build prompt parts for generation request
 * Uses smart file context tracking to only include changed files
 */
export function buildPromptParts(
  userPrompt: string,
  attachments: ChatAttachment[],
  files: FileSystem,
  existingApp: boolean,
  contextId: string = MAIN_CHAT_CONTEXT
): {
  promptParts: string[];
  images: { data: string; mimeType: string }[];
  fileDelta: FileContextDelta | null;
  fileContext: FileContextInfo | null;
} {
  const promptParts: string[] = [];
  const images: { data: string; mimeType: string }[] = [];
  let fileDelta: FileContextDelta | null = null;
  let fileContext: FileContextInfo | null = null;

  const sketchAtt = attachments.find((a) => a.type === 'sketch');
  const brandAtt = attachments.find((a) => a.type === 'brand');

  if (sketchAtt) {
    const base64Data = sketchAtt.preview.split(',')[1];
    promptParts.push('SKETCH/WIREFRAME: [attached image]');
    images.push({ data: base64Data, mimeType: sketchAtt.file.type });
  }

  if (brandAtt) {
    const base64Data = brandAtt.preview.split(',')[1];
    promptParts.push('BRAND LOGO: [attached image]');
    images.push({ data: base64Data, mimeType: brandAtt.file.type });
  }

  if (existingApp) {
    // Get file context tracker
    const tracker = getFileContextTracker(contextId);
    fileDelta = tracker.getDelta(files);

    // Generate codemap for structure understanding (always include)
    const codeContext = generateContextForPrompt(files);
    promptParts.push(codeContext);

    // Check if delta mode is enabled and if we have tracked context
    const deltaEnabled = isFileContextDeltaEnabled();
    const isFirstTurn = !deltaEnabled || !tracker.hasTrackedFiles();
    const totalFiles = Object.keys(files).length;

    if (isFirstTurn) {
      // First turn: send full file summaries for all files
      console.log('[BuildPrompt] First turn - sending all file summaries');
      const fileSummaries = Object.entries(files).map(([path, content]) => {
        const contentStr = typeof content === 'string' ? content : String(content);
        return {
          path,
          preview: contentStr.length > FILE_CONTEXT_PREVIEW_LENGTH
            ? contentStr.substring(0, FILE_CONTEXT_PREVIEW_LENGTH) + '...'
            : contentStr,
          size: contentStr.length,
          lines: contentStr.split('\n').length,
        };
      });
      promptParts.push(`### All Project Files\n\`\`\`json\n${JSON.stringify(fileSummaries, null, 2)}\n\`\`\``);

      // Build file context info for first turn
      fileContext = {
        totalFiles,
        filesInPrompt: totalFiles, // All files are summarized
        filesInContext: 0, // No prior context
        newFiles: totalFiles,
        modifiedFiles: 0,
        deletedFiles: 0,
        tokensSaved: 0,
        isFirstTurn: true,
        deltaEnabled,
      };
    } else {
      // Subsequent turns: only send changed files with full content
      const { changed, unchanged, deleted } = fileDelta;

      // Calculate tokens saved by not re-sending unchanged files
      let tokensSaved = 0;
      for (const path of unchanged) {
        const state = tracker.getFileState(path);
        if (state) {
          tokensSaved += Math.ceil(state.size / 4);
        }
      }

      console.log(`[BuildPrompt] Delta mode - changed: ${changed.length}, unchanged: ${unchanged.length}, saved: ~${tokensSaved} tokens`);

      // Add context about unchanged files (just names, no content)
      if (unchanged.length > 0) {
        promptParts.push(`### Unchanged Files (already in context)\n${unchanged.map(p => `- ${p}`).join('\n')}`);
      }

      // Add deleted files notification
      if (deleted.length > 0) {
        promptParts.push(`### Deleted Files\n${deleted.map(p => `- ${p} (removed)`).join('\n')}`);
      }

      // Add changed files with FULL content
      if (changed.length > 0) {
        const changedFilesContent = changed.map((path) => {
          const content = files[path];
          const contentStr = typeof content === 'string' ? content : String(content);
          const isNew = fileDelta?.new.includes(path);
          return `#### ${path} ${isNew ? '(NEW)' : '(MODIFIED)'}\n\`\`\`\n${contentStr}\n\`\`\``;
        });
        promptParts.push(`### Changed Files (full content)\n${changedFilesContent.join('\n\n')}`);
      }

      // Build file context info for delta mode
      const newFilesCount = fileDelta?.new.length || 0;
      fileContext = {
        totalFiles,
        filesInPrompt: changed.length, // Only changed files have full content
        filesInContext: unchanged.length, // Files AI already knows about
        newFiles: newFilesCount,
        modifiedFiles: changed.length - newFilesCount,
        deletedFiles: deleted.length,
        tokensSaved,
        isFirstTurn: false,
        deltaEnabled,
      };
    }

    promptParts.push(`\nUSER REQUEST: ${userPrompt || 'Refine the app based on the attached images.'}`);
  } else {
    promptParts.push(
      `TASK: Create a React app from this design. ${userPrompt ? `Additional context: ${userPrompt}` : ''}`
    );
  }

  return { promptParts, images, fileDelta, fileContext };
}

/**
 * Mark files as shared after successful prompt
 * Call this after AI response is received
 * Only tracks if delta mode is enabled
 */
export function markFilesAsShared(files: FileSystem, contextId: string = MAIN_CHAT_CONTEXT): void {
  if (!isFileContextDeltaEnabled()) {
    console.log('[FileContext] Delta mode disabled - skipping file tracking');
    return;
  }
  const tracker = getFileContextTracker(contextId);
  tracker.markFilesAsShared(files);
}

/**
 * Get file context stats
 */
export function getFileContextStats(files: FileSystem, contextId: string = MAIN_CHAT_CONTEXT) {
  const tracker = getFileContextTracker(contextId);
  return tracker.getStats(files);
}

/**
 * Get active provider with manager, model, and provider name.
 * Reduces the 3-line boilerplate pattern across all AI hooks.
 */
export function getActiveProvider(fallbackModel: string): {
  manager: ReturnType<typeof getProviderManager>;
  model: string;
  providerName: string;
  providerType: ProviderType | undefined;
} {
  const manager = getProviderManager();
  const activeConfig = manager.getActiveConfig();
  return {
    manager,
    model: activeConfig?.defaultModel || fallbackModel,
    providerName: activeConfig?.name || 'AI',
    providerType: activeConfig?.type,
  };
}

/**
 * Clear file context (for Start Fresh)
 */
export function clearFileContext(contextId: string = MAIN_CHAT_CONTEXT): void {
  const tracker = getFileContextTracker(contextId);
  tracker.clear();
}
