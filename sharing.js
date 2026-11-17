// Compact, versioned serialisation of a composition in the URL fragment.
//
// Format v1 (then base64url):
//   [version=1][track count 1..4]
//   per track: x (16 bits) · y · level · beat · grain · rate · width (8 bits each)
//              · flags (bit0 on, bits1-2 ear, bits3-4 timbre, bit5 pulse shape)
//   [checksum: sum of previous bytes modulo 256]
// Example: https://username.github.io/tinnitus-studio/#s=AQHXCgpNAAAAUoAB…

import { sanitizeTrack, EARS, WAVES, SHAPES, MAX_TRACKS } from './presets.js';

const VERSION = 1;
const PREFIX = 's=';
const PER_TRACK = 9;
const q = v => Math.round(Math.min(1, Math.max(0, v)) * 255);

export function encodeShare(tracks) {
  const b = [VERSION, tracks.length];
  for (const t of tracks) {
    const x = Math.round(t.x * 65535);
    b.push(x >> 8, x & 255, q(t.y), q(t.level), q(t.beat), q(t.grain), q(t.rate), q(t.width),
      (t.on ? 1 : 0) | (Math.max(0, EARS.indexOf(t.ear)) << 1) | (Math.max(0, WAVES.indexOf(t.wave)) << 3) | (Math.max(0, SHAPES.indexOf(t.shape)) << 5));
  }
  b.push(b.reduce((s, v) => s + v, 0) & 255);
  const b64 = btoa(String.fromCharCode(...b));
  return PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns the tracks, or throws if the link is invalid. */
export function decodeShare(hash) {
  const raw = decodeURIComponent(String(hash).replace(/^#/, ''));
  if (!raw.startsWith(PREFIX)) throw new Error('format');
  const b64 = raw.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+$/.test(b64)) throw new Error('characters');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const b = Array.from(bin, c => c.charCodeAt(0));
  if (b[0] !== VERSION) throw new Error('version');
  const n = b[1];
  if (!(n >= 1 && n <= MAX_TRACKS) || b.length !== 3 + n * PER_TRACK) throw new Error('length');
  const sum = b.slice(0, -1).reduce((s, v) => s + v, 0) & 255;
  if (sum !== b[b.length - 1]) throw new Error('checksum');
  const tracks = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * PER_TRACK, f = b[o + 8];
    const ear = (f >> 1) & 3, wave = (f >> 3) & 3;
    if (ear >= EARS.length || wave >= WAVES.length || f >> 6) throw new Error('values');
    tracks.push(sanitizeTrack({
      x: ((b[o] << 8) | b[o + 1]) / 65535,
      y: b[o + 2] / 255, level: b[o + 3] / 255, beat: b[o + 4] / 255,
      grain: b[o + 5] / 255, rate: b[o + 6] / 255, width: b[o + 7] / 255,
      on: !!(f & 1), ear: EARS[ear], wave: WAVES[wave], shape: SHAPES[(f >> 5) & 1],
    }));
  }
  return tracks;
}
