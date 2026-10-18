/*
 * Sheet Studio pure-core tests (docs/TOOLS_ROADMAP.md 1.4 + 1.5)
 * Run: node --test test/sheet-geometry.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  PAPERS, IRONON_PRESETS, dpiPx, sheetPx, gridCells, autoRows,
  fitInside, packRows, targetRowHeight, frameBox, mirrorX, mirrorTransform, applyMirrorX
} = require("../sheet-studio.js").core;

const TOL = 0.02; // mm

/* ------------------------------------------------------------ DPI sizing */

test("dpiPx converts mm to pixels at 150 and 300 DPI", () => {
  assert.strictEqual(dpiPx(25.4, 300), 300);
  assert.strictEqual(dpiPx(25.4, 150), 150);
  assert.strictEqual(dpiPx(215.9, 300), 2550);   // US Letter width
  assert.strictEqual(dpiPx(279.4, 300), 3300);   // US Letter height
  assert.strictEqual(dpiPx(297, 300), 3508);     // A4 height (rounded)
});

test("sheetPx matches real print-driver pixel sizes for every paper", () => {
  assert.deepStrictEqual(sheetPx("letter", 300), { w: 2550, h: 3300 });
  assert.deepStrictEqual(sheetPx("a4", 300), { w: 2480, h: 3508 });
  assert.deepStrictEqual(sheetPx("letter", 150), { w: 1275, h: 1650 });
  assert.deepStrictEqual(sheetPx("4x6", 300), { w: 1200, h: 1800 });
  // unknown paper falls back to letter
  assert.deepStrictEqual(sheetPx("nope", 300), sheetPx("letter", 300));
});

/* ------------------------------------------------------------ grid packing */

test("gridCells fills the sheet minus margins for any rows/cols", () => {
  for (const [cols, rows] of [[1, 1], [2, 2], [3, 4], [6, 7]]) {
    const g = gridCells(PAPERS.letter, 10, 5, cols, rows);
    const last = g.cells[g.cells.length - 1];
    assert.ok(Math.abs(g.cells[0].x - 10) < TOL, "first cell starts at the margin");
    assert.ok(Math.abs(last.x + last.w - (PAPERS.letter.w - 10)) < TOL,
      `cols=${cols} closes to the right margin`);
    assert.ok(Math.abs(last.y + last.h - (PAPERS.letter.h - 10)) < TOL,
      `rows=${rows} closes to the bottom margin`);
    assert.strictEqual(g.cells.length, cols * rows);
    assert.ok(Math.abs(g.cellW - (PAPERS.letter.w - 20 - 5 * (cols - 1)) / cols) < TOL);
  }
});

test("gridCells: non-square cells on Letter 2x3 are aspect-correct rectangles", () => {
  const g = gridCells(PAPERS.letter, 10, 5, 2, 3);
  assert.ok(Math.abs(g.cellW - 95.45) < TOL);   // (195.9 - 5) / 2
  assert.ok(Math.abs(g.cellH - 83.1333) < 0.01, `cellH was ${g.cellH}`); // (259.4 - 2*5) / 3
  assert.notStrictEqual(Math.round(g.cellW), Math.round(g.cellH));
});

test("autoRows: square-ish cells give at least one row and never overflow the sheet", () => {
  const cellW = (PAPERS.letter.w - 24 - 6 * 2) / 3;
  const rows = autoRows(PAPERS.letter, 12, 6, cellW);
  assert.strictEqual(rows, 3);
  assert.ok(12 * 2 + rows * cellW + (rows - 1) * 6 <= PAPERS.letter.h + TOL);
  assert.strictEqual(autoRows(PAPERS.a4, 10, 4, 300), 1); // absurdly wide cell -> 1 row
});

/* ------------------------------------------------------------ aspect fit */

