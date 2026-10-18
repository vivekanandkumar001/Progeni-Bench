# Progeni Bench — Service Functionality Roadmap

Implementation roadmap for improving the functionality of all 30 client-side tools on Progeni Bench.
Every "Current behavior" statement below was verified by reading `app.js`, `utils.js`, and `site.config.js` (the code as of this writing).

## How to read this document

Each tool gets one subsection with a status line, an accurate description of what the code does today, the concrete gaps found in that code, and a build-target spec.

**Priority**

| Level | Meaning |
|-------|---------|
| **P0** | The core promise (hero copy / `whatItDoes`) is broken, missing, or materially misleading — ship-blocker for that tool |
| **P1** | Strong user value; the tool works but is too limited to be a category winner |
| **P2** | Polish — extra formats, nicer UX, parity tweaks |

**Effort**

| Level | Meaning |
|-------|---------|
| **S** | ≤ half a day |
| **M** | ~1–2 days |
| **L** | 3+ days |

**Status**

| Level | Meaning |
|-------|---------|
| **Skeleton** | Handler exists but does little or none of what the marketing copy promises |
| **Basic** | Works end-to-end for the happy path, with hard-coded limits and few controls |
| **Solid** | Delivers most of its promise; remaining work is polish |

**Shared code paths (refactor before extending):**

- `sheetMaker()` serves **sticker-sheet, print-layout, ironon-sheet** — one engine, three barely-different products.
- `patternMaker()` serves **cross-stitch, diamond-painting, embroidery** — one engine, one hard-coded 8-color DMC palette.
- **Image Studio** (`image-studio.js`) serves **tshirt-mirror** (mirror mode), **print-border** (border mode) and **wallpaper** (wallpaper mode) — one shared engine with three modes; the legacy 3-branch `imageTransform()` was retired.
- **Album Studio** (`album-studio.js`) serves **photo-timeline** (timeline mode) and **family-organizer** (organizer mode) — one shared EXIF/thumbnail/grouping engine with two distinct products and output filenames; the legacy shared `photoTimeline()` was retired.
- `csvTool()` serves **csv-splitter and csv-date**; SRT parsing helpers (`parseSRT`) are shared by **subtitle-speed**, while **subtitle-linefix** re-implements its own block parser.

## Delivery phases (Phase 1 → Phase 6)

The 30 tools are grouped by category and by dependency: shared engines must land before the tools that consume them, and the highest-traffic craft tools go first.

### Phase 1 — Print & Craft (goal: make the flagship revenue-traffic tools deliver on their copy)
- **Tools:** sticker-sheet, labels, tshirt-mirror, ironon-sheet, print-layout, print-border, cross-stitch, diamond-painting, embroidery.
- **Key work:** extract a proper `sheetLayoutEngine()` from `sheetMaker()` with cut lines, DPI options, per-image controls; expand the DMC palette from 8 colors to a real floss table; give the three pattern tools genuinely different outputs.
- **Exit criteria:** sticker-sheet exports a sheet with optional cut-contour outlines and lets the user change columns/gaps up to ≥ 24 images; cross-stitch/diamond/embroidery each produce visibly distinct, documented output; no tool silently drops files without saying so.

### Phase 2 — Image & Photo (goal: honest, controllable transforms + photo organization that embeds photos)
- **Tools:** wallpaper, panorama, duplicate-finder, best-shot, photo-timeline, family-organizer.
- **Key work:** ratio picker for wallpaper (16:9 and others are advertised in config but absent in code); fix panorama's non-square tiles; embed thumbnails in the photo-timeline HTML export; make family-organizer do something photo-timeline doesn't.
- **Exit criteria:** panorama tiles are truly square (or user-selectable aspect); timeline HTML contains embedded image data (or a folder of files); duplicate-finder and best-shot offer an actionable output (report download / ranking export), not just on-screen text.

### Phase 3 — Video & Audio (goal: turn read-only previews into downloadable, configurable outputs)
- **Tools:** video-safe-zone, video-thumbnails, silence-map, audio-chapters.
- **Key work:** add the download button safe-zone is missing; make frame count/sheet layout configurable in thumbnails; expose silence threshold/min-gap controls plus CSV export; actually implement chapter parsing, sorting, and validation (today the textarea value is downloaded verbatim).
- **Exit criteria:** every tool in the phase produces a downloadable artifact; audio-chapters validates/sorts/pads timestamps and warns when the first chapter is not 00:00.

### Phase 4 — Subtitles & Text (goal: standards-configurable audit + safe automated fixing)
- **Tools:** subtitle-speed, subtitle-linefix.
- **Key work:** configurable CPS/character-limit profiles (Netflix 21 CPS, BBC 180 WPM, 42-char max); export audit reports as CSV/SRT-annotated; make linefix preserve cue numbering and optionally re-balance two-line cues; add a combined "audit → fix → re-audit" loop.
- **Exit criteria:** both tools share one SRT parse/serialize layer (no divergent parsers); user can pick a preset profile; fixed SRTs round-trip without losing numbering or positioning tags.

### Phase 5 — Data & Contacts (goal: preview-first data tools with merge controls and safe exports)
- **Tools:** contact-dedupe, csv-splitter, csv-date, vcard.
- **Key work:** duplicate preview + choose-which-record-to-keep before export; multi-column and multi-delimiter split; per-cell date parse report with ambiguity flags; vCard dedupe, field-level merge, and photo-preserving round-trip.
- **Exit criteria:** contact-dedupe shows the duplicate groups before download; csv-splitter supports splitting > 1 column in one pass; vcard can dedupe across files and export both merged and per-contact outputs.

### Phase 6 — Web, Calendar & Files (goal: RFC-fidelity parsing and truthful, verifiable cleaning)
- **Tools:** bookmark-cleaner, bookmark-reading, svg-cleaner, calendar-cleaner, timetable-calendar.
- **Key work:** UID/RECURRENCE-ID-aware calendar dedupe and timezone-correct timetable output (current code writes local times through `toISOString()`); comment/metadata stripping parity between the browser and Node SVG paths; optional (opt-in, CORS-permitting) dead-link checking for bookmarks.
- **Exit criteria:** timetable .ics imports into Google/Outlook at the correct local time; calendar-cleaner reports what it removed and preserves VTODO/VJOURNAL blocks; svg-cleaner reports bytes-before/bytes-after.

---

## 1. Print & Craft

### 1.1 Sticker Sheet Maker (`sticker-sheet`)
- **Category:** Print & Craft | **Status:** Basic (IN PROGRESS — being rebuilt first) | **Priority:** P0 | **Effort:** M
- **Current behavior:** Delegates to shared `sheetMaker()` in `app.js` (line ~349). Renders up to 12 images onto a 300 DPI canvas (US Letter 2550×3300, A4 2480×3508, 4×6 1200×1800, A3 3508×4960) in a fixed 3-column grid with a hard-coded 50 px gap; images are letterboxed centered into square cells (`cellH = cellW`). Exports one composite PNG.
- **Gaps / problems:**
  - Hard cap of 12 files (`maxAllowed = 12`); extra files are silently discarded with a post-hoc notice.
  - Column count is hard-coded (3 for sticker-sheet, 2 otherwise) — no user control over grid, gap, or margins.
  - Cells are forced square even on tall A4/Letter paper, wasting most of the sheet.
  - No cut lines, cut-contour outlines, registration marks, or bleed — despite "sticker sheet" being the whole use case.
  - No way to reorder, remove, or resize individual images after upload; no per-sticker trim guide.
  - Output is PNG only; no JPEG or PDF option.
- **Target functionality:**
  - User-selectable rows × columns (auto-fit mode plus manual override), gap, and margin sliders with live preview.
  - Raise the image cap to ≥ 24 with streaming/queued canvas rendering and a progress indicator.
  - Optional "cut guides": per-cell outline (dashed or solid), configurable corner style (square/rounded), and a Cricut-friendly cut-contour stroke in a spot color.
  - Rectangular (aspect-aware) cells so A4/Letter sheets aren't wasted; "fit whole image" vs "fill cell" modes.
  - Per-image controls in a thumbnail strip: reorder (drag or arrows), delete, rotate 90°, per-image scale override.
  - DPI selector (150/300/600) and export as PNG, JPEG, or single/multi-page PDF.
  - Persist settings in the URL hash so layouts are shareable/reproducible.
