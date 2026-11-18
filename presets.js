// Track state and preset sounds.
// Presets are plausible synthetic starting points, not medical references.

import { xOf } from './audio-engine.js';

export const MAX_TRACKS = 4;
export const WAVES = ['sine', 'triangle', 'sawtooth', 'bell'];
export const SHAPES = ['smooth', 'chirp', 'buzz']; // pulse shape: gentle sine, cricket chirps, or regular cicada buzz
export const EARS = ['B', 'L', 'R'];

const DEFAULTS = {
  x: xOf(1370), // low (0) → high (1), 20 Hz → 20 kHz
  y: 0.05,     // pure (0) → diffuse (1)
  level: 0.3,  // loudness
  beat: 0,     // steady (0) → pulsing (1)
  grain: 0,    // smooth (0) → grainy (1)
  rate: 0.32,  // pulse speed (≈ 1.2 per second)
  width: 0.5,  // sound width
  pan: 0,      // left (-1) … centre (0) … right (1)
  wave: 'sine',
  shape: 'smooth',
  on: true,
};

let uid = 1;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Validates and normalises a track coming from the UI, local storage or a link. */
export function sanitizeTrack(p) {
  const o = p && typeof p === 'object' ? p : {};
  const t = { id: uid++ };
  for (const k of ['x', 'y', 'level', 'beat', 'grain', 'rate', 'width']) t[k] = num(o[k], DEFAULTS[k]);
  // Older saves and links used ear 'L' / 'B' / 'R'.
  const pan = typeof o.pan === 'number' && Number.isFinite(o.pan) ? o.pan : { L: -1, R: 1 }[o.ear] || 0;
  t.pan = Math.min(1, Math.max(-1, pan));
  t.wave = WAVES.includes(o.wave) ? o.wave : 'sine';
  t.shape = SHAPES.includes(o.shape) ? o.shape : 'smooth';
  t.on = o.on !== false;
  return t;
}

/** Presets may give a frequency in Hz (`hz`) instead of a spectrum position (`x`). */
export const makeTrack = ({ hz, ...p } = {}) => sanitizeTrack({ ...DEFAULTS, ...p, ...(hz ? { x: xOf(hz) } : {}) });

/** Spectrum positions saved before the range became 20 Hz – 20 kHz used 80 Hz – 14 kHz. */
export const xFromV1 = x => xOf(80 * Math.pow(175, Math.min(1, Math.max(0, x))));

export function sanitizeTracks(list) {
  if (!Array.isArray(list)) return null;
  const t = list.slice(0, MAX_TRACKS).filter(o => o && typeof o === 'object').map(sanitizeTrack);
  return t.length ? t : null;
}

export const PRESETS = [
  { id: 'whistle', art: 'whistle', fr: ['Sifflement aigu', 'Un son fin, aigu et continu.'], name: 'High whistle', desc: 'A thin, high, steady tone.',
    tracks: [{ hz: 6127, y: 0.04, level: 0.3 }] },
  { id: 'buzz', art: 'buzz', fr: ['Bourdonnement', 'Un son grave, comme un petit moteur.'], name: 'Humming', desc: 'A low sound, like a small motor.',
    tracks: [{ hz: 134, y: 0.12, level: 0.4, wave: 'sawtooth', grain: 0.1 }] },
  { id: 'hiss', art: 'hiss', fr: ['Souffle', 'Un bruit d’air ou de radio.'], name: 'Hissing', desc: 'Like rushing air or radio static.',
    tracks: [{ hz: 3297, y: 0.96, level: 0.32 }] },
  { id: 'crackle', art: 'crackle', fr: ['Grésillement', 'Un son granuleux et électrique.'], name: 'Crackling', desc: 'A grainy, electric sound.',
    tracks: [{ hz: 2418, y: 0.62, level: 0.36, grain: 0.85, wave: 'triangle' }] },
  { id: 'pulse', art: 'pulse', fr: ['Pulsation', 'Un son qui bat régulièrement.'], name: 'Pulsing', desc: 'A sound that beats steadily.',
    tracks: [{ hz: 514, y: 0.22, level: 0.38, beat: 0.9, rate: 0.27 }] },
  { id: 'multi', art: 'multi', fr: ['Plusieurs sons', 'Deux tonalités différentes superposées.'], name: 'Several sounds', desc: 'Two different tones layered together.',
    tracks: [{ hz: 4053, y: 0.04, level: 0.28 }, { hz: 7533, y: 0.1, level: 0.24 }] },
  { id: 'crickets', art: 'crickets', fr: ['Grillons', 'Des « cri-cri » aigus et réguliers.'], name: 'Crickets', desc: 'High, regular chirping.',
    tracks: [{ hz: 4983, y: 0.04, level: 0.32, beat: 1, shape: 'chirp', rate: 0.53 }] },
  { id: 'cicadas', art: 'cicadas', fr: ['Cigales', 'Un bourdonnement aigu d’été, qui grésille.'], name: 'Cicadas', desc: 'A high, buzzing summer drone.',
    tracks: [{ hz: 5819, y: 0.45, level: 0.34, beat: 0.9, shape: 'buzz', rate: 0.64 }] },
  { id: 'bell', art: 'bell', fr: ['Cloche', 'Un tintement métallique qui ne s’arrête pas.'], name: 'Bell', desc: 'A metallic tone that keeps ringing.',
    tracks: [{ hz: 1600, y: 0.03, level: 0.28, wave: 'bell', beat: 0.12, rate: 0.05 }] },
];
