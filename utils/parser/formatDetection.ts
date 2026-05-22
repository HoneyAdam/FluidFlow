/**
 * Format Detection
 *
 * Auto-detection of AI response formats.
 */

import type { ResponseFormat } from './types';
import {
  RE_BOM_CHARS,
  RE_META_MARKER,
  RE_FILE_MARKER,
  RE_PLAN_MARKER,
  RE_EXPLANATION_MARKER,
  RE_PLAN_COMMENT,
  RE_CODE_BLOCK,
  RE_JSON_FORMAT,
  RE_JSON_VERSION,
  RE_BATCH_OBJECT,
  RE_MANIFEST_ARRAY,
  RE_FILES_OBJECT,
  RE_FILE_CHANGES,
  RE_EXPLANATION,
  RE_JSON_OBJECT,
  RE_CODE_BLOCK_TYPE,
  findFirstMatch,
} from './patterns';

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Detect the response format
 */
export function detectFormat(response: string): ResponseFormat {
  if (!response || typeof response !== 'string') {
    return 'unknown';
  }

  // Clean BOM and invisible characters for detection
  let trimmed = response.trim();
  trimmed = trimmed.replace(RE_BOM_CHARS, '');

  // Check for marker format indicators (most distinctive)
  const hasMetaMarker = RE_META_MARKER.test(trimmed);
  const hasFileMarker = RE_FILE_MARKER.test(trimmed);
  const hasPlanMarker = RE_PLAN_MARKER.test(trimmed);

  // Marker v2: has META block
  if (hasMetaMarker && hasFileMarker) {
    return 'marker-v2';
  }

  // Marker v1: has FILE markers but no META
  if (hasFileMarker) {
    return 'marker-v1';
  }

  // Legacy marker: has PLAN and EXPLANATION markers
  if (hasPlanMarker && RE_EXPLANATION_MARKER.test(trimmed)) {
    return 'marker-v1';
  }

  // Check for JSON format
  // Find first non-whitespace, non-comment content
  let jsonStart = trimmed;

  // Remove PLAN comment if at start
  const planMatch = findFirstMatch(RE_PLAN_COMMENT, jsonStart);
  if (planMatch) {
    jsonStart = jsonStart.slice(planMatch[0].length).trim();
  }

  // Remove markdown code blocks
  const codeBlockMatch = findFirstMatch(RE_CODE_BLOCK, jsonStart);
  const codeBlockContent = codeBlockMatch?.[1];
  if (codeBlockContent) {
    jsonStart = codeBlockContent.trim();
  }

  const firstChar = jsonStart.charAt(0);
  const startsWithBrace = firstChar === '{';

  // Check for JSON v2 indicators in content
  if (startsWithBrace || trimmed.includes('"meta"') || trimmed.includes('"files"') || trimmed.includes('"fileChanges"')) {
    // Look for v2 structure
    const hasMetaFormat = RE_JSON_FORMAT.test(trimmed);
    const hasMetaVersion = RE_JSON_VERSION.test(trimmed);
    const hasBatchObject = RE_BATCH_OBJECT.test(trimmed);
    const hasManifestArray = RE_MANIFEST_ARRAY.test(trimmed);

    if (hasMetaFormat || hasMetaVersion || (hasBatchObject && hasManifestArray)) {
      return 'json-v2';
    }

    // Check for v1 structure
    const hasFiles = RE_FILES_OBJECT.test(trimmed);
    const hasFileChanges = RE_FILE_CHANGES.test(trimmed);
    const hasExplanation = RE_EXPLANATION.test(trimmed);

    if (hasFiles || hasFileChanges || hasExplanation) {
      return 'json-v1';
    }

    // Might still be JSON, check if parseable
    try {
      const jsonMatch = findFirstMatch(RE_JSON_OBJECT, jsonStart);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');
      if (parsed.files || parsed.fileChanges || parsed.meta || parsed.batch) {
        return parsed.meta?.version === '2.0' ? 'json-v2' : 'json-v1';
      }
    } catch {
      // Not valid JSON
    }
  }

  // Check for code blocks with file paths (fallback format)
  if (RE_CODE_BLOCK_TYPE.test(trimmed)) {
    return 'fallback';
  }

  return 'unknown';
}
