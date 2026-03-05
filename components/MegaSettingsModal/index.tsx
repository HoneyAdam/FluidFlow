import React, { useState, useEffect, useRef } from 'react';
import { TOAST_DURATION_MS } from '../../constants/timing';
import { createPortal } from 'react-dom';
import { X, Settings2, Download, Upload, RotateCcw } from 'lucide-react';
import { ConfirmModal } from '../ContextIndicator/ConfirmModal';
import { SettingsSidebar } from './SettingsSidebar';
import { AIProvidersPanel } from './panels/AIProvidersPanel';
import { AIUsagePanel } from './panels/AIUsagePanel';
import { ContextManagerPanel } from './panels/ContextManagerPanel';
import { TechStackPanel } from './panels/TechStackPanel';
import { ProjectsPanel } from './panels/ProjectsPanel';
import { PromptTemplatesPanel } from './panels/PromptTemplatesPanel';
import { EditorPanel } from './panels/EditorPanel';
import { AppearancePanel } from './panels/AppearancePanel';
import { GitHubPanel } from './panels/GitHubPanel';
import { DebugPanel } from './panels/DebugPanel';
import { AdvancedPanel } from './panels/AdvancedPanel';
import { AboutPanel } from './panels/AboutPanel';
import { useTheme } from '../../contexts/ThemeContext';
import {
  MegaSettingsModalProps,
  SettingsCategory,
  STORAGE_KEYS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_DEBUG_SETTINGS
} from './types';

