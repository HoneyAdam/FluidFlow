import { useState, useCallback, useEffect, useRef } from 'react';
import { AIHistoryEntry, projectApi } from '../services/projectApi';

export interface UseAIHistoryReturn {
  history: AIHistoryEntry[];
  addEntry: (entry: Omit<AIHistoryEntry, 'id'>) => string;
  getEntry: (id: string) => AIHistoryEntry | undefined;
  clearHistory: () => void;
  deleteEntry: (id: string) => void;
  isLoading: boolean;
  lastSaved: number | null;
  // For debugging - get last N entries
  getRecent: (count?: number) => AIHistoryEntry[];
  // Export for backup
  exportHistory: () => string;
  // Get raw response by ID (for debugging truncated responses)
  getRawResponse: (id: string) => string | undefined;
}

const MAX_HISTORY_SIZE = 100; // Keep last 100 generations
const SAVE_DEBOUNCE_MS = 1000; // Reduced for faster saves

// Module-level debug state (replaces window globals)
let _lastAIHistoryEntry: AIHistoryEntry | null = null;
let _aiHistoryCount = 0;

/** Get the most recently added AI history entry (for debugging) */
export function getLastAIHistoryEntry(): AIHistoryEntry | null {
  return _lastAIHistoryEntry;
}

/** Get total AI history entry count (for debugging) */
export function getAIHistoryCount(): number {
  return _aiHistoryCount;
}

