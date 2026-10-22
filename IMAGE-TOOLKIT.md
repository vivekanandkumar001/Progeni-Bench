# Bench Image Toolkit — Implementation Report

> **Test-suite location notice.** The `main` branch ships *without* a test
> harness so the deployed tree stays lean: `test/`, `tests/`,
> `playwright.config.js` and the `@playwright/test` dev dependency were removed
> from `main` before the Vercel deploy. The harness now lives on the **`tests`
> branch** (pushed to `origin/tests`), restored from git history and extended
> with new image-toolkit coverage.
>
> On the `tests` branch, verified green at commit `8c43605`:
>
> - `npm test` (**226 pass, 0 fail**) — 13 legacy unit suites + 19 image-toolkit unit tests
> - `npx playwright test --project=chromium` (**26 pass, 0 fail**) — 17 legacy e2e + 9 image-toolkit e2e
>
> The counts in §5 and §12 reflect that branch. Statuses in §4 that read
> "Implemented and tested" are backed by these tests. See §13 for how to
> re-create the branch if needed.

Ship-ready reference for the `/image/*` image toolkit added to Progeni Bench.
It covers architecture, changed files, the full tool registry, per-tool status,
test evidence, known limitations, security decisions, deployment/rollback and a
prioritised next-step list.

- Canonical host: `https://bench.progeni.live`
- Registry source of truth: `image-tools.config.js`
- Runtime: `image-toolkit.js` (+ 6 same-origin vendor bundles in `vendor/`)
- Page generator: `image-pages.js` (driven by `build_seo_pages.js`)
- Routing: `app.js` (lazy `/image/*` mount)

---

## 1. Architecture summary

The toolkit is **the same static site** — no second frontend, no new backend,
no database. It reuses the existing shell (`index.html`, `app.js`,
`styles.css`, `site.config.js`, Netlify/Vercel/Cloudflare config) and adds:

```
image-tools.config.js   typed-ish registry (63 entries) — single source of truth
image-toolkit.js        pure byte-level core + browser engine + UI mounts
image-pages.js          static HTML generator for /image/, /image/studio/, /image/<slug>/
vendor/*.min.js         same-origin third-party bundles (CSP-safe, no CDN)
scripts/build-vendor.js esbuild pipeline that (re)builds the vendor bundles
image/**                generated static pages (44 files)
```

**Data flow (client-side, per tool):**

```
<File>  ──sniff real signature──▶  bounded decode (ImageBitmap/Canvas)
        ──▶  processor(ctx)  ──▶  outputs[] (Blob) ──▶ object URL ──▶ download
```

Key properties:

- **Registry-driven.** Every tool's page, canonical URL, JSON-LD, FAQ, sitemap
  entry, `noindex` flag and hub listing are derived from one array in
  `image-tools.config.js`. Nothing is hand-duplicated.
- **Two-layer runtime.** `image-toolkit.js` is a UMD module: the *pure core*
  (byte sniffing, dimension parsing, EXIF/metadata readers, ZIP/ICO/BMP/PDF
  writers, palette + perceptual hashes, geometry, SHA-256) has **no DOM at
  require time**, so `node --test` exercises it directly. The *browser engine*
  (Canvas/`ImageBitmap` decoders, 41 processors, hub/studio/tool UI mounts) runs
  only in the page.
- **Honest status.** 39 tools ship with a real handler and a generated page.
  3 are experimental (`noindex, follow`). 10 are **deferred** and 11 are
  **unavailable** — they get **no page** and are listed with an explicit reason,
  never a fake progress bar or a simulated result.
- **No Web Workers in the toolkit.** Processing is sequential on the main
  thread. Registry copy that previously implied otherwise was corrected
  (see §9). (The unrelated legacy `photo-batch-studio.js` tool still uses its
  own blob worker; that is untouched.)

---

## 2. Changed / added files and dependencies

### New source files

