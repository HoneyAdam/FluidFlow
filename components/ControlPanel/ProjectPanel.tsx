import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, ChevronUp, ChevronDown, Cloud, CloudOff, Plus,
  Clock, GitBranch, Check, Loader2, RefreshCw, X, Search, Trash2, Copy,
  AlertCircle, FolderPlus, MoreVertical, Save, FolderInput, AlertTriangle, LayoutTemplate
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';
import type { FileSystem } from '@/types';
import { ProjectTemplateSelector } from './ProjectTemplateSelector';

interface GitStatus {
  initialized: boolean;
  branch?: string;
  clean?: boolean;
}

interface ProjectPanelProps {
  currentProject: ProjectMeta | null;
  projects: ProjectMeta[];
  isServerOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isLoadingProjects: boolean;
  onCreateProject: (name?: string, description?: string, initialFiles?: FileSystem) => Promise<ProjectMeta | null>;
  onOpenProject: (id: string) => Promise<boolean>;
  onDeleteProject: (id: string) => Promise<boolean>;
  onDuplicateProject: (id: string) => Promise<ProjectMeta | null>;
  onRefreshProjects: () => Promise<void>;
  onCloseProject: () => void;
  // Git props for status display
  gitStatus?: GitStatus | null;
  hasUncommittedChanges?: boolean;
  onOpenGitTab?: () => void;
  // Auto-commit feature
  autoCommitEnabled?: boolean;
  onToggleAutoCommit?: () => void;
  isAutoCommitting?: boolean;
  // Unsaved work handling
  hasUnsavedWork?: boolean;
  fileCount?: number;
  onSaveCurrentAsProject?: (name: string, description?: string) => Promise<ProjectMeta | null>;
  // Props for modal exclusivity
  shouldClose?: boolean;
  onClosed?: () => void;
  onOpened?: () => void;
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

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
  currentProject,
  projects,
  isServerOnline,
  isSyncing,
  lastSyncedAt,
  isLoadingProjects,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefreshProjects,
  onCloseProject,
  gitStatus,
  hasUncommittedChanges,
  onOpenGitTab,
  autoCommitEnabled,
  onToggleAutoCommit,
  isAutoCommitting,
  hasUnsavedWork,
  fileCount = 0,
  onSaveCurrentAsProject,
  shouldClose,
  onClosed,
  onOpened
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Unsaved work modal state
  const [unsavedWorkModal, setUnsavedWorkModal] = useState<{
    isOpen: boolean;
    targetProjectId: string | null;
    targetProjectName?: string;
  }>({ isOpen: false, targetProjectId: null });
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsDescription, setSaveAsDescription] = useState('');

  // Handle modal exclusivity - close when shouldClose is true
  useEffect(() => {
    if (shouldClose && isOpen) {
      setIsOpen(false);
      onClosed?.();
    }
  }, [shouldClose, isOpen, onClosed]);

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

  // Handle open project - check for unsaved work first
  const handleOpen = async (id: string) => {
    // If there's unsaved work and no current project, show the modal
    if (hasUnsavedWork && !currentProject) {
      const targetProject = projects.find(p => p.id === id);
      setUnsavedWorkModal({
        isOpen: true,
        targetProjectId: id,
        targetProjectName: targetProject?.name
      });
      return;
    }

    // Otherwise, open directly
    await doOpenProject(id);
  };

  // Actually open the project
  const doOpenProject = async (id: string) => {
    setActionLoading(id);
    try {
      await onOpenProject(id);
      setIsOpen(false);
      setUnsavedWorkModal({ isOpen: false, targetProjectId: null });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle save current work as new project then open target
  const handleSaveAsNewThenOpen = async () => {
    if (!saveAsName.trim() || !onSaveCurrentAsProject) return;

    setActionLoading('save-as-new');
    try {
      await onSaveCurrentAsProject(saveAsName.trim(), saveAsDescription.trim() || undefined);
      setSaveAsName('');
      setSaveAsDescription('');

      // Now open the target project if one was selected
      if (unsavedWorkModal.targetProjectId) {
        await doOpenProject(unsavedWorkModal.targetProjectId);
      } else {
        setUnsavedWorkModal({ isOpen: false, targetProjectId: null });
        setIsOpen(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open anyway (discard unsaved work)
  const handleOpenAnyway = async () => {
    if (unsavedWorkModal.targetProjectId) {
      await doOpenProject(unsavedWorkModal.targetProjectId);
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

  return (
    <div className="pt-2 flex-none" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
      {/* Main Project Button */}
      <button
        onClick={() => {
          const newOpenState = !isOpen;
          setIsOpen(newOpenState);
          if (newOpenState) {
            onOpened?.();
          }
        }}
        className="flex items-center justify-between w-full p-2 transition-colors rounded-lg"
        style={{ color: 'var(--theme-text-muted)' }}
        aria-expanded={isOpen}
        aria-controls="project-panel"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="w-4 h-4" />
          <span className="truncate max-w-[120px]">
            {currentProject?.name || 'No Project'}
          </span>
          {/* Sync indicator */}
          {currentProject && (
            <span className="flex items-center">
              {isSyncing ? (
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-info)' }} />
              ) : lastSyncedAt ? (
                <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
              ) : null}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Server status */}
          {isServerOnline ? (
            <Cloud className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
          ) : (
            <CloudOff className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />
          )}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Git Status Row - shown below project button when project is selected */}
      {currentProject && (
        <div className="flex items-center justify-between px-2 py-1.5">
          {/* Git Branch & Uncommitted Status */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenGitTab?.();
            }}
            className="flex items-center gap-2 text-xs rounded px-1.5 py-0.5 transition-colors"
          >
            <GitBranch
              className="w-3.5 h-3.5"
              style={{
                color: gitStatus?.initialized
                  ? hasUncommittedChanges
                    ? 'var(--color-warning)'
                    : 'var(--color-success)'
                  : 'var(--theme-text-muted)'
              }}
            />
            {gitStatus?.initialized ? (
              <span style={{ color: hasUncommittedChanges ? 'var(--color-warning)' : 'var(--theme-text-muted)' }}>
                {gitStatus.branch || 'main'}
              </span>
            ) : (
              <span style={{ color: 'var(--theme-text-muted)' }}>No git</span>
            )}
          </button>

          {/* Auto-Commit Toggle - only show when git is initialized */}
          {gitStatus?.initialized && onToggleAutoCommit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleAutoCommit();
              }}
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] transition-colors"
              style={{
                backgroundColor: autoCommitEnabled ? 'var(--color-success-subtle)' : 'var(--theme-glass-200)',
                color: autoCommitEnabled ? 'var(--color-success)' : 'var(--theme-text-muted)'
              }}
              title={autoCommitEnabled ? 'Auto-commit enabled: Will commit when preview is error-free' : 'Enable auto-commit'}
            >
              {isAutoCommitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <div
                  className="w-5 h-2.5 rounded-full transition-colors relative"
                  style={{ backgroundColor: autoCommitEnabled ? 'var(--color-success)' : 'var(--theme-glass-300)' }}
                >
                  <div className={`absolute top-0.5 w-1.5 h-1.5 rounded-full bg-white transition-transform ${
                    autoCommitEnabled ? 'left-3' : 'left-0.5'
                  }`} />
                </div>
              )}
              <span>Auto</span>
            </button>
          )}

          {/* Uncommitted Changes Indicator */}
          {hasUncommittedChanges && (
            <div
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
              title="Uncommitted changes - will survive F5 refresh"
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-warning)' }} />
              <span>Uncommitted</span>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
          <div
            id="project-panel"
            className="w-full max-w-2xl backdrop-blur-xl rounded-2xl animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden mx-4"
            style={{ maxHeight: 'calc(100vh - 100px)', backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Projects</h2>
                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{projects.length} projects</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Server status badge */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                style={{
                  backgroundColor: isServerOnline ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                  color: isServerOnline ? 'var(--color-success)' : 'var(--color-error)'
                }}
              >
                {isServerOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                {isServerOnline ? 'Online' : 'Offline'}
              </div>
              <button
                onClick={onRefreshProjects}
                disabled={isLoadingProjects}
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Refresh projects"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingProjects ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search and New Project */}
          <div className="flex items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              />
            </div>
            <button
              onClick={() => setShowTemplateSelector(true)}
              disabled={!isServerOnline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-feature)', color: 'white' }}
              title="Create from template"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              Template
            </button>
            <button
              onClick={() => setIsCreating(true)}
              disabled={!isServerOnline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-info)', color: 'white' }}
              title="Create blank project"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {/* Create Project Form */}
          {isCreating && (
            <div className="p-3" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-200)' }}>
              <div className="flex items-start gap-2">
                <FolderPlus className="w-4 h-4 mt-1.5 shrink-0" style={{ color: 'var(--color-success)' }} />
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                  <input
                    type="text"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCreate}
                      disabled={!newProjectName.trim() || actionLoading === 'create'}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                    >
                      {actionLoading === 'create' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setNewProjectName('');
                        setNewProjectDescription('');
                      }}
                      className="px-3 py-1 rounded-lg text-xs transition-colors"
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
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {!isServerOnline ? (
              <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--theme-text-muted)' }}>
                <CloudOff className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Server offline</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>Start backend on port 3101</p>
              </div>
            ) : isLoadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-info)' }} />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8" style={{ color: 'var(--theme-text-muted)' }}>
                <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">{searchQuery ? 'No matches' : 'No projects'}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                  {searchQuery ? 'Try different search' : 'Create your first project'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredProjects.map((project) => {
                  const isActive = currentProject?.id === project.id;
                  return (
                    <div
                      key={project.id}
                      className="group relative flex items-center gap-3 p-2.5 rounded-lg transition-all cursor-pointer"
                      style={{
                        backgroundColor: isActive ? 'var(--color-info-subtle)' : 'var(--theme-glass-200)',
                        border: isActive ? '1px solid var(--color-info-border)' : '1px solid transparent'
                      }}
                      onClick={() => handleOpen(project.id)}
                    >
                      {/* Thumbnail or Icon */}
                      {project.screenshots?.latest?.thumbnail ? (
                        <div
                          className="w-12 h-8 rounded-lg overflow-hidden shrink-0"
                          style={{ border: isActive ? '2px solid var(--color-info)' : '1px solid var(--theme-border-light)' }}
                        >
                          <img
                            src={project.screenshots.latest.thumbnail}
                            alt={`${project.name} preview`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="p-1.5 rounded-lg"
                          style={{ backgroundColor: isActive ? 'var(--color-info-subtle)' : 'var(--theme-glass-300)' }}
                        >
                          <FolderOpen className="w-3.5 h-3.5" style={{ color: isActive ? 'var(--color-info)' : 'var(--theme-text-muted)' }} />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                            {project.name}
                          </span>
                          {isActive && (
                            <span className="px-1 py-0.5 text-[9px] rounded" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                              Active
                            </span>
                          )}
                          {project.gitInitialized && (
                            <GitBranch className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                            <Clock className="w-2.5 h-2.5" />
                            {formatDate(project.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Loading */}
                      {actionLoading === project.id && (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-info)' }} />
                      )}

                      {/* Actions Menu */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === project.id ? null : project.id);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 rounded transition-all"
                          style={{ color: 'var(--theme-text-muted)' }}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {menuOpenId === project.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-32 rounded-lg shadow-xl overflow-hidden z-10"
                            style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleDuplicate(project.id)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                              style={{ color: 'var(--theme-text-secondary)' }}
                            >
                              <Copy className="w-3 h-3" />
                              Duplicate
                            </button>
                            <button
                              onClick={() => {
                                setDeleteConfirmId(project.id);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                              style={{ color: 'var(--color-error)' }}
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Project Actions */}
          {currentProject && (
            <div className="p-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-info)' }} />
                    <span>Syncing...</span>
                  </>
                ) : lastSyncedAt ? (
                  <>
                    <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
                    <span>Saved {formatDate(lastSyncedAt)}</span>
                  </>
                ) : (
                  <span>Not synced</span>
                )}
              </div>
              <button
                onClick={() => {
                  onCloseProject();
                  setIsOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-3 h-3" />
                Close Project
              </button>
            </div>
          )}

          {/* Delete Confirmation */}
          {deleteConfirmId && (
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm rounded-xl" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
              <div className="rounded-xl p-4 max-w-xs mx-4" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>Delete Project?</span>
                </div>
                <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                  This will permanently delete all files. Cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(deleteConfirmId)}
                    disabled={actionLoading === deleteConfirmId}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
                  >
                    {actionLoading === deleteConfirmId ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsOpen(false)} />
        </div>
      )}

      {/* Unsaved Work Modal */}
      {unsavedWorkModal.isOpen && createPortal(
        <div
          className="fixed inset-0 z-99999 flex items-center justify-center backdrop-blur-sm"
          style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
          onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--color-warning-subtle)' }}>
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
                <AlertTriangle className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Unsaved Work Detected</h3>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                  {fileCount} file{fileCount !== 1 ? 's' : ''} generated without a project
                </p>
              </div>
              <button
                onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                You have generated code that isn't saved to any project.
                {unsavedWorkModal.targetProjectName && (
                  <span style={{ color: 'var(--color-warning)' }}> Opening "{unsavedWorkModal.targetProjectName}" will replace your current work.</span>
                )}
              </p>

              {/* Option 1: Save as New Project */}
              <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>Save as New Project</span>
                </div>
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                />
                <input
                  type="text"
                  value={saveAsDescription}
                  onChange={(e) => setSaveAsDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                />
                <button
                  onClick={handleSaveAsNewThenOpen}
                  disabled={!saveAsName.trim() || actionLoading === 'save-as-new' || !onSaveCurrentAsProject}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                >
                  {actionLoading === 'save-as-new' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save & {unsavedWorkModal.targetProjectId ? 'Continue' : 'Done'}
                </button>
              </div>

              {/* Option 2: Open Anyway */}
              {unsavedWorkModal.targetProjectId && (
                <button
                  onClick={handleOpenAnyway}
                  disabled={actionLoading === unsavedWorkModal.targetProjectId}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm transition-all group"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}
                >
                  <FolderInput className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  <span style={{ color: 'var(--theme-text-secondary)' }}>
                    Open Anyway
                  </span>
                  <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                    (lose current work)
                  </span>
                </button>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Your generated code only exists in memory. Saving to a project will persist it to disk.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
              <button
                onClick={() => setUnsavedWorkModal({ isOpen: false, targetProjectId: null })}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Project Template Selector */}
      <ProjectTemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelectTemplate={async (name, description, files) => {
          await onCreateProject(name, description, files);
          setShowTemplateSelector(false);
          setIsOpen(false);
        }}
        isLoading={actionLoading === 'template'}
      />
    </div>
  );
};
