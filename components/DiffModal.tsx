/**
 * DiffModal Component
 *
 * Displays a side-by-side diff view for reviewing file changes before confirmation.
 * Used for AI-generated code review workflow.
 */

import React, { useState, useMemo } from 'react';
import { Check, Split, FileCode, AlertCircle } from 'lucide-react';
import { diffLines } from 'diff';
import { FileSystem } from '../types';
import { IGNORED_PATHS } from '@/constants';

/**
 * Check if a file path should be ignored (e.g., .git, node_modules)
 */
const isIgnoredPath = (filePath: string): boolean => {
  return IGNORED_PATHS.some(pattern =>
    filePath === pattern ||
    filePath.startsWith(pattern) ||
    filePath.startsWith('.git/') ||
    filePath.includes('/.git/') ||
    filePath.includes('/node_modules/')
  );
};

export interface DiffModalProps {
  /** Original files before changes */
  originalFiles: FileSystem;
  /** New files after changes */
  newFiles: FileSystem;
  /** Action label (e.g., "AI Generated Code") */
  label: string;
  /** Callback when user confirms changes */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Files that were started but not completed by AI (excluded from merge) */
  incompleteFiles?: string[];
}

/**
 * Diff line type for rendering
 */
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLine: number | null;
  newLine: number | null;
  content: string;
}

/**
 * File change summary
 */
interface FileChangeSummary {
  file: string;
  added: number;
  removed: number;
}

