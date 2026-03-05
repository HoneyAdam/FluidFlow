import { useEffect } from 'react';
import { useHistory } from '../contexts/AppContext';

/**
 * Centralized keyboard shortcuts for the application.
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 * - Ctrl+S: Prevent browser save dialog (WIP auto-saves)
 */
export function useKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo } = useHistory();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.shiftKey) {
            if (canRedo) {
              e.preventDefault();
              redo();
            }
          } else {
            if (canUndo) {
              e.preventDefault();
              undo();
            }
          }
          break;
        case 'y':
          if (canRedo) {
            e.preventDefault();
            redo();
          }
          break;
        case 's':
          // Prevent browser save dialog - WIP auto-saves
          e.preventDefault();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, canUndo, canRedo]);
}
