/**
 * Prompt Template System
 *
 * Loads system prompts from /prompts directory and supports variable interpolation.
 * Variables use {{VARIABLE_NAME}} syntax.
 */

// Import prompts as raw text (Vite handles this with ?raw suffix)
import generationPrompt from '../prompts/generation.md?raw';
import generationMarkerPrompt from '../prompts/generation-marker.md?raw';
import generationToolsPrompt from '../prompts/generation-tools.md?raw';
import inspectEditPrompt from '../prompts/inspect-edit.md?raw';
import autoFixPrompt from '../prompts/auto-fix.md?raw';
import quickEditPrompt from '../prompts/quick-edit.md?raw';
import accessibilityPrompt from '../prompts/accessibility.md?raw';
import promptImproverPrompt from '../prompts/prompt-improver.md?raw';
import consultantPrompt from '../prompts/consultant.md?raw';
import commitMessagePrompt from '../prompts/commit-message.md?raw';
import { getFluidFlowConfig, type AIResponseFormat } from './fluidflowConfig';

// Template types
export type PromptTemplateId =
  | 'generation'
  | 'generation-tools'
  | 'inspect-edit'
  | 'auto-fix'
  | 'quick-edit'
  | 'accessibility'
  | 'prompt-improver'
  | 'consultant'
  | 'commit-message';

// Template registry
const templates: Record<PromptTemplateId, string> = {
  'generation': generationPrompt,
  'generation-tools': generationToolsPrompt,
  'inspect-edit': inspectEditPrompt,
  'auto-fix': autoFixPrompt,
  'quick-edit': quickEditPrompt,
  'accessibility': accessibilityPrompt,
  'prompt-improver': promptImproverPrompt,
  'consultant': consultantPrompt,
  'commit-message': commitMessagePrompt,
};

// Variable interpolation
export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Interpolate variables in a template string
 * Variables use {{VARIABLE_NAME}} syntax
 */
function interpolate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`[PromptTemplates] Missing variable: ${key}`);
      return match; // Keep original if not found
    }
    return String(value);
  });
}

/**
 * Get a prompt template by ID
 */
export function getPromptTemplate(id: PromptTemplateId): string {
  const template = templates[id];
  if (!template) {
    console.error(`[PromptTemplates] Template not found: ${id}`);
    return '';
  }
  return template;
}

/**
 * Get a prompt template with variables interpolated
 */
export function getPrompt(id: PromptTemplateId, variables: TemplateVariables = {}): string {
  const template = getPromptTemplate(id);
  return interpolate(template, variables);
}

/**
 * List all available template IDs
 */
export function listTemplates(): PromptTemplateId[] {
  return Object.keys(templates) as PromptTemplateId[];
}

/**
 * Check if a template exists
 */
export function hasTemplate(id: string): id is PromptTemplateId {
  return id in templates;
}

/**
 * Get the generation prompt based on the configured response format
 * @param format - Optional override, otherwise uses config setting
 */
export function getGenerationPrompt(format?: AIResponseFormat): string {
  const effectiveFormat = format ?? getFluidFlowConfig().getResponseFormat();
  console.log(`[getGenerationPrompt] format param=${format}, effectiveFormat=${effectiveFormat}`);

  if (effectiveFormat === 'marker') {
    console.log('[PromptTemplates] Using MARKER format generation prompt');
    return generationMarkerPrompt;
  }

  if (effectiveFormat === 'tools') {
    console.log('[PromptTemplates] Using TOOLS format generation prompt');
    return generationToolsPrompt;
  }

  console.log('[PromptTemplates] Using JSON format generation prompt');
  return generationPrompt;
}

// Export individual templates for direct access
export const PROMPTS = {
  generation: generationPrompt,
  generationMarker: generationMarkerPrompt,
  generationTools: generationToolsPrompt,
  inspectEdit: inspectEditPrompt,
  autoFix: autoFixPrompt,
  quickEdit: quickEditPrompt,
  accessibility: accessibilityPrompt,
  promptImprover: promptImproverPrompt,
  consultant: consultantPrompt,
  commitMessage: commitMessagePrompt,
} as const;

export default {
  get: getPrompt,
  getTemplate: getPromptTemplate,
  list: listTemplates,
  has: hasTemplate,
  PROMPTS,
};
