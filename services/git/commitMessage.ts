/**
 * Auto-Commit Message Service
 *
 * Generates AI-powered git commit messages.
 * Extracted from useAutoCommit hook for testability.
 *
 * @module services/git/commitMessage
 */

import { getProviderManager } from '../ai';
import { activityLogger } from '../activityLogger';

/**
 * Maximum number of changed files to include in AI context
 */
export const MAX_CONTEXT_FILES = 10;

/**
 * Maximum number of changed files to allow auto-commit
 */
export const MAX_FILES_FOR_AUTO_COMMIT = 20;

/**
 * Build a diff context string from changed files for AI prompt.
 */
export function buildChangedFilesContext(
  localChanges: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>,
  files: Record<string, string>,
  maxFiles: number = MAX_CONTEXT_FILES
): string {
  return localChanges
    .slice(0, maxFiles)
    .map((change) => {
      const content = files[change.path];
      const preview = content ? content.slice(0, 500) : '(file content not available)';
      return `${change.status.toUpperCase()}: ${change.path}\n${preview}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Build fallback commit message from file names.
 */
export function buildFallbackMessage(
  localChanges: Array<{ path: string; status: string }>,
  maxNames: number = 3
): string {
  const fileNames = localChanges
    .slice(0, maxNames)
    .map((c) => c.path.split('/').pop())
    .join(', ');
  return `auto: update ${fileNames}`;
}

/**
 * Clean AI response into a proper commit message.
 * Removes markdown fences, quotes, and adds "auto:" prefix.
 */
export function cleanCommitMessage(raw: string): string {
  const cleaned = raw
    .replace(/^```.*\n?/gm, '')
    .replace(/```$/gm, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!cleaned) return 'auto: update files';

  if (!cleaned.toLowerCase().startsWith('auto:')) {
    return `auto: ${cleaned}`;
  }

  return cleaned;
}

/**
 * System instruction for AI commit message generation.
 */
export const COMMIT_SYSTEM_INSTRUCTION = `You are a Conventional Commits expert. Generate a single commit message in the form \`type(scope): subject\` where \`type\` ∈ {feat, fix, refactor, style, docs, test, chore, perf, build, ci} and \`subject\` is imperative-mood, lowercase, ≤ 72 chars, no trailing period. \`scope\` is optional — include it only if a clear single area exists (e.g. \`auth\`, \`header\`, \`api\`). Pick the most impactful change as the subject; ignore reformat-only noise. Output ONLY the commit message text — no markdown fence, no quotes, no leading "Commit:" label, no body unless the diff materially needs one.`;

/**
 * Generate an AI-powered commit message.
 * Falls back to a simple file-name based message on failure.
 */
export async function generateCommitMessage(
  localChanges: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>,
  files: Record<string, string>
): Promise<string> {
  if (localChanges.length === 0) {
    return 'auto: update files';
  }

  try {
    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();

    if (!activeConfig) {
      return buildFallbackMessage(localChanges, 5);
    }

    const changedFilesContext = buildChangedFilesContext(localChanges, files);

    const prompt = `Generate a concise git commit message for these changes. Follow conventional commit format (feat:, fix:, refactor:, etc.). Be specific but brief (max 72 chars for first line). Only output the commit message, nothing else.

Changed files:
${changedFilesContext}`;

    const response = await manager.generate({
      prompt,
      systemInstruction: COMMIT_SYSTEM_INSTRUCTION,
      debugCategory: 'git-commit',
    });

    const message = response.text?.trim() || '';
    return cleanCommitMessage(message);
  } catch (_err) {
    activityLogger.warn('autocommit', 'Failed to generate AI message', 'Using fallback');
    return buildFallbackMessage(localChanges);
  }
}

/**
 * Check if auto-commit should proceed based on safety conditions.
 */
export function shouldAutoCommit(opts: {
  enabled: boolean;
  gitInitialized: boolean;
  hasUncommittedChanges: boolean;
  previewHasErrors: boolean;
  localChangesCount: number;
  isCommitting: boolean;
  lastCommitTime: number;
  cooldownMs: number;
}): boolean {
  if (opts.isCommitting) return false;
  if (!opts.enabled || !opts.gitInitialized || !opts.hasUncommittedChanges) return false;
  if (opts.previewHasErrors) return false;
  if (opts.localChangesCount === 0) return false;
  if (opts.localChangesCount > MAX_FILES_FOR_AUTO_COMMIT) return false;
  if (Date.now() - opts.lastCommitTime < opts.cooldownMs) return false;
  return true;
}
