import React, { useState, useEffect, useCallback, useRef } from 'react';
import { COPY_FEEDBACK_RESET_MS } from '../../constants/timing';
import {
  GitBranch, GitCommit, Check, X, Plus, RefreshCw, Loader2,
  FileText, FilePlus, FileX, ChevronDown, ChevronUp,
  AlertCircle, Clock, AlertTriangle, Sparkles, RotateCcw,
  Github, Upload
} from 'lucide-react';
import { GitStatus, GitCommit as GitCommitType, CommitDetails, gitApi } from '@/services/projectApi';
import { FileSystem } from '@/types';
import { getProviderManager } from '@/services/ai';
import { LocalChange } from './types';
import { formatCommitDate } from './utils';
import { FileItem } from './FileItem';
import { CommitDetailsView } from './CommitDetailsView';
import { DiffModal } from './DiffModal';

interface GitPanelProps {
  projectId: string | null;
  gitStatus: GitStatus | null;
  onInitGit: (force?: boolean) => Promise<boolean>;
  onCommit: (message: string) => Promise<boolean>;
  onRefreshStatus: () => Promise<void>;
  // Local changes (WIP - not yet synced to backend)
  hasUncommittedChanges?: boolean;
  localChanges?: LocalChange[];
  // Files for AI commit message generation
  files?: FileSystem;
  // Discard all local changes and restore from last commit
  onDiscardChanges?: () => Promise<void>;
  // Revert to a specific commit
  onRevertToCommit?: (commitHash: string) => Promise<boolean>;
  // GitHub integration
  onPushToGithub?: () => void;
  hasRemote?: boolean;
  remoteUrl?: string;
}

