// Long listening: a seamless 20-second loop played by an <audio> element for 30 minutes.
// An audio element (unlike Web Audio) keeps playing with the screen locked and shows
// lock-screen controls. The file stays small (about 3.5 MB) whatever the duration.
import { renderLoop, encodeWav } from './export.js';

const audio = new Audio();
audio.loop = true;
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

const silence = n => URL.createObjectURL(encodeWav({ numberOfChannels: 1, length: n, sampleRate: 44100, getChannelData: () => new Float32Array(n) }));
const SILENCE = silence(4410);
let url = null, endAt = 0, busy = false, fadeTimer;

export const longListen = {
  active: false,
  onChange: () => {},
  get ready() { return this.active && endAt > 0; },
  remaining: () => Math.max(0, endAt - Date.now()),

  /** Call directly from a tap: the silent play() unlocks the element on iOS before rendering. */
  async start(tracks, minutes = 30) {
    this.stop();
    this.active = true; busy = true; endAt = 0;
    this.onChange();
    audio.src = SILENCE;
    const unlock = audio.play().catch(() => {});
    try {
      const blob = await renderLoop(tracks);
      await unlock;
      if (!this.active) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      audio.src = url;
      fade(0, 1);
      await audio.play();
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

// Volume fades work on desktop and Android; iOS ignores volume (the loop starts on its quietest point anyway).
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
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'My tinnitus', artist: 'Tinnitus Studio', artwork: [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }] });
    navigator.mediaSession.playbackState = 'playing';
    for (const a of ['pause', 'stop']) navigator.mediaSession.setActionHandler(a, () => ctrl.stop());
  } catch (e) { /* optional API */ }
}

// Ends after the chosen duration; timeupdate keeps firing while the screen is locked.
audio.addEventListener('timeupdate', () => { if (longListen.ready && Date.now() >= endAt) longListen.stop(); });
// Paused from outside (headphones unplugged, lock screen, phone call): reflect it in the UI.
audio.addEventListener('pause', () => { if (longListen.ready && !busy) { longListen.active = false; endAt = 0; longListen.onChange(); } });
