import React, { useState } from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { createPortal } from 'react-dom';
import { X, Brain, Target, Zap, Lightbulb, ArrowRight, Copy, Check } from 'lucide-react';

interface PromptEngineerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptGenerated: (prompt: string) => void;
}

interface ConversationStep {
  question: string;
  answer: string;
  insights: string[];
}

const _QUESTION_STRATEGIES = {
  CLARIFICATION: {
    key: 'clarification',
    icon: Target,
    color: 'var(--color-info)',
    label: 'Clarification'
  },
  SPECIFICS: {
    key: 'specifics',
    icon: Zap,
    color: 'var(--color-feature)',
    label: 'Specifics'
  },
  CONTEXT: {
    key: 'context',
    icon: Lightbulb,
    color: 'var(--color-success)',
    label: 'Context'
  },
  CONSTRAINTS: {
    key: 'constraints',
    icon: Brain,
    color: 'var(--color-warning)',
    label: 'Constraints'
  }
};

export const PromptEngineerModal: React.FC<PromptEngineerModalProps> = ({
  isOpen,
  onClose,
  onPromptGenerated
}) => {
  const [initialIdea, setInitialIdea] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [conversation, setConversation] = useState<ConversationStep[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [_isGenerating, setIsGenerating] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState('');
  const { isCopied: copied, copy } = useCopyToClipboard();

  const generateNextQuestion = async (userInput: string, step: number): Promise<{
    question: string;
    insights: string[];
    isComplete: boolean;
  }> => {
    // Simulate AI processing - in real app, this would call AI service
    await new Promise(resolve => setTimeout(resolve, 1000));

    const idea = userInput.toLowerCase();

    if (step === 0) {
      // First question - always clarification
      if (idea.includes('app') || idea.includes('application')) {
        return {
          question: "What type of application are you building? (e.g., e-commerce, social media, dashboard, mobile app)",
          insights: ["User wants to build an application"],
          isComplete: false
        };
      } else if (idea.includes('website') || idea.includes('site')) {
        return {
          question: "What kind of website? (e.g., portfolio, blog, business, landing page)",
          insights: ["User wants to build a website"],
          isComplete: false
        };
      } else if (idea.includes('component') || idea.includes('ui')) {
        return {
          question: "What specific component or UI pattern do you need? (e.g., form, navigation, data table, modal)",
          insights: ["User wants UI components"],
          isComplete: false
        };
      } else {
        return {
          question: "Could you be more specific about what you want to build? Are you thinking of an app, website, or specific features?",
          insights: ["User's intent needs clarification"],
          isComplete: false
        };
      }
    } else if (step === 1) {
      // Second question - specific details or context
      if (idea.includes('ecommerce') || idea.includes('shop')) {
        return {
          question: "What are the key features for your e-commerce platform? (product catalog, cart, payment, user accounts, admin panel)",
          insights: ["Building e-commerce platform", "Need core e-commerce features"],
          isComplete: false
        };
      } else if (idea.includes('dashboard') || idea.includes('admin')) {
        return {
          question: "What data will your dashboard display? (analytics, user management, sales, inventory, real-time metrics)",
          insights: ["Building dashboard interface", "Data visualization needed"],
          isComplete: false
        };
      } else if (idea.includes('form') || idea.includes('input')) {
        return {
          question: "What's the purpose of this form? (user registration, contact, survey, data entry) and what fields do you need?",
          insights: ["Building form interface", "Data collection requirement"],
          isComplete: false
        };
      } else {
        return {
          question: "What are the most important features or requirements? Think about user experience, data handling, or specific functionality.",
          insights: ["Need to understand key requirements"],
          isComplete: false
        };
      }
    } else if (step === 2) {
      // Third question - constraints or technical details
      if (idea.includes('responsive') || idea.includes('mobile')) {
        return {
          question: "Any specific design preferences or constraints? (color scheme, design system, accessibility requirements, browser support)",
          insights: ["Responsive design important", "Design constraints needed"],
          isComplete: true
        };
      } else {
        return {
          question: "Any technical constraints or preferences? (framework features, performance requirements, accessibility standards)",
          insights: ["Need to understand technical constraints"],
          isComplete: true
        };
      }
    }

    return {
      question: "",
      insights: [],
      isComplete: true
    };
  };

  const generateFinalPrompt = async () => {
    setIsGenerating(true);

    // Simulate AI prompt generation
    await new Promise(resolve => setTimeout(resolve, 1500));

    const _insights = conversation.flatMap(step => step.insights);
    const answers = conversation.map(step => step.answer);

    let generatedPrompt = "Create a ";

    // Build prompt based on conversation
    const firstAnswer = answers[0];
    if (firstAnswer && firstAnswer.toLowerCase().includes('ecommerce')) {
      generatedPrompt += "modern, responsive e-commerce platform with ";
      generatedPrompt += "product catalog with filtering and search, shopping cart with local storage persistence, ";
      generatedPrompt += "user authentication system, secure checkout flow, and admin dashboard for inventory management. ";
    } else if (firstAnswer && firstAnswer.toLowerCase().includes('dashboard')) {
      generatedPrompt += "professional analytics dashboard with ";
      generatedPrompt += "real-time data visualization, interactive charts and graphs, data filtering capabilities, ";
      generatedPrompt += "responsive grid layout, and clean, modern UI design. ";
    } else if (firstAnswer && firstAnswer.toLowerCase().includes('form')) {
      generatedPrompt += "user-friendly form with ";
      generatedPrompt += "client-side validation, accessible input fields, proper error handling, ";
      generatedPrompt += "progressive enhancement, and mobile-responsive layout. ";
    } else {
      generatedPrompt += "modern, responsive web application with ";
      generatedPrompt += "clean user interface, excellent user experience, and ";
      generatedPrompt += (firstAnswer ?? '');
    }

    // Add technical requirements
    generatedPrompt += "\n\nRequirements:";
    generatedPrompt += "\n- Use TypeScript for type safety";
    generatedPrompt += "\n- Ensure responsive design for mobile and desktop";
    generatedPrompt += "\n- Follow accessibility best practices (WCAG 2.1)";
    generatedPrompt += "\n- Include proper error handling and loading states";
    generatedPrompt += "\n- Use modern React patterns and hooks";
    generatedPrompt += "\n- Implement dark/light theme support";

    setFinalPrompt(generatedPrompt);
    setIsGenerating(false);
  };

  const handleSubmitInitial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialIdea.trim()) return;

    const result = await generateNextQuestion(initialIdea, 0);
    setCurrentQuestion(result.question);
    setConversation([{
      question: initialIdea,
      answer: result.question,
      insights: result.insights
    }]);
    setCurrentStep(1);
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion.trim()) return;

    const lastAnswer = e.currentTarget.querySelector('textarea')?.value || '';

    if (currentStep >= 2) {
      // Final step - generate prompt
      const result = await generateNextQuestion(lastAnswer, currentStep);
      setConversation(prev => [...prev, {
        question: currentQuestion,
        answer: lastAnswer,
        insights: result.insights
      }]);
      await generateFinalPrompt();
    } else {
      // Generate next question
      const result = await generateNextQuestion(lastAnswer, currentStep);
      setCurrentQuestion(result.question);
      setConversation(prev => [...prev, {
        question: currentQuestion,
        answer: lastAnswer,
        insights: result.insights
      }]);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleCopyPrompt = () => {
    if (finalPrompt) {
      copy(finalPrompt);
    }
  };

  const handleUsePrompt = () => {
    if (finalPrompt) {
      onPromptGenerated(finalPrompt);
      onClose();
    }
  };

  const reset = () => {
    setInitialIdea('');
    setCurrentStep(0);
    setConversation([]);
    setCurrentQuestion('');
    setFinalPrompt('');
    setIsGenerating(false);
    // isCopied auto-resets via hook
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 p-4" style={{ backgroundColor: 'var(--theme-overlay)' }} role="dialog" aria-modal="true" aria-label="Prompt engineer">
      <div className="w-full max-w-4xl backdrop-blur-xl rounded-2xl animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '1px solid var(--theme-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg" style={{ background: 'linear-gradient(135deg, var(--color-feature-subtle), var(--color-error-subtle))' }}>
              <Brain className="w-6 h-6" style={{ color: 'var(--color-feature)' }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--theme-text-primary)' }}>AI Prompt Engineer</h2>
              <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>Get the perfect prompt in 3 questions or less</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Brain className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--color-feature)' }} />
                <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                  What would you like to build?
                </h3>
                <p className="max-w-md mx-auto" style={{ color: 'var(--theme-text-muted)' }}>
                  Describe your idea in simple terms, and I'll help you create the perfect prompt
                </p>
              </div>

              <form onSubmit={handleSubmitInitial} className="space-y-4">
                <textarea
                  value={initialIdea}
                  onChange={(e) => setInitialIdea(e.target.value)}
                  placeholder="e.g., I want to build a task management app, or I need a contact form for my website..."
                  className="w-full p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{
                    backgroundColor: 'var(--theme-glass-200)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-primary)',
                    '--tw-ring-color': 'var(--theme-ai-accent)'
                  } as React.CSSProperties}
                  rows={4}
                />
                <button
                  type="submit"
                  disabled={!initialIdea.trim()}
                  className="w-full py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(90deg, var(--color-feature), var(--color-error))', color: 'var(--theme-text-on-accent)' }}
                >
                  Start Refining
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {currentStep > 0 && !finalPrompt && (
            <div className="space-y-6">
              {/* Progress */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      style={{
                        backgroundColor: step <= currentStep ? 'var(--color-feature)' : 'var(--theme-glass-300)',
                        color: step <= currentStep ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)'
                      }}
                    >
                      {step}
                    </div>
                  ))}
                </div>
                <span className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                  Question {currentStep} of 3
                </span>
              </div>

              {/* Conversation History */}
              <div className="space-y-4 mb-6">
                {conversation.map((step, index) => (
                  <div key={index} className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                    <div className="text-sm mb-1" style={{ color: 'var(--theme-text-muted)' }}>Q: {step.question}</div>
                    <div style={{ color: 'var(--theme-text-primary)' }}>{step.answer}</div>
                    {step.insights.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {step.insights.map((insight, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded text-xs"
                            style={{ backgroundColor: 'var(--color-feature-subtle)', color: 'var(--color-feature)' }}
                          >
                            {insight}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Current Question */}
              <form onSubmit={handleAnswerSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                    {currentQuestion}
                  </label>
                  <textarea
                    placeholder="Type your answer here..."
                    className="w-full p-4 rounded-lg resize-none focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{
                      backgroundColor: 'var(--theme-glass-200)',
                      border: '1px solid var(--theme-border)',
                      color: 'var(--theme-text-primary)',
                      '--tw-ring-color': 'var(--theme-ai-accent)'
                    } as React.CSSProperties}
                    rows={3}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(90deg, var(--color-feature), var(--color-error))', color: 'var(--theme-text-on-accent)' }}
                >
                  {currentStep >= 2 ? 'Generate Prompt' : 'Next Question'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {finalPrompt && (
            <div className="space-y-6">
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--color-success-subtle)' }}>
                  <Zap className="w-8 h-8" style={{ color: 'var(--color-success)' }} />
                </div>
                <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--theme-text-primary)' }}>
                  Perfect Prompt Generated!
                </h3>
                <p style={{ color: 'var(--theme-text-muted)' }}>
                  Your optimized prompt is ready to use
                </p>
              </div>

              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--theme-glass-200)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium" style={{ color: 'var(--theme-text-primary)' }}>Generated Prompt</h4>
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors"
                    style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-mono p-4 rounded" style={{ backgroundColor: 'var(--theme-surface-dark)', color: 'var(--theme-text-secondary)', border: '1px solid var(--theme-border)' }}>
                  {finalPrompt}
                </pre>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleUsePrompt}
                  className="flex-1 py-3 rounded-lg font-medium transition-all"
                  style={{ background: 'linear-gradient(90deg, var(--color-feature), var(--color-error))', color: 'var(--theme-text-on-accent)' }}
                >
                  Use This Prompt
                </button>
                <button
                  onClick={reset}
                  className="px-6 py-3 rounded-lg font-medium transition-colors"
                  style={{ backgroundColor: 'var(--theme-glass-300)', color: 'var(--theme-text-primary)' }}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};