// Tinnitus Studio user interface.
import { LiveEngine, freqOf, xOf, F_MIN, F_MAX, rateOf } from './audio-engine.js';
import { PRESETS, makeTrack, sanitizeTracks, xFromV1, MAX_TRACKS } from './presets.js';
import { encodeShare, decodeShare } from './sharing.js';
import { renderWav } from './export.js';
import { longListen } from './long-listen.js';
import { printReport } from './report.js';
import { playTone, playNoise, stopSignal, recreatedLevel, TONE_RANGE, NOISE_RANGE } from './masking.js';
import { LANG, tx, localizePage } from './i18n.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = v => Math.min(1, Math.max(0, v));
const COLORS = [1, 2, 3, 4].map(n => `var(--track-${n})`); // design tokens, follow the theme
const STORE_KEY = 'tinnitus-studio';
const INSET = 22; // inner margin of the spectrum (px): the dot stays fully visible

const engine = new LiveEngine();
const state = { tracks: [], sel: 0, masking: null };
let screen = 'home';
let preview = null;   // preset currently previewed on the home screen
let shared = null;    // composition received through a link

// ---------- Local storage ----------
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.tracks) && !(d.v >= 2)) for (const t of d.tracks) if (t && typeof t.x === 'number') t.x = xFromV1(t.x);
    const t = sanitizeTracks(d && d.tracks);
    if (!t) return;
    state.tracks = t;
    state.sel = Math.min(Math.max(0, d.sel | 0), t.length - 1);
    if (d.masking && typeof d.masking === 'object' && Number.isFinite(d.masking.threshold)) state.masking = d.masking;
  } catch (e) { /* storage unavailable or corrupted: start fresh */ }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 2, sel: state.sel, masking: state.masking,
        tracks: state.tracks.map(({ id, ...t }) => t),
      }));
    } catch (e) { /* private browsing: ignored */ }
  }, 250);
}

