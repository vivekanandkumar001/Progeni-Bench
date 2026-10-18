/*
 * Image Studio — shared photo-transform engine for three tools:
 *
 *   mode "mirror"    — T-Shirt Print Mirror (docs/TOOLS_ROADMAP.md 1.3)
 *        Flip-axis selector (horizontal / vertical / 180° rotation), optional
 *        white-background flatten, PNG / JPEG / WebP export with quality,
 *        SVG passthrough (re-serialise the flipped SVG transform — no
 *        rasterisation), before/after side-by-side preview, batch flip +
 *        sequential download, a "flipped sheet" hand-off note, and filenames
 *        derived from the source file.
 *
 *   mode "border"    — Photo Print Border Calculator (1.6)
 *        Target sizes 4×6 / 5×7 / 8×10 / 8×11 / A4 / custom (mm or in), a
 *        photo fitted inside the target with a uniform border (fit mode) or
 *        cropped to fill the exact target (fill mode), fixed-mm or % border
 *        width, white / black / custom border colour, optional mat keyline
 *        around the photo, 200/300 DPI output sized to the physical target,
 *        PNG + JPEG export and an on-screen physical-dimension report.
 *
 *   mode "wallpaper" — Wallpaper Photo Cropper (2.1)
 *        Ratio picker with device presets (iPhone 1170×2532 & 1290×2796,
 *        Android 1080×2400, 16:9 desktop, 9:16 social, 4:3 tablet, 19.5:9)
 *        plus custom ratio and custom pixel size, a draggable crop box with a
 *        focal point on the preview (dimmed-outside overlay), cover-crop or
 *        blur-padding fill, PNG/JPEG/WebP export with quality, and batch
 *        (one crop ratio applied to many photos).
 *
 * Pure core (dpiPx, targetMm, borderWidthMm, photoBox, keylineBox,
 * RATIO_PRESETS, cropRect, focalFromRect, blurPad, mirrorMatrix, applyMatrix,
 * mirrorSvgTransform, svgSize, wrapSvg, derivedName, …) is exported under
 * ImageStudio.core for node --test (test/image-transform.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.ImageStudio.
 * Follows the conventions of sheet-studio.js / pattern-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  const MM_PER_IN = 25.4;

  /* ---------------------------------------------------------------- pure core */

  const num = (v, d) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* mm -> physical pixels at a DPI, rounded like a real print driver. */
  function dpiPx(mm, dpi) {
    return Math.round((num(mm, 0) / MM_PER_IN) * num(dpi, 300));
  }

  /* mm <-> inch helpers. */
  function mmToIn(mm) { return num(mm, 0) / MM_PER_IN; }
  function inToMm(inches) { return num(inches, 0) * MM_PER_IN; }

  /* Standard photo / frame targets, always stored in millimetres. */
  const BORDER_TARGETS = {
    "4x6":  { label: "4 × 6 in (10 × 15 cm)", w: 101.6, h: 152.4 },
    "5x7":  { label: "5 × 7 in (13 × 18 cm)", w: 127.0, h: 177.8 },
    "8x10": { label: "8 × 10 in (20 × 25 cm)", w: 203.2, h: 254.0 },
    "8x11": { label: "8 × 11 in", w: 203.2, h: 279.4 },
    "a4":   { label: "A4 (210 × 297 mm)", w: 210.0, h: 297.0 }
  };

  /* Resolve a target key (+ custom values) to millimetres. `custom` is in the
     caller's unit; pass millimetres here (the UI converts first). */
  function targetMm(key, custom) {
    if (key === "custom") {
      const w = Math.max(1, num(custom && custom.w, 100));
      const h = Math.max(1, num(custom && custom.h, 150));
      return { w: w, h: h };
    }
    const t = BORDER_TARGETS[key] || BORDER_TARGETS["4x6"];
    return { w: t.w, h: t.h };
  }

  /* Border width in millimetres for a { value, unit } spec: a fixed mm value,
     or a percentage of the target's shorter side. */
  function borderWidthMm(spec, targetWmm, targetHmm) {
    const s = spec || {};
    const v = Math.max(0, num(s.value, 6));
    const unit = s.unit === "%" ? "%" : "mm";
    return unit === "%" ? (v / 100) * Math.min(num(targetWmm, 1), num(targetHmm, 1)) : v;
  }

  function borderPx(spec, targetWmm, targetHmm, dpi) {
    return dpiPx(borderWidthMm(spec, targetWmm, targetHmm), dpi);
  }

  /* The rectangle a photo occupies inside a target canvas.
     mode "fit"  — contain inside (target - 2*border), letterboxed, centred.
     mode "fill" — cover the whole target (border ignored), centred & cropped.
     Coordinates are relative to the target canvas (can be negative in fill). */
  function photoBox(photoW, photoH, targetW, targetH, border, mode) {
    mode = mode === "fill" ? "fill" : "fit";
    photoW = Math.max(1, num(photoW, 1));
    photoH = Math.max(1, num(photoH, 1));
    targetW = Math.max(1, num(targetW, 1));
    targetH = Math.max(1, num(targetH, 1));
    const b = mode === "fill" ? 0 : Math.max(0, num(border, 0));
    const innerW = Math.max(1, targetW - 2 * b);
    const innerH = Math.max(1, targetH - 2 * b);
    const scale = mode === "fill"
      ? Math.max(targetW / photoW, targetH / photoH)
      : Math.min(innerW / photoW, innerH / photoH);
    const w = photoW * scale;
    const h = photoH * scale;
    return {
      x: (targetW - w) / 2,
      y: (targetH - h) / 2,
      w: w, h: h, scale: scale,
      mode: mode, border: b, innerW: innerW, innerH: innerH
    };
  }

  /* Expand the drawn photo rect outwards by `gap` px — the rectangle a mat
     keyline is stroked along. */
  function keylineBox(photo, gap) {
    const g = Math.max(0, num(gap, 0));
    const p = photo || { x: 0, y: 0, w: 1, h: 1 };
    return { x: num(p.x, 0) - g, y: num(p.y, 0) - g, w: Math.max(1, num(p.w, 1) + 2 * g), h: Math.max(1, num(p.h, 1) + 2 * g) };
  }

  /* Device / ratio presets for the wallpaper cropper (ratio = w / h). */
  const RATIO_PRESETS = {
    "iphone-1170": { label: "iPhone lock screen 1170 × 2532", group: "Phone", ratio: 1170 / 2532, w: 1170, h: 2532 },
    "iphone-1290": { label: "iPhone lock screen 1290 × 2796", group: "Phone", ratio: 1290 / 2796, w: 1290, h: 2796 },
    "android-1080": { label: "Android 1080 × 2400", group: "Phone", ratio: 1080 / 2400, w: 1080, h: 2400 },
    "desktop-1080": { label: "16:9 desktop 1920 × 1080", group: "Desktop", ratio: 16 / 9, w: 1920, h: 1080 },
    "social-1080": { label: "9:16 social 1080 × 1920", group: "Social", ratio: 9 / 16, w: 1080, h: 1920 },
    "tablet-2048": { label: "4:3 tablet 2048 × 1536", group: "Tablet", ratio: 4 / 3, w: 2048, h: 1536 },
    "wide-19.5": { label: "19.5:9 phone 2340 × 1080", group: "Wide", ratio: 19.5 / 9, w: 2340, h: 1080 }
  };

  /* Largest rect of the given aspect (w/h) that fits in the source, positioned
     around the normalised focal point and clamped inside the image. */
  function cropRect(ratio, srcW, srcH, focalX, focalY) {
    ratio = Math.max(1e-6, num(ratio, 1));
    srcW = Math.max(1, num(srcW, 1));
    srcH = Math.max(1, num(srcH, 1));
    let w, h;
    if (srcW / srcH > ratio) { h = srcH; w = srcH * ratio; }
    else { w = srcW; h = srcW / ratio; }
    const cx = clamp(num(focalX, 0.5), 0, 1) * srcW;
    const cy = clamp(num(focalY, 0.5), 0, 1) * srcH;
    const x = clamp(cx - w / 2, 0, Math.max(0, srcW - w));
    const y = clamp(cy - h / 2, 0, Math.max(0, srcH - h));
    return { x: x, y: y, w: w, h: h, ratio: ratio };
  }

  /* Centre of a crop rect back in normalised source coordinates. */
  function focalFromRect(rect, srcW, srcH) {
    return {
      x: (num(rect && rect.x, 0) + num(rect && rect.w, 0) / 2) / Math.max(1, num(srcW, 1)),
      y: (num(rect && rect.y, 0) + num(rect && rect.h, 0) / 2) / Math.max(1, num(srcH, 1))
    };
  }

  /* Blur-padding geometry: a cover-scaled background copy (bg) filling the
     output, plus a fit-scaled sharp foreground (fg) centred on top of it. */
  function blurPad(srcW, srcH, outW, outH) {
    srcW = Math.max(1, num(srcW, 1)); srcH = Math.max(1, num(srcH, 1));
    outW = Math.max(1, num(outW, 1)); outH = Math.max(1, num(outH, 1));
    const sCover = Math.max(outW / srcW, outH / srcH);
    const sFit = Math.min(outW / srcW, outH / srcH);
    const bw = srcW * sCover, bh = srcH * sCover;
    const fw = srcW * sFit, fh = srcH * sFit;
    return {
      bg: { x: (outW - bw) / 2, y: (outH - bh) / 2, w: bw, h: bh, scale: sCover },
      fg: { x: (outW - fw) / 2, y: (outH - fh) / 2, w: fw, h: fh, scale: sFit },
      outW: outW, outH: outH
    };
  }

  /* Canvas mirror matrices (setTransform order a,b,c,d,e,f) about the rect's
     own centre so the image maps back onto itself. */
  function mirrorMatrix(mode, w, h) {
    const W = num(w, 1), H = num(h, 1);
    if (mode === "v" || mode === "vertical") return { a: 1, b: 0, c: 0, d: -1, e: 0, f: H };
    if (mode === "rot180" || mode === "180" || mode === "rotate180") return { a: -1, b: 0, c: 0, d: -1, e: W, f: H };
    return { a: -1, b: 0, c: 0, d: 1, e: W, f: 0 }; // horizontal (default)
  }

  function applyMatrix(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  /* SVG-space transform string for the same three flips (inside viewBox 0 0 W H). */
  function mirrorSvgTransform(mode, w, h) {
    const W = num(w, 1), H = num(h, 1);
    if (mode === "v" || mode === "vertical") return "translate(0 " + H + ") scale(1 -1)";
    if (mode === "rot180" || mode === "180" || mode === "rotate180") return "translate(" + W + " " + H + ") rotate(180)";
    return "translate(" + W + " 0) scale(-1 1)";
  }

  /* Read the intrinsic size of an SVG document from viewBox / width / height. */
  function svgSize(svgText) {
    const s = String(svgText || "");
    const vb = s.match(/viewBox\s*=\s*["']\s*([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)\s*["']/i);
    const wAttr = s.match(/<svg\b[^>]*\bwidth\s*=\s*["']([-0-9.eE]+)/i);
    const hAttr = s.match(/<svg\b[^>]*\bheight\s*=\s*["']([-0-9.eE]+)/i);
    let w = vb ? Math.abs(parseFloat(vb[3])) : (wAttr ? parseFloat(wAttr[1]) : 0);
    let h = vb ? Math.abs(parseFloat(vb[4])) : (hAttr ? parseFloat(hAttr[1]) : 0);
    if (!(w > 0)) w = 100;
    if (!(h > 0)) h = 100;
    return {
      w: w, h: h,
      viewBox: vb
        ? { x: parseFloat(vb[1]), y: parseFloat(vb[2]), w: Math.abs(parseFloat(vb[3])), h: Math.abs(parseFloat(vb[4])) }
        : null
    };
  }

  /* Vector passthrough: wrap the SVG body in a <g transform="…"> group so the
     artwork is mirrored without ever rasterising it. Text in, text out. */
  function wrapSvg(svgText, mode) {
    const src = String(svgText || "");
    const open = src.match(/<svg\b[^>]*>/i);
    if (!open) return src;
    const size = svgSize(src);
    const t = mirrorSvgTransform(mode, size.w, size.h);
    const closeIdx = src.toLowerCase().lastIndexOf("</svg>");
    const contentStart = open.index + open[0].length;
    const contentEnd = closeIdx < 0 ? src.length : closeIdx;
    const head = src.slice(0, contentStart);
    const mid = src.slice(contentStart, contentEnd);
    const tail = src.slice(contentEnd);
    return head + '<g class="ims-flip" transform="' + t + '">' + mid + "</g>" + tail;
  }

  /* Filename derived from the SOURCE name (never a fixed one). */
  function derivedName(srcName, suffix, ext) {
    const name = String(srcName || "image");
    const base = name.replace(/\.[^./\\]+$/, "") || "image";
    const safe = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim() || "image";
    return safe + (suffix || "") + "." + (ext || "png");
  }

  /* ---------------------------------------------------------------- defaults */

  const DEFAULTS = {
    mirror: {
      axis: "h", flatten: false, format: "png", quality: 0.92, vector: true
    },
    border: {
      target: "4x6", customW: 100, customH: 150, unit: "mm",
      mode: "fit", borderValue: 6, borderUnit: "mm",
      borderColor: "#ffffff", mat: false, keylineGap: 2, keylineWidth: 0.5, keylineColor: "#111111",
      dpi: 300, format: "png", quality: 0.92
    },
    wallpaper: {
      ratioKey: "iphone-1170", customRW: 9, customRH: 16,
      outW: 1170, outH: 2532, customW: 1170, customH: 2532,
      fillMode: "cover", focalX: 0.5, focalY: 0.5,
      format: "png", quality: 0.92
    }
  };

  const MAX_ITEMS = 30;

  /* ---------------------------------------------------------------- runtime */

  const state = {
    mode: "mirror",
    root: null,
    items: [],
    active: 0,
    opts: Object.assign({}, DEFAULTS.mirror),
    busy: false,
    note: "",
    noteUntil: 0,
    _noteTimer: null
  };
  let uid = 0;
  let afterUrl = null;

  const $ = sel => (state.root ? state.root.querySelector(sel) : null);
  const $$ = sel => (state.root ? Array.from(state.root.querySelectorAll(sel)) : []);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------------------------------------------------------- I/O */

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }

  const mimeFor = fmt => (fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png");
  const extFor = fmt => (fmt === "jpeg" ? "jpg" : fmt === "webp" ? "webp" : "png");

  function note(msg) {
    state.note = msg;
    state.noteUntil = Date.now() + 3600;
    renderNote();
    clearTimeout(state._noteTimer);
    state._noteTimer = setTimeout(renderNote, 3650);
  }

  function renderNote() {
    const el = $("#ims-meta");
    if (!el) return;
    if (state.note && Date.now() < state.noteUntil) { el.textContent = state.note; return; }
    el.textContent = metaText();
  }

  function metaText() {
    const n = state.items.length;
    if (!n) return "No files loaded yet.";
    const item = state.items[state.active];
    if (state.mode === "mirror") {
      return n + " file" + (n === 1 ? "" : "s") + " · showing " + item.name +
        " · " + axisLabel(state.opts.axis) + " · " + (state.opts.format === "png" ? "PNG (lossless)" : state.opts.format.toUpperCase());
    }
    if (state.mode === "border") {
      const rep = borderReport(item);
      return rep ? rep.short : "1 photo";
    }
    const r = wallpaperOut();
    return n + " photo" + (n === 1 ? "" : "s") + " · crop " + r.ratioLabel + " · " + r.outW + " × " + r.outH +
      " · " + (state.opts.fillMode === "blur" ? "blur padding" : "cover crop");
  }

  /* ---------------------------------------------------------------- intake */

  function readTextFilePromise(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = e => rej(e);
      fr.readAsText(file);
    });
  }

  async function loadItem(file) {
    const isSvg = /svg/i.test(file.type || "") || /\.svg$/i.test(file.name || "");
    const url = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = e => rej(e);
      fr.readAsDataURL(file);
    });
    let img = null, svgText = null, w = 0, h = 0;
    if (isSvg) {
      svgText = await readTextFilePromise(file);
      const size = svgSize(svgText);
      w = size.w; h = size.h;
      try {
        const im = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i); i.onerror = e => rej(e); i.src = url;
        });
        img = im;
        if (im.naturalWidth) { w = im.naturalWidth; h = im.naturalHeight; }
      } catch (e) { /* vector-only SVG: keep text + declared size */ }
    } else {
      const im = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = e => rej(e); i.src = url;
      });
      if (!im.naturalWidth || !im.naturalHeight) throw new Error("has no usable pixel data");
      img = im; w = im.naturalWidth; h = im.naturalHeight;
    }
    if (!(w > 0)) w = 300;
    if (!(h > 0)) h = 300;
    return { uid: ++uid, name: file.name || ("image-" + uid), url: url, img: img, isSvg: isSvg, svgText: svgText, w: w, h: h };
  }

  function addFiles(files) {
    const list = [...(files || [])].filter(f => f && (String(f.type || "").startsWith("image/") || /\.svg$/i.test(f.name || "")));
    if (!list.length) { note("No readable image files found — use PNG, JPEG, WebP or SVG."); return Promise.resolve(0); }
    const room = Math.max(0, MAX_ITEMS - state.items.length);
    const used = list.slice(0, room);
    const overflow = list.length - used.length;
    setBusy(true);
    let done = 0;
    const tick = () => { done++; note("Loading image " + done + " of " + used.length + "…"); };
    return Promise.all(used.map(f =>
      loadItem(f).then(item => { tick(); return item; })
        .catch(e => { tick(); return { error: (f.name || "file") + ": " + (e && e.message ? e.message : String(e)) }; })
    )).then(results => {
      const ok = results.filter(r => !r.error);
      const failed = results.filter(r => r.error).map(r => r.error);
      state.items.push(...ok);
      if (state.active >= state.items.length) state.active = Math.max(0, state.items.length - 1);
      setBusy(false);
      if (failed.length) {
        note("Skipped " + failed.length + " unsupported file" + (failed.length === 1 ? "" : "s") +
          " (" + failed.join("; ") + "). Loaded " + ok.length + ".");
      } else if (overflow > 0) {
        note("Loaded " + ok.length + " image" + (ok.length === 1 ? "" : "s") + " — " + overflow + " skipped (max " + MAX_ITEMS + ").");
      } else {
        note(ok.length + " image" + (ok.length === 1 ? "" : "s") + " added (" + state.items.length + "/" + MAX_ITEMS + ").");
      }
      state.active = ok.length && state.items.length === ok.length ? 0 : state.active;
      renderAll();
      return ok.length;
    }).catch(e => {
      setBusy(false);
      note("Could not read files: " + (e && e.message ? e.message : String(e)));
      return 0;
    });
  }

  function setBusy(b) {
    state.busy = b;
    ["#ims-dl", "#ims-dlall", "#ims-note", "#ims-clear"].forEach(s => {
      const el = $(s); if (el) el.disabled = b;
    });
  }

  function clearAll() {
    if (afterUrl) { URL.revokeObjectURL(afterUrl); afterUrl = null; }
    state.items = [];
    state.active = 0;
    note("Cleared.");
    renderAll();
  }

  const current = () => state.items[state.active] || null;

  function setActive(i) {
    if (i < 0 || i >= state.items.length) return;
    state.active = i;
    renderAll();
  }

  /* ---------------------------------------------------------------- mirror */

  function axisLabel(a) {
    return a === "v" ? "Vertical flip" : a === "rot180" ? "180° rotation" : "Horizontal flip";
  }

  function mirrorExport(item) {
    if (!item) return Promise.resolve(null);
    if (item.isSvg && state.opts.vector) {
      const text = wrapSvg(item.svgText, state.opts.axis);
      return Promise.resolve({
        blob: new Blob([text], { type: "image/svg+xml" }),
        ext: "svg",
        name: derivedName(item.name, "-mirrored", "svg"),
        vector: true
      });
    }
    if (!item.img) return Promise.reject(new Error('"' + item.name + '" cannot be rasterised'));
    const c = document.createElement("canvas");
    c.width = item.w; c.height = item.h;
    const ctx = c.getContext("2d");
    if (state.opts.flatten) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
    const m = mirrorMatrix(state.opts.axis, c.width, c.height);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(item.img, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return new Promise(res => {
      c.toBlob(blob => {
        res(blob ? {
          blob: blob,
          ext: extFor(state.opts.format),
          name: derivedName(item.name, "-mirrored", extFor(state.opts.format)),
          vector: false
        } : null);
      }, mimeType(), qualityOrUndefined());
    });
  }

  function mimeType() { return mimeFor(state.opts.format); }
  function qualityOrUndefined() { return state.opts.format === "png" ? undefined : clamp(num(state.opts.quality, 0.92), 0.3, 1); }

  async function mirrorDownloadOne() {
    const item = current();
    if (!item) return;
    if (state.busy) return;
    setBusy(true);
    try {
      const out = await mirrorExport(item);
      if (!out) throw new Error("Export failed");
      download(out.blob, out.name);
      note("Downloaded " + out.name + (out.vector ? " (vector SVG — no rasterisation)" : ""));
    } catch (e) {
      note("Skipped: " + (e && e.message ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  async function mirrorDownloadAll() {
    const items = state.items.slice();
    if (!items.length || state.busy) return;
    setBusy(true);
    let ok = 0, failed = [];
    for (let i = 0; i < items.length; i++) {
      note("Batch " + (i + 1) + " of " + items.length + " — " + items[i].name + "…");
      try {
        const out = await mirrorExport(items[i]);
        if (!out) throw new Error("Export failed");
        download(out.blob, out.name);
        ok++;
      } catch (e) {
        failed.push(items[i].name);
      }
      await sleep(180);
    }
    setBusy(false);
    note("Batch done: " + ok + " file" + (ok === 1 ? "" : "s") + " downloaded" +
      (failed.length ? ", " + failed.length + " skipped (" + failed.join(", ") + ")" : "."));
  }

  function handoffNote() {
    const items = state.items;
    if (!items.length) { note("Add artwork first."); return; }
    const rows = items.map(it => {
      const out = it.isSvg && state.opts.vector ? derivedName(it.name, "-mirrored", "svg") : derivedName(it.name, "-mirrored", extFor(state.opts.format));
      return "<li><code>" + esc(out) + "</code> — from <code>" + esc(it.name) + "</code>" + (it.isSvg ? " (vector)" : "") + "</li>";
    }).join("");
    const axis = axisLabel(state.opts.axis);
    const html = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>Flipped artwork hand-off</title>" +
      "<style>body{font:16px system-ui;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.6}code{background:#f1f5f9;padding:1px 5px;border-radius:4px}</style>" +
      "</head><body><h1>Flipped artwork hand-off</h1>" +
      "<p>Generated by the Progeni T-Shirt Print Mirror. " + items.length + " file" + (items.length === 1 ? "" : "s") +
      " were flipped with <strong>" + axis + "</strong>" + (state.opts.flatten ? " and a white background flatten" : "") + ".</p>" +
      "<ul>" + rows + "</ul>" +
      "<p><strong>Next step:</strong> open the Iron-on Transfer Sheet Maker (<code>/tools/ironon-sheet/</code>). " +
      "Because these files are already mirrored, leave <em>Mirror all images</em> turned OFF for them " +
      "(or use the per-image override), then lay them out, set cut lines, and print at 100% / actual size.</p>" +
      "<p>Vector SVGs were re-serialised with a <code>&lt;g transform&gt;</code>, so cutting machines keep true paths.</p>" +
      "</body></html>";
    download(new Blob([html], { type: "text/html" }), "flipped-artwork-note.html");
    note("Hand-off note downloaded.");
  }

  function renderMirror() {
    const item = current();
    const before = $("#ims-before"), after = $("#ims-after");
    if (afterUrl) { URL.revokeObjectURL(afterUrl); afterUrl = null; }
    if (before) { if (item) before.src = item.url; else before.removeAttribute("src"); }
    if (!after) return;
    if (!item) { after.removeAttribute("src"); return; }
    if (item.isSvg && state.opts.vector) {
      afterUrl = URL.createObjectURL(new Blob([wrapSvg(item.svgText, state.opts.axis)], { type: "image/svg+xml" }));
      after.src = afterUrl;
    } else if (item.img) {
      const c = document.createElement("canvas");
      c.width = item.w; c.height = item.h;
      const ctx = c.getContext("2d");
      if (state.opts.flatten) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
      const m = mirrorMatrix(state.opts.axis, c.width, c.height);
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(item.img, 0, 0, c.width, c.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      after.src = c.toDataURL("image/png");
    } else {
      after.removeAttribute("src");
    }
    const cap = $("#ims-after-cap");
    if (cap) cap.textContent = item.isSvg && state.opts.vector ? "After — vector SVG (no rasterisation)" : "After — " + axisLabel(state.opts.axis);
  }

  /* ---------------------------------------------------------------- border */

  function borderOptsResolved() {
    const o = state.opts;
    const T = targetMm(o.target, { w: toMm(o.customW, o.unit), h: toMm(o.customH, o.unit) });
    return { T: T, targetLabel: o.target === "custom" ? "Custom" : (BORDER_TARGETS[o.target] || {}).label || o.target };
  }

  function toMm(v, unit) { return unit === "in" ? inToMm(v) : num(v, 0); }
  function fromMm(mm, unit) { return unit === "in" ? mmToIn(mm) : mm; }

  function borderReport(item) {
    if (state.mode !== "border") return null;
    const o = state.opts;
    const res = borderOptsResolved();
    const T = res.T;
    const px = { w: dpiPx(T.w, o.dpi), h: dpiPx(T.h, o.dpi) };
    const bMm = borderWidthMm({ value: o.borderValue, unit: o.borderUnit }, T.w, T.h);
    const iw = item && item.img ? item.img.naturalWidth : Math.max(1, T.w);
    const ih = item && item.img ? item.img.naturalHeight : Math.max(1, T.h);
    const scale = o.dpi / MM_PER_IN;
    const box = photoBox(iw, ih, px.w, px.h, bMm * scale, o.mode);
    const photoWmm = box.w / scale, photoHmm = box.h / scale;
    const tu = o.unit;
    const fmt = mm => (tu === "in" ? mmToIn(mm).toFixed(2) + " in" : mm.toFixed(1) + " mm");
    const short = (o.mode === "fill" ? "Fill exact target" : "Bordered") + " " +
      fmt(T.w) + " × " + fmt(T.h) + " @ " + o.dpi + " DPI · border " + fmt(bMm) +
      (o.mode === "fit" ? " · photo " + fmt(photoWmm) + " × " + fmt(photoHmm) : "");
    return { short: short, T: T, px: px, bMm: bMm, photoWmm: photoWmm, photoHmm: photoHmm, box: box, targetLabel: res.targetLabel };
  }

  function drawBorderScene(ctx, W, H, item, scale) {
    const o = state.opts;
    const res = borderOptsResolved();
    const T = res.T;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (o.mode === "fill") {
      ctx.fillStyle = o.borderColor;
      ctx.fillRect(0, 0, W, H);
      const iw = item && item.img ? item.img.naturalWidth : W;
      const ih = item && item.img ? item.img.naturalHeight : H;
      const cover = photoBox(iw, ih, W, H, 0, "fill");
      if (item && item.img) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
        ctx.drawImage(item.img, cover.x, cover.y, cover.w, cover.h);
        ctx.restore();
      }
      return { box: cover, bMm: 0, keyline: null };
    }
    ctx.fillStyle = o.borderColor;
    ctx.fillRect(0, 0, W, H);
    const bMm = borderWidthMm({ value: o.borderValue, unit: o.borderUnit }, T.w, T.h);
    const bPx = bMm * scale;
    const iw = item && item.img ? item.img.naturalWidth : Math.max(1, W - 2 * bPx);
    const ih = item && item.img ? item.img.naturalHeight : Math.max(1, H - 2 * bPx);
    const box = photoBox(iw, ih, W, H, bPx, "fit");
    if (item && item.img) {
      ctx.save();
      ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
      ctx.drawImage(item.img, box.x, box.y, box.w, box.h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    let kl = null;
    if (o.mat) {
      const gap = clamp(num(o.keylineGap, 2), 0, 20) * scale;
      kl = keylineBox(box, gap);
      ctx.save();
      ctx.strokeStyle = o.keylineColor || "#111111";
      ctx.lineWidth = Math.max(1, clamp(num(o.keylineWidth, 0.5), 0.1, 5) * scale);
      ctx.strokeRect(kl.x, kl.y, kl.w, kl.h);
      ctx.restore();
    }
    return { box: box, bMm: bMm, keyline: kl };
  }

  function renderBorderPreview() {
    const c = $("#ims-canvas");
    if (!c) return;
    const o = state.opts;
    const res = borderOptsResolved();
    const T = res.T;
    const scale = 520 / Math.max(T.w, T.h);
    const W = Math.max(1, Math.round(T.w * scale));
    const H = Math.max(1, Math.round(T.h * scale));
    c.width = W; c.height = H;
    const item = current();
    drawBorderScene(c.getContext("2d"), W, H, item, scale);

    const el = $("#ims-report");
    if (el) {
      const rep = borderReport(item);
      const tu = o.unit;
      const fmt = mm => (tu === "in" ? mmToIn(mm).toFixed(2) + " in" : mm.toFixed(1) + " mm");
      const unitLabel = tu === "in" ? "in" : "mm";
      el.innerHTML =
        "Output: <b>" + rep.px.w + " × " + rep.px.h + " px</b> @ " + o.dpi + " DPI = " +
        "<b>" + fmt(rep.T.w) + " × " + fmt(rep.T.h) + "</b> (" + rep.targetLabel + ")<br>" +
        "Border: <b>" + fmt(rep.bMm) + "</b> (" + (o.borderUnit === "%" ? o.borderValue + "% of short side" : "fixed " + unitLabel) + ")" +
        (o.mode === "fit"
          ? " · printed photo <b>" + fmt(rep.photoWmm) + " × " + fmt(rep.photoHmm) + "</b>"
          : " · photo cropped to fill the exact target") +
        (o.mat ? " · mat keyline ON" : "");
    }
  }

  async function borderExportBlob(item) {
    const o = state.opts;
    const t = borderOptsResolved();
    const px = { w: dpiPx(t.T.w, o.dpi), h: dpiPx(t.T.h, o.dpi) };
    const c = document.createElement("canvas");
    c.width = px.w; c.height = px.h;
    drawBorderScene(c.getContext("2d"), px.w, px.h, item, o.dpi / MM_PER_IN);
    const blob = await new Promise(res => c.toBlob(res, mimeType(), qualityOrUndefined()));
    if (!blob) throw new Error("export failed");
    return { blob: blob, name: derivedName(item.name, "-bordered-" + o.dpi + "dpi", extFor(o.format)) };
  }

  async function borderDownload() {
    const item = current();
    if (!item || state.busy) return;
    setBusy(true);
    try {
      const out = await borderExportBlob(item);
      download(out.blob, out.name);
      note("Downloaded " + out.name + " (" + state.opts.dpi + " DPI).");
    } catch (e) {
      note("Skipped: " + (e && e.message ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  /* ---------------------------------------------------------------- wallpaper */

  function wallpaperRatio() {
    const o = state.opts;
    if (o.ratioKey === "custom") {
      const rw = Math.max(1, num(o.customRW, 9));
      const rh = Math.max(1, num(o.customRH, 16));
      return { ratio: rw / rh, label: rw + ":" + rh, rw: rw, rh: rh };
    }
    const p = RATIO_PRESETS[o.ratioKey] || RATIO_PRESETS["iphone-1170"];
    return { ratio: p.ratio, label: p.w + ":" + p.h, w: p.w, h: p.h, preset: p };
  }

  function wallpaperOut() {
    const o = state.opts;
    const r = wallpaperRatio();
    let outW = o.ratioKey === "custom" ? Math.max(16, Math.round(num(o.customW, num(o.outW, 1170)))) : Math.round(num(o.outW, r.w || 1170));
    let outH = o.ratioKey === "custom" ? Math.max(16, Math.round(num(o.customH, num(o.outH, 2532)))) : Math.round(num(o.outH, r.h || 2532));
    return { outW: outW, outH: outH, ratio: r.ratio, ratioLabel: r.label };
  }

  function wallpaperCropFor(item, out) {
    const o = state.opts;
    const r = wallpaperRatio();
    return cropRect(r.ratio, item.w, item.h, o.focalX, o.focalY);
  }

  function drawWallpaperPreview() {
    const c = $("#ims-canvas");
    if (!c) return;
    const item = current();
    if (!item) { c.width = 320; c.height = 200; const x = c.getContext("2d"); x.clearRect(0, 0, 320, 200); return; }
    const maxW = 460, maxH = 430;
    const ds = Math.min(maxW / item.w, maxH / item.h);
    const dw = Math.max(1, Math.round(item.w * ds));
    const dh = Math.max(1, Math.round(item.h * ds));
    c.width = dw; c.height = dh;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, dw, dh);
    if (item.img) { ctx.drawImage(item.img, 0, 0, dw, dh); }
    else { ctx.fillStyle = "#e2e8f0"; ctx.fillRect(0, 0, dw, dh); ctx.fillStyle = "#64748b"; ctx.font = "13px system-ui"; ctx.fillText("SVG (no raster preview)", 12, 24); }

    const rect = wallpaperCropFor(item, wallpaperOut());
    const rx = rect.x * ds, ry = rect.y * ds, rw = rect.w * ds, rh = rect.h * ds;
    ctx.fillStyle = "rgba(15,23,42,.55)";
    ctx.fillRect(0, 0, dw, ry);                                   // top
    ctx.fillRect(0, ry + rh, dw, dh - (ry + rh));                 // bottom
    ctx.fillRect(0, ry, rx, rh);                                  // left
    ctx.fillRect(rx + rw, ry, dw - (rx + rw), rh);                // right
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, Math.max(1, rw - 2), Math.max(1, rh - 2));
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + rw / 3, ry); ctx.lineTo(rx + rw / 3, ry + rh);
    ctx.moveTo(rx + 2 * rw / 3, ry); ctx.lineTo(rx + 2 * rw / 3, ry + rh);
    ctx.moveTo(rx, ry + rh / 3); ctx.lineTo(rx + rw, ry + rh / 3);
    ctx.moveTo(rx, ry + 2 * rh / 3); ctx.lineTo(rx + rw, ry + 2 * rh / 3);
    ctx.stroke();
    ctx.restore();

    const el = $("#ims-report");
    if (el) {
      const out = wallpaperOut();
      const srcLabel = item.w + " × " + item.h + " px";
      el.innerHTML =
        "Crop ratio <b>" + out.ratioLabel + "</b> · output <b>" + out.outW + " × " + out.outH + " px</b> · " +
        (state.opts.fillMode === "blur" ? "blur-padded (no crop loss)" : "cover crop") +
        "<br>Source " + srcLabel + " · drag inside the box to set the focal point.";
    }
  }

  async function wallpaperExportOne(item) {
    if (!item || !item.img) throw new Error("no raster image");
    const out = wallpaperOut();
    const rect = wallpaperCropFor(item, out);
    const c = document.createElement("canvas");
    c.width = out.outW; c.height = out.outH;
    const ctx = c.getContext("2d");
    if (state.opts.fillMode === "blur") {
      const geom = blurPad(item.w, item.h, out.outW, out.outH);
      try { ctx.filter = "blur(" + Math.max(6, Math.round(out.outW * 0.03)) + "px)"; } catch (e) { /* unsupported */ }
      ctx.drawImage(item.img, geom.bg.x, geom.bg.y, geom.bg.w, geom.bg.h);
      try { ctx.filter = "none"; } catch (e) { /* ignore */ }
      ctx.fillStyle = "rgba(0,0,0,.10)";
      ctx.fillRect(0, 0, out.outW, out.outH);
      ctx.drawImage(item.img, geom.fg.x, geom.fg.y, geom.fg.w, geom.fg.h);
    } else {
      ctx.drawImage(item.img, rect.x, rect.y, rect.w, rect.h, 0, 0, out.outW, out.outH);
    }
    const blob = await new Promise(res => c.toBlob(res, mimeType(), qualityOrUndefined()));
    if (!blob) throw new Error("export failed");
    return {
      blob: blob,
      name: derivedName(item.name, "-wallpaper-" + out.outW + "x" + out.outH, extFor(state.opts.format))
    };
  }

  async function wallpaperDownloadOne() {
    const item = current();
    if (!item || state.busy) return;
    setBusy(true);
    try {
      const out = await wallpaperExportOne(item);
      download(out.blob, out.name);
      note("Downloaded " + out.name);
    } catch (e) {
      note("Skipped: " + (e && e.message ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  async function wallpaperDownloadAll() {
    const items = state.items.slice();
    if (!items.length || state.busy) return;
    setBusy(true);
    let ok = 0; const failed = [];
    for (let i = 0; i < items.length; i++) {
      note("Batch " + (i + 1) + " of " + items.length + " — " + items[i].name + "…");
      try { const out = await wallpaperExportOne(items[i]); download(out.blob, out.name); ok++; }
      catch (e) { failed.push(items[i].name); }
      await sleep(180);
    }
    setBusy(false);
    note("Batch done: " + ok + " wallpaper" + (ok === 1 ? "" : "s") + " downloaded" +
      (failed.length ? ", " + failed.length + " skipped (" + failed.join(", ") + ")" : "."));
  }

  /* Drag the crop box on the preview to move the focal point. */
  function bindWallpaperDrag() {
    const c = $("#ims-canvas");
    if (!c) return;
    let drag = null;
    const toSource = (clientX, clientY) => {
      const b = c.getBoundingClientRect();
      const sx = item0() ? item0().w / c.width : 1;
      const sy = item0() ? item0().h / c.height : 1;
      return { x: (clientX - b.left) * (c.width / b.width) * sx, y: (clientY - b.top) * (c.height / b.height) * sy };
    };
    const item0 = () => current();
    const inside = (p, rect) => p.x >= rect.x - 8 && p.x <= rect.x + rect.w + 8 && p.y >= rect.y - 8 && p.y <= rect.y + rect.h + 8;

    c.addEventListener("pointerdown", e => {
      const it = current();
      if (!it) return;
      const p = toSource(e.clientX, e.clientY);
      const rect = wallpaperCropFor(it, wallpaperOut());
      if (!inside(p, rect)) return;
      drag = { dx: p.x - (rect.x + rect.w / 2), dy: p.y - (rect.y + rect.h / 2) };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
      c.style.cursor = "grabbing";
      e.preventDefault();
    });
    c.addEventListener("pointermove", e => {
      if (!drag) return;
      const it = current();
      if (!it) return;
      const rect = wallpaperCropFor(it, wallpaperOut());
      const p = toSource(e.clientX, e.clientY);
      const cx = p.x - drag.dx, cy = p.y - drag.dy;
      const o = state.opts;
      o.focalX = clamp(cx / it.w, rect.w / 2 / it.w, 1 - rect.w / 2 / it.w);
      o.focalY = clamp(cy / it.h, rect.h / 2 / it.h, 1 - rect.h / 2 / it.h);
      renderWallpaperPreviewOnly();
      e.preventDefault();
    });
    const end = e => {
      if (!drag) return;
      drag = null;
      c.style.cursor = "move";
      note("Focal point set to " + Math.round(state.opts.focalX * 100) + "% / " + Math.round(state.opts.focalY * 100) + "%.");
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  function renderWallpaperPreviewOnly() {
    drawWallpaperPreview();
    renderNote();
  }

  /* ---------------------------------------------------------------- controls UI */

  function renderStrip() {
    const strip = $("#ims-strip");
    if (!strip) return;
    strip.innerHTML = state.items.map((it, i) =>
      '<div class="st-tile' + (i === state.active ? " selected" : "") + '" data-i="' + i + '" title="' + esc(it.name) + '" role="button" tabindex="0" aria-label="Show ' + esc(it.name) + '">' +
      '<img src="' + it.url + '" alt="">' +
      '<span class="st-idx">' + (i + 1) + "</span>" +
      '<button type="button" class="st-x" data-remove="' + i + '" aria-label="Remove image ' + (i + 1) + '" title="Remove">✕</button>' +
      "</div>"
    ).join("");
    $$("#ims-strip [data-remove]").forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const i = parseInt(b.dataset.remove, 10);
        state.items.splice(i, 1);
        if (state.active >= state.items.length) state.active = Math.max(0, state.items.length - 1);
        note("Removed image " + (i + 1) + ".");
        renderAll();
      };
    });
    $$("#ims-strip .st-tile").forEach(t => {
      t.onclick = () => setActive(parseInt(t.dataset.i, 10));
      t.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(parseInt(t.dataset.i, 10)); } };
    });
  }

  function renderAll() {
    renderStrip();
    if (state.mode === "mirror") renderMirror();
    else if (state.mode === "border") renderBorderPreview();
    else drawWallpaperPreview();
    renderNote();
    const has = state.items.length > 0;
    const empty = $("#ims-empty");
    if (empty) empty.style.display = has ? "none" : "block";
    ["#ims-dl", "#ims-dlall", "#ims-note", "#ims-clear"].forEach(s => {
      const el = $(s);
      if (el) el.disabled = !has || state.busy;
    });
  }

  /* ---------------------------------------------------------------- controls */

  function syncControls() {
    const o = state.opts;
    const set = (s, v) => { const el = $(s); if (el) el.value = v; };
    const chk = (s, v) => { const el = $(s); if (el) el.checked = v; };
    const txt = (s, v) => { const el = $(s); if (el) el.textContent = v; };
    if (state.mode === "mirror") {
      set("#ims-flip", o.axis);
      set("#ims-format", state.opts.format);
      set("#ims-quality", state.opts.quality);
      chk("#ims-flatten", state.opts.flatten);
      chk("#ims-vector", state.opts.vector);
      const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(state.opts.quality * 100) + "%";
      const qi = $("#ims-quality"); if (qi) qi.disabled = state.opts.format === "png";
      const vwrap = $("#ims-vector-wrap"); if (vwrap) vwrap.hidden = !state.items.some(i => i.isSvg);
    } else if (state.mode === "border") {
      set("#ims-target", o.target);
      set("#ims-unit", o.unit);
      set("#ims-customW", o.customW);
      set("#ims-customH", o.customH);
      set("#ims-mode", o.mode);
      set("#ims-bw", o.borderValue);
      set("#ims-bwunit", o.borderUnit);
      set("#ims-borderColor", o.borderColor);
      set("#ims-dpi", o.dpi);
      set("#ims-format", o.format);
      const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(o.quality * 100) + "%";
      const qi = $("#ims-quality"); if (qi) qi.disabled = o.format === "png";
      set("#ims-quality", o.quality);
      chk("#ims-mat", o.mat);
      set("#ims-keygap", o.keylineGap);
      set("#ims-keyw", o.keylineWidth);
      set("#ims-keyColor", o.keylineColor);
      const custWrap = $("#ims-custom-wrap"); if (custWrap) custWrap.hidden = o.target !== "custom";
      const bwv = $("#ims-bw-v"); if (bwv) bwv.textContent = o.borderValue + (o.borderUnit === "%" ? "%" : " mm");
      const kwv = $("#ims-keyw-v"); if (kwv) kwv.textContent = o.keylineWidth + " mm";
      $$(".ims-mat-only").forEach(el => { el.hidden = !o.mat; });
    } else {
      set("#ims-ratio", o.ratioKey);
      set("#ims-fillmode", o.fillMode);
      set("#ims-format", o.format);
      set("#ims-quality", o.quality);
      const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(o.quality * 100) + "%";
      const qi = $("#ims-quality"); if (qi) qi.disabled = o.format === "png";
      set("#ims-customRW", o.customRW);
      set("#ims-customRH", o.customRH);
      set("#ims-customW", o.customW);
      set("#ims-customH", o.customH);
      const cw = $("#ims-ratio-custom"); if (cw) cw.hidden = o.ratioKey !== "custom";
      const pw = $("#ims-px-wrap"); if (pw) pw.hidden = o.ratioKey !== "custom";
      const out = wallpaperOut();
      const pv = $("#ims-px-v"); if (pv) pv.textContent = out.outW + " × " + out.outH + " px";
    }
  }

  function bindControls() {
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
    const val = e => e.target.value;

    on("#ims-add", "click", () => { const f = $("#ims-file"); if (f) f.click(); });
    on("#ims-file", "change", e => { addFiles([...e.target.files]); e.target.value = ""; });
    on("#ims-clear", "click", clearAll);
    on("#ims-dl", "click", () => {
      if (state.mode === "mirror") mirrorDownloadOne();
      else if (state.mode === "border") borderDownload();
      else wallpaperDownloadOne();
    });
    on("#ims-dlall", "click", () => {
      if (state.mode === "mirror") mirrorDownloadAll();
      else if (state.mode === "wallpaper") wallpaperDownloadAll();
      else borderDownload();
    });
    on("#ims-note", "click", handoffNote);

    if (state.mode === "mirror") {
      on("#ims-flip", "change", e => { state.opts.axis = val(e); renderMirror(); renderNote(); });
      on("#ims-format", "change", e => { state.opts.format = val(e); syncControls(); renderNote(); });
      on("#ims-quality", "input", e => {
        state.opts.quality = clamp(num(val(e), 0.92), 0.3, 1);
        const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(state.opts.quality * 100) + "%";
      });
      on("#ims-flatten", "change", e => { state.opts.flatten = !!e.target.checked; renderMirror(); });
      on("#ims-vector", "change", e => { state.opts.vector = !!e.target.checked; renderMirror(); });
    } else if (state.mode === "border") {
      on("#ims-target", "change", e => { state.opts.target = val(e); syncControls(); renderAll(); });
      on("#ims-unit", "change", e => {
        state.opts.unit = val(e) === "in" ? "in" : "mm";
        if (state.opts.target === "custom") {
          const c = $("#ims-customW"), d = $("#ims-customH");
          if (c) c.value = fromMm(state.opts.customW, state.opts.unit).toFixed(2);
          if (d) d.value = fromMm(state.opts.customH, state.opts.unit).toFixed(2);
        }
        renderAll();
      });
      on("#ims-customW", "input", e => { state.opts.customW = toMm(num(val(e), 100), state.opts.unit); renderAll(); });
      on("#ims-customH", "input", e => { state.opts.customH = toMm(num(val(e), 150), state.opts.unit); renderAll(); });
      on("#ims-mode", "change", e => { state.opts.mode = val(e) === "fill" ? "fill" : "fit"; syncControls(); renderAll(); });
      on("#ims-bw", "input", e => {
        state.opts.borderValue = Math.max(0, num(val(e), 6));
        const v = $("#ims-bw-v"); if (v) v.textContent = state.opts.borderValue + (state.opts.borderUnit === "%" ? "%" : " mm");
        renderAll();
      });
      on("#ims-bwunit", "change", e => { state.opts.borderUnit = val(e) === "%" ? "%" : "mm"; syncControls(); renderAll(); });
      on("#ims-borderColor", "input", e => { state.opts.borderColor = val(e); renderAll(); });
      on("#ims-borderPreset", "change", e => {
        const v = val(e);
        state.opts.borderColor = v === "white" ? "#ffffff" : v === "black" ? "#000000" : (state.opts.borderColor || "#2563eb");
        syncControls(); renderAll();
      });
      on("#ims-dpi", "change", e => { state.opts.dpi = parseInt(val(e), 10) === 200 ? 200 : 300; renderAll(); });
      on("#ims-format", "change", e => { state.opts.format = val(e); syncControls(); renderAll(); });
      on("#ims-quality", "input", e => {
        state.opts.quality = clamp(num(val(e), 0.92), 0.3, 1);
        const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(state.opts.quality * 100) + "%";
      });
      on("#ims-mat", "change", e => { state.opts.mat = !!e.target.checked; syncControls(); renderAll(); });
      on("#ims-keygap", "input", e => { state.opts.keylineGap = Math.max(0, num(val(e), 2)); renderAll(); });
      on("#ims-keyw", "input", e => {
        state.opts.keylineWidth = clamp(num(val(e), 0.5), 0.1, 5);
        const v = $("#ims-keyw-v"); if (v) v.textContent = state.opts.keylineWidth + " mm";
        renderAll();
      });
      on("#ims-keyColor", "input", e => { state.opts.keylineColor = val(e); renderAll(); });
    } else {
      on("#ims-ratio", "change", e => {
        const k = val(e);
        state.opts.ratioKey = k;
        if (k !== "custom" && RATIO_PRESETS[k]) { state.opts.outW = RATIO_PRESETS[k].w; state.opts.outH = RATIO_PRESETS[k].h; }
        syncControls(); renderAll();
      });
      on("#ims-customRW", "input", e => { state.opts.customRW = Math.max(1, num(val(e), 9)); syncControls(); renderAll(); });
      on("#ims-customRH", "input", e => { state.opts.customRH = Math.max(1, num(val(e), 16)); syncControls(); renderAll(); });
      on("#ims-customW", "input", e => { state.opts.customW = Math.max(16, Math.round(num(val(e), 1170))); syncControls(); renderAll(); });
      on("#ims-customH", "input", e => { state.opts.customH = Math.max(16, Math.round(num(val(e), 2532))); syncControls(); renderAll(); });
      on("#ims-fillmode", "change", e => { state.opts.fillMode = val(e) === "blur" ? "blur" : "cover"; renderAll(); });
      on("#ims-format", "change", e => { state.opts.format = val(e); syncControls(); renderNote(); });
      on("#ims-quality", "input", e => {
        state.opts.quality = clamp(num(val(e), 0.92), 0.3, 1);
        const qv = $("#ims-quality-v"); if (qv) qv.textContent = Math.round(state.opts.quality * 100) + "%";
      });
      on("#ims-ratio-reset", "click", () => {
        state.opts.focalX = 0.5; state.opts.focalY = 0.5;
        renderWallpaperPreviewOnly();
        note("Focal point reset to centre.");
      });
    }
  }

  /* ---------------------------------------------------------------- markup */

  function selectOptions(map, selected) {
    return Object.keys(map).map(k =>
      '<option value="' + k + '"' + (k === selected ? " selected" : "") + ">" + esc(map[k].label || map[k]) + "</option>"
    ).join("");
  }

  function mirrorMarkup() {
    const formats = '<option value="png">PNG (lossless)</option><option value="jpeg">JPEG</option><option value="webp">WebP</option>';
    return `
      <div class="studio-controls ims-controls">
        <label class="st-field"><span>Flip axis</span>
          <select id="ims-flip" aria-label="Flip axis">
            <option value="h">Horizontal (mirror left↔right)</option>
            <option value="v">Vertical (flip top↕bottom)</option>
            <option value="rot180">180° rotation (both)</option>
          </select>
        </label>
        <label class="st-field"><span>Export format</span>
          <select id="ims-format" aria-label="Export format">${formats}</select>
        </label>
        <label class="st-field st-slider"><span>Quality <b id="ims-quality-v">92%</b></span>
          <input type="range" id="ims-quality" min="30" max="100" step="1" value="92" aria-label="Export quality"></label>
        <label class="st-check"><input type="checkbox" id="ims-flatten"> Flatten onto white background</label>
        <label class="st-check" id="ims-vector-wrap" hidden><input type="checkbox" id="ims-vector" checked> SVG passthrough (keep vectors, no rasterising)</label>
      </div>
      <div class="ims-compare" id="ims-compare">
        <figure><figcaption>Before — original</figcaption><img id="ims-before" alt="Original preview"></figure>
        <figure><figcaption id="ims-after-cap">After — horizontal flip</figcaption><img id="ims-after" alt="Flipped preview"></figure>
      </div>
      <div class="studio-side">
        <input type="file" id="ims-file" class="ims-hidden-file" accept="image/*,.svg" multiple aria-label="Add image files">
        <div class="studio-strip" id="ims-strip"></div>
      </div>`;
  }

  function borderMarkup() {
    const targets = Object.keys(BORDER_TARGETS).map(k => '<option value="' + k + '">' + esc(BORDER_TARGETS[k].label) + "</option>").join("") +
      '<option value="custom">Custom size…</option>';
    return `
      <div class="studio-controls ims-controls">
        <label class="st-field"><span>Target print size</span><select id="ims-target" aria-label="Target print size">${targets}</select></label>
        <label class="st-field"><span>Fitting mode</span>
          <select id="ims-mode" aria-label="Fitting mode">
            <option value="fit">Fit inside (uniform border)</option>
            <option value="fill">Fit to exact target (crop to fill)</option>
          </select>
        </label>
        <label class="st-field"><span>Units</span>
          <select id="ims-unit" aria-label="Measurement units"><option value="mm">Millimetres</option><option value="in">Inches</option></select>
        </label>
        <label class="st-field" id="ims-custom-wrap" hidden><span>Custom size W × H</span>
          <span class="ims-inline"><input type="number" id="ims-customW" min="1" step="0.1" value="100" aria-label="Custom width">
          × <input type="number" id="ims-customH" min="1" step="0.1" value="150" aria-label="Custom height"></span>
        </label>
        <label class="st-field st-slider"><span>Border width <b id="ims-bw-v">6 mm</b></span>
          <input type="range" id="ims-bw" min="0" max="60" step="0.5" value="6" aria-label="Border width"></label>
        <label class="st-field"><span>Border unit</span>
          <select id="ims-bwunit" aria-label="Border width unit"><option value="mm">Fixed mm</option><option value="%">% of short side</option></select>
        </label>
        <label class="st-field"><span>Border colour</span>
          <select id="ims-borderPreset" aria-label="Border colour preset">
            <option value="white">White</option><option value="black">Black</option><option value="custom">Custom…</option>
          </select>
        </label>
        <label class="st-field"><span>Custom colour</span><input type="color" id="ims-borderColor" value="#ffffff" aria-label="Custom border colour"></label>
        <label class="st-check"><input type="checkbox" id="ims-mat"> Mat effect (keyline around photo)</label>
        <label class="st-field ims-mat-only" hidden><span>Keyline width <b id="ims-keyw-v">0.5 mm</b></span>
          <input type="range" id="ims-keyw" min="0.1" max="5" step="0.1" value="0.5" aria-label="Keyline width">
        </label>
        <label class="st-field ims-mat-only" hidden><span>Keyline colour</span><input type="color" id="ims-keyColor" value="#111111" aria-label="Keyline colour"></label>
        <label class="st-field"><span>Output DPI</span>
          <select id="ims-dpi" aria-label="Output DPI"><option value="200">200 DPI</option><option value="300" selected>300 DPI</option></select>
        </label>
        <label class="st-field"><span>Export format</span>
          <select id="ims-format" aria-label="Export format"><option value="png">PNG</option><option value="jpeg">JPEG</option></select>
        </label>
        <label class="st-field st-slider"><span>Quality <b id="ims-quality-v">92%</b></span>
          <input type="range" id="ims-quality" min="30" max="100" step="1" value="92" aria-label="JPEG quality"></label>
      </div>
      <div class="ims-canvas-wrap">
        <canvas id="ims-canvas" aria-label="Bordered photo preview"></canvas>
      </div>
      <div class="ims-report" id="ims-report"></div>
      <div class="studio-side">
        <input type="file" id="ims-file" class="ims-hidden-file" accept="image/*" multiple aria-label="Add image files">
        <div class="studio-strip" id="ims-strip"></div>
      </div>`;
  }

  function wallpaperMarkup() {
    const groups = {};
    Object.keys(RATIO_PRESETS).forEach(k => { const g = RATIO_PRESETS[k].group; (groups[g] = groups[g] || []).push(k); });
    const opts = Object.keys(groups).map(g =>
      '<optgroup label="' + esc(g) + '">' + groups[g].map(k => '<option value="' + k + '">' + esc(RATIO_PRESETS[k].label) + "</option>").join("") + "</optgroup>"
    ).join("") + '<option value="custom">Custom ratio…</option>';
    return `
      <div class="studio-controls ims-controls">
        <label class="st-field"><span>Device / ratio preset</span><select id="ims-ratio" aria-label="Crop ratio preset">${opts}</select></label>
        <label class="st-field" id="ims-ratio-custom" hidden><span>Custom ratio W : H</span>
          <span class="ims-inline"><input type="number" id="ims-customRW" min="1" step="1" value="9" aria-label="Custom ratio width">
          : <input type="number" id="ims-customRH" min="1" step="1" value="16" aria-label="Custom ratio height"></span>
        </label>
        <label class="st-field" id="ims-px-wrap" hidden><span>Custom pixels W × H</span>
          <span class="ims-inline"><input type="number" id="ims-customW" min="16" step="1" value="1170" aria-label="Custom output width">
          × <input type="number" id="ims-customH" min="16" step="1" value="2532" aria-label="Custom output height"></span>
        </label>
        <label class="st-field"><span>Fill mode</span>
          <select id="ims-fillmode" aria-label="Fill mode">
            <option value="cover">Cover crop (focal point)</option>
            <option value="blur">Blur padding (no crop loss)</option>
          </select>
        </label>
        <label class="st-field"><span>Export format</span>
          <select id="ims-format" aria-label="Export format"><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select>
        </label>
        <label class="st-field st-slider"><span>Quality <b id="ims-quality-v">92%</b></span>
          <input type="range" id="ims-quality" min="30" max="100" step="1" value="92" aria-label="Export quality"></label>
        <label class="st-field"><span>Output</span><b id="ims-px-v">1170 × 2532 px</b></label>
      </div>
      <div class="ims-canvas-wrap">
        <canvas id="ims-canvas" aria-label="Wallpaper crop preview"></canvas>
      </div>
      <div class="ims-report" id="ims-report"></div>
      <div class="studio-side">
        <input type="file" id="ims-file" class="ims-hidden-file" accept="image/*" multiple aria-label="Add image files">
        <button type="button" class="btn secondary" id="ims-ratio-reset">Reset focal point to centre</button>
        <div class="studio-strip" id="ims-strip"></div>
      </div>`;
  }

  /* ---------------------------------------------------------------- mount */

  function mount(container, options) {
    const mode = (options && options.mode) || "mirror";
    state.mode = ["mirror", "border", "wallpaper"].includes(mode) ? mode : "mirror";
    state.root = container;
    state.items = [];
    state.active = 0;
    state.opts = Object.assign({}, DEFAULTS[state.mode]);
    state.note = "";
    state.noteUntil = 0;
    if (afterUrl) { URL.revokeObjectURL(afterUrl); afterUrl = null; }

    const body = state.mode === "mirror" ? mirrorMarkup() : state.mode === "border" ? borderMarkup() : wallpaperMarkup();
    const tip = state.mode === "mirror"
      ? "Mirror is instant — check the before/after panels, then download. SVGs stay as true vectors."
      : state.mode === "border"
        ? "Fit inside keeps the whole photo with a uniform border; Fill crops to the exact target."
        : "Pick a device preset, drag the crop box on the preview, then download a ready-to-set wallpaper.";

    container.className = "studio ims-studio";
    container.innerHTML = `
      <p class="ims-tip">${tip}</p>
      <div class="studio-toolbar">
        <button type="button" class="btn" id="ims-add">＋ Add files</button>
      </div>
      ${body}
      <div class="studio-bar">
        <div class="studio-meta" id="ims-meta" aria-live="polite">No files loaded yet.</div>
        <div class="studio-actions">
          <button type="button" class="btn" id="ims-dl" disabled>Download</button>
          <button type="button" class="btn secondary" id="ims-dlall" disabled>Download all</button>
          <button type="button" class="btn secondary" id="ims-note" disabled hidden>Hand-off note</button>
          <button type="button" class="btn secondary" id="ims-clear" disabled>Clear</button>
        </div>
      </div>
      <p class="ims-empty" id="ims-empty">Drop image files into the upload box above, or use Add files. Everything is processed locally — nothing is uploaded.</p>`;

    const noteBtn = $("#ims-note");
    if (noteBtn) noteBtn.hidden = state.mode !== "mirror";
    const allBtn = $("#ims-dlall");
    if (allBtn) allBtn.hidden = state.mode === "border";
    const dlBtn = $("#ims-dl");
    if (dlBtn) dlBtn.textContent = state.mode === "mirror" ? "Download flipped" : state.mode === "border" ? "Download bordered" : "Download wallpaper";

    syncControls();
    bindControls();
    if (state.mode === "wallpaper") bindWallpaperDrag();
    renderAll();

    const api = {
      addFiles: addFiles,
      state: () => state,
      setMode: m => mount(container, { mode: m }),
      exportMirror: item => mirrorExport(item || current()),
      borderReport: () => borderReport(current()),
      wallpaperOut: () => wallpaperOut(),
      wallpaperCrop: item => wallpaperCropFor(item || current(), wallpaperOut()),
      reset() { clearAll(); }
    };
    api._active = api;
    if (typeof window !== "undefined" && window.ImageStudio) window.ImageStudio._active = api;
    return api;
  }

  /* ---------------------------------------------------------------- export */

  const api = {
    mount: mount,
    core: {
      MM_PER_IN: MM_PER_IN,
      num: num,
      clamp: clamp,
      dpiPx: dpiPx,
      mmToIn: mmToIn,
      inToMm: inToMm,
      BORDER_TARGETS: BORDER_TARGETS,
      targetMm: targetMm,
      borderWidthMm: borderWidthMm,
      borderPx: borderPx,
      photoBox: photoBox,
      keylineBox: keylineBox,
      RATIO_PRESETS: RATIO_PRESETS,
      cropRect: cropRect,
      focalFromRect: focalFromRect,
      blurPad: blurPad,
      mirrorMatrix: mirrorMatrix,
      applyMatrix: applyMatrix,
      mirrorSvgTransform: mirrorSvgTransform,
      svgSize: svgSize,
      wrapSvg: wrapSvg,
      derivedName: derivedName,
      DEFAULTS: DEFAULTS
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.ImageStudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
