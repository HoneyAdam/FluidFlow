/**
 * Projects Panel
 *
 * Embedded project management panel for the PreviewPanel tabs.
 * Provides project listing, creation, import from GitHub, push to GitHub, and project switching.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TOAST_DURATION_MS } from '../../constants/timing';
import {
  FolderOpen, Plus, Trash2, Copy, Clock, GitBranch, RefreshCw,
  Search, MoreVertical, Check, AlertCircle, FolderPlus, Loader2, Github,
  FolderGit, Upload, Pencil, X, Package, Sparkles, ZoomIn
} from 'lucide-react';
import type { ProjectMeta } from '@/services/projectApi';
import { projectApi } from '@/services/projectApi';
import { githubApi } from '@/services/api/github';
import { useAppContext } from '@/contexts/AppContext';
import type { GitHubModalMode } from '../GitHubModal';
import { LazyGitHubModal } from '../LazyModals';
import { ConfirmModal } from '../shared/BaseModal';

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

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ProjectsPanel: React.FC = () => {
  const { currentProject, openProject } = useAppContext();

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit project state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // GitHub modal state
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [gitHubModalMode, setGitHubModalMode] = useState<GitHubModalMode>('import');
  const [pushProjectId, setPushProjectId] = useState<string | null>(null);
  const [pushProjectName, setPushProjectName] = useState<string>('');
  const [hasExistingRemote, setHasExistingRemote] = useState(false);
  const [existingRemoteUrl, setExistingRemoteUrl] = useState('');

  // Bulk node_modules cleanup state
  const [isCleaningAll, setIsCleaningAll] = useState(false);

  // Lightbox state for previewing screenshots
  const [lightboxProject, setLightboxProject] = useState<ProjectMeta | null>(null);
  const [lightboxFullImage, setLightboxFullImage] = useState<string | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  // Load projects
  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const projectList = await projectApi.list();
      setProjects(projectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Filter projects
  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  });

  // Calculate node_modules summary
  const nodeModulesSummary = useMemo(() => {
    const projectsWithNodeModules = projects.filter(
      p => p.hasNodeModules && p.nodeModulesSize && p.nodeModulesSize > 0
    );
    const totalSize = projectsWithNodeModules.reduce(
      (sum, p) => sum + (p.nodeModulesSize || 0),
      0
    );
    return {
      count: projectsWithNodeModules.length,
      totalSize,
      projects: projectsWithNodeModules,
    };
  }, [projects]);

  // Handle create project
  const handleCreate = async () => {
    if (!newProjectName.trim()) return;

    setActionLoading('create');
    try {
      const newProject = await projectApi.create({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      });
      // Add to list (Project has id, name, etc.)
      setProjects(prev => [{
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        createdAt: newProject.createdAt,
        updatedAt: newProject.updatedAt,
        gitInitialized: newProject.gitInitialized,
      }, ...prev]);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreating(false);
      // Auto-open the new project
      if (openProject) {
        await openProject(newProject.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle open project
  const handleOpen = async (id: string) => {
    if (id === currentProject?.id) return;
    setActionLoading(id);
    try {
      if (openProject) {
        await openProject(id);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Handle delete project
  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await projectApi.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle duplicate project
  const handleDuplicate = async (id: string) => {
    setActionLoading(id);
    try {
      const duplicatedProject = await projectApi.duplicate(id);
      setProjects(prev => [duplicatedProject, ...prev]);
      setMenuOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate project');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle clean node_modules
  const handleCleanNodeModules = async (id: string) => {
    setActionLoading(id);
    setMenuOpenId(null);
    try {
      const result = await projectApi.cleanNodeModules(id);
      // Update local state to reflect node_modules removal
      setProjects(prev => prev.map(p =>
        p.id === id
          ? { ...p, hasNodeModules: false, nodeModulesSize: 0 }
          : p
      ));
      // Show success message via error state (temporary)
      setError(`Cleaned ${result.freedMB} MB from node_modules`);
      setTimeout(() => setError(null), TOAST_DURATION_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean node_modules');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle clean ALL node_modules
  const handleCleanAllNodeModules = async () => {
    if (nodeModulesSummary.count === 0) return;

    setIsCleaningAll(true);
    let totalFreed = 0;
    let cleaned = 0;

    try {
      for (const project of nodeModulesSummary.projects) {
        try {
          const result = await projectApi.cleanNodeModules(project.id);
          totalFreed += result.freedMB;
          cleaned++;
          // Update local state for each cleaned project
          setProjects(prev => prev.map(p =>
            p.id === project.id
              ? { ...p, hasNodeModules: false, nodeModulesSize: 0 }
              : p
          ));
        } catch {
          // Continue with next project even if one fails
        }
      }

      setError(`Cleaned ${cleaned} project(s), freed ${totalFreed.toFixed(1)} MB`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsCleaningAll(false);
    }
  };

  // Start editing a project
  const handleStartEdit = (project: ProjectMeta) => {
    setEditingProjectId(project.id);
    setEditName(project.name);
    setEditDescription(project.description || '');
    setMenuOpenId(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditName('');
    setEditDescription('');
  };

  // Save edited project
  const handleSaveEdit = async () => {
    if (!editingProjectId || !editName.trim()) return;

    setActionLoading(editingProjectId);
    try {
      await projectApi.update(editingProjectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      // Update local state
      setProjects(prev => prev.map(p =>
        p.id === editingProjectId
          ? { ...p, name: editName.trim(), description: editDescription.trim() || undefined }
          : p
      ));
      setEditingProjectId(null);
      setEditName('');
      setEditDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setActionLoading(null);
    }
  };

  // Open GitHub modal for import
  const handleOpenImport = () => {
    setGitHubModalMode('import');
    setPushProjectId(null);
    setPushProjectName('');
    setHasExistingRemote(false);
    setExistingRemoteUrl('');
    setShowGitHubModal(true);
  };

  // Open GitHub modal for push
  const handleOpenPush = async (projectId: string, projectName: string) => {
    setGitHubModalMode('push');
    setPushProjectId(projectId);
    setPushProjectName(projectName);
    setMenuOpenId(null);

    // Load remote info
    try {
      const result = await githubApi.getRemotes(projectId);
      if (result.initialized && result.remotes.length > 0) {
        const origin = result.remotes.find(r => r.name === 'origin');
        if (origin) {
          setHasExistingRemote(true);
          setExistingRemoteUrl(origin.push || origin.fetch || '');
        } else {
          setHasExistingRemote(false);
          setExistingRemoteUrl('');
        }
      } else {
        setHasExistingRemote(false);
        setExistingRemoteUrl('');
      }
    } catch {
      setHasExistingRemote(false);
      setExistingRemoteUrl('');
    }

    setShowGitHubModal(true);
  };

  // Handle GitHub import complete
  const handleGitHubImportComplete = (project: ProjectMeta) => {
    setShowGitHubModal(false);
    setProjects(prev => [project, ...prev]);
    if (openProject) {
      openProject(project.id);
    }
  };

  // Handle GitHub push complete
  const handleGitHubPushComplete = () => {
    setShowGitHubModal(false);
    // Refresh projects to update any metadata changes
    loadProjects();
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

  // Load full-size image when lightbox opens.
  // Cancellation guard: rapid lightbox switches can let an earlier project's
  // image arrive after a newer selection and flash incorrect content.
  useEffect((): (() => void) | undefined => {
    if (lightboxProject && lightboxProject.screenshots?.latest?.filename) {
      setLightboxLoading(true);
      setLightboxFullImage(null);

      let cancelled = false;
      const filename = lightboxProject.screenshots.latest.filename;
      projectApi.readFile(lightboxProject.id, `.fluidflow/${filename}`)
        .then((dataUrl) => {
          if (cancelled) return;
          if (dataUrl) {
            setLightboxFullImage(dataUrl);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('[Lightbox] Failed to load full image:', err);
        })
        .finally(() => {
          if (!cancelled) setLightboxLoading(false);
        });

      return () => { cancelled = true; };
    }
    setLightboxFullImage(null);
    setLightboxLoading(false);
    return undefined;
  }, [lightboxProject]);

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--theme-background)' }}>
      {/* Header */}
      <div className="flex-none px-4 py-3" style={{ backgroundColor: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Projects</h2>
            <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>({projects.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProjects}
              disabled={isLoading}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {/* Push current project to GitHub */}
            {currentProject && (
              <button
                onClick={() => handleOpenPush(currentProject.id, currentProject.name)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)', border: '1px solid var(--color-info)' }}
                title="Push current project to GitHub"
              >
                <Upload className="w-3.5 h-3.5" />
                Push
              </button>
            )}
            <button
              onClick={handleOpenImport}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)', border: '1px solid var(--theme-border-light)' }}
              title="Import from GitHub"
            >
              <Github className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-info)', color: 'var(--theme-text-on-accent)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
          />
        </div>
      </div>

      {/* node_modules Summary Banner */}
      {nodeModulesSummary.count > 0 && (
        <div className="flex-none px-4 py-2" style={{ backgroundColor: 'var(--color-warning-subtle)', borderBottom: '1px solid var(--color-warning)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
              <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
                <span className="font-medium">{nodeModulesSummary.count}</span> project{nodeModulesSummary.count > 1 ? 's' : ''} with node_modules
              </span>
              <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                ({formatSize(nodeModulesSummary.totalSize)} total)
              </span>
            </div>
            <button
              onClick={handleCleanAllNodeModules}
              disabled={isCleaningAll}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
            >
              {isCleaningAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Clean All
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error / Success Message */}
      {error && (
        <div
          className="flex-none px-4 py-2"
          style={{
            backgroundColor: error.includes('Cleaned') ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
            borderBottom: `1px solid ${error.includes('Cleaned') ? 'var(--color-success)' : 'var(--color-error)'}`
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: error.includes('Cleaned') ? 'var(--color-success)' : 'var(--color-error)' }}
          >
            {error.includes('Cleaned') ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {error}
            <button onClick={() => setError(null)} className="ml-auto opacity-70 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create Project Form */}
      {isCreating && (
        <div className="flex-none px-4 py-3" style={{ backgroundColor: 'var(--theme-glass-200)', borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg mt-0.5" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
              <FolderPlus className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <input
                type="text"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newProjectName.trim() || actionLoading === 'create'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-on-accent)' }}
                >
                  {actionLoading === 'create' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName('');
                    setNewProjectDescription('');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
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
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="group relative flex flex-col rounded-xl transition-all cursor-pointer overflow-hidden"
                style={{
                  backgroundColor: currentProject?.id === project.id ? 'var(--color-info-subtle)' : 'var(--theme-glass-200)',
                  border: `1px solid ${currentProject?.id === project.id ? 'var(--color-info)' : 'var(--theme-border-light)'}`,
                  boxShadow: currentProject?.id === project.id ? '0 0 0 1px var(--color-info-subtle)' : 'none',
                }}
                onClick={() => handleOpen(project.id)}
              >
                {/* Top: 4:3 Thumbnail */}
                <div
                  className="relative w-full group/thumb"
                  style={{
                    paddingBottom: '75%', /* 4:3 aspect ratio */
                    backgroundColor: 'var(--theme-surface-dark)'
                  }}
                  onClick={(e) => {
                    if (project.screenshots?.latest?.thumbnail) {
                      e.stopPropagation();
                      setLightboxProject(project);
                    }
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    {project.screenshots?.latest?.thumbnail ? (
                      <>
                        <img
                          src={project.screenshots.latest.thumbnail}
                          alt={`${project.name} preview`}
                          className="w-full h-full object-cover object-top"
                        />
                        {/* Zoom overlay on hover */}
                        <div
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--theme-background) 50%, transparent)' }}
                        >
                          <ZoomIn className="w-8 h-8" style={{ color: 'white' }} />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        {project.gitInitialized ? (
                          <FolderGit className="w-12 h-12" style={{ color: 'var(--color-success)', opacity: 0.4 }} />
                        ) : (
                          <FolderOpen className="w-12 h-12" style={{ color: 'var(--theme-text-dim)', opacity: 0.4 }} />
                        )}
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)', opacity: 0.6 }}>
                          No Preview
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges on thumbnail */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {/* Active indicator */}
                    {currentProject?.id === project.id && (
                      <div
                        className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: 'var(--color-info)', color: 'var(--theme-text-on-accent)' }}
                      >
                        Active
                      </div>
                    )}
                    {/* Git badge */}
                    {project.gitInitialized && (
                      <div
                        className="p-1.5 rounded"
                        style={{ backgroundColor: 'var(--theme-surface)', opacity: 0.9 }}
                      >
                        <FolderGit className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
                      </div>
                    )}
                  </div>

                  {/* Menu on thumbnail */}
                  {editingProjectId !== project.id && (
                    <div className="absolute top-2 right-2">
                      {actionLoading === project.id ? (
                        <div className="p-1.5 rounded" style={{ backgroundColor: 'var(--theme-surface)', opacity: 0.9 }}>
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-info)' }} />
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === project.id ? null : project.id);
                            }}
                            className="p-1.5 opacity-0 group-hover:opacity-100 rounded transition-all"
                            style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-muted)', opacity: menuOpenId === project.id ? 1 : undefined }}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {menuOpenId === project.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl overflow-hidden z-20"
                              style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleStartEdit(project)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                                style={{ color: 'var(--theme-text-secondary)' }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleOpenPush(project.id, project.name)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                                style={{ color: 'var(--color-info)' }}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Push to GitHub
                              </button>
                              <button
                                onClick={() => handleDuplicate(project.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                                style={{ color: 'var(--theme-text-secondary)' }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Duplicate
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteConfirmId(project.id);
                                  setMenuOpenId(null);
                                }}
                                disabled={currentProject?.id === project.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ color: 'var(--color-error)' }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom: Project Info */}
                <div className="flex flex-col p-3">
                  {/* Edit Form */}
                  {editingProjectId === project.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Project name"
                        className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description"
                        className="w-full px-2 py-1.5 rounded-lg text-sm outline-none"
                        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editName.trim() || actionLoading === project.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
                          style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-on-accent)' }}
                        >
                          {actionLoading === project.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
                          style={{ color: 'var(--theme-text-muted)' }}
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Title */}
                      <h3 className="text-sm font-semibold truncate mb-1" style={{ color: 'var(--theme-text-primary)' }}>
                        {project.name}
                      </h3>

                      {/* Description */}
                      <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--theme-text-dim)', minHeight: '2.5em' }}>
                        {project.description || 'No description'}
                      </p>

                      {/* Metadata */}
                      <div
                        className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]"
                        style={{ borderTop: '1px solid var(--theme-border-light)' }}
                      >
                        <span className="flex items-center gap-1" style={{ color: 'var(--theme-text-dim)' }}>
                          <Clock className="w-3 h-3" />
                          {formatDate(project.updatedAt)}
                        </span>
                        {project.gitInitialized && (
                          <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                            <GitBranch className="w-3 h-3" />
                            Git
                          </span>
                        )}
                        {project.hasNodeModules && project.nodeModulesSize && project.nodeModulesSize > 0 && (
                          <span className="flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
                            <Package className="w-3 h-3" />
                            {formatSize(project.nodeModulesSize)}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCleanNodeModules(project.id);
                              }}
                              className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
                              style={{ backgroundColor: 'var(--color-warning-subtle)' }}
                            >
                              Clean
                            </button>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* GitHub Modal (Import/Push) */}
      <LazyGitHubModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        mode={gitHubModalMode}
        onImportComplete={handleGitHubImportComplete}
        projectId={pushProjectId || undefined}
        projectName={pushProjectName}
        hasExistingRemote={hasExistingRemote}
        existingRemoteUrl={existingRemoteUrl}
        onPushComplete={handleGitHubPushComplete}
      />

      {/* Screenshot Lightbox Modal */}
      {lightboxProject && lightboxProject.screenshots?.latest?.thumbnail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ backgroundColor: 'color-mix(in srgb, var(--theme-background) 85%, transparent)' }}
          onClick={() => setLightboxProject(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-6 right-6 p-2 rounded-full transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
            onClick={() => setLightboxProject(null)}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image container */}
          <div
            className="relative max-w-4xl w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--theme-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with project info */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--theme-border)' }}
            >
              <div className="flex items-center gap-3">
                {lightboxProject.gitInitialized ? (
                  <FolderGit className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
                ) : (
                  <FolderOpen className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
                )}
                <div>
                  <h3 className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>
                    {lightboxProject.name}
                  </h3>
                  {lightboxProject.description && (
                    <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                      {lightboxProject.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setLightboxProject(null);
                  handleOpen(lightboxProject.id);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-info)', color: 'var(--theme-text-on-accent)' }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Open Project
              </button>
            </div>

            {/* Screenshot */}
            <div className="relative" style={{ backgroundColor: 'var(--theme-surface-dark)', minHeight: '200px' }}>
              {lightboxLoading && !lightboxFullImage && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-info)' }} />
                </div>
              )}
              <img
                src={lightboxFullImage || lightboxProject.screenshots.latest.thumbnail}
                alt={`${lightboxProject.name} preview`}
                className="w-full h-auto"
                style={{ maxHeight: '70vh', objectFit: 'contain' }}
              />
              {/* Resolution indicator */}
              {lightboxProject.screenshots.latest.width && lightboxProject.screenshots.latest.height && (
                <div
                  className="absolute bottom-2 right-2 px-2 py-1 rounded text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-dim)', opacity: 0.8 }}
                >
                  {lightboxFullImage ? 'Full' : 'Thumbnail'} • {lightboxProject.screenshots.latest.width}×{lightboxProject.screenshots.latest.height}
                </div>
              )}
            </div>

            {/* Footer with metadata */}
            <div
              className="px-4 py-2 flex items-center justify-between text-xs"
              style={{ borderTop: '1px solid var(--theme-border)', color: 'var(--theme-text-dim)' }}
            >
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {formatDate(lightboxProject.updatedAt)}
              </span>
              {currentProject?.id === lightboxProject.id && (
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}
                >
                  Currently Active
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPanel;
