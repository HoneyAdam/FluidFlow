/**
 * ProjectHealthModal
 *
 * Displays project health status and allows fixing issues
 * like missing package.json, vite.config.ts, etc.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  FileX,
  FileWarning,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  checkProjectHealth,
  applyFixes,
  type HealthCheckResult,
  type HealthIssue,
} from '../services/projectHealth';
import type { FileSystem } from '../types';

interface ProjectHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  projectName?: string;
  onApplyFixes: (fixes: Record<string, string>) => void;
}

export const ProjectHealthModal: React.FC<ProjectHealthModalProps> = ({
  isOpen,
  onClose,
  files,
  projectName,
  onApplyFixes,
}) => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixedIssues, setFixedIssues] = useState<Set<string>>(new Set());
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  // Reset state when project changes (files or projectName)
  useEffect(() => {
    setFixedIssues(new Set());
    setSelectedIssues(new Set());
    setExpandedIssues(new Set());
  }, [files, projectName]);

  // Run health check
  const healthCheck = useMemo<HealthCheckResult>(() => {
    return checkProjectHealth(files, projectName);
  }, [files, projectName]);

  // Filter out already fixed issues
  const activeIssues = useMemo(() => {
    return healthCheck.issues.filter((i) => !fixedIssues.has(i.id));
  }, [healthCheck.issues, fixedIssues]);

  const toggleIssue = (id: string) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const fixableIds = activeIssues.filter((i) => i.fixable).map((i) => i.id);
    setSelectedIssues(new Set(fixableIds));
  };

  const selectNone = () => {
    setSelectedIssues(new Set());
  };

  const handleFixSelected = async () => {
    const issuesToFix = activeIssues.filter(
      (i) => selectedIssues.has(i.id) && i.fixable
    );

    if (issuesToFix.length === 0) return;

    setIsFixing(true);

    try {
      // Small delay for UX
      await new Promise((r) => setTimeout(r, 500));

      const fixes = applyFixes(issuesToFix);
      onApplyFixes(fixes);

      // Mark as fixed
      setFixedIssues((prev) => {
        const next = new Set(prev);
        issuesToFix.forEach((i) => next.add(i.id));
        return next;
      });
      setSelectedIssues(new Set());
    } finally {
      setIsFixing(false);
    }
  };

  const handleFixAll = async () => {
    const fixableIssues = activeIssues.filter((i) => i.fixable);
    if (fixableIssues.length === 0) return;

    setIsFixing(true);

    try {
      await new Promise((r) => setTimeout(r, 500));

      const fixes = applyFixes(fixableIssues);
      onApplyFixes(fixes);

      // Mark all as fixed
      setFixedIssues((prev) => {
        const next = new Set(prev);
        fixableIssues.forEach((i) => next.add(i.id));
        return next;
      });
      setSelectedIssues(new Set());
    } finally {
      setIsFixing(false);
    }
  };

  const getStatusIcon = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'healthy':
        return <ShieldCheck className="w-6 h-6" style={{ color: 'var(--color-success)' }} />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />;
      case 'critical':
        return <AlertCircle className="w-6 h-6" style={{ color: 'var(--color-error)' }} />;
    }
  };

  const getIssueIcon = (issue: HealthIssue) => {
    if (issue.type === 'missing') {
      return <FileX className="w-4 h-4" />;
    }
    return <FileWarning className="w-4 h-4" />;
  };

  const getSeverityStyles = (severity: HealthIssue['severity']): React.CSSProperties => {
    switch (severity) {
      case 'error':
        return { color: 'var(--color-error)', backgroundColor: 'var(--color-error-subtle)', borderColor: 'var(--color-error-border)' };
      case 'warning':
        return { color: 'var(--color-warning)', backgroundColor: 'var(--color-warning-subtle)', borderColor: 'var(--color-warning-border)' };
      case 'info':
        return { color: 'var(--color-info)', backgroundColor: 'var(--color-info-subtle)', borderColor: 'var(--color-info-border)' };
    }
  };

  if (!isOpen) return null;

  const allHealthy = activeIssues.length === 0;
  const fixableCount = activeIssues.filter((i) => i.fixable).length;
  const selectedCount = selectedIssues.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Project health">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'var(--theme-modal-overlay)' }} onClick={onClose} />

      <div className="relative rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: allHealthy
                  ? 'var(--color-success-subtle)'
                  : healthCheck.status === 'critical'
                    ? 'var(--color-error-subtle)'
                    : 'var(--color-warning-subtle)'
              }}
            >
              {getStatusIcon(allHealthy ? 'healthy' : healthCheck.status)}
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Project Health</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                {allHealthy
                  ? 'All critical files are present and valid'
                  : `${activeIssues.length} issue(s) found`}
              </p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {allHealthy ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--color-success)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                Project is Healthy
              </h3>
              <p className="max-w-md" style={{ color: 'var(--theme-text-muted)' }}>
                All critical configuration files are present and valid.
                Your project is ready to run.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Selection controls */}
              {fixableCount > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs"
                      style={{ color: 'var(--color-info)' }}
                    >
                      Select All ({fixableCount})
                    </button>
                    <span style={{ color: 'var(--theme-text-dim)' }}>•</span>
                    <button
                      onClick={selectNone}
                      className="text-xs"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                    {selectedCount} selected
                  </div>
                </div>
              )}

              {/* Issues list */}
              {activeIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="border rounded-lg overflow-hidden transition-colors"
                  style={getSeverityStyles(issue.severity)}
                >
                  <div className="flex items-center gap-3 p-3">
                    {issue.fixable && (
                      <input
                        type="checkbox"
                        checked={selectedIssues.has(issue.id)}
                        onChange={() => toggleIssue(issue.id)}
                        className="rounded"
                        style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}
                      />
                    )}
                    <div
                      className="p-1.5 rounded"
                      style={{
                        backgroundColor: issue.severity === 'error'
                          ? 'var(--color-error-subtle)'
                          : issue.severity === 'warning'
                            ? 'var(--color-warning-subtle)'
                            : 'var(--color-info-subtle)'
                      }}
                    >
                      {getIssueIcon(issue)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono" style={{ color: 'var(--theme-text-primary)' }}>
                          {issue.file}
                        </code>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded uppercase font-medium"
                          style={{
                            backgroundColor: issue.type === 'missing'
                              ? 'var(--color-error-subtle)'
                              : 'var(--color-warning-subtle)',
                            color: issue.type === 'missing'
                              ? 'var(--color-error)'
                              : 'var(--color-warning)'
                          }}
                        >
                          {issue.type}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                        {issue.message}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(issue.id)}
                      className="p-1 rounded"
                    >
                      {expandedIssues.has(issue.id) ? (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      ) : (
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                      )}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {expandedIssues.has(issue.id) && (
                    <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
                      <div className="flex items-start gap-2 pt-3">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-text-dim)' }} />
                        <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                          {issue.fixable ? (
                            <>
                              This issue can be automatically fixed by generating
                              a default <code style={{ color: 'var(--theme-text-primary)' }}>{issue.file}</code> file.
                            </>
                          ) : (
                            'This issue requires manual intervention.'
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            <RefreshCw className="w-3.5 h-3.5" />
            Checked {new Date(healthCheck.checkedAt).toLocaleTimeString()}
          </div>

          <div className="flex items-center gap-3">
            {!allHealthy && fixableCount > 0 && (
              <>
                {selectedCount > 0 && (
                  <button
                    onClick={handleFixSelected}
                    disabled={isFixing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-info)', color: 'white' }}
                  >
                    {isFixing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                    Fix Selected ({selectedCount})
                  </button>
                )}
                <button
                  onClick={handleFixAll}
                  disabled={isFixing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
                >
                  {isFixing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Fix All ({fixableCount})
                </button>
              </>
            )}
            {allHealthy && (
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHealthModal;
