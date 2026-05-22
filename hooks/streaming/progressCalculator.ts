/**
 * Progress Calculator
 *
 * Calculate file progress based on streamed content.
 * Supports both JSON and Marker formats.
 */

import type { StreamingFormat, FileProgressResult } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Average characters per line estimate */
const CHARS_PER_LINE = 40;

// ============================================================================
// JSON Format Progress
// ============================================================================

/**
 * Calculate file progress based on streamed content (JSON format)
 * Estimates progress by measuring received chars vs expected line count
 * @param fullText - Full streamed text so far
 * @param filePath - File path to check
 * @param expectedLines - Expected line count from PLAN sizes
 * @returns Progress object with receivedChars and progress percentage
 */
export function calculateFileProgressJson(
  fullText: string,
  filePath: string,
  expectedLines: number
): FileProgressResult {
  const expectedChars = expectedLines * CHARS_PER_LINE;

  // Escape special regex characters in file path
  const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Find file content pattern: "path/to/file.tsx":"content..."
  // Using match() instead of matchAll() for simplicity
  const filePattern = new RegExp(`"${escapedPath}"\\s*:\\s*"`, 'g');
  const matches = [...fullText.matchAll(filePattern)];

  if (matches.length === 0) {
    return { receivedChars: 0, progress: 0, status: 'pending' };
  }

  const match = matches[0];
  if (!match) {
    return { receivedChars: 0, progress: 0, status: 'pending' };
  }
  const contentStart = (match.index ?? 0) + match[0].length;

  // Find content end (closing quote not preceded by backslash)
  let contentEnd = contentStart;
  let escaped = false;
  let foundEnd = false;

  for (let i = contentStart; i < fullText.length; i++) {
    const char = fullText[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      contentEnd = i;
      foundEnd = true;
      break;
    }
    contentEnd = i + 1; // Still streaming
  }

  const receivedChars = contentEnd - contentStart;
  const progress = Math.min(foundEnd ? 100 : 99, Math.round((receivedChars / expectedChars) * 100));

  return {
    receivedChars,
    progress,
    status: foundEnd ? 'complete' : 'streaming',
  };
}

// ============================================================================
// Marker Format Progress
// ============================================================================

/**
 * Calculate file progress based on streamed content (Marker format)
 * Looks for <!-- FILE:path --> content <!-- /FILE:path --> markers
 */
export function calculateFileProgressMarker(
  fullText: string,
  filePath: string,
  expectedLines: number
): FileProgressResult {
  const expectedChars = expectedLines * CHARS_PER_LINE;

  // Escape special regex characters in file path
  const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check for opening marker
  const openPattern = new RegExp(`<!--\\s*FILE:${escapedPath}\\s*-->`);
  const openMatch = fullText.match(openPattern);

  if (!openMatch || openMatch.index === undefined) {
    return { receivedChars: 0, progress: 0, status: 'pending' };
  }

  const contentStart = openMatch.index + openMatch[0].length;

  // Check for closing marker
  const closePattern = new RegExp(`<!--\\s*/FILE:${escapedPath}\\s*-->`);
  const closeMatch = fullText.slice(contentStart).match(closePattern);

  if (closeMatch && closeMatch.index !== undefined) {
    // File is complete
    const contentEnd = contentStart + closeMatch.index;
    const receivedChars = contentEnd - contentStart;
    return {
      receivedChars,
      progress: 100,
      status: 'complete',
    };
  }

  // Still streaming - measure content so far
  const receivedChars = fullText.length - contentStart;
  const progress = Math.min(99, Math.round((receivedChars / expectedChars) * 100));

  return {
    receivedChars,
    progress,
    status: 'streaming',
  };
}

// ============================================================================
// Unified Progress Calculator
// ============================================================================

/**
 * Unified file progress calculator that handles both formats
 */
export function calculateFileProgress(
  fullText: string,
  filePath: string,
  expectedLines: number,
  format: StreamingFormat
): FileProgressResult {
  if (format === 'marker') {
    return calculateFileProgressMarker(fullText, filePath, expectedLines);
  }
  return calculateFileProgressJson(fullText, filePath, expectedLines);
}
