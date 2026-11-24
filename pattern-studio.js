/*
 * Pattern Studio — shared craft-chart engine for the Cross-Stitch Pattern Maker
 * (docs/TOOLS_ROADMAP.md 1.7), Diamond Painting Pattern Maker (1.8) and the
 * Embroidery Pattern Simplifier (1.9).
 *
 * Modes (mount(el, { mode })):
 *   "cross-stitch"  — average-pooled stitch grid, median-cut + snap to the shared
 *                     DMC palette, symbol chart, 10×10 heavy grid lines, optional
 *                     Floyd–Steinberg dithering and a black-and-white symbol-only
 *                     print mode.
 *   "diamond"       — drill shapes (round / square with highlight), per-cell symbol
 *                     letter, grid every 10 drills, canvas-size planner in cm at the
 *                     standard ~2.5 mm drill pitch, per-colour drill totals.
 *   "embroidery"    — colour reduction to N threads (median-cut or a pasted custom
 *                     hex palette), optional snap-to-DMC, side-by-side original vs
 *                     smooth (non-grid) simplified preview, per-colour area % and
 *                     estimated skeins.
 *
 * Pure core (resample, quantize, applyDither, snapToDmc, symbolFor, planStitches,
 * skeinEstimate, cmToDrills, drillsToCm, parseHexList, …) is exported under
 * PatternStudio.core for node --test (test/pattern-core.test.js,
 * test/pattern-dmc.test.js).
 *
 * Exports per mode: PNG (stretched to ≥ 2000 px wide, aspect kept), a CSV
 * palette / shopping list, and Print (reuses the #st-print-root + body.st-printing
 * print pattern from label-studio.js — no custom PDF writer).
 *
 * 100% client-side. Loads after data/dmc.js and before app.js; exposes
 * window.PatternStudio. Follows the conventions of sheet-studio.js / label-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- constants */

  var MAX_COLS = 200;
  var MAX_ROWS = 200;
  var MAX_CELLS = MAX_COLS * MAX_ROWS; // 40,000 cells render cap
  var DRILL_PITCH_MM = 2.5;
  var SKEIN_STITCHES = 1700;

  // 64 stable chart symbols (letters, digits, punctuation) — one per palette index.
  var SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*()[]{}<>?/+=~^;:,.|_-";

  var PALETTE = (typeof window !== "undefined" && window.DMC_PALETTE)
    ? window.DMC_PALETTE
    : (typeof require === "function" ? require("./data/dmc.js").DMC_PALETTE : []);

  /* ---------------------------------------------------------------- helpers */

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function hexToRgb(hex) {
    var h = String(hex == null ? "" : hex).trim().replace(/^#/, "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHex(rgb) {
    var r = clamp(Math.round(num(rgb && rgb[0], 0)), 0, 255);
    var g = clamp(Math.round(num(rgb && rgb[1], 0)), 0, 255);
    var b = clamp(Math.round(num(rgb && rgb[2], 0)), 0, 255);
    var h = function (n) { return ("0" + n.toString(16).toUpperCase()).slice(-2); };
    return "#" + h(r) + h(g) + h(b);
  }

  function luminance(rgb) {
    return 0.2126 * (rgb[0] || 0) + 0.7152 * (rgb[1] || 0) + 0.0722 * (rgb[2] || 0);
  }

  // Shared DMC palette normalised to include rgb triples (built once).
  var DMC = PALETTE.map(function (e) {
    var rgb = hexToRgb(e.hex);
    return { code: e.code, name: e.name, hex: String(e.hex).toUpperCase(), rgb: rgb };
  });

  /* ---------------------------------------------------------------- pure core */

  /* Average-pool an ImageData-like object ({ data, width, height }) down to a grid
     of `cols` columns; rows follow the aspect ratio. Each cell is the alpha-weighted
     mean of its source pixels (never a single point sample), so downscaled photos
     do not alias. Fully transparent cells become white (paper/background).
     Returns { cols, rows, px } where px is a flat Uint8Array of RGB triples. */
  function resample(imgData, cols) {
    var w = Math.max(1, Math.round(num(imgData && imgData.width, 1)));
    var h = Math.max(1, Math.round(num(imgData && imgData.height, 1)));
    var data = (imgData && imgData.data) || [];
    cols = clamp(Math.round(num(cols, 1)), 1, 4000);
    var rows = Math.max(1, Math.round(cols * h / w));
    var px = new Uint8Array(cols * rows * 3);
    for (var ry = 0; ry < rows; ry++) {
      var y0 = Math.floor(ry * h / rows);
      var y1 = Math.max(y0 + 1, Math.floor((ry + 1) * h / rows));
      for (var rx = 0; rx < cols; rx++) {
        var x0 = Math.floor(rx * w / cols);
        var x1 = Math.max(x0 + 1, Math.floor((rx + 1) * w / cols));
        var r = 0, g = 0, b = 0, aSum = 0, n = 0;
        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var p = (y * w + x) * 4;
            var a = data.length > p + 3 ? data[p + 3] : 255;
            var f = a / 255;
            r += data[p] * f; g += data[p + 1] * f; b += data[p + 2] * f;
            aSum += f; n++;
          }
        }
        var o = (ry * cols + rx) * 3;
        if (!n || aSum <= 0) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; }
        else { px[o] = Math.round(r / aSum); px[o + 1] = Math.round(g / aSum); px[o + 2] = Math.round(b / aSum); }
      }
    }
    return { cols: cols, rows: rows, px: px };
  }

  /* Median-cut colour quantisation. pixels is a flat RGB triple buffer; returns
     { palette: [[r,g,b], …], indices: Uint8Array } mapping every pixel to a palette
     slot. Deterministic; exact (no reduction) when the image already has ≤ maxColors
     unique colours. */
  function quantize(pixels, maxColors) {
    maxColors = clamp(Math.round(num(maxColors, 8)), 1, 256);
    var n = Math.floor((pixels ? pixels.length : 0) / 3);
    var indices = new Uint8Array(n);
    if (!n) return { palette: [], indices: indices };
    var i;

    var seen = new Set();
    for (i = 0; i < n; i++) {
      seen.add((pixels[i * 3] << 16) | (pixels[i * 3 + 1] << 8) | pixels[i * 3 + 2]);
      if (seen.size > maxColors) break;
    }
    if (seen.size <= maxColors) {
      var colorIndex = new Map();
      var paletteExact = [];
      for (i = 0; i < n; i++) {
        var key = (pixels[i * 3] << 16) | (pixels[i * 3 + 1] << 8) | pixels[i * 3 + 2];
        var ci = colorIndex.get(key);
        if (ci === undefined) {
          ci = paletteExact.length;
          paletteExact.push([pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]]);
          colorIndex.set(key, ci);
        }
        indices[i] = ci;
      }
      return { palette: paletteExact, indices: indices };
    }

    function makeBox(list) {
      var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
      for (var k = 0; k < list.length; k++) {
        var p = list[k] * 3;
        var r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        if (r < rmin) rmin = r; if (r > rmax) rmax = r;
        if (g < gmin) gmin = g; if (g > gmax) gmax = g;
        if (b < bmin) bmin = b; if (b > bmax) bmax = b;
      }
      return {
        list: list,
        rr: rmax - rmin, gr: gmax - gmin, br: bmax - bmin,
        range: Math.max(rmax - rmin, gmax - gmin, bmax - bmin)
      };
    }

    var all = new Array(n);
    for (i = 0; i < n; i++) all[i] = i;
    var boxes = [makeBox(all)];

    while (boxes.length < maxColors) {
      var bi = -1, br = -1;
      for (i = 0; i < boxes.length; i++) {
        var bx = boxes[i];
        if (bx.list.length < 2) continue;
        if (bx.range > br) { br = bx.range; bi = i; }
      }
      if (bi < 0) break;
      var box = boxes[bi];
      var ch = (box.rr >= box.gr && box.rr >= box.br) ? 0 : ((box.gr >= box.br) ? 1 : 2);
      box.list.sort(function (a, b) { return pixels[a * 3 + ch] - pixels[b * 3 + ch]; });
      var mid = box.list.length >> 1;
      var left = box.list.slice(0, mid);
      var right = box.list.slice(mid);
      if (!left.length || !right.length) break;
      boxes.splice(bi, 1, makeBox(left), makeBox(right));
    }

    var palette = [];
    var boxOf = new Int32Array(n);
    for (i = 0; i < boxOf.length; i++) boxOf[i] = -1;
    for (i = 0; i < boxes.length; i++) {
      var list = boxes[i].list, r = 0, g = 0, b = 0;
      for (var k = 0; k < list.length; k++) {
        var pp = list[k] * 3;
        r += pixels[pp]; g += pixels[pp + 1]; b += pixels[pp + 2];
        boxOf[list[k]] = i;
      }
      palette.push([Math.round(r / list.length), Math.round(g / list.length), Math.round(b / list.length)]);
    }
    for (i = 0; i < n; i++) indices[i] = boxOf[i] < 0 ? 0 : boxOf[i];
    return { palette: palette, indices: indices };
  }

  /* Nearest palette entry to an RGB triple (squared Euclidean distance), memoised
     per palette object. Palette entries may be { code, name, hex, rgb } or
     { hex } / [r,g,b]. Returns a { code, name, hex, rgb } record. */
  var _snapCache = new WeakMap();
  function snapToDmc(rgb, palette) {
    rgb = [num(rgb && rgb[0], 0), num(rgb && rgb[1], 0), num(rgb && rgb[2], 0)];
    palette = palette && palette.length ? palette : DMC;
    if (!palette || !palette.length) {
      return { code: "", name: "Unmatched", hex: rgbToHex(rgb), rgb: rgb };
    }
    var cache = _snapCache.get(palette);
    if (!cache) { cache = new Map(); _snapCache.set(palette, cache); }
    var key = rgb[0] + "," + rgb[1] + "," + rgb[2];
    var hit = cache.get(key);
    if (hit) return hit;

    var best = null, bestRgb = null, bd = Infinity;
    for (var i = 0; i < palette.length; i++) {
      var e = palette[i];
      var pr = e.rgb ? e.rgb : (e.hex ? hexToRgb(e.hex) : (Array.isArray(e) ? e : [0, 0, 0]));
      var dr = rgb[0] - pr[0], dg = rgb[1] - pr[1], db = rgb[2] - pr[2];
      var d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = e; bestRgb = pr; }
    }
    var out = {
      code: best.code != null ? String(best.code) : "",
      name: best.name != null ? String(best.name) : "",
      hex: String(best.hex || rgbToHex(bestRgb)).toUpperCase(),
      rgb: [bestRgb[0], bestRgb[1], bestRgb[2]]
    };
    cache.set(key, out);
    return out;
  }

  /* Indices of the nearest palette colour for every pixel (flat RGB buffer). */
  function nearestIndices(pixels, n, paletteRgb) {
    var out = new Uint8Array(n);
    var len = paletteRgb ? paletteRgb.length : 0;
    for (var i = 0; i < n; i++) {
      var r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
      var best = 0, bd = Infinity;
      for (var j = 0; j < len; j++) {
        var p = paletteRgb[j];
        var dr = r - p[0], dg = g - p[1], db = b - p[2];
        var d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = j; }
      }
      out[i] = best;
    }
    return out;
  }

  /* Floyd–Steinberg re-mapping against a fixed palette. pixels is the flat RGB
     buffer, cols×rows the grid; returns Uint8Array palette indices. */
  function applyDither(pixels, cols, rows, palette) {
    cols = Math.max(1, Math.round(num(cols, 1)));
    rows = Math.max(1, Math.round(num(rows, 1)));
    var n = cols * rows;
    var buf = new Float32Array(n * 3);
    for (var i = 0; i < n * 3; i++) buf[i] = pixels[i] || 0;
    var idx = new Uint8Array(n);
    var len = palette ? palette.length : 0;
    if (!len) return idx;
    var err_r = 0, err_g = 0, err_b = 0;
    function spread(xx, yy, f) {
      if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) return;
      var oo = (yy * cols + xx) * 3;
      buf[oo] += err_r * f; buf[oo + 1] += err_g * f; buf[oo + 2] += err_b * f;
    }
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var o = (y * cols + x) * 3;
        var r = buf[o], g = buf[o + 1], b = buf[o + 2];
        var best = 0, bd = Infinity;
        for (var j = 0; j < len; j++) {
          var p = palette[j];
          var dr = r - p[0], dg = g - p[1], db = b - p[2];
          var d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = j; }
        }
        idx[y * cols + x] = best;
        err_r = r - palette[best][0];
        err_g = g - palette[best][1];
        err_b = b - palette[best][2];
        spread(x + 1, y, 7 / 16);
        spread(x - 1, y + 1, 3 / 16);
        spread(x, y + 1, 5 / 16);
        spread(x + 1, y + 1, 1 / 16);
      }
    }
    return idx;
  }

  /* Physical-size plan for a chart. cross-stitch / embroidery assume 14-count Aida
     fabric; diamond mode adds the standard ~2.5 mm drill pitch canvas size. */
  function planStitches(rows, cols, opts) {
    opts = opts || {};
    rows = Math.max(0, Math.round(num(rows, 0)));
    cols = Math.max(0, Math.round(num(cols, 0)));
    var mode = opts.mode || "cross-stitch";
    var count = num(opts.count, 14);
    var cells = rows * cols;
    var widthIn = cols / count, heightIn = rows / count;
    var out = {
      mode: mode, rows: rows, cols: cols, cells: cells,
      stitches: cells, drills: cells, fabricCount: count,
      widthIn: r2(widthIn), heightIn: r2(heightIn),
      widthCm: r2(widthIn * 2.54), heightCm: r2(heightIn * 2.54)
    };
    if (mode === "diamond") {
      out.drillPitchMm = DRILL_PITCH_MM;
      out.canvasWcm = drillsToCm(cols);
      out.canvasHcm = drillsToCm(rows);
    }
    return out;
  }

  /* Estimated skeins of floss for a stitch/drill count (~1700 stitches per skein). */
  function skeinEstimate(count, perSkein) {
    perSkein = num(perSkein, SKEIN_STITCHES);
    if (!(perSkein > 0)) perSkein = SKEIN_STITCHES;
    return Math.round(num(count, 0) / perSkein * 100) / 100;
  }

  /* DMC drill pitch (mm) and the canvas planner helpers. */
  var drillPitch = DRILL_PITCH_MM;
  function cmToDrills(cm, pitch) {
    pitch = num(pitch, DRILL_PITCH_MM);
    if (!(pitch > 0)) pitch = DRILL_PITCH_MM;
    return Math.max(1, Math.round(num(cm, 0) * 10 / pitch));
  }
  function drillsToCm(n, pitch) {
    pitch = num(pitch, DRILL_PITCH_MM);
    return r2(num(n, 0) * pitch / 10);
  }

  /* Stable symbol for a palette index (letters → digits → punctuation). */
  function symbolFor(index) {
    var i = Math.abs(Math.round(num(index, 0))) % SYMBOLS.length;
    return SYMBOLS.charAt(i);
  }

  /* Parse a pasted hex list (one per line, or comma / space / semicolon separated)
     into palette entries for the custom embroidery palette. */
  function parseHexList(text) {
    var out = [];
    String(text == null ? "" : text).split(/[\s,;]+/).forEach(function (tok) {
      var m = String(tok).trim().replace(/^#/, "");
      if (!/^[0-9a-fA-F]{3}$/.test(m) && !/^[0-9a-fA-F]{6}$/.test(m)) return;
      if (m.length === 3) m = m.charAt(0) + m.charAt(0) + m.charAt(1) + m.charAt(1) + m.charAt(2) + m.charAt(2);
      if (out.length >= 64) return;
      var hex = ("#" + m).toUpperCase();
      out.push({ code: "#" + (out.length + 1), name: "Custom " + hex, hex: hex, rgb: hexToRgb(hex) });
    });
    return out;
  }

  /* ---------------------------------------------------------------- state */

  var state = {
    mode: "cross-stitch",
    image: null,
    srcCanvas: null,
    srcSize: null,
    imgData: null,
    fileName: "",
    width: 50,
    maxColors: 16,
    snap: true,
    dither: false,
    zoom: 100,
    symbolChart: true,
    symbolOnly: false,
    heavyGrid: true,
    drillShape: "round",
    drillSymbols: true,
    drillGrid: true,
    customPalette: [],
    pattern: null,
    note: "",
    flashMsg: "",
    flashUntil: 0
  };

  var root = null;
  var _flashTimer = 0;
  var _rcToken = 0;

  function $(sel) { return root ? root.querySelector(sel) : null; }
  function $$(sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }

  function toast(msg) {
    state.flashMsg = msg; state.flashUntil = Date.now() + 2600;
    renderMeta();
    clearTimeout(_flashTimer);
    _flashTimer = setTimeout(function () { state.flashMsg = ""; state.flashUntil = 0; renderMeta(); }, 2700);
  }

  function progress(on, msg) {
    var el = $("#pat-progress");
    if (!el) return;
    el.hidden = !on;
    if (on && msg) {
      var lbl = $("#pat-progress-label");
      if (lbl) lbl.textContent = msg;
      var fill = $("#pat-progress-fill");
      if (fill) fill.style.width = "65%";
    }
  }

  function readDataURL(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = url;
    });
  }

  /* ---------------------------------------------------------------- render grid */

  /* Effective column / row count honouring the hard 200×200 = 40,000 cell cap. */
  function effectiveGrid() {
    var w = state.srcSize ? state.srcSize.w : 1;
    var h = state.srcSize ? state.srcSize.h : 1;
    var cols = clamp(Math.round(num(state.width, 50)), 20, MAX_COLS);
    var rows = Math.max(1, Math.round(cols * h / w));
    var capped = false;
    if (rows > MAX_ROWS) {
      rows = MAX_ROWS;
      cols = Math.max(1, Math.round(rows * w / h));
      capped = true;
    }
    if (cols > MAX_COLS) { cols = MAX_COLS; capped = true; }
    if (cols * rows > MAX_CELLS) { rows = Math.max(1, Math.floor(MAX_CELLS / cols)); capped = true; }
    return { cols: cols, rows: rows, capped: capped };
  }

  function prepareSource(img) {
    var maxSide = 1400;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var s = Math.min(1, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * s));
    var ch = Math.max(1, Math.round(h * s));
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, cw, ch);
    state.srcCanvas = c;
    state.srcSize = { w: cw, h: ch, ow: w, oh: h };
    state.imgData = ctx.getImageData(0, 0, cw, ch);
  }

  function buildPattern(grid) {
    grid = grid || effectiveGrid();
    var rs = resample(state.imgData, grid.cols);
    var custom = (state.mode === "embroidery" && !state.snap && state.customPalette.length) ? state.customPalette : null;
    var paletteRgb, indices, i;

    if (custom) {
      paletteRgb = custom.map(function (e) { return e.rgb; });
      indices = nearestIndices(rs.px, rs.cols * rs.rows, paletteRgb);
    } else {
      var q = quantize(rs.px, state.maxColors);
      paletteRgb = q.palette;
      indices = (state.dither && state.mode === "cross-stitch")
        ? applyDither(rs.px, rs.cols, rs.rows, q.palette)
        : q.indices;
    }

    var mapIdx = new Array(paletteRgb.length);
    var byKey = new Map();
    var entries = [];
    for (i = 0; i < paletteRgb.length; i++) {
      var rgb = paletteRgb[i], e;
      if (custom) {
        e = { code: custom[i].code, name: custom[i].name, hex: custom[i].hex, rgb: custom[i].rgb };
      } else if (state.snap) {
        var s = snapToDmc(rgb, DMC);
        e = { code: s.code, name: s.name, hex: s.hex, rgb: s.rgb };
      } else {
        var hx = rgbToHex(rgb);
        e = { code: "C" + (i + 1), name: "Custom " + hx, hex: hx, rgb: rgb };
      }
      var key = e.code + "|" + e.hex;
      if (byKey.has(key)) {
        mapIdx[i] = byKey.get(key);
      } else {
        var ei = entries.length;
        entries.push({ code: e.code, name: e.name, hex: e.hex, rgb: e.rgb, symbol: symbolFor(ei), count: 0 });
        byKey.set(key, ei);
        mapIdx[i] = ei;
      }
    }

    var cellEntry = new Uint8Array(rs.cols * rs.rows);
    for (i = 0; i < indices.length; i++) {
      var idx = mapIdx[indices[i]] || 0;
      cellEntry[i] = idx;
      entries[idx].count++;
    }
    var legend = entries.slice().sort(function (a, b) { return b.count - a.count; });

    var plan = planStitches(rs.rows, rs.cols, { mode: state.mode, count: 14 });
    state.pattern = {
      cols: rs.cols, rows: rs.rows,
      entries: entries, legend: legend, cellEntry: cellEntry,
      plan: plan, capped: grid.capped, total: rs.cols * rs.rows
    };
    state.note = grid.capped
      ? "Render capped at " + rs.cols + "×" + rs.rows + " cells (" + MAX_CELLS.toLocaleString() + " max) to keep the preview responsive."
      : "";
  }

  function recompute() {
    if (!state.srcSize) { state.pattern = null; renderAll(); return; }
    var grid = effectiveGrid();
    var token = ++_rcToken;
    if (grid.cols * grid.rows > 12000) progress(true, "Rendering " + (grid.cols * grid.rows).toLocaleString() + " cells…");
    requestAnimationFrame(function () {
      if (token !== _rcToken) return;
      try { buildPattern(grid); }
      catch (e) { toast(e && e.message ? e.message : String(e)); }
      progress(false);
      renderAll();
    });
  }

  /* ---------------------------------------------------------------- drawing */

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function chartOpts(over) {
    over = over || {};
    var symbols = over.symbols;
    if (symbols == null) {
      symbols = state.symbolOnly ||
        (state.mode === "cross-stitch" ? state.symbolChart :
          state.mode === "diamond" ? state.drillSymbols : false);
    }
    var heavyGrid = over.heavyGrid;
    if (heavyGrid == null) {
      heavyGrid = state.mode === "cross-stitch" ? state.heavyGrid :
        state.mode === "diamond" ? state.drillGrid : false;
    }
    return {
      symbols: !!symbols,
      symbolOnly: over.symbolOnly != null ? over.symbolOnly : state.symbolOnly,
      grid: over.grid != null ? over.grid : true,
      heavyGrid: !!heavyGrid
    };
  }

  function drawDrill(ctx, cx, cy, cell, e) {
    var pad = Math.max(1, cell * 0.08);
    if (state.drillShape === "square") {
      var s = cell - pad * 2;
      ctx.fillStyle = e.hex;
      roundRect(ctx, cx + pad, cy + pad, s, s, Math.max(1, s * 0.14));
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.30)";
      roundRect(ctx, cx + pad + s * 0.1, cy + pad + s * 0.08, s * 0.62, s * 0.34, Math.max(1, s * 0.12));
      ctx.fill();
    } else {
      ctx.fillStyle = e.hex;
      ctx.beginPath();
      ctx.arc(cx + cell / 2, cy + cell / 2, Math.max(0.5, cell / 2 - pad), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.32)";
      ctx.beginPath();
      ctx.arc(cx + cell / 2 - cell * 0.12, cy + cell / 2 - cell * 0.12, Math.max(0.5, cell * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawChart(ctx, cell, opts) {
    opts = chartOpts(opts);
    var p = state.pattern;
    if (!p) return;
    var cols = p.cols, rows = p.rows;
    var W = cols * cell, H = rows * cell;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var e = p.entries[p.cellEntry[y * cols + x]];
        var cx = x * cell, cy = y * cell;
        if (opts.symbolOnly) {
          // white cells, black symbols only (print mode)
        } else if (state.mode === "diamond") {
          drawDrill(ctx, cx, cy, cell, e);
        } else {
          ctx.fillStyle = e.hex;
          ctx.fillRect(cx, cy, cell, cell);
        }
        if (opts.symbols && e) {
          var light = luminance(e.rgb) > 150;
          ctx.fillStyle = opts.symbolOnly ? "#111111" : (light ? "#111111" : "#ffffff");
          ctx.font = (cell >= 16 ? "700 " : "600 ") + Math.max(8, Math.floor(cell * 0.64)) + "px ui-monospace,Consolas,monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(e.symbol, cx + cell / 2, cy + cell / 2 + cell * 0.02);
        }
      }
    }

    if (opts.grid && cell >= 5) {
      ctx.strokeStyle = "rgba(15,23,42,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= cols; gx++) { ctx.moveTo(gx * cell + 0.5, 0); ctx.lineTo(gx * cell + 0.5, H); }
      for (var gy = 0; gy <= rows; gy++) { ctx.moveTo(0, gy * cell + 0.5); ctx.lineTo(W, gy * cell + 0.5); }
      ctx.stroke();
    }
    if (opts.heavyGrid && cell >= 4) {
      ctx.strokeStyle = "rgba(15,23,42,.62)";
      ctx.lineWidth = Math.max(1.5, cell * 0.14);
      ctx.beginPath();
      for (var hx = 0; hx <= cols; hx += 10) { ctx.moveTo(hx * cell, 0); ctx.lineTo(hx * cell, H); }
      for (var hy = 0; hy <= rows; hy += 10) { ctx.moveTo(0, hy * cell); ctx.lineTo(W, hy * cell); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function paletteCanvas(cols, rows) {
    var c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    var ctx = c.getContext("2d");
    var id = ctx.createImageData(cols, rows);
    var p = state.pattern;
    for (var i = 0; i < cols * rows; i++) {
      var e = p.entries[p.cellEntry[i]];
      id.data[i * 4] = e.rgb[0];
      id.data[i * 4 + 1] = e.rgb[1];
      id.data[i * 4 + 2] = e.rgb[2];
      id.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /* ---------------------------------------------------------------- preview */

  function previewCell() {
    var p = state.pattern;
    var wantSymbols = chartOpts().symbols;
    var c = Math.floor(960 / Math.max(1, p.cols));
    c = clamp(c, 3, 26);
    if (wantSymbols) c = Math.max(c, 12);
    return c;
  }

  function drawCompare() {
    var p = state.pattern;
    var orig = $("#pat-orig-canvas");
    var sm = $("#pat-smooth-canvas");
    if (!orig || !sm || !p) return;
    var W = 360;
    var H = Math.max(1, Math.round(W * p.rows / p.cols));

    orig.width = W; orig.height = H;
    var octx = orig.getContext("2d");
    octx.fillStyle = "#ffffff"; octx.fillRect(0, 0, W, H);
    octx.imageSmoothingEnabled = true;
    var sw = state.srcCanvas.width, sh = state.srcCanvas.height;
    var s = Math.min(W / sw, H / sh);
    octx.drawImage(state.srcCanvas, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);

    sm.width = W; sm.height = H;
    var sctx = sm.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(paletteCanvas(p.cols, p.rows), 0, 0, W, H);
  }

  function renderPreview() {
    var canvas = $("#pat-canvas");
    if (!canvas) return;
    var hint = $("#pat-hint");
    if (hint) hint.hidden = !!state.pattern;
    if (!state.pattern) {
      canvas.width = 240; canvas.height = 160;
      var c0 = canvas.getContext("2d");
      c0.fillStyle = "#f8fafc"; c0.fillRect(0, 0, 240, 160);
      c0.fillStyle = "#94a3b8";
      c0.font = "13px system-ui,sans-serif";
      c0.textAlign = "center";
      c0.fillText("Upload an image to build a chart", 120, 84);
      canvas.style.width = "";
      return;
    }
    var cell = previewCell();
    canvas.width = state.pattern.cols * cell;
    canvas.height = state.pattern.rows * cell;
    drawChart(canvas.getContext("2d"), cell, chartOpts());
    canvas.style.width = state.zoom + "%";

    var vp = $("#pat-viewport");
    if (vp) vp.classList.toggle("can-scroll", state.zoom > 100);

    var cmp = $("#pat-compare");
    if (cmp) {
      cmp.hidden = state.mode !== "embroidery";
      if (state.mode === "embroidery") drawCompare();
    }
  }

  /* ---------------------------------------------------------------- legend / meta */

  function legendHtml(compact) {
    var p = state.pattern;
    if (!p) return "";
    var total = p.total || 1;
    var isDrill = state.mode === "diamond";
    var unit = isDrill ? "drills" : "stitches";
    var rows = p.legend.map(function (e) {
      var pct = total ? (e.count / total * 100) : 0;
      var sk = skeinEstimate(e.count);
      var skTxt = "≈ " + (isDrill ? sk.toFixed(2) : Math.ceil(sk)) + " skein" + (Math.ceil(sk) === 1 ? "" : "s");
      return '<div class="pat-leg-item' + (compact ? " compact" : "") + '">' +
        '<span class="pat-sw" style="background:' + esc(e.hex) + '"></span>' +
        '<span class="pat-leg-sym" title="Chart symbol">' + esc(e.symbol) + "</span>" +
        '<span class="pat-leg-code">' + esc(e.code) + "</span>" +
        '<span class="pat-leg-name">' + esc(e.name) + "</span>" +
        '<span class="pat-leg-count">' + e.count.toLocaleString() + " " + unit + " · " + pct.toFixed(1) + "% · " + skTxt + "</span>" +
        "</div>";
    }).join("");
    return '<div class="pat-legend-head"><strong>' + (isDrill ? "Drill legend" : "Floss legend") + "</strong>" +
      "<span>" + p.legend.length + " colours · " + (p.total || 0).toLocaleString() + " " + unit +
      (isDrill ? " · total " + (p.total || 0).toLocaleString() + " drills" : "") + "</span></div>" +
      '<div class="pat-legend-grid">' + rows + "</div>";
  }

  function renderLegend() {
    var box = $("#pat-legend");
    if (!box) return;
    box.innerHTML = legendHtml(false);
  }

  function renderMeta() {
    ["#pat-png", "#pat-smooth", "#pat-csv", "#pat-print"].forEach(function (sel) {
      var b = $(sel);
      if (b) b.disabled = !state.pattern;
    });
    var el = $("#pat-meta");
    if (!el) return;
    if (state.flashMsg && Date.now() < state.flashUntil) { el.textContent = state.flashMsg; return; }
    if (!state.pattern) {
      el.textContent = state.fileName
        ? "Ready — " + state.fileName
        : "Upload an image to generate a chart.";
      return;
    }
    var p = state.pattern, plan = p.plan;
    var total = p.total || 1;
    var parts = [];
    parts.push(p.cols + "×" + p.rows + (state.mode === "diamond" ? " drills" : " cells"));
    if (state.mode === "diamond") {
      parts.push("canvas ≈ " + plan.canvasWcm + "×" + plan.canvasHcm + " cm @ " + drillPitch + " mm");
      parts.push(p.total.toLocaleString() + " drills");
    } else {
      parts.push("14-ct ≈ " + plan.widthIn + "×" + plan.heightIn + " in (" + plan.widthCm + "×" + plan.heightCm + " cm)");
      parts.push(p.total.toLocaleString() + " stitches");
    }
    parts.push(p.legend.length + " colours");
    if (state.snap) parts.push("DMC-snapped");
    var est = skeinEstimate(p.total);
    parts.push("≈ " + Math.ceil(est) + " skeins");
    if (state.note) parts.push("⚠ " + state.note);
    el.textContent = parts.join(" · ");
  }

  function syncControls() {
    var set = function (sel, v) { var el = $(sel); if (el) el.value = v; };
    var chk = function (sel, v) { var el = $(sel); if (el) el.checked = v; };
    set("#pat-width", state.width);
    set("#pat-colors", state.maxColors);
    chk("#pat-snap", state.snap);
    chk("#pat-dither", state.dither);
    chk("#pat-symbols", state.symbolChart);
    chk("#pat-symbolonly", state.symbolOnly);
    chk("#pat-heavy", state.heavyGrid);
    set("#pat-drillshape", state.drillShape);
    chk("#pat-drillsym", state.drillSymbols);
    chk("#pat-drillgrid", state.drillGrid);
    var wv = $("#pat-width-v"); if (wv) wv.textContent = state.width + (state.mode === "diamond" ? " drills" : " stitches");
    var cv = $("#pat-colors-v"); if (cv) cv.textContent = state.maxColors + " colours";
    var zr = $("#pat-zoom"); if (zr) zr.textContent = state.zoom + "%";
  }

  function renderAll() {
    renderPreview();
    renderLegend();
    renderMeta();
    syncControls();
  }

  /* ---------------------------------------------------------------- exports */

  function csvText() {
    var p = state.pattern;
    if (!p) return "";
    var total = p.total || 1;
    var lines = ["Code,Name,Hex,Count,Percent,Skeins"];
    p.legend.forEach(function (e) {
      var name = /[",\n]/.test(e.name) ? '"' + e.name.replace(/"/g, '""') + '"' : e.name;
      lines.push([e.code, name, e.hex, e.count, (e.count / total * 100).toFixed(2), skeinEstimate(e.count)].join(","));
    });
    return lines.join("\n");
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function chartCanvas(minWidth) {
    var p = state.pattern;
    var opts = chartOpts();
    var minCell = opts.symbols ? 10 : 4;
    var cell = Math.max(minCell, Math.ceil(minWidth / p.cols));
    var W = Math.max(minWidth, Math.round(p.cols * cell));
    var H = Math.max(1, Math.round(p.rows * (W / p.cols)));
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    drawChart(c.getContext("2d"), W / p.cols, chartOpts());
    return c;
  }

  function exportPNG() {
    var p = state.pattern;
    if (!p) { toast("Upload an image first"); return Promise.resolve(null); }
    var c = chartCanvas(2000);
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); });
  }

  function exportSmoothPNG() {
    var p = state.pattern;
    if (!p) { toast("Upload an image first"); return Promise.resolve(null); }
    var src = paletteCanvas(p.cols, p.rows);
    var W = Math.max(2000, p.cols * 6);
    var H = Math.max(1, Math.round(W * p.rows / p.cols));
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, W, H);
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); });
  }

  function afterPrintCleanup() {
    var pr = document.getElementById("pat-print-root");
    if (pr) pr.remove();
    document.body.classList.remove("st-printing");
    var ps = document.getElementById("pat-page-style");
    if (ps) ps.remove();
    window.removeEventListener("afterprint", afterPrintCleanup);
  }

  function printChart() {
    var p = state.pattern;
    if (!p) { toast("Upload an image first"); return; }
    var c = chartCanvas(1600);
    var old = document.getElementById("pat-print-root");
    if (old) old.remove();
    var pr = document.createElement("div");
    pr.id = "pat-print-root";
    var modeName = state.mode === "cross-stitch" ? "Cross-stitch chart" :
      state.mode === "diamond" ? "Diamond painting chart" : "Embroidery pattern";
    pr.innerHTML =
      '<header class="pat-print-head"><h1>' + modeName + "</h1>" +
      "<p>" + esc(state.fileName || "pattern") + " · " + p.cols + "×" + p.rows + " · " +
      p.legend.length + " colours · " + (state.snap ? "DMC palette" : "custom palette") + "</p></header>" +
      '<div class="pat-print-chart"></div>' +
      '<div class="pat-print-legend">' + legendHtml(true) + "</div>";
    pr.querySelector(".pat-print-chart").appendChild(c);
    document.body.appendChild(pr);

    var ps = document.getElementById("pat-page-style");
    if (!ps) {
      ps = document.createElement("style");
      ps.id = "pat-page-style";
      document.head.appendChild(ps);
    }
    ps.textContent = "@page{size:auto;margin:12mm}\n" +
      "#pat-print-root{display:block;color:#000;font-family:system-ui,sans-serif}\n" +
      "#pat-print-root h1{font-size:18pt;margin:0 0 4pt}\n" +
      "#pat-print-root p{font-size:10pt;margin:0 0 10pt;color:#333}\n" +
      "#pat-print-root canvas{width:100%;height:auto;display:block;border:1px solid #999}\n" +
      "#pat-print-root .pat-legend-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4pt;margin-top:10pt}\n" +
      "#pat-print-root .pat-leg-item{display:flex;gap:6pt;align-items:center;font-size:9pt}\n" +
      "#pat-print-root .pat-sw{width:12pt;height:12pt;border:1px solid #555;display:inline-block}";
    document.body.classList.add("st-printing");
    window.removeEventListener("afterprint", afterPrintCleanup);
    window.addEventListener("afterprint", afterPrintCleanup);
    window.print();
  }

  /* ---------------------------------------------------------------- controls */

  function bindControls() {
    var on = function (sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); };

    on("#pat-width", "input", function (e) {
      state.width = clamp(Math.round(num(e.target.value, 50)), 20, MAX_COLS);
      var v = $("#pat-width-v");
      if (v) v.textContent = state.width + (state.mode === "diamond" ? " drills" : " stitches");
      recompute();
    });
    on("#pat-colors", "input", function (e) {
      state.maxColors = clamp(Math.round(num(e.target.value, 16)), 2, 64);
      var v = $("#pat-colors-v");
      if (v) v.textContent = state.maxColors + " colours";
      recompute();
    });
    on("#pat-snap", "change", function (e) { state.snap = !!e.target.checked; recompute(); });
    on("#pat-dither", "change", function (e) { state.dither = !!e.target.checked; recompute(); });
    on("#pat-symbols", "change", function (e) { state.symbolChart = !!e.target.checked; renderAll(); });
    on("#pat-symbolonly", "change", function (e) { state.symbolOnly = !!e.target.checked; renderAll(); });
    on("#pat-heavy", "change", function (e) { state.heavyGrid = !!e.target.checked; renderAll(); });
    on("#pat-drillshape", "change", function (e) { state.drillShape = e.target.value === "square" ? "square" : "round"; renderAll(); });
    on("#pat-drillsym", "change", function (e) { state.drillSymbols = !!e.target.checked; renderAll(); });
    on("#pat-drillgrid", "change", function (e) { state.drillGrid = !!e.target.checked; renderAll(); });

    on("#pat-canvas-apply", "click", function () {
      var inp = $("#pat-canvas-cm");
      var cm = num(inp ? inp.value : 0, 0);
      if (!(cm > 0)) { toast("Enter a canvas width in cm"); return; }
      var drills = cmToDrills(cm);
      state.width = clamp(drills, 20, MAX_COLS);
      syncControls();
      recompute();
      toast("Canvas " + cm + " cm → " + state.width + " drills wide (" + drillPitch + " mm pitch)");
    });

    on("#pat-palette-apply", "click", function () {
      var ta = $("#pat-palette");
      var list = parseHexList(ta ? ta.value : "");
      if (list.length < 2) { toast("Paste at least 2 hex colours (e.g. #C72B3B)"); return; }
      state.customPalette = list;
      state.snap = false;
      syncControls();
      recompute();
      toast("Custom palette applied (" + list.length + " colours)");
    });
    on("#pat-palette-clear", "click", function () {
      state.customPalette = [];
      var ta = $("#pat-palette");
      if (ta) ta.value = "";
      toast("Custom palette cleared");
      recompute();
    });

    on("#pat-zoom-out", "click", function () { state.zoom = clamp(state.zoom - 25, 50, 400); renderAll(); });
    on("#pat-zoom-in", "click", function () { state.zoom = clamp(state.zoom + 25, 50, 400); renderAll(); });
    on("#pat-zoom-fit", "click", function () { state.zoom = 100; renderAll(); });

    on("#pat-png", "click", function () {
      exportPNG().then(function (blob) {
        if (!blob) return;
        download(blob, "pattern-" + state.mode + "-chart.png");
        toast("PNG downloaded");
      });
    });
    on("#pat-smooth", "click", function () {
      exportSmoothPNG().then(function (blob) {
        if (!blob) return;
        download(blob, "embroidery-simplified.png");
        toast("Simplified PNG downloaded");
      });
    });
    on("#pat-csv", "click", function () {
      var text = csvText();
      if (!text) { toast("Nothing to export yet"); return; }
      download(new Blob([text], { type: "text/csv" }), "pattern-" + state.mode + "-palette.csv");
      toast("CSV shopping list downloaded");
    });
    on("#pat-print", "click", printChart);
    on("#pat-add", "click", function () { var f = $("#file"); if (f) f.click(); });

    var vp = $("#pat-viewport");
    if (vp) {
      var drag = null;
      vp.addEventListener("pointerdown", function (e) {
        if (state.zoom <= 100) return;
        drag = { sx: e.clientX, sy: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
        vp.setPointerCapture(e.pointerId);
        vp.classList.add("grabbing");
      });
      vp.addEventListener("pointermove", function (e) {
        if (!drag) return;
        vp.scrollLeft = drag.sl - (e.clientX - drag.sx);
        vp.scrollTop = drag.st - (e.clientY - drag.sy);
      });
      var end = function () { drag = null; vp.classList.remove("grabbing"); };
      vp.addEventListener("pointerup", end);
      vp.addEventListener("pointercancel", end);
    }
  }

  /* ---------------------------------------------------------------- file intake */

  function addFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      return f && f.type && f.type.indexOf("image/") === 0;
    });
    if (!list.length) { toast("No readable image found — use PNG, JPEG or WebP."); return Promise.resolve(0); }
    var f = list[0];
    progress(true, "Loading image…");
    return readDataURL(f).then(function (url) {
      return loadImage(url);
    }).then(function (img) {
      if (!img.naturalWidth) throw new Error("That image has no usable pixel data");
      state.image = img;
      state.fileName = f.name || "image";
      prepareSource(img);
      progress(false);
      recompute();
      if (list.length > 1) toast("Using the first of " + list.length + " images");
      return 1;
    }).catch(function (e) {
      progress(false);
      toast(e && e.message ? e.message : String(e));
      return 0;
    });
  }

  /* ---------------------------------------------------------------- mount */

  function mount(el, opts) {
    root = el;
    if (!root) return { addFiles: function () {}, exportPNG: exportPNG, csvText: csvText };
    opts = opts || {};
    state.mode = (opts.mode === "diamond" || opts.mode === "embroidery") ? opts.mode : "cross-stitch";
    state.pattern = null;
    state.customPalette = [];
    state.zoom = 100;
    state.width = state.mode === "diamond" ? 60 : 50;

    var isX = state.mode === "cross-stitch";
    var isD = state.mode === "diamond";
    var isE = state.mode === "embroidery";

    var xControls =
      '<label class="st-check"><input type="checkbox" id="pat-symbols" checked> Symbol chart (colour + glyph)</label>' +
      '<label class="st-check"><input type="checkbox" id="pat-heavy" checked> 10×10 heavy grid lines</label>' +
      '<label class="st-check"><input type="checkbox" id="pat-symbolonly"> Symbol-only print mode (B&amp;W)</label>' +
      '<label class="st-check"><input type="checkbox" id="pat-dither"> Floyd–Steinberg dithering</label>';

    var dControls =
      '<label class="st-field"><span>Drill shape</span><select id="pat-drillshape" aria-label="Drill shape">' +
        '<option value="round">Round drills</option><option value="square">Square drills (highlight)</option></select></label>' +
      '<label class="st-check"><input type="checkbox" id="pat-drillsym" checked> Symbol letter per cell</label>' +
      '<label class="st-check"><input type="checkbox" id="pat-drillgrid" checked> Grid every 10 drills</label>' +
      '<label class="st-field"><span>Canvas planner (cm wide)</span>' +
        '<span class="pat-inline"><input type="number" id="pat-canvas-cm" min="2" max="60" step="0.5" value="30" aria-label="Canvas width in cm">' +
        '<button type="button" class="btn secondary btn-sm" id="pat-canvas-apply">Plan drills</button></span></label>';

    var eControls =
      '<label class="st-field pat-wide"><span>Custom palette (paste hex list, one per line)</span>' +
        '<textarea id="pat-palette" rows="3" placeholder="#C72B3B&#10;#114390&#10;#FBEC00"></textarea></label>' +
      '<div class="pat-palette-actions">' +
        '<button type="button" class="btn secondary btn-sm" id="pat-palette-apply">Apply custom palette</button>' +
        '<button type="button" class="btn secondary btn-sm" id="pat-palette-clear">Clear</button></div>';

    var smoothBtn = isE ? '<button type="button" class="btn secondary" id="pat-smooth">Smooth PNG</button>' : "";
    var advancedControls = isX ? xControls : isD ? dControls : eControls;
    var advancedLabel = isX ? "Chart style" : isD ? "Drill style &amp; planner" : "Palette &amp; finish";
    var advancedHint = isX ? "Symbols, grid, dithering" : isD ? "Shape, symbols, canvas planner" : "Hex palette options";

    root.className = "pat-studio pat-mode-" + state.mode;
    root.innerHTML =
      '<div class="studio-controls pat-controls">' +
        '<div class="pat-basic-grid">' +
          '<label class="st-field st-slider"><span>' + (isD ? "Drill width" : "Stitch width") + ' <b id="pat-width-v">' + state.width + (isD ? " drills" : " stitches") + "</b></span>" +
            '<input type="range" id="pat-width" min="20" max="200" step="1" value="' + state.width + '" aria-label="Chart width"></label>' +
          '<label class="st-field st-slider"><span>Max colours <b id="pat-colors-v">16 colours</b></span>' +
            '<input type="range" id="pat-colors" min="2" max="64" step="1" value="16" aria-label="Maximum colours"></label>' +
          '<label class="st-check"><input type="checkbox" id="pat-snap" checked> Snap to DMC palette</label>' +
        "</div>" +
        '<details class="pat-advanced" id="pat-advanced">' +
          '<summary><span>' + advancedLabel + '</span><small>' + advancedHint + "</small></summary>" +
          '<div class="pat-advanced-grid">' + advancedControls + "</div>" +
        "</details>" +
      "</div>" +

      '<div class="studio-toolbar">' +
        '<div class="st-zoom-group" role="group" aria-label="Preview zoom">' +
          '<button type="button" class="st-icon-btn" id="pat-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>' +
          '<b class="st-readout" id="pat-zoom">100%</b>' +
          '<button type="button" class="st-icon-btn" id="pat-zoom-in" aria-label="Zoom in" title="Zoom in">＋</button>' +
          '<button type="button" class="st-view-btn" id="pat-zoom-fit" aria-label="Fit to view" title="Fit to view">Fit</button>' +
        "</div>" +
        '<div class="pat-tip" aria-hidden="true">' + (isX
          ? "Average-pooled cells, median-cut colour reduction and DMC snapping — heavy lines mark every 10 stitches."
          : isD
            ? "Each cell is one drill; the planner converts a physical canvas size using the 2.5 mm drill pitch."
            : "Median-cut reduces the image to your thread count; the preview compares original vs simplified.") + "</div>" +
      "</div>" +

      '<div class="studio-preview">' +
        '<div class="studio-canvas-viewport" id="pat-viewport">' +
          '<div class="studio-canvas-wrap"><canvas id="pat-canvas" aria-label="Pattern chart preview" role="img"></canvas></div>' +
          '<div class="st-progress" id="pat-progress" hidden>' +
            '<span class="st-progress-fill" id="pat-progress-fill"></span>' +
            '<span class="st-progress-label" id="pat-progress-label">Rendering…</span>' +
          "</div>" +
        "</div>" +
        '<div class="studio-side">' +
          '<div class="studio-hint" id="pat-hint">Upload a PNG/JPEG photo or illustration with the box above to build a chart.</div>' +
          '<div class="pat-compare" id="pat-compare" hidden>' +
            '<figure><figcaption>Original</figcaption><canvas id="pat-orig-canvas"></canvas></figure>' +
            '<figure><figcaption>Simplified (smooth)</figcaption><canvas id="pat-smooth-canvas"></canvas></figure>' +
          "</div>" +
          '<button type="button" class="btn secondary btn-sm" id="pat-add">＋ Add image</button>' +
        "</div>" +
      "</div>" +

      '<div class="pat-legend" id="pat-legend" aria-live="polite"></div>' +

      '<div class="studio-bar">' +
        '<div class="studio-meta" id="pat-meta" aria-live="polite"></div>' +
        '<div class="studio-actions">' +
          '<button type="button" class="btn" id="pat-png">Download PNG</button>' +
          smoothBtn +
          '<button type="button" class="btn secondary" id="pat-csv">CSV shopping list</button>' +
          '<button type="button" class="btn" id="pat-print">Print chart</button>' +
        "</div>" +
      "</div>";

    bindControls();
    syncControls();
    renderAll();

    var api = {
      addFiles: addFiles,
      exportPNG: exportPNG,
      exportSmoothPNG: exportSmoothPNG,
      csvText: csvText,
      printChart: printChart,
      state: function () { return state; },
      recompute: recompute,
      _pattern: function () { return state.pattern; }
    };
    api._active = api;
    if (typeof window !== "undefined") window.PatternStudio._active = api;
    return api;
  }

  /* ---------------------------------------------------------------- export */

  var api = {
    mount: mount,
    core: {
      resample: resample,
      quantize: quantize,
      snapToDmc: snapToDmc,
      nearestIndices: nearestIndices,
      applyDither: applyDither,
      planStitches: planStitches,
      skeinEstimate: skeinEstimate,
      drillPitch: drillPitch,
      cmToDrills: cmToDrills,
      drillsToCm: drillsToCm,
      symbolFor: symbolFor,
      parseHexList: parseHexList,
      hexToRgb: hexToRgb,
      rgbToHex: rgbToHex,
      SYMBOLS: SYMBOLS,
      PALETTE: DMC
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.PatternStudio = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
