/**
 * Snippet Library Modal
 *
 * Modal for browsing, managing, and inserting code snippets
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Code2,
  Plus,
  Search,
  Star,
  Trash2,
  Edit2,
  Copy,
  Download,
  Upload,
  X,
  Tag,
  Heart,
  FileJson,
  Save,
} from 'lucide-react';
import { ConfirmModal } from '../ContextIndicator/ConfirmModal';
import { useToast } from '../Toast/ToastContext';
import {
  getSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  toggleSnippetFavorite,
  searchSnippets,
  getFavoriteSnippets,
  getSnippetStats,
  exportSnippets,
  importSnippets,
  initializeDefaultSnippets,
  type Snippet,
} from '@/services/snippetLibrary';

export interface SnippetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (code: string) => void;
}

export const SnippetLibraryModal: React.FC<SnippetLibraryModalProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
}) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [stats, setStats] = useState(getSnippetStats());
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const { success, error } = useToast();

  // Load snippets on mount
  const loadSnippets = useCallback(() => {
    initializeDefaultSnippets();
    switch (filter) {
      case 'favorites':
        setSnippets(getFavoriteSnippets());
        break;
      default:
        setSnippets(getSnippets());
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) {
      loadSnippets();
      setStats(getSnippetStats());
    }
  }, [isOpen, loadSnippets]);

  // Filter by search query and language
  const filteredSnippets = useMemo(() => {
    let result = snippets;

    if (searchQuery.trim()) {
      result = searchSnippets(searchQuery).filter(s => snippets.some(item => item.id === s.id));
    }

    if (languageFilter) {
      result = result.filter(s => s.language === languageFilter);
    }

    return result;
  }, [snippets, searchQuery, languageFilter]);

  // Get available languages
  const availableLanguages = useMemo(() => {
    const langs = new Set(snippets.map(s => s.language));
    return Array.from(langs).sort();
  }, [snippets]);

  function handleToggleFavorite(id: string) {
    toggleSnippetFavorite(id);
    loadSnippets();
    setStats(getSnippetStats());
  }

  function handleDelete(id: string) {
    setShowDeleteConfirm(id);
  }

  function performDelete() {
    if (showDeleteConfirm) {
      deleteSnippet(showDeleteConfirm);
      loadSnippets();
      setStats(getSnippetStats());
      setShowDeleteConfirm(null);
    }
  }

  function handleInsert(snippet: Snippet) {
    onInsertSnippet(snippet.code);
    onClose();
  }

  function handleCopy(snippet: Snippet) {
    navigator.clipboard.writeText(snippet.code);
  }

  function handleExport() {
    const json = exportSnippets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippets-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      const result = importSnippets(text);

      if (result.success) {
        loadSnippets();
        setStats(getSnippetStats());
        success(`Imported ${result.imported} snippets`);
      } else {
        error(`Import failed: ${result.error}`);
      }
    };
    input.click();
  }

  function handleSaveSnippet(snippetData: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) {
    if (editingSnippet) {
      updateSnippet(editingSnippet.id, snippetData);
    } else {
      addSnippet(snippetData);
    }
    setEditingSnippet(null);
    setShowNewForm(false);
    loadSnippets();
    setStats(getSnippetStats());
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: 'var(--theme-backdrop)' }} role="dialog" aria-modal="true" aria-label="Snippet library">
      <div className="w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)' }}>
        {/* Header */}
        <div className="p-6" style={{ borderBottom: '1px solid var(--theme-border-subtle)', background: 'linear-gradient(to right, var(--color-info-subtle), var(--color-feature-subtle))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
                <Code2 className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Snippet Library</h2>
                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{stats.totalSnippets} snippets saved</p>
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="flex items-center gap-2 text-xs">
              <Heart className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
              <span style={{ color: 'var(--theme-text-muted)' }}>{stats.favoriteCount} favorites</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Tag className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
              <span style={{ color: 'var(--theme-text-muted)' }}>{stats.mostUsedTags.slice(0, 3).join(', ') || 'No tags'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <FileJson className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              <span style={{ color: 'var(--theme-text-muted)' }}>{Object.keys(stats.languageCount).length} languages</span>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border-subtle)' }}>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-dim)' }} />
              <input
                type="text"
                placeholder="Search snippets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className="px-3 py-2 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor: filter === 'all' ? 'var(--theme-accent)' : 'var(--theme-glass-200)',
                  color: filter === 'all' ? 'var(--theme-text-on-accent)' : 'var(--theme-text-muted)',
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilter('favorites')}
                className="px-3 py-2 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor: filter === 'favorites' ? 'var(--theme-accent)' : 'var(--theme-glass-200)',
                  color: filter === 'favorites' ? 'var(--theme-text-on-accent)' : 'var(--theme-text-muted)',
                }}
              >
                <Star className="w-4 h-4 inline mr-1" />
                Favorites
              </button>
            </div>

            {/* Language Filter */}
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            >
              <option value="">All Languages</option>
              {availableLanguages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewForm(true)}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
                title="New snippet"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={handleImport}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
                title="Import snippets"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={handleExport}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
                title="Export snippets"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Snippet Grid or Form */}
        <div className="flex-1 overflow-y-auto p-4">
          {showNewForm || editingSnippet ? (
            <SnippetForm
              snippet={editingSnippet}
              onSave={handleSaveSnippet}
              onCancel={() => {
                setShowNewForm(false);
                setEditingSnippet(null);
              }}
            />
          ) : filteredSnippets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-dim)' }}>
              <Code2 className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No snippets match your search' : 'No snippets yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filteredSnippets.map((snippet) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  onInsert={() => handleInsert(snippet)}
                  onCopy={() => handleCopy(snippet)}
                  onEdit={() => setEditingSnippet(snippet)}
                  onToggleFavorite={() => handleToggleFavorite(snippet.id)}
                  onDelete={() => handleDelete(snippet.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm !== null}
        onClose={() => setShowDeleteConfirm(null)}
        onConfirm={performDelete}
        title="Delete Snippet"
        message="This will permanently delete this snippet. This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
      />
    </div>
  );
};

