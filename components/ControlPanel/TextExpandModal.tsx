/**
 * TextExpandModal - Modal for viewing full prompt/explanation text
 *
 * Features:
 * - Copy button with feedback
 * - Markdown rendering for explanations
 * - Portal to body for proper z-index
 * - ESC to close
 *
 * Security: Uses DOMPurify to sanitize all HTML content before rendering
 */
import React, { useEffect } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';
import DOMPurify from 'dompurify';
import { escapeHtml } from '../../utils/renderMarkdown';

interface TextExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  type: 'prompt' | 'explanation';
}

// Simple markdown renderer (same as ChatPanel) - FIX-17: escapeHtml consolidated
const renderMarkdown = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';

  lines.forEach((line, idx) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${idx}`} className="rounded-lg p-3 my-2 overflow-x-auto text-xs" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>
            <code style={{ color: 'var(--theme-text-secondary)' }}>{codeContent.trim()}</code>
          </pre>
        );
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={idx} className="text-sm font-semibold mt-3 mb-1" style={{ color: 'var(--theme-text-secondary)' }}>{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={idx} className="text-base font-semibold mt-4 mb-2" style={{ color: 'var(--theme-text-primary)' }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={idx} className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--theme-text-primary)' }}>{line.slice(2)}</h2>);
    }
    // Lists
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={idx} className="text-sm ml-4 list-disc" style={{ color: 'var(--theme-text-secondary)' }}>{line.slice(2)}</li>
      );
    }
    // Bold and inline code - SECURITY: Content is escaped first, then sanitized with DOMPurify
    else if (line.trim()) {
      const escaped = escapeHtml(line);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--theme-text-primary)">$1</strong>')
        .replace(/`(.+?)`/g, '<code style="background-color: var(--theme-glass-300); padding: 0 4px; border-radius: 4px; color: var(--color-info)">$1</code>');
      // DOMPurify sanitizes to prevent XSS - only allows safe tags/attrs
      const sanitized = DOMPurify.sanitize(formatted, {
        ALLOWED_TAGS: ['strong', 'code'],
        ALLOWED_ATTR: ['class', 'style']
      });
      elements.push(
        <p key={idx} className="text-sm my-1" style={{ color: 'var(--theme-text-secondary)' }}>
          <span dangerouslySetInnerHTML={{ __html: sanitized }} />
        </p>
      );
    } else {
      elements.push(<div key={idx} className="h-2" />);
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
};

export const TextExpandModal: React.FC<TextExpandModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  type
}) => {
  const { isCopied: copied, copy } = useCopyToClipboard();

  // Handle ESC key
  useEffect((): (() => void) | undefined => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopy = () => {
    copy(content);
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] backdrop-blur-sm"
        style={{ backgroundColor: 'var(--theme-overlay)' }}
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
        <div className="w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col pointer-events-auto" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--theme-border)' }}>
            <h3 className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>{title}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors"
                style={{ color: copied ? 'var(--color-success)' : 'var(--theme-text-muted)' }}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0">
            {type === 'explanation' ? (
              <div className="prose prose-invert prose-sm max-w-none">
                {renderMarkdown(content)}
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--theme-text-secondary)' }}>{content}</p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default TextExpandModal;
