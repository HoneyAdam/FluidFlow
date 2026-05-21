import React, { useState, useEffect, useMemo } from 'react';
import {
  Info,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wrench,
  Bug,
  Trash2,
  Shield,
  AlertTriangle,
  Heart,
  Zap,
} from 'lucide-react';
import { Github } from '../../icons/BrandIcons';
import { SettingsSection } from '../shared';
import {
  APP_VERSION,
  APP_NAME,
  getVersionInfo,
  checkForUpdatesWithCache,
  clearUpdateCache,
  parseChangelog,
  getSectionStyle,
  type UpdateCheckResult,
  type ChangelogEntry,
} from '../../../services/version';

// Import changelog content
import changelogContent from '../../../CHANGELOG.md?raw';

export const AboutPanel: React.FC = () => {
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set([APP_VERSION]));

  const versionInfo = getVersionInfo();

  // Parse changelog
  const changelog = useMemo(() => parseChangelog(changelogContent), []);

  // Check for updates on mount (FIX-11: mounted guard + catch)
  useEffect(() => {
    let mounted = true;
    checkForUpdatesWithCache()
      .then(result => { if (mounted) setUpdateCheck(result); })
      .catch(err => console.warn('[AboutPanel] Update check failed:', err));
    return () => { mounted = false; };
  }, []);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    clearUpdateCache();
    try {
      const result = await checkForUpdatesWithCache();
      setUpdateCheck(result);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const toggleVersion = (version: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  };

  const getSectionIcon = (type: ChangelogEntry['sections'][0]['type']) => {
    switch (type) {
      case 'added':
        return Sparkles;
      case 'changed':
        return Wrench;
      case 'fixed':
        return Bug;
      case 'removed':
        return Trash2;
      case 'security':
        return Shield;
      case 'deprecated':
        return AlertTriangle;
      default:
        return Info;
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-accent-subtle)' }}>
          <Zap className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>About {APP_NAME}</h2>
          <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Version info, updates, and changelog</p>
        </div>
      </div>

      {/* App Info Card */}
      <div className="relative overflow-hidden rounded-xl" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom right, var(--theme-accent-subtle), var(--theme-ai-accent-subtle))' }} />
        <div className="relative p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(to bottom right, var(--theme-accent), var(--theme-ai-accent))' }}>
                <Zap className="w-8 h-8" style={{ color: 'var(--theme-text-on-accent)' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{APP_NAME}</h3>
                <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Sketch-to-App Prototyping Tool</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}>
                    v{versionInfo.version}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                    Build: {versionInfo.buildDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4 mt-6 pt-4" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
            <a
              href="https://github.com/ersinkoc/FluidFlow"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Github className="w-4 h-4" />
              GitHub
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://github.com/ersinkoc/FluidFlow/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Bug className="w-4 h-4" />
              Report Issue
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://github.com/sponsors/ersinkoc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Heart className="w-4 h-4" />
              Sponsor
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Update Check */}
      <SettingsSection title="Updates" description="Check for new versions">
        <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
          <div className="flex items-center gap-3">
            {updateCheck?.hasUpdate ? (
              <ArrowUpCircle className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
            ) : updateCheck?.error ? (
              <AlertCircle className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
            ) : (
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
            )}
            <div>
              {updateCheck?.hasUpdate ? (
                <>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
                    Update available: v{updateCheck.latestVersion}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                    Current: v{updateCheck.currentVersion}
                  </div>
                </>
              ) : updateCheck?.error ? (
                <>
                  <div className="text-sm" style={{ color: 'var(--color-warning)' }}>Unable to check for updates</div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>{updateCheck.error}</div>
                </>
              ) : updateCheck ? (
                <>
                  <div className="text-sm" style={{ color: 'var(--theme-text-primary)' }}>You're up to date</div>
                  <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>v{updateCheck.currentVersion}</div>
                </>
              ) : (
                <>
                  <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Checking for updates...</div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {updateCheck?.hasUpdate && updateCheck.latestRelease && (
              <a
                href={updateCheck.latestRelease.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ color: 'var(--color-success)' }}
              >
                View Release
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              {isCheckingUpdate ? 'Checking...' : 'Check Now'}
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Changelog */}
      <SettingsSection
        title="Changelog"
        description={`${changelog.length} releases`}
      >
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {changelog.map((entry) => {
            const isExpanded = expandedVersions.has(entry.version);
            const isCurrent = entry.version === APP_VERSION;

            return (
              <div
                key={entry.version}
                className="rounded-lg overflow-hidden transition-colors"
                style={{
                  border: isCurrent ? '1px solid var(--theme-accent-muted)' : '1px solid var(--theme-border-light)',
                  backgroundColor: isCurrent ? 'var(--theme-accent-subtle)' : 'var(--theme-glass-100)'
                }}
              >
                <button
                  onClick={() => toggleVersion(entry.version)}
                  className="w-full flex items-center gap-2 px-4 py-3 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  ) : (
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                  )}
                  <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>v{entry.version}</span>
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded" style={{ backgroundColor: 'var(--theme-accent-subtle)', color: 'var(--theme-accent)' }}>
                      Current
                    </span>
                  )}
                  {entry.date && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-dim)' }}>{entry.date}</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {entry.sections.map((section, sIdx) => {
                      const style = getSectionStyle(section.type);
                      const Icon = getSectionIcon(section.type);

                      return (
                        <div key={sIdx}>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
                              style={{ backgroundColor: style.bgColor, color: style.color }}
                            >
                              <Icon className="w-3 h-3" />
                              {style.label}
                            </span>
                          </div>
                          <ul className="space-y-1 ml-4">
                            {section.items.map((item, iIdx) => (
                              <li
                                key={iIdx}
                                className="text-xs flex items-start gap-2"
                                style={{ color: 'var(--theme-text-muted)' }}
                              >
                                <span className="mt-1" style={{ color: 'var(--theme-text-dim)' }}>•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* Credits */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
        <div className="flex items-center gap-3">
          <Heart className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
          <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            Made with <span style={{ color: 'var(--color-error)' }}>love</span> by{' '}
            <a
              href="https://github.com/ersinkoc"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--theme-accent)' }}
            >
              Ersin Koc
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPanel;