interface SnippetCardProps {
  snippet: Snippet;
  onInsert: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function SnippetCard({
  snippet,
  onInsert,
  onCopy,
  onEdit,
  onToggleFavorite,
  onDelete,
}: SnippetCardProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="rounded-lg transition-all group" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-subtle)' }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>{snippet.name}</h3>
            <p className="text-xs line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{snippet.description}</p>
          </div>
          <button
            onClick={onToggleFavorite}
            className="shrink-0"
            style={{ color: snippet.favorite ? 'var(--color-warning)' : 'var(--theme-text-dim)' }}
          >
            <Star className={`w-4 h-4 ${snippet.favorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {snippet.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
              {tag}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>
            {snippet.language}
          </span>
        </div>

        {/* Code Preview */}
        <div className="relative mb-3">
          <pre className={`text-xs rounded p-2 overflow-x-auto ${
            showCode ? 'max-h-32' : 'max-h-16'
          }`} style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
            <code style={{ color: 'var(--theme-text-secondary)' }}>{snippet.code.slice(0, 200)}{snippet.code.length > 200 && !showCode ? '...' : ''}</code>
          </pre>
          {snippet.code.length > 200 && (
            <button
              onClick={() => setShowCode(!showCode)}
              className="text-[10px] hover:underline"
              style={{ color: 'var(--color-info)' }}
            >
              {showCode ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onInsert}
            className="flex-1 px-2 py-1.5 rounded text-xs transition-colors"
            style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
          >
            Insert
          </button>
          <button
            onClick={onCopy}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
            title="Copy to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded transition-colors"
            style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface SnippetFormProps {
  snippet: Snippet | null;
  onSave: (snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function SnippetForm({ snippet, onSave, onCancel }: SnippetFormProps) {
  const [name, setName] = useState(snippet?.name || '');
  const [description, setDescription] = useState(snippet?.description || '');
  const [code, setCode] = useState(snippet?.code || '');
  const [language, setLanguage] = useState(snippet?.language || 'typescript');
  const [tags, setTags] = useState(snippet?.tags.join(', ') || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const tagsArray = tags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    onSave({
      name,
      description,
      code,
      language,
      tags: tagsArray,
      favorite: snippet?.favorite || false,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
      <h3 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>
        {snippet ? 'Edit Snippet' : 'New Snippet'}
      </h3>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          placeholder="My Awesome Snippet"
        />
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          placeholder="Brief description of what this snippet does"
        />
      </div>

      <div>
        <label className="block text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Code *</label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          rows={10}
          className="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none"
          style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          placeholder="// Your code here"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="tsx">TSX</option>
            <option value="jsx">JSX</option>
            <option value="css">CSS</option>
            <option value="html">HTML</option>
            <option value="json">JSON</option>
            <option value="python">Python</option>
            <option value="sql">SQL</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            placeholder="react, hook, utility"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--theme-border-subtle)' }}>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
        >
          <Save className="w-4 h-4" />
          Save Snippet
        </button>
      </div>
    </form>
  );
}

export default SnippetLibraryModal;
