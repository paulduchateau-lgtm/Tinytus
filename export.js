// Export WAV local : même graphe de synthèse que l'écoute, rendu par OfflineAudioContext.
import { createVoice, createMaster } from './audio-engine.js';

const SR = 44100;

export async function renderWav(tracks, seconds = 15) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext indisponible');
  const ctx = new OAC(2, SR * seconds, SR);
  const master = createMaster(ctx);
  master.setCount(tracks.filter(t => t.on).length, true);
  for (const t of tracks) createVoice(ctx, master.input, t, { fadeIn: 0 });
  // Fondus très courts pour éviter tout clic au début et à la fin du fichier.
  const g = master.fade.gain;
  g.setValueAtTime(0, 0);
  g.linearRampToValueAtTime(1, 0.05);
  g.setValueAtTime(1, seconds - 0.08);
  g.linearRampToValueAtTime(0, seconds - 0.005);
  const buffer = await new Promise((resolve, reject) => {
    ctx.oncomplete = e => resolve(e.renderedBuffer);
    const p = ctx.startRendering();
    if (p && p.then) p.then(resolve, reject);
  });
  return encodeWav(buffer);
}

/** Encodage PCM 16 bits, entrelacé, en-tête RIFF standard. */
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
