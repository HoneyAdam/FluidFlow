/**
 * PromptConfirmationModal
 *
 * Modal shown before sending prompts to LLM.
 * Displays prompt details, model info, and context usage.
 */

import React, { useMemo } from 'react';
import {
  Bot,
  X,
  Send,
  Ban,
  ChevronDown,
  ChevronRight,
  Cpu,
  MessageSquare,
  FileText,
  Sparkles,
  AlertCircle,
  Paperclip,
  Zap,
  FolderCode,
  FilePlus,
  FileEdit,
  FileX,
  Files,
  Layers,
} from 'lucide-react';
import { usePromptConfirmation } from '../contexts/PromptConfirmationContext';

export const PromptConfirmationModal: React.FC = () => {
  const { pendingRequest, handleConfirm, handleCancel } = usePromptConfirmation();
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    new Set(['prompt'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Estimate tokens (rough: 4 chars = 1 token)
  const tokenEstimates = useMemo(() => {
    if (!pendingRequest) return { prompt: 0, system: 0, total: 0 };
    const promptTokens = Math.ceil((pendingRequest.details.prompt?.length || 0) / 4);
    const systemTokens = Math.ceil((pendingRequest.details.systemInstruction?.length || 0) / 4);
    return {
      prompt: promptTokens,
      system: systemTokens,
      total: promptTokens + systemTokens,
    };
  }, [pendingRequest]);

  if (!pendingRequest) return null;

  const { details } = pendingRequest;

  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm prompt" className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm p-4" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-background)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, var(--theme-accent), var(--theme-ai-accent))' }}>
              <Zap className="w-5 h-5" style={{ color: 'var(--theme-text-on-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--theme-text-primary)' }}>Confirm AI Request</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Review before sending to LLM</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Bar */}
        <div className="flex items-center gap-4 px-6 py-3 text-sm" style={{ backgroundColor: 'var(--theme-glass-100)', borderBottom: '1px solid var(--theme-border-light)' }}>
          {/* Provider & Model */}
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
            <span style={{ color: 'var(--theme-text-secondary)' }}>{details.provider || 'Unknown'}</span>
            <span style={{ color: 'var(--theme-text-dim)' }}>/</span>
            <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{details.model}</span>
          </div>

          {/* Separator */}
          <div className="w-px h-4" style={{ backgroundColor: 'var(--theme-border)' }} />

          {/* Category */}
          {details.category && (
            <>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                <span className="capitalize" style={{ color: 'var(--theme-text-secondary)' }}>{details.category}</span>
              </div>
              <div className="w-px h-4" style={{ backgroundColor: 'var(--theme-border)' }} />
            </>
          )}

          {/* Token Estimate */}
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
            <span style={{ color: 'var(--theme-text-secondary)' }}>~{tokenEstimates.total.toLocaleString()} tokens</span>
          </div>

          {/* Attachments */}
          {details.attachments && details.attachments.length > 0 && (
            <>
              <div className="w-px h-4" style={{ backgroundColor: 'var(--theme-border)' }} />
              <div className="flex items-center gap-1.5">
                <Paperclip className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                <span style={{ color: 'var(--theme-text-secondary)' }}>{details.attachments.length} attachment(s)</span>
              </div>
            </>
          )}

          {/* File Context Summary */}
          {details.fileContext && (
            <>
              <div className="w-px h-4" style={{ backgroundColor: 'var(--theme-border)' }} />
              <div className="flex items-center gap-1.5">
                <FolderCode className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                <span style={{ color: 'var(--theme-text-secondary)' }}>
                  {details.fileContext.filesInPrompt}/{details.fileContext.totalFiles} files
                </span>
                {details.fileContext.tokensSaved > 0 && (
                  <span className="text-xs" style={{ color: 'var(--theme-ai-accent)' }}>
                    (-{details.fileContext.tokensSaved.toLocaleString()} tok)
                  </span>
                )}
              </div>
            </>
          )}

          {/* Batch Indicator */}
          {details.batchId && (
            <>
              <div className="w-px h-4" style={{ backgroundColor: 'var(--theme-border)' }} />
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-feature-stable-subtle)' }}>
                <Layers className="w-3.5 h-3.5" style={{ color: 'var(--color-feature-stable)' }} />
                <span className="text-xs" style={{ color: 'var(--color-feature-stable)' }}>Batch Operation</span>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* System Instruction Section */}
          {details.systemInstruction && (
            <div style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
              <button
                onClick={() => toggleSection('system')}
                className="w-full flex items-center gap-2 px-6 py-3 transition-colors"
                style={{ backgroundColor: 'transparent' }}
              >
                {expandedSections.has('system') ? (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                ) : (
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                )}
                <Bot className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>System Instruction</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>
                  ~{tokenEstimates.system.toLocaleString()} tokens
                </span>
              </button>
              {expandedSections.has('system') && (
                <div className="px-6 pb-4">
                  <pre className="text-xs font-mono p-4 rounded-lg overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)', color: 'var(--theme-text-secondary)' }}>
                    {details.systemInstruction}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Prompt Section */}
          <div style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <button
              onClick={() => toggleSection('prompt')}
              className="w-full flex items-center gap-2 px-6 py-3 transition-colors"
              style={{ backgroundColor: 'transparent' }}
            >
              {expandedSections.has('prompt') ? (
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
              ) : (
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
              )}
              <FileText className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>Prompt</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>
                ~{tokenEstimates.prompt.toLocaleString()} tokens • {details.prompt.length.toLocaleString()} chars
              </span>
            </button>
            {expandedSections.has('prompt') && (
              <div className="px-6 pb-4">
                <pre className="text-xs font-mono p-4 rounded-lg overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap" style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent-muted)', color: 'var(--theme-text-secondary)' }}>
                  {details.prompt}
                </pre>
              </div>
            )}
          </div>

          {/* Attachments Section */}
          {details.attachments && details.attachments.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
              <button
                onClick={() => toggleSection('attachments')}
                className="w-full flex items-center gap-2 px-6 py-3 transition-colors"
                style={{ backgroundColor: 'transparent' }}
              >
                {expandedSections.has('attachments') ? (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                ) : (
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                )}
                <Paperclip className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>Attachments</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>
                  {details.attachments.length} file(s)
                </span>
              </button>
              {expandedSections.has('attachments') && (
                <div className="px-6 pb-4">
                  <div className="space-y-2">
                    {details.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}
                      >
                        <Paperclip className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                        <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{att.type}</span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>
                          {(att.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File Context Section */}
          {details.fileContext && (
            <div style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
              <button
                onClick={() => toggleSection('fileContext')}
                className="w-full flex items-center gap-2 px-6 py-3 transition-colors"
                style={{ backgroundColor: 'transparent' }}
              >
                {expandedSections.has('fileContext') ? (
                  <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                ) : (
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
                )}
                <FolderCode className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>File Context</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>
                  {details.fileContext.isFirstTurn ? 'First turn' : 'Delta mode'} • {details.fileContext.filesInPrompt} file(s) in prompt
                </span>
              </button>
              {expandedSections.has('fileContext') && (
                <div className="px-6 pb-4">
                  <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-ai-subtle)', border: '1px solid var(--theme-ai-muted)' }}>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {/* Total Files */}
                      <div className="flex items-center gap-2">
                        <Files className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                        <span style={{ color: 'var(--theme-text-muted)' }}>Total project files:</span>
                        <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{details.fileContext.totalFiles}</span>
                      </div>

                      {/* Files in Prompt */}
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                        <span style={{ color: 'var(--theme-text-muted)' }}>Files in this prompt:</span>
                        <span className="font-medium" style={{ color: 'var(--theme-accent)' }}>{details.fileContext.filesInPrompt}</span>
                      </div>

                      {/* Files in Context */}
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                        <span style={{ color: 'var(--theme-text-muted)' }}>AI already knows:</span>
                        <span className="font-medium" style={{ color: 'var(--theme-ai-accent)' }}>{details.fileContext.filesInContext}</span>
                      </div>

                      {/* Tokens Saved */}
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                        <span style={{ color: 'var(--theme-text-muted)' }}>Tokens saved:</span>
                        <span className="font-medium" style={{ color: 'var(--color-success)' }}>
                          {details.fileContext.tokensSaved > 0 ? `-${details.fileContext.tokensSaved.toLocaleString()}` : '0'}
                        </span>
                      </div>
                    </div>

                    {/* Delta Details */}
                    {!details.fileContext.isFirstTurn && (
                      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--theme-ai-muted)' }}>
                        <div className="text-xs mb-2" style={{ color: 'var(--theme-text-muted)' }}>Changes in this prompt:</div>
                        <div className="flex flex-wrap gap-2">
                          {details.fileContext.newFiles > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                              <FilePlus className="w-3 h-3" />
                              {details.fileContext.newFiles} new
                            </div>
                          )}
                          {details.fileContext.modifiedFiles > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                              <FileEdit className="w-3 h-3" />
                              {details.fileContext.modifiedFiles} modified
                            </div>
                          )}
                          {details.fileContext.deletedFiles > 0 && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
                              <FileX className="w-3 h-3" />
                              {details.fileContext.deletedFiles} deleted
                            </div>
                          )}
                          {details.fileContext.newFiles === 0 && details.fileContext.modifiedFiles === 0 && details.fileContext.deletedFiles === 0 && (
                            <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>No file changes detected</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* First Turn Info */}
                    {details.fileContext.isFirstTurn && (
                      <div className="mt-3 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                        <span style={{ color: 'var(--theme-ai-accent)' }}>First turn:</span> All files will be summarized for the AI context.
                      </div>
                    )}

                    {/* Delta Mode Status */}
                    {!details.fileContext.deltaEnabled && (
                      <div className="mt-3 text-xs" style={{ color: 'var(--color-warning)' }}>
                        Delta mode is disabled. Enable it in Settings to save tokens.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="px-6 py-3 flex items-center gap-2" style={{ backgroundColor: 'var(--color-warning-subtle)', borderTop: '1px solid var(--color-warning-border)' }}>
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-warning)' }} />
          <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
            {details.batchId ? (
              <>
                <span className="font-medium" style={{ color: 'var(--color-feature-stable)' }}>Batch operation:</span> Confirming will approve all subsequent prompts in this batch automatically.
              </>
            ) : (
              'This prompt will be sent to the AI provider. Review the content before proceeding.'
            )}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-background)' }}>
          <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            You can disable this confirmation in Settings → Advanced
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--theme-button-secondary)', color: 'var(--theme-text-primary)' }}
            >
              <Ban className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-lg"
              style={{ background: 'linear-gradient(to right, var(--theme-accent), var(--theme-ai-accent))', color: 'var(--theme-text-on-accent)' }}
            >
              <Send className="w-4 h-4" />
              Send to AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptConfirmationModal;