| File | Purpose |
|---|---|
| `image-tools.config.js` | Registry: `CATEGORIES`, `TOOLS`, `PRESETS`, `LIMITS`, helpers |
| `image-toolkit.js` | Pure core + browser engine + `mountHub`/`mountStudio`/`mountTool`/`unmount` |
| `image-pages.js` | Generates hub, studio and per-tool static pages + sitemap entries |
| `scripts/build-vendor.js` | esbuild bundler for vendor libs |
| `scripts/vendor-entries/*.js` | 6 entry shims (qrcode, jsqr, gifenc, gifuct, utif, jsbarcode) |
| `test/image-toolkit.test.js` | Registry invariants, page/SEO, and core unit tests |
| `tests/image-toolkit.e2e.spec.js` | Chromium e2e for hub, studio, compressor, vendor tools, 28-tool sweep |
| `vendor/*.min.js` | Generated same-origin bundles (committed) |
| `image/**` | Generated static pages (committed) |

### Modified files

| File | Change |
|---|---|
| `build_seo_pages.js` | Calls `image-pages.js`; adds `/image/` nav link, homepage image band, copies registry/runtime/vendor into `dist`, extends sitemap with 41 image URLs |
| `app.js` | Lazy `/image/*` routing with navigation tokens, `leaveImageToolkit()` cleanup, static 404 guard, full-page nav for legal/info links |
| `styles.css` | `itk-*` responsive toolkit styles + homepage `.image-band` |
| `package.json` | Adds `build:vendor` script and 6 runtime deps + `esbuild` dev dep |
| `sitemap.xml` | Regenerated (76 URLs total, 41 image URLs) |
| `index.html`, `about|privacy|terms|contact/index.html`, `tools/**/index.html`, `404.html` | Regenerated through the shared builder |
| `tests/e2e.spec.js` | 5 stale legacy assertions brought back in line with current markup/behaviour (see §7) |

### Dependencies added

Runtime (vendored, same-origin — never loaded from a CDN):

| Package | Version | Used by |
|---|---|---|
| `qrcode` | 1.5.4 | QR Code Generator |
| `jsqr` | 1.4.0 | QR Code Reader |
| `gifenc` | 1.0.3 | GIF Studio (create) |
| `gifuct-js` | 2.1.2 | GIF Studio (extract) |
| `utif` | 3.1.0 | TIFF decode/encode |
| `jsbarcode` | 3.12.1 | Barcode Generator |

Dev: `esbuild` 0.25.0 (vendor bundling only; not shipped to the browser).

Vendor bundle sizes (same-origin, lazy-loaded per tool):

| Bundle | Size |
|---|---|
| `qrcode.min.js` | 24.3 KB |
| `jsqr.min.js` | 127.9 KB |
| `gifenc.min.js` | 9.6 KB |
| `gifuct.min.js` | 7.5 KB |
| `utif.min.js` | 83.6 KB |
| `jsbarcode.min.js` | 66.4 KB |

Regenerate with `npm run build:vendor`.

---

## 3. Registry & route inventory

**Route shape**

| Route | Meaning |
|---|---|
| `/image/` | Toolkit hub — category grid, working tools, honest unavailable list |
| `/image/studio/` | Image Studio — multi-file batch recipe (resize + convert + rename + ZIP) |
| `/image/<slug>/` | One page per implemented/experimental tool (`slug` = registry `id`) |
| `/tools/*` | Existing 30-tool legacy site — unchanged |

Pages are generated for the **42 public tools** (39 implemented → indexed;
3 experimental → `noindex, follow`, excluded from the sitemap). Deferred and
unavailable tools deliberately have **no** URL.

**Sitemap:** 76 URLs total = 35 legacy + 41 image URLs (`/image/`, `/image/studio/`
and the 39 implemented tool pages).

**Registry totals:** 63 tools · 42 public · 39 implemented · 3 experimental ·
10 deferred · 11 unavailable.

