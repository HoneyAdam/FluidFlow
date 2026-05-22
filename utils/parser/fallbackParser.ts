/**
 * Fallback Parser
 *
 * Handles fallback parsing for unstructured AI responses.
 * Extracts code from code blocks and infers file paths.
 */

import { cleanGeneratedCode } from '../cleanCode';
import { isIgnoredPath } from '../filePathUtils';
import type { ParseResult } from './types';
import { findAllMatches } from './patterns';

// ============================================================================
// Fallback Parser
// ============================================================================

/**
 * Extract files from code blocks and patterns
 */
export function parseFallback(response: string, result: ParseResult): void {
  result.warnings.push('Using fallback parser - response format not recognized');

  // Pattern 1: File path followed by code block
  const fileBlockMatches = findAllMatches(
    /(?:^|\n)([\w./-]+\.(?:tsx?|jsx?|css|json|md|html?))\s*\n```(?:\w+)?\s*\n([\s\S]*?)\n```/gm,
    response
  );

  for (const match of fileBlockMatches) {
    const path = match[1]?.trim();
    const content = match[2]?.trim();

    if (!path || !content) continue;
    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
      result.recoveredFiles = result.recoveredFiles || [];
      result.recoveredFiles.push(path);
    }
  }

  // Pattern 2: File: path inside code block
  const fileInBlockMatches = findAllMatches(
    /```(?:\w+)?\s*\nFile:\s*([^\n]+)\n([\s\S]*?)\n```/g,
    response
  );

  for (const match of fileInBlockMatches) {
    const path = match[1]?.trim();
    const content = match[2]?.trim();

    if (!path || !content) continue;
    if (result.files[path]) continue; // Already extracted
    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
      result.recoveredFiles = result.recoveredFiles || [];
      result.recoveredFiles.push(path);
    }
  }

  // Pattern 3: Just look for code blocks and infer file type
  if (Object.keys(result.files).length === 0) {
    const codeBlockMatches = findAllMatches(
      /```(?:tsx?|jsx?|typescript|javascript)\s*\n([\s\S]*?)\n```/g,
      response
    );
    let fileIndex = 1;

    for (const match of codeBlockMatches) {
      const content = match[1]?.trim();
      if (!content || content.length < 50) continue;

      // Infer filename from content
      const hasReact = content.includes('import React') ||
                       content.includes('export default') ||
                       (content.includes('function ') && content.includes('return'));
      const hasExport = content.includes('export ');

      const path = hasReact
        ? `component${fileIndex}.tsx`
        : hasExport
        ? `module${fileIndex}.ts`
        : `code${fileIndex}.js`;

      const cleaned = cleanGeneratedCode(content, path);
      if (cleaned && cleaned.length >= 10) {
        result.files[path] = cleaned;
        result.recoveredFiles = result.recoveredFiles || [];
        result.recoveredFiles.push(path);
        fileIndex++;
      }
    }
  }

  if (Object.keys(result.files).length > 0) {
    result.format = 'fallback';
  }
}
