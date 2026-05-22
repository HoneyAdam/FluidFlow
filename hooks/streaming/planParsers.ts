/**
 * Plan Parsers
 *
 * Parse file plans from streaming AI responses.
 * Supports both JSON and Marker formats.
 */

import type { MarkerFilePlan } from '../../utils/markerFormat';
import type { FilePlan } from '../useGenerationState';
import type { ParsedFilePlan } from './types';

// ============================================================================
// Marker Plan Conversion
// ============================================================================

/**
 * Convert MarkerFilePlan to FilePlan format
 */
export function markerPlanToFilePlan(markerPlan: MarkerFilePlan): FilePlan {
  return {
    create: [...markerPlan.create, ...markerPlan.update],
    delete: markerPlan.delete,
    total: markerPlan.total,
    completed: [],
    sizes: markerPlan.sizes,
  };
}

// ============================================================================
// JSON v2 Plan Parser
// ============================================================================

/**
 * Parse file plan from JSON v2 format
 * JSON v2 has: { "meta": {...}, "plan": {"create":[], "update":[], "delete":[]}, "manifest": [...] }
 */
export function parseJsonV2Plan(fullText: string): ParsedFilePlan | null {
  // Check if this looks like JSON v2 (starts with { and has "plan": key)
  const trimmed = fullText.trim();
  if (!trimmed.startsWith('{')) return null;

  // Try to extract plan object using regex (more robust during streaming)
  const planMatch = fullText.match(/"plan"\s*:\s*\{([^}]*)\}/);
  if (!planMatch) return null;

  try {
    // Extract create/update/delete arrays from plan
    const planContent = planMatch[1] ?? '';

    const extractArray = (key: string): string[] => {
      const match = planContent.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
      if (!match) return [];
      const items = (match[1] ?? '').match(/"([^"]+)"/g);
      return items ? items.map(s => s.replace(/"/g, '')) : [];
    };

    const createFiles = extractArray('create');
    const updateFiles = extractArray('update');
    const deleteFiles = extractArray('delete');
    const allFiles = [...createFiles, ...updateFiles];

    if (allFiles.length === 0) return null;

    // Try to extract sizes from manifest using matchAll
    const sizes: Record<string, number> = {};
    const manifestMatch = fullText.match(/"manifest"\s*:\s*\[([\s\S]*?)\]/);
    if (manifestMatch) {
      // Extract each manifest entry using matchAll
      const entryPattern = /\{\s*"path"\s*:\s*"([^"]+)"[^}]*"lines"\s*:\s*(\d+)/g;
      const entries = [...(manifestMatch[1] ?? '').matchAll(entryPattern)];
      for (const entry of entries) {
        const path = entry[1];
        const lineCount = entry[2];
        if (path && lineCount) sizes[path] = parseInt(lineCount, 10);
      }
    }

    // Try to extract batch info for completed files
    let completed: string[] = [];
    const batchMatch = fullText.match(/"batch"\s*:\s*\{([^}]*)\}/);
    if (batchMatch) {
      const completedMatch = (batchMatch[1] ?? '').match(/"completed"\s*:\s*\[([^\]]*)\]/);
      if (completedMatch) {
        const items = (completedMatch[1] ?? '').match(/"([^"]+)"/g);
        completed = items ? items.map(s => s.replace(/"/g, '')) : [];
      }
    }

    console.log('[parseJsonV2Plan] Detected JSON v2 plan:', {
      create: createFiles.length,
      update: updateFiles.length,
      delete: deleteFiles.length,
      hasSizes: Object.keys(sizes).length > 0,
    });

    return {
      create: allFiles,
      delete: deleteFiles,
      total: allFiles.length,
      completed,
      sizes: Object.keys(sizes).length > 0 ? sizes : undefined,
    };
  } catch (e) {
    console.debug('[parseJsonV2Plan] Parse error:', e);
    return null;
  }
}

