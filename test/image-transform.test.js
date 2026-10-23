/*
 * Image Studio pure-core tests (docs/TOOLS_ROADMAP.md 1.3 / 1.6 / 2.1)
 * Run: node --test test/image-transform.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  MM_PER_IN, num, clamp,
  dpiPx, mmToIn, inToMm,
  BORDER_TARGETS, targetMm, borderWidthMm, borderPx, photoBox, keylineBox,
  RATIO_PRESETS, cropRect, focalFromRect, blurPad,
  mirrorMatrix, applyMatrix, mirrorSvgTransform,
  svgSize, wrapSvg, derivedName, DEFAULTS
} = require("../image-studio.js").core;

const TOL = 1e-6;

/* ------------------------------------------------------------ units / DPI */

test("dpiPx converts mm to pixels at 200 and 300 DPI", () => {
  assert.strictEqual(MM_PER_IN, 25.4);
  assert.strictEqual(dpiPx(25.4, 300), 300);
  assert.strictEqual(dpiPx(25.4, 200), 200);
  assert.strictEqual(dpiPx(101.6, 300), 1200);   // 4 in
  assert.strictEqual(dpiPx(152.4, 300), 1800);   // 6 in
  assert.strictEqual(dpiPx(210, 300), 2480);     // A4 width (rounded)
  assert.strictEqual(dpiPx(297, 300), 3508);     // A4 height (rounded)
  assert.strictEqual(dpiPx(0, 300), 0);
});

test("mmToIn / inToMm round-trip", () => {
  assert.ok(Math.abs(mmToIn(25.4) - 1) < TOL);
  assert.ok(Math.abs(inToMm(1) - 25.4) < TOL);
  assert.ok(Math.abs(inToMm(mmToIn(152.4)) - 152.4) < 1e-9);
  // non-numeric input coerces to 0 through num()
  assert.strictEqual(mmToIn("bad"), 0);
  assert.strictEqual(inToMm(undefined), 0);
});

/* ------------------------------------------------------------ border sizing */

test("targetMm resolves the standard targets in millimetres", () => {
  assert.deepStrictEqual(targetMm("4x6"), { w: 101.6, h: 152.4 });
  assert.deepStrictEqual(targetMm("5x7"), { w: 127, h: 177.8 });
  assert.deepStrictEqual(targetMm("8x10"), { w: 203.2, h: 254 });
  assert.deepStrictEqual(targetMm("8x11"), { w: 203.2, h: 279.4 });
  assert.deepStrictEqual(targetMm("a4"), { w: 210, h: 297 });
  // unknown key falls back to 4x6
  assert.deepStrictEqual(targetMm("nope"), targetMm("4x6"));
});

test("targetMm custom values clamp, defaults and invalid input are safe", () => {
  assert.deepStrictEqual(targetMm("custom", { w: 50, h: 60 }), { w: 50, h: 60 });
  assert.deepStrictEqual(targetMm("custom", { w: 0, h: -5 }), { w: 1, h: 1 });  // clamped to >= 1
  assert.deepStrictEqual(targetMm("custom", {}), { w: 100, h: 150 });          // defaults
  assert.deepStrictEqual(targetMm("custom", null), { w: 100, h: 150 });
});

test("borderWidthMm handles fixed mm and % of the shorter side", () => {
  assert.strictEqual(borderWidthMm({ value: 6, unit: "mm" }, 100, 200), 6);
  assert.strictEqual(borderWidthMm({ value: 10, unit: "%" }, 100, 200), 10);   // 10% of 100
  assert.strictEqual(borderWidthMm({ value: 10, unit: "%" }, 200, 100), 10);   // shorter side still 100
  assert.strictEqual(borderWidthMm({ value: -3, unit: "mm" }, 100, 200), 0);   // never negative
  assert.strictEqual(borderWidthMm(null, 100, 200), 6);                        // default 6mm
});

