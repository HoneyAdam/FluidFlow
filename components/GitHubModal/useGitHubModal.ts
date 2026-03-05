import { useState, useEffect, useCallback, useRef } from 'react';
import { githubApi } from '@/services/api/github';
import { settingsApi } from '@/services/api/settings';
import type { GitHubRepo, OperationResult, ModalStep, GitHubModalProps } from './types';
import { STORAGE_KEYS } from '@/constants/storage';

export function useGitHubModal({
  isOpen,
  onClose,
  mode,
  onImportComplete,
  projectId,
  projectName,
  hasExistingRemote = false,
  existingRemoteUrl = '',
  onPushComplete,
}: GitHubModalProps) {
  const [step, setStep] = useState<ModalStep>('token');
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenVerifying, setTokenVerifying] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [result, setResult] = useState<OperationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBackupOnly, setShowBackupOnly] = useState(false);

  // New repo form state
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // Push options
  const [forcePush, setForcePush] = useState(false);
  const [pushMode, setPushMode] = useState<'new' | 'existing'>(hasExistingRemote ? 'existing' : 'new');
  const [includeContext, setIncludeContext] = useState(false);

  // Import options
  const [importMode, setImportMode] = useState<'myRepos' | 'url'>('myRepos');
  const [cloneUrl, setCloneUrl] = useState('');

  // Stable ref to avoid re-triggering effects
  const verifyAndProceedRef = useRef<((t: string) => Promise<void>) | null>(null);

  // ── Repo loading ──────────────────────────────────────────────────────

  const loadRepos = useCallback(async (tokenToUse: string) => {
    setReposLoading(true);
    setError(null);
    try {
      const res = await githubApi.listRepos(tokenToUse);
      setRepos(res.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setReposLoading(false);
    }
  }, []);

  const verifyAndProceed = useCallback(async (tokenToVerify: string) => {
    setTokenVerifying(true);
    setError(null);
    try {
      const verifyResult = await githubApi.verifyToken(tokenToVerify);
      if (verifyResult.valid) {
        await loadRepos(tokenToVerify);
        setStep('repos');
      } else {
        setError(verifyResult.error || 'Invalid token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token');
    } finally {
      setTokenVerifying(false);
      setTokenLoading(false);
    }
  }, [loadRepos]);

  verifyAndProceedRef.current = verifyAndProceed;

  // ── Effects ───────────────────────────────────────────────────────────

  // Initialize from saved settings and project name
  useEffect(() => {
    if (mode === 'push') {
      try {
        const savedSettings = localStorage.getItem(STORAGE_KEYS.GITHUB_PUSH_SETTINGS);
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          if (typeof settings.includeConversationHistory === 'boolean') {
            setIncludeContext(settings.includeConversationHistory);
          }
          if (typeof settings.defaultPrivate === 'boolean') {
            setIsPrivate(settings.defaultPrivate);
          }
        }
      } catch (err) {
        console.error('Failed to load push settings:', err);
      }

      if (projectName) {
        setNewRepoName(projectName.replace(/\s+/g, '-').toLowerCase());
      }
    }
  }, [mode, projectName]);

  // Load saved token on mount
  useEffect(() => {
    if (isOpen) {
      const loadSavedToken = async () => {
        setTokenLoading(true);
        try {
          const savedToken = await settingsApi.getBackupToken();
          if (savedToken.token) {
            setToken(savedToken.token);
            verifyAndProceedRef.current?.(savedToken.token);
          } else {
            setTokenLoading(false);
          }
        } catch {
          setTokenLoading(false);
        }
      };
      loadSavedToken();
    }
  }, [isOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    verifyAndProceed(token.trim());
  };

  const handleImport = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setStep('processing');
    setError(null);

    try {
      const importResult = await githubApi.importProject({
        url: repo.cloneUrl,
        token: repo.private ? token : undefined,
        branch: repo.hasFluidFlowBackup ? 'backup/auto' : repo.defaultBranch,
        name: repo.name,
      });

      setResult({
        success: true,
        project: importResult.project,
        restored: importResult.restored,
      });
      setStep('result');
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Import failed',
      });
      setStep('result');
    }
  };

  const handleCloneByUrl = async () => {
    if (!cloneUrl.trim()) return;

    setStep('processing');
    setError(null);

    try {
      const urlParts = cloneUrl.trim().replace(/\.git$/, '').split('/');
      const repoName = urlParts[urlParts.length - 1] || 'imported-project';

      const importResult = await githubApi.importProject({
        url: cloneUrl.trim(),
        token: token || undefined,
        name: repoName,
      });

      setResult({
        success: true,
        project: importResult.project,
        restored: importResult.restored,
      });
      setStep('result');
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Clone failed. Make sure the URL is correct and the repository is accessible.',
      });
      setStep('result');
    }
  };

  const handlePushToExisting = async (repo: GitHubRepo) => {
    if (!projectId) return;

    setSelectedRepo(repo);
    setStep('processing');
    setError(null);

    try {
      await githubApi.setRemote(projectId, repo.cloneUrl, 'origin');
      await githubApi.push(projectId, { force: forcePush, token, includeContext });

      setResult({ success: true, repoUrl: repo.url });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Push failed';
      if (errorMsg.includes('rejected') || errorMsg.includes('diverged') || errorMsg.includes('non-fast-forward')) {
        setResult({
          success: false,
          error: 'Push rejected: Remote has changes not in local. Enable "Force Push" to overwrite remote.',
        });
      } else {
        setResult({ success: false, error: errorMsg });
      }
      setStep('result');
    }
  };

  const handleCreateAndPush = async () => {
    if (!projectId || !newRepoName.trim()) return;

    setStep('processing');
    setError(null);

    try {
      const createResult = await githubApi.createRepo(projectId, token, {
        name: newRepoName.trim(),
        description: newRepoDescription.trim() || undefined,
        isPrivate,
      });

      await githubApi.push(projectId, { force: false, token, includeContext });

      setResult({ success: true, repoUrl: createResult.repository.url });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create repository';
      if (errorMsg.includes('already exists') || errorMsg.includes('name already')) {
        setResult({
          success: false,
          error: `Repository "${newRepoName}" already exists. Choose a different name or push to existing repo.`,
        });
      } else {
        setResult({ success: false, error: errorMsg });
      }
      setStep('result');
    }
  };

  const handlePushToCurrent = async () => {
    if (!projectId) return;

    setStep('processing');
    setError(null);

    try {
      await githubApi.push(projectId, { force: forcePush, token, includeContext });

      setResult({
        success: true,
        repoUrl: existingRemoteUrl.replace(/\.git$/, ''),
      });
      setStep('result');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Push failed';
      if (errorMsg.includes('rejected') || errorMsg.includes('diverged') || errorMsg.includes('non-fast-forward')) {
        setResult({
          success: false,
          error: 'Push rejected: Remote has changes not in local. Enable "Force Push" to overwrite remote.',
        });
      } else {
        setResult({ success: false, error: errorMsg });
      }
      setStep('result');
    }
  };

  const handleClose = useCallback(() => {
    setStep('token');
    setToken('');
    setRepos([]);
    setSearchQuery('');
    setSelectedRepo(null);
    setResult(null);
    setError(null);
    setShowBackupOnly(false);
    setNewRepoName('');
    setNewRepoDescription('');
    setIsPrivate(true);
    setForcePush(false);
    setPushMode('new');
    setImportMode('myRepos');
    setCloneUrl('');
    onClose();
  }, [onClose]);

  const handleComplete = () => {
    if (result?.success) {
      if (mode === 'import' && result.project && onImportComplete) {
        onImportComplete(result.project);
      } else if (mode === 'push' && result.repoUrl && onPushComplete) {
        onPushComplete(result.repoUrl);
      }
    }
    handleClose();
  };

  // ── Computed ──────────────────────────────────────────────────────────

  const filteredRepos = repos.filter(repo => {
    if (mode === 'import' && showBackupOnly && !repo.hasFluidFlowBackup) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    );
  });

  const sortedRepos = [...filteredRepos].sort((a, b) => {
    if (mode === 'import') {
      if (a.hasFluidFlowBackup && !b.hasFluidFlowBackup) return -1;
      if (!a.hasFluidFlowBackup && b.hasFluidFlowBackup) return 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const isImport = mode === 'import';
  const isPush = mode === 'push';

  return {
    // State
    step, setStep,
    token, setToken,
    tokenLoading, tokenVerifying,
    reposLoading,
    searchQuery, setSearchQuery,
    selectedRepo,
    result, setResult,
    error,
    showBackupOnly, setShowBackupOnly,
    newRepoName, setNewRepoName,
    newRepoDescription, setNewRepoDescription,
    isPrivate, setIsPrivate,
    forcePush, setForcePush,
    pushMode, setPushMode,
    includeContext, setIncludeContext,
    importMode, setImportMode,
    cloneUrl, setCloneUrl,
    // Computed
    sortedRepos, isImport, isPush,
    hasExistingRemote: hasExistingRemote ?? false,
    existingRemoteUrl,
    // Handlers
    handleTokenSubmit, handleImport, handleCloneByUrl,
    handlePushToExisting, handleCreateAndPush, handlePushToCurrent,
    handleClose, handleComplete, loadRepos,
  };
}

export type UseGitHubModalReturn = ReturnType<typeof useGitHubModal>;
