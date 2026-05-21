import React, { useState } from 'react';
import { X, Check, AlertTriangle, ExternalLink, Loader2, Plus, Link2 } from 'lucide-react';
import { Github } from '../icons/BrandIcons';
import { PushResult } from '../../types';

type PushMode = 'create' | 'existing';

interface GithubModalProps {
  isOpen: boolean;
  onClose: () => void;
  githubToken: string;
  onTokenChange: (token: string) => void;
  repoName: string;
  onRepoNameChange: (name: string) => void;
  onPush: () => void;
  isPushing: boolean;
  pushResult: PushResult | null;
  // New props for existing repo
  repoUrl?: string;
  onRepoUrlChange?: (url: string) => void;
  onPushToExisting?: (force?: boolean) => void;
  hasRemote?: boolean;
  currentRemoteUrl?: string;
}

export const GithubModal: React.FC<GithubModalProps> = ({
  isOpen,
  onClose,
  githubToken,
  onTokenChange,
  repoName,
  onRepoNameChange,
  onPush,
  isPushing,
  pushResult,
  repoUrl = '',
  onRepoUrlChange,
  onPushToExisting,
  hasRemote = false,
  currentRemoteUrl = '',
}) => {
  const [mode, setMode] = useState<PushMode>(hasRemote ? 'existing' : 'create');
  const [forcePush, setForcePush] = useState(false);

  if (!isOpen) return null;

  const canPushCreate = githubToken && repoName;
  const canPushExisting = githubToken && (repoUrl || currentRemoteUrl);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-background)' }}>
          <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
            <Github className="w-5 h-5" />
            Push to GitHub
          </h3>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            aria-label="Close GitHub modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector */}
        {!pushResult && (
          <div className="px-6 pt-4">
            <div className="flex p-1 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
              <button
                onClick={() => setMode('create')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: mode === 'create' ? 'var(--theme-glass-300)' : 'transparent',
                  color: mode === 'create' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                }}
              >
                <Plus className="w-4 h-4" />
                New Repo
              </button>
              <button
                onClick={() => setMode('existing')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  backgroundColor: mode === 'existing' ? 'var(--theme-glass-300)' : 'transparent',
                  color: mode === 'existing' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                }}
              >
                <Link2 className="w-4 h-4" />
                Existing Repo
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-4">
          {!pushResult ? (
            <>
              {/* GitHub Token - shared between modes */}
              <div>
                <label
                  htmlFor="github-token"
                  className="text-xs font-semibold uppercase block mb-1.5"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  GitHub Token (PAT)
                </label>
                <input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => onTokenChange(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                  Requires 'repo' scope.{' '}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=FluidFlow"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: 'var(--color-info)' }}
                  >
                    Create token
                  </a>
                </p>
              </div>

              {mode === 'create' ? (
                /* Create New Repo Mode */
                <div>
                  <label
                    htmlFor="repo-name"
                    className="text-xs font-semibold uppercase block mb-1.5"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Repository Name
                  </label>
                  <input
                    id="repo-name"
                    type="text"
                    value={repoName}
                    onChange={(e) => onRepoNameChange(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
                    placeholder="my-awesome-app"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                    A new private repository will be created on your GitHub account.
                  </p>
                </div>
              ) : (
                /* Push to Existing Repo Mode */
                <>
                  <div>
                    <label
                      htmlFor="repo-url"
                      className="text-xs font-semibold uppercase block mb-1.5"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      Repository URL
                    </label>
                    {currentRemoteUrl ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
                          <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                          <span className="text-sm truncate flex-1" style={{ color: 'var(--color-success)' }}>{currentRemoteUrl}</span>
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                          Remote already configured. Click "Push" to sync.
                        </p>
                      </div>
                    ) : (
                      <>
                        <input
                          id="repo-url"
                          type="text"
                          value={repoUrl}
                          onChange={(e) => onRepoUrlChange?.(e.target.value)}
                          placeholder="https://github.com/username/repo.git"
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                        />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                          Enter the URL of an existing GitHub repository.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Force Push Option */}
                  <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
                    <input
                      type="checkbox"
                      checked={forcePush}
                      onChange={(e) => setForcePush(e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-glass-200)' }}
                    />
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>Force Push</span>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>
                        Overwrite remote history. Use if histories have diverged.
                      </p>
                    </div>
                  </label>
                </>
              )}
            </>
          ) : pushResult.success ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold" style={{ color: 'var(--theme-text-primary)' }}>
                {mode === 'create' ? 'Repository Created!' : 'Push Successful!'}
              </h4>
              {pushResult.url && (
                <a
                  href={pushResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 underline underline-offset-4"
                  style={{ color: 'var(--color-info)' }}
                >
                  View on GitHub <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold" style={{ color: 'var(--theme-text-primary)' }}>Push Failed</h4>
              <p className="text-sm p-3 rounded font-mono" style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                {pushResult.error}
              </p>
              {pushResult.error?.includes('diverged') || pushResult.error?.includes('rejected') ? (
                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                  Try enabling "Force Push" to overwrite remote history.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="p-4 flex justify-end gap-3" style={{ backgroundColor: 'var(--theme-glass-100)', borderTop: '1px solid var(--theme-border-light)' }}>
          {!pushResult ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Cancel
              </button>
              {mode === 'create' ? (
                <button
                  onClick={onPush}
                  disabled={isPushing || !canPushCreate}
                  className="px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
                >
                  {isPushing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isPushing ? 'Creating...' : 'Create & Push'}
                </button>
              ) : (
                <button
                  onClick={() => onPushToExisting?.(forcePush)}
                  disabled={isPushing || !canPushExisting}
                  className="px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  style={{
                    backgroundColor: forcePush ? 'var(--color-warning)' : 'var(--theme-accent)',
                    color: forcePush ? 'black' : 'white'
                  }}
                >
                  {isPushing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isPushing ? 'Pushing...' : forcePush ? 'Force Push' : 'Push'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