- **Dependencies / notes:** This is the first tool being rebuilt — its new layout engine becomes the foundation for `print-layout` (1.5) and `ironon-sheet` (1.4). Extract `sheetLayoutEngine()` (canvas sizing, cell math, rendering, export) with per-tool preset hooks instead of the current `if (id === ...)` inside `sheetMaker()`. Also remove the now-dead duplicate `home()` definition (defined twice in `app.js`).

### 1.2 Avery Label Maker (`labels`)
- **Category:** Print & Craft | **Status:** Pro (Phase L1–L2 shipped; L3 barcodes pending) | **Priority:** P1 | **Effort:** M
- **Superseded by:** `docs/LABELS_PLAN.md` — the rebuild landed as `label-studio.js` (`window.LabelStudio`): verified template geometry (5160 / 5163 / 5167 / L7160 / badge / custom), multi-line token builder with sequence numbers and address wizard, manual + paste + CSV entry, live canvas preview with page tabs/sheet report/warnings, undo/redo, presets + JSON project files, and PNG / HTML / Print exports (current-or-all sheets). `labels()`, `case "labels"` and `#labelTemplate` were deleted. Remaining: Phase L3 QR/Code128 barcodes, L4 test-sheet/chunked parsing, L5 final QA. (Note: L7160 is **21 labels, 3×7** — the old "24 / 3×8" claim below was wrong: 8 × 38.1 mm does not fit A4.)
- **Old gaps (historical):**
  - Only one CSV column can be placed per label — real mailing labels need Name / Street / City-State-ZIP as separate lines.
  - Dashed guide borders print on the physical sheet unless the user hand-edits the HTML.
  - A4 template is described as "24 labels/sheet" in config but the grid is just `repeat(3, 1fr)` with auto rows — count depends entirely on row count.
  - No text alignment, font, or font-size controls; no vertical centering.
  - No preview before download; no label count vs. sheet-count report (e.g. "37 labels = 2 sheets").
- **Target functionality:**
  - Multi-line label builder: pick up to N columns, assign each to a line, per-line bold/size.
  - More templates: Avery 5160, 5163, 5167 (return labels), L7160 3×7 (21-up) — corrected from the old 3×8 claim, name-badge 5390, and a fully custom grid.
  - "Print guides" toggle so dashed borders are omitted from the downloaded HTML. (Landing as preview/export guide toggles in Label Studio.)
  - Live canvas preview of the generated sheet with page-break visualization.
  - Optional QR/barcode per row using a small client-side encoder (L3).
  - CSV row → multi-sheet pagination with explicit `page-break-after` and a label-count summary.
- **Dependencies / notes:** shares `csvParse()` with all CSV tools; the label HTML template concept should be extracted as a reusable `printHtmlDoc()` helper also useful for timeline exports (2.5) and chapters text.

### 1.3 T-Shirt Print Mirror (`tshirt-mirror`)
- **Category:** Print & Craft | **Status:** Shipped (Image Studio mirror mode: horizontal/vertical/180° flip, white-background flatten, SVG vector passthrough via `<g transform>`, before/after preview, PNG/JPEG/WebP + quality, source-derived filenames, batch download, hand-off note for iron-on sheet) | **Priority:** P2 | **Effort:** S
- **Current behavior:** `imageTransform("tshirt-mirror", ...)` (line ~705) draws the uploaded image onto a same-size canvas with `translate(w,0); scale(-1,1)` — an exact horizontal flip — and downloads a PNG.
- **Gaps / problems:**
  - No controls at all: no flip axis (vertical flip is also a real use case), no "also add bleed", no background transparency toggle.
  - Output is PNG only; SVG uploads are rasterized at browser default resolution rather than passed through.
  - No before/after side-by-side preview to verify lettering orientation.
  - No batch mode (config copy says "one graphic per operation" — a limitation, not a feature).
  - Filename is always `tshirt-mirror.png`, colliding across operations.
- **Target functionality:**
  - Flip-axis selector (horizontal / vertical / 180° rotation) plus optional white background flattening for JPEG export.
  - SVG passthrough mode: re-serialize the flipped SVG (transform attribute) without rasterizing, preserving vectors for cutting machines.
  - Batch mode: flip and download N files (zip via a minimal store-only zip writer) or a flipped multi-image sheet reusing the Phase 1 engine.
  - Optional combined pipeline: "mirror + add to iron-on sheet" one-click hand-off to `ironon-sheet` with the mirror flag preset.
  - Download as PNG (lossless) or WebP/JPEG with quality control; filename derived from source file name.
- **Dependencies / notes:** lives in the shared `imageTransform()` branch; refactor order: extract per-tool transform modules first, then this becomes trivial. Feed into 1.4 via the new sheet engine's per-image "mirrored" flag.

### 1.4 Iron-on Transfer Sheet (`ironon-sheet`)
- **Category:** Print & Craft | **Status:** Shipped (Sheet Studio: default-on mirror, presets, per-image override, cut lines) | **Priority:** P1 | **Effort:** S
- **Current behavior:** Identical code path to sticker-sheet (`case "ironon-sheet"` falls through to the same `sheetMaker()`); only differences are the default 2-column grid (non-sticker-sheet ids) and the output filename prefix. It does NOT mirror artwork, despite transfers needing it.
- **Gaps / problems:**
  - Feature-identical to sticker-sheet — no value differentiation (config explicitly punts mirroring to another tool).
  - No "mirror all images" option, which is the single most important iron-on requirement.
  - Same 12-file cap, fixed gap/columns, square-cell waste, PNG-only export as 1.1.
  - No transfer-paper-aware defaults (e.g. letter-size with ~0.5″ safety margin for press edge).
- **Target functionality:**
  - One-click "Mirror sheet" toggle (or default-on for this tool) built on 1.3's flip transform inside the shared engine.
  - Preset profiles: "Light transfer paper (mirror)", "Dark transfer paper (no mirror)", "HTV vinyl (mirror + cut lines)".
  - Per-image mirror override in the thumbnail strip.
  - Optional cut-spacing mode with slightly larger gaps for scissors vs. plotter.
  - Same export matrix as the rebuilt sticker-sheet (PNG/JPEG/PDF, DPI selector).
- **Dependencies / notes:** must land after (or with) 1.1 — it becomes a preset layer over `sheetLayoutEngine()`, not a separate implementation.

### 1.5 Print Layout Optimizer (`print-layout`)
- **Category:** Print & Craft | **Status:** Shipped (Sheet Studio: aspect-aware grid + auto-pack rows, auto-rotate, mm borders, size report) | **Priority:** P1 | **Effort:** M
- **Current behavior:** Same `sheetMaker()` path; config default gives a 2-column grid (sticker-sheet gets 3). Each photo is uniformly scaled to fit a square cell and centered, so a 4×6 photo on a Letter sheet leaves large white bands above and below its cell.
- **Gaps / problems:**
  - Forced square cells make "layout optimizer" misleading for portrait/landscape photos — aspect-correct rows are not computed.
  - Hard-coded 12-image cap and 50 px gap; columns not user-selectable.
  - No rotation assist (auto-rotate to fill the cell), no per-photo borders, no choice of fill vs. fit.
  - No PDF export — most "print" workflows end at a PNG.
  - No print-margin/border thickness control (ironic given 1.6 exists as a separate tool).
- **Target functionality:**
  - Layout engine with per-row column counts (pack by aspect ratio) or classic uniform N×M grid with non-square cells.
  - Auto-rotate-to-fit toggle and per-photo manual rotation.
  - Uniform border/margin width control (mm/inches) rendered as canvas whitespace.
  - Export PNG and PDF (single page), with 300 DPI label verified against the chosen paper size.
  - Up to 40 photos per sheet with progress UI; empty-cell fill color option (white/black/none).
- **Dependencies / notes:** second consumer of `sheetLayoutEngine()` from 1.1; do not extend `sheetMaker()` directly.

### 1.6 Photo Print Border Calculator (`print-border`)
- **Category:** Print & Craft | **Status:** Shipped (Image Studio border mode: 4×6/5×7/8×10/8×11/A4/custom in mm or in, fit-inside vs crop-to-fill, fixed mm or % border width, white/black/custom colour, optional mat keyline, 200/300 DPI sized to the physical target, live physical-dimension report, PNG/JPEG) | **Priority:** P2 | **Effort:** S
- **Current behavior:** Third branch of `imageTransform()`: expands the canvas by `round(min(w,h) * 0.06)` on each side, fills white, and draws the photo centered. One image, PNG out.
- **Gaps / problems:**
  - Border is hard-coded at 6% — config copy promises standard frame sizes (4×6, 5×7, 8×10, European frames) that the code cannot deliver; a 6% border on a 4:5 photo does not make it a 5×7 or 8×10.
  - No target-size selection, no output resolution control, no border color choice.
  - Cannot shrink/fit the photo inside a fixed output size (the actual framing need).
  - No preview of the final physical size; PNG only.
