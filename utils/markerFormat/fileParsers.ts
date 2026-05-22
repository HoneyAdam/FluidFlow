/**
 * File Parsers
 *
 * Parsers for FILE blocks in marker format.
 */

import { cleanGeneratedCode } from '../cleanCode';
import type { StreamingParseResult } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * File path pattern for marker format
 * Matches paths like: src/App.tsx, components/Header.tsx, utils/helpers.ts
 */
const FILE_PATH_PATTERN = /[\w./-]+\.[a-zA-Z]+/;

// ============================================================================
// Pattern Builder
// ============================================================================

/**
 * Build regex for FILE markers dynamically
 */
export function buildFilePattern(): RegExp {
  // Match: <!-- FILE:path --> content <!-- /FILE:path -->
  return new RegExp(
    '<!--\\s*FILE:(' + FILE_PATH_PATTERN.source + ')\\s*-->([\\s\\S]*?)<!--\\s*\\/FILE:\\1\\s*-->',
    'g'
  );
}

// ============================================================================
// File Block Parser
// ============================================================================

/**
 * Extract all FILE blocks from marker format
 *
 * <!-- FILE:src/App.tsx -->
 * content here
 * <!-- /FILE:src/App.tsx -->
 *
 * Also handles missing closing tags when AI opens a new file without closing the previous one.
 */
export function parseMarkerFiles(response: string): Record<string, string> {
  const files: Record<string, string> = {};

  // First, try to match properly closed FILE blocks
  const filePattern = buildFilePattern();

  const processedPaths = new Set<string>();

  // Use matchAll for regex matching
  const matches = [...response.matchAll(filePattern)];
  for (const match of matches) {
    const filePath = (match[1] ?? '').trim();
    let content = match[2] ?? '';

    // Remove leading/trailing blank lines but preserve internal formatting
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');

    // Clean generated code (fix imports, JSX issues, etc.)
    const cleaned = cleanGeneratedCode(content, filePath);

    if (cleaned && cleaned.length > 0) {
      files[filePath] = cleaned;
      processedPaths.add(filePath);
    }
  }

  // Now handle files that were opened but not properly closed
  // Find all FILE opening markers
  const openPattern = /<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g;
  const openings: { path: string; index: number; endIndex: number }[] = [];

  const openMatches = [...response.matchAll(openPattern)];
  for (const match of openMatches) {
    const path = (match[1] ?? '').trim();
    // Skip if already processed with proper closing tag
    if (!processedPaths.has(path) && match.index !== undefined) {
      openings.push({
        path,
        index: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }

  // For each unclosed file, extract content until the next FILE marker or end
  for (let i = 0; i < openings.length; i++) {
    const current = openings[i];
    if (!current) continue;
    const contentStart = current.endIndex;

    // Find the end: either the next FILE opening marker, or a matching close tag, or end of string
    let contentEnd = response.length;

    // Check for next FILE opening marker
    const nextOpening = openings[i + 1];
    if (nextOpening) {
      contentEnd = nextOpening.index;
    }

    // Also check if there's any <!-- FILE: or <!-- /FILE: marker before the next opening
    const remainingText = response.slice(contentStart, contentEnd);
    const nextMarkerMatch = remainingText.match(/<!--\s*(?:\/)?FILE:/);
    if (nextMarkerMatch && nextMarkerMatch.index !== undefined) {
      contentEnd = contentStart + nextMarkerMatch.index;
    }

    // Extract and clean content
    let content = response.slice(contentStart, contentEnd);
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');

    // Clean generated code
    const cleaned = cleanGeneratedCode(content, current.path);

    if (cleaned && cleaned.length > 0) {
      files[current.path] = cleaned;
      console.warn(`[parseMarkerFiles] File "${current.path}" had missing closing tag - recovered content`);
    }
  }

  return files;
}

// ============================================================================
// Streaming File Parser
// ============================================================================

/**
 * Parse incomplete/streaming FILE blocks
 * Returns partial files that are still being streamed
 *
 * Also handles cases where AI opens a new file without closing the previous one:
 * - The "implicitly closed" file (content up to next FILE marker) goes to complete
 * - Only the truly incomplete last file goes to streaming
 */
export function parseStreamingMarkerFiles(response: string): StreamingParseResult {
  const complete: Record<string, string> = {};
  const streaming: Record<string, string> = {};
  let currentFile: string | null = null;

  // First, extract all properly closed files
  const completePattern = buildFilePattern();
  const completedPaths = new Set<string>();

  const completeMatches = [...response.matchAll(completePattern)];
  for (const match of completeMatches) {
    const filePath = (match[1] ?? '').trim();
    let content = match[2] ?? '';
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');
    complete[filePath] = cleanGeneratedCode(content, filePath);
    completedPaths.add(filePath);
  }

  // Find all FILE opening markers
  const openPattern = /<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g;
  const openings: { path: string; index: number; endIndex: number }[] = [];

  const openMatches = [...response.matchAll(openPattern)];
  for (const match of openMatches) {
    const path = (match[1] ?? '').trim();
    // Skip if already processed with proper closing tag
    if (!completedPaths.has(path) && match.index !== undefined) {
      openings.push({
        path,
        index: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }

  // Process unclosed files
  for (let i = 0; i < openings.length; i++) {
    const current = openings[i];
    if (!current) continue;
    const contentStart = current.endIndex;
    const nextOpening = openings[i + 1];

    if (!nextOpening) {
      // Last unclosed file - this is truly streaming/incomplete
      let content = response.slice(contentStart);
      content = content.replace(/^\n+/, '');

      // Check if there's any marker after this (like GENERATION_META)
      const nextMarkerMatch = content.match(/<!--\s*(?:\/FILE:|GENERATION_META|PLAN|EXPLANATION)/);
      if (nextMarkerMatch && nextMarkerMatch.index !== undefined) {
        content = content.slice(0, nextMarkerMatch.index).replace(/\n+$/, '');
      }

      streaming[current.path] = content;
      currentFile = current.path;
    } else {
      // Not the last file - it was implicitly closed when next file started
      // Treat this as complete (recovered from missing closing tag)
      let content = response.slice(contentStart, nextOpening.index);
      content = content.replace(/^\n+/, '').replace(/\n+$/, '');

      const cleaned = cleanGeneratedCode(content, current.path);
      if (cleaned && cleaned.length > 0) {
        complete[current.path] = cleaned;
      }
    }
  }

  return { complete, streaming, currentFile };
}
