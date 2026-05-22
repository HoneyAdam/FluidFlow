import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { TOAST_DURATION_MS } from '../../constants/timing';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileCode, FileJson, FileText, Database, FlaskConical,
  File as FileIcon, Trash2, Pencil, X, Check, FilePlus
} from 'lucide-react';
import { FileSystem } from '../../types';
import { useFileContextMenu } from '../ContextMenu';
import { InputDialog } from '../InputDialog';

interface FileExplorerProps {
  files: FileSystem;
  activeFile: string;
  onFileSelect: (file: string) => void;
  onCreateFile?: (path: string, content: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

const getFileIcon = (fileName: string) => {
  if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
    return <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--color-info)' }} />;
  }
  if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
    return <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
  }
  if (fileName.endsWith('.json')) {
    return <FileJson className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
  }
  if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
    return <FileIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />;
  }
  if (fileName.endsWith('.sql')) {
    return <Database className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />;
  }
  if (fileName.endsWith('.md')) {
    return <FileText className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
  }
  if (fileName.endsWith('.test.tsx') || fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts')) {
    return <FlaskConical className="w-3.5 h-3.5" style={{ color: 'var(--color-error)' }} />;
  }
  if (fileName.endsWith('.html')) {
    return <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />;
  }
  return <FileIcon className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />;
};

const getFolderIcon = (name: string, isOpen: boolean) => {
  const iconClass = "w-3.5 h-3.5";

  if (name === 'src') {
    return isOpen
      ? <FolderOpen className={iconClass} style={{ color: 'var(--color-info)' }} />
      : <Folder className={iconClass} style={{ color: 'var(--color-info)' }} />;
  }
  if (name === 'db' || name === 'database') {
    return <Database className={iconClass} style={{ color: 'var(--color-success)' }} />;
  }
  if (name === 'tests' || name === '__tests__') {
    return <FlaskConical className={iconClass} style={{ color: 'var(--color-error)' }} />;
  }
  if (name === 'components') {
    return isOpen
      ? <FolderOpen className={iconClass} style={{ color: 'var(--color-feature)' }} />
      : <Folder className={iconClass} style={{ color: 'var(--color-feature)' }} />;
  }
  if (name === 'hooks') {
    return isOpen
      ? <FolderOpen className={iconClass} style={{ color: 'var(--color-info)' }} />
      : <Folder className={iconClass} style={{ color: 'var(--color-info)' }} />;
  }
  if (name === 'utils' || name === 'lib') {
    return isOpen
      ? <FolderOpen className={iconClass} style={{ color: 'var(--color-warning)' }} />
      : <Folder className={iconClass} style={{ color: 'var(--color-warning)' }} />;
  }

  return isOpen
    ? <FolderOpen className={iconClass} style={{ color: 'var(--theme-text-muted)' }} />
    : <Folder className={iconClass} style={{ color: 'var(--theme-text-muted)' }} />;
};

// Paths to ignore in file explorer
const IGNORED_PATHS = ['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', '.cache'];
const isIgnoredPath = (filePath: string): boolean => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return IGNORED_PATHS.some(ignored =>
    normalizedPath === ignored ||
    normalizedPath.startsWith(ignored + '/') ||
    normalizedPath.includes('/' + ignored + '/') ||
    normalizedPath.includes('/' + ignored)
  );
};

// Build tree structure from flat file paths
function buildTree(files: FileSystem): TreeNode[] {
  const root: TreeNode[] = [];

  // Sort paths to ensure parent folders are processed first, filter out ignored paths
  const sortedPaths = Object.keys(files).filter(p => !isIgnoredPath(p)).sort();

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === undefined) continue;
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      let existing = currentLevel.find(n => n.name === part);

      if (!existing) {
        const newNode: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : []
        };
        currentLevel.push(newNode);
        existing = newNode;
      }

      if (!isLast && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }));
  };

  return sortNodes(root);
}