- **Target functionality:**
  - Target-size dropdown (4×6, 5×7, 8×10, 8×11, A4, custom) with mm/inch units; engine fits the photo inside the target canvas with a uniform border.
  - Border width control (fixed mm or %) and border color (white/black/custom).
  - Optional mat-effect: inner keyline around the photo plus outer border.
  - Output DPI selector (200/300) sized to the physical target; PNG + JPEG export.
  - Report the resulting physical dimensions and border size on screen.
- **Dependencies / notes:** shares `imageTransform()` with 1.3 and 2.1; after the Phase 1 refactor it should use the same fit-and-export helper as the sheet engine.

### 1.7 Cross-Stitch Pattern Maker (`cross-stitch`)
- **Category:** Print & Craft | **Status:** Shipped (Pattern Studio: 300-colour DMC table in data/dmc.js, average-pooled cells, median-cut + snap, symbol charts, 10×10 grid, B&W symbol-only print, dithering, skein legend, PNG/CSV/print) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `patternMaker()` (line ~395) resamples the image to a fixed 50-column grid (14 px cells), matches each cell to the nearest color in `DMC_PALETTE` — a hard-coded array of only 8 DMC colors in `app.js` — repaints the canvas, and prints a legend with per-color stitch counts.
- **Gaps / problems:**
  - The "standard DMC thread palette" is 8 colors; real DMC has ~500 floss colors, so most photos collapse into wrong hues.
  - 50 columns is hard-coded; no stitch-count target, no max-color control.
  - Only horizontal resolution is fixed — rows derive from aspect ratio, and cell rendering samples a single pixel (`p = (y*14*c.width + x*14)*4`) rather than averaging the cell, causing aliasing.
  - No symbol overlay (critical for printable charts), no gridding (10×10 heavy lines), no backstitch layer.
  - Legend has no floss names or skein estimates; PNG export only, no PDF chart with header.
- **Target functionality:**
  - Ship a real DMC palette table (code, name, hex, ~200–500 entries) in a data module shared by 1.7–1.9.
  - Controls: target width in stitches (20–200), max colors (quantize with median-cut then snap to DMC), cell preview scale.
  - Average-pool each cell instead of point sampling; optional dithering toggle.
  - Symbol chart mode (color + symbol glyph per cell), 10×10 grid lines, optional black-and-white symbol-only print mode.
  - Legend with DMC code, name, swatch, stitch count, and estimated skeins (stitches / ~1700 per skein); export chart as PNG and multi-page PDF.
- **Dependencies / notes:** `patternMaker()` is shared with 1.8 and 1.9 — extract `PatternEngine` (resample → quantize → render → legend) first; the DMC data table goes into a new `data/dmc.js` module.

### 1.8 Diamond Painting Pattern Maker (`diamond-painting`)
- **Category:** Print & Craft | **Status:** Shipped (Pattern Studio diamond mode: round/square drills with highlight, symbol letter per cell, grid every 10 drills, 2.5 mm cm→drill canvas planner, per-colour drill totals, CSV kit list, PNG/print) | **Priority:** P1 | **Effort:** M
- **Current behavior:** Exactly the same `patternMaker()` call as cross-stitch — same 50-column grid, same 8-color DMC palette, same flat-swatch PNG, same legend — only the filename differs. There are no diamonds, no drill symbols, and no round/square drill distinction anywhere in the code.
- **Gaps / problems:**
  - Zero differentiation from 1.7 despite completely different marketing copy (drill counts, round vs. square, symbol grids).
  - No drill count per color in the drill-kit sense (each cell = 1 drill is computed only implicitly via stitch counts).
  - No canvas-size planner (most diamond painters work to a fixed drill grid, e.g. 30×40 cm).
  - No symbol-on-color rendering, no drill color code systems beyond DMC (AB/DMC drill naming ignored).
  - No kit-shopping list export (CSV of DMC code → drill count).
- **Target functionality:**
  - Render each cell as a drill shape: filled circle (round) or square with highlight (square drill), with a bold symbol letter centered per cell.
  - Drill shape selector; canvas-size planner that maps a physical canvas (cm/in) to drill counts using the standard ~2.5 mm drill pitch.
  - Per-color drill totals + total drill estimate; CSV/HTML shopping-list export.
  - Legend with DMC code, symbol, swatch, and drill count; PNG + PDF export reusing 1.7's chart printer.
  - Optional grid highlighting every 10 drills.
- **Dependencies / notes:** built on the same `PatternEngine` extracted in 1.7; do this after 1.7 so the DMC table and chart export already exist.

### 1.9 Embroidery Pattern Simplifier (`embroidery`)
- **Category:** Print & Craft | **Status:** Shipped (Pattern Studio embroidery mode: median-cut to 2–64 threads, optional DMC snap, pasted custom hex palette, original vs smooth side-by-side, per-colour area % + skeins, smooth/grid PNG + CSV) | **Priority:** P2 | **Effort:** M
- **Current behavior:** Also the same `patternMaker()` call — a 50-column DMC-snap repaint. It does show per-color counts, which loosely matches the "palette reduction" promise, but presents it as a stitch chart rather than a color-reduction report.
- **Gaps / problems:**
  - No palette-size control; always snaps to the same 8 DMC colors.
  - No true color clustering (median-cut / k-means) before snapping — the "clustering" the marketing copy describes does not exist.
  - No stitch-percentage summary as claimed in config (counts are raw cell counts).
  - No side-by-side original vs. simplified comparison; no floss shopping list.
  - Output is a grid chart, not the "simplified pattern reference graphic" described in the copy.
- **Target functionality:**
  - K-means or median-cut reduction to N user-chosen thread colors, then optional snap-to-DMC toggle (using the shared palette from 1.7).
  - Side-by-side original / simplified preview; per-color area percentage and estimated skeins.
  - Smooth (non-grid) simplified image export for reference, plus optional grid chart export for stitching.
  - Palette report export as CSV (hex, nearest DMC code/name, % area).
  - User-supplied custom palette (paste hex list) for matching non-DMC threads.
- **Dependencies / notes:** last consumer of `PatternEngine`; once 1.7–1.9 all run on it, `patternMaker()`'s three identical `case` arms in `processTool()` collapse into one call with a mode flag.

---

## 2. Image & Photo

### 2.1 Wallpaper Photo Cropper (`wallpaper`)
- **Category:** Images | **Status:** Shipped (Image Studio wallpaper mode: phone/desktop/social/tablet/wide device presets plus custom ratio and custom pixels, draggable focal-point crop box, cover-crop or blur-padding fill, PNG/JPEG/WebP + quality, batch) | **Priority:** P2 | **Effort:** S
- **Current behavior:** `imageTransform("wallpaper", ...)` center-crops to the single hard-coded ratio 9/19.5 (fit-inside crop, taking the centered region), outputs PNG. Despite config copy advertising 16:9 desktop, the code has no other ratio.
- **Gaps / problems:**
  - Only one aspect ratio exists; 16:9, 9:16, 4:3, 19.5:9, and tablet ratios are all missing.
  - Crop is always centered — no focal-point control (faces/subjects get cut).
  - No preview rectangle showing what will be removed; no output size report.
  - PNG only, always full source resolution scaled down; no target-pixel presets (iPhone 1170×2532 etc.).
- **Target functionality:**
  - Ratio picker with device presets (iPhone/Android lock screens, 16:9 desktop, 9:16 social, 4:3 tablet) plus custom ratio.
  - Draggable/resizable crop box with focal point; live "before/after" overlay.
  - Output size presets and DPI-independent pixel targets; PNG + JPEG/WebP export.
  - Batch mode: apply the same crop to multiple photos (shares input handling with 2.4).
  - Blur-padding mode (fill edges with a blurred copy) as an alternative to cropping.
- **Dependencies / notes:** part of the shared `imageTransform()` trio (with 1.3 and 1.6); refactor into a `CropEngine` reusable by 2.2's square-crop mode and 2.3's tile renderer.

