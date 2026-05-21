/**
 * Project Context Service
 *
 * Generates and stores project context summaries for consistent AI responses.
 * Instead of sending all files to AI (which doesn't persist), we generate
 * condensed summaries that are included in every prompt's system instruction.
 *
 * Two types of summaries:
 * 1. Style Guide - Design patterns, colors, typography, conventions
 * 2. Project Summary - What the project does, architecture, key files
 */

import { getProviderManager } from './ai';
import { FileSystem } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface StyleGuide {
  // Color System
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    text?: string;
    textMuted?: string;
    border?: string;
    success?: string;
    warning?: string;
    error?: string;
  };

  // Typography
  typography: {
    fontFamily: string;           // e.g., "font-sans", "Inter, sans-serif"
    headingStyle: string;         // e.g., "font-bold text-xl"
    bodyStyle: string;            // e.g., "text-sm text-slate-300"
    fontSizes: string[];          // e.g., ["text-xs", "text-sm", "text-base", "text-lg"]
  };

  // Spacing & Layout
  spacing: {
    containerPadding: string;     // e.g., "p-4", "px-6 py-4"
    elementGap: string;           // e.g., "gap-2", "gap-4"
    sectionSpacing: string;       // e.g., "space-y-6", "mb-8"
  };

  // Border & Radius
  borders: {
    radius: string;               // e.g., "rounded-lg", "rounded-xl", "rounded-2xl"
    width: string;                // e.g., "border", "border-2"
    style: string;                // e.g., "border-white/10", "border-slate-700"
  };

  // Effects
  effects: {
    shadow: string;               // e.g., "shadow-lg", "shadow-xl shadow-black/20"
    blur: string;                 // e.g., "backdrop-blur-sm", "backdrop-blur-xl"
    opacity: string;              // e.g., "bg-opacity-50", "bg-white/10"
  };

  // Interactive Elements
  buttons: {
    primary: string;              // Full class string for primary button
    secondary: string;            // Full class string for secondary button
    icon: string;                 // Icon button style
  };

  // Components Patterns
  patterns: string[];             // Visual patterns like "Glass morphism", "Dark theme"
  conventions: string[];          // Code patterns
  components: string[];           // Reusable component names

  // Summary
  summary: string;
}

export interface ProjectSummary {
  name: string;
  purpose: string;
  architecture: string;
  keyFiles: Record<string, string>; // path -> description
  features: string[];
  techStack: string[];
  summary: string;
}

export interface ProjectContext {
  projectId: string;
  generatedAt: number;
  styleGuide: StyleGuide;
  projectSummary: ProjectSummary;
  // Combined summary for system instruction (~1000 tokens)
  combinedPrompt: string;
}

// ============================================================================
// Storage
// ============================================================================

const STORAGE_KEY = 'fluidflow_project_contexts';

export function getProjectContexts(): Record<string, ProjectContext> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function getProjectContext(projectId: string): ProjectContext | null {
  const contexts = getProjectContexts();
  return contexts[projectId] || null;
}

export function saveProjectContext(context: ProjectContext): void {
  const contexts = getProjectContexts();
  contexts[context.projectId] = context;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contexts));
  console.log(`[ProjectContext] Saved context for project: ${context.projectId}`);
}

export function deleteProjectContext(projectId: string): void {
  const contexts = getProjectContexts();
  delete contexts[projectId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contexts));
}

// ============================================================================
// System Instructions for Generation
// ============================================================================

