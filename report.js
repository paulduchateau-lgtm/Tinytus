// Printable report ("Save as PDF" from the browser's print dialog): a description of the
// composition that a person can keep or give to their doctor. Built from the same
// parameters as the sound. No library: the print stylesheet hides the app and shows #report.
import { freqOf, rateOf, buzzRateOf, F_MIN, F_MAX } from './audio-engine.js';
import { LANG, tx } from './i18n.js';

const COLORS = ['#e8702e', '#d6406e', '#8457c9', '#1f9a85']; // print-safe track colours
const pct = v => Math.round(v * 100) + ' %';
const num = (v, d = 0) => v.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Approximate −3 dB bandwidth of the noise component (same formula as the synthesis engine). */
function bandwidth(t) {
  const Q = (0.35 + 45 * Math.pow(1 - t.y, 2.2)) * Math.pow(2, (0.5 - t.width) * 4);
  return freqOf(t.x) / Q;
}

function describe(t, i) {
  const f = freqOf(t.x);
  const rows = [];
  rows.push([tx('Frequency'), `<strong>${num(Math.round(f))} Hz</strong>`]);
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
  const W = 680, H = 92, L = 20, R = 20, X = f => L + (W - L - R) * Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);
  const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const lbl = f => (f >= 1000 ? num(f / 1000) + ' k' : num(f));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(tx('Frequencies on the hearing range'))}">`;
  s += `<line x1="${L}" x2="${W - R}" y1="56" y2="56" stroke="#999" stroke-width="1"/>`;
  for (const f of ticks) s += `<line x1="${X(f)}" x2="${X(f)}" y1="52" y2="60" stroke="#999"/><text x="${X(f)}" y="76" font-size="11" text-anchor="middle" fill="#555">${lbl(f)}</text>`;
  s += `<text x="${W - R}" y="90" font-size="10" text-anchor="end" fill="#777">Hz</text>`;
  tracks.forEach((t, i) => {
    const x = X(freqOf(t.x)), half = t.y >= 0.05 ? Math.max(2, (X(freqOf(t.x) + bandwidth(t) / 2) - X(Math.max(F_MIN, freqOf(t.x) - bandwidth(t) / 2))) / 2) : 0;
    if (half) s += `<rect x="${x - half}" y="47" width="${half * 2}" height="18" rx="4" fill="${COLORS[i]}" opacity=".25"/>`;
    s += `<circle cx="${x}" cy="56" r="7" fill="${COLORS[i]}" ${t.on ? '' : 'fill-opacity=".35"'}/><text x="${x}" y="${30 - (i % 2) * 14}" font-size="11" text-anchor="middle" fill="#222">${tx('Sound {n}', { n: i + 1 })} · ${num(Math.round(freqOf(t.x)))} Hz</text>`;
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
    <h2>${tx('Frequencies on the hearing range')}</h2>
    ${chart(tracks)}
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
