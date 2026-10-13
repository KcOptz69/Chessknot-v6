// Web Audio API sound engine for Chessbound
// Zero external dependencies, pure synthetic audio with volume controls and persistence
import type { ChampionType } from '../types.ts';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let effectDestination: AudioNode | null = null;

const VOLUME_STORAGE_KEY = 'chessbound_sound_volume';
const ENABLED_STORAGE_KEY = 'chessbound_sound_enabled';

export function getSoundVolume(): number {
  try {
    const val = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (val === null) return 1.0; // 100% volume
    const num = parseFloat(val);
    return isNaN(num) ? 1.0 : Math.max(0, Math.min(1, num));
  } catch {
    return 1.0;
  }
}

export function setSoundVolume(volume: number): void {
  try {
    const clamped = Math.max(0, Math.min(1, volume));
    localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    if (audioCtx && masterGain) {
      // Scale master comfortably with dynamics limiter protecting from distortion
      masterGain.gain.setValueAtTime(clamped * 0.45, audioCtx.currentTime);
    }
  } catch {}
}

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        const currentVol = getSoundVolume();
        masterGain.gain.setValueAtTime(currentVol * 0.45, audioCtx.currentTime); // Balanced, comfortable global level

        // Transparent dynamics limiter to prevent acoustic clipping and harsh spikes
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-16, audioCtx.currentTime);
        compressor.knee.setValueAtTime(12, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.2, audioCtx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function getAudioDest(ctx: AudioContext): AudioNode {
  return effectDestination || masterGain || ctx.destination;
}

// User-interaction unlocker to comply with modern browser autoplay policies
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Prime audio element
      const dummy = new Audio();
      dummy.volume = 0;
      dummy.play().catch(() => {});
    } catch {}
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('click', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true, capture: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, capture: true });
  window.addEventListener('click', unlockAudio, { passive: true, capture: true });
}

// Approved short recordings with synthetic fallback. Playback stays soft, clear, and balanced.
// Per-clip gains target roughly -36 LUFS at full user volume. Equal slider
// values cannot balance recordings with very different source loudness.
const DEFAULT_RECORDED_VOLUME = 0.18;
const RECORDED_EFFECT_GAIN: Record<string, number> = {
  'banish-trigger.wav': 0.0664,
  'beacon-activation.mp3': 0.1094,
  'berserker-summon.mp3': 0.0599,
  'berserker-ultimate.mp3': 0.0713,
  'clock-activation.mp3': 0.0767,
  'disarm-trigger.wav': 0.1488,
  'mine-trigger.wav': 0.1635,
  'musketeer-summon.mp3': 0.2371,
  'musketeer-ultimate.mp3': 0.2441,
  'ninja-summon.mp3': 0.0467,
  'ninja-ultimate.mp3': 0.1093,
  'poison-trigger.wav': 0.1417,
  'static-activation.mp3': 0.0452,
  'tile-place.wav': 0.18,
  'trap-place.wav': 0.18,
};
const SOFTER_EFFECTS = new Set(['berserker-summon', 'berserker-ultimate', 'musketeer-summon', 'musketeer-ultimate', 'ninja-summon', 'ninja-ultimate', 'static-activation', 'clock-activation']);
function playRecordedEffect(name: string, fallback?: () => void, volumeOverride?: number): void {
  if (!isSoundEnabled()) return;
  const vol = getSoundVolume();
  if (vol <= 0.001) return;
  const softer = SOFTER_EFFECTS.has(name.replace(/\.(mp3|wav)$/, ''));
  const playFallback = () => {
    if (!fallback) return;
    const ctx = softer ? getAudioContext() : null;
    if (!ctx) { fallback(); return; }
    const quietGain = ctx.createGain();
    quietGain.gain.value = 0.5;
    quietGain.connect(getAudioDest(ctx));
    const previousDestination = effectDestination;
    effectDestination = quietGain;
    try { fallback(); } finally {
      effectDestination = previousDestination;
      window.setTimeout(() => quietGain.disconnect(), 10000);
    }
  };
  try {
    const filename = name.includes('.') ? name : `${name}.mp3`;
    const clip = new Audio('/sounds/' + filename + '?v=5-balanced-effects-1');
    clip.volume = Math.max(0, Math.min(1, (RECORDED_EFFECT_GAIN[filename] ?? volumeOverride ?? DEFAULT_RECORDED_VOLUME) * vol));
    const playPromise = clip.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        playFallback();
      });
    }
  } catch {
    playFallback();
  }
}

export function isSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(ENABLED_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
  } catch {}
}

/**
 * Play a clear, pleasant double-bell chime when opponent completes a move
 */
