import React from 'react';
import { AlertTriangle, X, FileWarning, Check } from 'lucide-react';
import { PendingSyncConfirmation } from '@/hooks/useProject';

interface SyncConfirmationDialogProps {
  confirmation: PendingSyncConfirmation;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const SyncConfirmationDialog: React.FC<SyncConfirmationDialogProps> = ({
  confirmation,
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  const { existingFileCount, newFileCount, message } = confirmation;
  const reductionPercent = existingFileCount > 0
    ? Math.round((1 - newFileCount / existingFileCount) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Sync confirmation"
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--color-warning-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--color-warning-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-warning-subtle)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>File Sync Confirmation</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Warning Message */}
          <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
            {message}
          </p>

          {/* Stats */}
          <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Current file count:</span>
              <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{existingFileCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>New file count:</span>
              <span className="font-medium" style={{ color: 'var(--color-warning)' }}>{newFileCount}</span>
            </div>
            <div className="pt-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
              <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Reduction rate:</span>
              <span className="font-bold" style={{ color: 'var(--color-error)' }}>{reductionPercent}%</span>
            </div>
          </div>

          {/* Warning Note */}
          <div className="flex items-start gap-2 text-xs rounded-lg p-3" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
            <FileWarning className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This action cannot be undone. Make sure your files are correct before confirming.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--theme-text-on-accent)' }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm and Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncConfirmationDialog;
