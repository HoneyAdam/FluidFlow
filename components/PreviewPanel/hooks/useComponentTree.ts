/**
 * useComponentTree - Component tree management hook
 *
 * Fetches and manages the React component tree from the sandbox iframe.
 * Uses useSandboxBridge for postMessage communication.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSandboxBridge } from './useSandboxBridge';
import type { ComponentTreeNode } from '@/utils/sandboxHtml/scripts';

export interface UseComponentTreeOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshInterval?: number;
  /** Whether the component tree feature is enabled */
  enabled?: boolean;
}

export interface UseComponentTreeReturn {
  /** The current component tree */
  tree: ComponentTreeNode | null;
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Set of expanded node IDs */
  expandedNodes: Set<string>;
  /** Whether tree is currently loading */
  isLoading: boolean;
  /** Select a node */
  selectNode: (nodeId: string) => void;
  /** Toggle node expansion */
  toggleExpand: (nodeId: string) => void;
  /** Hover over a node (for highlighting in preview) */
  hoverNode: (nodeId: string | null) => void;
  /** Refresh the tree */
  refreshTree: () => Promise<void>;
  /** Expand all nodes */
  expandAll: () => void;
  /** Collapse all nodes */
  collapseAll: () => void;
}

/**
 * Recursively collect all node IDs from the tree
 */
function collectAllNodeIds(node: ComponentTreeNode, ids: Set<string> = new Set()): Set<string> {
  ids.add(node.id);
  if (node.children) {
    node.children.forEach((child) => collectAllNodeIds(child, ids));
  }
  return ids;
}

/**
 * Recursively collect node IDs up to a certain depth
 */
function collectNodeIdsToDepth(
  node: ComponentTreeNode,
  maxDepth: number,
  currentDepth: number = 0,
  ids: Set<string> = new Set()
): Set<string> {
  if (currentDepth < maxDepth) {
    ids.add(node.id);
    if (node.children) {
      node.children.forEach((child) =>
        collectNodeIdsToDepth(child, maxDepth, currentDepth + 1, ids)
      );
    }
  }
  return ids;
}

export function useComponentTree({
  iframeRef,
  autoRefreshInterval = 0,
  enabled = true,
}: UseComponentTreeOptions): UseComponentTreeReturn {
  const [tree, setTree] = useState<ComponentTreeNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Track if component is mounted and if initial expansion done
  const mountedRef = useRef(true);
  const initialExpandDoneRef = useRef(false);
  const fetchInProgressRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Use sandbox bridge for communication
  const { requestComponentTree, highlightTreeNode, isConnected } = useSandboxBridge({
    iframeRef,
  });

  // Fetch component tree (memoized without expandedNodes dependency)
  const refreshTree = useCallback(async () => {
    if (!enabled || !isConnected || fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    setIsLoading(true);
    try {
      const newTree = await requestComponentTree();
      if (mountedRef.current) {
        setTree(newTree);

        // Auto-expand first 2 levels on initial load (only once)
        if (newTree && !initialExpandDoneRef.current) {
          initialExpandDoneRef.current = true;
          const initialExpanded = collectNodeIdsToDepth(newTree, 2);
          setExpandedNodes(initialExpanded);
        }
      }
    } catch (error) {
      console.error('[useComponentTree] Failed to fetch tree:', error);
      if (mountedRef.current) {
        setTree(null);
      }
    } finally {
      fetchInProgressRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, isConnected, requestComponentTree]);

  // Auto-refresh
  useEffect((): (() => void) | undefined => {
    if (!enabled || !isConnected || autoRefreshInterval <= 0) return undefined;

    const interval = setInterval(refreshTree, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [enabled, isConnected, autoRefreshInterval, refreshTree]);

  // Initial fetch when connected (debounced)
  useEffect((): (() => void) | undefined => {
    if (enabled && isConnected && !tree) {
      // Delay initial fetch to ensure iframe is ready
      const timeout = setTimeout(refreshTree, 500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [enabled, isConnected, tree, refreshTree]);

  // Select node
  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    // Auto-expand parent nodes could be added here
  }, []);

  // Toggle expand
  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Hover node - highlight in preview
  const hoverNode = useCallback(
    (nodeId: string | null) => {
      if (nodeId) {
        highlightTreeNode(nodeId);
      }
    },
    [highlightTreeNode]
  );

  // Expand all
  const expandAll = useCallback(() => {
    if (tree) {
      const allIds = collectAllNodeIds(tree);
      setExpandedNodes(allIds);
    }
  }, [tree]);

  // Collapse all
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Memoize return object
  return useMemo(
    () => ({
      tree,
      selectedNodeId,
      expandedNodes,
      isLoading,
      selectNode,
      toggleExpand,
      hoverNode,
      refreshTree,
      expandAll,
      collapseAll,
    }),
    [tree, selectedNodeId, expandedNodes, isLoading, selectNode, toggleExpand, hoverNode, refreshTree, expandAll, collapseAll]
  );
}
