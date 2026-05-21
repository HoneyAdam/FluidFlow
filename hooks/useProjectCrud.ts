/**
 * useProjectCrud Hook
 *
 * Handles project CRUD operations: create, open, close, delete, duplicate.
 * Extracted from useProject for better separation of concerns.
 */

import { useCallback } from 'react';
import { projectApi, ProjectMeta, ProjectContext } from '@/services/projectApi';
import { deleteProjectContext } from '@/services/projectContext';
import type { FileSystem } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface UseProjectCrudOptions {
  /** Callback when files change from project operations */
  onFilesChange?: (files: FileSystem) => void;
  /** Callback to update state */
  updateState: (updater: (prev: ProjectCrudState) => Partial<ProjectCrudState>) => void;
  /** Get current state */
  getState: () => ProjectCrudState;
  /** Storage helpers */
  storage: {
    setProjectId: (id: string | null) => void;
  };
  /** Refs for tracking */
  refs: {
    lastFilesRef: React.MutableRefObject<string>;
    isInitializedRef: React.MutableRefObject<boolean>;
    restoreAbortedRef: React.MutableRefObject<boolean>;
    openProjectIdRef: React.MutableRefObject<string | null>;
    syncTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  };
  /** AutoSave helper */
  autoSave: { reset: () => void };
}

export interface ProjectCrudState {
  currentProject: ProjectMeta | null;
  files: FileSystem;
  projects: ProjectMeta[];
  isLoadingProjects: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isInitialized: boolean;
  gitStatus: { initialized?: boolean } | null;
  error: string | null;
}

