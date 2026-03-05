/**
 * StatusBar - IDE-style status bar at the bottom of the application
 *
 * Displays:
 * - Project name (clickable to open projects)
 * - Git branch and status (clickable to open git tab)
 * - Server/backend connection status
 * - Error/warning counts from console
 * - Current file info (line/column, encoding)
 * - AI model and generation status
 *
 * Uses StatusBarContext for shared state from PreviewPanel and CodeEditor.
 */
import React, { memo, useMemo, useState, useEffect } from 'react';
import {
  GitBranch,
  Wifi,
  WifiOff,
  AlertCircle,
  AlertTriangle,
  Check,
  Loader2,
  Cloud,
  CloudOff,
  Bot,
  FileCode,
  Circle,
  FolderOpen,
  ChevronDown,
  Undo2,
  Redo2,
  History,
  Info,
  GitCommitHorizontal,
  Sparkles,
  ArrowUpCircle,
  ShieldAlert,
  BarChart3,
} from 'lucide-react';
import { useAppContext } from '../../contexts/AppContext';
import { useUI } from '../../contexts/UIContext';
import { useStatusBar } from '../../contexts/StatusBarContext';
import { getTokenSavings } from '../../services/context';
import { checkForUpdatesWithCache, APP_VERSION, type UpdateCheckResult } from '../../services/version';
import { getQuickHealthStatus, type HealthStatus } from '../../services/projectHealth';

interface StatusBarProps {
  onOpenGitTab?: () => void;
  onOpenProjectsTab?: () => void;
  onOpenHistoryPanel?: () => void;
  onOpenCredits?: () => void;
  onOpenHealthCheck?: () => void;
  onOpenAIUsage?: () => void;
  isAutoCommitting?: boolean;
}

