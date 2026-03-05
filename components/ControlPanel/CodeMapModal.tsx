import React, { useState, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { generateCodeMap, FileInfo, CodeMap } from '../../utils/codemap';
import { FileSystem } from '../../types';

interface CodeMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSystem;
}

export const CodeMapModal: React.FC<CodeMapModalProps> = ({ isOpen, onClose, files }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'components' | 'summary'>('tree');
  const [filterType, setFilterType] = useState<'all' | 'component' | 'hook' | 'utility'>('all');

  // Generate codemap from VFS
  const codeMap = useMemo<CodeMap | null>(() => {
    if (!isOpen || Object.keys(files).length === 0) return null;
    try {
      return generateCodeMap(files);
    } catch (err) {
      console.error('Failed to generate code map:', err);
      return null;
    }
  }, [isOpen, files]);

  const filteredFiles = useMemo(() => {
    if (!codeMap) return [];

    let filtered = codeMap.files;

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(f => f.type === filterType);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.path.toLowerCase().includes(query) ||
        f.exports.some(e => e.toLowerCase().includes(query)) ||
        f.functions.some(fn => fn.toLowerCase().includes(query)) ||
        f.components.some(c => c.name.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [codeMap, filterType, searchQuery]);

  const allComponents = useMemo(() => {
    if (!codeMap) return [];
    return codeMap.files.flatMap(f => f.components);
  }, [codeMap]);

  const exportCodeMap = () => {
    if (!codeMap) return;

    const exportData = {
      metadata: {
        generated: new Date().toISOString(),
        totalFiles: codeMap.files.length,
        totalComponents: allComponents.length
      },
      files: codeMap.files,
      componentTree: codeMap.componentTree,
      summary: codeMap.summary
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codemap-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileIcon = (file: FileInfo) => {
    const iconColors: Record<string, string> = {
      component: 'var(--color-success)',
      hook: 'var(--color-feature)',
      style: 'var(--color-error)',
      data: 'var(--color-warning)',
      config: 'var(--color-warning)',
      utility: 'var(--color-info)'
    };
    const color = iconColors[file.type] || 'var(--color-info)';
    switch (file.type) {
      case 'component': return <Icons.Package className="w-4 h-4" style={{ color }} />;
      case 'hook': return <Icons.GitBranch className="w-4 h-4" style={{ color }} />;
      case 'style': return <Icons.Palette className="w-4 h-4" style={{ color }} />;
      case 'data': return <Icons.Database className="w-4 h-4" style={{ color }} />;
      case 'config': return <Icons.Settings className="w-4 h-4" style={{ color }} />;
      default: return <Icons.FileCode className="w-4 h-4" style={{ color }} />;
    }
  };

  const getTypeStyles = (type: string): { backgroundColor: string; color: string } => {
    switch (type) {
      case 'component': return { backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' };
      case 'hook': return { backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' };
      case 'style': return { backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' };
      case 'data': return { backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' };
      case 'config': return { backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' };
      default: return { backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' };
    }
  };

  if (!isOpen) return null;

  const stats = {
    totalFiles: codeMap?.files.length || 0,
    components: codeMap?.files.filter(f => f.type === 'component').length || 0,
    hooks: codeMap?.files.filter(f => f.type === 'hook').length || 0,
    utilities: codeMap?.files.filter(f => f.type === 'utility').length || 0
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="Code map">
      <div className="w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in slide-in-from-bottom-4 duration-300" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border-light)', background: 'linear-gradient(90deg, var(--color-info-subtle), var(--color-feature-subtle))' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info-subtle)' }}>
              <Icons.Map className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Code Map</h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Project structure analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCodeMap}
              disabled={!codeMap}
              className="p-2 rounded-lg transition-colors disabled:opacity-50"
              title="Export as JSON"
            >
              <Icons.Download className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
            >
              <Icons.X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Stats Summary */}
        {codeMap && (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-200)' }}>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{stats.totalFiles}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Files</div>
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>{stats.components}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Components</div>
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-feature)' }}>{stats.hooks}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Hooks</div>
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--color-info)' }}>{stats.utilities}</div>
                <div className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>Utilities</div>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
          <div className="flex items-center gap-3">
            {/* View Mode */}
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
              <button
                onClick={() => setViewMode('tree')}
                className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: viewMode === 'tree' ? 'var(--color-info)' : 'transparent',
                  color: viewMode === 'tree' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                }}
              >
                <Icons.FolderTree className="w-3 h-3 inline mr-1" />
                Files
              </button>
              <button
                onClick={() => setViewMode('components')}
                className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: viewMode === 'components' ? 'var(--color-info)' : 'transparent',
                  color: viewMode === 'components' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                }}
              >
                <Icons.Package className="w-3 h-3 inline mr-1" />
                Components
              </button>
              <button
                onClick={() => setViewMode('summary')}
                className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: viewMode === 'summary' ? 'var(--color-info)' : 'transparent',
                  color: viewMode === 'summary' ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                }}
              >
                <Icons.FileText className="w-3 h-3 inline mr-1" />
                Summary
              </button>
            </div>

            {/* Filter */}
            {viewMode === 'tree' && (
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                {(['all', 'component', 'hook', 'utility'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: filterType === type ? 'var(--color-feature)' : 'transparent',
                      color: filterType === type ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                    }}
                  >
                    {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="flex-1 relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, exports, functions..."
                className="w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none"
                style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {!codeMap ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Icons.FolderX className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--theme-text-dim)' }} />
                <p style={{ color: 'var(--theme-text-muted)' }}>No files to analyze</p>
                <p className="text-xs mt-1" style={{ color: 'var(--theme-text-dim)' }}>Generate some code first</p>
              </div>
            </div>
          ) : viewMode === 'tree' ? (
            <>
              {/* File List */}
              <div className="w-80 overflow-y-auto" style={{ borderRight: '1px solid var(--theme-border-light)' }}>
                <div className="p-4 space-y-2">
                  {filteredFiles.length === 0 ? (
                    <div className="text-center py-8">
                      <Icons.Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--theme-text-dim)' }} />
                      <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>No matching files</p>
                    </div>
                  ) : (
                    filteredFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className="w-full text-left p-3 rounded-lg transition-colors"
                        style={{
                          backgroundColor: selectedFile?.path === file.path ? 'var(--color-info-subtle)' : 'var(--theme-glass-200)',
                          border: selectedFile?.path === file.path ? '1px solid var(--color-info-border)' : '1px solid var(--theme-border-light)'
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {getFileIcon(file)}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: 'var(--theme-text-primary)' }}>
                              {file.path.split('/').pop()}
                            </div>
                            <div className="text-xs truncate" style={{ color: 'var(--theme-text-dim)' }}>{file.path}</div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px]" style={getTypeStyles(file.type)}>
                            {file.type}
                          </span>
                        </div>
                        {file.exports.length > 0 && (
                          <div className="mt-2 text-xs truncate" style={{ color: 'var(--theme-text-muted)' }}>
                            Exports: {file.exports.slice(0, 3).join(', ')}
                            {file.exports.length > 3 && ` +${file.exports.length - 3}`}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* File Details */}
              <div className="flex-1 overflow-y-auto">
                {selectedFile ? (
                  <div className="p-6">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                        {selectedFile.path.split('/').pop()}
                      </h3>
                      <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>{selectedFile.path}</p>
                      <span className="inline-block mt-2 px-2 py-1 rounded text-xs" style={getTypeStyles(selectedFile.type)}>
                        {selectedFile.type}
                      </span>
                    </div>

                    {/* Exports */}
                    {selectedFile.exports.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                          <Icons.FileOutput className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                          Exports ({selectedFile.exports.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.exports.map((exp) => (
                            <span key={exp} className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' }}>
                              {exp}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Components */}
                    {selectedFile.components.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                          <Icons.Package className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                          Components ({selectedFile.components.length})
                        </h4>
                        <div className="space-y-3">
                          {selectedFile.components.map((comp) => (
                            <div key={comp.name} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                              <div className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>{comp.name}</div>
                              {comp.props.length > 0 && (
                                <div className="mt-2 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                  Props: {comp.props.join(', ')}
                                </div>
                              )}
                              {comp.hooks.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {comp.hooks.map((hook) => (
                                    <span key={hook} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                                      {hook}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {comp.children.length > 0 && (
                                <div className="mt-1 text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                                  Uses: {comp.children.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Functions */}
                    {selectedFile.functions.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                          <Icons.Code className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                          Functions ({selectedFile.functions.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.functions.map((fn) => (
                            <span key={fn} className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                              {fn}()
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Constants */}
                    {selectedFile.constants.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                          <Icons.Hash className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                          Constants ({selectedFile.constants.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFile.constants.map((c) => (
                            <span key={c} className="px-2 py-1 rounded text-xs font-mono" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Imports */}
                    {selectedFile.imports.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                          <Icons.FileInput className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                          Imports ({selectedFile.imports.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedFile.imports.map((imp, idx) => (
                            <div key={idx} className="p-2 rounded text-xs" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
                              <span style={{ color: 'var(--theme-text-dim)' }}>from</span>
                              <span className="ml-2 font-mono" style={{ color: 'var(--theme-text-secondary)' }}>{imp.from}</span>
                              {imp.items.length > 0 && (
                                <div className="mt-1 ml-4" style={{ color: 'var(--theme-text-muted)' }}>
                                  {imp.items.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Icons.MousePointer className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--theme-text-dim)' }} />
                      <p style={{ color: 'var(--theme-text-muted)' }}>Select a file to view details</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : viewMode === 'components' ? (
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-lg font-semibold mb-6" style={{ color: 'var(--theme-text-primary)' }}>Component Hierarchy</h3>

              {allComponents.length === 0 ? (
                <div className="text-center py-12">
                  <Icons.Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--theme-text-dim)' }} />
                  <p style={{ color: 'var(--theme-text-muted)' }}>No React components found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {allComponents.map((comp) => (
                    <div key={comp.name} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icons.Package className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
                        <span className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>{comp.name}</span>
                      </div>

                      {comp.props.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Props</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.props.map((prop) => (
                              <span key={prop} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}>
                                {prop}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {comp.hooks.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Hooks</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.hooks.map((hook) => (
                              <span key={hook} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                                {hook}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {comp.children.length > 0 && (
                        <div>
                          <div className="text-xs mb-1" style={{ color: 'var(--theme-text-dim)' }}>Uses Components</div>
                          <div className="flex flex-wrap gap-1">
                            {comp.children.map((child) => (
                              <span key={child} className="px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' }}>
                                {child}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Summary View */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert max-w-none">
                <pre className="p-4 rounded-lg text-sm whitespace-pre-wrap" style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}>
                  {codeMap.summary}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
