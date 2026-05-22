/**
 * JSON Repair Utilities
 *
 * Shared utilities for repairing truncated or malformed JSON from AI responses.
 * Used by both aiResponseParser.ts and cleanCode.ts.
 */

import { jsonRepairLogger } from './logger';

// Maximum JSON size for repair operations
const MAX_JSON_REPAIR_SIZE = 500000; // 500KB

export interface JsonRepairResult {
  json: string;
  wasRepaired: boolean;
  repairs: string[];
}

export interface JsonRepairOptions {
  /** Maximum size in bytes (default: 500KB) */
  maxSize?: number;
  /** Log repairs for debugging */
  verbose?: boolean;
}

/**
 * Track string state while iterating through JSON
 */
interface _StringState {
  inString: boolean;
  escapeNext: boolean;
}

/**
 * Iterate through JSON respecting string boundaries
 */
function* _iterateJsonChars(json: string): Generator<{ char: string; index: number; inString: boolean }> {
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json.charAt(i);

    if (escapeNext) {
      escapeNext = false;
      yield { char, index: i, inString };
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      yield { char, index: i, inString };
      continue;
    }

    if (char === '"' && !escapeNext) {
      yield { char, index: i, inString };
      inString = !inString;
      continue;
    }

    yield { char, index: i, inString };
  }
}

/**
 * Check if JSON string is balanced (all brackets closed, not in string)
 */
export function isJsonBalanced(json: string): { balanced: boolean; inString: boolean; braceCount: number; bracketCount: number } {
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json.charAt(i);

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }
  }

  return {
    balanced: braceCount === 0 && bracketCount === 0 && !inString,
    inString,
    braceCount,
    bracketCount
  };
}

/**
 * Repair truncated JSON by closing unclosed strings, brackets, and braces
 *
 * @param jsonStr - The potentially truncated JSON string
 * @param options - Repair options
 * @returns Repaired JSON string and metadata
 */
export function repairJson(jsonStr: string, options: JsonRepairOptions = {}): JsonRepairResult {
  const { maxSize = MAX_JSON_REPAIR_SIZE, verbose = false } = options;
  const repairs: string[] = [];
  let json = jsonStr.trim();

  // Size check
  if (json.length > maxSize) {
    throw new Error(`JSON too large to repair safely (${Math.round(json.length / 1000)}KB exceeds ${Math.round(maxSize / 1000)}KB limit)`);
  }

  // Check if already balanced
  const balanceCheck = isJsonBalanced(json);
  if (balanceCheck.balanced) {
    return { json, wasRepaired: false, repairs: [] };
  }

  if (verbose) {
    jsonRepairLogger.debug(`Unbalanced: braces=${balanceCheck.braceCount}, brackets=${balanceCheck.bracketCount}, inString=${balanceCheck.inString}`);
  }

  // Step 1: Close unclosed string
  if (balanceCheck.inString) {
    json += '"';
    repairs.push('Closed unclosed string');
  }

  // Step 2: Remove trailing incomplete content
  const trailingPatterns = [
    { pattern: /,\s*$/, desc: 'Removed trailing comma' },
    { pattern: /,?\s*"[^"]*"\s*:\s*$/, desc: 'Removed incomplete key-value' },
    { pattern: /,?\s*"[^"]*"\s*:\s*"[^"]*$/, desc: 'Removed partial string value' },
  ];

  for (const { pattern, desc } of trailingPatterns) {
    if (pattern.test(json)) {
      json = json.replace(pattern, '');
      repairs.push(desc);
      break;
    }
  }

  // Step 3: Close remaining brackets/braces in correct order (LIFO)
  // Use direct iteration for accurate state tracking
  const openStack: string[] = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json.charAt(i);

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') openStack.push('{');
      else if (char === '[') openStack.push('[');
      else if (char === '}' && openStack.length > 0 && openStack[openStack.length - 1] === '{') {
        openStack.pop();
      } else if (char === ']' && openStack.length > 0 && openStack[openStack.length - 1] === '[') {
        openStack.pop();
      }
    }
  }

  // Close in reverse order
  if (openStack.length > 0) {
    const closers: string[] = [];
    while (openStack.length > 0) {
      const open = openStack.pop();
      if (open === '{') closers.push('}');
      else if (open === '[') closers.push(']');
    }
    json += closers.join('');
    repairs.push(`Closed ${closers.length} unclosed bracket(s)`);
  }

  return {
    json,
    wasRepaired: repairs.length > 0,
    repairs
  };
}

/**
 * Simple repair function that just returns the repaired string
 * For backwards compatibility
 */
export function repairTruncatedJson(jsonStr: string): string {
  return repairJson(jsonStr).json;
}

/**
 * Try to parse JSON, repairing if necessary
 */
export function parseJsonWithRepair<T = unknown>(jsonStr: string, options: JsonRepairOptions = {}): { data: T | null; repaired: boolean; error?: string } {
  // First try parsing as-is
  try {
    return { data: JSON.parse(jsonStr) as T, repaired: false };
  } catch {
    // Try repairing
  }

  try {
    const { json, wasRepaired } = repairJson(jsonStr, options);
    const data = JSON.parse(json) as T;
    return { data, repaired: wasRepaired };
  } catch (e) {
    return {
      data: null,
      repaired: false,
      error: e instanceof Error ? e.message : 'Unknown parse error'
    };
  }
}
