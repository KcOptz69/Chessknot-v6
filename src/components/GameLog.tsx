import { GlassPanel } from './UI';
import React from 'react';
import { GameLogEntry } from '../types.ts';
import { ScrollText, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface GameLogProps {
  historyLog: GameLogEntry[];
  trapsEnabled?: boolean;
}

export const GameLog: React.FC<GameLogProps> = ({ historyLog, trapsEnabled=false }) => {
  // On mobile, users can toggle the log to save screen height while keeping quick access
  const [isExpandedMobile, setIsExpandedMobile] = React.useState<boolean>(false);

  const [trapOnly,setTrapOnly]=React.useState(false);
  const entries=trapsEnabled&&trapOnly?historyLog.filter(e=>
    ['mine','poison','banish','disarm'].includes(e.trapEventType||'') ||
    (!e.trapEventType&&e.actionType==='powerup'&&['Mine Trap','Poison Trap','Banish Trap','Disarm Trap'].includes(e.cardName||''))
  ):historyLog;
  const latestEntry = entries[0] || null;

  return (
    <GlassPanel id="game-history-log" className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col">
      <div
        onClick={() => setIsExpandedMobile((prev) => !prev)}
        className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 cursor-pointer lg:cursor-default"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
            <ScrollText className="w-4 h-4" />
          </div>
          <span className="text-xs uppercase tracking-wider font-extrabold text-stone-800 dark:text-stone-100 font-sans">
            Game & Card History Log
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-mono bg-stone-50 dark:bg-stone-800 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700">
            {entries.length} {entries.length === 1 ? 'event' : 'events'}
          </span>
          {/* Mobile Collapse/Expand Indicator */}
          <button
            type="button"
            className="lg:hidden p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            aria-label={isExpandedMobile ? 'Collapse log' : 'Expand log'}
          >
            {isExpandedMobile ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {trapsEnabled&&<div className="trap-log-filter" role="group" aria-label="Game log filter">
        <button aria-pressed={!trapOnly} onClick={()=>setTrapOnly(false)}>All</button>
        <button aria-pressed={trapOnly} onClick={()=>{setTrapOnly(true);setIsExpandedMobile(true);}}>Activated Traps</button>
      </div>}
      {/* Mobile Collapsed Preview: Show latest move only if collapsed */}
      {!isExpandedMobile && (
        <div className="lg:hidden pt-2">
          {latestEntry ? (
            <div className="p-2 rounded-xl bg-stone-50/80 dark:bg-stone-800/70 border border-stone-200/90 dark:border-stone-700/80 text-[11px] shadow-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    latestEntry.turn === 'w' ? 'bg-blue-300' : 'bg-stone-800 dark:bg-stone-200'
                  }`}
                />
                <span className="font-bold text-stone-800 dark:text-stone-200 shrink-0">
                  T{latestEntry.turnNumber}:
                </span>
                <span className="text-stone-600 dark:text-stone-300 truncate">
                  {latestEntry.detail}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpandedMobile(true);
                }}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0 hover:underline"
              >
                View all ({entries.length})
              </button>
            </div>
          ) : (
            <div className="text-stone-400 dark:text-stone-500 text-center py-2 text-xs">
              {trapOnly?'No activated traps yet.':'No moves recorded yet.'}
            </div>
          )}
        </div>
      )}

      {/* Full Log View (Always visible on desktop, toggleable on mobile) */}
      <div className={`overflow-y-auto space-y-2 pr-1 pt-2 text-xs custom-scrollbar max-h-[300px] lg:max-h-[440px] flex-1 ${
        isExpandedMobile ? 'block' : 'hidden lg:block'
      }`}>
        {entries.length === 0 ? (
          <div className="text-stone-400 dark:text-stone-500 text-center py-6 text-xs">{trapOnly?'No activated traps yet.':'No moves recorded yet.'}</div>
        ) : (
          entries.map((entry) => {
            const isWhite = entry.turn === 'w';
            const isPowerUpRefresh = entry.actionType === 'powerup_refresh';

            return (
              <div
                key={entry.id}
                className={`p-2.5 rounded-xl border transition-colors text-[11px] shadow-xs ${
                  isPowerUpRefresh
                    ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80 ring-1 ring-blue-400/40'
                    : 'bg-stone-50/80 dark:bg-stone-800/70 border-stone-200/90 dark:border-stone-700/80 hover:border-blue-300 dark:hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        isWhite ? 'bg-blue-100 dark:bg-blue-200 border border-blue-300 dark:border-blue-400' : 'bg-stone-800 dark:bg-stone-950 border border-stone-900 dark:border-stone-700'
                      }`}
                    />
                    <span className="font-bold text-stone-800 dark:text-stone-200">
                      Turn {entry.turnNumber} • {isWhite ? 'White' : 'Black'}
                    </span>
                  </div>

                  {entry.cardName && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                        isPowerUpRefresh
                          ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-600 font-extrabold'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      {entry.cardName}
                    </span>
                  )}
                </div>

                <div
                  className={`leading-snug font-medium ${
                    isPowerUpRefresh
                      ? 'text-blue-950 dark:text-blue-100 font-semibold'
                      : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {entry.detail}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-400 dark:text-stone-500 pt-1 border-t border-stone-200/60 dark:border-stone-700/60 font-mono">
                  <span>Army Points: W:{entry.whitePoints} | B:{entry.blackPoints}</span>
                  {entry.isCheck && (
                    <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-0.5">
                      <ShieldAlert className="w-3 h-3" /> CHECK
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassPanel>
  );
};
