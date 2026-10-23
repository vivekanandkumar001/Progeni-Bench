/*
 * Photo Batch Studio pure-core tests (docs/TOOLS_ROADMAP.md 2.3 / 2.4)
 * Run: node --test test/photo-batch.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  num, clamp, grayOf, downsampleGray, meanOf, stdOf,
  ahash, dhash, hamming, hashSimilarity,
  groupByHash, groupByPerceptual, recommendKeeper,
  fitInto, laplacianVariance, clipRatio, contrastOf,
  normalizeSharpness, normalizeContrast, normalizeExposure,
  compositeScore, rankImages, SCORE_WEIGHTS
} = require("../photo-batch-studio.js").core;

/* Build a flat RGBA ImageData-like object with a per-pixel colour callback. */
function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const p = (y * w + x) * 4;
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { data, width: w, height: h };
}

/* --------------------------------------------------------------- numeric */

test("num / clamp coerce and bound", () => {
  assert.strictEqual(num("12", 0), 12);
  assert.strictEqual(num("bad", 7), 7);
  assert.strictEqual(num(undefined, 3), 3);
  assert.strictEqual(clamp(5, 0, 3), 3);
  assert.strictEqual(clamp(-1, 0, 3), 0);
  assert.strictEqual(clamp(2, 0, 3), 2);
});

test("grayOf uses Rec.601 luminance and meanOf/stdOf behave", () => {
  const red = grayOf(img(2, 2, () => [255, 0, 0]));
  assert.ok(Math.abs(red[0] - 0.299 * 255) < 1e-6);
  const flat = grayOf(img(4, 4, () => [100, 100, 100]));
  assert.strictEqual(meanOf(flat), 100);
  assert.strictEqual(stdOf(flat), 0);
  const half = new Float64Array([0, 0, 255, 255]);
  assert.ok(Math.abs(meanOf(half) - 127.5) < 1e-9);
  assert.ok(Math.abs(stdOf(half) - 127.5) < 1e-9);
});

test("downsampleGray averages boxes (never point-samples)", () => {
  // 4x4, left half black / right half white -> 2x2 grey columns.
  const g = new Float64Array(16);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g[y * 4 + x] = x < 2 ? 0 : 200;
  const s = downsampleGray(g, 4, 4, 2, 2);
  assert.strictEqual(s[0], 0);
  assert.strictEqual(s[1], 200);
  assert.strictEqual(s[2], 0);
  assert.strictEqual(s[3], 200);
});

/* ---------------------------------------------------------- perceptual */

test("ahash returns a 16-hex 64-bit hash", () => {
  const gradient = img(16, 16, (x) => [x * 16, x * 16, x * 16]);
  const h = ahash(gradient, 16, 16);
  assert.strictEqual(h.length, 16);
  assert.ok(/^[0-9a-f]{16}$/.test(h));
});

test("ahash is brightness invariant (mean-relative)", () => {
  const base = img(32, 32, (x, y) => [x * 8, y * 8, (x + y) * 4]);
  const brighter = img(32, 32, (x, y) => [Math.min(255, x * 8 + 40), Math.min(255, y * 8 + 40), Math.min(255, (x + y) * 4 + 20)]);
  assert.strictEqual(ahash(base, 32, 32), ahash(brighter, 32, 32));
});

test("dhash encodes horizontal gradients (bit set when left is brighter)", () => {
  const rising = img(27, 24, (x) => [x * 9, x * 9, x * 9]);
  assert.strictEqual(dhash(rising, 27, 24), "0000000000000000");
  const falling = img(27, 24, (x) => [255 - x * 9, 255 - x * 9, 255 - x * 9]);
  assert.strictEqual(dhash(falling, 27, 24), "ffffffffffffffff");
});

