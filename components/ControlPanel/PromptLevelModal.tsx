/**
 * PromptLevelModal - Modal for selecting prompt complexity level
 * Shows Simple/Detailed/Advanced options with preview
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, FileText, BookOpen, Check, Settings2 } from 'lucide-react';
import { PromptItem, PromptLevel } from '../../data/promptLibrary';

interface PromptLevelModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: PromptItem | null;
  onSelect: (promptText: string, level: PromptLevel) => void;
  defaultLevel: PromptLevel;
  onSetDefaultLevel: (level: PromptLevel) => void;
}

const LEVEL_CONFIG: Record<PromptLevel, {
  label: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
}> = {
  simple: {
    label: 'Simple',
    icon: Sparkles,
    description: 'Brief, 1-2 sentence prompt',
    color: 'emerald',
  },
  detailed: {
    label: 'Detailed',
    icon: FileText,
    description: 'Comprehensive with Tailwind classes',
    color: 'blue',
  },
  advanced: {
    label: 'Advanced',
    icon: BookOpen,
    description: 'Expert-level with edge cases & a11y',
    color: 'purple',
  },
};

export const PromptLevelModal: React.FC<PromptLevelModalProps> = ({
  isOpen,
  onClose,
  prompt,
  onSelect,
  defaultLevel,
  onSetDefaultLevel,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<PromptLevel>(defaultLevel);
  const [showSetDefault, setShowSetDefault] = useState(false);

  // Reset to default when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedLevel(defaultLevel);
      setShowSetDefault(false);
    }
  }, [isOpen, defaultLevel]);

  if (!isOpen || !prompt) return null;

  const handleSelect = () => {
    const text = prompt[selectedLevel];
    onSelect(text, selectedLevel);
    onClose();
  };

  const handleSetDefault = () => {
    onSetDefaultLevel(selectedLevel);
    setShowSetDefault(true);
    setTimeout(() => setShowSetDefault(false), 2000);
  };

  const config = LEVEL_CONFIG[selectedLevel];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150"
      style={{ backgroundColor: 'var(--theme-overlay)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt level"
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background: 'linear-gradient(to bottom right, color-mix(in srgb, var(--theme-ai-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-secondary) 20%, transparent))',
                border: '1px solid var(--theme-border-light)'
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>{prompt.label}</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Select complexity level</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Tabs */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex gap-2">
            {(Object.keys(LEVEL_CONFIG) as PromptLevel[]).map((level) => {
              const cfg = LEVEL_CONFIG[level];
              const Icon = cfg.icon;
              const isSelected = selectedLevel === level;
              const isDefault = defaultLevel === level;

              const colorMap: Record<string, { bg: string; border: string; text: string }> = {
                emerald: { bg: 'var(--color-success-subtle)', border: 'var(--color-success-border)', text: 'var(--color-success)' },
                blue: { bg: 'var(--color-info-subtle)', border: 'var(--color-info-border)', text: 'var(--color-info)' },
                purple: { bg: 'var(--color-feature-subtle)', border: 'var(--color-feature-border)', text: 'var(--color-feature)' },
              };
              const defaultColors = { bg: 'var(--color-feature-subtle)', border: 'var(--color-feature-border)', text: 'var(--color-feature)' };
              const colors = colorMap[cfg.color] ?? defaultColors;

              return (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: isSelected ? colors.bg : 'transparent',
                    border: isSelected ? `1px solid ${colors.border}` : '1px solid var(--theme-border-light)',
                    color: isSelected ? colors.text : 'var(--theme-text-muted)'
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{cfg.label}</span>
                  {isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Level Description */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
            <span className="font-medium" style={{ color: 'var(--theme-text-muted)' }}>{config.label}:</span> {config.description}
          </p>
        </div>

        {/* Preview */}
        <div className="px-5 py-4 max-h-64 overflow-y-auto custom-scrollbar">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>
            {prompt[selectedLevel]}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <button
            onClick={handleSetDefault}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              backgroundColor: showSetDefault ? 'var(--color-success-subtle)' : 'transparent',
              color: showSetDefault ? 'var(--color-success)' : 'var(--theme-text-muted)',
              border: showSetDefault ? '1px solid var(--color-success-border)' : '1px solid transparent'
            }}
          >
            {showSetDefault ? (
              <>
                <Check className="w-4 h-4" />
                Saved as default
              </>
            ) : (
              <>
                <Settings2 className="w-4 h-4" />
                Set as default
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              className="px-5 py-2 text-sm font-medium rounded-lg transition-all"
              style={{
                background: 'linear-gradient(to right, var(--theme-ai-accent), var(--theme-ai-secondary))',
                color: 'var(--theme-text-on-accent)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, color-mix(in srgb, var(--theme-ai-accent) 90%, black), color-mix(in srgb, var(--theme-ai-secondary) 90%, black))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-ai-accent), var(--theme-ai-secondary))';
              }}
            >
              Use Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Quick Level Toggle - Compact level selector for inline use
 */
interface QuickLevelToggleProps {
  value: PromptLevel;
  onChange: (level: PromptLevel) => void;
  size?: 'sm' | 'md';
}

export const QuickLevelToggle: React.FC<QuickLevelToggleProps> = ({
  value,
  onChange,
  size = 'sm',
}) => {
  const levels: PromptLevel[] = ['simple', 'detailed', 'advanced'];
  const labels = { simple: 'S', detailed: 'D', advanced: 'A' };
  const fullLabels = { simple: 'Simple', detailed: 'Detailed', advanced: 'Advanced' };

  return (
    <div
      className={`inline-flex items-center rounded-lg ${size === 'sm' ? 'p-0.5' : 'p-1'}`}
      style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}
      title="Prompt complexity level"
    >
      {levels.map((level) => {
        const isSelected = value === level;
        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`${size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium rounded-md transition-all`}
            style={{
              backgroundColor: isSelected ? 'var(--color-feature-subtle)' : 'transparent',
              color: isSelected ? 'var(--color-feature)' : 'var(--theme-text-dim)',
              border: isSelected ? '1px solid var(--color-feature-border)' : '1px solid transparent'
            }}
            title={fullLabels[level]}
          >
            {size === 'sm' ? labels[level] : fullLabels[level]}
          </button>
        );
      })}
    </div>
  );
};
