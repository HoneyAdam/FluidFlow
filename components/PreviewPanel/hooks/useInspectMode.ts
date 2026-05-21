/**
 * useInspectMode - Handles component inspection logic
 *
 * Manages:
 * - Inspect mode toggle
 * - Element editing state
 * - Inspect edit handler (local fallback)
 */

import { useState, useCallback } from 'react';
import { FileSystem } from '@/types';
import { getProviderManager } from '@/services/ai';
import { cleanGeneratedCode } from '@/utils/cleanCode';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from '@/services/ai/utils/schemas';
import { InspectedElement, EditScope } from '../ComponentInspector';

interface UseInspectModeOptions {
  files: FileSystem;
  appCode: string | undefined;
  selectedModel: string;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  onExternalInspectEdit?: (prompt: string, element: InspectedElement, scope: EditScope) => Promise<void>;
  onClearInspectedElement: () => void;
  // External isInspectEditing state (shared with useIframeMessaging)
  isInspectEditing: boolean;
  setIsInspectEditing: (value: boolean) => void;
}

export function useInspectMode({
  files,
  appCode,
  selectedModel,
  reviewChange,
  onExternalInspectEdit,
  onClearInspectedElement,
  isInspectEditing,
  setIsInspectEditing,
}: UseInspectModeOptions) {
  const [isInspectMode, setIsInspectMode] = useState(false);

  // Toggle inspect mode
  const toggleInspectMode = useCallback(() => {
    setIsInspectMode(prev => !prev);
    onClearInspectedElement();
  }, [onClearInspectedElement]);

  // Exit inspect mode
  const exitInspectMode = useCallback(() => {
    setIsInspectMode(false);
    onClearInspectedElement();
  }, [onClearInspectedElement]);

  // Handle targeted component edit
  const handleInspectEdit = useCallback(async (
    prompt: string,
    element: InspectedElement,
    scope: EditScope
  ) => {
    if (!appCode) return;
    setIsInspectEditing(true);

    // If external handler provided (with chat history support), use it
    if (onExternalInspectEdit) {
      try {
        await onExternalInspectEdit(prompt, element, scope);
        exitInspectMode();
      } catch (error) {
        console.error('Inspect edit failed:', error);
      } finally {
        setIsInspectEditing(false);
      }
      return;
    }

    // Fallback to local implementation using provider manager
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const elementContext = `
Target Element:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
- Text content: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent components: ${element.parentComponents.join(' > ')}` : ''}
`;

      const systemInstruction = `You are a senior React/TypeScript engineer performing a SURGICAL EDIT on a single element the user picked via FluidFlow's inspector.

## TARGET
The element described under "Target Element" in the user message — its tag, component, classes, id, and text are the ONLY selector. Modify ONLY this element.

## RULES
1. Find which file owns the target component (use the "Component" hint and the file map in the user message).
2. Mutate ONLY the target element's className / inline style / text / element-specific props (onClick, href, aria-*).
3. Leave siblings, parents, and unrelated children byte-identical.
4. NEVER strip data-ff-group / data-ff-id attributes anywhere.
5. NEVER restructure JSX hierarchy or add new components/sections.
6. NEVER touch imports unless the requested element change strictly requires a new one.

## TECH STACK
- React 19 · TypeScript · Tailwind CSS 4
- Animation: motion/react (NOT framer-motion)
- Routing: react-router (NOT react-router-dom)
- Icons: lucide-react

## RESPONSE FORMAT (STRICT)
Return a JSON object — no markdown fence, no preamble — with exactly these keys:
1. "explanation": one-sentence description of the change.
2. "files": object whose keys are file paths and values are the COMPLETE updated file content (not diffs).

Only include files you actually changed. If the target cannot be located, return {"explanation":"...why...","files":{}}.`;

      const response = await manager.generate({
        prompt: `${elementContext}\n\nUser Request: ${prompt}\n\nCurrent files:\n${JSON.stringify(files, null, 2)}`,
        systemInstruction,
        responseFormat: 'json',
        responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
          ? FILE_GENERATION_SCHEMA
          : undefined,
        debugCategory: 'quick-edit'
      }, currentModel);

      const text = response.text || '{}';
      const result = JSON.parse(cleanGeneratedCode(text));

      if (result.files && Object.keys(result.files).length > 0) {
        const newFiles = { ...files, ...result.files };
        reviewChange(`Edit: ${element.componentName || element.tagName}`, newFiles);
      }

      exitInspectMode();
    } catch (error) {
      console.error('Inspect edit failed:', error);
    } finally {
      setIsInspectEditing(false);
    }
  }, [appCode, selectedModel, files, reviewChange, onExternalInspectEdit, exitInspectMode, setIsInspectEditing]);

  return {
    isInspectMode,
    isInspectEditing,
    toggleInspectMode,
    exitInspectMode,
    handleInspectEdit,
  };
}
