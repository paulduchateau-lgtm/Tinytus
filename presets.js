// Track state and preset sounds.
// Presets are plausible synthetic starting points, not medical references.

export const MAX_TRACKS = 4;
export const WAVES = ['sine', 'triangle', 'sawtooth'];
export const EARS = ['B', 'L', 'R'];

const DEFAULTS = {
  x: 0.55,     // low (0) → high (1)
  y: 0.05,     // pure (0) → diffuse (1)
  level: 0.3,  // loudness
  beat: 0,     // steady (0) → pulsing (1)
  grain: 0,    // smooth (0) → grainy (1)
  rate: 0.32,  // pulse speed (≈ 1.2 per second)
  width: 0.5,  // sound width
  ear: 'B',
  wave: 'sine',
  on: true,
};

let uid = 1;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Validates and normalises a track coming from the UI, local storage or a link. */
export function sanitizeTrack(p) {
  const o = p && typeof p === 'object' ? p : {};
  const t = { id: uid++ };
  for (const k of ['x', 'y', 'level', 'beat', 'grain', 'rate', 'width']) t[k] = num(o[k], DEFAULTS[k]);
  t.ear = EARS.includes(o.ear) ? o.ear : 'B';
  t.wave = WAVES.includes(o.wave) ? o.wave : 'sine';
  t.on = o.on !== false;
  return t;
}

export const makeTrack = (p = {}) => sanitizeTrack({ ...DEFAULTS, ...p });

export function sanitizeTracks(list) {
  if (!Array.isArray(list)) return null;
  const t = list.slice(0, MAX_TRACKS).filter(o => o && typeof o === 'object').map(sanitizeTrack);
  return t.length ? t : null;
}

export const PRESETS = [
  { id: 'whistle', art: 'whistle', name: 'High whistle', desc: 'A thin, high, steady tone.',
    tracks: [{ x: 0.84, y: 0.04, level: 0.3 }] },
  { id: 'buzz', art: 'buzz', name: 'Humming', desc: 'A low sound, like a small motor.',
    tracks: [{ x: 0.1, y: 0.12, level: 0.4, wave: 'sawtooth', grain: 0.1 }] },
  { id: 'hiss', art: 'hiss', name: 'Hissing', desc: 'Like rushing air or radio static.',
    tracks: [{ x: 0.72, y: 0.96, level: 0.32 }] },
  { id: 'crackle', art: 'crackle', name: 'Crackling', desc: 'A grainy, electric sound.',
    tracks: [{ x: 0.66, y: 0.62, level: 0.36, grain: 0.85, wave: 'triangle' }] },
  { id: 'pulse', art: 'pulse', name: 'Pulsing', desc: 'A sound that beats steadily.',
    tracks: [{ x: 0.36, y: 0.22, level: 0.38, beat: 0.9, rate: 0.27 }] },
  { id: 'multi', art: 'multi', name: 'Several sounds', desc: 'Two different tones layered together.',
    tracks: [{ x: 0.76, y: 0.04, level: 0.28 }, { x: 0.88, y: 0.1, level: 0.24 }] },
];
