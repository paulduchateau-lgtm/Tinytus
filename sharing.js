// Sérialisation compacte et versionnée d'une composition dans le fragment de l'URL.
//
// Format v1 (puis base64url) :
//   [version=1][nombre de pistes 1..4]
//   par piste : x (16 bits) · y · intensité · battement · grain · vitesse · largeur (8 bits chacun)
//               · drapeaux (bit0 actif, bits1-2 oreille, bits3-4 timbre)
//   [somme de contrôle : somme des octets précédents modulo 256]
// Exemple : https://utilisateur.github.io/tinnitus-studio/#s=AQHXCgpNAAAAUoAB…

import { sanitizeTrack, EARS, WAVES, MAX_TRACKS } from './presets.js';

const VERSION = 1;
const PREFIX = 's=';
const PER_TRACK = 9;
const q = v => Math.round(Math.min(1, Math.max(0, v)) * 255);

export function encodeShare(tracks) {
  const b = [VERSION, tracks.length];
  for (const t of tracks) {
    const x = Math.round(t.x * 65535);
    b.push(x >> 8, x & 255, q(t.y), q(t.level), q(t.beat), q(t.grain), q(t.rate), q(t.width),
      (t.on ? 1 : 0) | (Math.max(0, EARS.indexOf(t.ear)) << 1) | (Math.max(0, WAVES.indexOf(t.wave)) << 3));
  }
  b.push(b.reduce((s, v) => s + v, 0) & 255);
  const b64 = btoa(String.fromCharCode(...b));
  return PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Retourne les pistes, ou lève une erreur si le lien est invalide. */
export function decodeShare(hash) {
  const raw = decodeURIComponent(String(hash).replace(/^#/, ''));
  if (!raw.startsWith(PREFIX)) throw new Error('format');
  const b64 = raw.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+$/.test(b64)) throw new Error('caractères');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const b = Array.from(bin, c => c.charCodeAt(0));
  if (b[0] !== VERSION) throw new Error('version');
  const n = b[1];
  if (!(n >= 1 && n <= MAX_TRACKS) || b.length !== 3 + n * PER_TRACK) throw new Error('longueur');
  const sum = b.slice(0, -1).reduce((s, v) => s + v, 0) & 255;
  if (sum !== b[b.length - 1]) throw new Error('contrôle');
  const tracks = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * PER_TRACK, f = b[o + 8];
    const ear = (f >> 1) & 3, wave = (f >> 3) & 3;
    if (ear >= EARS.length || wave >= WAVES.length || f >> 5) throw new Error('valeurs');
    tracks.push(sanitizeTrack({
      x: ((b[o] << 8) | b[o + 1]) / 65535,
      y: b[o + 2] / 255, level: b[o + 3] / 255, beat: b[o + 4] / 255,
      grain: b[o + 5] / 255, rate: b[o + 6] / 255, width: b[o + 7] / 255,
      on: !!(f & 1), ear: EARS[ear], wave: WAVES[wave],
    }));
  }
  return tracks;
}
