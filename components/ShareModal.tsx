import React, { useState, useEffect, useCallback } from 'react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { Link2, Copy, Check, Mail, Loader2 } from 'lucide-react';
import { Twitter, Linkedin } from './icons/BrandIcons';
import { FileSystem } from '../types';
import { BaseModal, ModalContent } from './shared/BaseModal';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

// UTF-8 safe base64 encoding (replaces deprecated escape/unescape)
function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

// Simple compression using LZ-based encoding
function compressString(str: string): string {
  try {
    // Convert to base64 and URL-safe encode
    const base64 = utf8ToBase64(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, files }) => {
  const [shareUrl, setShareUrl] = useState('');
  const { isCopied: copied, copy } = useCopyToClipboard();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateShareUrl = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Compress files to JSON
      const filesJson = JSON.stringify(files);

      // Check size limit (URLs have practical limits ~2000 chars for most browsers)
      if (filesJson.length > 50000) {
        setError('Project too large to share via URL. Please use GitHub export instead.');
        setShareUrl('');
        return;
      }

      const compressed = compressString(filesJson);
      const baseUrl = window.location.origin + window.location.pathname;
      const url = `${baseUrl}?project=${compressed}`;

      if (url.length > 8000) {
        setError('Project too large for URL sharing. Consider using GitHub export.');
        setShareUrl('');
      } else {
        setShareUrl(url);
      }
    } catch (_err) {
      setError('Failed to generate share URL');
      setShareUrl('');
    } finally {
      setIsGenerating(false);
    }
  }, [files]);

  useEffect(() => {
    if (isOpen) {
      generateShareUrl();
    }
  }, [isOpen, generateShareUrl]);

  const copyToClipboard = () => {
    if (!shareUrl) return;
    copy(shareUrl);
  };

  const shareVia = (platform: 'twitter' | 'linkedin' | 'email') => {
    const text = 'Check out this React app I built with FluidFlow!';
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);

    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      email: `mailto:?subject=${encodeURIComponent('Check out my FluidFlow app')}&body=${encodedText}%0A%0A${encodedUrl}`,
    };

    window.open(urls[platform], '_blank');
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Project"
      icon={<Link2 className="w-5 h-5" style={{ color: 'var(--color-success)' }} />}
      iconBg="var(--color-success-subtle)"
      size="md"
      zIndex="z-[150]"
      footer={
        <p className="text-[10px] text-center w-full" style={{ color: 'var(--theme-text-dim)' }}>
          Project data is encoded in the URL. No server storage required.
        </p>
      }
    >
      <ModalContent className="space-y-4">
        {isGenerating ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-info)' }} />
            <span className="ml-2" style={{ color: 'var(--theme-text-muted)' }}>Generating share link...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--theme-text-dim)' }}>
              Tip: Use "Push to GitHub" for larger projects.
            </p>
          </div>
        ) : (
          <>
            {/* Share URL */}
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--theme-text-dim)' }}>Share Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-secondary)' }}
                />
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
                  style={{
                    backgroundColor: copied ? 'var(--color-success)' : 'var(--color-info)',
                    color: 'var(--theme-text-primary)'
                  }}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--theme-text-dim)' }}>
                Anyone with this link can view and edit a copy of your project.
              </p>
            </div>

            {/* Social Share */}
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--theme-text-dim)' }}>Share via</label>
              <div className="flex gap-2">
                <button
                  onClick={() => shareVia('twitter')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                >
                  <Twitter className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                  Twitter
                </button>
                <button
                  onClick={() => shareVia('linkedin')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                >
                  <Linkedin className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                  LinkedIn
                </button>
                <button
                  onClick={() => shareVia('email')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                >
                  <Mail className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  Email
                </button>
              </div>
            </div>

            {/* Project Stats */}
            <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--theme-text-dim)' }}>Files included:</span>
                <span style={{ color: 'var(--theme-text-secondary)' }}>{Object.keys(files).length}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span style={{ color: 'var(--theme-text-dim)' }}>URL length:</span>
                <span style={{ color: shareUrl.length > 2000 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {shareUrl.length.toLocaleString()} chars
                </span>
              </div>
            </div>
          </>
        )}
      </ModalContent>
    </BaseModal>
  );
};
