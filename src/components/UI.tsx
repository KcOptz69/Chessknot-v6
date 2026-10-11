import React from 'react';
import { createPortal } from 'react-dom';

export const PopupHostContext=React.createContext<HTMLElement|null>(null);

export function PopupLayer({children,enabled=true}:{children:React.ReactNode;enabled?:boolean}) {
  const host=React.useContext(PopupHostContext);
  return !enabled || typeof document==='undefined'?<>{children}</>:createPortal(children,host||document.body);
}

import { Crown, Layers, Shield } from 'lucide-react';
import { DrawPileIcon } from './DrawPileIcon.tsx';
import { PieceIcon } from './PieceIcons';
import type { ChampionPiece, PlayerColor } from '../types';

export function GlassPanel({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass-panel ${className}`} {...props} />;
}

export function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`ui-badge ${className}`}>{children}</span>;
}

export function Button({ className = '', variant = 'secondary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return <button type="button" className={`ui-button ui-button--${variant} ${className}`} {...props} />;
}

export function PlayerPanel({ name, color, active, cards, champion, shieldTurns, beaconTurns, points, turnLabel, onInspectCaptures, actions, deckCount }: {
  deckCount?: number;
  actions?: React.ReactNode;
  name: string; color: PlayerColor; active: boolean; cards: number;
  champion?: ChampionPiece | null; shieldTurns?: number; beaconTurns?: number; points?: number; turnLabel?: string; onInspectCaptures?: () => void;
}) {
  return <GlassPanel className={`player-panel ${active ? 'player-panel--active' : ''}`}>
    <button type="button" className={`player-avatar player-avatar--${color}`} onClick={onInspectCaptures} aria-label={`View pieces captured by ${name}`} title="View captured pieces"><PieceIcon type="k" color={color} className="w-8 h-8" /></button>
    <div className="player-identity"><strong>{name}</strong><span>{color === 'w' ? 'White army' : 'Black army'} · {cards} cards</span>
      <div className="player-effects"/></div>
    {deckCount!==undefined&&<span className="player-deck-count" title={`${deckCount} cards left in draw pile`} aria-label={`${deckCount} cards left in draw pile`}><DrawPileIcon className="w-3.5 h-3.5"/><span>{deckCount}</span></span>}
    <span className="player-points" title="Army points"><Crown size={16} /><span key={`${color}-${points}`} className="points-value">{points}</span></span>
    {turnLabel ? <span key={`${color}-${turnLabel}`} className="turn-label" role="status"><span className="turn-dot" />{turnLabel}</span> : active && <span className="turn-dot" aria-label="Active player" />}
    {actions && <div className="player-tag-actions">{actions}</div>}
  </GlassPanel>;
}

export function LobbyIntro() {
  return <div className="lobby-intro">
    <div><div className="eyebrow"><span className="turn-dot" /> THE STRATEGY STARTS HERE</div>
      <h2>Every card.<br /><span>A new possibility.</span></h2>
      <p>Read the board. Shape your hand. Make your next move count.</p>
    </div>
    <div className="lobby-board-art" aria-hidden="true">
      <div className="mini-board">{Array.from({length: 16}, (_, i) => <div key={i} className={(Math.floor(i / 4) + i) % 2 === 0 ? 'mini-light' : 'mini-dark'}>
        {i === 5 && <PieceIcon type="n" color="w" className="w-full h-full" />}
        {i === 10 && <PieceIcon type="k" color="b" className="w-full h-full" />}
        {i === 3 && <PieceIcon type="p" color="b" className="w-full h-full" />}
      </div>)}</div>
      <div className="preview-card"><PieceIcon type="n" color="w" className="w-12 h-12" /><span>KNIGHT</span><small>Find your opening.</small></div>
    </div>
  </div>;
}

/** Shared focus boundary. Each dialog keeps its original content and actions. */
export function Modal({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const headingId = React.useId();
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    if (!element) return;
    const heading = element.querySelector('h1,h2,h3,h4');
    if (heading) { heading.id ||= headingId; element.setAttribute('aria-labelledby', heading.id); }
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"],a[href]')).filter(item => item.getClientRects().length > 0);
    (focusable()[0] || element).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { element.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')?.click(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); element.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    };
    element.addEventListener('keydown', onKey);
    return () => { element.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, [headingId]);
  return <PopupLayer><div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={`ui-modal ${className}`} {...props}>{children}</div></PopupLayer>;
}

export function Toast({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  const dismissRef=React.useRef(onDismiss);
  dismissRef.current=onDismiss;
  React.useEffect(()=>{const timer=setTimeout(()=>dismissRef.current(),3000);return()=>clearTimeout(timer);},[children]);
  return <PopupLayer><div className="ui-toast" role="alert"><span className="toast-symbol">!</span><span>{children}</span><Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">×</Button></div></PopupLayer>;
}

export function PowerUpButton({ icon, name, quantity, active, description, free, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode; name: string; quantity: number; active?: boolean; description: string; free?: boolean;
}) {
  return <div className="powerup-tooltip-wrap"><Button aria-description={description} className={`powerup-control ${active ? 'powerup-control--active' : ''}`} aria-pressed={active ?? false} {...props}>
    <span className="powerup-icon">{icon}</span><span className="powerup-copy"><strong className="leading-tight">{name}</strong><small className="leading-none">{free ? 'Free action' : 'Move action'}{active ? ' · Active' : ''}</small></span>
    <Badge>{quantity > 0 ? `×${quantity}` : 'Used'}</Badge>
  </Button></div>;
}

export function CardSurface({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`game-card ${className}`} {...props} />;
}