### 2.2 Panorama Carousel Splitter (`panorama`)
- **Category:** Images | **Status:** Shipped (square tiles fixed, 2–6 tile selector, download-all, aspect warning) | **Priority:** P0 | **Effort:** M
- **Current behavior:** `panorama()` crops square tiles (height = width/parts) from the source, offers a 2–6 tile-count selector, warns when squares are impossible, and downloads individual tiles or all tiles at once.
- **Gaps / problems:**
  - Tiles are NOT square unless the source happens to be ~3:1 — the copy promises "3 mathematically seamless square tiles" but the code never adjusts height; a 2.5:1 pano produces 3 tall rectangles that Instagram will crop.
  - Part count is hard-coded to 3; no 2/4/5/6-tile option for different carousel lengths.
  - No overlap option (swipe-seam trick), no tile numbering on preview, no single-click "download all".
  - No aspect-ratio warning when the source is too narrow.
  - PNG only; no quality control for Instagram-friendly file sizes.
- **Target functionality:**
  - Tile-count selector (2–6) with automatic square computation: target tile height = totalWidth / parts, with top/bottom crop or letterbox padding to reach exact squares.
  - Warn when the image cannot yield square tiles at the chosen count; suggest the maximum viable count.
  - Optional horizontal overlap (e.g. 40 px) for seamless swipe transitions.
  - Numbered tile overlay preview; "Download all tiles" button (sequential downloads or store-only zip).
  - JPEG export option with quality slider for platform file-size limits.
- **Dependencies / notes:** consumes the shared image I/O helpers; after 2.1's `CropEngine` exists, implement square-tile computation via that engine.

### 2.3 Photo Duplicate Finder (`duplicate-finder`)
- **Category:** Images | **Status:** Shipped (PhotoBatch engine: exact size + SHA-256 (Blob-URL Worker) plus aHash/dHash perceptual near-duplicate clustering with a distance slider, per-group thumbnail checkboxes, keep recommendation, CSV + standalone HTML report, all file types) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `duplicateFinder()` (line ~758) groups the selected files by byte size, SHA-256 hashes only files in groups of ≥ 2 via `crypto.subtle`, and renders stats plus a plain-text list of duplicate sets (file names only). Nothing is downloadable.
- **Gaps / problems:**
  - Only exact byte duplicates; no near-duplicate (perceptual hash) detection for resized/recompressed copies — the most common real-world photo duplicate.
  - Report is on-screen `<pre>` text only; no CSV/HTML export, no copy-to-clipboard.
  - Shows only file names — no size, date, or thumbnail to decide which copy to keep.
  - No "keep first/oldest path" recommendation; files are hashed sequentially with no progress UI (large batches look frozen).
  - Accepts only `image/*` even though byte-dedup works for any file type.
- **Target functionality:**
  - Add a second pass: pHash/dHash (canvas-downsampled perceptual hash) to flag near-duplicates with a similarity percentage.
  - Interactive results: thumbnail grid per duplicate group, checkboxes to select copies, "keep recommended" (oldest `lastModified` / shortest path).
  - Export the report as CSV (group id, file, size, date, hash) and a standalone HTML report.
  - Progress bar with Web Worker hashing for large batches; widen accept to all file types.
  - Optional side-by-side compare view for borderline perceptual matches.
- **Dependencies / notes:** hashing logic can move to a Worker (`workers/dedupe.js`) — same Worker could later serve 2.4's scoring loop.

### 2.4 Photo Best-Shot Finder (`best-shot`)
- **Category:** Images | **Status:** Shipped (Photo Batch engine: variance-of-Laplacian sharpness on an aspect-preserving 256 px letterboxed downsample, weighted exposure/clipping + contrast composite with per-photo breakdown, load-more ranking, top-N compare, CSV + clipboard) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `bestShot()` (line ~785) draws each image into a 160×160 canvas, computes a score from horizontal-only edge differences (`edge / (160*160)`) minus a brightness-distance penalty (`|mean − 128| × 0.05`), sorts descending, and shows the top 12 thumbnails labeled "#N Best". Scores are not displayed; there is no export.
- **Gaps / problems:**
  - Sharpness metric uses only left-pixel horizontal gradients — misses vertical edges; not a real Laplacian as the copy claims.
  - Aspect ratio is destroyed (160×160 stretch), biasing scores on portrait photos.
  - No exposure/clipping check (a uniformly sharp but overexposed frame scores fine), no blur-region detection.
  - Only the top 12 render — the tail of the ranking is invisible; no scores shown, no CSV export.
  - Sequential await-per-image with no progress; a broken/unsupported file aborts the entire batch via the global catch.
- **Target functionality:**
  - Proper variance-of-Laplacian (3×3 kernel, both axes) on an aspect-preserving downsample (longest side 256, letterboxed).
  - Composite score with weights: sharpness, exposure/clip penalty, contrast; show the numeric score per photo.
  - Full ranked list with "load more"; side-by-side compare of the top N; optional auto-select-and-zip of the winner.
  - CSV export (filename, score, sharpness, exposure) and clipboard copy of the best file's name.
  - Per-file error handling (skip and report unsupported files); progress UI; Worker-based processing.
- **Dependencies / notes:** shares the image batch pipeline with 2.3; a shared scoring Worker plus shared progress component should be built once and used by both.

### 2.5 Photo Timeline Builder (`photo-timeline`)
- **Category:** Images | **Status:** Shipped (Album Studio timeline mode: minimal JPEG EXIF reader with `DateTimeOriginal` > file-date fallback, embedded 400 px data-URL thumbnails, day grouping with sticky headings + per-group counts (auto month/year for large sets), click-to-open full-resolution lightbox, per-file date correction + confidence badges, album title, total-size report, and a self-contained lazy-loaded `photo-timeline.html`) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `photoTimeline()` (line ~751) sorts the selected files by `lastModified`, and exports an HTML page that is a **text-only list** of `date — filename` items. No images appear in the exported album — the on-screen preview shows nothing either.
- **Gaps / problems:**
  - The "offline HTML photo album" contains no photos; it is a filename index, contradicting the tool's core promise.
  - Relies solely on `File.lastModified`, which is often wrong after copies/downloads; no EXIF `DateTimeOriginal` fallback.
  - No day/month grouping, no headings, no counts — just one flat `<ul>`.
  - Embedded photos would blow past Blob size limits at full resolution; no thumbnailing strategy exists.
  - Output filename is hard-coded to `photo-timeline.html` (shared with 2.6, so family-organizer exports the same filename).
- **Target functionality:**
  - Build real albums: downscale photos to configurable thumbnails (e.g. 400 px) embedded as data URLs, with click-to-open full-res blob — or export a `photo-timeline.html` + `thumbs/` store-only zip.
  - EXIF date parsing (minimal JPEG EXIF reader, `DateTimeOriginal` > `lastModified` fallback) with per-file date correction UI.
  - Group by day (or month/year for large sets) with sticky headings and per-group counts.
  - Slideshow-friendly layout, lazy-loaded images, total-size report before export.
  - Album title/metadata input; preserve original filenames as captions/links.
- **Dependencies / notes:** shared with 2.6 (same function) — Phase 2 must first split them: this tool keeps the album export; family-organizer gets the grouping/summary behavior described in 2.6. A tiny JPEG EXIF reader module will also benefit 2.6.

### 2.6 Family Photo Date Organizer (`family-organizer`)
- **Category:** Images | **Status:** Shipped (Album Studio organizer mode: collapsible year → month → day tree with per-group counts + thumbnail contact strips, editable rename pattern with a live old-name → new-path preview table, bulk per-group date overrides, EXIF confidence flags, and two exports — a self-contained `family-organizer.html` archive index plus a planned-folder CSV/JSON mapping) | **Priority:** P2 | **Effort:** M
- **Current behavior:** `processTool` routes `family-organizer` to the exact same `photoTimeline()` function as photo-timeline — identical sort, identical text-only HTML output, and even the `photo-timeline.html` filename. There is currently no functional difference between the two tools at all.
- **Gaps / problems:**
  - Zero differentiation from 2.5 — the category copy promises "yearly and monthly timeline groups" that are never computed.
  - No grouping UI, no folder/event labels, no rename/export-by-folder suggestions.
  - No review step (config says "inspect and group" — there is nothing to inspect on screen).
  - Same `lastModified`-only dating weakness as 2.5; no EXIF.
  - No way to move/copy files into a proposed folder structure (browser sandbox makes true moves impossible, but a zip is feasible).
