/**
 * useProject Hook
 *
 * Orchestrates project management including CRUD, Git, and file sync operations.
 * Delegates to focused sub-hooks:
 * - useProjectCrud: Project create, open, close, delete, duplicate
 * - useProjectGit: Git init, commit, status
 * - useProjectSync: File sync and confirmation handling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { projectApi, gitApi, autoSave, checkServerHealth, ProjectMeta, GitStatus, ProjectContext, HistoryEntry } from '@/services/projectApi';
import type { FileSystem } from '@/types';
import { useProjectCrud, ProjectCrudState } from './useProjectCrud';
import { useProjectGit, ProjectGitState } from './useProjectGit';
import { useProjectSync, PendingSyncConfirmation, ProjectSyncState } from './useProjectSync';

// Re-export types for use in other components
export type { ProjectContext, HistoryEntry } from '@/services/projectApi';
export type { PendingSyncConfirmation } from './useProjectSync';

// ============================================================================
// Types
// ============================================================================

export interface ProjectState {
  // Current project
  currentProject: ProjectMeta | null;
  files: FileSystem;

  // Project list
  projects: ProjectMeta[];
  isLoadingProjects: boolean;

  // Git state - gitStatus.initialized is the single source of truth
  gitStatus: GitStatus | null;

  // Server state
  isServerOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  isInitialized: boolean; // True after initial load from backend

  // Sync confirmation
  pendingSyncConfirmation: PendingSyncConfirmation | null;

  // Errors
  error: string | null;
}

export interface UseProjectReturn extends ProjectState {
  // Project operations
  createProject: (name?: string, description?: string, initialFiles?: FileSystem) => Promise<ProjectMeta | null>;
  openProject: (id: string) => Promise<{ success: boolean; files: FileSystem; context?: { history: HistoryEntry[]; currentIndex: number; activeFile?: string; activeTab?: string } | null }>;
  closeProject: () => void;
  deleteProject: (id: string) => Promise<boolean>;
  duplicateProject: (id: string, newName?: string) => Promise<ProjectMeta | null>;
  refreshProjects: () => Promise<void>;

  // File operations
  updateFiles: (files: FileSystem) => void;
  syncFiles: () => Promise<boolean>;

  // Git operations
  initGit: (force?: boolean, filesToSync?: FileSystem) => Promise<boolean>;
  commit: (message: string, filesToCommit?: FileSystem) => Promise<boolean>;
  refreshGitStatus: () => Promise<void>;

  // Context management (now async - saves to backend)
  saveContext: (context: Partial<ProjectContext>) => Promise<boolean>;
  getContext: () => Promise<ProjectContext | null>;

  // Sync confirmation
  confirmPendingSync: () => Promise<boolean>;
  cancelPendingSync: () => void;

  // Utils
  clearError: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_PROJECT_ID = 'fluidflow_current_project_id';

// Helper to get/set localStorage (only for project ID persistence)
const storage = {
  getProjectId: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY_PROJECT_ID);
    } catch {
      return null;
    }
  },
  setProjectId: (id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY_PROJECT_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEY_PROJECT_ID);
      }
    } catch {
      // Ignore storage errors
    }
  },
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useProject(onFilesChange?: (files: FileSystem) => void): UseProjectReturn {
  const [state, setState] = useState<ProjectState>({
    currentProject: null,
    files: {},
    projects: [],
    isLoadingProjects: false,
    gitStatus: null,
    isServerOnline: false,
    isSyncing: false,
    lastSyncedAt: null,
    isInitialized: false,
    pendingSyncConfirmation: null,
    error: null,
  });

  // Refs for tracking
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFilesRef = useRef<string>('');
  const hasRestoredRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);
  const restoreAbortedRef = useRef<boolean>(false);
  const openProjectIdRef = useRef<string | null>(null);

  // State ref for sub-hooks to access current state
  const stateRef = useRef(state);
  stateRef.current = state;

  // Unified state updater for sub-hooks
  const updateState = useCallback(
    <T extends Partial<ProjectState>>(updater: (prev: ProjectState) => T) => {
      setState((prev) => ({ ...prev, ...updater(prev) }));
    },
    []
  );

  // Refs bundle for sub-hooks
  const refs = {
    lastFilesRef,
    isInitializedRef,
    restoreAbortedRef,
    openProjectIdRef,
    syncTimeoutRef,
  };

  // ============================================================================
  // Compose Sub-Hooks
  // ============================================================================

  // Project CRUD operations
  const crudOps = useProjectCrud({
    onFilesChange,
    updateState: updateState as (updater: (prev: ProjectCrudState) => Partial<ProjectCrudState>) => void,
    getState: () => stateRef.current,
    storage,
    refs,
    autoSave,
  });

  // Git operations
  const gitOps = useProjectGit({
    getCurrentProject: () => stateRef.current.currentProject,
    getFiles: () => stateRef.current.files,
    getGitStatus: () => stateRef.current.gitStatus,
    updateState: updateState as (updater: (prev: ProjectGitState) => Partial<ProjectGitState>) => void,
  });

  // File sync operations
  const syncOps = useProjectSync({
    getCurrentProject: () => stateRef.current.currentProject,
    getFiles: () => stateRef.current.files,
    getPendingSyncConfirmation: () => stateRef.current.pendingSyncConfirmation,
    updateState: updateState as (updater: (prev: ProjectSyncState) => Partial<ProjectSyncState>) => void,
    refs,
  });

  // ============================================================================
  // Effects
  // ============================================================================

  // Check server health on mount
  useEffect(() => {
    const checkHealth = async () => {
      const isOnline = await checkServerHealth();
      setState((prev) => ({ ...prev, isServerOnline: isOnline }));
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, []);

  // Load projects on mount
  const { refreshProjects } = crudOps;
  useEffect(() => {
    if (state.isServerOnline) {
      refreshProjects();
    }
  }, [state.isServerOnline, refreshProjects]);

  // Restore last opened project from localStorage when server comes online
  useEffect(() => {
    const restoreProject = async () => {
      if (!state.isServerOnline || hasRestoredRef.current) return;

      hasRestoredRef.current = true;
      restoreAbortedRef.current = false;
      const savedProjectId = storage.getProjectId();

      if (savedProjectId) {
        console.log('[Project] Restoring project from localStorage:', savedProjectId);
        try {
          const project = await projectApi.get(savedProjectId);

          if (restoreAbortedRef.current) {
            console.log('[Project] Restore aborted - another project was opened');
            return;
          }

          setState((prev) => ({
            ...prev,
            currentProject: project,
            files: project.files || {},
            lastSyncedAt: Date.now(),
          }));

          lastFilesRef.current = JSON.stringify(project.files || {});
          onFilesChange?.(project.files || {});

          // Refresh git status
          try {
            if (restoreAbortedRef.current) return;

            const gitStatus = await gitApi.status(savedProjectId);

            if (restoreAbortedRef.current) return;

            setState((prev) => ({
              ...prev,
              gitStatus,
            }));
          } catch {
            // Git might not be initialized
          }

          if (!restoreAbortedRef.current) {
            console.log('[Project] Restored successfully:', project.name);
            isInitializedRef.current = true;
            setState((prev) => ({ ...prev, isInitialized: true }));
          }
        } catch (_err) {
          console.error('[Project] Failed to restore project:', _err);
          storage.setProjectId(null);
          isInitializedRef.current = true;
          setState((prev) => ({ ...prev, isInitialized: true }));
        }
      } else {
        isInitializedRef.current = true;
        setState((prev) => ({ ...prev, isInitialized: true }));
      }
    };

    restoreProject();
  }, [state.isServerOnline, onFilesChange]);

  // Enhanced openProject to fetch git status async
  const openProject = useCallback(
    async (id: string) => {
      const result = await crudOps.openProject(id);

      if (result.success) {
        // Refresh git status async - single source of truth
        gitApi
          .status(id)
          .then((gitStatus) => {
            if (openProjectIdRef.current === id) {
              setState((prev) => ({
                ...prev,
                gitStatus,
              }));
            }
          })
          .catch((error) => {
            if (openProjectIdRef.current === id) {
              console.debug('[Project] Git status refresh skipped:', error?.message || error);
            }
          });
      }

      return result;
    },
    [crudOps]
  );

  // ============================================================================
  // Context Management
  // ============================================================================

  const saveContext = useCallback(
    async (context: Partial<ProjectContext>): Promise<boolean> => {
      if (!state.currentProject) {
        console.warn('[Project] Cannot save context - no current project');
        return false;
      }

      try {
        await projectApi.saveContext(state.currentProject.id, context);
        console.log('[Project] Saved context for project:', state.currentProject.name);
        return true;
      } catch (_err) {
        console.error('[Project] Failed to save context:', _err);
        return false;
      }
    },
    [state.currentProject]
  );

  const getContext = useCallback(async (): Promise<ProjectContext | null> => {
    if (!state.currentProject) {
      return null;
    }

    try {
      return await projectApi.getContext(state.currentProject.id);
    } catch {
      return null;
    }
  }, [state.currentProject]);

  // ============================================================================
  // Utils
  // ============================================================================

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const timeoutRef = syncTimeoutRef;
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      autoSave.reset();
    };
  }, []);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    ...state,
    // Project CRUD
    createProject: crudOps.createProject,
    openProject,
    closeProject: crudOps.closeProject,
    deleteProject: crudOps.deleteProject,
    duplicateProject: crudOps.duplicateProject,
    refreshProjects: crudOps.refreshProjects,
    // File operations
    updateFiles: syncOps.updateFiles,
    syncFiles: syncOps.syncFiles,
    // Git operations
    initGit: gitOps.initGit,
    commit: gitOps.commit,
    refreshGitStatus: gitOps.refreshGitStatus,
    // Context
    saveContext,
    getContext,
    // Sync confirmation
    confirmPendingSync: syncOps.confirmPendingSync,
    cancelPendingSync: syncOps.cancelPendingSync,
    // Utils
    clearError,
  };
}

export default useProject;
