/**
 * Activity Logger Service
 *
 * Captures and manages FluidFlow internal logs for display in the Activity panel.
 * Uses an event-based pattern to notify subscribers of new log entries.
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';
export type LogCategory =
  | 'system'
  | 'ai'
  | 'git'
  | 'backup'
  | 'autocommit'
  | 'preview'
  | 'api'
  | 'file'
  | 'generation';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: string;
  duration?: number; // For timed operations (ms)
}

type LogSubscriber = (entry: ActivityLogEntry) => void;

class ActivityLogger {
  private logs: ActivityLogEntry[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private maxLogs = 500; // Keep last 500 logs
  private idCounter = 0;

  /**
   * Add a new log entry
   */
  log(level: LogLevel, category: LogCategory, message: string, details?: string): ActivityLogEntry {
    const entry: ActivityLogEntry = {
      id: `log-${Date.now()}-${this.idCounter++}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      details,
    };

    this.logs.push(entry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify subscribers
    this.subscribers.forEach(fn => fn(entry));

    return entry;
  }

  /**
   * Log with timing support - returns a function to complete the log
   */
  startTimed(category: LogCategory, message: string): () => void {
    const startTime = Date.now();
    const entry = this.log('info', category, `${message}...`);

    return () => {
      const duration = Date.now() - startTime;
      // Update the entry with completion
      const idx = this.logs.findIndex(l => l.id === entry.id);
      const current = this.logs[idx];
      if (idx >= 0 && current) {
        const updated: ActivityLogEntry = {
          ...current,
          level: 'success',
          message: message.replace('...', ''),
          duration,
        };
        this.logs[idx] = updated;
        // Re-notify with updated entry
        this.subscribers.forEach(fn => fn(updated));
      }
    };
  }

  // Convenience methods
  info(category: LogCategory, message: string, details?: string) {
    return this.log('info', category, message, details);
  }

  success(category: LogCategory, message: string, details?: string) {
    return this.log('success', category, message, details);
  }

  warn(category: LogCategory, message: string, details?: string) {
    return this.log('warning', category, message, details);
  }

  error(category: LogCategory, message: string, details?: string) {
    return this.log('error', category, message, details);
  }

  debug(category: LogCategory, message: string, details?: string) {
    return this.log('debug', category, message, details);
  }

  /**
   * Subscribe to new log entries
   */
  subscribe(fn: LogSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /**
   * Get all logs (for initial load)
   */
  getLogs(): ActivityLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by category
   */
  getLogsByCategory(category: LogCategory): ActivityLogEntry[] {
    return this.logs.filter(l => l.category === category);
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    // Notify subscribers of clear
    this.subscribers.forEach(fn => fn({
      id: 'clear',
      timestamp: Date.now(),
      level: 'info',
      category: 'system',
      message: 'Logs cleared',
    }));
  }
}

// Singleton instance
export const activityLogger = new ActivityLogger();

// Helper to format timestamps
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Helper to get category color - returns CSS variable value
export function getCategoryColor(category: LogCategory): string {
  const colors: Record<LogCategory, string> = {
    system: 'var(--theme-text-muted)',
    ai: 'var(--color-feature)',
    git: 'var(--color-warning)',
    backup: 'var(--color-info)',
    autocommit: 'var(--color-success)',
    preview: 'var(--color-info)',
    api: 'var(--color-warning)',
    file: 'var(--color-feature)',
    generation: 'var(--color-feature)',
  };
  return colors[category] || 'var(--theme-text-muted)';
}

// Helper to get level style - returns CSS variable values
export function getLevelStyle(level: LogLevel): { color: string; bgColor: string } {
  const styles: Record<LogLevel, { color: string; bgColor: string }> = {
    info: { color: 'var(--color-info)', bgColor: 'var(--color-info-subtle)' },
    success: { color: 'var(--color-success)', bgColor: 'var(--color-success-subtle)' },
    warning: { color: 'var(--color-warning)', bgColor: 'var(--color-warning-subtle)' },
    error: { color: 'var(--color-error)', bgColor: 'var(--color-error-subtle)' },
    debug: { color: 'var(--theme-text-dim)', bgColor: 'var(--theme-glass-200)' },
  };
  return styles[level] || styles.info;
}
