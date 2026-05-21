import React, { useState, useEffect } from 'react';
import { X as XIcon, Mail, Star, ExternalLink, Heart, Sparkles, Code, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { Github } from './icons/BrandIcons';
import { APP_VERSION } from '../services/version';
import { STORAGE_KEYS } from '../constants/storage';

interface Project {
  id: string;
  name: string;
  title: string;
  description: string;
  logo: string;
  website: string;
  github: string;
  color: string;
}

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showOnFirstLaunch?: boolean;
}

// BUG-033 FIX: Proper Fisher-Yates shuffle for unbiased randomization
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Helper function to convert color identifier to theme gradient
const getGradientStyle = (colorId: string): string => {
  const gradients: Record<string, string> = {
    'accent-gradient': 'linear-gradient(to right, color-mix(in srgb, var(--theme-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-accent) 20%, transparent))',
    'success-gradient': 'linear-gradient(to right, color-mix(in srgb, var(--color-success) 20%, transparent), color-mix(in srgb, var(--theme-accent) 20%, transparent))',
    'ai-gradient': 'linear-gradient(to right, color-mix(in srgb, var(--theme-ai-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-secondary) 20%, transparent))',
    'warning-gradient': 'linear-gradient(to right, color-mix(in srgb, var(--color-warning) 20%, transparent), color-mix(in srgb, var(--color-error) 20%, transparent))'
  };

  // Check if it's a legacy Tailwind class or a new gradient ID
  if (colorId.includes('from-') || colorId.includes('to-')) {
    // Legacy fallback - try to map common patterns
    if (colorId.includes('blue') && colorId.includes('purple')) return gradients['accent-gradient'];
    if (colorId.includes('emerald') || colorId.includes('green')) return gradients['success-gradient'];
    return gradients['accent-gradient']; // default
  }

  return gradients[colorId] || gradients['accent-gradient'];
};

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose, showOnFirstLaunch = false }) => {
  const [hasSeenCredits, setHasSeenCredits] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);

  // BUG-017 FIX: Add AbortController to prevent state updates on unmounted component
  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    const loadProjects = async () => {
      try {
        // Try to load from GitHub first
        const githubResponse = await fetch(
          'https://raw.githubusercontent.com/ersinkoc/ersinkoc/main/ads.json',
          { signal: abortController.signal }
        );
        const data: Project[] = await githubResponse.json();
        if (isMounted) {
          // BUG-033 FIX: Use Fisher-Yates shuffle for unbiased selection
          const shuffled = shuffleArray(data);
          const selectedProjects = shuffled.slice(0, 3);
          setProjects(selectedProjects);
        }
      } catch (_githubError) {
        // Ignore abort errors
        if (abortController.signal.aborted) return;

        try {
          // Fallback to local ads.json
          const localResponse = await fetch('/ads.json', { signal: abortController.signal });
          const data: Project[] = await localResponse.json();
          if (isMounted) {
            // BUG-033 FIX: Use Fisher-Yates shuffle for unbiased selection
            const shuffled = shuffleArray(data);
            const selectedProjects = shuffled.slice(0, 3);
            setProjects(selectedProjects);
          }
        } catch {
          // Ignore abort errors
          if (abortController.signal.aborted) return;

          // Final fallback data if both fetches fail
          if (isMounted) {
            setProjects([
              {
                id: "tonl",
                name: "TONL",
                title: "Token-Optimized Notation Language",
                description: "A text-first, LLM-friendly serialization format. Up to 50% fewer tokens than JSON. Zero dependencies. Built for the AI era.",
                logo: "🔗",
                website: "https://tonl.dev",
                github: "https://github.com/tonl-dev/tonl",
                color: "accent-gradient" // Maps to theme accent gradient
              },
              {
                id: "specpulse",
                name: "SpecPulse",
                title: "Build Software 10x Faster with AI",
                description: "SpecPulse transforms how you build software. Write specifications once, generate intelligent tasks, and let AI handle the implementation.",
                logo: "⚡",
                website: "https://specpulse.xyz",
                github: "https://github.com/specpulse/specpulse",
                color: "success-gradient" // Maps to theme success gradient
              }
            ]);
          }
        }
      }
    };

    loadProjects();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    // Check if user has seen credits before
    const seen = localStorage.getItem(STORAGE_KEYS.CREDITS_SEEN);
    if (seen) {
      setHasSeenCredits(true);
    }

    // Trigger animation on mount with cleanup
    let animationTimeout: ReturnType<typeof setTimeout> | null = null;
    if (isOpen) {
      animationTimeout = setTimeout(() => setIsAnimating(true), 100);
    }

    return () => {
      if (animationTimeout) {
        clearTimeout(animationTimeout);
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    if (!hasSeenCredits && showOnFirstLaunch) {
      localStorage.setItem(STORAGE_KEYS.CREDITS_SEEN, 'true');
      setHasSeenCredits(true);
    }
    setTimeout(onClose, 200);
  };

  const handleGitHubStar = () => {
    window.open('https://github.com/ersinkoc/FluidFlow', '_blank');
  };

  const handleTwitterFollow = () => {
    window.open('https://x.com/ersinkoc', '_blank');
  };

  const handleEmailContact = () => {
    window.open('mailto:ersinkoc@gmail.com', '_blank');
  };

  const nextProject = () => {
    if (projects.length === 0) return;
    setCurrentProjectIndex((prev) => (prev + 1) % projects.length);
  };

  const prevProject = () => {
    if (projects.length === 0) return;
    setCurrentProjectIndex((prev) => (prev - 1 + projects.length) % projects.length);
  };

  const currentProject = projects[currentProjectIndex];

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-[9999] p-4 transition-all duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
      style={{ backgroundColor: 'var(--theme-modal-overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Credits"
    >
      <div className={`relative max-w-7xl w-full transform transition-all duration-500 ${isAnimating ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}>
        {/* Animated background effects */}
        <div
          className="absolute inset-0 rounded-3xl blur-xl animate-pulse"
          style={{
            background: 'linear-gradient(to bottom right, color-mix(in srgb, var(--theme-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-accent) 20%, transparent), color-mix(in srgb, var(--theme-ai-secondary) 20%, transparent))'
          }}
        ></div>

        {/* Main card */}
        <div className="relative backdrop-blur-xl rounded-3xl p-10 shadow-2xl overflow-hidden w-full" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
          {/* Floating particles background */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-10 left-10 animate-bounce"
              style={{
                animationDelay: '0s',
                animationDuration: '3s',
                color: 'color-mix(in srgb, var(--theme-accent) 20%, transparent)'
              }}
            >
              <Sparkles size={20} />
            </div>
            <div
              className="absolute top-20 right-20 animate-bounce"
              style={{
                animationDelay: '0.5s',
                animationDuration: '3s',
                color: 'color-mix(in srgb, var(--theme-ai-accent) 20%, transparent)'
              }}
            >
              <Code size={16} />
            </div>
            <div
              className="absolute bottom-10 left-20 animate-bounce"
              style={{
                animationDelay: '1s',
                animationDuration: '3s',
                color: 'color-mix(in srgb, var(--theme-ai-secondary) 20%, transparent)'
              }}
            >
              <Zap size={18} />
            </div>
            <div
              className="absolute bottom-20 right-10 animate-bounce"
              style={{
                animationDelay: '1.5s',
                animationDuration: '3s',
                color: 'color-mix(in srgb, var(--color-warning) 20%, transparent)'
              }}
            >
              <Star size={14} />
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-6 right-6 transition-all duration-200 p-2 rounded-full group z-10"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <XIcon size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>

          {/* Compact Layout */}
          <div className="space-y-8" style={{ color: 'var(--theme-text-secondary)' }}>
            {/* Main Content - 2 Column */}
            <div className="flex flex-col md:flex-row gap-8">
              {/* Left Column: Project Info */}
              <div className="flex-1 text-center md:text-left">
                <div
                  className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-xl shadow-lg transform hover:scale-110 transition-transform duration-300"
                  style={{
                    background: 'linear-gradient(to bottom right, var(--theme-accent), var(--theme-ai-accent))'
                  }}
                >
                  <Sparkles size={40} style={{ color: 'white' }} />
                </div>
                <h2
                  className="text-4xl font-bold mb-2 bg-clip-text text-transparent"
                  style={{
                    background: 'linear-gradient(to right, color-mix(in srgb, var(--theme-accent) 90%, white), var(--theme-ai-accent), var(--theme-ai-secondary))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}
                >
                  FluidFlow
                </h2>
                <p className="text-lg mb-4" style={{ color: 'var(--theme-text-primary)' }}>AI-Powered Prototyping Revolution</p>
                <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--theme-text-secondary)' }}>
                  Transform your sketches and ideas into fully functional React applications with the power of AI.
                  Experience real-time preview and seamless development workflow.
                </p>
                <button
                  onClick={handleGitHubStar}
                  className="flex items-center gap-3 px-6 py-3 rounded-xl transition-all group transform hover:scale-105"
                  style={{
                    background: 'linear-gradient(to right, color-mix(in srgb, var(--color-warning) 20%, transparent), color-mix(in srgb, var(--color-warning) 15%, var(--color-error) 5%), color-mix(in srgb, var(--color-error) 20%, transparent))',
                    border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, color-mix(in srgb, var(--color-warning) 30%, transparent), color-mix(in srgb, var(--color-warning) 25%, var(--color-error) 5%), color-mix(in srgb, var(--color-error) 30%, transparent))';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, color-mix(in srgb, var(--color-warning) 20%, transparent), color-mix(in srgb, var(--color-warning) 15%, var(--color-error) 5%), color-mix(in srgb, var(--color-error) 20%, transparent))';
                  }}
                >
                  <Star className="group-hover:rotate-180 transition-all duration-500" style={{ color: 'var(--color-warning)' }} size={20} />
                  <span className="font-medium">Star on GitHub</span>
                </button>
              </div>

              {/* Right Column: Developer Info */}
              <div className="flex-1">
                <div className="max-w-sm mx-auto">
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-3 mb-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(to bottom right, var(--theme-ai-secondary), var(--color-warning))'
                        }}
                      >
                        <span className="text-2xl">👨‍💻</span>
                      </div>
                      <div className="text-left">
                        <h3 className="font-bold text-xl" style={{ color: 'var(--theme-text-primary)' }}>Ersin KOÇ</h3>
                        <p style={{ color: 'var(--theme-text-secondary)' }}>Full-Stack Developer & AI Enthusiast</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-4">
                    <button
                      onClick={handleTwitterFollow}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--theme-accent-subtle)', border: '1px solid var(--theme-accent)' }}
                    >
                      <XIcon size={16} style={{ color: 'var(--theme-accent)' }} />
                      <span className="text-sm font-medium">@ersinkoc</span>
                    </button>
                    <button
                      onClick={handleEmailContact}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid var(--color-success)' }}
                    >
                      <Mail size={16} style={{ color: 'var(--color-success)' }} />
                      <span className="text-sm font-medium">Email</span>
                    </button>
                    <button
                      onClick={handleGitHubStar}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}
                    >
                      <Github size={16} />
                      <span className="text-sm font-medium">GitHub</span>
                    </button>
                  </div>

                  <div className="text-center">
                    <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                      Open to collaborations, consulting, and exciting AI projects
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Other Projects - Compact Slider */}
            {projects.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg" style={{ color: 'var(--theme-text-primary)' }}>More Projects</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={prevProject}
                      className="p-2 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--theme-glass-200)' }}
                      disabled={projects.length <= 1}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={nextProject}
                      className="p-2 rounded-lg transition-all"
                      style={{ backgroundColor: 'var(--theme-glass-200)' }}
                      disabled={projects.length <= 1}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                {currentProject && (
                  <div
                    className="rounded-xl p-6 backdrop-blur-sm h-32"
                    style={{
                      border: '1px solid var(--theme-border)',
                      background: getGradientStyle(currentProject.color)
                    }}
                  >
                    <div className="flex items-center gap-4 h-full">
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border)' }}>
                        {currentProject.logo.startsWith('https://') ? (
                          <img
                            src={currentProject.logo}
                            alt={currentProject.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // BUG-002 FIX: Use safe DOM manipulation instead of innerHTML
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.parentElement) {
                                const fallback = document.createElement('span');
                                fallback.className = 'text-3xl';
                                fallback.textContent = '📦';
                                target.parentElement.appendChild(fallback);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-3xl">{currentProject.logo}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-bold mb-1 truncate" style={{ color: 'var(--theme-text-primary)' }}>{currentProject.name}</h4>
                        <p className="text-sm mb-2" style={{ color: 'var(--theme-text-secondary)' }}>{currentProject.title}</p>
                        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--theme-text-muted)' }}>{currentProject.description}</p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => window.open(currentProject.website, '_blank')}
                          className="p-2 rounded-lg transition-all"
                          style={{ backgroundColor: 'var(--theme-glass-200)' }}
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => window.open(currentProject.github, '_blank')}
                          className="p-2 rounded-lg transition-all"
                          style={{ backgroundColor: 'var(--theme-glass-200)' }}
                        >
                          <Github size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Project Indicators */}
                {projects.length > 1 && (
                  <div className="flex justify-center gap-2">
                    {projects.map((project, index) => (
                      <button
                        key={project.id}
                        onClick={() => setCurrentProjectIndex(index)}
                        className="w-2 h-2 rounded-full transition-all"
                        style={{
                          backgroundColor: index === currentProjectIndex ? 'var(--theme-accent)' : 'var(--theme-glass-200)',
                          transform: index === currentProjectIndex ? 'scale(1.25)' : undefined
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer - Simple */}
            <div className="text-center text-xs" style={{ color: 'var(--theme-text-muted)' }}>
              <p className="flex items-center justify-center gap-3">
                <span>v{APP_VERSION}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Made with
                  <Heart size={10} className="animate-pulse" style={{ color: 'var(--color-error)' }} />
                  in Estonia
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};