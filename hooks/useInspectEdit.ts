/**
 * useInspectEdit Hook
 *
 * Handles element-scoped editing via the inspector feature.
 * Extracted from ControlPanel/handleSend to reduce complexity.
 */

import { useCallback } from 'react';
import { FileSystem, ChatMessage } from '../types';
import { generateContextForPrompt, generateCodeMap } from '../utils/codemap';
import { debugLog } from './useDebugStore';
import { getProviderManager } from '../services/ai';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from '../services/ai/utils/schemas';
import { InspectedElement, EditScope } from '../components/PreviewPanel/ComponentInspector';
import { buildInspectEditInstruction } from '../components/ControlPanel/prompts';
import { calculateFileChanges, createTokenUsage } from '../utils/generationUtils';
import { PROJECT_TOOLS } from '../services/ai/utils/toolExecutor';
import { createProjectToolExecutor } from '../services/ai/utils/projectToolHandler';

export interface InspectContext {
  element: InspectedElement;
  scope: EditScope;
}

export interface UseInspectEditOptions {
  files: FileSystem;
  selectedModel: string;
  projectId?: string;
  generateSystemInstruction: () => string;
  setStreamingStatus: (status: string) => void;
  setIsGenerating: (value: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  reviewChange: (label: string, newFiles: FileSystem) => void;
}

export interface UseInspectEditReturn {
  handleInspectEditRequest: (
    prompt: string,
    inspectContext: InspectContext
  ) => Promise<boolean>;
}

export function useInspectEdit(options: UseInspectEditOptions): UseInspectEditReturn {
  const {
    files,
    selectedModel,
    projectId,
    generateSystemInstruction,
    setStreamingStatus,
    setIsGenerating,
    setMessages,
    reviewChange,
  } = options;

  /**
   * Build a specific selector for the target element
   */
  const buildElementSelector = useCallback(
    (element: InspectedElement, scope: EditScope): string => {
      // 1. FluidFlow ID (most specific for single element)
      if (scope === 'element' && element.ffId) {
        return `data-ff-id="${element.ffId}"`;
      }
      // 2. FluidFlow Group (for group editing)
      if (scope === 'group' && element.ffGroup) {
        return `data-ff-group="${element.ffGroup}"`;
      }
      // 3. HTML id attribute
      if (element.id) {
        return `#${element.id}`;
      }
      // 4. CSS classes (filter out generated/utility prefixes, take meaningful ones)
      if (element.className) {
        const classes = element.className
          .split(' ')
          .filter(
            (c) => c && c.length > 2 && !c.startsWith('css-') && !c.match(/^[a-z]+-\d+$/)
          )
          .slice(0, 3);
        if (classes.length > 0) {
          return `<${element.tagName.toLowerCase()}>.${classes.join('.')}`;
        }
      }
      // 5. Text content as identifier
      if (element.textContent && element.textContent.trim().length > 0) {
        const text = element.textContent.trim().slice(0, 40);
        return `<${element.tagName.toLowerCase()}> with text "${text}"`;
      }
      // 6. Tag + component (last resort)
      return `<${element.tagName.toLowerCase()}> in ${element.componentName || 'component'}`;
    },
    []
  );

  /**
   * Handle inspect edit request - element-scoped editing
   * Returns true if handled, false if not an inspect edit request
   */
  const handleInspectEditRequest = useCallback(
    async (prompt: string, inspectContext: InspectContext): Promise<boolean> => {
      const { element, scope } = inspectContext;
      console.log('[InspectEdit] Context received:', { element, scope, prompt });

      const manager = getProviderManager();
      const activeProvider = manager.getActiveConfig();
      const currentModel = activeProvider?.defaultModel || selectedModel;
      const providerName = activeProvider?.name || 'AI';

      const targetSelector = buildElementSelector(element, scope);
      console.log('[InspectEdit] Target selector:', targetSelector);

      // Tool calling configuration - MUST be defined before systemInstruction
      const hasToolExecutor = !!(projectId && activeProvider?.allowToolWrites);
      const toolExecutor = hasToolExecutor
        ? createProjectToolExecutor(projectId, true)
        : undefined;

      console.log('[InspectEdit] Tool calling config:', {
        projectId,
        hasToolExecutor,
        allowToolWrites: activeProvider?.allowToolWrites,
        toolExecutorDefined: !!toolExecutor,
      });

      const systemInstruction = buildInspectEditInstruction(
        scope,
        targetSelector,
        element.componentName
      );

      // Add tech stack
      const techStackInstruction = generateSystemInstruction();

      // Build the prompt with element context
      const elementDetails = `
## TARGET ELEMENT DETAILS:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
${element.ffGroup ? `- FluidFlow Group: data-ff-group="${element.ffGroup}"` : ''}
${element.ffId ? `- FluidFlow ID: data-ff-id="${element.ffId}"` : ''}
- Text: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent chain: ${element.parentComponents.join(' > ')}` : ''}

## USER REQUEST:
${prompt}

## REMINDER: Only modify the element with ${targetSelector}. Everything else MUST remain unchanged.`;

      const promptParts: string[] = [elementDetails];
      const images: { data: string; mimeType: string }[] = [];

      // Add codemap context for better AI understanding
      const codeContext = generateContextForPrompt(files);
      promptParts.push(`\n${codeContext}`);

      // Add target component file content (more efficient than all files)
      const componentName = element.componentName;
      const targetFilePath = componentName
        ? Object.keys(files).find((p) => p.includes(componentName)) || 'src/App.tsx'
        : 'src/App.tsx';
      const targetFileContent = files[targetFilePath];
      if (targetFileContent) {
        promptParts.push(
          `\n## TARGET FILE TO MODIFY:\n**${targetFilePath}**\n\`\`\`tsx\n${targetFileContent}\n\`\`\``
        );
      }

      // Add related files if any (imports from target file)
      const targetFileInfo = generateCodeMap(files).files.find((f) => f.path === targetFilePath);
      if (targetFileInfo) {
        const relatedPaths = targetFileInfo.imports
          .filter((i) => i.from.startsWith('.'))
          .map((i) => {
            const base = targetFilePath.substring(0, targetFilePath.lastIndexOf('/'));
            return i.from.startsWith('./')
              ? `${base}/${i.from.slice(2)}.tsx`
              : `${base}/${i.from}.tsx`;
          })
          .filter((p) => files[p]);

        if (relatedPaths.length > 0) {
          promptParts.push('\n## RELATED FILES (for context only, do NOT modify unless necessary):');
          for (const path of relatedPaths.slice(0, 3)) {
            promptParts.push(`\n**${path}**\n\`\`\`tsx\n${files[path]}\n\`\`\``);
          }
        }
      }

      const finalPrompt = promptParts.join('\n');

      // Make AI request
      debugLog.request('quick-edit', {
        model: currentModel,
        prompt: finalPrompt.slice(0, 500) + '...',
        metadata: { element: element.ffId || element.tagName, scope },
      });

      setStreamingStatus('🎯 Editing element...');

      try {
        const response = await manager.generate(
          {
            prompt: finalPrompt,
            systemInstruction: systemInstruction + techStackInstruction,
            images: images.length > 0 ? images : undefined,
            debugCategory: 'quick-edit',
            // Tool calling
            tools: PROJECT_TOOLS,
            toolExecutor,
            toolChoice: 'auto',
            allowToolWrites: activeProvider?.allowToolWrites ?? false,
            projectId,
          },
          currentModel
        );

        console.log('[InspectEdit] Response received:', {
          hasText: !!response.text,
          textLength: response.text?.length,
          filesWritten: response.filesWritten,
        });

        // If tool calling was used and files were written, handle them directly
        if (response.filesWritten && response.filesWritten.length > 0) {
          // Files were written via tool calling - we need to read them back
          const { projectApi } = await import('../services/projectApi');
          const newFiles: FileSystem = { ...files };
          for (const filePath of response.filesWritten) {
            try {
              const content = await projectApi.readFile(projectId!, filePath);
              newFiles[filePath] = content;
            } catch (e) {
              console.warn(`[InspectEdit] Could not read file ${filePath}:`, e);
            }
          }

          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: `🎯 Modified element via tool calling: ${targetSelector}`,
            files: Object.fromEntries(
              response.filesWritten.map((path) => [path, newFiles[path] || ''])
            ),
            fileChanges: calculateFileChanges(files, newFiles),
            snapshotFiles: { ...files },
            model: currentModel,
            provider: providerName,
            tokenUsage: createTokenUsage(response?.usage, undefined, '', newFiles),
          };
          setMessages((prev) => [...prev, assistantMessage]);

          reviewChange(`Edit: ${element.ffId || element.tagName}`, newFiles);
          return true;
        }

        // Tool calling succeeded but no files written - this is unexpected
        console.warn('[InspectEdit] Tool calling completed but no files were written');
        return true;
      } catch (error) {
        console.error('[InspectEdit] Error:', error);
        setStreamingStatus(
          '❌ Edit failed: ' + (error instanceof Error ? error.message : 'Unknown error')
        );
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [
      files,
      selectedModel,
      projectId,
      generateSystemInstruction,
      setStreamingStatus,
      setIsGenerating,
      setMessages,
      reviewChange,
      buildElementSelector,
    ]
  );

  return {
    handleInspectEditRequest,
  };
}
