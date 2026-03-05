import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for the application.
 * - Ctrl+S: Prevent browser save dialog (WIP auto-saves automatically)
 *
 * Note: Undo/redo shortcuts are NOT intercepted here because Monaco editor
 * and other input elements manage their own undo/redo stacks. Intercepting
 * Ctrl+Z globally would conflict with in-editor undo behavior.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
