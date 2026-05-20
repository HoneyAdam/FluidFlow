/**
 * Lazy Modal Loading
 *
 * Provides lazy-loaded versions of heavy modals to reduce initial bundle size.
 * Modals are loaded on-demand when first opened.
 *
 * Bundle size savings: ~80KB from initial load
 */

/* eslint-disable react-refresh/only-export-components -- centralized lazy modal registry: trades HMR for single source of truth */
import React, { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy imports for heavy modals
const AISettingsModalLazy = lazy(() => import('./AISettingsModal').then(m => ({ default: m.AISettingsModal })));
const MegaSettingsModalLazy = lazy(() => import('./MegaSettingsModal').then(m => ({ default: m.MegaSettingsModal })));
const AIHistoryModalLazy = lazy(() => import('./AIHistoryModal').then(m => ({ default: m.AIHistoryModal })));
const CodeMapModalLazy = lazy(() => import('./ControlPanel/CodeMapModal').then(m => ({ default: m.CodeMapModal })));
const TailwindPaletteLazy = lazy(() => import('./TailwindPalette').then(m => ({ default: m.TailwindPalette })));
const ComponentTreeLazy = lazy(() => import('./ComponentTree').then(m => ({ default: m.ComponentTree })));
const CreditsModalLazy = lazy(() => import('./CreditsModal').then(m => ({ default: m.CreditsModal })));
const CodebaseSyncModalLazy = lazy(() => import('./CodebaseSyncModal').then(m => ({ default: m.CodebaseSyncModal })));

// Lazy imports for large components (bundle size optimization)
const GitHubModalLazy = lazy(() => import('./GitHubModal').then(m => ({ default: m.GitHubModal })));
const BatchGenerationModalLazy = lazy(() => import('./ControlPanel/BatchGenerationModal').then(m => ({ default: m.BatchGenerationModal })));
const TechStackModalLazy = lazy(() => import('./ControlPanel/TechStackModal').then(m => ({ default: m.TechStackModal })));
const PromptEngineerModalLazy = lazy(() => import('./ControlPanel/PromptEngineerModal').then(m => ({ default: m.PromptEngineerModal })));
const DeployModalLazy = lazy(() => import('./DeployModal').then(m => ({ default: m.DeployModal })));
const ShareModalLazy = lazy(() => import('./ShareModal').then(m => ({ default: m.ShareModal })));
const HistoryPanelLazy = lazy(() => import('./HistoryPanel').then(m => ({ default: m.HistoryPanel })));
const ProjectHealthModalLazy = lazy(() => import('./ProjectHealthModal').then(m => ({ default: m.ProjectHealthModal })));
const AutoFixModalLazy = lazy(() => import('./AutoFixModal').then(m => ({ default: m.AutoFixModal })));
const SnippetsPanelLazy = lazy(() => import('./SnippetsPanel').then(m => ({ default: m.SnippetsPanel })));
const ProjectManagerLazy = lazy(() => import('./ProjectManager').then(m => ({ default: m.ProjectManager })));
const PromptHistoryModalLazy = lazy(() => import('./PromptHistoryModal').then(m => ({ default: m.PromptHistoryModal })));

/**
 * Modal loading spinner
 */
function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: 'var(--theme-modal-overlay)' }}>
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-info)' }} />
        <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Loading...</span>
      </div>
    </div>
  );
}

/**
 * HOC to wrap a lazy component with Suspense and conditional rendering
 */
function withLazyModal<P extends { isOpen: boolean }>(
  LazyComponent: ComponentType<P>,
  displayName: string
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => {
    // do not render anything if not open - prevents unnecessary loading
    if (!props.isOpen) return null;

    return (
      <Suspense fallback={<ModalLoadingFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  WrappedComponent.displayName = `Lazy${displayName}`;
  return WrappedComponent;
}

// Export lazy versions
export const LazyAISettingsModal = withLazyModal(AISettingsModalLazy, 'AISettingsModal');
export const LazyMegaSettingsModal = withLazyModal(MegaSettingsModalLazy, 'MegaSettingsModal');
export const LazyAIHistoryModal = withLazyModal(AIHistoryModalLazy, 'AIHistoryModal');
export const LazyCodeMapModal = withLazyModal(CodeMapModalLazy, 'CodeMapModal');
export const LazyTailwindPalette = withLazyModal(TailwindPaletteLazy, 'TailwindPalette');
export const LazyComponentTree = withLazyModal(ComponentTreeLazy, 'ComponentTree');
export const LazyCreditsModal = withLazyModal(CreditsModalLazy, 'CreditsModal');
export const LazyCodebaseSyncModal = withLazyModal(CodebaseSyncModalLazy, 'CodebaseSyncModal');

// Large components lazy exports
export const LazyGitHubModal = withLazyModal(GitHubModalLazy, 'GitHubModal');
export const LazyBatchGenerationModal = withLazyModal(BatchGenerationModalLazy, 'BatchGenerationModal');
export const LazyTechStackModal = withLazyModal(TechStackModalLazy, 'TechStackModal');
export const LazyPromptEngineerModal = withLazyModal(PromptEngineerModalLazy, 'PromptEngineerModal');
export const LazyDeployModal = withLazyModal(DeployModalLazy, 'DeployModal');
export const LazyShareModal = withLazyModal(ShareModalLazy, 'ShareModal');
export const LazyHistoryPanel = withLazyModal(HistoryPanelLazy, 'HistoryPanel');
export const LazyProjectHealthModal = withLazyModal(ProjectHealthModalLazy, 'ProjectHealthModal');
export const LazyAutoFixModal = withLazyModal(AutoFixModalLazy, 'AutoFixModal');
export const LazySnippetsPanel = withLazyModal(SnippetsPanelLazy, 'SnippetsPanel');
export const LazyProjectManager = withLazyModal(ProjectManagerLazy, 'ProjectManager');
export const LazyPromptHistoryModal = withLazyModal(PromptHistoryModalLazy, 'PromptHistoryModal');