// ---------- Messages ----------
let toastTimer;
function toast(msg, ms = 4200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('tt-toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('tt-toast--show'), ms);
}

// ---------- Audio ----------
const currentTracks = () => (screen === 'home' ? (preview ? preview.tracks : []) : screen === 'shared' ? shared || [] : state.tracks);

function play(tracks) {
  if (!engine.supported) return toast(tx('Your browser cannot generate sound.'));
  if (!tracks.some(t => t.on)) return toast(tx('All sounds are muted. Turn at least one back on.'));
  longListen.stop();
  engine.start(tracks);
  setTimeout(() => {
    if (engine.playing && engine.ctx && engine.ctx.state !== 'running') {
      toast(tx('The sound won’t start. Tap “Listen” again, check the volume and, on iPhone, make sure silent mode is off.'), 7000);
    }
  }, 1500);
}
const refreshAudio = () => engine.sync(currentTracks());

engine.onChange = () => updatePlayUI();
engine.onInterrupt = () => toast(tx('The sound was interrupted. Tap “Listen” to resume.'));

// Long listening, keeps playing with the screen locked.
// Editor "Loop" tab: plays until stopped (6 h max, the size limit of one WAV stream).
// Received-link screen: "Listen for 30 min".
const LONG_MINUTES = 30, LOOP_MINUTES = 360;
function toggleLong(tracks, minutes = LONG_MINUTES) {
  if (longListen.active) return longListen.stop();
  if (!tracks.some(t => t.on)) return toast(tx('All sounds are muted. Turn at least one back on.'));
  engine.stop(true);
  longListen.start(tracks, minutes).catch(e => { console.error(e); toast(tx('Long listening could not start on this device.')); });
}
const mmss = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function updateLongUI() {
  for (const b of $$('[data-long]')) {
    b.classList.toggle(b.dataset.on, longListen.active);
    b.setAttribute('aria-pressed', longListen.active);
    if (b.dataset.long === 'tab') { b.querySelector('.long-lbl').textContent = longListen.active && !longListen.ready ? tx('Preparing…') : tx('Loop'); continue; }
    b.querySelector('.long-lbl').textContent = !longListen.active ? tx('Listen for {n} min', { n: LONG_MINUTES })
      : longListen.ready ? tx('Stop · {t} left', { t: mmss(longListen.remaining()) }) : tx('Preparing…');
  }
}
longListen.onChange = updateLongUI;
updateLongUI();
setInterval(() => { if (longListen.ready) updateLongUI(); }, 1000);
$('#longPlay').onclick = () => toggleLong(state.tracks, LOOP_MINUTES);
$('#sharedLong').onclick = () => toggleLong(shared);
document.addEventListener('visibilitychange', () => { if (document.hidden) engine.stop(true); });
window.addEventListener('pagehide', () => engine.stop(true));

function updatePlayUI() {
  for (const b of $$('[data-play]')) {
    b.classList.toggle(b.dataset.on, engine.playing);
    b.setAttribute('aria-pressed', engine.playing);
    b.querySelector('.lbl').textContent = tx(engine.playing ? 'Stop' : b.dataset.play === 'shared' ? 'Listen to this sound' : 'Listen');
  }
  updateHome();
  if (screen === 'editor') positionDots();
  if (screen === 'shared' && shared) placeDots($('#sharedDots'), shared, engine.playing);
}

// ---------- Navigation ----------
function show(name) {
  if (name !== screen) {
    if (!(screen === 'home' && name === 'editor')) engine.stop();
    longListen.stop();
    if (name === 'home') preview = null;
  }
  for (const s of $$('.screen')) s.hidden = s.id !== name;
  screen = name;
  window.scrollTo(0, 0);
  if (name === 'editor') renderEditor();
  if (name === 'home') { $('#resume').hidden = !state.tracks.length; updateHome(); }
}
function goEditor() {
  show('editor');
  history.pushState({ s: 'editor' }, '', location.pathname + location.search);
}
window.addEventListener('popstate', () => { if (screen === 'editor') show('home'); });
$('#back').onclick = () => (history.state && history.state.s === 'editor' ? history.back() : show('home'));

// ---------- Abstract illustrations ----------
function path(n, fn) {
  let d = '';
  for (let i = 0; i <= n; i++) { const x = (i / n) * 120; d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + (24 + fn(i / n)).toFixed(1); }
  return d;
}
function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function art(kind) {
  const r = seeded(7), sw = 'stroke="url(#spec)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const svg = inner => `<svg viewBox="0 0 120 48" aria-hidden="true">${inner}</svg>`;
  switch (kind) {
    case 'whistle': return svg(`<path d="${path(240, t => 5 * Math.sin(t * 2 * Math.PI * 14))}" ${sw} stroke-width="1.4"/>`);
    case 'buzz': return svg(`<path d="${path(240, t => 13 * (((t * 3.5) % 1) * 2 - 1))}" ${sw} stroke-width="4"/>`);
    case 'hiss': {
      let c = '';
      for (let i = 0; i < 90; i++) { const x = r() * 120, y = 24 + (r() + r() + r() - 1.5) * 20; c += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + r() * 1.4).toFixed(1)}" fill="url(#spec)" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`; }
      return svg(c);
    }
    case 'crackle': return svg(`<path d="${path(70, () => (r() < 0.35 ? 0 : (r() * 2 - 1) * 18))}" ${sw} stroke-width="1.6"/>`);
    case 'pulse': return svg(`<path d="${path(300, t => 14 * Math.pow(Math.abs(Math.sin(t * Math.PI * 3)), 2) * Math.sin(t * 2 * Math.PI * 22))}" ${sw} stroke-width="1.8"/>`);
    case 'multi': return svg(`<path d="${path(240, t => 10 * Math.sin(t * 2 * Math.PI * 4))}" ${sw} stroke-width="2.4" opacity=".9"/><path d="${path(240, t => 6 * Math.sin(t * 2 * Math.PI * 11 + 1))}" stroke="currentColor" fill="none" stroke-width="1.3" opacity=".55"/>`);
    case 'crickets': return svg(`<path d="${path(360, t => { const c = (t * 3) % 1; return c < 0.34 ? 13 * Math.sin(Math.PI * c / 0.34) ** 2 * Math.sin(t * 2 * Math.PI * 60) : 0; })}" ${sw} stroke-width="1.5"/>`);
    case 'cicadas': return svg(`<path d="${path(480, t => 12 * Math.abs(Math.sin(t * Math.PI * 24)) ** 4 * Math.sin(t * 2 * Math.PI * 110))}" ${sw} stroke-width="1.3"/>`);
    case 'bell': return svg(`<path d="${path(300, t => 7 * Math.sin(t * 2 * Math.PI * 4) + 4.5 * Math.sin(t * 2 * Math.PI * 9.6 + 1) + 2.5 * Math.sin(t * 2 * Math.PI * 21.6 + 2))}" ${sw} stroke-width="1.9"/>`);
  }
  return '';
}

// ---------- Home ----------
function renderHome() {
  const box = $('#presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'tt-card';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="tt-card-art">${art(p.art)}</span><span class="tt-card-name">${LANG === 'fr' ? p.fr[0] : p.name}</span><span class="tt-card-desc">${LANG === 'fr' ? p.fr[1] : p.desc}</span><span class="tt-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
    b.onclick = () => pickPreset(p);
    box.append(b);
  }
  $('.tt-resume-art').innerHTML = art('multi');
}
function pickPreset(p) {
  if (preview && preview.id === p.id) {
    if (engine.playing) engine.stop(); else play(preview.tracks);
    return updateHome();
  }
  preview = { id: p.id, tracks: p.tracks.map(t => makeTrack(t)) };
  if (engine.playing) engine.sync(preview.tracks); else play(preview.tracks);
  updateHome();
}
function updateHome() {
  for (const c of $$('.tt-card')) {
    const sel = !!preview && c.dataset.id === preview.id;
    c.classList.toggle('tt-card--selected', sel);
    c.classList.toggle('tt-card--playing', sel && engine.playing && screen === 'home');
    c.setAttribute('aria-pressed', sel);
  }
  const btn = $('#toEditor');
  btn.disabled = !preview;
  btn.textContent = tx(preview ? 'Fine-tune this sound' : 'Choose a sound');
}
$('#toEditor').onclick = () => {
  if (!preview) return;
  state.tracks = preview.tracks; // same objects: playback continues seamlessly
  state.sel = 0;
  save();
  goEditor();
};
$('#fromScratch').onclick = () => { state.tracks = [makeTrack()]; state.sel = 0; save(); engine.stop(); goEditor(); };
$('#resume').onclick = () => { engine.stop(); goEditor(); };

// ---------- Editor ----------
const cur = () => state.tracks[state.sel];

function renderEditor() {
  renderTrackBar();
  renderDots($('#padDots'), state.tracks, state.sel);
  positionDots();
  renderControls();
}

function renderTrackBar() {
  const bar = $('#tracks');
  bar.innerHTML = '';
  state.tracks.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'tt-pill' + (i === state.sel ? ' tt-pill--active' : '') + (t.on ? '' : ' tt-pill--muted');
    b.style.setProperty('--c', COLORS[i]);
    b.innerHTML = `<i></i>${tx('Sound {n}', { n: i + 1 })}`;
    b.setAttribute('aria-pressed', i === state.sel);
    b.onclick = () => { state.sel = i; save(); renderEditor(); };
    bar.append(b);
  });
  if (state.tracks.length < MAX_TRACKS) {
    const add = document.createElement('button');
    add.className = 'tt-pill tt-pill--add';
    add.textContent = tx('+ Add another sound');
    add.onclick = addTrack;
    bar.append(add);
  }
  $('#trackActions').hidden = state.tracks.length < 2;
  $('#toggleTrack').textContent = tx(cur().on ? 'Mute this sound' : 'Unmute this sound');
}