export function playOpponentMoveSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: 587.33 Hz (D5)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(587.33, now);
  gain1.gain.setValueAtTime(0.16, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc1.connect(gain1);
  gain1.connect(getAudioDest(ctx));

  osc1.start(now);
  osc1.stop(now + 0.35);

  // Tone 2: 880 Hz (A5) with slight offset
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.0, now + 0.08);
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(0.14, now + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc2.connect(gain2);
  gain2.connect(getAudioDest(ctx));

  osc2.start(now + 0.08);
  osc2.stop(now + 0.45);
}

/**
 * Play gentle chat notification sound
 */
export function playChatSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, now); // C5
  osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.09); // G5

  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(getAudioDest(ctx));

  osc.start(now);
  osc.stop(now + 0.12);
}

/**
 * Play distinct incoming chat notification sound when your opponent sends a message
 * Pleasant two-note marimba / bell chime with quick harmonic shimmer
 */
export function playOpponentChatSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: 587.33 Hz (D5)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);
  osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
  gain1.gain.setValueAtTime(0.13, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc1.connect(gain1);
  gain1.connect(getAudioDest(ctx));
  osc1.start(now);
  osc1.stop(now + 0.22);

  // Tone 2: 880 Hz (A5) slightly delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(880.0, now + 0.09);
  osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18); // C6
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(0.13, now + 0.09);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc2.connect(gain2);
  gain2.connect(getAudioDest(ctx));
  osc2.start(now + 0.09);
  osc2.stop(now + 0.35);
}

/**
 * Play standard piece move sound (warm wooden tactile tap)
 */
export function playMoveSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);

  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(getAudioDest(ctx));

  osc.start(now);
  osc.stop(now + 0.09);
}

/**
 * Play capture sound (punchy wood impact)
 */
export function playCaptureSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(getAudioDest(ctx));

  osc.start(now);
  osc.stop(now + 0.12);
}

/**
 * Play an atmospheric rushing wind / gust sound effect when a piece is moved by a Push card
 */
export function playWindSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const duration = 0.55;

    // Generate white noise buffer
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    // Resonant bandpass filter that sweeps like a whistling gust of wind
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.0, now);
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(850, now + 0.22);
    filter.frequency.exponentialRampToValueAtTime(220, now + duration);

    // Second lowpass filter to soften the harsh edges
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1400, now);

    // Gain envelope with smooth gust fade-in and natural dissipation
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Connect node graph
    whiteNoise.connect(filter);
    filter.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(getAudioDest(ctx));

    whiteNoise.start(now);
    whiteNoise.stop(now + duration);
  } catch (err) {
    console.warn('Could not synthesize wind sound:', err);
  }
}

/**
 * Play an urgent alerting sound effect when a King is in Check
 */
export function playCheckAlertSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Sub-bass tension thud
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
    subGain.gain.setValueAtTime(0.14, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    subOsc.connect(subGain);
    subGain.connect(getAudioDest(ctx));
    subOsc.start(now);
    subOsc.stop(now + 0.18);

    // Pulse 1: Urgent sharp alert stabs (Minor 2nd dissonance for warning tension)
    const tones1 = [740, 784]; // Dissonant tension interval
    tones1.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      // Lowpass filter to keep it crisp but not harsh
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, now);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(getAudioDest(ctx));

      osc.start(now);
      osc.stop(now + 0.12);
    });

    // Pulse 2: Higher pitch urgent follow-up pulse
    const tones2 = [880, 932]; // A5 + Bb5 jarring siren alarm
    tones2.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + 0.13);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, now + 0.13);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.10, now + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(getAudioDest(ctx));

      osc.start(now + 0.13);
      osc.stop(now + 0.35);
    });
  } catch (err) {
    console.warn('Could not synthesize check alert sound:', err);
  }
}

/**
 * Play a comical clown laughing sound effect when Joker card is activated
 * Features a comic squeak horn followed by rhythmic formant chuckles (hee-hee-ha-ha-ha-ho)
 */