- **Target functionality:**
  - Distinct product: chronological grouping summary (per year → month → day counts, collapsible tree) with thumbnail contact strip per group.
  - Rename pattern builder (`YYYY/MM/YYYY-MM-DD_title.ext`) and export of a store-only zip mirroring the proposed folder structure.
  - Manual date overrides per file/group before export (fix wrong timestamps in bulk).
  - EXIF-based dating (shared reader from 2.5) with a "date confidence" flag when EXIF is missing.
  - HTML archive index export that embeds thumbnails (shared album renderer from 2.5, but with year/month headings as the default view).
- **Dependencies / notes:** depends on splitting `photoTimeline()` in Phase 2; both tools then consume a shared `AlbumRenderer` + `EXIFReader`, but keep separate default views and output filenames.

---

## 3. Video & Audio

### 3.1 Video Safe-Zone Checker (`video-safe-zone`)
- **Category:** Audio & Video | **Status:** Shipped (Download Overlay PNG button added) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `safeZone()` (line ~499) accepts a video (grabs one frame at `min(1, duration/2)` seconds) or an image, letterboxes a 9:16 box, then paints red obstruction rectangles for the chosen platform (TikTok / Reels / Shorts) using hard-coded percentage rects, plus a label. Changing the platform dropdown re-runs automatically on the retained file list.
- **Gaps / problems:**
  - **No download button** — config copy promises "Download the overlaid guide image", but the result HTML renders only an `<img>`; the overlay cannot be saved.
  - Only one frame is sampled; for video there is no frame-time picker or multi-frame strip.
  - Obstruction rectangles are guessed percentages, not measured from current platform UI, and are never configurable.
  - No "safe area" visual (only red covered zones), no guide for center caption zone or headline area.
  - Non-9:16 source images get the 9:16 box letterboxed but no warning that the output is meaningless for vertical platforms.
  - MOV files the browser cannot decode fail with a generic error string.
- **Target functionality:**
  - Add the missing "Download overlay PNG" button (and JPEG) — smallest P0 fix on the site.
  - Frame-time slider for video sources plus a "check 3 frames" (top/middle/bottom) mode.
  - Editable zone presets: store named platform presets as data, allow users to nudge rect values with a reset button.
  - Green "recommended text safe area" outline in addition to red covered zones.
  - Aspect-ratio warning banner for non-9:16 inputs with a "crop to 9:16 first" hand-off to 2.1.
  - Codec-failure message that names the unsupported container and suggests remuxing.
- **Dependencies / notes:** re-run-on-change wiring (`activeFiles` + `platformSelect.onchange`) is a pattern worth reusing for any tool with live controls; consider generalizing it in `toolPage()`.

### 3.2 Video Thumbnail Contact Sheet (`video-thumbnails`)
- **Category:** Audio & Video | **Status:** Shipped (Media Studio "thumbs" mode: frame count 4–48, grid columns, per-thumb width 240–960, padding/background, burned `MM:SS.mmm` + index labels, `Promise.race` seek timeouts with previous-frame fallback + warnings, progress bar, PNG/JPEG export with quality and a CSV of sampled timestamps; pure `frameTimes` / `gridPlan` covered by test/media.test.js) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `videoThumbs()` (line ~470) loads the video muted, seeks to 12 hard-coded evenly spaced timestamps (`n = 12`, including both 0% and 100%), captures 480×270 frames into a fixed 3×4 grid canvas, and offers a single PNG download.
- **Gaps / problems:**
  - Frame count and grid are hard-coded (12 frames, 3×4, 480×270) — no control for 6/16/24 frames or 4K sheets.
  - No timestamps printed on the sheet, so the contact sheet cannot be used to locate scenes precisely.
  - Seeking uses a fragile `v.onseeked = r` pattern; a failed seek hangs the promise forever (no timeout).
  - No per-frame resolution option; 480×270 is small for HD source review.
  - No progress UI during the 12 sequential seeks (long videos look unresponsive); last frame at exactly `duration` can be blank in some codecs.
- **Target functionality:**
  - Controls: frame count (4–48), grid columns, per-thumb resolution, output padding/background.
  - Burn `MM:SS.ms` timestamp labels (and frame index) under each thumb.
  - Seek with `Promise.race` timeouts and per-frame error fallback (duplicate previous frame + warning).
  - Progress bar; optionally skip the exact `duration` frame or seek to `duration − ε`.
  - PNG and JPEG export; optional CSV of the sampled timestamps.
- **Dependencies / notes:** the seek-capture loop is a reusable `captureFrames(videoSpec)` helper that 3.1 (multi-frame mode) should share.

### 3.3 Chapter Timestamp Formatter (`audio-chapters`)
- **Category:** Audio & Video | **Status:** Shipped (real parser: normalize/sort/enforce 00:00 start, skip/duplicate/gap warnings, live preview, cleaned download) | **Priority:** P0 | **Effort:** S
- **Current behavior:** `parseChapters()` parses `MM:SS Title` / `HH:MM:SS Title` lines, normalizes to `HH:MM:SS`, sorts, forces a 00:00 start, and reports skipped lines, duplicate timestamps and >15 min gaps. A live preview shows the cleaned list and downloads normalized `chapters.txt`.
- **Gaps / problems:**
  - Zero formatting: no parsing, no sorting, no MM:SS/HH:MM:SS padding, no delimiter handling — the tool is a plain textarea download.
  - No check that the first chapter starts at 00:00 (a hard YouTube requirement) or that chapters are ≥ 10 s apart.
  - No duplicate-timestamp detection, no malformed-line warnings, no line numbers in errors.
  - No preview of the normalized output before download; no copy-to-clipboard.
  - The dead `processTool` case can create a second `#result` box on the page — remove or wire properly.
- **Target functionality:**
  - Real parser: accept mixed input (`MM:SS Title`, `HH:MM:SS - Title`, `0:12,Title`), normalize to `HH:MM:SS Title` lines.
  - Validation report: missing 00:00 start, unsorted timestamps, duplicates, gaps/overlaps vs. a pasted video duration field, < 10 s chapters.
  - Live preview of the cleaned list; per-line error highlighting with one-click "jump and fix".
  - Platform presets: YouTube (≥ 3 chapters, first at 0:00), podcast/Spotify formats, plain sorted list.
  - Download `chapters.txt` + copy-to-clipboard + optional `.srt`-style export.
- **Dependencies / notes:** no file input needed — it is a text transformer like the subtitle tools; when building the parser, reuse the timecode utilities that Phase 4 extracts for the SRT tools (4.1/4.2) so padding/format rules live in one place.

### 3.4 Podcast Silence Map (`silence-map`)
- **Category:** Audio & Video | **Status:** Shipped (Media Studio "silence" mode: dBFS threshold slider, window size, minimum gap, channel mode left/right/mix/max, chunked scan with progress UI, peak-envelope waveform with shaded gaps and click-to-preview via `<audio>`, HH:MM:SS.mmm stats for duration/total silence/%/gap count, gap list, CSV + text export and copy; graceful codec-guidance failure; pure `dbfsToAmp` / `scanWindows` / `toGaps` / `fmtTimeHMSms` / `peakEnvelope` / `summarize` covered by test/media.test.js) | **Priority:** P1 | **Effort:** M
- **Current behavior:** `silenceMap()` (line ~436) decodes the whole file with `decodeAudioData`, scans channel 0 in 0.25 s windows computing mean-absolute-value (labeled RMS in the copy), flags windows below a hard-coded `0.006` threshold, keeps gaps longer than 0.5 s, and prints stats plus a `<pre>` list of `MM:SS → MM:SS` ranges. No download.
- **Gaps / problems:**
  - Threshold (`0.006`), window (`0.25 s`), and minimum gap (`0.5 s`) are all hard-coded with no UI.
  - Only channel 0 is analyzed; mono-mixdown or max-of-channels would be more accurate for stereo podcasts.
  - `fmtTime` truncates to MM:SS — over an hour of audio is unreadable (`90:00` instead of `01:30:00`).
  - Report is screen-only: no CSV/TXT export, no copy button, no DAW-friendly EDL.
  - Whole file decoded into RAM at once; no progress indicator for large files, and no worker offload.
  - No waveform visualization to eyeball the detected gaps.
