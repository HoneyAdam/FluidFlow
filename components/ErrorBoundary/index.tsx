/**
 * Error Boundary Component
 *
 * Catches React errors and unhandled promise rejections.
 * Provides recovery options and integrates with Toast notifications.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Download, Bug } from 'lucide-react';
import { logger } from '@/utils/logger';

// Types
export type ErrorCategory = 'network' | 'render' | 'async' | 'unknown';

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCategory: ErrorCategory;
  errorId: string;
  retryCount: number;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, category: ErrorCategory) => void;
  maxRetries?: number;
  name?: string;
}

// Error categorization utility
function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('axios') ||
    message.includes('xhr') ||
    stack.includes('fetch')
  ) {
    return 'network';
  }

  // Render errors typically have component stack
  if (error.stack?.includes('at ') && error.stack?.includes('React')) {
    return 'render';
  }

  // Default to unknown
  return 'unknown';
}

// Generate unique error ID
function generateErrorId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Export error data as JSON
function exportErrorReport(state: ErrorBoundaryState, name?: string): void {
  const report = {
    errorId: state.errorId,
    boundaryName: name || 'Unnamed',
    timestamp: new Date().toISOString(),
    category: state.errorCategory,
    retryCount: state.retryCount,
    error: state.error ? {
      name: state.error.name,
      message: state.error.message,
      stack: state.error.stack,
    } : null,
    componentStack: state.errorInfo?.componentStack,
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-report-${state.errorId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Default error UI component
interface DefaultErrorFallbackProps {
  state: ErrorBoundaryState;
  onReset: () => void;
  onRetry: () => void;
  onExportReport: () => void;
  boundaryName?: string;
}

function DefaultErrorFallback({
  state,
  onReset,
  onRetry,
  onExportReport,
  boundaryName,
}: DefaultErrorFallbackProps) {
  const isDev = process.env.NODE_ENV === 'development';

  const getCategoryStyle = () => {
    switch (state.errorCategory) {
      case 'network':
        return { bg: 'var(--color-info-subtle)', color: 'var(--color-info)' };
      case 'render':
        return { bg: 'var(--color-feature-subtle)', color: 'var(--color-feature)' };
      default:
        return { bg: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' };
    }
  };

  const categoryStyle = getCategoryStyle();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--theme-modal-overlay)' }} role="dialog" aria-modal="true" aria-label="Application error">
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-300" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--color-error-border)' }}>
        {/* Header */}
        <div className="p-6" style={{ borderBottom: '1px solid var(--color-error-border)', background: 'linear-gradient(to right, var(--color-error-subtle), var(--color-warning-subtle))' }}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--color-error-subtle)' }}>
              <AlertTriangle className="w-6 h-6" style={{ color: 'var(--color-error)' }} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--theme-text-primary)' }}>
                Something went wrong
              </h1>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                {boundaryName ? `Error in ${boundaryName}` : 'An unexpected error occurred'}
              </p>
            </div>
            <div className="text-right">
              <span className="px-2 py-1 text-xs font-mono rounded-md" style={{ backgroundColor: categoryStyle.bg, color: categoryStyle.color }}>
                {state.errorCategory.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[40vh] overflow-y-auto">
          {state.error && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--color-error)' }}>
                <Bug className="w-4 h-4" />
                Error Message
              </h3>
              <p className="text-sm font-mono p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-secondary)' }}>
                {state.error.message}
              </p>
            </div>
          )}

          {isDev && state.error?.stack && (
            <details className="mb-4">
              <summary className="text-sm font-medium cursor-pointer transition-colors" style={{ color: 'var(--theme-text-muted)' }}>
                Stack Trace
              </summary>
              <pre className="mt-2 p-3 text-xs rounded-lg overflow-x-auto" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-muted)' }}>
                {state.error.stack}
              </pre>
            </details>
          )}

          {isDev && state.errorInfo?.componentStack && (
            <details className="mb-4">
              <summary className="text-sm font-medium cursor-pointer transition-colors" style={{ color: 'var(--theme-text-muted)' }}>
                Component Stack
              </summary>
              <pre className="mt-2 p-3 text-xs rounded-lg overflow-x-auto" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-muted)' }}>
                {state.errorInfo.componentStack}
              </pre>
            </details>
          )}

          {state.retryCount > 0 && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
              <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
                Retry attempt {state.retryCount} failed. If this persists, try resetting or export the error report.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 flex flex-wrap gap-3" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <button
            onClick={onReset}
            className="flex-1 min-w-[140px] px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-primary)' }}
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>

          {state.retryCount < 3 && (
            <button
              onClick={onRetry}
              className="flex-1 min-w-[140px] px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}

          <button
            onClick={onExportReport}
            className="px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Export error report as JSON"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;
  private maxRetries: number;

  static defaultProps = {
    maxRetries: 3,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCategory: 'unknown',
      errorId: generateErrorId(),
      retryCount: 0,
    };
    this.maxRetries = props.maxRetries || ErrorBoundary.defaultProps.maxRetries;
  }

  componentDidMount() {
    // Handle unhandled promise rejections
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();

      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason || 'Unhandled promise rejection'));

      const category = 'async';
      const errorId = generateErrorId();

      logger.error('Unhandled promise rejection', {
        error: error.message,
        stack: error.stack,
        reason: String(event.reason),
        errorId,
      });

      // Update state with error info
      this.setState({
        hasError: true,
        error,
        errorInfo: { componentStack: `Async error (Promise rejection)\nReason: ${String(event.reason)}` } as ErrorInfo,
        errorCategory: category,
        errorId,
      });

      // Call custom error handler if provided
      if (this.props.onError) {
        this.props.onError(error, this.state.errorInfo || {} as ErrorInfo, category);
      }
    };

    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentWillUnmount() {
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorCategory: categorizeError(error),
      errorId: generateErrorId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const category = categorizeError(error);

    // Log the error
    logger.error('React Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      category,
      errorId: this.state.errorId,
      boundaryName: this.props.name,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo, category);
    }

    this.setState({
      errorInfo,
    });
  }

  handleReset = () => {
    logger.info('Error boundary reset', {
      errorId: this.state.errorId,
      boundaryName: this.props.name,
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCategory: 'unknown',
      errorId: generateErrorId(),
      retryCount: 0,
    });
  };

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;

    logger.info('Error boundary retry', {
      errorId: this.state.errorId,
      retryCount: newRetryCount,
      maxRetries: this.maxRetries,
      boundaryName: this.props.name,
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: newRetryCount,
    });
  };

  handleExportReport = () => {
    exportErrorReport(this.state, this.props.name);
    logger.info('Error report exported', {
      errorId: this.state.errorId,
      boundaryName: this.props.name,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Use default error UI
      return (
        <DefaultErrorFallback
          state={this.state}
          onReset={this.handleReset}
          onRetry={this.handleRetry}
          onExportReport={this.handleExportReport}
          boundaryName={this.props.name}
        />
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  options?: {
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo, category: ErrorCategory) => void;
    maxRetries?: number;
    name?: string;
  }
) {
  return function WrappedComponent(props: T) {
    return (
      <ErrorBoundary
        fallback={options?.fallback}
        onError={options?.onError}
        maxRetries={options?.maxRetries}
        name={options?.name || Component.name}
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook for functional components to programmatically trigger error boundary
export function useErrorHandler() {
  return (error: Error) => {
    // This can be used with a wrapper component that has setError
    logger.error('Error handled via useErrorHandler', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  };
}

export default ErrorBoundary;
