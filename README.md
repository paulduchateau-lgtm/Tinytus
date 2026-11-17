# tinytus

A web app for recreating the sound of your tinnitus and letting your loved ones hear it.
It is 100% static: no server, no account, no dependencies. Everything stays on the device.

> This is not a medical tool: it does not diagnose or treat anything. The preset sounds are synthetic starting points, not clinical references.

The interface is in English, and switches to French automatically when the phone or browser's preferred language is French.

## Design

The look follows the **tinytus design system**: a warm "Day" theme by default (cream background, honey → tangerine → rose → plum spectrum) and the original dark palette as "Night", switched with the sun/moon pill at the top of every screen and remembered per device. Headlines use Chillax, everything else Figtree. In the editor, a sticky bar holds **Listen · Loop · Share**: Loop plays the sound as one continuous stream until stopped (up to 6 hours), even with the screen locked.

## User flow

1. **What does your tinnitus sound like?** Nine starting sounds (whistle, humming, hissing, crackling, pulsing, several sounds, crickets, cicadas, bell), each playable with a single tap (or "Start from scratch").
2. **Fine-tune your sound**. A colour spectrum: horizontally lower ↔ higher, vertically pure ↔ diffuse. Three secondary controls: Loudness, Pulse, Grain. Up to 4 layered sounds. The "More settings" panel holds the ear, tone, pulse speed, sound width. "More settings" adds ear, tone (Soft, Round, Rich, or Bell: inharmonic partials ringing continuously), pulse shape (Gentle; Chirping for cricket-like chirps; Buzzing for the perfectly regular click train of cicadas), pulse speed and width. The spectrum spans the whole hearing range, 20 Hz to 20 kHz, so users can also find where they stop hearing. The frequency of the selected sound is always shown under the spectrum and can be typed in Hz (e.g. "4120", "4,1k") or nudged by 1 % with − / + (hold to repeat).
3. **Share my tinnitus**. A short code (also inside every link) can be copied or saved, and typed back in later in the field on the home screen or the editor ("More settings → Load a code"). A report describing every sound (fundamental frequency with nearest note, harmonics or bell partials with their level in dB, character, tone, pulse, grain, ear, a chart on the hearing range, notes to fill in) opens in the print dialog to be saved as PDF. A guided **masking test** (Share → Measure masking) measures the hearing threshold at the tinnitus frequency with a pulsed tone, then the minimum masking level with narrow-band (½ octave) or broadband noise; results are given in dB above threshold (comparable to dB SL, uncalibrated) and appear in the report. A link that contains the whole composition (in the `#s=…` fragment), or a 15-second WAV file generated locally.

## Files

| File | Role |
|---|---|
| `index.html` | Markup for the three screens and the share dialog |
| `style.css` | tinytus design system: tokens (Day / Night themes), component styles, app layout |
| `images/` | Link preview (`og-image.jpg`, 1200×630) and lock-screen cover (`cover-*.jpg`); `images/source/` holds the HTML they are rendered from |
| `fonts/` | Chillax (headlines, self-hosted, ITF Free Font License); Figtree comes from Google Fonts |
| `audio-engine.js` | Web Audio synthesis engine (live playback + shared graph) |
| `presets.js` | Track model, validation and starting sounds |
| `sharing.js` | Compact, versioned link encoding |
| `export.js` | `OfflineAudioContext` rendering, seamless loop and 16-bit PCM WAV encoding |
| `long-listen.js` | 30-minute listening that keeps playing with the screen locked |
| `sw.js` | Service worker that streams the 30-minute listening as one continuous file |
| `app.js` | User interface |
| `report.js` | Printable report for a doctor (saved as PDF from the print dialog) |
| `masking.js` | Masking test: hearing threshold and minimum masking level (MML) at the tinnitus frequency |
| `i18n.js` | English / French texts (French when the phone or browser prefers French) |

The WAV export uses exactly the same `createVoice()` function as live playback.

### Link format (v1)

`#s=` followed by the composition encoded in base64url (version 2: pitch over 20 Hz – 20 kHz; version 1 links, 80 Hz – 14 kHz, are converted and still play the same sound): one version byte, the track count, then 9 bytes per track (pitch on 16 bits, then purity, loudness, pulse, grain, speed, width, and flags for on/off, ear, tone and pulse shape), and finally a checksum. A 4-track link is about 55 characters. On opening, the version, length, checksum and values are all validated. A damaged link returns to the home screen with a message.

## 30-minute listening

A 30-minute WAV would weigh about 300 MB. Instead:

1. The browser renders a **20-second loop that repeats exactly** (about 3.5 MB): pitch and pulse are rounded to whole cycles per loop (under 0.025 Hz, inaudible) and the noise buffers last 4 s, so the end joins the start perfectly.
2. The loop is stored locally (Cache API), and the service worker `sw.js` serves `long/<id>.wav` as **one continuous 30-minute WAV generated on the fly**, with Range request support and fades written into the first 0.6 s and last 2.5 s. The long file never exists in memory or on the network.
3. An `<audio>` element plays it, so it keeps going with the screen locked, shows lock-screen controls (Media Session) and ends by itself.

Why not just `audio.loop`? On iPhone, an audio element leaves a tiny gap each time it loops, which is heard as a click. With a single continuous file there is no loop point. `audio.loop` is only used as a fallback when service workers are unavailable.

## Hearing safety

- Low initial volume, no autoplay (including when opening a shared link).
- Normalisation by track count, plus a limiter (`DynamicsCompressor`) against clipping.
- All changes are smoothed to avoid clicks. Fades at the start and end of playback and export.
- Playback stops automatically when the page goes to the background.

## iPhone / Safari

- The `AudioContext` is only created and resumed (`resume()`) inside a user gesture.
- On Safari 17 and later, `navigator.audioSession.type = 'playback'` (an official API) lets the sound play even in silent mode. On older versions, a message reminds the user to check that mode if the sound won't start.
- Interruptions (call, another app) are detected: the UI switches back to "Listen" and shows a message.
- The spectrum uses `touch-action: none`, so dragging a finger does not scroll the page.

## Audience statistics

The page loads Vercel Web Analytics (`/_vercel/insights/script.js`): cookie-free, no personal data, no consent banner needed. Turn it on in the Vercel project under **Analytics → Enable** to see unique visitors, countries, devices and referrers. The URL fragment (`#s=…`, the shared sound) is never sent. Outside Vercel the script simply does not load.

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

ES modules don't load over `file://`, so a static HTTP server is required.

## Publish on GitHub Pages

1. Push these files to the branch you want to publish (e.g. `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, choose the branch, then the `/ (root)` folder, and save.
3. After a minute or two, the site is live at `https://USERNAME.github.io/REPO-NAME/`.

All paths are relative, and `.nojekyll` disables Jekyll processing. Share links automatically keep the repository path.
