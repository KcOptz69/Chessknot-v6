import { useSyncExternalStore } from 'react';

let busy = false;
const listeners = new Set<() => void>();
export function isMotionBusy() { return busy; }
export function setMotionBusy(next: boolean) {
  if (busy === next) return;
  busy = next;
  for (const listener of listeners) listener();
}
export function useMotionBusy() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, isMotionBusy, () => false);
}
