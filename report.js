// Printable report ("Save as PDF" from the browser's print dialog): a description of the
// composition that a person can keep or give to their doctor. Built from the same
// parameters as the sound. No library: the print stylesheet hides the app and shows #report.
import { freqOf, rateOf, buzzRateOf, BELL, F_MIN, F_MAX } from './audio-engine.js';
import { LANG, tx } from './i18n.js';

const COLORS = ['#e8702e', '#d6406e', '#8457c9', '#1f9a85']; // print-safe track colours
const pct = v => Math.round(v * 100) + (LANG === 'fr' ? '\u00a0%' : '%'); // French puts a (non-breaking) space before %
const num = (v, d = 0) => v.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Approximate −3 dB bandwidth of the noise component (same formula as the synthesis engine). */
function bandwidth(t) {
  const Q = (0.35 + 45 * Math.pow(1 - t.y, 2.2)) * Math.pow(2, (0.5 - t.width) * 4);
  return freqOf(t.x) / Q;
}

/** Frequency actually played: in the buzzing shape the pitch is locked to whole cycles per click. */
export function fundamental(t) {
  const f = freqOf(t.x);
  if (t.shape !== 'buzz' || t.beat < 0.05) return f;
  const r = buzzRateOf(t.rate);
  return Math.max(1, Math.round(f / r)) * r;
}

/** Nearest note in scientific pitch notation (A4 = 440 Hz) and the deviation in cents. */
function note(f) {
  const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m), cents = Math.round((m - n) * 100);
  const name = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  return `${name} ${cents >= 0 ? '+' : '−'}${Math.abs(cents)} cents`;
}

// Same low-pass as the synthesis engine for the Round / Rich timbres: 2nd order, cutoff 7 × f.
// Web Audio expresses a low-pass Q in dB: the engine's 0.3 dB is a linear Q of 10^(0.3/20) ≈ 1.035.
const LP_Q = Math.pow(10, 0.3 / 20);
const lowpass = r => 1 / Math.sqrt((1 - r * r) ** 2 + (r / LP_Q) ** 2);

/**
 * Overtones present in the tonal part, relative to the fundamental (dB), up to 20 kHz and down to −40 dB.
 * Soft: none. Round (triangle): odd harmonics, 1/n². Rich (sawtooth): all harmonics, 1/n.
 * Bell: inharmonic partials of the engine's bell model.
 */
export function overtones(t, f) {
  const out = [];
  const push = (ratio, amp) => {
    const hz = f * ratio, db = 20 * Math.log10(amp);
    if (hz <= F_MAX && db >= -40) out.push({ ratio, hz, db });
  };
  if (t.wave === 'bell') for (const [ratio, amp] of BELL.slice(1)) push(ratio, amp);
  else if (t.wave === 'triangle' || t.wave === 'sawtooth') {
    const odd = t.wave === 'triangle';
    for (let n = 2; n <= 24 && out.length < 8; n++) {
      if (odd && n % 2 === 0) continue;
      push(n, ((odd ? 1 / (n * n) : 1 / n) * lowpass(n / 7)) / lowpass(1 / 7));
    }
  }
  return out;
}

