import React, { useMemo, useState } from 'react';
import {
  FileCode, FileJson, Database,
  ChevronRight, ChevronDown, Box, Layers, GitBranch, Package,
  Component, Braces, Hash, Type
} from 'lucide-react';
import { FileSystem } from '../../types';

interface ProjectStructureProps {
  files: FileSystem;
}

interface FileAnalysis {
  path: string;
  name: string;
  type: 'component' | 'hook' | 'util' | 'type' | 'style' | 'config' | 'data' | 'other';
  exports: string[];
  imports: string[];
  dependencies: string[];
  lines: number;
  size: string;
}

// Analyze a file's content
function analyzeFile(path: string, content: string): FileAnalysis {
  const name = path.split('/').pop() || path;
  const lines = content.split('\n').length;
  const size = content.length > 1024 ? `${(content.length / 1024).toFixed(1)}KB` : `${content.length}B`;

  // Determine file type
  let type: FileAnalysis['type'] = 'other';
  if (path.includes('/hooks/') || name.startsWith('use')) {
    type = 'hook';
  } else if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
    type = 'component';
  } else if (path.includes('/utils/') || path.includes('/lib/')) {
    type = 'util';
  } else if (path.endsWith('.d.ts') || path.includes('/types')) {
    type = 'type';
  } else if (path.endsWith('.css') || path.endsWith('.scss')) {
    type = 'style';
  } else if (path.endsWith('.json') || path.includes('config')) {
    type = 'config';
  } else if (path.endsWith('.sql')) {
    type = 'data';
  }

  // Extract exports
  const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g);
  const exports = [...exportMatches].map(m => m[1] ?? '');

  // Extract imports
  const importMatches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);
  const imports = [...importMatches].map(m => m[1] ?? '');

  // Extract dependencies (external packages)
  const dependencies = imports.filter(i => !i.startsWith('.') && !i.startsWith('@/'));

  return { path, name, type, exports, imports, dependencies, lines, size };
}

// Build project statistics
function buildProjectStats(files: FileSystem) {
  const analyses = Object.entries(files).map(([path, content]) => analyzeFile(path, content));

  const stats = {
    totalFiles: analyses.length,
    totalLines: analyses.reduce((sum, a) => sum + a.lines, 0),
    components: analyses.filter(a => a.type === 'component').length,
    hooks: analyses.filter(a => a.type === 'hook').length,
    utils: analyses.filter(a => a.type === 'util').length,
    types: analyses.filter(a => a.type === 'type').length,
    styles: analyses.filter(a => a.type === 'style').length,
    configs: analyses.filter(a => a.type === 'config').length,
    data: analyses.filter(a => a.type === 'data').length,
    dependencies: [...new Set(analyses.flatMap(a => a.dependencies))]
  };

  return { analyses, stats };
}

// Get type icon
const getTypeIcon = (type: FileAnalysis['type']) => {
  switch (type) {
    case 'component': return <Component className="w-3.5 h-3.5" style={{ color: 'var(--color-info)' }} />;
    case 'hook': return <GitBranch className="w-3.5 h-3.5" style={{ color: 'var(--color-feature)' }} />;
    case 'util': return <Braces className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
    case 'type': return <Type className="w-3.5 h-3.5" style={{ color: 'var(--theme-tertiary)' }} />;
    case 'style': return <Hash className="w-3.5 h-3.5" style={{ color: 'var(--color-error-light)' }} />;
    case 'config': return <FileJson className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
    case 'data': return <Database className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />;
    default: return <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />;
  }
};