---

## 4. Per-tool status

Status vocabulary: **Implemented and tested** · **Implemented with limitations** ·
**Experimental** · **Deferred** · **Blocked**.

### A. Compress & Optimize

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Image Compressor | `compress` | Implemented and tested | `compress` |
| Compress to Target Size | `compress-to-size` | Implemented with limitations | `targetSize` |

### B. Resize & Prepare

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Resize Image | `resize` | Implemented and tested | `resize` |
| Crop Image | `crop` | Implemented and tested | `crop` |
| Application Photo & Signature Presets | `application-photo` | Implemented with limitations | `presetCrop` |
| Social Media & YouTube Image Sizes | `social-resize` | Implemented with limitations | `presetCrop` |
| DPI Inspector & Setter | `dpi` | Implemented and tested | `dpi` |
| Photo & Signature Composition | `photo-signature` | **Experimental** | `composePhotoSignature` |

### C. Convert

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Image Converter | `convert` | Implemented and tested | `convert` |
| Image to PDF | `image-to-pdf` | Implemented with limitations | `imageToPdf` |
| Base64 & Data URI Converter | `base64` | Implemented and tested | `base64` |
| PDF to Image | `pdf-to-image` | **Deferred** | — |
| HEIC / HEIF Converter | `heic-convert` | **Deferred** | — |

### D. Edit & Design

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Rotate, Flip & Straighten | `transform` | Implemented and tested | `transform` |
| Colour Adjustments | `adjust` | Implemented and tested | `adjust` |
| Blur, Pixelate & Redact | `blur-redact` | Implemented with limitations | `redact` |
| Text, Captions & Annotations | `annotate` | Implemented with limitations | `annotate` |
| Border, Padding & Rounded Corners | `border-padding` | Implemented and tested | `border` |
| Visible Watermark | `watermark` | Implemented with limitations | `watermark` |
| Meme Generator | `meme` | Implemented and tested | `meme` |
| Collage Maker | `collage` | Implemented and tested | `collage` |
| Image Splitter & Grid Cutter | `splitter` | Implemented and tested | `split` |
| Side-by-Side Image Merge | `merge` | Implemented and tested | `merge` |
| Image Compare & Similarity | `compare` | Implemented and tested | `compare` |
| Product Photo Shadow & Background | `product-shadow` | Implemented with limitations | `productShadow` |

### E. Documents & Scan

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Scan Cleanup & Deskew | `scan-cleanup` | **Experimental** | `scanCleanup` |
| Image to Text OCR | `ocr` | **Deferred** | — |
| Searchable PDF | `searchable-pdf` | **Deferred** | — |

### F. Metadata & Privacy

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Metadata & EXIF Viewer | `metadata-viewer` | Implemented and tested | `inspect` |
| EXIF & GPS Remover | `strip-metadata` | Implemented and tested | `stripMetadata` |
| Image Hash Generator | `image-hash` | Implemented and tested | `hash` |
| Duplicate & Similar Photo Finder | `duplicate-finder` | Implemented with limitations | `dedupe` |
| Colour Palette & Histogram | `palette` | Implemented and tested | `palette` |
| CMYK / ICC Conversion | `cmyk` | **Deferred** | — |

### G. Create & Developer

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Favicon & App Icon Generator | `favicon` | Implemented and tested | `favicon` |
| Open Graph Image Generator | `og-image` | Implemented and tested | `ogImage` |
| QR Code Generator | `qr-code` | Implemented and tested | `qrCode` |
| QR Code Reader | `qr-decode` | Implemented and tested | `qrDecode` |
| Barcode Generator | `barcode` | Implemented and tested | `barcode` |
| SVG Optimizer & Validator | `svg-optimizer` | Implemented with limitations | `svgOptimize` |
| Image Placeholder Generator | `placeholder` | Implemented and tested | `placeholder` |
| Responsive Image srcset Generator | `srcset` | Implemented and tested | `srcset` |
| Barcode Reader | `barcode-read` | **Deferred** | — |
| HTML to Image | `html-to-image` | **Deferred** | — |
| Raster to SVG Vector Trace | `vector-trace` | **Deferred** | — |