function addTrack() {
  if (state.tracks.length >= MAX_TRACKS) return;
  const c = cur();
  const t = makeTrack({ x: c.x < 0.6 ? Math.min(1, c.x + 0.18) : c.x - 0.18, y: 0.08, level: 0.26 });
  state.tracks.push(t);
  state.sel = state.tracks.length - 1;
  changed();
}
$('#toggleTrack').onclick = () => { cur().on = !cur().on; changed(); };
$('#deleteTrack').onclick = () => {
  if (state.tracks.length < 2) return;
  state.tracks.splice(state.sel, 1);
  state.sel = Math.max(0, state.sel - 1);
  changed();
};

let longHinted = false;
function changed(full = true) {
  if (longListen.active && !longHinted) { longHinted = true; toast(tx('Changes will apply next time you start the loop.')); }
  if (screen === 'editor') refreshAudio();
  save();
  if (full) renderEditor(); else { positionDots(); }
}

// Spectrum dots
function renderDots(layer, tracks, sel) {
  layer.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('span');
    d.className = 'tt-dot' + (i === sel ? ' tt-dot--current' : '') + (t.on ? '' : ' tt-dot--off');
    d.style.setProperty('--c', COLORS[i]);
    layer.append(d);
  });
  placeDots(layer, tracks);
}
function placeDots(layer, tracks, playing = false) {
  [...layer.children].forEach((d, i) => {
    const t = tracks[i];
    if (!t) return;
    d.style.setProperty('--x', t.x);
    d.style.setProperty('--y', t.y);
    d.style.setProperty('--bd', (1 / rateOf(t.rate)).toFixed(3) + 's');
    d.classList.toggle('tt-dot--beating', playing && t.on && t.beat > 0.12 && t.shape !== 'buzz'); // a buzz is too fast to show
  });
}
function positionDots() {
  placeDots($('#padDots'), state.tracks, engine.playing && screen === 'editor');
  showFreq();
}

