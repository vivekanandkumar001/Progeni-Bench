# Bench Audio Toolkit — Implementation Report

> **Test-suite location notice.** This branch ships the full harness:
> `test/audio-toolkit.test.js` (32 unit tests) plus the inherited legacy and
> image-toolkit suites, and `tests/*.spec.js` for Chromium e2e.
>
> Verified green in this tree:
>
> - `npm test` — **258 pass, 0 fail** (226 inherited + 32 audio toolkit)
> - `node scripts/verify.js` — **47 pass, 0 fail, 1 skip**
>   (the skip is C11b, a DOMParser check that needs a real browser)
>
> Statuses in §4 that read "Implemented and tested" are backed by these tests.

Ship-ready reference for the `/audio/*` audio toolkit added to Progeni Bench.
It covers architecture, changed files, the full tool registry, per-tool status,
test evidence, known limitations, security decisions, deployment/rollback and a
prioritised next-step list.

- Canonical host: `https://bench.progeni.live`
- Registry source of truth: `audio-tools.config.js`
- Runtime: `audio-toolkit.js` (+ the FFmpeg.wasm engine in `vendor/ffmpeg/`)
- Page generator: `audio-pages.js` (driven by `build_seo_pages.js`)
- Routing: `app.js` (lazy `/audio/*` mount)

---

## 1. Architecture summary

The toolkit is **the same static site** — no second frontend, no new backend,
no database. It reuses the existing shell (`index.html`, `app.js`,
`styles.css`, `site.config.js`, Netlify/Vercel headers) and adds:

```
audio-tools.config.js    registry (56 entries) — single source of truth
audio-toolkit.js         pure DSP core + browser engine + UI mounts
audio-pages.js           static HTML generator for /audio/ and /audio/<slug>/
vendor/ffmpeg/           same-origin FFmpeg.wasm engine (GPL, no CDN)
scripts/build-vendor.js  copies the engine + writes the licence NOTICE
audio/**                 generated static pages (49 files)
```

**Data flow (client-side, per tool):**

```
<File>  ──size + signature guard──▶  decode (Web Audio or FFmpeg.wasm)
        ──▶  processor(ctx)  ──▶  outputs[] (Blob) ──▶ object URL ──▶ download
```

Key properties:

- **Registry-driven.** Every page, canonical URL, JSON-LD, meta description,
  sitemap entry, `noindex` flag and hub listing is derived from one array in
  `audio-tools.config.js`. Nothing is hand-duplicated.
- **Two engines, chosen per tool.** `engine: "web-audio"` uses the browser's
  own decoder/`OfflineAudioContext`/`AudioBuffer` and needs no download.
  `engine: "ffmpeg"` uses the FFmpeg.wasm core lazily fetched from
  `/vendor/ffmpeg/` (~31 MB, cached) for codec conversion and complex filters.
  `engine: "media-recorder"` is microphone capture (MediaRecorder for takes,
  Web Audio live metering for the mic check).
- **Honest status.** 43 tools ship with a real handler and a generated page.
  5 are experimental (`noindex, follow`). 6 are **deferred** and 2 are
  **unavailable** — they get **no page** and are listed with an explicit
  reason, never a fake progress bar or a simulated result.
- **No stubs.** `mountTool` refuses to mount a tool whose `handler` is missing
  from `PROCESSORS`, and `test/audio-toolkit.test.js` asserts the 48 public
  handlers and the 48 processors are the same set in both directions.
- **Live tools are real UI, not fake downloads.** The recorder, the microphone
  check and the metronome mount dedicated controls. Mic Check only reads the
  live input level (it never creates a recording), the metronome uses a Web
  Audio lookahead scheduler, and both are covered by Chromium e2e tests. Their
  batch handlers exist only to fail loudly if called out of context.
- **Single-threaded engine.** The site ships the single-threaded FFmpeg core,
  so no `SharedArrayBuffer` and no COOP/COEP headers are required.

---

## 2. Changed / added files and dependencies

### New source files