// File Card Component
const FileCard: React.FC<{ analysis: FileAnalysis }> = ({ analysis }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 transition-colors"
        style={{ backgroundColor: 'transparent' }}
      >
        <div className="flex items-center gap-2">
          {getTypeIcon(analysis.type)}
          <span className="text-sm font-mono" style={{ color: 'var(--theme-text-secondary)' }}>{analysis.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>
            {analysis.type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{analysis.lines} lines</span>
          <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>{analysis.size}</span>
          {isExpanded ? <ChevronDown className="w-3 h-3" style={{ color: 'var(--theme-text-dim)' }} /> : <ChevronRight className="w-3 h-3" style={{ color: 'var(--theme-text-dim)' }} />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid var(--theme-border-light)' }}>
          <div className="text-[10px] font-mono" style={{ color: 'var(--theme-text-dim)' }}>{analysis.path}</div>

          {analysis.exports.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--theme-text-dim)' }}>Exports</div>
              <div className="flex flex-wrap gap-1">
                {analysis.exports.map((exp, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                    {exp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.dependencies.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--theme-text-dim)' }}>Dependencies</div>
              <div className="flex flex-wrap gap-1">
                {analysis.dependencies.map((dep, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.imports.filter(i => i.startsWith('.')).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--theme-text-dim)' }}>Local Imports</div>
              <div className="flex flex-wrap gap-1">
                {analysis.imports.filter(i => i.startsWith('.')).map((imp, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}>
                    {imp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// View types for the structure panel tabs
type ViewType = 'overview' | 'files' | 'deps';

export const ProjectStructure: React.FC<ProjectStructureProps> = ({ files }) => {
  const [activeView, setActiveView] = useState<ViewType>('overview');
  const { analyses, stats } = useMemo(() => buildProjectStats(files), [files]);

  // Group files by type
  const groupedFiles = useMemo(() => {
    const groups: Record<string, FileAnalysis[]> = {
      component: [],
      hook: [],
      util: [],
      type: [],
      style: [],
      config: [],
      data: [],
      other: []
    };
    analyses.forEach(a => (groups[a.type] ?? []).push(a));
    return groups;
  }, [analyses]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ backgroundColor: 'var(--theme-background)' }}>
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)' }}>
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>Project Structure</span>
        </div>
        <div className="flex p-0.5 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
          {[
            { id: 'overview', label: 'Overview', icon: Box },
            { id: 'files', label: 'Files', icon: FileCode },
            { id: 'deps', label: 'Dependencies', icon: Package }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id as ViewType)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors"
              style={{
                backgroundColor: activeView === id ? 'var(--theme-glass-300)' : 'transparent',
                color: activeView === id ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
              }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.totalFiles}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Total Files</div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.totalLines.toLocaleString()}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Lines of Code</div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.components}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Components</div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-feature)' }}>{stats.hooks}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Hooks</div>
              </div>
            </div>

            {/* Type Breakdown */}
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--theme-text-secondary)' }}>File Types</h3>
              <div className="space-y-2">
                {[
                  { type: 'component', count: stats.components, color: 'var(--color-info)' },
                  { type: 'hook', count: stats.hooks, color: 'var(--color-feature)' },
                  { type: 'util', count: stats.utils, color: 'var(--color-warning)' },
                  { type: 'type', count: stats.types, color: 'var(--theme-tertiary)' },
                  { type: 'style', count: stats.styles, color: 'var(--color-error-light)' },
                  { type: 'config', count: stats.configs, color: 'var(--color-warning)' },
                  { type: 'data', count: stats.data, color: 'var(--color-success)' }
                ].filter(t => t.count > 0).map(({ type, count, color }) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs capitalize w-20" style={{ color: 'var(--theme-text-muted)' }}>{type}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-300)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(count / stats.totalFiles) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-xs w-8 text-right" style={{ color: 'var(--theme-text-dim)' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Component Tree Preview */}
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--theme-text-secondary)' }}>Component Hierarchy</h3>
              <div className="space-y-1 font-mono text-xs">
                {(groupedFiles.component ?? []).slice(0, 10).map((comp, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 rounded">
                    <Component className="w-3 h-3" style={{ color: 'var(--color-info)' }} />
                    <span style={{ color: 'var(--theme-text-secondary)' }}>{comp.name}</span>
                    {comp.exports.length > 1 && (
                      <span className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>+{comp.exports.length - 1} exports</span>
                    )}
                  </div>
                ))}
                {(groupedFiles.component ?? []).length > 10 && (
                  <div className="text-[10px] pl-5" style={{ color: 'var(--theme-text-dim)' }}>
                    ...and {(groupedFiles.component?.length ?? 0) - 10} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'files' && (
          <div className="space-y-4">
            {(Object.entries(groupedFiles) as [string, FileAnalysis[]][]).map(([type, fileList]) => {
              if (fileList.length === 0) return null;
              return (
                <div key={type}>
                  <h3 className="text-xs font-medium uppercase tracking-wide mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-muted)' }}>
                    {getTypeIcon(type as FileAnalysis['type'])}
                    {type}s ({fileList.length})
                  </h3>
                  <div className="space-y-2">
                    {fileList.map((file, i) => (
                      <FileCard key={i} analysis={file} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeView === 'deps' && (
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--theme-text-secondary)' }}>
                External Dependencies ({stats.dependencies.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {stats.dependencies.map((dep, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-sm font-mono"
                    style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)', color: 'var(--color-info)' }}
                  >
                    {dep}
                  </span>
                ))}
                {stats.dependencies.length === 0 && (
                  <span className="text-sm" style={{ color: 'var(--theme-text-dim)' }}>No external dependencies detected</span>
                )}
              </div>
            </div>

            {/* Dependency Graph (simplified) */}
            <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
              <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--theme-text-secondary)' }}>Import Graph</h3>
              <div className="space-y-3">
                {analyses.filter(a => a.imports.filter(i => i.startsWith('.')).length > 0).slice(0, 15).map((file, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 min-w-[140px]">
                      {getTypeIcon(file.type)}
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--theme-text-secondary)' }}>{file.name}</span>
                    </div>
                    <span style={{ color: 'var(--theme-text-dim)' }}>→</span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {file.imports.filter(i => i.startsWith('.')).map((imp, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-muted)' }}>
                          {imp.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