### H. Animation & Batch

| Tool | Slug | Status | Handler |
|---|---|---|---|
| GIF Studio: Create & Extract | `gif-studio` | Implemented with limitations | `gif` |
| Sprite Sheet Generator | `sprite-sheet` | Implemented and tested | `spriteSheet` |
| Batch Rename & Export | `batch-rename` | Implemented and tested | `batchRename` |
| Video to GIF | `video-to-gif` | **Deferred** | — |

### I. Diagnostics & Recovery

| Tool | Slug | Status | Handler |
|---|---|---|---|
| Image Inspector & Diagnostics | `inspection` | Implemented and tested | `diagnose` |
| Corruption Recovery (Best Effort) | `recovery` | **Experimental** | `recover` |
| Image URL Inspector | `url-inspector` | **Deferred** | — |

### J. AI Processing (all **unavailable** — no page, no fake output)

`background-remover`, `background-replace`, `object-removal`, `upscale`,
`denoise-restore`, `colorize`, `low-light`, `portrait-blur`, `product-enhance`,
`face-enhance`, `caption`.

Every one carries the same honest reason: *"No inference provider is
configured. Bench does not simulate AI results… The provider adapter interface
is present so a vetted local or hosted model can be added later."*

### Deferral reasons (verbatim from the registry)

| Tool | Reason (abridged) |
|---|---|
| `ocr` | Tesseract.js + English model adds ~10–15 MB and needs load/cancel/accuracy testing |
| `searchable-pdf` | Depends on the OCR engine and a PDF text-layer writer |
| `pdf-to-image` | Needs PDF.js or a server engine; not justified for one tool |
| `heic-convert` | No HEIC decoder; libheif adds a large WASM payload |
| `video-to-gif` | Needs video seeking/frame extraction; image GIF tools ship instead |
| `barcode-read` | Bundled decoder is QR-only; no tested 1D decoder added |
| `html-to-image` | Needs an HTML/CSS rasteriser with strict sanitisation |
| `vector-trace` | Bench will not embed a raster in SVG and call it vector tracing |
| `cmyk` | Canvas is sRGB; correct CMYK needs a colour-management engine |
| `url-inspector` | Remote fetch would create SSRF/CORS risk; no isolated fetch service |

---

## 5. Test results (on the `tests` branch)

> The suites live on the **`tests` branch** (`origin/tests`), not on `main`.
> Results below were verified at commit `8c43605` and **are** reproducible by
> checking out that branch and running the commands shown.

All commands from the repo root on Windows/PowerShell; `npm run build` must run
first because the page/SEO tests read generated files:

| Suite | Command | Result |
|---|---|---|
| Unit / Node (`node --test`) | `npm test` | **226 pass, 0 fail** |
| Image toolkit e2e | `npx playwright test tests/image-toolkit.e2e.spec.js --project=chromium` | **9 pass, 0 fail** |
| Full Chromium e2e | `npx playwright test --project=chromium` | **26 pass, 0 fail** |

The 226 unit tests = 13 legacy suites + `test/image-toolkit.test.js` (19).
The 26 e2e tests = `tests/e2e.spec.js` (17) + `tests/image-toolkit.e2e.spec.js` (9).

**Unit coverage highlights** (`test/image-toolkit.test.js`): registry
consistency and counts; every public tool has a real processor **and** a
generated page; every processor is used by at least one entry; hub/studio/tool
canonicals; JSON-LD parses and contains `WebApplication` + breadcrumbs; sitemap
contains only hub/studio/implemented with no duplicates; byte-signature sniffing;
PNG/GIF/BMP/SVG dimension parsing; filename sanitisation (traversal + Windows
reserved names); SVG sanitiser; Base64 validation; ZIP/ICO/BMP/PDF writer
structure; PNG/JPEG DPI writers; palette/perceptual hashes; geometry; byte
inspection; SHA-256.

