import { Modal } from './UI';
import { X } from 'lucide-react';
import {GroundReminder} from './GroundsUI.tsx';
import type {Grounds} from '../utils/grounds.ts';
import React from 'react';
import { PlayerColor, GameStatus, GameClockState } from '../types.ts';
import { Check, BookOpen, Flag, Share2, Timer, Volume2, VolumeX, Settings, Sun, Moon } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled } from '../utils/audio.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface GameHeaderProps {
  compact?: boolean;
  viewerTools?:React.ReactNode;
  isArbiter?:boolean;
  arbiterPaused?:boolean;
  onToggleArbiterPause?:()=>void;
  grounds?: Grounds;
  onOpenGrounds?: ()=>void;
  roomTools?: React.ReactNode;
  roomId: string;
  myColor: PlayerColor | 'spectator';
  turn: PlayerColor;
  mode: 'online' | 'pass_and_play';
  whitePoints: number;
  blackPoints: number;
  status: GameStatus;
  clock: GameClockState;
  isCheck?: boolean;
  onOpenRules: () => void;
  onOpenClockConfig: () => void;
  onResign: () => void;
  onSwitchMode: (mode: 'online' | 'pass_and_play') => void;
  onReturnToLobby?: () => void;
}

function formatClockTime(sec: number): string {
  if (!sec || sec <= 0 || isNaN(sec)) return '00:00';
  const totalSec = Math.floor(sec);
  const mins = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  compact = false,viewerTools,isArbiter=false,arbiterPaused=false,onToggleArbiterPause,
  roomTools,
  roomId,
  myColor,
  turn,
  mode,
  whitePoints,
  blackPoints,
  status,
  grounds,onOpenGrounds,
  clock,
  isCheck = false,
  onOpenRules,
  onOpenClockConfig,
  onResign,
  onSwitchMode,
  onReturnToLobby,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(() => isSoundEnabled());

  // Real-time ticking chess clock state
  const [liveW, setLiveW] = React.useState<number>(() => Math.floor(clock?.w ?? 0));
  const [liveB, setLiveB] = React.useState<number>(() => Math.floor(clock?.b ?? 0));

  // Sync whenever server clock values, turn, or status changes
  React.useEffect(() => {
    setLiveW(Math.floor(clock?.w ?? 0));
    setLiveB(Math.floor(clock?.b ?? 0));
  }, [clock?.w, clock?.b, clock?.lastTick, turn, status]);

  // Real-time 1-second countdown ticker when game is actively playing
  React.useEffect(() => {
    if (status !== 'playing' || !clock?.enabled || !clock?.isRunning) return;

    const interval = setInterval(() => {
      if (turn === 'w') {
        setLiveW((prev) => Math.max(0, prev - 1));
      } else {
        setLiveB((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, clock?.enabled, clock?.isRunning, turn]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isMyTurn = mode === 'pass_and_play' || myColor === turn;

  const whiteLowTime = clock.enabled && liveW <= 30;
  const blackLowTime = clock.enabled && liveB <= 30;

  return (
    <header className="w-full bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/90 dark:border-stone-800 px-3 sm:px-4 py-2 sm:py-2.5 shadow-xs transition-colors safe-top">
      <div className="header-layout max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-2.5 sm:gap-3">
        {/* Row 1 on Mobile / Left on Desktop: Brand, Room, Mode & Quick Actions */}
        <div className="header-brand-row flex items-center justify-between w-full lg:w-auto gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center p-1 shadow-xs shrink-0">
              <img src="/logo.png?v=5-blue-knot" alt="ChessKnot Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-lg sm:text-xl font-black tracking-wider text-stone-900 dark:text-stone-100 font-sans leading-none">
                ChessKnot
              </h1>
              <div className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-medium leading-none mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">made by Kaze</span>
              </div>
            </div>
          </div>


          <button className="compact-options-button" aria-label="Open options" onClick={()=>setOptionsOpen(true)}><Settings size={20}/></button>

        </div>

        {/* Center on Desktop / Row 2 on Mobile: Clocks & Army Points */}
        <div className="header-clock-row flex items-center justify-between lg:justify-center gap-2 sm:gap-3 w-full lg:w-auto">
          <div className="header-viewing-group"><GroundReminder compact={compact} grounds={grounds} onOpen={onOpenGrounds}/>{viewerTools}</div>
          {/* Chess Clocks */}
          {clock.enabled && (
            <div className="header-clock-pair flex items-center gap-1 sm:gap-1.5 bg-stone-50 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 px-2 sm:px-2.5 py-1 rounded-xl shadow-xs shrink-0">
              {isArbiter&&<button className="arbiter-clock-toggle" aria-label={arbiterPaused?'Resume match clock':'Pause match clock'} onClick={onToggleArbiterPause}>{arbiterPaused?'Resume':'Pause'}</button>}{arbiterPaused&&<span className="arbiter-clock-state">PAUSED</span>}
              {/* White Clock */}
              <div
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border font-mono font-black text-[11px] sm:text-xs transition-all ${
                  turn === 'w' && status === 'playing'
                    ? whiteLowTime
                      ? 'bg-red-50 dark:bg-red-950/80 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-400 animate-pulse'
                      : 'bg-blue-50 dark:bg-blue-950/70 border-blue-400 text-blue-900 dark:text-blue-300 ring-1 ring-blue-300'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 opacity-90'
                }`}
                title={`White Time: ${liveW}s remaining`}
              >
                <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-stone-100 dark:bg-stone-300 border border-stone-400 inline-block shadow-xs" />
                <span>{formatClockTime(liveW)}</span>
              </div>

              {/* Black Clock */}
              <div
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border font-mono font-black text-[11px] sm:text-xs transition-all ${
                  turn === 'b' && status === 'playing'
                    ? blackLowTime
                      ? 'bg-red-50 dark:bg-red-950/80 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-400 animate-pulse'
                      : 'bg-blue-50 dark:bg-blue-950/70 border-blue-400 text-blue-900 dark:text-blue-300 ring-1 ring-blue-300'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 opacity-90'
                }`}
                title={`Black Time: ${liveB}s remaining`}
              >
                <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-stone-900 dark:bg-stone-950 border border-stone-600 inline-block shadow-xs" />
                <span>{formatClockTime(liveB)}</span>
              </div>

              {/* Clock settings button */}
              <button
                id="btn-open-clock-config"
                onClick={onOpenClockConfig}
                className="p-0.5 sm:p-1 rounded text-stone-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                title="Configure Chess Clock"
              >
                <Timer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}

          {!clock.enabled && (
            <button
              id="btn-enable-clock"
              onClick={onOpenClockConfig}
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200/80 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-[11px] font-semibold cursor-pointer transition-colors shadow-xs shrink-0"
              title="Add Chess Clock"
            >
              <Timer className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden xs:inline">Add Clock</span>
            </button>
          )}

          {/* Turn Indicator (compact on mobile) */}
          <div className={`header-turn-marker ${compact?'hidden':'flex'} items-center gap-1.5 lg:hidden shrink-0`}>
            {isCheck && status === 'playing' && (
              <div
                id="header-check-badge-mobile"
                className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-[10px] font-black tracking-wider uppercase shadow-xs border border-red-500 animate-pulse flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>CHECK</span>
              </div>
            )}
            <div
              className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                isMyTurn
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-600 text-blue-900 dark:text-blue-300 shadow-xs ring-1 ring-blue-300/80 dark:ring-blue-500/50'
                  : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  turn === 'w' ? 'bg-stone-100 dark:bg-stone-200 border border-stone-300 shadow-xs' : 'bg-stone-800 border border-stone-600'
                }`}
              />
              <span className="whitespace-nowrap">
                {compact ? (mode==='pass_and_play'?(turn==='w'?'White':'Black'):(isMyTurn?'You':'Opp')) : `${turn==='w'?'White':'Black'}'s turn`}
              </span>
            </div>
          </div>
        </div>

        {/* Right on Desktop: Turn Status & Quick Actions */}
        <div className={`header-legacy-actions ${compact ? 'hidden' : 'hidden lg:flex'} items-center gap-2`}>
          {/* King In Check Indicator */}
          {isCheck && status === 'playing' && (
            <div
              id="header-check-badge"
              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-black tracking-wider uppercase shadow-xs border border-red-500 animate-pulse flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>CHECK!</span>
            </div>
          )}

          {/* Turn Indicator */}
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all ${
              isMyTurn
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-600 text-blue-900 dark:text-blue-300 shadow-xs ring-1 ring-blue-300/80 dark:ring-blue-500/50'
                : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                turn === 'w' ? 'bg-stone-100 dark:bg-stone-200 border border-stone-300 shadow-xs' : 'bg-stone-800 border border-stone-600'
              }`}
            />
            <span>
              {mode === 'pass_and_play'
                ? `${turn === 'w' ? "White's" : "Black's"} Turn`
                : isMyTurn
                ? 'Your Turn!'
                : "Opponent's Turn"}
            </span>
          </div>

          {/* Theme Toggle (Light / Dark Mode) */}
          <button
            id="btn-toggle-theme"
            onClick={toggleTheme}
            className="p-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shadow-xs"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-blue-400" />
            ) : (
              <Moon className="w-4 h-4 text-stone-700" />
            )}
          </button>

          {/* Sound Cue Toggle */}
          <button
            id="btn-toggle-sound"
            onClick={toggleSound}
            className={`p-2 rounded-lg border transition-colors cursor-pointer shadow-xs ${
              soundOn
                ? 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-blue-600 dark:text-blue-400 border-stone-200 dark:border-stone-700'
                : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-900 dark:hover:bg-stone-800 text-stone-400 border-stone-200 dark:border-stone-700'
            }`}
            title={soundOn ? 'Sound Cues Enabled (Click to Mute)' : 'Sound Cues Muted (Click to Unmute)'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Rules Button */}
          <button
            id="btn-rules"
            onClick={onOpenRules}
            className="p-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shadow-xs"
            title="Read Rules & Cards"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Restart / New Game */}
          <button
            id="btn-resign"
            onClick={myColor==='spectator'?onReturnToLobby:onResign}
            className="p-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shadow-xs"
            title={myColor==='spectator'?'Quit viewing':'Resign match'} aria-label={myColor==='spectator'?'Quit viewing':'Resign match'} disabled={myColor!=='spectator'&&status !== 'playing'}
          >
            <Flag className="w-4 h-4" /><span className="text-xs">{myColor==='spectator'?'Quit viewing':'Resign'}</span>
          </button>
        </div>
      </div>
      {optionsOpen && <Modal className="compact-modal-backdrop" onClick={()=>setOptionsOpen(false)}><section className="compact-dialog" onClick={e=>e.stopPropagation()}><div className="compact-dialog-heading"><h2>Options</h2><button aria-label="Close dialog" onClick={()=>setOptionsOpen(false)}><X size={20}/></button></div><div className="compact-info-list"><button onClick={toggleTheme}><Sun/><span>Light / Dark</span><strong>{isDark?'Dark':'Light'}</strong></button><button onClick={toggleSound}><Volume2/><span>Mute sound</span><strong>{soundOn?'Off':'On'}</strong></button><button onClick={()=>{setOptionsOpen(false);onOpenRules();}}><BookOpen/><span>Rules</span><span>›</span></button><button className="compact-resign" disabled={myColor!=='spectator'&&status!=='playing'} onClick={()=>{setOptionsOpen(false);if(myColor==='spectator')onReturnToLobby?.();else onResign();}}><Flag/><span>{myColor==='spectator'?'Quit viewing':'Resign'}</span></button></div><div className="compact-options-footer"><div><strong>Online 2-player</strong><small>Room: {roomId}</small></div><button onClick={()=>{if(myColor==='spectator'||status!=='playing'||window.confirm('Exit this match and return to the lobby?')){setOptionsOpen(false);onReturnToLobby?.();}}}>Exit</button></div></section></Modal>}
    </header>
  );
};

