/**
 * ChatTimeline - Time travel navigation through file snapshots
 *
 * Allows navigating between assistant message snapshots to view/restore
 * previous file states without creating history entries.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Clock, History } from 'lucide-react';
import { ChatMessage } from '../../types';

interface ChatTimelineProps {
  messages: ChatMessage[];
  currentViewIndex: number | null;  // null = viewing current state
  onNavigate: (messageIndex: number | null) => void;
}

export const ChatTimeline: React.FC<ChatTimelineProps> = ({
  messages,
  currentViewIndex,
  onNavigate
}) => {
  // Get assistant messages with snapshots (valid navigation points)
  const snapshotMessages = messages
    .map((m, i) => ({ message: m, index: i }))
    .filter(({ message }) => message.role === 'assistant' && message.snapshotFiles);

  if (snapshotMessages.length === 0) return null;

  // Find current position in snapshot list
  const currentPos = currentViewIndex !== null
    ? snapshotMessages.findIndex(s => s.index === currentViewIndex)
    : snapshotMessages.length; // "current" is after all snapshots

  const canGoBack = currentPos > 0;
  const canGoForward = currentPos < snapshotMessages.length;

  const handleBack = () => {
    if (canGoBack) {
      const prev = snapshotMessages[currentPos - 1];
      if (prev) onNavigate(prev.index);
    }
  };

  const handleForward = () => {
    if (currentPos < snapshotMessages.length - 1) {
      // Go to next snapshot
      const next = snapshotMessages[currentPos + 1];
      if (next) onNavigate(next.index);
    } else {
      // Return to current state
      onNavigate(null);
    }
  };

  // Get display label
  const getLabel = () => {
    if (currentViewIndex === null) {
      return 'Current';
    }
    return `State ${currentPos + 1}/${snapshotMessages.length}`;
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--theme-glass-200)', border: '1px solid var(--theme-border-light)' }}>
      <button
        onClick={handleBack}
        disabled={!canGoBack}
        className="p-1 rounded transition-colors"
        style={{
          color: canGoBack ? 'var(--theme-text-secondary)' : 'var(--theme-text-dim)',
          cursor: canGoBack ? 'pointer' : 'not-allowed'
        }}
        title="Previous state"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1.5 px-2 min-w-[90px] justify-center">
        {currentViewIndex !== null ? (
          <History className="w-3 h-3" style={{ color: 'var(--color-warning)' }} />
        ) : (
          <Clock className="w-3 h-3" style={{ color: 'var(--theme-text-muted)' }} />
        )}
        <span
          className="text-xs"
          style={{
            color: currentViewIndex !== null ? 'var(--color-warning)' : 'var(--theme-text-muted)',
            fontWeight: currentViewIndex !== null ? 500 : 400
          }}
        >
          {getLabel()}
        </span>
      </div>

      <button
        onClick={handleForward}
        disabled={!canGoForward}
        className="p-1 rounded transition-colors"
        style={{
          color: canGoForward ? 'var(--theme-text-secondary)' : 'var(--theme-text-dim)',
          cursor: canGoForward ? 'pointer' : 'not-allowed'
        }}
        title={currentPos < snapshotMessages.length - 1 ? "Next state" : "Return to current"}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ChatTimeline;