export function playClownLaughSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Comic rubber horn squeak (honk-honk!)
    const honkOsc = ctx.createOscillator();
    const honkGain = ctx.createGain();
    honkOsc.type = 'sawtooth';
    honkOsc.frequency.setValueAtTime(320, now);
    honkOsc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
    honkOsc.frequency.exponentialRampToValueAtTime(440, now + 0.12);

    const honkFilter = ctx.createBiquadFilter();
    honkFilter.type = 'bandpass';
    honkFilter.frequency.setValueAtTime(900, now);
    honkFilter.Q.setValueAtTime(3.5, now);

    honkGain.gain.setValueAtTime(0.12, now);
    honkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    honkOsc.connect(honkFilter);
    honkFilter.connect(honkGain);
    honkGain.connect(getAudioDest(ctx));

    honkOsc.start(now);
    honkOsc.stop(now + 0.12);

    // 2. Rhythmic clown chuckle laugh sequence: [hee, hee, ha, ha, ha, ho]
    const chuckles = [
      { start: 0.14, startFreq: 580, endFreq: 460, duration: 0.11, formant: 1300 },
      { start: 0.27, startFreq: 640, endFreq: 510, duration: 0.11, formant: 1400 },
      { start: 0.40, startFreq: 690, endFreq: 540, duration: 0.12, formant: 1250 },
      { start: 0.54, startFreq: 610, endFreq: 470, duration: 0.13, formant: 1100 },
      { start: 0.69, startFreq: 530, endFreq: 390, duration: 0.15, formant: 950 },
      { start: 0.86, startFreq: 440, endFreq: 310, duration: 0.18, formant: 800 },
    ];

    chuckles.forEach((c) => {
      const t = now + c.start;

      // Primary laugh oscillator (sawtooth for rich harmonic vocal timbre)
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';

      // Pitch scoop down with comical vibrato
      osc.frequency.setValueAtTime(c.startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(c.endFreq, t + c.duration);

      // Comical vibrato LFO on chuckle
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(14, t); // 14 Hz rapid laughing flutter
      lfoGain.gain.setValueAtTime(25, t);
      lfo.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + c.duration);

      // Vocal formant filter (mimics "A/HA" mouth resonance)
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(c.formant, t);
      formant.Q.setValueAtTime(4.0, t);

      // Amplitude envelope (sharp staccato laughter burst)
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + c.duration);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(getAudioDest(ctx));

      osc.start(t);
      osc.stop(t + c.duration);
    });
  } catch (err) {
    console.warn('Could not synthesize clown laugh sound:', err);
  }
}

/**
 * Play heavy rattling iron chains and padlock locking sound when Restrict card is played
 */
export function playLockChainsSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Shaking & rattling metallic chain links (staggered inharmonic metal clinks)
    const chainLinks = [
      { delay: 0.00, freq: 1750, dur: 0.09 },
      { delay: 0.03, freq: 2800, dur: 0.08 },
      { delay: 0.07, freq: 2150, dur: 0.10 },
      { delay: 0.11, freq: 3400, dur: 0.07 },
      { delay: 0.16, freq: 1600, dur: 0.11 },
      { delay: 0.21, freq: 2950, dur: 0.09 },
    ];

    chainLinks.forEach((link) => {
      const t = now + link.delay;

      // Inharmonic metallic ring
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(link.freq, t);
      osc.frequency.exponentialRampToValueAtTime(link.freq * 0.75, t + link.dur);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + link.dur);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));

      osc.start(t);
      osc.stop(t + link.dur);
    });

    // Metallic chain scrape noise burst
    const noiseDur = 0.26;
    const bufSize = Math.floor(ctx.sampleRate * noiseDur);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3200, now);
    noiseFilter.Q.setValueAtTime(6.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.09, now + 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(getAudioDest(ctx));
    noiseSrc.start(now);
    noiseSrc.stop(now + noiseDur);

    // 2. Heavy Padlock Latch & Snap (at t + 0.28s: Solid iron lock engages!)
    const lockTime = now + 0.27;

    // Heavy iron bolt impact
    const boltOsc = ctx.createOscillator();
    const boltGain = ctx.createGain();
    boltOsc.type = 'triangle';
    boltOsc.frequency.setValueAtTime(240, lockTime);
    boltOsc.frequency.exponentialRampToValueAtTime(55, lockTime + 0.15);
    boltGain.gain.setValueAtTime(0.14, lockTime);
    boltGain.gain.exponentialRampToValueAtTime(0.001, lockTime + 0.15);
    boltOsc.connect(boltGain);
    boltGain.connect(getAudioDest(ctx));
    boltOsc.start(lockTime);
    boltOsc.stop(lockTime + 0.15);

    // Sharp metallic latch snap
    const latchOsc = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(1400, lockTime);
    latchOsc.frequency.exponentialRampToValueAtTime(700, lockTime + 0.05);

    const latchFilter = ctx.createBiquadFilter();
    latchFilter.type = 'bandpass';
    latchFilter.frequency.setValueAtTime(1600, lockTime);
    latchFilter.Q.setValueAtTime(2.0, lockTime);

    latchGain.gain.setValueAtTime(0.12, lockTime);
    latchGain.gain.exponentialRampToValueAtTime(0.001, lockTime + 0.07);

    latchOsc.connect(latchFilter);
    latchFilter.connect(latchGain);
    latchGain.connect(getAudioDest(ctx));
    latchOsc.start(lockTime);
    latchOsc.stop(lockTime + 0.07);
  } catch (err) {
    console.warn('Could not synthesize lock chains sound:', err);
  }
}

