# Plan — Avery 5160 / Label Maker (`labels`) — Full Rebuild

**Status:** IN PROGRESS — plan upgraded; Phase L1+L2 core implementation started
**Scope (user-confirmed):** everything — multi-line builder + live preview, full template
library, QR / Code128 barcodes, HTML + Print + PNG export, manual data entry (no CSV).
**Companion docs:** `docs/TOOLS_ROADMAP.md` §1.2 (original gap analysis — this document
supersedes it for the `labels` tool).

---

## 1. Current state (verified against code)

| # | Finding | Location |
|---|---------|----------|
| 1 | `labels(t, rs)` parses an uploaded CSV via shared `csvParse()`, shows **one** column select, builds a standalone HTML string and downloads it as `avery-labels.html`. | `app.js:819-858` |
| 2 | Template select is rendered separately in `toolPage()` **before** the file input; a page without a CSV shows only the file picker + template select. | `app.js:963-975` |
| 3 | Exactly **3 hard-coded templates**: Avery 5160 (3×10 grid, 2.625in cells, 0.125in gap), Avery 5163 (2×5, 4in cells), "A4" (`repeat(3,1fr)` + `height:30mm` — row count is **emergent**, not 8 rows; config claims "24 labels/sheet"). | `app.js:837-848` |
| 4 | Label cells always print a **dashed border** (`#cbd5e1`) — no guides toggle. | `app.js:838-847` |
| 5 | One CSV column = one flat text line; fixed font sizes (12/14px), no bold/align/vertical-center controls, long text silently clipped by `overflow:hidden`. | `app.js:838-850` |
| 6 | No live preview, no label count / sheet count report, no pagination math beyond browser's own reflow. | — |
| 7 | Output is HTML only; no PDF path, no PNG, no print button. | `app.js:856` |
| 8 | `esc()` is applied to cell text (XSS-safe). CSV data never leaves the browser. | `app.js:850` |

**What stays:** client-side-only processing, shared `ProgeniUtils.csvParse()`, the tool id /
route `/tools/labels/`, and "standalone print-ready HTML" as one of the export formats.

**Removed with the rebuild:** `labels()`, its `case "labels"`, and the `#labelTemplate`
block in `toolPage()` (dead code — only this tool used them).

---

## 2. Goals / non-goals

**Goals**

1. A `LabelStudio` module (same architecture as `StickerStudio`) that renders sheets on a
   canvas: live preview, multi-page tabs, PNG/HTML/Print exports from one shared `layout()`.
2. Exact template geometry (pitch/margin tables, closure-tested) + per-printer fine-tune
   offsets.
3. Multi-line label content: template strings with `{{Column}}` tokens + per-line styles +
   address-block presets + header-detection wizard.
4. Three data-entry paths: CSV upload, paste rows (TSV/CSV text), manual single label
   (empty data = builder text prints as one label).
5. Optional QR (Model 2) and Code128 barcodes per label, implemented inline (no libraries).
6. UX parity with Sticker Studio: undo/redo, saved presets, warnings, keyboard/a11y,
   mobile layout.

**Non-goals (this iteration)**

- Label background images / logo artwork (text + barcode only).
- Real-time CRM / Google Sheets integrations (privacy: everything stays local).
- UPC/EAN symbologies (future).

---

## 3. Feature specification

### 3.1 Data input (three paths, one row model)

| Path | UI | Notes |
|---|---|---|
| **CSV upload** | existing picker (`#file`) + drag-drop | header row = column names; `ProgeniUtils.csvParse` (RFC 4180); progress/chunking for 10k+ rows |
| **Paste rows** | textarea + "first row = header" checkbox | delimiter auto-detect: TAB, comma, semicolon, pipe; TSV keeps raw splits (Excel copy-paste works) |
| **Manual label** | no data → automatic | with `rows.length === 0` the builder text prints as **one label** (Manual mode), stated in meta bar and empty-state hint |

Row model: `{ headers: string[], rows: string[][] }`. All paths feed the same pipeline;
all-empty rows are dropped and counted (`"3 empty rows skipped"`).

**Row operations (data table):**
- Table of rows (first 200 rendered, note when truncated), **inline cell editing**
  (contenteditable, blur commits), **per-row delete**.
- **Sort** by any column, ascending/descending.
- **Dedupe** exact duplicate rows (reports `"removed N duplicates"`).
- **Clear data** (back to manual mode).
- Subset printing achieved via sort + delete (row-range picker: future).