test("fitInside preserves aspect ratio (letterboxed, no crop)", () => {
  const f = fitInside(100, 100, 400, 300, false);
  assert.strictEqual(f.rot, false);
  assert.ok(Math.abs(f.w / f.h - 400 / 300) < 1e-9, "4:3 stays 4:3");
  assert.ok(Math.abs(f.w - 100) < TOL && Math.abs(f.h - 75) < TOL);
  // portrait photo in a landscape box: height binds
  const g = fitInside(120, 60, 300, 600, false);
  assert.ok(Math.abs(g.h - 60) < TOL && Math.abs(g.w - 30) < TOL);
  assert.ok(Math.abs(g.w / g.h - 0.5) < 1e-9);
});

test("fitInside autoRotate turns the photo 90 degrees only when it fills better", () => {
  // tall photo in a wide box: rotated fills the box edge to edge
  const f = fitInside(100, 50, 50, 100, true);
  assert.strictEqual(f.rot, true);
  assert.ok(Math.abs(f.w - 100) < TOL && Math.abs(f.h - 50) < TOL);
  assert.ok(Math.abs(f.w / f.h - 100 / 50) < 1e-9, "rotated result still aspect-correct");
  // square photo: rotation is a tie, so it must stay unrotated
  const g = fitInside(100, 80, 400, 400, true);
  assert.strictEqual(g.rot, false);
  // wide photo in a wide box: no rotation benefit
  const h = fitInside(100, 50, 400, 200, true);
  assert.strictEqual(h.rot, false);
});

/* ------------------------------------------------------------ margin / border */

test("frameBox insets a cell by the border on all four sides", () => {
  const f = frameBox({ x: 10, y: 10, w: 90, h: 90 }, 3);
  assert.deepStrictEqual(f, { x: 13, y: 13, w: 84, h: 84 });
  // zero border is identity
  const g = frameBox({ x: 4.5, y: 7, w: 60, h: 40 }, 0);
  assert.deepStrictEqual(g, { x: 4.5, y: 7, w: 60, h: 40 });
  // border never inverts the box
  const h = frameBox({ x: 0, y: 0, w: 10, h: 6 }, 99);
  assert.ok(h.w > 0 && h.h > 0);
});

test("frameBox + fitInside: photo never crosses the bordered frame", () => {
  const cell = { x: 10, y: 10, w: 95.45, h: 127.2 };
  const f = frameBox(cell, 4);
  const fit = fitInside(f.w, f.h, 600, 400, false);
  assert.ok(fit.w <= f.w + 1e-9 && fit.h <= f.h + 1e-9);
  const x = f.x + (f.w - fit.w) / 2, y = f.y + (f.h - fit.h) / 2;
  assert.ok(x >= f.x - 1e-9 && x + fit.w <= f.x + f.w + 1e-9, "photo inside frame horizontally");
  assert.ok(y >= f.y - 1e-9 && y + fit.h <= f.y + f.h + 1e-9, "photo inside frame vertically");
});

/* ------------------------------------------------------------ mirror transform */

test("mirrorX reflects a rect inside a page span", () => {
  assert.strictEqual(mirrorX(10, 30, 215.9), 175.9);
  assert.strictEqual(mirrorX(0, 215.9, 215.9), 0, "full-width rect maps to itself");
  // double mirror is the identity
  const once = mirrorX(20, 40, 210);
  assert.strictEqual(mirrorX(once, 40, 210), 20);
});

test("mirrorTransform maps a rect onto itself, flipping its pixels", () => {
  const t = mirrorTransform(10, 40); // cell from x=10 to x=50
  assert.strictEqual(t.sx, -1);
  assert.strictEqual(t.tx, 60);
  assert.strictEqual(applyMirrorX(t, 10), 50, "left edge -> right edge");
  assert.strictEqual(applyMirrorX(t, 50), 10, "right edge -> left edge");
  assert.strictEqual(applyMirrorX(t, 20), 40, "inner point flips");
  // consistency with the span formula: a rect centered in its own span maps to itself
  assert.strictEqual(mirrorX(10, 40, 60), 10);
});

/* ------------------------------------------------------------ auto-pack rows */

