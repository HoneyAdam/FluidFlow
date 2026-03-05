import React from 'react';
import { X, CheckCircle, AlertCircle, Loader2, FileCode, Zap } from 'lucide-react';

interface AutoFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage: string;
  logs: string[];
  stage: 'analyzing' | 'generating' | 'fixing' | 'completed' | 'failed' | null;
  originalCode?: string;
  fixedCode?: string;
}

export const AutoFixModal: React.FC<AutoFixModalProps> = ({
  isOpen,
  onClose,
  errorMessage,
  logs,
  stage,
  originalCode: _originalCode,
  fixedCode
}) => {
  if (!isOpen) return null;

  const getStageInfo = () => {
    switch (stage) {
      case 'analyzing':
        return { icon: <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-info)' }} />, text: 'Analyzing error...', color: 'var(--color-info)' };
      case 'generating':
        return { icon: <Zap className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />, text: 'Generating solution...', color: 'var(--color-feature)' };
      case 'fixing':
        return { icon: <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-warning)' }} />, text: 'Applying fix...', color: 'var(--color-warning)' };
      case 'completed':
        return { icon: <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-success)' }} />, text: 'Error fixed successfully!', color: 'var(--color-success)' };
      case 'failed':
        return { icon: <AlertCircle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />, text: 'Auto-fix failed', color: 'var(--color-error)' };
      default:
        return { icon: null, text: '', color: '' };
    }
  };

  const stageInfo = getStageInfo();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm p-4" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="Auto fix">
      <div className="w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>Auto-Fix in Progress</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>AI is analyzing and fixing the error</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            disabled={stage === 'analyzing' || stage === 'generating' || stage === 'fixing'}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Error & Logs */}
          <div className="w-1/2 flex flex-col" style={{ borderRight: '1px solid var(--theme-border-light)' }}>
            {/* Error Message */}
            <div className="p-4" style={{ backgroundColor: 'var(--theme-glass-100)', borderBottom: '1px solid var(--theme-border-light)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--theme-text-dim)' }}>
                Error Message
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
                  <p className="text-sm font-mono break-all" style={{ color: 'var(--color-error)' }}>{errorMessage}</p>
                </div>
              </div>
            </div>

            {/* Stage Indicator */}
            <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
              <div className="flex items-center gap-3">
                {stageInfo.icon}
                <span className="text-sm font-medium" style={{ color: stageInfo.color }}>{stageInfo.text}</span>
              </div>
            </div>

            {/* Error Fix Chat Log */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-dim)' }}>
                  🔧 Error Fix Chat
                </div>
                {stage === 'completed' && (
                  <button className="text-xs flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
                    <CheckCircle className="w-3 h-3" />
                    <span>Resolved</span>
                  </button>
                )}
              </div>

              <div className="space-y-3 font-mono text-sm max-h-[500px] overflow-y-auto pr-2">
                {logs.length === 0 ? (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
                    <p className="italic text-xs" style={{ color: 'var(--theme-text-dim)' }}>Waiting for error analysis...</p>
                  </div>
                ) : (
                  logs.map((log, index) => {
                    // Determine log type
                    const isSystem = log.startsWith('[SYSTEM]');
                    const isUser = log.startsWith('[USER]');
                    const isError = log.startsWith('[ERROR]');
                    const isSuccess = log.startsWith('[SUCCESS]');

                    let bgColor = 'var(--theme-glass-200)';
                    let borderColor = 'var(--color-info-border)';
                    let textColor = 'var(--theme-text-secondary)';
                    let icon = '🤖';

                    if (isSystem) {
                      bgColor = 'var(--color-feature-subtle)';
                      borderColor = 'var(--color-feature-border)';
                      textColor = 'var(--color-feature)';
                      icon = '⚙️';
                    } else if (isUser) {
                      bgColor = 'var(--color-info-subtle)';
                      borderColor = 'var(--color-info-border)';
                      textColor = 'var(--color-info)';
                      icon = '👤';
                    } else if (isError) {
                      bgColor = 'var(--color-error-subtle)';
                      borderColor = 'var(--color-error-border)';
                      textColor = 'var(--color-error)';
                      icon = '❌';
                    } else if (isSuccess) {
                      bgColor = 'var(--color-success-subtle)';
                      borderColor = 'var(--color-success-border)';
                      textColor = 'var(--color-success)';
                      icon = '✅';
                    }

                    return (
                      <div key={index} className="p-3 rounded-lg" style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}>
                        <div className="flex items-start gap-2">
                          <span className="text-lg shrink-0">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold" style={{ color: textColor }}>
                                {isSystem ? 'SYSTEM' : isUser ? 'USER' : isError ? 'ERROR' : isSuccess ? 'SUCCESS' : 'ASSISTANT'}
                              </span>
                              <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
                                {new Date().toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: textColor }}>
                              {log.replace(/^\[(SYSTEM|USER|ERROR|SUCCESS)\]\s*/, '')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Code Comparison */}
          <div className="w-1/2 flex flex-col">
            {fixedCode ? (
              <>
                {/* Fixed Code */}
                <div className="p-4" style={{ backgroundColor: 'var(--theme-glass-100)', borderBottom: '1px solid var(--theme-border-light)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>Fixed Code</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                    <FileCode size={12} />
                    <span>src/App.tsx</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <pre className="p-4 text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>
                    {fixedCode}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: 'var(--theme-text-dim)' }} />
                  <p style={{ color: 'var(--theme-text-dim)' }}>Waiting for AI to generate the fix...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            {stage === 'completed' && 'Fix applied successfully. You can now close this window.'}
            {stage === 'failed' && 'Auto-fix could not resolve the error. Try manual fixing.'}
            {stage && stage !== 'completed' && stage !== 'failed' && 'Please wait while AI analyzes the error...'}
          </div>
          {stage === 'completed' && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-primary)' }}
            >
              Apply Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
