// Tinnitus Studio user interface.
import { LiveEngine, freqOf, rateOf } from './audio-engine.js';
import { PRESETS, makeTrack, sanitizeTracks, MAX_TRACKS } from './presets.js';
import { encodeShare, decodeShare } from './sharing.js';
import { renderWav } from './export.js';
import { longListen } from './long-listen.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = v => Math.min(1, Math.max(0, v));
const COLORS = ['#3ee6d0', '#ff6fb5', '#a98bff', '#ffc46b'];
const STORE_KEY = 'tinnitus-studio';
const INSET = 22; // inner margin of the spectrum (px): the dot stays fully visible

const engine = new LiveEngine();
const state = { tracks: [], sel: 0, showFreq: false };
let screen = 'home';
let preview = null;   // preset currently previewed on the home screen
let shared = null;    // composition received through a link

// ---------- Local storage ----------
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const t = sanitizeTracks(d && d.tracks);
    if (!t) return;
    state.tracks = t;
    state.sel = Math.min(Math.max(0, d.sel | 0), t.length - 1);
    state.showFreq = !!d.showFreq;
  } catch (e) { /* storage unavailable or corrupted: start fresh */ }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1, sel: state.sel, showFreq: state.showFreq,
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
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Audio ----------
const currentTracks = () => (screen === 'home' ? (preview ? preview.tracks : []) : screen === 'shared' ? shared || [] : state.tracks);

function play(tracks) {
  if (!engine.supported) return toast('Your browser cannot generate sound.');
  if (!tracks.some(t => t.on)) return toast('All sounds are muted. Turn at least one back on.');
  longListen.stop();
  engine.start(tracks);
  setTimeout(() => {
    if (engine.playing && engine.ctx && engine.ctx.state !== 'running') {
      toast('The sound won’t start. Tap “Listen” again, check the volume and, on iPhone, make sure silent mode is off.', 7000);
    }
  }, 1500);
}
const refreshAudio = () => engine.sync(currentTracks());

engine.onChange = () => updatePlayUI();
engine.onInterrupt = () => toast('The sound was interrupted. Tap “Listen” to resume.');

// Long listening (30 minutes, keeps playing with the screen locked)
const LONG_MINUTES = 30;
function toggleLong(tracks) {
  if (longListen.active) return longListen.stop();
  if (!tracks.some(t => t.on)) return toast('All sounds are muted. Turn at least one back on.');
  engine.stop(true);
  longListen.start(tracks, LONG_MINUTES).catch(e => { console.error(e); toast('Long listening could not start on this device.'); });
}
const mmss = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function updateLongUI() {
  for (const b of $$('[data-long]')) {
    b.classList.toggle('on', longListen.active);
    b.setAttribute('aria-pressed', longListen.active);
    b.querySelector('.long-lbl').textContent = !longListen.active ? `Listen for ${LONG_MINUTES} min`
      : longListen.ready ? `Stop · ${mmss(longListen.remaining())} left` : 'Preparing…';
  }
}
longListen.onChange = updateLongUI;
setInterval(() => { if (longListen.ready) updateLongUI(); }, 1000);
$('#longPlay').onclick = () => toggleLong(state.tracks);
$('#sharedLong').onclick = () => toggleLong(shared);
document.addEventListener('visibilitychange', () => { if (document.hidden) engine.stop(true); });
window.addEventListener('pagehide', () => engine.stop(true));

function updatePlayUI() {
  for (const b of $$('[data-play]')) {
    b.classList.toggle('on', engine.playing);
    b.setAttribute('aria-pressed', engine.playing);
    b.querySelector('.lbl').textContent = engine.playing ? 'Stop' : b.dataset.play === 'shared' ? 'Listen to this sound' : 'Listen';
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
    case 'multi': return svg(`<path d="${path(240, t => 10 * Math.sin(t * 2 * Math.PI * 4))}" ${sw} stroke-width="2.4" opacity=".9"/><path d="${path(240, t => 6 * Math.sin(t * 2 * Math.PI * 11 + 1))}" stroke="#fff" fill="none" stroke-width="1.3" opacity=".75"/>`);
  }
  return '';
}

