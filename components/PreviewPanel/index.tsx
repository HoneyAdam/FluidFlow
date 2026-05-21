import React, { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  Monitor, Smartphone, Tablet, RefreshCw, Eye, Code2, Copy, Check, Download, Database,
  ShieldCheck, FileText, Wrench, Package, Loader2, Camera,
  SplitSquareVertical, X, Zap, ZapOff, MousePointer2, Bug, Settings, ChevronDown,
  Play, Bot, Map, GitBranch, Activity, FolderOpen, LayoutGrid
} from 'lucide-react';
import { getProviderManager } from '../../services/ai';
import { buildIframeHtml } from '../../utils/sandboxHtml';
import { FileSystem, LogEntry, TabType, PreviewDevice } from '../../types';
import { cleanGeneratedCode } from '../../utils/cleanCode';
import { useTechStack } from '../../hooks/useTechStack';
import { useAutoFix } from '../../hooks/useAutoFix';
import { usePreviewAI } from '../../hooks/usePreviewAI';
import { useExport } from '../../hooks/useExport';

// Context hooks - direct consumption instead of prop drilling
import { useAppContext } from '../../contexts/AppContext';
import { useUI } from '../../contexts/UIContext';
import { useStatusBar } from '../../contexts/StatusBarContext';

// Local hooks
import { useIframeMessaging, useInspectMode, useComponentTree, useInspectorPanel } from './hooks';
import { useScreenshot } from '../../hooks/useScreenshot';

// Sub-components
import { CodeEditor } from './CodeEditor';
import { FileExplorer } from './FileExplorer';
import { ExportModal } from './ExportModal';
import { GithubModal } from './GithubModal';
import { AccessibilityModal } from './AccessibilityModal';
import { ConsultantReport } from './ConsultantReport';
import { InspectedElement, EditScope } from './ComponentInspector';
import DebugPanel from './DebugPanel';
import { MarkdownPreview } from './MarkdownPreview';
import { DBStudio } from './DBStudio';
import { CodeMapTab } from './CodeMapTab';
import { EnvironmentPanel } from './EnvironmentPanel';
import { GitPanel } from '../GitPanel';
import { RunnerPanel } from './RunnerPanel';
import { MultiDevicePreview } from './MultiDevicePreview';
import { ErrorFixPanel } from './ErrorFixPanel';
import { DocsPanel } from './DocsPanel';
import { PreviewContent } from './PreviewContent';
import { CodeQualityPanel } from './CodeQualityPanel';
import { ActivityLogPanel } from './ActivityLogPanel';
import { ProjectsPanel } from './ProjectsPanel';
import { runnerApi } from '../../services/projectApi';

/**
 * Minimal props interface - most data now comes from contexts directly
 * Reduced from 28 props to 4 props (86% reduction)
 */
interface PreviewPanelProps {
  // Callbacks that communicate with App.tsx local state
  onInspectEdit?: (prompt: string, element: InspectedElement, scope: EditScope) => Promise<void>;
  onSendErrorToChat?: (errorMessage: string) => void;
  onPreviewErrorsChange?: (hasErrors: boolean) => void;
  onRunnerStatusChange?: (isRunning: boolean) => void;
  // Revert and retry when AI changes break the app
  onRevertAndRetry?: () => void;
  onRevertOnly?: () => boolean;
  canRevertAndRetry?: boolean;
  canRevert?: boolean;
  lastPrompt?: string | null;
}

