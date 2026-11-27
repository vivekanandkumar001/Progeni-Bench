/*
 * Label Studio — Avery 5160 / Label Maker engine (docs/LABELS_PLAN.md, Phase L1+L2)
 * Client-side only: template geometry -> layout() -> canvas preview, PNG, HTML, Print.
 * Pure core (TEMPLATES, parseTable, resolveLine, applyTransform) is exported for node --test.
 */
(function () {
  "use strict";

  const PX_PER_MM = 300 / 25.4; // 300 DPI export scale

  const SHEETS = {
    letter: { label: "US Letter (8.5 x 11 in)", w: 215.9, h: 279.4 },
    a4: { label: "A4 (210 x 297 mm)", w: 210, h: 297 }
  };

  /* Template geometry in mm. m* = sheet margin, g* = gap between labels.
     Status: avery5160 + l7160 verified; others provisional (calibration offsets absorb drift). */
  const TEMPLATES = [
    { id: "avery5160", short: "Avery 5160", name: 'Avery 5160 / 8160 - 30 up, 1"x2-5/8" (Letter)', region: "letter", cols: 3, rows: 10, lw: 66.675, lh: 25.4, mX: 4.7625, gX: 3.175, mY: 12.7, gY: 0 },
    { id: "avery5163", short: "Avery 5163", name: 'Avery 5163 / 8163 - 10 up, 4"x2" (Letter)', region: "letter", cols: 2, rows: 5, lw: 101.6, lh: 50.8, mX: 3.9688, gX: 4.7625, mY: 12.7, gY: 0 },
    { id: "avery5167", short: "Avery 5167", name: 'Avery 5167 return - 80 up, 1-3/4"x1/2" (Letter)', region: "letter", cols: 4, rows: 20, lw: 44.45, lh: 12.7, mX: 4.7625, gX: 9.525, mY: 12.7, gY: 0 },
    { id: "l7160", short: "Avery L7160", name: "Avery L7160 - 21 up, 63.5 x 38.1 mm (A4)", region: "a4", cols: 3, rows: 7, lw: 63.5, lh: 38.1, mX: 7.4, gX: 2.35, mY: 15.15, gY: 0 },
    { id: "badge5390", short: "Badge 5390", name: 'Name badge 5390 - 8 up, 3-1/2"x2-1/4" (Letter)', region: "letter", cols: 2, rows: 4, lw: 88.9, lh: 57.15, mX: 15.875, gX: 6.35, mY: 15.875, gY: 6.35 },
    { id: "custom", short: "Custom", name: "Custom size...", region: "letter", cols: 3, rows: 10, lw: 60, lh: 25, mX: 5, gX: 3, mY: 10, gY: 3 }
  ];

  const FONTS = ["Arial", "Helvetica", "'Times New Roman'", "'Courier New'", "Georgia", "Verdana"];

  const PRESETS = {
    us: { label: "US address (3 lines)", lines: [
      { tpl: "{{First}} {{Last}}", size: 10, bold: true, italic: false, align: "left", transform: "none" },
      { tpl: "{{Street}}", size: 9, bold: false, italic: false, align: "left", transform: "none" },
      { tpl: "{{City}}, {{State}} {{Zip}}", size: 9, bold: false, italic: false, align: "left", transform: "none" }
    ]},
    eu: { label: "EU address (3 lines)", lines: [
      { tpl: "{{First}} {{Last}}", size: 10, bold: true, italic: false, align: "left", transform: "none" },
      { tpl: "{{Street}}", size: 9, bold: false, italic: false, align: "left", transform: "none" },
      { tpl: "{{Zip}} {{City}}", size: 9, bold: false, italic: false, align: "left", transform: "none" }
    ]},
    ret: { label: "Return address (small, 3 lines)", lines: [
      { tpl: "{{First}} {{Last}}", size: 7.5, bold: false, italic: false, align: "left", transform: "none" },
      { tpl: "{{Street}}", size: 7.5, bold: false, italic: false, align: "left", transform: "none" },
      { tpl: "{{City}}, {{State}} {{Zip}}", size: 7.5, bold: false, italic: false, align: "left", transform: "none" }
    ]},
    badge: { label: "Name badge (centered)", lines: [
      { tpl: "{{First}} {{Last}}", size: 14, bold: true, italic: false, align: "center", transform: "none" },
      { tpl: "{{Title}}", size: 10, bold: false, italic: false, align: "center", transform: "none" },
      { tpl: "{{Company}}", size: 9, bold: false, italic: false, align: "center", transform: "none" }
    ]},
    single: { label: "Single line", lines: [
      { tpl: "{{Name}}", size: 10, bold: false, italic: false, align: "left", transform: "none" }
    ]},
    blank: { label: "Blank", lines: [
      { tpl: "", size: 10, bold: false, italic: false, align: "left", transform: "none" }
    ]}
  };

  const LS_KEY = "progeni-label-preset-v1";

  const clone = v => JSON.parse(JSON.stringify(v));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const r2 = n => Math.round(n * 1000) / 1000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const state = {
    template: "avery5160",
    custom: { region: "letter", lw: 60, lh: 25, cols: 3, rows: 10, mX: 5, gX: 3, mY: 10, gY: 3 },
    offX: 0, offY: 0,
    headers: [], rows: [], fileName: "",
    lines: clone(PRESETS.us.lines),
    font: { family: "Arial", valign: "middle", color: "#000000", overflow: "shrink" },
    repeat: "1",
    guides: true, exportGuides: false,
    page: 0, zoom: 100
  };

  const hist = { stack: [], index: -1 };
  let root = null;
  let activeLine = 0;
  let renderQueued = false;
  let flashTimer = 0;
  let _meas = null;

  const $ = sel => (root ? root.querySelector(sel) : null);
  const $$ = sel => (root ? Array.from(root.querySelectorAll(sel)) : []);

  function measCtx() {
    if (!_meas) _meas = document.createElement("canvas").getContext("2d");
    return _meas;
  }

  /* ---------------------------------------------------------------- pure core */

  function detectDelim(text) {
    const first = String(text || "").split(/\r?\n/)[0] || "";
    if (first.includes("\t")) return "\t";
    const count = d => first.split(d).length - 1;
    if (count(";") > count(",")) return ";";
    if (count("|") > count(",") && count("|") > 0) return "|";
    return ",";
  }

  function fallbackCsv(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const str = String(text || "");
    for (let i = 0; i < str.length; i++) {
      const c = str[i], n = str[i + 1];
      if (c === '"' && q && n === '"') { cell += '"'; i++; continue; }
      if (c === '"') { q = !q; continue; }
      if (!q && c === ",") { row.push(cell); cell = ""; continue; }
      if (!q && (c === "\n" || c === "\r")) {
        if (c === "\r" && n === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(x => x.trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      cell += c;
    }
    row.push(cell);
    if (row.some(x => x.trim() !== "")) rows.push(row);
    return rows;
  }

  function csvRows(text) {
    if (typeof ProgeniUtils !== "undefined" && ProgeniUtils && typeof ProgeniUtils.csvParse === "function") {
      return ProgeniUtils.csvParse(text);
    }
    return fallbackCsv(text);
  }

  function parseTable(text) {
    const t = String(text || "").replace(/^\uFEFF/, "");
    if (!t.trim()) return [];
    const d = detectDelim(t);
    if (d === ",") return csvRows(t);
    return t.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(d).map(c => c.trim()));
  }

  function headerIndex(headers, key) {
    const norm = s => String(s).trim().toLowerCase().replace(/[\s_-]+/g, "");
    const k = norm(key);
    for (let i = 0; i < headers.length; i++) if (norm(headers[i]) === k) return i;
    return -1;
  }

  function padNum(n, width) {
    let s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  function resolveLine(tpl, row, headers, idx, total, unresolved) {
    const out = String(tpl == null ? "" : tpl).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, keyRaw) => {
      const key = String(keyRaw).trim();
      const nk = key.replace(/\s+/g, ""); // "{{ seq :3 }}" is legal
      const seqM = nk.match(/^seq(?::(\d+))?$/i);
      if (seqM) return padNum(idx + 1, clamp(parseInt(seqM[1], 10) || 1, 1, 10));
      if (/^seqtotal$/i.test(nk)) return String(total);
      if (key.startsWith("qr:")) {
        // {{qr:data}} - QR code token; render as placeholder if no library
        if (unresolved) unresolved.add(key);
        return "[QR]";
      }
      if (key.startsWith("code128:")) {
        // {{code128:data}} - Code128 barcode token; render as placeholder
        if (unresolved) unresolved.add(key);
        return "[Barcode]";
      }
      if (!row) return ""; // manual mode: tokens collapse, literal text stays
      const i = headerIndex(headers, key);
      if (i < 0) { if (unresolved && !unresolved.has(key)) unresolved.add(key); return ""; }
      return row[i] == null ? "" : String(row[i]);
    });
    return out.replace(/[ \t]{2,}/g, " "); // empty tokens must not leave double spaces
  }

  function applyTransform(text, tr) {
    if (tr === "upper") return text.toUpperCase();
    if (tr === "title") return text.toLowerCase().replace(/(^|[\s\-',.(/])([a-z])/g, (m, p, c) => p + c.toUpperCase());
    return text;
  }

  function normalizeLine(l) {
    l = l || {};
    return {
      tpl: String(l.tpl == null ? "" : l.tpl).slice(0, 500),
      size: clamp(num(l.size, 9), 6, 48),
      bold: !!l.bold, italic: !!l.italic,
      align: l.align === "center" || l.align === "right" ? l.align : "left",
      transform: l.transform === "upper" || l.transform === "title" ? l.transform : "none"
    };
  }

  /* ---------------------------------------------------------------- geometry */

  function tplDef() {
    if (state.template === "custom") {
      const c = state.custom;
      return {
        id: "custom", short: "Custom",
        name: "Custom " + r2(c.lw) + " x " + r2(c.lh) + " mm",
        region: c.region === "a4" ? "a4" : "letter",
        cols: Math.round(clamp(num(c.cols, 3), 1, 8)),
        rows: Math.round(clamp(num(c.rows, 10), 1, 40)),
        lw: clamp(num(c.lw, 60), 5, 300),
        lh: clamp(num(c.lh, 25), 5, 300),
        mX: num(c.mX, 5), gX: num(c.gX, 3), mY: num(c.mY, 10), gY: num(c.gY, 3)
      };
    }
    return TEMPLATES.find(t => t.id === state.template) || TEMPLATES[0];
  }

  function dataLabels(T) {
    const rows = state.rows;
    if (!rows.length) return [null]; // manual mode: single label from builder text
    const rep = state.repeat;
    if (rep === "first") return Array.from({ length: T.cols * T.rows }, () => rows[0]);
    const k = clamp(parseInt(rep, 10) || 1, 1, 4);
    if (k === 1) return rows.slice();
    return rows.flatMap(r => Array.from({ length: k }, () => r));
  }

  function padOf(T) {
    return Math.min(2, T.lw * 0.05, T.lh * 0.15);
  }

  function layout() {
    const T = tplDef();
    const S = SHEETS[T.region] || SHEETS.letter;
    const capacity = T.cols * T.rows;
    const raw = dataLabels(T);
    const total = raw.length;
    const pages = Math.max(1, Math.ceil(total / capacity));
    const unresolved = new Set();
    const pad = padOf(T);
    const innerW = Math.max(2, T.lw - 2 * pad);
    const availPt = innerW * 72 / 25.4;
    const fam = state.font.family;
    const m = measCtx();
    const measure = (text, pt, bold) => {
      m.font = (bold ? "700 " : "400 ") + (pt * 4) + "px " + fam;
      return m.measureText(text).width / (pt * 4) * pt; // width in pt
    };

    // resolve every label's text (tokens + transform)
    const texts = raw.map((row, idx) => state.lines.map(ln =>
      applyTransform(resolveLine(ln.tpl, row, state.headers, idx, total, unresolved), ln.transform)));

    // global deterministic auto-shrink per line (longest text decides)
    const sizes = state.lines.map((ln, li) => {
      const base = ln.size;
      if (state.font.overflow !== "shrink") return base;
      let worst = 0;
      for (const lab of texts) {
        const t = lab[li];
        if (!t) continue;
        const w = measure(t, base, ln.bold);
        if (w > worst) worst = w;
      }
      if (worst <= availPt) return base;
      return Math.max(6, Math.floor((availPt / worst) * base * 2) / 2);
    });

    // clip warnings per line
    const clipped = state.lines.map((ln, li) => {
      let n = 0;
      const sz = sizes[li];
      for (const lab of texts) {
        const t = lab[li];
        if (!t) continue;
        if (measure(t, sz, ln.bold) > availPt + 0.5) n++;
      }
      return n;
    });

    // vertical placement + resolved line objects (positions shared by canvas/HTML)
    const labels = texts.map(lab => {
      const hs = lab.map((t, i) => Math.max(1.2, sizes[i] * 25.4 / 72 * 1.18));
      const contentH = hs.reduce((a, b) => a + b, 0);
      let y0;
      if (state.font.valign === "top") y0 = pad;
      else if (state.font.valign === "bottom") y0 = T.lh - pad - contentH;
      else y0 = (T.lh - contentH) / 2;
      y0 = Math.max(pad, Math.min(y0, Math.max(pad, T.lh - pad - contentH)));
      let y = y0;
      return lab.map((t, i) => {
        const ln = state.lines[i];
        const ax = ln.align === "center" ? pad + innerW / 2 : ln.align === "right" ? pad + innerW : pad;
        const o = { text: t, size: sizes[i], bold: ln.bold, italic: ln.italic, align: ln.align, ax: ax, y: y, w: innerW, h: hs[i] };
        y += hs[i];
        return o;
      });
    });

    const rects = Array.from({ length: capacity }, (_, i) => ({
      x: T.mX + state.offX + (i % T.cols) * (T.lw + T.gX),
      y: T.mY + state.offY + Math.floor(i / T.cols) * (T.lh + T.gY),
      w: T.lw, h: T.lh
    }));
    const overflow = rects.some(r => r.x < -0.05 || r.y < -0.05 || r.x + r.w > S.w + 0.05 || r.y + r.h > S.h + 0.05);

    return { T: T, S: S, capacity: capacity, pages: pages, total: total, labels: labels, rects: rects, clipped: clipped, unresolved: Array.from(unresolved), overflow: overflow, pad: pad, innerW: innerW };
  }

  /* ---------------------------------------------------------------- canvas */

  function drawPage(ctx, L, pageIndex, pxPerMm, opts) {
    opts = opts || {};
    ctx.save();
    ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, L.S.w, L.S.h);
    if (opts.guides) {
      ctx.save();
      ctx.strokeStyle = "rgba(100,116,139,.6)";
      ctx.lineWidth = 0.25;
      ctx.setLineDash([1.6, 1.2]);
      L.rects.forEach(r => ctx.strokeRect(r.x, r.y, r.w, r.h));
      ctx.restore();
    }
    const start = pageIndex * L.capacity;
    for (let i = 0; i < L.capacity; i++) {
      const item = L.labels[start + i];
      if (!item || !item.length) continue;
      const r = L.rects[i];
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      item.forEach(l => {
        if (!l.text) return;
        ctx.font = (l.italic ? "italic " : "") + (l.bold ? "700 " : "400 ") + (l.size * 25.4 / 72) + "px " + state.font.family;
        ctx.textAlign = l.align || "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = state.font.color;
        ctx.fillText(l.text, r.x + l.ax, r.y + l.y);
      });
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- HTML / print */

  function renderBody(L, opts) {
    opts = opts || {};
    const guides = !!opts.guides;
    const sheets = [];
    for (let p = 0; p < L.pages; p++) {
      if (opts.only != null && p !== opts.only) continue;
      const start = p * L.capacity;
      const cells = [];
      for (let i = 0; i < L.capacity; i++) {
        const r = L.rects[i];
        const item = L.labels[start + i];
        if (!item && !guides) continue;
        const inner = [];
        if (guides) inner.push('<i class="gd"></i>');
        if (item) item.forEach(l => {
          if (!l.text) return;
          inner.push('<div class="ln" style="left:' + r2(L.pad) + 'mm;top:' + r2(l.y) + 'mm;width:' + r2(l.w) +
            'mm;font-size:' + l.size + 'pt;font-weight:' + (l.bold ? 700 : 400) +
            ';font-style:' + (l.italic ? "italic" : "normal") + ';text-align:' + l.align +
            ';color:' + esc(state.font.color) + '">' + esc(l.text) + "</div>");
        });
        cells.push('<div class="lbl' + (guides ? " g" : "") + '" style="left:' + r2(r.x) + 'mm;top:' + r2(r.y) +
          'mm;width:' + r2(r.w) + 'mm;height:' + r2(r.h) + 'mm">' + inner.join("") + "</div>");
      }
      sheets.push('<div class="sheet" style="width:' + r2(L.S.w) + 'mm;height:' + r2(L.S.h) + 'mm">' + cells.join("") + "</div>");
    }
    return sheets.join("\n");
  }

  function sheetCss(scope, family) {
    const s = scope ? scope + " " : "";
    // Guard against CSS injection: font-family may originate from an imported
    // preset. Keep only safe family-list characters and forbid braces/semicolons.
    const safeFamily = String(family == null ? "" : family).replace(/[^A-Za-z0-9 \-_,'"\.]/g, "").slice(0, 200) || "sans-serif";
    return s + "*{margin:0;padding:0;box-sizing:border-box}\n" +
      s + ".sheet{position:relative;background:#fff;overflow:hidden;page-break-after:always;break-after:page}\n" +
      s + ".sheet:last-child{page-break-after:auto;break-after:auto}\n" +
      s + ".lbl{position:absolute;overflow:hidden}\n" +
      s + ".lbl.g{outline:0.25mm dashed #94a3b8;outline-offset:-0.25mm}\n" +
      s + ".ln{position:absolute;white-space:pre;line-height:1.05;overflow:hidden;font-family:" + safeFamily + "}";
  }

  function renderHtml(L, opts) {
    const S = L.S;
    const page = "@page{size:" + (S.w / 25.4).toFixed(3) + "in " + (S.h / 25.4).toFixed(3) + "in;margin:0}\n" +
      "html,body{background:#fff;font-family:" + state.font.family + ";-webkit-print-color-adjust:exact;print-color-adjust:exact}\n";
    return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>Label sheet - " + esc(L.T.short) + "</title><style>" + page + sheetCss("", state.font.family) + "</style></head><body>\n" +
      renderBody(L, opts) + "\n</body></html>";
  }

  function afterPrintCleanup() {
    const pr = document.getElementById("st-print-root");
    if (pr) pr.remove();
    document.body.classList.remove("st-printing");
    const ps = document.getElementById("st-page-style");
    if (ps) ps.remove();
    window.removeEventListener("afterprint", afterPrintCleanup);
  }

  function printLabels() {
    const L = layout();
    const allBtn = $("#lb-printall");
    const only = allBtn && !allBtn.checked && L.pages > 1 ? clamp(state.page, 0, L.pages - 1) : null;
    const old = document.getElementById("st-print-root");
    if (old) old.remove();
    const pr = document.createElement("div");
    pr.id = "st-print-root";
    pr.innerHTML = renderBody(L, { guides: state.exportGuides, only: only });
    document.body.appendChild(pr);
    let ps = document.getElementById("st-page-style");
    if (!ps) {
      ps = document.createElement("style");
      ps.id = "st-page-style";
      document.head.appendChild(ps);
    }
    const S = L.S;
    ps.textContent = "@page{size:" + (S.w / 25.4).toFixed(3) + "in " + (S.h / 25.4).toFixed(3) + "in;margin:0}\n" +
      sheetCss("#st-print-root", state.font.family);
    document.body.classList.add("st-printing");
    window.removeEventListener("afterprint", afterPrintCleanup);
    window.addEventListener("afterprint", afterPrintCleanup);
    window.print();
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function exportPNG(pageIndex) {
    const L = layout();
    const c = document.createElement("canvas");
    c.width = Math.round(L.S.w * PX_PER_MM);
    c.height = Math.round(L.S.h * PX_PER_MM);
    drawPage(c.getContext("2d"), L, pageIndex, PX_PER_MM, { guides: state.exportGuides });
    const blob = await new Promise(res => c.toBlob(res, "image/png"));
    if (!blob) { flash("PNG export failed"); return; }
    const suffix = L.pages > 1 ? "-p" + (pageIndex + 1) : "";
    download(blob, "labels-" + L.T.id + suffix + ".png");
  }

  async function exportAllPNG() {
    const L = layout();
    if (L.pages > 1) flash("Downloading " + L.pages + " PNG files...");
    for (let i = 0; i < L.pages; i++) {
      await exportPNG(i);
      if (i < L.pages - 1) await sleep(400);
    }
    if (L.pages > 1) flash("Downloaded " + L.pages + " PNG files");
  }

  function exportHTML() {
    const L = layout();
    const html = renderHtml(L, { guides: state.exportGuides });
    download(new Blob([html], { type: "text/html" }), "labels-" + L.T.id + ".html");
    flash("HTML downloaded");
  }

  /* ---------------------------------------------------------------- history */

  function snap() {
    const obj = {
      t: state.template, c: state.custom, ox: state.offX, oy: state.offY,
      h: state.headers, f: state.font, r: state.repeat, g: state.guides, eg: state.exportGuides,
      l: state.lines
    };
    if (state.rows.length <= 1000) obj.d = { fn: state.fileName, r: state.rows };
    return JSON.stringify(obj);
  }

  function applySnap(s) {
    try {
      const d = JSON.parse(s);
      state.template = d.t; state.custom = d.c; state.offX = d.ox; state.offY = d.oy;
      state.headers = d.h; state.font = d.f; state.repeat = d.r;
      state.guides = d.g; state.exportGuides = d.eg; state.lines = d.l;
      if (d.d) { state.rows = d.d.r; state.fileName = d.d.fn; }
      state.page = 0;
      syncControls(); renderBuilder(); renderData(); render(); updateUndoButtons();
    } catch (e) { /* ignore bad snapshot */ }
  }

  function commit() {
    const s = snap();
    if (hist.stack[hist.index] === s) return;
    hist.stack = hist.stack.slice(0, hist.index + 1);
    hist.stack.push(s);
    if (hist.stack.length > 40) hist.stack.shift();
    hist.index = hist.stack.length - 1;
    updateUndoButtons();
  }

  function undo() {
    if (hist.index <= 0) return;
    hist.index--;
    applySnap(hist.stack[hist.index]);
    flash("Undo");
  }

  function redo() {
    if (hist.index >= hist.stack.length - 1) return;
    hist.index++;
    applySnap(hist.stack[hist.index]);
    flash("Redo");
  }

  function updateUndoButtons() {
    const u = $("#lb-undo"), r = $("#lb-redo");
    if (u) u.disabled = hist.index <= 0;
    if (r) r.disabled = hist.index >= hist.stack.length - 1;
  }

  /* ---------------------------------------------------------------- presets / project files */

  function presetObj() {
    return {
      v: 1, saved: new Date().toISOString(),
      template: state.template, custom: clone(state.custom),
      offX: state.offX, offY: state.offY,
      lines: clone(state.lines), font: clone(state.font),
      repeat: state.repeat, guides: state.guides, exportGuides: state.exportGuides
    };
  }

  function projectObj() {
    return Object.assign(presetObj(), {
      headers: state.headers.slice(), rows: state.rows.slice(), fileName: state.fileName
    });
  }

  function applyObj(obj, withData) {
    if (!obj || typeof obj !== "object") throw new Error("Not a label project file");
    if (obj.template && (TEMPLATES.some(t => t.id === obj.template) || obj.template === "custom")) state.template = obj.template;
    if (obj.custom && typeof obj.custom === "object") state.custom = Object.assign({}, state.custom, obj.custom);
    if (Number.isFinite(parseFloat(obj.offX))) state.offX = clamp(num(obj.offX, 0), -5, 5);
    if (Number.isFinite(parseFloat(obj.offY))) state.offY = clamp(num(obj.offY, 0), -5, 5);
    if (Array.isArray(obj.lines) && obj.lines.length) state.lines = obj.lines.slice(0, 6).map(normalizeLine);
    if (obj.font && typeof obj.font === "object") state.font = Object.assign({}, state.font, obj.font);
    if (obj.repeat) state.repeat = String(obj.repeat);
    if (obj.guides !== undefined) state.guides = !!obj.guides;
    if (obj.exportGuides !== undefined) state.exportGuides = !!obj.exportGuides;
    if (withData) {
      if (Array.isArray(obj.rows)) state.rows = obj.rows.map(r => Array.isArray(r) ? r.map(String) : []);
      if (Array.isArray(obj.headers)) state.headers = obj.headers.map(String);
      state.fileName = obj.fileName || "imported";
    }
    state.page = 0;
    syncControls(); renderBuilder(); renderData();
    commit(); render();
  }

  function savePreset() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(presetObj()));
      flash("Preset saved (layout only - data is never stored)");
    } catch (e) { flash("Could not save preset"); }
  }

  function loadPreset() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) { flash("No saved preset yet"); return; }
      applyObj(JSON.parse(raw), false);
      flash("Preset loaded (layout only - reload your data)");
    } catch (e) { flash("Saved preset is unreadable"); }
  }

  function exportJSON() {
    download(new Blob([JSON.stringify(projectObj(), null, 2)], { type: "application/json" }), "label-project.json");
    flash("Project JSON downloaded (includes your data)");
  }

  /* ---------------------------------------------------------------- data ops */

  function setData(table, hasHeader, source) {
    const body = hasHeader ? table.slice(1) : table;
    const head = hasHeader ? table[0] : table[0] && table[0].map((_, i) => "Column " + (i + 1));
    const headers = (head || []).map((h, i) => String(h).trim() || "Column " + (i + 1));
    const rows = body.filter(r => r.some(c => String(c).trim() !== ""));
    const skipped = body.length - rows.length;
    state.headers = headers;
    state.rows = rows.map(r => { const out = r.slice(); while (out.length < headers.length) out.push(""); return out.slice(0, headers.length); });
    state.fileName = source || "data";
    state.page = 0;
    renderBuilder(); renderData();
    commit(); render();
    flash("Loaded " + rows.length + " rows x " + headers.length + " columns" + (skipped ? " (" + skipped + " empty rows skipped)" : ""));
  }

  function addCsv(text, name) {
    const t = parseTable(text);
    if (!t.length) { flash("That file looks empty - expected a header row plus data"); return; }
    setData(t, true, name || "data.csv");
  }

  function clearData() {
    state.headers = [];
    state.rows = [];
    state.fileName = "";
    state.page = 0;
    renderBuilder(); renderData();
    commit(); render();
    flash("Data cleared - back to Manual mode (builder prints 1 label)");
  }

  function sortRows(dir) {
    if (!state.rows.length) return;
    const sel = $("#lb-sortcol");
    const ci = sel ? parseInt(sel.value, 10) : 0;
    if (!Number.isFinite(ci)) return;
    state.rows = state.rows.slice().sort((a, b) =>
      dir * String(a[ci] || "").localeCompare(String(b[ci] || ""), undefined, { numeric: true, sensitivity: "base" }));
    renderData(); commit(); render();
    flash("Sorted by " + (state.headers[ci] || "column " + (ci + 1)) + " " + (dir > 0 ? "A to Z" : "Z to A"));
  }

  function dedupeRows() {
    const seen = new Set();
    const before = state.rows.length;
    state.rows = state.rows.filter(r => {
      const k = r.join("\u0001");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const removed = before - state.rows.length;
    renderData(); commit(); render();
    flash(removed ? "Removed " + removed + " duplicate rows" : "No duplicate rows found");
  }

  function loadPaste() {
    const ta = $("#lb-paste-text");
    const table = parseTable(ta ? ta.value : "");
    if (!table.length) { flash("Paste some rows first (Excel/Sheets copy-paste or CSV)"); return; }
    const hasHeader = !$("#lb-paste-header") || $("#lb-paste-header").checked;
    setData(table, hasHeader, "pasted rows");
    if (ta) ta.value = "";
    const panel = $("#lb-paste");
    if (panel) panel.hidden = true;
  }

  /* ---------------------------------------------------------------- wizard / presets */

  function wizard() {
    const H = state.headers;
    if (!H.length) { flash("Load a CSV or paste rows first - the wizard reads column names"); return; }
    const find = keys => H.findIndex(h => {
      const n = String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
      return keys.some(k => n === k || (k.length > 3 && n.includes(k)));
    });
    const first = find(["firstname", "fname", "givenname", "first"]);
    const last = find(["lastname", "lname", "surname", "familyname", "last"]);
    const name = find(["recipient", "fullname", "contactname", "customername", "receiver", "name"]);
    const street = find(["street", "addressline1", "address1", "address", "road", "avenue", "str"]);
    const addr2 = find(["address2", "addressline2", "apt", "suite", "unit", "flat"]);
    const city = find(["city", "town"]);
    const st = find(["state", "province", "region", "county"]);
    const zip = find(["zipcode", "zip", "postalcode", "postal", "pincode"]);
    const phone = find(["phone", "mobile", "tel", "cell"]);

    let line1;
    if (first >= 0 && last >= 0) line1 = "{{" + H[first] + "}} {{" + H[last] + "}}";
    else if (name >= 0) line1 = "{{" + H[name] + "}}";
    else line1 = "{{First}} {{Last}}";

    let line2 = street >= 0 ? "{{" + H[street] + "}}" : "{{Street}}";
    if (addr2 >= 0) line2 += " {{" + H[addr2] + "}}";

    let line3 = "";
    if (city >= 0) line3 += "{{" + H[city] + "}}";
    if (st >= 0) line3 += (line3 ? ", " : "") + "{{" + H[st] + "}}";
    if (zip >= 0) line3 += (line3 ? " " : "") + "{{" + H[zip] + "}}";
    if (!line3) line3 = "{{City}}, {{State}} {{Zip}}";

    state.lines = [
      { tpl: line1, size: 10, bold: true, italic: false, align: "left", transform: "none" },
      { tpl: line2, size: 9, bold: false, italic: false, align: "left", transform: "none" },
      { tpl: line3, size: 9, bold: false, italic: false, align: "left", transform: "none" }
    ];
    if (phone >= 0 && state.lines.length < 6) {
      state.lines.push({ tpl: "Ph: {{" + H[phone] + "}}", size: 8, bold: false, italic: false, align: "left", transform: "none" });
    }
    renderBuilder(); commit(); render();
    flash("Address block applied by wizard (" + state.lines.length + " lines)");
  }

  function applyPreset() {
    const sel = $("#lb-preset");
    const key = sel ? sel.value : "us";
    const p = PRESETS[key] || PRESETS.us;
    state.lines = p.lines.map(normalizeLine);
    renderBuilder(); commit(); render();
    flash('Preset "' + p.label + '" applied');
  }

  function insertToken(tok) {
    const inp = $('.lbl-tpl[data-i="' + activeLine + '"]') || $(".lbl-tpl");
    if (!inp) { flash("Add a content line first"); return; }
    inp.focus();
    const s = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
    const e = inp.selectionEnd == null ? s : inp.selectionEnd;
    inp.value = inp.value.slice(0, s) + tok + inp.value.slice(e);
    const pos = s + tok.length;
    try { inp.setSelectionRange(pos, pos); } catch (err) { /* type=text should be fine */ }
    state.lines[parseInt(inp.dataset.i, 10) || 0].tpl = inp.value;
    commit(); schedule();
  }

  /* ---------------------------------------------------------------- builder / data render */

  function renderChips() {
    const box = $("#lb-chips");
    if (!box) return;
    if (!state.headers.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const shown = state.headers.slice(0, 30);
    box.innerHTML = '<span class="lbl-hint">Insert into focused line:</span>' +
      shown.map(h => '<button type="button" class="lbl-chip" data-tok="' + esc("{{" + h + "}}") + '">' + esc(h) + "</button>").join("") +
      (state.headers.length > 30 ? '<span class="lbl-hint">+' + (state.headers.length - 30) + " more</span>" : "") +
      '<button type="button" class="lbl-chip" data-tok="{{seq}}"># seq</button>' +
      '<button type="button" class="lbl-chip" data-tok="{{seqTotal}}">of seqTotal</button>' +
      '<button type="button" class="lbl-chip" data-tok="{{qr:}}">QR</button>' +
      '<button type="button" class="lbl-chip" data-tok="{{code128:}}">Bar</button>';
    box.querySelectorAll("[data-tok]").forEach(b => {
      b.onclick = () => insertToken(b.dataset.tok);
    });
  }

  function renderBuilder() {
    const box = $("#lb-lines");
    if (!box) return;
    box.innerHTML = state.lines.map((ln, i) =>
      '<div class="lbl-line">' +
        '<div class="lbl-line-main">' +
          '<input class="lbl-tpl" data-i="' + i + '" type="text" value="' + esc(ln.tpl) + '" placeholder="Line ' + (i + 1) + ' - type text or click a column chip" aria-label="Label line ' + (i + 1) + '">' +
          '<label class="lbl-mini" title="Font size (pt)"><input class="lbl-size" data-i="' + i + '" type="number" min="6" max="48" step="0.5" value="' + ln.size + '" aria-label="Line ' + (i + 1) + ' size in points">pt</label>' +
          '<button type="button" class="st-icon-btn lbl-b' + (ln.bold ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + ln.bold + '" title="Bold"><b>B</b></button>' +
          '<button type="button" class="st-icon-btn lbl-i' + (ln.italic ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + ln.italic + '" title="Italic"><i>I</i></button>' +
          '<select class="lbl-align" data-i="' + i + '" aria-label="Line ' + (i + 1) + ' alignment">' +
            ["left", "center", "right"].map(a => '<option value="' + a + '"' + (ln.align === a ? " selected" : "") + ">" + a + "</option>").join("") +
          "</select>" +
          '<select class="lbl-transform" data-i="' + i + '" aria-label="Line ' + (i + 1) + ' text transform">' +
            [["none", "as typed"], ["upper", "UPPER"], ["title", "Title"]].map(v => '<option value="' + v[0] + '"' + (ln.transform === v[0] ? " selected" : "") + ">" + v[1] + "</option>").join("") +
          "</select>" +
          '<button type="button" class="st-icon-btn lbl-del" data-i="' + i + '" aria-label="Remove line ' + (i + 1) + '" title="Remove line"' + (state.lines.length <= 1 ? " disabled" : "") + ">\u2715</button>" +
        "</div>" +
      "</div>").join("");

    box.querySelectorAll(".lbl-tpl").forEach(inp => {
      inp.addEventListener("focus", () => { activeLine = parseInt(inp.dataset.i, 10) || 0; });
      inp.addEventListener("input", () => { state.lines[parseInt(inp.dataset.i, 10)].tpl = inp.value; schedule(); });
      inp.addEventListener("change", () => commit());
    });
    box.querySelectorAll(".lbl-size").forEach(inp => {
      inp.addEventListener("input", () => { state.lines[parseInt(inp.dataset.i, 10)].size = clamp(num(inp.value, 9), 6, 48); schedule(); });
      inp.addEventListener("change", () => commit());
    });
    box.querySelectorAll(".lbl-b").forEach(b => b.addEventListener("click", () => {
      const i = parseInt(b.dataset.i, 10);
      state.lines[i].bold = !state.lines[i].bold;
      renderBuilder(); commit(); schedule();
    }));
    box.querySelectorAll(".lbl-i").forEach(b => b.addEventListener("click", () => {
      const i = parseInt(b.dataset.i, 10);
      state.lines[i].italic = !state.lines[i].italic;
      renderBuilder(); commit(); schedule();
    }));
    box.querySelectorAll(".lbl-align").forEach(s => s.addEventListener("change", () => {
      state.lines[parseInt(s.dataset.i, 10)].align = s.value;
      commit(); schedule();
    }));
    box.querySelectorAll(".lbl-transform").forEach(s => s.addEventListener("change", () => {
      state.lines[parseInt(s.dataset.i, 10)].transform = s.value;
      commit(); schedule();
    }));
    box.querySelectorAll(".lbl-del").forEach(b => b.addEventListener("click", () => {
      if (state.lines.length <= 1) return;
      state.lines.splice(parseInt(b.dataset.i, 10), 1);
      renderBuilder(); commit(); schedule();
    }));
    renderChips();
  }

  function renderData() {
    const stats = $("#lb-data-stats");
    const n = state.rows.length;
    if (stats) {
      stats.textContent = n
        ? (state.fileName ? state.fileName + " · " : "") + n + " rows × " + state.headers.length + " columns"
        : "No data yet — Manual mode: the builder text prints as 1 label.";
    }
    const section = $("#lb-data-section");
    const dataSummary = $("#lb-data-summary");
    if (dataSummary) dataSummary.textContent = n ? n + " rows ready" : "Optional — manual mode";
    if (section && n) section.open = true;
    const sortSel = $("#lb-sortcol");
    if (sortSel) {
      sortSel.innerHTML = state.headers.map((h, i) => '<option value="' + i + '">' + esc(h) + "</option>").join("");
      sortSel.disabled = !state.headers.length;
    }
    ["#lb-sortasc", "#lb-sortdesc", "#lb-dedupe", "#lb-clear"].forEach(sel => {
      const el = $(sel);
      if (el) el.disabled = !n;
    });
    const hint = $("#lb-hint");
    if (hint) hint.hidden = n > 0;

    const wrap = $("#lb-table");
    if (!wrap) return;
    if (!n) { wrap.innerHTML = ""; wrap.style.display = "none"; return; }
    wrap.style.display = "";
    const LIMIT = 200;
    const shown = state.rows.slice(0, LIMIT);
    wrap.innerHTML =
      '<table class="lbl-table"><thead><tr><th class="lbl-rowx" title="Delete row"></th>' +
      state.headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
      shown.map((r, ri) =>
        '<tr><td class="lbl-rowx"><button type="button" data-delrow="' + ri + '" aria-label="Delete row ' + (ri + 1) + '" title="Delete row">\u2715</button></td>' +
        state.headers.map((_, ci) => '<td contenteditable="true" data-r="' + ri + '" data-c="' + ci + '">' + esc(r[ci] || "") + "</td>").join("") +
        "</tr>").join("") +
      "</tbody></table>" +
      (n > LIMIT ? '<div class="lbl-note">Showing first ' + LIMIT + " of " + n + " rows (edits, deletes and sorting apply to the full data set)</div>" : "");
  }

  /* ---------------------------------------------------------------- preview */

  function renderPager(L) {
    const el = $("#lb-pages");
    if (!el) return;
    if (L.pages <= 1) { el.innerHTML = '<span class="st-pageinfo">1 / 1</span>'; return; }
    const p = clamp(state.page, 0, L.pages - 1);
    let html = '<button type="button" class="st-page-btn" data-p="prev" aria-label="Previous sheet">' + (p === 0 ? "‹" : "‹") + "</button>";
    const from = Math.max(0, Math.min(p - 3, L.pages - 7));
    for (let i = from; i < Math.min(from + 7, L.pages); i++) {
      html += '<button type="button" class="st-page-btn' + (i === p ? " active" : "") + '" data-p="' + i + '" aria-label="Sheet ' + (i + 1) + '">' + (i + 1) + "</button>";
    }
    html += '<button type="button" class="st-page-btn" data-p="next" aria-label="Next sheet">›</button>';
    el.innerHTML = html;
    el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
      const v = b.dataset.p;
      if (v === "prev") state.page = clamp(state.page - 1, 0, L.pages - 1);
      else if (v === "next") state.page = clamp(state.page + 1, 0, L.pages - 1);
      else state.page = parseInt(v, 10) || 0;
      render();
    });
  }

  function renderMeta(L) {
    const el = $("#lb-meta");
    if (!el) return;
    if (flashTimer && Date.now() < flashUntil) return; // keep flash message
    const first = Math.min(L.total, L.capacity);
    const rest = L.total - first;
    const sheets = L.pages === 1
      ? "1 sheet (" + L.total + "/" + L.capacity + ")"
      : (rest > 0 ? L.pages + " sheets (" + first + " + " + rest + ")" : L.pages + " sheets (" + L.capacity + " × " + L.pages + ")");
    const manual = !state.rows.length;
    el.textContent = (manual ? "Manual · 1 label · " : L.total + " labels · ") +
      sheets + " · " + L.T.short + " · " + L.S.label + " · 300 DPI";
  }

  let flashUntil = 0;

  function flash(msg) {
    const el = $("#lb-meta");
    flashUntil = Date.now() + 2600;
    if (el) el.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashTimer = 0; render(); }, 2700);
  }

  function renderWarnings(L) {
    const el = $("#lb-warn");
    if (!el) return;
    const chips = [];
    L.clipped.forEach((n, i) => { if (n > 0) chips.push("Line " + (i + 1) + " clipped on " + n + " label" + (n === 1 ? "" : "s")); });
    if (L.unresolved.length) {
      chips.push(L.unresolved.length + " token" + (L.unresolved.length === 1 ? "" : "s") + " match no column: " + L.unresolved.slice(0, 3).map(esc).join(", "));
    }
    if (L.overflow) chips.push("Template + offsets exceed the sheet — reduce margins or offsets");
    el.innerHTML = chips.map(c => '<span class="lbl-warnchip">' + c + "</span>").join("");
  }

  function schedule() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function render() {
    if (!root) return;
    const L = layout();
    if (state.page > L.pages - 1) state.page = Math.max(0, L.pages - 1);
    const canvas = $("#lb-canvas");
    if (canvas) {
      const pxPerMm = clamp(1100 / L.S.w, 1, 6);
      canvas.width = Math.round(L.S.w * pxPerMm);
      canvas.height = Math.round(L.S.h * pxPerMm);
      drawPage(canvas.getContext("2d"), L, state.page, pxPerMm, { guides: state.guides });
      canvas.style.width = state.zoom + "%";
    }
    renderPager(L);
    renderMeta(L);
    renderWarnings(L);
    const png = $("#lb-png"), all = $("#lb-png-all");
    if (png) png.textContent = L.pages > 1 ? "PNG (page " + (state.page + 1) + ")" : "PNG (300 DPI)";
    if (all) all.hidden = L.pages <= 1;
    const vp = $("#lb-viewport");
    if (vp) vp.classList.toggle("can-scroll", state.zoom > 100);
    const zr = $("#lb-zoom");
    if (zr) zr.textContent = state.zoom + "%";
  }

  /* ---------------------------------------------------------------- controls */

  function syncControls() {
    const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
    const chk = (sel, v) => { const el = $(sel); if (el) el.checked = v; };
    set("#lb-tpl", state.template);
    set("#lb-font", state.font.family);
    set("#lb-valign", state.font.valign);
    set("#lb-color", state.font.color);
    set("#lb-overflow", state.font.overflow);
    set("#lb-repeat", state.repeat);
    set("#lb-offx", state.offX);
    set("#lb-offy", state.offY);
    chk("#lb-guides", state.guides);
    chk("#lb-eguides", state.exportGuides);
    const rx = $("#lb-offx-r"), ry = $("#lb-offy-r");
    if (rx) rx.textContent = state.offX + " mm";
    if (ry) ry.textContent = state.offY + " mm";
    const cust = $("#lb-custom");
    if (cust) cust.hidden = state.template !== "custom";
    const c = state.custom;
    set("#lb-c-region", c.region);
    ["lw", "lh", "cols", "rows", "mX", "gX", "mY", "gY"].forEach(k => set("#lb-c-" + k, c[k]));
  }

  function bindControls() {
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

    on("#lb-tpl", "change", e => {
      state.template = e.target.value;
      const cust = $("#lb-custom");
      if (cust) cust.hidden = state.template !== "custom";
      state.page = 0;
      commit(); render();
    });
    ["lw", "lh", "cols", "rows", "mX", "gX", "mY", "gY"].forEach(k => {
      on("#lb-c-" + k, "input", e => {
        state.custom[k] = k === "cols" || k === "rows" ? parseInt(e.target.value, 10) || 1 : num(e.target.value, state.custom[k]);
        schedule();
      });
      on("#lb-c-" + k, "change", () => commit());
    });
    on("#lb-c-region", "change", e => { state.custom.region = e.target.value; commit(); render(); });

    [["#lb-offx", "offX", "#lb-offx-r"], ["#lb-offy", "offY", "#lb-offy-r"]].forEach(([sel, key, read]) => {
      on(sel, "input", e => {
        state[key] = num(e.target.value, 0);
        const r = $(read);
        if (r) r.textContent = state[key] + " mm";
        schedule();
      });
      on(sel, "change", () => commit());
    });

    on("#lb-font", "change", e => { state.font.family = e.target.value; commit(); schedule(); });
    on("#lb-valign", "change", e => { state.font.valign = e.target.value; commit(); schedule(); });
    on("#lb-color", "input", e => { state.font.color = e.target.value; schedule(); });
    on("#lb-color", "change", () => commit());
    on("#lb-overflow", "change", e => { state.font.overflow = e.target.value; commit(); schedule(); });
    on("#lb-repeat", "change", e => { state.repeat = e.target.value; state.page = 0; commit(); render(); });
    on("#lb-guides", "change", e => { state.guides = e.target.checked; commit(); schedule(); });
    on("#lb-eguides", "change", e => { state.exportGuides = e.target.checked; commit(); });

    on("#lb-addline", "click", () => {
      if (state.lines.length >= 6) { flash("Maximum 6 lines per label"); return; }
      state.lines.push({ tpl: "", size: 9, bold: false, italic: false, align: "left", transform: "none" });
      renderBuilder(); commit(); schedule();
      const inputs = $$(".lbl-tpl");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    on("#lb-preset-apply", "click", applyPreset);
    on("#lb-wizard", "click", wizard);

    on("#lb-paste-toggle", "click", () => {
      const p = $("#lb-paste");
      if (p) { p.hidden = !p.hidden; if (!p.hidden) { const ta = $("#lb-paste-text"); if (ta) ta.focus(); } }
    });
    on("#lb-paste-load", "click", loadPaste);
    on("#lb-sortcol", "change", () => {});
    on("#lb-sortasc", "click", () => sortRows(1));
    on("#lb-sortdesc", "click", () => sortRows(-1));
    on("#lb-dedupe", "click", dedupeRows);
    on("#lb-clear", "click", clearData);

    const table = $("#lb-table");
    if (table) {
      table.addEventListener("click", e => {
        const b = e.target.closest("[data-delrow]");
        if (!b) return;
        state.rows.splice(parseInt(b.dataset.delrow, 10), 1);
        if (!state.rows.length && state.fileName) state.fileName = "";
        renderData(); commit(); render();
        flash("Row deleted");
      });
      table.addEventListener("focusout", e => {
        const td = e.target.closest("td[contenteditable]");
        if (!td) return;
        const r = parseInt(td.dataset.r, 10), c = parseInt(td.dataset.c, 10);
        const v = td.textContent;
        if (state.rows[r] && state.rows[r][c] !== v) {
          state.rows[r][c] = v;
          commit(); schedule();
        }
      });
    }

    on("#lb-png", "click", () => exportPNG(state.page));
    on("#lb-png-all", "click", () => exportAllPNG());
    on("#lb-print", "click", printLabels);
    on("#lb-html", "click", exportHTML);

    on("#lb-undo", "click", undo);
    on("#lb-redo", "click", redo);
    on("#lb-save", "click", savePreset);
    on("#lb-load", "click", loadPreset);
    on("#lb-exportjson", "click", exportJSON);
    on("#lb-importjson", "click", () => { const f = $("#lb-import"); if (f) f.click(); });
    on("#lb-import", "change", async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const txt = await f.text();
        applyObj(JSON.parse(txt), true);
        flash("Project imported (" + state.rows.length + " rows)");
      } catch (err) { flash("Could not import: not a valid label project JSON"); }
      e.target.value = "";
    });

    // zoom
    on("#lb-zoom-out", "click", () => { state.zoom = clamp(state.zoom - 25, 50, 400); render(); });
    on("#lb-zoom-in", "click", () => { state.zoom = clamp(state.zoom + 25, 50, 400); render(); });
    on("#lb-zoom-fit", "click", () => { state.zoom = 100; render(); });
  }

  function bindViewport() {
    const vp = $("#lb-viewport");
    if (!vp) return;
    let dragging = false, sx = 0, sy = 0, sl = 0, stp = 0;
    vp.addEventListener("pointerdown", e => {
      if (state.zoom <= 100) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      sl = vp.scrollLeft; stp = vp.scrollTop;
      vp.setPointerCapture(e.pointerId);
      vp.classList.add("dragging");
    });
    vp.addEventListener("pointermove", e => {
      if (!dragging) return;
      vp.scrollLeft = sl - (e.clientX - sx);
      vp.scrollTop = stp - (e.clientY - sy);
    });
    ["pointerup", "pointercancel"].forEach(ev => vp.addEventListener(ev, () => {
      dragging = false;
      vp.classList.remove("dragging");
    }));
    vp.addEventListener("wheel", e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      state.zoom = clamp(state.zoom + (e.deltaY < 0 ? 25 : -25), 50, 400);
      render();
    }, { passive: false });
    vp.addEventListener("dblclick", () => { state.zoom = 100; render(); });
  }

  function onKeydown(e) {
    if (!root || !document.contains(root)) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); }
    else if (mod && ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); }
  }

  /* ---------------------------------------------------------------- mount */

  function mount(el) {
    root = el;
    if (!root) return { addCsv: () => {} };

    const tplOptions = TEMPLATES.map(t => '<option value="' + t.id + '">' + esc(t.name) + "</option>").join("");
    const presetOptions = Object.keys(PRESETS).map(k => '<option value="' + k + '">' + esc(PRESETS[k].label) + "</option>").join("");

    root.className = "lbl-studio";
    root.innerHTML = `
      <div class="studio-controls lbl-controls">
        <div class="lbl-controls-grid">
          <label class="st-field"><span>Template</span><select id="lb-tpl" aria-label="Label template">${tplOptions}</select></label>
          <label class="st-field"><span>Font</span><select id="lb-font" aria-label="Font family">${FONTS.map(f => "<option>" + f + "</option>").join("")}</select></label>
          <label class="st-field"><span>Vertical align</span><select id="lb-valign" aria-label="Vertical alignment">
            <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
          </select></label>
          <label class="st-field"><span>Text color</span><input type="color" id="lb-color" value="#000000" aria-label="Text color"></label>
        </div>
        <details class="lbl-advanced" id="lb-advanced">
          <summary><span>Printer &amp; sheet setup</span><small>Overflow, repeat, calibration offsets, guides</small></summary>
          <div class="lbl-advanced-grid">
            <label class="st-field"><span>Overflow</span><select id="lb-overflow" aria-label="Overflow policy">
              <option value="shrink">Auto-shrink</option><option value="clip">Clip</option>
            </select></label>
            <label class="st-field"><span>Repeat</span><select id="lb-repeat" aria-label="Repeat mode">
              <option value="1">Each row once</option><option value="2">Each row ×2</option><option value="3">Each row ×3</option>
              <option value="4">Each row ×4</option><option value="first">First row × sheet</option>
            </select></label>
            <label class="st-field"><span>Offset X <b class="st-readout" id="lb-offx-r">0 mm</b></span>
              <input type="range" id="lb-offx" min="-3" max="3" step="0.5" value="0" aria-label="Horizontal calibration offset"></label>
            <label class="st-field"><span>Offset Y <b class="st-readout" id="lb-offy-r">0 mm</b></span>
              <input type="range" id="lb-offy" min="-3" max="3" step="0.5" value="0" aria-label="Vertical calibration offset"></label>
            <label class="st-check"><input type="checkbox" id="lb-guides" checked> Show guides (preview)</label>
            <label class="st-check"><input type="checkbox" id="lb-eguides"> Include guides in export</label>
          </div>
        </details>
      </div>

      <div class="lbl-custom" id="lb-custom" hidden>
        <label class="lbl-cf">Region<select id="lb-c-region"><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
        <label class="lbl-cf">W mm<input type="number" id="lb-c-lw" min="5" step="0.1"></label>
        <label class="lbl-cf">H mm<input type="number" id="lb-c-lh" min="5" step="0.1"></label>
        <label class="lbl-cf">Cols<input type="number" id="lb-c-cols" min="1" max="8"></label>
        <label class="lbl-cf">Rows<input type="number" id="lb-c-rows" min="1" max="40"></label>
        <label class="lbl-cf">Margin X<input type="number" id="lb-c-mX" step="0.1"></label>
        <label class="lbl-cf">Gap X<input type="number" id="lb-c-gX" step="0.1"></label>
        <label class="lbl-cf">Margin Y<input type="number" id="lb-c-mY" step="0.1"></label>
        <label class="lbl-cf">Gap Y<input type="number" id="lb-c-gY" step="0.1"></label>
      </div>

      <div class="lbl-builder">
        <div class="lbl-lines-head">
          <strong>Label content</strong>
          <span class="lbl-hint">click a column chip to insert it into the focused line · tokens like {{First}}</span>
          <div class="lbl-head-actions">
            <select id="lb-preset" aria-label="Content preset">${presetOptions}</select>
            <button type="button" class="btn secondary btn-sm" id="lb-preset-apply">Apply preset</button>
            <button type="button" class="btn secondary btn-sm" id="lb-wizard" title="Detect name/address columns and build a 3-line address block">Address wizard</button>
            <button type="button" class="btn secondary btn-sm" id="lb-addline">＋ Line</button>
          </div>
        </div>
        <div class="lbl-chips" id="lb-chips" hidden></div>
        <div id="lb-lines"></div>
      </div>

      <details class="lbl-section" id="lb-data-section">
        <summary><span class="lbl-section-title">Label data <small>CSV / pasted rows</small></span><span class="lbl-section-state" id="lb-data-summary">Optional — manual mode</span></summary>
        <div class="lbl-data">
          <div class="lbl-data-head">
            <span id="lb-data-stats"></span>
            <div class="lbl-head-actions">
              <button type="button" class="btn secondary btn-sm" id="lb-paste-toggle">Paste rows</button>
              <select id="lb-sortcol" aria-label="Sort column" disabled></select>
              <button type="button" class="st-icon-btn" id="lb-sortasc" aria-label="Sort ascending" title="Sort A to Z" disabled>↑</button>
              <button type="button" class="st-icon-btn" id="lb-sortdesc" aria-label="Sort descending" title="Sort Z to A" disabled>↓</button>
              <button type="button" class="btn secondary btn-sm" id="lb-dedupe" disabled>Dedupe</button>
              <button type="button" class="btn secondary btn-sm" id="lb-clear" disabled>Clear data</button>
            </div>
          </div>
          <div class="lbl-paste" id="lb-paste" hidden>
            <textarea id="lb-paste-text" rows="6" placeholder="Paste rows from Excel / Google Sheets (tab separated) or CSV text…" aria-label="Paste rows"></textarea>
            <div class="lbl-paste-opts">
              <label class="st-check"><input type="checkbox" id="lb-paste-header" checked> First row is the header</label>
              <button type="button" class="btn secondary btn-sm" id="lb-paste-load">Load rows</button>
            </div>
          </div>
          <div class="lbl-tablewrap" id="lb-table"></div>
        </div>
      </details>

      <div class="studio-toolbar">
        <div class="st-zoom-group">
          <button type="button" class="st-icon-btn" id="lb-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <b class="st-readout" id="lb-zoom">100%</b>
          <button type="button" class="st-icon-btn" id="lb-zoom-in" aria-label="Zoom in" title="Zoom in">＋</button>
          <button type="button" class="st-view-btn" id="lb-zoom-fit" aria-label="Fit to view" title="Fit to view">Fit</button>
        </div>
        <div class="lbl-warn" id="lb-warn" aria-live="polite"></div>
      </div>

      <div class="studio-preview">
        <div class="studio-canvas-viewport" id="lb-viewport">
          <div class="studio-canvas-wrap"><canvas id="lb-canvas" aria-label="Label sheet preview"></canvas></div>
        </div>
        <div class="studio-side">
          <div class="studio-pages" id="lb-pages"></div>
          <div class="studio-hint" id="lb-hint">
            <strong>Manual mode</strong> — the text above prints as one label.
            Load a CSV with the file picker, or <em>Paste rows</em>, for mail merge:
            every row becomes a label and column chips appear above.
          </div>
        </div>
      </div>

      <div class="studio-bar">
        <div class="studio-meta" id="lb-meta" aria-live="polite"></div>
        <div class="studio-actions">
          <button type="button" class="btn" id="lb-png">PNG (300 DPI)</button>
          <button type="button" class="btn secondary" id="lb-png-all" hidden>PNG all pages</button>
          <label class="st-check" title="Uncheck to print only the sheet shown in the preview"><input type="checkbox" id="lb-printall" checked> Print all sheets</label>
          <button type="button" class="btn" id="lb-print">Print</button>
          <button type="button" class="btn secondary" id="lb-html">HTML</button>
        </div>
      </div>

      <div class="studio-bar">
        <div class="studio-actions">
          <button type="button" class="btn secondary" id="lb-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
          <button type="button" class="btn secondary" id="lb-redo" title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
        </div>
        <div class="studio-actions">
          <button type="button" class="btn secondary" id="lb-save">Save preset</button>
          <button type="button" class="btn secondary" id="lb-load">Load preset</button>
          <button type="button" class="btn secondary" id="lb-exportjson">Export JSON</button>
          <button type="button" class="btn secondary" id="lb-importjson">Import JSON</button>
          <input type="file" id="lb-import" accept=".json,application/json" hidden>
        </div>
      </div>`;

    syncControls();
    renderBuilder();
    renderData();
    bindControls();
    bindViewport();
    window.removeEventListener("keydown", onKeydown);
    window.addEventListener("keydown", onKeydown);
    hist.stack = [];
    hist.index = -1;
    commit();
    render();

    return { addCsv, reset: clearData };
  }

  const api = { mount: mount, TEMPLATES: TEMPLATES, SHEETS: SHEETS, parseTable: parseTable, detectDelim: detectDelim, resolveLine: resolveLine, applyTransform: applyTransform, headerIndex: headerIndex, normalizeLine: normalizeLine };
  if (typeof window !== "undefined" && typeof document !== "undefined") window.LabelStudio = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
