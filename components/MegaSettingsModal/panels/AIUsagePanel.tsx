import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Zap,
  Clock,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  Calendar,
  Activity,
  Cpu,
  Target,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ConfirmModal } from '../../ContextIndicator/ConfirmModal';
import { SettingsSection } from '../shared';
import {
  getAllRecords,
  getStats,
  clearAllRecords,
  exportRecords,
  importRecords,
  deleteOldRecords,
  formatCost,
} from '../../../services/analyticsStorage';
import type { UsageRecord, UsageStats } from '../../../types';

type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all';

export const AIUsagePanel: React.FC = () => {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    providers: true,
    models: false,
    categories: false,
    timeline: false,
    recent: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const daysCount = timeRange === 'all' ? 365 : parseInt(timeRange);
      const allRecords = await getAllRecords();

      // Filter by time range
      const now = Date.now();
      const rangeMs =
        timeRange === 'all'
          ? Infinity
          : timeRange === '24h'
            ? 24 * 60 * 60 * 1000
            : timeRange === '7d'
              ? 7 * 24 * 60 * 60 * 1000
              : timeRange === '30d'
                ? 30 * 24 * 60 * 60 * 1000
                : 90 * 24 * 60 * 60 * 1000;

      const filtered = allRecords.filter((r) => now - r.timestamp < rangeMs);
      setRecords(filtered);

      const statsData = await getStats(daysCount);
      setStats(statsData);
    } catch (err) {
      console.error('[AIUsagePanel] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleExport = async () => {
    try {
      const data = await exportRecords();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluidflow-ai-usage-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AIUsagePanel] Export failed:', err);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const count = await importRecords(text);
        if (count > 0) {
          loadData();
        }
      } catch (err) {
        console.error('[AIUsagePanel] Import failed:', err);
      }
    };
    input.click();
  };

  const handleClear = async () => {
    await clearAllRecords();
    setShowClearConfirm(false);
    loadData();
  };

  const handlePrune = async () => {
    await deleteOldRecords(90);
    setShowPruneConfirm(false);
    loadData();
  };

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Time range options
  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
  ];

  // Category labels and colors
  const categoryConfig: Record<string, { label: string; color: string }> = {
    generation: { label: 'Code Generation', color: 'blue' },
    'quick-edit': { label: 'Quick Edit', color: 'purple' },
    'auto-fix': { label: 'Auto Fix', color: 'green' },
    'git-commit': { label: 'Git Commit', color: 'amber' },
    'auto-commit': { label: 'Auto Commit', color: 'orange' },
    'prompt-improver': { label: 'Prompt Improver', color: 'pink' },
    accessibility: { label: 'Accessibility', color: 'cyan' },
    other: { label: 'Other', color: 'slate' },
  };

  // Calculate usage chart data (last 7 days)
  const chartData = useMemo(() => {
    if (!stats) return [];
    const days = Object.entries(stats.byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7);
    const maxCost = Math.max(...days.map(([, d]) => d.totalCost), 0.001);
    return days.map(([date, data]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      ...data,
      heightPercent: (data.totalCost / maxCost) * 100,
    }));
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>AI Usage Analytics</h2>
            <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Track token usage, costs, and performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 text-xs rounded-lg focus:outline-none"
            style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
          >
            {timeRangeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="p-2 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--theme-text-muted)' }} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--theme-accent)' }} />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-12 h-12 mb-4" style={{ color: 'var(--theme-text-dim)' }} />
          <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>No Usage Data Yet</h3>
          <p className="text-sm max-w-md" style={{ color: 'var(--theme-text-muted)' }}>
            AI usage will be tracked automatically when you generate code, commit messages, or use other AI features.
          </p>
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <CollapsibleSection
            title="Overview"
            icon={<TrendingUp className="w-4 h-4" />}
            expanded={expandedSections.overview ?? false}
            onToggle={() => toggleSection('overview')}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Cost */}
              <StatCard
                icon={<DollarSign className="w-4 h-4" style={{ color: 'var(--color-success)' }} />}
                label="Total Cost"
                value={formatCost(stats?.totalCost || 0)}
                subValue="estimated"
                color="green"
              />
              {/* Total Tokens */}
              <StatCard
                icon={<Zap className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />}
                label="Total Tokens"
                value={formatNumber(stats?.totalTokens || 0)}
                subValue={`${formatNumber(stats?.totalInputTokens || 0)} in / ${formatNumber(stats?.totalOutputTokens || 0)} out`}
                color="amber"
              />
              {/* Total Requests */}
              <StatCard
                icon={<Activity className="w-4 h-4" style={{ color: 'var(--color-info)' }} />}
                label="Requests"
                value={formatNumber(stats?.totalRequests || 0)}
                subValue={`${stats?.successRate.toFixed(1)}% success`}
                color="blue"
              />
              {/* Avg Duration */}
              <StatCard
                icon={<Clock className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />}
                label="Avg Response"
                value={formatDuration(stats?.avgDuration || 0)}
                subValue="per request"
                color="purple"
              />
            </div>
          </CollapsibleSection>

          {/* Cost Trend Chart */}
          {chartData.length > 0 && (
            <CollapsibleSection
              title="Cost Trend (7 Days)"
              icon={<Calendar className="w-4 h-4" />}
              expanded={expandedSections.timeline ?? false}
              onToggle={() => toggleSection('timeline')}
            >
              <div className="h-40 flex items-end gap-2">
                {chartData.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{formatCost(day.totalCost)}</div>
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${Math.max(day.heightPercent, 4)}%`, background: 'linear-gradient(to top, var(--theme-accent), var(--theme-accent-subtle))' }}
                    />
                    <div className="text-[10px] truncate w-full text-center" style={{ color: 'var(--theme-text-muted)' }}>{day.date.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* By Provider */}
          <CollapsibleSection
            title="By Provider"
            icon={<Cpu className="w-4 h-4" />}
            expanded={expandedSections.providers ?? false}
            onToggle={() => toggleSection('providers')}
            badge={Object.keys(stats?.byProvider || {}).length.toString()}
          >
            <div className="space-y-3">
              {Object.entries(stats?.byProvider || {})
                .sort(([, a], [, b]) => b.totalCost - a.totalCost)
                .map(([provider, data]) => (
                  <ProviderRow
                    key={provider}
                    name={provider}
                    requests={data.requests}
                    tokens={data.inputTokens + data.outputTokens}
                    cost={data.totalCost}
                    avgDuration={data.avgDuration}
                    percentage={(data.totalCost / (stats?.totalCost || 1)) * 100}
                  />
                ))}
            </div>
          </CollapsibleSection>

          {/* By Model */}
          <CollapsibleSection
            title="By Model"
            icon={<Target className="w-4 h-4" />}
            expanded={expandedSections.models ?? false}
            onToggle={() => toggleSection('models')}
            badge={Object.keys(stats?.byModel || {}).length.toString()}
          >
            <div className="space-y-2">
              {Object.entries(stats?.byModel || {})
                .sort(([, a], [, b]) => b.requests - a.requests)
                .map(([model, data]) => (
                  <ModelRow
                    key={model}
                    name={model}
                    provider={data.provider}
                    requests={data.requests}
                    tokens={data.inputTokens + data.outputTokens}
                    cost={data.totalCost}
                  />
                ))}
            </div>
          </CollapsibleSection>

          {/* By Category */}
          <CollapsibleSection
            title="By Category"
            icon={<Activity className="w-4 h-4" />}
            expanded={expandedSections.categories ?? false}
            onToggle={() => toggleSection('categories')}
          >
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats?.byCategory || {})
                .sort(([, a], [, b]) => b.requests - a.requests)
                .map(([category, data]) => {
                  const config = categoryConfig[category] || { label: category, color: 'slate' };
                  return (
                    <CategoryCard
                      key={category}
                      label={config.label}
                      color={config.color}
                      requests={data.requests}
                      tokens={data.inputTokens + data.outputTokens}
                      cost={data.totalCost}
                    />
                  );
                })}
            </div>
          </CollapsibleSection>

          {/* Recent Activity */}
          <CollapsibleSection
            title="Recent Activity"
            icon={<Clock className="w-4 h-4" />}
            expanded={expandedSections.recent ?? false}
            onToggle={() => toggleSection('recent')}
            badge={records.length.toString()}
          >
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {records.slice(0, 20).map((record) => (
                <ActivityRow key={record.id} record={record} />
              ))}
              {records.length > 20 && (
                <div className="text-center text-xs py-2" style={{ color: 'var(--theme-text-muted)' }}>
                  And {records.length - 20} more...
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Data Management */}
          <SettingsSection title="Data Management" description="Export, import, or clear usage data">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}
              >
                <Download className="w-3.5 h-3.5" />
                Export Data
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-muted)' }}
              >
                <Upload className="w-3.5 h-3.5" />
                Import Data
              </button>
              <button
                onClick={() => setShowPruneConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}
              >
                <Clock className="w-3.5 h-3.5" />
                Prune Old (&gt;90d)
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </SettingsSection>
        </>
      )}

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClear}
        title="Clear All Usage Data"
        message="This will permanently delete all AI usage records. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />

      {/* Prune Confirmation Modal */}
      <ConfirmModal
        isOpen={showPruneConfirm}
        onClose={() => setShowPruneConfirm(false)}
        onConfirm={handlePrune}
        title="Prune Old Records"
        message="This will delete all usage records older than 90 days. Recent data will be preserved."
        confirmText="Prune"
        confirmVariant="warning"
      />
    </div>
  );
};

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  expanded,
  onToggle,
  children,
  badge,
}) => (
  <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--theme-text-muted)' }}>{icon}</span>
        <span className="text-sm font-medium" style={{ color: 'var(--theme-text-primary)' }}>{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] rounded" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>
            {badge}
          </span>
        )}
      </div>
      {expanded ? (
        <ChevronDown className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
      ) : (
        <ChevronRight className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
      )}
    </button>
    {expanded && <div className="p-4 pt-0">{children}</div>}
  </div>
);

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color: 'green' | 'amber' | 'blue' | 'purple';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subValue, color }) => {
  const colorMap = {
    green: { bg: 'var(--color-success-subtle)', border: 'var(--color-success-border)' },
    amber: { bg: 'var(--color-warning-subtle)', border: 'var(--color-warning-border)' },
    blue: { bg: 'var(--color-info-subtle)', border: 'var(--color-info-border)' },
    purple: { bg: 'var(--color-feature-subtle)', border: 'var(--color-feature-border)' },
  };

  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: colorMap[color].bg, border: `1px solid ${colorMap[color].border}` }}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>{label}</span>
      </div>
      <div className="text-xl font-semibold" style={{ color: 'var(--theme-text-primary)' }}>{value}</div>
      {subValue && <div className="text-[10px] mt-1" style={{ color: 'var(--theme-text-dim)' }}>{subValue}</div>}
    </div>
  );
};

// Provider Row Component
interface ProviderRowProps {
  name: string;
  requests: number;
  tokens: number;
  cost: number;
  avgDuration: number;
  percentage: number;
}

const ProviderRow: React.FC<ProviderRowProps> = ({ name, requests, tokens, cost, avgDuration, percentage }) => (
  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-300)' }}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
        <span className="font-medium capitalize" style={{ color: 'var(--theme-text-primary)' }}>{name}</span>
      </div>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>{formatCost(cost)}</span>
    </div>
    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
      <span>{requests} requests</span>
      <span>{(tokens / 1000).toFixed(1)}K tokens</span>
      <span>{(avgDuration / 1000).toFixed(1)}s avg</span>
    </div>
    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
      <div
        className="h-full"
        style={{ width: `${Math.min(percentage, 100)}%`, background: 'linear-gradient(to right, var(--theme-accent), var(--color-feature))' }}
      />
    </div>
  </div>
);

// Model Row Component
interface ModelRowProps {
  name: string;
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
}

const ModelRow: React.FC<ModelRowProps> = ({ name, provider, requests, tokens, cost }) => (
  <div className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Target className="w-3 h-3 shrink-0" style={{ color: 'var(--theme-text-dim)' }} />
      <div className="min-w-0">
        <div className="text-sm truncate" style={{ color: 'var(--theme-text-primary)' }}>{name.split('/').pop()}</div>
        <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{provider}</div>
      </div>
    </div>
    <div className="flex items-center gap-4 text-xs">
      <span style={{ color: 'var(--theme-text-muted)' }}>{requests} req</span>
      <span style={{ color: 'var(--theme-text-muted)' }}>{(tokens / 1000).toFixed(1)}K</span>
      <span className="font-medium" style={{ color: 'var(--color-success)' }}>{formatCost(cost)}</span>
    </div>
  </div>
);

// Category Card Component
interface CategoryCardProps {
  label: string;
  color: string;
  requests: number;
  tokens: number;
  cost: number;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ label, color, requests, tokens, cost }) => {
  const colorMap: Record<string, { border: string; text: string }> = {
    blue: { border: 'var(--color-info-border)', text: 'var(--color-info)' },
    purple: { border: 'var(--color-feature-border)', text: 'var(--color-feature)' },
    green: { border: 'var(--color-success-border)', text: 'var(--color-success)' },
    amber: { border: 'var(--color-warning-border)', text: 'var(--color-warning)' },
    orange: { border: 'var(--color-warning-border)', text: 'var(--color-warning)' },
    pink: { border: 'var(--color-feature-border)', text: 'var(--color-feature)' },
    cyan: { border: 'var(--color-info-border)', text: 'var(--color-info)' },
    slate: { border: 'var(--theme-border-light)', text: 'var(--theme-text-muted)' },
  };
  const defaultColors = { border: 'var(--theme-border-light)', text: 'var(--theme-text-muted)' };
  const colors = colorMap[color] ?? defaultColors;

  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: `1px solid ${colors.border}`, color: colors.text }}>
      <div className="text-sm font-medium mb-1" style={{ color: 'var(--theme-text-primary)' }}>{label}</div>
      <div className="flex items-center gap-2 text-xs">
        <span>{requests} req</span>
        <span style={{ color: 'var(--theme-text-dim)' }}>|</span>
        <span>{(tokens / 1000).toFixed(1)}K tok</span>
        <span style={{ color: 'var(--theme-text-dim)' }}>|</span>
        <span style={{ color: 'var(--color-success)' }}>{formatCost(cost)}</span>
      </div>
    </div>
  );
};

// Activity Row Component
interface ActivityRowProps {
  record: UsageRecord;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ record }) => {
  const timeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
      {record.success ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-success)' }} />
      ) : (
        <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-error)' }} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs truncate" style={{ color: 'var(--theme-text-primary)' }}>{record.model.split('/').pop()}</span>
          <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{record.category}</span>
        </div>
        <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
          {record.totalTokens.toLocaleString()} tokens {record.isEstimated && '(est)'}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs" style={{ color: 'var(--color-success)' }}>{formatCost(record.totalCost)}</div>
        <div className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{timeAgo(record.timestamp)}</div>
      </div>
    </div>
  );
};

export default AIUsagePanel;