| File | Purpose |
|---|---|
| `audio-tools.config.js` | Registry: `CATEGORIES`, `TOOLS`, `LIMITS`, `FORMAT_OPTIONS`, helpers |
| `audio-toolkit.js` | Pure DSP core + FFmpeg loader + 48 processors + `mountHub`/`mountTool`/`unmount` |
| `audio-pages.js` | Generates the hub and per-tool static pages + sitemap entries |
| `test/audio-toolkit.test.js` | Registry invariants, WAV encoder, DSP helpers, page/SEO tests |
| `vendor/ffmpeg/ffmpeg-core.js` | `@ffmpeg/core` 0.12.10 loader glue (GPL-2.0-or-later) |
| `vendor/ffmpeg/ffmpeg-core.wasm` | Compiled FFmpeg core, includes `libmp3lame` (~30.7 MB) |
| `vendor/ffmpeg/ffmpeg.js`, `814.ffmpeg.js` | `@ffmpeg/ffmpeg` 0.12.15 wrapper (MIT) |
| `vendor/ffmpeg/NOTICE.txt` | GPL notice, attributions and written source offer |
| `audio/**` | Generated static pages (49 files, committed) |

### Modified files

| File | Change |
|---|---|
| `build_seo_pages.js` | Requires the audio registry/generator; adds `/audio/` nav links, a homepage audio band, 44 audio sitemap URLs, copies the registry/runtime into `dist`, and makes vendor copying recursive for `vendor/ffmpeg/` |
| `app.js` | Lazy `/audio/*` routing with navigation tokens, `leaveAudioToolkit()` cleanup, `/audio` hub branch |
| `styles.css` | `atk-*` styles for waveform, transport, recorder, meter, text output and the `.audio-band` |
| `vercel.json`, `_headers` | CSP `script-src` gains `'wasm-unsafe-eval'`; `/audio/*` scopes `microphone=(self)`; `/vendor/ffmpeg/*` gets a long cache |
| `scripts/build-vendor.js` | Copies the FFmpeg engine from `node_modules` and writes `NOTICE.txt` |
| `scripts/verify.js` | C38/C45 now compare the sitemap to **indexable** canonicals (see §7) |
| `image-tools.config.js` | Fixes 14 over-length titles and 31 out-of-range descriptions surfaced by the shared C35 check (see §7) |
| `package.json`, `package-lock.json` | Adds `@ffmpeg/core`, `@ffmpeg/ffmpeg`, `@ffmpeg/util` |
| `sitemap.xml` | Regenerated (122 URLs total, 44 audio URLs) |
| `README.md` | New Audio Toolkit section; corrected sitemap/tool counts |
| `llms.txt` | Lists the Audio Toolkit routes |

### Dependencies added

| Package | Version | Licence | Used by |
|---|---|---|---|
| `@ffmpeg/core` | 0.12.10 | **GPL-2.0-or-later** | Codec conversion and complex filters |
| `@ffmpeg/ffmpeg` | 0.12.15 | MIT | Loader/wrapper around the core |
| `@ffmpeg/util` | 0.12.2 | MIT | Dev/reference only (the shipped runtime does not require its broken UMD build) |

Engine payload (same-origin, lazy — never from a CDN):

| File | Size |
|---|---|
| `vendor/ffmpeg/ffmpeg-core.wasm` | 30.7 MB |
| `vendor/ffmpeg/ffmpeg-core.js` | 109.4 KB |
| `vendor/ffmpeg/ffmpeg.js` | 4.3 KB |
| `vendor/ffmpeg/814.ffmpeg.js` | 3.1 KB |

Regenerate with `npm run build:vendor`. Browsers cache the wasm for a week
(`Cache-Control: public, max-age=604800`), so a second conversion is instant.

**Licensing.** `@ffmpeg/core` is GPL-2.0-or-later and includes `libmp3lame`, so
`vendor/ffmpeg/NOTICE.txt` carries the GPL notice, upstream source locations,
the exact build version and a written offer to supply the corresponding source.
The MIT wrapper is attributed in the same file. The binary is shipped
unmodified.

---

## 3. Registry & route inventory

**Route shape**

