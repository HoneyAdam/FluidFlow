/**
 * GeneratingOverlay - Engaging loading screen during code generation
 *
 * Shows rotating tips, features, and promotions while waiting.
 */
import React, { useState, useEffect, memo } from 'react';
import {
  Loader2,
  Wand2,
  Bot,
  Eye,
  GitBranch,
  MousePointer2,
  Brain,
  Wrench,
  Smartphone,
  Lightbulb,
  RefreshCw,
  Target,
  MessageSquare,
  Heart,
  Megaphone,
  Sparkles,
  Zap,
  Code2,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { getPromotionCycle, type Promotion } from '../../data/promotions';

// Icon mapping
const ICONS: Record<string, LucideIcon> = {
  Wand2,
  Bot,
  Eye,
  GitBranch,
  MousePointer2,
  Brain,
  Wrench,
  Smartphone,
  Lightbulb,
  RefreshCw,
  Target,
  MessageSquare,
  Heart,
  Megaphone,
  Sparkles,
  Zap,
  Code2,
};

interface GeneratingOverlayProps {
  isGenerating: boolean;
  isFixing?: boolean;
}

export const GeneratingOverlay = memo(function GeneratingOverlay({
  isGenerating,
  isFixing = false,
}: GeneratingOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [promotions] = useState(() => getPromotionCycle());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  // Navigate to previous
  const goToPrev = () => {
    setAutoPlay(false); // Stop auto-play when user navigates
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + promotions.length) % promotions.length);
      setIsTransitioning(false);
    }, 150);
  };

  // Navigate to next
  const goToNext = () => {
    setAutoPlay(false); // Stop auto-play when user navigates
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % promotions.length);
      setIsTransitioning(false);
    }, 150);
  };

  // Cycle through promotions (only if autoPlay is enabled)
  useEffect((): (() => void) | undefined => {
    if (!isGenerating) {
      setCurrentIndex(0);
      setAutoPlay(true);
      return undefined;
    }

    if (!autoPlay) return undefined;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % promotions.length);
        setIsTransitioning(false);
      }, 300);
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, [isGenerating, promotions.length, autoPlay]);

  if (!isGenerating) return null;

  const current = promotions[currentIndex];
  const IconComponent = current.icon ? ICONS[current.icon] || Sparkles : Sparkles;

  // Type-based styling using CSS variables
  const getTypeStyles = (type: Promotion['type']): {
    bg: React.CSSProperties;
    border: React.CSSProperties;
    icon: React.CSSProperties;
    title: React.CSSProperties;
    badge: React.CSSProperties;
    badgeText: string;
  } => {
    switch (type) {
      case 'feature':
        return {
          bg: { backgroundColor: 'var(--color-info-subtle)' },
          border: { border: '1px solid var(--color-info-border)' },
          icon: { color: 'var(--color-info)' },
          title: { color: 'var(--color-info)' },
          badge: { backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info)' },
          badgeText: 'Feature',
        };
      case 'tip':
        return {
          bg: { backgroundColor: 'var(--color-warning-subtle)' },
          border: { border: '1px solid var(--color-warning-border)' },
          icon: { color: 'var(--color-warning)' },
          title: { color: 'var(--color-warning)' },
          badge: { backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' },
          badgeText: 'Pro Tip',
        };
      case 'creator':
        return {
          bg: { backgroundColor: 'var(--theme-ai-secondary-subtle)' },
          border: { border: '1px solid var(--theme-ai-secondary)' },
          icon: { color: 'var(--theme-ai-secondary)' },
          title: { color: 'var(--theme-ai-secondary)' },
          badge: { backgroundColor: 'var(--theme-ai-secondary-subtle)', color: 'var(--theme-ai-secondary)' },
          badgeText: 'FluidFlow',
        };
      case 'ad':
        return {
          bg: { backgroundColor: 'var(--color-success-subtle)' },
          border: { border: '1px solid var(--color-success-border)' },
          icon: { color: 'var(--color-success)' },
          title: { color: 'var(--color-success)' },
          badge: { backgroundColor: 'var(--color-success-subtle)', color: 'var(--color-success)' },
          badgeText: 'Sponsored',
        };
      default:
        return {
          bg: { backgroundColor: 'var(--theme-glass-200)' },
          border: { border: '1px solid var(--theme-border)' },
          icon: { color: 'var(--theme-text-muted)' },
          title: { color: 'var(--theme-text-secondary)' },
          badge: { backgroundColor: 'var(--theme-glass-200)', color: 'var(--theme-text-secondary)' },
          badgeText: '',
        };
    }
  };

  const styles = getTypeStyles(current.type);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--theme-overlay) 95%, transparent)',
        backdropFilter: 'blur(24px) saturate(180%)'
      }}
    >
      {/* Main spinner */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full animate-spin" style={{ borderWidth: '4px', borderStyle: 'solid', borderColor: 'var(--theme-accent-subtle)', borderTopColor: 'var(--theme-accent)' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full animate-spin" style={{ borderWidth: '4px', borderStyle: 'solid', borderColor: 'var(--theme-ai-accent-subtle)', borderBottomColor: 'var(--theme-ai-accent)', animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-pulse" style={{ color: 'var(--theme-accent)' }} />
        </div>
      </div>

      {/* Status text */}
      <p
        className="text-lg font-semibold mb-8 animate-pulse px-6 py-2 rounded-full"
        style={{
          color: 'var(--theme-accent)',
          backgroundColor: 'color-mix(in srgb, var(--theme-accent) 15%, transparent)',
          border: '1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)'
        }}
      >
        {isFixing ? 'Adapting Layout...' : 'Constructing Interface...'}
      </p>

      {/* Promotion card with navigation */}
      <div className="flex items-center gap-3 max-w-lg mx-4">
        {/* Previous button */}
        <button
          onClick={goToPrev}
          className="p-2 rounded-full transition-all shrink-0 shadow-lg hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--theme-glass-300) 90%, transparent)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-border)'
          }}
          title="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card */}
        <div
          className={`flex-1 p-5 rounded-xl transition-all duration-300 shadow-2xl ${
            isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          style={{
            ...styles.bg,
            ...styles.border,
            boxShadow: '0 20px 50px -12px var(--theme-shadow-strong), 0 0 0 1px var(--theme-border-light)',
            backdropFilter: 'blur(12px) saturate(150%)'
          }}
        >
        {/* Badge */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-sm"
            style={{
              ...styles.badge,
              border: '1px solid currentColor',
              opacity: 0.95
            }}
          >
            {styles.badgeText}
          </span>
          <div className="flex items-center gap-1">
            {promotions.map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: i === currentIndex ? 'var(--theme-accent)' : 'var(--theme-glass-300)',
                  transform: i === currentIndex ? 'scale(1.4)' : 'scale(1)',
                  boxShadow: i === currentIndex ? '0 0 8px currentColor' : 'none'
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-md"
            style={{
              ...styles.bg,
              border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <IconComponent className="w-5 h-5" style={styles.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold mb-1.5 text-base" style={styles.title}>{current.title}</h3>
            <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--theme-text-secondary)' }}>{current.description}</p>
            {current.link && (
              <a
                href={current.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold hover:underline transition-all hover:gap-2"
                style={styles.icon}
              >
                {current.linkText || 'Learn more'}
                <Zap className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
        </div>

        {/* Next button */}
        <button
          onClick={goToNext}
          className="p-2 rounded-full transition-all shrink-0 shadow-lg hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--theme-glass-300) 90%, transparent)',
            color: 'var(--theme-text-primary)',
            border: '1px solid var(--theme-border)'
          }}
          title="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Progress hint */}
      <p
        className="mt-6 text-xs font-medium px-4 py-2 rounded-full"
        style={{
          color: 'var(--theme-text-secondary)',
          backgroundColor: 'color-mix(in srgb, var(--theme-glass-200) 80%, transparent)',
          border: '1px solid var(--theme-border-light)'
        }}
      >
        AI is crafting your interface • This usually takes 10-30 seconds
      </p>
    </div>
  );
});

export default GeneratingOverlay;