/**
 * Play a deep crumbling stone, heavy rock impact & grinding sound effect when Monolith is played
 */
export function playRockyMonolithSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const dur = 0.55;

    // 1. Deep seismic boulder impact (solid sub-bass ground slam)
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(110, now);
    thudOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

    thudGain.gain.setValueAtTime(0.18, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    thudOsc.connect(thudGain);
    thudGain.connect(getAudioDest(ctx));
    thudOsc.start(now);
    thudOsc.stop(now + 0.4);

    // 2. Hollow stone slab resonance (stone striking stone)
    const slabOsc = ctx.createOscillator();
    const slabGain = ctx.createGain();
    slabOsc.type = 'sine';
    slabOsc.frequency.setValueAtTime(230, now);
    slabOsc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
    slabGain.gain.setValueAtTime(0.12, now);
    slabGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    slabOsc.connect(slabGain);
    slabGain.connect(getAudioDest(ctx));
    slabOsc.start(now);
    slabOsc.stop(now + 0.25);

    // 3. Grinding stone rubble and crumbling rock debris
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    // Lowpass/bandpass rock filter to capture gritty stone crunch
    const rockFilter = ctx.createBiquadFilter();
    rockFilter.type = 'bandpass';
    rockFilter.frequency.setValueAtTime(450, now);
    rockFilter.frequency.exponentialRampToValueAtTime(160, now + dur);
    rockFilter.Q.setValueAtTime(2.2, now);

    const rockGain = ctx.createGain();
    rockGain.gain.setValueAtTime(0.13, now);
    rockGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noiseSrc.connect(rockFilter);
    rockFilter.connect(rockGain);
    rockGain.connect(getAudioDest(ctx));

    noiseSrc.start(now);
    noiseSrc.stop(now + dur);
  } catch (err) {
    console.warn('Could not synthesize monolith rock sound:', err);
  }
}

/**
 * Play mystical revealing chime / celestial sweep when Vision is played to reveal hidden cards
 */
export function playVisionRevealSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Ascending crystal harmonic arpeggio (magical discovery chord)
    const pitches = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    pitches.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));

      osc.start(t);
      osc.stop(t + 0.45);
    });

    // 2. Ethereal resonant filter sweep (veil lifting / third eye opening)
    const dur = 0.55;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(4800, now + 0.35);
    filter.Q.setValueAtTime(5.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noiseSrc.connect(filter);
    filter.connect(gain);
    gain.connect(getAudioDest(ctx));

    noiseSrc.start(now);
    noiseSrc.stop(now + dur);
  } catch (err) {
    console.warn('Could not synthesize vision reveal sound:', err);
  }
}

/**
 * Play tactile card draw / deck slide and flick sound effect
 * Used for "Redraw and Pass" and the "Draw" power-up
 */
export function playCardDrawSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const cardSwishes = [0.0, 0.12];

    cardSwishes.forEach((startTime) => {
      const t = now + startTime;
      const slideDur = 0.11;

      // 1. Friction paper/card sliding noise
      const bufSize = Math.floor(ctx.sampleRate * slideDur);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(2200, t);
      bandpass.frequency.exponentialRampToValueAtTime(3800, t + slideDur);
      bandpass.Q.setValueAtTime(3.2, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, t);
      noiseGain.gain.linearRampToValueAtTime(0.11, t + 0.03);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + slideDur);

      noiseSrc.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(getAudioDest(ctx));

      noiseSrc.start(t);
      noiseSrc.stop(t + slideDur);

      // 2. Crisp card release / flick tap
      const tapTime = t + 0.07;
      const tapOsc = ctx.createOscillator();
      const tapGain = ctx.createGain();
      tapOsc.type = 'triangle';
      tapOsc.frequency.setValueAtTime(420, tapTime);
      tapOsc.frequency.exponentialRampToValueAtTime(110, tapTime + 0.04);

      tapGain.gain.setValueAtTime(0.09, tapTime);
      tapGain.gain.exponentialRampToValueAtTime(0.001, tapTime + 0.04);

      tapOsc.connect(tapGain);
      tapGain.connect(getAudioDest(ctx));
      tapOsc.start(tapTime);
      tapOsc.stop(tapTime + 0.04);
    });
  } catch (err) {
    console.warn('Could not synthesize card draw sound:', err);
  }
}

/**
 * Holy Sound Effect: Resonant cathedral chimes + celestial choir chord + golden harmonic shimmer
 * Played when the Beacon card is cast
 */
export function playSyntheticHolySound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.001, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.05 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now + idx * 0.05);
      osc.stop(now + 0.85);
    });
  } catch {}
}