// Tree Node Component Props
interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  activeFile: string;
  onFileSelect: (file: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onCreateInFolder?: (folderPath: string) => void;
}

// Custom equality function for TreeNode memo
function treeNodeAreEqual(prev: TreeNodeProps, next: TreeNodeProps): boolean {
  // Re-render ALL folders when expandedFolders changes (toggle happened somewhere)
  // This ensures children of expanded folders can toggle properly
  if (prev.expandedFolders !== next.expandedFolders && prev.node.type === 'folder') {
    return false;
  }

  // Re-render if node changed
  if (prev.node !== next.node) return false;

  // Re-render if depth changed
  if (prev.depth !== next.depth) return false;

  // For files: only re-render if this file's active state changed
  if (prev.node.type === 'file') {
    const wasActive = prev.activeFile === prev.node.path;
    const isActive = next.activeFile === next.node.path;
    if (wasActive !== isActive) return false;
  }

  return true;
}

// Tree Node Component - using simpler memo for folder toggle reliability
const TreeNodeComponent = memo(function TreeNodeComponent({
  node, depth, activeFile, onFileSelect, expandedFolders, toggleFolder, onDelete, onRename, onCreateInFolder, files,
  onRequestRenameDialog
}: TreeNodeProps & { files: FileSystem; onRequestRenameDialog?: (filePath: string, currentName: string) => void }) {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeFile === node.path;
  const paddingLeft = 8 + depth * 12;
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Call hook unconditionally at the top level
  const handleContextMenu = useFileContextMenu(
    node.path,
    files[node.path] || '',
    onDelete || (() => {}),
    onRename || undefined,
    onRequestRenameDialog
  );

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = () => {
    if (newName.trim() && newName !== node.name && onRename) {
      const pathParts = node.path.split('/');
      pathParts[pathParts.length - 1] = newName.trim();
      const newPath = pathParts.join('/');
      onRename(node.path, newPath);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setNewName(node.name);
      setIsRenaming(false);
    }
  };

  if (node.type === 'folder') {
    return (
      <div>
        <div
          className="w-full flex items-center gap-1.5 py-1 rounded text-left transition-colors group"
          style={{ paddingLeft }}
        >
          <button onClick={() => toggleFolder(node.path)} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span style={{ color: 'var(--theme-text-muted)' }}>
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
            {getFolderIcon(node.name, isExpanded)}
            {isRenaming ? (
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="text-[11px] font-medium rounded px-1 outline-none w-full min-w-[60px]"
                style={{ color: 'var(--theme-text-primary)', backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-accent)' }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--theme-text-secondary)' }}>{node.name}</span>
            )}
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
            {onCreateInFolder && (
              <button
                onClick={(e) => { e.stopPropagation(); onCreateInFolder(node.path); }}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
                title="New file in folder"
              >
                <FilePlus className="w-3 h-3" />
              </button>
            )}
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Rename folder"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--theme-text-muted)' }}
                title="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {isExpanded && node.children && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0"
              style={{ left: paddingLeft + 6, borderLeft: '1px solid var(--theme-border-light)' }}
            />
            {node.children.map(child => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onDelete={onDelete}
                onRename={onRename}
                onCreateInFolder={onCreateInFolder}
                files={files}
                onRequestRenameDialog={onRequestRenameDialog}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  return (
    <div
      className="w-full flex items-center gap-2 py-1 rounded text-left transition-all group"
      style={{
        paddingLeft,
        backgroundColor: isActive ? 'var(--color-info-subtle)' : 'transparent',
        color: isActive ? 'var(--color-info)' : 'var(--theme-text-muted)'
      }}
      onContextMenu={handleContextMenu}
    >
      <button onClick={() => onFileSelect(node.path)} className="flex items-center gap-2 flex-1 min-w-0">
        {getFileIcon(node.name)}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="text-[11px] rounded px-1 outline-none flex-1 min-w-[60px]"
            style={{ color: 'var(--theme-text-primary)', backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-accent)' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[11px] truncate">{node.name}</span>
        )}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
        {onRename && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            className="p-0.5 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Rename file"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
            className="p-0.5 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Delete file"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}, treeNodeAreEqual);

export const FileExplorer = memo(function FileExplorer({
  files,
  activeFile,
  onFileSelect,
  onCreateFile,
  onDeleteFile,
  onRenameFile
}: FileExplorerProps) {
  // Build tree structure
  const tree = useMemo(() => buildTree(files), [files]);

  // Track expanded folders - expand common folders by default
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set<string>());

  // Auto-expand folders when files change (new files arrive)
  useEffect(() => {
    const newExpanded = new Set<string>();
    // Auto-expand src and first-level folders, plus all parent folders of files
    Object.keys(files).forEach(path => {
      const parts = path.split('/');
      if (parts.length > 1) {
        // Expand all parent folders of each file
        for (let i = 1; i < parts.length; i++) {
          newExpanded.add(parts.slice(0, i).join('/'));
        }
      }
    });

    // Merge with existing expanded folders (do not collapse manually expanded ones)
    setExpandedFolders(prev => {
      const merged = new Set([...prev, ...newExpanded]);
      // Only update if there are new folders to expand
      if (merged.size > prev.size) {
        return merged;
      }
      return prev;
    });
  }, [files]);

  // New file creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [createInFolder, setCreateInFolder] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [renameDialogPath, setRenameDialogPath] = useState<{ filePath: string; currentName: string } | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [isCreating]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allFolders = new Set<string>();
    const findFolders = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'folder') {
          allFolders.add(node.path);
          if (node.children) findFolders(node.children);
        }
      });
    };
    findFolders(tree);
    setExpandedFolders(allFolders);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const handleCreateFile = () => {
    if (!newFileName.trim() || !onCreateFile) return;

    const basePath = createInFolder ? `${createInFolder}/` : 'src/';
    const fullPath = basePath + newFileName.trim();

    // Determine default content based on extension
    let content = '';
    if (fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
      const componentName = newFileName.replace(/\.(tsx|jsx)$/, '').replace(/[^a-zA-Z0-9]/g, '');
      content = `import React from 'react';\n\nexport const ${componentName}: React.FC = () => {\n  return (\n    <div>\n      {/* ${componentName} component */}\n    </div>\n  );\n};\n\nexport default ${componentName};\n`;
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
      content = `// ${newFileName}\n\nexport {};\n`;
    } else if (fullPath.endsWith('.css')) {
      content = `/* ${newFileName} */\n`;
    } else if (fullPath.endsWith('.json')) {
      content = '{\n  \n}\n';
    } else if (fullPath.endsWith('.md')) {
      content = `# ${newFileName.replace('.md', '')}\n\n`;
    } else if (fullPath.endsWith('.sql')) {
      content = `-- ${newFileName}\n\n`;
    }

    onCreateFile(fullPath, content);
    setNewFileName('');
    setIsCreating(false);
    setCreateInFolder(null);

    // Expand the folder where file was created
    if (createInFolder) {
      setExpandedFolders(prev => new Set([...prev, createInFolder]));
    }

    // Select the new file
    onFileSelect(fullPath);
  };

  const handleDelete = (path: string) => {
    if (showDeleteConfirm === path && onDeleteFile) {
      onDeleteFile(path);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(path);
      // Auto-hide confirm after 3 seconds
      setTimeout(() => setShowDeleteConfirm(null), TOAST_DURATION_MS);
    }
  };

  const handleRename = (oldPath: string, newPath: string) => {
    // If newPath is empty, this is from the context menu - show dialog
    if (newPath === '') {
      const currentName = oldPath.split('/').pop() || '';
      setRenameDialogPath({ filePath: oldPath, currentName });
      return;
    }
    // Normal rename (e.g., from inline editing)
    if (onRenameFile) {
      onRenameFile(oldPath, newPath);
    }
  };

  const handleRenameDialogConfirm = (newName: string) => {
    if (renameDialogPath && newName.trim() && onRenameFile) {
      const pathParts = renameDialogPath.filePath.split('/');
      pathParts[pathParts.length - 1] = newName.trim();
      const newPath = pathParts.join('/');
      onRenameFile(renameDialogPath.filePath, newPath);
    }
    setRenameDialogPath(null);
  };

  const handleCreateInFolder = (folderPath: string) => {
    setCreateInFolder(folderPath);
    setIsCreating(true);
    setExpandedFolders(prev => new Set([...prev, folderPath]));
  };

  const visibleFiles = Object.keys(files).filter(p => !isIgnoredPath(p));
  const fileCount = visibleFiles.length;
  const folderCount = new Set(
    visibleFiles
      .map(p => p.split('/').slice(0, -1).join('/'))
      .filter(Boolean)
  ).size;

  return (
    <div className="w-56 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--theme-surface-dark)', borderRight: '1px solid var(--theme-border-light)' }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border-light)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
          Explorer
        </span>
        <div className="flex items-center gap-1">
          {onCreateFile && (
            <button
              onClick={() => { setCreateInFolder(null); setIsCreating(true); }}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--theme-text-muted)' }}
              title="New file"
            >
              <FilePlus className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={expandAll}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Expand all"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--theme-text-muted)' }}
            title="Collapse all"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* New File Input */}
      {isCreating && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-200)' }}>
          <div className="flex items-center gap-1 mb-1">
            <FilePlus className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
            <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
              {createInFolder ? `in ${createInFolder}/` : 'in src/'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={newFileInputRef}
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') { setIsCreating(false); setNewFileName(''); setCreateInFolder(null); }
              }}
              placeholder="filename.tsx"
              className="flex-1 px-2 py-1 rounded text-xs outline-none"
              style={{ backgroundColor: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
            />
            <button
              onClick={handleCreateFile}
              disabled={!newFileName.trim()}
              className="p-1 rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setIsCreating(false); setNewFileName(''); setCreateInFolder(null); }}
              className="p-1 rounded transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {tree.map(node => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onDelete={onDeleteFile ? handleDelete : undefined}
            onRename={onRenameFile ? handleRename : undefined}
            onCreateInFolder={onCreateFile ? handleCreateInFolder : undefined}
            files={files}
            onRequestRenameDialog={onRenameFile ? (filePath, currentName) => setRenameDialogPath({ filePath, currentName }) : undefined}
          />
        ))}
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-error-border)', backgroundColor: 'var(--color-error-subtle)' }}>
          <p className="text-[10px] mb-1" style={{ color: 'var(--color-error)' }}>Delete "{showDeleteConfirm.split('/').pop()}"?</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDelete(showDeleteConfirm)}
              className="flex-1 px-2 py-1 text-[10px] rounded transition-colors"
              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="px-2 py-1 text-[10px] rounded transition-colors"
              style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--theme-border-light)', backgroundColor: 'var(--theme-glass-100)' }}>
        <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
          <span>{folderCount} folders</span>
          <span>{fileCount} files</span>
        </div>
      </div>

      {/* Rename Dialog */}
      {renameDialogPath && (
        <InputDialog
          isOpen={!!renameDialogPath}
          onClose={() => setRenameDialogPath(null)}
          onConfirm={handleRenameDialogConfirm}
          title={`Rename ${renameDialogPath.currentName}`}
          message="Enter the new name for this file/folder:"
          placeholder={renameDialogPath.currentName}
          defaultValue={renameDialogPath.currentName}
          confirmText="Rename"
          validate={(value) => {
            if (!value.trim()) return 'Name cannot be empty';
            if (value === renameDialogPath.currentName) return 'Name must be different';
            return null;
          }}
        />
      )}
    </div>
  );
});
