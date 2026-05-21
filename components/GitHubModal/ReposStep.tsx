import React from 'react';
import {
  Search, Loader2, Check, AlertTriangle, Lock, Globe,
  Clock, RefreshCw, Download, FolderGit, ChevronRight,
  Plus, Link2,
} from 'lucide-react';
import { Github } from '../icons/BrandIcons';
import { formatDate } from './utils';
import type { GitHubRepo } from './types';
import type { UseGitHubModalReturn } from './useGitHubModal';

type Props = Pick<UseGitHubModalReturn,
  | 'isPush' | 'isImport' | 'sortedRepos' | 'searchQuery' | 'setSearchQuery'
  | 'showBackupOnly' | 'setShowBackupOnly' | 'reposLoading' | 'error'
  | 'token' | 'loadRepos'
  // Push-specific
  | 'pushMode' | 'setPushMode' | 'hasExistingRemote' | 'existingRemoteUrl'
  | 'handlePushToCurrent' | 'forcePush' | 'setForcePush' | 'includeContext' | 'setIncludeContext'
  | 'newRepoName' | 'setNewRepoName' | 'newRepoDescription' | 'setNewRepoDescription'
  | 'isPrivate' | 'setIsPrivate' | 'handleCreateAndPush'
  // Import-specific
  | 'importMode' | 'setImportMode' | 'cloneUrl' | 'setCloneUrl' | 'handleCloneByUrl'
  | 'handleImport' | 'handlePushToExisting'
>;