export const StatusBar = memo(function StatusBar({
  onOpenGitTab,
  onOpenProjectsTab,
  onOpenHistoryPanel,
  onOpenCredits,
  onOpenHealthCheck,
  onOpenAIUsage,
  isAutoCommitting = false,
}: StatusBarProps) {
  // Get state from contexts
  const ctx = useAppContext();
  const ui = useUI();
  const statusBar = useStatusBar();

  // Update check state
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);

  // Check for updates on mount (FIX-11: mounted guard + catch)
  useEffect(() => {
    let mounted = true;
    checkForUpdatesWithCache()
      .then(result => { if (mounted) setUpdateCheck(result); })
      .catch(err => console.warn('[StatusBar] Update check failed:', err));
    return () => { mounted = false; };
  }, []);

  // Project health status
  const healthStatus = useMemo<HealthStatus>(() => {
    const files = ctx.files;
    if (!files || Object.keys(files).length === 0) return 'healthy';
    return getQuickHealthStatus(files);
  }, [ctx.files]);

  // Auto-commit state
  const { autoCommitEnabled, setAutoCommitEnabled } = ui;

  // Destructure status bar state
  const {
    errorCount,
    warningCount,
    cursorPosition,
    autoFixEnabled,
    isAutoFixing,
    isRunnerActive,
  } = statusBar;

  // Git status
  const gitBranch = ctx.gitStatus?.branch || 'main';
  const hasUncommitted = ctx.hasUncommittedChanges;
  const gitInitialized = ctx.gitStatus?.initialized ?? false;

  // Connection & sync status
  const isOnline = ctx.isServerOnline;
  const isSyncing = ctx.isSyncing;

  // AI status
  const isGenerating = ui.isGenerating;
  const selectedModel = ui.selectedModel;

  // History state
  const canUndo = ctx.canUndo;
  const canRedo = ctx.canRedo;
  const currentIndex = ctx.currentIndex;
  const historyLength = ctx.historyLength;

  // Extract model name from model ID
  const getModelDisplayName = (modelId: string): string => {
    // Handle different model ID formats
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      const name = parts[parts.length - 1];
      // Shorten common model names
      if (name.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
      if (name.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
      if (name.includes('gemini-3-pro')) return 'Gemini 3 Pro';
      if (name.includes('gemini-3-flash')) return 'Gemini 3 Flash';
      if (name.includes('gpt-4o')) return 'GPT-4o';
      if (name.includes('gpt-4')) return 'GPT-4';
      if (name.includes('claude-3')) return 'Claude 3';
      if (name.includes('claude')) return 'Claude';
      return name;
    }
    return modelId;
  };

  // File info
  const activeFile = ctx.activeFile;
  const fileExtension = activeFile?.split('.').pop()?.toUpperCase() || 'TXT';

  // Project info
  const projectName = ctx.currentProject?.name;

  // File context token savings
  const tokensSaved = useMemo(() => {
    const files = ctx.files;
    if (!files || Object.keys(files).length === 0) return 0;
    return getTokenSavings(files);
  }, [ctx.files]);

  // Format token savings for display
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return String(tokens);
  };

  return (
    <footer
      className="h-8 flex items-center justify-between px-2 text-xs font-mono select-none shrink-0 transition-colors duration-300"
      style={{
        backgroundColor: 'var(--theme-statusbar-bg)',
        borderTop: '1px solid var(--theme-statusbar-border)',
        color: 'var(--theme-statusbar-text)'
      }}
    >
      {/* Left Section */}
      <div className="flex items-center gap-0.5 h-full">
        {/* Project Name */}
        <button
          onClick={onOpenProjectsTab}
          className="flex items-center gap-1.5 px-2 h-full cursor-pointer transition-colors rounded group"
          style={{ ['--hover-bg' as string]: 'var(--theme-surface-hover)' }}
          title={projectName ? `Project: ${projectName}` : 'No project - Click to open projects'}
        >
          <FolderOpen className="w-3 h-3" style={{ color: 'var(--theme-accent)' }} />
          <span className="max-w-[100px] truncate" style={{ color: 'var(--theme-text-primary)' }}>
            {projectName || 'No Project'}
          </span>
          <ChevronDown className="w-3 h-3 transition-colors" style={{ color: 'var(--theme-text-muted)' }} />
        </button>

        {/* Separator */}
        <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />

        {/* Git Branch - clickable to open git tab */}
        <button
          onClick={onOpenGitTab}
          className="flex items-center gap-1.5 px-2 h-full cursor-pointer transition-colors rounded"
          style={{ color: gitInitialized ? undefined : 'var(--theme-text-muted)' }}
          title={
            gitInitialized
              ? `Branch: ${gitBranch}${hasUncommitted ? ' (uncommitted changes)' : ''} - Click to open Git`
              : 'No Git - Click to initialize'
          }
        >
          <GitBranch
            className="w-3 h-3"
            style={{
              color: gitInitialized
                ? hasUncommitted ? 'var(--color-warning)' : 'var(--color-success)'
                : undefined
            }}
          />
          {gitInitialized ? (
            <>
              <span
                className="max-w-[80px] truncate"
                style={{ color: hasUncommitted ? 'var(--color-warning)' : undefined }}
              >
                {gitBranch}
              </span>
              {hasUncommitted && (
                <Circle className="w-1.5 h-1.5" style={{ fill: 'var(--color-warning)', color: 'var(--color-warning)' }} />
              )}
            </>
          ) : (
            <span className="italic text-[10px]">no git</span>
          )}
        </button>

        {/* Auto-commit toggle - next to git branch */}
        {gitInitialized && (
          <button
            onClick={() => setAutoCommitEnabled(!autoCommitEnabled)}
            className="flex items-center gap-1 px-1.5 h-full rounded transition-colors"
            style={{
              color: autoCommitEnabled
                ? isAutoCommitting
                  ? 'var(--color-warning)'
                  : 'var(--color-success)'
                : 'var(--theme-text-muted)',
              backgroundColor: autoCommitEnabled
                ? isAutoCommitting
                  ? 'var(--color-warning-subtle)'
                  : undefined
                : undefined
            }}
            title={
              isAutoCommitting
                ? 'Auto-committing...'
                : autoCommitEnabled
                  ? 'Auto-commit ON: Commits when preview is error-free'
                  : 'Auto-commit OFF: Click to enable'
            }
          >
            {isAutoCommitting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <GitCommitHorizontal className="w-3 h-3" />
            )}
            <span className="text-[10px]">Auto</span>
          </button>
        )}

        {/* Separator */}
        <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />

        {/* Backend Status */}
        <div
          className="flex items-center gap-1.5 px-2 h-full transition-colors rounded cursor-pointer"
          style={{
            color: isSyncing
              ? 'var(--theme-accent)'
              : isOnline
                ? 'var(--color-success)'
                : 'var(--color-error)'
          }}
          title={isSyncing ? 'Syncing...' : isOnline ? 'Backend connected' : 'Backend offline'}
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[10px]">Syncing</span>
            </>
          ) : isOnline ? (
            <>
              <Cloud className="w-3 h-3" />
              <span className="text-[10px]">Backend</span>
            </>
          ) : (
            <>
              <CloudOff className="w-3 h-3" />
              <span className="text-[10px]">Offline</span>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />

        {/* Errors & Warnings */}
        <button
          className="flex items-center gap-2 px-2 h-full cursor-pointer transition-colors rounded"
          title={`${errorCount} error(s), ${warningCount} warning(s)`}
        >
          <div
            className="flex items-center gap-1"
            style={{ color: errorCount > 0 ? 'var(--color-error)' : undefined }}
          >
            <AlertCircle className="w-3 h-3" />
            <span>{errorCount}</span>
          </div>
          <div
            className="flex items-center gap-1"
            style={{ color: warningCount > 0 ? 'var(--color-warning)' : undefined }}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>{warningCount}</span>
          </div>
        </button>

        {/* Project Health Indicator */}
        {healthStatus !== 'healthy' && (
          <>
            <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />
            <button
              onClick={onOpenHealthCheck}
              className="flex items-center gap-1 px-2 h-full rounded transition-colors"
              style={{ color: healthStatus === 'critical' ? 'var(--color-error)' : 'var(--color-warning)' }}
              title={
                healthStatus === 'critical'
                  ? 'Critical: Missing required files - Click to fix'
                  : 'Warning: Some config files need attention'
              }
            >
              <ShieldAlert className="w-3 h-3" />
              <span className="text-[10px]">
                {healthStatus === 'critical' ? 'Fix Required' : 'Check Health'}
              </span>
            </button>
          </>
        )}

        {/* Token Savings Indicator */}
        {tokensSaved > 0 && (
          <>
            <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />
            <div
              className="flex items-center gap-1 px-2 h-full"
              style={{ color: 'var(--color-feature)' }}
              title={`Smart context: ${tokensSaved.toLocaleString()} tokens saved by not re-sending unchanged files`}
            >
              <Sparkles className="w-3 h-3" />
              <span className="text-[10px]">-{formatTokens(tokensSaved)}</span>
            </div>
          </>
        )}

        {/* Runner Status */}
        {isRunnerActive && (
          <>
            <div className="w-px h-3 mx-1" style={{ backgroundColor: 'var(--theme-border)' }} />
            <div
              className="flex items-center gap-1.5 px-2 h-full"
              style={{ color: 'var(--color-success)' }}
              title="Dev server running"
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              <span>Running</span>
            </div>
          </>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1 h-full">
        {/* Cursor Position */}
        {cursorPosition && (
          <div className="px-2 h-full flex items-center cursor-pointer rounded">
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </div>
        )}

        {/* File Type */}
        <div className="px-2 h-full flex items-center cursor-pointer rounded gap-1">
          <FileCode className="w-3 h-3" />
          <span>{fileExtension}</span>
        </div>

        {/* Encoding */}
        <div className="px-2 h-full flex items-center cursor-pointer rounded">
          UTF-8
        </div>

        {/* Auto-fix Status */}
        {autoFixEnabled && (
          <div
            className="flex items-center gap-1 px-2 h-full rounded"
            style={{ color: isAutoFixing ? 'var(--color-warning)' : 'var(--color-success)' }}
            title={isAutoFixing ? 'Auto-fixing error...' : 'Auto-fix enabled'}
          >
            {isAutoFixing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            <span>AutoFix</span>
          </div>
        )}

        {/* Separator */}
        <div className="w-px h-3 mx-0.5" style={{ backgroundColor: 'var(--theme-border)' }} />

        {/* History Controls */}
        <div className="flex items-center h-full">
          {/* Undo */}
          <button
            onClick={ctx.undo}
            disabled={!canUndo}
            className="px-1.5 h-full flex items-center rounded transition-colors"
            style={{
              color: canUndo ? 'var(--theme-text-secondary)' : 'var(--theme-text-muted)',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              opacity: canUndo ? 1 : 0.5
            }}
            title="Undo"
          >
            <Undo2 className="w-3 h-3" />
          </button>

          {/* Position Indicator - opens History Panel */}
          <button
            onClick={onOpenHistoryPanel}
            className="flex items-center gap-0.5 px-1 h-full rounded transition-colors group"
            style={{ color: 'var(--theme-text-muted)' }}
            title="History Timeline"
          >
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--theme-text-muted)' }}>
              {currentIndex + 1}/{historyLength}
            </span>
            <History className="w-3 h-3" style={{ color: 'var(--theme-text-muted)' }} />
          </button>

          {/* Redo */}
          <button
            onClick={ctx.redo}
            disabled={!canRedo}
            className="px-1.5 h-full flex items-center rounded transition-colors"
            style={{
              color: canRedo ? 'var(--theme-text-secondary)' : 'var(--theme-text-muted)',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              opacity: canRedo ? 1 : 0.5
            }}
            title="Redo"
          >
            <Redo2 className="w-3 h-3" />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-3 mx-0.5" style={{ backgroundColor: 'var(--theme-border)' }} />

        {/* AI Model & Status */}
        <div
          className="flex items-center gap-1.5 px-2 h-full rounded cursor-pointer"
          style={{
            color: isGenerating ? 'var(--theme-accent)' : 'var(--theme-text-secondary)',
            backgroundColor: isGenerating ? 'var(--theme-accent-subtle)' : undefined
          }}
          title={isGenerating ? 'AI is generating...' : `Model: ${selectedModel}`}
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Bot className="w-3 h-3" />
          )}
          <span className="max-w-[120px] truncate">
            {isGenerating ? 'Generating...' : getModelDisplayName(selectedModel)}
          </span>
        </div>

        {/* AI Usage Stats */}
        <button
          onClick={onOpenAIUsage}
          className="px-2 h-full flex items-center gap-1 rounded transition-colors"
          style={{ color: 'var(--theme-text-muted)' }}
          title="AI Usage Analytics"
        >
          <BarChart3 className="w-3 h-3" />
          <span className="text-[10px]">Stats</span>
        </button>

        {/* Connection Status */}
        <div
          className="px-2 h-full flex items-center rounded"
          style={{ color: isOnline ? 'var(--color-success)' : 'var(--color-error)' }}
          title={isOnline ? 'Online' : 'Offline'}
        >
          {isOnline ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
        </div>

        {/* Version & About FluidFlow */}
        <button
          onClick={onOpenCredits}
          className="px-2 h-full flex items-center gap-1 rounded transition-colors"
          style={{ color: updateCheck?.hasUpdate ? 'var(--color-success)' : 'var(--theme-text-muted)' }}
          title={
            updateCheck?.hasUpdate
              ? `Update available: v${updateCheck.latestVersion} (current: v${APP_VERSION})`
              : `FluidFlow v${APP_VERSION}`
          }
        >
          {updateCheck?.hasUpdate ? (
            <>
              <ArrowUpCircle className="w-3 h-3" />
              <span className="text-[10px]">v{updateCheck.latestVersion}</span>
            </>
          ) : (
            <>
              <Info className="w-3 h-3" />
              <span className="text-[10px]">v{APP_VERSION}</span>
            </>
          )}
        </button>
      </div>
    </footer>
  );
});

export default StatusBar;
