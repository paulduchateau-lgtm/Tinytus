// État des pistes et sons préconfigurés.
// Les presets sont des points de départ synthétiques plausibles, pas des références médicales.

export const MAX_TRACKS = 4;
export const WAVES = ['sine', 'triangle', 'sawtooth'];
export const EARS = ['B', 'L', 'R'];

const DEFAULTS = {
  x: 0.55,     // grave (0) → aigu (1)
  y: 0.05,     // pur (0) → diffus (1)
  level: 0.3,  // intensité
  beat: 0,     // continu (0) → pulsant (1)
  grain: 0,    // lisse (0) → granuleux (1)
  rate: 0.32,  // vitesse du battement (≈ 1,2 par seconde)
  width: 0.5,  // largeur du son
  ear: 'B',
  wave: 'sine',
  on: true,
};

let uid = 1;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Valide et normalise une piste venant de l'interface, du stockage local ou d'un lien. */
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
  { id: 'whistle', art: 'whistle', name: 'Sifflement aigu', desc: 'Un son fin, aigu et continu.',
    tracks: [{ x: 0.84, y: 0.04, level: 0.3 }] },
  { id: 'buzz', art: 'buzz', name: 'Bourdonnement', desc: 'Un son grave, comme un petit moteur.',
    tracks: [{ x: 0.1, y: 0.12, level: 0.4, wave: 'sawtooth', grain: 0.1 }] },
  { id: 'hiss', art: 'hiss', name: 'Souffle', desc: 'Un bruit d’air ou de radio.',
    tracks: [{ x: 0.72, y: 0.96, level: 0.32 }] },
  { id: 'crackle', art: 'crackle', name: 'Grésillement', desc: 'Un son granuleux et électrique.',
    tracks: [{ x: 0.66, y: 0.62, level: 0.36, grain: 0.85, wave: 'triangle' }] },
  { id: 'pulse', art: 'pulse', name: 'Pulsation', desc: 'Un son qui bat régulièrement.',
    tracks: [{ x: 0.36, y: 0.22, level: 0.38, beat: 0.9, rate: 0.27 }] },
  { id: 'multi', art: 'multi', name: 'Plusieurs sons', desc: 'Deux tonalités différentes superposées.',
    tracks: [{ x: 0.76, y: 0.04, level: 0.28 }, { x: 0.88, y: 0.1, level: 0.24 }] },
];
