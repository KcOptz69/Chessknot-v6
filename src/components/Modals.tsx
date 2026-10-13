import {cardDisplayName} from './CardArtwork.tsx';
import {useLoopMusic} from '../utils/music.ts';
import { Modal } from './UI';
import React from 'react';
import confetti from 'canvas-confetti';
import { Card, GameStatus, PlayerColor, PowerUpType } from '../types.ts';
import {X, Layers, Eye, RefreshCw, SkipForward, House} from 'lucide-react';
import { V5Piece } from './V5Art.tsx';

// --- VICTORY MODAL ---
interface VictoryModalProps {
  sharedDevice?: boolean;
  rematchPending?: boolean;
  status: GameStatus;
  winner: PlayerColor | 'draw' | null;
  winReason: string | null;
  myColor: PlayerColor | 'spectator';
  whitePoints: number;
  blackPoints: number;
  onRematch: () => void;
  onReturnToLobby?: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  status,
  sharedDevice,
  rematchPending,
  winner,
  winReason,
  myColor,
  whitePoints,
  blackPoints,
  onRematch,
  onReturnToLobby,
}) => {
  const [boardVisible, setBoardVisible] = React.useState(false);
  React.useEffect(() => {setBoardVisible(false);}, [status, winner]);
  const ended = !['playing', 'waiting', 'lobby'].includes(status);
  useLoopMusic(ended && !boardVisible && winner && winner !== 'draw' ? (sharedDevice || myColor === 'spectator' || winner === myColor ? 'victory' : 'defeat') : null);
  React.useEffect(() => {
    if (ended && !boardVisible && winner && winner !== 'draw' && (sharedDevice || myColor==='spectator' || winner===myColor)) {
      confetti({
        disableForReducedMotion: true,
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
    }
  }, [winner, status]);

  if (!ended) return null;
  if (boardVisible) return <button className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 rounded-xl px-4 py-2 bg-blue-600 text-white font-bold shadow-lg" onClick={() => setBoardVisible(false)}>Show Result</button>;

  const isDraw = winner === 'draw';
  const isWinner = sharedDevice || myColor === 'spectator' || winner === myColor;
  const winnerName = winner === 'w' ? 'White' : 'Black';
  const pieceColor = isWinner ? (winner==='b'?'b':'w') : (myColor==='b'?'b':'w');
  return <Modal className="result-backdrop">
    <section className={`result-dialog ${isDraw?'result-draw':isWinner?'result-victory':'result-defeat'}`} role="dialog" aria-modal="true" aria-label="Match result">
      <button className="result-close" aria-label="Close result" onClick={()=>setBoardVisible(true)}>×</button>
      <div className="result-art" aria-hidden="true">
        {isDraw ? <V5Piece type="k" color={pieceColor} className="result-king" /> : <img className="result-hero" src={`/images/results/${isWinner?'victory':'defeat'}-${pieceColor==='w'?'white':'black'}.webp`} alt="" draggable={false} />}
      </div>
      <h2 data-title={isDraw?'DRAW':isWinner?'VICTORY':'DEFEAT'}><span>{isDraw?'DRAW':isWinner?'VICTORY':'DEFEAT'}</span></h2>
      <h3>{isDraw?'A match well fought':`${winnerName} wins`}</h3>
      <p className="result-reason">{winReason || 'Game completed.'}</p>
      <div className="result-army"><h4>Remaining army</h4><div><span>White<strong>{whitePoints} pts</strong></span><span>Black<strong>{blackPoints} pts</strong></span></div></div>
      {myColor!=='spectator'&&<button id="btn-victory-rematch" className="result-primary" onClick={onRematch} disabled={rematchPending}><RefreshCw aria-hidden="true" />{rematchPending?'Waiting for response…':sharedDevice?'Rematch':'Request Rematch'}</button>}
      <div className="result-secondary-actions"><button id="btn-victory-view-board" onClick={()=>setBoardVisible(true)}><Eye aria-hidden="true" />View Board</button>{onReturnToLobby&&<button id="btn-victory-lobby" onClick={onReturnToLobby}><House aria-hidden="true" />Lobby</button>}</div>
    </section>
  </Modal>;
};

// --- DISCARD MODAL (DRAW 2, DISCARD 2) ---
interface DiscardModalProps {
  hand: Card[];
  isOpen: boolean;
  newCardIds?: string[];
  onConfirmDiscard: (discardIds: [string, string]) => void;
  onCancel: () => void;
}

export const DiscardModal: React.FC<DiscardModalProps> = ({
  hand,
  isOpen,
  newCardIds = [],
  onConfirmDiscard,
  onCancel,
}) => {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelectedIds([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else if (selectedIds.length < 2) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
      <div data-tutorial-dialog="exchange" role="dialog" aria-modal="true" aria-label="Exchange" className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-lg w-full shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans">Exchange: Choose 2 Cards to Discard</h3>
          </div>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400 mb-3">
          You drew 2 fresh cards from the shared deck. Choose any 2 cards to discard (including the 2 new cards you just drew!). ({selectedIds.length}/2 selected):
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 mb-5 custom-scrollbar">
          {hand.map((c) => {
            const isSelected = selectedIds.includes(c.id);
            const isJustDrawn = newCardIds.includes(c.id);
            return (
              <button
                key={c.id}
                data-discard-card-id={c.id} data-discard-card-type={c.type} aria-pressed={isSelected}
                type="button"
                onClick={() => toggleSelect(c.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs relative ${
                  isSelected
                    ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/50 ring-2 ring-red-300 dark:ring-red-800 text-red-950 dark:text-red-200'
                    : isJustDrawn
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/40 hover:border-blue-400 text-stone-800 dark:text-stone-200'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/60 hover:border-stone-300 dark:hover:border-stone-600 text-stone-800 dark:text-stone-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1 gap-1">
                  <span className="text-xs font-bold truncate">{cardDisplayName(c)}</span>
                  {isSelected ? (
                    <span className="text-[10px] font-extrabold text-red-700 dark:text-red-400 shrink-0">DISCARD</span>
                  ) : isJustDrawn ? (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-400/40 shrink-0">
                      NEW
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-stone-500 dark:text-stone-400 line-clamp-2 leading-tight">{c.description}</p>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            id="btn-confirm-discard"
            type="button"
            disabled={selectedIds.length !== 2}
            onClick={() => {
              if (selectedIds.length === 2) {
                onConfirmDiscard([selectedIds[0], selectedIds[1]]);
              }
            }}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs ${
              selectedIds.length === 2
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
            }`}
          >
            Discard 2 Cards
          </button>
        </div>
      </div>
    </Modal>
  );
};

// --- DISCARD & REDRAW MODAL (Counts as a Move) ---
interface DiscardRedrawModalProps {
  hand: Card[];
  maxCards?: number;
  isOpen: boolean;
  onConfirm: (selectedCardIds: string[]) => void;
  onPassTurn?: () => void;
  onCancel: () => void;
}

export const DiscardRedrawModal: React.FC<DiscardRedrawModalProps> = ({
  hand,
  maxCards=5,
  isOpen,
  onConfirm,
  onPassTurn,
  onCancel,
}) => {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelectedIds([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else if (selectedIds.length < maxCards) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    const ids = hand.slice(0, maxCards).map((c) => c.id);
    setSelectedIds(ids);
  };

  const clearAll = () => {
    setSelectedIds([]);
  };

  return (
    <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
      <div data-tutorial-dialog="redraw" role="dialog" aria-modal="true" aria-label="Discard and redraw" className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-lg w-full shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans flex items-center gap-1.5">
                Discard & Redraw Hand
              </h3>
              <span className="text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
                Counts as your Move • Advances the turn
              </span>
            </div>
          </div>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400 mb-3">
          Select up to {maxCards} cards to discard and redraw from the deck (counts as your move), or choose to pass the turn without exchanging cards:
        </p>

        {/* Quick select buttons */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-stone-500 dark:text-stone-400 font-medium">
            Selected: <strong className="text-teal-800 dark:text-teal-400 font-bold">{selectedIds.length}</strong> / up to {maxCards} cards
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 font-bold hover:underline cursor-pointer"
            >
              Select All ({Math.min(hand.length, maxCards)})
            </button>
            <span className="text-stone-300 dark:text-stone-600">•</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 font-bold hover:underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 mb-5 custom-scrollbar">
          {hand.map((c) => {
            const isSelected = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                data-discard-card-id={c.id} data-discard-card-type={c.type} aria-pressed={isSelected}
                type="button"
                onClick={() => toggleSelect(c.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer select-none relative shadow-xs ${
                  isSelected
                    ? 'border-teal-500 dark:border-teal-600 bg-teal-50 dark:bg-teal-950/50 ring-2 ring-teal-300 dark:ring-teal-800 text-teal-950 dark:text-teal-200 shadow-sm'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/60 hover:border-stone-300 dark:hover:border-stone-600 text-stone-800 dark:text-stone-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold truncate">{cardDisplayName(c)}</span>
                  {isSelected ? (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-teal-600 text-white shadow-xs">
                      REDRAW
                    </span>
                  ) : (
                    <span className="text-[10px] text-stone-400 font-mono">KEEP</span>
                  )}
                </div>
                <p className="text-[10px] text-stone-500 dark:text-stone-400 line-clamp-2 leading-tight">{c.description}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 cursor-pointer shadow-xs"
            >
              Cancel
            </button>

            {/* Pass Turn Option (No card exchange) */}
            {onPassTurn && (
              <button
                id="btn-pass-turn-modal"
                type="button"
                onClick={onPassTurn}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-stone-700 dark:text-stone-300 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-semibold border border-stone-200 dark:border-stone-700 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-colors shadow-xs"
                title="Pass the turn without discarding or redrawing any cards"
              >
                <SkipForward className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Pass Turn Only (No redraw)</span>
              </button>
            )}
          </div>

          <button
            id="btn-confirm-discard-redraw"
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => {
              if (selectedIds.length > 0) {
                onConfirm(selectedIds);
              }
            }}
            className={`flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs ${
              selectedIds.length > 0
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-sm active:scale-95'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {selectedIds.length === 0
                ? 'Select Cards to Redraw'
                : `Discard & Redraw ${selectedIds.length} Card${selectedIds.length > 1 ? 's' : ''}`}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Rulebook keeps its existing public props so lobby and in-game callers stay compatible.
export {Rulebook as RulesModal} from './Rulebook.tsx';

// --- CLOCK CONFIGURATION ---
interface ClockConfigModalProps {
  isOpen: boolean;
  clock: {
    enabled: boolean;
    initialMinutes: number;
    incrementSeconds: number;
  };
  onSave: (enabled: boolean, initialMinutes: number, incrementSeconds: number) => void;
  onClose: () => void;
}

export const ClockConfigModal: React.FC<ClockConfigModalProps> = ({
  isOpen,
  clock,
  onSave,
  onClose,
}) => {
  const [enabled, setEnabled] = React.useState(clock.enabled);
  const [initialMinutes, setInitialMinutes] = React.useState(clock.initialMinutes || 5);
  const [incrementSeconds, setIncrementSeconds] = React.useState(clock.incrementSeconds || 0);

  React.useEffect(() => {
    setEnabled(clock.enabled);
    setInitialMinutes(clock.initialMinutes || 5);
    setIncrementSeconds(clock.incrementSeconds || 0);
  }, [isOpen, clock]);

  if (!isOpen) return null;

  const presets = [
    { label: '1 Min Bullet', mins: 1, inc: 0 },
    { label: '3 | 2 Blitz', mins: 3, inc: 2 },
    { label: '5 Min Rapid', mins: 5, inc: 0 },
    { label: '5 | 3 Rapid', mins: 5, inc: 3 },
    { label: '10 Min Standard', mins: 10, inc: 0 },
    { label: '15 | 10 Classical', mins: 15, inc: 10 },
  ];

  return (
    <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏱️</span>
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans">
              Chess Clock Configuration
            </h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-stone-700 dark:text-stone-300">
          {/* Toggle Enabled */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xs">
            <div>
              <span className="font-bold text-stone-900 dark:text-stone-100 text-sm block">Use Chess Clock</span>
              <span className="text-stone-500 dark:text-stone-400 text-[11px]">
                {enabled ? 'Active: Players must manage their time' : 'Disabled: Casual unlimited play'}
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-clock"
              onClick={() => setEnabled(!enabled)}
              className={`w-12 h-6 rounded-full transition-colors p-1 cursor-pointer flex items-center ${
                enabled ? 'bg-blue-500 justify-end' : 'bg-stone-300 dark:bg-stone-700 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          {enabled && (
            <>
              {/* Presets */}
              <div>
                <label className="block text-[11px] uppercase font-bold text-stone-500 dark:text-stone-400 mb-2 font-sans tracking-wider">
                  Time Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {presets.map((p) => {
                    const isSelected = initialMinutes === p.mins && incrementSeconds === p.inc;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setInitialMinutes(p.mins);
                          setIncrementSeconds(p.inc);
                        }}
                        className={`p-2.5 rounded-xl text-center border font-semibold transition-all cursor-pointer shadow-xs ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 text-blue-900 dark:text-blue-300 ring-2 ring-blue-300 dark:ring-blue-600 font-bold'
                            : 'bg-stone-50/70 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Settings */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-stone-500 dark:text-stone-400 mb-1 font-sans tracking-wider">
                    Initial Minutes
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={initialMinutes}
                    onChange={(e) => setInitialMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-stone-900 dark:text-stone-100 font-mono text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-bold text-stone-500 dark:text-stone-400 mb-1 font-sans tracking-wider">
                    Increment (Seconds)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={incrementSeconds}
                    onChange={(e) => setIncrementSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-stone-900 dark:text-stone-100 font-mono text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2.5 pt-4 border-t border-stone-100 dark:border-stone-800 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 text-xs font-bold border border-stone-200 dark:border-stone-700 cursor-pointer shadow-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-save-clock-config"
            onClick={() => {
              onSave(enabled, initialMinutes, incrementSeconds);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-extrabold cursor-pointer shadow-xs"
          >
            Apply Clock Settings
          </button>
        </div>
      </div>
    </Modal>
  );
};

// --- LOBBY / ROOM MODAL ---
interface LobbyModalProps {
  isOpen: boolean;
  onJoinRoom: (roomId: string, mode: 'online' | 'pass_and_play') => void;
  onClose: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  isOpen,
  onJoinRoom,
  onClose,
}) => {
  const [inputCode, setInputCode] = React.useState('');

  if (!isOpen) return null;

  return (
    <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-4">
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans">
            JOIN ONLINE MATCH
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Option 2: 2-Device Online Multiplayer */}
          <div className="p-4 rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/60 hover:border-blue-300 dark:hover:border-blue-600 transition-colors shadow-xs">
            <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm mb-1">2-Device Online Match</h4>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
              Create or join a room code to play with a friend on 2 separate phones, laptops, or tablets!
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter 6-char Room Code"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="flex-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 uppercase font-mono tracking-wider focus:outline-none focus:border-blue-400"
              />
              <button
                disabled={!inputCode.trim()}
                onClick={() => onJoinRoom(inputCode.trim(), 'online')}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-xs ${
                  inputCode.trim()
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-stone-200 dark:bg-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed'
                }`}
              >
                Join
              </button>
            </div>

            <div className="mt-2.5 text-center">
              <span className="text-[11px] text-stone-400">or</span>
              <button
                onClick={() => {
                  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                  onJoinRoom(newCode, 'online');
                }}
                className="block w-full mt-1 text-xs text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2 cursor-pointer font-semibold"
              >
                Create New Random Online Room
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