export function playHolySound() {
  playRecordedEffect('beacon-activation', playSyntheticHolySound);
}

/**
 * Electrified Sound Effect: Stuttering high-voltage buzz, electrostatic sparks, and discharge snap
 * Played when the Static card is cast
 */
export function playSyntheticElectricSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.setValueAtTime(280, now + 0.05);
    osc.frequency.setValueAtTime(140, now + 0.1);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.38);
  } catch {}
}

/** A soft rising electrical charge announces Static before its stun impact. */
export function playStaticPreparationSound(): boolean {
  if (!isSoundEnabled() || getSoundVolume() <= 0.001) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    const now = ctx.currentTime;
    const charge = ctx.createOscillator();
    const gain = ctx.createGain();
    charge.type = 'sawtooth';
    charge.frequency.setValueAtTime(95, now);
    charge.frequency.exponentialRampToValueAtTime(620, now + 0.42);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    charge.connect(filter); filter.connect(gain); gain.connect(getAudioDest(ctx));
    charge.start(now); charge.stop(now + 0.47);
    charge.onended = () => { charge.disconnect(); filter.disconnect(); gain.disconnect(); };
    return true;
  } catch { return false; }
}

export function playElectricSound() {
  const prepared = playStaticPreparationSound();
  const impact = () => playRecordedEffect('static-activation', playSyntheticElectricSound);
  if (prepared) window.setTimeout(impact, 470);
  else impact();
}

/**
 * Reversed Time Sound Effect: Time warp pitch sweep + reverse ticking pulse + cosmic rewind whoosh
 * Played when Activate the Clock is activated
 */
export function playSyntheticTimeRewindSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.45);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.52);
  } catch {}
}

export function playTimeRewindSound() {
  playRecordedEffect('clock-activation', playSyntheticTimeRewindSound);
}

/**
 * Switch Sound Effect:
 * Dual-tone crossfading phase-warp swap with resonant filter sweep
 * Played when the Switch card swaps two adjacent pieces
 */
let lastSwitchSoundTime = 0;
export function playSwitchSound() {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastSwitchSoundTime < 350) return;
  lastSwitchSoundTime = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Ascending warp tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(260, now);
    osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.28);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(getAudioDest(ctx));
    osc1.start(now);
    osc1.stop(now + 0.32);

    // Descending counter-tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, now);
    osc2.frequency.exponentialRampToValueAtTime(329.63, now + 0.28);
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.10, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(gain2);
    gain2.connect(getAudioDest(ctx));
    osc2.start(now);
    osc2.stop(now + 0.32);

    // Filtered phase swoosh
    const swooshOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const swooshGain = ctx.createGain();
    swooshOsc.type = 'sawtooth';
    swooshOsc.frequency.setValueAtTime(180, now);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    filter.Q.setValueAtTime(3.0, now);
    swooshGain.gain.setValueAtTime(0.001, now);
    swooshGain.gain.linearRampToValueAtTime(0.09, now + 0.06);
    swooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    swooshOsc.connect(filter);
    filter.connect(swooshGain);
    swooshGain.connect(getAudioDest(ctx));
    swooshOsc.start(now);
    swooshOsc.stop(now + 0.32);
  } catch (err) {
    console.warn('Could not synthesize switch sound:', err);
  }
}

/**
 * Berserker Warrior Shout Sound:
 * Realistic barbarian battle roar, chest resonance, throat growl, breath expulsion, and ferocious war-stomp impact
 */
export function playBerserkerShoutSound(isUltimate: boolean = false) {
  playRecordedEffect(isUltimate ? 'berserker-ultimate' : 'berserker-summon', () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isUltimate ? 140 : 110, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now);
      osc.stop(now + 0.48);
    } catch {}
  });
}
export const playWarriorShoutSound = playBerserkerShoutSound;
export const playSlashSound = playBerserkerShoutSound;

/**
 * Musketeer Gunshot Sound Effect:
 * Powerful gunpowder explosion thump, high supersonic crack, and smoke echo
 * Played when Musketeer is summoned or uses their ultimate
 */
export function playGunshotSound(isUltimate: boolean = false) {
  playRecordedEffect(isUltimate ? 'musketeer-ultimate' : 'musketeer-summon', () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  });
}

/**
 * Summoner Magic Arcane Sound Effect:
 * Dimensional portal opening, mystical arcane chord arpeggio, celestial shimmer, and cosmic resonance
 * Played when Summoner is deployed or casts ultimate
 */