function describe(t, i) {
  const f = fundamental(t);
  const rows = [];
  rows.push([tx('Fundamental frequency'), `<span class="r-fund">${num(Math.round(f))} Hz</span> <span class="r-muted">· ${tx('nearest note')} ${note(f)}</span>`]);
  const ov = overtones(t, f);
  let harm;
  if (t.wave === 'sine') harm = tx('None: pure sine tone, the fundamental alone.');
  else if (!ov.length) harm = tx('None within the hearing range.');
  else {
    const head = t.wave === 'bell' ? tx('Inharmonic partials (not whole multiples of the fundamental)') : t.wave === 'triangle' ? tx('Odd harmonics') : tx('All harmonics');
    harm = `${head}<table class="r-harm"><tr><th>${tx('Rank')}</th><th>${tx('Frequency')}</th><th>${tx('Level vs fundamental')}</th></tr>`
      + ov.map(o => `<tr><td>${t.wave === 'bell' ? '× ' + num(o.ratio, 1) : o.ratio}</td><td>${num(Math.round(o.hz))} Hz</td><td>${o.db >= 0 ? '' : '−'}${num(Math.abs(o.db), 1)} dB</td></tr>`).join('') + '</table>';
  }
  if (t.shape === 'buzz' && t.beat >= 0.05) harm += `<p class="r-muted r-small">${tx('The regular buzzing adds side lines every {r} Hz around the fundamental.', { r: num(Math.round(buzzRateOf(t.rate))) })}</p>`;
  rows.push([t.wave === 'bell' ? tx('Partials') : tx('Harmonics'), harm]);
  const kind = t.y < 0.15 ? tx('Pure tone (tonal)') : t.y < 0.5 ? tx('Slightly diffuse tone') : tx('Diffuse sound, close to a noise');
  let character = `${kind} — ${tx('diffusion')} ${pct(t.y)}`;
  if (t.y >= 0.05) character += `<br><span class="r-muted">${tx('Noise band about {bw} Hz wide around {f} Hz', { bw: num(Math.round(bandwidth(t))), f: num(Math.round(f)) })}</span>`;
  rows.push([tx('Character'), character]);
  rows.push([tx('Tone'), {
    sine: tx('Soft (sine wave)'), triangle: tx('Round (triangle wave)'),
    sawtooth: tx('Rich (sawtooth wave, many harmonics)'), bell: tx('Bell (inharmonic partials)'),
  }[t.wave]]);
  let beat;
  if (t.beat < 0.05) beat = tx('Steady (no pulsation)');
  else if (t.shape === 'buzz') beat = tx('Regular buzzing: {r} clicks per second, depth {d}', { r: num(Math.round(buzzRateOf(t.rate))), d: pct(t.beat) });
  else if (t.shape === 'chirp') beat = tx('Chirping: {r} chirps per second, depth {d}', { r: num(rateOf(t.rate), 1), d: pct(t.beat) });
  else beat = tx('Pulsing: {r} beats per second, depth {d}', { r: num(rateOf(t.rate), 1), d: pct(t.beat) });
  rows.push([tx('Pulse'), beat]);
  rows.push([tx('Grain'), t.grain < 0.05 ? tx('Smooth') : tx('Grainy, irregular texture — {g}', { g: pct(t.grain) })]);
  rows.push([tx('Ear'), { B: tx('Both ears'), L: tx('Left ear'), R: tx('Right ear') }[t.ear]]);
  rows.push([tx('Loudness'), tx('{l} of the app maximum (depends on the device volume)', { l: pct(t.level) })]);
  const body = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('');
  const muted = t.on ? '' : ` <span class="r-muted">(${tx('muted in the composition')})</span>`;
  return `<section class="r-track"><h3><i style="background:${COLORS[i]}"></i>${tx('Sound {n}', { n: i + 1 })}${muted}</h3><table>${body}</table></section>`;
}