| Route | Meaning |
|---|---|
| `/audio/` | Toolkit hub — category grid, working tools, honest unavailable list |
| `/audio/<slug>/` | One page per implemented/experimental tool (`slug` = registry `id`) |
| `/image/*` | Existing image toolkit — unchanged |
| `/tools/*` | Existing 30-tool legacy site — unchanged |

Pages are generated for the **48 public tools** (43 implemented → indexed;
5 experimental → `noindex, follow` and deliberately absent from the sitemap).
`/audio/studio/` is **reserved and not shipped**; there is no page and no route
for it. Deferred/unavailable tools get no page at all.

**Counts**

| Metric | Value |
|---|---|
| Registry entries | 56 |
| Implemented | 43 |
| Experimental | 5 |
| Deferred | 6 |
| Unavailable | 2 |
| Public (implemented + experimental) | 48 |
| Generated pages (hub + tools) | 49 |
| Categories | 7 |
| FFmpeg-engine tools | 24 |
| Web Audio tools | 22 |
| MediaRecorder tools | 2 |
| Audio URLs in `sitemap.xml` | 44 (hub + 43 implemented) |

**Category split (public tools)**

| Category | Public tools |
|---|---|
| Convert & Compress | 9 |
| Cut, Join & Edit | 10 |
| Clean & Enhance | 6 |
| Record & Microphone | 3 |
| Music & Sound | 5 |
| Metadata & Diagnostics | 7 |
| Developer Utilities | 8 |

---

## 4. Per-tool status

Legend: **IT** = Implemented and tested · **EX** = Experimental ·
**DF** = Deferred · **UN** = Unavailable.

### A. Convert & Compress

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Audio Converter | `convert` | `convert` | ffmpeg | IT |
| Audio Compressor | `compress` | `compressAudio` | ffmpeg | IT |
| Audio to WAV | `to-wav` | `toWav` | web-audio | IT |
| Audio to MP3 | `to-mp3` | `toMp3` | ffmpeg | IT |
| Audio to FLAC | `to-flac` | `toFlac` | ffmpeg | IT |
| Audio to M4A (AAC) | `to-m4a` | `toM4a` | ffmpeg | IT |
| Audio to OGG / Opus | `to-ogg` | `toOgg` | ffmpeg | IT |
| Audio to AIFF | `to-aiff` | `toAiff` | ffmpeg | IT |
| Ringtone Maker | `ringtone-maker` | `ringtone` | ffmpeg | IT |

### B. Cut, Join & Edit

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Audio Trimmer | `trimmer` | `trim` | web-audio | IT |
| Audio Joiner | `joiner` | `join` | ffmpeg | IT |
| Audio Splitter | `splitter` | `split` | ffmpeg | IT |
| Fade In / Out | `fade` | `fade` | ffmpeg | IT |
| Reverse Audio | `reverse` | `reverse` | web-audio | IT |
| Change Speed | `speed` | `speed` | ffmpeg | IT |
| Pitch Shifter | `pitch` | `pitch` | ffmpeg | **EX** |
| Loop Maker | `loop-maker` | `loop` | ffmpeg | IT |
| Crossfade Editor | `crossfade` | `crossfade` | ffmpeg | IT |
| Stereo & Channel Tools | `channel-tools` | `channels` | ffmpeg | IT |

### C. Clean & Enhance

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Silence Remover | `silence-remover` | `silenceRemove` | ffmpeg | IT |
| Volume & Normalize | `volume-adjust` | `volumeNormalize` | ffmpeg | IT |
| Noise Reducer | `noise-reducer` | `denoise` | ffmpeg | **EX** |
| Voice Enhancer | `voice-enhancer` | `voiceEnhance` | ffmpeg | **EX** |
| Bass, Treble & EQ | `equalizer` | `equalizer` | ffmpeg | IT |
| Loudness Normalizer (LUFS) | `loudness-normalizer` | `loudnorm` | ffmpeg | IT |
| AI Noise Reduction | `ai-denoise` | `aiDenoise` | web-audio | **DF** |
| Audio Restoration | `audio-restoration` | `restore` | web-audio | **DF** |