export function playArcaneMagicSound(isUltimate: boolean = false) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const dur = isUltimate ? 1.05 : 0.8;

    const freqs = isUltimate
      ? [349.23, 415.3, 523.25, 622.25, 698.46, 830.61, 1046.5]
      : [349.23, 415.3, 523.25, 622.25, 698.46];

    freqs.forEach((freq, idx) => {
      const t = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.45);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(isUltimate ? 0.09 : 0.08, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(t);
      osc.stop(t + 0.58);
    });

    // Cosmic ether portal swirl
    const swirlOsc = ctx.createOscillator();
    const swirlGain = ctx.createGain();
    swirlOsc.type = 'triangle';
    swirlOsc.frequency.setValueAtTime(220, now);
    swirlOsc.frequency.exponentialRampToValueAtTime(isUltimate ? 1200 : 880, now + dur);

    swirlGain.gain.setValueAtTime(0.01, now);
    swirlGain.gain.linearRampToValueAtTime(isUltimate ? 0.12 : 0.10, now + 0.2);
    swirlGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    swirlOsc.connect(swirlGain);
    swirlGain.connect(getAudioDest(ctx));
    swirlOsc.start(now);
    swirlOsc.stop(now + dur);

    // High crystalline mana shimmer / sparkle grains
    const sparkleOsc = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(1760, now + 0.1);
    sparkleOsc.frequency.exponentialRampToValueAtTime(3520, now + 0.4);

    sparkleGain.gain.setValueAtTime(0.001, now);
    sparkleGain.gain.linearRampToValueAtTime(0.07, now + 0.15);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(getAudioDest(ctx));
    sparkleOsc.start(now + 0.1);
    sparkleOsc.stop(now + 0.6);
  } catch (err) {
    console.warn('Could not synthesize arcane magic sound:', err);
  }
}
export const playSummonSound = playArcaneMagicSound;

/**
 * Ninja Japanese Theme Sound Effect:
 * Traditional Japanese Insen scale koto pluck with string bend, swift stealth shadow dash, whistling shuriken spin, and hyoshigi clack
 * Played when Ninja is deployed or casts ultimate
 */
export function playJapaneseNinjaSound(isUltimate: boolean = false) {
  playRecordedEffect(isUltimate ? 'ninja-ultimate' : 'ninja-summon', () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [440, 466.16, 587.33, 659.25, 783.99].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.07);
        gain.gain.setValueAtTime(0.01, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.10, now + i * 0.07 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(getAudioDest(ctx));
        osc.start(now + i * 0.07);
        osc.stop(now + 0.55);
      });
    } catch {}
  });
}
export const playNinjaSound = playJapaneseNinjaSound;

/**
 * Universal Champion Sound Dispatcher:
 * Automatically plays the corresponding champion summon or ultimate sound effect
 */
export function playChampionSound(championType?: ChampionType, isUltimate: boolean = false) {
  if (!championType) return;
  switch (championType) {
    case 'berserker':
      playBerserkerShoutSound(isUltimate);
      break;
    case 'musketeer':
      playGunshotSound(isUltimate);
      break;
    case 'summoner':
      playArcaneMagicSound(isUltimate);
      break;
    case 'ninja':
      playJapaneseNinjaSound(isUltimate);
      break;
  }
}

/**
 * Play an epic powerup sound effect when players use Awakening Cards
 * Combines an ascending sparkling chord, a surging energetic frequency sweep, and a resonant bass bloom
 */
let lastAwakeningSoundTime = 0;
export function playAwakeningPowerupSound() {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastAwakeningSoundTime < 250) return;
  lastAwakeningSoundTime = nowMs;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Warm sub-bass power surge
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(110, now);
    bassOsc.frequency.exponentialRampToValueAtTime(55, now + 0.5);

    bassGain.gain.setValueAtTime(0.001, now);
    bassGain.gain.linearRampToValueAtTime(0.16, now + 0.05);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    bassOsc.connect(bassGain);
    bassGain.connect(getAudioDest(ctx));
    bassOsc.start(now);
    bassOsc.stop(now + 0.6);

    // 2. Ascending Sparkling Arpeggio notes (C4, E4, G4, C5, E5, G5, C6)
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const noteStartTime = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, noteStartTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.03, noteStartTime + 0.35);

      gain.gain.setValueAtTime(0.001, noteStartTime);
      gain.gain.linearRampToValueAtTime(0.09, noteStartTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + 0.4);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(noteStartTime);
      osc.stop(noteStartTime + 0.45);
    });

    // 3. Shimmering cosmic sweep
    const sweepOsc = ctx.createOscillator();
    const sweepFilter = ctx.createBiquadFilter();
    const sweepGain = ctx.createGain();

    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(220, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(1760, now + 0.7);

    sweepFilter.type = 'bandpass';
    sweepFilter.frequency.setValueAtTime(400, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(4200, now + 0.7);
    sweepFilter.Q.setValueAtTime(3.5, now);

    sweepGain.gain.setValueAtTime(0.001, now);
    sweepGain.gain.linearRampToValueAtTime(0.08, now + 0.15);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    sweepOsc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(getAudioDest(ctx));
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.8);
  } catch (err) {
    console.warn('Could not synthesize awakening powerup sound:', err);
  }
}

