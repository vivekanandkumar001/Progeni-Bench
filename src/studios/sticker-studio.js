/*
 * Sticker Studio v2 — full functionality engine for the Sticker Sheet Maker.
 *
 * v1: layout controls, drag reorder, multi-page sheets, PNG/PDF/SVG export.
 * v2 adds:
 *   - per-sticker editor: rotate, flip, scale (mm readout), transparent-edge
 *     trim toggle, replace / duplicate / delete
 *   - cutter-ready: bleed, true circle shapes, registration marks,
 *     all-pages PNG & SVG export, browser Print (page-size aware)
 *   - project: undo/redo (Ctrl+Z / Ctrl+Shift+Z), localStorage save/load,
 *     JSON export/import
 *   - UX: zoom/pan preview, loading progress bar, background color,
 *     keyboard sticker reordering, aria labels
 *   - 3D live preview: drag-tilt paper view with optional auto-rotation
 *
 * 100% client-side. Loaded before app.js; exposes window.StickerStudio.
 */
(function () {
  "use strict";

  const MM = 300 / 25.4; // px per mm at 300 DPI
  const LS_KEY = "progeni-sticker-project-v1";

  const PAPERS = {
    letter: { label: "US Letter (8.5 × 11 in)", w: 2550, h: 3300, pt: [612, 792] },
    a4: { label: "A4 (210 × 297 mm)", w: 2480, h: 3508, pt: [595, 842] },
    a3: { label: "A3 (297 × 420 mm)", w: 3508, h: 4960, pt: [842, 1191] },
    "4x6": { label: "4 × 6 in photo paper", w: 1200, h: 1800, pt: [288, 432] }
  };

  const DEFAULTS = {
    paper: "letter", cols: "auto", rows: "auto",
    gap: 5, margin: 10,
    fit: "contain", shape: "rounded", border: 3, bleed: 1,
    cut: "dashed", cutColor: "#6b7280", reg: false,
    bg: "white", repeat: 1
  };

  const state = {
    items: [], opts: Object.assign({}, DEFAULTS),
    page: 0, zoom: 100, view: "2d",
    rx: -16, ry: -22, spin: false, spinDeg: 0,
    selected: null, replaceTarget: null,
    raf: 0, flashMsg: "", flashUntil: 0
  };
  const imgCache = new Map();
  const hist = { stack: [], index: -1 };
  let root = null;
  let uid = 0;
  let spinRaf = 0;

  /* ---------- helpers ---------- */
  const $ = sel => root.querySelector(sel);
  const $$ = sel => [...root.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normDeg = v => ((Math.round(v) + 180) % 360 + 360) % 360 - 180;
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
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  /* ---------- transparent-edge analysis ---------- */
  function analyzeTrim(img) {
    try {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      if (!iw || !ih || iw < 8 || ih < 8) return null;
      const scale = Math.min(1, 140 / Math.max(iw, ih));
      const w = Math.max(4, Math.round(iw * scale));
      const h = Math.max(4, Math.round(ih * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1, hasAlpha = false;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const a = d[(yy * w + xx) * 4 + 3];
          if (a < 8) { hasAlpha = true; continue; }
          if (a < 250) hasAlpha = true;
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
      }
      if (!hasAlpha || maxX <= minX || maxY <= minY) return null;
      const trim = {
        x: minX / w, y: minY / h,
        w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h
      };
      // only meaningful if it actually crops something
      if (trim.w > 0.97 && trim.h > 0.97) return null;
      return trim;
    } catch (e) {
      return null; // tainted canvas etc.
    }
  }

  /* ---------- history (undo / redo) ---------- */
  function snap() {
    return JSON.stringify({
      opts: state.opts,
      items: state.items.map(i => ({
        uid: i.uid, name: i.name, url: i.url,
        rot: i.rot, flipX: i.flipX, flipY: i.flipY,
        scale: i.scale, trim: i.trim, trimOn: i.trimOn
      }))
    });
  }
  function commit() {
    const s = snap();
    if (hist.stack[hist.index] === s) return;
    hist.stack = hist.stack.slice(0, hist.index + 1);
    hist.stack.push(s);
    if (hist.stack.length > 60) hist.stack.shift();
    hist.index = hist.stack.length - 1;
    updateUndoButtons();
  }
  function applySnap(s) {
    try {
      const d = JSON.parse(s);
      state.opts = Object.assign({}, DEFAULTS, d.opts);
      state.items = d.items.map(i => Object.assign({}, i, { img: imgCache.get(i.uid) || null }));
      state.page = 0;
      state.selected = null;
      syncControls();
      render();
    } catch (e) { /* ignore broken history entries */ }
  }
  function undo() {
    if (hist.index <= 0) return;
    hist.index--;
    applySnap(hist.stack[hist.index]);
    updateUndoButtons();
  }
  function redo() {
    if (hist.index >= hist.stack.length - 1) return;
    hist.index++;
    applySnap(hist.stack[hist.index]);
    updateUndoButtons();
  }
  function updateUndoButtons() {
    if (!root) return;
    const u = $("#st-undo"), r = $("#st-redo");
    if (u) u.disabled = hist.index <= 0;
    if (r) r.disabled = hist.index >= hist.stack.length - 1;
  }

  /* ---------- project (save / load / json) ---------- */
  function project() {
    return {
      v: 1, saved: new Date().toISOString(),
      opts: state.opts,
      items: state.items.map(i => ({
        name: i.name, url: i.url,
        rot: i.rot, flipX: i.flipX, flipY: i.flipY,
        scale: i.scale, trim: i.trim, trimOn: i.trimOn
      }))
    };
  }
  async function restoreProject(obj) {
    if (!obj || !Array.isArray(obj.items)) throw new Error("Not a valid sticker project");
    const items = [];
    for (const raw of obj.items) {
      if (!raw || typeof raw.url !== "string") continue;
      try {
        const img = await loadImage(raw.url);
        const item = {
          uid: ++uid, name: String(raw.name || "sticker"),
          url: raw.url, img,
          rot: normDeg(raw.rot || 0),
          flipX: !!raw.flipX, flipY: !!raw.flipY,
          scale: clamp(parseFloat(raw.scale) || 100, 30, 100),
          trim: raw.trim || null,
          trimOn: raw.trim ? raw.trimOn !== false : false
        };
        imgCache.set(item.uid, img);
        items.push(item);
      } catch (e) { /* skip unreadable entries */ }
    }
    state.opts = Object.assign({}, DEFAULTS, obj.opts || {});
    state.items = items;
    state.page = 0;
    state.selected = null;
    syncControls();
    commit();
    render();
  }
  function flash(msg) {
    state.flashMsg = msg;
    state.flashUntil = Date.now() + 3200;
    renderMeta();
  }

  /* ---------- shape paths ---------- */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function shapePath(ctx, x, y, w, h, shape) {
    ctx.beginPath();
    if (shape === "circle") {
      const s = Math.min(w, h);
      x += (w - s) / 2; y += (h - s) / 2; w = h = s;
      ctx.moveTo(x + w, y + h / 2);
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shape === "rounded") {
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.16);
    } else {
      ctx.rect(x, y, w, h);
    }
  }
  function svgShape(x, y, w, h, shape, expand) {
    const e = expand || 0;
    if (shape === "circle") {
      const s = Math.min(w + 2 * e, h + 2 * e);
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${s / 2}" ry="${s / 2}"/>`;
    }
    if (shape === "rounded") {
      const r = Math.min(w + 2 * e, h + 2 * e) * 0.16;
      return `<rect x="${x - e}" y="${y - e}" width="${w + 2 * e}" height="${h + 2 * e}" rx="${r}" ry="${r}"/>`;
    }
    return `<rect x="${x - e}" y="${y - e}" width="${w + 2 * e}" height="${h + 2 * e}"/>`;
  }

  /* ---------- layout ---------- */
  function effectiveItems() {
    const reps = clamp(parseInt(state.opts.repeat, 10) || 1, 1, 4);
    const out = [];
    for (let i = 0; i < reps; i++) out.push(...state.items);
    return out;
  }
  function autoCols(n, P, margin, gap) {
    if (n <= 0) return 3;
    for (let c = 1; c <= 6; c++) {
      const cw = (P.w - 2 * margin - gap * (c - 1)) / c;
      const rows = Math.max(1, Math.floor((P.h - 2 * margin + gap) / (cw + gap)));
      if (c * rows >= n) return c;
    }
    return 6;
  }
  function layout() {
    const o = state.opts;
    const P = PAPERS[o.paper] || PAPERS.letter;
    const margin = o.margin * MM;
    const gap = o.gap * MM;
    const eff = effectiveItems();
    const n = eff.length;
    const cols = o.cols === "auto" ? autoCols(n, P, margin, gap) : clamp(parseInt(o.cols, 10) || 3, 1, 8);
    const innerW = P.w - 2 * margin;
    const cellW = (innerW - gap * (cols - 1)) / cols;
    const innerH = P.h - 2 * margin;
    let cellH = cellW, rows;
    if (o.rows === "auto") {
      rows = Math.max(1, Math.floor((innerH + gap) / (cellW + gap)));
    } else {
      rows = clamp(parseInt(o.rows, 10) || 1, 1, 24);
      cellH = (innerH - gap * (rows - 1)) / rows;
    }
    const capacity = Math.max(1, cols * rows);
    const pages = Math.max(1, Math.ceil(n / capacity));
    const side = Math.max(4, Math.min(cellW, cellH));
    return { P, margin, gap, cols, rows, cellW, cellH, capacity, pages, side, n, eff, opts: o };
  }

  /* ---------- drawing ---------- */
  function drawArt(ctx, item, w, h, fit) {
    const im = item.img;
    if (!im || !im.naturalWidth) return;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (item.trimOn !== false && item.trim) {
      sx = item.trim.x * iw; sy = item.trim.y * ih;
      sw = item.trim.w * iw; sh = item.trim.h * ih;
    }
    const s = fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * s, dh = sh * s;
    ctx.drawImage(im, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  }

  function stickerGeom(item, L) {
    const o = L.opts;
    const borderW = o.border * MM;
    const bleedW = (o.bleed || 0) * MM;
    const pad = Math.max(borderW + MM, bleedW + 0.5 * MM);
    const base = Math.max(8, L.side - 2 * pad);
    const scale = item ? clamp(item.scale || 100, 30, 100) / 100 : 1;
    const cut = base * scale;
    const art = cut + 2 * bleedW;
    return { borderW, bleedW, cut, art };
  }

  function drawSticker(ctx, cellX, cellY, cellW, cellH, item, L) {
    const o = L.opts;
    const cx = cellX + cellW / 2, cy = cellY + cellH / 2;
    const g = stickerGeom(item, L);
    const cutBoxX = cx - g.cut / 2, cutBoxY = cy - g.cut / 2;

    // artwork (bleeds past the cut line)
    if (item) {
      ctx.save();
      shapePath(ctx, cx - g.art / 2, cy - g.art / 2, g.art, g.art, o.shape);
      ctx.clip();
      ctx.translate(cx, cy);
      if (item.rot) ctx.rotate(item.rot * Math.PI / 180);
      ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
      drawArt(ctx, item, g.art, g.art, o.fit);
      ctx.restore();
    }
    // white kiss-cut border, inside the cut path
    if (item && g.borderW > 0) {
      ctx.save();
      ctx.lineWidth = g.borderW;
      ctx.strokeStyle = "#ffffff";
      const bw = g.cut - g.borderW;
      shapePath(ctx, cx - bw / 2, cy - bw / 2, bw, bw, o.shape);
      ctx.stroke();
      ctx.restore();
    }
    // cut line on the cut path
    if (item && o.cut !== "off") {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = o.cutColor;
      ctx.setLineDash(o.cut === "dashed" ? [12, 9] : []);
      shapePath(ctx, cutBoxX, cutBoxY, g.cut, g.cut, o.shape);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRegistration(ctx, P) {
    const len = 100, inset = 60, t = 4;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(inset, inset, len, t);
    ctx.fillRect(inset, inset, t, len);
    ctx.fillRect(P.w - inset - len, inset, len, t);
    ctx.fillRect(P.w - inset - t, inset, t, len);
    ctx.fillRect(inset, P.h - inset - t, len, t);
    ctx.fillRect(inset, P.h - inset - len, t, len);
    ctx.restore();
  }

  // bgOverride: "white" | "cream" | "none" | undefined (use state)
  function drawPage(ctx, L, pageIndex, scale, bgOverride) {
    const o = L.opts;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const bg = bgOverride !== undefined ? bgOverride : o.bg;
    if (bg === "white") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, L.P.w, L.P.h); }
    else if (bg === "cream") { ctx.fillStyle = "#fffaf0"; ctx.fillRect(0, 0, L.P.w, L.P.h); }
    if (o.reg) drawRegistration(ctx, L.P);

    const start = pageIndex * L.capacity;
    const items = L.eff.slice(start, start + L.capacity);

    for (let i = 0; i < L.capacity; i++) {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const cellX = L.margin + col * (L.cellW + L.gap);
      const cellY = L.margin + row * (L.cellH + L.gap);
      const item = items[i] || null;
      if (!item) {
        if (scale < 1) { // empty-slot placeholder (preview only)
          const g = stickerGeom(null, L);
          ctx.save();
          ctx.strokeStyle = "#dbe2ea";
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = 2;
          shapePath(ctx, cellX + L.cellW / 2 - g.cut / 2, cellY + L.cellH / 2 - g.cut / 2, g.cut, g.cut, o.shape);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }
      drawSticker(ctx, cellX, cellY, L.cellW, L.cellH, item, L);
    }
    ctx.restore();
  }

  function currentLayout() {
    const L = layout();
    L.opts = state.opts;
    if (state.page > L.pages - 1) state.page = L.pages - 1;
    if (state.page < 0) state.page = 0;
    return L;
  }

  /* ---------- 3D view transform ---------- */
  function applyTransform() {
    if (!root) return;
    const w = $(".studio-canvas-wrap");
    if (!w) return;
    if (state.view !== "3d") { w.style.transform = ""; return; }
    const ry = state.ry + (state.spin ? state.spinDeg : 0);
    w.style.transform = `perspective(1500px) rotateX(${state.rx}deg) rotateY(${ry}deg)`;
  }
  function spinLoop() {
    if (!state.spin || state.view !== "3d" || !root) { spinRaf = 0; return; }
    state.spinDeg = (state.spinDeg + 0.1) % 360;
    applyTransform();
    spinRaf = requestAnimationFrame(spinLoop);
  }
  function ensureSpin() {
    if (state.spin && state.view === "3d" && !spinRaf) spinRaf = requestAnimationFrame(spinLoop);
  }
  function setView(v) {
    state.view = v;
    const vp = $("#st-viewport");
    if (vp) vp.classList.toggle("mode-3d", v === "3d");
    $$(".st-view-btn").forEach(b => {
      const on = b.dataset.view === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const ar = $("#st-autorot-wrap");
    if (ar) ar.hidden = v !== "3d";
    const hint = $("#st-3d-hint");
    if (hint) hint.hidden = v !== "3d";
    if (v !== "3d") { state.spin = false; if (spinRaf) { cancelAnimationFrame(spinRaf); spinRaf = 0; } const c = $("#st-autorot"); if (c) c.checked = false; }
    applyTransform();
    ensureSpin();
  }

  /* ---------- render ---------- */
  function render() {
    if (!root) return;
    const L = currentLayout();
    const canvas = $("#st-canvas");
    const scale = Math.min(1, 1100 / L.P.w);
    canvas.width = Math.round(L.P.w * scale);
    canvas.height = Math.round(L.P.h * scale);
    canvas.classList.toggle("trans", state.opts.bg === "none");
    drawPage(canvas.getContext("2d"), L, state.page, scale);
    renderStrip(L);
    renderEditor(L);
    renderPager(L);
    renderMeta(L);
    const has = state.items.length > 0;
    ["#st-png", "#st-pdf", "#st-svg", "#st-print", "#st-clear", "#st-png-all", "#st-svg-all"].forEach(s => {
      const b = $(s);
      if (b) b.disabled = !has;
    });
    $("#st-hint").style.display = has ? "none" : "block";
    $("#st-cutcolor").disabled = state.opts.cut === "off";
    const pagesBtns = ["#st-png-all", "#st-svg-all"];
    pagesBtns.forEach(s => { const b = $(s); if (b) b.hidden = L.pages < 2; });
    $("#st-png").textContent = L.pages > 1 ? `PNG (page ${state.page + 1})` : "Download PNG (300 DPI)";
    $("#st-svg").textContent = L.pages > 1 ? `SVG (page ${state.page + 1})` : "SVG die-line";
    const vp = $("#st-viewport");
    if (vp) vp.classList.toggle("can-scroll", state.zoom > 100);
    $("#st-canvas").style.width = state.zoom + "%";
    applyTransform();
  }

  function schedule() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(() => { state.raf = 0; render(); });
  }

  function renderMeta(L) {
    if (Date.now() < state.flashUntil) {
      $("#st-meta").textContent = state.flashMsg;
      return;
    }
    const o = state.opts;
    const reps = clamp(parseInt(o.repeat, 10) || 1, 1, 4);
    const base = `${state.items.length}${reps > 1 ? "×" + reps + "=" + state.items.length * reps : ""} sticker${state.items.length === 1 && reps === 1 ? "" : "s"}`;
    const bits = [
      base,
      `${L.cols} × ${L.rows} grid`,
      L.pages > 1 ? `page ${state.page + 1} of ${L.pages}` : "1 page",
      PAPERS[o.paper].label,
      "300 DPI"
    ];
    if (o.bleed > 0) bits.push(`${o.bleed} mm bleed`);
    $("#st-meta").textContent = bits.join(" · ");
  }

  function renderPager(L) {
    const box = $("#st-pages");
    if (L.pages < 2) { box.innerHTML = ""; return; }
    let html = `<button class="st-page-btn" data-page="${state.page - 1}" ${state.page === 0 ? "disabled" : ""} aria-label="Previous page">‹</button>`;
    for (let i = 0; i < L.pages; i++) {
      html += `<button class="st-page-btn ${i === state.page ? "active" : ""}" data-page="${i}" aria-label="Page ${i + 1}"${i === state.page ? ' aria-current="page"' : ""}>${i + 1}</button>`;
    }
    html += `<button class="st-page-btn" data-page="${state.page + 1}" ${state.page === L.pages - 1 ? "disabled" : ""} aria-label="Next page">›</button>`;
    box.innerHTML = html;
    box.querySelectorAll(".st-page-btn").forEach(b => {
      b.onclick = () => {
        const p = parseInt(b.dataset.page, 10);
        if (isNaN(p)) return;
        state.page = clamp(p, 0, L.pages - 1);
        render();
      };
    });
  }

  function renderStrip() {
    const strip = $("#st-strip");
    strip.innerHTML = state.items.map((it, i) => `
      <div class="st-tile ${state.selected === it.uid ? "selected" : ""}" draggable="true" tabindex="0"
           data-i="${i}" data-uid="${it.uid}" title="${esc(it.name)}"
           aria-label="Sticker ${i + 1}: ${esc(it.name)}. Enter to edit, arrow keys with Ctrl to reorder, Delete to remove.">
        <img src="${it.url}" alt="">
        <span class="st-idx">${i + 1}</span>
        <button class="st-edit" data-edit="${it.uid}" aria-label="Edit sticker ${i + 1}" title="Edit">✎</button>
        <button class="st-x" data-remove="${i}" aria-label="Remove sticker ${i + 1}" title="Remove">✕</button>
      </div>`).join("");

    strip.querySelectorAll("[data-remove]").forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const i = parseInt(b.dataset.remove, 10);
        const removed = state.items[i];
        state.items.splice(i, 1);
        if (removed && state.selected === removed.uid) state.selected = null;
        commit();
        render();
      };
    });
    strip.querySelectorAll("[data-edit]").forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const uidv = parseInt(b.dataset.edit, 10);
        state.selected = state.selected === uidv ? null : uidv;
        render();
      };
    });

    let dragFrom = null;
    strip.querySelectorAll(".st-tile").forEach(t => {
      t.addEventListener("dragstart", e => {
        dragFrom = parseInt(t.dataset.i, 10);
        t.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(dragFrom)); } catch (_) { }
      });
      t.addEventListener("dragend", () => { dragFrom = null; t.classList.remove("dragging"); });
      t.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      t.addEventListener("drop", e => {
        e.preventDefault();
        const to = parseInt(t.dataset.i, 10);
        if (dragFrom === null || isNaN(to) || dragFrom === to) return;
        const [moved] = state.items.splice(dragFrom, 1);
        state.items.splice(to, 0, moved);
        commit();
        render();
      });
      t.addEventListener("keydown", e => {
        const i = parseInt(t.dataset.i, 10);
        const k = e.key;
        if ((k === "ArrowLeft" || k === "ArrowRight") && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const to = clamp(i + (k === "ArrowRight" ? 1 : -1), 0, state.items.length - 1);
          if (to === i) return;
          const [moved] = state.items.splice(i, 1);
          state.items.splice(to, 0, moved);
          commit();
          render();
          const nt = $(`.st-tile[data-i="${to}"]`);
          if (nt) nt.focus();
        } else if (k === "Delete" || k === "Backspace") {
          e.preventDefault();
          state.items.splice(i, 1);
          commit();
          render();
        } else if (k === "Enter") {
          e.preventDefault();
          state.selected = parseInt(t.dataset.uid, 10);
          render();
          const ed = $("#st-ed-rotl");
          if (ed) ed.focus();
        } else if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
          // let the browser move focus between tiles naturally
        }
      });
    });
  }

  /* ---------- per-sticker editor ---------- */
  function renderEditor(L) {
    const ed = $("#st-editor");
    if (!ed) return;
    const idx = state.items.findIndex(i => i.uid === state.selected);
    if (idx < 0) { ed.hidden = true; return; }
    const it = state.items[idx];
    ed.hidden = false;
    const g = stickerGeom(it, L);
    const mm = ((g.cut / MM)).toFixed(1);
    ed.innerHTML = `
      <div class="st-editor-head">
        <strong>Edit sticker ${idx + 1}</strong>
        <span class="st-editor-name" title="${esc(it.name)}">${esc(it.name)}</span>
        <button class="st-icon-btn" id="st-ed-close" aria-label="Close editor" title="Close">✕</button>
      </div>
      <div class="st-editor-grid">
        <div class="st-editor-row">
          <span class="st-label">Rotate</span>
          <button class="btn secondary btn-sm" id="st-ed-rotl" aria-label="Rotate 90 degrees left">⟲ 90°</button>
          <button class="btn secondary btn-sm" id="st-ed-rotr" aria-label="Rotate 90 degrees right">⟳ 90°</button>
          <input type="range" id="st-ed-angle" min="-180" max="180" step="1" value="${it.rot}"
                 aria-label="Fine angle" title="Fine angle">
          <span class="st-readout" id="st-ed-angle-v">${it.rot}°</span>
        </div>
        <div class="st-editor-row">
          <span class="st-label">Flip</span>
          <button class="btn secondary btn-sm ${it.flipX ? "on" : ""}" id="st-ed-fliph"
                  aria-pressed="${it.flipX}" aria-label="Flip horizontally">⇋ H</button>
          <button class="btn secondary btn-sm ${it.flipY ? "on" : ""}" id="st-ed-flipv"
                  aria-pressed="${it.flipY}" aria-label="Flip vertically">⇅ V</button>
          <span class="st-label" style="margin-left:12px">Size</span>
          <input type="range" id="st-ed-scale" min="30" max="100" step="1" value="${it.scale}"
                 aria-label="Sticker size" title="Sticker size">
          <span class="st-readout" id="st-ed-scale-v">${it.scale}% · ${mm} mm</span>
        </div>
        <div class="st-editor-row">
          ${it.trim ? `<label class="st-check" style="padding:0"><input type="checkbox" id="st-ed-trim"${it.trimOn !== false ? " checked" : ""}> Trim transparent edges</label>` : ""}
          <button class="btn secondary btn-sm" id="st-ed-replace">Replace image</button>
          <button class="btn secondary btn-sm" id="st-ed-dup">Duplicate</button>
          <button class="btn secondary btn-sm danger" id="st-ed-del">Delete</button>
        </div>
      </div>`;

    const touch = () => { schedule(); };
    const commitTouch = () => { commit(); render(); };
    $("#st-ed-close").onclick = () => { state.selected = null; render(); };
    $("#st-ed-rotl").onclick = () => { it.rot = normDeg(it.rot - 90); commitTouch(); };
    $("#st-ed-rotr").onclick = () => { it.rot = normDeg(it.rot + 90); commitTouch(); };
    const ang = $("#st-ed-angle");
    ang.oninput = () => { it.rot = normDeg(ang.value); $("#st-ed-angle-v").textContent = it.rot + "°"; touch(); };
    ang.onchange = commit;
    $("#st-ed-fliph").onclick = () => { it.flipX = !it.flipX; commitTouch(); };
    $("#st-ed-flipv").onclick = () => { it.flipY = !it.flipY; commitTouch(); };
    const sc = $("#st-ed-scale");
    sc.oninput = () => {
      it.scale = clamp(parseFloat(sc.value), 30, 100);
      const LL = currentLayout();
      const gg = stickerGeom(it, LL);
      $("#st-ed-scale-v").textContent = `${it.scale}% · ${(gg.cut / MM).toFixed(1)} mm`;
      touch();
    };
    sc.onchange = commit;
    const tr = $("#st-ed-trim");
    if (tr) tr.onchange = () => { it.trimOn = tr.checked; commitTouch(); };
    $("#st-ed-replace").onclick = () => {
      state.replaceTarget = it.uid;
      const f = $("#st-replace");
      f.value = "";
      f.click();
    };
    $("#st-ed-dup").onclick = () => {
      const copy = Object.assign({}, it, { uid: ++uid });
      imgCache.set(copy.uid, it.img);
      state.items.splice(idx + 1, 0, copy);
      state.selected = copy.uid;
      commit();
      render();
    };
    $("#st-ed-del").onclick = () => {
      state.items.splice(idx, 1);
      state.selected = null;
      commit();
      render();
    };
  }

  /* ---------- controls ---------- */
  function bindControls() {
    const map = {
      "#st-paper": "paper", "#st-cols": "cols", "#st-rows": "rows",
      "#st-fit": "fit", "#st-shape": "shape", "#st-cut": "cut",
      "#st-cutcolor": "cutColor", "#st-bg": "bg", "#st-repeat": "repeat"
    };
    Object.keys(map).forEach(sel => {
      $(sel).onchange = () => {
        state.opts[map[sel]] = $(sel).value;
        commit();
        schedule();
      };
    });
    const sliders = { "#st-gap": "gap", "#st-margin": "margin", "#st-border": "border", "#st-bleed": "bleed" };
    Object.keys(sliders).forEach(sel => {
      const el = $(sel);
      el.addEventListener("input", () => {
        state.opts[sliders[sel]] = parseFloat(el.value);
        $(sel + "-v").textContent = `${el.value} mm`;
        schedule();
      });
      // one history entry per completed gesture
      el.addEventListener("change", commit);
    });
    $("#st-reg").onchange = () => { state.opts.reg = $("#st-reg").checked; commit(); schedule(); };

    $("#st-add").onclick = () => { const f = $("#file"); if (f) f.click(); };
    $("#st-clear").onclick = () => {
      if (!state.items.length) return;
      state.items = [];
      state.page = 0;
      state.selected = null;
      commit();
      render();
    };
    $("#st-undo").onclick = undo;
    $("#st-redo").onclick = redo;

    $("#st-png").onclick = () => exportPNG(state.page);
    $("#st-pdf").onclick = exportPDF;
    $("#st-svg").onclick = () => exportSVG(state.page);
    $("#st-print").onclick = printSheet;
    $("#st-png-all").onclick = exportAllPNG;
    $("#st-svg-all").onclick = exportAllSVG;

    $("#st-save").onclick = () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(project()));
        flash("Project saved in this browser ✓");
      } catch (e) {
        flash("Too large for browser storage — use Export JSON instead");
      }
    };
    $("#st-load").onclick = () => {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
      if (!raw) { flash("No saved project found in this browser"); return; }
      restoreProject(JSON.parse(raw))
        .then(() => flash("Project loaded ✓"))
        .catch(() => flash("Saved project is damaged"));
    };
    $("#st-exportjson").onclick = () => {
      download(new Blob([JSON.stringify(project())], { type: "application/json" }), "sticker-project.json");
      flash("sticker-project.json downloaded");
    };
    $("#st-importjson").onclick = () => { const f = $("#st-import"); f.value = ""; f.click(); };
    $("#st-import").onchange = () => {
      const f = $("#st-import").files[0];
      if (!f) return;
      f.text()
        .then(t => restoreProject(JSON.parse(t)))
        .then(() => flash("Project imported ✓"))
        .catch(() => flash("Not a valid project file"));
    };
    $("#st-replace").onchange = () => {
      const f = $("#st-replace").files[0];
      const target = state.replaceTarget;
      state.replaceTarget = null;
      if (!f || !target) return;
      const it = state.items.find(i => i.uid === target);
      if (!it) return;
      readDataURL(f)
        .then(url => loadImage(url).then(img => ({ url, img })))
        .then(({ url, img }) => {
          if (!img.naturalWidth) throw new Error("no pixels");
          it.url = url;
          it.name = f.name;
          it.img = img;
          it.trim = analyzeTrim(img);
          it.trimOn = !!it.trim;
          imgCache.set(it.uid, img);
          commit();
          render();
        })
        .catch(() => flash("Could not read that image"));
    };

    /* view + zoom */
    $$(".st-view-btn").forEach(b => { b.onclick = () => setView(b.dataset.view); });
    $("#st-resetview").onclick = () => { state.rx = -16; state.ry = -22; state.spinDeg = 0; applyTransform(); };
    $("#st-autorot").onchange = () => {
      state.spin = $("#st-autorot").checked;
      ensureSpin();
      applyTransform();
    };
    const zoom = $("#st-zoom");
    zoom.oninput = () => {
      state.zoom = clamp(parseInt(zoom.value, 10) || 100, 50, 400);
      $("#st-zoom-v").textContent = state.zoom + "%";
      schedule();
    };
    $("#st-zoom-out").onclick = () => setZoom(state.zoom - 25);
    $("#st-zoom-in").onclick = () => setZoom(state.zoom + 25);
    $("#st-zoom-fit").onclick = () => setZoom(100);
  }

  function setZoom(z) {
    state.zoom = clamp(z, 50, 400);
    $("#st-zoom").value = state.zoom;
    $("#st-zoom-v").textContent = state.zoom + "%";
    render();
  }

  function syncControls() {
    const o = state.opts;
    const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
    set("#st-paper", o.paper); set("#st-cols", o.cols); set("#st-rows", o.rows);
    set("#st-fit", o.fit); set("#st-shape", o.shape); set("#st-cut", o.cut);
    set("#st-cutcolor", o.cutColor); set("#st-bg", o.bg); set("#st-repeat", o.repeat);
    const sliders = { "#st-gap": "gap", "#st-margin": "margin", "#st-border": "border", "#st-bleed": "bleed" };
    Object.keys(sliders).forEach(sel => {
      set(sel, o[sliders[sel]]);
      const lab = $(sel + "-v");
      if (lab) lab.textContent = `${o[sliders[sel]]} mm`;
    });
    const reg = $("#st-reg"); if (reg) reg.checked = !!o.reg;
  }

  /* ---------- viewport: zoom pan + 3D tilt ---------- */
  function bindViewport() {
    const vp = $("#st-viewport");
    let drag = null;
    vp.addEventListener("pointerdown", e => {
      if (e.target.closest(".st-page-btn")) return;
      if (state.view === "3d") {
        drag = { mode: "tilt", sx: e.clientX, sy: e.clientY, rx: state.rx, ry: state.ry };
        if (state.spin) { state.spin = false; const c = $("#st-autorot"); if (c) c.checked = false; }
        vp.setPointerCapture(e.pointerId);
        vp.classList.add("grabbing");
      } else if (state.zoom > 100) {
        drag = { mode: "pan", sx: e.clientX, sy: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
        vp.setPointerCapture(e.pointerId);
        vp.classList.add("grabbing");
      }
    });
    vp.addEventListener("pointermove", e => {
      if (!drag) return;
      if (drag.mode === "tilt") {
        state.rx = clamp(drag.rx - (e.clientY - drag.sy) * 0.35, -70, 70);
        state.ry = drag.ry + (e.clientX - drag.sx) * 0.35;
        applyTransform();
      } else {
        vp.scrollLeft = drag.sl - (e.clientX - drag.sx);
        vp.scrollTop = drag.st - (e.clientY - drag.sy);
      }
    });
    const end = () => { drag = null; vp.classList.remove("grabbing"); };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("wheel", e => {
      if (state.view === "3d") {
        e.preventDefault();
        state.rx = clamp(state.rx + e.deltaY * 0.08, -70, 70);
        applyTransform();
      } else if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(state.zoom - Math.sign(e.deltaY) * 25);
      }
    }, { passive: false });
    vp.addEventListener("dblclick", () => {
      if (state.view === "3d") { state.rx = -16; state.ry = -22; state.spinDeg = 0; applyTransform(); }
      else setZoom(100);
    });
  }

  /* ---------- global keyboard: undo / redo ---------- */
  function onKeydown(e) {
    if (!root || !document.contains(root)) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      // allow Ctrl+Z outside our editor fields only
      if (!(t.type === "range" || t.type === "checkbox" || t.tagName === "SELECT")) return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
    } else if (mod && (e.shiftKey && (e.key === "z" || e.key === "Z")) || (e.ctrlKey && (e.key === "y" || e.key === "Y"))) {
      e.preventDefault();
      redo();
    }
  }

  /* ---------- exports ---------- */
  function renderFull(pageIndex, bgOverride) {
    const L = currentLayout();
    const c = document.createElement("canvas");
    c.width = L.P.w;
    c.height = L.P.h;
    drawPage(c.getContext("2d"), L, pageIndex, 1, bgOverride);
    return { canvas: c, L };
  }

  async function exportPNG(pageIndex) {
    const { canvas, L } = renderFull(pageIndex);
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const suffix = L.pages > 1 ? `-p${pageIndex + 1}` : "";
    download(blob, `sticker-sheet-${state.opts.paper}${suffix}.png`);
  }
  async function exportAllPNG() {
    const L = currentLayout();
    flash(`Downloading ${L.pages} PNG files…`);
    for (let i = 0; i < L.pages; i++) {
      await exportPNG(i);
      await sleep(350);
    }
  }

  function canvasToPdf(pages) {
    const enc = s => {
      const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
      return u;
    };
    const chunks = [];
    let offset = 0;
    const offsets = [];
    const push = u => { chunks.push(u); offset += u.length; };
    const obj = (n, body) => { offsets[n] = offset; push(enc(`${n} 0 obj\n${body}\nendobj\n`)); };

    return (async () => {
      const n = pages.length;
      const jpegUrls = await Promise.all(pages.map(p => new Promise(res => p.canvas.toBlob(b => res(b), "image/jpeg", 0.95))));
      const jpegs = await Promise.all(jpegUrls.map(b => b.arrayBuffer()));

      push(enc("%PDF-1.4\n"));
      obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
      const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
      obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);

      pages.forEach((p, i) => {
        const pageObj = 3 + i * 3, imgObj = 4 + i * 3, contObj = 5 + i * 3;
        obj(pageObj, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pt[0]} ${p.pt[1]}] ` +
          `/Resources << /XObject << /Im${i} ${imgObj} 0 R >> >> /Contents ${contObj} 0 R >>`);

        const jpg = new Uint8Array(jpegs[i]);
        offsets[imgObj] = offset;
        push(enc(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.canvas.width} ` +
          `/Height ${p.canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${jpg.length} >>\nstream\n`));
        push(jpg);
        push(enc("\nendstream\nendobj\n"));

        const content = `q\n${p.pt[0]} 0 0 ${p.pt[1]} 0 0 cm\n/Im${i} Do\nQ`;
        obj(contObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      });

      const size = 3 + n * 3;
      const xrefStart = offset;
      let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
      for (let i = 1; i < size; i++) {
        xref += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
      }
      xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
      push(enc(xref));
      return new Blob(chunks, { type: "application/pdf" });
    })();
  }

  async function exportPDF() {
    const L0 = currentLayout();
    const pages = [];
    for (let i = 0; i < L0.pages; i++) {
      const { canvas, L } = renderFull(i, "white"); // print always on white
      pages.push({ canvas, pt: L.P.pt });
    }
    const blob = await canvasToPdf(pages);
    download(blob, `sticker-sheet-${state.opts.paper}.pdf`);
    if (L0.pages > 1) flash(`PDF with ${L0.pages} pages downloaded`);
  }

  function svgForPage(L, pageIndex) {
    const o = L.opts;
    const borderW = o.border * MM;
    const bleedW = (o.bleed || 0) * MM;
    const start = pageIndex * L.capacity;
    const items = L.eff.slice(start, start + L.capacity);
    const defs = [], body = [];

    items.forEach((it, i) => {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const cellX = L.margin + col * (L.cellW + L.gap);
      const cellY = L.margin + row * (L.cellH + L.gap);
      const cx = cellX + L.cellW / 2, cy = cellY + L.cellH / 2;
      const g = stickerGeom(it, L);
      const artX = cx - g.art / 2, artY = cy - g.art / 2;
      const cutX = cx - g.cut / 2, cutY = cy - g.cut / 2;

      // artwork: sub-rect mapped exactly like canvas drawImage(source-rect)
      const im = it.img;
      const iw = im && (im.naturalWidth || im.width) || 0;
      const ih = im && (im.naturalHeight || im.height) || 0;
      if (iw && ih) {
        let sx = 0, sy = 0, sw = iw, sh = ih;
        if (it.trimOn !== false && it.trim) {
          sx = it.trim.x * iw; sy = it.trim.y * ih;
          sw = it.trim.w * iw; sh = it.trim.h * ih;
        }
        const s = o.fit === "cover" ? Math.max(g.art / sw, g.art / sh) : Math.min(g.art / sw, g.art / sh);
        const dw = iw * s, dh = ih * s;
        // sub-rect centre must land at (0,0) of the translated group
        const offX = -(sx + sw / 2) * s, offY = -(sy + sh / 2) * s;
        defs.push(`<clipPath id="stclip${pageIndex}_${i}">${svgShape(artX, artY, g.art, g.art, o.shape, 0)}</clipPath>`);
        const href = /^data:image\//i.test(it.url || "") ? it.url.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        const flip = `scale(${it.flipX ? -1 : 1},${it.flipY ? -1 : 1})`;
        body.push(
          `<g clip-path="url(#stclip${pageIndex}_${i})">` +
          `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">` +
          `<g transform="rotate(${it.rot || 0}) ${flip}">` +
          `<image x="${offX.toFixed(1)}" y="${offY.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" ` +
          `preserveAspectRatio="none" href="${href}"/>` +
          `</g></g></g>`
        );
      }
      if (borderW > 0) {
        const bw = g.cut - g.borderW;
        body.push(`<g fill="none" stroke="#ffffff" stroke-width="${borderW}">` +
          svgShape(cx - bw / 2, cy - bw / 2, bw, bw, o.shape, 0) + `</g>`);
      }
      if (o.cut !== "off") {
        const dash = o.cut === "dashed" ? ` stroke-dasharray="12 9"` : "";
        body.push(`<g fill="none" stroke="${o.cutColor}" stroke-width="3"${dash}>` +
          svgShape(cutX, cutY, g.cut, g.cut, o.shape, 0) + `</g>`);
      }
    });

    const marks = o.reg ? `
<g fill="#000000">
  <rect x="60" y="60" width="100" height="4"/><rect x="60" y="60" width="4" height="100"/>
  <rect x="${L.P.w - 160}" y="60" width="100" height="4"/><rect x="${L.P.w - 64}" y="60" width="4" height="100"/>
  <rect x="60" y="${L.P.h - 64}" width="100" height="4"/><rect x="60" y="${L.P.h - 160}" width="4" height="100"/>
</g>` : "";

    const bgRect = o.bg === "cream"
      ? `<rect width="${L.P.w}" height="${L.P.h}" fill="#fffaf0"/>`
      : o.bg === "none" ? "" : `<rect width="${L.P.w}" height="${L.P.h}" fill="#ffffff"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.P.pt[0]}pt" height="${L.P.pt[1]}pt" viewBox="0 0 ${L.P.w} ${L.P.h}">
<title>Progeni Bench sticker sheet die-line — ${PAPERS[o.paper].label}</title>
<defs>${defs.join("")}</defs>
${bgRect}
${marks}
${body.join("\n")}
</svg>`;
  }

  function exportSVG(pageIndex) {
    const L = currentLayout();
    const svg = svgForPage(L, pageIndex);
    const suffix = L.pages > 1 ? `-p${pageIndex + 1}` : "";
    download(new Blob([svg], { type: "image/svg+xml" }), `sticker-sheet-${state.opts.paper}${suffix}.svg`);
  }
  async function exportAllSVG() {
    const L = currentLayout();
    flash(`Downloading ${L.pages} SVG files…`);
    for (let i = 0; i < L.pages; i++) {
      exportSVG(i);
      await sleep(350);
    }
  }

  async function printSheet() {
    const { canvas, L } = renderFull(state.page, "white");
    let pr = document.getElementById("st-print-root");
    if (pr) pr.remove();
    pr = document.createElement("div");
    pr.id = "st-print-root";
    pr.appendChild(canvas);
    document.body.appendChild(pr);
    let ps = document.getElementById("st-page-style");
    if (!ps) { ps = document.createElement("style"); ps.id = "st-page-style"; document.head.appendChild(ps); }
    const pt = L.P.pt;
    ps.textContent = `@page{size:${(pt[0] / 72).toFixed(3)}in ${(pt[1] / 72).toFixed(3)}in;margin:0}`;
    document.body.classList.add("st-printing");
    const cleanup = () => {
      document.body.classList.remove("st-printing");
      pr.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  /* ---------- file intake ---------- */
  function showHintError(msg) {
    const hint = $("#st-hint");
    hint.style.display = "block";
    hint.innerHTML = `<span class="error" style="display:block;margin:0;">${esc(msg)}</span>`;
  }

  function addFiles(files) {
    const list = [...(files || [])].filter(f => f.type.startsWith("image/"));
    if (!list.length) {
      showHintError("No readable image files found. Use PNG, JPEG, WebP or SVG.");
      return;
    }
    const prog = $("#st-progress");
    const fill = $("#st-progress-fill");
    const label = $("#st-progress-label");
    prog.hidden = false;
    let done = 0;
    const tick = () => {
      done++;
      fill.style.width = Math.round(done / list.length * 100) + "%";
      label.textContent = `Loading image ${done} of ${list.length}…`;
    };
    Promise.allSettled(list.map(f =>
      readDataURL(f).then(async url => {
        const img = await loadImage(url);
        if (!img.naturalWidth) throw new Error(`"${f.name}" has no usable pixel data`);
        const trim = analyzeTrim(img);
        const item = {
          uid: ++uid, name: f.name, url, img,
          rot: 0, flipX: false, flipY: false,
          scale: 100, trim, trimOn: !!trim
        };
        imgCache.set(item.uid, img);
        tick();
        return item;
      })
    )).then(results => {
      prog.hidden = true;
      const loaded = results.filter(r => r.status === "fulfilled").map(r => r.value);
      const failed = results.length - loaded.length;
      state.items.push(...loaded);
      commit();
      render();
      if (failed > 0 && loaded.length === 0) {
        const first = results.find(r => r.status === "rejected");
        showHintError(first ? (first.reason && first.reason.message) || String(first.reason) : "No images could be loaded");
      }
    }).catch(e => {
      prog.hidden = true;
      showHintError(e.message || String(e));
    });
  }

  /* ---------- mount ---------- */
  function mount(container) {
    root = container;
    root.classList.add("sticker-studio");
    root.innerHTML = `
      <div class="studio-controls sticker-controls">
        <div class="st-controls-grid">
          <label class="st-field"><span>Paper</span>
            <select id="st-paper" aria-label="Paper size">${Object.keys(PAPERS).map(k => `<option value="${k}">${PAPERS[k].label}</option>`).join("")}</select>
          </label>
          <label class="st-field"><span>Columns</span>
            <select id="st-cols" aria-label="Columns">
              <option value="auto">Auto (fit one page)</option>
              ${[1, 2, 3, 4, 5, 6].map(c => `<option value="${c}">${c}</option>`).join("")}
            </select>
          </label>
          <label class="st-field"><span>Rows</span>
            <select id="st-rows" aria-label="Rows">
              <option value="auto">Auto (from paper)</option>
              ${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(r => `<option value="${r}">${r}</option>`).join("")}
            </select>
          </label>
          <label class="st-field"><span>Fit</span>
            <select id="st-fit" aria-label="Image fit">
              <option value="contain">Contain (whole image)</option>
              <option value="cover">Cover (fill &amp; crop)</option>
            </select>
          </label>
          <label class="st-field"><span>Shape</span>
            <select id="st-shape" aria-label="Sticker shape">
              <option value="none">Square</option>
              <option value="rounded">Rounded</option>
              <option value="circle">Circle (true)</option>
            </select>
          </label>
          <label class="st-field"><span>Sheet background</span>
            <select id="st-bg" aria-label="Sheet background">
              <option value="white">White</option>
              <option value="cream">Cream (warm print)</option>
              <option value="none">Transparent (PNG/SVG)</option>
            </select>
          </label>
          <label class="st-field st-slider"><span>Spacing <b id="st-gap-v"></b></span>
            <input type="range" id="st-gap" min="0" max="20" step="1" aria-label="Spacing">
          </label>
          <label class="st-field st-slider"><span>Margins <b id="st-margin-v"></b></span>
            <input type="range" id="st-margin" min="0" max="30" step="1" aria-label="Margins">
          </label>
          <label class="st-field st-slider"><span>White border <b id="st-border-v"></b></span>
            <input type="range" id="st-border" min="0" max="10" step="0.5" aria-label="White border width">
          </label>
        </div>
        <details class="st-advanced" id="st-advanced">
          <summary><span>Advanced print &amp; cut</span><small>Cut lines, bleed, copies, registration marks</small></summary>
          <div class="st-advanced-grid">
            <label class="st-field"><span>Cut lines</span>
              <select id="st-cut" aria-label="Cut lines">
                <option value="off">Off</option>
                <option value="dashed">Dashed (kiss-cut)</option>
                <option value="solid">Solid</option>
              </select>
            </label>
            <label class="st-field"><span>Cut line color</span>
              <select id="st-cutcolor" aria-label="Cut line color">
                <option value="#6b7280">Gray (home print)</option>
                <option value="#000000">Black (Cricut Print-Then-Cut)</option>
                <option value="#db2777">Magenta</option>
              </select>
            </label>
            <label class="st-field"><span>Sheet copies</span>
              <select id="st-repeat" aria-label="Repeat every sticker">
                <option value="1">1 × (each once)</option>
                <option value="2">2 × (each twice)</option>
                <option value="3">3 × (each 3 times)</option>
                <option value="4">4 × (each 4 times)</option>
              </select>
            </label>
            <label class="st-field st-slider"><span>Bleed <b id="st-bleed-v"></b></span>
              <input type="range" id="st-bleed" min="0" max="4" step="0.5" aria-label="Bleed beyond cut line" title="Artwork extends past the cut line">
            </label>
            <label class="st-check"><input type="checkbox" id="st-reg"> Corner registration marks</label>
          </div>
        </details>
      </div>

      <div class="studio-toolbar">
        <div class="st-zoom-group" role="group" aria-label="Preview zoom">
          <button class="st-icon-btn" id="st-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <input type="range" id="st-zoom" min="50" max="400" step="25" value="100" aria-label="Zoom level">
          <button class="st-icon-btn" id="st-zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
          <span class="st-readout" id="st-zoom-v">100%</span>
          <button class="st-icon-btn" id="st-zoom-fit" aria-label="Fit to view" title="Fit to view">⤢</button>
        </div>
        <div class="st-view-group" role="group" aria-label="Preview mode">
          <button class="st-view-btn active" data-view="2d" aria-pressed="true">2D</button>
          <button class="st-view-btn" data-view="3d" aria-pressed="false">3D</button>
          <label class="st-check" id="st-autorot-wrap" hidden>
            <input type="checkbox" id="st-autorot"> Auto-rotate
          </label>
          <button class="st-icon-btn" id="st-resetview" aria-label="Reset view" title="Reset view">⟳</button>
        </div>
      </div>

      <div class="studio-preview">
        <div class="studio-canvas-viewport" id="st-viewport">
          <div class="studio-canvas-wrap"><canvas id="st-canvas" aria-label="Sticker sheet preview" role="img"></canvas></div>
          <div class="st-3d-hint" hidden id="st-3d-hint">Drag to tilt · scroll to rotate · double-click to reset</div>
        </div>
        <div class="studio-side">
          <div class="studio-pages" id="st-pages"></div>
          <div class="studio-hint" id="st-hint"><strong>No stickers yet.</strong><span>Add PNG, JPEG, WebP or SVG images to build your sheet, then drag thumbnails to reorder or use ✎ to edit each sticker.</span></div>
          <div class="st-progress" id="st-progress" hidden>
            <span class="st-progress-fill" id="st-progress-fill"></span>
            <span class="st-progress-label" id="st-progress-label">Loading…</span>
          </div>
          <div class="studio-strip" id="st-strip"></div>
          <div class="st-editor" id="st-editor" hidden></div>
          <button class="btn secondary btn-sm" id="st-add" type="button">＋ Add images</button>
        </div>
      </div>

      <div class="studio-bar">
        <div class="studio-meta" id="st-meta" aria-live="polite"></div>
        <div class="studio-actions">
          <button class="btn" id="st-png" type="button">Download PNG (300 DPI)</button>
          <button class="btn" id="st-pdf" type="button">Download PDF (all pages)</button>
          <button class="btn secondary" id="st-svg" type="button">SVG die-line</button>
          <button class="btn secondary" id="st-png-all" type="button" hidden>PNG all pages</button>
          <button class="btn secondary" id="st-svg-all" type="button" hidden>SVG all pages</button>
          <button class="btn secondary" id="st-print" type="button">Print</button>
          <button class="btn secondary" id="st-clear" type="button">Clear</button>
        </div>
      </div>

      <div class="studio-bar studio-project-bar">
        <div class="studio-actions">
          <button class="btn secondary btn-sm" id="st-undo" type="button" title="Undo (Ctrl+Z)">↩ Undo</button>
          <button class="btn secondary btn-sm" id="st-redo" type="button" title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
        </div>
        <div class="studio-actions">
          <button class="btn secondary btn-sm" id="st-save" type="button" title="Save project in this browser">Save project</button>
          <button class="btn secondary btn-sm" id="st-load" type="button" title="Load saved project">Load</button>
          <button class="btn secondary btn-sm" id="st-exportjson" type="button" title="Download project as JSON">Export JSON</button>
          <button class="btn secondary btn-sm" id="st-importjson" type="button" title="Import project JSON">Import JSON</button>
        </div>
      </div>

      <input type="file" id="st-replace" accept="image/*" hidden>
      <input type="file" id="st-import" accept=".json,application/json" hidden>`;

    syncControls();
    bindControls();
    bindViewport();
    window.removeEventListener("keydown", onKeydown);
    window.addEventListener("keydown", onKeydown);
    document.addEventListener("afterprint", () => {
      const pr = document.getElementById("st-print-root");
      if (pr) pr.remove();
      document.body.classList.remove("st-printing");
    });

    hist.stack = [snap()];
    hist.index = 0;
    updateUndoButtons();
    setView("2d");
    render();

    return { addFiles, reset() { state.items = []; state.page = 0; state.selected = null; commit(); render(); } };
  }

  window.StickerStudio = { mount };
})();