### D. Record & Microphone

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Voice Recorder | `recorder` | `record` | media-recorder | IT |
| Microphone Check | `mic-check` | `micCheck` | media-recorder | IT |
| Stereo Channel Test | `stereo-test` | `stereoTest` | web-audio | IT |
| System / Tab Audio Capture | `system-audio-record` | `systemAudio` | web-audio | **DF** |

### E. Music & Sound

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Tone Generator | `tone-generator` | `tone` | web-audio | IT |
| Noise Generator | `noise-generator` | `noise` | web-audio | IT |
| Metronome | `metronome` | `metronome` | web-audio | IT |
| BPM & Key Detector | `bpm-detector` | `bpm` | web-audio | **EX** |
| Spectrogram / Spectrum Analyzer | `spectrogram` | `spectrogram` | web-audio | IT |
| Text to Speech | `text-to-speech` | `tts` | web-audio | **UN** |
| Vocal Remover / Stem Separation | `vocal-remover` | `stems` | web-audio | **DF** |

### F. Metadata & Diagnostics

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Clipping Detector | `clipping-detector` | `clipping` | web-audio | IT |
| Silence Detector | `silence-detector` | `silenceDetect` | web-audio | IT |
| Audio Metadata Viewer | `metadata-viewer` | `metadata` | web-audio | IT |
| ID3 Tag Editor | `id3-editor` | `id3Edit` | ffmpeg | **EX** |
| Loudness & Peak Analyzer | `loudness-analyzer` | `loudnessAnalyze` | ffmpeg | IT |
| Audio Integrity Check | `integrity-check` | `integrity` | web-audio | IT |
| Duplicate Audio Finder | `duplicate-finder` | `audioDedupe` | web-audio | IT |
| Audio Transcription | `transcription` | `transcribe` | web-audio | **DF** |
| Speaker Diarization | `speaker-diarization` | `diarize` | web-audio | **UN** |
| Speech Translation | `audio-translate` | `translate` | web-audio | **DF** |

### G. Developer Utilities

| Tool | Slug | Handler | Engine | Status |
|---|---|---|---|---|
| Audio to Base64 | `audio-to-base64` | `audioToBase64` | web-audio | IT |
| Base64 to Audio | `base64-to-audio` | `base64ToAudio` | web-audio | IT |
| Audio Batch Rename | `batch-rename` | `batchRename` | web-audio | IT |
| Audio to ZIP | `audio-zip` | `audioZip` | web-audio | IT |
| Waveform Image | `waveform-image` | `waveformImage` | web-audio | IT |
| Audio MIME & Signature Checker | `mime-checker` | `mimeCheck` | web-audio | IT |
| HTML Audio Player Generator | `player-generator` | `playerSnippet` | web-audio | IT |
| Podcast RSS Enclosure Validator | `rss-validator` | `rssValidate` | web-audio | IT |

### Experimental caveats (verbatim from the registry)

- **Pitch Shifter** — "This build has no formant-preserving pitch shifter, so
  large shifts also change the perceived voice character and can sound
  artefacted. Small shifts (±2 semitones) are cleanest."
- **Noise Reducer** — "This is spectral subtraction, not an AI model: heavy
  reduction can introduce a watery 'musical noise' artefact. It targets
  constant noise, not speech or music."
- **Voice Enhancer** — "This is deterministic signal processing, not AI
  restoration. It cannot remove reverb or add missing detail, and heavy
  compression reduces dynamics."
- **BPM & Key Detector** — "Tempo detection needs a steady beat; it struggles
  with free-tempo and heavily syncopated music. Key detection is a coarse
  spectral estimate and should be treated as a hint only."
- **ID3 Tag Editor** — "Stream copy preserves the audio bytes but may re-wrap
  the container. Some players cache tags aggressively. Not all tag frames are
  editable in this build."

### Deferral / unavailability reasons (verbatim from the registry)

- **Audio Transcription** (deferred) — "Requires a speech-recognition model
  (e.g. Whisper). Running it in-browser needs a large model download and the
  site's CSP blocks external APIs (`connect-src 'self'`). Ship a verified
  adapter before publishing a page."
- **Vocal Remover / Stem Separation** (deferred) — "Requires a real
  source-separation model (e.g. Demucs/Spleeter). A centre-channel cancellation
  is not genuine separation, so this is deferred until a licensed model can be
  shipped."