/**
 * Revive Sound Effect:
 * Sacred celestial chime, divine resurrection chord (D major ascending arpeggio with shimmering harmonics),
 * and an inspiring breath of restoration when a fallen piece is revived on the summoning circle.
 */
let lastReviveSoundTime = 0;
export function playReviveSound() {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastReviveSoundTime < 250) return;
  lastReviveSoundTime = nowMs;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Resonant golden bell chime (D5 + A5 harmony)
    const bellFreqs = [587.33, 880.0, 1174.66];
    bellFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.01, now + 0.8);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.10 / (idx + 1), now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now);
      osc.stop(now + 0.88);
    });

    // 2. Ascending Divine Harp / Light Arpeggio: D4, F#4, A4, D5, F#5, A5
    const notes = [293.66, 369.99, 440.0, 587.33, 739.99, 880.0];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, t + 0.4);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(t);
      osc.stop(t + 0.52);
    });

    // 3. Shimmering celestial blessing shimmer
    const shimmerOsc = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(1760, now + 0.15);
    shimmerOsc.frequency.exponentialRampToValueAtTime(3520, now + 0.7);

    shimmerGain.gain.setValueAtTime(0.001, now + 0.15);
    shimmerGain.gain.linearRampToValueAtTime(0.06, now + 0.25);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(getAudioDest(ctx));
    shimmerOsc.start(now + 0.15);
    shimmerOsc.stop(now + 0.82);
  } catch (err) {
    console.warn('Could not synthesize revive sound:', err);
  }
}

/**
 * Soul Release Sound Effect:
 * Ominous yet ethereal spectral emergence — low occult drone, dual eerie detuned spectral wisps,
 * mystical ascending filter sweep, and a ghostly soul-condensing crystal chime.
 */
let lastSoulReleaseSoundTime = 0;
export function playSoulReleaseSound() {
  if (!isSoundEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastSoulReleaseSoundTime < 250) return;
  lastSoulReleaseSoundTime = nowMs;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // 1. Deep ethereal spirit undertone (130Hz -> 75Hz)
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    droneOsc.type = 'triangle';
    droneOsc.frequency.setValueAtTime(130, now);
    droneOsc.frequency.exponentialRampToValueAtTime(75, now + 0.7);

    droneGain.gain.setValueAtTime(0.001, now);
    droneGain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    droneOsc.connect(droneGain);
    droneGain.connect(getAudioDest(ctx));
    droneOsc.start(now);
    droneOsc.stop(now + 0.82);

    // 2. Dual detuned ghostly spectral wisps creating an eerie ethereal phasing beat
    [329.63, 336.5].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + 0.65);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now);
      osc.stop(now + 0.78);
    });

    // 3. Occult spectral sweep through bandpass filter
    const sweepOsc = ctx.createOscillator();
    const sweepFilter = ctx.createBiquadFilter();
    const sweepGain = ctx.createGain();

    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(196.0, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(659.25, now + 0.6);

    sweepFilter.type = 'bandpass';
    sweepFilter.frequency.setValueAtTime(350, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(1600, now + 0.45);
    sweepFilter.frequency.exponentialRampToValueAtTime(700, now + 0.75);
    sweepFilter.Q.setValueAtTime(4.0, now);

    sweepGain.gain.setValueAtTime(0.001, now);
    sweepGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    sweepOsc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(getAudioDest(ctx));
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.82);

    // 4. Ghostly crystal soul chime
    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(1046.5, now + 0.1); // C6
    chimeOsc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.35); // E6

    chimeGain.gain.setValueAtTime(0.001, now + 0.1);
    chimeGain.gain.linearRampToValueAtTime(0.09, now + 0.15);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(getAudioDest(ctx));
    chimeOsc.start(now + 0.1);
    chimeOsc.stop(now + 0.72);
  } catch (err) {
    console.warn('Could not synthesize soul release sound:', err);
  }
}

/**
 * Treacherous Grounds Synthetic Sound Fallbacks:
 * High-fidelity Web Audio synthesis when recorded .wav files fail or browser autoplay blocks HTMLAudioElement
 */

/**
 * Mine Explosion Sound:
 * Heavy sub-bass detonation punch and resonant rubble explosion
 */
export function playMineSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.45;

    // Sub thump
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(75, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.3);
    subGain.gain.setValueAtTime(0.18, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    subOsc.connect(subGain);
    subGain.connect(getAudioDest(ctx));
    subOsc.start(now);
    subOsc.stop(now + 0.35);

    // Blast noise
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + dur);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(getAudioDest(ctx));
    src.start(now);
    src.stop(now + dur);
  } catch {}
}

