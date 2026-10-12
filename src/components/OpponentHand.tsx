import {CardFaceLabel} from './CardFaceLabel.tsx';
import {OpponentPowerUps} from './OpponentPowerUps.tsx';
import type {FrontierState} from '../utils/frontier.ts';
import {BindIcon} from './FrontierUI.tsx';
import {Link2} from 'lucide-react';
import {CardArtwork} from './CardArtwork.tsx';
import type { Grounds, GroundType } from '../utils/grounds.ts';
import { GROUND_NAMES } from '../utils/grounds.ts';
import { V5Power, V5Piece } from './V5Art.tsx';
import React from 'react';
import { PopupLayer } from './UI';
import { Card, ChampionPiece, PowerUpsState } from '../types.ts';
import { Zap, X } from 'lucide-react';

interface OpponentHandProps {
  bindRequest?:number;
  canBind?:boolean;
  boundCardId?:string;
  onBind?:(id:string)=>void;
  hidePowerButton?: boolean;
  openRequest?: number;
  grounds?: Grounds;
  frontier?:FrontierState;
  turnNumber?:number;
  color?: "w" | "b";
  hand: Card[];
  champion?: ChampionPiece|null;
  isVisionActive: boolean;
  opponentHasEye?:boolean;
  permanentVision?:boolean;
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
  bindRequest=0,canBind=false,boundCardId,onBind,hidePowerButton = false, openRequest = 0,
  grounds,frontier,turnNumber,
  color = "b",
  hand,champion,
  opponentHasEye=false,permanentVision=false,isVisionActive,
  alwaysReveal = false,
  opponentName,
  opponentPowerUps = { draw: 1, monolith: 1, wild: 1, vision: 1 },
  hasShiftedParadigm = true,
  hasChampionsOfTheMonolith = true,
}) => {
  const [visionOpen,setVisionOpen]=React.useState(isVisionActive && !alwaysReveal);
  const [inspectedCardId,setInspectedCardId]=React.useState<string|null>(null);
  React.useEffect(()=>{setVisionOpen(isVisionActive && !alwaysReveal);setInspectedCardId(null);},[isVisionActive,alwaysReveal]);
  const [binding,setBinding]=React.useState(false);
  React.useEffect(()=>{if(bindRequest){setVisionOpen(true);setBinding(true);setInspectedCardId(null);}},[bindRequest]);
  React.useEffect(()=>{if(!canBind)setBinding(false);},[canBind]);
  const bindEligible=(card:Card)=>!['pawn','knight','bishop','rook','queen','wild'].includes(card.type);
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
                    {opponentName}'s Power-ups/Items
                  </h3>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">
                    Opponent inventory
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

            <OpponentPowerUps powerUps={{draw:drawCount,monolith:monolithCount,wild:wildCount,vision:visionCount}} grounds={grounds} frontier={frontier} color={color} turnNumber={turnNumber} hasEye={opponentHasEye} showMonolith={showMonolithPowerUp}/>

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
        <div className="vision-card-grid">{hand.map(card=><button type="button" key={card.id} className="compact-hand-card" data-card-type={card.type} data-joker-wild={card.isJokerWild||undefined} data-bound={card.id===boundCardId||undefined} disabled={binding&&!bindEligible(card)} aria-pressed={inspectedCardId===card.id} onClick={()=>setInspectedCardId(inspectedCardId===card.id?null:card.id)}><div className="card-art"><CardArtwork card={card} color={color} champion={champion}/></div><span className="compact-card-name"><CardFaceLabel>{card.name}</CardFaceLabel></span>{card.id===boundCardId&&<span className="frontier-bind-badge"><Link2/>BOUND</span>}</button>)}</div>
        {inspectedCard&&<div className="vision-card-description"><div className="selected-card-thumb"><CardArtwork card={inspectedCard} color={color} champion={champion}/></div><div><strong>{inspectedCard.name}</strong><p>{inspectedCard.description}</p></div></div>}
        {binding&&<div className="vision-bind-actions"><p>Choose a non-standard card to bind for the opponent’s next turn.</p><button className="ui-button ui-button--primary" disabled={!canBind||!inspectedCard||!bindEligible(inspectedCard)} onClick={()=>{if(inspectedCard&&canBind){onBind?.(inspectedCard.id);setBinding(false);setVisionOpen(false);}}}>Bind selected card</button><button className="ui-button" onClick={()=>setBinding(false)}>Cancel Bind</button></div>}
        <p className="vision-note">{permanentVision?'Tap a card to read its description. Eye of Revelation reveals this hand permanently.':'Tap a card to read its description. Vision lasts for this turn.'}</p>
      </section></div></PopupLayer>}
    </>
  );
};
