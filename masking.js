// Masking test (self-administered, uncalibrated), in two steps:
//  1. Hearing threshold at the tinnitus frequency: a pulsed tone raised until just audible.
//  2. Minimum masking level (MML): a noise raised until the person's own tinnitus is no longer heard.
// Results are levels in dB relative to the device's full scale (dBFS RMS). What is meaningful is the
// difference: MML − threshold ≈ dB above threshold (like dB SL), valid when the same headphones and the
// same device volume are used for both steps. Test signals bypass the app's limiter so their level is exact.
import { renderLevel } from './export.js';

export const TONE_RANGE = [-100, -30];   // dBFS RMS
export const NOISE_RANGE = [-100, -15];  // dBFS RMS; capped for hearing safety
const dbToGain = db => Math.pow(10, db / 20);

let ctx = null, node = null, gain = null, pulseTimer = null;
function audio() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

export function stopSignal() {
  clearInterval(pulseTimer); pulseTimer = null;
  if (gain && ctx) { const g = gain, n = node, t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.02); setTimeout(() => { try { n.stop(); } catch (e) { /* stopped */ } g.disconnect(); }, 150); }
  node = gain = null;
}

/** Pulsed pure tone (0.5 s on / 0.5 s off), easier to detect near threshold. RMS level = db. */
export function playTone(freq, db) {
  stopSignal();
  const c = audio();
  const o = c.createOscillator(); o.frequency.value = freq;
  const g = c.createGain(); g.gain.value = 0;
  o.connect(g).connect(c.destination); o.start();
  node = o; gain = g;
  let on = false;
  const amp = () => Math.SQRT2 * dbToGain(level); // sine RMS = amplitude / √2
  let level = db;
  const tick = () => { on = !on; if (gain) gain.gain.setTargetAtTime(on ? amp() : 0, c.currentTime, 0.02); };
  tick(); pulseTimer = setInterval(tick, 500);
  return { setLevel(d) { level = d; if (on && gain) gain.gain.setTargetAtTime(amp(), c.currentTime, 0.03); } };
}

const noiseCache = new Map();
/** Noise normalised to RMS 1 (unit), looping seamlessly: narrow band (½ octave around freq) or broadband. */
async function noiseBuffer(type, freq) {
  const key = type + ':' + Math.round(freq);
  if (noiseCache.has(key)) return noiseCache.get(key);
  const sr = audio().sampleRate, n = sr * 4, xf = Math.round(sr * 0.05);
  const off = new OfflineAudioContext(1, n + xf, sr);
  const src = off.createBufferSource(), b = off.createBuffer(1, n + xf, sr), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = b;
  let last = src;
  if (type === 'narrow') {
    const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(freq, sr * 0.45);
    bp.Q.value = 1 / (Math.pow(2, 0.25) - Math.pow(2, -0.25)); // ½-octave bandwidth
    last = last.connect(bp);
    const bp2 = off.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = bp.frequency.value; bp2.Q.value = bp.Q.value;
    last = last.connect(bp2); // steeper skirts
  }
  last.connect(off.destination); src.start();
  const r = (await off.startRendering()).getChannelData(0);
  const out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
  const o = out.getChannelData(0);
  for (let i = 0; i < n; i++) o[i] = r[i];
  for (let i = 0; i < xf; i++) { const g = i / xf; o[i] = r[i] * g + r[n + i] * (1 - g); } // seamless loop
  let s = 0; for (let i = 0; i < n; i++) s += o[i] * o[i];
  const k = 1 / Math.sqrt(s / n); for (let i = 0; i < n; i++) o[i] *= k;
  noiseCache.set(key, out);
  return out;
}

export async function playNoise(type, freq, db) {
  stopSignal();
  const c = audio();
  const buf = await noiseBuffer(type, freq);
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  const g = c.createGain(); g.gain.value = 0;
  s.connect(g).connect(c.destination); s.start();
  node = s; gain = g;
  let level = db;
  g.gain.setTargetAtTime(dbToGain(level), c.currentTime, 0.05);
  return { setLevel(d) { level = d; if (gain) gain.gain.setTargetAtTime(dbToGain(level), c.currentTime, 0.05); } };
}

/** Level (dBFS RMS) at which the recreated sound `index` plays in the composition, through the app's full chain. */
export const recreatedLevel = (tracks, index) => renderLevel(tracks, index);

/** Test hook: the live context and the current signal gain node. */
export const _probe = () => ({ ctx, gain });