**e2e coverage highlights** (`tests/image-toolkit.e2e.spec.js`): hub loads the
real registry + honest unavailable list; SPA navigation mounts the toolkit with
no reload; compressor produces a real downloadable blob and the toolkit container
is gone after leaving; studio batch recipe exports every upload; QR generator
lazy-loads its same-origin bundle and renders; QR reader decodes a locally
generated code; **28 representative implemented tools produce real outputs with
default settings**; generator tools (no source file) work; experimental pages are
`noindex` and unavailable pages do not exist.

---

## 6. Limitations

- **Main-thread processing.** Large batches block the UI while a file is
  processed. Limits (`50 MB` / `40 MP` per file, `30` files, `160 MP` batch,
  `40` PDF pages) keep this bounded. **No Web Workers**, by design, in the
  toolkit.
- **Canvas re-encoding drops metadata.** Compress/convert/resize remove EXIF,
  GPS, ICC and other metadata via Canvas — usually desirable, but camera
  settings cannot be preserved on those paths. `strip-metadata` and
  `metadata-viewer` handle this explicitly.
- **Format-dependent behaviour.** AVIF encode/decode depends on browser
  support; PNG output is lossless so a quality slider has no effect on size;
  CMYK/ICC is unavailable (see §4).
- **Presets are starting points, not guarantees.** Government/visa and
  social/YouTube presets are configurable dimensions with explicit
  non-guarantee disclaimers. They do not validate against any authority's
  current rules.
- **AI tools are unavailable.** No local model and no funded hosted endpoint;
  results are never simulated.
- **OCR, searchable PDF, PDF→image, HEIC, video→GIF, barcode reading,
  HTML→image, vector trace, URL inspection** are deferred with reasons in §4.
- **Perceptual dedupe / compare** is aHash/dHash Hamming distance — fast and
  private, but not a trained similarity model; very similar images may be
  grouped or missed depending on the threshold.
- **`svg-optimizer`** validates and sanitises SVG; it is not a full
  minifier/optimiser equivalent to SVGO.
- **No live deployment verification** was performed in this work; the
  canonical host is asserted in HTML/metadata and covered by tests only.

---

## 7. Legacy test fix-ups (no production behaviour changed)

Five pre-existing `tests/e2e.spec.js` assertions had gone stale against the
current markup. They were corrected, **not** the app:

| Test | Was | Now |
|---|---|---|
| E02 | Clicked `nav a[href*="/about"]` and expected no reload | Legal/info pages are intentionally full page loads; the test now clicks a real SPA tool link |
| E08 | Expected 3 panorama tiles from a 300×100 source | A 300×100 source can only yield **2** square tiles; asserts the real count and the notice text |
| E10 | Expected `#result` (retired with the old silence-map tool) | Asserts `#med-stats` / `#med-status` from the current media studio |
| E11 | Fixed h1 string that no longer matches | Asserts the current brand h1 |
| REG studio | Strict-mode violation from `.studio, #studio, .drop` | Uses `.or(...).first()` on `#studio` / `.drop` |

A temporary probe confirmed E08/E10 tools run **with zero console errors** and
produce correct output; only the selectors were wrong.

---

## 8. Performance

- **Lazy loading.** `app.js` loads `image-tools.config.js` + `image-toolkit.js`
  only when a visitor enters `/image/*`. The rest of the site keeps its existing
  small payload.
- **Vendor bundles are per-tool and lazy.** QR/barcode/GIF/TIFF bundles load on
  demand inside the tool that needs them; nothing else pays for them.
- **Static-first.** Every public page is real HTML with `noscript` content and
  JSON-LD, so first paint and crawling do not depend on JS.
