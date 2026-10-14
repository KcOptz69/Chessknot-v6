export const MOVE_MS = 240;
export const PIECE_MOVE_MS = 1250;
export const PUSH_MOVE_MS = 320;
export const DOUBLE_JUMP_MS = 2700;
export const HANDOFF_MS = 1350;
export const MOTION_EASE = 'cubic-bezier(.22,.7,.25,1)';
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A bounded, disposable batch. No rules, network messages or game timers. */
export class MotionBatch {
  private cleanups = new Set<() => void>();
  private closed = false;
  cancel = () => {
    this.closed = true;
    for (const cleanup of [...this.cleanups]) cleanup();
    this.cleanups.clear();
  };
  animate(node: HTMLElement, frames: Keyframe[], duration = MOVE_MS, delay = 0, done = () => {}, easing = MOTION_EASE) {
    if (this.closed || document.hidden || reducedMotion() || typeof node.animate !== 'function') { done(); return; }
    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      animation?.cancel();
      this.cleanups.delete(finish);
      done();
    };
    this.cleanups.add(finish);
    try {
      animation = node.animate(frames, { duration, delay, easing, fill: 'both' });
      animation.finished.then(finish, finish);
      timer = setTimeout(finish, duration + delay + 100);
    } catch { finish(); }
  }
}

export function visibleRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth
    && rect.bottom > 0 && rect.top < innerHeight;
}

export interface Visual { node: HTMLElement; rect: DOMRect }
let copyId = 0;
export function snapshot(node: HTMLElement): Visual {
  const clone = node.cloneNode(true) as HTMLElement;
  const elements = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  const svgIds = new Map<string, string>();
  const prefix = `motion-copy-${copyId++}-`;
  // Visual copies must not duplicate IDs, focus stops or interactive controls.
  for (const element of elements) {
    if (element.id && element.namespaceURI === 'http://www.w3.org/2000/svg') {
      svgIds.set(element.id, `${prefix}${element.id}`);
      element.id = `${prefix}${element.id}`;
    } else element.removeAttribute('id');
    if (element.hasAttribute('data-in-flight')) {
      element.style.removeProperty('opacity');
      element.style.removeProperty('visibility');
    }
    element.removeAttribute('data-in-flight');
    element.removeAttribute('tabindex');
    element.removeAttribute('autofocus');
  }
  // Preserve local SVG gradients/filters while giving them unique references.
  for (const element of elements) for (const attribute of [...element.attributes]) {
    let value = attribute.value;
    for (const [id, replacement] of svgIds) value = value.split(`url(#${id})`).join(`url(#${replacement})`);
    if (value !== attribute.value) element.setAttribute(attribute.name, value);
  }
  clone.inert = true;
  clone.setAttribute('aria-hidden', 'true');
  return { node: clone, rect: node.getBoundingClientRect() };
}

