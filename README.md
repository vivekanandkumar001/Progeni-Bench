# Progeni Bench - Production README

Progeni Bench is a Progeni project delivering fast, zero-bloat browser utilities with 100% private client-side processing.

## 🚀 Quick Start

### Local Development
```bash
# Build static pages and distribution package
npm run build

# Rebuild same-origin vendor bundles (only when vendor deps change)
npm run build:vendor

# Serve the dist folder
npm start
# Or: python3 -m http.server 3000 --directory dist
```

### Deployment

#### Netlify
1. Connect repository or upload `dist/` folder
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Custom domain: `bench.progeni.live` (HTTPS automatic)

#### Vercel
1. Connect repository
2. `vercel.json` has `cleanUrls: true` enabled
3. Set custom domain: `bench.progeni.live` (HTTPS automatic)

#### Cloudflare Pages
1. Build command: `npm run build`
2. Build output directory: `dist`
3. Configure custom domain: `bench.progeni.live`

## 📦 What's Included

The `dist/` folder contains everything needed for static production hosting:

- **index.html** - Single-page app root with fast category search
- **app.js** - Client-side router + 30 tool processors (zero dependencies)
- **utils.js** - Pure utility helper module (XSS escaping, CSV parsing, SRT parser)
- **site.config.js** - Single source of truth for site configuration & brand model
- **styles.css** - Custom responsive styling and CSS variables
- **_headers** - Strict Content-Security-Policy & security headers
- **_redirects** - Netlify 404 handler
- **manifest.webmanifest** - PWA configuration
- **sitemap.xml** - 120 crawlable URLs for `bench.progeni.live` (5 core + 30 legacy tools + 41 image + 44 audio; experimental pages are `noindex` and excluded)
- **robots.txt** - Crawler directives
- **about/index.html** - About page
- **privacy/index.html** - Privacy policy
- **terms/index.html** - Terms of service
- **contact/index.html** - Contact & support page
- **tools/** - 30 pre-rendered static tool pages with Schema.org JSON-LD
- **image/** - 44 pre-rendered Bench Image Toolkit pages (hub, studio, and 39 tools + experimental pages)
- **audio/** - 49 pre-rendered Bench Audio Toolkit pages (hub and 48 public tools)
- **image-tools.config.js** - Image toolkit registry (source of truth for tools, SEO and status)
- **image-toolkit.js** - Image toolkit runtime (pure byte core + browser engine + UI mounts)
- **audio-tools.config.js** - Audio toolkit registry (source of truth for tools, SEO and status)
- **audio-toolkit.js** - Audio toolkit runtime (Web Audio + FFmpeg.wasm processors + UI mounts)
- **vendor/** - Same-origin third-party bundles (QR, barcode, GIF, TIFF) — no CDN
- **vendor/ffmpeg/** - Same-origin FFmpeg.wasm engine (GPL, `NOTICE.txt` included) — no CDN
- **assets/** - favicon.svg
- **vercel.json** - Vercel clean URL routing configuration

## 🖼️ Bench Image Toolkit (63 tools · 42 public)

A registry-driven image workspace at `/image/` with its own Studio and one
stable page per tool. Everything runs locally in your browser — no uploads, no
account, no watermark.

- **Hub:** `/image/` · **Batch Studio:** `/image/studio/` · **Tools:** `/image/<slug>/`
- **39 implemented**, **3 experimental** (`noindex, follow`), **10 deferred**,
  **11 unavailable AI tools** listed honestly with no page and no fake output.
- Categories: Compress, Resize & Prepare, Convert, Edit & Design, Documents &
  Scan, Metadata & Privacy, Create & Developer, Animation & Batch, Diagnostics,
  AI Processing.
- Highlights: compressor with real before/after sizes, resize/crop with
  app-preset starting points, format converter, EXIF/GPS remover, metadata
  viewer, hash + duplicate finder, favicon/OG generators, QR create + read,
  barcode generator, GIF Studio, sprite sheets, batch rename, scan cleanup and
  corruption recovery.
- Full architecture, inventory, per-tool status, security decisions and
  rollback notes: see **[IMAGE-TOOLKIT.md](./IMAGE-TOOLKIT.md)**.

## 🔊 Bench Audio Toolkit (56 tools · 48 public)

A registry-driven audio workspace at `/audio/` with one stable page per tool.
Everything runs locally in your browser — audio is never uploaded and never
stored.

- **Hub:** `/audio/` · **Tools:** `/audio/<slug>/`
- **43 implemented**, **5 experimental** (`noindex, follow`), **6 deferred**,
  **2 unavailable** AI features listed honestly with no page and no fake output.
- Categories: Convert & Compress, Cut/Join & Edit, Clean & Enhance,
  Record & Microphone, Music & Sound, Metadata & Diagnostics, Developer
  Utilities.
- Engines: **24 FFmpeg.wasm** (codec conversion + complex filters),
  **22 Web Audio API** (decode/analysis/DSP/WAV export), **2 MediaRecorder**
  (microphone capture). No cloud APIs.
- Highlights: format converter, compressor with real before/after sizes,
  trimmer, joiner, splitter, fade/reverse/speed/pitch, silence remover,
  loudness normaliser (EBU R128), noise reducer, EQ, voice recorder with mic
  meter, tone/noise generators, metronome, BPM/spectrogram, waveform image,
  ID3/metadata editor and MIME/duplicate checks.
- Microphone access is scoped to `/audio/*` via `Permissions-Policy`
  (`microphone=(self)`); every other route keeps `microphone=()`.
- Full architecture, inventory, per-tool status, security decisions and
  rollback notes: see **[AUDIO-TOOLKIT.md](./AUDIO-TOOLKIT.md)**.

> **Tests:** this branch ships the full harness. Run `npm test` for the Node
> unit suite and `npm run test:e2e` for the Chromium end-to-end suite. See §13
> of `IMAGE-TOOLKIT.md` and §13 of `AUDIO-TOOLKIT.md` for details.

Regenerate vendor bundles with `npm run build:vendor`.


## 🛠️ Available Tools (30 Total)

### Files & Data
- Chrome Bookmark Cleaner
- Calendar Cleaner (.ics)
- Timetable → Calendar (.ics)
- Bookmark → Reading List
- CSV Column Splitter
- CSV Date Normalizer
- Contact CSV Deduplicator
- vCard Split / Merge

### Creative & Craft
- Sticker Sheet Maker (US Letter / A4 / 4x6 / A3)
- Print Layout Optimizer
- Cross-Stitch Pattern Maker (DMC Palettes)
- Embroidery Pattern Simplifier
- Diamond Painting Pattern Maker
- SVG Cleanup & Minifier

### Audio & Video
- Chapter Timestamp Formatter
- Podcast Silence Map
- Video Thumbnail Contact Sheet
- Video Safe-Zone Checker (TikTok / Reels / Shorts)
- Subtitle Reading-Speed Checker
- Subtitle Line-Break Fixer

### Printing & Merchandise
- Photo Print Border Calculator
- T-Shirt Print Mirror
- Iron-on Transfer Sheet Maker
- Avery 5160 / Label Maker

### Photos & Images
- Wallpaper Batch Cropper
- Panorama Carousel Splitter
- Photo Timeline Builder (by file date)
- Family Photo Date Organizer (by file date)
- Photo Duplicate Finder (SHA-256)
- Photo Best-Shot Finder

## 🔒 Privacy & Security

- **100% Client-Side Processing** - Files never leave your browser
- **Zero Server Uploads** - All computations happen locally via HTML5 APIs
- **Zero Third-Party Tracking** - No remote analytics, tracking cookies, or tracking scripts
- **Strict CSP Headers** - Frame-ancestor and XSS protection enabled
- **No Retention** - Image toolkit previews use temporary object URLs that are revoked on leave