export const PreviewPanel = memo(function PreviewPanel({
  onInspectEdit,
  onSendErrorToChat,
  onPreviewErrorsChange,
  onRunnerStatusChange,
  onRevertAndRetry,
  onRevertOnly,
  canRevertAndRetry,
  canRevert,
  lastPrompt,
}: PreviewPanelProps) {
  // ============ Context Consumption ============
  // Get data directly from contexts instead of props (reduced from 28 to 4 props)
  const ctx = useAppContext();
  const ui = useUI();

  // Destructure commonly used values from AppContext
  const {
    files,
    setFiles,
    activeFile,
    setActiveFile,
    currentProject,
    gitStatus,
    hasUncommittedChanges,
    localChanges,
    reviewChange,
    initGit: onInitGit,
    commit: onCommit,
    refreshGitStatus: onRefreshGitStatus,
    discardChanges: onDiscardChanges,
    revertToCommit: onRevertToCommit,
    undo: onUndo,
    canUndo,
    refreshProjects,
  } = ctx;

  // Destructure commonly used values from UIContext
  const {
    suggestions,
    setSuggestions,
    isGenerating,
    selectedModel,
    activeTab: externalActiveTab,
    resetCounter,
  } = ui;

  // Get StatusBar context for updating status bar state
  const { setLogCounts, setAutoFixStatus, setRunnerActive } = useStatusBar();

  // Derive projectId from currentProject
  const projectId = currentProject?.id ?? null;
  // State
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [key, setKey] = useState(0);
  const [internalActiveTab] = useState<TabType>('debug');

  // Use external state if provided, otherwise use internal
  const activeTab = externalActiveTab ?? internalActiveTab;
  const { isCopied, copy: copyText } = useCopyToClipboard();
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  // Console logs state (shared between useAutoFix and useIframeMessaging)
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Clear logs when resetCounter changes (Start Fresh triggered)
  const prevResetCounterRef = useRef(resetCounter);
  useEffect(() => {
    if (resetCounter !== prevResetCounterRef.current) {
      prevResetCounterRef.current = resetCounter;
      setLogs([]);
      console.log('[PreviewPanel] Cleared logs on reset');
    }
  }, [resetCounter]);

  // Track preview errors for auto-commit feature
  const prevHasErrorsRef = useRef<boolean>(false);
  useEffect(() => {
    // Check if there are any error logs (excluding fixed ones)
    const hasErrors = logs.some(log => log.type === 'error' && !log.isFixed);
    if (hasErrors !== prevHasErrorsRef.current) {
      prevHasErrorsRef.current = hasErrors;
      onPreviewErrorsChange?.(hasErrors);
    }
  }, [logs, onPreviewErrorsChange]);

  // Update StatusBar with log counts
  useEffect(() => {
    const errorCount = logs.filter(log => log.type === 'error' && !log.isFixed).length;
    const warningCount = logs.filter(log => log.type === 'warn').length;
    setLogCounts(errorCount, warningCount);
  }, [logs, setLogCounts]);

  // Inspect editing state (shared between useIframeMessaging and useInspectMode)
  const [isInspectEditing, setIsInspectEditing] = useState(false);

  // Split View
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<string>('');

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Runner status for indicator
  const [isRunnerActive, setIsRunnerActive] = useState(false);

  // Notify parent when runner status changes
  useEffect(() => {
    onRunnerStatusChange?.(isRunnerActive);
    setRunnerActive(isRunnerActive);
  }, [isRunnerActive, onRunnerStatusChange, setRunnerActive]);

  // Close settings when clicking outside
  useEffect((): (() => void) | undefined => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [showSettings]);

  // Check runner status periodically
  useEffect((): (() => void) | undefined => {
    if (!projectId) {
      setIsRunnerActive(false);
      return undefined;
    }

    let mounted = true;

    const checkStatus = async () => {
      try {
        const status = await runnerApi.status(projectId);
        if (mounted) {
          setIsRunnerActive(status.running || status.status === 'installing' || status.status === 'starting');
        }
      } catch {
        if (mounted) {
          setIsRunnerActive(false);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [projectId]);

  // App code reference
  const appCode = files['src/App.tsx'];

  // Tech Stack for AI context
  const { generateSystemInstruction } = useTechStack();

  // Auto-fix hook
  const {
    autoFixEnabled,
    setAutoFixEnabled,
    isAutoFixing,
    autoFixToast,
    pendingAutoFix,
    failedAutoFixError,
    currentError,
    currentErrorStack,
    errorTargetFile,
    setCurrentError,
    setCurrentErrorStack,
    handleConfirmAutoFix,
    handleDeclineAutoFix,
    handleSendErrorToChat,
    handleDismissFailedError,
    processError,
  } = useAutoFix({
    files,
    setFiles,
    appCode,
    selectedModel,
    isGenerating,
    logs,
    setLogs,
    onSendErrorToChat,
    generateSystemInstruction,
  });

  // Update StatusBar with auto-fix status
  useEffect(() => {
    setAutoFixStatus(autoFixEnabled, isAutoFixing);
  }, [autoFixEnabled, isAutoFixing, setAutoFixStatus]);

  // Iframe messaging hook (console, network, inspect events, URL)
  const {
    networkLogs,
    setNetworkLogs,
    isConsoleOpen,
    setIsConsoleOpen,
    activeTerminalTab,
    setActiveTerminalTab,
    hoveredElement,
    inspectedElement,
    setInspectedElement,
    clearInspectedElement,
    currentUrl,
    canGoBack,
    canGoForward,
    navigateToUrl,
    goBack,
    goForward,
    iframeRef,
  } = useIframeMessaging({
    isInspectEditing,
    onProcessError: processError,
    logs,
    setLogs,
  });

  // Clear network logs when resetCounter changes (Start Fresh triggered)
  useEffect(() => {
    if (resetCounter !== prevResetCounterRef.current) {
      setNetworkLogs([]);
      console.log('[PreviewPanel] Cleared network logs on reset');
    }
  }, [resetCounter, setNetworkLogs]);

  // Inspect mode hook
  const {
    isInspectMode,
    toggleInspectMode,
    exitInspectMode,
    handleInspectEdit: inspectModeHandleEdit,
  } = useInspectMode({
    files,
    appCode,
    selectedModel,
    reviewChange,
    onExternalInspectEdit: onInspectEdit,
    onClearInspectedElement: clearInspectedElement,
    isInspectEditing,
    setIsInspectEditing,
  });

  // Component tree hook for Elements tab in DevTools
  const {
    tree: componentTree,
    selectedNodeId,
    expandedNodes,
    isLoading: isTreeLoading,
    selectNode: handleSelectNode,
    toggleExpand: onToggleExpand,
    hoverNode: onHoverNode,
    refreshTree: onRefreshTree,
  } = useComponentTree({
    iframeRef,
    enabled: activeTab === 'preview' && isConsoleOpen && activeTerminalTab === 'elements',
  });

  // Ref for exit handler (defined later, used in useInspectorPanel callback)
  const exitInspectModeRef = useRef<() => void>(() => {});

  // Inspector panel hook for CSS/Props inspection sidebar
  const {
    isOpen: isInspectorPanelOpen,
    activeTab: inspectorActiveTab,
    setActiveTab: setInspectorActiveTab,
    openPanel: openInspectorPanel,
    closePanel: closeInspectorPanel,
    selectElement,
    computedStyles,
    tailwindClasses,
    isStylesLoading,
    componentName,
    componentProps,
    componentState,
    isPropsLoading,
    selectedElementRef,
    applyPreset,
    applyCustomStyle,
    applyTempStyle,
    clearTempStyles,
    isQuickStylesProcessing,
  } = useInspectorPanel({
    iframeRef,
    enabled: activeTab === 'preview',
    onApplyAIStyle: async (prompt, elementRef, scope) => {
      // Use inspect edit to apply AI-powered styles
      if (onInspectEdit) {
        // Close inspect mode and modals IMMEDIATELY before AI request
        // This prevents double prompts and gives clear feedback
        exitInspectModeRef.current();

        // If we have an inspectedElement from inspect mode, use it
        if (inspectedElement) {
          await onInspectEdit(prompt, inspectedElement, scope);
        } else if (elementRef && componentName) {
          // Create a minimal InspectedElement from component tree selection
          const minimalElement: InspectedElement = {
            tagName: 'div',
            className: '',
            componentName: componentName,
            rect: { top: 0, left: 0, width: 0, height: 0 },
            ffId: elementRef,
          };
          await onInspectEdit(prompt, minimalElement, scope);
        }
      }
    },
  });

  // Create a trigger hash for auto-capture based on file content
  // This changes when files are added/removed or content significantly changes
  const filesTriggerHash = useMemo(() => {
    if (!files || Object.keys(files).length === 0) return null;
    const fileNames = Object.keys(files).sort();
    const totalLength = Object.values(files).reduce((sum, content) => sum + content.length, 0);
    // Simple hash: file count + first/last file names + total content length
    return `${fileNames.length}-${fileNames[0] || ''}-${fileNames[fileNames.length - 1] || ''}-${totalLength}`;
  }, [files]);

  // Screenshot capture hook with auto-capture on file changes
  const {
    isCapturing: isCapturingScreenshot,
    capture: captureScreenshot,
    lastScreenshot,
  } = useScreenshot({
    projectId: currentProject?.id || null,
    iframeRef,
    autoCapture: !!currentProject, // Only auto-capture when a project is open
    autoCaptureDelay: 3000, // Wait 3 seconds for preview to stabilize
    triggerOnChange: filesTriggerHash,
    autoCaptureThrottle: 60000, // Limit to once per minute
    onCapture: () => {
      // Refresh project list to update thumbnails
      refreshProjects();
    },
  });

  // Track last synced element to prevent redundant processing
  const lastSyncedElementRef = useRef<string | null>(null);

  // Stable refs for tree operations (avoid recreating callbacks)
  const componentTreeRef = useRef(componentTree);
  componentTreeRef.current = componentTree;

  // Helper: Find node in tree by elementRef (stable - no deps)
  const findNodeByElementRef = useCallback((node: typeof componentTree, elementRef: string): typeof componentTree => {
    if (!node) return null;
    if (node.elementRef === elementRef) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeByElementRef(child, elementRef);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Helper: Find node by ID (stable - no deps)
  const findNodeById = useCallback((node: typeof componentTree, id: string): typeof componentTree => {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Helper: Get parent node IDs for auto-expand (stable - no deps)
  const getNodePath = useCallback((node: typeof componentTree, targetId: string, path: string[] = []): string[] | null => {
    if (!node) return null;
    if (node.id === targetId) return path;
    if (node.children) {
      for (const child of node.children) {
        const result = getNodePath(child, targetId, [...path, node.id]);
        if (result) return result;
      }
    }
    return null;
  }, []);

  // Wrapped exit handler that clears ALL selections and closes panels
  const handleExitInspectMode = useCallback(() => {
    exitInspectMode();
    selectElement(null);
    handleSelectNode('');
    lastSyncedElementRef.current = null;
    closeInspectorPanel(); // Also close the Inspector panel
  }, [exitInspectMode, selectElement, handleSelectNode, closeInspectorPanel]);

  // Keep exit ref updated for useInspectorPanel callback
  exitInspectModeRef.current = handleExitInspectMode;

  // Wrapped inspect edit handler that closes modals FIRST, then processes
  // This prevents double prompts from Element Selected modal
  const wrappedInspectEdit = useCallback(async (
    prompt: string,
    element: InspectedElement,
    scope: EditScope
  ) => {
    // Close modals IMMEDIATELY before AI request starts
    handleExitInspectMode();
    // Then process the edit request
    await inspectModeHandleEdit(prompt, element, scope);
  }, [handleExitInspectMode, inspectModeHandleEdit]);

  // Auto-open Inspector panel when entering inspect mode
  useEffect(() => {
    if (isInspectMode) {
      openInspectorPanel();
    }
  }, [isInspectMode, openInspectorPanel]);

  // Connect tree node selection to inspector panel AND ComponentInspector
  // Uses ref for componentTree to avoid dependency on tree changes
  // Also enables inspect mode if not already enabled
  const onSelectNode = useCallback((nodeId: string) => {
    // Use ref to get current tree without causing re-renders
    const tree = componentTreeRef.current;
    const node = findNodeById(tree, nodeId);

    if (node?.elementRef) {
      // Enable inspect mode if not already (so overlay and ComponentInspector show)
      if (!isInspectMode) {
        toggleInspectMode();
      }

      // Batch all state updates
      handleSelectNode(nodeId);
      selectElement(node.elementRef);

      // Create InspectedElement to show ComponentInspector modal
      setInspectedElement({
        tagName: node.tagName || node.name || 'div',
        className: '',
        componentName: node.type === 'component' ? node.name : undefined,
        rect: { top: 0, left: 0, width: 0, height: 0 },
        ffId: node.elementRef,
        textContent: '',
      });
      lastSyncedElementRef.current = node.elementRef;
    } else {
      // Just select the node even without elementRef
      handleSelectNode(nodeId);
    }
  }, [findNodeById, handleSelectNode, selectElement, setInspectedElement, isInspectMode, toggleInspectMode]);

  // Stable refs for callbacks to avoid dependency changes
  const expandedNodesRef = useRef(expandedNodes);
  const selectElementRef = useRef(selectElement);
  const handleSelectNodeRef = useRef(handleSelectNode);
  const onToggleExpandRef = useRef(onToggleExpand);

  // Keep refs up to date (no dependencies - runs every render but is cheap)
  expandedNodesRef.current = expandedNodes;
  selectElementRef.current = selectElement;
  handleSelectNodeRef.current = handleSelectNode;
  onToggleExpandRef.current = onToggleExpand;

  // Sync Inspect Mode selection → Inspector Panel + Elements tab
  // Runs when inspectedElement changes (with ffId or identifier based on rect)
  useEffect(() => {
    if (!inspectedElement) return;

    // Create a unique identifier for this element
    const elementId = inspectedElement.ffId ||
      `${inspectedElement.tagName}-${inspectedElement.rect.left}-${inspectedElement.rect.top}`;

    if (elementId === lastSyncedElementRef.current) return;

    // Mark as processed immediately
    lastSyncedElementRef.current = elementId;

    // Always open Inspector Panel when an element is selected
    if (inspectedElement.ffId) {
      selectElementRef.current(inspectedElement.ffId);
    } else {
      // For elements without ffId, still open the panel (it will show limited info)
      // Create a temporary ID based on element properties
      selectElementRef.current(elementId);
    }

    // Find and select the corresponding tree node using ref (only if ffId exists)
    const ffId = inspectedElement.ffId;
    const tree = componentTreeRef.current;
    if (tree && ffId) {
      const treeNode = findNodeByElementRef(tree, ffId);
      if (treeNode) {
        handleSelectNodeRef.current(treeNode.id);

        // Auto-expand parent nodes (batched in microtask)
        const parentPath = getNodePath(tree, treeNode.id);
        if (parentPath && parentPath.length > 0) {
          const currentExpanded = expandedNodesRef.current;
          const toExpand = parentPath.filter(parentId => !currentExpanded.has(parentId));
          if (toExpand.length > 0) {
            queueMicrotask(() => {
              toExpand.forEach(parentId => onToggleExpandRef.current(parentId));
            });
          }
        }

        // Open DevTools Elements tab if needed
        if (!isConsoleOpen) {
          setIsConsoleOpen(true);
        }
        setActiveTerminalTab('elements');
      }
    }
  }, [inspectedElement, findNodeByElementRef, getNodePath, isConsoleOpen, setIsConsoleOpen, setActiveTerminalTab]);

  // Preview AI hook (accessibility, responsiveness, database)
  const {
    accessibilityReport,
    isAuditing,
    isFixingAccessibility,
    showAccessReport,
    setShowAccessReport,
    runAccessibilityAudit,
    fixAccessibilityIssues,
    isFixingResponsiveness,
    fixResponsiveness,
    isGeneratingDB,
  } = usePreviewAI({
    files,
    appCode,
    selectedModel,
    setFiles,
    reviewChange,
  });

  // Export hook
  const {
    showExportModal,
    setShowExportModal,
    isDownloading,
    downloadAsZip,
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
  } = useExport({
    files,
    appCode,
    projectId,
  });

  // FIX-12: Stable callbacks for FileExplorer to avoid defeating React.memo
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;

  const handleCreateFile = useCallback((path: string, content: string) => {
    setFiles((prev: FileSystem) => ({ ...prev, [path]: content }));
  }, [setFiles]);

  const handleDeleteFile = useCallback((path: string) => {
    setFiles((prev: FileSystem) => {
      const newFiles = { ...prev };
      Object.keys(newFiles).forEach(filePath => {
        if (filePath === path || filePath.startsWith(path + '/')) {
          delete newFiles[filePath];
        }
      });
      // If deleted file was active, switch to another file
      const currentActive = activeFileRef.current;
      if (currentActive === path || currentActive.startsWith(path + '/')) {
        const remainingFiles = Object.keys(newFiles);
        if (remainingFiles.length > 0) {
          setActiveFile(remainingFiles[0]);
        }
      }
      return newFiles;
    });
  }, [setFiles, setActiveFile]);

  const handleRenameFile = useCallback((oldPath: string, newPath: string) => {
    setFiles((prev: FileSystem) => {
      const newFiles: FileSystem = {};
      (Object.entries(prev) as [string, string][]).forEach(([filePath, content]) => {
        if (filePath === oldPath) {
          newFiles[newPath] = content;
        } else if (filePath.startsWith(oldPath + '/')) {
          const relativePath = filePath.substring(oldPath.length);
          newFiles[newPath + relativePath] = content;
        } else {
          newFiles[filePath] = content;
        }
      });
      // Update active file if it was renamed
      const currentActive = activeFileRef.current;
      if (currentActive === oldPath) {
        setActiveFile(newPath);
      } else if (currentActive.startsWith(oldPath + '/')) {
        const relativePath = currentActive.substring(oldPath.length);
        setActiveFile(newPath + relativePath);
      }
      return newFiles;
    });
  }, [setFiles, setActiveFile]);

  // Build iframe content (FIX-08: debounce to avoid rebuilding on every keystroke)
  useEffect((): (() => void) | undefined => {
    if (!appCode) return undefined;
    const timeout = setTimeout(() => {
      const html = buildIframeHtml(files, isInspectMode, window.location.origin);
      setIframeSrc(html);
    }, 500);
    return () => clearTimeout(timeout);
  }, [appCode, files, isInspectMode]);

  // Handle inspect mode toggle with iframe refresh
  const handleToggleInspectMode = useCallback(() => {
    // If turning OFF inspect mode, clear all selections AND close inspector panel
    if (isInspectMode) {
      selectElement(null);
      handleSelectNode('');
      lastSyncedElementRef.current = null;
      closeInspectorPanel(); // Close the inspector panel when exiting inspect mode
    }
    toggleInspectMode();
    // Force iframe refresh to apply new event listeners
    setKey(prev => prev + 1);
  }, [isInspectMode, selectElement, handleSelectNode, toggleInspectMode, closeInspectorPanel]);

  // Fix error from console
  const fixError = async (logId: string, message: string) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: true } : l));
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate({
        prompt: `Fix this runtime error: "${message}"\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
        systemInstruction: 'You are a senior React/TypeScript debugger. Classify the error (import / JSX-syntax / type / runtime / hook) then apply the smallest correct patch. Common fixes: framer-motion → motion/react, react-router-dom → react-router, absolute "src/..." imports → relative "./...", missing aria-label on icon buttons, optional chaining for null/undefined access, stable key on .map. Preserve every data-ff-* attribute, every unrelated import, and the existing component shape. Return ONLY the complete fixed file content — no markdown fence, no explanation, no leading whitespace.',
        debugCategory: 'auto-fix'
      }, currentModel);
      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Runtime Error', { ...files, 'src/App.tsx': fixedCode });
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false, isFixed: true } : l));
    } catch (_e) {
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, isFixing: false } : l));
    }
  };

  // Helper functions
  const reloadPreview = useCallback(() => {
    // Capture state before reload for HMR-like experience.
    // Iframe runs with `allow-same-origin`, so parent's origin is the
    // correct postMessage target — never use '*'.
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: 'CAPTURE_STATE' }, window.location.origin);
        console.log('[Preview] State captured before reload');
      } catch (_e) {
        // Ignore if iframe is not accessible
      }
    }
    // Small delay to ensure state is captured before reload
    setTimeout(() => {
      setKey(prev => prev + 1);
    }, 50);
  }, [iframeRef]);

  const copyToClipboard = () => {
    copyText(files[activeFile] || '');
  };
  const downloadCode = () => {
    const element = document.createElement('a');
    const file = new Blob([files[activeFile] || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(file);
    element.href = url;
    element.download = activeFile.split('/').pop() || 'file.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="flex-1 min-w-0 min-h-0 h-full self-stretch flex flex-col backdrop-blur-xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--theme-surface) 60%, transparent)'
      }}
    >
      {/* Toolbar */}
      <div
        className="h-12 flex-none flex items-center justify-between px-4 transition-colors duration-300"
        style={{
          borderBottom: '1px solid var(--theme-border)',
          backgroundColor: 'color-mix(in srgb, var(--theme-background) 50%, transparent)'
        }}
      >
        <div className="flex items-center gap-4">
          {/* Active Panel Title */}
          {(() => {
            const tabs = [
              { id: 'run', icon: Play, label: 'Run', hasIndicator: true },
              { id: 'preview', icon: Eye, label: 'Preview' },
              { id: 'code', icon: Code2, label: 'Code' },
              { id: 'codemap', icon: Map, label: 'CodeMap' },
              { id: 'quality', icon: ShieldCheck, label: 'Quality' },
              { id: 'activity', icon: Activity, label: 'Activity' },
              { id: 'projects', icon: FolderOpen, label: 'Projects' },
              { id: 'git', icon: GitBranch, label: 'Git' },
              { id: 'database', icon: Database, label: 'DB Studio' },
              { id: 'docs', icon: FileText, label: 'Docs' },
              { id: 'env', icon: ShieldCheck, label: 'Env' },
              { id: 'debug', icon: Bug, label: 'Debug' },
              { id: 'errorfix', icon: Bot, label: 'Error Fix' }
            ];
            const activeTabConfig = tabs.find(t => t.id === activeTab);
            if (!activeTabConfig) return null;
            const Icon = activeTabConfig.icon;
            const isRunner = activeTabConfig.hasIndicator && isRunnerActive;
            return (
              <div className="flex items-center gap-1">
                {/* Quick Access Buttons - Preview & Code always visible */}
                <button
                  onClick={() => ui.setActiveTab('preview')}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{
                    backgroundColor: activeTab === 'preview' ? 'var(--theme-glass-200)' : undefined,
                    color: activeTab === 'preview' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                  }}
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => ui.setActiveTab('code')}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{
                    backgroundColor: activeTab === 'code' ? 'var(--theme-glass-200)' : undefined,
                    color: activeTab === 'code' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                  }}
                  title="Code"
                >
                  <Code2 className="w-4 h-4" />
                </button>

                {/* Separator if not on preview/code */}
                {activeTab !== 'preview' && activeTab !== 'code' && (
                  <>
                    <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />
                    {/* Current Tab */}
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <div className="relative">
                        <Icon className="w-4 h-4" style={{ color: isRunner ? 'var(--color-success)' : 'var(--theme-text-secondary)' }} />
                        {isRunner && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                        )}
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>{activeTabConfig.label}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {activeTab === 'preview' && (
            <>
              <div className="h-6 w-px mx-1 hidden sm:block" style={{ backgroundColor: 'var(--theme-border)' }} />
              <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border)' }}>
                {[
                  { id: 'desktop', icon: Monitor, title: 'Desktop' },
                  { id: 'tablet', icon: Tablet, title: 'Tablet' },
                  { id: 'mobile', icon: Smartphone, title: 'Mobile' },
                  { id: 'multi', icon: LayoutGrid, title: 'Multi-Device' }
                ].map(({ id, icon: Icon, title }) => (
                  <button
                    key={id}
                    onClick={() => setPreviewDevice(id as PreviewDevice)}
                    className="p-2 rounded-md transition-colors"
                    style={{
                      backgroundColor: previewDevice === id ? 'var(--theme-glass-300)' : undefined,
                      color: previewDevice === id ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                    }}
                    title={title}
                    aria-label={`${title} view`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'preview' ? (
            <>
              {appCode && !isGenerating && (
                <>
                  <button
                    onClick={handleToggleInspectMode}
                    className="p-2 rounded-lg border transition-all"
                    style={{
                      backgroundColor: isInspectMode ? 'var(--theme-ai-accent-subtle)' : 'var(--theme-glass-100)',
                      color: isInspectMode ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)',
                      borderColor: isInspectMode ? 'var(--theme-ai-accent)' : 'transparent'
                    }}
                    title="Inspect Components"
                  >
                    <MousePointer2 className="w-4 h-4" />
                  </button>

                  {/* Settings Dropdown */}
                  <div className="relative" ref={settingsRef}>
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="flex items-center gap-1 p-2 rounded-lg border transition-all"
                      style={{
                        backgroundColor: showSettings ? 'var(--theme-glass-300)' : 'var(--theme-glass-100)',
                        color: showSettings ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
                        borderColor: showSettings ? 'var(--theme-border)' : 'transparent'
                      }}
                      title="Settings"
                    >
                      <Settings className="w-4 h-4" />
                      <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                    </button>

                    {showSettings && (
                      <div className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
                        <div className="p-2" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                          <span className="text-[10px] uppercase tracking-wide px-2" style={{ color: 'var(--theme-text-muted)' }}>Preview Settings</span>
                        </div>

                        {/* Auto-fix Toggle */}
                        <button
                          onClick={() => setAutoFixEnabled(!autoFixEnabled)}
                          className="w-full flex items-center justify-between px-3 py-2.5 transition-colors"
                          style={{ ['--hover-bg' as string]: 'var(--theme-surface-hover)' }}
                        >
                          <div className="flex items-center gap-2">
                            {isAutoFixing ? (
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-success)' }} />
                            ) : autoFixEnabled ? (
                              <Zap className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                            ) : (
                              <ZapOff className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                            )}
                            <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>Auto-fix Errors</span>
                          </div>
                          <div className="relative w-9 h-5 rounded-full transition-colors" style={{ backgroundColor: autoFixEnabled ? 'var(--color-success)' : 'var(--theme-glass-300)' }}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${autoFixEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                          </div>
                        </button>

                        {/* Fix Responsive */}
                        {previewDevice !== 'desktop' && (
                          <button
                            onClick={() => { fixResponsiveness(); setShowSettings(false); }}
                            disabled={isFixingResponsiveness}
                            className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors disabled:opacity-50"
                          >
                            {isFixingResponsiveness ? (
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--theme-accent)' }} />
                            ) : (
                              <Wrench className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                            )}
                            <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{isFixingResponsiveness ? 'Fixing...' : 'Fix Responsive'}</span>
                          </button>
                        )}

                        <div className="h-px" style={{ backgroundColor: 'var(--theme-border)' }} />

                        {/* Accessibility Audit */}
                        <button
                          onClick={() => { runAccessibilityAudit(); setShowSettings(false); }}
                          disabled={isAuditing}
                          className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors disabled:opacity-50"
                        >
                          {isAuditing ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--theme-accent)' }} />
                          ) : (
                            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                          )}
                          <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{isAuditing ? 'Auditing...' : 'Accessibility Audit'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="h-6 w-px" style={{ backgroundColor: 'var(--theme-border)' }} />
              <button onClick={reloadPreview} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--theme-text-muted)' }} title="Reload Preview" aria-label="Reload Preview">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => captureScreenshot().catch(console.error)}
                disabled={isCapturingScreenshot || !currentProject}
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ color: lastScreenshot ? 'var(--color-success)' : 'var(--theme-text-muted)' }}
                title={lastScreenshot ? `Screenshot saved (${new Date(lastScreenshot.capturedAt).toLocaleTimeString()})` : 'Capture Screenshot'}
                aria-label="Capture Screenshot"
              >
                {isCapturingScreenshot ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={downloadCode} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--theme-text-muted)' }} title="Download File" aria-label="Download current file">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>
                {isCopied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {appCode && (
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)', border: '1px solid var(--color-success)' }}>
              <Package className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden group flex flex-col relative" style={{ backgroundColor: 'var(--theme-background)' }}>
        {/* DBStudio - always rendered but hidden when not active to preserve state */}
        <div className={activeTab === 'database' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <DBStudio files={files} setFiles={setFiles} />
        </div>
        {/* DocsPanel - always rendered but hidden when not active to preserve state */}
        <div className={activeTab === 'docs' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <DocsPanel files={files} setFiles={setFiles} />
        </div>
        {/* CodeMapTab - always rendered but hidden to preserve state */}
        <div className={activeTab === 'codemap' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <CodeMapTab files={files} />
        </div>
        {activeTab === 'debug' ? (
          <DebugPanel />
        ) : activeTab === 'env' ? (
          <EnvironmentPanel files={files} setFiles={setFiles} />
        ) : activeTab === 'projects' ? (
          <ProjectsPanel />
        ) : activeTab === 'git' ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <GitPanel
              projectId={projectId || null}
              gitStatus={gitStatus || null}
              onInitGit={onInitGit || (async (_force?: boolean) => { console.log('[PreviewPanel] fallback onInitGit called'); return false; })}
              onCommit={onCommit || (async () => false)}
              onRefreshStatus={onRefreshGitStatus || (async () => {})}
              hasUncommittedChanges={hasUncommittedChanges}
              localChanges={localChanges}
              files={files}
              onDiscardChanges={onDiscardChanges}
              onRevertToCommit={onRevertToCommit}
              onPushToGithub={() => setShowGithubModal(true)}
              hasRemote={hasRemote}
              remoteUrl={currentRemoteUrl}
            />
          </div>
        ) : activeTab === 'run' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <RunnerPanel
              projectId={projectId || null}
              projectName={files['package.json'] ? (() => { try { return JSON.parse(files['package.json']).name; } catch { return undefined; }})() : undefined}
              hasCommittedFiles={Boolean(gitStatus?.initialized)}
              files={files}
            />
          </div>
        ) : activeTab === 'errorfix' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ErrorFixPanel
              files={files}
              currentError={currentError}
              currentErrorStack={currentErrorStack}
              targetFile={errorTargetFile}
              onFileUpdate={(path, content) => {
                setFiles({ ...files, [path]: content });
              }}
              onFixComplete={(success) => {
                if (success) {
                  setCurrentError(null);
                  setCurrentErrorStack(undefined);
                }
              }}
              onUndo={onUndo}
              canUndo={canUndo}
            />
          </div>
        ) : activeTab === 'quality' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <CodeQualityPanel
              files={files}
              activeFile={activeFile}
              onRunLint={() => {}}
            />
          </div>
        ) : activeTab === 'activity' ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            <ActivityLogPanel />
          </div>
        ) : activeTab === 'database' || activeTab === 'codemap' || activeTab === 'docs' ? (
          // These tabs are always-rendered above, so return null here to avoid showing FileExplorer
          null
        ) : activeTab === 'preview' ? (
          previewDevice === 'multi' ? (
            <MultiDevicePreview
              iframeSrc={iframeSrc}
              iframeKey={key}
              isGenerating={isGenerating}
              onReload={reloadPreview}
            />
          ) : (
            <PreviewContent
              core={{
                appCode,
                iframeSrc,
                iframeKey: key,
                previewDevice,
              }}
              state={{
                isGenerating,
                isFixingResp: isFixingResponsiveness,
              }}
              logs={{
                logs,
                networkLogs,
                isConsoleOpen,
                activeTerminalTab,
                setLogs,
                setNetworkLogs,
                setIsConsoleOpen,
                setActiveTerminalTab,
                fixError,
              }}
              autoFix={{
                autoFixToast,
                isAutoFixing,
                pendingAutoFix,
                failedAutoFixError,
                handleConfirmAutoFix,
                handleDeclineAutoFix,
                handleSendErrorToChat,
                handleDismissFailedError,
                onSendErrorToChat,
              }}
              inspect={{
                isInspectMode,
                isInspectEditing,
                hoveredElement,
                inspectedElement,
                onCloseInspector: handleExitInspectMode,
                onInspectEdit: wrappedInspectEdit,
              }}
              navigation={{
                iframeRef,
                currentUrl,
                canGoBack,
                canGoForward,
                onNavigate: navigateToUrl,
                onGoBack: goBack,
                onGoForward: goForward,
                onReload: reloadPreview,
              }}
              elementsTree={{
                componentTree,
                selectedNodeId,
                expandedNodes,
                isTreeLoading,
                onSelectNode,
                onToggleExpand,
                onHoverNode,
                onRefreshTree,
              }}
              inspectorPanel={{
                isInspectorPanelOpen,
                inspectorActiveTab,
                onInspectorTabChange: setInspectorActiveTab,
                onCloseInspectorPanel: closeInspectorPanel,
              }}
              styles={{
                computedStyles,
                tailwindClasses,
                isStylesLoading,
              }}
              componentData={{
                componentProps,
                componentState,
                componentName,
                isPropsLoading,
              }}
              quickStyles={{
                selectedElementRef,
                ffGroup: inspectedElement?.ffGroup,
                isQuickStylesProcessing,
                onApplyPreset: applyPreset,
                onApplyCustomStyle: applyCustomStyle,
                onApplyTempStyle: applyTempStyle,
                onClearTempStyles: clearTempStyles,
              }}
              revert={{
                onRevertAndRetry,
                onRevertOnly,
                canRevertAndRetry,
                canRevert,
                lastPrompt,
              }}
            />
          )
        ) : (
          <div className="flex-1 flex min-h-0 h-full">
            <FileExplorer
                files={files}
                activeFile={activeFile}
                onFileSelect={setActiveFile}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onRenameFile={handleRenameFile}
              />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Split View Toggle */}
              <div className="flex items-center justify-between px-2 py-1" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono truncate max-w-[200px]" style={{ color: 'var(--theme-text-muted)' }}>{activeFile}</span>
                  {isSplitView && splitFile && (
                    <>
                      <span style={{ color: 'var(--theme-border)' }}>|</span>
                      <span className="text-xs font-mono truncate max-w-[200px]" style={{ color: 'var(--theme-text-muted)' }}>{splitFile}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (!isSplitView) {
                        // Find another file to show in split view
                        const otherFiles = Object.keys(files).filter(f => f !== activeFile && (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')));
                        setSplitFile(otherFiles[0] || '');
                      }
                      setIsSplitView(!isSplitView);
                    }}
                    className="p-1.5 rounded transition-colors"
                    style={{
                      backgroundColor: isSplitView ? 'var(--theme-accent-subtle)' : undefined,
                      color: isSplitView ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                    }}
                    title={isSplitView ? 'Close Split View' : 'Split View'}
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                  </button>
                  {isSplitView && (
                    <button
                      onClick={() => setIsSplitView(false)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--theme-text-muted)' }}
                      title="Close Split"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Generation Progress Toast - Non-blocking */}
              {isGeneratingDB && (
                <div className="absolute top-2 right-2 z-50 flex items-center gap-2 px-3 py-2 backdrop-blur-xl rounded-lg shadow-lg animate-in slide-in-from-top-2 duration-300" style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent)' }}>
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--theme-accent-subtle)', borderTopColor: 'var(--theme-accent)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--theme-accent)' }}>
                    Generating SQL Schema...
                  </span>
                </div>
              )}

              {/* Normal content */}
              {files[activeFile] ? (
                <div className={`flex-1 flex min-h-0 overflow-hidden ${isSplitView ? 'flex-row' : 'flex-col'}`}>
                  {/* Primary Editor / Preview */}
                  <div className={isSplitView ? 'flex-1 min-w-0 min-h-0 h-full overflow-hidden border-r border-white/5' : 'flex-1 min-h-0 h-full overflow-hidden'}>
                    {activeFile.endsWith('.md') ? (
                      <MarkdownPreview
                        content={files[activeFile]}
                        fileName={activeFile.split('/').pop() || activeFile}
                      />
                    ) : (
                      <CodeEditor files={files} setFiles={setFiles} activeFile={activeFile} />
                    )}
                  </div>

                  {/* Split Editor */}
                  {isSplitView && splitFile && files[splitFile] && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                      {/* Split file selector */}
                      <select
                        value={splitFile}
                        onChange={(e) => setSplitFile(e.target.value)}
                        className="flex-none w-full px-2 py-1 text-xs outline-none"
                        style={{ backgroundColor: 'var(--theme-glass-100)', borderBottom: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                      >
                        {Object.keys(files)
                          .filter(f => f !== activeFile)
                          .map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                      </select>
                      <div className="flex-1 min-h-0 h-full overflow-hidden">
                        {splitFile.endsWith('.md') ? (
                          <MarkdownPreview
                            content={files[splitFile]}
                            fileName={splitFile.split('/').pop() || splitFile}
                          />
                        ) : (
                          <CodeEditor files={files} setFiles={setFiles} activeFile={splitFile} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--theme-text-muted)' }}>
                  <Code2 className="w-10 h-10 opacity-50" />
                  <p className="text-sm font-medium">Select a file to edit</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <ExportModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} onDownloadZip={downloadAsZip} isDownloading={isDownloading} />
        <GithubModal
          isOpen={showGithubModal}
          onClose={() => { setShowGithubModal(false); setPushResult(null); }}
          githubToken={githubToken}
          onTokenChange={setGithubToken}
          repoName={repoName}
          onRepoNameChange={setRepoName}
          onPush={pushToGithub}
          isPushing={isPushing}
          pushResult={pushResult}
          repoUrl={repoUrl}
          onRepoUrlChange={setRepoUrl}
          onPushToExisting={pushToExisting}
          hasRemote={hasRemote}
          currentRemoteUrl={currentRemoteUrl}
        />
        {activeTab === 'preview' && <ConsultantReport suggestions={suggestions} onClose={() => setSuggestions(null)} />}
        {activeTab === 'preview' && <AccessibilityModal isOpen={showAccessReport} onClose={() => setShowAccessReport(false)} report={accessibilityReport} isAuditing={isAuditing} isFixing={isFixingAccessibility} onFix={fixAccessibilityIssues} />}
      </div>
    </section>
  );
});