// ============================================================================
// Legacy PLAN Comment Parser
// ============================================================================

/**
 * Parse file plan from streaming response (JSON format)
 * Supports both:
 * - Legacy format: // PLAN: {"create":[...],"update":[...],...}
 * - JSON v2 format: {"meta":...,"plan":{"create":[...],...},"manifest":[...],...}
 */
export function parseFilePlanFromStream(fullText: string): ParsedFilePlan | null {
  // Try JSON v2 format first (has "plan": object at root level)
  const jsonV2Result = parseJsonV2Plan(fullText);
  if (jsonV2Result) {
    return jsonV2Result;
  }

  // Try legacy // PLAN: comment format
  const planLineMatch = fullText.match(/\/\/\s*PLAN:\s*(\{.+)/);
  if (!planLineMatch) return null;

  try {
    let jsonStr = planLineMatch[1] ?? '';
    // Find the balanced closing brace
    let braceCount = 0;
    let endIdx = 0;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') braceCount++;
      if (jsonStr[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
    if (endIdx > 0) {
      jsonStr = jsonStr.substring(0, endIdx);
    }

    // Fix malformed JSON (e.g., "total":} -> remove it)
    jsonStr = jsonStr
      .replace(/"total"\s*:\s*[}\]]/g, '') // Remove "total":} or "total":]
      .replace(/,\s*}/g, '}') // Remove trailing commas before }
      .replace(/,\s*]/g, ']'); // Remove trailing commas before ]

    const plan = JSON.parse(jsonStr);
    // Support both "create" and "update" keys
    const createFiles = plan.create || [];
    const updateFiles = plan.update || [];
    const allFiles = [...createFiles, ...updateFiles];

    if (allFiles.length > 0) {
      return {
        create: allFiles, // All files to generate (both new and updates)
        delete: plan.delete || [],
        total: plan.total || allFiles.length, // Fallback to calculated count
        completed: [],
        sizes: plan.sizes || undefined, // Extract sizes for progress tracking
      };
    }
  } catch {
    // Plan not complete yet or malformed - try regex extraction as fallback
    const createMatch = fullText.match(/"create"\s*:\s*\[([^\]]*)\]/);
    const updateMatch = fullText.match(/"update"\s*:\s*\[([^\]]*)\]/);

    if (createMatch || updateMatch) {
      const extractFiles = (match: RegExpMatchArray | null) => {
        if (!match) return [];
        return (match[1] ?? '').match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, '')) || [];
      };

      const createFiles = extractFiles(createMatch);
      const updateFiles = extractFiles(updateMatch);
      const allFiles = [...createFiles, ...updateFiles];

      if (allFiles.length > 0) {
        return {
          create: allFiles,
          delete: [],
          total: allFiles.length,
          completed: [],
        };
      }
    }
  }

  return null;
}

// ============================================================================
// Simple Comment Plan Parser
// ============================================================================

/**
 * Parse file plan from simple comment format
 * Format: // filename.tsx followed by code, then // another-file.tsx, etc.
 */
export function parseSimpleCommentPlan(fullText: string): ParsedFilePlan | null {
  // Match all file path comments
  const filePathRegex = /\/\/\s*((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|json|md))\s*\n/g;
  const matches = [...fullText.matchAll(filePathRegex)];

  if (matches.length === 0) return null;

  const files: string[] = [];
  for (const match of matches) {
    let filePath = match[1];
    if (!filePath) continue;
    // Normalize path - add src/ prefix if not present
    if (!filePath.startsWith('src/')) {
      filePath = 'src/' + filePath;
    }
    if (!files.includes(filePath)) {
      files.push(filePath);
    }
  }

  if (files.length === 0) return null;

  console.log('[parseSimpleCommentPlan] Detected files from comments:', files);

  return {
    create: files,
    delete: [],
    total: files.length,
    completed: [],
    sizes: undefined, // No size info in this format
  };
}