// ---------- Home ----------
function renderHome() {
  const box = $('#presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="card-art">${art(p.art)}</span><span class="card-name">${p.name}</span><span class="card-desc">${p.desc}</span><span class="card-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
    b.onclick = () => pickPreset(p);
    box.append(b);
  }
  $('.resume-art').innerHTML = art('multi');
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
  for (const c of $$('.card')) {
    const sel = !!preview && c.dataset.id === preview.id;
    c.classList.toggle('selected', sel);
    c.classList.toggle('playing', sel && engine.playing && screen === 'home');
    c.setAttribute('aria-pressed', sel);
  }
  const btn = $('#toEditor');
  btn.disabled = !preview;
  btn.textContent = preview ? 'Fine-tune this sound' : 'Choose a sound';
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
    b.className = 'pill' + (i === state.sel ? ' active' : '') + (t.on ? '' : ' muted');
    b.style.setProperty('--c', COLORS[i]);
    b.innerHTML = `<i></i>Sound ${i + 1}`;
    b.setAttribute('aria-pressed', i === state.sel);
    b.onclick = () => { state.sel = i; save(); renderEditor(); };
    bar.append(b);
  });
  if (state.tracks.length < MAX_TRACKS) {
    const add = document.createElement('button');
    add.className = 'pill add';
    add.textContent = '+ Add another sound';
    add.onclick = addTrack;
    bar.append(add);
  }
  $('#trackActions').hidden = state.tracks.length < 2;
  $('#toggleTrack').textContent = cur().on ? 'Mute this sound' : 'Unmute this sound';
}

function addTrack() {
  if (state.tracks.length >= MAX_TRACKS) return;
  const c = cur();
  const t = makeTrack({ x: c.x < 0.6 ? Math.min(1, c.x + 0.25) : c.x - 0.25, y: 0.08, level: 0.26 });
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
  if (longListen.active && !longHinted) { longHinted = true; toast('Changes will apply next time you start the 30-minute listening.'); }
  if (screen === 'editor') refreshAudio();
  save();
  if (full) renderEditor(); else { positionDots(); }
}

// Spectrum dots
function renderDots(layer, tracks, sel) {
  layer.innerHTML = '';
  tracks.forEach((t, i) => {
    const d = document.createElement('span');
    d.className = 'dot' + (i === sel ? ' current' : '') + (t.on ? '' : ' off');
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
    d.classList.toggle('beating', playing && t.on && t.beat > 0.12);
  });
}
function positionDots() {
  placeDots($('#padDots'), state.tracks, engine.playing && screen === 'editor');
  const info = $('#freqInfo');
  info.hidden = !state.showFreq;
  if (state.showFreq) info.textContent = state.tracks.map((t, i) => `Sound ${i + 1}: ${fmtHz(freqOf(t.x))}`).join('  ·  ');
}
const fmtHz = f => (f < 1000 ? `${Math.round(f / 5) * 5} Hz` : `${(f / 1000).toFixed(1)} kHz`);

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
  pad.classList.add('dragging');
  moveTo(e, r);
  if (!engine.playing && !hinted) {
    hinted = true;
    toast('Tap “Listen” to hear your changes live.');
    $('#play').classList.add('nudge');
  }
});
pad.addEventListener('pointermove', e => { if (dragging) moveTo(e); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(ev, () => { if (dragging) { dragging = false; pad.classList.remove('dragging'); renderControls(); } });
}
pad.addEventListener('keydown', e => {
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!k) return;
  e.preventDefault();
  const t = cur();
  t.x = clamp(t.x + k[0] * 0.02); t.y = clamp(t.y + k[1] * 0.04);
  changed(false);
});
$('#play').addEventListener('animationend', e => e.target.classList.remove('nudge'));