- **Target functionality:**
  - Controls: silence threshold (dBFS slider), window size, minimum gap length, channel mode (left/right/mix/max).
  - Waveform canvas render with detected gaps shaded; click a gap to preview-play it via an embedded audio element.
  - Exports: CSV (start, end, duration) and text list; optional "silence-free trimmed audio" via `OfflineAudioContext` splicing as a follow-on (large effort — mark as its own ticket).
  - HH:MM:SS.mmm timestamp formatting throughout.
  - Progress UI during decode/scan; graceful handling of undecodable files with codec guidance.
- **Dependencies / notes:** decode+scan loop should move into a Worker; the stats-card component here is duplicated in 3.2/2.3/2.4 — extract a shared `statsBar()`.

---

## 4. Subtitles & Text

### 4.1 Subtitle Reading-Speed Checker (`subtitle-speed`)
- **Category:** Text & Subtitles | **Status:** Shipped (Subtitle Studio "speed" mode: Netflix / BBC / Custom profiles with editable CPS, minimum duration and max chars/line, tag-stripped measuring with raw + clean counts, overlap cues in the issue list with neighbour index and clashing range, CPS/duration/line-length checks, stats for total + flagged cues, per-type counts, average CPS and longest cue, HH:MM:SS.mmm display, CSV report + annotated `.issues.srt` exports and a "Fix line breaks" hand-off to 4.2; pure `parseSrt` / `serializeSrt` / `stripTags` / `fmtHmsMs` / `parseTimecode` / `auditCues` / `reportCsv` / `issuesSrt` covered by test/subtitle.test.js) | **Priority:** P1 | **Effort:** S
- **Current behavior:** `subtitleCheck()` used to parse the SRT with `parseSRT()` from `utils.js` and report four stats plus a `<pre>` list, with hard-coded thresholds (CPS > 21, duration < 1 s) and no export. It is replaced by the shared Subtitle Studio engine (`subtitle-studio.js`), which owns the SRT layer for both 4.1 and 4.2.
- **Gaps / problems:**
  - 21 CPS and 1 s minimum are hard-coded; no presets (Netflix 21 CPS, BBC ~180 WPM, generic) and no custom limit input.
  - Character count includes newlines and markup — cues with `{\an8}` positioning tags or italics are measured inaccurately.
  - Overlaps are counted in a stat card but the individual overlapping cues never appear in the issue `<pre>`.
  - Report cannot be downloaded (no CSV/SRT export) or copied; `fmtTime` here shows MM:SS only, losing hour context on feature-length files.
  - Read-only: no jump-to-cue or hand-off to the line-break fixer (4.2).
- **Target functionality:**
  - Profile selector (Netflix/BBC/Custom) with editable CPS, minimum duration, and max-characters-per-line checks.
  - Strip formatting tags (`<i>`, `{\an8}`, `{\pos}`) before measuring; report both raw and clean counts.
  - Include overlap cues in the issue list with the offending time range and neighbor index.
  - Exports: CSV issue report and an annotated SRT (issues appended as `NOTE` comments or a sidecar `.issues.srt`).
  - HH:MM:SS.mmm display; "Fix line breaks" button that pre-loads the file into 4.2.
- **Dependencies / notes:** uses `parseSRT()` but there is no SRT *serializer* in `utils.js` — 4.2 hand-rolls block splitting. Phase 4 must add `parseSRT() + buildSRT()` as the single shared layer (see 4.2).

### 4.2 Subtitle Line-Break Fixer (`subtitle-linefix`)
- **Category:** Text & Subtitles | **Status:** Shipped (Subtitle Studio "fix" mode: two-pass rewrap — split at the clause punctuation nearest the midpoint, then greedy wrap, hard-cutting only when a token exceeds the limit; max chars/line 20–60, max lines 1–3 and a preserve-tags toggle; `<i>` / `{\an8}` kept as anchored spans; timecodes untouched; diff-style before/after preview with a changed-cue count; fixed `.srt` download and a "send to speed checker" reverse hand-off; pure `splitAtClause` / `wrapTokens` / `rewrapCue` / `fixCues` covered by test/subtitle.test.js) | **Priority:** P1 | **Effort:** S
- **Current behavior:** `subtitleFix()` used to split the raw text itself, join all text lines and greedily re-wrap at a hard-coded 38 characters. It is replaced by the shared Subtitle Studio "fix" mode, built on the same `parseSrt`/`serializeSrt` layer as 4.1 with a configurable two-pass rewrap, tag preservation and a diff preview.
- **Gaps / problems:**
  - 38 characters is hard-coded with no control; there is no max-lines check (a 40-char cue split into 3 lines passes silently).
  - Own parser diverges from `parseSRT()` — timing cues are matched loosely (`includes("-->")`), so malformed files are "fixed" into corrupt SRT.
  - Cue numbering is preserved only accidentally (kept as the pre-timestamp line); never re-sequenced after edits.
  - Formatting markup and existing line-break structure are destroyed (everything joined to one line first); two-line balance is never attempted.
  - No report of how many cues changed; no before/after preview; no undo; no integration with 4.1's audit results.
  - Hard-cuts mid-word when a "word" exceeds the limit (long URLs), without any ellipsis/warning.
- **Target functionality:**
  - Rebuild on the shared `parseSRT`/`buildSRT` layer; re-sequence cue numbers on export.
  - Controls: max characters/line (default 38), max lines (default 2), and an optional CPS-aware mode that shortens displayed time or flags unsplittable cues.
  - Two-pass algorithm: split at the sentence/clause punctuation nearest the midpoint, then greedy-wrap; only hard-cut when a token exceeds the limit.
  - Preserve `<i>`/`{\an8}` tags as anchored spans rather than plain text; keep original timecodes untouched.
  - Diff-style preview (changed cues highlighted) with a changed-cues count; download plus "send to speed checker" re-audit loop.
- **Dependencies / notes:** Phase 4's first task is the shared SRT layer; then 4.1 and 4.2 share threshold presets and can offer the audit→fix→re-audit loop as a combined flow.

---

## 5. Data & Contacts

### 5.1 Contact CSV Deduplicator (`contact-dedupe`)
- **Category:** Data | **Status:** Basic | **Priority:** P1 | **Effort:** M
- **Current behavior:** `contactDedupe()` (line ~664) lowercases the header row, auto-finds the first column containing "email" and the first containing "phone"/"mobile"/"cell", and dedupes with `buildContactKey()`: email (lowercased) wins, else digits-only phone, else the entire row as JSON. First occurrence is kept, duplicates are dropped, and a cleaned CSV is downloadable.
- **Gaps / problems:**
  - No preview: the user never sees the duplicate groups or which row was kept before downloading.
  - The whole-row-JSON fallback means rows with neither email nor phone are treated as unique unless *identical* — name-based dupes ("Bob Smith" vs "Robert Smith") are invisible (no fuzzy/phonetic matching, despite this being the headline use case).
  - Kept row may be the sparse one — no field-level merge (union non-empty fields from duplicates into the primary).
  - No export of the removed duplicates for manual review; no undo.
  - Single email/phone column each — tables with multiple phones/emails per row are ignored.
  - Phone normalization strips ALL non-digits, so `+91 98765 43210` and `09876543210` are treated as different (no country-code/leading-zero normalization).
- **Target functionality:**
  - Duplicate-group preview table (sortable) with checkboxes to keep/exclude each row before export.
  - Optional field-merge: union non-empty cells from duplicates into the chosen primary row.
  - Configurable matching keys: choose columns; add optional name-based pass (Soundex/Metaphone) flagged as "suggested" matches for manual confirm.
  - Smart phone normalization: strip formatting, drop leading zeros/ country code with a selected default country (E.164-ish).
  - Export both `contacts-deduped.csv` and `duplicates-removed.csv`; stats (input rows, kept, removed, merge suggestions).
- **Dependencies / notes:** shares `csvParse/csvOut` with 5.2–5.4; matching logic belongs in `utils.js` (pure, testable in Node like the existing utils).