const STYLE_GUIDE_SYSTEM = `You are analyzing a React/TypeScript codebase to extract a comprehensive design system.

Respond with ONLY a valid JSON object matching this exact structure:
{
  "colors": {
    "primary": "primary color (hex or tailwind, e.g., '#3b82f6' or 'blue-500')",
    "secondary": "secondary color",
    "accent": "accent/highlight color",
    "background": "main background (e.g., 'slate-900', '#0f172a')",
    "surface": "card/panel background (e.g., 'slate-800/50')",
    "text": "main text color (e.g., 'white', 'slate-100')",
    "textMuted": "secondary text (e.g., 'slate-400', 'white/60')",
    "border": "border color (e.g., 'white/10', 'slate-700')",
    "success": "success color (e.g., 'green-500')",
    "warning": "warning color (e.g., 'amber-500')",
    "error": "error color (e.g., 'red-500')"
  },
  "typography": {
    "fontFamily": "font family (e.g., 'font-sans', 'Inter, system-ui')",
    "headingStyle": "heading classes (e.g., 'font-semibold text-lg text-white')",
    "bodyStyle": "body text classes (e.g., 'text-sm text-slate-300')",
    "fontSizes": ["text sizes used, e.g., 'text-xs', 'text-sm', 'text-base'"]
  },
  "spacing": {
    "containerPadding": "container padding (e.g., 'p-4', 'px-6 py-4')",
    "elementGap": "common gap between elements (e.g., 'gap-2', 'gap-4')",
    "sectionSpacing": "spacing between sections (e.g., 'space-y-4', 'mb-6')"
  },
  "borders": {
    "radius": "border radius (e.g., 'rounded-lg', 'rounded-xl', 'rounded-2xl')",
    "width": "border width (e.g., 'border', 'border-2')",
    "style": "border style classes (e.g., 'border-white/10', 'border border-slate-700')"
  },
  "effects": {
    "shadow": "shadow style (e.g., 'shadow-lg', 'shadow-xl shadow-black/50')",
    "blur": "backdrop blur (e.g., 'backdrop-blur-sm', 'backdrop-blur-xl')",
    "opacity": "opacity patterns (e.g., 'bg-white/10', 'bg-slate-800/50')"
  },
  "buttons": {
    "primary": "full primary button classes (e.g., 'px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg')",
    "secondary": "full secondary button classes",
    "icon": "icon button classes (e.g., 'p-2 hover:bg-white/10 rounded-lg')"
  },
  "patterns": ["3-5 visual patterns, e.g., 'Glass morphism cards', 'Gradient accents'"],
  "conventions": ["3-5 code patterns, e.g., 'React.FC with interfaces', 'Tailwind for all styling'"],
  "components": ["List of reusable components found in the codebase"],
  "summary": "2-3 sentence design summary describing the overall visual style"
}

RULES:
- Extract ACTUAL values from the code - do NOT invent or guess
- Use exact Tailwind classes found in the code
- For colors, prefer Tailwind classes (e.g., "blue-500") over hex when Tailwind is used
- If a value is not found, use empty string "" or empty array []
- Keep arrays to 3-5 items max for conciseness
- JSON only, no markdown or explanation`;

const PROJECT_SUMMARY_SYSTEM = `You are analyzing a React/TypeScript codebase to understand its purpose and architecture.

Respond with ONLY a valid JSON object:
{
  "name": "Project name (infer from package.json or main component)",
  "purpose": "1-2 sentences: What does this app do? Who is it for?",
  "architecture": "1-2 sentences: How is it structured? (e.g., 'SPA with context-based state')",
  "keyFiles": {
    "src/App.tsx": "Brief role description",
    "src/components/Main.tsx": "Brief role description"
  },
  "features": ["List of 3-5 main features"],
  "techStack": ["React", "TypeScript", "Tailwind", etc.],
  "summary": "2-3 sentence overall project summary"
}

RULES:
- Infer from actual code, don't guess
- keyFiles: only include 3-5 most important files
- Keep arrays to 3-5 items max
- JSON only, no markdown`;

// ============================================================================
// Code Sampling
// ============================================================================