export const GitPanel: React.FC<GitPanelProps> = ({
  projectId,
  gitStatus,
  onInitGit,
  onCommit,
  onRefreshStatus,
  hasUncommittedChanges = false,
  localChanges = [],
  files = {},
  onDiscardChanges,
  onRevertToCommit,
  onPushToGithub,
  hasRemote = false,
  remoteUrl,
}) => {
  // Git initialization state comes from gitStatus - single source of truth
  const isGitInitialized = gitStatus?.initialized ?? false;
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [commits, setCommits] = useState<GitCommitType[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'staged' | 'modified' | 'untracked' | null>('modified');

  // AI commit message state
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // Discard changes state
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Revert to commit state
  const [isReverting, setIsReverting] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [revertTargetCommit, setRevertTargetCommit] = useState<CommitDetails | null>(null);

  // Commit details state
  const [selectedCommit, setSelectedCommit] = useState<CommitDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffContent, setDiffContent] = useState<string>('');
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Define loadCommits before useEffect
  const loadCommits = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingCommits(true);
    try {
      const result = await gitApi.log(projectId, 20);
      setCommits(result.commits);
    } catch (err) {
      console.error('Failed to load commits:', err);
    } finally {
      setIsLoadingCommits(false);
    }
  }, [projectId]);

  // Load commit history when git is initialized
  useEffect(() => {
    if (projectId && isGitInitialized) {
      loadCommits();
    }
  }, [projectId, isGitInitialized, loadCommits]);

  const loadCommitDetails = async (hash: string) => {
    if (!projectId) return;

    setIsLoadingDetails(true);
    try {
      const details = await gitApi.commitDetails(projectId, hash);
      setSelectedCommit(details);
    } catch (err) {
      console.error('Failed to load commit details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const loadCommitDiff = async (hash: string, file?: string) => {
    if (!projectId) return;

    setIsLoadingDiff(true);
    setDiffFile(file || null);
    setShowDiffModal(true);

    try {
      const result = await gitApi.commitDiff(projectId, hash, file);
      setDiffContent(result.diff);
    } catch (err) {
      console.error('Failed to load diff:', err);
      setDiffContent('Failed to load diff');
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedHash(null), COPY_FEEDBACK_RESET_MS);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleInitGit = async (force = false) => {
    setIsInitializing(true);
    try {
      await onInitGit(force);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      const success = await onCommit(commitMessage.trim());
      if (success) {
        setCommitMessage('');
        loadCommits();
      }
    } finally {
      setIsCommitting(false);
    }
  };

  // Discard all local changes
  const handleDiscardChanges = async () => {
    if (!onDiscardChanges) return;

    setIsDiscarding(true);
    try {
      await onDiscardChanges();
      setShowDiscardConfirm(false);
    } finally {
      setIsDiscarding(false);
    }
  };

  // Generate AI commit message
  const generateCommitMessage = useCallback(async () => {
    const allChanges = [
      ...localChanges,
      ...(gitStatus?.modified?.map(p => ({ path: p, status: 'modified' as const })) || []),
      ...(gitStatus?.staged?.map(p => ({ path: p, status: 'modified' as const })) || []),
      ...(gitStatus?.not_added?.map(p => ({ path: p, status: 'added' as const })) || []),
      ...(gitStatus?.deleted?.map(p => ({ path: p, status: 'deleted' as const })) || []),
    ];

    if (allChanges.length === 0) return;

    setIsGeneratingMessage(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();

      if (!activeConfig) {
        setCommitMessage('// No AI provider configured');
        return;
      }

      // Build context from changed files
      const changedFilesContext = allChanges
        .slice(0, 10) // Limit to 10 files
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
      });

      const message = response.text?.trim() || '';
      // Clean any markdown or quotes
      const cleanMessage = message
        .replace(/^```.*\n?/gm, '')
        .replace(/```$/gm, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      setCommitMessage(cleanMessage);
    } catch (err) {
      console.error('Failed to generate commit message:', err);
      setCommitMessage('// Failed to generate message');
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [localChanges, gitStatus, files]);

  // Handle revert to commit
  const handleRevertClick = useCallback((commit: CommitDetails) => {
    setRevertTargetCommit(commit);
    setShowRevertConfirm(true);
  }, []);

  const handleConfirmRevert = useCallback(async () => {
    if (!revertTargetCommit || !onRevertToCommit) return;

    setIsReverting(true);
    try {
      const success = await onRevertToCommit(revertTargetCommit.hash);
      if (success) {
        setShowRevertConfirm(false);
        setRevertTargetCommit(null);
        setSelectedCommit(null);
        // Reload commit history
        loadCommits();
      }
    } catch (err) {
      console.error('Failed to revert:', err);
    } finally {
      setIsReverting(false);
    }
  }, [revertTargetCommit, onRevertToCommit, loadCommits]);

  // No project selected
  if (!projectId) {
    return (
      <div className="p-4 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
        <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No project selected</p>
      </div>
    );
  }

  // Git repository is corrupted
  if (gitStatus?.corrupted) {
    return (
      <div className="p-4">
        <div className="text-center mb-4">
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-error)' }} />
          <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--theme-text-primary)' }}>Repository Corrupted</h3>
          <p className="text-xs mb-2" style={{ color: 'var(--theme-text-muted)' }}>
            {gitStatus.message || 'The git repository data is corrupted.'}
          </p>
        </div>
        <button
          onClick={() => handleInitGit(true)}
          disabled={isInitializing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: isInitializing ? 'var(--theme-surface)' : 'var(--color-error)', color: 'var(--theme-text-on-accent)' }}
        >
          {isInitializing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Re-initialize Repository
        </button>
      </div>
    );
  }

  // Git not initialized
  if (!isGitInitialized) {
    return (
      <div className="p-4">
        <div className="text-center mb-4">
          <GitBranch className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--theme-text-muted)' }} />
          <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--theme-text-primary)' }}>Initialize Git</h3>
          <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            Start version control for this project
          </p>
        </div>
        <button
          onClick={() => handleInitGit(false)}
          disabled={isInitializing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: isInitializing ? 'var(--theme-surface)' : 'var(--color-success)', color: 'var(--theme-text-on-accent)' }}
        >
          {isInitializing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Initialize Repository
        </button>
      </div>
    );
  }

  // Calculate changes count
  const stagedCount = gitStatus?.staged?.length || 0;
  const modifiedCount = gitStatus?.modified?.length || 0;
  const untrackedCount = gitStatus?.not_added?.length || 0;
  const deletedCount = gitStatus?.deleted?.length || 0;
  const totalChanges = stagedCount + modifiedCount + untrackedCount + deletedCount;
  const hasChanges = !gitStatus?.clean || hasUncommittedChanges;
  const localChangeCount = localChanges.length;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
          <span className="text-base font-medium" style={{ color: 'var(--theme-text-primary)' }}>
            {gitStatus?.branch || 'main'}
          </span>
          {hasUncommittedChanges ? (
            <span className="px-2 py-0.5 text-xs rounded flex items-center gap-1.5" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-warning)' }} />
              {localChangeCount} local
            </span>
          ) : gitStatus?.clean ? (
            <span className="px-2 py-0.5 text-xs rounded" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
              Clean
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs rounded" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
              {totalChanges} change{totalChanges !== 1 ? 's' : ''}
            </span>
          )}
          {hasRemote && remoteUrl && (
            <span className="px-2 py-0.5 text-xs rounded flex items-center gap-1" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
              <Github className="w-3 h-3" />
              linked
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onPushToGithub && (
            <button
              onClick={onPushToGithub}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--theme-glass-200)',
                color: 'var(--theme-text-secondary)',
                border: '1px solid var(--theme-border-light)'
              }}
              title={hasRemote ? "Push to GitHub" : "Push to GitHub (Create new repo)"}
            >
              <Github className="w-3.5 h-3.5" />
              <Upload className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onRefreshStatus}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Refresh git status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column: Changes + Commit */}
        <div className="flex-1 flex flex-col min-w-0" style={{ borderRight: '1px solid var(--theme-border-light)' }}>
          {/* Changes Section */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Local Changes (WIP) */}
            {hasUncommittedChanges && localChanges.length > 0 && (
              <div className="p-3" style={{ borderBottom: '1px solid var(--color-warning-border)', backgroundColor: 'var(--color-warning-subtle)' }}>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-warning)' }}>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Local Changes</span>
                  </div>
                  {onDiscardChanges && (
                    <button
                      onClick={() => setShowDiscardConfirm(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors"
                      style={{ color: 'var(--color-error)' }}
                      title="Discard all changes and restore from last commit"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Discard
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {localChanges.map((change) => (
                    <div
                      key={change.path}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 ml-4 text-sm"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      {change.status === 'added' && <FilePlus className="w-4 h-4" style={{ color: 'var(--color-success)' }} />}
                      {change.status === 'modified' && <FileText className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />}
                      {change.status === 'deleted' && <FileX className="w-4 h-4" style={{ color: 'var(--color-error)' }} />}
                      <span className="truncate">{change.path}</span>
                    </div>
                  ))}
                </div>

                {/* Discard Confirmation */}
                {showDiscardConfirm && (
                  <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                    <p className="text-xs mb-3" style={{ color: 'var(--color-error)' }}>
                      This will discard all local changes and restore to last commit. Are you sure?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDiscardChanges}
                        disabled={isDiscarding}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ backgroundColor: isDiscarding ? 'var(--theme-surface)' : 'var(--color-error)', color: 'var(--theme-text-on-accent)' }}
                      >
                        {isDiscarding ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        Discard All
                      </button>
                      <button
                        onClick={() => setShowDiscardConfirm(false)}
                        className="flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-primary)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Git Changes */}
            {totalChanges > 0 ? (
              <div className="p-3 space-y-2">
                {/* Staged Files */}
                {stagedCount > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'staged' ? null : 'staged')}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-success)' }}>
                        <Check className="w-4 h-4" />
                        Staged ({stagedCount})
                      </span>
                      {expandedSection === 'staged' ? (
                        <ChevronUp className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      )}
                    </button>
                    {expandedSection === 'staged' && (
                      <div className="mt-1 space-y-0.5">
                        {gitStatus?.staged?.map((file) => (
                          <FileItem key={file} file={file} status="staged" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Modified Files */}
                {modifiedCount > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'modified' ? null : 'modified')}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-warning)' }}>
                        <FileText className="w-4 h-4" />
                        Modified ({modifiedCount})
                      </span>
                      {expandedSection === 'modified' ? (
                        <ChevronUp className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      )}
                    </button>
                    {expandedSection === 'modified' && (
                      <div className="mt-1 space-y-0.5">
                        {gitStatus?.modified?.map((file) => (
                          <FileItem key={file} file={file} status="modified" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Untracked Files */}
                {untrackedCount > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'untracked' ? null : 'untracked')}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-info)' }}>
                        <FilePlus className="w-4 h-4" />
                        Untracked ({untrackedCount})
                      </span>
                      {expandedSection === 'untracked' ? (
                        <ChevronUp className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      )}
                    </button>
                    {expandedSection === 'untracked' && (
                      <div className="mt-1 space-y-0.5">
                        {gitStatus?.not_added?.map((file) => (
                          <FileItem key={file} file={file} status="untracked" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Deleted Files */}
                {deletedCount > 0 && gitStatus?.deleted?.map((file) => (
                  <FileItem key={file} file={file} status="deleted" />
                ))}
              </div>
            ) : !hasUncommittedChanges ? (
              <div className="p-4 text-center text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                <Check className="w-8 h-8 mx-auto mb-2 opacity-50" style={{ color: 'var(--color-success)' }} />
                <p>Working tree clean</p>
                <p className="text-xs mt-1">No uncommitted changes</p>
              </div>
            ) : null}
          </div>

          {/* Commit Section */}
          <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
            <div className="relative">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                rows={2}
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--theme-input-bg)',
                  border: '1px solid var(--theme-input-border)',
                  color: 'var(--theme-text-primary)'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleCommit();
                  }
                }}
              />
              {/* AI Generate Button */}
              <button
                onClick={generateCommitMessage}
                disabled={isGeneratingMessage || (!hasChanges && localChanges.length === 0)}
                className="absolute right-2 top-2 p-1.5 rounded-lg transition-colors"
                style={{ color: isGeneratingMessage || (!hasChanges && localChanges.length === 0) ? 'var(--theme-text-dim)' : 'var(--theme-ai-accent)' }}
                title="Generate commit message with AI"
              >
                {isGeneratingMessage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || (!hasChanges && localChanges.length === 0) || isCommitting}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: (!commitMessage.trim() || (!hasChanges && localChanges.length === 0) || isCommitting) ? 'var(--theme-surface)' : 'var(--theme-accent)',
                color: (!commitMessage.trim() || (!hasChanges && localChanges.length === 0) || isCommitting) ? 'var(--theme-text-muted)' : 'var(--theme-text-on-accent)'
              }}
            >
              {isCommitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitCommit className="w-4 h-4" />
              )}
              Commit
            </button>
          </div>
        </div>

        {/* Right Column: Commit History */}
        <div className="w-1/2 flex flex-col min-w-0" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--theme-text-muted)' }}>
              <Clock className="w-4 h-4" />
              History
            </span>
            <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>{commits.length} commits</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {isLoadingCommits ? (
              <div className="p-4 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin" style={{ color: 'var(--theme-accent)' }} />
              </div>
            ) : commits.length === 0 ? (
              <div className="p-4 text-center text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                <GitCommit className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>No commits yet</p>
              </div>
            ) : selectedCommit ? (
              <CommitDetailsView
                commit={selectedCommit}
                isLoading={isLoadingDetails}
                onBack={() => setSelectedCommit(null)}
                onViewDiff={(file) => loadCommitDiff(selectedCommit.hash, file)}
                onViewFullDiff={() => loadCommitDiff(selectedCommit.hash)}
                onCopyHash={() => copyHash(selectedCommit.hash)}
                copiedHash={copiedHash}
                onRevert={onRevertToCommit ? handleRevertClick : undefined}
                isFirstCommit={commits.length > 0 && commits[0].hash === selectedCommit.hash}
              />
            ) : (
              <div className="p-2 space-y-1">
                {commits.map((commit, index) => (
                  <button
                    key={commit.hash}
                    onClick={() => loadCommitDetails(commit.hash)}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full mt-1 transition-colors" style={{ backgroundColor: 'var(--theme-accent)' }} />
                      {index < commits.length - 1 && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-px h-[calc(100%+0.25rem)]" style={{ backgroundColor: 'var(--theme-border)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate transition-colors leading-snug" style={{ color: 'var(--theme-text-primary)' }}>
                        {commit.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                          {commit.hashShort}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>·</span>
                        <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                          {formatCommitDate(commit.date)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diff Modal */}
      {showDiffModal && (
        <DiffModal
          diff={diffContent}
          isLoading={isLoadingDiff}
          fileName={diffFile}
          commitHash={selectedCommit?.hashShort}
          onClose={() => {
            setShowDiffModal(false);
            setDiffContent('');
            setDiffFile(null);
          }}
        />
      )}

      {/* Revert Confirmation Modal */}
      {showRevertConfirm && revertTargetCommit && (
        <div className="fixed inset-0 z-200 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
          <div className="w-full max-w-md backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200" style={{ backgroundColor: 'var(--theme-modal-bg)', border: '1px solid var(--theme-modal-border)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 p-5" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--color-warning-subtle)' }}>
              <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
                <RotateCcw className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Restore to Commit?</h3>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>This will change your project files</p>
              </div>
              <button
                onClick={() => {
                  setShowRevertConfirm(false);
                  setRevertTargetCommit(null);
                }}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{revertTargetCommit.message}</p>
                <p className="text-xs mt-1 font-mono" style={{ color: 'var(--theme-text-muted)' }}>{revertTargetCommit.hashShort}</p>
              </div>

              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                Your project files will be restored to this commit's state.
                Any commits after this point will still exist in history.
              </p>

              {/* Uncommitted Changes Warning */}
              {hasUncommittedChanges && (
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>Uncommitted Changes</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-error)' }}>
                        You have {localChanges.length} uncommitted change{localChanges.length !== 1 ? 's' : ''}.
                        These will be lost when you restore.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-5" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
              <button
                onClick={() => {
                  setShowRevertConfirm(false);
                  setRevertTargetCommit(null);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevert}
                disabled={isReverting}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: isReverting ? 'var(--theme-surface)' : 'var(--color-warning)', color: 'var(--theme-text-on-accent)' }}
              >
                {isReverting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {isReverting ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitPanel;

// Re-export all components for external use
export { FileItem } from './FileItem';
export { CommitFileIcon } from './CommitFileIcon';
export { DiffViewer } from './DiffViewer';
export { DiffModal } from './DiffModal';
export { CommitDetailsView } from './CommitDetailsView';
// eslint-disable-next-line react-refresh/only-export-components -- Utility re-export for module API
export { formatCommitDate } from './utils';
export type { LocalChange, FileItemProps, CommitFileIconProps, DiffModalProps, DiffViewerProps, CommitDetailsViewProps } from './types';
