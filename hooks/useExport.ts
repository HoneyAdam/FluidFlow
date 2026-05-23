/**
 * useExport Hook
 *
 * Handles project export functionality including ZIP download
 * and GitHub push operations.
 * Delegates to services/export for business logic.
 */

import { useState, useCallback, useEffect } from 'react';
import { FileSystem, PushResult } from '../types';
import { githubApi } from '../services/api/github';
import {
  downloadAsZip as downloadAsZipService,
  pushToNewGithubRepo,
} from '../services/export';

export interface UseExportOptions {
  files: FileSystem;
  appCode: string | undefined;
  projectId?: string | null;
}

export interface UseExportReturn {
  // Export modal
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  isDownloading: boolean;
  downloadAsZip: () => Promise<void>;

  // GitHub modal
  showGithubModal: boolean;
  setShowGithubModal: (show: boolean) => void;
  githubToken: string;
  setGithubToken: (token: string) => void;
  repoName: string;
  setRepoName: (name: string) => void;
  isPushing: boolean;
  pushResult: PushResult | null;
  setPushResult: (result: PushResult | null) => void;
  pushToGithub: () => Promise<void>;

  // Push to existing repo
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  hasRemote: boolean;
  currentRemoteUrl: string;
  pushToExisting: (force?: boolean) => Promise<void>;
}

export function useExport(options: UseExportOptions): UseExportReturn {
  const { files, appCode, projectId } = options;

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // GitHub modal state
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('fluidflow-app');
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  // Push to existing repo state
  const [repoUrl, setRepoUrl] = useState('');
  const [hasRemote, setHasRemote] = useState(false);
  const [currentRemoteUrl, setCurrentRemoteUrl] = useState('');

  // Load remote info when projectId changes or modal opens.
  // Cancellation flag: if projectId switches mid-fetch, the older response
  // must not overwrite remote state for the newer project.
  useEffect((): (() => void) | undefined => {
    if (!projectId || !showGithubModal) return undefined;
    let cancelled = false;

    const loadRemotes = async () => {
      try {
        const result = await githubApi.getRemotes(projectId);
        if (cancelled) return;
        if (result.initialized && result.remotes.length > 0) {
          const origin = result.remotes.find(r => r.name === 'origin');
          if (origin) {
            setHasRemote(true);
            setCurrentRemoteUrl(origin.push || origin.fetch || '');
          }
        } else {
          setHasRemote(false);
          setCurrentRemoteUrl('');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load remotes:', err);
        setHasRemote(false);
        setCurrentRemoteUrl('');
      }
    };
    loadRemotes();
    return () => { cancelled = true; };
  }, [projectId, showGithubModal]);

  /**
   * Download project as ZIP file — delegates to service
   */
  const downloadAsZip = useCallback(async () => {
    if (!appCode) return;
    setIsDownloading(true);
    try {
      await downloadAsZipService(files, repoName);
    } catch (error) {
      console.error('[Export] ZIP download failed:', error);
    } finally {
      setIsDownloading(false);
      setShowExportModal(false);
    }
  }, [appCode, files, repoName]);

  /**
   * Push project to GitHub — delegates to service
   */
  const pushToGithub = useCallback(async () => {
    if (!githubToken || !repoName || !appCode) return;
    setIsPushing(true);
    setPushResult(null);

    try {
      const result = await pushToNewGithubRepo(githubToken, repoName, files);
      setPushResult(result);
    } finally {
      setIsPushing(false);
    }
  }, [githubToken, repoName, appCode, files]);

  /**
   * Push to existing GitHub repository
   */
  const pushToExisting = useCallback(async (force?: boolean) => {
    if (!projectId || !githubToken) return;

    setIsPushing(true);
    setPushResult(null);

    try {
      // If there's a new repo URL and no remote configured, set the remote first
      if (repoUrl && !currentRemoteUrl) {
        await githubApi.setRemote(projectId, repoUrl, 'origin');
        setCurrentRemoteUrl(repoUrl);
        setHasRemote(true);
      }

      // Push using backend API (which uses simple-git)
      await githubApi.push(projectId, {
        force: force || false,
      });

      // Try to get the repo URL for the success message
      const remotes = await githubApi.getRemotes(projectId);
      const origin = remotes.remotes.find(r => r.name === 'origin');
      const url = origin?.push?.replace(/\.git$/, '').replace(/^https:\/\/.*@/, 'https://') || '';

      setPushResult({
        success: true,
        url: url || undefined,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to push to GitHub';
      setPushResult({ success: false, error: msg });
    } finally {
      setIsPushing(false);
    }
  }, [projectId, githubToken, repoUrl, currentRemoteUrl]);

  return {
    // Export modal
    showExportModal,
    setShowExportModal,
    isDownloading,
    downloadAsZip,

    // GitHub modal
    showGithubModal,
    setShowGithubModal,
    githubToken,
    setGithubToken,
    repoName,
    setRepoName,
    isPushing,
    pushResult,
    setPushResult,
    pushToGithub,

    // Push to existing repo
    repoUrl,
    setRepoUrl,
    hasRemote,
    currentRemoteUrl,
    pushToExisting,
  };
}