// Controls
const fill = el => el.style.setProperty('--v', (el.value * 100).toFixed(1) + '%');
for (const k of ['level', 'beat', 'grain', 'rate', 'width']) {
  const el = $('#' + k);
  el.addEventListener('input', () => { cur()[k] = +el.value; fill(el); changed(false); });
}
for (const [id, key] of [['ear', 'ear'], ['wave', 'wave']]) {
  $('#' + id).addEventListener('click', e => {
    const v = e.target.closest('button')?.dataset.v;
    if (v) { cur()[key] = v; changed(); }
  });
}
$('#showFreq').onchange = e => { state.showFreq = e.target.checked; save(); positionDots(); };

function renderControls() {
  const t = cur();
  for (const k of ['level', 'beat', 'grain', 'rate', 'width']) { const el = $('#' + k); el.value = t[k]; fill(el); }
  for (const b of $$('#ear button')) b.classList.toggle('on', b.dataset.v === t.ear);
  for (const b of $$('#wave button')) b.classList.toggle('on', b.dataset.v === t.wave);
  $('#showFreq').checked = state.showFreq;
  document.documentElement.style.setProperty('--accent', COLORS[state.sel]);
}

$('#play').onclick = () => (engine.playing ? engine.stop() : play(state.tracks));

// ---------- Sharing ----------
const dialog = $('#shareDialog');
let wavUrl = null, wavFile = null;
const shareLink = () => location.href.split('#')[0] + '#' + encodeShare(state.tracks);

$('#share').onclick = () => {
  $('#shareUrl').value = shareLink();
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
$('#copyLink').onclick = async () => toast((await copy($('#shareUrl').value)) ? 'Link copied. Paste it into a message.' : 'Select the link to copy it.');
$('#nativeShare').onclick = async () => {
  try {
    await navigator.share({ title: 'My tinnitus', text: 'This is what I hear all the time. Turn the volume down a little before listening.', url: $('#shareUrl').value });
  } catch (e) { if (e.name !== 'AbortError') toast('Sharing didn’t work. Use “Copy link”.'); }
};

$('#makeWav').onclick = async () => {
  const btn = $('#makeWav');
  if (!state.tracks.some(t => t.on)) return toast('All sounds are muted. Turn at least one back on.');
  btn.disabled = true; btn.textContent = 'Creating the file…';
  try {
    const blob = await renderWav(state.tracks, 15);
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(blob);
    wavFile = new File([blob], 'my-tinnitus.wav', { type: 'audio/wav' });
    $('#wavDownload').href = wavUrl;
    $('#wavPreview').src = wavUrl;
    $('#wavShare').hidden = !(navigator.canShare && navigator.canShare({ files: [wavFile] }));
    $('#wavReady').hidden = false;
    btn.hidden = true;
  } catch (e) {
    console.error(e);
    toast('Unable to create the file on this device.');
  } finally { btn.disabled = false; btn.textContent = 'Create the audio file'; }
};
$('#wavPreview').addEventListener('play', () => engine.stop());
$('#wavShare').onclick = async () => {
  try { await navigator.share({ files: [wavFile], title: 'My tinnitus' }); } catch (e) {
    if (e.name !== 'AbortError') toast('Sharing didn’t work. Use “Save”.');
  }
};

// ---------- Received link ----------
function readHash() {
  const h = location.hash.slice(1);
  if (!h) return false;
  try { shared = decodeShare(h); } catch (e) {
    shared = null;
    history.replaceState(null, '', location.pathname + location.search);
    toast('This share link is incomplete or damaged.');
    return false;
  }
  const n = shared.length;
  $('#sharedInfo').textContent = n > 1 ? `${n} layered sounds` : '';
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

// ---------- Startup ----------
load();
renderHome();
if (!readHash()) show('home');