test("hamming counts differing bits and tolerates missing hashes", () => {
  assert.strictEqual(hamming("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.strictEqual(hamming("0000000000000000", "ffffffffffffffff"), 64);
  assert.strictEqual(hamming("0", "f"), 4);
  assert.strictEqual(hamming(null, "f"), 64);
  assert.strictEqual(hamming("f", ""), 64);
});

test("hashSimilarity converts distance to a percentage", () => {
  assert.strictEqual(hashSimilarity("ffffffffffffffff", "ffffffffffffffff"), 100);
  assert.strictEqual(hashSimilarity("0000000000000000", "ffffffffffffffff"), 0);
  assert.ok(Math.abs(hashSimilarity("ffffffffffffffff", "7fffffffffffffff") - 98.4375) < 1e-9);
});

/* ------------------------------------------------------------- grouping */

test("groupByHash keeps groups at or above minSize, in first-seen order", () => {
  const items = [
    { name: "a", hash: "aa" },
    { name: "b", hash: "bb" },
    { name: "c", hash: "aa" },
    { name: "d", hash: "cc" }
  ];
  const g = groupByHash(items, (it) => it.hash, 2);
  assert.strictEqual(g.length, 1);
  assert.deepStrictEqual(g[0].map((x) => x.name), ["a", "c"]);
  // minSize 1 keeps every distinct key.
  assert.strictEqual(groupByHash(items, (it) => it.hash, 1).length, 3);
  // default key is `.hash` and default minSize is 2.
  assert.strictEqual(groupByHash(items).length, 1);
});

test("groupByHash ignores null keys and defaults key to .hash", () => {
  const items = [{ hash: null }, { hash: "x" }, { hash: "x" }];
  const g = groupByHash(items, undefined, 2);
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].length, 2);
});

test("groupByPerceptual clusters within the Hamming threshold only", () => {
  const a = { name: "a", phash: "0000000000000000" };
  const near = { name: "near", phash: "0000000000000003" }; // distance 2
  const far = { name: "far", phash: "ffffffffffffffff" };   // distance 64
  const groups = groupByPerceptual([a, near, far], 4, (it) => it.phash, 2);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].map((x) => x.name), ["a", "near"]);
  // A tighter threshold splits the near pair apart.
  assert.strictEqual(groupByPerceptual([a, near, far], 1, (it) => it.phash, 2).length, 0);
  // A looser threshold pulls everything together.
  assert.strictEqual(groupByPerceptual([a, near, far], 64, (it) => it.phash, 1).length, 1);
});

test("groupByPerceptual chains clusters transitively", () => {
  const items = [
    { phash: "0000000000000000" },
    { phash: "0000000000000003" },
    { phash: "0000000000000006" } // 3 bits from the middle item, 4 from the first
  ];
  const groups = groupByPerceptual(items, 3, (it) => it.phash, 2);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].length, 3);
});

/* --------------------------------------------------------- recommendKeeper */

test("recommendKeeper picks the oldest lastModified", () => {
  const files = [
    { name: "new.jpg", lastModified: 200 },
    { name: "old.jpg", lastModified: 100 },
    { name: "mid.jpg", lastModified: 150 }
  ];
  assert.strictEqual(recommendKeeper(files).name, "old.jpg");
  // The input array is not mutated.
  assert.deepStrictEqual(files.map((f) => f.name), ["new.jpg", "old.jpg", "mid.jpg"]);
});

test("recommendKeeper breaks ties by shortest then alphabetical name", () => {
  assert.strictEqual(recommendKeeper([
    { name: "long-name-copy.jpg", lastModified: 5 },
    { name: "a.jpg", lastModified: 5 }
  ]).name, "a.jpg");
  assert.strictEqual(recommendKeeper([
    { name: "bbb.jpg", lastModified: 5 },
    { name: "aaa.jpg", lastModified: 5 }
  ]).name, "aaa.jpg");
  assert.strictEqual(recommendKeeper([]), null);
  assert.strictEqual(recommendKeeper(null), null);
});

/* ---------------------------------------------------------- best-shot */

test("fitInto preserves aspect ratio, letterboxes and never upscales", () => {
  const land = fitInto(400, 200, 256);
  assert.strictEqual(land.side, 256);
  assert.strictEqual(land.w, 256);
  assert.strictEqual(land.h, 128);
  assert.strictEqual(land.x, 0);
  assert.strictEqual(land.y, 64);
  assert.ok(Math.abs(land.w / land.h - 2) < 1e-9);

  const port = fitInto(100, 400, 256);
  assert.strictEqual(port.w, 64);
  assert.strictEqual(port.h, 256);
  assert.strictEqual(port.x, 96);
  assert.strictEqual(port.y, 0);

  // Small images are not blown up (scale clamps at 1).
  const small = fitInto(100, 50, 256);
  assert.strictEqual(small.scale, 1);
  assert.strictEqual(small.w, 100);
  assert.strictEqual(small.h, 50);
});

