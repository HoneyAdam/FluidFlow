/**
 * JSON Parser
 *
 * Utilities for parsing and validating JSON from AI responses.
 * Handles PLAN comments, truncation repair, and common issues.
 */

import { repairJson } from './jsonRepair';

// ============================================================================
// Types
// ============================================================================

export interface JsonValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  fixedJson?: string;
}

// ============================================================================
// PLAN Comment Handling
// ============================================================================

/**
 * Strips PLAN comment from AI response if present.
 * PLAN comments have format: // PLAN: {"create":[...],"update":[...],"delete":[],"total":N}
 * This should be called before JSON.parse on any AI response that might contain PLAN.
 */
export function stripPlanComment(response: string): string {
  if (!response) return '';

  // Trim leading whitespace and invisible characters
  let cleaned = response.trimStart();
  cleaned = cleaned.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

  // Check for PLAN comment
  const planIndex = cleaned.indexOf('// PLAN:');
  if (planIndex === -1) return cleaned;

  // Only process if PLAN is at start or preceded only by whitespace
  if (planIndex !== 0 && !/^[\s]*$/.test(cleaned.slice(0, planIndex))) {
    return cleaned;
  }

  // Find the PLAN JSON's opening brace
  const firstBrace = cleaned.indexOf('{', planIndex);
  if (firstBrace === -1 || firstBrace <= planIndex) return cleaned;

  // Use brace counting to find where PLAN JSON ends
  let braceCount = 0;
  let planEnd = firstBrace;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        planEnd = i + 1;
        break;
      }
    }
  }

  // Remove PLAN comment and return the rest
  return cleaned.substring(planEnd).trimStart();
}

// ============================================================================
// JSON Validation
// ============================================================================

/**
 * Pre-validates JSON string and attempts to fix common issues
 */
export function preValidateJson(jsonStr: string): JsonValidationResult {
  if (!jsonStr || !jsonStr.trim()) {
    return { valid: false, error: 'Empty response' };
  }

  let json = jsonStr.trim();

  // Check for markdown code blocks
  if (json.startsWith('```')) {
    const match = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      json = (match[1] ?? '').trim();
    } else {
      return {
        valid: false,
        error: 'Unclosed markdown code block',
        suggestion: 'Remove markdown formatting and return pure JSON'
      };
    }
  }

  // Check for common prefixes that shouldn't be there
  const invalidPrefixes = ['Here is', 'Sure,', 'I\'ll', 'Let me', 'The following'];
  for (const prefix of invalidPrefixes) {
    if (json.startsWith(prefix)) {
      return {
        valid: false,
        error: `Response starts with text: "${prefix}..."`,
        suggestion: 'Return only JSON, no explanatory text before it'
      };
    }
  }

  // Check for PLAN comment (valid, but note it)
  const hasPlan = json.includes('// PLAN:');

  // Find the JSON object
  const firstBrace = json.indexOf('{');
  if (firstBrace === -1) {
    return { valid: false, error: 'No JSON object found (missing opening brace)' };
  }

  // Extract just the JSON part (after PLAN if present)
  let jsonPart = json;
  if (hasPlan) {
    const afterPlan = stripPlanComment(json);
    jsonPart = afterPlan;
  }

  // Try to fix common issues
  let fixedJson = jsonPart;

  // Fix 1: Trailing commas before closing braces/brackets
  fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');

  // Fix 2: Single quotes to double quotes (naive - only for keys)
  if (!fixedJson.includes('"') && fixedJson.includes("'")) {
    fixedJson = fixedJson.replace(/'/g, '"');
  }

  // Try parsing
  try {
    JSON.parse(fixedJson);
    return { valid: true, fixedJson: fixedJson !== jsonPart ? fixedJson : undefined };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown parse error';

    // Provide specific suggestions based on error
    let suggestion = 'Check JSON syntax';
    if (error.includes('Unexpected token')) {
      suggestion = 'Invalid character in JSON - check for unescaped quotes or special characters';
    } else if (error.includes('Unexpected end')) {
      suggestion = 'JSON is truncated - missing closing braces or brackets';
    } else if (error.includes('position')) {
      const posMatch = error.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1] ?? '0');
        const context = fixedJson.slice(Math.max(0, pos - 20), pos + 20);
        suggestion = `Error near: "...${context}..."`;
      }
    }

    return { valid: false, error, suggestion };
  }
}

// ============================================================================
// Safe Parsing
// ============================================================================

/**
 * Safely parses JSON from AI response, handling PLAN comments and other artifacts.
 * Returns null if parsing fails instead of throwing.
 */
export function safeParseAIResponse<T = unknown>(response: string): T | null {
  if (!response) return null;

  try {
    // Pre-validate first
    const validation = preValidateJson(response);
    if (!validation.valid) {
      console.debug('[safeParseAIResponse] Pre-validation failed:', validation.error, validation.suggestion);
    }

    // Strip PLAN comment first
    let cleaned = stripPlanComment(response);

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = (codeBlockMatch[1] ?? cleaned).trimStart();
      cleaned = cleaned.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');
    }

    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Use fixed JSON if available from pre-validation
      const jsonToParse = validation.fixedJson || jsonMatch[0];
      return JSON.parse(jsonToParse) as T;
    }

    return null;
  } catch (e) {
    console.debug('[safeParseAIResponse] Parse failed:', e);
    return null;
  }
}

// ============================================================================
// Truncation Repair
// ============================================================================

/**
 * Attempts to repair truncated JSON from AI responses.
 * Returns the repaired JSON string or throws a descriptive error.
 *
 * Uses shared jsonRepair utility for consistent behavior across the codebase.
 */
export function repairTruncatedJson(jsonStr: string): string {
  const result = repairJson(jsonStr, { verbose: true });
  return result.json;
}
