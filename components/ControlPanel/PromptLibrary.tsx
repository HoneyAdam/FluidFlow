import React, { useState } from 'react';
import {
  X, Palette, Smartphone, Sparkles, Zap, LayoutGrid, Accessibility,
  FileText, Wrench, ChevronRight, Search, BookOpen
} from 'lucide-react';
import { promptLibrary, quickPrompts, PromptItem, PromptLevel } from '../../data/promptLibrary';
import { PromptLevelModal, QuickLevelToggle } from './PromptLevelModal';
import { usePromptLevel } from './hooks';

interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Palette,
  Smartphone,
  Sparkles,
  Zap,
  LayoutGrid,
  Accessibility,
  FileText,
  Wrench,
};

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose, onSelectPrompt }) => {
  const [activeCategory, setActiveCategory] = useState<string>(promptLibrary[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [defaultLevel, setDefaultLevel] = usePromptLevel();

  if (!isOpen) return null;

  const activePrompts = promptLibrary.find(c => c.id === activeCategory)?.prompts || [];

  // Filter prompts based on search
  const filteredPrompts = searchQuery
    ? promptLibrary.flatMap(cat =>
        cat.prompts.filter(p =>
          p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.detailed.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(p => ({ ...p, category: cat.name }))
      )
    : activePrompts;

  // Handle prompt click - show level modal
  const handlePromptClick = (prompt: PromptItem) => {
    setSelectedPrompt(prompt);
    setShowLevelModal(true);
  };

  // Handle level selection from modal
  const handleLevelSelect = (promptText: string, _level: PromptLevel) => {
    onSelectPrompt(promptText);
    onClose();
  };

  // Quick select using default level (for quick prompts footer)
  const handleQuickSelect = (prompt: PromptItem) => {
    onSelectPrompt(prompt[defaultLevel]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150"
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt library"
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(to bottom right, var(--color-feature-subtle), var(--color-error-subtle))', border: '1px solid var(--theme-border-light)' }}>
              <BookOpen className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Prompt Library</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Ready-to-use design prompts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Level</span>
              <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categories Sidebar */}
          {!searchQuery && (
            <div className="w-48 overflow-y-auto custom-scrollbar p-2 shrink-0" style={{ borderRight: '1px solid var(--theme-border-light)' }}>
              {promptLibrary.map(category => {
                const Icon = iconMap[category.icon] || Sparkles;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{
                      backgroundColor: isActive ? 'var(--color-feature-subtle)' : 'transparent',
                      color: isActive ? 'var(--color-feature)' : 'var(--theme-text-muted)',
                      border: isActive ? '1px solid var(--color-feature-border)' : '1px solid transparent'
                    }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">{category.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Prompts List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            {searchQuery && (
              <p className="text-xs mb-3" style={{ color: 'var(--theme-text-muted)' }}>
                Found {filteredPrompts.length} prompts matching "{searchQuery}"
              </p>
            )}

            <div className="space-y-2">
              {filteredPrompts.map((prompt: PromptItem & { category?: string }) => (
                <button
                  key={prompt.id}
                  onClick={() => handlePromptClick(prompt)}
                  className="w-full group flex items-start gap-3 p-3 rounded-xl transition-all text-left"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium transition-colors" style={{ color: 'var(--theme-text-primary)' }}>
                        {prompt.label}
                      </span>
                      {prompt.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>
                          {prompt.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{prompt[defaultLevel]}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 transition-colors shrink-0 mt-0.5" style={{ color: 'var(--theme-text-dim)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer with Quick Prompts */}
        <div className="px-5 py-3 shrink-0" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>Quick Actions (uses default level)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map(qp => (
              <button
                key={qp.id}
                onClick={() => handleQuickSelect(qp)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border-light)' }}
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Level Selection Modal */}
      <PromptLevelModal
        isOpen={showLevelModal}
        onClose={() => setShowLevelModal(false)}
        prompt={selectedPrompt}
        onSelect={handleLevelSelect}
        defaultLevel={defaultLevel}
        onSetDefaultLevel={setDefaultLevel}
      />
    </div>
  );
};

// Quick dropdown for inline prompt selection
interface PromptDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
  onOpenLibrary: () => void;
}

export const PromptDropdown: React.FC<PromptDropdownProps> = ({ isOpen, onClose, onSelectPrompt, onOpenLibrary }) => {
  const [defaultLevel, setDefaultLevel] = usePromptLevel();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to close dropdown */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="absolute bottom-full left-0 mb-2 w-72 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150 z-50"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Prompt Level Toggle */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--theme-text-muted)' }}>Prompt Level</span>
            <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />
          </div>
        </div>

        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] px-2 py-1 font-medium uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>Quick Prompts</p>
          {quickPrompts.map(qp => (
            <button
              key={qp.id}
              onClick={() => {
                onSelectPrompt(qp[defaultLevel]);
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors group"
            >
              <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{qp.label}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--theme-text-dim)' }} />
            </button>
          ))}
        </div>

        <div className="p-2" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
          <button
            onClick={() => {
              onOpenLibrary();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}
          >
            <BookOpen className="w-4 h-4" />
            Browse All Prompts
          </button>
        </div>
      </div>
    </>
  );
};
