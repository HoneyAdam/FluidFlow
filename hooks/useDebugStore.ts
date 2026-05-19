import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { DebugLogEntry, DebugState } from '@/types';

const MAX_LOGS = 500;
const DEBUG_ENABLED_KEY = 'fluidflow_debug_enabled';

// BUG-034 FIX: Define valid categories as a const array for validation
// Note: 'git-commit', 'auto-commit', 'prompt-improver' skip prompt confirmation modal
const VALID_CATEGORIES = ['generation', 'accessibility', 'quick-edit', 'auto-fix', 'git-commit', 'auto-commit', 'prompt-improver', 'tool-call', 'other'] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

// BUG-034 FIX: Validate category and fallback to 'other' if invalid
function validateCategory(category: DebugLogEntry['category']): ValidCategory {
  if (VALID_CATEGORIES.includes(category as ValidCategory)) {
    return category as ValidCategory;
  }
  console.warn(`[DebugStore] Invalid category "${category}", falling back to "other"`);
  return 'other';
}

// Load initial enabled state from localStorage
function getInitialEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(DEBUG_ENABLED_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

const initialState: DebugState = {
  enabled: getInitialEnabled(),
  logs: [],
  maxLogs: MAX_LOGS,
  filter: {
    types: ['request', 'response', 'stream', 'error', 'info', 'tool-call'],
    categories: ['generation', 'accessibility', 'quick-edit', 'auto-fix', 'git-commit', 'auto-commit', 'prompt-improver', 'tool-call', 'other'],
    searchQuery: '',
  },
};

let globalDebugState: DebugState = initialState;
const globalListeners: Set<() => void> = new Set();

// useSyncExternalStore helpers
function subscribe(listener: () => void): () => void {
  globalListeners.add(listener);
  return () => { globalListeners.delete(listener); };
}

function getSnapshot(): DebugState {
  return globalDebugState;
}

// Reset global debug state - useful for app resets or testing
export function resetDebugState(): void {
  // Clear any pending debounce timer
  if (updateDebounceTimer) {
    clearTimeout(updateDebounceTimer);
    updateDebounceTimer = null;
  }
  // Reset to initial state (preserves enabled setting from localStorage)
  globalDebugState = {
    ...initialState,
    enabled: getInitialEnabled(), // Reload from localStorage
  };
  // Notify all listeners
  globalListeners.forEach(listener => listener());
}

// Global functions for logging from anywhere
export const debugLog = {
  isEnabled: () => globalDebugState.enabled,

  request: (category: DebugLogEntry['category'], data: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return data.id || crypto.randomUUID();
    const id = data.id || crypto.randomUUID();
    addLog({
      id,
      timestamp: Date.now(),
      type: 'request',
      category: validateCategory(category), // BUG-034 FIX
      ...data,
    });
    return id;
  },

  response: (category: DebugLogEntry['category'], data: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return;
    addLog({
      id: data.id || crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'response',
      category: validateCategory(category), // BUG-034 FIX
      ...data,
    });
  },

  stream: (category: DebugLogEntry['category'], data: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return;
    addLog({
      id: data.id || crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'stream',
      category: validateCategory(category), // BUG-034 FIX
      ...data,
    });
  },

  // Update an existing stream log entry (for live streaming updates)
  // Pass complete=true when streaming finishes to immediately update UI
  streamUpdate: (id: string, data: Partial<DebugLogEntry>, complete = false) => {
    if (!globalDebugState.enabled) return;
    updateLog(id, {
      ...data,
      timestamp: Date.now(), // Update timestamp to show "live" status
    }, complete); // notifyNow = complete
  },

  error: (category: DebugLogEntry['category'], error: string, data?: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return;
    addLog({
      id: data?.id || crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'error',
      category: validateCategory(category), // BUG-034 FIX
      error,
      ...data,
    });
  },

  info: (category: DebugLogEntry['category'], message: string, data?: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return;
    addLog({
      id: data?.id || crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'info',
      category: validateCategory(category), // BUG-034 FIX
      response: message,
      ...data,
    });
  },

  // Tool call specific logging
  toolCall: (category: DebugLogEntry['category'], data: Partial<DebugLogEntry>) => {
    if (!globalDebugState.enabled) return;
    addLog({
      id: data.id || crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'tool-call',
      category: validateCategory(category),
      ...data,
    });
  },
};

function addLog(entry: DebugLogEntry) {
  // Check if log with same ID already exists - prevent duplicates
  const existingIndex = globalDebugState.logs.findIndex(log => log.id === entry.id);

  if (existingIndex !== -1) {
    // Update existing log instead of adding duplicate
    const updatedLogs = [...globalDebugState.logs];
    updatedLogs[existingIndex] = { ...updatedLogs[existingIndex], ...entry };
    globalDebugState = {
      ...globalDebugState,
      logs: updatedLogs,
    };
  } else {
    // Add new log
    globalDebugState = {
      ...globalDebugState,
      logs: [entry, ...globalDebugState.logs].slice(0, globalDebugState.maxLogs),
    };
  }
  globalListeners.forEach(listener => listener());
}

// Debounce timer for log updates
let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function updateLog(id: string, updates: Partial<DebugLogEntry>, notifyNow = false) {
  const logIndex = globalDebugState.logs.findIndex(log => log.id === id);
  if (logIndex === -1) return false;

  const updatedLogs = [...globalDebugState.logs];
  updatedLogs[logIndex] = { ...updatedLogs[logIndex], ...updates };

  globalDebugState = {
    ...globalDebugState,
    logs: updatedLogs,
  };

  // Debounce listener notifications to avoid blocking during rapid updates
  if (notifyNow) {
    // Immediate notification (e.g., when stream completes)
    if (updateDebounceTimer) {
      clearTimeout(updateDebounceTimer);
      updateDebounceTimer = null;
    }
    globalListeners.forEach(listener => listener());
  } else {
    // Debounced notification (during streaming)
    if (!updateDebounceTimer) {
      updateDebounceTimer = setTimeout(() => {
        updateDebounceTimer = null;
        globalListeners.forEach(listener => listener());
      }, 500); // Update UI every 500ms max
    }
  }
  return true;
}

export function useDebugStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const setEnabled = useCallback((enabled: boolean) => {
    globalDebugState = { ...globalDebugState, enabled };
    try {
      localStorage.setItem(DEBUG_ENABLED_KEY, String(enabled));
    } catch {
      // Ignore localStorage errors
    }
    globalListeners.forEach(listener => listener());
  }, []);

  const clearLogs = useCallback(() => {
    globalDebugState = { ...globalDebugState, logs: [] };
    globalListeners.forEach(listener => listener());
  }, []);

  const setFilter = useCallback((filter: Partial<DebugState['filter']>) => {
    globalDebugState = {
      ...globalDebugState,
      filter: { ...globalDebugState.filter, ...filter },
    };
    globalListeners.forEach(listener => listener());
  }, []);

  const filteredLogs = useMemo(() => {
    const { types, categories, searchQuery } = state.filter;
    return state.logs.filter(log => {
      if (!types.includes(log.type)) return false;
      if (!categories.includes(log.category)) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          log.prompt,
          log.response,
          log.error,
          log.model,
          JSON.stringify(log.metadata),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchableText.includes(query)) return false;
      }
      return true;
    });
  }, [state]);

  return {
    enabled: state.enabled,
    logs: state.logs,
    filteredLogs,
    filter: state.filter,
    setEnabled,
    clearLogs,
    setFilter,
    addLog,
    updateLog,
  };
}

export default useDebugStore;
