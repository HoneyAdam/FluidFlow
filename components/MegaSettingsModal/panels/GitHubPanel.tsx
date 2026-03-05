import React, { useState, useEffect, useRef } from 'react';
import { ERROR_DISPLAY_DURATION_MS } from '../../../constants/timing';
import { Github, Check, Info, Loader2, CloudUpload, Eye, EyeOff, FileJson, MessageSquare, Shield, ExternalLink } from 'lucide-react';
import { SettingsSection } from '../shared';
import { SettingsToggle } from '../shared/SettingsToggle';
import { settingsApi } from '../../../services/api/settings';
import type { GitHubBackupSettings, GitHubPushSettings } from '../../../services/api/types';

const GITHUB_PUSH_SETTINGS_KEY = 'fluidflow_github_push_settings';

const DEFAULT_PUSH_SETTINGS: GitHubPushSettings = {
  includeProjectMetadata: true,
  includeConversationHistory: false,
  defaultPrivate: true,
};

export const GitHubPanel: React.FC = () => {
  // GitHub Backup settings
  const [backupSettings, setBackupSettings] = useState<GitHubBackupSettings>({
    enabled: false,
    branchName: 'backup/auto',
  });
  const [backupToken, setBackupToken] = useState('');
  const [showBackupToken, setShowBackupToken] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // FIX-16: Timeout ref for cleanup
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Push settings (stored in localStorage)
  const [pushSettings, setPushSettings] = useState<GitHubPushSettings>(DEFAULT_PUSH_SETTINGS);

  useEffect(() => {
    // Load GitHub Backup settings from server
    settingsApi.getGitHubBackup().then((settings) => {
      setBackupSettings(settings);
      if (settings.token) {
        setBackupToken(settings.token);
      }
    }).catch(console.error);

    // Load push settings from localStorage
    try {
      const saved = localStorage.getItem(GITHUB_PUSH_SETTINGS_KEY);
      if (saved) {
        setPushSettings({ ...DEFAULT_PUSH_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (err) {
      console.error('Failed to load push settings:', err);
    }

    // FIX-16: Cleanup timeout on unmount
    return () => clearTimeout(messageTimeoutRef.current);
  }, []);

  // GitHub Backup handlers
  const handleBackupSettingChange = async (key: keyof GitHubBackupSettings, value: boolean | string) => {
    setBackupSaving(true);
    setBackupMessage(null);

    try {
      const updates: Partial<GitHubBackupSettings> = { [key]: value };
      await settingsApi.saveGitHubBackup(updates);
      setBackupSettings(prev => ({ ...prev, [key]: value }));
      setBackupMessage({ type: 'success', text: 'Saved!' });
      messageTimeoutRef.current = setTimeout(() => setBackupMessage(null), 2000);
    } catch (err) {
      console.error('Failed to save backup settings:', err);
      setBackupMessage({ type: 'error', text: 'Failed to save' });
      messageTimeoutRef.current = setTimeout(() => setBackupMessage(null), ERROR_DISPLAY_DURATION_MS);
    } finally {
      setBackupSaving(false);
    }
  };

  const handleSaveBackupToken = async () => {
    if (!backupToken || backupToken.includes('****')) {
      return; // Don't save masked tokens
    }

    setBackupSaving(true);
    setBackupMessage(null);

    try {
      await settingsApi.saveGitHubBackup({ token: backupToken });
      setBackupMessage({ type: 'success', text: 'Token saved!' });
      messageTimeoutRef.current = setTimeout(() => setBackupMessage(null), 2000);
    } catch (err) {
      console.error('Failed to save token:', err);
      setBackupMessage({ type: 'error', text: 'Failed to save token' });
      messageTimeoutRef.current = setTimeout(() => setBackupMessage(null), ERROR_DISPLAY_DURATION_MS);
    } finally {
      setBackupSaving(false);
    }
  };

  // Push settings handlers
  const handlePushSettingChange = (key: keyof GitHubPushSettings, value: boolean) => {
    const newSettings = { ...pushSettings, [key]: value };
    setPushSettings(newSettings);
    localStorage.setItem(GITHUB_PUSH_SETTINGS_KEY, JSON.stringify(newSettings));
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
          <Github className="w-5 h-5" style={{ color: 'var(--theme-text-primary)' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>GitHub Integration</h2>
          <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Configure GitHub sync, backup, and push settings</p>
        </div>
      </div>

      {/* Push Defaults */}
      <SettingsSection
        title="Push Defaults"
        description="Default settings when pushing projects to GitHub"
      >
        {/* Info Box */}
        <div className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)' }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-info)' }} />
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            These settings control what metadata is included when pushing to GitHub.
            The <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>.fluidflow/</code> folder
            in your repo stores project metadata for portability between devices.
          </div>
        </div>

        <div className="space-y-4">
          {/* Include Project Metadata */}
          <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
              <FileJson className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
            </div>
            <div className="flex-1">
              <SettingsToggle
                label="Include Project Metadata"
                description="Always include project.json with name, description, and settings"
                checked={pushSettings.includeProjectMetadata}
                onChange={(checked) => handlePushSettingChange('includeProjectMetadata', checked)}
              />
              <p className="text-[10px] mt-2" style={{ color: 'var(--theme-text-muted)' }}>
                Recommended: Enables project restoration when importing from GitHub
              </p>
            </div>
          </div>

          {/* Include Conversation History */}
          <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div className="flex-1">
              <SettingsToggle
                label="Include Conversation History"
                description="Include AI chat history (context.json) when pushing"
                checked={pushSettings.includeConversationHistory}
                onChange={(checked) => handlePushSettingChange('includeConversationHistory', checked)}
              />
              <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: 'var(--color-warning)' }}>
                <Shield className="w-3 h-3" />
                <span>Privacy note: Only enable for private repos or if you're okay sharing chat history</span>
              </div>
            </div>
          </div>

          {/* Default Visibility */}
          <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
              <Shield className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
            </div>
            <div className="flex-1">
              <SettingsToggle
                label="Default to Private Repos"
                description="Create new repositories as private by default"
                checked={pushSettings.defaultPrivate}
                onChange={(checked) => handlePushSettingChange('defaultPrivate', checked)}
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* GitHub Auto-Backup Settings */}
      <SettingsSection
        title="Auto-Backup"
        description="Automatically push commits to a backup branch on GitHub"
      >
        {/* Info Box */}
        <div className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
          <CloudUpload className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--theme-text-muted)' }} />
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            When enabled, every auto-commit will also be pushed to a backup branch on GitHub.
            This provides an automatic off-site backup of your work. Requires a GitHub token with
            <code className="px-1 py-0.5 rounded mx-1" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)' }}>repo</code>
            scope and a remote origin configured.
          </div>
        </div>

        <div className="space-y-4">
          {/* Enable Toggle */}
          <SettingsToggle
            label="Enable Auto-Backup"
            description="Push to backup branch after each auto-commit"
            checked={backupSettings.enabled}
            onChange={(checked) => handleBackupSettingChange('enabled', checked)}
          />

          {/* Branch Name */}
          <div className="space-y-1.5">
            <label className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>Backup Branch Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={backupSettings.branchName}
                onChange={(e) => setBackupSettings(prev => ({ ...prev, branchName: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== backupSettings.branchName) {
                    handleBackupSettingChange('branchName', e.target.value);
                  }
                }}
                placeholder="backup/auto"
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Branch where backups will be pushed (e.g., backup/auto)</p>
          </div>

          {/* Token */}
          <div className="space-y-1.5">
            <label className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>GitHub Token (PAT)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showBackupToken ? 'text' : 'password'}
                  value={backupToken}
                  onChange={(e) => setBackupToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="w-full px-3 py-2 pr-10 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowBackupToken(!showBackupToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  {showBackupToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleSaveBackupToken}
                disabled={backupSaving || !backupToken || backupToken.includes('****')}
                className="px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm rounded-lg transition-colors flex items-center gap-2"
                style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-text-on-accent)' }}
              >
                {backupSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                Save
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
              Personal Access Token with <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-surface-dark)' }}>repo</code> scope.{' '}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=FluidFlow%20Auto-Backup"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline inline-flex items-center gap-1"
                style={{ color: 'var(--color-info)' }}
              >
                Create token <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Status Message */}
          {backupMessage && (
            <div
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                backgroundColor: backupMessage.type === 'success' ? 'var(--color-success-subtle)' : 'var(--color-error-subtle)',
                color: backupMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)'
              }}
            >
              {backupMessage.text}
            </div>
          )}

          {/* Last Backup Info */}
          {backupSettings.lastBackupAt && (
            <div className="text-xs flex items-center gap-2" style={{ color: 'var(--theme-text-muted)' }}>
              <Check className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
              Last backup: {new Date(backupSettings.lastBackupAt).toLocaleString()}
              {backupSettings.lastBackupCommit && (
                <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-muted)' }}>
                  {backupSettings.lastBackupCommit}
                </code>
              )}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
};

export default GitHubPanel;
