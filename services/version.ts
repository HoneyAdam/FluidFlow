/**
 * Version Service
 *
 * Handles version checking, update notifications, and changelog parsing.
 * Checks GitHub releases for updates and manages version state.
 */

// Current app version - synced with package.json
export const APP_VERSION = '0.9.0';
export const APP_NAME = 'FluidFlow';

// GitHub repository info for update checking
const GITHUB_OWNER = 'ersinkoc';
const GITHUB_REPO = 'FluidFlow';

export interface VersionInfo {
  version: string;
  name: string;
  buildDate: string;
  commitHash?: string;
}

export interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  isPrerelease: boolean;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  latestRelease?: ReleaseInfo;
  error?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    type: 'added' | 'changed' | 'fixed' | 'removed' | 'security' | 'deprecated';
    items: string[];
  }[];
}

/**
 * Get current version info
 */
export function getVersionInfo(): VersionInfo {
  return {
    version: APP_VERSION,
    name: APP_NAME,
    buildDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Parse semantic version string
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (!vA || !vB) return 0;

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1;
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1;
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1;

  return 0;
}

/**
 * Check for updates from GitHub releases
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    // 10s timeout — update check should not hang the UI on GitHub outages.
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          hasUpdate: false,
          currentVersion: APP_VERSION,
          error: 'No releases found',
        };
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');

    const latestRelease: ReleaseInfo = {
      version: latestVersion,
      name: release.name || `v${latestVersion}`,
      body: release.body || '',
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      isPrerelease: release.prerelease,
    };

    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      latestRelease,
    };
  } catch (error) {
    console.error('[Version] Update check failed:', error);
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse CHANGELOG.md content into structured entries
 */
export function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = content.split('\n');

  let currentEntry: ChangelogEntry | null = null;
  let currentSection: { type: ChangelogEntry['sections'][0]['type']; items: string[] } | null = null;

  const sectionTypes: Record<string, ChangelogEntry['sections'][0]['type']> = {
    added: 'added',
    changed: 'changed',
    fixed: 'fixed',
    removed: 'removed',
    security: 'security',
    deprecated: 'deprecated',
  };

  for (const line of lines) {
    // Version header: ## [0.5.0] - 2025-12-25
    const versionMatch = line.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?\s*-?\s*(.+)?$/);
    if (versionMatch) {
      if (currentEntry) {
        if (currentSection && currentSection.items.length > 0) {
          currentEntry.sections.push(currentSection);
        }
        entries.push(currentEntry);
      }
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[2]?.trim() || '',
        sections: [],
      };
      currentSection = null;
      continue;
    }

    // Section header: ### Added, ### Fixed, etc.
    const sectionMatch = line.match(/^###\s+(\w+)/i);
    if (sectionMatch && currentEntry) {
      if (currentSection && currentSection.items.length > 0) {
        currentEntry.sections.push(currentSection);
      }
      const type = sectionTypes[sectionMatch[1].toLowerCase()];
      if (type) {
        currentSection = { type, items: [] };
      } else {
        currentSection = null;
      }
      continue;
    }

    // List item: - Some change
    const itemMatch = line.match(/^[-*]\s+(.+)$/);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1].trim());
    }
  }

  // Don't forget the last entry
  if (currentEntry) {
    if (currentSection && currentSection.items.length > 0) {
      currentEntry.sections.push(currentSection);
    }
    entries.push(currentEntry);
  }

  return entries;
}

/**
 * Get section style based on type - returns CSS variable values for theming
 */
export function getSectionStyle(type: ChangelogEntry['sections'][0]['type']): {
  color: string;
  bgColor: string;
  label: string;
} {
  switch (type) {
    case 'added':
      return { color: 'var(--color-success)', bgColor: 'var(--color-success-subtle)', label: 'Added' };
    case 'changed':
      return { color: 'var(--color-info)', bgColor: 'var(--color-info-subtle)', label: 'Changed' };
    case 'fixed':
      return { color: 'var(--color-warning)', bgColor: 'var(--color-warning-subtle)', label: 'Fixed' };
    case 'removed':
      return { color: 'var(--color-error)', bgColor: 'var(--color-error-subtle)', label: 'Removed' };
    case 'security':
      return { color: 'var(--color-feature)', bgColor: 'var(--color-feature-subtle)', label: 'Security' };
    case 'deprecated':
      return { color: 'var(--theme-text-muted)', bgColor: 'var(--theme-glass-200)', label: 'Deprecated' };
    default:
      return { color: 'var(--theme-text-muted)', bgColor: 'var(--theme-glass-200)', label: type };
  }
}

// Storage key for caching update check
const UPDATE_CHECK_CACHE_KEY = 'fluidflow_update_check';
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 6; // 6 hours

interface CachedUpdateCheck {
  result: UpdateCheckResult;
  timestamp: number;
}

/**
 * Check for updates with caching
 */
export async function checkForUpdatesWithCache(): Promise<UpdateCheckResult> {
  try {
    const cached = localStorage.getItem(UPDATE_CHECK_CACHE_KEY);
    if (cached) {
      const { result, timestamp }: CachedUpdateCheck = JSON.parse(cached);
      if (Date.now() - timestamp < UPDATE_CHECK_INTERVAL) {
        return result;
      }
    }
  } catch {
    // Ignore cache errors
  }

  const result = await checkForUpdates();

  try {
    localStorage.setItem(
      UPDATE_CHECK_CACHE_KEY,
      JSON.stringify({ result, timestamp: Date.now() })
    );
  } catch {
    // Ignore cache errors
  }

  return result;
}

/**
 * Clear update check cache (force re-check)
 */
export function clearUpdateCache(): void {
  try {
    localStorage.removeItem(UPDATE_CHECK_CACHE_KEY);
  } catch {
    // Ignore
  }
}
