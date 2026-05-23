/**
 * useAutoCommit - Automatically commit when preview is error-free
 *
 * Features:
 * - Debounce: Wait 3 seconds of stable error-free state
 * - Cooldown: Minimum 10 seconds between auto-commits
 * - AI-generated commit messages with "auto:" prefix
 * - Safety guards: max files, git clean check
 *
 * Delegates to services/git/commitMessage for business logic.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { activityLogger } from '../services/activityLogger';
import {
  generateCommitMessage,
  shouldAutoCommit as checkShouldAutoCommit,
  MAX_FILES_FOR_AUTO_COMMIT,
} from '../services/git/commitMessage';

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

  // Perform auto-commit — delegates message generation to service
  const performAutoCommit = useCallback(async () => {
    // Safety checks using service
    if (!checkShouldAutoCommit({
      enabled,
      gitInitialized,
      hasUncommittedChanges,
      previewHasErrors,
      localChangesCount: localChanges.length,
      isCommitting: isCommittingRef.current,
      lastCommitTime: lastCommitTimeRef.current,
      cooldownMs: COOLDOWN_MS,
    })) return;

    isCommittingRef.current = true;
    setIsAutoCommitting(true);

    const commitTimer = activityLogger.startTimed('autocommit', `Auto-committing ${localChanges.length} file${localChanges.length > 1 ? 's' : ''}`);

    try {
      // Generate commit message via service
      const message = await generateCommitMessage(localChanges, files);
      activityLogger.info('autocommit', 'Generated message', message.substring(0, 50));

      // Perform commit
      const success = await onCommit(message);

      if (success) {
        lastCommitTimeRef.current = Date.now();
        setLastAutoCommitMessage(message);
        commitTimer();
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
  }, [enabled, gitInitialized, hasUncommittedChanges, previewHasErrors, localChanges, files, onCommit, backupEnabled, onBackupPush]);

  // Effect: Monitor conditions and trigger auto-commit with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const shouldCommit = enabled &&
                         gitInitialized &&
                         hasUncommittedChanges &&
                         !previewHasErrors &&
                         localChanges.length > 0 &&
                         localChanges.length <= MAX_FILES_FOR_AUTO_COMMIT;

    if (shouldCommit && !isCommittingRef.current) {
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
