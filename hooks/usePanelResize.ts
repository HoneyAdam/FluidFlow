/**
 * usePanelResize Hook
 *
 * Classic drag-to-resize panel divider.
 * - Mouse down on divider, drag left/right, release
 * - Double-click to reset to default
 * Stores panel width in localStorage for persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'fluidflow_panel_width';
const DEFAULT_WIDTH = 400; // Default left panel width in pixels
const MIN_WIDTH = 280; // Minimum - just enough for header icons, tabs, input
const MAX_WIDTH_PERCENT = 0.5; // Maximum left panel width (50% of container)

interface UsePanelResizeOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidthPercent?: number;
  storageKey?: string;
}

interface UsePanelResizeReturn {
  /** Current panel width in pixels */
  panelWidth: number;
  /** Whether currently dragging */
  isDragging: boolean;
  /** Props to spread on the divider element */
  dividerProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    onDoubleClick: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
    className: string;
  };
}

export function usePanelResize(options: UsePanelResizeOptions = {}): UsePanelResizeReturn {
  const {
    defaultWidth = DEFAULT_WIDTH,
    minWidth = MIN_WIDTH,
    maxWidthPercent = MAX_WIDTH_PERCENT,
    storageKey = STORAGE_KEY,
  } = options;

  // Load initial width from localStorage
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return defaultWidth;
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerLeftRef = useRef(0);

  // Calculate max width
  const getMaxWidth = useCallback(() => {
    return window.innerWidth * maxWidthPercent;
  }, [maxWidthPercent]);

  // Save width to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, panelWidth.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [panelWidth, storageKey]);

  // Handle mouse down - start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Find container left edge
    const container = (e.target as HTMLElement).closest('[data-panel-container]');
    containerLeftRef.current = container?.getBoundingClientRect().left || 0;

    setIsDragging(true);
  }, []);

  // Handle double-click to reset
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPanelWidth(defaultWidth);
  }, [defaultWidth]);

  // Global mouse move and mouse up handlers when dragging
  useEffect((): (() => void) | undefined => {
    if (!isDragging) return undefined;

    const handleMouseMove = (e: MouseEvent) => {
      const maxWidth = getMaxWidth();
      const newWidth = e.clientX - containerLeftRef.current;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Add global listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, getMaxWidth, minWidth]);

  // Divider props
  const dividerProps = {
    onMouseDown: handleMouseDown,
    onDoubleClick: handleDoubleClick,
    style: {
      cursor: 'ew-resize',
      backgroundColor: isDragging
        ? 'color-mix(in srgb, var(--theme-accent) 70%, transparent)'
        : 'transparent',
      width: isDragging ? '0.5rem' : '0.375rem',
    } as React.CSSProperties,
    className: `
      transition-all duration-150 shrink-0
      hover:w-2
    `.trim(),
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) {
        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--theme-accent) 50%, transparent)';
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) {
        e.currentTarget.style.backgroundColor = 'transparent';
      }
    },
  };

  return {
    panelWidth,
    isDragging,
    dividerProps,
  };
}

export default usePanelResize;