export const DiffModal: React.FC<DiffModalProps> = ({
  originalFiles,
  newFiles,
  label,
  onConfirm,
  onCancel,
  incompleteFiles
}) => {
  // Calculate changed files (excluding ignored paths)
  const changedFiles = useMemo<FileChangeSummary[]>(() => {
    const changes: FileChangeSummary[] = [];
    const allKeys = new Set([...Object.keys(originalFiles), ...Object.keys(newFiles)]);

    allKeys.forEach(key => {
      // Skip ignored paths like .git, node_modules
      if (isIgnoredPath(key)) return;

      if (originalFiles[key] !== newFiles[key]) {
        const oldLines = (originalFiles[key] || '').split('\n').length;
        const newLines = (newFiles[key] || '').split('\n').length;
        const isNew = !originalFiles[key];
        const isDeleted = !newFiles[key];
        changes.push({
          file: key,
          added: isNew ? newLines : Math.max(0, newLines - oldLines),
          removed: isDeleted ? oldLines : Math.max(0, oldLines - newLines)
        });
      }
    });
    return changes;
  }, [originalFiles, newFiles]);

  const [selectedFile, setSelectedFile] = useState<string>(changedFiles[0]?.file || '');

  // Calculate diff with line numbers
  const diffWithLineNumbers = useMemo<DiffLine[]>(() => {
    if (!selectedFile) return [];
    const oldText = originalFiles[selectedFile] || '';
    const newText = newFiles[selectedFile] || '';
    const changes = diffLines(oldText, newText);

    const result: DiffLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    changes.forEach(change => {
      const lines = change.value.split('\n');
      // Remove last empty line from split if the value ends with newline
      if (lines[lines.length - 1] === '') lines.pop();

      lines.forEach(line => {
        if (change.added) {
          result.push({ type: 'added', oldLine: null, newLine: newLineNum++, content: line });
        } else if (change.removed) {
          result.push({ type: 'removed', oldLine: oldLineNum++, newLine: null, content: line });
        } else {
          result.push({ type: 'unchanged', oldLine: oldLineNum++, newLine: newLineNum++, content: line });
        }
      });
    });

    return result;
  }, [selectedFile, originalFiles, newFiles]);

  // Stats for selected file
  const stats = useMemo(() => {
    const added = diffWithLineNumbers.filter(l => l.type === 'added').length;
    const removed = diffWithLineNumbers.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffWithLineNumbers]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review changes"
      className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200"
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
    >
      <div
        className="w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: 'var(--theme-modal-bg)', border: '1px solid var(--theme-modal-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: 'var(--theme-surface-elevated)', borderBottom: '1px solid var(--theme-border)' }}
        >
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
              <Split className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
              Review Changes
            </h2>
            <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
              Action: <span style={{ color: 'var(--theme-accent)' }}>{label}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg shadow-lg transition-all text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
            >
              <Check className="w-4 h-4" />
              Confirm Changes
            </button>
          </div>
        </div>

        {/* Incomplete Files Warning */}
        {incompleteFiles && incompleteFiles.length > 0 && (
          <div className="px-6 py-3" style={{ backgroundColor: 'var(--color-warning-subtle)', borderBottom: '1px solid var(--color-warning-border)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
                  {incompleteFiles.length} file{incompleteFiles.length > 1 ? 's were' : ' was'} incomplete and excluded
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-warning)', opacity: 0.7 }}>
                  The following file{incompleteFiles.length > 1 ? 's' : ''} did not receive complete content and {incompleteFiles.length > 1 ? 'have' : 'has'} been excluded from this update:
                </p>
                <ul className="mt-2 space-y-1">
                  {incompleteFiles.map((file) => (
                    <li key={file} className="text-xs font-mono flex items-center gap-2" style={{ color: 'var(--color-warning)', opacity: 0.8 }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-warning)', opacity: 0.5 }}></span>
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* File List */}
          <div className="w-72 flex flex-col" style={{ backgroundColor: 'var(--theme-surface)', borderRight: '1px solid var(--theme-border)' }}>
            <div className="p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)', borderBottom: '1px solid var(--theme-border)' }}>
              Modified Files ({changedFiles.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {changedFiles.map(({ file, added, removed }) => (
                <button
                  key={file}
                  onClick={() => setSelectedFile(file)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  style={{
                    backgroundColor: selectedFile === file ? 'var(--theme-accent-subtle)' : 'transparent',
                    color: selectedFile === file ? 'var(--theme-accent)' : 'var(--theme-text-muted)',
                    border: selectedFile === file ? '1px solid var(--theme-accent-subtle)' : '1px solid transparent'
                  }}
                >
                  <FileCode className="w-4 h-4 opacity-70 shrink-0" />
                  <span className="truncate flex-1">{file}</span>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                    {added > 0 && <span style={{ color: 'var(--color-success)' }}>+{added}</span>}
                    {removed > 0 && <span style={{ color: 'var(--color-error)' }}>-{removed}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Diff View */}
          <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--theme-code-bg)' }}>
            {selectedFile ? (
              <>
                {/* File Header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-2" style={{ backgroundColor: 'var(--theme-surface-elevated)', borderBottom: '1px solid var(--theme-border)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--theme-text-muted)' }}>{selectedFile}</span>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    {stats.added > 0 && (
                      <span style={{ color: 'var(--color-success)' }}>+{stats.added} additions</span>
                    )}
                    {stats.removed > 0 && (
                      <span style={{ color: 'var(--color-error)' }}>-{stats.removed} deletions</span>
                    )}
                  </div>
                </div>

                {/* Diff Content */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full border-collapse font-mono text-xs">
                    <tbody>
                      {diffWithLineNumbers.map((line, index) => (
                        <tr
                          key={index}
                          style={{
                            backgroundColor: line.type === 'removed'
                              ? 'var(--color-error-subtle)'
                              : line.type === 'added'
                                ? 'var(--color-success-subtle)'
                                : undefined
                          }}
                        >
                          {/* Old Line Number */}
                          <td
                            className="w-12 px-2 py-0.5 text-right select-none"
                            style={{ color: 'var(--theme-text-muted)', backgroundColor: 'var(--theme-surface)', borderRight: '1px solid var(--theme-border)' }}
                          >
                            {line.oldLine ?? ''}
                          </td>
                          {/* New Line Number */}
                          <td
                            className="w-12 px-2 py-0.5 text-right select-none"
                            style={{ color: 'var(--theme-text-muted)', backgroundColor: 'var(--theme-surface)', borderRight: '1px solid var(--theme-border)' }}
                          >
                            {line.newLine ?? ''}
                          </td>
                          {/* Change Indicator */}
                          <td
                            className="w-6 px-1 py-0.5 text-center select-none font-bold"
                            style={{
                              color: line.type === 'removed'
                                ? 'var(--color-error)'
                                : line.type === 'added'
                                  ? 'var(--color-success)'
                                  : 'var(--theme-text-muted)',
                              backgroundColor: line.type === 'removed'
                                ? 'var(--color-error-subtle)'
                                : line.type === 'added'
                                  ? 'var(--color-success-subtle)'
                                  : undefined
                            }}
                          >
                            {line.type === 'removed' ? '-' : ''}
                            {line.type === 'added' ? '+' : ''}
                          </td>
                          {/* Code Content */}
                          <td
                            className="px-3 py-0.5 whitespace-pre"
                            style={{
                              color: line.type === 'removed'
                                ? 'var(--color-error)'
                                : line.type === 'added'
                                  ? 'var(--color-success)'
                                  : 'var(--theme-text-secondary)',
                              opacity: line.type === 'removed' ? 0.7 : 1
                            }}
                          >
                            {line.content || ' '}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center" style={{ color: 'var(--theme-text-muted)' }}>
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>No changes detected or file selected</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
