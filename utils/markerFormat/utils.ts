/**
 * Marker Format Utilities
 *
 * Utility functions for marker format processing.
 */

import type { MarkerManifestEntry, ManifestValidation, StreamingStatus } from './types';
import { parseMarkerPlan } from './blockParsers';
import { parseStreamingMarkerFiles } from './fileParsers';

// ============================================================================
// Manifest Validation
// ============================================================================

/**
 * Validate files against manifest
 * Returns validation result showing expected vs received files
 */
export function validateManifest(
  manifest: MarkerManifestEntry[] | undefined,
  files: Record<string, string>
): ManifestValidation {
  if (!manifest) {
    return {
      expected: [],
      received: Object.keys(files),
      missing: [],
      extra: Object.keys(files),
      isValid: true, // No manifest = no validation
    };
  }

  // Files expected to be included (status = 'included')
  const expected = manifest
    .filter((e) => e.status === 'included' && e.action !== 'delete')
    .map((e) => e.file);

  const received = Object.keys(files);
  const missing = expected.filter((f) => !received.includes(f));
  const extra = received.filter((f) => !expected.includes(f));

  return {
    expected,
    received,
    missing,
    extra,
    isValid: missing.length === 0,
  };
}

// ============================================================================
// File List Extraction
// ============================================================================

/**
 * Extract file list from marker format for streaming progress
 */
export function extractMarkerFileList(response: string): string[] {
  const files = new Set<string>();

  // From PLAN block
  const plan = parseMarkerPlan(response);
  if (plan) {
    plan.create.forEach((f) => files.add(f));
    plan.update.forEach((f) => files.add(f));
  }

  // From FILE blocks (both complete and streaming)
  const filePattern = /<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g;
  const matches = [...response.matchAll(filePattern)];
  for (const match of matches) {
    const fileName = match[1];
    if (fileName) {
      files.add(fileName.trim());
    }
  }

  return Array.from(files).sort();
}

// ============================================================================
// Streaming Status
// ============================================================================

/**
 * Detect which files are currently being streamed vs complete
 */
export function getMarkerStreamingStatus(response: string): StreamingStatus {
  const plan = parseMarkerPlan(response);
  const { complete, currentFile } = parseStreamingMarkerFiles(response);

  const allPlanned = plan ? [...plan.create, ...plan.update] : [];
  const completeSet = new Set(Object.keys(complete));

  // Pending = planned but not started
  const pending = allPlanned.filter((f) => !completeSet.has(f) && f !== currentFile);

  return {
    pending,
    streaming: currentFile ? [currentFile] : [],
    complete: Object.keys(complete),
  };
}

// ============================================================================
// Metadata Stripping
// ============================================================================

/**
 * Strip PLAN and EXPLANATION markers for display
 */
export function stripMarkerMetadata(response: string): string {
  return response
    .replace(/<!--\s*PLAN\s*-->[\s\S]*?<!--\s*\/PLAN\s*-->/g, '')
    .replace(/<!--\s*EXPLANATION\s*-->[\s\S]*?<!--\s*\/EXPLANATION\s*-->/g, '')
    .replace(/<!--\s*GENERATION_META\s*-->[\s\S]*?<!--\s*\/GENERATION_META\s*-->/g, '')
    .trim();
}