/** Frequency chart on a logarithmic axis covering the hearing range. */
function chart(tracks) {
  const W = 680, L = 20, R = 20, X = f => L + (W - L - R) * Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);
  // Labels never overlap: each goes on the first line where it has 130 px of room.
  const lines = [], lineOf = [];
  [...tracks.keys()].sort((a, b) => fundamental(tracks[a]) - fundamental(tracks[b])).forEach(i => {
    const x = X(fundamental(tracks[i]));
    let k = lines.findIndex(last => x - last > 130);
    if (k < 0) { k = lines.length; lines.push(x); } else lines[k] = x;
    lineOf[i] = k;
  });
  const TOP = 14 * lines.length + 6, AXIS = TOP + 20, H = AXIS + 36;
  const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const lbl = f => (f >= 1000 ? num(f / 1000) + ' k' : num(f));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(tx('Frequencies on the hearing range'))}">`;
  s += `<line x1="${L}" x2="${W - R}" y1="${AXIS}" y2="${AXIS}" stroke="#999" stroke-width="1"/>`;
  for (const f of ticks) s += `<line x1="${X(f)}" x2="${X(f)}" y1="${AXIS - 4}" y2="${AXIS + 4}" stroke="#999"/><text x="${X(f)}" y="${AXIS + 20}" font-size="11" text-anchor="middle" fill="#555">${lbl(f)}</text>`;
  s += `<text x="${W - R}" y="${AXIS + 34}" font-size="10" text-anchor="end" fill="#777">Hz</text>`;
  tracks.forEach((t, i) => {
    for (const o of overtones(t, fundamental(t))) s += `<line x1="${X(o.hz)}" x2="${X(o.hz)}" y1="${AXIS - Math.max(3, 9 + o.db / 5)}" y2="${AXIS + Math.max(3, 9 + o.db / 5)}" stroke="${COLORS[i]}" stroke-width="2" opacity=".7"/>`;
    const x = X(fundamental(t)), half = t.y >= 0.05 ? Math.max(2, (X(freqOf(t.x) + bandwidth(t) / 2) - X(Math.max(F_MIN, freqOf(t.x) - bandwidth(t) / 2))) / 2) : 0;
    if (half) s += `<rect x="${x - half}" y="${AXIS - 9}" width="${half * 2}" height="18" rx="4" fill="${COLORS[i]}" opacity=".25"/>`;
    s += `<circle cx="${x}" cy="${AXIS}" r="7" fill="${COLORS[i]}" ${t.on ? '' : 'fill-opacity=".35"'}/><text x="${x}" y="${TOP - 14 * lineOf[i]}" font-size="11" text-anchor="middle" fill="#222">${tx('Sound {n}', { n: i + 1 })} · ${num(Math.round(fundamental(t)))} Hz</text>`;
  });
  return s + '</svg>';
}

export function buildReport(tracks, { code, url }) {
  const date = new Date().toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const n = tracks.length;
  return `
    <header class="r-head">
      <p class="r-brand">tinytus</p>
      <h1>${tx('My tinnitus — sound description')}</h1>
      <p class="r-muted">${tx('Created on {d}', { d: date })} · ${n > 1 ? tx('{n} layered sounds', { n }) : tx('1 sound')}</p>
    </header>
    <p class="r-intro">${tx('This report describes the sound I recreated to match my tinnitus. It is a subjective reproduction made by ear, not a medical measurement.')}</p>
    <div class="r-summary">
      <p class="r-summary-title">${tx('Fundamental frequencies')}</p>
      ${tracks.map((t, i) => `<p><i style="background:${COLORS[i]}"></i>${tx('Sound {n}', { n: i + 1 })} <strong>${num(Math.round(fundamental(t)))} Hz</strong> <span class="r-muted">${note(fundamental(t))}</span></p>`).join('')}
    </div>
    <h2>${tx('Frequencies on the hearing range')}</h2>
    ${chart(tracks)}
    <p class="r-muted r-small">${tx('Dots: fundamental frequencies. Small marks: harmonics or partials. Shaded band: noise component.')}</p>
    <h2>${tx('Details')}</h2>
    ${tracks.map(describe).join('')}
    <section class="r-keep">
      <h2>${tx('Listen again')}</h2>
      <p>${tx('Code')}: <code>${esc(code)}</code></p>
      <p class="r-url">${esc(url)}</p>
    </section>
    <section class="r-keep">
      <h2>${tx('Notes')}</h2>
      <div class="r-notes">${['Since when?', 'Constant or intermittent?', 'Discomfort (0 to 10)', 'Other remarks'].map(q => `<p>${tx(q)}</p>`).join('')}</div>
    </section>
    <footer class="r-foot">${tx('tinytus is not a medical tool: it does not diagnose or treat anything. The levels and frequencies depend on the device and headphones used.')}</footer>`;
}

/** Fills #report and opens the print dialog ("Save as PDF"). */
export function printReport(tracks, info) {
  const el = document.getElementById('report');
  el.innerHTML = buildReport(tracks, info);
  const title = document.title;
  document.title = `tinytus-${tx('report')}-${new Date().toISOString().slice(0, 10)}`; // default PDF file name
  const restore = () => { document.title = title; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 60000);
}
