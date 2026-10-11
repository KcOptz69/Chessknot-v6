import React from 'react';
import { ChatMessage, PlayerColor } from '../types.ts';
import { ChatPanel } from './ChatPanel.tsx';
import { PopupLayer } from './UI.tsx';
import { X, MessageSquare, ChevronDown } from 'lucide-react';

interface ChatDrawerProps {
  disabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  playerId: string;
  playerName: string;
  myColor: PlayerColor | 'spectator';
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  disabled = false,
  messages,
  onSendMessage,
  playerId,
  playerName,
  myColor,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  React.useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || []);
      const first=nodes[0], last=nodes.at(-1);
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown',trap);
    return () => {document.removeEventListener('keydown',trap);previous?.focus();};
  }, [isOpen]);
  const [dragY, setDragY] = React.useState<number>(0);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const touchStartY = React.useRef<number | null>(null);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch handlers for swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartY.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (dragY > 60) {
      onClose();
    }
    setDragY(0);
    setIsDragging(false);
    touchStartY.current = null;
  };

  if (!isOpen) return null;

  return (
    <PopupLayer><div className="match-chat-layer">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[12000] bg-black/50 backdrop-blur-2xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={dialogRef}
        style={{
          transform: `translateY(${Math.max(0, dragY)}px)`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="fixed inset-x-0 bottom-0 z-[12001] flex flex-col bg-white dark:bg-stone-900 rounded-t-2xl shadow-2xl border-t border-stone-200 dark:border-stone-800 safe-bottom max-h-[80dvh] h-[480px]"
        role="dialog"
        aria-modal="true"
        aria-label="Match Chat Drawer"
      >
        {/* Swipe Down Area & Header */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pt-2 pb-2.5 px-4 border-b border-stone-100 dark:border-stone-800 flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          {/* Drag Handle Indicator */}
          <div className="w-12 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full mx-auto mb-1 transition-colors" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="font-bold text-xs uppercase tracking-wider text-stone-900 dark:text-stone-100">
                Match Chat
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                ({messages.length} {messages.length === 1 ? 'msg' : 'msgs'})
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[10px] text-stone-400 mr-1 flex items-center gap-0.5">
                <ChevronDown className="w-3 h-3 text-stone-400" />
                <span>Swipe down to close</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Panel Content */}
        <div className="flex-1 min-h-0 p-1">
          <ChatPanel
            disabled={disabled}
            messages={messages}
            onSendMessage={onSendMessage}
            playerId={playerId}
            playerName={playerName}
            myColor={myColor}
            autoFocusInput={false}
          />
        </div>
      </div>
    </div></PopupLayer>
  );
};