**Mail-merge helpers:**
- **Address-block wizard:** header-name heuristics (`first/last/name/street/address/city/
  state/zip/postal/phone/email`, case- and separator-insensitive) propose a 3-line address
  block; one click applies it to the builder.
- **Builder presets:** US address (3-line), Return address (2-line small), EU address
  (`{{Street}}` / `{{Zip}} {{City}}`), Badge (name + org), Single line, Blank.

### 3.2 Multi-line label builder

- **Lines 1–6** (add/remove). Each line = **template string** + styles:
  - **Token chips:** click a header name to insert `{{ColumnName}}` at the cursor position
    of the focused line input.
  - **Sequence tokens:** `{{seq}}` → per-label counter (1, 2, 3 … across the print run),
    `{{seq:4}}` → zero-padded (`0007`), `{{seqTotal}}` → total label count.
    *Note:* plan prefix/suffix were folded into the template literal (`Tel: {{Phone}}`) —
    no separate inputs needed.
- **Per-line style:** font size (6–48 pt, 0.5 steps), Bold, Italic, alignment
  (left/center/right), **text transform** (None / UPPER CASE / Title Case).
- **Token resolution:** case-insensitive trimmed header match; missing token → empty;
  with no data (manual mode) tokens collapse and literal text prints. Unresolved tokens
  reported once as a warning chip.
- **Label-level:** font family (Arial, Helvetica, Times New Roman, Courier New, Georgia,
  Verdana — system fonts only, no webfont fetch), vertical alignment (top/middle/bottom),
  text color, overflow policy (`Auto-shrink` default | `Clip`).
  - Auto-shrink: per line, global deterministic shrink factor across **all** labels
    (longest text decides), floor 6 pt — every label in the run stays visually consistent.
- **Warnings (chips):** `"Line 2 clipped on 4 labels"`, `"12 rows use a token with no
  matching column"`, `"Template + offsets exceed the sheet"`.

### 3.3 Template library

Template record: `{ id, name, region: "letter"|"a4", cols, rows, lw, lh, mX, gX, mY, gY }`
(mm, floats; `m*` = sheet margin, `g*` = gap between labels).

