/**
 * useAutoCommit - Automatically commit when preview is error-free
 *
 * Features:
 * - Debounce: Wait 3 seconds of stable error-free state
 * - Cooldown: Minimum 10 seconds between auto-commits
 * - AI-generated commit messages with "auto:" prefix
 * - Safety guards: max files, git clean check
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { getProviderManager } from '../services/ai';
import { activityLogger } from '../services/activityLogger';

interface LocalChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

interface UseAutoCommitOptions {
  enabled: boolean;
  files: Record<string, string>;
  hasUncommittedChanges: boolean;
  previewHasErrors: boolean;
  gitInitialized: boolean;
  localChanges: LocalChange[];
  onCommit: (message: string) => Promise<boolean>;
  // Backup options
  backupEnabled?: boolean;
  onBackupPush?: () => Promise<void>;
}

// Debounce time: wait 3 seconds of stable error-free state
const DEBOUNCE_MS = 3000;
// Cooldown: minimum 10 seconds between auto-commits
const COOLDOWN_MS = 10000;
// Max files: skip if more than 20 files changed
const MAX_FILES_FOR_AUTO_COMMIT = 20;

export function useAutoCommit({
  enabled,
  files,
  hasUncommittedChanges,
  previewHasErrors,
  gitInitialized,
  localChanges,
  onCommit,
  backupEnabled = false,
  onBackupPush,
}: UseAutoCommitOptions) {
  const [isAutoCommitting, setIsAutoCommitting] = useState(false);
  const [lastAutoCommitMessage, setLastAutoCommitMessage] = useState<string | null>(null);
  const [lastBackupStatus, setLastBackupStatus] = useState<'success' | 'error' | null>(null);

  // Refs for tracking state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitTimeRef = useRef<number>(0);
  const isCommittingRef = useRef(false);

  // Generate AI commit message
  const generateCommitMessage = useCallback(async (): Promise<string> => {
    if (localChanges.length === 0) {
      return 'auto: update files';
    }

    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();

      if (!activeConfig) {
        // Fallback to simple message
        const fileNames = localChanges.slice(0, 5).map(c => c.path.split('/').pop()).join(', ');
        return `auto: update ${fileNames}${localChanges.length > 5 ? ` +${localChanges.length - 5} more` : ''}`;
      }

      // Build context from changed files
      const changedFilesContext = localChanges
        .slice(0, 10)
        .map(change => {
          const content = files[change.path];
          const preview = content ? content.slice(0, 500) : '(file content not available)';
          return `${change.status.toUpperCase()}: ${change.path}\n${preview}`;
        })
        .join('\n\n---\n\n');

      const prompt = `Generate a concise git commit message for these changes. Follow conventional commit format (feat:, fix:, refactor:, etc.). Be specific but brief (max 72 chars for first line). Only output the commit message, nothing else.

Changed files:
${changedFilesContext}`;

      const response = await manager.generate({
        prompt,
        systemInstruction: 'You are a Conventional Commits expert. Generate a single commit message in the form `type(scope): subject` where `type` ∈ {feat, fix, refactor, style, docs, test, chore, perf, build, ci} and `subject` is imperative-mood, lowercase, ≤ 72 chars, no trailing period. `scope` is optional — include it only if a clear single area exists (e.g. `auth`, `header`, `api`). Pick the most impactful change as the subject; ignore reformat-only noise. Output ONLY the commit message text — no markdown fence, no quotes, no leading "Commit:" label, no body unless the diff materially needs one.',
        debugCategory: 'git-commit', // Skip prompt confirmation for auto-generated messages
      });

      const message = response.text?.trim() || '';
      // Clean any markdown or quotes
      const cleanMessage = message
        .replace(/^```.*\n?/gm, '')
        .replace(/```$/gm, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      // Add "auto:" prefix if not already present
      if (cleanMessage && !cleanMessage.toLowerCase().startsWith('auto:')) {
        return `auto: ${cleanMessage}`;
      }

      return cleanMessage || 'auto: update files';
    } catch (_err) {
      activityLogger.warn('autocommit', 'Failed to generate AI message', 'Using fallback');
      // Fallback to simple message
      const fileNames = localChanges.slice(0, 3).map(c => c.path.split('/').pop()).join(', ');
      return `auto: update ${fileNames}`;
    }
  }, [localChanges, files]);

  // Perform auto-commit
  const performAutoCommit = useCallback(async () => {
    // Safety checks
    if (isCommittingRef.current) return;
    if (!enabled || !gitInitialized || !hasUncommittedChanges) return;
    if (previewHasErrors) return;
    if (localChanges.length === 0) return;
    if (localChanges.length > MAX_FILES_FOR_AUTO_COMMIT) {
      activityLogger.debug('autocommit', `Skipping: ${localChanges.length} files changed`, `Max is ${MAX_FILES_FOR_AUTO_COMMIT}`);
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastCommitTimeRef.current < COOLDOWN_MS) {
      activityLogger.debug('autocommit', 'Skipping: cooldown active', `${Math.ceil((COOLDOWN_MS - (now - lastCommitTimeRef.current)) / 1000)}s remaining`);
      return;
    }

    isCommittingRef.current = true;
    setIsAutoCommitting(true);

    const commitTimer = activityLogger.startTimed('autocommit', `Auto-committing ${localChanges.length} file${localChanges.length > 1 ? 's' : ''}`);

    try {
      // Generate commit message
      const message = await generateCommitMessage();
      activityLogger.info('autocommit', 'Generated message', message.substring(0, 50));

      // Perform commit
      const success = await onCommit(message);

      if (success) {
        lastCommitTimeRef.current = Date.now();
        setLastAutoCommitMessage(message);
        commitTimer(); // Mark as complete with duration
        activityLogger.success('autocommit', 'Auto-commit successful', message.substring(0, 50));

        // Trigger backup push if enabled
        if (backupEnabled && onBackupPush) {
          const backupTimer = activityLogger.startTimed('backup', 'Pushing to backup branch');
          try {
            await onBackupPush();
            setLastBackupStatus('success');
            backupTimer();
            activityLogger.success('backup', 'Backup push completed');
          } catch (backupErr) {
            activityLogger.error('backup', 'Backup push failed', backupErr instanceof Error ? backupErr.message : 'Unknown error');
            setLastBackupStatus('error');
          }
        }
      } else {
        activityLogger.error('autocommit', 'Auto-commit failed', 'Git commit returned false');
      }
    } catch (err) {
      activityLogger.error('autocommit', 'Auto-commit error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      isCommittingRef.current = false;
      setIsAutoCommitting(false);
    }
  }, [enabled, gitInitialized, hasUncommittedChanges, previewHasErrors, localChanges, generateCommitMessage, onCommit, backupEnabled, onBackupPush]);

  // Effect: Monitor conditions and trigger auto-commit with debounce
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Check if all conditions are met
    const shouldCommit = enabled &&
                         gitInitialized &&
                         hasUncommittedChanges &&
                         !previewHasErrors &&
                         localChanges.length > 0 &&
                         localChanges.length <= MAX_FILES_FOR_AUTO_COMMIT;

    if (shouldCommit && !isCommittingRef.current) {
      // Start debounce timer
      debounceTimerRef.current = setTimeout(() => {
        performAutoCommit();
      }, DEBOUNCE_MS);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, gitInitialized, hasUncommittedChanges, previewHasErrors, localChanges, performAutoCommit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    isAutoCommitting,
    lastAutoCommitMessage,
    lastBackupStatus,
  };
}

export default useAutoCommit;
