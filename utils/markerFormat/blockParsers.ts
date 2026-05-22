/**
 * Block Parsers
 *
 * Parsers for marker format blocks (PLAN, EXPLANATION, META, MANIFEST, BATCH).
 */

import type { GenerationMeta } from '../cleanCode';
import type { MarkerFilePlan, MarkerMeta, MarkerManifestEntry, MarkerBatch } from './types';

// ============================================================================
// PLAN Block Parser
// ============================================================================

/**
 * Parse PLAN block from marker format
 *
 * <!-- PLAN -->
 * create: src/App.tsx, src/components/Header.tsx
 * update: src/pages/Home.tsx
 * delete: src/old/Legacy.tsx
 * sizes: src/App.tsx:25, src/components/Header.tsx:40
 * batch: 1/2
 * <!-- /PLAN -->
 */
export function parseMarkerPlan(response: string): MarkerFilePlan | null {
  const planMatch = response.match(/<!--\s*PLAN\s*-->([\s\S]*?)<!--\s*\/PLAN\s*-->/);
  if (!planMatch) return null;

  const planContent = (planMatch[1] ?? '').trim();
  const lines = planContent.split('\n').map((l) => l.trim()).filter(Boolean);

  const plan: MarkerFilePlan = {
    create: [],
    update: [],
    delete: [],
    total: 0,
    sizes: {},
  };

  for (const line of lines) {
    // Parse "create: file1, file2, file3"
    if (line.startsWith('create:')) {
      const files = line.slice(7).split(',').map((f) => f.trim()).filter(Boolean);
      plan.create = files;
    }
    // Parse "update: file1, file2"
    else if (line.startsWith('update:')) {
      const files = line.slice(7).split(',').map((f) => f.trim()).filter(Boolean);
      plan.update = files;
    }
    // Parse "delete: file1, file2"
    else if (line.startsWith('delete:')) {
      const files = line.slice(7).split(',').map((f) => f.trim()).filter(Boolean);
      plan.delete = files;
    }
    // Parse "sizes: src/App.tsx:25, src/components/Header.tsx:40"
    else if (line.startsWith('sizes:')) {
      const sizePairs = line.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
      for (const pair of sizePairs) {
        const lastColon = pair.lastIndexOf(':');
        if (lastColon > 0) {
          const path = pair.slice(0, lastColon).trim();
          const size = parseInt(pair.slice(lastColon + 1).trim(), 10);
          if (path && !isNaN(size) && plan.sizes) {
            plan.sizes[path] = size;
          }
        }
      }
    }
  }

  plan.total = plan.create.length + plan.update.length;
  return plan;
}

// ============================================================================
// EXPLANATION Block Parser
// ============================================================================

/**
 * Parse EXPLANATION block from marker format
 */
export function parseMarkerExplanation(response: string): string | undefined {
  const match = response.match(/<!--\s*EXPLANATION\s*-->([\s\S]*?)<!--\s*\/EXPLANATION\s*-->/);
  return match ? (match[1] ?? '').trim() : undefined;
}

// ============================================================================
// GENERATION_META Block Parser
// ============================================================================

/**
 * Parse GENERATION_META block from marker format (for multi-batch)
 *
 * <!-- GENERATION_META -->
 * totalFilesPlanned: 10
 * filesInThisBatch: src/App.tsx, src/components/Header.tsx
 * completedFiles: src/App.tsx, src/components/Header.tsx
 * remainingFiles: src/components/Footer.tsx, src/components/Sidebar.tsx
 * currentBatch: 1
 * totalBatches: 2
 * isComplete: false
 * <!-- /GENERATION_META -->
 */
export function parseMarkerGenerationMeta(response: string): GenerationMeta | undefined {
  const match = response.match(
    /<!--\s*GENERATION_META\s*-->([\s\S]*?)<!--\s*\/GENERATION_META\s*-->/
  );
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  const meta: GenerationMeta = {
    totalFilesPlanned: 0,
    filesInThisBatch: [],
    completedFiles: [],
    remainingFiles: [],
    currentBatch: 1,
    totalBatches: 1,
    isComplete: true,
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'totalFilesPlanned':
        meta.totalFilesPlanned = parseInt(value, 10) || 0;
        break;
      case 'filesInThisBatch':
        meta.filesInThisBatch = value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case 'completedFiles':
        meta.completedFiles = value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case 'remainingFiles':
        meta.remainingFiles = value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case 'currentBatch':
        meta.currentBatch = parseInt(value, 10) || 1;
        break;
      case 'totalBatches':
        meta.totalBatches = parseInt(value, 10) || 1;
        break;
      case 'isComplete':
        meta.isComplete = value.toLowerCase() === 'true';
        break;
    }
  }

  return meta;
}

