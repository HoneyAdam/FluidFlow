/**
 * Prompt History Modal
 *
 * Shows user's prompt history with search, favorites, and reuse functionality
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Star,
  Search,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  X,
  Tag,
  TrendingUp,
  Heart,
  FileText,
} from 'lucide-react';
import { ConfirmModal } from '../ContextIndicator/ConfirmModal';
import { useToast } from '../Toast/ToastContext';
import {
  getPromptHistory,
  deletePromptFromHistory,
  togglePromptFavorite,
  searchPromptHistory,
  getFavoritePrompts,
  getRecentPrompts,
  getPromptHistoryStats,
  clearPromptHistory,
  exportPromptHistory,
  importPromptHistory,
  type PromptHistoryItem,
} from '@/services/promptHistory';

export interface PromptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const PromptHistoryModal: React.FC<PromptHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectPrompt,
}) => {
  const [prompts, setPrompts] = useState<PromptHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [stats, setStats] = useState(getPromptHistoryStats());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const { success, error } = useToast();

  // Load prompts on mount
  const loadPrompts = useCallback(() => {
    switch (filter) {
      case 'favorites':
        setPrompts(getFavoritePrompts());
        break;
      case 'recent':
        setPrompts(getRecentPrompts(7));
        break;
      default:
        setPrompts(getPromptHistory());
    }
  }, [filter]);

  useEffect(() => {
    if (isOpen) {
      loadPrompts();
      setStats(getPromptHistoryStats());
    }
  }, [isOpen, loadPrompts]);

  // Filter by search query
  const filteredPrompts = useMemo(() => {
    if (!searchQuery.trim()) return prompts;
    return searchPromptHistory(searchQuery).filter(p => prompts.some(item => item.id === p.id));
  }, [prompts, searchQuery]);

  // Group by date
  const groupedPrompts = useMemo(() => {
    const groups: Record<string, PromptHistoryItem[]> = {};

    for (const prompt of filteredPrompts) {
      const date = new Date(prompt.timestamp);
      const key = getDateKey(date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(prompt);
    }

    return groups;
  }, [filteredPrompts]);

  function getDateKey(date: Date): string {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  }

  function handleToggleFavorite(id: string) {
    togglePromptFavorite(id);
    loadPrompts();
    setStats(getPromptHistoryStats());
  }

  function handleDelete(id: string) {
    setShowDeleteConfirm(id);
  }

  function performDelete() {
    if (showDeleteConfirm) {
      deletePromptFromHistory(showDeleteConfirm);
      loadPrompts();
      setStats(getPromptHistoryStats());
      setShowDeleteConfirm(null);
    }
  }

  function handleSelect(prompt: string) {
    onSelectPrompt(prompt);
    onClose();
  }

  function handleExport() {
    const json = exportPromptHistory();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-history-${new Date().toISOString().split('T')[0]}.json`;
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
      const result = importPromptHistory(text);

      if (result.success) {
        loadPrompts();
        setStats(getPromptHistoryStats());
        success(`Imported ${result.imported} prompts`);
      } else {
        error(`Import failed: ${result.error}`);
      }
    };
    input.click();
  }

  function handleClearAll() {
    setShowClearAllConfirm(true);
  }

  function performClearAll() {
    clearPromptHistory();
    loadPrompts();
    setStats(getPromptHistoryStats());
    setShowClearAllConfirm(false);
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getPromptPreview(prompt: string): string {
    return prompt.length > 150 ? prompt.substring(0, 150) + '...' : prompt;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: 'var(--theme-backdrop)' }} role="dialog" aria-modal="true" aria-label="Prompt history">
      <div className="w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)' }}>
        {/* Header */}
        <div className="p-6" style={{ borderBottom: '1px solid var(--theme-border-subtle)', background: 'linear-gradient(to right, var(--color-feature-subtle), var(--color-info-subtle))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
                <Clock className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Prompt History</h2>
                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{stats.totalPrompts} prompts saved</p>
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
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              <span style={{ color: 'var(--theme-text-muted)' }}>{stats.thisWeekCount} this week</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Tag className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
              <span style={{ color: 'var(--theme-text-muted)' }}>{stats.mostUsedTags.slice(0, 3).join(', ') || 'No tags'}</span>
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
                placeholder="Search prompts..."
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
              <button
                onClick={() => setFilter('recent')}
                className="px-3 py-2 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor: filter === 'recent' ? 'var(--theme-accent)' : 'var(--theme-glass-200)',
                  color: filter === 'recent' ? 'var(--theme-text-on-accent)' : 'var(--theme-text-muted)',
                }}
              >
                Recent
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
                title="Import history"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={handleExport}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
                title="Export history"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleClearAll}
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
                title="Clear all history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Prompt List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--theme-text-dim)' }}>
              <FileText className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No prompts match your search' : 'No prompts saved yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedPrompts).map(([dateKey, items]) => (
                <div key={dateKey}>
                  <h3 className="text-xs font-medium mb-2 px-2" style={{ color: 'var(--theme-text-dim)' }}>{dateKey}</h3>
                  <div className="space-y-2">
                    {items.map((prompt) => (
                      <div
                        key={prompt.id}
                        className="p-4 rounded-lg transition-colors group"
                        style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-subtle)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--theme-text-secondary)' }}>
                              {getPromptPreview(prompt.prompt)}
                            </p>
                            {prompt.responsePreview && (
                              <p className="text-xs mt-2 italic" style={{ color: 'var(--theme-text-dim)' }}>
                                Response: {prompt.responsePreview}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                              <span>{formatTime(prompt.timestamp)}</span>
                              {prompt.model && (
                                <span className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-300)' }}>{prompt.model}</span>
                              )}
                              {prompt.tokensUsed && (
                                <span>{prompt.tokensUsed.toLocaleString()} tokens</span>
                              )}
                              {prompt.tags?.map((tag) => (
                                <span key={tag} className="px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleToggleFavorite(prompt.id)}
                              className="p-2 rounded-lg transition-colors"
                              style={{
                                backgroundColor: prompt.favorite ? 'var(--color-warning-subtle)' : 'var(--theme-glass-300)',
                                color: prompt.favorite ? 'var(--color-warning)' : 'var(--theme-text-muted)',
                              }}
                              title={prompt.favorite ? 'Remove favorite' : 'Add favorite'}
                            >
                              <Star className={`w-4 h-4 ${prompt.favorite ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              onClick={() => handleSelect(prompt.prompt)}
                              className="p-2 rounded-lg transition-colors"
                              style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}
                              title="Reuse this prompt"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(prompt.id)}
                              className="p-2 rounded-lg transition-colors"
                              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
        title="Delete Prompt"
        message="This will permanently delete this prompt from your history. This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
      />

      {/* Clear All Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={performClearAll}
        title="Clear All Prompt History"
        message="This will permanently delete all your saved prompt history. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />
    </div>
  );
};

export default PromptHistoryModal;
