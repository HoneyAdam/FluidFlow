/**
 * ControlPanel Utility Functions
 *
 * Helper functions extracted from ControlPanel for better organization and testability.
 */

import { stripPlanComment } from '../../utils/cleanCode';
import { estimateTokenCount } from '../../services/ai/capabilities';

// Re-export for backwards compatibility
export { estimateTokenCount };

/**
 * Extract file list from AI response
 * Tries JSON parsing first, then falls back to regex patterns
 */
export function extractFileListFromResponse(response: string): string[] {
  const files = new Set<string>();

  // Try JSON parsing first (with PLAN comment handling)
  try {
    const cleaned = stripPlanComment(response);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}?/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.files) {
        Object.keys(parsed.files).forEach(file => files.add(file));
      }
    }
  } catch {
    // Continue with regex extraction
  }

  // Extract files using regex patterns
  const patterns = [
    /"([^"]+\.(tsx?|jsx?|css|json|md|sql|ts|js))":/g,
    /(?:^|\n)(src\/[^:\n]+\.(tsx?|jsx?|css|json|md|sql|ts|js))\s*:/gm,
    /(?:create|update|generate)\s+([^"]*\.(?:tsx?|jsx?|css|json|md|sql|ts|js))/gi
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const filePath = match[1] || match[2];
      if (filePath) {
        files.add(filePath);
      }
    }
  });

  return Array.from(files).sort();
}

/**
 * File plan structure detected from AI response
 */
export interface FilePlan {
  create: string[];
  update: string[];
  delete: string[];
  total: number;
  /** Estimated line counts for each file (for progress tracking) */
  sizes?: Record<string, number>;
}

/**
 * File progress during streaming
 */
export interface FileStreamProgress {
  path: string;
  action: 'create' | 'update' | 'delete';
  expectedLines: number;
  receivedChars: number;
  /** Estimated progress 0-100 based on received chars vs expected */
  progress: number;
  status: 'pending' | 'streaming' | 'complete';
}

/**
 * Parse PLAN comment from AI response
 * Format: // PLAN: {"create":[],"update":[],"delete":[],"total":N,"sizes":{"path":lines}}
 */
export function parsePlanComment(response: string): FilePlan | null {
  const planMatch = response.match(/\/\/\s*PLAN:\s*(\{[\s\S]*?\})/);
  if (!planMatch) return null;

  try {
    const plan = JSON.parse(planMatch[1] ?? '{}');
    return {
      create: plan.create || [],
      update: plan.update || [],
      delete: plan.delete || [],
      total: plan.total || 0,
      sizes: plan.sizes || undefined
    };
  } catch {
    return null;
  }
}

/**
 * Create initial file progress map from FilePlan
 */
export function createFileProgressFromPlan(plan: FilePlan): Map<string, FileStreamProgress> {
  const progress = new Map<string, FileStreamProgress>();

  // Add created files
  for (const path of plan.create) {
    progress.set(path, {
      path,
      action: 'create',
      expectedLines: plan.sizes?.[path] || 100, // Default estimate
      receivedChars: 0,
      progress: 0,
      status: 'pending'
    });
  }

  // Add updated files
  for (const path of plan.update) {
    progress.set(path, {
      path,
      action: 'update',
      expectedLines: plan.sizes?.[path] || 100,
      receivedChars: 0,
      progress: 0,
      status: 'pending'
    });
  }

  // Add deleted files (always 100% immediately)
  for (const path of plan.delete) {
    progress.set(path, {
      path,
      action: 'delete',
      expectedLines: 0,
      receivedChars: 0,
      progress: 100,
      status: 'complete'
    });
  }

  return progress;
}

/**
 * Update file progress based on streaming chunk
 * Estimates progress based on chars received vs expected (assuming ~40 chars/line)
 */
export function updateFileProgress(
  progressMap: Map<string, FileStreamProgress>,
  streamedText: string
): Map<string, FileStreamProgress> {
  const CHARS_PER_LINE = 40; // Average chars per line estimate

  // Find which files are being streamed by looking for file path patterns in JSON
  // Pattern: "path/to/file.tsx":"content..." or "path/to/file.tsx": "content..."
  const fileContentPattern = /"([^"]+\.(?:tsx?|jsx?|css|json|md))"\s*:\s*"/g;

  // Use matchAll instead of exec loop
  const matches = [...streamedText.matchAll(fileContentPattern)];

  for (const match of matches) {
    const filePath = match[1];
    if (!filePath) continue;
    const fileProgress = progressMap.get(filePath);

    if (fileProgress && fileProgress.status !== 'complete') {
      // Find content start position for this file
      const contentStart = (match.index ?? 0) + match[0].length;

      // Find content end (next file pattern or end of current content)
      // Look for closing quote not preceded by backslash
      let contentEnd = contentStart;
      let escaped = false;
      for (let i = contentStart; i < streamedText.length; i++) {
        const char = streamedText[i];
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
          break;
        }
        contentEnd = i + 1; // Still streaming
      }

      const receivedChars = contentEnd - contentStart;
      const expectedChars = fileProgress.expectedLines * CHARS_PER_LINE;
      const progress = Math.min(99, Math.round((receivedChars / expectedChars) * 100));

      progressMap.set(filePath, {
        ...fileProgress,
        receivedChars,
        progress,
        status: 'streaming'
      });
    }
  }

  return progressMap;
}

/**
 * Mark file as complete in progress map
 */
export function markFileComplete(
  progressMap: Map<string, FileStreamProgress>,
  filePath: string
): Map<string, FileStreamProgress> {
  const fileProgress = progressMap.get(filePath);
  if (fileProgress) {
    progressMap.set(filePath, {
      ...fileProgress,
      progress: 100,
      status: 'complete'
    });
  }
  return progressMap;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match ? (match[1]?.toLowerCase() ?? '') : '';
}

/**
 * Check if file is a code file
 */
export function isCodeFile(path: string): boolean {
  const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'css', 'scss', 'less', 'html', 'json', 'md', 'sql'];
  return codeExtensions.includes(getFileExtension(path));
}

/**
 * Check if file is an image
 */
export function isImageFile(path: string): boolean {
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  return imageExtensions.includes(getFileExtension(path));
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
