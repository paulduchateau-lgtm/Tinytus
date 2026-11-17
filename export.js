// Local WAV export: same synthesis graph as live playback, rendered with OfflineAudioContext.
import { createVoice, createMaster } from './audio-engine.js';

export const SR = 48000; // 48 kHz keeps the top of the hearing range (up to 20 kHz) at full level

const offline = (seconds) => {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext unavailable');
  return new OAC(2, Math.round(SR * seconds), SR);
};
const render = ctx => new Promise((resolve, reject) => {
  ctx.oncomplete = e => resolve(e.renderedBuffer);
  const p = ctx.startRendering();
  if (p && p.then) p.then(resolve, reject);
});
function build(ctx, tracks, opts) {
  const master = createMaster(ctx);
  master.setCount(tracks.filter(t => t.on).length, true);
  for (const t of tracks) createVoice(ctx, master.input, t, { fadeIn: 0, ...opts });
  return master;
}

/**
 * Output level (dBFS RMS) of sound `index` as it plays inside the composition (same mix scaling and
 * limiter as listening), measured on the ear it plays in. Used by the masking test.
 */
export async function renderLevel(tracks, index) {
  const ctx = offline(2);
  const master = build(ctx, tracks.map((t, i) => (i === index ? t : { ...t, on: false })));
  master.setCount(tracks.filter(t => t.on).length, true);
  master.fade.gain.setValueAtTime(1, 0);
  const buf = await render(ctx);
  let best = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let s = 0;
    for (let i = SR / 2; i < d.length; i++) s += d[i] * d[i];
    best = Math.max(best, s / (d.length - SR / 2));
  }
  return 10 * Math.log10(best || 1e-12);
}

export async function renderWav(tracks, seconds = 15) {
  const ctx = offline(seconds);
  const g = build(ctx, tracks).fade.gain;
  // Very short fades to avoid clicks at the start and end of the file.
  g.setValueAtTime(0, 0);
  g.linearRampToValueAtTime(1, 0.05);
  g.setValueAtTime(1, seconds - 0.08);
  g.linearRampToValueAtTime(0, seconds - 0.005);
  return encodeWav(await render(ctx));
}

/**
 * Seamless loop for long listening. Every component repeats exactly every `period` seconds
 * (noise buffers last 4 s, pitch and pulse are rounded to whole cycles), so after a short
 * warm-up the signal is periodic. The loop is rotated to start on its quietest sample,
 * which avoids a click when playback begins.
 */
export const LOOP_SECONDS = 20;
export async function renderLoop(tracks, period = LOOP_SECONDS) {
  const warm = 2, xf = Math.round(SR * 0.08), n = SR * period, s0 = SR * warm;
  const ctx = offline(period + warm + 0.1);
  build(ctx, tracks, { period }).fade.gain.setValueAtTime(1, 0);
  const buf = await render(ctx);
  // Crossfade the first 80 ms with what follows the period: whatever tiny drift a browser's
  // oscillators accumulate over 20 s, the end of the loop now flows exactly into its start.
  const looped = [0, 1].map(c => {
    const a = buf.getChannelData(c), out = a.slice(s0, s0 + n);
    for (let i = 0; i < xf; i++) {
      const g = i / xf;
      out[i] = a[s0 + i] * g + a[s0 + n + i] * (1 - g);
    }
    return out;
  });
  // Rotate the (circular) loop so it starts on its quietest sample.
  let best = 0, low = Infinity;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(looped[0][i]) + Math.abs(looped[1][i]);
    if (v < low) { low = v; best = i; }
  }
  const ch = looped.map(c => {
    const out = new Float32Array(n);
    out.set(c.subarray(best));
    out.set(c.subarray(0, best), n - best);
    return out;
  });
  return encodeWav({ numberOfChannels: 2, length: n, sampleRate: SR, getChannelData: c => ch[c] });
}

/** 16-bit PCM encoding, interleaved, standard RIFF header. */
export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
  const bytes = len * ch * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++, o += 2) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
    }
  }
  return new Blob([v], { type: 'audio/wav' });
}