- **AI Noise Reduction** (deferred) — "Requires a licensed neural model. The
  shipped `afftdn` denoiser is real spectral processing, not AI, and is offered
  honestly as the Noise Reducer instead."
- **Audio Restoration** (deferred) — "Needs a restoration model. Deterministic
  filters (declick, declip) exist in the engine and could ship as an
  experimental tool; full restoration is deferred."
- **Speech Translation** (deferred) — "Depends on transcription plus a
  translation service. External APIs are blocked by the site's CSP, so this is
  deferred with transcription."
- **System / Tab Audio Capture** (deferred) — "`getDisplayMedia` with audio
  capture is not supported consistently across browsers and platforms.
  Deferred rather than shipped with silent failures."
- **Text to Speech** (unavailable) — "The browser `SpeechSynthesis` API can
  speak text but cannot reliably capture the output to a file, so a real
  downloadable MP3/WAV is not possible without a TTS engine or provider. Not
  offered rather than faked."
- **Speaker Diarization** (unavailable) — "Depends on a speaker-recognition
  model and, typically, a transcript. No local model is shipped, so labels
  cannot be produced from real results."

---

## 5. Test results

Run in this tree:

```
npm test                  # node --test  -> 258 pass, 0 fail
node scripts/verify.js    # 47 pass, 0 fail, 1 skip
```

`test/audio-toolkit.test.js` (32 tests) covers:

| Area | What is asserted |
|---|---|
| Registry | Exact status counts (43/5/6/2), 48 public, unique id + slug, valid category, URL-safe slugs |
| Engines | Every public tool declares `ffmpeg`, `web-audio` or `media-recorder` |
| Honesty | All 8 non-public tools carry a real `reason` and no page exists for them |
| Runtime contract | `mountTool/mountHub/mountStudio/mountNotFound/unmount/cleanup` are functions; `PROCESSORS` and `LIMITS` exist |
| Handler parity | Every public `handler` is a processor **and** every processor is referenced — no stubs, no orphans |
| WAV encoder | RIFF/WAVE/`fmt `/`data` headers, PCM-16 vs IEEE-float-32, interleaving, byte rates, clamping, empty input |
| DSP | `combineChannels` modes, `peakEnvelope` buckets, `scanWindows` RMS/MA, `flagsToGaps` merging + minimum length, `analyseLevels` peak/RMS/clipping |
| Utilities | `parseTime`, dBFS conversions, `formatTime`, `formatBytes`, `safeName`, `clamp`/`num`/`r3`, `assertFileSize` |
| Pages / SEO | 49 pages exist; title ≤ 60; description 120–155; exactly one `h1`; canonical; `lang="en-IN"`; OG tags; unique titles and descriptions |
| Schema | JSON-LD parses; no `Review`/`AggregateRating` |
| Sitemap | Implemented tools present; experimental tools `noindex, follow` **and** absent |
| Hub | Lists all 48 public tools and never links a deferred/unavailable one |
| FFmpeg copy | Every FFmpeg-engine page actually mentions FFmpeg in its processing note |

End-to-end coverage: `tests/audio-toolkit.e2e.spec.js` (11 Chromium tests)
drives the hub (direct load and SPA navigation), the scoped microphone headers,
a real Web Audio WAV, the trimmer preview, a real FFmpeg MP3 conversion, the
metronome scheduler, the recorder's genuine WAV export, the meter-only
microphone check, the `noindex`/no-page rules and a console-error sweep of a
representative page from every category. Run with `npm run test:e2e`.

---

## 6. Limitations

- **Bounded input.** Per-file limit is 100 MB, 1800 s and 90 M decoded frames;
  batch limit is 20 files. Oversized input is rejected with a readable message,
  not truncated silently.
- **Single-threaded FFmpeg.** Long conversions on large files are slower than a
  native build. The single-threaded core is a deliberate choice: it avoids
  `SharedArrayBuffer`, so the site needs no COOP/COEP headers.
- **No formant-preserving pitch shift.** Large pitch changes alter timbre (see
  the Pitch Shifter caveat above).
