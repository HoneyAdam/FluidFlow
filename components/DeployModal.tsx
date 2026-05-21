import React, { useState } from 'react';
import { COPY_FEEDBACK_RESET_MS } from '../constants/timing';
import { Rocket, Copy, Check, ExternalLink, Terminal } from 'lucide-react';
import { Github } from './icons/BrandIcons';
import { FileSystem } from '../types';
import { BaseModal } from './shared/BaseModal';

interface DeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

export const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onClose, files: _files }) => {
  const [activeTab, setActiveTab] = useState<'vercel' | 'netlify' | 'manual'>('vercel');
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), COPY_FEEDBACK_RESET_MS);
  };

  // Generate package.json content
  const packageJson = JSON.stringify({
    name: "fluidflow-app",
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "lucide-react": "^0.263.1"
    },
    devDependencies: {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.0.0",
      "autoprefixer": "^10.4.14",
      "postcss": "^8.4.24",
      "tailwindcss": "^3.3.0",
      "typescript": "^5.0.0",
      "vite": "^4.4.0"
    }
  }, null, 2);

  // Vercel CLI commands
  const vercelCommands = `# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project directory)
vercel

# Deploy to production
vercel --prod`;

  // Netlify CLI commands
  const netlifyCommands = `# Install Netlify CLI
npm i -g netlify-cli

# Login to Netlify
netlify login

# Build and deploy
npm run build
netlify deploy --prod --dir=dist`;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Deploy Your App"
      icon={<Rocket className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />}
      iconBg="var(--color-feature-subtle)"
      size="md"
      zIndex="z-[150]"
      footer={
        <p className="text-[10px] text-center w-full" style={{ color: 'var(--theme-text-dim)' }}>
          First, export your project as ZIP or push to GitHub, then follow the deployment steps above.
        </p>
      }
    >
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          {[
            { id: 'vercel', label: 'Vercel', icon: '▲' },
            { id: 'netlify', label: 'Netlify', icon: '◆' },
            { id: 'manual', label: 'Manual', icon: '⚡' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab.id ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
                backgroundColor: activeTab === tab.id ? 'var(--theme-glass-100)' : 'transparent',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-info)' : '2px solid transparent'
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'vercel' && (
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                  <Terminal className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                  Deploy with Vercel CLI
                </h3>
                <div className="relative">
                  <pre className="rounded p-3 text-xs overflow-x-auto" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>
                    {vercelCommands}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(vercelCommands, 'vercel')}
                    className="absolute top-2 right-2 p-1.5 rounded transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-300)' }}
                  >
                    {copied === 'vercel' ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />}
                  </button>
                </div>
              </div>

              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                  <Github className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
                  Or Deploy via GitHub
                </h3>
                <ol className="text-sm space-y-2 list-decimal list-inside" style={{ color: 'var(--theme-text-muted)' }}>
                  <li>Push your project to GitHub</li>
                  <li>Go to <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1" style={{ color: 'var(--color-info)' }}>vercel.com/new <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Import your repository</li>
                  <li>Vercel will auto-detect Vite and deploy</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'netlify' && (
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                  <Terminal className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                  Deploy with Netlify CLI
                </h3>
                <div className="relative">
                  <pre className="rounded p-3 text-xs overflow-x-auto" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>
                    {netlifyCommands}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(netlifyCommands, 'netlify')}
                    className="absolute top-2 right-2 p-1.5 rounded transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-300)' }}
                  >
                    {copied === 'netlify' ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />}
                  </button>
                </div>
              </div>

              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>Drag & Drop Deploy</h3>
                <p className="text-sm mb-3" style={{ color: 'var(--theme-text-muted)' }}>
                  You can also drag and drop your <code className="px-1 rounded" style={{ backgroundColor: 'var(--theme-glass-300)' }}>dist</code> folder directly to Netlify.
                </p>
                <a
                  href="https://app.netlify.com/drop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--color-success)', color: 'var(--theme-text-primary)' }}
                >
                  Open Netlify Drop
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>Required Files</h3>
                <p className="text-sm mb-3" style={{ color: 'var(--theme-text-muted)' }}>
                  Make sure your project includes these configuration files:
                </p>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs mb-1 font-mono" style={{ color: 'var(--theme-text-dim)' }}>package.json</p>
                    <div className="relative">
                      <pre className="rounded p-2 text-[10px] overflow-x-auto max-h-32" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>
                        {packageJson}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(packageJson, 'package')}
                        className="absolute top-1 right-1 p-1 rounded transition-colors"
                        style={{ backgroundColor: 'var(--theme-glass-300)' }}
                      >
                        {copied === 'package' ? <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3 h-3" style={{ color: 'var(--theme-text-muted)' }} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>Build Commands</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Install</p>
                    <code className="block rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>npm install</code>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Build</p>
                    <code className="block rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>npm run build</code>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Output Dir</p>
                    <code className="block rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>dist</code>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Framework</p>
                    <code className="block rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>Vite + React</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

    </BaseModal>
  );
};
