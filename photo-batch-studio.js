/*
 * Photo Batch Studio — shared photo-batch engine for two tools:
 *
 *   mode "dedupe"    — Photo Duplicate Finder (docs/TOOLS_ROADMAP.md 2.3)
 *        Exact byte-duplicates grouped by size + SHA-256 (crypto.subtle via a
 *        Blob-URL Web Worker, with a chunked main-thread fallback so the UI
 *        never freezes) AND perceptual near-duplicates clustered by aHash /
 *        dHash on a small grayscale downsample with a Hamming-distance
 *        threshold slider (similarity % shown). Per-group thumbnail strips
 *        with checkboxes to select copies, "keep recommended" (oldest
 *        lastModified, then shortest name), group id / size / date / hash
 *        columns, CSV (Group,File,Size,Date,Hash,Distance) and a standalone
 *        HTML report. Accepts every file type (image + anything).
 *
 *   mode "best-shot" — Photo Best-Shot Finder (2.4)
 *        Variance-of-Laplacian sharpness (3x3 8-neighbour kernel, both axes)
 *        measured on an aspect-preserving downsample (longest side 256,
 *        letterboxed — never stretched to square), plus an exposure/clipping
 *        penalty and a contrast term. Composite 0–100 score with weight
 *        sliders and a per-photo component breakdown, full ranked list with
 *        "load more" (12 at a time), a top-N compare view, CSV
 *        (File,Score,Sharpness,Exposure,Contrast) and clipboard copy of the
 *        best filename. Unsupported files are skipped and reported instead of
 *        aborting the batch; a progress bar runs throughout.
 *
 * Pure core (ahash, dhash, hamming, groupByHash, groupByPerceptual,
 * recommendKeeper, laplacianVariance, clipRatio, contrastOf, compositeScore,
 * rankImages, fitInto, …) is exported under PhotoBatch.core for node --test
 * (test/photo-batch.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.PhotoBatch.
 * Follows the conventions of image-studio.js / pattern-studio.js / label-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  /* ================================================================ pure core */

  function num(v, d) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /* RGBA ImageData-like -> grayscale Float64Array (Rec. 601 luminance). */
  function grayOf(imgData) {
    const data = (imgData && imgData.data) || [];
    const n = Math.floor(data.length / 4);
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      g[i] = 0.299 * num(data[p], 0) + 0.587 * num(data[p + 1], 0) + 0.114 * num(data[p + 2], 0);
    }
    return g;
  }

  /* Box-average a grayscale array into tw x th (every source pixel used once). */
  function downsampleGray(gray, w, h, tw, th) {
    w = Math.max(1, Math.round(num(w, 1)));
    h = Math.max(1, Math.round(num(h, 1)));
    tw = Math.max(1, Math.round(num(tw, 1)));
    th = Math.max(1, Math.round(num(th, 1)));
    const out = new Float64Array(tw * th);
    for (let ty = 0; ty < th; ty++) {
      const y0 = Math.floor((ty * h) / th);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / th));
      for (let tx = 0; tx < tw; tx++) {
        const x0 = Math.floor((tx * w) / tw);
        const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / tw));
        let sum = 0;
        let cnt = 0;
        for (let y = y0; y < y1 && y < h; y++) {
          const row = y * w;
          for (let x = x0; x < x1 && x < w; x++) {
            sum += num(gray[row + x], 0);
            cnt++;
          }
        }
        out[ty * tw + tx] = cnt ? sum / cnt : 0;
      }
    }
    return out;
  }

  function meanOf(arr) {
    const n = arr ? arr.length : 0;
    if (!n) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += num(arr[i], 0);
    return s / n;
  }

  function stdOf(arr) {
    const n = arr ? arr.length : 0;
    if (!n) return 0;
    const m = meanOf(arr);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = num(arr[i], 0) - m;
      s += d * d;
    }
    return Math.sqrt(s / n);
  }

  function bitsToHex(bits) {
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.substr(i, 4).padEnd(4, "0"), 2).toString(16);
    }
    return hex;
  }

  /* Average hash: 8x8 grayscale average, one bit per pixel -> 16 hex chars. */
  function ahash(imgData, w, h) {
    w = Math.max(1, Math.round(num(w, imgData && imgData.width, 1)));
    h = Math.max(1, Math.round(num(h, imgData && imgData.height, 1)));
    const small = downsampleGray(grayOf(imgData), w, h, 8, 8);
    const avg = meanOf(small);
    let bits = "";
    for (let i = 0; i < 64; i++) bits += small[i] >= avg ? "1" : "0";
    return bitsToHex(bits);
  }

  /* Difference hash: 8x8 gradient bits from a 9x8 grayscale downsample. */
  function dhash(imgData, w, h) {
    w = Math.max(1, Math.round(num(w, imgData && imgData.width, 1)));
    h = Math.max(1, Math.round(num(h, imgData && imgData.height, 1)));
    const small = downsampleGray(grayOf(imgData), w, h, 9, 8);
    let bits = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        bits += small[y * 9 + x] > small[y * 9 + x + 1] ? "1" : "0";
      }
    }
    return bitsToHex(bits);
  }

  const NIBBLE_POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

  /* Hamming distance between two hex hash strings (a missing hash counts 64). */
  function hamming(a, b) {
    if (a == null || b == null || a === "" || b === "") return 64;
    const A = String(a).toLowerCase();
    const B = String(b).toLowerCase();
    const len = Math.max(A.length, B.length);
    let dist = 0;
    for (let i = 0; i < len; i++) {
      const x = parseInt(A[A.length - 1 - i] || "0", 16) || 0;
      const y = parseInt(B[B.length - 1 - i] || "0", 16) || 0;
      dist += NIBBLE_POP[(x ^ y) & 0xf];
    }
    return dist;
  }

  /* Similarity percentage (0–100) for two 64-bit perceptual hashes. */
  function hashSimilarity(a, b, bits) {
    const total = Math.max(1, Math.round(num(bits, 64)));
    return clamp((1 - hamming(a, b) / total) * 100, 0, 100);
  }

  /* Group items by a key (default `.hash`), keeping groups of size >= min. */
  function groupByHash(items, keyOf, minSize) {
    const list = items || [];
    const key = typeof keyOf === "function" ? keyOf : function (it) { return it && it.hash; };
    const min = Math.max(1, Math.round(num(minSize, 2)));
    const map = new Map();
    for (let i = 0; i < list.length; i++) {
      const k = key(list[i], i);
      if (k == null) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(list[i]);
    }
    const groups = [];
    map.forEach(function (g) { if (g.length >= min) groups.push(g); });
    return groups;
  }

  /* Cluster items by perceptual-hash Hamming distance (union-find). */
  function groupByPerceptual(items, threshold, keyOf, minSize) {
    const list = items || [];
    const key = typeof keyOf === "function" ? keyOf : function (it) { return it && it.phash; };
    const thr = Math.max(0, Math.round(num(threshold, 0)));
    const min = Math.max(1, Math.round(num(minSize, 2)));
    const n = list.length;
    const parent = new Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ki = key(list[i], i);
        const kj = key(list[j], j);
        if (ki == null || kj == null) continue;
        if (hamming(ki, kj) <= thr) {
          const ri = find(i);
          const rj = find(j);
          if (ri !== rj) parent[rj] = ri;
        }
      }
    }

    const map = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(list[i]);
    }
    const groups = [];
    map.forEach(function (g) { if (g.length >= min) groups.push(g); });
    return groups;
  }

  /* Recommended keeper: oldest lastModified first, then shortest name, then A-Z. */
  function recommendKeeper(files) {
    const list = (files || []).filter(Boolean);
    if (!list.length) return null;
    return list.slice().sort(function (a, b) {
      const da = num(a.lastModified, 0);
      const db = num(b.lastModified, 0);
      if (da !== db) return da - db;
      const na = String(a.name || "");
      const nb = String(b.name || "");
      if (na.length !== nb.length) return na.length - nb.length;
      return na < nb ? -1 : na > nb ? 1 : 0;
    })[0];
  }

  /* ------------------------------------------------------- best-shot metrics */

  const SHARPNESS_REF = 500; // Laplacian variance mapped to a full sharpness score
  const CONTRAST_REF = 64;   // luminance std-dev mapped to a full contrast score
  const CLIP_HI = 250;       // a channel at/above this counts as clipped
  const CLIP_LO = 5;         // a channel at/below this counts as clipped
  const SCORE_WEIGHTS = { sharpness: 0.6, exposure: 0.25, contrast: 0.15 };

  /* Aspect-preserving fit of w x h into a maxSide x maxSide letterbox box.
     Uniform scale, never upscales, never stretches. */
  function fitInto(w, h, maxSide) {
    w = Math.max(1, num(w, 1));
    h = Math.max(1, num(h, 1));
    const side = Math.max(16, Math.round(num(maxSide, 256)));
    const scale = Math.min(1, side / Math.max(w, h));
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    return {
      x: Math.round((side - dw) / 2),
      y: Math.round((side - dh) / 2),
      w: dw, h: dh, side: side, scale: scale
    };
  }

  /* Variance of the 3x3 (8-neighbour) Laplacian response. Higher = sharper. */
  function laplacianVariance(gray, w, h) {
    w = Math.max(1, Math.round(num(w, 1)));
    h = Math.max(1, Math.round(num(h, 1)));
    if (!gray || w < 3 || h < 3) return 0;
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap = 8 * num(gray[i], 0)
          - num(gray[i - 1], 0) - num(gray[i + 1], 0)
          - num(gray[i - w], 0) - num(gray[i + w], 0)
          - num(gray[i - w - 1], 0) - num(gray[i - w + 1], 0)
          - num(gray[i + w - 1], 0) - num(gray[i + w + 1], 0);
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    if (!count) return 0;
    const mean = sum / count;
    return Math.max(0, sumSq / count - mean * mean);
  }

  /* Fraction (0–1) of pixels with at least one clipped channel. */
  function clipRatio(imgData) {
    const data = (imgData && imgData.data) || [];
    const pixels = Math.floor(data.length / 4);
    if (!pixels) return 0;
    let clipped = 0;
    for (let i = 0; i < pixels; i++) {
      const p = i * 4;
      if (data[p] >= CLIP_HI || data[p + 1] >= CLIP_HI || data[p + 2] >= CLIP_HI
        || data[p] <= CLIP_LO || data[p + 1] <= CLIP_LO || data[p + 2] <= CLIP_LO) {
        clipped++;
      }
    }
    return clipped / pixels;
  }

  /* Luminance contrast (population standard deviation). */
  function contrastOf(gray) {
    return stdOf(gray);
  }

  function normalizeSharpness(v) {
    return clamp(Math.sqrt(Math.max(0, num(v, 0)) / SHARPNESS_REF), 0, 1);
  }

  function normalizeContrast(v) {
    return clamp(Math.max(0, num(v, 0)) / CONTRAST_REF, 0, 1);
  }

  /* Exposure: penalise clipping first, then a mean far from mid grey. */
  function normalizeExposure(clip, mean) {
    const c = clamp(num(clip, 0), 0, 1);
    const m = clamp(num(mean, 127.5), 0, 255);
    const meanPenalty = Math.abs(m - 127.5) / 127.5;
    return clamp(1 - c * 4 - meanPenalty * 0.35, 0, 1);
  }

  /* Weighted composite of normalised 0–1 components -> 0–100. Weights are
     re-normalised, so any non-negative weight set works. */
  function compositeScore(parts, weights) {
    const p = parts || {};
    const w = Object.assign({}, SCORE_WEIGHTS, weights || {});
    const sw = Math.max(0, num(w.sharpness, 0));
    const ew = Math.max(0, num(w.exposure, 0));
    const cw = Math.max(0, num(w.contrast, 0));
    const total = sw + ew + cw;
    if (total <= 0) return 0;
    const s = clamp(num(p.sharpness, 0), 0, 1);
    const e = clamp(num(p.exposure, 0), 0, 1);
    const c = clamp(num(p.contrast, 0), 0, 1);
    return 100 * (sw * s + ew * e + cw * c) / total;
  }

  /* Sort items by `.score` descending (stable), returning a new array with rank. */
  function rankImages(items) {
    const list = items || [];
    return list
      .map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        const d = num(b.it && b.it.score, 0) - num(a.it && a.it.score, 0);
        return d !== 0 ? d : a.i - b.i;
      })
      .map(function (x, i) {
        const it = Object.assign({}, x.it);
        it.rank = i + 1;
        return it;
      });
  }

  /* ================================================================== UI */

  const WORKER_SRC =
    "self.onmessage=function(e){var d=e.data||{};(async function(){try{"
    + "var buf=await d.file.arrayBuffer();var h=await crypto.subtle.digest('SHA-256',buf);"
    + "var u=new Uint8Array(h),s='';for(var i=0;i<u.length;i++){s+=('0'+u[i].toString(16)).slice(-2);}"
    + "self.postMessage({id:d.id,hex:s});}catch(err){"
    + "self.postMessage({id:d.id,error:String((err&&err.message)||err)});}})();};";

  const DEFAULT_THRESHOLD = 6;
  const PAGE_SIZE = 12;

  const state = {
    mode: "dedupe",
    root: null,
    files: [],
    photos: [],
    groups: [],
    rank: [],
    errors: [],
    visible: PAGE_SIZE,
    threshold: DEFAULT_THRESHOLD,
    perceptual: true,
    weights: Object.assign({}, SCORE_WEIGHTS),
    running: false,
    note: "",
    noteUntil: 0
  };

  let root = null;
  let hasher = null;
  let noteTimer = null;
  let seq = 0;

  function $(sel) { return root ? root.querySelector(sel) : null; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtBytes(n) {
    n = num(n, 0);
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  }

  function fmtDate(ms) {
    const t = num(ms, 0);
    if (!t) return "—";
    const d = new Date(t);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString() + " " + d.toLocaleTimeString();
  }

  function isoDate(ms) {
    const t = num(ms, 0);
    if (!t) return "";
    const d = new Date(t);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  function shortHash(h, n) {
    const s = String(h || "");
    const len = n || 12;
    return s ? (s.length > len ? s.slice(0, len) + "\u2026" : s) : "\u2014";
  }

  function raf() {
    return new Promise(function (res) {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(function () { res(); });
      else setTimeout(res, 0);
    });
  }

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function downloadText(text, name, type) {
    downloadBlob(new Blob([text], { type: type || "text/plain;charset=utf-8" }), name);
  }

  function setProgress(on, pct, msg) {
    const bar = $("#pbs-progress");
    if (!bar) return;
    bar.hidden = !on;
    const fill = $("#pbs-progress-fill");
    if (fill) fill.style.width = clamp(num(pct, 0), 0, 100) + "%";
    if (msg) {
      const label = $("#pbs-progress-label");
      if (label) label.textContent = msg;
    }
  }

  function flash(msg) {
    state.note = msg;
    state.noteUntil = Date.now() + 3200;
    renderMeta();
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      state.note = "";
      state.noteUntil = 0;
      renderMeta();
    }, 3400);
  }

  function renderMeta() {
    const el = $("#pbs-meta");
    if (!el) return;
    const n = state.mode === "dedupe" ? state.files.length : state.photos.length;
    const parts = [];
    if (state.running) parts.push("Working\u2026");
    parts.push(n + (n === 1 ? " file loaded" : " files loaded"));
    if (state.mode === "dedupe" && state.groups.length) {
      const exact = state.groups.filter(function (g) { return g.type === "exact"; }).length;
      const near = state.groups.length - exact;
      parts.push(exact + " exact set(s), " + near + " similar set(s)");
    }
    if (state.mode === "best-shot" && state.rank.length) parts.push(state.rank.length + " ranked");
    if (state.note) parts.push('<b>' + esc(state.note) + '</b>');
    el.innerHTML = parts.join(" \u00b7 ");
  }

  /* ------------------------------------------------------------ decode / raster */

  function decodeImage(file) {
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Unsupported or unreadable image")); };
      im.src = url;
    });
  }

  function rasterize(img, opts) {
    opts = opts || {};
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    let dx = 0;
    let dy = 0;
    let dw = 1;
    let dh = 1;

    if (opts.stretch) {
      c.width = opts.stretch[0];
      c.height = opts.stretch[1];
      dw = c.width;
      dh = c.height;
      ctx.drawImage(img, 0, 0, dw, dh);
    } else {
      const box = fitInto(img.naturalWidth || img.width, img.naturalHeight || img.height, num(opts.maxSide, 256));
      c.width = box.side;
      c.height = box.side;
      dx = box.x; dy = box.y; dw = box.w; dh = box.h;
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    const full = ctx.getImageData(0, 0, c.width, c.height);

    const tc = document.createElement("canvas");
    tc.width = 72;
    tc.height = 72;
    const tctx = tc.getContext("2d");
    tctx.fillStyle = "#eef2f7";
    tctx.fillRect(0, 0, 72, 72);
    const tbox = fitInto(iw, ih, 72);
    tctx.drawImage(img, tbox.x, tbox.y, tbox.w, tbox.h);
    let thumb = "";
    try { thumb = tc.toDataURL("image/jpeg", 0.72); } catch (e) { thumb = ""; }

    return { imageData: full, box: { x: dx, y: dy, w: dw, h: dh }, thumb: thumb };
  }

  /* Crop the fitted sub-rectangle out of a full ImageData buffer. */
  function cropImageData(imgData, box) {
    const sw = imgData.width;
    const out = new Uint8ClampedArray(box.w * box.h * 4);
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        const si = ((box.y + y) * sw + (box.x + x)) * 4;
        const di = (y * box.w + x) * 4;
        out[di] = imgData.data[si];
        out[di + 1] = imgData.data[si + 1];
        out[di + 2] = imgData.data[si + 2];
        out[di + 3] = imgData.data[si + 3];
      }
    }
    return { data: out, width: box.w, height: box.h };
  }

  /* --------------------------------------------------------------- SHA-256 */

  function createWorkerHasher() {
    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return null;
    let url = null;
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "application/javascript" }));
      const worker = new Worker(url);
      const pending = new Map();
      let id = 0;
      let dead = false;
      worker.onmessage = function (e) {
        const d = e.data || {};
        const p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        if (d.error) p.reject(new Error(d.error));
        else p.resolve(d.hex);
      };
      worker.onerror = function () {
        dead = true;
        pending.forEach(function (p) { p.reject(new Error("hash worker failed")); });
        pending.clear();
      };
      return {
        hash: function (file) {
          if (dead) return Promise.reject(new Error("hash worker failed"));
          return new Promise(function (resolve, reject) {
            const myId = ++id;
            pending.set(myId, { resolve: resolve, reject: reject });
            try { worker.postMessage({ id: myId, file: file }); }
            catch (err) { pending.delete(myId); reject(err); }
          });
        },
        dispose: function () {
          dead = true;
          try { worker.terminate(); } catch (e) { /* ignore */ }
          try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }
      };
    } catch (e) {
      try { if (url) URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      return null;
    }
  }

  function toHex(buf) {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i++) s += ("0" + u[i].toString(16)).slice(-2);
    return s;
  }

  function sha256Main(file) {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return Promise.reject(new Error("SHA-256 is unavailable (needs https or localhost)"));
    }
    return file.arrayBuffer()
      .then(function (buf) { return crypto.subtle.digest("SHA-256", buf); })
      .then(toHex);
  }

  async function hashItems(items, onTick) {
    const total = items.length;
    if (!total) return;
    if (!hasher) hasher = createWorkerHasher();
    let done = 0;
    for (let i = 0; i < total; i++) {
      const it = items[i];
      try {
        it.sha = hasher ? await hasher.hash(it.file) : await sha256Main(it.file);
      } catch (e) {
        if (hasher) {
          hasher.dispose();
          hasher = null;
          try { it.sha = await sha256Main(it.file); }
          catch (e2) { it.sha = null; state.errors.push({ name: it.name, message: e2.message || "hash failed" }); }
        } else {
          it.sha = null;
          state.errors.push({ name: it.name, message: e.message || "hash failed" });
        }
      }
      done++;
      if (onTick) onTick(done, total);
      if ((i + 1) % 4 === 0) await raf();
    }
    await raf();
  }

  /* ============================================================== dedupe */

  function isProbablyImage(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("image/") === 0) return true;
    const ext = String(file.name || "").toLowerCase().split(".").pop();
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico", "tif", "tiff", "heic", "heif"].indexOf(ext) >= 0;
  }

  async function processDedupe() {
    state.groups = [];
    state.errors = [];
    state.visible = PAGE_SIZE;
    const items = state.files;
    if (!items.length) { renderDedupe(); renderMeta(); return; }

    const images = items.filter(function (it) { return isProbablyImage(it.file); });
    for (let i = 0; i < images.length; i++) {
      const it = images[i];
      try {
        const img = await decodeImage(it.file);
        const rast = rasterize(img, { stretch: [32, 32] });
        it.ahash = ahash(rast.imageData, 32, 32);
        it.phash = dhash(rast.imageData, 32, 32);
        if (!it.thumb) it.thumb = rast.thumb;
      } catch (e) {
        state.errors.push({ name: it.name, message: e.message || String(e) });
      }
      setProgress(true, Math.round(((i + 1) / Math.max(1, images.length)) * 55),
        "Perceptual hashing " + (i + 1) + "/" + images.length + "\u2026");
      if ((i + 1) % 3 === 0) await raf();
    }

    const buckets = groupByHash(items, function (it) { return it.size; }, 1);
    const candidates = [];
    buckets.forEach(function (b) { if (b.length >= 2) b.forEach(function (it) { candidates.push(it); }); });

    setProgress(true, 55, "SHA-256 hashing " + candidates.length + " candidate file(s)\u2026");
    await hashItems(candidates, function (done, total) {
      setProgress(true, 55 + Math.round((done / Math.max(1, total)) * 45),
        "SHA-256 hashing " + done + "/" + total + "\u2026");
    });

    buildDedupeGroups();
    setProgress(false, 100, "");
    renderDedupe();
    renderMeta();
  }

  function byName(a, b) {
    const na = String(a && a.name || "");
    const nb = String(b && b.name || "");
    return na < nb ? -1 : na > nb ? 1 : 0;
  }

  function isPureExact(items) {
    if (items.length < 2) return false;
    const hashes = items.map(function (it) { return it.sha; }).filter(Boolean);
    if (hashes.length !== items.length) return false;
    return new Set(hashes).size === 1;
  }

  function buildDedupeGroups() {
    const items = state.files;
    const groups = [];

    const candidates = items.filter(function (it) { return it.sha; });
    groupByHash(candidates, function (it) { return it.sha; }, 2).forEach(function (g, i) {
      groups.push({
        id: "E" + (i + 1),
        type: "exact",
        items: g.slice().sort(byName),
        bytes: num(g[0] && g[0].size, 0),
        hash: g[0] && g[0].sha
      });
    });

    if (state.perceptual) {
      const clusters = groupByPerceptual(items, state.threshold, function (it) { return it.phash; }, 2);
      let sIdx = 0;
      clusters.forEach(function (cluster) {
        if (isPureExact(cluster)) return;
        sIdx++;
        const rep = cluster[0];
        const sorted = cluster.slice().sort(byName);
        sorted.forEach(function (it) {
          it.distance = it.phash ? hamming(it.phash, rep.phash) : 64;
        });
        groups.push({
          id: "S" + sIdx,
          type: "near",
          items: sorted,
          rep: rep,
          bytes: Math.max.apply(null, cluster.map(function (it) { return num(it.size, 0); })),
          hash: rep.phash,
          minDist: Math.min.apply(null, sorted.map(function (it) { return it.distance; })),
          maxDist: Math.max.apply(null, sorted.map(function (it) { return it.distance; }))
        });
      });
    }

    items.forEach(function (it) { it.recommended = false; });
    groups.forEach(function (g) {
      const keeper = recommendKeeper(g.items);
      if (keeper) keeper.recommended = true;
    });
    items.forEach(function (it) { it.selected = !it.recommended; });
    state.groups = groups;
  }

  function renderDedupeStats() {
    const el = $("#pbs-stats");
    if (!el) return;
    const exact = state.groups.filter(function (g) { return g.type === "exact"; });
    const near = state.groups.filter(function (g) { return g.type === "near"; });
    const copies = exact.reduce(function (n, g) { return n + g.items.length - 1; }, 0);
    const reclaim = exact.reduce(function (n, g) { return n + (g.items.length - 1) * num(g.bytes, 0); }, 0);
    const selected = state.files.filter(function (it) { return it.selected; });
    const bytes = selected.reduce(function (n, it) { return n + num(it.size, 0); }, 0);
    el.innerHTML =
      '<div class="stat"><b>' + state.files.length + '</b>Scanned Files</div>'
      + '<div class="stat"><b>' + exact.length + '</b>Exact Sets</div>'
      + '<div class="stat"><b>' + near.length + '</b>Similar Sets</div>'
      + '<div class="stat"><b>' + copies + '</b>Exact Copies</div>'
      + '<div class="stat"><b>' + fmtBytes(reclaim) + '</b>Reclaimable</div>'
      + '<div class="stat"><b>' + selected.length + '</b>Selected (' + fmtBytes(bytes) + ')</div>';
  }

  function thumbMarkup(it) {
    const img = it.thumb
      ? '<img src="' + it.thumb + '" alt="">'
      : '<span class="pbs-noimg">' + esc((it.name.split(".").pop() || "?").toUpperCase().slice(0, 4)) + '</span>';
    return '<span class="pbs-thumb-img">' + img + '</span>';
  }

  function groupMarkup(g) {
    const isExact = g.type === "exact";
    const dates = g.items.map(function (it) { return num(it.lastModified, 0); }).filter(Boolean);
    const dateText = dates.length
      ? (Math.min.apply(null, dates) === Math.max.apply(null, dates)
        ? fmtDate(dates[0])
        : fmtDate(Math.min.apply(null, dates)) + " \u2192 " + fmtDate(Math.max.apply(null, dates)))
      : "\u2014";
    let meta;
    if (isExact) {
      meta = g.items.length + " identical copies \u00b7 " + fmtBytes(g.bytes) + ' each \u00b7 ' + esc(dateText)
        + ' \u00b7 SHA-256 ' + shortHash(g.hash, 16);
    } else {
      const simLo = Math.round((1 - g.maxDist / 64) * 100);
      const simHi = Math.round((1 - g.minDist / 64) * 100);
      meta = g.items.length + " similar photos \u00b7 up to " + fmtBytes(g.bytes)
        + ' \u00b7 ' + esc(dateText) + ' \u00b7 ' + (simLo === simHi ? simHi + "%" : simLo + "\u2013" + simHi + "%")
        + " similar \u00b7 dHash " + shortHash(g.hash, 12);
    }

    const cards = g.items.map(function (it) {
      const badge = it.recommended ? '<span class="pbs-keep-badge">Keep</span>' : "";
      const dist = isExact ? "" : '<span class="pbs-dist">' + Math.round((1 - it.distance / 64) * 100) + '% similar</span>';
      return '<label class="pbs-card' + (it.recommended ? " recommended" : "") + '" title="' + esc(it.name) + '">'
        + '<input type="checkbox" class="pbs-keep" data-id="' + esc(it.id) + '"' + (it.selected ? " checked" : "") + ' aria-label="Select ' + esc(it.name) + ' to remove">'
        + thumbMarkup(it)
        + '<span class="pbs-card-name">' + esc(it.name) + '</span>'
        + '<span class="pbs-card-sub">' + fmtBytes(it.size) + ' \u00b7 ' + esc(fmtDate(it.lastModified)) + '</span>'
        + dist + badge
        + '</label>';
    }).join("");

    return '<section class="pbs-group" data-group="' + esc(g.id) + '">'
      + '<header class="pbs-group-head">'
      + '<span class="pbs-badge ' + (isExact ? "exact" : "near") + '">' + (isExact ? "Exact" : "Similar") + '</span>'
      + '<span class="pbs-gid">Group ' + esc(g.id) + '</span>'
      + '<span class="pbs-gmeta">' + meta + '</span>'
      + '</header>'
      + '<div class="pbs-cards">' + cards + '</div>'
      + '<div class="pbs-group-actions">'
      + '<button type="button" class="btn secondary btn-sm" data-act="keep" data-group="' + esc(g.id) + '">Keep recommended</button>'
      + '<button type="button" class="btn secondary btn-sm" data-act="all" data-group="' + esc(g.id) + '">Select all</button>'
      + '<button type="button" class="btn secondary btn-sm" data-act="none" data-group="' + esc(g.id) + '">Select none</button>'
      + '</div></section>';
  }

  function renderDedupe() {
    if (state.mode !== "dedupe") return;
    renderDedupeStats();
    const results = $("#pbs-results");
    if (!results) return;
    if (!state.files.length) {
      results.innerHTML = '<div class="pbs-empty pb-empty"><strong>No files scanned yet.</strong><span>Add files above to find exact copies and near-duplicate photos.</span></div>';
      renderErrors();
      return;
    }
    if (!state.groups.length) {
      results.innerHTML = '<div class="pbs-empty pb-empty"><strong>No duplicates found.</strong><span>Nothing matches at the current sensitivity. Raise the near-duplicate threshold to catch more copies.</span></div>';
      renderErrors();
      return;
    }
    const selected = state.files.filter(function (it) { return it.selected; });
    const bytes = selected.reduce(function (n, it) { return n + num(it.size, 0); }, 0);
    results.innerHTML =
      '<p class="pbs-hint">Tick the copies you want to <b>remove</b>. A green "Keep" badge marks the recommended copy (oldest date, then shortest name). Selected: <b>'
      + selected.length + '</b> file(s) \u00b7 ' + fmtBytes(bytes) + '.</p>'
      + state.groups.map(groupMarkup).join("");
    renderErrors();
  }

  /* ------------------------------------------------------------ best-shot */

  function computeParts(raw) {
    return {
      sharpness: normalizeSharpness(raw.lap),
      exposure: normalizeExposure(raw.clip, raw.mean),
      contrast: normalizeContrast(raw.contrast)
    };
  }

  async function processBestShot() {
    state.rank = [];
    state.errors = [];
    state.visible = PAGE_SIZE;
    const items = state.photos;
    if (!items.length) { renderBestShot(); renderMeta(); return; }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const img = await decodeImage(it.file);
        const rast = rasterize(img, { maxSide: 256 });
        const region = cropImageData(rast.imageData, rast.box);
        const gray = grayOf(region);
        const raw = {
          lap: laplacianVariance(gray, region.width, region.height),
          clip: clipRatio(region),
          contrast: contrastOf(gray),
          mean: meanOf(gray)
        };
        it.thumb = rast.thumb;
        it.raw = raw;
        it.norm = computeParts(raw);
        it.score = compositeScore(it.norm, state.weights);
      } catch (e) {
        it.error = e.message || String(e);
        state.errors.push({ name: it.name, message: it.error });
      }
      setProgress(true, Math.round(((i + 1) / items.length) * 100),
        "Scoring " + (i + 1) + "/" + items.length + "\u2026");
      if ((i + 1) % 3 === 0) await raf();
    }

    rescoreRank();
    setProgress(false, 100, "");
    renderBestShot();
    renderMeta();
  }

  function rescoreRank() {
    state.photos.forEach(function (it) {
      if (!it.raw) return;
      it.norm = computeParts(it.raw);
      it.score = compositeScore(it.norm, state.weights);
    });
    const scored = state.photos.filter(function (it) { return it.raw; });
    state.rank = rankImages(scored);
  }

  function pct(v) { return Math.round(clamp(num(v, 0), 0, 1) * 100); }

  function compareMarkup() {
    const el = $("#pbs-compare");
    if (!el) return;
    const sel = $("#pbs-compare-n");
    const n = sel ? clamp(parseInt(sel.value, 10) || 4, 2, 6) : 4;
    const top = state.rank.slice(0, n);
    if (!top.length) {
      el.innerHTML = '<div class="pbs-empty pb-empty bs-empty"><strong>No shots to compare yet.</strong><span>Add a burst above to see the top-ranked frames side by side.</span></div>';
      return;
    }
    el.innerHTML = top.map(function (it) {
      return '<figure class="pbs-cmp-fig">'
        + (it.thumb ? '<img src="' + it.thumb + '" alt="">' : '<span class="pbs-noimg">?</span>')
        + '<figcaption><b>#' + it.rank + '</b> \u00b7 ' + Math.round(it.score) + ' pts<br><span>' + esc(it.name) + '</span></figcaption>'
        + '</figure>';
    }).join("");
  }

  function renderBestShot() {
    if (state.mode !== "best-shot") return;
    const stats = $("#pbs-stats");
    if (stats) {
      const best = state.rank[0];
      stats.innerHTML =
        '<div class="stat"><b>' + state.photos.length + '</b>Photos</div>'
        + '<div class="stat"><b>' + state.rank.length + '</b>Ranked</div>'
        + '<div class="stat"><b>' + (best ? Math.round(best.score) : "\u2014") + '</b>Top Score</div>'
        + '<div class="stat"><b>' + state.errors.length + '</b>Skipped</div>';
    }
    const list = $("#pbs-results");
    if (!list) return;
    if (!state.photos.length) {
      list.innerHTML = '<div class="pbs-empty pb-empty bs-empty"><strong>No photos ranked yet.</strong><span>Add a burst of images above to see local sharpness, exposure and contrast scores.</span></div>';
      compareMarkup();
      renderErrors();
      return;
    }
    const shown = state.rank.slice(0, state.visible);
    const rows = shown.map(function (it) {
      const n = it.norm || { sharpness: 0, exposure: 0, contrast: 0 };
      return '<li class="pbs-row">'
        + '<span class="pbs-rank">#' + it.rank + '</span>'
        + '<span class="pbs-row-thumb">' + (it.thumb ? '<img src="' + it.thumb + '" alt="">' : '<span class="pbs-noimg">?</span>') + '</span>'
        + '<span class="pbs-row-info">'
        + '<span class="pbs-row-name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>'
        + '<span class="pbs-bars">'
        + '<span class="pbs-bar"><i style="width:' + pct(n.sharpness) + '%"></i><em>Sharpness ' + pct(n.sharpness) + '</em></span>'
        + '<span class="pbs-bar"><i style="width:' + pct(n.exposure) + '%"></i><em>Exposure ' + pct(n.exposure) + '</em></span>'
        + '<span class="pbs-bar"><i style="width:' + pct(n.contrast) + '%"></i><em>Contrast ' + pct(n.contrast) + '</em></span>'
        + '</span></span>'
        + '<span class="pbs-score">' + Math.round(it.score) + '<small>pts</small></span>'
        + '<button type="button" class="btn secondary btn-sm pbs-copy" data-name="' + esc(it.name) + '" title="Copy filename">Copy</button>'
        + '</li>';
    }).join("");
    list.innerHTML = '<ol class="pbs-list">' + rows + '</ol>'
      + (state.visible < state.rank.length
        ? '<button type="button" class="btn secondary" id="pbs-more">Load more (' + (state.rank.length - state.visible) + ' remaining)</button>'
        : "");
    compareMarkup();
    renderErrors();
  }

  /* ------------------------------------------------------------- errors */

  function renderErrors() {
    const el = $("#pbs-errors");
    if (!el) return;
    if (!state.errors.length) { el.innerHTML = ""; return; }
    const rows = state.errors.slice(0, 60).map(function (e) {
      return '<li><b>' + esc(e.name) + '</b> \u2014 ' + esc(e.message) + '</li>';
    }).join("");
    el.innerHTML = '<details class="pbs-errors"><summary>' + state.errors.length
      + ' file(s) skipped (unsupported or unreadable)</summary><ul>' + rows
      + (state.errors.length > 60 ? '<li>\u2026</li>' : '') + '</ul></details>';
  }

  /* ------------------------------------------------------------- exports */

  function dedupeCsv() {
    const rows = [["Group", "File", "Size", "Date", "Hash", "Distance"]];
    state.groups.forEach(function (g) {
      g.items.forEach(function (it) {
        rows.push([
          g.id,
          it.name,
          it.size,
          it.lastModified ? new Date(it.lastModified).toISOString() : "",
          g.type === "exact" ? (it.sha || "") : (it.phash || ""),
          g.type === "exact" ? 0 : num(it.distance, 0)
        ]);
      });
    });
    return toCsv(rows);
  }

  function bestCsv() {
    const rows = [["File", "Score", "Sharpness", "Exposure", "Contrast"]];
    state.rank.forEach(function (it) {
      const n = it.norm || { sharpness: 0, exposure: 0, contrast: 0 };
      rows.push([it.name, it.score.toFixed(2), n.sharpness.toFixed(3), n.exposure.toFixed(3), n.contrast.toFixed(3)]);
    });
    return toCsv(rows);
  }

  function dedupeHtml() {
    const exact = state.groups.filter(function (g) { return g.type === "exact"; }).length;
    const near = state.groups.length - exact;
    const body = state.groups.map(function (g) {
      const isExact = g.type === "exact";
      const cards = g.items.map(function (it) {
        return '<figure class="card">'
          + (it.thumb ? '<img src="' + it.thumb + '" alt="">' : '<div class="noimg">no preview</div>')
          + '<figcaption><b>' + esc(it.name) + '</b><br>' + fmtBytes(it.size) + ' \u00b7 ' + esc(fmtDate(it.lastModified))
          + (isExact ? '' : '<br>' + Math.round((1 - it.distance / 64) * 100) + '% similar')
          + (it.recommended ? '<br><span class="keep">Recommended keep</span>' : '')
          + '</figcaption></figure>';
      }).join("");
      return '<section><h2>Group ' + esc(g.id) + ' \u2014 ' + (isExact ? "Exact duplicates" : "Similar photos") + '</h2>'
        + '<p>' + g.items.length + ' file(s) \u00b7 ' + fmtBytes(g.bytes) + (isExact ? ' each' : ' (largest)')
        + ' \u00b7 ' + (isExact ? 'SHA-256 ' : 'dHash ') + esc(shortHash(g.hash, 16)) + '</p>'
        + '<div class="cards">' + cards + '</div></section>';
    }).join("") || '<p>No duplicates found.</p>';

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Duplicate photo report</title><style>'
      + 'body{font:15px system-ui,Segoe UI,sans-serif;max-width:1000px;margin:32px auto;padding:0 18px;color:#0f172a}'
      + 'h1{margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-top:1px solid #e2e8f0;padding-top:12px}'
      + '.cards{display:flex;flex-wrap:wrap;gap:12px}'
      + 'figure.card{margin:0;width:150px;border:1px solid #dfe4ea;border-radius:10px;padding:8px;background:#fff}'
      + 'figure.card img,figure.card .noimg{width:100%;height:110px;object-fit:cover;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:12px}'
      + 'figcaption{font-size:12px;line-height:1.5;margin-top:6px;word-break:break-word}'
      + '.keep{color:#15803d;font-weight:700}'
      + 'p{color:#475569;font-size:13px}'
      + '</style></head><body>'
      + '<h1>Duplicate photo report</h1>'
      + '<p>Generated locally by Progeni Bench \u00b7 ' + new Date().toLocaleString() + '</p>'
      + '<p>' + state.files.length + ' files scanned \u00b7 ' + exact + ' exact set(s) \u00b7 ' + near + ' similar set(s).</p>'
      + body + '</body></html>';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* --------------------------------------------------------------- controls */

  function syncControls() {
    const thr = $("#pbs-threshold");
    if (thr) thr.value = String(state.threshold);
    const thrV = $("#pbs-thr-v");
    if (thrV) thrV.textContent = state.threshold + " bit" + (state.threshold === 1 ? "" : "s");
    const chk = $("#pbs-perceptual");
    if (chk) chk.checked = !!state.perceptual;
    const ids = { sharpness: "pbs-wsharp", exposure: "pbs-wexposure", contrast: "pbs-wcontrast" };
    Object.keys(ids).forEach(function (k) {
      const s = $("#" + ids[k]);
      const v = $("#" + ids[k] + "-v");
      if (s) s.value = Math.round(state.weights[k] * 100);
      if (v) v.textContent = Math.round(state.weights[k] * 100) + "%";
    });
    const rescan = $("#pbs-rescan");
    if (rescan) rescan.disabled = state.running;
    ["#pbs-csv", "#pbs-html", "#pbs-copy"].forEach(function (sel) {
      const b = $(sel);
      if (b) b.disabled = state.running;
    });
  }

  function readWeights() {
    const g = function (id) {
      const el = $("#" + id);
      return el ? clamp(parseInt(el.value, 10) || 0, 0, 100) / 100 : 0;
    };
    state.weights = { sharpness: g("pbs-wsharp"), exposure: g("pbs-wexposure"), contrast: g("pbs-wcontrast") };
  }

  function updateWeightLabel(key) {
    const el = $("#pbs-w" + key);
    const v = $("#pbs-w" + key + "-v");
    if (el && v) v.textContent = clamp(parseInt(el.value, 10) || 0, 0, 100) + "%";
  }

  /* --------------------------------------------------------------- files */

  async function run() {
    if (state.running) return;
    state.running = true;
    syncControls();
    renderMeta();
    try {
      if (state.mode === "dedupe") await processDedupe();
      else await processBestShot();
    } catch (e) {
      flash("Error: " + (e.message || e));
      if (typeof console !== "undefined") console.error(e);
    } finally {
      state.running = false;
      syncControls();
      setProgress(false, 100, "");
      renderMeta();
    }
  }

  async function addFiles(files) {
    if (!root) return;
    const list = Array.prototype.slice.call(files || []).filter(Boolean);
    if (!list.length) return;
    if (state.running) { flash("Still processing \u2014 please wait\u2026"); return; }
    list.forEach(function (f) {
      const it = {
        id: "f" + (++seq),
        file: f,
        name: f.name || ("file-" + seq),
        size: num(f.size, 0),
        lastModified: num(f.lastModified, 0),
        thumb: ""
      };
      if (state.mode === "dedupe") state.files.push(it);
      else state.photos.push(it);
    });
    await run();
  }

  function clearAll() {
    if (state.mode === "dedupe") state.files = [];
    else state.photos = [];
    state.groups = [];
    state.rank = [];
    state.errors = [];
    state.visible = PAGE_SIZE;
    setProgress(false, 0, "");
    const s = $("#pbs-stats"); if (s) s.innerHTML = "";
    const e = $("#pbs-errors"); if (e) e.innerHTML = "";
    if (state.mode === "dedupe") renderDedupe(); else renderBestShot();
    renderMeta();
  }

  /* --------------------------------------------------------------- markup */

  function dedupeControls() {
    return '<div class="studio-controls pbs-controls" id="pbs-controls">'
      + '<label class="st-field st-slider"><span>Near-duplicate sensitivity <b id="pbs-thr-v">'
      + DEFAULT_THRESHOLD + ' bits</b></span>'
      + '<input type="range" id="pbs-threshold" min="0" max="16" step="1" value="' + DEFAULT_THRESHOLD
      + '" aria-label="Perceptual hash Hamming distance threshold"></label>'
      + '<label class="st-check"><input type="checkbox" id="pbs-perceptual" checked> Perceptual (near-duplicate) scan</label>'
      + '<button type="button" class="btn secondary btn-sm" id="pbs-rescan">Rescan</button>'
      + '</div>';
  }

  function bestControls() {
    const w = state.weights;
    return '<div class="studio-controls pbs-controls" id="pbs-controls">'
      + '<label class="st-field st-slider"><span>Sharpness weight <b id="pbs-wsharp-v">' + Math.round(w.sharpness * 100) + '%</b></span>'
      + '<input type="range" id="pbs-wsharp" min="0" max="100" step="5" value="' + Math.round(w.sharpness * 100) + '" aria-label="Sharpness weight"></label>'
      + '<label class="st-field st-slider"><span>Exposure weight <b id="pbs-wexposure-v">' + Math.round(w.exposure * 100) + '%</b></span>'
      + '<input type="range" id="pbs-wexposure" min="0" max="100" step="5" value="' + Math.round(w.exposure * 100) + '" aria-label="Exposure weight"></label>'
      + '<label class="st-field st-slider"><span>Contrast weight <b id="pbs-wcontrast-v">' + Math.round(w.contrast * 100) + '%</b></span>'
      + '<input type="range" id="pbs-wcontrast" min="0" max="100" step="5" value="' + Math.round(w.contrast * 100) + '" aria-label="Contrast weight"></label>'
      + '<button type="button" class="btn secondary btn-sm" id="pbs-rescan">Rescore</button>'
      + '</div>';
  }

  function barMarkup() {
    if (state.mode === "dedupe") {
      return '<div class="studio-actions">'
        + '<button type="button" class="btn" id="pbs-csv">Export CSV</button>'
        + '<button type="button" class="btn secondary" id="pbs-html">HTML report</button>'
        + '<button type="button" class="btn secondary" id="pbs-clear">Clear</button></div>';
    }
    return '<div class="studio-actions">'
      + '<button type="button" class="btn" id="pbs-csv">Export CSV</button>'
      + '<button type="button" class="btn secondary" id="pbs-copy">Copy best filename</button>'
      + '<button type="button" class="btn secondary" id="pbs-clear">Clear</button></div>';
  }

  /* --------------------------------------------------------------- bind */

  function bindControls() {
    const controls = $("#pbs-controls");
    if (controls) {
      controls.addEventListener("input", function (ev) {
        const t = ev.target;
        if (!t) return;
        if (t.id === "pbs-threshold") {
          state.threshold = clamp(parseInt(t.value, 10) || 0, 0, 16);
          const v = $("#pbs-thr-v");
          if (v) v.textContent = state.threshold + " bits";
        } else if (t.id === "pbs-perceptual") {
          state.perceptual = !!t.checked;
        } else if (t.id.indexOf("pbs-w") === 0) {
          updateWeightLabel(t.id.replace("pbs-w", "").replace("-v", ""));
        }
      });
      controls.addEventListener("change", function (ev) {
        const t = ev.target;
        if (!t) return;
        if (t.id === "pbs-perceptual") { state.perceptual = !!t.checked; if (state.mode === "dedupe") { buildDedupeGroups(); renderDedupe(); renderMeta(); } }
        if (t.id === "pbs-threshold" && state.mode === "dedupe") { buildDedupeGroups(); renderDedupe(); renderMeta(); }
        if (t.id.indexOf("pbs-w") === 0 && state.mode === "best-shot") { readWeights(); rescoreRank(); renderBestShot(); renderMeta(); }
      });
    }

    const rescan = $("#pbs-rescan");
    if (rescan) {
      rescan.addEventListener("click", function () {
        if (state.mode === "dedupe") run();
        else { readWeights(); rescoreRank(); renderBestShot(); renderMeta(); }
      });
    }

    const csv = $("#pbs-csv");
    if (csv) csv.addEventListener("click", function () {
      if (state.mode === "dedupe") downloadText(dedupeCsv(), "duplicate-report.csv", "text/csv;charset=utf-8");
      else downloadText(bestCsv(), "best-shot-ranking.csv", "text/csv;charset=utf-8");
    });

    const html = $("#pbs-html");
    if (html) html.addEventListener("click", function () {
      downloadText(dedupeHtml(), "duplicate-report.html", "text/html;charset=utf-8");
    });

    const copy = $("#pbs-copy");
    if (copy) copy.addEventListener("click", function () {
      const best = state.rank[0];
      if (!best) { flash("No ranked photo yet"); return; }
      copyText(best.name).then(function () { flash("Copied: " + best.name); })
        .catch(function () { flash("Clipboard unavailable"); });
    });

    const clr = $("#pbs-clear");
    if (clr) clr.addEventListener("click", clearAll);

    const results = $("#pbs-results");
    if (results) {
      results.addEventListener("change", function (ev) {
        const t = ev.target;
        if (t && t.classList.contains("pbs-keep")) {
          const it = state.files.filter(function (x) { return x.id === t.dataset.id; })[0];
          if (it) it.selected = !!t.checked;
          // A file can be listed in both an exact and a similar group; keep
          // every rendered checkbox for that file in sync.
          Array.prototype.forEach.call(results.querySelectorAll(".pbs-keep"), function (cb) {
            if (cb.dataset.id === t.dataset.id) cb.checked = !!(it && it.selected);
          });
          renderDedupeStats();
          renderMeta();
          const hint = results.querySelector(".pbs-hint");
          if (hint) {
            const selected = state.files.filter(function (x) { return x.selected; });
            const bytes = selected.reduce(function (n, x) { return n + num(x.size, 0); }, 0);
            hint.innerHTML = 'Tick the copies you want to <b>remove</b>. A green "Keep" badge marks the recommended copy (oldest date, then shortest name). Selected: <b>'
              + selected.length + '</b> file(s) \u00b7 ' + fmtBytes(bytes) + '.';
          }
        }
      });
      results.addEventListener("click", function (ev) {
        const btn = ev.target.closest ? ev.target.closest("[data-act]") : null;
        if (btn) {
          const g = state.groups.filter(function (x) { return x.id === btn.dataset.group; })[0];
          if (g) {
            const act = btn.dataset.act;
            g.items.forEach(function (it) {
              it.selected = act === "all" ? true : act === "none" ? false : !it.recommended;
            });
            renderDedupe();
            renderMeta();
          }
          return;
        }
        const more = ev.target.closest ? ev.target.closest("#pbs-more") : null;
        if (more) { state.visible += PAGE_SIZE; renderBestShot(); return; }
        const cp = ev.target.closest ? ev.target.closest(".pbs-copy") : null;
        if (cp) {
          copyText(cp.dataset.name).then(function () { flash("Copied: " + cp.dataset.name); })
            .catch(function () { flash("Clipboard unavailable"); });
        }
      });
    }

    const cmpN = $("#pbs-compare-n");
    if (cmpN) cmpN.addEventListener("change", compareMarkup);
  }

  /* ---------------------------------------------------- dedupe shell */

  function dedupeMarkup(tip) {
    return '<div class="pb-workspace">'
      + '<section class="pb-panel pb-setup" aria-labelledby="pb-setup-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">01</span><div>'
      + '<h2 id="pb-setup-title">Scan settings</h2>'
      + '<p>Choose how strictly files are matched. Every hash is computed locally.</p>'
      + '</div></div>'
      + '<p class="pbs-tip">' + tip + '</p>'
      + dedupeControls()
      + '<div class="st-progress" id="pbs-progress" hidden>'
      + '<div class="st-progress-fill" id="pbs-progress-fill"></div>'
      + '<div class="st-progress-label" id="pbs-progress-label"></div></div>'
      + '</section>'
      + '<aside class="pb-panel pb-guide" aria-labelledby="pb-guide-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">02</span><div>'
      + '<h2 id="pb-guide-title">How review works</h2>'
      + '<p>Tick the copies you want to remove, not the keeper.</p>'
      + '</div></div>'
      + '<ol class="cs-steps">'
      + '<li><strong>Exact byte match</strong><span>Files with identical content are grouped by SHA-256, even when filenames differ.</span></li>'
      + '<li><strong>Near-duplicate scan</strong><span>aHash and dHash compare resized or recompressed photos at the chosen sensitivity.</span></li>'
      + '<li><strong>Review and export</strong><span>The recommended original is marked Keep. Export a CSV or standalone HTML cleanup report.</span></li>'
      + '</ol>'
      + '<p class="cs-privacy"><strong>100% local.</strong> Hashing and thumbnails stay in this browser tab — no file is uploaded.</p>'
      + '</aside>'
      + '<section class="pb-panel pb-results" aria-labelledby="pb-results-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">03</span><div>'
      + '<h2 id="pb-results-title">Duplicate groups</h2>'
      + '<p>Review each set below and choose which copies to remove.</p>'
      + '</div><span class="pb-status" id="pbs-meta" aria-live="polite">No files loaded yet.</span></div>'
      + '<div class="stats pb-stats" id="pbs-stats"></div>'
      + '<div class="pbs-results" id="pbs-results"></div>'
      + '<div class="pbs-errors" id="pbs-errors"></div>'
      + '</section>'
      + '<div class="studio-bar pb-bar">' + barMarkup() + '</div>'
      + '</div>';
  }

  function bestMarkup(tip) {
    return '<div class="pb-workspace">'
      + '<section class="pb-panel bs-setup" aria-labelledby="bs-setup-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">01</span><div>'
      + '<h2 id="bs-setup-title">Scoring weights</h2>'
      + '<p>Tune what matters most for this burst. Scores update instantly.</p>'
      + '</div></div>'
      + '<p class="pbs-tip">' + tip + '</p>'
      + bestControls()
      + '<div class="st-progress" id="pbs-progress" hidden>'
      + '<div class="st-progress-fill" id="pbs-progress-fill"></div>'
      + '<div class="st-progress-label" id="pbs-progress-label"></div></div>'
      + '</section>'
      + '<aside class="pb-panel pb-guide bs-guide" aria-labelledby="bs-guide-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">02</span><div>'
      + '<h2 id="bs-guide-title">What the score means</h2>'
      + '<p>Three local measurements are blended into one 0–100 score.</p>'
      + '</div></div>'
      + '<ol class="cs-steps">'
      + '<li><strong>Sharpness</strong><span>Variance of Laplacian edges on an aspect-preserving 256 px downsample catches motion blur and soft focus.</span></li>'
      + '<li><strong>Exposure</strong><span>Clipped highlights and crushed shadows are penalised so blown-out frames do not win.</span></li>'
      + '<li><strong>Contrast</strong><span>Overall tonal separation rewards punchy frames and keeps flat shots from ranking too high.</span></li>'
      + '</ol>'
      + '<p class="cs-privacy"><strong>100% local.</strong> Pixels are analysed in your browser — no photo is uploaded.</p>'
      + '</aside>'
      + '<section class="pb-panel bs-compare-panel" aria-labelledby="bs-compare-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">03</span><div>'
      + '<h2 id="bs-compare-title">Compare the top shots</h2>'
      + '<p>See the highest-ranked frames side by side before choosing a keeper.</p>'
      + '</div><div class="pbs-compare-head"><span>Compare top</span>'
      + '<select id="pbs-compare-n" aria-label="Number of photos to compare">'
      + '<option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option>'
      + '</select></div></div>'
      + '<div class="pbs-compare" id="pbs-compare"></div>'
      + '</section>'
      + '<section class="pb-panel pb-results bs-results" aria-labelledby="bs-results-title">'
      + '<div class="pb-panel-head"><span class="pb-panel-num">04</span><div>'
      + '<h2 id="bs-results-title">Full ranking</h2>'
      + '<p>Every scored photo appears below with its sharpness, exposure and contrast breakdown.</p>'
      + '</div><span class="pb-status" id="pbs-meta" aria-live="polite">No files loaded yet.</span></div>'
      + '<div class="stats pb-stats bs-stats" id="pbs-stats"></div>'
      + '<div class="pbs-results" id="pbs-results"></div>'
      + '<div class="pbs-errors" id="pbs-errors"></div>'
      + '</section>'
      + '<div class="studio-bar pb-bar bs-bar">' + barMarkup() + '</div>'
      + '</div>';
  }

  /* --------------------------------------------------------------- mount */

  function mount(el, options) {
    root = el;
    if (!root) {
      return { addFiles: function () {}, state: function () { return state; }, reset: function () {} };
    }
    const opt = options || {};
    state.mode = opt.mode === "best-shot" ? "best-shot" : "dedupe";
    state.root = el;
    state.files = [];
    state.photos = [];
    state.groups = [];
    state.rank = [];
    state.errors = [];
    state.visible = PAGE_SIZE;
    state.threshold = DEFAULT_THRESHOLD;
    state.perceptual = true;
    state.weights = Object.assign({}, SCORE_WEIGHTS);
    state.running = false;
    state.note = "";
    seq = 0;

    const tip = state.mode === "dedupe"
      ? "Exact duplicates are matched with SHA-256 inside a Web Worker; near-duplicates use aHash/dHash perceptual distance. Nothing is uploaded \u2014 files never leave this tab."
      : "Sharpness is variance-of-Laplacian on an aspect-preserving 256 px downsample (never stretched), combined with an exposure/clipping penalty and a contrast term. All local.";

    root.className = "studio pbs-studio" + (state.mode === "dedupe" ? " pbs-studio--dedupe" : " pbs-studio--best");
    root.innerHTML = state.mode === "dedupe" ? dedupeMarkup(tip) : bestMarkup(tip);

    syncControls();
    bindControls();
    if (state.mode === "dedupe") renderDedupe(); else renderBestShot();
    renderMeta();

    const api = {
      addFiles: addFiles,
      state: function () { return state; },
      results: function () { return state.mode === "dedupe" ? state.groups : state.rank; },
      csvText: function () { return state.mode === "dedupe" ? dedupeCsv() : bestCsv(); },
      htmlReport: dedupeHtml,
      rescore: function () { readWeights(); rescoreRank(); renderBestShot(); renderMeta(); },
      reset: clearAll
    };
    api._active = api;
    if (typeof window !== "undefined" && window.PhotoBatch) window.PhotoBatch._active = api;
    return api;
  }

  /* --------------------------------------------------------------- export */

  const api = {
    mount: mount,
    core: {
      num: num,
      clamp: clamp,
      grayOf: grayOf,
      downsampleGray: downsampleGray,
      meanOf: meanOf,
      stdOf: stdOf,
      ahash: ahash,
      dhash: dhash,
      hamming: hamming,
      hashSimilarity: hashSimilarity,
      groupByHash: groupByHash,
      groupByPerceptual: groupByPerceptual,
      recommendKeeper: recommendKeeper,
      fitInto: fitInto,
      laplacianVariance: laplacianVariance,
      clipRatio: clipRatio,
      contrastOf: contrastOf,
      normalizeSharpness: normalizeSharpness,
      normalizeContrast: normalizeContrast,
      normalizeExposure: normalizeExposure,
      compositeScore: compositeScore,
      rankImages: rankImages,
      SHARPNESS_REF: SHARPNESS_REF,
      CONTRAST_REF: CONTRAST_REF,
      CLIP_HI: CLIP_HI,
      CLIP_LO: CLIP_LO,
      SCORE_WEIGHTS: SCORE_WEIGHTS,
      DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
      PAGE_SIZE: PAGE_SIZE
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.PhotoBatch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