function buildCodeSample(files: FileSystem, maxTokens: number = 25000): string {
  const relevantExtensions = ['.tsx', '.jsx', '.css', '.scss', '.ts', '.js', '.json'];

  // Categorize and prioritize files
  const prioritized: string[] = [];
  const regular: string[] = [];

  for (const path of Object.keys(files)) {
    const ext = '.' + path.split('.').pop()?.toLowerCase();
    if (!relevantExtensions.includes(ext)) continue;

    // Priority files
    const isPriority =
      path.includes('App.') ||
      path.includes('index.') ||
      path.includes('style') ||
      path.includes('theme') ||
      path.includes('context') ||
      path.includes('hook') ||
      path === 'package.json' ||
      path.endsWith('.css');

    if (isPriority) {
      prioritized.push(path);
    } else {
      regular.push(path);
    }
  }

  // Build sample
  let sample = '';
  let tokenCount = 0;
  const allFiles = [...prioritized, ...regular];

  for (const path of allFiles) {
    const content = files[path];
    if (!content) continue;

    const fileTokens = Math.ceil(content.length / 4);

    if (tokenCount + fileTokens > maxTokens) {
      // Add truncated version if there's room
      const remaining = maxTokens - tokenCount;
      if (remaining > 500) {
        const chars = remaining * 4;
        sample += `\n### ${path} (truncated)\n\`\`\`\n${content.substring(0, chars)}\n...\n\`\`\`\n`;
      }
      break;
    }

    sample += `\n### ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
    tokenCount += fileTokens;
  }

  return sample;
}

// ============================================================================
// Generation Functions
// ============================================================================

export async function generateStyleGuide(
  files: FileSystem,
  onProgress?: (status: string) => void
): Promise<StyleGuide> {
  const manager = getProviderManager();
  onProgress?.('Analyzing design patterns...');

  const sample = buildCodeSample(files, 25000);
  const prompt = `Analyze this codebase and extract the style guide:\n${sample}`;

  const response = await manager.generate({
    prompt,
    systemInstruction: STYLE_GUIDE_SYSTEM,
    responseFormat: 'text'
  });

  // Parse JSON
  const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in style guide response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse style guide JSON (model may have returned truncated/invalid output): ${e instanceof Error ? e.message : String(e)}`);
  }
  onProgress?.('Style guide complete!');

  return {
    colors: {
      primary: parsed.colors?.primary || '',
      secondary: parsed.colors?.secondary || '',
      accent: parsed.colors?.accent || '',
      background: parsed.colors?.background || '',
      surface: parsed.colors?.surface || '',
      text: parsed.colors?.text || '',
      textMuted: parsed.colors?.textMuted || '',
      border: parsed.colors?.border || '',
      success: parsed.colors?.success || '',
      warning: parsed.colors?.warning || '',
      error: parsed.colors?.error || '',
    },
    typography: {
      fontFamily: parsed.typography?.fontFamily || '',
      headingStyle: parsed.typography?.headingStyle || '',
      bodyStyle: parsed.typography?.bodyStyle || '',
      fontSizes: parsed.typography?.fontSizes || [],
    },
    spacing: {
      containerPadding: parsed.spacing?.containerPadding || '',
      elementGap: parsed.spacing?.elementGap || '',
      sectionSpacing: parsed.spacing?.sectionSpacing || '',
    },
    borders: {
      radius: parsed.borders?.radius || '',
      width: parsed.borders?.width || '',
      style: parsed.borders?.style || '',
    },
    effects: {
      shadow: parsed.effects?.shadow || '',
      blur: parsed.effects?.blur || '',
      opacity: parsed.effects?.opacity || '',
    },
    buttons: {
      primary: parsed.buttons?.primary || '',
      secondary: parsed.buttons?.secondary || '',
      icon: parsed.buttons?.icon || '',
    },
    patterns: parsed.patterns || [],
    conventions: parsed.conventions || [],
    components: parsed.components || [],
    summary: parsed.summary || ''
  };
}

