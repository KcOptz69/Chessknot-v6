import { getSoundVolume, isSoundEnabled } from './audio.ts';

// Source is normalized to -20 LUFS; game gain follows the recorded-effects level.
// Change only this gain when tuning against the other effects in-game.
const NEIGH_GAIN = 0.18;

export function playSuperKnightDoubleSound(): void {
  if (!isSoundEnabled()) return;
  const volume = getSoundVolume();
  if (volume <= 0.001) return;
  try {
    const clip = new Audio('/sounds/super-knight-double-neigh.wav?v=1');
    clip.volume = Math.max(0, Math.min(1, NEIGH_GAIN * volume));
    clip.play()?.catch(() => {});
  } catch {
    // A blocked or unavailable sound must never interrupt gameplay or movement.
  }
}
