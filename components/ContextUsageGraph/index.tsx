/**
 * Context Usage Graph Component
 *
 * Visualizes token usage over time with a sparkline chart
 */

import React, { useMemo } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { UsageGraphProps } from './types';

export const ContextUsageGraph: React.FC<UsageGraphProps> = ({
  data,
  height = 60,
  showLabels = true,
  className = '',
}) => {
  const { path, maxTokensInPeriod, minTokensInPeriod } = useMemo(() => {
    if (data.snapshots.length < 2) {
      return { path: '', maxTokensInPeriod: data.currentTokens, minTokensInPeriod: 0 };
    }

    const sortedSnapshots = [...data.snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const maxTokens = Math.max(...sortedSnapshots.map(s => s.tokens));
    const minTokens = Math.min(...sortedSnapshots.map(s => s.tokens));
    const range = maxTokens - minTokens || 1;

    // Build SVG path
    const width = 100; // Use percentages
    const step = width / (sortedSnapshots.length - 1);

    let path = '';
    sortedSnapshots.forEach((snapshot, index) => {
      const x = index * step;
      const y = 100 - ((snapshot.tokens - minTokens) / range) * 100; // Invert Y (SVG coords)
      path += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    return {
      path,
      maxTokensInPeriod: maxTokens,
      minTokensInPeriod: minTokens,
    };
  }, [data]);

  const usagePercent = (data.currentTokens / data.maxTokens) * 100;
  const firstSnapshot = data.snapshots[0];
  const trend = data.snapshots.length >= 2 && firstSnapshot
    ? data.currentTokens - firstSnapshot.tokens
    : 0;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Mini sparkline chart */}
      <div className="flex-shrink-0" style={{ width: '120px', height: `${height}px` }}>
        {data.snapshots.length >= 2 ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Grid lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke="var(--theme-border-light)" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="var(--theme-border-light)" strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="var(--theme-border-light)" strokeWidth="0.5" />

            {/* Area fill */}
            <path
              d={`${path} L 100 100 L 0 100 Z`}
              fill="var(--theme-accent-subtle)"
            />

            {/* Line */}
            <path
              d={path}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Current point indicator */}
            <circle
              cx="100"
              cy={100 - ((data.currentTokens - minTokensInPeriod) / (maxTokensInPeriod - minTokensInPeriod || 1)) * 100}
              r="2"
              fill="var(--theme-accent)"
            />
          </svg>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            Not enough data
          </div>
        )}
      </div>

      {/* Stats */}
      {showLabels && (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
            <span style={{ color: 'var(--theme-text-secondary)' }}>Current:</span>
            <span className="font-mono" style={{ color: 'var(--theme-text-primary)' }}>{data.currentTokens.toLocaleString()}</span>
            <span style={{ color: 'var(--theme-text-muted)' }}>/ {data.maxTokens.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
            ) : trend < 0 ? (
              <TrendingUp className="w-4 h-4 rotate-180" style={{ color: 'var(--color-error)' }} />
            ) : null}
            <span
              className="font-mono"
              style={{ color: trend > 0 ? 'var(--color-success)' : trend < 0 ? 'var(--color-error)' : 'var(--theme-text-secondary)' }}
            >
              {trend > 0 ? '+' : ''}{(trend / 1000).toFixed(1)}k
            </span>
            <span style={{ color: 'var(--theme-text-muted)' }}>from start</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-surface-hover)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, usagePercent)}%`,
                  backgroundColor: usagePercent > 80 ? 'var(--color-error)' : usagePercent > 60 ? 'var(--color-warning)' : 'var(--color-success)'
                }}
              />
            </div>
            <span className="font-mono" style={{ color: 'var(--theme-text-secondary)' }}>{usagePercent.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextUsageGraph;
