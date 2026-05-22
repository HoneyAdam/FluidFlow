/**
 * Marker Parser
 *
 * Handles marker format (v1 and v2) parsing for AI responses.
 * Uses HTML-comment style markers like <!-- FILE:path -->.
 */

import { cleanGeneratedCode } from '../cleanCode';
import { isIgnoredPath } from '../filePathUtils';
import type { ParseResult, MetaInfo, PlanInfo, ManifestEntry, BatchInfo, FileAction } from './types';
import { findFirstMatch, findAllMatches } from './patterns';

// ============================================================================
// Block Parsers
// ============================================================================

/**
 * Parse marker META block
 */
export function parseMarkerMeta(response: string): MetaInfo | undefined {
  const match = findFirstMatch(/<!--\s*META\s*-->([\s\S]*?)<!--\s*\/META\s*-->/, response);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const meta: MetaInfo = { format: 'marker', version: '1.0' };

  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'format') meta.format = value;
    else if (key === 'version') meta.version = value;
    else if (key === 'timestamp') meta.timestamp = value;
  }

  return meta;
}

/**
 * Parse marker PLAN block
 */
export function parseMarkerPlan(response: string): PlanInfo | undefined {
  const match = findFirstMatch(/<!--\s*PLAN\s*-->([\s\S]*?)<!--\s*\/PLAN\s*-->/, response);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const plan: PlanInfo = { create: [], update: [], delete: [] };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('create:')) {
      plan.create = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    } else if (trimmed.startsWith('update:')) {
      plan.update = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    } else if (trimmed.startsWith('delete:')) {
      plan.delete = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    }
  }

  return plan;
}

/**
 * Parse marker MANIFEST block
 */
export function parseMarkerManifest(response: string): ManifestEntry[] | undefined {
  const match = findFirstMatch(/<!--\s*MANIFEST\s*-->([\s\S]*?)<!--\s*\/MANIFEST\s*-->/, response);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const entries: ManifestEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| File') || line.startsWith('|--')) {
      continue;
    }

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 4) {
      const [file = '', action = '', linesStr = '', tokensStr = '', status = ''] = cells;
      entries.push({
        path: file,
        action: (['create', 'update', 'delete'].includes(action.toLowerCase())
          ? action.toLowerCase() : 'create') as FileAction,
        lines: parseInt(linesStr) || 0,
        tokens: parseInt(tokensStr.replace(/[~,]/g, '')) || 0,
        status: (['included', 'pending', 'marked', 'skipped'].includes(status.toLowerCase())
          ? status.toLowerCase() : 'included') as ManifestEntry['status'],
      });
    }
  }

  return entries.length > 0 ? entries : undefined;
}

/**
 * Parse marker BATCH block
 */
export function parseMarkerBatch(response: string): BatchInfo | undefined {
  const match = findFirstMatch(/<!--\s*BATCH\s*-->([\s\S]*?)<!--\s*\/BATCH\s*-->/, response);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const batch: BatchInfo = {
    current: 1,
    total: 1,
    isComplete: true,
    completed: [],
    remaining: [],
  };

  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'current') batch.current = parseInt(value) || 1;
    else if (key === 'total') batch.total = parseInt(value) || 1;
    else if (key === 'iscomplete') batch.isComplete = value.toLowerCase() === 'true';
    else if (key === 'completed') batch.completed = value.split(',').map(f => f.trim()).filter(Boolean);
    else if (key === 'remaining') batch.remaining = value.split(',').map(f => f.trim()).filter(Boolean);
    else if (key === 'nextbatchhint') batch.nextBatchHint = value;
  }

  return batch;
}

/**
 * Parse marker EXPLANATION block
 */
