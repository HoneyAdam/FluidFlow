/**
 * Compaction Preview Modal
 *
 * Shows which messages will be compacted before actually doing it
 */

import React from 'react';
import { FileText, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

export interface CompactionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  contextId: string;
  messagesToCompact: Array<{
    id: string;
    role: string;
    preview: string;
    timestamp?: number;
  }>;
  stats: {
    beforeTokens: number;
    afterTokens: number;
    messagesToSummarize: number;
    messagesToKeep: number;
  };
}

export const CompactionPreviewModal: React.FC<CompactionPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  contextId: _contextId,
  messagesToCompact,
  stats,
}) => {
  if (!isOpen) return null;

  const tokensSaved = stats.beforeTokens - stats.afterTokens;
  const percentSaved = ((tokensSaved / stats.beforeTokens) * 100).toFixed(0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-modal-overlay)' }} role="dialog" aria-modal="true" aria-label="Context compaction">
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" style={{ backgroundColor: 'var(--theme-modal-bg)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="p-6" style={{ borderBottom: '1px solid var(--theme-border)', background: 'linear-gradient(to right, var(--theme-accent-subtle), var(--theme-tertiary-subtle))' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)' }}>
              <MessageSquare className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Context Compaction Preview</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Review messages before compacting</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Stats Summary */}
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Before</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>{stats.beforeTokens.toLocaleString()}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>tokens</div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>After</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--color-success)' }}>{stats.afterTokens.toLocaleString()}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>tokens</div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Saved</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--theme-accent)' }}>{tokensSaved.toLocaleString()}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>tokens ({percentSaved}%)</div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Messages</div>
                <div className="text-lg font-semibold" style={{ color: 'var(--color-warning)' }}>{stats.messagesToSummarize}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>to summarize</div>
              </div>
            </div>
          </div>

          {/* Messages to Compact */}
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
              Messages to be Summarized ({messagesToCompact.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {messagesToCompact.map((msg, index) => (
                <div
                  key={msg.id}
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--color-warning-border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded" style={{
                      backgroundColor: msg.role === 'user' ? 'var(--theme-accent-subtle)' : 'var(--theme-tertiary-subtle)',
                      color: msg.role === 'user' ? 'var(--theme-accent)' : 'var(--theme-tertiary)'
                    }}>
                      {msg.role === 'user' ? (
                        <MessageSquare className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium capitalize" style={{ color: 'var(--theme-text-primary)' }}>{msg.role}</span>
                        <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>#{index + 1}</span>
                      </div>
                      <p className="text-sm line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>
                        {msg.preview}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-border)' }}>
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-accent)' }} />
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
              These messages will be summarized by AI to save tokens while preserving important context.
              The summary will replace all selected messages.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
          >
            <CheckCircle className="w-4 h-4" />
            Confirm Compaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactionPreviewModal;
