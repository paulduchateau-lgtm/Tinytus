// Moteur de synthèse sonore.
// Utilisé à l'identique par l'écoute en direct (AudioContext) et par l'export WAV
// (OfflineAudioContext) : une seule fonction construit le graphe d'une piste.

export const F_MIN = 80;
export const F_MAX = 14000;
const MAX_GAIN = 0.45;  // gain d'une piste à intensité maximale (avant limiteur)
const TAU = 0.03;       // lissage des réglages en temps réel (secondes)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Position horizontale (0..1) → fréquence en Hz (échelle logarithmique). */
export const freqOf = x => F_MIN * Math.pow(F_MAX / F_MIN, clamp(x));
/** Réglage de vitesse (0..1) → battements par seconde (0,5 à 8 Hz). */
export const rateOf = r => 0.5 * Math.pow(16, clamp(r));

// Générateur pseudo-aléatoire déterministe : même bruit à l'écoute et à l'export.
function prng(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const cache = new WeakMap();
/** Tampons de bruit blanc et d'enveloppe « grain », créés une fois par contexte. */
function buffers(ctx) {
  let b = cache.get(ctx);
  if (b) return b;
  const sr = ctx.sampleRate, len = Math.floor(sr * 4), rand = prng(20240611);
  const noise = ctx.createBuffer(1, len, sr);
  const n = noise.getChannelData(0);
  for (let i = 0; i < len; i++) n[i] = rand() * 2 - 1;

  // Enveloppe granuleuse : valeurs aléatoires tenues 4 à 34 ms, souvent nulles,
  // reliées par des micro-rampes pour rester « électrique » sans claquer.
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
  b = { noise, grain, m1: m1 / len, m2: m2 / len };
  cache.set(ctx, b);
  return b;
}

/** Paramètres internes d'une piste. Fonction pure : facile à tester. */
export function voiceParams(t, sr, B) {
  const f = Math.min(freqOf(t.x), sr * 0.45);
  const y = clamp(t.y);
  // Pureté → largeur de la bande de bruit (Q élevé = étroit = presque tonal).
  const Q = (0.35 + 45 * Math.pow(1 - y, 2.2)) * Math.pow(2, (0.5 - clamp(t.width)) * 4);
  // Compensation d'énergie du bruit filtré pour que le volume reste stable.
  const bw = Math.min(sr / 2, 1.5708 * f / Q);
  const noiseComp = clamp(1.225 / Math.sqrt(bw / (sr / 2)), 0.5, 40);
  const g = clamp(t.grain), d = clamp(t.beat), lvl = clamp(t.level);
  const grainComp = 1 / Math.sqrt((1 - g) ** 2 + 2 * g * (1 - g) * B.m1 + g * g * B.m2);
  const beatComp = 1 / Math.sqrt((1 - d / 2) ** 2 + d * d / 8);
  return {
    f, Q,
    wave: t.wave,
    lp: t.wave === 'sine' ? sr * 0.45 : Math.min(f * 7, sr * 0.45),
    tone: Math.pow(1 - y, 1.3),
    noise: Math.pow(y, 0.8) * noiseComp * 0.8,
    grainBase: 1 - g, grainDepth: g,
    beatBase: 1 - d / 2, beatDepth: d / 2,
    rate: rateOf(t.rate),
    gain: t.on ? MAX_GAIN * lvl * lvl * Math.min(2.5, grainComp * beatComp) : 0,
    pan: t.ear === 'L' ? -1 : t.ear === 'R' ? 1 : 0,
  };
}

const hold = (p, t) => (p.cancelAndHoldAtTime ? p.cancelAndHoldAtTime(t) : p.cancelScheduledValues(t));

/**
 * Construit le graphe d'une piste :
 * oscillateur + bruit filtré → enveloppe « grain » → battement → intensité → oreille → sortie
 */
export function createVoice(ctx, out, track, { fadeIn = 0.08 } = {}) {
  const B = buffers(ctx), sr = ctx.sampleRate;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
  const tone = ctx.createGain();
  const noise = ctx.createBufferSource(); noise.buffer = B.noise; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  const noiseG = ctx.createGain();
  const grainVca = ctx.createGain();
  const grainSrc = ctx.createBufferSource(); grainSrc.buffer = B.grain; grainSrc.loop = true;
  const grainDepth = ctx.createGain();
  const beatVca = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  const level = ctx.createGain(); level.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

  osc.connect(lp).connect(tone).connect(grainVca);
  noise.connect(bp).connect(noiseG).connect(grainVca);
  grainSrc.connect(grainDepth).connect(grainVca.gain);
  grainVca.connect(beatVca);
  lfo.connect(lfoDepth).connect(beatVca.gain);
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
    if (osc.type !== p.wave) {
      if (now || last.tone === undefined) osc.type = p.wave;
      else { // changement de timbre : on coupe brièvement pour éviter un clic
        tone.gain.setTargetAtTime(0, t, 0.008);
        setTimeout(() => { osc.type = p.wave; tone.gain.setTargetAtTime(last.tone, ctx.currentTime, 0.015); }, 50);
      }
    }
    set('f', osc.frequency, p.f, t, now);
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
    if (pan) set('pan', pan.pan, p.pan, t, now);
    if (last.gain !== undefined && last.gain !== p.gain) level.gain.setTargetAtTime(p.gain, t, 0.04);
    last.gain = p.gain;
  }

  update(track, true);
  const t0 = ctx.currentTime, sources = [osc, noise, grainSrc, lfo];
  if (fadeIn > 0) {
    level.gain.setValueAtTime(0, t0);
    level.gain.linearRampToValueAtTime(last.gain, t0 + fadeIn);
  } else level.gain.setValueAtTime(last.gain, t0);
  // Décalages différents par piste : deux pistes ne partagent jamais le même bruit.
  const off = (track.id * 0.7371) % 3;
  osc.start(t0); lfo.start(t0);
  noise.start(t0, off); grainSrc.start(t0, (off * 1.37) % 3);

  return {
    update: tr => update(tr),
    stop(fade = 0.08) {
      const t = ctx.currentTime;
      hold(level.gain, t);
      level.gain.setTargetAtTime(0, t, fade / 4);
      for (const s of sources) s.stop(t + fade + 0.05);
      osc.onended = () => { for (const n of [...sources, lp, tone, bp, noiseG, grainVca, grainDepth, beatVca, lfoDepth, level, pan]) n && n.disconnect(); };
    },
  };
}

/** Bus de sortie : normalisation selon le nombre de pistes + limiteur anti-saturation. */
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

/** Lecture en direct. L'AudioContext n'est créé qu'au premier geste de l'utilisateur. */
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
        // Interruption système (appel, autre application, verrouillage…)
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

  /** Doit être appelé directement dans un gestionnaire de clic / toucher (exigence iOS). */
  start(tracks) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* API facultative */ }
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
