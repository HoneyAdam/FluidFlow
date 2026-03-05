import React, { useState, useRef, useEffect } from 'react';
import { ERROR_DISPLAY_DURATION_MS } from '../../constants/timing';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Loader2,
  Image,
  Palette,
  FileCode,
  ChevronDown,
  ChevronRight,
  Trash2,
  Sparkles,
  Minimize2,
  BookOpen,
  Zap,
  Search,
  Smartphone,
  LayoutGrid,
  Accessibility,
  FileText,
  Wrench
} from 'lucide-react';
import { ChatAttachment, FileSystem } from '../../types';
import { promptLibrary, quickPrompts, PromptItem, PromptLevel } from '../../data/promptLibrary';
import { PromptImproverModal } from './PromptImproverModal';
import { PromptLevelModal, QuickLevelToggle } from './PromptLevelModal';
import { usePromptLevel } from './hooks';

interface ExpandedPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (prompt: string, attachments: ChatAttachment[], fileContext?: string[]) => void;
  isGenerating: boolean;
  hasExistingApp: boolean;
  files: FileSystem;
  initialPrompt?: string;
  initialAttachments?: ChatAttachment[];
}

// Quick prompt suggestions
const QUICK_PROMPTS = [
  { label: 'Add dark mode', prompt: 'Add a dark/light mode toggle with system preference detection' },
  { label: 'Responsive', prompt: 'Make the layout fully responsive for mobile, tablet, and desktop' },
  { label: 'Add animations', prompt: 'Add smooth animations and transitions to improve UX' },
  { label: 'Add loading states', prompt: 'Add loading states and skeleton screens for async operations' },
  { label: 'Improve accessibility', prompt: 'Improve accessibility with proper ARIA labels and keyboard navigation' },
  { label: 'Add form validation', prompt: 'Add client-side form validation with error messages' },
];

// Icon map for prompt library
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