// Frequency of the selected sound: always shown, editable by typing or with − / + (hold to repeat).
const freqInput = $('#freq');
function showFreq() {
  if (!cur()) return;
  const f = freqOf(cur().x);
  if (document.activeElement !== freqInput) freqInput.value = Math.round(f);
  const hint = $('#freqHint');
  hint.textContent = f >= 12000 ? tx('Very high sounds fade with age. Don’t turn the volume up to hear them.')
    : f <= 60 ? tx('Very low sounds need headphones: phone speakers can’t play them.') : '';
  hint.hidden = !hint.textContent;
}
function setFreq(f) {
  if (!Number.isFinite(f)) return showFreq();
  cur().x = xOf(Math.min(F_MAX, Math.max(F_MIN, f)));
  changed(false);
}
/** Accepts "4120", "4 120", "4120 Hz", "4,1k", "4.1 kHz". */
function parseHz(s) {
  const m = String(s).trim().toLowerCase().replace(/\s+/g, '').replace(',', '.').match(/^(\d+(?:\.\d+)?)(k?)(hz)?$/);
  return m ? parseFloat(m[1]) * (m[2] ? 1000 : 1) : NaN;
}
freqInput.addEventListener('change', () => { setFreq(parseHz(freqInput.value)); showFreq(); });
freqInput.addEventListener('keydown', e => { if (e.key === 'Enter') freqInput.blur(); });
freqInput.addEventListener('blur', () => { freqInput.value = Math.round(freqOf(cur().x)); });
freqInput.addEventListener('focus', () => freqInput.select());
for (const [id, dir] of [['#freqDown', -1], ['#freqUp', 1]]) {
  const btn = $(id);
  let timer;
  const step = () => {
    const f = Math.round(freqOf(cur().x));
    setFreq(f + dir * Math.max(1, Math.round(f * 0.01))); // 1 % per step, at least 1 Hz
  };
  const stop = () => { clearTimeout(timer); clearInterval(timer); };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    step();
    timer = setTimeout(() => { timer = setInterval(step, 70); }, 400);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(); } });
}

