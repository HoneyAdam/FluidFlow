/**
 * JSON Parser
 *
 * Handles JSON v1 and v2 format parsing for AI responses.
 */

import { cleanGeneratedCode } from '../cleanCode';
import { isIgnoredPath } from '../filePathUtils';
import { repairJson as repairJsonUtil } from '../jsonRepair';
import type { ParseResult, FileAction, ManifestEntry } from './types';
import { findFirstMatch } from './patterns';

// ============================================================================
// JSON String Preparation
// ============================================================================

/**
 * Clean and prepare JSON string for parsing
 */
export function prepareJsonString(response: string): string {
  let json = response.trim();

  // Remove BOM and invisible characters
  json = json.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

  // Remove markdown code blocks
  const codeBlockMatch = findFirstMatch(/```(?:json)?\s*\n?([\s\S]*?)\n?```/, json);
  const codeBlockContent = codeBlockMatch?.[1];
  if (codeBlockContent) {
    json = codeBlockContent.trim();
  }

  // Remove PLAN comment if present at start
  const planIndex = json.indexOf('// PLAN:');
  if (planIndex !== -1 && (planIndex === 0 || /^[\s]*$/.test(json.slice(0, planIndex)))) {
    // Find end of PLAN JSON using brace counting
    const firstBrace = json.indexOf('{', planIndex);
    if (firstBrace > planIndex) {
      let braceCount = 0;
      let planEnd = firstBrace;
      for (let i = firstBrace; i < json.length; i++) {
        if (json[i] === '{') braceCount++;
        else if (json[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            planEnd = i + 1;
            break;
          }
        }
      }
      json = json.substring(planEnd).trim();
    }
  }

  return json;
}

/**
 * Attempt to repair truncated JSON
 * Uses shared jsonRepair utility
 */
export function repairJson(json: string): string {
  return repairJsonUtil(json).json;
}

// ============================================================================
// JSON v1 Parser
// ============================================================================

/**
 * Parse JSON v1 format
 */
export function parseJsonV1(json: string, result: ParseResult): void {
  const prepared = prepareJsonString(json);
  const jsonMatch = findFirstMatch(/\{[\s\S]*$/, prepared);

  if (!jsonMatch) {
    result.errors.push('No JSON object found');
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Try repair
    try {
      const repaired = repairJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
      result.truncated = true;
      result.warnings.push('JSON was repaired from truncated response');
    } catch (e) {
      result.errors.push(`JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`);
      return;
    }
  }

  // Extract files from various possible locations
  let filesObj: Record<string, unknown> =
    (parsed.files as Record<string, unknown>) ||
    (parsed.fileChanges as Record<string, unknown>) ||
    (parsed.Changes as Record<string, unknown>) ||
    (parsed.changes as Record<string, unknown>) ||
    {};

  // Check root level for file-like keys
  if (Object.keys(filesObj).length === 0) {
    const rootFileKeys = Object.keys(parsed).filter(k => /\.[a-z]+$/i.test(k));
    if (rootFileKeys.length > 0) {
      filesObj = parsed;
    }
  }

  // Process files
  for (const [path, content] of Object.entries(filesObj)) {
    if (!path.includes('.') && !path.includes('/')) continue;
    if (isIgnoredPath(path)) continue;

    let contentStr: string;
    if (typeof content === 'string') {
      contentStr = content;
    } else if (typeof content === 'object' && content !== null) {
      const obj = content as Record<string, unknown>;
      contentStr = (obj.content || obj.code || obj.diff || '') as string;
    } else {
      continue;
    }

    const cleaned = cleanGeneratedCode(contentStr, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
    }
  }

  // Extract explanation
  if (typeof parsed.explanation === 'string') {
    result.explanation = parsed.explanation;
  }

  // Extract deleted files
  if (Array.isArray(parsed.deletedFiles)) {
    result.deletedFiles = parsed.deletedFiles as string[];
  }
}

// ============================================================================
// JSON v2 Parser
// ============================================================================

/**
 * Parse JSON v2 format
 */
export function parseJsonV2(json: string, result: ParseResult): void {
  const prepared = prepareJsonString(json);
  const jsonMatch = findFirstMatch(/\{[\s\S]*$/, prepared);

  if (!jsonMatch) {
    result.errors.push('No JSON object found');
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Try repair
    try {
      const repaired = repairJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
      result.truncated = true;
      result.warnings.push('JSON was repaired from truncated response');
    } catch (e) {
      result.errors.push(`JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`);
      return;
    }
  }

  // Extract meta
  if (parsed.meta && typeof parsed.meta === 'object') {
    const meta = parsed.meta as Record<string, unknown>;
    result.meta = {
      format: String(meta.format || 'json'),
      version: String(meta.version || '2.0'),
      timestamp: meta.timestamp ? String(meta.timestamp) : undefined,
    };
  }

  // Extract plan
  if (parsed.plan && typeof parsed.plan === 'object') {
    const plan = parsed.plan as Record<string, unknown>;
    result.plan = {
      create: Array.isArray(plan.create) ? (plan.create as string[]) : [],
      update: Array.isArray(plan.update) ? (plan.update as string[]) : [],
      delete: Array.isArray(plan.delete) ? (plan.delete as string[]) : [],
    };
    result.deletedFiles = result.plan.delete;
  }

  // Extract manifest
  if (Array.isArray(parsed.manifest)) {
    result.manifest = (parsed.manifest as Record<string, unknown>[]).map(entry => ({
      path: String(entry.path || ''),
      action: (entry.action as FileAction) || 'create',
      lines: Number(entry.lines) || 0,
      tokens: Number(entry.tokens) || 0,
      status: (entry.status as ManifestEntry['status']) || 'included',
    }));
  }

  // Extract batch
  if (parsed.batch && typeof parsed.batch === 'object') {
    const batch = parsed.batch as Record<string, unknown>;
    result.batch = {
      current: Number(batch.current) || 1,
      total: Number(batch.total) || 1,
      isComplete: batch.isComplete !== false,
      completed: Array.isArray(batch.completed) ? (batch.completed as string[]) : [],
      remaining: Array.isArray(batch.remaining) ? (batch.remaining as string[]) : [],
      nextBatchHint: batch.nextBatchHint ? String(batch.nextBatchHint) : undefined,
    };

    if (!result.batch.isComplete) {
      result.truncated = true;
    }
  }

  // Extract explanation
  if (typeof parsed.explanation === 'string') {
    result.explanation = parsed.explanation;
  }

  // Extract files
  if (parsed.files && typeof parsed.files === 'object') {
    const filesObj = parsed.files as Record<string, unknown>;
    for (const [path, content] of Object.entries(filesObj)) {
      if (!path.includes('.') && !path.includes('/')) continue;
      if (isIgnoredPath(path)) continue;

      let contentStr: string;
      if (typeof content === 'string') {
        contentStr = content;
      } else if (typeof content === 'object' && content !== null) {
        const obj = content as Record<string, unknown>;
        contentStr = (obj.content || obj.code || '') as string;
      } else {
        continue;
      }

      const cleaned = cleanGeneratedCode(contentStr, path);
      if (cleaned && cleaned.length >= 10) {
        result.files[path] = cleaned;
      }
    }
  }
}
