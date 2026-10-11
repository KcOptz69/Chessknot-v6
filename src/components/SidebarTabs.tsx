import React from 'react';
import { ChatMessage, GameLogEntry, PlayerColor } from '../types.ts';
import { GameLog } from './GameLog.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { GlassPanel } from './UI.tsx';
import { ScrollText, MessageSquare } from 'lucide-react';

interface SidebarTabsProps {
  mode: 'online' | 'pass_and_play';
  historyLog: GameLogEntry[];
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  playerId: string;
  playerName: string;
  myColor: PlayerColor | 'spectator';
  unreadCount: number;
  activeTab: 'log' | 'chat';
  onTabChange: (tab: 'log' | 'chat') => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({
  mode,
  historyLog,
  chatMessages,
  onSendMessage,
  playerId,
  playerName,
  myColor,
  unreadCount,
  activeTab,
  onTabChange,
}) => {
  // Pass & Play: hide chat completely as both players share the device
  if (mode === 'pass_and_play') {
    return <GameLog historyLog={historyLog} />;
  }

  return (
    <div id="game-history-log" className="flex flex-col gap-2">
      {/* Tabs Header */}
      <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700/80">
        <button
          type="button"
          onClick={() => onTabChange('log')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'log'
              ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs border border-stone-200/80 dark:border-stone-700'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
          aria-label="View Game Log"
        >
          <ScrollText className="w-3.5 h-3.5 text-blue-500" />
          <span>Game Log</span>
          <span className="text-[10px] py-0.5 px-1.5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-mono">
            {historyLog.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('chat')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors relative cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs border border-stone-200/80 dark:border-stone-700'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
          aria-label="View Chat"
        >
          <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
          <span>Chat</span>
          {unreadCount > 0 && activeTab !== 'chat' && (
            <span className="min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'log' ? (
        <GameLog historyLog={historyLog} />
      ) : (
        <GlassPanel className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col h-[340px] lg:h-[440px]">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-xs uppercase tracking-wider font-extrabold text-stone-800 dark:text-stone-100 font-sans">
                Match Chat
              </span>
            </div>
            <span className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-mono bg-stone-50 dark:bg-stone-800 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700">
              {chatMessages.length} {chatMessages.length === 1 ? 'msg' : 'msgs'}
            </span>
          </div>
          <div className="flex-1 min-h-0 pt-1">
            <ChatPanel
              messages={chatMessages}
              onSendMessage={onSendMessage}
              playerId={playerId}
              playerName={playerName}
              myColor={myColor}
            />
          </div>
        </GlassPanel>
      )}
    </div>
  );
};
