/**
 * Unified AI Response Parser
 *
 * Robust parser that handles all AI response formats:
 * - JSON v1 (legacy)
 * - JSON v2 (with meta, plan, manifest, batch)
 * - Marker v1 (legacy)
 * - Marker v2 (with META, PLAN, MANIFEST, BATCH)
 * - Fallback patterns for malformed responses
 *
 * Features:
 * - Auto-detection of response format
 * - Multi-level fallback parsing
 * - Truncation recovery
 * - Batch metadata extraction
 * - Detailed error reporting
 *
 * @module utils/aiResponseParser
 *
 * Structure:
 * - utils/parser/types.ts           - Type definitions
 * - utils/parser/patterns.ts        - Pre-compiled regex patterns
 * - utils/parser/formatDetection.ts - Format auto-detection
 * - utils/parser/jsonParser.ts      - JSON v1/v2 parsing
 * - utils/parser/markerParser.ts    - Marker format parsing
 * - utils/parser/fallbackParser.ts  - Fallback parsing
 */

import { isIgnoredPath } from './filePathUtils';
import { parserLogger } from './logger';

// Re-export types
export type {
  ResponseFormat,
  FileAction,
  ParsedFile,
  BatchInfo,
  PlanInfo,
  ManifestEntry,
  MetaInfo,
  ParseResult,
  ParserOptions,
} from './parser/types';

// Import from submodules
import { detectFormat } from './parser/formatDetection';
import { parseJsonV1, parseJsonV2 } from './parser/jsonParser';
import { parseMarker } from './parser/markerParser';
import { parseFallback } from './parser/fallbackParser';
import { findFirstMatch, findAllMatches } from './parser/patterns';
import type { ParseResult, ParserOptions } from './parser/types';

// Re-export detectFormat
export { detectFormat } from './parser/formatDetection';

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse AI response with auto-detection and fallback
 */
export function parseAIResponse(response: string, options: ParserOptions = {}): ParseResult {
  const {
    includeRaw = false,
    maxSize = 500000,
    aggressiveRecovery = true,
  } = options;

  const result: ParseResult = {
    format: 'unknown',
    files: {},
    truncated: false,
    warnings: [],
    errors: [],
  };

  if (includeRaw) {
    result.rawResponse = response;
  }

  // Validate input
  if (!response || typeof response !== 'string') {
    result.errors.push('Empty or invalid response');
    return result;
  }

  if (response.length > maxSize) {
    result.errors.push(`Response too large (${Math.round(response.length / 1000)}KB > ${Math.round(maxSize / 1000)}KB limit)`);
    return result;
  }

  // Detect format
  result.format = detectFormat(response);

  // Parse based on format
  switch (result.format) {
    case 'json-v2':
      parseJsonV2(response, result);
      break;

    case 'json-v1':
      parseJsonV1(response, result);
      break;

    case 'marker-v2':
    case 'marker-v1':
      parseMarker(response, result);
      break;

    case 'fallback':
      parseFallback(response, result);
      break;

    case 'unknown':
      // Try JSON first, then marker, then fallback
      if (aggressiveRecovery) {
        parseJsonV1(response, result);
        if (Object.keys(result.files).length === 0) {
          parseMarker(response, result);
        }
        if (Object.keys(result.files).length === 0) {
          parseFallback(response, result);
        }
      }
      break;
  }

  // Log summary
  const fileCount = Object.keys(result.files).length;
  parserLogger.debug(`Format: ${result.format}, Files: ${fileCount}, Truncated: ${result.truncated}`);

  if (result.warnings.length > 0) {
    parserLogger.warn('Warnings:', result.warnings);
  }

  if (result.errors.length > 0) {
    parserLogger.error('Errors:', result.errors);
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if response has files
 */
export function hasFiles(response: string): boolean {
  const format = detectFormat(response);

  switch (format) {
    case 'json-v1':
    case 'json-v2':
      return /"files"\s*:\s*\{/.test(response) ||
             /"fileChanges"\s*:\s*\{/.test(response);
    case 'marker-v1':
    case 'marker-v2':
      return /<!--\s*FILE:/.test(response);
    case 'fallback':
      return /```(?:tsx?|jsx?)/.test(response);
    default:
      return false;
  }
}

/**
 * Extract file list from response (for progress tracking)
 */
export function extractFileList(response: string): string[] {
  const files = new Set<string>();
  const format = detectFormat(response);

  if (format.startsWith('marker')) {
    // From PLAN block
    const planMatch = findFirstMatch(/<!--\s*PLAN\s*-->([\s\S]*?)<!--\s*\/PLAN\s*-->/, response);
    const planContent = planMatch?.[1];
    if (planContent) {
      const createMatch = findFirstMatch(/create:\s*([^\n]+)/, planContent);
      const updateMatch = findFirstMatch(/update:\s*([^\n]+)/, planContent);
      const createContent = createMatch?.[1];
      const updateContent = updateMatch?.[1];
      if (createContent) {
        createContent.split(',').forEach(f => files.add(f.trim()));
      }
      if (updateContent) {
        updateContent.split(',').forEach(f => files.add(f.trim()));
      }
    }

    // From FILE markers
    const fileMatches = findAllMatches(/<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g, response);
    for (const match of fileMatches) {
      const fileName = match[1];
      if (fileName) {
        files.add(fileName.trim());
      }
    }
  } else {
    // JSON format - extract from keys
    const fileMatches = findAllMatches(/"([\w./-]+\.(?:tsx?|jsx?|css|json|md|ts|js))"\s*:/g, response);
    for (const match of fileMatches) {
      const fileName = match[1];
      if (fileName) {
        files.add(fileName);
      }
    }
  }

  return Array.from(files).filter(f => !isIgnoredPath(f)).sort();
}

/**
 * Get batch continuation prompt
 */
export function getBatchContinuationPrompt(result: ParseResult): string | null {
  if (!result.batch || result.batch.isComplete || result.batch.remaining.length === 0) {
    return null;
  }

  const remaining = result.batch.remaining;
  const completed = result.batch.completed;

  return `Continue generating the remaining ${remaining.length} files.

ALREADY COMPLETED (${completed.length} files):
${completed.map(f => `- ${f}`).join('\n')}

REMAINING FILES TO GENERATE:
${remaining.map(f => `- ${f}`).join('\n')}

Use the same format and structure. This is batch ${result.batch.current + 1} of ${result.batch.total}.`;
}

// Export for backwards compatibility
export { parseAIResponse as parse };
export default { parseAIResponse, detectFormat, hasFiles, extractFileList, getBatchContinuationPrompt };
