import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Star, ChevronRight, Search, X, Settings, Sparkles,
  Edit3, Wrench, MessageCircle, Layers
} from 'lucide-react';
import {
  PromptTemplate,
  PromptTemplateCategory,
  getPromptTemplates,
  getFavoriteTemplates,
  searchPromptTemplates,
  incrementTemplateUsage,
  applyVariablesToPrompt,
} from '@/services/promptTemplateStorage';

const CATEGORY_ICONS: Record<PromptTemplateCategory, typeof Sparkles> = {
  generation: Sparkles,
  edit: Edit3,
  fix: Wrench,
  chat: MessageCircle,
  custom: Layers,
};

const CATEGORY_COLORS: Record<PromptTemplateCategory, string> = {
  generation: 'var(--color-feature)',
  edit: 'var(--color-info)',
  fix: 'var(--color-warning)',
  chat: 'var(--color-success)',
  custom: 'var(--theme-text-muted)',
};

interface VariableInputModalProps {
  template: PromptTemplate;
  onApply: (prompt: string) => void;
  onCancel: () => void;
}

const VariableInputModal: React.FC<VariableInputModalProps> = ({ template, onApply, onCancel }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    template.variables.forEach(v => {
      initial[v.name] = v.defaultValue || '';
    });
    return initial;
  });

  const handleApply = () => {
    const result = applyVariablesToPrompt(template.prompt, values);
    incrementTemplateUsage(template.id);
    onApply(result);
  };

  const allFilled = template.variables.every(v => values[v.name]?.trim());

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150" style={{ backgroundColor: 'var(--theme-overlay)' }}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--theme-text-primary)' }}>{template.name}</h3>
              <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Fill in the variables</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Variables */}
        <div className="p-5 space-y-4">
          {template.variables.map((variable) => (
            <div key={variable.name}>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                {variable.name}
                {variable.description && (
                  <span className="ml-1" style={{ color: 'var(--theme-text-dim)' }}>- {variable.description}</span>
                )}
              </label>
              <input
                type="text"
                value={values[variable.name] || ''}
                onChange={(e) => setValues(prev => ({ ...prev, [variable.name]: e.target.value }))}
                placeholder={variable.defaultValue || `Enter ${variable.name}...`}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              />
            </div>
          ))}

          {/* Preview */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>Preview</label>
            <div className="p-3 rounded-lg text-xs font-mono max-h-32 overflow-y-auto" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-secondary)' }}>
              {applyVariablesToPrompt(template.prompt, values)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!allFilled}
            className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-feature)', color: 'var(--theme-text-primary)' }}
          >
            Use Template
          </button>
        </div>
      </div>
    </div>
  );
};

interface PromptTemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenSettings?: () => void;
}

export const PromptTemplateSelector: React.FC<PromptTemplateSelectorProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
  onOpenSettings,
}) => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTemplates(getPromptTemplates());
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredTemplates = useMemo(() => {
    let result = searchQuery ? searchPromptTemplates(searchQuery) : templates;
    if (showFavoritesOnly) {
      result = result.filter(t => t.isFavorite);
    }
    return result.slice(0, 10); // Limit to 10 in dropdown
  }, [templates, searchQuery, showFavoritesOnly]);

  // Recompute when templates list changes (getFavoriteTemplates reads from storage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const favorites = useMemo(() => getFavoriteTemplates().slice(0, 5), [templates.length]);

  const handleSelect = (template: PromptTemplate) => {
    if (template.variables.length > 0) {
      setSelectedTemplate(template);
    } else {
      incrementTemplateUsage(template.id);
      onSelectPrompt(template.prompt);
      onClose();
    }
  };

  const handleVariableApply = (prompt: string) => {
    onSelectPrompt(prompt);
    setSelectedTemplate(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <div
        className="absolute bottom-full left-0 mb-2 w-80 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150 z-50"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-2" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--theme-text-dim)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
              style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-primary)' }}
              autoFocus
            />
          </div>
        </div>

        {/* Favorites */}
        {!searchQuery && favorites.length > 0 && (
          <div className="p-2" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>
              <Star className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />
              Favorites
            </div>
            {favorites.map(template => {
              const Icon = CATEGORY_ICONS[template.category];
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--theme-glass-100)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: CATEGORY_COLORS[template.category] }} />
                  <span className="flex-1 text-xs text-left truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                    {template.name}
                  </span>
                  {template.variables.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                      {template.variables.length} var
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3" style={{ color: 'var(--theme-text-dim)' }} />
                </button>
              );
            })}
          </div>
        )}

        {/* All Templates */}
        <div className="p-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>
              {searchQuery ? 'Results' : 'All Templates'}
            </span>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="p-1 rounded transition-colors"
              style={{ color: showFavoritesOnly ? 'var(--color-warning)' : 'var(--theme-text-dim)' }}
              title="Show favorites only"
            >
              <Star className="w-3 h-3" fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            </button>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
              {searchQuery ? 'No templates found' : 'No templates yet'}
            </div>
          ) : (
            filteredTemplates.map(template => {
              const Icon = CATEGORY_ICONS[template.category];
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--theme-glass-100)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: CATEGORY_COLORS[template.category] }} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-xs truncate" style={{ color: 'var(--theme-text-secondary)' }}>
                        {template.name}
                      </span>
                      {template.isFavorite && (
                        <Star className="w-2.5 h-2.5 shrink-0" style={{ color: 'var(--color-warning)' }} fill="currentColor" />
                      )}
                    </div>
                    <p className="text-[10px] truncate" style={{ color: 'var(--theme-text-dim)' }}>{template.description}</p>
                  </div>
                  {template.variables.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                      {template.variables.length} var
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--theme-text-dim)' }} />
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-2" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface-dark)' }}>
          <button
            onClick={() => {
              onOpenSettings?.();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-100)', color: 'var(--theme-text-muted)' }}
          >
            <Settings className="w-3.5 h-3.5" />
            Manage Templates
          </button>
        </div>
      </div>

      {/* Variable Input Modal */}
      {selectedTemplate && (
        <VariableInputModal
          template={selectedTemplate}
          onApply={handleVariableApply}
          onCancel={() => setSelectedTemplate(null)}
        />
      )}
    </>
  );
};

export default PromptTemplateSelector;