export function fly(batch: MotionBatch, visual: Visual, to: DOMRect, target?: HTMLElement, delay = 0, card = false, kind: 'move'|'switch'|'portal'|'push' = 'move', onSettled: () => void = () => {}, via?: DOMRect) {
  const from = visual.rect;
  if (!visibleRect(from) || !visibleRect(to) || reducedMotion() || document.hidden) { onSettled(); return; }
  // Hand cards can be partly clipped by a mobile rail. Never let their copy
  // escape the viewport and introduce horizontal scrolling during a flight.
  if (card && (from.left < 0 || from.right > innerWidth || to.left < 0 || to.right > innerWidth)) return;
  const ghost = document.createElement('div');
  ghost.className = `match-flight ${card ? 'match-flight--card' : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { position:'fixed', pointerEvents:'none', zIndex:'45', transformOrigin:'top left', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  // Destination artwork makes the last moving frame match the real piece.
  // Keep the old geometry for the starting position.
  if (!card && !via && target && (kind === 'move' || kind === 'push')) {
    visual.node = snapshot(target).node;
  }
  ghost.append(visual.node);
  document.body.append(ghost);
  const previousOpacity = target?.style.getPropertyValue('opacity') || '';
  const previousOpacityPriority = target?.style.getPropertyPriority('opacity') || '';
  const revealTarget = () => {
    onSettled();
    if (!target) return;
    delete target.dataset.inFlight;
    if (previousOpacity) target.style.setProperty('opacity', previousOpacity, previousOpacityPriority);
    else target.style.removeProperty('opacity');
  };
  if (target) {
    target.dataset.inFlight = 'true';
    // Opacity hides the whole subtree, including children with visible styles.
    target.style.setProperty('opacity', '0', 'important');
  }
  const dx = from.left - to.left, dy = from.top - to.top;
  if (!card && kind === 'push') {
    // Push stays on the ground: a swift straight slide with a trailing gust.
    const streak = document.createElement('div');
    const distance = Math.hypot(dx,dy), angle = Math.atan2(-dy,-dx)*180/Math.PI;
    streak.inert = true;streak.setAttribute('aria-hidden','true');
    Object.assign(streak.style,{position:'fixed',pointerEvents:'none',zIndex:'44',
      left:`${from.left+from.width/2}px`,top:`${from.top+from.height*.7}px`,
      width:`${Math.max(16,distance)}px`,height:`${Math.max(8,from.height*.18)}px`,
      transformOrigin:'0 50%',transform:`rotate(${angle}deg) scaleX(0)`,borderRadius:'50%',
      background:'linear-gradient(90deg,transparent,rgba(156,233,255,.65),rgba(224,251,255,.95))',filter:'blur(1px)'});
    document.body.append(streak);
    batch.animate(streak,[{opacity:0,transform:`rotate(${angle}deg) scaleX(0)`,offset:0},
      {opacity:.85,transform:`rotate(${angle}deg) scaleX(.85)`,offset:.55},
      {opacity:0,transform:`rotate(${angle}deg) scaleX(1)`,offset:1}],PUSH_MOVE_MS,delay,()=>streak.remove(),'linear');
    batch.animate(ghost,[
      {transform:`translate(${dx}px,${dy}px) scale(${from.width/to.width},${from.height/to.height})`},
      {transform:'translate(0,0) scale(1)'}
    ],PUSH_MOVE_MS,delay,()=>{revealTarget();ghost.remove();streak.remove();},'cubic-bezier(.12,.65,.25,1)');
    return;
  }
  if (!card && kind !== 'move' && kind !== 'push') {
  if(kind==='switch'){
    const trail=document.createElement('div');trail.className='match-flight match-switch-trail';trail.inert=true;trail.setAttribute('aria-hidden','true');
    const left=Math.min(from.left,to.left)-from.width,top=Math.min(from.top,to.top)-from.height;
    const width=Math.abs(from.left-to.left)+from.width*3,height=Math.abs(from.top-to.top)+from.height*3;
    Object.assign(trail.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const path=document.createElementNS(svg.namespaceURI,'path');
    const ax=from.left-left+from.width/2,ay=from.top-top+from.height/2,bx=to.left-left+to.width/2,by=to.top-top+to.height/2;
    path.setAttribute('d',`M${ax} ${ay} Q${(ax+bx)/2-(by-ay)*.36} ${(ay+by)/2+(bx-ax)*.36} ${bx} ${by}`);
    svg.append(path);trail.append(svg);document.body.append(trail);
    batch.animate(trail,[{opacity:0},{opacity:.9,offset:.35},{opacity:0}],850,0,()=>trail.remove());
  }
  const start = { transform: `translate(${dx}px,${dy}px) scale(${from.width / to.width},${from.height / to.height})`, opacity: 1 };
  const end = { transform: 'translate(0,0) scale(1)', opacity: card && !target ? .15 : 1 };
  const frames:Keyframe[]=kind==='switch'?[start,{transform:`translate(${dx/2-dy*.18}px,${dy/2+dx*.18}px) scale(1.06)`,filter:'drop-shadow(0 0 10px #bb70ff)',offset:.5},end]:kind==='portal'?[{...start,opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.08)`,opacity:0,offset:.35},{transform:'translate(0,0) scale(.08)',opacity:0,offset:.55},end]:[start,end];
  batch.animate(ghost, frames, 700, delay, () => { revealTarget(); ghost.remove(); });
    return;
  }
  if (!card) {
    // Freeze selection bobbing on the visual copy while the move is in flight.
    for (const element of [visual.node, ...visual.node.querySelectorAll<HTMLElement>('*')]) {
      element.removeAttribute('data-card-match');
      element.removeAttribute('data-card-hover');
      element.style.animation = 'none';
      element.style.translate = 'none';
      element.style.rotate = 'none';
    }
    const lift = Math.min(20, Math.max(8, to.height * .24));
    const sx = from.width / to.width, sy = from.height / to.height;
    const shadow = document.createElement('div');
    shadow.className = 'match-piece-shadow';
    shadow.inert = true;
    shadow.setAttribute('aria-hidden', 'true');
    Object.assign(shadow.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '44',
      left: `${to.left + to.width * .23}px`, top: `${to.top + to.height * .86}px`,
      width: `${to.width * .54}px`, height: `${to.height * .10}px`,
      borderRadius: '50%', background: 'rgba(8,24,40,.42)', filter: 'blur(3px)',
      transformOrigin: '50% 50%',
    });
    document.body.append(shadow);
    if (via) {
      const mx = via.left - to.left, my = via.top - to.top;
      const transform = (x:number,y:number,lifted=false) => `translate(${x}px,${y-(lifted?lift:0)}px) scale(${lifted?1.035:1})`;
      const duration = DOUBLE_JUMP_MS;
      const frames: Keyframe[] = [
        {transform:transform(dx,dy),offset:0,easing:'ease-out'},
        {transform:transform(dx,dy,true),offset:(PIECE_MOVE_MS*.25)/duration,easing:'ease-in-out'},
        {transform:transform(mx,my,true),offset:(PIECE_MOVE_MS*.75)/duration,easing:'ease-in'},
        {transform:transform(mx,my),offset:PIECE_MOVE_MS/duration,easing:'linear'},
        {transform:transform(mx,my),offset:(PIECE_MOVE_MS+200)/duration,easing:'ease-out'},
        {transform:transform(mx,my,true),offset:(PIECE_MOVE_MS*1.25+200)/duration,easing:'ease-in-out'},
        {transform:transform(0,0,true),offset:(PIECE_MOVE_MS*1.75+200)/duration,easing:'ease-in'},
        {transform:transform(0,0),offset:1},
      ];
      batch.animate(shadow, frames.map(frame=>({...frame,transform:String(frame.transform).replace(/scale\([^)]*\)/,'scale(.85)')})), duration, delay, ()=>shadow.remove(), 'linear');
      batch.animate(ghost, frames, duration, delay, ()=>{
        revealTarget();ghost.remove();shadow.remove();
      }, 'linear');
      return;
    }
    batch.animate(shadow, [
      { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: .6, offset: 0, easing: 'ease-out' },
      { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: .3, offset: .25, easing: 'ease-in-out' },
      { transform: 'translate(0,0) scale(.8)', opacity: .3, offset: .75, easing: 'ease-in' },
      { transform: 'translate(0,0) scale(1)', opacity: .6, offset: 1 },
    ], PIECE_MOVE_MS, delay, () => shadow.remove(), 'linear');
    batch.animate(ghost, [
      { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, offset: 0, easing: 'ease-out' },
      { transform: `translate(${dx}px,${dy - lift}px) scale(${sx * 1.035},${sy * 1.035})`, offset: .25, easing: 'ease-in-out' },
      { transform: `translate(0,${-lift}px) scale(1.035)`, offset: .75, easing: 'ease-in' },
      { transform: 'translate(0,1px) scale(1)', offset: .94, easing: 'ease-out' },
      { transform: 'translate(0,0) scale(1)', offset: 1 },
    ], PIECE_MOVE_MS, delay, () => {
      revealTarget();
      ghost.remove();
      shadow.remove();
    }, 'linear');
    return;
  }
  batch.animate(ghost, [
    { transform: `translate(${dx}px,${dy}px) scale(${from.width / to.width},${from.height / to.height})`, opacity: 1 },
    { transform: 'translate(0,0) scale(1)', opacity: card && !target ? .15 : 1 },
  ], MOVE_MS, delay, () => { revealTarget(); ghost.remove(); });
}