export const ReposStep: React.FC<Props> = (props) => {
  const {
    isPush, isImport, sortedRepos, searchQuery, setSearchQuery,
    showBackupOnly, setShowBackupOnly, reposLoading, error,
    token, loadRepos,
    pushMode, setPushMode, hasExistingRemote, existingRemoteUrl,
    handlePushToCurrent, forcePush, setForcePush, includeContext, setIncludeContext,
    newRepoName, setNewRepoName, newRepoDescription, setNewRepoDescription,
    isPrivate, setIsPrivate, handleCreateAndPush,
    importMode, setImportMode, cloneUrl, setCloneUrl, handleCloneByUrl,
    handleImport, handlePushToExisting,
  } = props;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
      {/* Push Mode Selector */}
      {isPush && (
        <PushModeSelector
          pushMode={pushMode} setPushMode={setPushMode}
          hasExistingRemote={hasExistingRemote} existingRemoteUrl={existingRemoteUrl}
          handlePushToCurrent={handlePushToCurrent}
          forcePush={forcePush} setForcePush={setForcePush}
          includeContext={includeContext} setIncludeContext={setIncludeContext}
        />
      )}

      {/* New Repo Form (for push mode) */}
      {isPush && pushMode === 'new' && (
        <NewRepoForm
          newRepoName={newRepoName} setNewRepoName={setNewRepoName}
          newRepoDescription={newRepoDescription} setNewRepoDescription={setNewRepoDescription}
          isPrivate={isPrivate} setIsPrivate={setIsPrivate}
          includeContext={includeContext} setIncludeContext={setIncludeContext}
          handleCreateAndPush={handleCreateAndPush}
        />
      )}

      {/* Import Mode Toggle */}
      {isImport && (
        <ImportModeToggle importMode={importMode} setImportMode={setImportMode} />
      )}

      {/* Clone by URL Section */}
      {isImport && importMode === 'url' && (
        <CloneByUrlSection
          cloneUrl={cloneUrl} setCloneUrl={setCloneUrl}
          handleCloneByUrl={handleCloneByUrl}
        />
      )}

      {/* Search and Repository List (My Repos mode) */}
      {(!isImport || importMode === 'myRepos') && (
        <>
          <SearchBar
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            isImport={isImport} showBackupOnly={showBackupOnly}
            setShowBackupOnly={setShowBackupOnly}
            reposLoading={reposLoading} loadRepos={() => loadRepos(token)}
          />
          <RepoList
            repos={sortedRepos} reposLoading={reposLoading}
            error={error} searchQuery={searchQuery}
            showBackupOnly={showBackupOnly} isImport={isImport} isPush={isPush}
            loadRepos={() => loadRepos(token)}
            onRepoClick={(repo) => isImport ? handleImport(repo) : handlePushToExisting(repo)}
          />
        </>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────

const PushModeSelector: React.FC<{
  pushMode: 'new' | 'existing';
  setPushMode: (mode: 'new' | 'existing') => void;
  hasExistingRemote: boolean;
  existingRemoteUrl: string;
  handlePushToCurrent: () => void;
  forcePush: boolean;
  setForcePush: (force: boolean) => void;
  includeContext: boolean;
  setIncludeContext: (include: boolean) => void;
}> = ({ pushMode, setPushMode, hasExistingRemote, existingRemoteUrl, handlePushToCurrent, forcePush, setForcePush, includeContext, setIncludeContext }) => (
  <div className="px-6 pt-4 pb-2" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
    <div className="flex p-1 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
      <button
        onClick={() => setPushMode('new')}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all"
        style={{
          backgroundColor: pushMode === 'new' ? 'var(--theme-surface)' : 'transparent',
          color: pushMode === 'new' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
        }}
      >
        <Plus className="w-4 h-4" />
        New Repository
      </button>
      <button
        onClick={() => setPushMode('existing')}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all"
        style={{
          backgroundColor: pushMode === 'existing' ? 'var(--theme-surface)' : 'transparent',
          color: pushMode === 'existing' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
        }}
      >
        <Link2 className="w-4 h-4" />
        Existing Repository
      </button>
    </div>

    {hasExistingRemote && pushMode === 'existing' && (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
        <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--color-success)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>Remote configured</p>
          <p className="text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>{existingRemoteUrl}</p>
        </div>
        <button
          onClick={handlePushToCurrent}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
        >
          Push Now
        </button>
      </div>
    )}

    {pushMode === 'existing' && (
      <label className="mt-3 flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
        <input type="checkbox" checked={forcePush} onChange={(e) => setForcePush(e.target.checked)} className="w-4 h-4 rounded" />
        <div>
          <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>Force Push</span>
          <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
            Overwrite remote history. Use if histories have diverged.
          </p>
        </div>
      </label>
    )}

    <label className="mt-3 flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
      <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} className="w-4 h-4 rounded" />
      <div>
        <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>Include Conversation History</span>
        <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
          Include AI chat history in .fluidflow/ folder. Useful for backup/restore.
        </p>
      </div>
    </label>
  </div>
);

const NewRepoForm: React.FC<{
  newRepoName: string;
  setNewRepoName: (name: string) => void;
  newRepoDescription: string;
  setNewRepoDescription: (desc: string) => void;
  isPrivate: boolean;
  setIsPrivate: (priv: boolean) => void;
  includeContext: boolean;
  setIncludeContext: (include: boolean) => void;
  handleCreateAndPush: () => void;
}> = ({ newRepoName, setNewRepoName, newRepoDescription, setNewRepoDescription, isPrivate, setIsPrivate, includeContext, setIncludeContext, handleCreateAndPush }) => (
  <div className="px-6 py-4 space-y-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
    <div>
      <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
        Repository Name
      </label>
      <input
        type="text"
        value={newRepoName}
        onChange={(e) => setNewRepoName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
        placeholder="my-awesome-app"
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
      />
    </div>

    <div>
      <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
        Description (Optional)
      </label>
      <input
        type="text"
        value={newRepoDescription}
        onChange={(e) => setNewRepoDescription(e.target.value)}
        placeholder="A project created with FluidFlow"
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
      />
    </div>

    <div className="flex items-center gap-4">
      <button
        onClick={() => setIsPrivate(true)}
        className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
        style={{
          backgroundColor: isPrivate ? 'var(--color-warning-subtle)' : 'var(--theme-glass-200)',
          border: isPrivate ? '1px solid var(--color-warning-border)' : '1px solid var(--theme-border-light)',
          color: isPrivate ? 'var(--color-warning)' : 'var(--theme-text-muted)'
        }}
      >
        <Lock className="w-4 h-4" />
        <span className="text-sm font-medium">Private</span>
      </button>
      <button
        onClick={() => setIsPrivate(false)}
        className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
        style={{
          backgroundColor: !isPrivate ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
          border: !isPrivate ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-light)',
          color: !isPrivate ? 'var(--color-success)' : 'var(--theme-text-muted)'
        }}
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">Public</span>
      </button>
    </div>

    <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
      <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} className="w-4 h-4 rounded" />
      <div>
        <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>Include Conversation History</span>
        <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
          Include AI chat history in .fluidflow/ folder. {!isPrivate && <span style={{ color: 'var(--color-warning)' }}>Warning: Public repo!</span>}
        </p>
      </div>
    </label>

    <button
      onClick={handleCreateAndPush}
      disabled={!newRepoName.trim()}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
      style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
    >
      <Github className="w-4 h-4" />
      Create Repository & Push
    </button>

    <p className="text-center text-xs" style={{ color: 'var(--theme-text-dim)' }}>
      Or select an existing repository below
    </p>
  </div>
);

const ImportModeToggle: React.FC<{
  importMode: 'myRepos' | 'url';
  setImportMode: (mode: 'myRepos' | 'url') => void;
}> = ({ importMode, setImportMode }) => (
  <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
    <div className="flex items-center gap-2 p-1 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
      <button
        onClick={() => setImportMode('myRepos')}
        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all"
        style={{
          backgroundColor: importMode === 'myRepos' ? 'var(--theme-accent)' : 'transparent',
          color: importMode === 'myRepos' ? 'var(--theme-text-on-accent)' : 'var(--theme-text-muted)'
        }}
      >
        <FolderGit className="w-4 h-4" />
        My Repositories
      </button>
      <button
        onClick={() => setImportMode('url')}
        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all"
        style={{
          backgroundColor: importMode === 'url' ? 'var(--theme-accent)' : 'transparent',
          color: importMode === 'url' ? 'var(--theme-text-on-accent)' : 'var(--theme-text-muted)'
        }}
      >
        <Link2 className="w-4 h-4" />
        Clone URL
      </button>
    </div>
  </div>
);

