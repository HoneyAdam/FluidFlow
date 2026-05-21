/**
 * useScreenshot Hook
 *
 * Provides screenshot capture and management for preview panels.
 * Integrates with the project system to save screenshots.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { screenshotService } from '@/services/screenshotService';
import type { ScreenshotMeta } from '@/services/api/types';

interface UseScreenshotOptions {
  projectId: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  autoCapture?: boolean;
  autoCaptureDelay?: number;
  /** Trigger auto-capture when this value changes (e.g., file hash or timestamp) */
  triggerOnChange?: string | number | null;
  /** Minimum time between auto-captures in ms */
  autoCaptureThrottle?: number;
  /** Callback fired when a screenshot is successfully captured and saved */
  onCapture?: (metadata: ScreenshotMeta) => void;
}

interface UseScreenshotReturn {
  // State
  isCapturing: boolean;
  lastScreenshot: ScreenshotMeta | null;
  error: string | null;

  // Actions
  capture: () => Promise<ScreenshotMeta | null>;
  getLatestThumbnail: () => Promise<string | null>;
}

export function useScreenshot({
  projectId,
  iframeRef,
  autoCapture = false,
  autoCaptureDelay = 2000,
  triggerOnChange,
  autoCaptureThrottle = 30000, // Default 30 seconds between auto-captures
  onCapture,
}: UseScreenshotOptions): UseScreenshotReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store pending capture promise resolver
  const pendingCaptureRef = useRef<{
    resolve: (value: ScreenshotMeta | null) => void;
    reject: (error: Error) => void;
  } | null>(null);

  // Track last auto-capture time for throttling
  const lastAutoCaptureRef = useRef<number>(0);
  // Track previous trigger value
  const prevTriggerRef = useRef<string | number | null>(null);

  // Handle screenshot captured message from iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || !projectId) return;

      if (event.data.type === 'SCREENSHOT_CAPTURED') {
        const { dataUrl, width, height, format } = event.data;

        try {
          // Save screenshot
          const metadata = await screenshotService.save(projectId, dataUrl, {
            width,
            height,
            format: format || 'png',
          });

          // Update project metadata
          await screenshotService.updateProject(projectId, metadata);

          setLastScreenshot(metadata);
          setError(null);

          // Call onCapture callback if provided
          onCapture?.(metadata);

          // Resolve pending promise
          if (pendingCaptureRef.current) {
            pendingCaptureRef.current.resolve(metadata);
            pendingCaptureRef.current = null;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save screenshot';
          setError(message);

          if (pendingCaptureRef.current) {
            pendingCaptureRef.current.reject(new Error(message));
            pendingCaptureRef.current = null;
          }
        } finally {
          setIsCapturing(false);
        }
      }

      if (event.data.type === 'SCREENSHOT_ERROR') {
        const message = event.data.error || 'Screenshot capture failed';
        setError(message);
        setIsCapturing(false);

        if (pendingCaptureRef.current) {
          pendingCaptureRef.current.reject(new Error(message));
          pendingCaptureRef.current = null;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [projectId, onCapture]);

  // Auto-capture after delay (initial)
  useEffect((): (() => void) | undefined => {
    if (!autoCapture || !projectId || !iframeRef.current) return undefined;

    const timer = setTimeout(() => {
      capture().then(() => {
        lastAutoCaptureRef.current = Date.now();
      }).catch((err) => console.debug('[useScreenshot] Auto-capture failed:', err));
    }, autoCaptureDelay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture is stable and circular dependency is intentional
  }, [autoCapture, autoCaptureDelay, projectId]);

  // Auto-capture on significant changes (triggered by triggerOnChange)
  useEffect((): (() => void) | undefined => {
    if (!autoCapture || !projectId || !iframeRef.current) return undefined;

    // Only trigger if the value actually changed
    if (triggerOnChange === prevTriggerRef.current) return undefined;

    // Skip first render (no previous value)
    if (prevTriggerRef.current === null) {
      prevTriggerRef.current = triggerOnChange ?? null;
      return undefined;
    }

    prevTriggerRef.current = triggerOnChange ?? null;

    // Throttle auto-captures
    const now = Date.now();
    const timeSinceLastCapture = now - lastAutoCaptureRef.current;
    if (timeSinceLastCapture < autoCaptureThrottle) {
      console.log(`[Screenshot] Auto-capture throttled (${Math.round((autoCaptureThrottle - timeSinceLastCapture) / 1000)}s remaining)`);
      return undefined;
    }

    // Wait for preview to stabilize before capturing
    const timer = setTimeout(() => {
      console.log('[Screenshot] Auto-capturing after file change');
      capture().then(() => {
        lastAutoCaptureRef.current = Date.now();
      }).catch((err) => {
        console.warn('[Screenshot] Auto-capture failed:', err.message);
      });
    }, autoCaptureDelay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture is stable and circular dependency is intentional
  }, [autoCapture, projectId, triggerOnChange, autoCaptureDelay, autoCaptureThrottle]);

  // Capture screenshot
  const capture = useCallback((): Promise<ScreenshotMeta | null> => {
    return new Promise((resolve, reject) => {
      if (!projectId) {
        reject(new Error('No project selected'));
        return;
      }

      if (!iframeRef.current) {
        reject(new Error('Preview iframe not ready'));
        return;
      }

      if (isCapturing) {
        reject(new Error('Capture already in progress'));
        return;
      }

      setIsCapturing(true);
      setError(null);
      pendingCaptureRef.current = { resolve, reject };

      // Request screenshot from iframe
      screenshotService.requestCapture(iframeRef.current, {
        format: 'png',
        quality: 0.92,
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingCaptureRef.current) {
          pendingCaptureRef.current.reject(new Error('Screenshot capture timed out'));
          pendingCaptureRef.current = null;
          setIsCapturing(false);
        }
      }, 10000);
    });
  }, [projectId, iframeRef, isCapturing]);

  // Get latest thumbnail
  const getLatestThumbnail = useCallback(async (): Promise<string | null> => {
    if (!projectId) return null;
    return screenshotService.getLatestThumbnail(projectId);
  }, [projectId]);

  return {
    isCapturing,
    lastScreenshot,
    error,
    capture,
    getLatestThumbnail,
  };
}

export default useScreenshot;