// Touch interaction on the spectrum
const pad = $('#pad');
let dragging = false, hinted = false;
function moveTo(e, r = pad.getBoundingClientRect()) {
  const t = cur();
  t.x = clamp((e.clientX - r.left - INSET) / (r.width - 2 * INSET));
  t.y = clamp((e.clientY - r.top - INSET) / (r.height - 2 * INSET));
  changed(false);
}
pad.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  e.preventDefault();
  const r = pad.getBoundingClientRect();
  // Touching another dot selects it.
  let best = -1, bd = 30 * 30;
  state.tracks.forEach((t, i) => {
    const px = r.left + INSET + t.x * (r.width - 2 * INSET), py = r.top + INSET + t.y * (r.height - 2 * INSET);
    const d = (px - e.clientX) ** 2 + (py - e.clientY) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  if (best >= 0 && best !== state.sel) { state.sel = best; renderEditor(); }
  try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignored */ }
  dragging = true;
  pad.classList.add('tt-pad--dragging');
  moveTo(e, r);
  if (!engine.playing && !hinted) {
    hinted = true;
    toast(tx('Tap “Listen” to hear your changes live.'));
    $('#play').classList.add('tt-tab--nudge');
  }
});
pad.addEventListener('pointermove', e => { if (dragging) moveTo(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(ev, () => { if (dragging) { dragging = false; pad.classList.remove('tt-pad--dragging'); renderControls(); } });
}
pad.addEventListener('keydown', e => {
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!k) return;
  e.preventDefault();
  const t = cur();
  t.x = clamp(t.x + k[0] * 0.02); t.y = clamp(t.y + k[1] * 0.04);
  changed(false);
});
$('#play').addEventListener('animationend', e => e.target.classList.remove('tt-tab--nudge'));

// Controls
const fill = el => el.style.setProperty('--v', (el.value * 100).toFixed(1) + '%');
for (const k of ['level', 'beat', 'grain', 'rate', 'width']) {
  const el = $('#' + k);
  el.addEventListener('input', () => { cur()[k] = +el.value; fill(el); changed(false); });
}
for (const [id, key] of [['ear', 'ear'], ['wave', 'wave'], ['shape', 'shape']]) {
  $('#' + id).addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (v) { cur()[key] = v; changed(); }
  });
}

function renderControls() {
  const t = cur();
  for (const k of ['level', 'beat', 'grain', 'rate', 'width']) { const el = $('#' + k); el.value = t[k]; fill(el); }
  for (const b of $$('#ear button')) b.classList.toggle('on', b.dataset.v === t.ear);
  for (const b of $$('#wave button')) b.classList.toggle('on', b.dataset.v === t.wave);
  for (const b of $$('#shape button')) b.classList.toggle('on', b.dataset.v === t.shape);
  document.documentElement.style.setProperty('--accent', COLORS[state.sel]);
}

$('#play').onclick = () => (engine.playing ? engine.stop() : play(state.tracks));

// ---------- Sharing ----------
const dialog = $('#shareDialog');
let wavUrl = null, wavFile = null;
const shareLink = () => location.href.split('#')[0] + '#' + encodeShare(state.tracks);

const shareCode = () => encodeShare(state.tracks).replace(/^s=/, '');

