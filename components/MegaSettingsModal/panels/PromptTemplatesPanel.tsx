import React, { useState, useEffect, useMemo } from 'react';
import { TOAST_DURATION_MS } from '../../../constants/timing';
import {
  FileText, Plus, Search, Star, Trash2, Edit3, Copy, Download, Upload,
  Tag, Sparkles, Wrench, MessageCircle, Layers, X, Check, ChevronDown
} from 'lucide-react';
import { SettingsSection } from '../shared';
import {
  PromptTemplate,
  PromptTemplateCategory,
  getPromptTemplates,
  addPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  toggleTemplateFavorite,
  duplicateTemplate,
  searchPromptTemplates,
  exportPromptTemplates,
  importPromptTemplates,
  extractVariablesFromPrompt,
  getPromptTemplateStats,
} from '@/services/promptTemplateStorage';

const CATEGORY_CONFIG: Record<PromptTemplateCategory, { label: string; icon: typeof Sparkles; bgVar: string; textVar: string }> = {
  generation: { label: 'Generation', icon: Sparkles, bgVar: 'var(--color-feature-subtle)', textVar: 'var(--color-feature)' },
  edit: { label: 'Edit', icon: Edit3, bgVar: 'var(--color-info-subtle)', textVar: 'var(--color-info)' },
  fix: { label: 'Fix', icon: Wrench, bgVar: 'var(--color-warning-subtle)', textVar: 'var(--color-warning)' },
  chat: { label: 'Chat', icon: MessageCircle, bgVar: 'var(--color-success-subtle)', textVar: 'var(--color-success)' },
  custom: { label: 'Custom', icon: Layers, bgVar: 'var(--theme-glass-200)', textVar: 'var(--theme-text-muted)' },
};

