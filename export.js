// Local WAV export: same synthesis graph as live playback, rendered with OfflineAudioContext.
import { createVoice, createMaster } from './audio-engine.js';

const SR = 44100;

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
  const warm = 2, ctx = offline(period + warm);
  build(ctx, tracks, { period }).fade.gain.setValueAtTime(1, 0);
  const buf = await render(ctx);
  const n = SR * period, s0 = SR * warm;
  const src = [buf.getChannelData(0), buf.getChannelData(1)];
  let best = 0, low = Infinity;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(src[0][s0 + i]) + Math.abs(src[1][s0 + i]);
    if (v < low) { low = v; best = i; }
  }
  const ch = src.map(c => {
    const out = new Float32Array(n);
    out.set(c.subarray(s0 + best, s0 + n));
    out.set(c.subarray(s0, s0 + best), n - best);
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
