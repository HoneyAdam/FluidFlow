/**
 * Toast Component
 *
 * Individual toast notification with animation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { Toast } from './types';

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

const TOAST_ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const getToastColors = (type: 'success' | 'error' | 'warning' | 'info') => {
  switch (type) {
    case 'success':
      return { bg: 'var(--color-success-subtle)', border: 'var(--color-success-border)', text: 'var(--color-success)' };
    case 'error':
      return { bg: 'var(--color-error-subtle)', border: 'var(--color-error-border)', text: 'var(--color-error)' };
    case 'warning':
      return { bg: 'var(--color-warning-subtle)', border: 'var(--color-warning-border)', text: 'var(--color-warning)' };
    case 'info':
      return { bg: 'var(--color-info-subtle)', border: 'var(--color-info-border)', text: 'var(--color-info)' };
  }
};

interface ToastProps {
  toast: Toast;
  onDismiss: () => void;
}

export const ToastItem: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start exit animation then dismiss after delay
  const startDismiss = useCallback(() => {
    setIsExiting(true);
    dismissTimerRef.current = setTimeout(onDismiss, 300);
  }, [onDismiss]);

  // Cleanup dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  useEffect((): (() => void) | undefined => {
    if (toast.duration === 0) return undefined;

    const duration = toast.duration ?? 5000;
    const interval = 50; // Update every 50ms
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= step) {
          clearInterval(timer);
          startDismiss();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast.duration, startDismiss]);

  const Icon = TOAST_ICONS[toast.type];
  const colors = getToastColors(toast.type);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg shadow-lg backdrop-blur-sm min-w-[320px] max-w-md transition-all duration-300',
        isExiting ? 'opacity-0 translate-x-full scale-95' : 'opacity-100 translate-x-0 scale-100'
      )}
      style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <Icon className="w-5 h-5" style={{ color: colors.text }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="font-semibold text-sm mb-1" style={{ color: 'var(--theme-text-primary)' }}>
            {toast.title}
          </div>
        )}
        <div className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
          {toast.message}
        </div>
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-medium underline hover:no-underline"
            style={{ color: 'var(--theme-text-primary)' }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close Button */}
      <button
        onClick={startDismiss}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--theme-text-muted)' }}
        aria-label="Close toast"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Bar */}
      {toast.duration !== 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
          <div
            className="h-full transition-all duration-75 ease-linear"
            style={{ width: `${progress}%`, backgroundColor: 'var(--theme-glass-300)' }}
          />
        </div>
      )}
    </div>
  );
};

export default ToastItem;
