// Service worker for the 30-minute listening.
// It answers requests for ./long/<id>.wav with ONE continuous WAV file, generated on the fly
// from a 20-second seamless loop that the page stored locally (Cache API). The player sees a
// single long file, so there is no loop point and no gap. The long file is never stored:
// bytes are produced as the player asks for them (Range requests are supported, as Safari needs).
// A fade-in and fade-out are written into the stream so start and end never click.
// Every other request is left untouched (no offline caching).

const CACHE = 'tinnitus-long';
const FADE_IN = 0.6, FADE_OUT = 2.5; // seconds
let mem = null; // { key, pcm, sr, ch }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin && /\/long\/[\w-]+\.wav$/.test(url.pathname)) e.respondWith(serve(e.request, url));
});

async function loadLoop(url) {
  const key = url.origin + url.pathname.replace(/\.wav$/, '.pcm');
  if (mem && mem.key === key) return mem;
  const res = await (await caches.open(CACHE)).match(key);
  if (!res) return null;
  mem = { key, pcm: new Uint8Array(await res.arrayBuffer()), sr: +res.headers.get('x-sr') || 44100, ch: +res.headers.get('x-ch') || 2 };
  return mem;
}

function wavHeader(dataLen, sr, ch) {
  const v = new DataView(new ArrayBuffer(44));
  const str = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  return new Uint8Array(v.buffer);
}

async function serve(req, url) {
  const loop = await loadLoop(url);
  if (!loop) return new Response('Not found', { status: 404 });
  const { pcm, sr, ch } = loop, L = pcm.length, frame = ch * 2;
  const minutes = Math.min(360, Math.max(1, +url.searchParams.get('m') || 30)) /* 6 h stays under the 4 GB WAV limit */;
  const dataLen = Math.ceil((minutes * 60 * sr * frame) / L) * L, total = 44 + dataLen;
  const header = wavHeader(dataLen, sr, ch);
  const samples = dataLen / 2, fadeInS = Math.round(sr * FADE_IN) * ch, fadeOutS = Math.round(sr * FADE_OUT) * ch;

  let start = 0, end = total - 1, partial = false;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    partial = true;
    if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], total - 1); } else start = Math.max(0, total - +m[2]);
  }
  if (start >= total) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });

  // Writes the faded version of sample k (16-bit, little endian) into the chunk, byte by byte.
  const fadeSample = (out, o, k, g) => {
    const p = (2 * k) % L;
    const v = Math.round(((pcm[p] | (pcm[p + 1] << 8)) << 16 >> 16) * g);
    const b = 44 + 2 * k;
    if (b >= o && b < o + out.length) out[b - o] = v & 255;
    if (b + 1 >= o && b + 1 < o + out.length) out[b + 1 - o] = (v >> 8) & 255;
  };
  const gain = x => Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, x))) ** 2;

  function bytes(o, n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n;) {
      const p = o + i;
      if (p < 44) { out[i++] = header[p]; continue; }
      const off = (p - 44) % L, len = Math.min(n - i, L - off);
      out.set(pcm.subarray(off, off + len), i);
      i += len;
    }
    const k0 = Math.max(0, Math.floor((o - 44) / 2)), k1 = Math.floor((o + n - 44) / 2); // samples touched
    for (let k = k0; k <= Math.min(k1, fadeInS - 1); k++) fadeSample(out, o, k, gain(Math.floor(k / ch) / (fadeInS / ch)));
    for (let k = Math.max(k0, samples - fadeOutS); k <= Math.min(k1, samples - 1); k++) fadeSample(out, o, k, gain((samples - 1 - k) / fadeOutS));
    return out;
  }

  let pos = start;
  const body = new ReadableStream({
    pull(ctrl) {
      if (pos > end) return ctrl.close();
      const n = Math.min(1 << 16, end - pos + 1);
      ctrl.enqueue(bytes(pos, n));
      pos += n;
    },
  });
  const headers = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store' };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
  return new Response(body, { status: partial ? 206 : 200, headers });
}