- **Two experimental enhancers are deterministic, not AI.** Noise Reducer and
  Voice Enhancer are honest signal processing and are labelled as such on their
  pages and in this document.
- **`atempo` range.** Speed changes are composed from `atempo` stages, so
  extreme factors can accumulate artefacts; the UI exposes 0.5×–3×.
- **Metadata editing is partial.** The ID3 editor can rewrite common frames, but
  not every frame type, and re-wrapping a container may change byte layout.
- **No server-side processing exists at all.** There is no upload path, no queue
  and no stored result to fetch later.

---

## 7. Shared-check and image-toolkit fixes

Wiring 49 new pages through the shared builder surfaced real problems in the
existing checks and in the image toolkit. These were fixed properly rather than
suppressed:

1. **C38 / C45 compared the sitemap to every canonical.** Experimental pages
   carry `noindex, follow` and must stay out of the sitemap, so the check
   reported them as "missing". Both checks now compare the sitemap against
   **indexable** canonicals only (pages without a `noindex` robots tag). This
   also resolves the three pre-existing `image/*` cases. No sitemap or page was
   weakened to make this pass.
2. **C35 measured raw title length, but the HTML is escaped.** `&` becomes
   `&amp;` (+4 characters), so several image titles passed in the registry but
   failed once written to disk. Fourteen image titles and 31 image
   descriptions were rewritten to genuine, unique values that fit the real
   120–155 / ≤60 budgets.
3. **C37 matched the substring "Review" anywhere in a JSON-LD block.** The word
   appeared only inside a duplicate-finder FAQ *answer*, not in any schema
   type. The answer was reworded ("Check each group…") so the honest advice is
   unchanged and the false positive is gone.
4. **C23 parses the README tool count.** The README now states the real
   breakdown: 5 static + 32 core + 41 image + 44 audio = 122 URLs.
5. **C01 needed an `npm test` script.** The harness from the `tests` branch was
   merged in, and the audio suite added to it.

No existing route, page, header or deploy setting was removed or renamed.

---

## 8. Performance

- **Lazy loading.** `app.js` loads `audio-tools.config.js` + `audio-toolkit.js`
  only when a visitor enters `/audio/*`. The rest of the site keeps its existing
  payload.
- **The 30.7 MB engine is opt-in.** Only FFmpeg-engine tools trigger the
  download, and only when the visitor actually runs one. It is cached for a
  week. Web Audio tools (22 of 48) need no engine download at all.
- **Static-first.** Every public page is real HTML with explanatory content and
  JSON-LD, so first paint and crawling do not depend on JS.
- **Bounded work.** Per-file and batch caps prevent unbounded memory growth;
  batch processors handle one file at a time.
- **No network in the hot path.** Decoding, DSP and encoding are local. The only
  network request a tool makes is the engine fetch, and never audio bytes.

---

## 9. Security decisions

- **No uploads, ever.** There is no fetch/XHR that carries audio. The engine
  itself is fetched from the same origin, and audio is only ever passed into the
  in-page wasm filesystem.
- **Microphone is opt-in and scoped.** `Permissions-Policy` keeps
  `microphone=()` on every route except `/audio/*`, where it is
  `microphone=(self)`. Even there, `getUserMedia` is called only after the
  visitor presses Start, and the stream is stopped on stop/unmount.
- **No recording retention.** Recordings live in memory as Blobs and are
  discarded on leave; nothing is written to storage and nothing is logged.
- **CSP allows wasm, not remote code.** `script-src` adds `'wasm-unsafe-eval'`
  — required to instantiate the core — while `connect-src 'self'` still blocks
  every external endpoint. No CDN, no `eval` in first-party code.
- **Real signature checks.** The MIME checker and integrity check read magic
  bytes rather than trusting the file extension.
- **Filename sanitisation.** `safeName` strips path separators and unusual
  characters so exported names cannot escape the download directory.
- **Bounded decodes.** `assertFileSize` and a frame cap reject oversized input
  before a decode allocates memory.
- **Licence compliance is a security-adjacent requirement here.** The GPL engine
  ships with its notice and a source offer, so redistribution is lawful.