export const ExpandedPromptModal: React.FC<ExpandedPromptModalProps> = ({
  isOpen,
  onClose,
  onSend,
  isGenerating,
  hasExistingApp,
  files,
  initialPrompt = '',
  initialAttachments = []
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [attachments, setAttachments] = useState<ChatAttachment[]>(initialAttachments);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(true);
  const [showImproverModal, setShowImproverModal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // FIX-16: Cleanup error timeout on unmount
  useEffect(() => () => clearTimeout(errorTimeoutRef.current), []);

  // Prompt library state
  const [activeCategory, setActiveCategory] = useState<string>(promptLibrary[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLibraryPrompt, setSelectedLibraryPrompt] = useState<PromptItem | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [defaultLevel, setDefaultLevel] = usePromptLevel();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachTypeRef = useRef<'sketch' | 'brand'>('sketch');

  const error = localError;

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.setSelectionRange(prompt.length, prompt.length);
    }
    // Note: prompt.length is used to position cursor, but we do not want to re-run on prompt changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 300) + 'px';
    }
  }, [prompt]);

  // Sync initial values
  useEffect(() => {
    setPrompt(initialPrompt);
    setAttachments(initialAttachments);
  }, [initialPrompt, initialAttachments]);

  if (!isOpen) return null;

  const handleAttach = (type: 'sketch' | 'brand', file: File, preview: string) => {
    const newAttachment: ChatAttachment = { type, file, preview };
    setAttachments(prev => {
      const existing = prev.findIndex(a => a.type === type);
      if (existing >= 0) {
        return prev.map((a, i) => i === existing ? newAttachment : a);
      }
      return [...prev, newAttachment];
    });
  };

  const handleRemove = (type: 'sketch' | 'brand') => {
    setAttachments(prev => prev.filter(a => a.type !== type));
  };

  const handleSend = () => {
    const hasSketch = attachments.find(a => a.type === 'sketch');
    const hasPrompt = prompt.trim().length > 0;

    if (!hasExistingApp && !hasSketch && !hasPrompt) {
      setLocalError('Please upload a sketch or enter a prompt');
      errorTimeoutRef.current = setTimeout(() => setLocalError(null), ERROR_DISPLAY_DURATION_MS);
      return;
    }

    if (hasExistingApp && !hasPrompt && attachments.length === 0) {
      setLocalError('Please enter a prompt or attach an image');
      errorTimeoutRef.current = setTimeout(() => setLocalError(null), ERROR_DISPLAY_DURATION_MS);
      return;
    }

    // Build prompt with file context
    let finalPrompt = prompt.trim();
    if (selectedFiles.length > 0) {
      const contextParts = selectedFiles.map(f => `### ${f}\n\`\`\`\n${files[f] || ''}\n\`\`\``);
      finalPrompt = `${finalPrompt}\n\n---\n**Referenced Files:**\n${contextParts.join('\n\n')}`;
    }

    onSend(finalPrompt, attachments, selectedFiles);
    setPrompt('');
    setAttachments([]);
    setSelectedFiles([]);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const openFileDialog = (type: 'sketch' | 'brand') => {
    attachTypeRef.current = type;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setLocalError('Invalid file type');
      errorTimeoutRef.current = setTimeout(() => setLocalError(null), ERROR_DISPLAY_DURATION_MS);
      return;
    }

    const reader = new FileReader();
    // FIX-33: Add onerror handler for FileReader
    reader.onerror = () => {
      setLocalError('Failed to read file');
      errorTimeoutRef.current = setTimeout(() => setLocalError(null), ERROR_DISPLAY_DURATION_MS);
    };
    reader.onloadend = () => {
      const result = reader.result as string;
      // Only attach if we got a valid result (not empty string)
      if (result && result.trim().length > 0) {
        handleAttach(attachTypeRef.current, file, result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles(prev =>
      prev.includes(filePath)
        ? prev.filter(f => f !== filePath)
        : [...prev, filePath]
    );
  };

  // Get source files for context selection
  const sourceFiles = Object.keys(files).filter(f =>
    f.startsWith('src/') && (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'))
  ).sort();

  const sketchAttachment = attachments.find(a => a.type === 'sketch');
  const brandAttachment = attachments.find(a => a.type === 'brand');
  const canSend = hasExistingApp
    ? (prompt.trim() || attachments.length > 0)
    : (!!sketchAttachment || prompt.trim().length > 0);

  // Prompt library helpers
  const activePrompts = promptLibrary.find(c => c.id === activeCategory)?.prompts || [];
  const filteredPrompts = searchQuery
    ? promptLibrary.flatMap(cat =>
        cat.prompts.filter(p =>
          p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.detailed.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(p => ({ ...p, category: cat.name }))
      )
    : activePrompts;

  // Handle prompt click from library - show level modal
  const handlePromptClick = (promptItem: PromptItem) => {
    setSelectedLibraryPrompt(promptItem);
    setShowLevelModal(true);
  };

  // Handle level selection from modal
  const handleLevelSelect = (promptText: string, _level: PromptLevel) => {
    setPrompt(prev => prev ? `${prev}\n${promptText}` : promptText);
    setShowLevelModal(false);
    setSearchQuery('');
    textareaRef.current?.focus();
  };

  // Quick select using default level (for quick prompts in footer)
  const handleQuickSelect = (promptItem: PromptItem) => {
    const promptText = promptItem[defaultLevel];
    setPrompt(prev => prev ? `${prev}\n${promptText}` : promptText);
    textareaRef.current?.focus();
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] backdrop-blur-sm animate-in fade-in duration-200"
        style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
        <div
          className="w-[90vw] max-w-7xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
          style={{ backgroundColor: 'var(--theme-modal-bg)', border: '1px solid var(--theme-modal-border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--theme-accent-subtle), var(--theme-ai-accent-subtle))' }}>
                <Sparkles className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--theme-text-primary)' }}>
                  {hasExistingApp ? 'Describe Changes' : 'Describe Your App'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Enter to send</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content with optional Prompt Library Panel */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Prompt Editor */}
            <div className={`flex-1 flex flex-col overflow-hidden transition-all ${showPromptLibrary ? 'w-1/2' : 'w-full'}`}>
              {/* Content */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
                {error}
              </div>
            )}

            {/* Quick Prompts */}
            {hasExistingApp && (
              <div>
                <div className="text-xs mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-muted)' }}>
                  <Zap className="w-3.5 h-3.5" />
                  Quick Actions
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((qp, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(prev => prev ? `${prev}\n${qp.prompt}` : qp.prompt)}
                      className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                      style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border-light)' }}
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasExistingApp
                  ? "Describe the changes you want to make...\n\nBe specific about components, styling, or functionality."
                  : "Describe your app in detail...\n\nInclude features, layout, color scheme, and any specific requirements."
                }
                disabled={isGenerating}
                className="w-full min-h-[200px] rounded-xl p-4 text-sm focus:outline-none resize-none disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--theme-input-bg)',
                  border: '1px solid var(--theme-input-border)',
                  color: 'var(--theme-text-primary)'
                }}
              />

              {/* Character count */}
              <div className="absolute bottom-3 right-3 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                {prompt.length} chars
              </div>
            </div>

            {/* Attachments */}
            <div className="flex flex-wrap gap-4">
              {/* Sketch */}
              <div
                onClick={() => !sketchAttachment && openFileDialog('sketch')}
                className={`relative flex-1 min-w-[150px] p-4 rounded-xl border-2 border-dashed transition-all ${
                  !sketchAttachment ? 'cursor-pointer' : ''
                }`}
                style={{
                  borderColor: sketchAttachment ? 'var(--theme-accent)' : 'var(--theme-border)',
                  backgroundColor: sketchAttachment ? 'var(--theme-accent-subtle)' : undefined
                }}
              >
                {sketchAttachment ? (
                  <div className="flex items-center gap-3">
                    {sketchAttachment.preview && sketchAttachment.preview.trim() ? (
                      <img
                        src={sketchAttachment.preview}
                        alt="Sketch"
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--theme-surface)' }}>
                        <Image className="w-8 h-8" style={{ color: 'var(--theme-accent)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                        {sketchAttachment.file.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Sketch / Wireframe</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove('sketch'); }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Image className="w-8 h-8" style={{ color: 'var(--theme-accent)' }} />
                    <div>
                      <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>Add Sketch</p>
                      <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Wireframe or mockup</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Brand */}
              <div
                onClick={() => !brandAttachment && openFileDialog('brand')}
                className={`relative flex-1 min-w-[150px] p-4 rounded-xl border-2 border-dashed transition-all ${
                  !brandAttachment ? 'cursor-pointer' : ''
                }`}
                style={{
                  borderColor: brandAttachment ? 'var(--theme-ai-accent)' : 'var(--theme-border)',
                  backgroundColor: brandAttachment ? 'var(--theme-ai-accent-subtle)' : undefined
                }}
              >
                {brandAttachment ? (
                  <div className="flex items-center gap-3">
                    {brandAttachment.preview && brandAttachment.preview.trim() ? (
                      <img
                        src={brandAttachment.preview}
                        alt="Brand"
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--theme-surface)' }}>
                        <Palette className="w-8 h-8" style={{ color: 'var(--theme-ai-accent)' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                        {brandAttachment.file.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Brand Logo</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove('brand'); }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Palette className="w-8 h-8" style={{ color: 'var(--theme-ai-accent)' }} />
                    <div>
                      <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>Add Brand</p>
                      <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Logo for colors</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* File Context Selector - Only for existing app */}
            {hasExistingApp && sourceFiles.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--theme-border)' }}>
                <button
                  onClick={() => setShowFileSelector(!showFileSelector)}
                  className="w-full flex items-center justify-between p-3 transition-colors"
                  style={{ backgroundColor: 'transparent' }}
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                    <span className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>Include File Context</span>
                    {selectedFiles.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                        {selectedFiles.length} selected
                      </span>
                    )}
                  </div>
                  {showFileSelector ? (
                    <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  ) : (
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  )}
                </button>

                {showFileSelector && (
                  <div className="p-3 max-h-48 overflow-y-auto" style={{ borderTop: '1px solid var(--theme-border)' }}>
                    <p className="text-xs mb-2" style={{ color: 'var(--theme-text-muted)' }}>
                      Select files to include as reference context
                    </p>
                    <div className="space-y-1">
                      {sourceFiles.map(file => (
                        <label
                          key={file}
                          className="flex items-center gap-2 p-2 rounded-lg cursor-pointer"
                          style={{ backgroundColor: 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file)}
                            onChange={() => toggleFileSelection(file)}
                            className="rounded"
                            style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-surface)' }}
                          />
                          <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
                          <span className="text-sm truncate" style={{ color: 'var(--theme-text-secondary)' }}>{file}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
              </div>

              {/* Footer for left panel */}
              <div className="flex items-center justify-between p-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface-elevated)' }}>
                <div className="flex items-center gap-2">
                  {/* Prompt Library Toggle */}
                  <button
                    onClick={() => setShowPromptLibrary(!showPromptLibrary)}
                    className="p-2.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: showPromptLibrary ? 'var(--theme-ai-accent-subtle)' : undefined,
                      color: showPromptLibrary ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)'
                    }}
                    title={showPromptLibrary ? 'Hide Prompt Library' : 'Show Prompt Library'}
                  >
                    <BookOpen className="w-5 h-5" />
                  </button>

                  {/* Improve Prompt Button */}
                  {prompt.trim().length > 0 && (
                    <button
                      onClick={() => setShowImproverModal(true)}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--theme-ai-accent-subtle)', color: 'var(--theme-ai-accent)', border: '1px solid var(--theme-ai-accent)' }}
                      title="Improve prompt with AI"
                    >
                      <Sparkles className="w-4 h-4" />
                      Improve
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm transition-colors"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={isGenerating || !canSend}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Prompt Library Panel */}
            {showPromptLibrary && (
              <div className="w-1/2 flex flex-col animate-in slide-in-from-right-5 duration-200" style={{ borderLeft: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface-elevated)' }}>
                {/* Library Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4" style={{ color: 'var(--theme-ai-accent)' }} />
                    <span className="font-medium text-sm" style={{ color: 'var(--theme-text-primary)' }}>Prompt Library</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuickLevelToggle value={defaultLevel} onChange={setDefaultLevel} size="sm" />
                    <button
                      onClick={() => setShowPromptLibrary(false)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--theme-border)' }}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search prompts..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
                      style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                    />
                  </div>
                </div>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                  {/* Categories Sidebar */}
                  {!searchQuery && (
                    <div className="w-40 overflow-y-auto custom-scrollbar p-2 shrink-0" style={{ borderRight: '1px solid var(--theme-border-light)' }}>
                      {promptLibrary.map(category => {
                        const Icon = iconMap[category.icon] || Sparkles;
                        const isActive = activeCategory === category.id;
                        return (
                          <button
                            key={category.id}
                            onClick={() => setActiveCategory(category.id)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs border"
                            style={{
                              backgroundColor: isActive ? 'var(--theme-ai-accent-subtle)' : undefined,
                              color: isActive ? 'var(--theme-ai-accent)' : 'var(--theme-text-muted)',
                              borderColor: isActive ? 'var(--theme-ai-accent)' : 'transparent'
                            }}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{category.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Prompts List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    {searchQuery && (
                      <p className="text-xs mb-2" style={{ color: 'var(--theme-text-muted)' }}>
                        Found {filteredPrompts.length} prompts
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {filteredPrompts.map((promptItem: PromptItem & { category?: string }) => (
                        <button
                          key={promptItem.id}
                          onClick={() => handlePromptClick(promptItem)}
                          className="w-full group flex items-start gap-2 p-2.5 rounded-lg transition-all text-left border"
                          style={{
                            backgroundColor: 'var(--theme-glass-100)',
                            borderColor: 'var(--theme-border-light)'
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium transition-colors" style={{ color: 'var(--theme-text-primary)' }}>
                                {promptItem.label}
                              </span>
                              {promptItem.category && (
                                <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-muted)' }}>
                                  {promptItem.category}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{promptItem[defaultLevel]}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 transition-colors shrink-0 mt-0.5" style={{ color: 'var(--theme-text-muted)' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Prompts Footer */}
                <div className="px-3 py-2" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-surface)' }}>
                  <p className="text-[10px] mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>Quick Actions (uses default level)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.slice(0, 4).map(qp => (
                      <button
                        key={qp.id}
                        onClick={() => handleQuickSelect(qp)}
                        className="px-2 py-1 text-[10px] font-medium rounded border transition-all"
                        style={{
                          backgroundColor: 'var(--theme-glass-100)',
                          color: 'var(--theme-text-secondary)',
                          borderColor: 'var(--theme-border-light)'
                        }}
                      >
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Prompt Improver Modal */}
      <PromptImproverModal
        isOpen={showImproverModal}
        onClose={() => setShowImproverModal(false)}
        originalPrompt={prompt}
        files={files}
        hasExistingApp={hasExistingApp}
        onAccept={(improvedPrompt) => {
          setPrompt(improvedPrompt);
          setShowImproverModal(false);
        }}
      />

      {/* Prompt Level Selection Modal */}
      <PromptLevelModal
        isOpen={showLevelModal}
        onClose={() => setShowLevelModal(false)}
        prompt={selectedLibraryPrompt}
        onSelect={handleLevelSelect}
        defaultLevel={defaultLevel}
        onSetDefaultLevel={setDefaultLevel}
      />
    </>
  );

  // Use portal to render outside of parent DOM hierarchy
  return createPortal(modalContent, document.body);
};
