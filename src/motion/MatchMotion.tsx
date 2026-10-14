import { playSuperKnightDoubleSound } from '../utils/superKnightAudio.ts';
import React from 'react';
import type { GameState, PlayerColor } from '../types';
import { isNewAction, matchIdentity, planBoardMotion, planSummonMotion } from './plan';
import { fly, HANDOFF_MS, DOUBLE_JUMP_MS, PIECE_MOVE_MS, MotionBatch, reducedMotion, snapshot, visibleRect, type Visual } from './runtime';

/** Only the pass-and-play viewing side waits. Server turn and clock stay live. */
export function useVisualTurn(state: GameState, session: string, connected: boolean) {
  const identity = `${session}:${matchIdentity(state)}`;
  const [view, setView] = React.useState({ identity, turn: state.turn });
  const turn = view.identity === identity && connected && state.status === 'playing' ? view.turn : state.turn;
  React.useLayoutEffect(() => {
    const settle = () => setView({ identity, turn: state.turn });
    if (turn === state.turn || document.hidden || reducedMotion()) { settle(); return; }
    const move = state.lastMoveDetails as (typeof state.lastMoveDetails & {firstTo?:string});
    const timer = setTimeout(settle, move?.intermediateSquare || move?.firstTo ? DOUBLE_JUMP_MS + 100 : HANDOFF_MS);
    const onVisibility = () => { if (document.hidden) settle(); };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', settle);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', settle);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', settle);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', settle);
    };
  }, [identity, state.turn, state.status, connected]);
  return turn;
}

interface Props { game: GameState; viewColor: PlayerColor; session: string; connected: boolean; children: React.ReactNode }
interface Snapshot { pieces: Map<string, Visual>; cards: Map<string, Visual> }