$('#share').onclick = () => {
  showMaskSummary();
  $('#shareUrl').value = shareLink();
  $('#shareCode').value = shareCode();
  $('#nativeShare').hidden = !navigator.share;
  $('#makeWav').hidden = false;
  $('#wavReady').hidden = true;
  dialog.showModal();
};
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
$('#shareUrl').onfocus = e => e.target.select();

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const el = $('#shareUrl'); el.focus(); el.select();
    try { return document.execCommand('copy'); } catch (err) { return false; }
  }
}
$('#copyLink').onclick = async () => toast((await copy($('#shareUrl').value)) ? tx('Link copied. Paste it into a message.') : tx('Select the link to copy it.'));
$('#nativeShare').onclick = async () => {
  try {
    await navigator.share({ title: tx('My tinnitus'), text: tx('This is what I hear all the time. Turn the volume down a little before listening.'), url: $('#shareUrl').value });
  } catch (e) { if (e.name !== 'AbortError') toast(tx('Sharing didn’t work. Use “Copy link”.')); }
};

$('#makeWav').onclick = async () => {
  const btn = $('#makeWav');
  if (!state.tracks.some(t => t.on)) return toast(tx('All sounds are muted. Turn at least one back on.'));
  btn.disabled = true; btn.textContent = tx('Creating the file…');
  try {
    const blob = await renderWav(state.tracks, 15);
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(blob);
    wavFile = new File([blob], tx('my-tinnitus.wav'), { type: 'audio/wav' });
    $('#wavDownload').href = wavUrl;
    $('#wavPreview').src = wavUrl;
    $('#wavShare').hidden = !(navigator.canShare && navigator.canShare({ files: [wavFile] }));
    $('#wavReady').hidden = false;
    btn.hidden = true;
  } catch (e) {
    console.error(e);
    toast(tx('Unable to create the file on this device.'));
  } finally { btn.disabled = false; btn.textContent = tx('Create the audio file'); }
};
$('#wavPreview').addEventListener('play', () => engine.stop());
$('#wavShare').onclick = async () => {
  try { await navigator.share({ files: [wavFile], title: tx('My tinnitus') }); } catch (e) {
    if (e.name !== 'AbortError') toast(tx('Sharing didn’t work. Use “Save”.'));
  }
};

