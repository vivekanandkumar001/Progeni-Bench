/*
 * Pattern Studio pure-core tests (docs/TOOLS_ROADMAP.md 1.7–1.9)
 * Run: node --test test/pattern-core.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const { core } = require("../pattern-studio.js");
const {
  resample, quantize, snapToDmc, nearestIndices, applyDither, planStitches,
  skeinEstimate, drillPitch, cmToDrills, drillsToCm, symbolFor, parseHexList,
  hexToRgb, rgbToHex, SYMBOLS
} = core;

/* Build a flat RGBA ImageData-like object filled by a per-pixel callback. */
function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const p = (y * w + x) * 4;
      data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2];
      data[p + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { data, width: w, height: h };
}

/* ---------------------------------------------------------------- resample */

test("resample: average-pools each cell (not point sampling)", () => {
  // 4x4: left half red, right half blue -> 2x2 grid of solid halves.
  const src = img(4, 4, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
  const r = resample(src, 2);
  assert.strictEqual(r.cols, 2);
  assert.strictEqual(r.rows, 2);
  const at = (cx, cy) => [r.px[(cy * 2 + cx) * 3], r.px[(cy * 2 + cx) * 3 + 1], r.px[(cy * 2 + cx) * 3 + 2]];
  assert.deepStrictEqual(at(0, 0), [255, 0, 0]);
  assert.deepStrictEqual(at(0, 1), [255, 0, 0]);
  assert.deepStrictEqual(at(1, 0), [0, 0, 255]);
  assert.deepStrictEqual(at(1, 1), [0, 0, 255]);
});

test("resample: keeps the source aspect ratio in the row count", () => {
  const src = img(40, 10, () => [10, 20, 30]);
  const r = resample(src, 20);
  assert.strictEqual(r.cols, 20);
  assert.strictEqual(r.rows, 5); // 20 * 10/40
});

test("resample: fully transparent cells average to white paper", () => {
  const src = img(2, 2, () => [0, 0, 0, 0]);
  const r = resample(src, 1);
  assert.deepStrictEqual([r.px[0], r.px[1], r.px[2]], [255, 255, 255]);
});

/* ---------------------------------------------------------------- quantize */

test("quantize: a single-colour image needs no reduction", () => {
  const px = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9]);
  const q = quantize(px, 8);
  assert.strictEqual(q.palette.length, 1);
  assert.deepStrictEqual(q.palette[0], [9, 9, 9]);
  assert.deepStrictEqual([...q.indices], [0, 0, 0]);
});

test("quantize: two clusters split into exactly two palette entries", () => {
  const px = new Uint8Array([
    250, 10, 10, 251, 11, 11, 249, 9, 9,
    10, 10, 250, 11, 11, 251, 9, 9, 249
  ]);
  const q = quantize(px, 2);
  assert.strictEqual(q.palette.length, 2);
  assert.strictEqual(q.indices.length, 6);
  // First three pixels share one entry, last three share the other.
  assert.strictEqual(q.indices[0], q.indices[1]);
  assert.strictEqual(q.indices[0], q.indices[2]);
  assert.strictEqual(q.indices[3], q.indices[4]);
  assert.strictEqual(q.indices[3], q.indices[5]);
  assert.notStrictEqual(q.indices[0], q.indices[3]);
});

test("quantize: never exceeds maxColors and is deterministic", () => {
  const n = 400;
  const px = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { px[i * 3] = (i * 7) % 256; px[i * 3 + 1] = (i * 13) % 256; px[i * 3 + 2] = (i * 29) % 256; }
  const a = quantize(px, 16);
  const b = quantize(px, 16);
  assert.ok(a.palette.length <= 16);
  assert.ok(a.palette.length > 1);
  assert.deepStrictEqual(a.palette, b.palette);
  assert.deepStrictEqual([...a.indices], [...b.indices]);
});

test("quantize: maxColors of 1 collapses everything to one colour", () => {
  const px = new Uint8Array([0, 0, 0, 255, 255, 255, 128, 128, 128]);
  const q = quantize(px, 1);
  assert.strictEqual(q.palette.length, 1);
  assert.deepStrictEqual([...q.indices], [0, 0, 0]);
});

/* ---------------------------------------------------------------- snapToDmc */

test("snapToDmc: black -> DMC 310, white -> a DMC white", () => {
  assert.strictEqual(snapToDmc([0, 0, 0]).code, "310");
  const white = snapToDmc([255, 255, 255]);
  assert.ok(["Blanc", "B5200"].includes(white.code));
});

test("snapToDmc: classic codes resolve (321 red, 666 bright red)", () => {
  assert.strictEqual(snapToDmc([199, 43, 59]).code, "321");
  assert.strictEqual(snapToDmc([227, 30, 46]).code, "666");
});

test("snapToDmc: memoises per palette object", () => {
  const a = snapToDmc([12, 34, 56]);
  const b = snapToDmc([12, 34, 56]);
  assert.strictEqual(a, b); // same cached object
});

