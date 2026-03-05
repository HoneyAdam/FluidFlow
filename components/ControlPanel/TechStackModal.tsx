import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Palette, Database, Globe, Check, RotateCcw, Sparkles, Zap, FileText } from 'lucide-react';
import { useTechStack } from '../../hooks/useTechStack';
import { TechStackConfig, TECH_STACK_OPTIONS, TechStackOption } from '../../types';

// Category metadata with icons and colors (uses shared TECH_STACK_OPTIONS for data)
interface CategoryMeta {
  key: keyof TechStackConfig;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface TechStackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Category display metadata - actual options come from TECH_STACK_OPTIONS
const categoryMeta: CategoryMeta[] = [
  { key: 'styling', label: 'Styling', icon: Palette, color: 'var(--color-info)' },
  { key: 'icons', label: 'Icons', icon: Package, color: 'var(--color-success)' },
  { key: 'stateManagement', label: 'State Management', icon: Database, color: 'var(--color-feature)' },
  { key: 'routing', label: 'Routing', icon: Globe, color: 'var(--color-warning)' },
  { key: 'dataFetching', label: 'Data Fetching', icon: Zap, color: 'var(--color-info)' },
  { key: 'forms', label: 'Forms', icon: FileText, color: 'var(--color-feature)' },
  { key: 'animations', label: 'Animations', icon: Sparkles, color: 'var(--color-warning)' },
  { key: 'testing', label: 'Testing', icon: Check, color: 'var(--color-error)' }
];

// Helper to get options for a category from shared TECH_STACK_OPTIONS
const getOptionsForCategory = (key: keyof TechStackConfig): TechStackOption[] => {
  return TECH_STACK_OPTIONS[key] || [];
};

export const TechStackModal: React.FC<TechStackModalProps> = ({ isOpen, onClose }) => {
  const { techStack, updateTechStack, resetTechStack } = useTechStack();
  const [selectedCategory, setSelectedCategory] = useState<keyof TechStackConfig>('styling');

  if (!isOpen) return null;

  const currentMeta = categoryMeta.find(cat => cat.key === selectedCategory);
  const currentOptions = getOptionsForCategory(selectedCategory);
  const currentSelection = techStack[selectedCategory];

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 p-4" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="Tech stack">
      <div className="w-full max-w-5xl backdrop-blur-xl rounded-2xl animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, var(--color-feature-subtle), var(--color-error-subtle))' }}>
              <Package className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Technology Stack</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Choose your preferred libraries and frameworks</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetTechStack}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
              title="Reset to default stack"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Category Selection */}
          <div className="w-64 p-4" style={{ backgroundColor: 'var(--theme-glass-100)', borderRight: '1px solid var(--theme-border-light)' }}>
            <div className="space-y-1">
              {categoryMeta.map((meta) => {
                const Icon = meta.icon;
                const isSelected = selectedCategory === meta.key;

                return (
                  <button
                    key={meta.key}
                    onClick={() => setSelectedCategory(meta.key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{
                      backgroundColor: isSelected ? 'var(--theme-glass-300)' : 'transparent',
                      color: isSelected ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
                      border: isSelected ? '1px solid var(--theme-border)' : '1px solid transparent'
                    }}
                  >
                    <span style={{ color: isSelected ? meta.color : undefined }}><Icon className="w-4 h-4" /></span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{meta.label}</div>
                      <div className="text-xs opacity-70 capitalize">
                        {techStack[meta.key]?.library}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content - Options */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              {/* Category Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  {currentMeta && <span style={{ color: currentMeta.color }}><currentMeta.icon className="w-6 h-6" /></span>}
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--theme-text-primary)' }}>
                    {currentMeta?.label}
                  </h3>
                </div>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                  Select your preferred {currentMeta?.label.toLowerCase()} library for the generated code
                </p>
              </div>

              {/* Options Grid */}
              <div className="grid gap-3">
                {currentOptions.map((option) => {
                  const isSelected = currentSelection?.library === option.value;

                  return (
                    <button
                      key={option.value}
                      onClick={() => updateTechStack(selectedCategory, option.value, option.version)}
                      className="p-4 rounded-lg text-left transition-all"
                      style={{
                        background: isSelected ? 'linear-gradient(90deg, var(--color-feature-subtle), var(--color-error-subtle))' : 'var(--theme-glass-200)',
                        border: isSelected ? '1px solid var(--color-feature-border)' : '1px solid var(--theme-border)',
                        color: isSelected ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)'
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm">{option.label}</h4>
                            {isSelected && <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />}
                          </div>
                          <p className="text-xs mb-2" style={{ color: 'var(--theme-text-muted)' }}>{option.description}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-muted)' }}>
                              {option.version}
                            </span>
                            {isSelected && (
                              <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Current Stack Summary */}
              <div className="mt-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--theme-text-primary)' }}>Current Stack</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {categoryMeta.map((meta) => {
                    const selection = techStack[meta.key];
                    return (
                      <div key={meta.key} className="flex items-center gap-2">
                        <span style={{ color: meta.color }}><meta.icon className="w-3 h-3" /></span>
                        <span style={{ color: 'var(--theme-text-secondary)' }}>{selection?.library || 'none'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};