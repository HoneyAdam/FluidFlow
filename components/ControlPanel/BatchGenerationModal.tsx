import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, AlertCircle, FileCode, Zap } from 'lucide-react';
import { batchGenerator } from '../../services/batchGeneration';
import { FileSystem } from '../../types';

interface BatchGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  systemInstruction: string;
  targetFiles: string[];
  onComplete: (files: FileSystem) => void;
}

interface BatchProgress {
  current: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  status: 'generating' | 'complete' | 'error';
  message?: string;
  error?: string;
}

export const BatchGenerationModal: React.FC<BatchGenerationModalProps> = ({
  isOpen,
  onClose,
  prompt,
  systemInstruction,
  targetFiles,
  onComplete
}) => {
  const [progress, setProgress] = useState<BatchProgress>({
    current: 0,
    total: targetFiles.length,
    currentBatch: 0,
    totalBatches: Math.ceil(targetFiles.length / 5),
    status: 'generating'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedFiles, setCompletedFiles] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleStart = async () => {
    setIsGenerating(true);
    setProgress({
      current: 0,
      total: targetFiles.length,
      currentBatch: 0,
      totalBatches: Math.ceil(targetFiles.length / 5),
      status: 'generating'
    });

    try {
      const result = await batchGenerator.generateInBatches(
        prompt,
        systemInstruction,
        targetFiles,
        {
          maxFilesPerBatch: 5,
          maxTokensPerBatch: 8192,
          onProgress: (current, total, currentBatch, totalBatches) => {
            setProgress({
              current,
              total,
              currentBatch,
              totalBatches,
              status: 'generating'
            });
          },
          onBatchComplete: (batchFiles, batchNumber) => {
            const newFiles = Object.keys(batchFiles);
            setCompletedFiles(prev => [...prev, ...newFiles]);
            setProgress(prev => ({
              ...prev,
              message: `Batch ${batchNumber} completed: ${newFiles.join(', ')}`
            }));
          },
          onError: (error, batchNumber) => {
            console.error(`Batch ${batchNumber} failed:`, error);
            setProgress(prev => ({
              ...prev,
              status: 'error',
              error: `Batch ${batchNumber} failed: ${error.message}`
            }));
          }
        }
      );

      if (result.success) {
        setProgress({
          ...progress,
          status: 'complete',
          message: `Successfully generated ${Object.keys(result.files).length} files!`
        });

        // Wait a moment to show success
        setTimeout(() => {
          onComplete(result.files);
          onClose();
        }, 1500);
      } else {
        setProgress(prev => ({
          ...prev,
          status: 'error',
          error: result.error || 'Generation failed'
        }));
      }
    } catch (error) {
      console.error('Batch generation failed:', error);
      setProgress({
        ...progress,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const progressPercentage = Math.round((progress.current / progress.total) * 100);

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="Batch generation">
      <div className="w-full max-w-3xl backdrop-blur-xl rounded-2xl animate-in zoom-in-95 duration-200 shadow-2xl p-8" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg" style={{ background: 'linear-gradient(135deg, var(--color-info-subtle), var(--color-feature-subtle))' }}>
              <FileCode className="w-8 h-8" style={{ color: 'var(--color-info)' }} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--theme-text-primary)' }}>Batch Generation</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                Generating {targetFiles.length} files in batches
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
          </button>
        </div>

        {/* Progress */}
        <div className="space-y-6">
          {/* Overall Progress */}
          <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {progress.status === 'generating' && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-info)' }} />}
                {progress.status === 'complete' && <Check className="w-5 h-5" style={{ color: 'var(--color-success)' }} />}
                {progress.status === 'error' && <AlertCircle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />}
                <div>
                  <h3 className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>
                    {progress.status === 'generating' && 'Generating...'}
                    {progress.status === 'complete' && 'Generation Complete!'}
                    {progress.status === 'error' && 'Generation Failed'}
                  </h3>
                  {progress.message && (
                    <p className="text-sm mt-1" style={{ color: 'var(--theme-text-muted)' }}>{progress.message}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: 'var(--theme-text-primary)' }}>{progressPercentage}%</div>
                <div className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                  {progress.current}/{progress.total} files
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-300)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%`, background: 'linear-gradient(90deg, var(--color-info), var(--color-feature))' }}
              />
            </div>

            {/* Batch Info */}
            <div className="flex items-center justify-between mt-4 text-sm">
              <span style={{ color: 'var(--theme-text-muted)' }}>
                Batch {progress.currentBatch} of {progress.totalBatches}
              </span>
              <span style={{ color: 'var(--theme-text-muted)' }}>
                5 files per batch max
              </span>
            </div>
          </div>

          {/* Completed Files */}
          {completedFiles.length > 0 && (
            <div className="rounded-lg p-4 max-h-40 overflow-y-auto" style={{ backgroundColor: 'var(--theme-glass-100)' }}>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                Completed Files ({completedFiles.length})
              </h4>
              <div className="space-y-1">
                {completedFiles.map((file) => (
                  <div key={file} className="text-xs font-mono flex items-center gap-2" style={{ color: 'var(--theme-text-secondary)' }}>
                    <FileCode className="w-3 h-3" style={{ color: 'var(--color-success)' }} />
                    {file}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {progress.status === 'error' && progress.error && (
            <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-error)' }}>{progress.error}</p>
            </div>
          )}

          {/* Action Buttons */}
          {!isGenerating && progress.status !== 'complete' && (
            <div className="flex gap-3">
              <button
                onClick={handleStart}
                className="flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(90deg, var(--color-info), var(--color-feature))', color: 'var(--theme-text-on-accent)' }}
              >
                <Zap className="w-4 h-4" />
                Start Batch Generation
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-lg font-medium transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};