- **Bounded work.** Per-file byte/pixel/dimension caps plus batch caps prevent
  unbounded memory growth. Batch processors stream one file at a time.
- **Measured floors.** Full Chromium suite: 26 tests / 21.1 s. The 28-tool
  sweep is the slowest single test at ~7–8 s (it genuinely renders every tool).
- **No network in the hot path.** Decoding, editing and encoding are local; the
  only network traffic for a tool run is none at all.

---

## 9. Security decisions

- **Real type sniffing.** Files are identified by magic bytes
  (`sniffFormat`), never by extension or `File.type`, so a `.png` that is really
  an SVG or HTML is treated as what it is.
- **Decompression-bomb guards.** Per-file `maxFileBytes` (50 MB),
  `maxPixels` (40 MP), `maxDimension` (12 000 px) and `maxBatchPixels`
  (160 MP) reject oversized input before decode.
- **SVG sanitisation.** `sanitizeSvg` removes `<script>`, `<foreignObject>`,
  `on*` handlers, `javascript:`/`data:` links and `<style>` blocks before any
  render or export.
- **Filename sanitisation.** `safeName` strips path traversal and Windows
  reserved names, so exported names cannot escape the download directory.
- **No SSRF surface.** No tool fetches remote URLs. `url-inspector` is
  intentionally unavailable precisely to avoid an SSRF/CORS surface.
- **No secret or log leakage.** No analytics, no remote logging, no API keys in
  the client. Errors render as user-facing text only. `connect-src 'self'`
  keeps any accidental fetch same-origin.
- **No retention.** Files are processed in memory and turned into object URLs;
  `unmount()` / `leaveImageToolkit()` revoke preview object URLs when the
  visitor leaves a tool. Nothing is stored.
- **CSP-safe assets.** All new JS is same-origin (`vendor/` bundles) or inline
  under the existing `script-src 'self' 'unsafe-inline'`. No CDN, no `eval`, no
  `new Function`. Vendor code is built from pinned npm versions with esbuild.
- **Cleanup on route change.** The `leaveImageToolkit()` call in `route()` plus
  the navigation-token guard prevents a slow toolkit load from overwriting a
  page the visitor already left, and prevents orphaned object URLs.

Existing CSP (unchanged, supports the toolkit):

```
default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:;
style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:;
media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none';
```