test("snapToDmc: accepts a plain hex palette", () => {
  const pal = [{ code: "A", name: "Red", hex: "#FF0000" }, { code: "B", name: "Blue", hex: "#0000FF" }];
  assert.strictEqual(snapToDmc([250, 5, 5], pal).code, "A");
  assert.strictEqual(snapToDmc([5, 5, 250], pal).code, "B");
});

test("nearestIndices maps every pixel to the closest palette colour", () => {
  const px = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const idx = nearestIndices(px, 3, [[255, 0, 0], [0, 0, 255]]);
  assert.deepStrictEqual([...idx], [0, 0, 1]);
});

/* ---------------------------------------------------------------- dither */

test("applyDither: spreads a mid-gray across a 2-colour palette", () => {
  const cols = 8, rows = 8;
  const px = new Uint8Array(cols * rows * 3).fill(128);
  const palette = [[0, 0, 0], [255, 255, 255]];
  const idx = applyDither(px, cols, rows, palette);
  assert.strictEqual(idx.length, cols * rows);
  const used = new Set(idx);
  assert.strictEqual(used.size, 2); // both black and white appear
  assert.ok([...idx].every(v => v === 0 || v === 1));
});

test("applyDither: a single-colour palette yields a uniform index map", () => {
  const px = new Uint8Array(4 * 3).fill(200);
  const idx = applyDither(px, 2, 2, [[10, 10, 10]]);
  assert.deepStrictEqual([...idx], [0, 0, 0, 0]);
});

/* ---------------------------------------------------------------- planner */

test("planStitches: cross-stitch uses a 14-count fabric size", () => {
  const p = planStitches(20, 30, { mode: "cross-stitch" });
  assert.strictEqual(p.cells, 600);
  assert.strictEqual(p.stitches, 600);
  assert.strictEqual(p.widthIn, 2.14); // 30 / 14
  assert.strictEqual(p.heightIn, 1.43); // 20 / 14
  assert.strictEqual(p.widthCm, 5.44);
  assert.strictEqual(p.drillPitchMm, undefined);
});

test("planStitches: diamond planner maps drills to a 2.5 mm canvas", () => {
  const p = planStitches(40, 30, { mode: "diamond" });
  assert.strictEqual(p.drills, 1200);
  assert.strictEqual(p.drillPitchMm, 2.5);
  assert.strictEqual(p.canvasWcm, 7.5); // 30 * 2.5 / 10
  assert.strictEqual(p.canvasHcm, 10); // 40 * 2.5 / 10
});

test("drill pitch helpers: cmToDrills / drillsToCm round-trip", () => {
  assert.strictEqual(drillPitch, 2.5);
  assert.strictEqual(cmToDrills(30), 120);
  assert.strictEqual(cmToDrills(5), 20);
  assert.strictEqual(cmToDrills(10, 5), 20);
  assert.strictEqual(drillsToCm(120), 30);
  assert.strictEqual(drillsToCm(8), 2);
  assert.ok(cmToDrills(0) >= 1);
});

/* ---------------------------------------------------------------- skeins */

test("skeinEstimate: ~1700 stitches per skein", () => {
  assert.strictEqual(skeinEstimate(1700), 1);
  assert.strictEqual(skeinEstimate(3400), 2);
  assert.strictEqual(skeinEstimate(850), 0.5);
  assert.strictEqual(skeinEstimate(8500), 5);
  assert.strictEqual(skeinEstimate(0), 0);
  assert.strictEqual(skeinEstimate(100, 200), 0.5);
});

/* ---------------------------------------------------------------- symbols */

test("symbolFor: letters then digits, stable and unique across 64 slots", () => {
  assert.strictEqual(SYMBOLS.length, 64);
  assert.strictEqual(symbolFor(0), "A");
  assert.strictEqual(symbolFor(25), "Z");
  assert.strictEqual(symbolFor(26), "0");
  assert.strictEqual(symbolFor(5), symbolFor(5));
  assert.strictEqual(symbolFor(64), symbolFor(0)); // wraps
  const seen = new Set();
  for (let i = 0; i < 64; i++) seen.add(symbolFor(i));
  assert.strictEqual(seen.size, 64);
});

/* ---------------------------------------------------------------- hex utils */

test("hexToRgb / rgbToHex round-trip and shorthand expansion", () => {
  assert.deepStrictEqual(hexToRgb("#FF8800"), [255, 136, 0]);
  assert.deepStrictEqual(hexToRgb("f80"), [255, 136, 0]);
  assert.strictEqual(rgbToHex([255, 136, 0]), "#FF8800");
  assert.strictEqual(rgbToHex([0, 0, 0]), "#000000");
});

test("parseHexList: parses pasted hex lists and skips junk", () => {
  const list = parseHexList("#ff0000, 00ff00\n#00f; not-a-colour");
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(list[0].rgb, [255, 0, 0]);
  assert.deepStrictEqual(list[1].rgb, [0, 255, 0]);
  assert.deepStrictEqual(list[2].rgb, [0, 0, 255]);
  assert.strictEqual(list[0].code, "#1");
  assert.strictEqual(list[2].hex, "#0000FF");
});

test("parseHexList: empty input yields an empty palette", () => {
  assert.deepStrictEqual(parseHexList(""), []);
  assert.deepStrictEqual(parseHexList("nope"), []);
});