test("borderPx scales the mm border by the output DPI", () => {
  assert.strictEqual(borderPx({ value: 25.4, unit: "mm" }, 100, 200, 300), 300);
  assert.strictEqual(borderPx({ value: 25.4, unit: "mm" }, 100, 200, 200), 200);
  assert.strictEqual(borderPx({ value: 6, unit: "mm" }, 203.2, 254, 300), 71); // round(70.87)
  // 10% of a 100mm short side = 10mm -> 118px at 300dpi
  assert.strictEqual(borderPx({ value: 10, unit: "%" }, 100, 200, 300), dpiPx(10, 300));
});

test("photoBox in fit mode contains the whole photo, aspect-exact", () => {
  // landscape photo in a square target with no border
  const a = photoBox(400, 300, 1000, 1000, 0, "fit");
  assert.ok(Math.abs(a.w - 1000) < TOL && Math.abs(a.h - 750) < TOL);
  assert.ok(Math.abs(a.x - 0) < TOL && Math.abs(a.y - 125) < TOL);
  assert.ok(Math.abs(a.w / a.h - 400 / 300) < 1e-9, "aspect preserved");

  // uniform border: photo sits exactly inside (target - 2*border)
  const b = photoBox(1, 1, 200, 200, 20, "fit");
  assert.ok(Math.abs(b.w - 160) < TOL && Math.abs(b.h - 160) < TOL);
  assert.ok(Math.abs(b.x - 20) < TOL && Math.abs(b.y - 20) < TOL);

  // portrait photo in a square target
  const c = photoBox(300, 400, 1000, 1000, 0, "fit");
  assert.ok(Math.abs(c.w - 750) < TOL && Math.abs(c.h - 1000) < TOL);
  assert.ok(Math.abs(c.x - 125) < TOL && Math.abs(c.y - 0) < TOL);

  // photo always lands inside the border box
  const d = photoBox(1400, 900, 1000, 1000, 30, "fit");
  assert.ok(d.x >= 30 - TOL && d.y >= 30 - TOL);
  assert.ok(d.x + d.w <= 1000 - 30 + TOL && d.y + d.h <= 1000 - 30 + TOL);
});

test("photoBox fill mode cover-crops to the exact target and ignores the border", () => {
  const f = photoBox(400, 300, 1000, 1000, 50, "fill");
  assert.ok(Math.abs(f.w - 1000 * (400 / 300)) < 0.01 || Math.abs(f.h - 1000) < TOL);
  // cover: the scaled image is at least as big as the target in both axes
  assert.ok(f.w >= 1000 - TOL && f.h >= 1000 - TOL);
  assert.ok(f.w / f.h - (400 / 300) < 1e-9 && 400 / 300 - f.w / f.h < 1e-9, "aspect preserved");
  // border is ignored in fill mode
  const g = photoBox(400, 300, 1000, 1000, 0, "fill");
  assert.deepStrictEqual({ x: g.x, y: g.y, w: g.w, h: g.h }, { x: f.x, y: f.y, w: f.w, h: f.h });
});

test("keylineBox expands the photo rect symmetrically", () => {
  assert.deepStrictEqual(keylineBox({ x: 10, y: 20, w: 100, h: 50 }, 5), { x: 5, y: 15, w: 110, h: 60 });
  assert.deepStrictEqual(keylineBox({ x: 0, y: 0, w: 10, h: 10 }, 0), { x: 0, y: 0, w: 10, h: 10 });
  // a keyline box strictly contains the photo
  const k = keylineBox({ x: 4, y: 6, w: 8, h: 10 }, 2);
  assert.ok(k.x < 4 && k.y < 6 && k.x + k.w > 12 && k.y + k.h > 16);
});