**Copy correction.** Earlier registry copy implied the toolkit used Web Worker
APIs ("…using Canvas, File and Web Worker APIs" and "batch compression uses two
workers"). Neither was true; both were corrected to describe sequential
main-thread processing, and the pages were rebuilt. No Web Worker is created by
`image-toolkit.js`.

---

## 10. Deployment & rollback

**Deploy** — the toolkit is plain static output:

```
npm ci
npm run build:vendor   # only if vendor/ needs regenerating
npm run build          # writes root pages + dist/ (44 image pages, sitemap, dist copy)
# publish dist/  (Netlify: netlify.toml already builds+publishes dist)
```

- **Netlify:** `netlify.toml` → `command = "npm run build"`, `publish = "dist"`.
- **Vercel:** `vercel.json` → `buildCommand`, `cleanUrls`, `trailingSlash`,
  `outputDirectory: dist`, plus mirrored security headers.
- **Cloudflare Pages:** build `npm run build`, output `dist`.
- Custom domain `bench.progeni.live` (HTTPS automatic on all three).

**Rollback options**

1. **Asset rollback (fastest):** redeploy the previous `dist/` artifact. No DB,
   no migrations, no state to unwind.
2. **Source rollback:** `git revert` the toolkit commit(s) and rebuild. The
   registry/pages/runtime are additive; the only shared files touched are
   `app.js`, `build_seo_pages.js`, `styles.css`, `package.json` and generated
   HTML/sitemap.
3. **Feature-level kill switch:** remove the `<a href="/image/">Image toolkit</a>`
   nav link and the homepage image band in `build_seo_pages.js` and rebuild —
   `/image/*` pages keep working for existing links, or delete `image/` to 404
   them.
4. **Legacy site is isolated:** `/tools/*` and the 30-tool tests are untouched
   by design, so the original site is unaffected by a toolkit rollback.

---

## 11. Next priorities

1. **Move heavy batch processing off the main thread.** Introduce an opt-in
   Web Worker path (CSP already allows `worker-src 'self' blob:`) for
   compress/convert/resize batches, with a main-thread fallback, and *then*
   update registry copy honestly.
2. **Real OCR behind a bounded engine.** Evaluate a trimmed Tesseract.js build
   with an explicit load/cancel/accuracy test suite before promoting `ocr` and
   `searchable-pdf`.
3. **HEIC decode.** Ship `heic-convert` once a WASM decoder is vetted for size,
   speed and licence, or keep it deferred.
4. **Content-aware selection.** Replace threshold-only background selection in
   `product-shadow` / `blur-redact` with a local segmentation model, keeping the
   honest-labelling rule.
5. **Video → GIF.** Add bounded seeking/frame extraction for `video-to-gif`
   with strict duration/file caps.
6. **1D barcode reading.** Add a tested decoder (or keep `barcode-read`
   deferred rather than guess).
7. **AI adapter interface.** Flesh out the provider adapter so a vetted local or
   hosted model can be plugged in without changing registry contracts — and
   keep every AI tool `unavailable` until it genuinely runs.
8. **Performance budget + regression guard.** Add a measured bundle/JS budget
   assertion to CI so lazy-loading stays lazy.
9. **Optional: true colour management** for `cmyk` if a small ICC engine is
   ever justified.
10. **Live-deployment smoke test** of `/image/`, `/image/studio/` and a sample
    tool page against `bench.progeni.live` after the first deploy.

---

## 12. Quick commands

```bash
npm run build          # generate pages + dist
npm run build:vendor   # rebuild same-origin vendor bundles
npm start              # serve dist/ on :3000
# On the `tests` branch only:
npm test                        # node --test  (226 pass)
npm run test:e2e                # playwright  (26 pass, chromium)
```

## 13. The `tests` branch

`main` intentionally ships without a test harness so the deployed tree stays
lean. The full suite lives on the **`tests` branch**, pushed to `origin/tests`
(HEAD `8c43605`). It was restored from git history and extended with new
image-toolkit coverage.

```bash
# use the harness
git checkout tests
npm install                    # restores @playwright/test
npx playwright install chromium
npm run build                  # page/SEO tests read generated files
npm test                       # 226 pass
npx playwright test --project=chromium   # 26 pass
```

**What the branch adds beyond the legacy harness**

- `test/image-toolkit.test.js` (19 tests) — registry invariants, generated
  SEO/sitemap, and the pure byte core. Written against the runtime API:
  `sha256Hex` is **async**; `averageHash(rgba,w,h)` returns a 64-entry **bit
  array** (hex via `bitsToHex`); the deferral/unavailable text field is
  `reason`.
- `tests/image-toolkit.e2e.spec.js` (9 tests) — real browser coverage of the
  toolkit, including a 28-tool sweep. It drives single-file vs multi-file
  inputs off the input's real `multiple` attribute.

**If the branch is ever lost**, re-create it:

```bash
git checkout -b tests main
git checkout a3f2e19 -- test tests playwright.config.js   # legacy suite
# re-add test/image-toolkit.test.js and tests/image-toolkit.e2e.spec.js from
# origin/tests if present, otherwise regenerate from image-toolkit.js
```

> Note: the toolkit's own test files were never committed to `main` before the
> removal, so they are **not** recoverable from `main`'s history. They now live
> only on `origin/tests` — do not delete that branch without pushing elsewhere.

Recommended: keep the harness on a branch rather than shipping a repo with no
verification path.
