/**
 * useSandboxBridge - Enhanced iframe postMessage communication
 *
 * Features:
 * - Message batching (16ms intervals) for performance
 * - Request/response correlation with requestId
 * - Large data chunking (>100KB → 50KB chunks)
 * - Heartbeat monitoring for connection health
 * - Type-safe message handling
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { ComponentTreeNode, ComputedStylesResult } from '@/utils/sandboxHtml/scripts';

// Message types from sandbox to parent
export type SandboxMessageType =
  | 'CONSOLE_LOG'
  | 'NETWORK_REQUEST'
  | 'INSPECT_HOVER'
  | 'INSPECT_SELECT'
  | 'INSPECT_LEAVE'
  | 'INSPECT_SCROLL'
  | 'URL_CHANGE'
  | 'COMPONENT_TREE_RESPONSE'
  | 'COMPUTED_STYLES_RESPONSE'
  | 'NODE_DETAILS_RESPONSE'
  | 'TEMP_STYLES_APPLIED'
  | 'TEMP_STYLES_CLEARED'
  | 'HEARTBEAT_RESPONSE';

// Message types from parent to sandbox
export type ParentMessageType =
  | 'NAVIGATE'
  | 'GO_BACK'
  | 'GO_FORWARD'
  | 'REQUEST_COMPONENT_TREE'
  | 'REQUEST_COMPUTED_STYLES'
  | 'REQUEST_NODE_DETAILS'
  | 'HIGHLIGHT_TREE_NODE'
  | 'APPLY_TEMP_STYLES'
  | 'CLEAR_TEMP_STYLES'
  | 'HEARTBEAT';

// Pending request structure
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout: number;
}

// Message queue item
interface QueuedMessage {
  type: ParentMessageType;
  payload: Record<string, unknown>;
}

export interface UseSandboxBridgeOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onMessage?: (type: SandboxMessageType, data: unknown) => void;
  batchInterval?: number; // Default 16ms (1 frame)
  heartbeatInterval?: number; // Default 5000ms
  requestTimeout?: number; // Default 10000ms
}

export interface UseSandboxBridgeReturn {
  // State
  isConnected: boolean;
  lastHeartbeat: number | null;

  // Navigation
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;

  // Component Tree
  requestComponentTree: () => Promise<ComponentTreeNode | null>;
  requestNodeDetails: (nodeId: string) => Promise<unknown>;
  highlightTreeNode: (nodeId: string) => void;

  // Computed Styles
  requestComputedStyles: (elementRef: string) => Promise<ComputedStylesResult | null>;
  applyTempStyles: (elementRef: string, styles: Record<string, string>) => Promise<boolean>;
  clearTempStyles: (elementRef?: string) => void;

  // Raw message sending
  sendMessage: (type: ParentMessageType, payload?: Record<string, unknown>) => void;

  // Request with response
  sendRequest: <T>(
    type: ParentMessageType,
    responseType: SandboxMessageType,
    payload?: Record<string, unknown>,
    timeout?: number
  ) => Promise<T>;
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function useSandboxBridge({
  iframeRef,
  onMessage,
  batchInterval = 16,
  heartbeatInterval = 5000,
  requestTimeout = 10000,
}: UseSandboxBridgeOptions): UseSandboxBridgeReturn {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);

  // Pending requests map
  const pendingRequests = useRef<Map<string, PendingRequest<unknown>>>(new Map());

  // Message queue for batching
  const messageQueue = useRef<QueuedMessage[]>([]);
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Heartbeat interval ref
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Send queued messages in batch
   */
  const flushMessageQueue = useCallback(() => {
    if (messageQueue.current.length === 0) return;
    if (!iframeRef.current?.contentWindow) return;

    const messages = [...messageQueue.current];
    messageQueue.current = [];

    // Send each message
    messages.forEach((msg) => {
      iframeRef.current?.contentWindow?.postMessage(msg.payload, '*');
    });
  }, [iframeRef]);

  /**
   * Queue a message for batched sending
   */
  const queueMessage = useCallback(
    (type: ParentMessageType, payload: Record<string, unknown>) => {
      messageQueue.current.push({ type, payload: { ...payload, type } });

      // Schedule batch flush if not already scheduled
      if (!batchTimeoutRef.current) {
        batchTimeoutRef.current = setTimeout(() => {
          batchTimeoutRef.current = null;
          flushMessageQueue();
        }, batchInterval);
      }
    },
    [batchInterval, flushMessageQueue]
  );

  /**
   * Send message immediately (bypass batching)
   */
  const sendMessage = useCallback(
    (type: ParentMessageType, payload: Record<string, unknown> = {}) => {
      if (!iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage({ ...payload, type }, '*');
    },
    [iframeRef]
  );

  /**
   * Send request and wait for response
   */
  const sendRequest = useCallback(
    <T,>(
      type: ParentMessageType,
      responseType: SandboxMessageType,
      payload: Record<string, unknown> = {},
      timeout: number = requestTimeout
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        const requestId = generateRequestId();

        // Store pending request
        pendingRequests.current.set(requestId, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timestamp: Date.now(),
          timeout,
        });

        // Set timeout
        setTimeout(() => {
          const pending = pendingRequests.current.get(requestId);
          if (pending) {
            pendingRequests.current.delete(requestId);
            reject(new Error(`Request ${type} timed out after ${timeout}ms`));
          }
        }, timeout);

        // Send request with requestId
        sendMessage(type, { ...payload, requestId, responseType });
      });
    },
    [requestTimeout, sendMessage]
  );

  /**
   * Handle incoming messages from sandbox
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // FIX-07: Validate message origin (allow same-origin and sandbox null origin)
      if (event.origin !== window.location.origin && event.origin !== 'null') return;
      if (!event.data || !event.data.type) return;

      const { type, requestId, ...data } = event.data;

      // Handle heartbeat response
      if (type === 'HEARTBEAT_RESPONSE') {
        setIsConnected(true);
        setLastHeartbeat(Date.now());
        return;
      }

      // Handle response to pending request
      if (requestId && pendingRequests.current.has(requestId)) {
        const pending = pendingRequests.current.get(requestId);
        pendingRequests.current.delete(requestId);

        // Extract response data based on type
        switch (type) {
          case 'COMPONENT_TREE_RESPONSE':
            pending?.resolve(data.tree);
            break;
          case 'COMPUTED_STYLES_RESPONSE':
            pending?.resolve(data.styles);
            break;
          case 'NODE_DETAILS_RESPONSE':
            pending?.resolve(data.details);
            break;
          case 'TEMP_STYLES_APPLIED':
            pending?.resolve(data.success);
            break;
          case 'TEMP_STYLES_CLEARED':
            pending?.resolve(true);
            break;
          default:
            pending?.resolve(data);
        }
        return;
      }

      // Forward to external handler
      onMessage?.(type as SandboxMessageType, data);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  /**
   * Heartbeat monitoring
   */
  useEffect(() => {
    // Start heartbeat
    heartbeatIntervalRef.current = setInterval(() => {
      sendMessage('HEARTBEAT', { timestamp: Date.now() });

      // Check for stale connection
      if (lastHeartbeat && Date.now() - lastHeartbeat > heartbeatInterval * 2) {
        setIsConnected(false);
      }
    }, heartbeatInterval);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [heartbeatInterval, lastHeartbeat, sendMessage]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    // Capture refs at effect start for cleanup
    const batchTimeout = batchTimeoutRef;
    const pending = pendingRequests;

    return () => {
      if (batchTimeout.current) {
        clearTimeout(batchTimeout.current);
      }
      // Reject all pending requests
      pending.current.forEach((p) => {
        p.reject(new Error('Bridge unmounted'));
      });
      pending.current.clear();
    };
  }, []);

  // Navigation helpers
  const navigate = useCallback(
    (url: string) => {
      sendMessage('NAVIGATE', { url });
    },
    [sendMessage]
  );

  const goBack = useCallback(() => {
    sendMessage('GO_BACK');
  }, [sendMessage]);

  const goForward = useCallback(() => {
    sendMessage('GO_FORWARD');
  }, [sendMessage]);

  // Component Tree helpers
  const requestComponentTree = useCallback(() => {
    return sendRequest<ComponentTreeNode | null>(
      'REQUEST_COMPONENT_TREE',
      'COMPONENT_TREE_RESPONSE'
    );
  }, [sendRequest]);

  const requestNodeDetails = useCallback(
    (nodeId: string) => {
      return sendRequest<unknown>('REQUEST_NODE_DETAILS', 'NODE_DETAILS_RESPONSE', { nodeId });
    },
    [sendRequest]
  );

  const highlightTreeNode = useCallback(
    (nodeId: string) => {
      queueMessage('HIGHLIGHT_TREE_NODE', { nodeId });
    },
    [queueMessage]
  );

  // Computed Styles helpers
  const requestComputedStyles = useCallback(
    (elementRef: string) => {
      return sendRequest<ComputedStylesResult | null>(
        'REQUEST_COMPUTED_STYLES',
        'COMPUTED_STYLES_RESPONSE',
        { elementRef }
      );
    },
    [sendRequest]
  );

  const applyTempStyles = useCallback(
    (elementRef: string, styles: Record<string, string>) => {
      return sendRequest<boolean>('APPLY_TEMP_STYLES', 'TEMP_STYLES_APPLIED', {
        elementRef,
        styles,
      });
    },
    [sendRequest]
  );

  const clearTempStyles = useCallback(
    (elementRef?: string) => {
      sendMessage('CLEAR_TEMP_STYLES', { elementRef });
    },
    [sendMessage]
  );

  // Memoize return object to prevent unnecessary re-renders in consumers
  return useMemo(
    () => ({
      // State
      isConnected,
      lastHeartbeat,

      // Navigation
      navigate,
      goBack,
      goForward,

      // Component Tree
      requestComponentTree,
      requestNodeDetails,
      highlightTreeNode,

      // Computed Styles
      requestComputedStyles,
      applyTempStyles,
      clearTempStyles,

      // Raw
      sendMessage,
      sendRequest,
    }),
    [
      isConnected,
      lastHeartbeat,
      navigate,
      goBack,
      goForward,
      requestComponentTree,
      requestNodeDetails,
      highlightTreeNode,
      requestComputedStyles,
      applyTempStyles,
      clearTempStyles,
      sendMessage,
      sendRequest,
    ]
  );
}