export const MegaSettingsModal: React.FC<MegaSettingsModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'ai-providers',
  onProviderChange
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [importExportMessage, setImportExportMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // FIX-16: Cleanup timeouts on unmount
  useEffect(() => () => {
    clearTimeout(toastTimeoutRef.current);
    clearTimeout(resetTimeoutRef.current);
  }, []);

  // Theme context for reset functionality
  const { resetTheme } = useTheme();

  // Update active category when initialCategory changes
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Handle escape key - only add listener when modal is open to prevent accumulation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Export all settings
  const handleExportSettings = () => {
    try {
      const settings: Record<string, unknown> = {};

      // Gather all settings from localStorage
      Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
        const value = localStorage.getItem(storageKey);
        if (value) {
          try {
            settings[key] = JSON.parse(value);
          } catch {
            settings[key] = value;
          }
        }
      });

      // Also get tech stack and other existing keys
      const techStack = localStorage.getItem('fluidflow-tech-stack');
      if (techStack) settings.techStack = JSON.parse(techStack);

      const config = localStorage.getItem('fluidflow_config');
      if (config) settings.fluidflowConfig = JSON.parse(config);

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluidflow-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setImportExportMessage({ type: 'success', message: 'Settings exported successfully!' });
      toastTimeoutRef.current = setTimeout(() => setImportExportMessage(null), TOAST_DURATION_MS);
    } catch (_error) {
      setImportExportMessage({ type: 'error', message: 'Failed to export settings' });
      toastTimeoutRef.current = setTimeout(() => setImportExportMessage(null), TOAST_DURATION_MS);
    }
  };

  // Import settings from file
  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const settings = JSON.parse(text);

        // Restore settings to localStorage
        Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
          if (settings[key]) {
            localStorage.setItem(storageKey, JSON.stringify(settings[key]));
          }
        });

        if (settings.techStack) {
          localStorage.setItem('fluidflow-tech-stack', JSON.stringify(settings.techStack));
        }

        if (settings.fluidflowConfig) {
          localStorage.setItem('fluidflow_config', JSON.stringify(settings.fluidflowConfig));
        }

        setImportExportMessage({ type: 'success', message: 'Settings imported! Refresh to apply.' });
        toastTimeoutRef.current = setTimeout(() => setImportExportMessage(null), TOAST_DURATION_MS);
      } catch (_error) {
        setImportExportMessage({ type: 'error', message: 'Failed to import settings' });
        toastTimeoutRef.current = setTimeout(() => setImportExportMessage(null), TOAST_DURATION_MS);
      }
    };
    input.click();
  };

  // Reset current section to defaults
  const handleResetSection = () => {
    // Only editor, debug, and appearance have resettable settings
    if (activeCategory !== 'editor' && activeCategory !== 'debug' && activeCategory !== 'appearance') {
      return;
    }

    setShowResetConfirm(true);
  };

  const performReset = () => {
    switch (activeCategory) {
      case 'editor':
        localStorage.setItem(STORAGE_KEYS.EDITOR_SETTINGS, JSON.stringify(DEFAULT_EDITOR_SETTINGS));
        window.dispatchEvent(new CustomEvent('editorSettingsChanged'));
        break;
      case 'debug':
        localStorage.setItem(STORAGE_KEYS.DEBUG_SETTINGS, JSON.stringify(DEFAULT_DEBUG_SETTINGS));
        break;
      case 'appearance':
        resetTheme();
        break;
      default:
        return;
    }

    setImportExportMessage({ type: 'success', message: 'Settings reset to defaults!' });
    toastTimeoutRef.current = setTimeout(() => setImportExportMessage(null), TOAST_DURATION_MS);
    // Force re-render by toggling category
    setActiveCategory('ai-providers');
    resetTimeoutRef.current = setTimeout(() => setActiveCategory(activeCategory), 0);
    setShowResetConfirm(false);
  };

  // Check if current panel has resettable settings
  const canResetSection = activeCategory === 'editor' || activeCategory === 'debug' || activeCategory === 'appearance';

  const renderPanel = () => {
    switch (activeCategory) {
      case 'ai-providers':
        return <AIProvidersPanel onProviderChange={onProviderChange} />;
      case 'ai-usage':
        return <AIUsagePanel />;
      case 'context-manager':
        return <ContextManagerPanel />;
      case 'tech-stack':
        return <TechStackPanel />;
      case 'projects':
        return <ProjectsPanel />;
      case 'prompt-templates':
        return <PromptTemplatesPanel />;
      case 'editor':
        return <EditorPanel />;
      case 'appearance':
        return <AppearancePanel />;
      case 'github':
        return <GitHubPanel />;
      case 'debug':
        return <DebugPanel />;
      case 'advanced':
        return <AdvancedPanel />;
      case 'about':
        return <AboutPanel />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-100 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ backgroundColor: 'color-mix(in srgb, var(--theme-background) 80%, transparent)' }}
    >
      <div
        className="w-[90vw] max-w-6xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300 transition-colors"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)'
        }}
      >
        {/* Header */}
        <div
          className="p-4 flex items-center justify-between transition-colors"
          style={{
            borderBottom: '1px solid var(--theme-border)',
            background: `linear-gradient(to right, var(--theme-gradient-from), var(--theme-gradient-to))`
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)' }}>
              <Settings2 className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Settings</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>Configure FluidFlow preferences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {importExportMessage && (
              <span
                className="text-xs px-3 py-1 rounded-lg"
                style={{
                  backgroundColor: importExportMessage.type === 'success' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                  color: importExportMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'
                }}
              >
                {importExportMessage.message}
              </span>
            )}
            <button
              onClick={handleExportSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
              title="Export Settings"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleImportSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
              title="Import Settings"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <SettingsSidebar
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />

          {/* Panel Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {renderPanel()}
            </div>

            {/* Footer */}
            <div
              className="p-3 flex items-center justify-between transition-colors"
              style={{
                borderTop: '1px solid var(--theme-border)',
                backgroundColor: 'color-mix(in srgb, var(--theme-background) 50%, transparent)'
              }}
            >
              {canResetSection ? (
                <button
                  onClick={handleResetSection}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Section
                </button>
              ) : (
                <div />
              )}
              <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                Press <kbd
                  className="px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                >Esc</kbd> to close
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={performReset}
        title={`Reset ${activeCategory} settings`}
        message="This will reset all settings in this section to their default values. This action cannot be undone."
        confirmText="Reset"
        confirmVariant="danger"
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MegaSettingsModal;