test("packRows greedily fills rows to the target height, aspect-exact", () => {
  const r = packRows([1.5, 1.5, 0.75, 0.75, 1], 190, 5, 60);
  assert.strictEqual(r.rows.length, 2);
  const [row1, row2] = r.rows;
  // row 1: two 1.5-aspect photos at h=60 -> 90 mm wide each, gap 5 => 185 <= 190
  assert.strictEqual(row1.items.length, 2);
  assert.ok(Math.abs(row1.h - 60) < TOL);
  assert.ok(Math.abs(row1.items[0].w - 90) < TOL);
  assert.strictEqual(row1.items[1].x, 95);
  // every row stays inside the printable width
  r.rows.forEach(row => {
    const right = Math.max(...row.items.map(it => it.x + it.w));
    assert.ok(right <= 190 + 1e-6, `row overflows: ${right} > 190`);
    row.items.forEach(it => assert.ok(Math.abs(it.w / it.h - [1.5, 1.5, 0.75, 0.75, 1][it.i]) < 1e-9));
  });
  // rows stack without overlap
  assert.ok(row2.y >= row1.y + row1.h - 1e-9);
  assert.ok(Math.abs(r.totalH - (row1.h + 5 + row2.h)) < 1e-6);
});

test("packRows shrinks a single over-wide photo to fit exactly", () => {
  const r = packRows([4], 190, 5, 60); // panorama wider than the sheet at h=60
  assert.strictEqual(r.rows.length, 1);
  const it = r.rows[0].items[0];
  assert.ok(Math.abs(it.w - 190) < TOL, "fills the width exactly");
  assert.ok(Math.abs(it.h - 190 / 4) < TOL, "height derived from aspect");
  assert.ok(r.totalH <= 60 + TOL);
});

test("packRows: empty input packs zero rows", () => {
  const r = packRows([], 190, 5, 60);
  assert.deepStrictEqual(r.rows, []);
  assert.strictEqual(r.totalH, 0);
});

test("targetRowHeight produces a pack that fits the page height with good fill", () => {
  const innerW = PAPERS.letter.w - 20;
  const innerH = PAPERS.letter.h - 20;
  const aspects = [1.5, 1.5, 1.5, 1.5, 0.75, 1];
  const H = targetRowHeight(aspects, innerW, innerH, 4);
  assert.ok(H > 0 && isFinite(H));
  const r = packRows(aspects, innerW, 4, H);
  assert.ok(r.totalH <= innerH + TOL, `packed rows must fit one page: ${r.totalH} <= ${innerH}`);
  assert.ok(r.rows.length >= 2, "4+ photos should form multiple rows, not one row per photo");
  // reasonable fill: at least a third of the page height is used
  assert.ok(r.totalH >= innerH * 0.33, `poor fill: ${r.totalH} of ${innerH}`);
  // everything on one page for a handful of photos
  assert.strictEqual(r.rows.reduce((a, row) => a + row.items.length, 0), aspects.length);
});

test("targetRowHeight tolerates many photos (pagination left to the caller)", () => {
  const innerW = PAPERS.letter.w - 20;
  const innerH = PAPERS.letter.h - 20;
  const aspects = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 1.5 : i % 3 === 1 ? 0.75 : 1));
  const H = targetRowHeight(aspects, innerW, innerH, 4);
  const r = packRows(aspects, innerW, 4, H);
  const placed = r.rows.reduce((a, row) => a + row.items.length, 0);
  assert.strictEqual(placed, 40, "all 40 photos are packed");
  r.rows.forEach(row => {
    const right = Math.max(...row.items.map(it => it.x + it.w));
    assert.ok(right <= innerW + 1e-6);
  });
});

/* ------------------------------------------------------------ presets */

test("iron-on presets: light mirrors, dark does not, HTV mirrors with cut lines", () => {
  assert.strictEqual(IRONON_PRESETS.light.mirror, true);
  assert.strictEqual(IRONON_PRESETS.light.cut, false);
  assert.strictEqual(IRONON_PRESETS.dark.mirror, false);
  assert.strictEqual(IRONON_PRESETS.htv.mirror, true);
  assert.strictEqual(IRONON_PRESETS.htv.cut, true);
});
