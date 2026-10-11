import React from 'react';
import { ChatMessage, PlayerColor } from '../types.ts';
import { Send, MessageSquare, User } from 'lucide-react';

interface ChatPanelProps {
  disabled?: boolean;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  playerId: string;
  playerName: string;
  myColor: PlayerColor | 'spectator';
  className?: string;
  autoFocusInput?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  disabled = false,
  messages,
  onSendMessage,
  playerId,
  className = '',
  autoFocusInput = false,
}) => {
  const [inputText, setInputText] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input if requested
  React.useEffect(() => {
    if (autoFocusInput) {
      inputRef.current?.focus();
    }
  }, [autoFocusInput]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const formatTime = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Messages Scroll Area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 custom-scrollbar min-h-0 text-xs"
        tabIndex={0}
        aria-label="Chat messages list"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-center text-stone-400 dark:text-stone-500 py-8 px-4">
            <div className="p-3 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 mb-2">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="font-semibold text-stone-600 dark:text-stone-300 text-xs">No chat messages yet</p>
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 max-w-[200px]">
              Say hello, wish good luck, or discuss moves with your opponent!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === playerId;
            const isWhite = msg.senderColor === 'w';
            const isBlack = msg.senderColor === 'b';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[88%] ${isMe ? 'ml-auto' : 'mr-auto'}`}
              >
                {/* Sender Header */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px]">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      isWhite
                        ? 'bg-amber-100 border border-stone-400 shadow-2xs'
                        : isBlack
                        ? 'bg-stone-800 border border-stone-600'
                        : 'bg-purple-500'
                    }`}
                  />
                  <span className="font-bold text-stone-700 dark:text-stone-300 truncate max-w-[120px]">
                    {isMe ? 'You' : msg.senderName}
                  </span>
                  {msg.senderColor && msg.senderColor !== 'spectator' && (
                    <span className="text-[9px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-mono">
                      ({isWhite ? 'White' : 'Black'})
                    </span>
                  )}
                  <span className="text-[9px] text-stone-400 dark:text-stone-500 ml-1">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`p-2.5 rounded-2xl break-words text-xs shadow-2xs transition-colors ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-xs'
                      : 'bg-stone-100 dark:bg-stone-800/90 text-stone-800 dark:text-stone-100 border border-stone-200/80 dark:border-stone-700/80 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed select-text">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSend}
        className="pt-2 pb-1 px-2 border-t border-stone-100 dark:border-stone-800 flex items-center gap-1.5 shrink-0"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            aria-label="Chat message"
            disabled={disabled}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={500}
            placeholder={disabled ? 'Reconnecting…' : 'Type a message...'}
            className="match-chat-input w-full pl-3 pr-8 py-2 text-base lg:text-xs rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
          {inputText.length > 400 && (
            <span className="absolute right-2 top-2 text-[9px] text-stone-400 font-mono">
              {500 - inputText.length}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || !inputText.trim()}
          className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-xs"
          title="Send message"
          aria-label="Send message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
