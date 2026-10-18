/*
 * Album Studio — shared photo album / date-organizer engine for two tools:
 *
 *   mode "timeline"  — Photo Timeline Builder (docs/TOOLS_ROADMAP.md 2.5)
 *        Reads EXIF DateTimeOriginal (falling back to File.lastModified),
 *        downscales every photo to configurable thumbnails (default 400 px
 *        longest side) embedded as JPEG data URLs, groups them by day with
 *        sticky headings + per-group counts (auto-switching to month/year
 *        groups on large sets), opens the full-resolution original in a
 *        click-through lightbox, offers a per-file date-correction UI with
 *        EXIF / File / Manual confidence badges, reports the album's total
 *        output size before export, and writes a single self-contained
 *        photo-timeline.html (embedded thumbnails, lazy-loaded images,
 *        original filenames preserved as captions).
 *
 *   mode "organizer" — Family Photo Date Organizer (docs/TOOLS_ROADMAP.md 2.6)
 *        A distinct product: a collapsible year -> month -> day summary tree
 *        with per-group counts and a thumbnail contact strip per group, a
 *        rename-pattern builder (default YYYY/MM/YYYY-MM-DD_title.ext) with a
 *        live old -> new preview table, bulk per-group date overrides, EXIF
 *        dating with a confidence flag, and two exports: a self-contained
 *        family-organizer.html archive index (year/month headings + embedded
 *        thumbnails) and a planned-folder-structure CSV + JSON mapping
 *        (original -> proposed path) since browsers cannot move files.
 *
 * Shared pure core (readExifDate, pickDate, groupByDay, groupByYearMonth,
 * groupByYear, buildTree, renamePattern, thumbPlan, ...) is exported under
 * AlbumStudio.core for node --test (test/album.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.AlbumStudio.
 * Follows the conventions of photo-batch-studio.js / image-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  /* ============================================================== pure core */

  const num = function (v, d) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  };
  const clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  const pad2 = function (n) { return String(Math.max(0, Math.floor(num(n, 0)))).padStart(2, "0"); };
  const pad4 = function (n) { return String(Math.max(0, Math.floor(num(n, 0)))).padStart(4, "0"); };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const DEFAULT_PATTERN = "YYYY/MM/YYYY-MM-DD_title.ext";
  const DEFAULT_THUMB_MAX = 400;
  const LARGE_SET = 60;   // > this many files -> group by month in the timeline
  const HUGE_SET = 400;   // > this many files -> group by year in the timeline
  const THUMB_CHOICES = [200, 300, 400, 600, 800];

  /* --------------------------------------------------- minimal JPEG EXIF reader */

  function isJpeg(u8) {
    return u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xD8;
  }

  function asU8(buf) {
    if (!buf) return null;
    if (buf instanceof Uint8Array) return buf;
    if (typeof ArrayBuffer !== "undefined" && buf instanceof ArrayBuffer) return new Uint8Array(buf);
    if (buf.buffer && typeof buf.buffer.byteLength === "number") {
      return new Uint8Array(buf.buffer, buf.byteOffset || 0, buf.byteLength || buf.buffer.byteLength);
    }
    return null;
  }

  /* "YYYY:MM:DD HH:MM:SS" -> local Date (EXIF carries no timezone), else null. */
  function _exifStringToDate(s) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s == null ? "" : s).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], se = +m[6];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
    const dt = new Date(y, mo - 1, d, h, mi, se);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function _readExifString(u8, dv, le, tiff, entry, type, count, limit) {
    if (type !== 2) return null; // ASCII only
    if (count <= 0 || count > 256) return null;
    let start;
    if (count <= 4) {
      start = entry + 8; // value stored inline in the 4-byte value field
    } else {
      start = tiff + dv.getUint32(entry + 8, le);
    }
    if (start < 0 || start >= limit) return null;
    let s = "";
    for (let i = 0; i < count && start + i < limit; i++) {
      const c = u8[start + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /* Parse the TIFF block that follows "Exif\0\0". Returns a Date or null. */
  function _readTiff(u8, tiff, end) {
    if (tiff + 8 > u8.length) return null;
    const b0 = u8[tiff], b1 = u8[tiff + 1];
    let le;
    if (b0 === 0x49 && b1 === 0x49) le = true;        // "II" little-endian
    else if (b0 === 0x4D && b1 === 0x4D) le = false;  // "MM" big-endian
    else return null;

    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const u16 = function (p) { return dv.getUint16(p, le); };
    const u32 = function (p) { return dv.getUint32(p, le); };
    const limit = Math.min(end, u8.length);

    if (u16(tiff + 2) !== 0x002A) return null; // TIFF magic (42)

    const ifd0 = tiff + u32(tiff + 4);
    let dateTime = null;
    let dateTimeOriginal = null;
    let subIfd = null;

    if (ifd0 + 2 <= limit) {
      const n = u16(ifd0);
      for (let i = 0; i < n; i++) {
        const e = ifd0 + 2 + i * 12;
        if (e + 12 > limit) break;
        const tag = u16(e);
        if (tag === 0x0132) { // DateTime
          dateTime = _readExifString(u8, dv, le, tiff, e, u16(e + 2), u32(e + 4), limit);
        } else if (tag === 0x8769) { // ExifIFDPointer -> SubIFD
          subIfd = tiff + u32(e + 8);
        }
      }
    }

    let original = null;
    if (subIfd && subIfd + 2 <= limit) {
      const n = u16(subIfd);
      for (let i = 0; i < n; i++) {
        const e = subIfd + 2 + i * 12;
        if (e + 12 > limit) break;
        if (u16(e) === 0x9003) { // DateTimeOriginal
          dateTimeOriginal = _readExifString(u8, dv, le, tiff, e, u16(e + 2), u32(e + 4), limit);
          break;
        }
      }
    }

    const chosen = dateTimeOriginal || dateTime;
    return chosen ? _exifStringToDate(chosen) : null;
  }

  /* Read EXIF DateTimeOriginal (preferred) or IFD0 DateTime from a JPEG
     ArrayBuffer / Uint8Array. Returns a Date or null (non-JPEG, no EXIF, or a
     malformed segment). Handles both little- and big-endian TIFF headers. */
  function readExifDate(buf) {
    const u8 = asU8(buf);
    if (!u8 || !isJpeg(u8)) return null;

    let off = 2;
    while (off + 4 <= u8.length) {
      if (u8[off] !== 0xFF) { off++; continue; }
      const marker = u8[off + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
        off += 2;
        continue;
      }
      if (marker === 0xDA || marker === 0xD9) break; // start of scan / end of image
      const len = (u8[off + 2] << 8) | u8[off + 3];
      if (len < 2) break;
      if (marker === 0xE1) {
        const seg = off + 4;
        if (seg + 6 <= u8.length
          && u8[seg] === 0x45 && u8[seg + 1] === 0x78 && u8[seg + 2] === 0x69
          && u8[seg + 3] === 0x66 && u8[seg + 4] === 0 && u8[seg + 5] === 0) {
          const found = _readTiff(u8, seg + 6, seg + len - 2);
          if (found) return found;
        }
      }
      off += 2 + len;
    }
    return null;
  }

  /* EXIF DateTimeOriginal wins; otherwise File.lastModified; otherwise null
     with a "manual" confidence flag so the UI can prompt for a correction. */
  function pickDate(file, exifDate) {
    if (exifDate instanceof Date && !isNaN(exifDate.getTime())) {
      return { date: exifDate, dateConfidence: "exif" };
    }
    const ms = num(file && file.lastModified, 0);
    if (ms > 0) {
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return { date: d, dateConfidence: "file" };
    }
    return { date: null, dateConfidence: "manual" };
  }

  /* --------------------------------------------------------------- dates */

  /* Resolve an item's effective date: manual override > date > dateMs > lastModified. */
  function itemDate(it) {
    if (!it) return null;
    const cands = [it.manualDate, it.date, it.dateMs, it.lastModified];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c == null) continue;
      if (typeof c === "number" && !(c > 0)) continue; // 0 / NaN = "no date"
      const d = c instanceof Date ? c : new Date(num(c, NaN));
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    }
    return null;
  }

  function dayKey(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return pad4(d.getFullYear()) + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function monthKey(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return pad4(d.getFullYear()) + "-" + pad2(d.getMonth() + 1);
  }

  function yearKey(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return pad4(d.getFullYear());
  }

  /* Group items by calendar day. Returns ascending groups:
     { key:"YYYY-MM-DD", year, month, day, count, items }. */
  function groupByDay(items) {
    const list = items || [];
    const map = new Map();
    for (let i = 0; i < list.length; i++) {
      const d = itemDate(list[i]);
      if (!d) continue;
      const key = dayKey(d);
      if (!map.has(key)) {
        map.set(key, { key: key, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), items: [] });
      }
      map.get(key).items.push(list[i]);
    }
    return Array.from(map.values())
      .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
      .map(function (g) { g.count = g.items.length; return g; });
  }

  /* Group items by calendar month. Returns ascending groups:
     { key:"YYYY-MM", year, month, label, count, items, days:[dayGroups] }. */
  function groupByYearMonth(items) {
    const days = groupByDay(items);
    const map = new Map();
    days.forEach(function (day) {
      const key = pad4(day.year) + "-" + pad2(day.month);
      if (!map.has(key)) {
        map.set(key, {
          key: key, year: day.year, month: day.month,
          label: MONTHS[day.month - 1] + " " + day.year,
          items: [], days: []
        });
      }
      const g = map.get(key);
      g.days.push(day);
      g.items = g.items.concat(day.items);
    });
    return Array.from(map.values())
      .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
      .map(function (g) { g.count = g.items.length; return g; });
  }

  /* Group items by calendar year (year -> month -> day tree). */
  function groupByYear(items) {
    const months = groupByYearMonth(items);
    const map = new Map();
    months.forEach(function (mo) {
      if (!map.has(mo.year)) {
        map.set(mo.year, { key: pad4(mo.year), year: mo.year, label: String(mo.year), items: [], months: [] });
      }
      const y = map.get(mo.year);
      y.months.push(mo);
      y.items = y.items.concat(mo.items);
    });
    return Array.from(map.values())
      .sort(function (a, b) { return a.year - b.year; })
      .map(function (g) { g.count = g.items.length; return g; });
  }

  const buildTree = groupByYear;

  /* --------------------------------------------------------- rename pattern */

  function sanitizeTitle(s) {
    return String(s == null ? "" : s)
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extOf(name) {
    const base = String(name == null ? "" : name);
    const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
    const bare = slash >= 0 ? base.slice(slash + 1) : base;
    const i = bare.lastIndexOf(".");
    if (i <= 0 || i === bare.length - 1) return "";
    return bare.slice(i + 1).toLowerCase();
  }

  function baseOf(name) {
    const base = String(name == null ? "" : name);
    const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
    const bare = slash >= 0 ? base.slice(slash + 1) : base;
    const i = bare.lastIndexOf(".");
    return i > 0 ? bare.slice(0, i) : bare;
  }

  /* Build a relative path from a date + title + extension.
     Tokens: YYYY YY MM DD title ext (folder separators are literal "/").
     Default pattern: YYYY/MM/YYYY-MM-DD_title.ext */
  function renamePattern(opts) {
    const o = opts || {};
    const pattern = (typeof o.pattern === "string" && o.pattern.trim()) ? o.pattern : DEFAULT_PATTERN;
    const y = pad4(num(o.y, 0));
    const mo = num(o.m, 0);
    const da = num(o.d, 0);
    const tokens = {
      YYYY: y,
      YY: y.slice(2),
      MM: pad2(mo),
      DD: pad2(da),
      title: sanitizeTitle(o.title),
      ext: String(o.ext == null ? "" : o.ext).replace(/^\.+/, "")
    };
    let out = pattern.replace(/YYYY|YY|MM|DD|title|ext/g, function (tok) {
      return tokens[tok] != null ? tokens[tok] : tok;
    });
    out = out.replace(/\s+/g, " ")
      .replace(/_+/g, "_")
      .replace(/[ _]+\./g, ".")
      .replace(/\/{2,}/g, "/")
      .replace(/\.\.+/g, ".")
      .replace(/^\/+/, "");
    return out;
  }

  /* Downscale plan: fits w x h into a max-longest-side box (never upscales). */
  function thumbPlan(width, height, max) {
    const w = Math.max(1, Math.round(num(width, 1)));
    const h = Math.max(1, Math.round(num(height, 1)));
    const cap = Math.max(1, Math.round(num(max, DEFAULT_THUMB_MAX)));
    const scale = Math.min(1, cap / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale: scale };
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && String(file.type).indexOf("image/") === 0) return true;
    const ext = extOf(file.name);
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "ico", "tif", "tiff", "heic", "heif"].indexOf(ext) >= 0;
  }

  function dataUrlBytes(u) {
    if (!u) return 0;
    const i = String(u).indexOf(",");
    const b64 = i >= 0 ? String(u).slice(i + 1) : String(u);
    return Math.floor((b64.length * 3) / 4);
  }

  function parseInputDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v == null ? "" : v));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function inputDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return pad4(d.getFullYear()) + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /* ==================================================================== UI */

  const state = {
    mode: "timeline",
    root: null,
    items: [],
    errors: [],
    title: "",
    pattern: DEFAULT_PATTERN,
    thumbMax: DEFAULT_THUMB_MAX,
    processing: false
  };

  let root = null;
  let seq = 0;
  let lightbox = null;
  let keyBound = false;

  function $(sel) { return root ? root.querySelector(sel) : null; }
  function $$(sel) { return root ? Array.from(root.querySelectorAll(sel)) : []; }

  function fmtBytes(n) {
    n = num(n, 0);
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  function raf() {
    return new Promise(function (res) {
      let done = false;
      const finish = function () { if (done) return; done = true; res(); };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(finish);
        // Background tabs do not pump rAF; guarantee forward progress anyway.
        setTimeout(finish, 50);
      } else {
        setTimeout(finish, 0);
      }
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
    const bar = $("#alb-progress");
    if (!bar) return;
    bar.hidden = !on;
    const fill = $("#alb-progress-fill");
    if (fill) fill.style.width = clamp(num(pct, 0), 0, 100) + "%";
    const label = $("#alb-progress-label");
    if (label && msg != null) label.textContent = msg;
  }

  /* ---------------------------------------------------------- image helpers */

  function decodeImage(file) {
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Unsupported or unreadable image")); };
      img.src = url;
    });
  }

  function makeThumb(img, max) {
    const w = img.naturalWidth || img.width || 1;
    const h = img.naturalHeight || img.height || 1;
    const plan = thumbPlan(w, h, max);
    const c = document.createElement("canvas");
    c.width = plan.width;
    c.height = plan.height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    try { return c.toDataURL("image/jpeg", 0.72); } catch (e) { return ""; }
  }

  /* ------------------------------------------------------------- lightbox */

  function openLightbox(it) {
    if (!it || !it.isImage || !it.file) return;
    const url = URL.createObjectURL(it.file);
    closeLightbox();
    lightbox = document.createElement("div");
    lightbox.className = "alb-lightbox";
    lightbox.innerHTML =
      '<button type="button" class="alb-lightbox-close" aria-label="Close">&times;</button>'
      + '<figure><img src="' + url + '" alt="">'
      + '<figcaption>' + esc(it.name) + '</figcaption></figure>';
    lightbox.addEventListener("click", function (ev) {
      if (ev.target === lightbox || (ev.target.classList && ev.target.classList.contains("alb-lightbox-close"))) closeLightbox();
    });
    document.body.appendChild(lightbox);
    if (!keyBound && typeof document !== "undefined") {
      keyBound = true;
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeLightbox(); });
    }
  }

  function closeLightbox() {
    if (!lightbox) return;
    const img = lightbox.querySelector("img");
    if (img) { try { URL.revokeObjectURL(img.src); } catch (e) { /* ignore */ } }
    lightbox.remove();
    lightbox = null;
  }

  /* ------------------------------------------------------------- processing */

  async function processItem(it) {
    let exif = null;
    if (it.isImage) {
      try {
        const buf = await it.file.arrayBuffer();
        exif = readExifDate(buf);
      } catch (e) { exif = null; }
    }
    it.exifDate = exif;
    if (!it.manualDate) {
      const picked = pickDate(it.file, exif);
      it.date = picked.date;
      it.dateConfidence = picked.dateConfidence;
    }
    if (it.isImage) {
      const img = await decodeImage(it.file);
      it.width = img.naturalWidth || img.width || 0;
      it.height = img.naturalHeight || img.height || 0;
      it.thumb = makeThumb(img, state.thumbMax);
    } else {
      it.thumb = "";
    }
  }

  async function process() {
    if (state.processing) return;
    state.processing = true;
    syncControls();
    state.errors = [];
    const pending = state.items.filter(function (it) { return !it.processed; });
    const total = pending.length;
    let done = 0;
    for (let i = 0; i < pending.length; i++) {
      const it = pending[i];
      try {
        await processItem(it);
      } catch (e) {
        it.error = e && e.message ? e.message : String(e);
        state.errors.push({ name: it.name, message: it.error });
      }
      it.processed = true;
      done++;
      setProgress(true, Math.round((done / Math.max(1, total)) * 100),
        "Reading " + done + "/" + total + "\u2026");
      if (done % 3 === 0) await raf();
    }
    await raf();
    setProgress(false, 100, "");
    state.processing = false;
    render();
    renderMeta();
    syncControls();
  }

  async function addFiles(files) {
    const list = (files || []).filter(Boolean);
    if (!list.length) return;
    if (state.processing) return;
    list.forEach(function (f) {
      state.items.push({
        id: "f" + (++seq),
        file: f,
        name: f.name || ("file-" + seq),
        size: num(f.size, 0),
        lastModified: num(f.lastModified, 0),
        ext: extOf(f.name),
        isImage: isImageFile(f),
        thumb: "",
        date: null,
        dateConfidence: null,
        manualDate: null,
        processed: false
      });
    });
    await process();
  }

  async function rebuildThumbs() {
    if (state.processing) return;
    state.items.forEach(function (it) { it.processed = false; });
    await process();
  }

  function clearAll() {
    state.items = [];
    state.errors = [];
    setProgress(false, 0, "");
    render();
    renderMeta();
    syncControls();
  }

  /* --------------------------------------------------------------- dates UI */

  function applyFileDate(id, value) {
    const it = state.items.filter(function (x) { return x.id === id; })[0];
    const d = parseInputDate(value);
    if (!it || !d) return;
    it.date = d;
    it.manualDate = d.getTime();
    it.dateConfidence = "manual";
    render();
    renderMeta();
  }

  function applyGroupDate(scope, key, value) {
    const d = parseInputDate(value);
    if (!d) return;
    state.items.forEach(function (it) {
      const cur = itemDate(it);
      if (!cur) return;
      let match = false;
      if (scope === "year") match = yearKey(cur) === key;
      else if (scope === "month") match = monthKey(cur) === key;
      else match = dayKey(cur) === key;
      if (match) {
        const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
        it.date = nd;
        it.manualDate = nd.getTime();
        it.dateConfidence = "manual";
      }
    });
    render();
    renderMeta();
  }

  function sortedItems() {
    const items = state.items.slice();
    items.sort(function (a, b) {
      const da = itemDate(a), db = itemDate(b);
      const ta = da ? da.getTime() : Infinity;
      const tb = db ? db.getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      return String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0;
    });
    return items;
  }

  function buildTimelineModel() {
    const items = sortedItems();
    const total = items.length;
    if (total > HUGE_SET) {
      return {
        mode: "year",
        groups: groupByYear(items).map(function (g) {
          return { key: g.key, label: g.label, count: g.count, items: g.items, scope: "year" };
        })
      };
    }
    if (total > LARGE_SET) {
      return {
        mode: "month",
        groups: groupByYearMonth(items).map(function (g) {
          return { key: g.key, label: g.label, count: g.count, items: g.items, scope: "month" };
        })
      };
    }
    return {
      mode: "day",
      groups: groupByDay(items).map(function (g) {
        return { key: g.key, label: g.key, count: g.count, items: g.items, scope: "day" };
      })
    };
  }

  /* --------------------------------------------------------------- markup */

  function confidenceBadge(c) {
    const map = { exif: ["EXIF", "exif"], file: ["File date", "file"], manual: ["Manual", "manual"] };
    const t = map[c] || ["No date", "manual"];
    return '<span class="alb-badge ' + t[1] + '">' + t[0] + "</span>";
  }

  function thumbCell(it, cls) {
    if (it.thumb) {
      return '<img class="' + cls + '" src="' + it.thumb + '" alt="" loading="lazy" data-id="' + esc(it.id) + '">';
    }
    const label = (it.ext || "file").toUpperCase().slice(0, 4);
    return '<span class="alb-noimg ' + cls + '">' + esc(label) + "</span>";
  }

  function fileCard(it) {
    const disabled = it.isImage ? "" : " disabled";
    return '<figure class="alb-card' + (it.thumb ? "" : " alb-nothumb") + '" data-id="' + esc(it.id) + '">'
      + '<button type="button" class="alb-thumb-btn" data-id="' + esc(it.id) + '"' + disabled + ' title="Open ' + esc(it.name) + '">'
      + thumbCell(it, "alb-thumb") + "</button>"
      + '<figcaption>'
      + '<span class="alb-name" title="' + esc(it.name) + '">' + esc(it.name) + '</span>'
      + '<span class="alb-sub">' + confidenceBadge(it.dateConfidence)
      + '<input type="date" class="alb-file-date" data-id="' + esc(it.id) + '" value="' + inputDate(it.date) + '" aria-label="Date for ' + esc(it.name) + '"></span>'
      + (it.error ? '<span class="alb-err">' + esc(it.error) + "</span>" : "")
      + "</figcaption></figure>";
  }

  function renderTimeline() {
    const el = $("#alb-results");
    if (!el) return;
    if (!state.items.length) {
      el.innerHTML = '<p class="alb-empty">Add photos to build a self-contained chronological album. '
        + "Dates come from EXIF DateTimeOriginal first, then the file date.</p>";
      return;
    }
    const model = buildTimelineModel();
    const groups = model.groups;
    const note = model.mode === "day" ? "" :
      '<p class="alb-hint">Large set \u2014 grouped by ' + model.mode + ' to stay responsive. '
      + "Thumbnails are still embedded per photo.</p>";
    const sections = groups.map(function (g) {
      const cards = g.items.map(fileCard).join("");
      return '<section class="alb-group" data-key="' + esc(g.key) + '">'
        + '<header class="alb-head"><h2>' + esc(g.label)
        + ' <span class="alb-count">' + g.count + " photo" + (g.count === 1 ? "" : "s") + "</span></h2>"
        + '<label class="alb-bulk">Set group date <input type="date" class="alb-group-date" data-scope="' + g.scope + '" data-key="' + esc(g.key) + '"></label>'
        + "</header>"
        + '<div class="alb-grid">' + cards + "</div>"
        + "</section>";
    }).join("") || '<p class="alb-empty">No photos carry a usable date yet \u2014 use the per-file date pickers below each thumbnail.</p>';
    el.innerHTML = note + sections;
  }

  function contactItem(it) {
    const thumb = it.thumb
      ? '<img src="' + it.thumb + '" alt="" loading="lazy">'
      : '<span class="alb-strip-noimg">' + esc((it.ext || "file").toUpperCase().slice(0, 4)) + "</span>";
    return '<button type="button" class="alb-strip-item" data-id="' + esc(it.id) + '" title="' + esc(it.name) + '"' + (it.isImage ? "" : " disabled") + ">"
      + thumb + "</button>";
  }

  function renderOrganizer() {
    const el = $("#alb-results");
    if (!el) return;
    if (!state.items.length) {
      el.innerHTML = '<p class="alb-empty">Add photos (and any other files) to build a year \u2192 month \u2192 day tree, '
        + "fix wrong dates in bulk, and preview the proposed folder structure.</p>";
      return;
    }
    const years = groupByYear(sortedItems());
    const tree = years.map(function (y) {
      const months = y.months.map(function (mo) {
        const days = mo.days.map(function (day) {
          return '<details class="alb-day" open>'
            + '<summary><span class="alb-day-key">' + esc(day.key) + '</span>'
            + '<span class="alb-count">' + day.count + "</span></summary>"
            + '<div class="alb-strip">' + day.items.map(contactItem).join("") + "</div>"
            + '<label class="alb-bulk">Set day date <input type="date" class="alb-group-date" data-scope="day" data-key="' + esc(day.key) + '"></label>'
            + "</details>";
        }).join("");
        return '<details class="alb-month" open>'
          + '<summary><span>' + esc(MONTHS[mo.month - 1]) + " " + mo.year + '</span>'
          + '<span class="alb-count">' + mo.count + " file" + (mo.count === 1 ? "" : "s") + "</span></summary>"
          + '<div class="alb-month-body">'
          + '<label class="alb-bulk">Set whole-month date <input type="date" class="alb-group-date" data-scope="month" data-key="' + esc(mo.key) + '"></label>'
          + days + "</div></details>";
      }).join("");
      return '<details class="alb-year" open>'
        + '<summary><span>' + esc(y.label) + '</span>'
        + '<span class="alb-count">' + y.count + " file" + (y.count === 1 ? "" : "s") + "</span></summary>"
        + '<div class="alb-year-body">' + months + "</div></details>";
    }).join("");

    const rows = sortedItems().map(function (it) {
      return "<tr><td>" + esc(it.name) + "</td><td><code>" + esc(proposedPath(it)) + "</code></td>"
        + "<td>" + confidenceBadge(it.dateConfidence) + "</td></tr>";
    }).join("");

    el.innerHTML =
      '<div class="alb-tree">' + tree + "</div>"
      + '<section class="alb-preview"><h2>Rename preview</h2>'
      + '<p class="alb-hint">Old name \u2192 proposed path. Browsers cannot move files on disk, so export the plan below.</p>'
      + '<div class="alb-tablewrap"><table class="alb-table"><thead><tr><th>Original</th><th>Proposed</th><th>Date source</th></tr></thead>'
      + "<tbody>" + rows + "</tbody></table></div></section>";
  }

  function render() {
    if (!root) return;
    if (state.mode === "timeline") renderTimeline();
    else renderOrganizer();
    renderStats();
  }

  function renderStats() {
    const el = $("#alb-stats");
    if (!el) return;
    const items = state.items;
    if (!items.length) { el.innerHTML = ""; return; }
    const imgs = items.filter(function (x) { return x.isImage; }).length;
    const thumbs = items.filter(function (x) { return !!x.thumb; }).length;
    const exif = items.filter(function (x) { return x.dateConfidence === "exif"; }).length;
    const manual = items.filter(function (x) { return x.dateConfidence === "manual"; }).length;
    el.innerHTML =
      '<div class="stat"><b>' + items.length + "</b>File" + (items.length === 1 ? "" : "s") + "</div>"
      + '<div class="stat"><b>' + imgs + "</b>Images</div>"
      + '<div class="stat"><b>' + thumbs + "</b>With preview</div>"
      + '<div class="stat"><b>' + exif + "</b>EXIF dated</div>"
      + '<div class="stat"><b>' + manual + "</b>Needs a date</div>"
      + '<div class="stat"><b>' + fmtBytes(albumBytes()) + "</b>Album size</div>";
  }

  function renderMeta() {
    const el = $("#alb-meta");
    if (!el) return;
    const n = state.items.length;
    if (!n) { el.textContent = "No files loaded yet."; return; }
    const d = state.items.filter(function (x) { return !!itemDate(x); }).length;
    const label = state.mode === "timeline"
      ? (state.title ? '"' + state.title + '" \u00b7 ' : "")
      : "";
    el.textContent = label + state.items.length + (state.items.length === 1 ? " file" : " files")
      + " \u00b7 " + state.items.filter(function (x) { return x.isImage; }).length + " image(s)"
      + " \u00b7 " + d + " dated";
  }

  function albumBytes() {
    return state.items.reduce(function (n, it) { return n + dataUrlBytes(it.thumb); }, 0);
  }

  function renderSize() {
    const el = $("#alb-size");
    if (!el) return;
    const n = state.items.length;
    if (!n) { el.textContent = ""; return; }
    el.textContent = "Embedded album size: " + fmtBytes(albumBytes()) + " (" + n + " file" + (n === 1 ? "" : "s") + ")";
  }

  function renderErrors() {
    const el = $("#alb-errors");
    if (!el) return;
    if (!state.errors.length) { el.innerHTML = ""; return; }
    const rows = state.errors.map(function (e) {
      return "<li><b>" + esc(e.name) + "</b> \u2014 " + esc(e.message) + "</li>";
    }).join("");
    el.innerHTML = '<details class="alb-errors"><summary>' + state.errors.length
      + " file(s) skipped (unsupported or unreadable)</summary><ul>" + rows + "</ul></details>";
  }

  /* ------------------------------------------------------------- exports */

  function proposedPath(it) {
    const d = itemDate(it);
    return renamePattern({
      y: d ? d.getFullYear() : 0,
      m: d ? d.getMonth() + 1 : 0,
      d: d ? d.getDate() : 0,
      title: baseOf(it.name),
      ext: extOf(it.name),
      pattern: state.pattern
    });
  }

  function htmlDoc(title, body, extraCss) {
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + "<title>" + esc(title) + "</title><style>"
      + "body{font:15px system-ui,Segoe UI,sans-serif;max-width:1000px;margin:32px auto;padding:0 18px;color:#0f172a}"
      + "h1{margin:0 0 4px}h2{font-size:18px;margin:26px 0 10px;border-top:1px solid #e2e8f0;padding-top:12px}"
      + "h3{font-size:15px;margin:18px 0 8px;color:#334155}"
      + ".count{font-size:12px;font-weight:600;color:#64748b}"
      + ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}"
      + "figure{margin:0;border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fff}"
      + "figure img,.noimg{width:100%;height:140px;object-fit:cover;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;cursor:zoom-in}"
      + "figcaption{font-size:12px;color:#475569;margin-top:6px;word-break:break-word}"
      + "#alb-lb{position:fixed;inset:0;background:rgba(15,23,42,.9);display:none;align-items:center;justify-content:center;padding:24px;z-index:99}"
      + "#alb-lb.on{display:flex}#alb-lb img{max-width:96vw;max-height:92vh;border-radius:8px;background:#fff}"
      + (extraCss || "") + "</style></head><body>" + body
      + "<script>function albZoom(el){var b=document.getElementById('alb-lb');if(!b){b=document.createElement('div');b.id='alb-lb';b.onclick=function(){b.classList.remove('on')};var i=document.createElement('img');i.id='alb-lb-img';b.appendChild(i);document.body.appendChild(b);}document.getElementById('alb-lb-img').src=el.src;b.classList.add('on');}</script>"
      + "</body></html>";
  }

  function albumHtml() {
    const model = buildTimelineModel();
    const title = state.title || "Photo Timeline";
    const sections = buildTimelineModel().groups.map(function (g) {
      const figs = g.items.map(function (it) {
        const inner = it.thumb
          ? '<img loading="lazy" src="' + it.thumb + '" alt="' + esc(it.name) + '" onclick="albZoom(this)">'
          : '<div class="noimg">' + esc((it.ext || "file").toUpperCase()) + "</div>";
        return "<figure>" + inner + "<figcaption>" + esc(it.name) + "</figcaption></figure>";
      }).join("");
      return "<section><h2>" + esc(g.label) + ' <span class="count">' + g.count + " photo" + (g.count === 1 ? "" : "s") + "</span></h2>"
        + '<div class="grid">' + figs + "</div></section>";
    }).join("");
    return htmlDoc(state.title || "Photo Timeline",
      "<h1>" + esc(state.title || "Photo Timeline") + "</h1>"
      + "<p>Generated locally by Progeni Bench \u00b7 " + esc(new Date().toLocaleString())
      + " \u00b7 " + state.items.length + " file(s) \u00b7 grouped by " + buildTimelineModel().mode + "</p>"
      + (sections || "<p>No dated photos.</p>"));
  }

  function organizerHtml() {
    const years = groupByYear(sortedItems());
    const body = years.map(function (y) {
      const months = y.months.map(function (mo) {
        const figs = mo.items.map(function (it) {
          const thumb = it.thumb
            ? '<img loading="lazy" src="' + it.thumb + '" alt="" onclick="albZoom(this)">'
            : '<div class="noimg">' + esc((it.ext || "file").toUpperCase().slice(0, 4)) + "</div>";
          return "<figure>" + thumb + "<figcaption>" + esc(it.name) + "</figcaption></figure>";
        }).join("");
        return "<h3>" + esc(MONTHS[mo.month - 1]) + " " + mo.year
          + ' <span class="count">' + mo.count + "</span></h3>"
          + '<div class="grid">' + figs + "</div>";
      }).join("");
      return "<h2>" + esc(y.label) + ' <span class="count">' + y.count + "</span></h2>" + months;
    }).join("");
    return htmlDoc("Family Photo Archive",
      "<h1>" + esc(state.title || "Family Photo Archive") + "</h1>"
      + "<p>Generated locally by Progeni Bench \u00b7 " + esc(new Date().toLocaleString())
      + " \u00b7 " + state.items.length + " file(s)</p>"
      + (body || "<p>No dated files.</p>"));
  }

  function planCsv() {
    const rows = [["original", "proposed"]];
    sortedItems().forEach(function (it) { rows.push([it.name, proposedPath(it)]); });
    return toCsv(rows);
  }

  function planJson() {
    return JSON.stringify(sortedItems().map(function (it) {
      return {
        original: it.name,
        proposed: proposedPath(it),
        date: it.date ? it.date.toISOString() : null,
        confidence: it.dateConfidence || null
      };
    }), null, 2);
  }

  /* ------------------------------------------------------------- controls */

  function syncControls() {
    const thumb = $("#alb-thumb");
    if (thumb) thumb.value = String(state.thumbMax);
    const thumbV = $("#alb-thumb-v");
    if (thumbV) thumbV.textContent = state.thumbMax + "px";
    const pattern = $("#alb-pattern");
    if (pattern && pattern.value !== state.pattern) pattern.value = state.pattern;
    const title = $("#alb-title");
    if (title && title.value !== state.title) title.value = state.title;
    const busy = state.processing;
    ["#alb-export", "#alb-csv", "#alb-json", "#alb-clear", "#alb-rebuild"].forEach(function (sel) {
      const b = $(sel);
      if (b) b.disabled = busy || (sel === "#alb-export" && !state.items.length);
    });
    renderSize();
  }

  function shell() {
    const isOrg = state.mode === "organizer";
    const tip = isOrg
      ? "Build a year \u2192 month \u2192 day summary tree, override wrong dates in bulk, preview a rename pattern, "
        + "then export an HTML archive index plus a planned-folder CSV/JSON (original \u2192 proposed path). Dates prefer EXIF DateTimeOriginal, then the file date."
      : "Each photo is downscaled to an embedded data-URL thumbnail (date from EXIF DateTimeOriginal first, then the file date). "
        + "Click a thumbnail to view the full-resolution original. Export is a single self-contained photo-timeline.html.";
    const thumb = '<label class="st-field"><span>Thumbnail size <b id="alb-thumb-v">' + state.thumbMax + "px</b></span>"
      + '<select id="alb-thumb">' + THUMB_CHOICES.map(function (v) {
        return '<option value="' + v + '"' + (v === state.thumbMax ? " selected" : "") + ">" + v + "px longest side</option>";
      }).join("") + "</select></label>";
    const title = isOrg ? "" :
      '<label class="st-field"><span>Album title</span>'
      + '<input type="text" id="alb-title" value="' + esc(state.title) + '" placeholder="Summer 2024"></label>';
    const pattern = isOrg
      ? '<label class="st-field st-wide"><span>Rename pattern</span>'
        + '<input type="text" id="alb-pattern" value="' + esc(state.pattern) + '" spellcheck="false"></label>'
        + '<p class="alb-tokens">Tokens: <code>YYYY</code> <code>YY</code> <code>MM</code> <code>DD</code> <code>title</code> <code>ext</code> \u2014 folders use <code>/</code></p>'
      : "";
    const rebuild = '<button type="button" class="btn secondary" id="alb-rebuild">Rebuild thumbnails</button>';
    const actions = isOrg
      ? '<button type="button" class="btn" id="alb-export">Export family-organizer.html</button>'
        + '<button type="button" class="btn secondary" id="alb-csv">Planned structure (CSV)</button>'
        + '<button type="button" class="btn secondary" id="alb-json">Plan (JSON)</button>'
        + '<span class="alb-size" id="alb-size"></span>'
        + rebuild
        + '<button type="button" class="btn secondary" id="alb-clear">Clear</button>'
      : '<button type="button" class="btn" id="alb-export">Export photo-timeline.html</button>'
        + rebuild
        + '<span class="alb-size" id="alb-size"></span>'
        + '<button type="button" class="btn secondary" id="alb-clear">Clear</button>';

    return '<p class="alb-tip">' + tip + "</p>"
      + '<div class="studio-controls alb-controls" id="alb-controls">' + thumb + title + pattern + "</div>"
      + '<div class="st-progress" id="alb-progress" hidden>'
      + '<div class="st-progress-fill" id="alb-progress-fill"></div>'
      + '<div class="st-progress-label" id="alb-progress-label"></div></div>'
      + '<div class="stats" id="alb-stats"></div>'
      + '<div class="alb-results" id="alb-results"></div>'
      + '<div class="alb-errors" id="alb-errors"></div>'
      + '<div class="studio-bar"><div class="studio-meta" id="alb-meta" aria-live="polite">No files loaded yet.</div>'
      + '<div class="studio-actions">' + actions + "</div></div>";
  }

  function bindEvents() {
    root.addEventListener("click", function (ev) {
      const t = ev.target;
      const btn = t.closest ? t.closest(".alb-thumb-btn") : null;
      if (btn && !btn.disabled) {
        const it = state.items.filter(function (x) { return x.id === btn.dataset.id; })[0];
        openLightbox(it);
        return;
      }
      const strip = t.closest ? t.closest(".alb-strip-item") : null;
      if (strip && !strip.disabled) {
        const it = state.items.filter(function (x) { return x.id === strip.dataset.id; })[0];
        openLightbox(it);
        return;
      }
      const id = t.id || (t.closest ? (t.closest("button") ? t.closest("button").id : "") : "");
      if (id === "alb-export") {
        if (state.mode === "timeline") downloadText(albumHtml(), "photo-timeline.html", "text/html;charset=utf-8");
        else downloadText(organizerHtml(), "family-organizer.html", "text/html;charset=utf-8");
      } else if (id === "alb-csv") {
        downloadText(planCsv(), "family-organizer-folders.csv", "text/csv;charset=utf-8");
      } else if (id === "alb-json") {
        downloadText(planJson(), "family-organizer-plan.json", "application/json");
      } else if (id === "alb-clear") {
        clearAll();
      } else if (id === "alb-rebuild") {
        rebuildThumbs();
      }
    });

    root.addEventListener("change", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.id === "alb-thumb") {
        state.thumbMax = clamp(parseInt(t.value, 10) || DEFAULT_THUMB_MAX, 64, 2000);
        syncControls();
        rebuildThumbs();
      } else if (t.classList && t.classList.contains("alb-file-date")) {
        applyFileDate(t.dataset.id, t.value);
      } else if (t.classList && t.classList.contains("alb-group-date")) {
        applyGroupDate(t.dataset.scope, t.dataset.key, t.value);
      }
    });

    root.addEventListener("input", function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t.id === "alb-title") {
        state.title = t.value;
        renderMeta();
      } else if (t.id === "alb-pattern") {
        state.pattern = t.value || DEFAULT_PATTERN;
        if (state.mode === "organizer") renderOrganizer();
      }
    });
  }

  /* ---------------------------------------------------------------- mount */

  function mount(el, options) {
    root = el;
    if (!root) {
      return { addFiles: function () {}, state: function () { return state; }, reset: function () {} };
    }
    const opt = options || {};
    state.mode = opt.mode === "organizer" ? "organizer" : "timeline";
    state.root = el;
    state.items = [];
    state.errors = [];
    state.title = "";
    state.pattern = DEFAULT_PATTERN;
    state.thumbMax = DEFAULT_THUMB_MAX;
    state.processing = false;
    seq = 0;

    root.className = "studio alb-studio";
    root.innerHTML = shell();
    bindEvents();
    render();
    renderMeta();
    syncControls();

    const api = {
      addFiles: addFiles,
      state: function () { return state; },
      items: function () { return state.items; },
      groups: function () { return state.mode === "timeline" ? buildTimelineModel() : groupByYear(sortedItems()); },
      albumHtml: albumHtml,
      organizerHtml: organizerHtml,
      planCsv: planCsv,
      planJson: planJson,
      proposedPath: proposedPath,
      setDate: applyFileDate,
      rebuild: rebuildThumbs,
      reset: clearAll
    };
    if (typeof window !== "undefined" && window.AlbumStudio) window.AlbumStudio._active = api;
    return api;
  }

  /* --------------------------------------------------------------- export */

  const api = {
    mount: mount,
    core: {
      num: num,
      clamp: clamp,
      pad2: pad2,
      pad4: pad4,
      esc: esc,
      MONTHS: MONTHS,
      DEFAULT_PATTERN: DEFAULT_PATTERN,
      DEFAULT_THUMB_MAX: DEFAULT_THUMB_MAX,
      LARGE_SET: LARGE_SET,
      HUGE_SET: HUGE_SET,
      THUMB_CHOICES: THUMB_CHOICES,
      readExifDate: readExifDate,
      pickDate: pickDate,
      itemDate: itemDate,
      dayKey: dayKey,
      monthKey: monthKey,
      yearKey: yearKey,
      groupByDay: groupByDay,
      groupByYearMonth: groupByYearMonth,
      groupByYear: groupByYear,
      buildTree: buildTree,
      sanitizeTitle: sanitizeTitle,
      extOf: extOf,
      baseOf: baseOf,
      renamePattern: renamePattern,
      thumbPlan: thumbPlan,
      isImageFile: isImageFile,
      dataUrlBytes: dataUrlBytes,
      parseInputDate: parseInputDate,
      inputDate: inputDate
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.AlbumStudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