// ============================================================================
// META Block Parser (v2)
// ============================================================================

/**
 * Parse META block (v2)
 *
 * <!-- META -->
 * format: marker
 * version: 2.0
 * timestamp: 2025-01-15T10:30:00Z
 * <!-- /META -->
 */
export function parseMarkerMeta(response: string): MarkerMeta | undefined {
  const match = response.match(/<!--\s*META\s*-->([\s\S]*?)<!--\s*\/META\s*-->/);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  const meta: MarkerMeta = {
    format: 'marker',
    version: '1.0',
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'format':
        meta.format = value;
        break;
      case 'version':
        meta.version = value;
        break;
      case 'timestamp':
        meta.timestamp = value;
        break;
    }
  }

  return meta;
}

// ============================================================================
// MANIFEST Block Parser (v2)
// ============================================================================

/**
 * Parse MANIFEST block (v2)
 *
 * <!-- MANIFEST -->
 * | File | Action | Lines | Tokens | Status |
 * |------|--------|-------|--------|--------|
 * | src/App.tsx | create | 45 | ~320 | included |
 * | src/components/Header.tsx | create | 62 | ~450 | included |
 * <!-- /MANIFEST -->
 */
export function parseMarkerManifest(response: string): MarkerManifestEntry[] | undefined {
  const match = response.match(/<!--\s*MANIFEST\s*-->([\s\S]*?)<!--\s*\/MANIFEST\s*-->/);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  const entries: MarkerManifestEntry[] = [];

  for (const line of lines) {
    // Skip header row and separator
    if (line.startsWith('| File') || line.startsWith('|--') || line.startsWith('|-')) {
      continue;
    }

    // Parse table row: | src/App.tsx | create | 45 | ~320 | included |
    if (line.startsWith('|')) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);

      if (cells.length >= 5) {
        const [file = '', action = '', linesStr = '', tokensStr = '', status = ''] = cells;

        // Parse tokens (handle ~320 format)
        const tokens = parseInt(tokensStr.replace(/[~,]/g, ''), 10) || 0;
        const lineCount = parseInt(linesStr, 10) || 0;

        // Validate action
        const validAction = ['create', 'update', 'delete'].includes(action.toLowerCase())
          ? (action.toLowerCase() as 'create' | 'update' | 'delete')
          : 'create';

        // Validate status
        const validStatus = ['included', 'marked', 'pending', 'skipped'].includes(status.toLowerCase())
          ? (status.toLowerCase() as 'included' | 'marked' | 'pending' | 'skipped')
          : 'included';

        entries.push({
          file,
          action: validAction,
          lines: lineCount,
          tokens,
          status: validStatus,
        });
      }
    }
  }

  return entries.length > 0 ? entries : undefined;
}

// ============================================================================
// BATCH Block Parser (v2)
// ============================================================================

/**
 * Parse BATCH block (v2)
 *
 * <!-- BATCH -->
 * current: 1
 * total: 3
 * isComplete: false
 * completed: src/App.tsx, src/components/Header.tsx
 * remaining: src/utils/helpers.ts, src/hooks/useAuth.ts
 * nextBatchHint: Utility functions and type definitions
 * <!-- /BATCH -->
 */
export function parseMarkerBatch(response: string): MarkerBatch | undefined {
  const match = response.match(/<!--\s*BATCH\s*-->([\s\S]*?)<!--\s*\/BATCH\s*-->/);
  if (!match) return undefined;

  const content = (match[1] ?? '').trim();
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  const batch: MarkerBatch = {
    current: 1,
    total: 1,
    isComplete: true,
    completed: [],
    remaining: [],
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'current':
        batch.current = parseInt(value, 10) || 1;
        break;
      case 'total':
        batch.total = parseInt(value, 10) || 1;
        break;
      case 'iscomplete':
        batch.isComplete = value.toLowerCase() === 'true';
        break;
      case 'completed':
        batch.completed = value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case 'remaining':
        batch.remaining = value.split(',').map((f) => f.trim()).filter(Boolean);
        break;
      case 'nextbatchhint':
        batch.nextBatchHint = value;
        break;
    }
  }

  return batch;
}
