import {GROUND_DESCRIPTION} from './GroundsUI.tsx';
import {GROUND_NAMES, type Grounds, type GroundType} from '../utils/grounds.ts';
import {V5Power,V5Piece} from './V5Art.tsx';
import { GlassPanel, PowerUpButton } from './UI';
import React from 'react';
import { PowerUpsState } from '../types.ts';
import { Layers, Mountain, Sparkles, Eye, Zap, Compass } from 'lucide-react';

interface PowerUpsBarProps {
  confirmPlacement?: boolean;
  grounds?: Grounds;
  selectedGround?: GroundType | 'transport' | null;
  color?: "w"|"b";
  onGround?: (type:GroundType)=>void;
  powerUps: PowerUpsState;
  progress?: number;
  isMyTurn: boolean;
  isJokerLocked?: boolean;
  onUseDraw: () => void;
  onUseMonolith: () => void;
  onUseWild: () => void;
  onUseVision: () => void;
  isWildActive: boolean;
  isMonolithMode: boolean;
  hasShiftedParadigm?: boolean;
  hasChampionsOfTheMonolith?: boolean;
}

export const PowerUpsBar: React.FC<PowerUpsBarProps> = ({
  confirmPlacement = false,
  grounds,color="w",onGround,selectedGround,
  powerUps,
  progress = 0,
  isMyTurn,isJokerLocked=false,
  onUseDraw,
  onUseMonolith,
  onUseWild,
  onUseVision,
  isWildActive,
  isMonolithMode,
  hasShiftedParadigm = true,
  hasChampionsOfTheMonolith = true,
}) => {
  const [pendingUse,setPendingUse] = React.useState<'draw'|'vision'|'wild'|'monolith'|GroundType|null>(null);
  React.useEffect(()=>{setPendingUse(null);},[isMyTurn,isJokerLocked]);
  const showMonolithPowerUp = hasShiftedParadigm || hasChampionsOfTheMonolith;

  const drawCount = typeof powerUps.draw === 'number' ? powerUps.draw : powerUps.draw ? 1 : 0;
  const monolithCount = typeof powerUps.monolith === 'number' ? powerUps.monolith : powerUps.monolith ? 1 : 0;
  const wildCount = typeof powerUps.wild === 'number' ? powerUps.wild : powerUps.wild ? 1 : 0;
  const visionCount = typeof powerUps.vision === 'number' ? powerUps.vision : powerUps.vision ? 1 : 0;

  const currentProgress = Math.min(4, Math.max(0, progress));
  const progressPercent = (currentProgress / 5) * 100;

  const hasTilePowerUps = Boolean(grounds?.selected && grounds.selected.length > 0);
  const isNormalPowerUp = pendingUse === 'draw' || pendingUse === 'vision' || pendingUse === 'wild' || pendingUse === 'monolith';
  const isTilePowerUp = Boolean(pendingUse && !isNormalPowerUp);

  const renderUsePanel = () => {
    if (!pendingUse) return null;
    return (
      <div className="powerup-use-panel mt-1.5" role="region" aria-label="Power-up description">
        <V5Power type={pendingUse} />
        <div className="powerup-panel-copy">
          <strong>
            {({draw:'Exchange',vision:'Vision',wild:'Wild move',monolith:'Monolith'} as Record<string,string>)[pendingUse] || GROUND_NAMES[pendingUse as GroundType]}
          </strong>
          <p>
            {({draw:'Draw 2 fresh cards, then choose 2 cards to discard. Free action.',vision:'Reveal your opponent’s hand for this turn. Free action.',wild:'Move any piece without spending a card. Choose a piece and a destination. Move action.',monolith:'Spawn or reposition the obstacle Monolith. Choose a highlighted empty square. Move action.'} as Record<string,string>)[pendingUse] || GROUND_DESCRIPTION[pendingUse as GroundType]}
          </p>
        </div>
        <div className="powerup-panel-actions">
          {(confirmPlacement || pendingUse === 'draw' || pendingUse === 'vision') && (
            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={!isMyTurn || (pendingUse === 'draw' && (isJokerLocked || drawCount <= 0)) || (pendingUse === 'vision' && visionCount <= 0) || (pendingUse==='wild'&&wildCount<=0) || (pendingUse==='monolith'&&monolithCount<=0) || (isTilePowerUp && !grounds?.charges[color]?.[pendingUse as GroundType])}
              onClick={() => {
                const action = pendingUse;
                setPendingUse(null);
                if (action === 'draw') onUseDraw();
                else if(action==='vision') onUseVision();
                else if(action==='wild') onUseWild();
                else if(action==='monolith') onUseMonolith();
                else onGround?.(action);
              }}
            >
              Use
            </button>
          )}
          <button
            type="button"
            className="ui-button"
            onClick={() => {
              if (pendingUse === 'wild' && isWildActive) onUseWild();
              if (pendingUse === 'monolith' && isMonolithMode) onUseMonolith();
              if (grounds?.selected.includes(pendingUse as GroundType) && selectedGround === pendingUse) onGround?.(pendingUse as GroundType);
              setPendingUse(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <GlassPanel id="power-ups-bar">
      <div className="powerup-heading flex items-center justify-between gap-1 w-full flex-nowrap">
        <h2 className="flex items-center gap-1.5 whitespace-nowrap shrink-0"><Zap size={15} /> Power-ups</h2>
        <span className="whitespace-nowrap ml-auto shrink-0 text-right text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400">{currentProgress}/5 capture points</span>
      </div>
      <div className="powerup-progress" role="progressbar" aria-label="Capture points toward power-up refresh" aria-valuenow={currentProgress} aria-valuemin={0} aria-valuemax={5}><span style={{width: `${progressPercent}%`}} /></div>
      <div className="powerup-list">
        <PowerUpButton id="btn-powerup-draw" icon={<V5Power type="draw"/>} name="Exchange" quantity={drawCount} free description={isJokerLocked ? "Play all Joker Wild cards before drawing." : "Draw 2 fresh cards, then choose 2 cards from your hand to discard. Free action."} data-unavailable={!isMyTurn || drawCount <= 0 || isJokerLocked || undefined} active={pendingUse==='draw'} onClick={()=>setPendingUse(pendingUse==='draw'?null:'draw')} />
        {showMonolithPowerUp && <PowerUpButton id="btn-powerup-monolith" icon={<V5Piece type="m" className="w-8 h-8"/>} name="Monolith" quantity={monolithCount} active={isMonolithMode} description="Spawn or reposition the obstacle Monolith" data-unavailable={!isMyTurn || monolithCount <= 0 || undefined} onClick={()=>{setPendingUse(pendingUse==='monolith'?null:'monolith');if(!confirmPlacement&&isMyTurn&&monolithCount>0)onUseMonolith();}} />}
        <PowerUpButton id="btn-powerup-wild" icon={<V5Power type="wild"/>} name="Wild move" quantity={wildCount} active={isWildActive} description="Move any piece without spending a card" data-unavailable={!isMyTurn || wildCount <= 0 || undefined} onClick={()=>{setPendingUse(pendingUse==='wild'?null:'wild');if(!confirmPlacement&&isMyTurn&&wildCount>0)onUseWild();}} />
        <PowerUpButton id="btn-powerup-vision" icon={<V5Power type="vision"/>} name="Vision" quantity={visionCount} free description="Reveal your opponent's cards this turn" data-unavailable={!isMyTurn || visionCount <= 0 || undefined} active={pendingUse==='vision'} onClick={()=>setPendingUse(pendingUse==='vision'?null:'vision')} />
      </div>

      {isNormalPowerUp && renderUsePanel()}

      {hasTilePowerUps && grounds && (
        <>
          <div className="powerup-divider" />
          <div className="powerup-heading tile-powerup-heading flex items-center justify-between gap-1 w-full flex-nowrap">
            <h2 className="flex items-center gap-1.5 whitespace-nowrap shrink-0"><Compass size={14} /> Tile power-ups</h2>
            <span className="whitespace-nowrap ml-auto shrink-0 text-right text-[10px] sm:text-[10.5px] text-stone-500 dark:text-stone-400">refresh every 20th turn</span>
          </div>
          <div className="powerup-list">
            {grounds.selected.map(type => (
              <PowerUpButton
                key={type}
                id={`ground-${type}`}
                active={selectedGround === type}
                icon={<V5Power type={type}/>}
                name={GROUND_NAMES[type]}
                quantity={grounds.charges[color]?.[type] || 0}
                description={GROUND_DESCRIPTION[type]}
                data-unavailable={!isMyTurn || !grounds.charges[color]?.[type] || undefined}
                onClick={() => {
                  setPendingUse(pendingUse === type ? null : type);
                  if (!confirmPlacement && isMyTurn && grounds.charges[color]?.[type]) onGround?.(type);
                }}
              />
            ))}
          </div>
          {isTilePowerUp && renderUsePanel()}
        </>
      )}

      {isJokerLocked && <p className="powerup-hint">Draw locked until all Joker Wild cards are played.</p>}
    </GlassPanel>
  );
};
