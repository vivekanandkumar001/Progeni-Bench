/*
 * Sheet Studio — shared engine for the Iron-on Transfer Sheet (docs/TOOLS_ROADMAP.md 1.4)
 * and the Print Layout Optimizer (1.5).
 *
 * Modes:
 *   "ironon"      — transfer-paper aware: one-click "Mirror all images" (default ON),
 *                   preset profiles (light / dark / HTV), per-image mirror override in
 *                   the thumbnail strip, cut-line guides (preview + optional baked
 *                   export), Letter / A4, margin + gap + columns 1-6, 300 DPI PNG + print.
 *   "printlayout" — aspect-aware packing: uniform rows x cols grid with fit-inside
 *                   letterboxing, or greedy auto-pack rows by aspect ratio, auto-rotate
 *                   to fit, mm borders with color, Letter / A4 / 4x6 / A3, 150/300 DPI
 *                   PNG + print, physical photo size report.
 *
 * Pure core (PAPERS, dpiPx, sheetPx, gridCells, autoRows, fitInside, packRows,
 * targetRowHeight, frameBox, mirrorX, mirrorTransform) is exported under
 * SheetStudio.core for node --test (test/sheet-geometry.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.SheetStudio.
 * Follows the conventions of sticker-studio.js / label-studio.js (IIFE, window global).
 */