export function parseMarkerExplanation(response: string): string | undefined {
  const match = findFirstMatch(/<!--\s*EXPLANATION\s*-->([\s\S]*?)<!--\s*\/EXPLANATION\s*-->/, response);
  return match ? (match[1] ?? '').trim() : undefined;
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse marker FILE blocks
 */
export function parseMarkerFiles(response: string, result: ParseResult): void {
  const processedPaths = new Set<string>();

  // Step 1: Extract well-formed FILE blocks (opening + matching closing)
  const wellFormedMatches = findAllMatches(
    /<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->([\s\S]*?)<!--\s*\/FILE:\1\s*-->/g,
    response
  );

  for (const match of wellFormedMatches) {
    const path = (match[1] ?? '').trim();
    const content = (match[2] ?? '').replace(/^\n+/, '').replace(/\n+$/, '');

    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length > 0) {
      result.files[path] = cleaned;
      processedPaths.add(path);
    }
  }

  // Step 2: Find unclosed FILE blocks (opened but not properly closed)
  const openMatches = findAllMatches(/<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g, response);
  const openings: { path: string; index: number; endIndex: number }[] = [];

  for (const match of openMatches) {
    const path = (match[1] ?? '').trim();
    if (!processedPaths.has(path) && match.index !== undefined) {
      openings.push({
        path,
        index: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Process unclosed files
  for (let i = 0; i < openings.length; i++) {
    const current = openings[i];
    if (!current) continue;
    const next = openings[i + 1];

    let contentEnd: number;
    if (!next) {
      // Last file - find any closing marker or end of response
      const remaining = response.slice(current.endIndex);
      const nextMarkerMatch = findFirstMatch(/<!--\s*(?:\/FILE:|BATCH|GENERATION_META)/, remaining);
      contentEnd = nextMarkerMatch && nextMarkerMatch.index !== undefined
        ? current.endIndex + nextMarkerMatch.index
        : response.length;

      // This file is incomplete (streaming or truncated)
      if (!processedPaths.has(current.path)) {
        result.incompleteFiles = result.incompleteFiles || [];
        result.incompleteFiles.push(current.path);
      }
    } else {
      // Not the last file - content ends at next FILE marker
      contentEnd = next.index;
    }

    let content = response.slice(current.endIndex, contentEnd);
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');

    // Remove any stray closing markers
    content = content.replace(/<!--\s*\/FILE:[^\n]*-->/g, '').trim();

    if (isIgnoredPath(current.path)) continue;

    const cleaned = cleanGeneratedCode(content, current.path);
    if (cleaned && cleaned.length > 0 && !processedPaths.has(current.path)) {
      result.files[current.path] = cleaned;
      processedPaths.add(current.path);

      // If not the last file, it was implicitly closed - mark as recovered
      if (next) {
        result.recoveredFiles = result.recoveredFiles || [];
        result.recoveredFiles.push(current.path);
        result.warnings.push(`File "${current.path}" had missing closing marker - recovered`);
      }
    }
  }
}

// ============================================================================
// Main Marker Parser
// ============================================================================

/**
 * Parse marker format (v1 or v2)
 */
export function parseMarker(response: string, result: ParseResult): void {
  result.meta = parseMarkerMeta(response);
  result.plan = parseMarkerPlan(response);
  result.manifest = parseMarkerManifest(response);
  result.batch = parseMarkerBatch(response);
  result.explanation = parseMarkerExplanation(response);

  if (result.plan?.delete) {
    result.deletedFiles = result.plan.delete;
  }

  if (result.batch && !result.batch.isComplete) {
    result.truncated = true;
  }

  parseMarkerFiles(response, result);

  // Validate manifest against files
  if (result.manifest) {
    const expectedIncluded = result.manifest
      .filter(e => e.status === 'included' && e.action !== 'delete')
      .map(e => e.path);
    const received = Object.keys(result.files);
    const missing = expectedIncluded.filter(f => !received.includes(f));

    if (missing.length > 0) {
      result.warnings.push(`Manifest validation: missing files: ${missing.join(', ')}`);
    }
  }
}
