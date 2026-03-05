import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  Zap,
  MessageSquare,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText,
  X,
  Loader2,
  BarChart3,
  Layers,
  Scissors,
  Sparkles,
  Palette,
  FolderTree
} from 'lucide-react';
import { getContextManager, ConversationContext } from '@/services/conversationContext';
import { getFluidFlowConfig, CompactionLog } from '@/services/fluidflowConfig';
import { getProviderManager } from '@/services/ai';
import { getProjectContext, deleteProjectContext, type ProjectContext } from '@/services/projectContext';
import { ContextManagerModalProps } from './types';
import { ConfirmModal } from './ConfirmModal';
import { getModelContextSize } from './utils';

export const ContextManagerModal: React.FC<ContextManagerModalProps> = ({
  contextId,
  projectId,
  onClose,
  onCompact
}) => {
  const [isCompacting, setIsCompacting] = useState(false);
  const [allContexts, setAllContexts] = useState<ConversationContext[]>([]);
  const [compactionLogs, setCompactionLogs] = useState<CompactionLog[]>([]);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'project' | 'all' | 'logs'>('current');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'default';
    onConfirm: () => void;
  } | null>(null);

  const contextManager = getContextManager();
  const fluidflowConfig = getFluidFlowConfig();
  const maxTokens = getModelContextSize();

  // Get current context stats
  const stats = contextManager.getStats(contextId);

  useEffect(() => {
    setAllContexts(contextManager.listContexts());
    setCompactionLogs(fluidflowConfig.getCompactionLogs());
    if (projectId) {
      setProjectContext(getProjectContext(projectId));
    }
    // Note: contextManager and fluidflowConfig are singletons that do not change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCompact = async () => {
    if (!onCompact) return;
    setIsCompacting(true);
    try {
      await onCompact();
    } finally {
      setIsCompacting(false);
    }
  };

  const handleClearContext = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Messages',
      message: 'This will clear all messages in the current context. This action cannot be undone.',
      confirmText: 'Clear All',
      variant: 'warning',
      onConfirm: () => {
        contextManager.clearContext(contextId);
        onClose();
      }
    });
  };

  const handleDeleteContext = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Context',
      message: 'This will permanently delete this context and all its messages. This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        contextManager.deleteContext(id);
        setAllContexts(contextManager.listContexts());
      }
    });
  };

  const handleClearLogs = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Logs',
      message: 'This will clear all compaction logs. This action cannot be undone.',
      confirmText: 'Clear Logs',
      variant: 'warning',
      onConfirm: () => {
        fluidflowConfig.clearCompactionLogs();
        setCompactionLogs([]);
      }
    });
  };

  const handleDeleteProjectContext = () => {
    if (!projectId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete AI Context',
      message: 'This will delete the generated style guide and project summary. You can regenerate it anytime from the AI Context button.',
      confirmText: 'Delete',
      variant: 'warning',
      onConfirm: () => {
        deleteProjectContext(projectId);
        setProjectContext(null);
      }
    });
  };

  const usagePercent = stats ? Math.min(100, (stats.tokens / maxTokens) * 100) : 0;
  const isWarning = usagePercent > 60;
  const isCritical = usagePercent > 80;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Context manager"
    >
      <div
        className="w-[90vw] max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(to bottom right, var(--theme-accent-subtle), var(--theme-ai-subtle))' }}>
              <Database className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="font-medium text-lg" style={{ color: 'var(--theme-text-primary)' }}>Context Manager</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Manage conversation context and memory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          {[
            { id: 'current', label: 'Conversation', icon: Layers },
            { id: 'project', label: 'AI Context', icon: Sparkles, highlight: !!projectContext },
            { id: 'all', label: 'All Contexts', icon: Database },
            { id: 'logs', label: 'Logs', icon: FileText }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'current' | 'project' | 'all' | 'logs')}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab.id
                  ? (tab.id === 'project' ? 'var(--theme-ai-accent)' : 'var(--theme-accent)')
                  : ('highlight' in tab && tab.highlight ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)'),
                borderBottom: activeTab === tab.id
                  ? (tab.id === 'project' ? '2px solid var(--theme-ai-accent)' : '2px solid var(--theme-accent)')
                  : '2px solid transparent',
                backgroundColor: activeTab === tab.id
                  ? (tab.id === 'project' ? 'var(--theme-ai-subtle)' : 'var(--theme-accent-subtle)')
                  : 'transparent'
              }}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Current Context Tab */}
          {activeTab === 'current' && stats && (
            <div className="space-y-4">
              {/* Usage Gauge */}
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>Context Usage</span>
                  <span
                    className="text-sm font-mono"
                    style={{
                      color: isCritical ? 'var(--color-error)' : isWarning ? 'var(--color-warning)' : 'var(--color-success)'
                    }}
                  >
                    {stats.tokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-4 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--theme-background)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${usagePercent}%`,
                      background: isCritical
                        ? 'linear-gradient(to right, var(--color-error), var(--color-error))'
                        : isWarning
                        ? 'linear-gradient(to right, var(--color-warning), var(--color-warning))'
                        : 'linear-gradient(to right, var(--color-success), var(--color-success))'
                    }}
                  />
                </div>

                {/* Markers */}
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                  <span>0%</span>
                  <span style={{ color: 'var(--color-warning)' }}>60%</span>
                  <span style={{ color: 'var(--color-error)' }}>80%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                  <MessageSquare className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--theme-accent)' }} />
                  <div className="text-xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.messages}</div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Messages</div>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                  <Zap className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--color-warning)' }} />
                  <div className="text-xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>~{Math.round(stats.tokens / 1000)}k</div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Tokens</div>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                  <BarChart3 className="w-5 h-5 mx-auto mb-1" style={{ color: 'var(--color-success)' }} />
                  <div className="text-xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{Math.round(usagePercent)}%</div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Usage</div>
                </div>
              </div>

              {/* Context Info */}
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--theme-text-dim)' }}>Context ID</div>
                <code className="text-xs font-mono break-all" style={{ color: 'var(--theme-text-secondary)' }}>{contextId}</code>
              </div>

              {/* Warning/Status */}
              {isCritical && (
                <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                  <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--color-error)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>Critical: Context nearly full</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-error)', opacity: 0.7 }}>
                      Compact now to avoid losing context or degraded performance.
                    </p>
                  </div>
                </div>
              )}

              {isWarning && !isCritical && (
                <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
                  <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--color-warning)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>Warning: Context filling up</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-warning)', opacity: 0.7 }}>
                      Consider compacting to summarize old messages.
                    </p>
                  </div>
                </div>
              )}

              {!isWarning && (
                <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
                  <CheckCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--color-success)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>Healthy context usage</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-success)', opacity: 0.7 }}>
                      Plenty of room for more conversation.
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {onCompact && (
                  <button
                    onClick={handleCompact}
                    disabled={isCompacting || stats.messages < 4}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning)' }}
                  >
                    {isCompacting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Compacting...
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" />
                        Compact Context
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleClearContext}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--theme-button-secondary)', color: 'var(--theme-text-secondary)' }}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Messages
                </button>

                <button
                  onClick={() => {
                    contextManager.clearContext(contextId);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent-muted)', color: 'var(--theme-accent)' }}
                >
                  <RefreshCw className="w-4 h-4" />
                  New Context
                </button>
              </div>
            </div>
          )}

          {/* Project Context Tab */}
          {activeTab === 'project' && (
            <div className="space-y-4">
              {projectContext ? (
                <>
                  {/* Status */}
                  <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-ai-subtle)', border: '1px solid var(--theme-ai-muted)' }}>
                    <CheckCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--theme-ai-accent)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--theme-ai-accent)' }}>AI Context Active</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--theme-ai-accent)', opacity: 0.7 }}>
                        Generated on {new Date(projectContext.generatedAt).toLocaleDateString()} at {new Date(projectContext.generatedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {/* Token Info */}
                  <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Context Size</span>
                      <span className="text-sm font-mono" style={{ color: 'var(--theme-ai-accent)' }}>
                        ~{Math.ceil(projectContext.combinedPrompt.length / 4)} tokens
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                      This context is added to every AI prompt for consistent style and understanding.
                    </p>
                  </div>

                  {/* Style Guide Preview */}
                  <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--theme-ai-accent)' }}>
                      <Palette className="w-4 h-4" />
                      <span className="text-sm font-medium">Style Guide</span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.styleGuide.summary}</p>

                    {/* Colors */}
                    {projectContext.styleGuide.colors && Object.values(projectContext.styleGuide.colors).some(v => v) && (
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: 'var(--theme-text-dim)' }}>Colors</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(projectContext.styleGuide.colors)
                            .filter(([_, v]) => v)
                            .slice(0, 6)
                            .map(([name, value]) => (
                              <span
                                key={name}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                                style={{ backgroundColor: 'var(--theme-glass-200)' }}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: value?.startsWith('#') ? value : undefined, border: '1px solid var(--theme-border)' }}
                                />
                                <span style={{ color: 'var(--theme-text-muted)' }}>{name}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Typography & Borders */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {projectContext.styleGuide.typography?.fontFamily && (
                        <div>
                          <span style={{ color: 'var(--theme-text-dim)' }}>Font:</span>
                          <span className="ml-1" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.styleGuide.typography.fontFamily}</span>
                        </div>
                      )}
                      {projectContext.styleGuide.borders?.radius && (
                        <div>
                          <span style={{ color: 'var(--theme-text-dim)' }}>Radius:</span>
                          <span className="ml-1" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.styleGuide.borders.radius}</span>
                        </div>
                      )}
                      {projectContext.styleGuide.effects?.shadow && (
                        <div>
                          <span style={{ color: 'var(--theme-text-dim)' }}>Shadow:</span>
                          <span className="ml-1" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.styleGuide.effects.shadow}</span>
                        </div>
                      )}
                      {projectContext.styleGuide.spacing?.elementGap && (
                        <div>
                          <span style={{ color: 'var(--theme-text-dim)' }}>Gap:</span>
                          <span className="ml-1" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.styleGuide.spacing.elementGap}</span>
                        </div>
                      )}
                    </div>

                    {/* Patterns */}
                    {projectContext.styleGuide.patterns?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {projectContext.styleGuide.patterns.slice(0, 3).map((pattern, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--theme-ai-subtle)', color: 'var(--theme-ai-accent)' }}>
                            {pattern}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Project Summary Preview */}
                  <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                    <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--theme-accent)' }}>
                      <FolderTree className="w-4 h-4" />
                      <span className="text-sm font-medium">Project Summary</span>
                    </div>
                    <p className="text-xs mb-2" style={{ color: 'var(--theme-text-secondary)' }}>{projectContext.projectSummary.summary}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span style={{ color: 'var(--theme-text-dim)' }}>Purpose:</span>
                        <p className="truncate" style={{ color: 'var(--theme-text-muted)' }}>{projectContext.projectSummary.purpose}</p>
                      </div>
                      <div>
                        <span style={{ color: 'var(--theme-text-dim)' }}>Architecture:</span>
                        <p className="truncate" style={{ color: 'var(--theme-text-muted)' }}>{projectContext.projectSummary.architecture}</p>
                      </div>
                    </div>
                    {projectContext.projectSummary.techStack.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {projectContext.projectSummary.techStack.slice(0, 5).map((tech, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}>
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteProjectContext}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                      style={{ backgroundColor: 'var(--theme-button-secondary)', color: 'var(--theme-text-secondary)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Context
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Sparkles className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--theme-text-dim)' }} />
                  <p className="mb-2" style={{ color: 'var(--theme-text-muted)' }}>No AI Context Generated</p>
                  <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--theme-text-dim)' }}>
                    Use the "AI Context" button in the control panel to generate a style guide and project summary for consistent AI responses.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* All Contexts Tab */}
          {activeTab === 'all' && (
            <div className="space-y-2">
              {allContexts.length === 0 ? (
                <p className="text-center py-8" style={{ color: 'var(--theme-text-dim)' }}>No contexts found</p>
              ) : (
                allContexts.map(ctx => {
                  const ctxUsage = (ctx.estimatedTokens / maxTokens) * 100;
                  const isActive = ctx.id === contextId;

                  return (
                    <div
                      key={ctx.id}
                      className="p-3 rounded-lg transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--theme-accent-subtle)' : 'var(--theme-glass-100)',
                        border: isActive ? '1px solid var(--theme-accent-muted)' : '1px solid var(--theme-border-light)'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{ctx.name}</span>
                            {isActive && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}>
                                Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>
                            <span>{ctx.messages.length} messages</span>
                            <span>~{Math.round(ctx.estimatedTokens / 1000)}k tokens</span>
                            <span>{new Date(ctx.lastUpdatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Mini usage bar */}
                          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, ctxUsage)}%`,
                                backgroundColor: ctxUsage > 80 ? 'var(--color-error)' :
                                  ctxUsage > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                              }}
                            />
                          </div>

                          {!isActive && (
                            <button
                              onClick={() => handleDeleteContext(ctx.id)}
                              className="p-1.5 rounded transition-colors"
                              title="Delete context"
                              style={{ color: 'var(--theme-text-dim)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Compaction Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-2">
              {compactionLogs.length === 0 ? (
                <p className="text-center py-8" style={{ color: 'var(--theme-text-dim)' }}>No compaction logs yet</p>
              ) : (
                compactionLogs.slice().reverse().map(log => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Scissors className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>Compaction</span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                        <span style={{ color: 'var(--theme-text-dim)' }}>Before:</span>
                        <span className="ml-1" style={{ color: 'var(--color-error)' }}>~{Math.round(log.beforeTokens / 1000)}k</span>
                      </div>
                      <div className="rounded p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                        <span style={{ color: 'var(--theme-text-dim)' }}>After:</span>
                        <span className="ml-1" style={{ color: 'var(--color-success)' }}>~{Math.round(log.afterTokens / 1000)}k</span>
                      </div>
                      <div className="rounded p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                        <span style={{ color: 'var(--theme-text-dim)' }}>Saved:</span>
                        <span className="ml-1" style={{ color: 'var(--theme-accent)' }}>
                          {Math.round((1 - log.afterTokens / log.beforeTokens) * 100)}%
                        </span>
                      </div>
                    </div>

                    <p className="text-xs mt-2" style={{ color: 'var(--theme-text-dim)' }}>{log.summary}</p>
                  </div>
                ))
              )}

              {compactionLogs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="w-full mt-2 px-4 py-2 text-sm rounded-lg transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  Clear All Logs
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            <span>Model: {getProviderManager().getActiveConfig()?.defaultModel || 'Unknown'}</span>
            <span>Max Context: {maxTokens.toLocaleString()} tokens</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modalContent, document.body)}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          confirmVariant={confirmModal.variant}
        />
      )}
    </>
  );
};

export default ContextManagerModal;
