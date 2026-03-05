import React, { useState, useRef, useEffect } from 'react';
import { COPY_FEEDBACK_RESET_MS } from '../constants/timing';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  FileCode,
  Copy,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Loader2,
  Zap,
  Search,
  Settings,
  Bookmark
} from 'lucide-react';
import { AIHistoryEntry } from '../services/projectApi';
import { ConfirmModal } from './ContextIndicator/ConfirmModal';
import { formatDuration, formatSize, formatTime } from '../utils/timeFormat';

interface EntryCardProps {
  entry: AIHistoryEntry;
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  copiedId: string | null;
  setCopiedId: React.Dispatch<React.SetStateAction<string | null>>;
  restoringId: string | null;
  setRestoringId: React.Dispatch<React.SetStateAction<string | null>>;
  onRestore: (entry: AIHistoryEntry) => Promise<void>;
  onCopyRaw: (entry: AIHistoryEntry) => Promise<void>;
  formatDuration: (ms: number) => string;
  formatSize: (chars: number) => string;
  formatTime: (timestamp: number) => string;
}

interface AIHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: AIHistoryEntry[];
  onClearHistory: () => void;
  onDeleteEntry: (id: string) => void;
  onExportHistory: () => string;
  onRestoreEntry?: (entry: AIHistoryEntry) => Promise<boolean>;
}