(function () {
  "use strict";

  const PAPERS = {
    letter: { label: "US Letter (8.5 × 11 in)", w: 215.9, h: 279.4 },
    a4: { label: "A4 (210 × 297 mm)", w: 210, h: 297 },
    "4x6": { label: "4 × 6 in photo paper", w: 101.6, h: 152.4 },
    a3: { label: "A3 (297 × 420 mm)", w: 297, h: 420 }
  };

  const IRONON_PRESETS = {
    light: { label: "Light transfer paper (mirror)", mirror: true, cut: false },
    dark: { label: "Dark transfer paper (no mirror)", mirror: false, cut: false },
    htv: { label: "HTV vinyl (mirror + cut lines)", mirror: true, cut: true }
  };

  const MAX_ITEMS = 40;

  const DEFAULTS = {
    ironon: {
      paper: "letter", preset: "light", mirror: true, cut: false, exportCut: false,
      margin: 12, gap: 6, cols: 3, dpi: 300
    },
    printlayout: {
      paper: "letter", pack: "grid", cols: 2, rows: 2,
      margin: 10, gap: 4, border: 3, borderColor: "#ffffff", autoRotate: true, dpi: 300
    }
  };

  /* ---------------------------------------------------------------- pure core */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

  /* mm -> device pixels at a given DPI (25.4 mm per inch) */
  function dpiPx(mm, dpi) {
    return Math.round(mm * dpi / 25.4);
  }

  /* full sheet pixel size for a paper id at a DPI (rounded like real print drivers) */
  function sheetPx(paper, dpi) {
    const P = PAPERS[paper] || PAPERS.letter;
    return { w: dpiPx(P.w, dpi), h: dpiPx(P.h, dpi) };
  }

  /* Uniform grid: cells fill the sheet minus margins, split by cols/rows with gaps. */
  function gridCells(P, margin, gap, cols, rows) {
    cols = Math.max(1, Math.round(cols));
    rows = Math.max(1, Math.round(rows));
    const innerW = P.w - 2 * margin;
    const innerH = P.h - 2 * margin;
    const cellW = (innerW - gap * (cols - 1)) / cols;
    const cellH = (innerH - gap * (rows - 1)) / rows;
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      cells.push({
        x: margin + (i % cols) * (cellW + gap),
        y: margin + Math.floor(i / cols) * (cellH + gap),
        w: cellW, h: cellH
      });
    }
    return { cellW: cellW, cellH: cellH, cells: cells };
  }

  /* Iron-on uses square-ish cells: how many rows fit vertically at a given cell width. */
  function autoRows(P, margin, gap, cellW) {
    const innerH = P.h - 2 * margin;
    return Math.max(1, Math.floor((innerH + gap) / (cellW + gap)));
  }

  /* Fit an image inside a box preserving aspect. With autoRotate, turn the image 90°
     when that fills the box better. Returns { w, h, rot, scale }. */
  function fitInside(boxW, boxH, imgW, imgH, autoRotate) {
    imgW = num(imgW, 0); imgH = num(imgH, 0);
    if (!(imgW > 0) || !(imgH > 0)) return { w: boxW, h: boxH, rot: false, scale: 1 };
    let scale = Math.min(boxW / imgW, boxH / imgH);
    let rot = false;
    if (autoRotate) {
      const s2 = Math.min(boxW / imgH, boxH / imgW);
      if (s2 > scale) { scale = s2; rot = true; }
    }
    return rot
      ? { w: imgH * scale, h: imgW * scale, rot: true, scale: scale }
      : { w: imgW * scale, h: imgH * scale, rot: false, scale: scale };
  }

  /* Greedy row packing by aspect ratio: fill each row up to innerW at a target row
     height; rows taller than the width allow shrink to fit exactly.
     Returns { rows: [{ y, h, items: [{ i, x, y, w, h }] }], totalH } — boxes are
     aspect-exact (w = aspect * h). */
  function packRows(aspects, innerW, gap, targetH) {
    const rows = [];
    let y = 0, i = 0;
    while (i < aspects.length) {
      let sumA = 0, n = 0;
      while (i + n < aspects.length) {
        const a = aspects[i + n];
        const addW = a * targetH + (n > 0 ? gap : 0);
        if (n > 0 && sumA * targetH + addW > innerW + 1e-9) break;
        sumA += a;
        n++;
      }
      if (n === 0) break; // never happens (first item always fits), safety only
      const h = Math.min(targetH, (innerW - gap * (n - 1)) / sumA);
      const items = [];
      let x = 0;
      for (let k = 0; k < n; k++) {
        const w = aspects[i + k] * h;
        items.push({ i: i + k, x: x, y: y, w: w, h: h });
        x += w + gap;
      }
      rows.push({ y: y, h: h, items: items });
      y += h + gap;
      i += n;
    }
    return { rows: rows, totalH: rows.length ? y - gap : 0 };
  }

  /* Choose a target row height so the greedy packer fills a page height (innerH) as
     well as possible. Multiplicative fixed point with best-fill tracking; bounded. */
  function targetRowHeight(aspects, innerW, innerH, gap) {
    if (!aspects.length) return innerH;
    let H = Math.max(1, innerH), best = null, stale = 0;
    for (let k = 0; k < 40; k++) {
      const r = packRows(aspects, innerW, gap, H);
      if (r.totalH <= innerH + 1e-6) {
        if (!best || r.totalH > best.totalH + 1e-6) { best = { H: H, totalH: r.totalH }; stale = 0; }
        else stale++;
        if (best.totalH >= innerH * 0.999 || stale > 8) break;
        H = Math.min(H * (innerH / Math.max(r.totalH, innerH * 0.02)), innerH * 4);
      } else {
        H = H * (innerH / r.totalH);
        stale = 0;
        if (!(H > 0) || !isFinite(H)) break;
      }
    }
    return best ? best.H : Math.max(1, innerH);
  }

  /* Photo frame inside a cell: the cell inset by the border width (border/margin math). */
  function frameBox(cell, border) {
    const b = Math.max(0, Math.min(num(border, 0), Math.min(cell.w, cell.h) / 2 - 0.01));
    return { x: cell.x + b, y: cell.y + b, w: cell.w - 2 * b, h: cell.h - 2 * b };
  }

  /* Page-level horizontal mirror: left edge of rect (x,w) inside a span. */
  function mirrorX(x, w, span) {
    return span - x - w;
  }

  /* Canvas mirror transform for a rect (x, w): p' = tx + sx * p, i.e. reflection
     about the rect's own vertical center so the rect maps onto itself. */
  function mirrorTransform(x, w) {
    return { tx: 2 * x + w, sx: -1 };
  }

  function applyMirrorX(t, px) {
    return t.tx + t.sx * px;
  }

  /* ---------------------------------------------------------------- state */

  const state = {
    mode: "ironon",
    items: [], // { uid, name, url, img, mirror: null | boolean }
    opts: Object.assign({}, DEFAULTS.ironon),
    page: 0, zoom: 100,
    flashMsg: "", flashUntil: 0, _flashTimer: null
  };
  let root = null;
  let uid = 0;
  let raf = 0;

  const $ = sel => (root ? root.querySelector(sel) : null);
  const $$ = sel => (root ? Array.from(root.querySelectorAll(sel)) : []);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const readDataURL = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read " + f.name));
    r.readAsDataURL(f);
  });
  const loadImage = src => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Not a readable image"));
    im.src = src;
  });
  const download = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  function flash(msg) {
    state.flashMsg = msg;
    state.flashUntil = Date.now() + 3200;
    renderMeta(null);
    // Re-render the persistent meta once the flash expires so it doesn't linger.
    clearTimeout(state._flashTimer);
    state._flashTimer = setTimeout(() => renderMeta(null), 3250);
  }

  function itemMirror(item) {
    return item.mirror === null || item.mirror === undefined ? !!state.opts.mirror : !!item.mirror;
  }

  /* ---------------------------------------------------------------- layout */

  function layout() {
    const o = state.opts;
    const P = PAPERS[o.paper] || PAPERS.letter;
    const margin = clamp(num(o.margin, 10), 0, 60);
    const gap = clamp(num(o.gap, 4), 0, 30);
    const n = state.items.length;
    const innerW = Math.max(2, P.w - 2 * margin);
    const innerH = Math.max(2, P.h - 2 * margin);
    const isIron = state.mode === "ironon";

    let cells = null, rowPages = null, cols = 0, rows = 0, capacity = 0, pages = 1;

    if (isIron || o.pack === "grid") {
      cols = clamp(Math.round(num(o.cols, 2)), 1, 6);
      if (isIron) {
        const cellW = (innerW - gap * (cols - 1)) / cols;
        rows = autoRows(P, margin, gap, cellW);
      } else {
        rows = clamp(Math.round(num(o.rows, 2)), 1, 8);
      }
      cells = gridCells(P, margin, gap, cols, rows).cells;
      capacity = Math.max(1, cols * rows);
      pages = Math.max(1, Math.ceil(n / capacity));
    } else {
      // auto-pack rows by aspect ratio
      const aspects = state.items.map(it => {
        const im = it.img;
        return im && im.naturalWidth > 0 ? im.naturalWidth / im.naturalHeight : 1;
      });
      const H = targetRowHeight(aspects, innerW, innerH, gap);
      const packed = packRows(aspects, innerW, gap, H);
      rowPages = [];
      let cur = [], curH = 0;
      packed.rows.forEach(r => {
        if (cur.length && curH + gap + r.h > innerH + 1e-6) {
          rowPages.push(cur);
          cur = [];
          curH = 0;
        }
        curH += (cur.length ? gap : 0) + r.h;
        cur.push(r);
      });
      if (cur.length) rowPages.push(cur);
      pages = Math.max(1, rowPages.length);
      cols = 0;
      rows = rowPages.reduce((a, p) => a + p.length, 0);
      capacity = n;
    }

    // physical size of the first printed photo (mm) — the on-screen report
    let report = null;
    if (n) {
      let box = null;
      if (cells) box = cells[0];
      else if (rowPages && rowPages[0] && rowPages[0][0] && rowPages[0][0].items[0]) {
        const it = rowPages[0][0].items[0];
        box = { x: it.x, y: it.y, w: it.w, h: it.h };
      }
      if (box) {
        const im = state.items[0] && state.items[0].img;
        const f = frameBox(box, isIron ? 0 : num(o.border, 0));
        const fit = fitInside(f.w, f.h, im && im.naturalWidth ? im.naturalWidth : f.w,
          im && im.naturalHeight ? im.naturalHeight : f.h, !isIron && o.autoRotate);
        report = { w: fit.w, h: fit.h };
      }
    }

    return {
      P: P, margin: margin, gap: gap, cols: cols, rows: rows,
      capacity: capacity, pages: pages, n: n,
      cells: cells, rowPages: rowPages, report: report,
      innerW: innerW, innerH: innerH, mode: state.mode, opts: o
    };
  }

  function currentLayout() {
    const L = layout();
    if (state.page > L.pages - 1) state.page = Math.max(0, L.pages - 1);
    if (state.page < 0) state.page = 0;
    return L;
  }

  /* ---------------------------------------------------------------- drawing */

  function drawFitted(ctx, im, x, y, f) {
    if (f.rot) {
      ctx.save();
      ctx.translate(x + f.w / 2, y + f.h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(im, -f.h / 2, -f.w / 2, f.h, f.w);
      ctx.restore();
    } else {
      ctx.drawImage(im, x, y, f.w, f.h);
    }
  }

  function drawItem(ctx, cell, item, opts) {
    const o = state.opts;
    const isIron = state.mode === "ironon";
    const border = isIron ? 0 : num(o.border, 0);
    const frame = frameBox(cell, border);
    ctx.fillStyle = isIron ? "#ffffff" : o.borderColor;
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    const im = item.img;
    if (!im || !im.naturalWidth) return;
    const fit = fitInside(frame.w, frame.h, im.naturalWidth, im.naturalHeight, !isIron && !!o.autoRotate);
    const x = frame.x + (frame.w - fit.w) / 2;
    const y = frame.y + (frame.h - fit.h) / 2;
    if (isIron && itemMirror(item)) {
      // reflect in place about the cell's vertical center, clipped to the cell
      const t = mirrorTransform(cell.x, cell.w);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cell.x, cell.y, cell.w, cell.h);
      ctx.clip();
      ctx.transform(t.sx, 0, 0, 1, t.tx, 0);
      drawFitted(ctx, im, x, y, fit);
      ctx.restore();
    } else {
      drawFitted(ctx, im, x, y, fit);
    }
  }

  function drawEmptyCell(ctx, cell, opts) {
    if (opts.export) return;
    ctx.save();
    ctx.strokeStyle = "#dbe2ea";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(cell.x + 4, cell.y + 4, Math.max(1, cell.w - 8), Math.max(1, cell.h - 8));
    ctx.restore();
  }

  function drawCutLines(ctx, L) {
    if (state.mode !== "ironon" || !state.opts.cut || !L.cells) return;
    ctx.save();
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 0.3;
    ctx.setLineDash([2.4, 1.8]);
    L.cells.forEach(c => ctx.strokeRect(c.x, c.y, c.w, c.h));
    ctx.restore();
  }

  function drawPage(ctx, L, pageIndex, pxPerMm, opts) {
    opts = opts || {};
    ctx.save();
    ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, L.P.w, L.P.h);

    if (L.rowPages) {
      const rows = L.rowPages[pageIndex] || [];
      let y = L.margin;
      rows.forEach(r => {
        r.items.forEach(it => {
          const item = state.items[it.i];
          const box = { x: L.margin + it.x, y: y, w: it.w, h: it.h };
          if (item) drawItem(ctx, box, item, opts);
          else drawEmptyCell(ctx, box, opts);
        });
        y += r.h + L.gap;
      });
    } else {
      const start = pageIndex * L.capacity;
      for (let s = 0; s < L.capacity; s++) {
        const cell = L.cells[s];
        const item = state.items[start + s];
        if (item) drawItem(ctx, cell, item, opts);
        else drawEmptyCell(ctx, cell, opts);
      }
    }

    if (state.mode === "ironon" && state.opts.cut && (opts.export ? !!state.opts.exportCut : true)) {
      drawCutLines(ctx, L);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- render */

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; render(); });
  }

  function render() {
    if (!root) return;
    const L = currentLayout();
    const canvas = $("#shs-canvas");
    if (canvas) {
      const pxPerMm = clamp(1100 / L.P.w, 0.5, 6);
      canvas.width = Math.round(L.P.w * pxPerMm);
      canvas.height = Math.round(L.P.h * pxPerMm);
      drawPage(canvas.getContext("2d"), L, state.page, pxPerMm, { export: false });
      canvas.style.width = state.zoom + "%";
    }
    renderStrip();
    renderPager(L);
    renderMeta(L);
    const vp = $("#shs-viewport");
    if (vp) vp.classList.toggle("can-scroll", state.zoom > 100);
    const has = state.items.length > 0;
    ["#shs-png", "#shs-print", "#shs-clear"].forEach(s => {
      const b = $(s);
      if (b) b.disabled = !has;
    });
    const hint = $("#shs-hint");
    if (hint) hint.style.display = has ? "none" : "block";
    const cutexp = $("#shs-cutexport-wrap");
    if (cutexp) cutexp.hidden = !(state.mode === "ironon" && state.opts.cut);
    const gridopts = $("#shs-gridopts");
    if (gridopts) gridopts.hidden = state.mode !== "ironon" && state.opts.pack !== "grid";
    const bcol = $("#shs-bordercolor-wrap");
    if (bcol) bcol.hidden = state.mode !== "printlayout" || state.opts.borderColor !== "#custom";
  }

  function renderMeta(L) {
    const el = $("#shs-meta");
    if (!el) return;
    if (Date.now() < state.flashUntil) { el.textContent = state.flashMsg; return; }
    L = L || currentLayout();
    const o = state.opts;
    const bits = [];
    if (state.mode === "ironon") {
      bits.push(state.items.length + " image" + (state.items.length === 1 ? "" : "s"));
      bits.push(L.cols + " × " + L.rows + "/page");
      bits.push("mirror " + (o.mirror ? "ON" : "OFF"));
    } else {
      bits.push(state.items.length + " photo" + (state.items.length === 1 ? "" : "s"));
      bits.push(o.pack === "grid" ? "grid " + L.cols + " × " + L.rows : "auto-pack rows");
      if (L.report) {
        bits.push((o.pack === "grid" && state.items.length > 1 ? "each photo" : "photo") +
          " ≈ " + Math.round(L.report.w) + " × " + Math.round(L.report.h) + " mm");
      }
    }
    bits.push(L.pages > 1 ? "page " + (state.page + 1) + " of " + L.pages : PAPERS[o.paper].label);
    bits.push(o.dpi + " DPI");
    el.textContent = bits.join(" · ");
  }

  function renderPager(L) {
    const box = $("#shs-pages");
    if (!box) return;
    if (L.pages < 2) { box.innerHTML = '<span class="st-pageinfo">' + (L.pages === 1 ? "1 / 1" : "") + "</span>"; return; }
    let html = '<button type="button" class="st-page-btn" data-page="' + (state.page - 1) + '"' +
      (state.page === 0 ? " disabled" : "") + ' aria-label="Previous page">‹</button>';
    for (let i = 0; i < L.pages; i++) {
      html += '<button type="button" class="st-page-btn' + (i === state.page ? " active" : "") +
        '" data-page="' + i + '" aria-label="Page ' + (i + 1) + '">' + (i + 1) + "</button>";
    }
    html += '<button type="button" class="st-page-btn" data-page="' + (state.page + 1) + '"' +
      (state.page === L.pages - 1 ? " disabled" : "") + ' aria-label="Next page">›</button>';
    box.innerHTML = html;
    $$("#shs-pages .st-page-btn").forEach(b => {
      b.onclick = () => {
        const p = parseInt(b.dataset.page, 10);
        if (isNaN(p)) return;
        state.page = clamp(p, 0, L.pages - 1);
        render();
      };
    });
  }

  function renderStrip() {
    const strip = $("#shs-strip");
    if (!strip) return;
    const iron = state.mode === "ironon";
    strip.innerHTML = state.items.map((it, i) => {
      const eff = itemMirror(it);
      const mCls = iron ? (eff ? " shs-mir-on" : "") : "";
      const mGlyph = it.mirror === null || it.mirror === undefined ? "⇄" : (it.mirror ? "⇋" : "→");
      const mTitle = it.mirror === null || it.mirror === undefined
        ? "Mirror: automatic (follows \"Mirror all images\")"
        : (it.mirror ? "Mirror: always (override on)" : "Mirror: never (override off)");
      return '<div class="st-tile" data-i="' + i + '" title="' + esc(it.name) + '">' +
        '<img src="' + it.url + '" alt="">' +
        '<span class="st-idx">' + (i + 1) + "</span>" +
        (iron ? '<button type="button" class="shs-mirror' + mCls + '" data-mirror="' + i +
          '" aria-label="Mirror override for image ' + (i + 1) + '" title="' + esc(mTitle) + '">' + mGlyph + "</button>" : "") +
        '<button type="button" class="st-x" data-remove="' + i + '" aria-label="Remove image ' + (i + 1) + '" title="Remove">✕</button>' +
        "</div>";
    }).join("");
    strip.querySelectorAll("[data-remove]").forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        state.items.splice(parseInt(b.dataset.remove, 10), 1);
        state.page = 0;
        render();
      };
    });
    strip.querySelectorAll("[data-mirror]").forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const it = state.items[parseInt(b.dataset.mirror, 10)];
        if (!it) return;
        // cycle: inherit -> always -> never -> inherit
        if (it.mirror === null || it.mirror === undefined) it.mirror = true;
        else if (it.mirror === true) it.mirror = false;
        else it.mirror = null;
        render();
        flash(it.mirror === null ? "Image " + (parseInt(b.dataset.mirror, 10) + 1) + ": mirror follows the sheet toggle"
          : "Image " + (parseInt(b.dataset.mirror, 10) + 1) + ": mirror " + (it.mirror ? "forced ON" : "forced OFF"));
      };
    });
  }

  /* ---------------------------------------------------------------- controls */

  function syncControls() {
    const o = state.opts;
    const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
    const chk = (sel, v) => { const el = $(sel); if (el) el.checked = v; };
    set("#shs-preset", o.preset);
    set("#shs-paper", o.paper);
    set("#shs-cols", o.cols);
    set("#shs-rows", o.rows);
    set("#shs-pack", o.pack);
    set("#shs-dpi", o.dpi);
    set("#shs-margin", o.margin);
    set("#shs-gap", o.gap);
    set("#shs-border", o.border);
    const bv = $("#shs-margin-v"); if (bv) bv.textContent = o.margin + " mm";
    const gv = $("#shs-gap-v"); if (gv) gv.textContent = o.gap + " mm";
    const bov = $("#shs-border-v"); if (bov) bov.textContent = o.border + " mm";
    chk("#shs-mirror", o.mirror);
    chk("#shs-cut", o.cut);
    chk("#shs-cutexport", o.exportCut);
    chk("#shs-autorot", o.autoRotate);
    const bsel = $("#shs-bordersel");
    if (bsel) bsel.value = o.borderColor === "#ffffff" ? "white" : o.borderColor === "#000000" ? "black" : "custom";
    set("#shs-bordercolor", o.borderColor === "#custom" ? "#2563eb" : o.borderColor);
  }

  function bindControls() {
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

    on("#shs-paper", "change", e => { state.opts.paper = e.target.value; state.page = 0; render(); });
    on("#shs-cols", "change", e => { state.opts.cols = parseInt(e.target.value, 10) || 1; state.page = 0; render(); });
    on("#shs-rows", "change", e => { state.opts.rows = parseInt(e.target.value, 10) || 1; state.page = 0; render(); });
    on("#shs-pack", "change", e => { state.opts.pack = e.target.value; state.page = 0; render(); });
    on("#shs-dpi", "change", e => { state.opts.dpi = parseInt(e.target.value, 10) === 150 ? 150 : 300; render(); });

    on("#shs-margin", "input", e => {
      state.opts.margin = num(e.target.value, 10);
      const v = $("#shs-margin-v"); if (v) v.textContent = state.opts.margin + " mm";
      schedule();
    });
    on("#shs-gap", "input", e => {
      state.opts.gap = num(e.target.value, 4);
      const v = $("#shs-gap-v"); if (v) v.textContent = state.opts.gap + " mm";
      schedule();
    });
    on("#shs-border", "input", e => {
      state.opts.border = num(e.target.value, 3);
      const v = $("#shs-border-v"); if (v) v.textContent = state.opts.border + " mm";
      schedule();
    });

    on("#shs-mirror", "change", e => {
      state.opts.mirror = !!e.target.checked;
      render();
      flash(state.opts.mirror ? "Mirror all images ON — designs flip horizontally for transfer" : "Mirror all images OFF");
    });
    on("#shs-cut", "change", e => { state.opts.cut = !!e.target.checked; render(); });
    on("#shs-cutexport", "change", e => { state.opts.exportCut = !!e.target.checked; render(); });
    on("#shs-autorot", "change", e => { state.opts.autoRotate = !!e.target.checked; render(); });
    on("#shs-preset", "change", e => applyPreset(e.target.value));
    on("#shs-bordersel", "change", e => {
      const v = e.target.value;
      state.opts.borderColor = v === "white" ? "#ffffff" : v === "black" ? "#000000" : "#2563eb";
      const ci = $("#shs-bordercolor");
      if (ci) ci.value = state.opts.borderColor;
      render();
    });
    on("#shs-bordercolor", "input", e => { state.opts.borderColor = e.target.value; schedule(); });
    on("#shs-bordercolor", "change", () => {
      const sel = $("#shs-bordersel");
      if (sel) sel.value = "custom";
      render();
    });

    on("#shs-add", "click", () => { const f = $("#file"); if (f) f.click(); });
    on("#shs-clear", "click", () => {
      if (!state.items.length) return;
      state.items = [];
      state.page = 0;
      render();
    });
    on("#shs-png", "click", async () => {
      const blob = await exportPNG(state.page);
      if (!blob) return;
      const suffix = currentLayout().pages > 1 ? "-p" + (state.page + 1) : "";
      download(blob, "sheet-" + state.mode + "-" + state.opts.paper + suffix + ".png");
      flash("PNG downloaded (" + state.opts.dpi + " DPI)");
    });
    on("#shs-print", "click", printSheet);

    on("#shs-zoom-out", "click", () => setZoom(state.zoom - 25));
    on("#shs-zoom-in", "click", () => setZoom(state.zoom + 25));
    on("#shs-zoom-fit", "click", () => setZoom(100));
  }

  function applyPreset(key) {
    const p = IRONON_PRESETS[key] || IRONON_PRESETS.light;
    state.opts.preset = IRONON_PRESETS[key] ? key : "light";
    state.opts.mirror = p.mirror;
    state.opts.cut = p.cut;
    if (key === "htv") state.opts.gap = Math.max(state.opts.gap, 8); // scissor/plotter spacing
    syncControls();
    render();
    flash('Preset "' + p.label + '" applied — mirror ' + (p.mirror ? "ON" : "OFF") + (p.cut ? ", cut lines ON" : ""));
  }

  function setZoom(z) {
    state.zoom = clamp(z, 50, 400);
    render();
  }

  function bindViewport() {
    const vp = $("#shs-viewport");
    if (!vp) return;
    let drag = null;
    vp.addEventListener("pointerdown", e => {
      if (state.zoom <= 100 || e.target.closest(".st-page-btn")) return;
      drag = { sx: e.clientX, sy: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
      vp.setPointerCapture(e.pointerId);
      vp.classList.add("grabbing");
    });
    vp.addEventListener("pointermove", e => {
      if (!drag) return;
      vp.scrollLeft = drag.sl - (e.clientX - drag.sx);
      vp.scrollTop = drag.st - (e.clientY - drag.sy);
    });
    const end = () => { drag = null; vp.classList.remove("grabbing"); };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("wheel", e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(state.zoom - Math.sign(e.deltaY) * 25);
    }, { passive: false });
    vp.addEventListener("dblclick", () => setZoom(100));
  }

  /* ---------------------------------------------------------------- exports */

  async function exportPNG(pageIndex) {
    const L = currentLayout();
    const dpi = num(state.opts.dpi, 300);
    const px = sheetPx(state.opts.paper, dpi);
    const c = document.createElement("canvas");
    c.width = px.w;
    c.height = px.h;
    drawPage(c.getContext("2d"), L, clamp(pageIndex || 0, 0, L.pages - 1), dpi / 25.4, { export: true });
    const blob = await new Promise(res => c.toBlob(res, "image/png"));
    if (!blob) { flash("PNG export failed"); return null; }
    return blob;
  }

  function afterPrintCleanup() {
    const pr = document.getElementById("shs-print-root");
    if (pr) pr.remove();
    document.body.classList.remove("st-printing");
    const ps = document.getElementById("shs-page-style");
    if (ps) ps.remove();
    window.removeEventListener("afterprint", afterPrintCleanup);
  }

  function printSheet() {
    const L = currentLayout();
    const dpi = num(state.opts.dpi, 300);
    const px = sheetPx(state.opts.paper, dpi);
    const c = document.createElement("canvas");
    c.width = px.w;
    c.height = px.h;
    drawPage(c.getContext("2d"), L, state.page, dpi / 25.4, { export: true });
    const old = document.getElementById("shs-print-root");
    if (old) old.remove();
    const pr = document.createElement("div");
    pr.id = "shs-print-root";
    pr.appendChild(c);
    document.body.appendChild(pr);
    let ps = document.getElementById("shs-page-style");
    if (!ps) {
      ps = document.createElement("style");
      ps.id = "shs-page-style";
      document.head.appendChild(ps);
    }
    const P = L.P;
    ps.textContent = "@page{size:" + (P.w / 25.4).toFixed(3) + "in " + (P.h / 25.4).toFixed(3) + "in;margin:0}\n" +
      "#shs-print-root{display:block}\n" +
      "#shs-print-root canvas{width:100%;height:auto;display:block}";
    document.body.classList.add("st-printing");
    window.removeEventListener("afterprint", afterPrintCleanup);
    window.addEventListener("afterprint", afterPrintCleanup);
    window.print();
  }

  /* ---------------------------------------------------------------- file intake */

  function showHintError(msg) {
    const hint = $("#shs-hint");
    if (!hint) return;
    hint.style.display = "block";
    hint.innerHTML = '<span class="error" style="display:block;margin:0;">' + esc(msg) + "</span>";
  }

  function addFiles(files) {
    const list = [...(files || [])].filter(f => f.type && f.type.startsWith("image/"));
    if (!list.length) {
      showHintError("No readable image files found. Use PNG, JPEG, WebP or SVG.");
      return Promise.resolve(0);
    }
    const room = Math.max(0, MAX_ITEMS - state.items.length);
    const used = list.slice(0, room);
    const skipped = list.length - used.length;
    const prog = $("#shs-progress");
    const fill = $("#shs-progress-fill");
    const label = $("#shs-progress-label");
    if (prog) { prog.hidden = false; }
    let done = 0;
    const tick = () => {
      done++;
      if (fill) fill.style.width = Math.round(done / Math.max(1, used.length) * 100) + "%";
      if (label) label.textContent = "Loading image " + done + " of " + used.length + "…";
    };
    return Promise.all(used.map(f =>
      readDataURL(f).then(async url => {
        const img = await loadImage(url);
        if (!img.naturalWidth) throw new Error('"' + f.name + '" has no usable pixel data');
        const item = { uid: ++uid, name: f.name, url: url, img: img, mirror: null };
        tick();
        return item;
      })
    )).then(loaded => {
      if (prog) prog.hidden = true;
      state.items.push(...loaded);
      state.page = 0;
      render();
      if (skipped > 0) flash("Loaded " + state.items.length + " images — " + skipped + " skipped (max " + MAX_ITEMS + ")");
      else flash(loaded.length + " image" + (loaded.length === 1 ? "" : "s") + " added (" + state.items.length + "/" + MAX_ITEMS + ")");
      return loaded.length;
    }).catch(e => {
      if (prog) prog.hidden = true;
      showHintError(e.message || String(e));
      return 0;
    });
  }

  /* ---------------------------------------------------------------- mount */

  function mount(container, mode) {
    root = container;
    state.mode = mode === "printlayout" ? "printlayout" : "ironon";
    state.opts = Object.assign({}, DEFAULTS[state.mode]);
    state.items = [];
    state.page = 0;
    state.zoom = 100;

    const iron = state.mode === "ironon";
    const paperKeys = iron ? ["letter", "a4"] : ["letter", "a4", "4x6", "a3"];
    const paperOptions = paperKeys.map(k => '<option value="' + k + '">' + PAPERS[k].label + "</option>").join("");
    const colOptions = [1, 2, 3, 4, 5, 6].map(c => '<option value="' + c + '">' + c + "</option>").join("");
    const rowOptions = [1, 2, 3, 4, 5, 6, 8].map(r => '<option value="' + r + '">' + r + "</option>").join("");

    const ironControls = `
        <label class="st-field"><span>Preset profile</span>
          <select id="shs-preset" aria-label="Transfer paper preset">
            ${Object.keys(IRONON_PRESETS).map(k => '<option value="' + k + '">' + IRONON_PRESETS[k].label + "</option>").join("")}
          </select>
        </label>
        <label class="st-check"><input type="checkbox" id="shs-mirror" checked> Mirror all images</label>
        <label class="st-check"><input type="checkbox" id="shs-cut"> Cut lines (guides)</label>
        <label class="st-check" id="shs-cutexport-wrap" hidden><input type="checkbox" id="shs-cutexport"> Bake cut lines into export</label>`;

    const printControls = `
        <label class="st-field"><span>Pack mode</span>
          <select id="shs-pack" aria-label="Layout mode">
            <option value="grid">Uniform grid (rows × cols)</option>
            <option value="auto">Auto-pack rows (by aspect)</option>
          </select>
        </label>
        <div class="shs-gridopts" id="shs-gridopts">
          <label class="st-field"><span>Rows</span><select id="shs-rows" aria-label="Rows">${rowOptions}</select></label>
        </div>
        <label class="st-check"><input type="checkbox" id="shs-autorot" checked> Auto-rotate to fit (90°)</label>
        <label class="st-field st-slider"><span>Border <b id="shs-border-v">3 mm</b></span>
          <input type="range" id="shs-border" min="0" max="12" step="0.5" value="3" aria-label="Border width in mm"></label>
        <label class="st-field"><span>Border color</span>
          <select id="shs-bordersel" aria-label="Border color">
            <option value="white">White</option>
            <option value="black">Black</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        <label class="st-field" id="shs-bordercolor-wrap" hidden><span>Custom color</span>
          <input type="color" id="shs-bordercolor" value="#ffffff" aria-label="Custom border color"></label>`;

    root.className = "shs-studio";
    root.innerHTML = `
      <div class="studio-controls shs-controls">
        <label class="st-field"><span>Paper</span><select id="shs-paper" aria-label="Paper size">${paperOptions}</select></label>
        <label class="st-field"><span>Columns</span><select id="shs-cols" aria-label="Columns">${colOptions}</select></label>
        ${iron ? ironControls : printControls}
        <label class="st-field st-slider"><span>Margin <b id="shs-margin-v">10 mm</b></span>
          <input type="range" id="shs-margin" min="0" max="30" step="1" value="10" aria-label="Sheet margin in mm"></label>
        <label class="st-field st-slider"><span>Gap <b id="shs-gap-v">4 mm</b></span>
          <input type="range" id="shs-gap" min="0" max="20" step="1" value="4" aria-label="Gap between cells in mm"></label>
        <label class="st-field"><span>Export DPI</span>
          <select id="shs-dpi" aria-label="Export resolution">
            <option value="150">150 DPI (draft)</option>
            <option value="300" selected>300 DPI (print)</option>
          </select>
        </label>
      </div>

      <div class="studio-toolbar">
        <div class="st-zoom-group" role="group" aria-label="Preview zoom">
          <button type="button" class="st-icon-btn" id="shs-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <b class="st-readout" id="shs-zoom">100%</b>
          <button type="button" class="st-icon-btn" id="shs-zoom-in" aria-label="Zoom in" title="Zoom in">＋</button>
          <button type="button" class="st-view-btn" id="shs-zoom-fit" aria-label="Fit to view" title="Fit to view">Fit</button>
        </div>
        <div class="shs-tip" aria-hidden="true">${iron
          ? "Mirror is ON by default — place transfers face-down and print at 100% / Actual size."
          : "Photos keep their aspect ratio; the white space around them is your border."}</div>
      </div>

      <div class="studio-preview">
        <div class="studio-canvas-viewport" id="shs-viewport">
          <div class="studio-canvas-wrap"><canvas id="shs-canvas" aria-label="Sheet preview" role="img"></canvas></div>
        </div>
        <div class="studio-side">
          <div class="studio-pages" id="shs-pages"></div>
          <div class="studio-hint" id="shs-hint">${iron
            ? "Drop PNG/JPEG designs on the upload box above. Mirror is enabled by default for light transfer paper — use the presets for dark paper or HTV vinyl, and the ⇄ badge on any thumbnail to override a single image."
            : "Drop up to 40 photos on the upload box above. Use a uniform grid or auto-pack rows; each photo keeps its aspect ratio and the report below shows the printed size in mm."}</div>
          <div class="st-progress" id="shs-progress" hidden>
            <span class="st-progress-fill" id="shs-progress-fill"></span>
            <span class="st-progress-label" id="shs-progress-label">Loading…</span>
          </div>
          <div class="studio-strip" id="shs-strip"></div>
          <button type="button" class="btn secondary btn-sm" id="shs-add">＋ Add images</button>
        </div>
      </div>

      <div class="studio-bar">
        <div class="studio-meta" id="shs-meta" aria-live="polite"></div>
        <div class="studio-actions">
          <button type="button" class="btn" id="shs-png" disabled>Download PNG (${iron ? "300 DPI" : "150/300 DPI"})</button>
          <button type="button" class="btn secondary" id="shs-print" disabled>Print</button>
          <button type="button" class="btn secondary" id="shs-clear" disabled>Clear</button>
        </div>
      </div>`;

    syncControls();
    bindControls();
    bindViewport();
    render();

    const api = {
      addFiles: addFiles,
      exportPNG: exportPNG,
      printSheet: printSheet,
      state: () => state,
      layout: () => layout(),
      reset() { state.items = []; state.page = 0; render(); }
    };
    api._active = api; // exposed for automated tests / advanced scripting
    if (typeof window !== "undefined") window.SheetStudio._active = api;
    return api;
  }

  const api = { mount: mount, core: {
    PAPERS: PAPERS,
    IRONON_PRESETS: IRONON_PRESETS,
    DEFAULTS: DEFAULTS,
    dpiPx: dpiPx,
    sheetPx: sheetPx,
    gridCells: gridCells,
    autoRows: autoRows,
    fitInside: fitInside,
    packRows: packRows,
    targetRowHeight: targetRowHeight,
    frameBox: frameBox,
    mirrorX: mirrorX,
    mirrorTransform: mirrorTransform,
    applyMirrorX: applyMirrorX
  } };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.SheetStudio = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