// ---------- Sound code: save it, and type it back later ----------
$('#shareCode').onfocus = e => e.target.select();
$('#copyCode').onclick = async () => {
  const code = $('#shareCode').value;
  try { await navigator.clipboard.writeText(code); toast(tx('Code copied.')); }
  catch (e) { $('#shareCode').focus(); $('#shareCode').select(); toast(tx('Select the code to copy it.')); }
};
$('#saveCode').onclick = async () => {
  const code = $('#shareCode').value;
  const text = `tinytus\n${tx('Code')}: ${code}\n${$('#shareUrl').value}\n${new Date().toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
  const file = new File([text], tx('tinytus-code.txt'), { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: tx('My tinnitus') }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
/** Accepts a bare code, "s=…", or a whole share link. */
function parseCode(raw) {
  const s = String(raw).trim();
  const m = s.match(/s=([A-Za-z0-9_-]+)/);
  return decodeShare('s=' + (m ? m[1] : s.replace(/[\s"'«»“”]/g, '')));
}
for (const form of $$('[data-code-form]')) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = form.elements.code;
    let tracks;
    try { tracks = parseCode(input.value); } catch (err) { toast(tx('This code is incomplete or damaged.')); return; }
    input.value = '';
    input.blur();
    const det = form.closest('details.code-entry'); if (det) det.open = false;
    state.tracks = tracks; state.sel = 0; save();
    engine.stop(); longListen.stop();
    if (screen === 'editor') renderEditor(); else goEditor();
    toast(tx('Sound loaded.'));
  });
}

// ---------- Report (save as PDF) ----------
$('#makeReport').onclick = () => {
  const info = { code: shareCode(), url: shareLink(), masking: state.masking };
  dialog.close();
  printReport(state.tracks, info);
};

// ---------- Masking test ----------
const maskDialog = $('#maskDialog');
const dbText = d => `${d >= 0 ? '' : '−'}${Math.abs(d).toFixed(1).replace('.', LANG === 'fr' ? ',' : '.')} dB`;
let mask = null; // test in progress
function showMaskSummary() {
  const m = state.masking;
  $('#maskSummary').textContent = !m ? tx('Masking level: not measured yet.')
    : m.mml == null ? tx('Masking: not reached at the maximum level ({d}).', { d: new Date(m.date).toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) })
    : tx('Masking level: {v} above threshold ({d}).', { v: dbText(m.mml - m.threshold), d: new Date(m.date).toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) });
}
function maskStep(n) { for (const s of $$('.mask-step')) s.hidden = +s.dataset.step !== n; }
function bindLevel(id, onChange) {
  const input = $('#' + id), box = input.closest('.tt-share-block');
  const show = () => {
    const v = +input.value; input.style.setProperty('--v', (100 * (v - input.min) / (input.max - input.min)).toFixed(1) + '%');
    box.querySelector('.mask-db').textContent = tx('Level: {v} (relative to the device maximum)', { v: dbText(v) });
    onChange(v);
  };
  input.addEventListener('input', show);
  for (const b of box.querySelectorAll('[data-step]')) b.onclick = () => { input.value = +input.value + 0.5 * +b.dataset.step; show(); };
  return { reset(v) { input.value = v; show(); }, get value() { return +input.value; } };
}
let toneCtl = null, noiseCtl = null;
const toneLevel = bindLevel('maskTone', v => toneCtl && toneCtl.setLevel(v));
const noiseLevel = bindLevel('maskNoiseLevel', v => noiseCtl && noiseCtl.setLevel(v));
const setPlayLabel = (id, on) => { $(id).textContent = tx(on ? 'Stop' : 'Play'); };
function startMask() {
  const t = cur() || state.tracks[0];
  const i = state.tracks.indexOf(t);
  mask = { index: i, freq: Math.round(freqOf(t.x)), noise: 'narrow' };
  $('.mask-freq').textContent = tx('Tested at {f} Hz (Sound {n}).', { f: mask.freq.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-GB'), n: i + 1 });
  stopSignal(); toneCtl = noiseCtl = null;
  setPlayLabel('#toneToggle', false); setPlayLabel('#noiseToggle', false);
  toneLevel.reset(TONE_RANGE[0]); noiseLevel.reset(NOISE_RANGE[0]);
  for (const b of $$('#maskNoise button')) b.classList.toggle('on', b.dataset.v === 'narrow');
  maskStep(1);
}
$('#openMask').onclick = () => {
  if (!state.tracks.length) return;
  engine.stop(true); longListen.stop();
  dialog.close(); startMask(); maskDialog.showModal();
};
$('#toneToggle').onclick = () => {
  if (toneCtl) { stopSignal(); toneCtl = null; setPlayLabel('#toneToggle', false); return; }
  toneCtl = playTone(mask.freq, toneLevel.value); setPlayLabel('#toneToggle', true);
};
$('#toneDone').onclick = () => {
  if (!toneCtl) return toast(tx('Press Play first.'));
  mask.threshold = toneLevel.value;
  stopSignal(); toneCtl = null;
  noiseLevel.reset(Math.max(NOISE_RANGE[0], mask.threshold - 10)); // start just under the threshold
  maskStep(2);
};
$('#maskNoise').addEventListener('click', async e => {
  const v = e.target.closest('button')?.dataset.v; if (!v) return;
  mask.noise = v;
  for (const b of $$('#maskNoise button')) b.classList.toggle('on', b.dataset.v === v);
  if (noiseCtl) noiseCtl = await playNoise(mask.noise, mask.freq, noiseLevel.value);
});
$('#noiseToggle').onclick = async () => {
  if (noiseCtl) { stopSignal(); noiseCtl = null; setPlayLabel('#noiseToggle', false); return; }
  noiseCtl = await playNoise(mask.noise, mask.freq, noiseLevel.value); setPlayLabel('#noiseToggle', true);
};
async function finishMask(mml) {
  stopSignal(); toneCtl = noiseCtl = null;
  const tinnitus = await recreatedLevel(state.tracks, mask.index);
  state.masking = { date: Date.now(), freq: mask.freq, sound: mask.index + 1, threshold: mask.threshold, mml, noise: mask.noise, tinnitus };
  save(); showMaskSummary();
  const m = state.masking, rows = [
    [tx('Hearing threshold at {f} Hz', { f: m.freq.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-GB') }), dbText(m.threshold)],
    [tx('Minimum masking level ({n})', { n: tx(m.noise === 'narrow' ? 'narrow band' : 'broadband') }), m.mml == null ? tx('not reached at {v}', { v: dbText(NOISE_RANGE[1]) }) : dbText(m.mml)],
    [tx('Masking level above threshold'), m.mml == null ? '—' : `<strong>${dbText(m.mml - m.threshold)}</strong>`],
    [tx('Recreated sound above threshold'), dbText(m.tinnitus - m.threshold)],
  ];
  $('#maskResult').innerHTML = '<table class="mask-table">' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</table>'
    + `<p class="tt-note">${tx('Saved: it will appear in your report.')}</p>`;
  maskStep(3);
}
$('#noiseDone').onclick = () => { if (!noiseCtl) return toast(tx('Press Play first.')); finishMask(noiseLevel.value); };
$('#noiseMax').onclick = () => finishMask(null);
$('#maskRedo').onclick = startMask;
$('#maskClose').onclick = () => maskDialog.close();
maskDialog.addEventListener('close', () => { stopSignal(); toneCtl = noiseCtl = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSignal(); toneCtl = noiseCtl = null; setPlayLabel('#toneToggle', false); setPlayLabel('#noiseToggle', false); } });

// ---------- Received link ----------
function readHash() {
  const h = location.hash.slice(1);
  if (!h) return false;
  try { shared = decodeShare(h); } catch (e) {
    shared = null;
    history.replaceState(null, '', location.pathname + location.search);
    toast(tx('This share link is incomplete or damaged.'));
    return false;
  }
  const n = shared.length;
  $('#sharedInfo').textContent = n > 1 ? tx('{n} layered sounds', { n }) : '';
  renderDots($('#sharedDots'), shared, -1);
  show('shared');
  return true;
}
const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
$('#sharedPlay').onclick = () => {
  if (engine.playing) engine.stop(); else play(shared);
  placeDots($('#sharedDots'), shared, engine.playing);
};
$('#sharedEdit').onclick = () => { state.tracks = shared; state.sel = 0; save(); clearHash(); engine.stop(); show('editor'); };
$('#sharedNew').onclick = () => { clearHash(); show('home'); };
window.addEventListener('hashchange', () => { engine.stop(); longListen.stop(); if (!readHash() && screen === 'shared') show('home'); });

// ---------- Theme ----------
function applyTheme(night) {
  if (night) document.documentElement.dataset.theme = 'night'; else delete document.documentElement.dataset.theme;
  for (const b of $$('[data-theme-toggle]')) {
    b.classList.toggle('tt-theme--night', night);
    b.setAttribute('aria-checked', night);
    b.children[0].classList.toggle('on', !night);
    b.children[1].classList.toggle('on', night);
  }
  $('meta[name=theme-color]').content = night ? '#070b1e' : '#fbf5ee';
}
for (const b of $$('[data-theme-toggle]')) {
  b.onclick = () => {
    const night = document.documentElement.dataset.theme !== 'night';
    applyTheme(night);
    try { localStorage.setItem('tinytus-theme', night ? 'night' : 'day'); } catch (e) { /* private mode */ }
  };
}
applyTheme(document.documentElement.dataset.theme === 'night');

// ---------- Startup ----------
localizePage();
load();
renderHome();
if (!readHash()) show('home');