export const AIHistoryModal: React.FC<AIHistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onClearHistory,
  onDeleteEntry,
  onExportHistory,
  onRestoreEntry
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  // Entry Card Component - defined once for reuse
  const EntryCard = ({ entry, expandedId, setExpandedId, copiedId, setCopiedId: _setCopiedId, restoringId, setRestoringId: _setRestoringId, onRestore: _onRestore, onCopyRaw: _onCopyRaw, formatDuration, formatSize, formatTime }: EntryCardProps) => (
    <div
      key={entry.id}
      className="rounded-lg overflow-hidden transition-colors"
      style={{
        border: entry.success ? '1px solid var(--theme-border)' : '1px solid var(--color-error-border)',
        backgroundColor: entry.success ? 'var(--theme-glass-200)' : 'var(--color-error-subtle)'
      }}
    >
      {/* Entry Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer group"
        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
      >
        {expandedId === entry.id ? (
          <ChevronDown size={16} style={{ color: 'var(--theme-text-dim)' }} />
        ) : (
          <ChevronRight size={16} style={{ color: 'var(--theme-text-dim)' }} />
        )}

        {entry.success ? (
          <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
        ) : (
          <XCircle size={16} style={{ color: 'var(--color-error)' }} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Template Type Badge */}
            {entry.templateType && (
              <div className="flex items-center gap-1">
                {entry.templateType === 'auto-fix' && <Zap size={12} style={{ color: 'var(--color-warning)' }} />}
                {entry.templateType === 'inspect-edit' && <Search size={12} style={{ color: 'var(--color-feature)' }} />}
                {entry.templateType === 'prompt-template' && <Settings size={12} style={{ color: 'var(--color-info)' }} />}
                {entry.templateType === 'checkpoint' && <Bookmark size={12} style={{ color: 'var(--color-success)' }} />}
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: entry.templateType === 'auto-fix' ? 'var(--color-warning-subtle)'
                      : entry.templateType === 'inspect-edit' ? 'var(--color-feature-subtle)'
                      : entry.templateType === 'checkpoint' ? 'var(--color-success-subtle)'
                      : 'var(--color-info-subtle)',
                    color: entry.templateType === 'auto-fix' ? 'var(--color-warning)'
                      : entry.templateType === 'inspect-edit' ? 'var(--color-feature)'
                      : entry.templateType === 'checkpoint' ? 'var(--color-success)'
                      : 'var(--color-info)'
                  }}
                >
                  {entry.templateType.toUpperCase().replace('-', ' ')}
                </span>
              </div>
            )}
            <span className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
              {entry.prompt.slice(0, 60)}{entry.prompt.length > 60 ? '...' : ''}
            </span>
            {entry.truncated && (
              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                TRUNCATED
              </span>
            )}
            {entry.isUpdate && (
              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                UPDATE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>
            <span>{formatTime(entry.timestamp)}</span>
            <span>{entry.provider} / {entry.model}</span>
            <span>{formatDuration(entry.durationMs)}</span>
            <span>{formatSize(entry.responseChars)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Restore button - only for successful entries */}
          {entry.success && onRestoreEntry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(entry);
              }}
              disabled={restoringId !== null}
              className="p-1.5 opacity-0 group-hover:opacity-100 rounded transition-all disabled:opacity-50"
              style={{ color: 'var(--theme-text-dim)' }}
              title="Load this state"
            >
              {restoringId === entry.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteEntry(entry.id);
            }}
            className="p-1.5 opacity-0 group-hover:opacity-100 rounded transition-all"
            style={{ color: 'var(--theme-text-dim)' }}
            title="Delete entry"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expandedId === entry.id && (
        <div className="p-4 space-y-4" style={{ borderTop: '1px solid var(--theme-border)' }}>
          {/* Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <div style={{ color: 'var(--theme-text-dim)' }}>Provider</div>
              <div className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{entry.provider}</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <div style={{ color: 'var(--theme-text-dim)' }}>Model</div>
              <div className="font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{entry.model}</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <div style={{ color: 'var(--theme-text-dim)' }}>Duration</div>
              <div className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{formatDuration(entry.durationMs)}</div>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <div style={{ color: 'var(--theme-text-dim)' }}>Size</div>
              <div className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{formatSize(entry.responseChars)}</div>
            </div>
          </div>

          {/* Prompt */}
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Prompt</div>
            <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{entry.prompt}</div>
          </div>

          {/* Explanation */}
          {entry.explanation && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Explanation</div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>{entry.explanation}</div>
            </div>
          )}

          {/* Files Generated */}
          {entry.filesGenerated && entry.filesGenerated.length > 0 && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
              <div className="text-xs mb-2" style={{ color: 'var(--theme-text-dim)' }}>Files Generated ({entry.filesGenerated.length})</div>
              <div className="flex flex-wrap gap-1">
                {entry.filesGenerated.map((file: string) => (
                  <span key={file} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}>
                    {file}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {entry.error && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--color-error)' }}>Error</div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-error)' }}>{entry.error}</div>
            </div>
          )}

          {/* Raw Response */}
          {entry.rawResponse && (
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Raw Response</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyRaw(entry)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    <Copy size={12} />
                    {copiedId === entry.id ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setShowRawResponse(showRawResponse === entry.id ? null : entry.id)}
                    className="text-xs"
                    style={{ color: 'var(--color-info)' }}
                  >
                    {showRawResponse === entry.id ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {showRawResponse === entry.id && (
                <pre className="p-3 rounded-lg text-xs max-h-64 overflow-auto font-mono whitespace-pre-wrap break-all" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-muted)' }}>
                  {entry.rawResponse}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );



  const handleCopyRaw = async (entry: AIHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.rawResponse);
      setCopiedId(entry.id);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), COPY_FEEDBACK_RESET_MS);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleExport = () => {
    const json = onExportHistory();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (entry: AIHistoryEntry) => {
    if (!onRestoreEntry || restoringId) return;

    setRestoringId(entry.id);
    try {
      const success = await onRestoreEntry(entry);
      if (success) {
        onClose();
      }
    } finally {
      setRestoringId(null);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--theme-overlay)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI history"
    >
      <div
        className="w-[90vw] max-w-7xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <Sparkles size={20} style={{ color: 'var(--color-feature)' }} />
            <span className="font-medium text-lg" style={{ color: 'var(--theme-text-primary)' }}>AI Generation History</span>
            <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
              {history.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Export history as JSON"
            >
              <Download size={14} />
              Export
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <Trash2 size={14} />
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {history.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--theme-text-dim)' }}>
              <Clock size={48} className="mx-auto mb-4 opacity-30" />
              <p>No AI generation history yet</p>
              <p className="text-sm mt-2" style={{ color: 'var(--theme-text-dim)' }}>
                History will appear here after generating code
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Categorize history by template type */}
              {(() => {
                const checkpoints = history.filter(e => e.templateType === 'checkpoint');
                const templates = history.filter(e => e.templateType && e.templateType !== 'checkpoint');
                const chats = history.filter(e => !e.templateType);

                return (
                  <>
                    {/* Checkpoints Section */}
                    {checkpoints.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <Bookmark size={16} style={{ color: 'var(--color-success)' }} />
                          <h3 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                            Checkpoints
                          </h3>
                          <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                            {checkpoints.length}
                          </span>
                        </div>
                        {checkpoints.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            copiedId={copiedId}
                            setCopiedId={setCopiedId}
                            restoringId={restoringId}
                            setRestoringId={setRestoringId}
                            onRestore={handleRestore}
                            onCopyRaw={handleCopyRaw}
                            formatDuration={formatDuration}
                            formatSize={formatSize}
                            formatTime={formatTime}
                          />
                        ))}
                      </div>
                    )}

                    {/* Prompt Templates Section */}
                    {templates.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <Settings size={16} style={{ color: 'var(--color-feature)' }} />
                          <h3 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                            Prompt Templates
                          </h3>
                          <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                            {templates.length}
                          </span>
                        </div>
                        {templates.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            copiedId={copiedId}
                            setCopiedId={setCopiedId}
                            restoringId={restoringId}
                            setRestoringId={setRestoringId}
                            onRestore={handleRestore}
                            onCopyRaw={handleCopyRaw}
                            formatDuration={formatDuration}
                            formatSize={formatSize}
                            formatTime={formatTime}
                          />
                        ))}
                      </div>
                    )}

                    {/* Chat History Section */}
                    {chats.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                          <FileCode size={16} style={{ color: 'var(--color-info)' }} />
                          <h3 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                            Chat History
                          </h3>
                          <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                            {chats.length}
                          </span>
                        </div>
                        {chats.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            copiedId={copiedId}
                            setCopiedId={setCopiedId}
                            restoringId={restoringId}
                            setRestoringId={setRestoringId}
                            onRestore={handleRestore}
                            onCopyRaw={handleCopyRaw}
                            formatDuration={formatDuration}
                            formatSize={formatSize}
                            formatTime={formatTime}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-none p-3" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="text-xs text-center" style={{ color: 'var(--theme-text-dim)' }}>
            Click <RotateCcw size={10} className="inline mx-0.5" /> to load files and chat from a previous state.
          </div>
        </div>
      </div>

      {/* Clear History Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={onClearHistory}
        title="Clear All AI History"
        message="This will permanently delete all AI generation history. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />
    </div>
  );

  // Use portal to render outside of parent DOM hierarchy
  return createPortal(modalContent, document.body);
};

export default AIHistoryModal;
