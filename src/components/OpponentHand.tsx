import {CardArtwork} from './CardArtwork.tsx';
import type { Grounds, GroundType } from '../utils/grounds.ts';
import { GROUND_NAMES } from '../utils/grounds.ts';
import { V5Power, V5Piece } from './V5Art.tsx';
import React from 'react';
import { PopupLayer } from './UI';
import { Card, ChampionPiece, PowerUpsState } from '../types.ts';
import { Zap, X } from 'lucide-react';

interface OpponentHandProps {
  hidePowerButton?: boolean;
  openRequest?: number;
  grounds?: Grounds;
  color?: "w" | "b";
  hand: Card[];
  champion?: ChampionPiece|null;
  isVisionActive: boolean;
  alwaysReveal?: boolean;
  opponentName: string;
  opponentPowerUps?: PowerUpsState | {
    draw: boolean | number;
    monolith: boolean | number;
    wild: boolean | number;
    vision: boolean | number;
  };
  hasShiftedParadigm?: boolean;
  hasChampionsOfTheMonolith?: boolean;
}

export const OpponentHand: React.FC<OpponentHandProps> = ({
  hidePowerButton = false, openRequest = 0,
  grounds,
  color = "b",
  hand,champion,
  isVisionActive,
  alwaysReveal = false,
  opponentName,
  opponentPowerUps = { draw: 1, monolith: 1, wild: 1, vision: 1 },
  hasShiftedParadigm = true,
  hasChampionsOfTheMonolith = true,
}) => {
  const [visionOpen,setVisionOpen]=React.useState(isVisionActive && !alwaysReveal);
  const [inspectedCardId,setInspectedCardId]=React.useState<string|null>(null);
  React.useEffect(()=>{setVisionOpen(isVisionActive && !alwaysReveal);setInspectedCardId(null);},[isVisionActive,alwaysReveal]);
  const inspectedCard=hand.find(card=>card.id===inspectedCardId);
  const [open, setOpen] = React.useState(false);
  React.useEffect(()=>{if(openRequest)setOpen(true);},[openRequest]);
  const showMonolithPowerUp = hasShiftedParadigm || hasChampionsOfTheMonolith;

  const drawCount = typeof opponentPowerUps.draw === 'number' ? opponentPowerUps.draw : opponentPowerUps.draw ? 1 : 0;
  const monolithCount = typeof opponentPowerUps.monolith === 'number' ? opponentPowerUps.monolith : opponentPowerUps.monolith ? 1 : 0;
  const wildCount = typeof opponentPowerUps.wild === 'number' ? opponentPowerUps.wild : opponentPowerUps.wild ? 1 : 0;
  const visionCount = typeof opponentPowerUps.vision === 'number' ? opponentPowerUps.vision : opponentPowerUps.vision ? 1 : 0;

  return (
    <>
      <div className="opponent-tag-actions">
      {isVisionActive && <button type="button" className="vision-reopen" onClick={()=>setVisionOpen(true)} aria-label="Reopen revealed cards"><V5Power type="vision" className="w-6 h-6"/>Revealed cards</button>}
      {!hidePowerButton && <button
        type="button"
        className="opponent-status"
        onClick={() => setOpen(true)}
        aria-label={`View ${opponentName}'s power-ups`}
        title={`View ${opponentName}'s available tactical power-ups`}
      >
        <Zap className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
        <span>Power-ups</span>
      </button>}

      </div>
      {open && (
        <PopupLayer><div className="ground-popup" onClick={() => setOpen(false)}>
          <section
            className="ground-dialog opponent-powerup-dialog max-w-lg w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${opponentName}'s power-ups`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header matching power-up section */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans leading-tight">
                    {opponentName}'s Power-ups
                  </h3>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">
                    Active tactical reserves and tile charges
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of Power-Up cards matching power-up section */}
            <div className="opponent-powerup-grid grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {/* Exchange */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 flex flex-col justify-between gap-3 relative">
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center">
                    <V5Power type="draw" className="w-12 h-12" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    drawCount > 0
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700'
                  }`}>
                    {drawCount > 0 ? `×${drawCount}` : 'Used'}
                  </span>
                </div>
                <div>
                  <strong className="text-xs font-bold block text-stone-900 dark:text-stone-100">Exchange</strong>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">Free action</span>
                </div>
              </div>

              {/* Monolith (if enabled) */}
              {showMonolithPowerUp && (
                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 flex flex-col justify-between gap-3 relative">
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-lg bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center">
                      <V5Piece type="m" className="w-12 h-12" />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      monolithCount > 0
                        ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700'
                    }`}>
                      {monolithCount > 0 ? `×${monolithCount}` : 'Used'}
                    </span>
                  </div>
                  <div>
                    <strong className="text-xs font-bold block text-stone-900 dark:text-stone-100">Monolith</strong>
                    <span className="text-[10px] text-stone-500 dark:text-stone-400">Move action</span>
                  </div>
                </div>
              )}

              {/* Wild move */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 flex flex-col justify-between gap-3 relative">
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 flex items-center justify-center">
                    <V5Power type="wild" className="w-12 h-12" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    wildCount > 0
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700'
                  }`}>
                    {wildCount > 0 ? `×${wildCount}` : 'Used'}
                  </span>
                </div>
                <div>
                  <strong className="text-xs font-bold block text-stone-900 dark:text-stone-100">Wild move</strong>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">Move action</span>
                </div>
              </div>

              {/* Vision */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 flex flex-col justify-between gap-3 relative">
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 rounded-lg bg-cyan-500/10 dark:bg-cyan-400/10 flex items-center justify-center">
                    <V5Power type="vision" className="w-12 h-12" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    visionCount > 0
                      ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700'
                  }`}>
                    {visionCount > 0 ? `×${visionCount}` : 'Used'}
                  </span>
                </div>
                <div>
                  <strong className="text-xs font-bold block text-stone-900 dark:text-stone-100">Vision</strong>
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">Free action</span>
                </div>
              </div>

              {/* Treacherous Grounds tiles/traps */}
              {grounds?.selected.map((type) => {
                const charges = grounds.charges[color]?.[type] || 0;
                return (
                  <div
                    key={type}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 flex flex-col justify-between gap-3 relative"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-14 h-14 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10 flex items-center justify-center">
                        <V5Power type={type} className="w-12 h-12" />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        charges > 0
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700'
                      }`}>
                        {charges > 0 ? `×${charges}` : '0'}
                      </span>
                    </div>
                    <div>
                      <strong className="text-xs font-bold block text-stone-900 dark:text-stone-100">{GROUND_NAMES[type]}</strong>
                      <span className="text-[10px] text-stone-500 dark:text-stone-400">Move action</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-bold text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 cursor-pointer shadow-xs transition-colors"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      </PopupLayer>)}

      {isVisionActive && visionOpen && <PopupLayer><div className="ground-popup" onClick={()=>setVisionOpen(false)}><section className="ground-dialog vision-dialog" role="dialog" aria-modal="true" aria-label="Revealed cards" onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape')setVisionOpen(false);}}>
        <header><h3>{opponentName}’s revealed cards</h3><button type="button" className="ui-button" autoFocus onClick={()=>setVisionOpen(false)}>Close</button></header>
        <div className="vision-card-grid">{hand.map(card=><button type="button" key={card.id} className="compact-hand-card" data-card-type={card.type} data-joker-wild={card.isJokerWild||undefined} aria-pressed={inspectedCardId===card.id} onClick={()=>setInspectedCardId(inspectedCardId===card.id?null:card.id)}><div className="card-art"><CardArtwork card={card} color={color} champion={champion}/></div><span className="compact-card-name">{card.name}</span></button>)}</div>
        {inspectedCard&&<div className="vision-card-description"><div className="selected-card-thumb"><CardArtwork card={inspectedCard} color={color} champion={champion}/></div><div><strong>{inspectedCard.name}</strong><p>{inspectedCard.description}</p></div></div>}
        <p className="vision-note">Tap a card to read its description. Vision lasts for this turn.</p>
      </section></div></PopupLayer>}
    </>
  );
};