| ID | Name | Sheet | Grid | Label size | Geometry status |
|----|------|-------|------|------------|-----------------|
| `avery5160` | Avery 5160 / 8160 | Letter | 3 × 10 | 66.675 × 25.4 mm (1" × 2⅝") | **verified** (arithmetic closes exactly) |
| `avery5163` | Avery 5163 / 8163 | Letter | 2 × 5 | 101.6 × 50.8 mm (4" × 2") | provisional (≈0.15" side margins per third-party spec) |
| `avery5167` | Avery 5167 return | Letter | 4 × 20 | 44.45 × 12.7 mm (1¾" × ½") | provisional (closes exactly with clean fractions) |
| `l7160` | Avery L7160 (EU) | A4 | **3 × 7 = 21** | 63.5 × 38.1 mm | **verified** (official: 21/up — old "24 / 3×8" claim was wrong, 8×38.1 doesn't fit A4!) |
| `badge5390` | Name badge 5390 | Letter | 2 × 4 | 88.9 × 57.15 mm (3½" × 2¼") | provisional |
| `custom` | Custom size | Letter / A4 | user | user (mm) | user-defined + overflow warning |

- **Geometry verification (Phase L2 gate):** every table row cross-checked against the
  official Avery/LOMOL template PDF; discrepancies resolved in favor of the vendor.
  A unit test asserts each grid **closes to the sheet edge within 0.02 mm** on both axes.
- **Calibration offsets:** `offsetX / offsetY` sliders (−3 … +3 mm, 0.5 mm step) on every
  template, persisted in presets — solves "printer feeds paper 1 mm low".
- **Test-print crosshair sheet:** one alignment page with crosses at all label centers.
- `custom`: region, W/H, cols/rows, margins, gaps exposed directly; overflow past the
  sheet edge raises a warning chip instead of silently clipping.

### 3.4 Live preview

- **Canvas renderer** at fit scale (~1100 px wide) from the same `layout()` used by
  exports — preview ≡ print by construction.
- **Guide overlay** (dashed label rects) — independent toggles: *"Show guides (preview)"*
  (default ON) and *"Include guides in export"* (default OFF).
- **Page tabs** (`‹ 1 2 3 ›`), **meta bar**
  `37 labels · 2 sheets (30 + 7) · Avery 5160 · US Letter · 300 DPI` (aria-live).
- Zoom 50–400% + drag-pan + Ctrl+wheel, fit button (shared interaction model with
  Sticker Studio). 3D tilt: not for this tool (text sheets; revisit on request).
- Empty state: *"Manual mode — builder text prints as one label. Load a CSV or paste rows
  for mail merge."*

### 3.5 QR / Code128 barcodes (inline encoders, no dependencies)

| | QR | Code128 |
|---|----|---------|
| **Source** | template string (tokens allowed: `https://{{SKU}}`), or off | same |
| **Spec** | Model 2, byte mode, EC level M, versions 1–15 | Code128 auto (B/C switching), checksum validated |
| **Renderer** | module matrix → canvas rects (preview + PNG) and SVG `<rect>` groups (HTML export) | bar widths → same |
| **Placement** | `Right` (text flows left) / `Below` / `Above`; size 10–50 mm; 4-module quiet zone | width from module count; X-dimension 0.25–1.0 mm |
| **Validation** | over capacity → warning chip + omit (never silent truncate) | empty → omitted |

Implementation: `qrEncode(text) → {size, matrix}` (GF(256) Reed–Solomon, version/ECL
tables, mask 0–7 with penalty scoring) ~500–600 LOC; `code128(text) → {widths, text}`
~150 LOC. Both **pure functions exported for `node --test`** with published test vectors.

### 3.6 Exports

| Export | Details |
|--------|---------|
| **PNG (300 DPI)** | current page / all pages (sequential downloads), paper-native resolution (2550×3300 Letter, 2480×3508 A4), guides per export toggle |
| **Print** | `#st-print-root` pattern (shared print CSS) + `@page{size:<exact>in;margin:0}` + absolutely-positioned DOM; **current sheet or all sheets** toggle; browser Print → physical / Save-as-PDF |
| **Standalone HTML** | all sheets, absolute mm positioning (no CSS grid), per-line pt sizes, embedded SVG barcodes (L3), optional guides, downloadable `.html` |
| **Sheet report** | every export path states `37 labels = 2 sheets (30 + 7)`; **"fill last sheet with blanks"** option for printers that need full sheets |

Label text lines are resolved to **positions in `layout()`** (x/y/size/align), and both the
canvas renderer and the HTML renderer consume those positions — no re-layout drift.

### 3.7 Project / presets / UX parity

- **Undo/redo** (40 entries, Ctrl+Z / Ctrl+Shift+Z) over template + builder + font +
  repeat + guides + row data (row data snapshotted when ≤1,000 rows; larger lists keep
  layout-only history to bound memory).
- **Preset save/load** (localStorage `progeni-label-preset-v1`) stores **layout only** by
  default (mailing lists are sensitive — never persisted without explicit action) +
  **Export/Import JSON** which *includes* data for cross-device moves.
- **Repeat modes:** Each row ×1 / ×2 / ×3 / ×4 (interleaved), or **First row × sheet**
  (identical-label sheets — 30 copies of one label on a 5160).
- **Flash messages** in the meta bar; aria labels on all icon buttons; contenteditable
  cells and inputs left to native text undo; module-level keydown listener registered with
  remove-before-add (no duplicate handlers across SPA navigations).
- **Hotkeys:** `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo (when not typing), `Ctrl+P` native
  print, `Ctrl+wheel` zoom, `dblclick` fit-to-view.

---

## 4. Architecture

### 4.1 Files touched

| File | Change |
|------|--------|
| `label-studio.js` **(new)** | `window.LabelStudio = { mount, TEMPLATES, SHEETS, ... }`; state, geometry, canvas renderer, builder/data UI, exports, encoders (may split `label-encoders.js` in L3) |
| `app.js` | early-return branch in `toolPage()` for `id === "labels"` (mirror of `sticker-sheet`); `bindPicker → readText → studio.addCsv`; **delete** `labels()` (819-858), `case "labels"` (330), `#labelTemplate` block (963-975) |
| `build_seo_pages.js` | `label-studio.js` in `filesToCopy` + `<script>` tag in tool-page template |
| `styles.css` | `.lbl-*` builder/table/chip/warning styles; reuses `.studio-*`, `.st-field`, `.st-page-btn`, print CSS patterns |
| `site.config.js` | `labels` entry: `desc`, `seoDesc`, `whatItDoes`, `howToUse` (5 steps), `limits` |
| `docs/TOOLS_ROADMAP.md` | §1.2 status → DONE, link here |
| `test/label-geometry.test.js` **(new)** | `node --test`: template closure invariants, delimiter detection, token/sequence resolution, transform helpers (module exports its pure core to Node) |

### 4.2 State model

```js
state = {
  template: "avery5160",
  custom: { region:"letter", lw, lh, cols, rows, mX, gX, mY, gY },
  offX: 0, offY: 0,                    // calibration mm
  headers: [], rows: [], fileName: "",
  lines: [ { tpl, size, bold, italic, align, transform } ... ≤6 ],
  font: { family, valign, color, overflow },
  repeat: "1" | "2" | "3" | "4" | "first",
  guides: true, exportGuides: false, fillBlanks: false,
  page: 0, zoom: 100,
  history: { stack: [], index: -1 }
}
```

### 4.3 Rendering pipeline

1. `layout()` → `{ T, S, capacity, pages, total, rects[], labels[] (resolved lines with
   x/y/size/align), warnings }` — **single source of truth**; applies template, offsets,
   repeat modes, token resolution (incl. seq), transforms, global shrink, valign.
2. `drawPage(ctx, L, pageIndex, pxPerMm, {guides})` → preview (fit scale) and PNG (300 DPI).
3. `renderBody(L, {guides})` → absolutely-positioned DOM sheets from the **same** rects/
   lines → Print (`#st-print-root` + injected `@page`) and HTML download (adds doctype +
   `<style>`).
4. Warnings derived in `layout()` → chips; meta bar reports counts/sheets.

### 4.4 Integration points in `app.js`

- `toolPage()` labels branch: `layout({tool, body: picker + '<div class="studio" id="studio">'})`,
  `LabelStudio.mount(...)`, `bindPicker(files => readText(files[0]).then(t => studio.addCsv(t, files[0].name)))`,
  `return` — old handler paths never run.

---

## 5. Template geometry reference (mm; Letter 215.9 × 279.4, A4 210 × 297)

| Template | mY | mX | label (w × h) | gX | gY | cols | rows | Closure check |
|----------|---:|---:|--------------:|---:|---:|-----:|-----:|---------------|
| 5160 | 12.7 | 4.7625 | 66.675 × 25.4 | 3.175 | 0 | 3 | 10 | 2×4.7625 + 3×66.675 + 2×3.175 = **215.90** ✓; 2×12.7 + 10×25.4 = **279.40** ✓ |
| 5163 | 12.7 | 3.9688 | 101.6 × 50.8 | 4.7625 | 0 | 2 | 5 | closes ✓ (provisional margins) |
| 5167 | 12.7 | 4.7625 | 44.45 × 12.7 | 9.525 | 0 | 4 | 20 | closes ✓ (provisional margins) |
| L7160 | 15.15 | 7.4 | 63.5 × 38.1 | 2.35 | 0 | 3 | 7 | 2×7.4 + 190.5 + 2×2.35 = **210.00** ✓; 2×15.15 + 7×38.1 = **297.00** ✓ |
| 5390 | 15.875 | 15.875 | 88.9 × 57.15 | 6.35 | 6.35 | 2 | 4 | closes ✓ (provisional margins) |

Sources: Avery UK (L7160 = 21/up), pieterpost/labelstudio (L7160 margins 7.4/15.1),
filesplice (5163 ≈0.15" sides), Avery.com (5371 is *business cards* — badge uses 5390
2¼"×3½" 8/up instead). Provisional rows marked in §3.3 remain subject to the Phase gate;
calibration offsets absorb residual drift.

---

## 6. Implementation phases

### Phase L1 — Core engine ✅ (target: first build)
- [x] `label-studio.js` skeleton + `toolPage` branch + build/script wiring
- [x] Template table (5 presets + custom) + `layout()` with offsets
- [x] Canvas renderer: multi-line text, per-line styles, valign, shrink/clip, guides overlay
- [x] Manual single-label mode + paste mode (delimiter auto-detect)
- [x] Page tabs, meta bar with sheet report, zoom/pan, warning chips
- [x] PNG export (current page / all pages) — pulled forward from L4

### Phase L2 — Data + builder
- [x] CSV upload (progress-free path, `csvParse`), data table: first 200 rows, inline
  edit, per-row delete, sort, dedupe, clear
- [x] Token builder UI (chips, cursor insert, ≤6 lines, per-line styles + transforms)
- [x] Sequence tokens `{{seq}}` / `{{seq:4}}` / `{{seqTotal}}`
- [x] Repeat modes (×1–×4, first-row × sheet); address presets + header wizard
- [x] Overflow warnings; unresolved-token warning; custom-overflow warning
- [x] Undo/redo + preset save/load (layout only) + JSON export/import (with data)
- [x] Print (current/all sheets) + standalone HTML export — pulled forward from L4
- [x] `test/label-geometry.test.js`: closure + parse + token tests

### Phase L3 — Barcodes
- [ ] QR encoder + published-vector tests, Code128 encoder + checksum tests
- [ ] Placement/size controls, capacity validation warnings
- [ ] SVG embedding in HTML export, canvas rects in preview/PNG

### Phase L4 — Export polish
- [ ] Test-print crosshair alignment sheet
- [ ] "Fill last sheet with blanks" option
- [ ] 10k+ row chunked parsing + progress bar
- [ ] Print-range (current sheet / all sheets) refinements if needed

### Phase L5 — Docs & QA
- [ ] `site.config.js` copy; rebuild `dist/`; roadmap §1.2 → DONE; tick this doc
- [ ] Full browser test pass (§7), mobile breakpoint, zero console errors, Firefox pass

---

## 7. Test plan

Automated (`node --test` — `test/label-geometry.test.js`):
1. Template geometry invariants: `2·mX + cols·lw + (cols−1)·gX == sheetW` and vertical
   counterpart, ±0.02 mm, for all five presets (Letter + A4).
2. Delimiter detection: TAB / semicolon / pipe / quoted-comma tables.
3. Token resolution: case-insensitive match, missing token → empty, `{{seq:3}}` → `0007`,
   `{{seqTotal}}`, manual mode (null row) collapses tokens, HTML escaping of `<script>`.
4. Text transform helpers (upper/title) preserve already-mixed input sanely.

Browser (evaluate + byte checks, mirroring sticker-sheet sessions):
- Paste 4 rows → chips appear, meta counts, canvas labels render; template switch changes
  canvas dims (Letter vs A4 ratio); custom + offsets move geometry (HTML `left:` values).
- Wizard on `First,Last,Street,City,State,Zip` headers → 3 lines applied.
- Repeat `first` on 5160 → meta `30 labels · 1 sheet`; `×2` on 4 rows → 8 labels.
- Undo/redo across builder + data ops; preset round-trip; inline edit persists.
- PNG IHDR = 2550×3300; HTML contains `@page`, `left:4.7625mm;top:12.7mm` (label 1 of
  5160), escaped text, `seq` values `1 of 8`…; Print stub + `afterprint` cleanup +
  `@page{size:8.500in 11.000in}`; zero console errors; mobile 640 px.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Provisional template margins (5163/5167/5390) | Phase-gate PDF verification + calibration offsets + custom template + closure tests |
| QR encoder bugs (subtle) | published test vectors in `node --test`; version cap 1–15 |
| Canvas vs DOM text metrics | one `layout()` produces positions for both; `textBaseline:"top"` ≈ CSS line-box top; residual ≤1px accepted (documented) |
| Large CSVs freeze UI | chunked parse (L4), table renders ≤200 rows, history skips row snapshots >1,000 rows |
| Print scaling ("Fit to page") | `@page` margin 0 + explicit docs note: print at 100% / Actual size |
| Sensitive mailing lists in storage | presets store **layout only** by default; data leaves only via explicit JSON export |
| SPA listener accumulation | remove-before-add keydown registration; `document.contains(root)` guards; sticker-studio patched with the same guard |
| Deleting `labels()` breaks another path | grep-verified: only `case "labels"` referenced it |

---

## 9. Docs / SEO updates (Phase L5)

- `desc`: "Build printable Avery 5160, 5163, 5167, L7160 and custom label sheets from CSV,
  pasted rows, or a single label — multi-line layout with column tokens, sequence numbers,
  QR/Code128 barcodes, live preview, PNG and print-ready export."
- `howToUse` (5 steps): pick template → load data (CSV / paste / manual) → build lines with
  token chips or run the address wizard → add QR/barcode (L3), tune offsets, check the
  sheet report → export PNG / Print / HTML.
- `limits`: QR capacity & EC level; no logo/background artwork; print at 100% scale;
  guide borders optional; symbologies limited to QR + Code128 (no UPC/EAN yet).
- Privacy line: CSV/mailing lists parsed locally, never uploaded; presets store layout only
  by default.

---

## 10. Future (explicitly out of this iteration)

- UPC/EAN/ISBN, PDF417; QR center logo.
- Label background images / logo placement per label.
- Envelope templates (DL, #10); row-range picker for subset printing.
- CSV merge of multiple files; encrypted local mailing-list library (opt-in).
- 3D tilt preview (shared helper extract from Sticker Studio).
