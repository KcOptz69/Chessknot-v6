import React from 'react';
import {getSoundVolume, isSoundEnabled} from './audio.ts';
export function useLoopMusic(track: string | null, volume = 0.6) {
  React.useEffect(() => {
    if (!track) return;
    const audio = new Audio(`/audio/${track}.mp3`);
    audio.loop = true;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      audio.volume = Math.min(1, volume * getSoundVolume());
      if (!isSoundEnabled() || document.hidden) audio.pause();
      else if (audio.paused) void audio.play().catch(() => {});
    };
    sync();
    document.addEventListener('pointerdown', sync);
    document.addEventListener('keydown', sync);
    document.addEventListener('visibilitychange', sync);
    const timer = window.setInterval(sync, 500);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('pointerdown', sync);
      document.removeEventListener('keydown', sync);
      document.removeEventListener('visibilitychange', sync);
      audio.pause(); audio.removeAttribute('src'); audio.load();
    };
  }, [track, volume]);
}