interface TemplateEditorProps {
  template?: PromptTemplate;
  onSave: (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>) => void;
  onCancel: () => void;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onCancel }) => {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState<PromptTemplateCategory>(template?.category || 'custom');
  const [prompt, setPrompt] = useState(template?.prompt || '');
  const [tags, setTags] = useState(template?.tags.join(', ') || '');

  const detectedVariables = useMemo(() => extractVariablesFromPrompt(prompt), [prompt]);

  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) return;

    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      prompt: prompt.trim(),
      variables: detectedVariables.map(v => ({ name: v })),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      isFavorite: template?.isFavorite || false,
    });
  };

  return (
    <div className="space-y-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>
          {template ? 'Edit Template' : 'New Template'}
        </h3>
        <button onClick={onCancel} className="p-1 rounded transition-colors" style={{ color: 'var(--theme-text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Template"
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Category</label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PromptTemplateCategory)}
              className="w-full px-3 py-2 rounded-lg text-sm appearance-none focus:outline-none"
              style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            >
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--theme-text-muted)' }} />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of what this template does"
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
        />
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>
          Prompt Template
          <span className="ml-2" style={{ color: 'var(--theme-text-dim)' }}>Use {'{{variableName}}'} for variables</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Create a {{componentName}} that {{functionality}}..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none font-mono"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
        />
        {detectedVariables.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {detectedVariables.map(v => (
              <span key={v} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--theme-text-muted)' }}>Tags (comma separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="react, component, ui"
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg transition-colors"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !prompt.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
        >
          <Check className="w-4 h-4" />
          {template ? 'Save Changes' : 'Create Template'}
        </button>
      </div>
    </div>
  );
};

export const PromptTemplatesPanel: React.FC = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<PromptTemplateCategory | 'all'>('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load templates
  useEffect(() => {
    setTemplates(getPromptTemplates());
  }, []);

  // Refresh templates
  const refreshTemplates = () => {
    setTemplates(getPromptTemplates());
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    let result = searchQuery ? searchPromptTemplates(searchQuery) : templates;

    if (filterCategory !== 'all') {
      result = result.filter(t => t.category === filterCategory);
    }

    if (showFavoritesOnly) {
      result = result.filter(t => t.isFavorite);
    }

    return result;
  }, [templates, searchQuery, filterCategory, showFavoritesOnly]);

  // Stats
  // Recompute when templates list changes (getPromptTemplateStats reads from storage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => getPromptTemplateStats(), [templates.length]);

  // Handlers
  const handleCreate = (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>) => {
    try {
      addPromptTemplate(template);
      refreshTemplates();
      setIsCreating(false);
      showMessage('success', 'Template created!');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to create template');
    }
  };

  const handleUpdate = (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>) => {
    if (!editingTemplate) return;

    updatePromptTemplate(editingTemplate.id, template);
    refreshTemplates();
    setEditingTemplate(null);
    showMessage('success', 'Template updated!');
  };

  const handleDelete = (id: string) => {
    if (deletePromptTemplate(id)) {
      refreshTemplates();
      showMessage('success', 'Template deleted!');
    }
  };

  const handleToggleFavorite = (id: string) => {
    toggleTemplateFavorite(id);
    refreshTemplates();
  };

  const handleDuplicate = (id: string) => {
    duplicateTemplate(id);
    refreshTemplates();
    showMessage('success', 'Template duplicated!');
  };

  const handleExport = () => {
    const json = exportPromptTemplates();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-templates-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('success', 'Templates exported!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = importPromptTemplates(text);
        if (result.success) {
          refreshTemplates();
          showMessage('success', `Imported ${result.imported} templates!`);
        } else {
          showMessage('error', result.error || 'Import failed');
        }
      } catch {
        showMessage('error', 'Failed to read file');
      }
    };
    input.click();
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
            <FileText className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Prompt Templates</h2>
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Save and reuse your favorite prompts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className="text-xs px-3 py-1 rounded-lg"
              style={{
                backgroundColor: message.type === 'success' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'
              }}
            >
              {message.text}
            </span>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Export Templates"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Import Templates"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
          <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.totalTemplates}</div>
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Total</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{stats.favoriteCount}</div>
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Favorites</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-feature)' }}>{stats.byCategory.generation}</div>
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Generation</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.byCategory.edit + stats.byCategory.fix}</div>
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Edit/Fix</div>
        </div>
      </div>

      {/* Create / Edit */}
      {(isCreating || editingTemplate) && (
        <TemplateEditor
          template={editingTemplate || undefined}
          onSave={editingTemplate ? handleUpdate : handleCreate}
          onCancel={() => {
            setIsCreating(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {/* Actions & Filters */}
      <SettingsSection title="Your Templates" description="Manage your saved prompt templates">
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreating(true)}
              disabled={isCreating || !!editingTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              />
            </div>

            <div className="relative">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as PromptTemplateCategory | 'all')}
                className="pl-3 pr-8 py-2 rounded-lg text-sm appearance-none focus:outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--theme-text-muted)' }} />
            </div>

            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: showFavoritesOnly ? 'var(--color-warning-subtle)' : undefined,
                color: showFavoritesOnly ? 'var(--color-warning)' : 'var(--theme-text-muted)'
              }}
              title="Show favorites only"
            >
              <Star className="w-4 h-4" fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Templates List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--theme-text-muted)' }}>
                {searchQuery || filterCategory !== 'all' || showFavoritesOnly
                  ? 'No templates match your filters'
                  : 'No templates yet. Create your first one!'}
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const catConfig = CATEGORY_CONFIG[template.category];
                const CategoryIcon = catConfig.icon;

                return (
                  <div
                    key={template.id}
                    className="group p-3 rounded-lg transition-all"
                    style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Category Icon */}
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: catConfig.bgVar, color: catConfig.textVar }}>
                        <CategoryIcon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{template.name}</span>
                          {template.isBuiltIn && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>Built-in</span>
                          )}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>{template.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {template.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}>
                              {tag}
                            </span>
                          ))}
                          {template.usageCount > 0 && (
                            <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>Used {template.usageCount}x</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleFavorite(template.id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{
                            backgroundColor: template.isFavorite ? 'var(--color-warning-subtle)' : undefined,
                            color: template.isFavorite ? 'var(--color-warning)' : 'var(--theme-text-muted)'
                          }}
                          title="Toggle favorite"
                        >
                          <Star className="w-3.5 h-3.5" fill={template.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => handleDuplicate(template.id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--theme-text-muted)' }}
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {!template.isBuiltIn && (
                          <>
                            <button
                              onClick={() => setEditingTemplate(template)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--theme-text-muted)' }}
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(template.id)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--theme-text-muted)' }}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="mt-2 p-2 rounded text-xs font-mono truncate" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-muted)' }}>
                      {template.prompt.slice(0, 100)}...
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </SettingsSection>

      {/* Tips */}
      <SettingsSection title="Tips" description="Get the most out of prompt templates">
        <div className="space-y-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
          <div className="flex items-start gap-2">
            <Tag className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
            <span>Use <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--color-info)' }}>{'{{variableName}}'}</code> to create placeholders that will be filled when using the template</span>
          </div>
          <div className="flex items-start gap-2">
            <Star className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
            <span>Mark frequently used templates as favorites for quick access</span>
          </div>
          <div className="flex items-start gap-2">
            <Download className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
            <span>Export your templates to share with others or backup</span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

export default PromptTemplatesPanel;