test("BORDER_TARGETS and DEFAULTS expose the documented values", () => {
  assert.deepStrictEqual(Object.keys(BORDER_TARGETS), ["4x6", "5x7", "8x10", "8x11", "a4"]);
  assert.strictEqual(DEFAULTS.border.target, "4x6");
  assert.strictEqual(DEFAULTS.border.dpi, 300);
  assert.strictEqual(DEFAULTS.mirror.axis, "h");
  assert.strictEqual(DEFAULTS.wallpaper.fillMode, "cover");
});

/* ------------------------------------------------------------ ratio presets */

test("RATIO_PRESETS: every preset's ratio matches its stated pixels", () => {
  const keys = Object.keys(RATIO_PRESETS);
  assert.ok(keys.length >= 6, "expected several device presets");
  assert.ok(keys.includes("iphone-1170"));
  assert.ok(keys.includes("android-1080"));
  assert.ok(keys.includes("desktop-1080"));
  keys.forEach(k => {
    const p = RATIO_PRESETS[k];
    assert.ok(Math.abs(p.ratio - p.w / p.h) < 1e-12, `${k} ratio != w/h`);
    assert.ok(p.w > 0 && p.h > 0, `${k} has positive pixel size`);
    assert.ok(typeof p.label === "string" && p.label.length > 0, `${k} has a label`);
    assert.ok(typeof p.group === "string" && p.group.length > 0, `${k} has a group`);
  });
  assert.ok(Math.abs(RATIO_PRESETS["desktop-1080"].ratio - 16 / 9) < 1e-12);
});

/* ------------------------------------------------------------ wallpaper crop */

test("cropRect returns the largest rect of the requested ratio inside the source", () => {
  const sq = cropRect(1, 100, 100, 0.5, 0.5);
  assert.deepStrictEqual({ x: sq.x, y: sq.y, w: sq.w, h: sq.h }, { x: 0, y: 0, w: 100, h: 100 });

  // wide source, square crop -> width limited to srcH
  const wide = cropRect(1, 200, 100, 0.5, 0.5);
  assert.ok(Math.abs(wide.w - 100) < TOL && Math.abs(wide.h - 100) < TOL);
  assert.ok(Math.abs(wide.x - 50) < TOL && Math.abs(wide.y - 0) < TOL);

  // tall source, square crop -> height limited to srcW
  const tall = cropRect(1, 100, 200, 0.5, 0.5);
  assert.ok(Math.abs(tall.w - 100) < TOL && Math.abs(tall.h - 100) < TOL);
  assert.ok(Math.abs(tall.x - 0) < TOL && Math.abs(tall.y - 50) < TOL);

  // 9:19.5 on a landscape source
  const phone = cropRect(9 / 19.5, 4000, 3000, 0.5, 0.5);
  assert.ok(Math.abs(phone.w / phone.h - 9 / 19.5) < 1e-12, "ratio exact");
  assert.ok(phone.w <= 4000 + TOL && phone.h <= 3000 + TOL);
});

test("cropRect follows the focal point but clamps to the image edges", () => {
  // wide source: crop can slide horizontally only
  const left = cropRect(1, 200, 100, 0, 0);
  assert.ok(Math.abs(left.x - 0) < TOL, "focal 0% pins to the left edge");
  const right = cropRect(1, 200, 100, 1, 0);
  assert.ok(Math.abs(right.x - 100) < TOL, "focal 100% pins to the right edge");
  const mid = cropRect(1, 200, 100, 0.5, 0);
  assert.ok(Math.abs(mid.x - 50) < TOL);

  // every crop stays inside the source
  for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
    const r = cropRect(1, 150, 90, fx, 0.5);
    assert.ok(r.x >= -TOL && r.y >= -TOL);
    assert.ok(r.x + r.w <= 150 + TOL && r.y + r.h <= 90 + TOL, `fx=${fx} inside source`);
  }
});