/** Capture old geometry before React replaces pieces/cards with server state. */
export class MatchMotion extends React.Component<Props, {}, Snapshot | null> {
  private root = React.createRef<HTMLDivElement>();
  private batch = new MotionBatch();
  private media?: MediaQueryList;
  private orientationObserver?: MutationObserver;
  private awaitingSnapshot = false;
  private maskedDestinations = new Set<string>();
  private destinationMask?: HTMLStyleElement;
  private maskTimer?: ReturnType<typeof setTimeout>;
  private clearMask = () => {
    clearTimeout(this.maskTimer);
    this.destinationMask?.remove();
    this.destinationMask = undefined;
    this.maskedDestinations.clear();
  };
  private revealDestination = (square: string) => {
    this.maskedDestinations.delete(square);
    if (!this.maskedDestinations.size) { this.clearMask(); return; }
    if (this.destinationMask) this.destinationMask.textContent = [...this.maskedDestinations].map(destination =>
      `#chess-board #square-${destination} [data-motion-piece]{opacity:0!important;visibility:hidden!important;}`
    ).join('\n');
  };
  private cancel = () => { this.batch.cancel(); this.clearMask(); };
  componentDidMount() {
    this.nextBatch();
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    this.media.addEventListener('change', this.cancel);
    window.addEventListener('resize', this.cancel);
    // A scroll invalidates screen-space flight coordinates, including the hand rail.
    window.addEventListener('scroll', this.cancel, true);
    document.addEventListener('visibilitychange', this.cancel);
    const board = this.find('#chess-board');
    if (board) {
      this.orientationObserver = new MutationObserver(this.cancel);
      this.orientationObserver.observe(board, { attributes: true, attributeFilter: ['data-orientation'] });
    }
    this.deal();
  }
  componentWillUnmount() {
    this.cancel();
    this.media?.removeEventListener('change', this.cancel);
    this.orientationObserver?.disconnect();
    window.removeEventListener('resize', this.cancel);
    window.removeEventListener('scroll', this.cancel, true);
    document.removeEventListener('visibilitychange', this.cancel);
  }
  private cards() { return [...(this.root.current?.querySelectorAll<HTMLElement>('#player-hand-container [data-card-id]') || [])]; }
  private find(selector: string) { return this.root.current?.querySelector<HTMLElement>(selector); }
  private nextBatch() { this.batch.cancel(); this.batch = new MotionBatch(); }
  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    if (!previous.connected || !this.props.connected || this.awaitingSnapshot) return null;
    if (!isNewAction(previous.game, this.props.game) && previous.viewColor === this.props.viewColor) return null;
    const pieces = new Map<string, Visual>(), cards = new Map<string, Visual>();
    this.root.current?.querySelectorAll<HTMLElement>('[data-motion-piece]').forEach(node => {
      pieces.set(node.closest('[id^="square-"]')!.id.slice(7), snapshot(node));
    });
    for (const node of this.cards()) cards.set(node.dataset.cardId!, snapshot(node));
    // Runs before React commits the new board: hide destination artwork before
    // it can paint, and keep it hidden across clock updates or DOM remounts.
    this.clearMask();
    if (!reducedMotion() && !document.hidden && isNewAction(previous.game, this.props.game)) {
      const destinations = planBoardMotion(previous.game, this.props.game).moves.map(move => move.to);
      if (destinations.length) {
        this.maskedDestinations = new Set(destinations);
        const mask = document.createElement('style');
        mask.textContent = destinations.map(square =>
          `#chess-board #square-${square} [data-motion-piece]{opacity:0!important;visibility:hidden!important;}`
        ).join('\n');
        document.head.append(mask);
        this.destinationMask = mask;
      }
    }
    return { pieces, cards };
  }
  componentDidUpdate(previous: Props, _: {}, old: Snapshot | null) {
    if (!this.props.connected) { this.awaitingSnapshot = true; this.clearMask(); this.nextBatch(); return; }
    if (this.awaitingSnapshot) {
      // Reconnection can restore several missed events at once. Its first
      // authoritative snapshot must settle immediately, not replay history.
      if (previous.game !== this.props.game) this.awaitingSnapshot = false;
      this.clearMask(); this.nextBatch(); return;
    }
    if (previous.session !== this.props.session || !this.props.connected
      || matchIdentity(previous.game) !== matchIdentity(this.props.game)) { this.nextBatch(); return; }
    const changed = isNewAction(previous.game, this.props.game);
    if (!old || (!changed && previous.viewColor === this.props.viewColor)) return;
    this.nextBatch();
    if (reducedMotion() || document.hidden) { this.clearMask(); return; }
    const details = this.props.game.lastMoveDetails as (typeof this.props.game.lastMoveDetails & {firstTo?:string});
    const intermediate = details?.intermediateSquare || details?.firstTo;
    if (this.destinationMask) this.maskTimer = setTimeout(this.clearMask, intermediate ? DOUBLE_JUMP_MS + 100 : PIECE_MOVE_MS + 100);
    if (changed) {
      const plan = planBoardMotion(previous.game, this.props.game);
      let captureDelay = 0;
      let doubleSoundPlayed = false;
      const captureTimes = new Map<string,number>();
      for (const { from, to } of plan.moves) {
        const visual = old.pieces.get(from), target = this.find(`#square-${to} [data-motion-piece]`);
        if (visual && target && this.props.game.lastMoveDetails?.actionType!=='monolith') {
          const action=this.props.game.lastMoveDetails?.actionType;
          const portal=this.props.game.grounds?.events.some(e=>e.type==='portal'&&!previous.game.grounds?.events.some(old=>old.id===e.id)) || this.props.game.frontier?.events.some(e=>e.kind==='move'&&e.detail.startsWith('Portal:')&&!previous.game.frontier?.events.some(old=>old.id===e.id));
          captureDelay = Math.max(captureDelay, action==='switch'||portal ? 525 : PIECE_MOVE_MS * .75);
          const middleTile = intermediate && from === details?.from ? this.find(`#square-${intermediate}`) : undefined;
          const middleRect = middleTile?.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const via = middleRect ? new DOMRect(
            middleRect.left+(middleRect.width-targetRect.width)/2,
            middleRect.top+(middleRect.height-targetRect.height)/2,
            targetRect.width,targetRect.height) : undefined;
          if (via && intermediate) {
            captureTimes.set(intermediate,1125);captureTimes.set(to,2825);
            if (!doubleSoundPlayed) { playSuperKnightDoubleSound();doubleSoundPlayed = true; }
          }
          fly(this.batch, visual, targetRect, target,0,false, action==='switch'?'switch':portal?'portal':action==='push'?'push':'move', () => this.revealDestination(to), via);
        } else { this.revealDestination(to); }
      }
      for (const square of plan.captures) {
        const visual = old.pieces.get(square);
        if (!visual || !visibleRect(visual.rect)) continue;
        const ghost = document.createElement('div');
        ghost.className = 'match-flight match-capture'; ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: `${visual.rect.left}px`, top: `${visual.rect.top}px`, width: `${visual.rect.width}px`, height: `${visual.rect.height}px` });
        ghost.append(visual.node); document.body.append(ghost);
        this.batch.animate(ghost, [
          { opacity: 1, transform: 'rotate(0deg)', transformOrigin:'50% 85%' },
          { opacity: 1, transform: 'rotate(78deg) translateX(12%)', offset:.65, transformOrigin:'50% 85%' },
          { opacity: 0, transform: 'rotate(90deg) translateX(16%)', transformOrigin:'50% 85%' },
        ], 650, captureTimes.get(square) ?? captureDelay, () => ghost.remove());
        this.impact(square, 'capture', captureTimes.get(square) ?? captureDelay);
      }
      const removed = new Set([...this.props.game.discard, ...(this.props.game.exhausted || [])].map(card => card.id));
      const discard = this.find('#btn-inspect-discard-pile > div');
      for (const [id, visual] of old.cards) {
        if (!removed.has(id) || previous.game.discard.some(card => card.id === id)) continue;
        if (discard && visibleRect(discard.getBoundingClientRect())) fly(this.batch, visual, discard.getBoundingClientRect(), undefined, 0, true);
        else this.cardExit(visual);
      }
      for(const arrival of planSummonMotion(previous.game,this.props.game))this.summon(arrival.square,arrival.kind);
      this.powerUpFeedback(previous.game);
    }
    if (previous.viewColor !== this.props.viewColor) {
      // Switching viewing sides is a handoff, not five newly drawn cards.
      const hand = this.find('#player-hand-container');
      if (hand) this.batch.animate(hand, [{ opacity: .55 }, { opacity: 1 }], 140);
      return;
    }
    this.deal(old.cards);
    // Only reposition when IDs changed; selection and clock ticks stay immediate.
    const nodes = this.cards();
    const idsChanged = nodes.length !== old.cards.size || nodes.some(node => !old.cards.has(node.dataset.cardId!));
    if (idsChanged) for (const node of nodes) {
      const before = old.cards.get(node.dataset.cardId!);
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const dx = before.rect.left - after.left;
      if (Math.abs(dx) > 1) this.batch.animate(node, [{ translate: `${dx}px 0` }, { translate: '0 0' }]);
    }
  }
  private deal(before = new Map<string, Visual>()) {
    if (reducedMotion() || document.hidden) return;
    const deck = this.find('#btn-inspect-draw-pile > div')?.getBoundingClientRect();
    const rail = this.find('.hand-grid')?.getBoundingClientRect();
    let index = 0;
    for (const node of this.cards()) {
      if (before.has(node.dataset.cardId!)) continue;
      const rect = node.getBoundingClientRect();
      if (!visibleRect(rect) || (rail && (rect.left >= rail.right || rect.right <= rail.left))) continue;
      const delay = index++ * 35;
      if (deck && visibleRect(deck)) {
        const visual = snapshot(node); visual.rect = deck;
        fly(this.batch, visual, rect, node, delay, true);
      } else {
        this.batch.animate(node, [{ translate: '0 14px', opacity: 0 }, { translate: '0 0', opacity: 1 }], 200, delay);
      }
    }
  }
  private cardExit(visual: Visual) {
    if (!visibleRect(visual.rect) || visual.rect.left < 0 || visual.rect.right > innerWidth) return;
    const ghost = document.createElement('div');
    ghost.className = 'match-flight match-flight--card'; ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { left: `${visual.rect.left}px`, top: `${visual.rect.top}px`, width: `${visual.rect.width}px`, height: `${visual.rect.height}px` });
    ghost.append(visual.node); document.body.append(ghost);
    this.batch.animate(ghost, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-18px) scale(.94)' }], 180, 0, () => ghost.remove());
  }
  private powerUpFeedback(previous: GameState) {
    const game = this.props.game, move = game.lastMoveDetails;
    if (!move) return;
    if (move.actionType === 'monolith' && game.monolithSquare) {
      if (!previous.monolithSquare) {
        const piece = this.find(`#square-${game.monolithSquare} [data-motion-piece]`);
        if (piece) this.batch.animate(piece, [{ opacity: 0, translate: '0 14px' }, { opacity: 1, translate: '0 0' }]);
      }
      this.impact(game.monolithSquare, 'stone', 80);
    } else if (move.actionType === 'restrict' && move.restrictedSquare) {
      this.impact(move.restrictedSquare, 'restrict', 0);
    } else if ((move.actionType === 'beacon' || move.actionType === 'static') && game.monolithSquare) {
      this.impact(game.monolithSquare, move.actionType, 0);
    } else if (move.actionType === 'awakening') {
      const square = game.awakenedPieceSquare || move.to || move.from;
      if (square) this.impact(square, 'awakening', 100);
    } else if (move.actionType === 'champion_deploy') {
      const square = move.championSquare || game.champions[move.player]?.square;
      if (square) this.impact(square, 'champion', 0);
    } else if (move.actionType === 'vision') {
      const panel = this.find('#opponent-hand-container');
      if (panel) this.batch.animate(panel, [{ opacity: .45 }, { opacity: 1 }], 220);
    }
  }
  private summon(square:string,kind:'revive'|'soul') {
    const tile=this.find(`#square-${square}`),piece=tile?.querySelector<HTMLElement>('[data-motion-piece="standard"]');
    const rect=tile?.getBoundingClientRect();
    if(!piece||!rect||!visibleRect(rect))return;
    const effect=document.createElement('div');
    effect.className=`match-summon-effect match-summon-effect--${kind}`;
    effect.inert=true;effect.setAttribute('aria-hidden','true');
    Object.assign(effect.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    const ring=document.createElement('span');ring.className='summon-arrival-ring';effect.append(ring);
    for(let i=0;i<8;i++){const spark=document.createElement('span');spark.className='summon-arrival-wisp';spark.style.setProperty('--wisp-x',`${12+i*10}%`);spark.style.setProperty('--wisp-y',`${15+(i*19)%60}%`);effect.append(spark);}
    document.body.append(effect);
    this.batch.animate(effect,[{opacity:0,transform:'scale(.65)'},{opacity:1,transform:'scale(1)',offset:.3},{opacity:0,transform:'scale(1.12)'}],1000,0,()=>effect.remove());
    this.batch.animate(piece,[{opacity:0,translate:'0 15px',scale:'.65',filter:'blur(6px)'},{opacity:.8,translate:'0 -3px',scale:'1.03',filter:'blur(0)',offset:.7},{opacity:1,translate:'0 0',scale:'1',filter:'blur(0)'}],800,100);
  }
  private impact(square: string, kind = 'capture', delay = 100) {
    const rect = this.find(`#square-${square}`)?.getBoundingClientRect();
    if (!rect || !visibleRect(rect)) return;
    const ring = document.createElement('div');
    ring.className = `match-impact match-impact--${kind}`; ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.append(ring);
    this.batch.animate(ring, [{ opacity: .85, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.2)' }], 180, delay, () => ring.remove());
  }
  render() { return <div ref={this.root} className="match-motion-root">{this.props.children}</div>; }
}