### 5.2 CSV Column Splitter (`csv-splitter`)
- **Category:** Data | **Status:** Solid | **Priority:** P2 | **Effort:** S
- **Current behavior:** `csvTool("csv-splitter", ...)` (line ~616) renders a column select plus a delimiter text input (default `" "`, `maxlength=3`), splits each row's chosen cell with `String.split`, computes the max part count across rows, pads short rows with empty strings, names the new headers `<col>_1…<col>_n`, and downloads the restructured CSV.
- **Gaps / problems:**
  - Only one column per operation; splitting name AND address requires repeated round-trips.
  - `split()` on a multi-char delimiter treats it as an exact substring, not a regex — users typing `\s+` or `,\s*` get wrong results with no warning.
  - No trim of resulting parts (leading spaces survive a `"Last, First"` split on `,`).
  - No handling for the empty-cell case: a blank source cell yields one empty part, silently expanding columns.
  - No preview of the first rows before download; no option to keep the original column alongside the split parts.
- **Target functionality:**
  - Multi-select columns + ordered split rules (split column A on space, then column B on comma) in one pass.
  - Delimiter modes: literal string, common presets (comma/tab/semicolon/pipe), and regex with a live match count on the first rows.
  - Trim-parts toggle, keep-original toggle, per-part header naming template.
  - First-10-rows preview table before export; count of rows where the split produced fewer parts than expected.
  - Excel-friendly BOM option on CSV export.
- **Dependencies / notes:** after 5.1's preview component exists, reuse the same results-table widget here and in 5.3.

### 5.3 CSV Date Normalizer (`csv-date`)
- **Category:** Data | **Status:** Basic | **Priority:** P2 | **Effort:** S
- **Current behavior:** `csvTool("csv-date", ...)` (line ~648) offers a column select and a target format select (ISO / US / European), then maps each cell through `normalizeDate()` in `utils.js`, which understands `YYYY[-/.]M[-/.]D`, `D[-/.]M[-/.]YYYY` (day-first only when the first number is > 12, otherwise month-first), and falls back to `new Date(str)`. Unparseable values are returned unchanged. Always converts a single column.
- **Gaps / problems:**
  - Ambiguous dates (`02/03/2024`) silently default to month-first; the UI shows a generic warning rather than listing the actual ambiguous cells.
  - No multi-column selection; no whole-file scan to find date-like columns automatically.
  - Non-date text cells fall through `new Date()` which can produce surprising results (e.g. garbage that partially parses); no per-cell error count in the summary.
  - Time-of-day components are dropped without notice; no option to preserve or output datetime formats.
  - No locale-aware text month names ("15-Mar-2024", "March 15, 2024") beyond what `new Date()` happens to parse.
- **Target functionality:**
  - Auto-detect date-like columns with a checkbox list; normalize multiple columns in one pass.
  - Source-format selector per column (auto / day-first / month-first) to resolve ambiguity deterministically.
  - Pre-flight report: sample parsed values per column, list ambiguous/unparseable cells with row numbers before export.
  - Extra target formats: `YYYY/MM/DD`, `DD-MMM-YYYY`, optional time preservation (`YYYY-MM-DD HH:mm`).
  - Summary stats (converted, left-as-is, errors) in the download notice; unchanged cells highlighted in the preview.
- **Dependencies / notes:** `normalizeDate()` is pure and already Node-testable — extend it there; preview table shared with 5.2.

### 5.4 vCard (VCF) Split & Merge (`vcard`)
- **Category:** Data | **Status:** Basic | **Priority:** P1 | **Effort:** M
- **Current behavior:** `vcardTool()` (line ~676) reads all selected files, concatenates them, parses cards with `parseVCF()` (which unfolds continuation lines and extracts FN/N for a display name), then renders a scrollable list of card names with a per-card "Save .vcf" button plus a "Download All Merged" button that joins the raw card texts.
- **Gaps / problems:**
  - No dedupe or merge across files — feeding overlapping exports (Google + iPhone) produces duplicate contacts, which is the main reason people combine vCards.
  - Card inspection shows only the name; no phone/email/address fields, so users cannot tell two "John Smith" cards apart.
  - No split-by-group (e.g. `CATEGORIES`/`X-ABLabel`), no search/filter in the list.
  - Version handling: cards are passed through verbatim — a mixed 2.1/3.0 input is emitted unchanged, with no normalization or upgrade warning.
  - Embedded photos are neither shown nor mentioned; base64 `PHOTO;ENCODING=b:` blobs make the merged file huge with no strip/preserve option.
  - Very large address books render thousands of DOM buttons with no virtualization.