const CloneByUrlSection: React.FC<{
  cloneUrl: string;
  setCloneUrl: (url: string) => void;
  handleCloneByUrl: () => void;
}> = ({ cloneUrl, setCloneUrl, handleCloneByUrl }) => (
  <div className="px-6 py-4 space-y-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
    <div>
      <label className="text-xs font-semibold uppercase block mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
        GitHub Repository URL
      </label>
      <input
        type="text"
        value={cloneUrl}
        onChange={(e) => setCloneUrl(e.target.value)}
        placeholder="https://github.com/username/repository"
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
        style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
      />
      <p className="mt-1.5 text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
        Paste any public GitHub repository URL. For private repos, enter your token first.
      </p>
    </div>

    <button
      onClick={handleCloneByUrl}
      disabled={!cloneUrl.trim()}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
      style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
    >
      <Download className="w-4 h-4" />
      Clone Repository
    </button>

    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
      <FolderGit className="w-5 h-5 shrink-0" style={{ color: 'var(--color-success)' }} />
      <p className="text-xs" style={{ color: 'var(--color-success)' }}>
        If the repo contains <code className="px-1 rounded" style={{ backgroundColor: 'var(--theme-glass-300)' }}>.fluidflow/</code> folder, project metadata and conversation history will be restored automatically.
      </p>
    </div>
  </div>
);

const SearchBar: React.FC<{
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isImport: boolean;
  showBackupOnly: boolean;
  setShowBackupOnly: (show: boolean) => void;
  reposLoading: boolean;
  loadRepos: () => void;
}> = ({ searchQuery, setSearchQuery, isImport, showBackupOnly, setShowBackupOnly, reposLoading, loadRepos }) => (
  <div className="px-6 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
    <div className="flex-1 relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search repositories..."
        className="w-full pl-10 pr-4 py-2 rounded-lg text-sm outline-none transition-colors"
        style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
      />
    </div>

    {isImport && (
      <button
        onClick={() => setShowBackupOnly(!showBackupOnly)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
        style={{
          backgroundColor: showBackupOnly ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
          color: showBackupOnly ? 'var(--color-success)' : 'var(--theme-text-muted)',
          border: showBackupOnly ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-light)'
        }}
      >
        <FolderGit className="w-4 h-4" />
        FluidFlow Only
      </button>
    )}

    <button
      onClick={loadRepos}
      disabled={reposLoading}
      className="p-2 rounded-lg transition-colors disabled:opacity-50"
      style={{ color: 'var(--theme-text-muted)' }}
      title="Refresh"
    >
      <RefreshCw className={`w-4 h-4 ${reposLoading ? 'animate-spin' : ''}`} />
    </button>
  </div>
);

const RepoList: React.FC<{
  repos: GitHubRepo[];
  reposLoading: boolean;
  error: string | null;
  searchQuery: string;
  showBackupOnly: boolean;
  isImport: boolean;
  isPush: boolean;
  loadRepos: () => void;
  onRepoClick: (repo: GitHubRepo) => void;
}> = ({ repos, reposLoading, error, searchQuery, showBackupOnly, isImport, isPush, loadRepos, onRepoClick }) => (
  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
    {reposLoading ? (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--theme-accent)' }} />
      </div>
    ) : error ? (
      <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-muted)' }}>
        <AlertTriangle className="w-12 h-12 mb-3 opacity-50" style={{ color: 'var(--color-error)' }} />
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
        <button
          onClick={loadRepos}
          className="mt-4 px-4 py-2 rounded-lg text-sm transition-colors"
          style={{ backgroundColor: 'var(--theme-glass-200)' }}
        >
          Try Again
        </button>
      </div>
    ) : repos.length === 0 ? (
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
        {repos.map((repo) => (
          <RepoCard key={repo.id} repo={repo} isImport={isImport} isPush={isPush} onClick={() => onRepoClick(repo)} />
        ))}
      </div>
    )}
  </div>
);

const RepoCard: React.FC<{
  repo: GitHubRepo;
  isImport: boolean;
  isPush: boolean;
  onClick: () => void;
}> = ({ repo, isImport, isPush, onClick }) => (
  <button
    onClick={onClick}
    className="w-full group flex items-center gap-4 p-4 rounded-xl transition-all text-left"
    style={{
      backgroundColor: repo.hasFluidFlowBackup && isImport ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
      border: repo.hasFluidFlowBackup && isImport ? '1px solid var(--color-success-border)' : '1px solid var(--theme-border-light)'
    }}
  >
    <div className="p-2.5 rounded-xl" style={{
      backgroundColor: repo.hasFluidFlowBackup && isImport ? 'var(--color-success-subtle)' : 'var(--theme-glass-300)'
    }}>
      {repo.hasFluidFlowBackup && isImport ? (
        <FolderGit className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
      ) : (
        <Github className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
      )}
    </div>

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
        {repo.hasFluidFlowBackup && isImport && (
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

    <div className="flex items-center gap-2">
      {isPush && (
        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-text-dim)' }}>
          Push here
        </span>
      )}
      <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--theme-text-dim)' }} />
    </div>
  </button>
);
