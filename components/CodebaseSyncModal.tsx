/**
 * Codebase Sync Modal
 *
 * Analyzes project files and generates AI context summaries.
 * Instead of sending all files to AI (which doesn't persist),
 * we generate condensed summaries included in every prompt.
 *
 * Generates:
 * 1. Style Guide - Design patterns, colors, typography
 * 2. Project Summary - Purpose, architecture, key files
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  FileCode,
  Loader2,
  CheckCircle2,
  XCircle,
  Palette,
  FolderTree,
  Zap
} from 'lucide-react';
import type { FileSystem } from '@/types';
import { estimateTokenCount } from '../services/ai/capabilities';
import {
  generateProjectContext,
  ProjectContext,
  getProjectContext
} from '../services/projectContext';

interface CodebaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
  projectId?: string;
  onSyncComplete?: (context: ProjectContext) => void;
}

type SyncPhase = 'ready' | 'generating' | 'complete' | 'error';

export const CodebaseSyncModal: React.FC<CodebaseSyncModalProps> = ({
  isOpen,
  onClose,
  files,
  projectId,
  onSyncComplete
}) => {
  const [phase, setPhase] = useState<SyncPhase>('ready');
  const [progress, setProgress] = useState<string>('');
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [error, setError] = useState<string>('');

  // Check for existing context
  const existingContext = useMemo(() => {
    if (!projectId) return null;
    return getProjectContext(projectId);
  }, [projectId]);

  // Calculate file stats
  const stats = useMemo(() => {
    const entries = Object.entries(files);
    const totalLines = entries.reduce((sum, [_, content]) => sum + content.split('\n').length, 0);
    const totalTokens = entries.reduce((sum, [_, content]) => sum + estimateTokenCount(content), 0);
    return {
      fileCount: entries.length,
      lineCount: totalLines,
      tokenCount: totalTokens
    };
  }, [files]);

  // Handle generate
  const handleGenerate = async () => {
    if (!projectId) {
      setError('No project selected');
      setPhase('error');
      return;
    }

    setPhase('generating');
    setError('');

    try {
      const result = await generateProjectContext(projectId, files, setProgress);
      setContext(result);
      setPhase('complete');
      onSyncComplete?.(result);
    } catch (err) {
      console.error('[CodebaseSync] Generation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  };

  // Reset modal
  const handleReset = () => {
    setPhase('ready');
    setContext(null);
    setError('');
    setProgress('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Codebase sync">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'var(--theme-modal-overlay)' }} onClick={onClose} />

      <div
        className="relative rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: '1px solid var(--theme-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--theme-accent-subtle)' }}>
              <Sparkles className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Generate AI Context</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                {phase === 'ready' && 'Create project summaries for consistent AI responses'}
                {phase === 'generating' && progress}
                {phase === 'complete' && 'Context generated successfully!'}
                {phase === 'error' && 'Generation failed'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--theme-text-muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Ready State */}
          {phase === 'ready' && (
            <>
              {/* Project Stats */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <FileCode className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
                  <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>Project Overview</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.fileCount}</div>
                    <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Files</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.lineCount.toLocaleString()}</div>
                    <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Lines</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>~{Math.round(stats.tokenCount / 1000)}K</div>
                    <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Tokens</div>
                  </div>
                </div>
              </div>

              {/* What will be generated */}
              <div className="space-y-3">
                <div className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>What will be generated:</div>

                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-ai-accent-subtle)', border: '1px solid var(--theme-ai-accent)' }}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--theme-ai-accent)' }}>
                    <Palette className="w-4 h-4" />
                    <span className="font-medium">Style Guide</span>
                  </div>
                  <div className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                    Colors, typography, visual patterns, code conventions, component list
                  </div>
                </div>

                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent)' }}>
                  <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--theme-accent)' }}>
                    <FolderTree className="w-4 h-4" />
                    <span className="font-medium">Project Summary</span>
                  </div>
                  <div className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                    Purpose, architecture, key files, features, tech stack
                  </div>
                </div>
              </div>

              {/* Existing context warning */}
              {existingContext && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning-border)' }}>
                  <div className="text-sm" style={{ color: 'var(--color-warning-text)' }}>
                    ⚠️ This project already has a context (generated {new Date(existingContext.generatedAt).toLocaleDateString()}).
                    Generating again will replace it.
                  </div>
                </div>
              )}

              {/* Benefits */}
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-success)' }}>
                  <Zap className="w-4 h-4" />
                  <span className="font-medium">Benefits</span>
                </div>
                <ul className="text-sm space-y-1" style={{ color: 'var(--theme-text-secondary)' }}>
                  <li>• AI maintains consistent style across all responses</li>
                  <li>• Works even after page refresh (persisted locally)</li>
                  <li>• Only ~1K tokens added to each prompt (not 50K+)</li>
                  <li>• No need to re-sync - context is automatically included</li>
                </ul>
              </div>
            </>
          )}

          {/* Generating State */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: 'var(--theme-accent)' }} />
              <div className="font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>Analyzing codebase...</div>
              <div className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{progress}</div>
              <div className="text-xs mt-4" style={{ color: 'var(--theme-text-muted)' }}>This may take 10-30 seconds</div>
            </div>
          )}

          {/* Complete State */}
          {phase === 'complete' && context && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success-border)' }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-success)' }}>
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Context Generated Successfully!</span>
                </div>
                <div className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
                  Your project context will be included in all future AI prompts.
                </div>
              </div>

              {/* Style Guide Display */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-ai-accent-subtle)', border: '1px solid var(--theme-ai-accent)' }}>
                <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--theme-ai-accent)' }}>
                  <Palette className="w-5 h-5" />
                  <span className="font-medium">Style Guide</span>
                </div>

                <div className="text-sm mb-3" style={{ color: 'var(--theme-text-primary)' }}>
                  {context.styleGuide.summary}
                </div>

                {/* Colors */}
                {Object.keys(context.styleGuide.colors).length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Colors</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(context.styleGuide.colors)
                        .filter(([_, v]) => v)
                        .map(([name, value]) => (
                          <div
                            key={name}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                            style={{ backgroundColor: 'var(--theme-glass-200)' }}
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{
                                backgroundColor: value?.startsWith('#') ? value : undefined,
                                border: '1px solid var(--theme-border)'
                              }}
                            />
                            <span style={{ color: 'var(--theme-text-secondary)' }}>{name}:</span>
                            <span style={{ color: 'var(--theme-text-primary)' }}>{value}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Typography, Borders, Effects Grid */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {/* Typography */}
                  {context.styleGuide.typography?.fontFamily && (
                    <div className="p-2 rounded" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                      <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Typography</div>
                      <div className="text-xs space-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                        {context.styleGuide.typography?.fontFamily && (
                          <div>Font: {context.styleGuide.typography.fontFamily}</div>
                        )}
                        {context.styleGuide.typography?.headingStyle && (
                          <div className="truncate" title={context.styleGuide.typography.headingStyle}>
                            H: {context.styleGuide.typography.headingStyle}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Borders */}
                  {context.styleGuide.borders?.radius && (
                    <div className="p-2 rounded" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                      <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Borders</div>
                      <div className="text-xs space-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                        {context.styleGuide.borders?.radius && (
                          <div>Radius: {context.styleGuide.borders.radius}</div>
                        )}
                        {context.styleGuide.borders?.style && (
                          <div className="truncate" title={context.styleGuide.borders.style}>
                            Style: {context.styleGuide.borders.style}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Effects */}
                  {(context.styleGuide.effects?.shadow || context.styleGuide.effects?.blur) && (
                    <div className="p-2 rounded" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                      <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Effects</div>
                      <div className="text-xs space-y-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
                        {context.styleGuide.effects?.shadow && (
                          <div className="truncate" title={context.styleGuide.effects.shadow}>
                            Shadow: {context.styleGuide.effects.shadow}
                          </div>
                        )}
                        {context.styleGuide.effects?.blur && (
                          <div className="truncate" title={context.styleGuide.effects.blur}>
                            Blur: {context.styleGuide.effects.blur}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Spacing */}
                {(context.styleGuide.spacing?.containerPadding || context.styleGuide.spacing?.elementGap) && (
                  <div className="mb-3">
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Spacing</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {context.styleGuide.spacing?.containerPadding && (
                        <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                          Padding: {context.styleGuide.spacing.containerPadding}
                        </span>
                      )}
                      {context.styleGuide.spacing?.elementGap && (
                        <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                          Gap: {context.styleGuide.spacing.elementGap}
                        </span>
                      )}
                      {context.styleGuide.spacing?.sectionSpacing && (
                        <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                          Sections: {context.styleGuide.spacing.sectionSpacing}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Patterns */}
                {context.styleGuide.patterns?.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Design Patterns</div>
                    <div className="flex flex-wrap gap-1.5">
                      {context.styleGuide.patterns.map((pattern, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--theme-ai-accent-subtle)', color: 'var(--theme-ai-accent)' }}
                        >
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Components */}
                {context.styleGuide.components?.length > 0 && (
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Components</div>
                    <div className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                      {context.styleGuide.components.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              {/* Project Summary Display */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent)' }}>
                <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--theme-accent)' }}>
                  <FolderTree className="w-5 h-5" />
                  <span className="font-medium">Project Summary</span>
                </div>

                <div className="text-sm mb-3" style={{ color: 'var(--theme-text-primary)' }}>
                  {context.projectSummary.summary}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Purpose</div>
                    <div style={{ color: 'var(--theme-text-secondary)' }}>{context.projectSummary.purpose}</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Architecture</div>
                    <div style={{ color: 'var(--theme-text-secondary)' }}>{context.projectSummary.architecture}</div>
                  </div>
                </div>

                {/* Key Files */}
                {Object.keys(context.projectSummary.keyFiles).length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Key Files</div>
                    <div className="space-y-1">
                      {Object.entries(context.projectSummary.keyFiles).map(([path, desc]) => (
                        <div key={path} className="text-xs">
                          <span style={{ color: 'var(--theme-accent)' }}>{path}</span>
                          <span style={{ color: 'var(--theme-text-muted)' }}> - {desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tech Stack */}
                {context.projectSummary.techStack.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Tech Stack</div>
                    <div className="flex flex-wrap gap-1.5">
                      {context.projectSummary.techStack.map((tech, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Token info */}
              <div className="text-center text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                Combined context: ~{Math.ceil(context.combinedPrompt.length / 4)} tokens
                (included in every AI prompt)
              </div>
            </div>
          )}

          {/* Error State */}
          {phase === 'error' && (
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-error)' }}>
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Generation Failed</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-4 flex items-center justify-end gap-3"
          style={{ borderTop: '1px solid var(--theme-border)' }}
        >
          {phase === 'ready' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!projectId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--theme-ai-accent)',
                  color: 'var(--theme-text-on-accent)'
                }}
              >
                <Sparkles className="w-4 h-4" />
                Generate Context
              </button>
            </>
          )}

          {phase === 'generating' && (
            <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              Please wait...
            </div>
          )}

          {(phase === 'complete' || phase === 'error') && (
            <>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Generate Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                style={{
                  backgroundColor: 'var(--theme-ai-accent)',
                  color: 'var(--theme-text-on-accent)'
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodebaseSyncModal;