export function useAIHistory(projectId: string | null): UseAIHistoryReturn {
  const [history, setHistory] = useState<AIHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedProjectRef = useRef<string | null>(null);
  const pendingHistoryRef = useRef<AIHistoryEntry[] | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const isSavingRef = useRef<boolean>(false); // Lock to prevent concurrent saves
  const pendingSaveRef = useRef<AIHistoryEntry[] | null>(null); // Queue for next save
  const saveWithLockRef = useRef<((entries: AIHistoryEntry[]) => Promise<void>) | null>(null);

  // Keep projectId ref updated for beforeunload
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Thread-safe save with queueing to prevent race conditions
  const saveWithLock = useCallback(async (entries: AIHistoryEntry[]): Promise<void> => {
    const pid = projectIdRef.current;
    if (!pid) return;

    // If already saving, queue this save for later
    if (isSavingRef.current) {
      pendingSaveRef.current = entries;
      console.log('[AIHistory] Save queued (another save in progress)');
      return;
    }

    isSavingRef.current = true;
    pendingHistoryRef.current = entries;

    try {
      await projectApi.saveContext(pid, { aiHistory: entries });
      setLastSaved(Date.now());
      pendingHistoryRef.current = null;
      console.log(`[AIHistory] Saved ${entries.length} entries`);
    } catch (err) {
      console.error('[AIHistory] Save failed:', err);
      // Keep pendingHistoryRef for beforeunload fallback
    } finally {
      isSavingRef.current = false;

      // Process any queued save - use ref to avoid stale closure
      const queuedData = pendingSaveRef.current;
      if (queuedData && saveWithLockRef.current) {
        pendingSaveRef.current = null;
        // Use setTimeout to avoid stack overflow on rapid saves
        setTimeout(() => saveWithLockRef.current?.(queuedData), 0);
      }
    }
  }, []);

  // Keep ref updated to avoid stale closure in recursive call
  useEffect(() => {
    saveWithLockRef.current = saveWithLock;
  }, [saveWithLock]);

  // Load history from backend when project changes
  useEffect((): (() => void) | undefined => {
    console.log(`[AIHistory] useEffect triggered - projectId: ${projectId}, loadedRef: ${loadedProjectRef.current}`);

    if (!projectId) {
      console.log('[AIHistory] No projectId, skipping load');
      return undefined;
    }

    if (projectId === loadedProjectRef.current) {
      console.log('[AIHistory] Already loaded for this project, skipping');
      return undefined;
    }

    // Race guard: if the user switches projects mid-load, the older request's
    // response must NOT clobber the newer project's state.
    let cancelled = false;

    const loadHistory = async () => {
      console.log(`[AIHistory] Loading history for project: ${projectId}`);
      setIsLoading(true);
      try {
        const context = await projectApi.getContext(projectId);
        if (cancelled) return;
        console.log(`[AIHistory] Got context:`, {
          hasAiHistory: !!context.aiHistory,
          aiHistoryLength: context.aiHistory?.length || 0,
          contextKeys: Object.keys(context)
        });

        if (context.aiHistory && context.aiHistory.length > 0) {
          setHistory(context.aiHistory);
          console.log(`[AIHistory] ✓ Loaded ${context.aiHistory.length} entries for project ${projectId}`);
        } else {
          setHistory([]);
          console.log('[AIHistory] No history found in context');
        }
        loadedProjectRef.current = projectId;
      } catch (error) {
        if (cancelled) return;
        console.error('[AIHistory] Failed to load:', error);
        setHistory([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadHistory();
    return () => { cancelled = true; };
  }, [projectId]);

  // Debounced save to backend (fallback for failed immediate saves)
  const _saveToBackend = useCallback(async (entries: AIHistoryEntry[]) => {
    if (!projectId) return;

    // Track pending save
    pendingHistoryRef.current = entries;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await projectApi.saveContext(projectId, { aiHistory: entries });
        setLastSaved(Date.now());
        pendingHistoryRef.current = null; // Clear pending after successful save
        console.log(`[AIHistory] Saved ${entries.length} entries to backend`);
      } catch (error) {
        console.error('[AIHistory] Failed to save to backend:', error);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [projectId]);

  // Add new entry
  const addEntry = useCallback((entry: Omit<AIHistoryEntry, 'id'>): string => {
    const id = crypto.randomUUID();
    const newEntry: AIHistoryEntry = { ...entry, id };

    setHistory(prev => {
      const updated = [newEntry, ...prev].slice(0, MAX_HISTORY_SIZE);

      // Use thread-safe save with queueing
      saveWithLock(updated);

      return updated;
    });

    // Store for debugging access via exported getters
    _lastAIHistoryEntry = newEntry;
    _aiHistoryCount = history.length + 1;

    console.log(`[AIHistory] Added entry ${id} (${entry.success ? 'success' : 'failed'})`);
    return id;
  }, [history.length, saveWithLock]);

  // Get entry by ID
  const getEntry = useCallback((id: string): AIHistoryEntry | undefined => {
    return history.find(e => e.id === id);
  }, [history]);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    // Use thread-safe save with queueing
    saveWithLock([]);
    console.log('[AIHistory] Cleared all history');
  }, [saveWithLock]);

  // Delete single entry
  const deleteEntry = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id);

      // Use thread-safe save with queueing
      saveWithLock(updated);
      console.log(`[AIHistory] Deleted entry ${id}`);

      return updated;
    });
  }, [saveWithLock]);

  // Get recent entries
  const getRecent = useCallback((count: number = 10): AIHistoryEntry[] => {
    return history.slice(0, count);
  }, [history]);

  // Export history as JSON
  const exportHistory = useCallback((): string => {
    return JSON.stringify(history, null, 2);
  }, [history]);

  // Get raw response by ID
  const getRawResponse = useCallback((id: string): string | undefined => {
    const entry = history.find(e => e.id === id);
    return entry?.rawResponse;
  }, [history]);

  // Handle beforeunload - save pending changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pid = projectIdRef.current;
      const pending = pendingHistoryRef.current;

      if (pid && pending && pending.length > 0) {
        console.log('[AIHistory] Page unload - saving pending changes via beacon');
        // Use sendBeacon for reliable saves during page unload
        // Prefer the same relative API base used by the normal client to avoid
        // mixed-content issues when the frontend runs over HTTPS.
        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const url = `${apiBase}/projects/${pid}/context`;
        const data = JSON.stringify({ aiHistory: pending });
        navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Also flush pending on unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const pid = projectIdRef.current;
      const pending = pendingHistoryRef.current;
      if (pid && pending && pending.length > 0) {
        // Sync save on unmount (not page close, so fetch is fine)
        projectApi.saveContext(pid, { aiHistory: pending }).catch(console.error);
      }
    };
  }, []);

  return {
    history,
    addEntry,
    getEntry,
    clearHistory,
    deleteEntry,
    isLoading,
    lastSaved,
    getRecent,
    exportHistory,
    getRawResponse,
  };
}