test("laplacianVariance is zero on flat fields and high on sharp edges", () => {
  const w = 32;
  const h = 32;
  const flat = new Float64Array(w * h).fill(128);
  assert.strictEqual(laplacianVariance(flat, w, h), 0);

  const checker = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) checker[y * w + x] = (x + y) % 2 ? 255 : 0;
  const smooth = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) smooth[y * w + x] = (x / w) * 40 + 100;

  const sharp = laplacianVariance(checker, w, h);
  const blur = laplacianVariance(smooth, w, h);
  assert.ok(sharp > 0);
  assert.ok(sharp > blur);
  // Degenerate sizes are safe.
  assert.strictEqual(laplacianVariance(checker, 2, 2), 0);
});

test("clipRatio measures the clipped-pixel fraction", () => {
  assert.strictEqual(clipRatio(img(4, 4, () => [255, 255, 255])), 1);
  assert.strictEqual(clipRatio(img(4, 4, () => [0, 0, 0])), 1);
  assert.strictEqual(clipRatio(img(4, 4, () => [128, 120, 130])), 0);
  const half = img(4, 4, (x) => (x < 2 ? [255, 255, 255] : [128, 128, 128]));
  assert.ok(Math.abs(clipRatio(half) - 0.5) < 1e-9);
});

test("contrastOf is the luminance standard deviation", () => {
  assert.strictEqual(contrastOf(new Float64Array(16).fill(90)), 0);
  const half = new Float64Array([0, 0, 255, 255]);
  assert.ok(Math.abs(contrastOf(half) - 127.5) < 1e-9);
});

test("normalisation maps raw metrics into 0-1", () => {
  assert.strictEqual(normalizeSharpness(0), 0);
  assert.strictEqual(normalizeSharpness(500), 1);
  assert.strictEqual(normalizeSharpness(100000), 1);
  assert.ok(normalizeSharpness(125) > 0 && normalizeSharpness(125) < 1);

  assert.strictEqual(normalizeContrast(0), 0);
  assert.strictEqual(normalizeContrast(64), 1);
  assert.strictEqual(normalizeContrast(1000), 1);

  assert.strictEqual(normalizeExposure(0, 127.5), 1);
  assert.strictEqual(normalizeExposure(1, 127.5), 0);   // fully clipped
  assert.ok(normalizeExposure(0, 0) < 1);               // mean far from mid grey
  assert.ok(normalizeExposure(0, 0) >= 0.6);
});

test("compositeScore normalises weights and clamps components", () => {
  assert.strictEqual(compositeScore({ sharpness: 1, exposure: 1, contrast: 1 }), 100);
  assert.strictEqual(compositeScore({ sharpness: 0, exposure: 0, contrast: 0 }), 0);
  // All weight on sharpness -> score tracks sharpness alone.
  assert.strictEqual(compositeScore({ sharpness: 0.5, exposure: 1, contrast: 1 }, { sharpness: 3, exposure: 0, contrast: 0 }), 50);
  // Weights need not sum to 1.
  assert.strictEqual(compositeScore({ sharpness: 1, exposure: 0, contrast: 0 }, { sharpness: 2, exposure: 1, contrast: 1 }), 50);
  // Out-of-range inputs are clamped, a zero weight vector yields 0.
  assert.strictEqual(compositeScore({ sharpness: 9, exposure: -3, contrast: 1 }, { sharpness: 1, exposure: 0, contrast: 0 }), 100);
  assert.strictEqual(compositeScore({ sharpness: 1 }, { sharpness: 0, exposure: 0, contrast: 0 }), 0);
  assert.deepStrictEqual(SCORE_WEIGHTS, { sharpness: 0.6, exposure: 0.25, contrast: 0.15 });
});

test("rankImages sorts by score, assigns rank and does not mutate input", () => {
  const items = [
    { name: "a", score: 10 },
    { name: "b", score: 90 },
    { name: "c", score: 50 },
    { name: "d", score: 50 }
  ];
  const ranked = rankImages(items);
  assert.deepStrictEqual(ranked.map((x) => x.name), ["b", "c", "d", "a"]);
  assert.deepStrictEqual(ranked.map((x) => x.rank), [1, 2, 3, 4]);
  // Stable for equal scores (c before d, preserving input order).
  assert.deepStrictEqual(ranked.filter((x) => x.score === 50).map((x) => x.name), ["c", "d"]);
  assert.strictEqual(items[0].rank, undefined);
  assert.strictEqual(rankImages([]).length, 0);
  assert.strictEqual(compositeScore({}, {}), compositeScore({ sharpness: 0, exposure: 0, contrast: 0 }));
});

test("SCORE_WEIGHTS default is exported for the UI", () => {
  assert.deepStrictEqual(SCORE_WEIGHTS, { sharpness: 0.6, exposure: 0.25, contrast: 0.15 });
});
