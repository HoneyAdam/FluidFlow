/**
 * Input Dialog Modal
 *
 * A reusable modal for getting user input (replaces window.prompt)
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check } from 'lucide-react';

export interface InputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  inputType?: 'text' | 'password' | 'email' | 'url';
  validate?: (value: string) => string | null;
  maxLength?: number;
}

export const InputDialog: React.FC<InputDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Confirm',
  inputType = 'text',
  validate,
  maxLength,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, defaultValue]);

  const handleClose = () => {
    setValue(defaultValue);
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onConfirm(value);
    setValue(defaultValue);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Input dialog"
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-150"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <h3 className="font-medium text-lg" style={{ color: 'var(--theme-text-primary)' }}>{title}</h3>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {message && <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{message}</p>}

          <div className="space-y-1.5">
            <input
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              maxLength={maxLength}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
              style={{
                backgroundColor: 'var(--theme-input-bg)',
                border: error ? '1px solid var(--color-error)' : '1px solid var(--theme-input-border)',
                color: 'var(--theme-text-primary)'
              }}
            />

            {maxLength && (
              <div className="flex justify-end">
                <span className="text-[10px]" style={{
                  color: value.length > maxLength * 0.9 ? 'var(--color-warning)' : 'var(--theme-text-dim)'
                }}>
                  {value.length} / {maxLength}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-xs animate-in fade-in duration-150" style={{ color: 'var(--color-error)' }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
          >
            <Check className="w-4 h-4" />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default InputDialog;
