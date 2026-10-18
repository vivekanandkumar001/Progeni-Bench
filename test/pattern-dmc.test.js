/*
 * DMC floss palette data tests (docs/TOOLS_ROADMAP.md 1.7)
 * Run: node --test test/pattern-dmc.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const { DMC_PALETTE } = require("../data/dmc.js");
const { core } = require("../pattern-studio.js");

test("palette exposes at least 200 real DMC entries", () => {
  assert.ok(Array.isArray(DMC_PALETTE));
  assert.ok(DMC_PALETTE.length >= 200, "expected >= 200 entries, got " + DMC_PALETTE.length);
});

test("every entry has a non-empty code/name and a valid #RRGGBB hex", () => {
  for (const e of DMC_PALETTE) {
    assert.strictEqual(typeof e.code, "string");
    assert.ok(e.code.length > 0, "empty code");
    assert.ok(e.name && e.name.length > 0, "empty name for " + e.code);
    assert.match(e.hex, /^#[0-9A-F]{6}$/, "bad hex for " + e.code + ": " + e.hex);
  }
});

test("codes are unique across the palette", () => {
  const seen = new Set();
  for (const e of DMC_PALETTE) {
    assert.ok(!seen.has(e.code), "duplicate code " + e.code);
    seen.add(e.code);
  }
  assert.strictEqual(seen.size, DMC_PALETTE.length);
});

test("classic anchors are present (310, 321, 666, Blanc, Ecru)", () => {
  const codes = new Set(DMC_PALETTE.map(e => e.code));
  for (const c of ["310", "321", "666", "Blanc", "Ecru"]) {
    assert.ok(codes.has(c), "missing classic DMC " + c);
  }
  assert.strictEqual(DMC_PALETTE.find(e => e.code === "310").hex, "#000000");
});

test("the palette spans a wide numbered range", () => {
  const numeric = DMC_PALETTE.map(e => parseInt(e.code, 10)).filter(Number.isFinite);
  assert.ok(numeric.some(n => n >= 300 && n < 400), "expected 300s");
  assert.ok(numeric.some(n => n >= 700 && n < 800), "expected 700s");
  assert.ok(numeric.some(n => n >= 3700 && n < 3900), "expected 3700s");
  assert.ok(Math.max(...numeric) >= 3800, "expected high DMC numbers");
});

test("PatternStudio.core.PALETTE normalises entries to rgb triples", () => {
  assert.strictEqual(core.PALETTE.length, DMC_PALETTE.length);
  const black = core.PALETTE.find(e => e.code === "310");
  assert.deepStrictEqual(black.rgb, [0, 0, 0]);
  for (const e of core.PALETTE) {
    assert.strictEqual(e.rgb.length, 3);
    assert.deepStrictEqual(e.rgb, core.hexToRgb(e.hex));
  }
});
