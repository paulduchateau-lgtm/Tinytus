// Long listening (30 minutes) that keeps playing with the screen locked.
//
// The browser renders a seamless 20-second loop (about 3.5 MB). The service worker (sw.js)
// then serves it to an <audio> element as ONE continuous 30-minute WAV generated on the fly,
// with fades baked in: no loop point, so no gap or click, even on iPhone where looping an
// audio element leaves a tiny gap. If service workers are unavailable, the loop is played
// with `audio.loop` as a fallback.
import { renderLoop, encodeWav } from './export.js';
import { tx } from './i18n.js';

const CACHE = 'tinnitus-long';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

const SILENCE = URL.createObjectURL(encodeWav({ numberOfChannels: 1, length: 4410, sampleRate: 44100, getChannelData: () => new Float32Array(4410) }));
let blobUrl = null, endAt = 0, busy = false, streaming = false, fadeTimer;

/** Stores the loop where the service worker can read it; returns the stream URL, or null. */
async function prepareStream(blob, minutes) {
  if (!navigator.serviceWorker || !window.caches) return null;
  try {
    // On a first visit the worker may still be starting: wait for it (up to 4 s) rather than
    // falling back to audio.loop, which leaves an audible gap on iPhone at every repeat.
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        navigator.serviceWorker.ready.then(() => new Promise(r => (navigator.serviceWorker.controller ? r() : navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })))),
        new Promise(r => setTimeout(r, 4000)),
      ]);
    }
    if (!navigator.serviceWorker.controller) return null;
    const id = Date.now().toString(36);
    const cache = await caches.open(CACHE);
    for (const k of await cache.keys()) await cache.delete(k); // keep only the latest loop
    const pcm = await blob.slice(44).arrayBuffer();
    await cache.put(new URL(`long/${id}.pcm`, location.href).href, new Response(pcm, { headers: { 'x-sr': '44100', 'x-ch': '2' } }));
    return `long/${id}.wav?m=${minutes}`;
  } catch (e) { return null; }
}

export const longListen = {
  active: false,
  onChange: () => {},
  get ready() { return this.active && endAt > 0; },
  remaining() {
    if (streaming && Number.isFinite(audio.duration)) return Math.max(0, (audio.duration - audio.currentTime) * 1000);
    return Math.max(0, endAt - Date.now());
  },

  /** Call directly from a tap: the silent play() unlocks the element on iOS while the loop renders. */
  async start(tracks, minutes = 30) {
    this.stop();
    this.active = true; busy = true; endAt = 0;
    this.onChange();
    audio.loop = false;
    audio.src = SILENCE;
    const unlock = audio.play().catch(() => {});
    try {
      const blob = await renderLoop(tracks);
      const stream = await prepareStream(blob, minutes);
      await unlock;
      if (!this.active) return;
      streaming = !!stream;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = stream ? null : URL.createObjectURL(blob);
      audio.loop = !stream;
      audio.src = stream || blobUrl;
      audio.volume = 1;
      if (!stream) fade(0, 1);
      try { await audio.play(); } catch (e) {
        if (!stream) throw e;
        // The stream could not be played: fall back to the looped file.
        streaming = false;
        blobUrl = URL.createObjectURL(blob);
        audio.loop = true; audio.src = blobUrl; fade(0, 1);
        await audio.play();
      }
      endAt = Date.now() + minutes * 60000;
      session(this);
    } catch (e) {
      this.stop();
      throw e;
    } finally { busy = false; this.onChange(); }
  },

  stop() {
    if (!this.active) return;
    this.active = false; endAt = 0;
    fade(audio.volume, 0, () => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    this.onChange();
  },
};

// Volume fades work on desktop and Android; iOS ignores volume (the stream has its own fades).
function fade(from, to, done) {
  clearInterval(fadeTimer);
  let k = 0;
  audio.volume = from;
  fadeTimer = setInterval(() => {
    k++;
    audio.volume = Math.min(1, Math.max(0, from + (to - from) * (k / 10)));
    if (k >= 10) { clearInterval(fadeTimer); done && done(); }
  }, 30);
}

function session(ctrl) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: tx('My tinnitus'), artist: 'Tinnitus Studio', artwork: [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }] });
    navigator.mediaSession.playbackState = 'playing';
    for (const a of ['pause', 'stop']) navigator.mediaSession.setActionHandler(a, () => ctrl.stop());
  } catch (e) { /* optional API */ }
}

// Fallback mode ends on a timer; stream mode ends with the file itself.
audio.addEventListener('timeupdate', () => { if (longListen.ready && !streaming && Date.now() >= endAt) longListen.stop(); });
audio.addEventListener('ended', () => { if (longListen.ready) { longListen.active = false; endAt = 0; longListen.onChange(); } });
// Paused from outside (headphones unplugged, lock screen, phone call): reflect it in the UI.
audio.addEventListener('pause', () => { if (longListen.ready && !busy) { longListen.active = false; endAt = 0; longListen.onChange(); } });
