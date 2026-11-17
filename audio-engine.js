// Sound synthesis engine.
// Used identically by live playback (AudioContext) and WAV export
// (OfflineAudioContext): a single function builds a track's graph.

export const F_MIN = 80;
export const F_MAX = 14000;
const MAX_GAIN = 0.45;  // gain of one track at full level (before the limiter)
const TAU = 0.03;       // smoothing of real-time changes (seconds)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Horizontal position (0..1) → frequency in Hz (logarithmic scale). */
export const freqOf = x => F_MIN * Math.pow(F_MAX / F_MIN, clamp(x));
/** Frequency in Hz → horizontal position (0..1). */
export const xOf = f => clamp(Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN));
/** Speed setting (0..1) → beats per second (0.5 to 8 Hz). */
export const rateOf = r => 0.5 * Math.pow(16, clamp(r));

// Deterministic pseudo-random generator: same noise in playback and export.
function prng(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const BUZZ_CYCLES = 100, FROZEN_LEN = 2048;
/** Pulse speed (0..1) in the "buzzing" shape → clicks per second (40 to 320). */
export const buzzRateOf = r => 40 * Math.pow(2, 3 * clamp(r));

const cache = new WeakMap();
/** White-noise and “grain” envelope buffers, created once per context. */
function buffers(ctx) {
  let b = cache.get(ctx);
  if (b) return b;
  const sr = ctx.sampleRate, len = Math.floor(sr * 4), rand = prng(20240611);
  const noise = ctx.createBuffer(1, len, sr);
  const n = noise.getChannelData(0);
  for (let i = 0; i < len; i++) n[i] = rand() * 2 - 1;

  // Grainy envelope: random values held 4 to 34 ms, often zero,
  // joined by micro-ramps so it sounds “electric” without harsh clicks.
  const grain = ctx.createBuffer(1, len, sr);
  const g = grain.getChannelData(0);
  const ramp = Math.floor(sr * 0.0015);
  let i = 0, prev = 0, m1 = 0, m2 = 0;
  while (i < len) {
    const seg = Math.floor(sr * (0.004 + rand() * 0.03));
    const v = rand() < 0.45 ? 0 : Math.pow(rand(), 0.6);
    for (let k = 0; k < seg && i < len; k++, i++) {
      const s = k < ramp ? prev + (v - prev) * (k / ramp) : v;
      g[i] = s; m1 += s; m2 += s * s;
    }
    prev = v;
  }
  // Chirp envelope (crickets): one cycle lasts 1 s at playbackRate 1, so playbackRate = chirps per second.
  // The first 32% holds 4 smooth pulses (sin²), the rest is silent; it starts and ends at 0 to loop cleanly.
  const clen = sr, chirp = ctx.createBuffer(1, clen, sr), c = chirp.getChannelData(0);
  const on = Math.floor(clen * 0.32), PULSES = 4;
  let c1 = 0, c2 = 0;
  for (let j = 0; j < clen; j++) {
    const v = j < on ? Math.sin(Math.PI * ((j / on) * PULSES % 1)) ** 2 : 0;
    c[j] = v; c1 += v; c2 += v * v;
  }
  // Buzz envelope (cicadas): 100 identical sharp clicks (sin⁴) per second at playbackRate 1,
  // so playbackRate = clicks per second / 100. Perfectly regular, unlike the random grain.
  const buzz = ctx.createBuffer(1, clen, sr), z = buzz.getChannelData(0);
  let z1 = 0, z2 = 0;
  for (let j = 0; j < clen; j++) {
    const v = Math.sin(Math.PI * ((j / clen) * BUZZ_CYCLES % 1)) ** 4;
    z[j] = v; z1 += v; z2 += v * v;
  }
  // "Frozen" noise for the buzz shape: a short snippet replayed once per click, so every click is identical.
  const frozen = ctx.createBuffer(1, FROZEN_LEN, sr), fz = frozen.getChannelData(0);
  for (let j = 0; j < FROZEN_LEN; j++) fz[j] = rand() * 2 - 1;
  b = { noise, grain, m1: m1 / len, m2: m2 / len, chirp, c1: c1 / clen, c2: c2 / clen, buzz, z1: z1 / clen, z2: z2 / clen, frozen };
  cache.set(ctx, b);
  return b;
}

// Bell timbre: inharmonic partials (ratio to the pitch, relative amplitude), played continuously.
export const BELL = [[1, 1], [2.0, 0.5], [2.4, 0.42], [3.0, 0.28], [4.2, 0.2], [5.4, 0.12]];
const BELL_NORM = 1 / Math.sqrt(BELL.reduce((s, [, a]) => s + a * a, 0)); // same loudness as one sine

/** Internal parameters of a track. Pure function: easy to test. */
export function voiceParams(t, sr, B) {
  const f = Math.min(freqOf(t.x), sr * 0.45);
  const y = clamp(t.y);
  // Purity → noise bandwidth (high Q = narrow = almost tonal).
  const Q = (0.35 + 45 * Math.pow(1 - y, 2.2)) * Math.pow(2, (0.5 - clamp(t.width)) * 4);
  // Energy compensation for filtered noise so loudness stays stable.
  const bw = Math.min(sr / 2, 1.5708 * f / Q);
  const noiseComp = clamp(1.225 / Math.sqrt(bw / (sr / 2)), 0.5, 40);
  const g = clamp(t.grain), d = clamp(t.beat), lvl = clamp(t.level);
  const grainComp = 1 / Math.sqrt((1 - g) ** 2 + 2 * g * (1 - g) * B.m1 + g * g * B.m2);
  const chirp = t.shape === 'chirp', buzz = t.shape === 'buzz';
  // Envelope = base + depth · modulator. Smooth: sine in [-1, 1]. Chirp / buzz: pulses in [0, 1].
  const pulseComp = (a, b) => 1 / Math.sqrt((1 - d) ** 2 + 2 * d * (1 - d) * a + d * d * b);
  const beatComp = chirp ? pulseComp(B.c1, B.c2) : buzz ? pulseComp(B.z1, B.z2) : 1 / Math.sqrt((1 - d / 2) ** 2 + d * d / 8);
  const bell = t.wave === 'bell';
  return {
    f, Q,
    type: bell ? 'sine' : t.wave,
    bell,
    lp: t.wave === 'sine' || bell ? sr * 0.45 : Math.min(f * 7, sr * 0.45),
    tone: Math.pow(1 - y, 1.3),
    noise: Math.pow(y, 0.8) * noiseComp * 0.8,
    grainBase: 1 - g, grainDepth: g,
    beatBase: chirp || buzz ? 1 - d : 1 - d / 2,
    beatDepth: chirp || buzz ? 0 : d / 2,
    chirpDepth: chirp ? d : 0,
    buzzDepth: buzz ? d : 0,
    frozen: buzz,
    rate: buzz ? buzzRateOf(t.rate) : rateOf(t.rate),
    gain: t.on ? MAX_GAIN * lvl * lvl * Math.min(2.5, grainComp * beatComp) : 0,
    pan: t.ear === 'L' ? -1 : t.ear === 'R' ? 1 : 0,
  };
}

const hold = (p, t) => (p.cancelAndHoldAtTime ? p.cancelAndHoldAtTime(t) : p.cancelScheduledValues(t));

/**
 * Builds a track's graph:
 * oscillator + filtered noise → “grain” envelope → beat → level → ear → output
 */
// With `period` (seconds), pitch and pulse speed are rounded to whole cycles per period
// (inaudible: under 0.025 Hz), so the rendered sound repeats exactly and can loop seamlessly.
export function createVoice(ctx, out, track, { fadeIn = 0.08, period = 0 } = {}) {
  const B = buffers(ctx), sr = ctx.sampleRate;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
  const tone = ctx.createGain();
  const noise = ctx.createBufferSource(); noise.buffer = B.noise; noise.loop = true;
  const noiseIn = ctx.createGain();
  const frozenSrc = ctx.createBufferSource(); frozenSrc.buffer = B.frozen; frozenSrc.loop = true;
  const frozenIn = ctx.createGain(); frozenIn.gain.value = 0;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  const noiseG = ctx.createGain();
  const grainVca = ctx.createGain();
  const grainSrc = ctx.createBufferSource(); grainSrc.buffer = B.grain; grainSrc.loop = true;
  const grainDepth = ctx.createGain();
  const beatVca = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const chirpSrc = ctx.createBufferSource(); chirpSrc.buffer = B.chirp; chirpSrc.loop = true;
  const chirpDepth = ctx.createGain(); chirpDepth.gain.value = 0;
  const buzzSrc = ctx.createBufferSource(); buzzSrc.buffer = B.buzz; buzzSrc.loop = true;
  const buzzDepth = ctx.createGain(); buzzDepth.gain.value = 0;
  const oscG = ctx.createGain();
  // Bell partials (silent unless the Bell timbre is selected); the first partial is `osc` itself.
  const partials = BELL.slice(1).map(() => { const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(lp); return { o, g }; });
  const level = ctx.createGain(); level.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

  osc.connect(oscG).connect(lp).connect(tone).connect(grainVca);
  noise.connect(noiseIn).connect(bp).connect(noiseG).connect(grainVca);
  frozenSrc.connect(frozenIn).connect(bp);
  grainSrc.connect(grainDepth).connect(grainVca.gain);
  grainVca.connect(beatVca);
  lfo.connect(lfoDepth).connect(beatVca.gain);
  chirpSrc.connect(chirpDepth).connect(beatVca.gain);
  buzzSrc.connect(buzzDepth).connect(beatVca.gain);
  beatVca.connect(level);
  if (pan) level.connect(pan).connect(out); else level.connect(out);

  const last = {};
  const set = (key, param, v, t, now) => {
    if (last[key] === v) return;
    if (now || last[key] === undefined) param.setValueAtTime(v, t);
    else param.setTargetAtTime(v, t, TAU);
    last[key] = v;
  };

  function update(tr, now = false) {
    const p = voiceParams(tr, sr, B), t = ctx.currentTime;
    const q = v => (period ? Math.max(1, Math.round(v * period)) / period : v);
    p.rate = q(p.rate);
    // Buzz: pitch locked to a whole number of cycles per click, so every click is identical.
    p.f = p.frozen ? Math.max(1, Math.round(p.f / p.rate)) * p.rate : q(p.f);
    if (osc.type !== p.type) {
      if (now || last.tone === undefined) osc.type = p.type;
      else { // timbre change: duck briefly to avoid a click
        tone.gain.setTargetAtTime(0, t, 0.008);
        setTimeout(() => { osc.type = p.type; tone.gain.setTargetAtTime(last.tone, ctx.currentTime, 0.015); }, 50);
      }
    }
    set('f', osc.frequency, p.f, t, now);
    set('og', oscG.gain, p.bell ? BELL_NORM : 1, t, now);
    partials.forEach(({ o, g }, k) => {
      const [ratio, amp] = BELL[k + 1], pf = q(p.f * ratio), audible = p.bell && pf < sr * 0.45;
      set('pf' + k, o.frequency, Math.min(pf, sr * 0.45), t, now);
      set('pg' + k, g.gain, audible ? amp * BELL_NORM : 0, t, now);
    });
    set('bf', bp.frequency, p.f, t, now);
    set('q', bp.Q, p.Q, t, now);
    set('lp', lp.frequency, p.lp, t, now);
    set('tone', tone.gain, p.tone, t, now);
    set('noise', noiseG.gain, p.noise, t, now);
    set('gb', grainVca.gain, p.grainBase, t, now);
    set('gd', grainDepth.gain, p.grainDepth, t, now);
    set('bb', beatVca.gain, p.beatBase, t, now);
    set('bd', lfoDepth.gain, p.beatDepth, t, now);
    set('r', lfo.frequency, p.rate, t, now);
    set('cd', chirpDepth.gain, p.chirpDepth, t, now);
    set('cr', chirpSrc.playbackRate, p.rate, t, now);
    set('zd', buzzDepth.gain, p.buzzDepth, t, now);
    set('zr', buzzSrc.playbackRate, p.rate / BUZZ_CYCLES, t, now);
    set('ni', noiseIn.gain, p.frozen ? 0 : 1, t, now);
    set('fi', frozenIn.gain, p.frozen ? 1 : 0, t, now);
    set('fr', frozenSrc.playbackRate, (p.rate * FROZEN_LEN) / sr, t, now); // one snippet per click
    if (pan) set('pan', pan.pan, p.pan, t, now);
    if (last.gain !== undefined && last.gain !== p.gain) level.gain.setTargetAtTime(p.gain, t, 0.04);
    last.gain = p.gain;
  }

  update(track, true);
  const t0 = ctx.currentTime, sources = [osc, noise, frozenSrc, grainSrc, lfo, chirpSrc, buzzSrc, ...partials.map(x => x.o)];
  if (fadeIn > 0) {
    level.gain.setValueAtTime(0, t0);
    level.gain.linearRampToValueAtTime(last.gain, t0 + fadeIn);
  } else level.gain.setValueAtTime(last.gain, t0);
  // Different offsets per track: two tracks never share the same noise.
  const off = (track.id * 0.7371) % 3;
  osc.start(t0); lfo.start(t0); chirpSrc.start(t0); buzzSrc.start(t0); frozenSrc.start(t0);
  for (const { o } of partials) o.start(t0);
  noise.start(t0, off); grainSrc.start(t0, (off * 1.37) % 3);

  return {
    update: tr => update(tr),
    stop(fade = 0.08) {
      const t = ctx.currentTime;
      hold(level.gain, t);
      level.gain.setTargetAtTime(0, t, fade / 4);
      for (const s of sources) s.stop(t + fade + 0.05);
      osc.onended = () => { for (const n of [...sources, ...partials.map(x => x.g), oscG, lp, tone, bp, noiseG, grainVca, grainDepth, beatVca, lfoDepth, chirpDepth, buzzDepth, noiseIn, frozenIn, level, pan]) n && n.disconnect(); };
    },
  };
}

/** Output bus: normalisation by track count + anti-clipping limiter. */
export function createMaster(ctx) {
  const input = ctx.createGain();
  const fade = ctx.createGain(); fade.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14; limiter.knee.value = 6; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.2;
  const out = ctx.createGain(); out.gain.value = 0.8;
  input.connect(fade).connect(limiter).connect(out).connect(ctx.destination);
  return {
    input, fade,
    setCount(n, now = false) {
      const v = 1 / Math.sqrt(Math.max(1, n));
      if (now) input.gain.setValueAtTime(v, ctx.currentTime);
      else input.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
  };
}

/** Live playback. The AudioContext is only created on the user's first gesture. */
export class LiveEngine {
  constructor() {
    this.ctx = null; this.master = null; this.voices = new Map(); this.playing = false;
    this.onChange = () => {}; this.onInterrupt = () => {};
  }
  get supported() { return !!(window.AudioContext || window.webkitAudioContext); }

  _ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC();
    this.master = createMaster(ctx);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') {
        this._ran = true;
        if (!this.playing && !this.voices.size) ctx.suspend().catch(() => {});
      } else if (this.playing && this._ran && ctx.state !== 'closed') {
        // System interruption (call, other app, screen lock…)
        this.playing = false; this._ran = false;
        this._teardown();
        this.onChange(false); this.onInterrupt();
      }
    };
    return ctx;
  }

  _teardown() {
    for (const v of this.voices.values()) v.stop(0.01);
    this.voices.clear();
    const g = this.master.fade.gain, t = this.ctx.currentTime;
    hold(g, t); g.setValueAtTime(0, t);
  }

  /** Must be called directly inside a click / touch handler (iOS requirement). */
  start(tracks) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional API */ }
    const ctx = this._ensure();
    const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    clearTimeout(this._idle);
    this.playing = true;
    this.sync(tracks);
    const g = this.master.fade.gain, t = ctx.currentTime;
    hold(g, t); g.setTargetAtTime(1, t, 0.04);
    this.onChange(true);
    return Promise.resolve(resumed).then(() => ctx.state, () => ctx.state);
  }

  sync(tracks) {
    if (!this.playing) return;
    const ids = new Set();
    let n = 0;
    for (const t of tracks) {
      ids.add(t.id);
      if (t.on) n++;
      const v = this.voices.get(t.id);
      if (v) v.update(t);
      else this.voices.set(t.id, createVoice(this.ctx, this.master.input, t));
    }
    for (const [id, v] of this.voices) if (!ids.has(id)) { v.stop(); this.voices.delete(id); }
    this.master.setCount(n);
  }

  stop(fast = false) {
    if (!this.playing) return;
    this.playing = false;
    const ctx = this.ctx, g = this.master.fade.gain, t = ctx.currentTime;
    hold(g, t); g.setTargetAtTime(0, t, fast ? 0.01 : 0.035);
    clearTimeout(this._idle);
    this._idle = setTimeout(() => {
      if (this.playing) return;
      this._teardown();
      ctx.suspend().catch(() => {});
    }, fast ? 60 : 220);
    this.onChange(false);
  }
}