/**
 * Poison Trap Sound:
 * Sizzling caustic acid hiss and bubbling toxic chime
 */
export function playPoisonSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const dur = 0.42;

    // Acid hiss
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(600, now + dur);
    filter.Q.setValueAtTime(3.0, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.11, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(getAudioDest(ctx));
    src.start(now);
    src.stop(now + dur);

    // Eerie bubbling tone
    [240, 310].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + idx * 0.08 + 0.15);
      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(getAudioDest(ctx));
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.22);
    });
  } catch {}
}

/**
 * Banish Trap Sound:
 * Spatial void suction and otherworldly resonance
 */
export function playBanishSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.45);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.45);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {}
}

/**
 * Disarm Trap Sound:
 * Sharp metallic strike and dropping blade ring
 */
export function playDisarmSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;

    // Metallic clash
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.18);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.22);

    // Dropping weapon tap
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(320, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(90, now + 0.18);
    gain2.gain.setValueAtTime(0.08, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(getAudioDest(ctx));
    osc2.start(now + 0.1);
    osc2.stop(now + 0.22);
  } catch {}
}

/**
 * Tile Place Sound:
 * Tactile wooden/stone tile placement click
 */
export function playTilePlaceSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
}

/**
 * Trap Place Sound:
 * Crisp spring latch mechanism set click
 */
export function playTrapPlaceSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(getAudioDest(ctx));
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {}
}

/**
 * Universal Ground Effect Dispatcher:
 * Automatically plays recorded sound with instant synthetic fallback
 */
export function playGroundEffect(type: 'mine' | 'poison' | 'banish' | 'disarm' | 'tile-place' | 'trap-place' | 'portal') {
  if (!isSoundEnabled()) return;
  switch (type) {
    case 'portal':
      playSwitchSound();
      break;
    case 'mine':
      playRecordedEffect('mine-trigger.wav', playMineSound, 0.36);
      break;
    case 'poison':
      playRecordedEffect('poison-trigger.wav', playPoisonSound, 0.36);
      break;
    case 'banish':
      playRecordedEffect('banish-trigger.wav', playBanishSound, 0.36);
      break;
    case 'disarm':
      playRecordedEffect('disarm-trigger.wav', playDisarmSound, 0.36);
      break;
    case 'tile-place':
      playRecordedEffect('tile-place.wav', playTilePlaceSound, 0.32);
      break;
    case 'trap-place':
      playRecordedEffect('trap-place.wav', playTrapPlaceSound, 0.32);
      break;
  }
}



/** Frontier clips use the sound controls and a synthetic fallback on failure. */
export function playFrontierSound(clip:string,fallback?:'wind'|'explosion'|'summon') {
 if(!isSoundEnabled()||getSoundVolume()<=0.001)return;
 let failed=false;
 const recover=()=>{if(failed)return;failed=true;if(fallback==='wind')playWindSound();else if(fallback==='explosion')playMineSound();else if(fallback==='summon')playAwakeningPowerupSound();};
 try{const sound=new Audio(`/audio/frontier/${clip}.mp3`);sound.volume=.5*getSoundVolume();sound.onerror=recover;void sound.play().catch(recover);}catch{recover();}
}

/** A single detonation: sharp noise attack, descending bass and debris rumble. */
export function playGolemExplosionSound() {
 if(!isSoundEnabled()||getSoundVolume()<=0.001)return;
 const ctx=getAudioContext();if(!ctx)return;
 try{
  const now=ctx.currentTime,dest=getAudioDest(ctx);
  const bass=ctx.createOscillator(),bassGain=ctx.createGain();
  bass.type='sine';bass.frequency.setValueAtTime(115,now);bass.frequency.exponentialRampToValueAtTime(28,now+.75);
  bassGain.gain.setValueAtTime(.001,now);bassGain.gain.linearRampToValueAtTime(.7,now+.012);bassGain.gain.exponentialRampToValueAtTime(.001,now+1.25);
  bass.connect(bassGain);bassGain.connect(dest);bass.start(now);bass.stop(now+1.3);
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.8),ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(6000,now);filter.frequency.exponentialRampToValueAtTime(140,now+1.6);
  gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(.65,now+.008);gain.gain.exponentialRampToValueAtTime(.22,now+.18);gain.gain.exponentialRampToValueAtTime(.001,now+1.7);
  noise.connect(filter);filter.connect(gain);gain.connect(dest);noise.start(now);noise.stop(now+1.8);
  bass.onended=()=>{bass.disconnect();bassGain.disconnect();};noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
 }catch{}
}