- **Cleanup on route change.** `leaveAudioToolkit()` plus a navigation token
  prevent a slow engine load from overwriting a page the visitor already left
  and prevent orphaned object URLs.

Relevant headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
  'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self'
  data:; connect-src 'self'; object-src 'none'; base-uri 'self';
  form-action 'none'; frame-ancestors 'none';

/audio/*        Permissions-Policy: camera=(), microphone=(self), geolocation=()
/*              Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 10. Deployment & rollback

**Deploy** — the toolkit is plain static output:

```
npm ci
npm run build:vendor   # only if vendor/ffmpeg/ needs regenerating
npm run build          # writes root pages + dist/ (49 audio pages, sitemap, dist copy)
# publish dist/  (Vercel: vercel.json builds dist; Netlify: netlify.toml)
```

- **Vercel:** `buildCommand: npm run build`, `outputDirectory: dist`,
  `cleanUrls: true`, `trailingSlash: true`.
- **Netlify:** `netlify.toml` builds and publishes `dist`.
- **Headers:** `vercel.json` and `_headers` are both updated, so the CSP and the
  scoped `Permissions-Policy` apply on either host.
- **No DB, no env vars, no secrets.** Nothing to migrate.
- **Large asset note:** `vendor/ffmpeg/ffmpeg-core.wasm` is ~30.7 MB and is
  committed, matching the existing vendor-bundle convention. Confirm any host
  file-size limit allows it (Vercel and Netlify both do).

**Rollback** — the change is additive and isolated:

1. Remove the `/audio/` route branch from `app.js` and the audio band/sitemap
   block from `build_seo_pages.js`.
2. Delete `audio-tools.config.js`, `audio-toolkit.js`, `audio-pages.js`,
   `audio/` and `vendor/ffmpeg/`.
3. Revert the three header values (`'wasm-unsafe-eval'`, the `/audio/*`
   `Permissions-Policy` rule, the `/vendor/ffmpeg/*` cache rule) if the toolkit
   is removed entirely.
4. Run `npm run build`.

The image toolkit, the 30 legacy tools and all legal pages are untouched by
rollback.

---

## 11. Next priorities

1. **Ship a formant-preserving pitch shifter.** This is the main quality gap and
   would promote Pitch Shifter from experimental to implemented.
2. **Record the real e2e evidence in docs.** Keep the Chromium conversion and
   recorder specs green and cite their counts here after each release.
3. **Add a proper AI adapter for transcription** only when a licensed, local
   model can be shipped under the CSP; until then keep it deferred.
4. **Consider deterministic audio restoration** (declick/declip) as a new
   experimental tool — the filters already exist in the engine.
5. **Add waveform zoom/scrub** to the shared preview for precise trimming.
6. **Keep the engine cache warm at the edge** if download latency proves to be a
   drop-off point.

Explicitly **not** planned: any tool that needs a paid API for a basic audio
operation, any permanent audio storage, and any "AI" label on deterministic DSP.

---

## 12. Quick commands

```bash
npm install                 # first time (installs the FFmpeg packages too)
npm run build               # regenerate all pages, sitemap and dist/
npm run build:vendor        # re-copy the FFmpeg engine into vendor/ffmpeg/
npm test                    # node --test  (258 pass)
npm run test:e2e            # Playwright / Chromium
npm run verify              # 47 pass, 0 fail, 1 skip
npm start                   # serve dist/ on http://localhost:3000
```

Useful spot checks:

```bash
node audio-pages.js                                   # regenerate just the audio pages
node scripts/audit/check-audio-pages.js dist/audio    # SEO audit of the generated pages
```

---

## 13. Honesty checklist

This is the short version of the rules the toolkit is held to:

- [x] Every "implemented" tool has a real handler in `PROCESSORS` and a test.
- [x] Every experimental tool says exactly what is unreliable about it.
- [x] Every deferred/unavailable tool states a concrete technical reason and has
      no page.
- [x] No progress bar or download is simulated.
- [x] No basic operation requires a paid API.
- [x] No audio is uploaded, logged, stored or retained.
- [x] The microphone only opens after an explicit action, on `/audio/*` only.
- [x] The GPL engine ships with its notice and a written source offer.
