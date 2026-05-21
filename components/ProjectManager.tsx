import React, { useState, useEffect } from 'react';
import {
  FolderOpen, Plus, Trash2, Copy, Clock, GitBranch, CloudOff, RefreshCw,
  Search, MoreVertical, Check, AlertCircle, FolderPlus, Loader2, Github
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';
import { BaseModal, ConfirmModal } from './shared/BaseModal';
import { GitHubImportModal } from './GitHubImportModal';

interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectMeta[];
  currentProjectId?: string;
  isLoading: boolean;
  isServerOnline: boolean;
  onCreateProject: (name?: string, description?: string) => Promise<void>;
  onOpenProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  isLoading,
  isServerOnline,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showGitHubImport, setShowGitHubImport] = useState(false);

  // Handle GitHub import complete
  const handleGitHubImportComplete = async (project: ProjectMeta) => {
    setShowGitHubImport(false);
    // Refresh project list and open the imported project
    await onRefresh();
    await onOpenProject(project.id);
    onClose();
  };

  // Filter projects
  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Handle create project
  const handleCreate = async () => {
    if (!newProjectName.trim()) return;

    setActionLoading('create');
    try {
      await onCreateProject(newProjectName.trim(), newProjectDescription.trim() || undefined);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreating(false);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open project
  const handleOpen = async (id: string) => {
    setActionLoading(id);
    try {
      await onOpenProject(id);
      onClose();
    } finally {
      setActionLoading(null);
    }
  };

  // Handle delete project
  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await onDeleteProject(id);
      setDeleteConfirmId(null);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle duplicate project
  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      await onDuplicateProject(id);
      setMenuOpenId(null);
    } finally {
      setActionLoading(null);
    }
  };

  // Close menu on outside click
  useEffect((): (() => void) | undefined => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
    return undefined;
  }, [menuOpenId]);

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        icon={<FolderOpen className="w-5 h-5" style={{ color: 'var(--color-info)' }} />}
        size="lg"
        maxHeight="max-h-[80vh]"
        zIndex="z-50"
      >

        {/* Search and Create */}
        <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--theme-border-subtle)' }}>
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Import from GitHub Button */}
          <button
            onClick={() => setShowGitHubImport(true)}
            disabled={!isServerOnline}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--theme-glass-300)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
            title="Import from GitHub"
          >
            <Github className="w-4 h-4" />
            Import
          </button>

          {/* New Project Button */}
          <button
            onClick={() => setIsCreating(true)}
            disabled={!isServerOnline}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Create Project Form */}
        {isCreating && (
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg mt-0.5" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
                <FolderPlus className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              </div>
              <div className="flex-1 space-y-3">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <input
                  type="text"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newProjectName.trim() || actionLoading === 'create'}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-on-accent)' }}
                  >
                    {actionLoading === 'create' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm transition-colors"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!isServerOnline ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-muted)' }}>
              <CloudOff className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Server is offline</p>
              <p className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>Check if backend is running on port 3101</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-info)' }} />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-muted)' }}>
              <FolderOpen className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                {searchQuery ? 'Try a different search' : 'Create your first project to get started'}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="group relative flex items-center gap-4 p-4 rounded-xl transition-all cursor-pointer"
                  style={{
                    backgroundColor: currentProjectId === project.id ? 'var(--color-info-subtle)' : 'var(--theme-glass-100)',
                    border: currentProjectId === project.id ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-subtle)',
                  }}
                  onClick={() => handleOpen(project.id)}
                >
                  {/* Icon */}
                  <div
                    className="p-2.5 rounded-xl"
                    style={{
                      backgroundColor: currentProjectId === project.id ? 'var(--color-info-subtle)' : 'var(--theme-glass-200)',
                    }}
                  >
                    <FolderOpen
                      className="w-5 h-5"
                      style={{ color: currentProjectId === project.id ? 'var(--color-info)' : 'var(--theme-text-muted)' }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                        {project.name}
                      </h3>
                      {currentProjectId === project.id && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                          Current
                        </span>
                      )}
                      {project.gitInitialized && (
                        <GitBranch className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
                      )}
                    </div>
                    {project.description && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                        <Clock className="w-3 h-3" />
                        {formatDate(project.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Loading */}
                  {actionLoading === project.id && (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-info)' }} />
                  )}

                  {/* Actions Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === project.id ? null : project.id);
                      }}
                      className="p-2 opacity-0 group-hover:opacity-100 rounded-lg transition-all"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuOpenId === project.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl overflow-hidden z-10"
                        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDuplicate(project.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                          style={{ color: 'var(--theme-text-secondary)' }}
                        >
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmId(project.id);
                            setMenuOpenId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                          style={{ color: 'var(--color-error)' }}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </BaseModal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Delete Project?"
        message="This will permanently delete the project and all its files. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        icon={<AlertCircle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />}
        isLoading={!!deleteConfirmId && actionLoading === deleteConfirmId}
      />

      {/* GitHub Import Modal */}
      <GitHubImportModal
        isOpen={showGitHubImport}
        onClose={() => setShowGitHubImport(false)}
        onImportComplete={handleGitHubImportComplete}
      />
    </>
  );
};

export default ProjectManager;