test("focalFromRect is the inverse of the crop centre", () => {
  const r = cropRect(1, 200, 100, 0.5, 0.5);
  const f = focalFromRect(r, 200, 100);
  assert.ok(Math.abs(f.x - 0.5) < TOL && Math.abs(f.y - 0.5) < TOL);
  // a crop placed on the right edge reports a focal point > 0.5
  const rr = cropRect(1, 200, 100, 1, 0.5);
  const ff = focalFromRect(rr, 200, 100);
  assert.ok(ff.x > 0.5);
});

test("blurPad geometry: background covers, foreground fits, both centred", () => {
  // landscape source into a square output
  const g = blurPad(200, 100, 100, 100);
  assert.ok(g.bg.w >= 100 - TOL && g.bg.h >= 100 - TOL, "bg covers the output");
  assert.ok(g.bg.x <= TOL && g.bg.y <= TOL, "bg anchored at/behind origin");
  assert.ok(g.bg.x + g.bg.w >= 100 - TOL && g.bg.y + g.bg.h >= 100 - TOL, "bg reaches the far edge");
  assert.ok(Math.abs(g.bg.w / g.bg.h - 2) < 1e-9, "bg keeps the source aspect");
  // fg fits inside
  assert.ok(g.fg.w <= 100 + TOL && g.fg.h <= 100 + TOL);
  assert.ok(Math.abs((g.fg.x + g.fg.w / 2) - 50) < TOL && Math.abs((g.fg.y + g.fg.h / 2) - 50) < TOL, "fg centred");
  assert.ok(g.fg.scale <= g.bg.scale);

  // portrait source into a wide output
  const h = blurPad(100, 400, 400, 100);
  assert.ok(h.bg.w >= 400 - TOL && h.bg.h >= 100 - TOL);
  assert.ok(h.fg.h <= 100 + TOL && h.fg.w <= 400 + TOL);
  assert.ok(Math.abs((h.fg.y + h.fg.h / 2) - 50) < TOL);
});

/* ------------------------------------------------------------ mirror matrices */

test("mirrorMatrix horizontal / vertical / 180 flip about the frame centre", () => {
  const H = mirrorMatrix("h", 10, 20);
  assert.deepStrictEqual(H, { a: -1, b: 0, c: 0, d: 1, e: 10, f: 0 });
  assert.deepStrictEqual(applyMatrix(H, 0, 0), { x: 10, y: 0 });
  assert.deepStrictEqual(applyMatrix(H, 10, 20), { x: 0, y: 20 });

  const V = mirrorMatrix("v", 10, 20);
  assert.deepStrictEqual(V, { a: 1, b: 0, c: 0, d: -1, e: 0, f: 20 });
  assert.deepStrictEqual(applyMatrix(V, 0, 0), { x: 0, y: 20 });
  assert.deepStrictEqual(applyMatrix(V, 10, 20), { x: 10, y: 0 });

  const R = mirrorMatrix("rot180", 10, 20);
  assert.deepStrictEqual(applyMatrix(R, 0, 0), { x: 10, y: 20 });
  assert.deepStrictEqual(applyMatrix(R, 10, 20), { x: 0, y: 0 });
});

test("mirrorMatrix defaults to horizontal and every flip is its own inverse", () => {
  assert.deepStrictEqual(mirrorMatrix("weird", 10, 20), mirrorMatrix("h", 10, 20));
  for (const mode of ["h", "v", "rot180"]) {
    const m = mirrorMatrix(mode, 10, 20);
    const q = applyMatrix(m, 3, 7);
    const p = applyMatrix(m, q.x, q.y);
    assert.ok(Math.abs(p.x - 3) < TOL && Math.abs(p.y - 7) < TOL, `${mode} is an involution`);
  }
  // mappings keep the frame corners
  const v = mirrorMatrix("v", 10, 20);
  assert.deepStrictEqual(applyMatrix(v, 10, 0), { x: 10, y: 20 });
});

/* ------------------------------------------------------------ SVG passthrough */

