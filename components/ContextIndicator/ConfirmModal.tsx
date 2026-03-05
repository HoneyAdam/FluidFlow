import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { ConfirmModalProps } from './types';

const getVariantColors = (variant: 'danger' | 'warning' | 'default') => {
  switch (variant) {
    case 'danger':
      return { bg: 'var(--color-error)', bgSubtle: 'var(--color-error-subtle)', text: 'var(--color-error)' };
    case 'warning':
      return { bg: 'var(--color-warning)', bgSubtle: 'var(--color-warning-subtle)', text: 'var(--color-warning)' };
    default:
      return { bg: 'var(--theme-accent)', bgSubtle: 'var(--theme-accent-subtle)', text: 'var(--theme-accent)' };
  }
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  confirmVariant = 'danger'
}) => {
  if (!isOpen) return null;

  const colors = getVariantColors(confirmVariant);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[99999] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: colors.bgSubtle }}>
              <AlertTriangle className="w-5 h-5" style={{ color: colors.text }} />
            </div>
            <h3 className="font-medium text-lg" style={{ color: 'var(--theme-text-primary)' }}>{title}</h3>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{message}</p>
        </div>
        <div className="flex gap-3 p-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ backgroundColor: colors.bg, color: 'white' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ConfirmModal;