export interface UseProjectCrudReturn {
  /** Create a new project */
  createProject: (name?: string, description?: string, initialFiles?: FileSystem) => Promise<ProjectMeta | null>;
  /** Open an existing project */
  openProject: (id: string) => Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }>;
  /** Close the current project */
  closeProject: () => void;
  /** Delete a project */
  deleteProject: (id: string) => Promise<boolean>;
  /** Duplicate a project */
  duplicateProject: (id: string, newName?: string) => Promise<ProjectMeta | null>;
  /** Refresh the projects list */
  refreshProjects: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useProjectCrud(options: UseProjectCrudOptions): UseProjectCrudReturn {
  const { onFilesChange, updateState, storage, refs, autoSave } = options;

  // Refresh projects list
  const refreshProjects = useCallback(async () => {
    updateState(() => ({ isLoadingProjects: true, error: null }));

    try {
      const projects = await projectApi.list();
      updateState(() => ({ projects, isLoadingProjects: false }));
    } catch (err) {
      console.error('[ProjectCrud] Failed to load projects:', err);
      updateState(() => ({
        isLoadingProjects: false,
        error: 'Failed to load projects',
      }));
    }
  }, [updateState]);

  // Create new project
  const createProject = useCallback(
    async (name?: string, description?: string, initialFiles?: FileSystem): Promise<ProjectMeta | null> => {
      // Abort any in-flight restore operation
      refs.restoreAbortedRef.current = true;

      updateState(() => ({ error: null }));

      try {
        const project = await projectApi.create({
          name: name || 'Untitled Project',
          description,
          files: initialFiles,
        });

        updateState((prev) => ({
          currentProject: project,
          files: project.files || {},
          // Filter out any existing project with the same ID to prevent duplicates
          projects: [project, ...prev.projects.filter((p) => p.id !== project.id)],
          gitStatus: null, // Will be fetched on demand
          lastSyncedAt: Date.now(),
          isInitialized: true,
        }));

        // Save project ID to localStorage for persistence
        storage.setProjectId(project.id);

        refs.lastFilesRef.current = JSON.stringify(project.files || {});
        refs.isInitializedRef.current = true; // Safe to sync now
        onFilesChange?.(project.files || {});

        return project;
      } catch (err) {
        console.error('[ProjectCrud] Failed to create project:', err);
        updateState(() => ({ error: 'Failed to create project' }));
        return null;
      }
    },
    [onFilesChange, updateState, storage, refs]
  );

  // Open existing project - returns files directly to avoid stale closure issues
  const openProject = useCallback(
    async (id: string): Promise<{ success: boolean; files: FileSystem; context: ProjectContext | null }> => {
      // IMPORTANT: Abort any in-flight restore operation
      refs.restoreAbortedRef.current = true;

      // Track this operation - used to detect if a newer openProject was called
      refs.openProjectIdRef.current = id;

      // IMPORTANT: Clear any pending syncs from old project FIRST
      if (refs.syncTimeoutRef.current) {
        clearTimeout(refs.syncTimeoutRef.current);
        refs.syncTimeoutRef.current = null;
      }
      autoSave.reset();

      // Temporarily disable syncing until new project is loaded
      refs.isInitializedRef.current = false;

      updateState(() => ({ error: null, isSyncing: true }));

      try {
        // Fetch project and context in parallel
        const [project, savedContext] = await Promise.all([
          projectApi.get(id),
          projectApi.getContext(id).catch((): null => null), // do not fail if context doesn't exist
        ]);

        // Check if a newer openProject call was made while we were fetching
        if (refs.openProjectIdRef.current !== id) {
          console.log('[ProjectCrud] openProject aborted - newer request in progress');
          return { success: false, files: {}, context: null };
        }

        const projectFiles = project.files || {};

        updateState(() => ({
          currentProject: project,
          files: projectFiles,
          isSyncing: false,
          lastSyncedAt: Date.now(),
          isInitialized: true,
          // Reset git status - will be fetched fresh
          gitStatus: null,
        }));

        // Save project ID to localStorage for persistence
        storage.setProjectId(id);

        // Set lastFilesRef BEFORE enabling sync to prevent old files from syncing
        refs.lastFilesRef.current = JSON.stringify(projectFiles);

        // NOW enable syncing for new project
        refs.isInitializedRef.current = true;

        console.log('[ProjectCrud] Opened project:', project.name, 'with', Object.keys(projectFiles).length, 'files');
        if (savedContext?.history?.length) {
          console.log('[ProjectCrud] Loaded context with', savedContext.history.length, 'history entries');
        }

        return { success: true, files: projectFiles, context: savedContext };
      } catch (_err) {
        // Only handle error if this is still the current operation
        if (refs.openProjectIdRef.current === id) {
          console.error('[ProjectCrud] Failed to open project:', _err);
          // Re-enable syncing if open fails
          refs.isInitializedRef.current = true;
          updateState(() => ({
            isSyncing: false,
            error: 'Failed to open project',
          }));
        }
        return { success: false, files: {}, context: null };
      }
    },
    [autoSave, updateState, storage, refs]
  );

  // Close current project
  const closeProject = useCallback(() => {
    // Clear any pending sync
    if (refs.syncTimeoutRef.current) {
      clearTimeout(refs.syncTimeoutRef.current);
      refs.syncTimeoutRef.current = null;
    }
    autoSave.reset();

    // Clear localStorage
    storage.setProjectId(null);

    updateState(() => ({
      currentProject: null,
      files: {},
      gitStatus: null,
      lastSyncedAt: null,
    }));

    refs.lastFilesRef.current = '';
  }, [autoSave, updateState, storage, refs]);

  // Delete project
  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      updateState(() => ({ error: null }));

      try {
        await projectApi.delete(id);

        // Delete AI context (style guide + project summary)
        deleteProjectContext(id);

        updateState((prev) => {
          // Clear localStorage if deleting current project
          if (prev.currentProject?.id === id) {
            storage.setProjectId(null);
          }

          return {
            projects: prev.projects.filter((p) => p.id !== id),
            // Close if current project was deleted
            ...(prev.currentProject?.id === id
              ? {
                  currentProject: null,
                  files: {},
                  gitStatus: null,
                }
              : {}),
          };
        });

        return true;
      } catch (err) {
        console.error('[ProjectCrud] Failed to delete project:', err);
        updateState(() => ({ error: 'Failed to delete project' }));
        return false;
      }
    },
    [updateState, storage]
  );

  // Duplicate project
  const duplicateProject = useCallback(
    async (id: string, newName?: string): Promise<ProjectMeta | null> => {
      updateState(() => ({ error: null }));

      try {
        const project = await projectApi.duplicate(id, newName);
        updateState((prev) => ({
          // Filter out any existing project with the same ID to prevent duplicates
          projects: [project, ...prev.projects.filter((p) => p.id !== project.id)],
        }));
        return project;
      } catch (err) {
        console.error('[ProjectCrud] Failed to duplicate project:', err);
        updateState(() => ({ error: 'Failed to duplicate project' }));
        return null;
      }
    },
    [updateState]
  );

  return {
    createProject,
    openProject,
    closeProject,
    deleteProject,
    duplicateProject,
    refreshProjects,
  };
}
