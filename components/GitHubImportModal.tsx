/**
 * GitHub Import Modal
 *
 * Allows users to import projects from their GitHub repositories,
 * including restoration of FluidFlow metadata (.fluidflow/ folder).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Loader2, Check, AlertTriangle, Lock, Globe,
  Clock, RefreshCw, Download, FolderGit, ExternalLink, ChevronRight
} from 'lucide-react';
import { Github } from './icons/BrandIcons';
import { githubApi } from '@/services/api/github';
import { settingsApi } from '@/services/api/settings';
import type { ProjectMeta } from '@/services/projectApi';

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  cloneUrl: string;
  private: boolean;
  updatedAt: string;
  defaultBranch: string;
  hasFluidFlowBackup: boolean;
}

interface ImportResult {
  success: boolean;
  project?: ProjectMeta;
  restored?: { metadata: boolean; context: boolean };
  error?: string;
}

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (project: ProjectMeta) => void;
}

type ModalStep = 'token' | 'repos' | 'importing' | 'result';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const GitHubImportModal: React.FC<GitHubImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [step, setStep] = useState<ModalStep>('token');
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenVerifying, setTokenVerifying] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBackupOnly, setShowBackupOnly] = useState(false);

  const loadRepos = useCallback(async (tokenToUse: string) => {
    setReposLoading(true);
    setError(null);
    try {
      const result = await githubApi.listRepos(tokenToUse);
      setRepos(result.repos);
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
      const result = await githubApi.verifyToken(tokenToVerify);
      if (result.valid) {
        await loadRepos(tokenToVerify);
        setStep('repos');
      } else {
        setError(result.error || 'Invalid token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token');
    } finally {
      setTokenVerifying(false);
      setTokenLoading(false);
    }
  }, [loadRepos]);

  // Load saved token on mount
  useEffect(() => {
    if (isOpen) {
      const loadSavedToken = async () => {
        setTokenLoading(true);
        try {
          const result = await settingsApi.getBackupToken();
          if (result.token) {
            setToken(result.token);
            // Auto-verify and proceed if token exists
            verifyAndProceed(result.token);
          } else {
            setTokenLoading(false);
          }
        } catch {
          setTokenLoading(false);
        }
      };
      loadSavedToken();
    }
  }, [isOpen, verifyAndProceed]);

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    verifyAndProceed(token.trim());
  };

  const handleImport = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setStep('importing');
    setError(null);

    try {
      const result = await githubApi.importProject({
        url: repo.cloneUrl,
        token: repo.private ? token : undefined,
        branch: repo.hasFluidFlowBackup ? 'backup/auto' : repo.defaultBranch,
        name: repo.name,
      });

      setImportResult({
        success: true,
        project: result.project,
        restored: result.restored,
      });
      setStep('result');
    } catch (err) {
      setImportResult({
        success: false,
        error: err instanceof Error ? err.message : 'Import failed',
      });
      setStep('result');
    }
  };

  const handleClose = useCallback(() => {
    // Reset state
    setStep('token');
    setToken('');
    setRepos([]);
    setSearchQuery('');
    setSelectedRepo(null);
    setImportResult(null);
    setError(null);
    setShowBackupOnly(false);
    onClose();
  }, [onClose]);

  const handleComplete = () => {
    if (importResult?.project) {
      onImportComplete(importResult.project);
    }
    handleClose();
  };

  // Filter repos
  const filteredRepos = repos.filter(repo => {
    if (showBackupOnly && !repo.hasFluidFlowBackup) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.fullName.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    );
  });

  // Sort: FluidFlow backups first, then by update time
  const sortedRepos = [...filteredRepos].sort((a, b) => {
    if (a.hasFluidFlowBackup && !b.hasFluidFlowBackup) return -1;
    if (!a.hasFluidFlowBackup && b.hasFluidFlowBackup) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-modal-overlay)' }} role="dialog" aria-modal="true" aria-label="GitHub import">
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="p-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-background)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-300)' }}>
              <Github className="w-5 h-5" style={{ color: 'var(--theme-text-primary)' }} />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: 'var(--theme-text-primary)' }}>Import from GitHub</h3>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                {step === 'token' && 'Enter your GitHub token to access repositories'}
                {step === 'repos' && 'Select a repository to import'}
                {step === 'importing' && 'Importing project...'}
                {step === 'result' && (importResult?.success ? 'Import complete!' : 'Import failed')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Token Input Step */}
          {step === 'token' && (
            <div className="p-6 space-y-4">
              {tokenLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-info)' }} />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                      GitHub Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full rounded-lg px-4 py-3 text-sm outline-none"
                      style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                      onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
                      autoFocus
                    />
                    <p className="text-xs mt-2" style={{ color: 'var(--theme-text-dim)' }}>
                      Requires 'repo' scope for private repositories.{' '}
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=FluidFlow"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: 'var(--color-info)' }}
                      >
                        Create token <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                      <FolderGit className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                      FluidFlow Backup Detection
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                      Repositories with a <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-300)' }}>backup/auto</code> branch
                      will be highlighted. These contain FluidFlow metadata that will be automatically restored,
                      including your project settings and conversation context.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Repository List Step */}
          {step === 'repos' && (
            <>
              {/* Search and Filter Bar */}
              <div className="px-6 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search repositories..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                    autoFocus
                  />
                </div>

                <button
                  onClick={() => setShowBackupOnly(!showBackupOnly)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: showBackupOnly ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
                    color: showBackupOnly ? 'var(--color-success)' : 'var(--theme-text-muted)',
                    border: showBackupOnly ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border)'
                  }}
                >
                  <FolderGit className="w-4 h-4" />
                  FluidFlow Only
                </button>

                <button
                  onClick={() => loadRepos(token)}
                  disabled={reposLoading}
                  className="p-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ color: 'var(--theme-text-muted)' }}
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${reposLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Repository List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {reposLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-info)' }} />
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-muted)' }}>
                    <AlertTriangle className="w-12 h-12 mb-3 opacity-50" style={{ color: 'var(--color-error)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
                    <button
                      onClick={() => loadRepos(token)}
                      className="mt-4 px-4 py-2 rounded-lg text-sm transition-colors"
                      style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
                    >
                      Try Again
                    </button>
                  </div>
                ) : sortedRepos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-muted)' }}>
                    <Github className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm">
                      {searchQuery ? 'No repositories found' : 'No repositories available'}
                    </p>
                    {showBackupOnly && (
                      <p className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                        Try disabling "FluidFlow Only" filter
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {sortedRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => handleImport(repo)}
                        className="w-full group flex items-center gap-4 p-4 rounded-xl border transition-all text-left"
                        style={{
                          backgroundColor: repo.hasFluidFlowBackup ? 'var(--color-success-subtle)' : 'var(--theme-glass-100)',
                          borderColor: repo.hasFluidFlowBackup ? 'var(--color-success-border)' : 'var(--theme-border-light)'
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="p-2.5 rounded-xl"
                          style={{
                            backgroundColor: repo.hasFluidFlowBackup ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)'
                          }}
                        >
                          {repo.hasFluidFlowBackup ? (
                            <FolderGit className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
                          ) : (
                            <Github className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                              {repo.name}
                            </h3>
                            {repo.private ? (
                              <span title="Private"><Lock className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} /></span>
                            ) : (
                              <span title="Public"><Globe className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-dim)' }} /></span>
                            )}
                            {repo.hasFluidFlowBackup && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded font-medium" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                                FluidFlow
                              </span>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                              <Clock className="w-3 h-3" />
                              {formatDate(repo.updatedAt)}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                              {repo.fullName}
                            </span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-text-muted)' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Importing Step */}
          {step === 'importing' && selectedRepo && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
                  <Download className="w-8 h-8" style={{ color: 'var(--color-info)' }} />
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-info)' }} />
                </div>
              </div>
              <h4 className="mt-6 text-lg font-medium" style={{ color: 'var(--theme-text-primary)' }}>Importing {selectedRepo.name}</h4>
              <p className="mt-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                {selectedRepo.hasFluidFlowBackup
                  ? 'Cloning repository and restoring FluidFlow metadata...'
                  : 'Cloning repository...'}
              </p>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && importResult && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              {importResult.success ? (
                <>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
                    <Check className="w-8 h-8" style={{ color: 'var(--color-success)' }} />
                  </div>
                  <h4 className="mt-6 text-lg font-medium" style={{ color: 'var(--theme-text-primary)' }}>Import Successful!</h4>
                  <p className="mt-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Project "{importResult.project?.name}" has been imported.
                  </p>

                  {/* Restoration Status */}
                  {importResult.restored && (
                    <div className="mt-6 w-full max-w-sm space-y-2">
                      <div
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{
                          backgroundColor: importResult.restored.metadata ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
                          border: importResult.restored.metadata ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-light)'
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: importResult.restored.metadata ? 'var(--color-success-subtle)' : 'var(--theme-glass-300)' }}
                        >
                          {importResult.restored.metadata ? (
                            <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                          ) : (
                            <X className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>Project Metadata</p>
                          <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                            {importResult.restored.metadata ? 'Restored from backup' : 'Not found'}
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{
                          backgroundColor: importResult.restored.context ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
                          border: importResult.restored.context ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-light)'
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: importResult.restored.context ? 'var(--color-success-subtle)' : 'var(--theme-glass-300)' }}
                        >
                          {importResult.restored.context ? (
                            <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                          ) : (
                            <X className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>Conversation Context</p>
                          <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                            {importResult.restored.context ? 'Restored from backup' : 'Not found'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-error-subtle)' }}>
                    <AlertTriangle className="w-8 h-8" style={{ color: 'var(--color-error)' }} />
                  </div>
                  <h4 className="mt-6 text-lg font-medium" style={{ color: 'var(--theme-text-primary)' }}>Import Failed</h4>
                  <p className="mt-2 text-sm p-3 rounded-lg max-w-md text-center" style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                    {importResult.error}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex justify-between items-center shrink-0" style={{ backgroundColor: 'var(--theme-glass-100)', borderTop: '1px solid var(--theme-border-light)' }}>
          {step === 'repos' && (
            <button
              onClick={() => {
                setStep('token');
                setToken('');
              }}
              className="px-4 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Change Token
            </button>
          )}
          {step !== 'repos' && <div />}

          <div className="flex gap-3">
            {step === 'token' && !tokenLoading && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTokenSubmit}
                  disabled={!token.trim() || tokenVerifying}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
                >
                  {tokenVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  Continue
                </button>
              </>
            )}

            {step === 'repos' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Cancel
              </button>
            )}

            {step === 'result' && (
              <button
                onClick={importResult?.success ? handleComplete : handleClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: importResult?.success ? 'var(--color-success)' : 'var(--theme-glass-300)',
                  color: importResult?.success ? 'white' : 'var(--theme-text-primary)'
                }}
              >
                {importResult?.success ? 'Open Project' : 'Close'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GitHubImportModal;
