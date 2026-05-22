import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  X, Send, Wand2, FileCode, Loader2, Check, Copy, Sparkles, RotateCcw
} from 'lucide-react';
import { FileSystem } from '../../types';
import { getProviderManager } from '../../services/ai';
import { getContextManager, CONTEXT_IDS } from '../../services/conversationContext';
import {
  PROMPT_ENGINEER_STEP1,
  PROMPT_ENGINEER_STEP2,
  PROMPT_ENGINEER_STEP3,
  PROMPT_ENGINEER_FINAL,
} from './prompts';

interface PromptImproverModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalPrompt: string;
  files: FileSystem;
  hasExistingApp: boolean;
  onAccept: (improvedPrompt: string) => void;
}

type WizardStep = 1 | 2 | 3 | 'generating' | 'final';

// Dynamic option from AI response
interface StepOption {
  id: string;
  label: string;
  description?: string;
}

// AI response structure for each step
interface StepData {
  question: string;
  options: StepOption[];
  multiSelect: boolean;
}

interface WizardState {
  step: WizardStep;
  stepData: (StepData | null)[];  // AI-generated data for each step
  answers: string[];              // User answers for each step
  finalPrompt: string | null;
}

const STEP_LABELS = [
  'Core Intent',
  'Visual & UX',
  'Features',
];