test("mirrorSvgTransform emits the correct three transforms", () => {
  assert.strictEqual(mirrorSvgTransform("h", 100, 50), "translate(100 0) scale(-1 1)");
  assert.strictEqual(mirrorSvgTransform("v", 100, 50), "translate(0 50) scale(1 -1)");
  assert.strictEqual(mirrorSvgTransform("rot180", 100, 50), "translate(100 50) rotate(180)");
  assert.strictEqual(mirrorSvgTransform("weird", 100, 50), mirrorSvgTransform("h", 100, 50));
});

test("svgSize reads viewBox first, then width/height, then falls back", () => {
  assert.deepStrictEqual(svgSize('<svg viewBox="0 0 200 100"></svg>'), { w: 200, h: 100, viewBox: { x: 0, y: 0, w: 200, h: 100 } });
  const neg = svgSize('<svg viewBox="-10 -20 50 60"><rect/></svg>');
  assert.deepStrictEqual({ w: neg.w, h: neg.h }, { w: 50, h: 60 });
  assert.deepStrictEqual(neg.viewBox, { x: -10, y: -20, w: 50, h: 60 });
  assert.deepStrictEqual(svgSize('<svg width="300" height="150"></svg>'), { w: 300, h: 150, viewBox: null });
  const fb = svgSize("<rect/>");
  assert.deepStrictEqual({ w: fb.w, h: fb.h }, { w: 100, h: 100 });
});

test("wrapSvg mirrors the artwork with a <g transform> and preserves the body", () => {
  const src = '<svg viewBox="0 0 100 50"><rect x="1" y="2" width="3" height="4"/></svg>';
  const out = wrapSvg(src, "h");
  assert.ok(out.includes('<svg viewBox="0 0 100 50">'), "opening tag preserved");
  assert.ok(out.includes('<g class="ims-flip" transform="translate(100 0) scale(-1 1)">'), "horizontal transform present");
  assert.ok(out.includes('<rect x="1" y="2" width="3" height="4"/>'), "body preserved");
  assert.ok(out.trim().endsWith("</g></svg>"), "closed after the body");

  const v = wrapSvg(src, "v");
  assert.ok(v.includes('transform="translate(0 50) scale(1 -1)"'));
  const r = wrapSvg(src, "rot180");
  assert.ok(r.includes('transform="translate(100 50) rotate(180)"'));

  // non-SVG input is returned unchanged
  assert.strictEqual(wrapSvg("not svg", "h"), "not svg");
});

/* ------------------------------------------------------------ filenames / misc */

test("derivedName keeps the source base and appends the mode suffix", () => {
  assert.strictEqual(derivedName("photo.png", "-mirrored", "png"), "photo-mirrored.png");
  assert.strictEqual(derivedName("my file.jpg", "-wallpaper-1170x2532", "webp"), "my file-wallpaper-1170x2532.webp");
  assert.strictEqual(derivedName("a.b.png", "-bordered-300dpi", "jpg"), "a.b-bordered-300dpi.jpg");
  assert.strictEqual(derivedName("logo.svg", "-mirrored", "svg"), "logo-mirrored.svg");
  // folders are flattened and unsafe character runs collapse to one underscore
  assert.strictEqual(derivedName("C:\\user\\pic.png", "-x", "png"), "C_user_pic-x.png");
  assert.strictEqual(derivedName("a:b*c.png", "-x", "png"), "a_b_c-x.png");
  // empty/base-less input still yields a usable name
  assert.strictEqual(derivedName("", "-x", "png"), "image-x.png");
});

test("num/clamp coerce safely and bound values", () => {
  assert.strictEqual(num("12.5", 0), 12.5);
  assert.strictEqual(num("abc", 7), 7);
  assert.strictEqual(num(undefined, 7), 7);
  assert.strictEqual(clamp(5, 0, 3), 3);
  assert.strictEqual(clamp(-5, 0, 3), 0);
  assert.strictEqual(clamp(2, 0, 3), 2);
});