export async function generateProjectSummary(
  files: FileSystem,
  onProgress?: (status: string) => void
): Promise<ProjectSummary> {
  const manager = getProviderManager();
  onProgress?.('Analyzing project structure...');

  const sample = buildCodeSample(files, 25000);
  const prompt = `Analyze this codebase and summarize the project:\n${sample}`;

  const response = await manager.generate({
    prompt,
    systemInstruction: PROJECT_SUMMARY_SYSTEM,
    responseFormat: 'text'
  });

  // Parse JSON
  const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in project summary response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse project summary JSON (model may have returned truncated/invalid output): ${e instanceof Error ? e.message : String(e)}`);
  }
  onProgress?.('Project summary complete!');

  return {
    name: parsed.name || 'Unknown Project',
    purpose: parsed.purpose || '',
    architecture: parsed.architecture || '',
    keyFiles: parsed.keyFiles || {},
    features: parsed.features || [],
    techStack: parsed.techStack || [],
    summary: parsed.summary || ''
  };
}

/**
 * Generate complete project context (both summaries)
 */
export async function generateProjectContext(
  projectId: string,
  files: FileSystem,
  onProgress?: (status: string) => void
): Promise<ProjectContext> {
  onProgress?.('Step 1/2: Analyzing design...');

  // Generate both in parallel? No, sequential is safer for rate limits
  const styleGuide = await generateStyleGuide(files, onProgress);

  onProgress?.('Step 2/2: Analyzing project...');
  const projectSummary = await generateProjectSummary(files, onProgress);

  // Build combined prompt for system instruction
  const combinedPrompt = formatContextForPrompt(styleGuide, projectSummary);

  const context: ProjectContext = {
    projectId,
    generatedAt: Date.now(),
    styleGuide,
    projectSummary,
    combinedPrompt
  };

  // Save to storage
  saveProjectContext(context);
  onProgress?.('Context generation complete!');

  return context;
}

// ============================================================================
// Formatting for System Instruction
// ============================================================================

function formatContextForPrompt(style: StyleGuide, project: ProjectSummary): string {
  const keyFilesList = Object.entries(project.keyFiles)
    .map(([path, desc]) => `  ${path}: ${desc}`)
    .join('\n');

  // Build color section
  const colorEntries = Object.entries(style.colors)
    .filter(([_, v]) => v)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  // Build typography section
  const typographySection = [
    style.typography.fontFamily && `Font: ${style.typography.fontFamily}`,
    style.typography.headingStyle && `Headings: ${style.typography.headingStyle}`,
    style.typography.bodyStyle && `Body: ${style.typography.bodyStyle}`,
    style.typography.fontSizes.length && `Sizes: ${style.typography.fontSizes.join(', ')}`,
  ].filter(Boolean).join('\n  ');

  // Build spacing section
  const spacingSection = [
    style.spacing.containerPadding && `Padding: ${style.spacing.containerPadding}`,
    style.spacing.elementGap && `Gap: ${style.spacing.elementGap}`,
    style.spacing.sectionSpacing && `Sections: ${style.spacing.sectionSpacing}`,
  ].filter(Boolean).join(', ');

  // Build borders section
  const bordersSection = [
    style.borders.radius && `Radius: ${style.borders.radius}`,
    style.borders.width && `Width: ${style.borders.width}`,
    style.borders.style && `Style: ${style.borders.style}`,
  ].filter(Boolean).join(', ');

  // Build effects section
  const effectsSection = [
    style.effects.shadow && `Shadow: ${style.effects.shadow}`,
    style.effects.blur && `Blur: ${style.effects.blur}`,
    style.effects.opacity && `Opacity: ${style.effects.opacity}`,
  ].filter(Boolean).join(', ');

  // Build buttons section
  const buttonsSection = [
    style.buttons.primary && `Primary: ${style.buttons.primary}`,
    style.buttons.secondary && `Secondary: ${style.buttons.secondary}`,
    style.buttons.icon && `Icon: ${style.buttons.icon}`,
  ].filter(Boolean).join('\n  ');

  return `
## PROJECT CONTEXT

### About This Project
${project.summary}

**Purpose:** ${project.purpose}
**Architecture:** ${project.architecture}
**Tech Stack:** ${project.techStack.join(', ')}

### Key Files
${keyFilesList}

### Design System
${style.summary}

**Colors:**
${colorEntries}

**Typography:**
  ${typographySection}

**Spacing:** ${spacingSection}

**Borders:** ${bordersSection}

**Effects:** ${effectsSection}

**Buttons:**
  ${buttonsSection}

**Visual Patterns:** ${style.patterns.join(', ')}

**Code Conventions:** ${style.conventions.join(', ')}

**Key Components:** ${style.components.join(', ')}

---
**CRITICAL:** You MUST follow this project's design system exactly:
- Use the exact colors, border-radius, shadows, and spacing defined above
- Match button styles, typography, and visual patterns
- Maintain consistency with existing components
`.trim();
}

/**
 * Get formatted context for system instruction
 */
export function getContextForPrompt(projectId: string): string | null {
  const context = getProjectContext(projectId);
  if (!context) return null;
  return context.combinedPrompt;
}

// ============================================================================
// Legacy compatibility - re-export for existing code
// ============================================================================

export function getStyleGuide(projectId: string): StyleGuide | null {
  const context = getProjectContext(projectId);
  return context?.styleGuide || null;
}

export function formatStyleGuideForPrompt(style: StyleGuide): string {
  // Minimal format for backward compatibility
  const colors = Object.entries(style.colors)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return `
## STYLE GUIDE
${style.summary}

Colors: ${colors}
Typography: ${style.typography.fontFamily}, ${style.typography.headingStyle}
Borders: ${style.borders.radius}, ${style.borders.style}
Effects: ${style.effects.shadow}, ${style.effects.blur}
Patterns: ${style.patterns.join(', ')}
Components: ${style.components.join(', ')}
`.trim();
}
