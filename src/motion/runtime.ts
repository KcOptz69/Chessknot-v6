export const MOVE_MS = 240;
export const HANDOFF_MS = 300;
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
  animate(node: HTMLElement, frames: Keyframe[], duration = MOVE_MS, delay = 0, done = () => {}) {
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
      animation = node.animate(frames, { duration, delay, easing: MOTION_EASE, fill: 'both' });
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

export function fly(batch: MotionBatch, visual: Visual, to: DOMRect, target?: HTMLElement, delay = 0, card = false) {
  const from = visual.rect;
  if (!visibleRect(from) || !visibleRect(to) || reducedMotion() || document.hidden) return;
  // Hand cards can be partly clipped by a mobile rail. Never let their copy
  // escape the viewport and introduce horizontal scrolling during a flight.
  if (card && (from.left < 0 || from.right > innerWidth || to.left < 0 || to.right > innerWidth)) return;
  const ghost = document.createElement('div');
  ghost.className = `match-flight ${card ? 'match-flight--card' : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  ghost.append(visual.node);
  document.body.append(ghost);
  if (target) target.dataset.inFlight = 'true';
  const dx = from.left - to.left, dy = from.top - to.top;
  batch.animate(ghost, [
    { transform: `translate(${dx}px,${dy}px) scale(${from.width / to.width},${from.height / to.height})`, opacity: 1 },
    { transform: 'translate(0,0) scale(1)', opacity: card && !target ? .15 : 1 },
  ], MOVE_MS, delay, () => { ghost.remove(); if (target) delete target.dataset.inFlight; });
}