export const PromptImproverModal: React.FC<PromptImproverModalProps> = ({
  isOpen,
  onClose,
  originalPrompt,
  files,
  hasExistingApp,
  onAccept
}) => {
  const [wizard, setWizard] = useState<WizardState>({
    step: 1,
    stepData: [null, null, null],  // AI-generated data for steps 1, 2, 3
    answers: [],
    finalPrompt: null,
  });
  const [inputValue, setInputValue] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isCopied: copied, copy } = useCopyToClipboard();
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.PROMPT_IMPROVER}-${Date.now()}`);

  // Generate intelligent project context analysis
  const getProjectContext = () => {
    const fileList = Object.keys(files);
    if (fileList.length === 0) return 'New project (no existing files)';

    const components = fileList.filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    const hasTypeScript = fileList.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    const componentNames = components.map(c => {
      const parts = c.split('/');
      return parts[parts.length - 1]?.replace(/\.(tsx?|jsx?)$/, '') ?? c;
    });

    let projectType = 'React application';
    if (fileList.some(f => f.includes('/pages/') || f.includes('/routes/'))) {
      projectType = 'Multi-page React app';
    }
    if (fileList.some(f => f.includes('/services/') || f.includes('/api/'))) {
      projectType += ' with backend services';
    }

    return `${projectType}: ${fileList.length} files, ${components.length} components (${componentNames.slice(0, 5).join(', ')}${components.length > 5 ? '...' : ''}), ${hasTypeScript ? 'TypeScript' : 'JavaScript'}${hasExistingApp ? ', updating existing' : ', new project'}`;
  };

  // Build prompt for current step
  const buildStepPrompt = (step: WizardStep): string => {
    const projectContext = getProjectContext();

    switch (step) {
      case 1:
        return PROMPT_ENGINEER_STEP1
          .replace('{{ORIGINAL_PROMPT}}', originalPrompt)
          .replace('{{PROJECT_CONTEXT}}', projectContext);

      case 2:
        return PROMPT_ENGINEER_STEP2
          .replace('{{ORIGINAL_PROMPT}}', originalPrompt)
          .replace('{{STEP1_ANSWER}}', wizard.answers[0] || '');

      case 3:
        return PROMPT_ENGINEER_STEP3
          .replace('{{ORIGINAL_PROMPT}}', originalPrompt)
          .replace('{{STEP1_ANSWER}}', wizard.answers[0] || '')
          .replace('{{STEP2_ANSWER}}', wizard.answers[1] || '');

      case 'generating':
      case 'final':
        return PROMPT_ENGINEER_FINAL
          .replace('{{ORIGINAL_PROMPT}}', originalPrompt)
          .replace('{{STEP1_ANSWER}}', wizard.answers[0] || '')
          .replace('{{STEP2_ANSWER}}', wizard.answers[1] || '')
          .replace('{{STEP3_ANSWER}}', wizard.answers[2] || '')
          .replace('{{PROJECT_CONTEXT}}', projectContext);

      default:
        return '';
    }
  };

  // Call AI for a step
  const callAI = async (prompt: string): Promise<string> => {
    const manager = getProviderManager();
    const provider = manager.getProvider();
    const config = manager.getActiveConfig();

    if (!provider || !config) {
      throw new Error('No AI provider configured');
    }

    let fullResponse = '';

    await provider.generateStream(
      {
        prompt,
        systemInstruction: 'You are a helpful prompt engineering assistant. Respond in plain text only.',
        stream: true
      },
      config.defaultModel,
      (chunk) => {
        fullResponse += chunk.text;
      }
    );

    return fullResponse.trim();
  };

  // Parse AI JSON response
  const parseStepResponse = (response: string): StepData | null => {
    try {
      // Clean up response - remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.question || !Array.isArray(parsed.options)) {
        console.error('Invalid step response structure:', parsed);
        return null;
      }

      return {
        question: parsed.question,
        options: parsed.options.map((opt: { id?: string; label?: string; description?: string }, idx: number) => ({
          id: opt.id || `opt_${idx}`,
          label: opt.label || `Option ${idx + 1}`,
          description: opt.description,
        })),
        multiSelect: Boolean(parsed.multiSelect),
      };
    } catch (e) {
      console.error('Failed to parse step response:', e, response);
      return null;
    }
  };

  // Generate question for current step
  const generateQuestion = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const prompt = buildStepPrompt(wizard.step as 1 | 2 | 3);
      const response = await callAI(prompt);
      const stepData = parseStepResponse(response);

      if (!stepData) {
        throw new Error('AI response was not in expected format. Please try again.');
      }

      const stepIndex = (wizard.step as number) - 1;
      setWizard(prev => {
        const newStepData = [...prev.stepData];
        newStepData[stepIndex] = stepData;
        return { ...prev, stepData: newStepData };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate question');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate final prompt
  const generateFinalPrompt = async () => {
    setWizard(prev => ({ ...prev, step: 'generating' }));
    setIsLoading(true);
    setError(null);

    try {
      const prompt = buildStepPrompt('generating');
      const finalPrompt = await callAI(prompt);

      setWizard(prev => ({
        ...prev,
        step: 'final',
        finalPrompt,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate final prompt');
      setWizard(prev => ({ ...prev, step: 3 })); // Go back to step 3 on error
    } finally {
      setIsLoading(false);
    }
  };

  // Get current step data
  const getCurrentStepData = (): StepData | null => {
    if (typeof wizard.step !== 'number') return null;
    return wizard.stepData[wizard.step - 1] ?? null;
  };

  // Toggle option selection
  const handleOptionToggle = (optionId: string) => {
    const stepData = getCurrentStepData();
    if (!stepData) return;

    if (stepData.multiSelect) {
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  // Build answer from selections and custom input
  const buildAnswer = (): string => {
    const stepData = getCurrentStepData();
    if (!stepData) return inputValue.trim();

    const selectedLabels = selectedOptions
      .map(id => stepData.options.find(opt => opt.id === id)?.label)
      .filter(Boolean);

    const parts: string[] = [];
    if (selectedLabels.length > 0) {
      parts.push(selectedLabels.join(', '));
    }
    if (inputValue.trim()) {
      parts.push(inputValue.trim());
    }

    return parts.join('. ');
  };

  // Handle answer submission
  const handleSubmit = () => {
    const answer = buildAnswer();
    if (!answer || isLoading) return;

    const currentStep = wizard.step as 1 | 2 | 3;
    const newAnswers = [...wizard.answers];
    newAnswers[currentStep - 1] = answer;

    setInputValue('');
    setSelectedOptions([]);

    if (currentStep < 3) {
      // Move to next step
      setWizard(prev => ({
        ...prev,
        answers: newAnswers,
        step: (currentStep + 1) as 1 | 2 | 3,
      }));
    } else {
      // Step 3 completed, generate final prompt
      setWizard(prev => ({
        ...prev,
        answers: newAnswers,
      }));
      // Trigger final generation after state update
      setTimeout(() => generateFinalPrompt(), 100);
    }
  };

  // Start conversation when modal opens
  useEffect(() => {
    if (isOpen && originalPrompt.trim() && !wizard.stepData[0]) {
      generateQuestion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, originalPrompt]);

  // Generate question when step changes (for steps 2 and 3)
  useEffect(() => {
    if (isOpen && typeof wizard.step === 'number' && wizard.step > 1 && !wizard.stepData[wizard.step - 1]) {
      generateQuestion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.step]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      contextManager.deleteContext(sessionIdRef.current);
      setWizard({
        step: 1,
        stepData: [null, null, null],
        answers: [],
        finalPrompt: null,
      });
      setInputValue('');
      setSelectedOptions([]);
      setError(null);
      // isCopied auto-resets via hook
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Focus input when question is ready
  useEffect(() => {
    if (!isLoading && inputRef.current && typeof wizard.step === 'number') {
      inputRef.current.focus();
    }
  }, [isLoading, wizard.step]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = () => {
    if (!wizard.finalPrompt) return;
    copy(wizard.finalPrompt);
  };

  const handleAccept = () => {
    if (wizard.finalPrompt) {
      onAccept(wizard.finalPrompt);
      onClose();
    }
  };

  const handleRestart = () => {
    contextManager.clearContext(sessionIdRef.current);
    sessionIdRef.current = `${CONTEXT_IDS.PROMPT_IMPROVER}-${Date.now()}`;
    setWizard({
      step: 1,
      stepData: [null, null, null],
      answers: [],
      finalPrompt: null,
    });
    setInputValue('');
    setSelectedOptions([]);
    setError(null);
    setTimeout(() => generateQuestion(), 100);
  };

  if (!isOpen) return null;

  const currentStepNum = typeof wizard.step === 'number' ? wizard.step : (wizard.step === 'generating' ? 3 : 4);
  const currentStepData = typeof wizard.step === 'number' ? wizard.stepData[wizard.step - 1] : null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--theme-overlay)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prompt improver"
    >
      <div
        className="w-[90vw] max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl"
              style={{
                background: 'linear-gradient(to bottom right, color-mix(in srgb, var(--theme-ai-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-secondary) 20%, transparent))'
              }}
            >
              <Wand2 className="w-5 h-5" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h2 className="font-medium text-lg flex items-center gap-2" style={{ color: 'var(--theme-text-primary)' }}>
                Prompt Engineer
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>AI</span>
              </h2>
              <p className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>3 questions to craft the perfect prompt</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="p-2 rounded-lg transition-colors"
              title="Start over"
            >
              <RotateCcw className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 mb-2">
            {STEP_LABELS.map((label, idx) => {
              const isCompleted = idx + 1 < currentStepNum || wizard.step === 'final';
              const isCurrent = idx + 1 === currentStepNum && wizard.step !== 'final';
              return (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: isCompleted ? 'var(--color-feature)' : isCurrent ? 'var(--color-feature-subtle)' : 'var(--theme-glass-200)',
                        color: isCompleted ? 'var(--theme-text-primary)' : isCurrent ? 'var(--color-feature)' : 'var(--theme-text-muted)',
                        boxShadow: isCurrent ? '0 0 0 2px var(--color-feature-border)' : 'none'
                      }}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className="text-xs hidden sm:inline"
                      style={{ color: idx + 1 <= currentStepNum || wizard.step === 'final' ? 'var(--theme-text-secondary)' : 'var(--theme-text-dim)' }}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div
                      className="flex-1 h-0.5 rounded"
                      style={{ backgroundColor: isCompleted ? 'var(--color-feature)' : 'var(--theme-glass-200)' }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {/* Original Prompt Preview */}
          <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border-light)' }}>
            <div className="flex items-center gap-2 mb-1">
              <FileCode className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-dim)' }} />
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--theme-text-dim)' }}>Original Prompt</span>
            </div>
            <p className="text-sm line-clamp-2" style={{ color: 'var(--theme-text-secondary)' }}>{originalPrompt}</p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* Question & Answer Flow */}
          {wizard.step !== 'final' && wizard.step !== 'generating' && (
            <div className="space-y-4">
              {/* Previous Q&As */}
              {wizard.stepData.slice(0, currentStepNum - 1).map((data, idx) => data && (
                <div key={idx} className="space-y-2 opacity-60">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
                    <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>{data.question}</p>
                  </div>
                  <div className="p-3 rounded-lg ml-4" style={{ backgroundColor: 'var(--color-info-subtle)', border: '1px solid var(--color-info-border)' }}>
                    <p className="text-sm" style={{ color: 'var(--color-info)' }}>{wizard.answers[idx]}</p>
                  </div>
                </div>
              ))}

              {/* Current Question */}
              {isLoading && !currentStepData ? (
                <div className="flex items-center gap-3 p-4">
                  <Sparkles className="w-5 h-5 animate-pulse" style={{ color: 'var(--color-feature)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Analyzing your prompt...</span>
                </div>
              ) : currentStepData ? (
                <div className="space-y-4">
                  {/* AI Question */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--color-feature-border)' }}>
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
                        <Sparkles className="w-4 h-4" style={{ color: 'var(--color-feature)' }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>{currentStepData.question}</p>
                      </div>
                    </div>
                  </div>

                  {/* Options Grid - AI generated options */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>
                        {currentStepData.multiSelect
                          ? 'Select one or more options'
                          : 'Select an option'}
                      </span>
                      {selectedOptions.length > 0 && (
                        <button
                          onClick={() => setSelectedOptions([])}
                          className="text-xs"
                          style={{ color: 'var(--theme-text-dim)' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {currentStepData.options.map((option) => {
                        const isSelected = selectedOptions.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => handleOptionToggle(option.id)}
                            className="p-3 rounded-lg text-left transition-all"
                            style={{
                              backgroundColor: isSelected ? 'var(--color-feature-subtle)' : 'var(--theme-glass-100)',
                              border: isSelected ? '1px solid var(--color-feature-border)' : '1px solid var(--theme-border)',
                              color: isSelected ? 'var(--color-feature)' : 'var(--theme-text-secondary)'
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className="w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: isSelected ? 'var(--color-feature)' : 'transparent',
                                  borderColor: isSelected ? 'var(--color-feature)' : 'var(--theme-text-dim)'
                                }}
                              >
                                {isSelected && (
                                  <Check className="w-2.5 h-2.5" style={{ color: 'var(--theme-text-primary)' }} />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium">{option.label}</div>
                                {option.description && (
                                  <div className="text-xs mt-0.5" style={{ color: 'var(--theme-text-dim)' }}>{option.description}</div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Generating State */}
          {wizard.step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-feature-subtle)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-feature)' }} />
              </div>
              <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>Crafting Your Prompt</h3>
              <p className="text-sm text-center max-w-md" style={{ color: 'var(--theme-text-muted)' }}>
                Combining your answers to create a detailed, actionable prompt...
              </p>
            </div>
          )}

          {/* Final Prompt Display */}
          {wizard.step === 'final' && wizard.finalPrompt && (
            <div className="space-y-4">
              {/* Summary of answers */}
              <div className="grid gap-2">
                {wizard.answers.map((answer, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}>
                      {idx + 1}
                    </span>
                    <span className="line-clamp-1" style={{ color: 'var(--theme-text-muted)' }}>{answer}</span>
                  </div>
                ))}
              </div>

              {/* Final Prompt */}
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--color-success-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
                    <Check className="w-4 h-4" />
                    Your Improved Prompt
                  </h4>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="p-3 rounded-lg max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'var(--theme-surface-dark)', border: '1px solid var(--theme-border)' }}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                    {wizard.finalPrompt}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4" style={{ borderTop: '1px solid var(--theme-border)', backgroundColor: 'var(--theme-surface-dark)' }}>
          {wizard.step !== 'final' && wizard.step !== 'generating' && currentStepData && (
            <>
              {/* Custom Input Area */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--theme-text-dim)' }}>Or add details:</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add custom details or requirements..."
                    disabled={isLoading}
                    rows={1}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none disabled:opacity-50"
                    style={{ backgroundColor: 'var(--theme-glass-100)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-primary)' }}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || (selectedOptions.length === 0 && !inputValue.trim())}
                    className="px-4 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-feature)', color: 'var(--theme-text-primary)' }}
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-sm">Next</span>
                  </button>
                </div>
              </div>

              {/* Hint */}
              <p className="text-[10px] text-center mt-2" style={{ color: 'var(--theme-text-dim)' }}>
                Step {currentStepNum} of 3 - {STEP_LABELS[currentStepNum - 1]}
                {selectedOptions.length > 0 && (
                  <span className="ml-2" style={{ color: 'var(--color-feature)' }}>
                    ({selectedOptions.length} selected)
                  </span>
                )}
              </p>
            </>
          )}

          {wizard.step === 'final' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleRestart}
                className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' }}
              >
                Start Over
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg"
                style={{
                  background: 'linear-gradient(to right, var(--color-success), color-mix(in srgb, var(--color-success) 92%, black))',
                  color: 'var(--theme-text-on-accent)',
                  boxShadow: '0 10px 15px -3px color-mix(in srgb, var(--color-success) 20%, transparent), 0 4px 6px -4px color-mix(in srgb, var(--color-success) 20%, transparent)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to right, color-mix(in srgb, var(--color-success) 90%, white), color-mix(in srgb, var(--color-success) 85%, black))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to right, var(--color-success), color-mix(in srgb, var(--color-success) 92%, black))';
                }}
              >
                <Check className="w-4 h-4" />
                Use This Prompt
              </button>
            </div>
          )}

          {wizard.step === 'generating' && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PromptImproverModal;