- **Target functionality:**
  - Contact inspector: per-card detail view (name, phones, emails, org, photo thumbnail) with search box.
  - Dedupe/merge pass using email/phone/name keys (reuse 5.1's matcher in `utils.js`), with a merge-review table and field-level union.
  - Version normalization: detect 2.1 quirks (`TEL;HOME;VOICE`, bare `N:`) and re-emit as vCard 3.0 (default) or 4.0; warn on `CHARSET` params.
  - PHOTO policy toggle: preserve / strip (with size savings report) / extract to separate files in a zip.
  - Group-based split (export one .vcf per `CATEGORIES` value) and filtered export by search query.
  - Chunked rendering for 10k+ cards; per-file card counts in the summary.
- **Dependencies / notes:** `parseVCF()` in `utils.js` should grow a structured field model (not just `raw` + `name`) — shared with any future CSV↔vCard converter; dedupe keys shared with 5.1.

---

## 6. Web, Calendar & Files

### 6.1 Chrome Bookmark Cleaner (`bookmark-cleaner`)
- **Category:** Files | **Status:** Basic | **Priority:** P2 | **Effort:** M
- **Current behavior:** `case "bookmark-cleaner"` (line ~226) parses the file as HTML with `DOMParser`, collects every `a[href]` in document order, removes later anchors whose **resolved** `a.href` was already seen, counts removals, and re-serializes the document with a `<!DOCTYPE NETSCAPE-Bookmark-file-1>` prefix for download.
- **Gaps / problems:**
  - Dedupe uses the browser-resolved `a.href` (relative URLs become `location.origin + path`), so exports containing relative or `javascript:` hrefs can be mis-keyed; `utils.js` already has `filterBookmarkLinks()` for safe URL handling but it is not used here.
  - Empty folders are never removed, although the tool's config copy claims it sanitizes them.
  - No dead-link checking at all (config admits this) and no opt-in mode; no unverified/suspicious-scheme report.
  - No per-folder or total counts (only totals), no duplicate list for review, no "keep newest/oldest duplicate" choice.
  - `ADD_DATE` attributes and favicon metadata pass through untouched — there is no option to strip privacy-sensitive timestamps.
  - The whole DOM is re-serialized via `outerHTML`; subtle serialization drift (self-closing tags, entity forms) is possible with no round-trip diff.
- **Target functionality:**
  - Dedupe on raw `getAttribute("href")` normalized (lowercase scheme/host, strip trailing slash/fragment) with a keep-strategy option (first/last/newest `ADD_DATE`).
  - Empty-folder pruning (bottom-up removal of `<DT>` folders with no remaining children) with a count report.
  - Stripping options: `ADD_DATE`/`LAST_MODIFIED`, favicons, `PERSONAL_TOOLBAR_FOLDER` flag.
  - Duplicate report (HTML/CSV export) with folder paths shown for each removed entry.
  - Optional opt-in link verification (sequential `HEAD` with concurrency limit, CORS-permitting hosts only) with a progress bar and a separate "possible dead links" report — never blocking the main clean.
  - Round-trip diff view (before/after counts per folder).
- **Dependencies / notes:** should reuse `filterBookmarkLinks()` from `utils.js` for URL normalization; the folder-tree walker it needs is also required by 6.2 — build the Netscape parser once (`bookmarks.js`), use it in both tools.

### 6.2 Bookmark → Reading List (`bookmark-reading`)
- **Category:** Files | **Status:** Solid | **Priority:** P2 | **Effort:** S
- **Current behavior:** `case "bookmark-reading"` (line ~306) extracts all `a[href]` with their text, filters them through `filterBookmarkLinks()` (http/https only), and generates a standalone `reading-list.html` with a simple styled `<ul>`; the on-screen result shows the count and a download button.
- **Gaps / problems:**
  - Folder structure from the bookmark file is discarded — everything becomes one flat list.
  - Duplicate URLs are not collapsed (unlike 6.1); the same article saved in two folders appears twice.
  - Titles are raw anchor text, which is often just the URL — no `TITLE` attribute use, no fallback cleanup.
  - No on-screen preview of the actual list (only a count); no sorting, de-duplication stats, or domain grouping.
  - No reading-order metadata (add date sorting), no "mark as read" persistence (would need localStorage — currently absent).
  - The generated page has no favicon/per-domain styling and no print stylesheet.
- **Target functionality:**
  - Preserve folder hierarchy as sections/headings; optional flatten toggle.
  - URL dedupe (reuse 6.1's normalizer) with a removed-duplicates count; group-by-domain view toggle.
  - Title fallback chain: `TITLE` attr → anchor text → hostname; strip trailing " - Site Name" noise optionally.
  - On-screen interactive preview (searchable list) before download.
  - Reading-list HTML upgrades: per-item checkbox + localStorage read-state, estimated reading-time placeholder field, print stylesheet.
  - Optional hand-off: "check dead links" button reusing 6.1's verifier.
- **Dependencies / notes:** consumes the shared Netscape bookmark parser from 6.1; `filterBookmarkLinks()` already exists and should stay the single allowlist.

### 6.3 SVG Cleanup & Minifier (`svg-cleaner`)
- **Category:** Files | **Status:** Solid | **Priority:** P2 | **Effort:** S
- **Current behavior:** `cleanSVG()` in `utils.js` (line ~128): in the browser it parses with `DOMParser`, removes `script/foreignobject/iframe/object/embed` elements, strips `on*` attributes, `javascript:`/`data:text/html`/`data:image/svg+xml` hrefs, and `inkscape:/sodipodi:/sketch:` attributes, then serializes. The Node fallback additionally strips XML comments and a wider set of editor attributes. The app shows a fixed notice and a download button.
- **Gaps / problems:**
  - Browser and Node paths diverge: **comments are removed only in the Node fallback** — browser output keeps `<!-- ... -->` and Illustrator `<!-- ILOVEBOBS -->` blocks, so size reduction in production (browser) is worse than tests suggest.
  - The result notice text is hard-coded and does not report what was actually removed or the before/after byte sizes.
  - No removal of editor metadata *elements* (`<metadata>`, `<sodipodi:namedview>`, `<flowRoot>`), no unused `<defs>`/`<style>` pruning, no `viewBox`-only optimization.
  - No path-level minification (coordinate rounding, `precision`) — config correctly admits this, but it is the biggest real size win.
  - No multi-file batch; no gzip-size estimate; invalid SVGs fail with the terse "Invalid SVG document".
  - `href` allowlist misses `data:image/png;base64` in `xlink:href` (allowed, fine) but also lets any other `data:*` URI through except the two listed subtypes.
- **Target functionality:**
  - Unify browser/Node paths: run the same pipeline in both (move comment removal and metadata-element removal into shared code), with tests proving parity.
  - Stats report: bytes before → bytes after, % saved, per-category removal counts (scripts, comments, metadata attrs, elements).
  - Extended cleaning: `<metadata>`, `<sodipodi:namedview>`, `<flowRoot>`, empty `<defs>`/`<style>`, default `xmlns` tightening, `data:*` hrefs blocked by default with an allowlist toggle.
  - Optional precision rounding for numeric path attributes (0–3 decimals) with a before/after visual diff preview.
  - Batch mode: multiple SVGs → store-only zip; gzip-size estimate per file.
  - Better error messages (line/column from the parser error where available).
- **Dependencies / notes:** `cleanSVG()` is already shared/testable in Node — keep it pure; the visual diff preview reuses the image preview component used by the Phase 1/2 image tools.

### 6.4 iCal Calendar Deduplicator (`calendar-cleaner`)
- **Category:** Files | **Status:** Basic | **Priority:** P1 | **Effort:** S
- **Current behavior:** `case "calendar-cleaner"` (line ~238) streams lines, accumulates `BEGIN:VEVENT`…`END:VEVENT` blocks, keys each block by the event text with **all whitespace removed**, and keeps the first occurrence. It then strips every VEVENT from the original text and splices the unique set back in before the first `END:VCALENDAR`.
- **Gaps / problems:**
  - The whitespace-stripped whole-block key is both too weak and too strong: it does not use `UID`/`SEQUENCE`/`RECURRENCE-ID` (so a modified recurring instance is treated as a different event, keeping both the original and the update), while cosmetic re-exports with different folding are correctly merged only by luck.
  - Only `VEVENT` is handled — `VTODO`, `VJOURNAL`, `VFREEBUSY` blocks pass through the base text but are never considered for dedupe or reported.
  - `base.replace("END:VCALENDAR", ...)` replaces only the first occurrence and assumes a well-formed file; malformed ICS (no `END:VCALENDAR`) silently loses all events.
  - No preview list of the duplicates that will be removed, no counts per calendar (multi-calendar ICS with `X-WR-CALNAME` is treated as one).
  - Timezone (`VTIMEZONE`) components pass through unexamined; overlapping-with-different-TZID events are not detected.
  - Output reassembles via string surgery rather than a component-aware rebuild — property folding for long lines is not re-applied.
- **Target functionality:**
  - Component-aware parser: split on `VCALENDAR` → components, dedupe VEVENTs by `UID` (+ `RECURRENCE-ID`) keeping the highest `SEQUENCE`/latest `LAST-MODIFIED`, with a fallback to the normalized-content key when UID is missing.
  - Report UI: table of removed duplicates (summary, DTSTART, UID, reason) with checkboxes before export; counts for VTODO/VJOURNAL left untouched.
  - Safe reconstruction: rebuild the calendar preserving VTIMEZONE, X-WR-* headers, and all non-VEVENT components; handle missing `END:VCALENDAR` with a clear error instead of data loss.
  - Correct line folding (75-octet) on output; preserve CRLF per RFC 5545.
  - Multi-event-file merge mode: dedupe across several uploaded .ics files into one output.
- **Dependencies / notes:** a minimal iCal tokenizer (fold/unfold, property params) is also needed by 6.5 — write `ical.js` as a pure `utils.js`-style module first, then refactor both tools onto it.

### 6.5 Timetable → Calendar Converter (`timetable-calendar`)
- **Category:** Files | **Status:** Basic | **Priority:** P1 | **Effort:** S
- **Current behavior:** `case "timetable-calendar"` (line ~256) parses a CSV requiring `day,start,end,title` (optional `date`), maps weekday names to numbers, computes the next occurrence of that weekday via `nextDay()`, and emits one VEVENT per row with `RRULE:FREQ=WEEKLY;COUNT=16` (hard-coded 16-week term). Times are written by calling `toISOString()` on local-time `Date` objects, so a 09:00 local class is emitted as a UTC instant — importing into any calendar shifts the time by the viewer's UTC offset.
- **Gaps / problems:**
  - **Timezone bug:** `fmt = x => x.toISOString()...` writes local times as `Z` (UTC) stamps — events land at the wrong wall-clock time for every non-UTC user. This is a correctness blocker.
  - `COUNT=16` is hard-coded; no term-length, end-date, or BYDAY control, and no support for bi-weekly/alternating schedules the config punts to "separate CSV exports".
  - `SUMMARY` has `,;` scrubbed but no RFC 5545 text escaping (`\\ , ;` rules) and no `LOCATION`/`DESCRIPTION` column support.
  - Start-times not matching `HH:MM` throw a raw TypeError (`null` destructured) instead of a friendly row-numbered error.
  - `nextDay()` uses today's date as the anchor, so the term start is nondeterministic; no "start date" column is honored beyond the optional `date`.
  - No output preview (list of generated events) before download; no per-row skip report for invalid weekdays.
- **Target functionality:**
  - Emit `DTSTART;TZID=…`/local floating times correctly (or compute proper UTC with an explicit `VTIMEZONE`/`TZID` block) — importing must land at the CSV's wall-clock time.
  - Term controls: start date, number of weeks (or until-date), `BYDAY` derived from the day column; optional `FREQ=WEEKLY;INTERVAL=2` for bi-weekly.
  - Support `location` and `description` columns; full RFC 5545 text escaping; validate `HH:MM` with row-numbered error messages.
  - Preview table (day, time, title, first occurrence) before download; report skipped rows with reasons.
  - Optional `EXDATE`/single-date override rows for holidays; sample CSV download link in the UI.
- **Dependencies / notes:** build on the pure `ical.js` module from 6.4 (tokenizer + folding + escaping); shared timecode formatting utilities can also serve 3.3/4.1.

---

*Roadmap generated from a full read of `app.js`, `utils.js`, and `site.config.js`. When a phase lands, update each tool's Status line here and note the release in the changelog.*
