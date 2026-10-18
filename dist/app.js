/*
 * Progeni - Browser-First Global Utility Platform
 * 100% Client-Side Processing | Zero Server Uploads
 */

// Import pure utilities from single source of truth (utils.js)
const {
  esc,
  csvParse,
  csvOut,
  buildContactKey,
  filterBookmarkLinks,
  cleanSVG,
  parseVCF,
  normalizeDate
} = (typeof window !== "undefined" && window.ProgeniUtils) ? window.ProgeniUtils : (typeof require === "function" ? require("./utils.js") : {});

// Import brand and tools configuration from single source of truth (site.config.js)
const {
  PARENT_BRAND,
  PARENT_URL,
  SITE_NAME,
  SITE_SHORT,
  SITE_URL,
  SUPPORT_EMAIL,
  TAGLINE,
  LOCALE,
  TOOLS
} = (typeof window !== "undefined" && window.SiteConfig) ? window.SiteConfig : (typeof require === "function" ? require("./site.config.js") : {});

// Global DMC Palette References for Crafters
// (The shared DMC floss table now lives in data/dmc.js — loaded as window.DMC_PALETTE
// and consumed by pattern-studio.js for the cross-stitch / diamond / embroidery tools.)

const $ = s => document.querySelector(s);
const app = $("#app");

const downloadBlob = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
};

function revokeResultURLs(el) {
  if (!el) return;
  el.querySelectorAll('img[src^="blob:"]').forEach(img => {
    URL.revokeObjectURL(img.src);
  });
}

const textDownload = (text, name, type = "text/plain") => downloadBlob(new Blob([text], { type }), name);
const fmtBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
const readDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const imageFromFile = async f => {
  const u = URL.createObjectURL(f);
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = e => { URL.revokeObjectURL(u); rej(e); };
    i.src = u;
  });
};

function layout({ tool, body }) {
  const related = TOOLS.filter(t => t.id !== tool.id && (t.cat === tool.cat || (["Images","Print & Craft"].includes(t.cat) && ["Images","Print & Craft"].includes(tool.cat)))).slice(0, 6);
  
  let pageTitle = `${tool.name}: Free Online, No Upload | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = `${tool.name}: Free Online | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = `${tool.name} | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = tool.name.slice(0, 60);
  document.title = pageTitle;

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.href = `${SITE_URL}/tools/${tool.id}/`;
  }

  app.innerHTML = `
    <section class="tool-head">
      <span class="eyebrow">${esc(tool.cat)} · 100% Private Client-Side</span>
      <h1>${esc(tool.icon)} ${esc(tool.name)}</h1>
      <p>${esc(tool.desc)} <strong>Zero server uploads</strong> — all processing happens directly in your browser.</p>
    </section>

    <section class="toolbox">${body}</section>

    <!-- Rich SEO & User Guide Section -->
    <section class="seo-section">
      <h2>What It Does</h2>
      <p>${esc(tool.whatItDoes || tool.desc)}</p>

      <h2>How to Use</h2>
      <ol>
        ${(tool.howToUse || []).map(step => `<li>${esc(step)}</li>`).join("")}
      </ol>

      <h2>Limitations & Scope</h2>
      <p>${esc(tool.limits || "Processes standard files client-side.")}</p>

      <h2>Privacy & Security</h2>
      <p>${esc(tool.privacy || "Processed locally in your browser.")}</p>

      <h3>Related Utilities</h3>
      <div class="tool-links">
        ${related.map(t => `<a href="/tools/${t.id}/">${esc(t.icon)} ${esc(t.name)}</a>`).join("")}
      </div>
    </section>
  `;
}

function home() {
  document.title = "Progeni — 30 Free, Privacy-First Browser Tools & Utilities";
  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">30 Global Utilities · 100% Private</span>
      <h1>Free Online PDF Tools</h1>
      <p>Merge, split, compress, convert, and edit PDFs instantly — all client-side, zero uploads.</p>
      <div class="drop" id="drop">
        <strong>Drop PDF files here</strong>
        <span>or click to browse from device</span>
        <input id="file" type="file" multiple accept=".pdf">
      </div>
    </section>

    <section id="grid" class="grid"></section>
  `;

  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];
  $("#cats").innerHTML = cats.map((c, i) => `<button class="pill ${i === 0 ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

  const render = (cat = "All", q = "") => {
    $("#grid").innerHTML = TOOLS.filter(t => (cat === "All" || t.cat === cat) && (`${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q.toLowerCase()))).map(t => `
      <a class="tool-card" href="/tools/${t.id}">
        <div class="icon">${t.icon}</div>
        <h2>${esc(t.name)}</h2>
        <p>${esc(t.desc)}</p>
        <span class="tag">${esc(t.cat)}</span>
      </a>
    `).join("") || `<div class="empty">No matching tools found.</div>`;
  };

  let cat = "All";
  render();
  document.querySelectorAll(".pill").forEach(b => b.onclick = () => {
    document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    cat = b.dataset.cat;
    render(cat, $("#search").value);
  });
  $("#search").oninput = e => render(cat, e.target.value);
}

function picker(multiple = false, accept = "*/*") {
  return `<div class="drop" id="drop">
    <strong>Drop ${multiple ? "files" : "a file"} here</strong>
    <span>or click to browse from device</span>
    <input id="file" type="file" ${multiple ? "multiple" : ""} accept="${accept}" hidden>
  </div>`;
}

function bindPicker(cb) {
  const d = $("#drop"), f = $("#file");
  if (!d || !f) return;
  d.onclick = () => f.click();
  ["dragenter", "dragover"].forEach(x => d.addEventListener(x, e => { e.preventDefault(); d.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(x => d.addEventListener(x, e => { e.preventDefault(); d.classList.remove("drag"); }));
  d.addEventListener("drop", e => cb([...e.dataTransfer.files]));
  f.onchange = () => cb([...f.files]);
}

// Mobile navigation toggle
document.getElementById("hamburger")?.addEventListener("click", () => {
  const nav = document.querySelector("nav");
  if (nav) {
    nav.classList.toggle("open");
    const hamburger = document.getElementById("hamburger");
    if (hamburger) {
      hamburger.setAttribute("aria-expanded", nav.classList.contains("open"));
    }
  }
});

function resultBox(html = "") {
  const r = document.createElement("div");
  r.className = "result";
  r.id = "result";
  r.setAttribute("aria-live", "polite");
  r.innerHTML = html;
  $(".toolbox").appendChild(r);
  return r;
}

function canvasBlob(canvas, type = "image/png", quality = 0.95) {
  return new Promise(r => canvas.toBlob(r, type, quality));
}

/* Tool Handlers */
async function processTool(id, files) {
  const f = files[0];
  let rs = $("#result");
  if (!rs) rs = resultBox();

  // Show loading state
  if (rs) {
    rs.innerHTML = `
      <div class="loading-result">
        <div class="loader">Processing...</div>
      </div>
    `;
  }

  try {
    switch (id) {
      case "bookmark-cleaner": {
        const t = await readText(f), doc = new DOMParser().parseFromString(t, "text/html"), seen = new Set(), links = [...doc.querySelectorAll("a[href]")];
        let dup = 0;
        links.forEach(a => {
          let u = a.href;
          if (seen.has(u)) { a.remove(); dup++; } else { seen.add(u); }
        });
        const out = "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n" + doc.documentElement.outerHTML;
        rs.innerHTML = `<div class="notice">Removed ${dup} duplicate URL entries. ${seen.size} unique bookmarks remain.</div><button class="btn" id="dl">Download cleaned bookmarks.html</button>`;
        $("#dl").onclick = () => textDownload(out, "bookmarks-cleaned.html", "text/html");
        break;
      }
      case "calendar-cleaner": {
        const t = await readText(f), lines = t.split(/\r?\n/), out = [], seen = new Set(), dup = [];
        let event = "", inside = false;
        for (const l of lines) {
          if (l === "BEGIN:VEVENT") { inside = true; event = ""; }
          if (inside) event += l + "\n";
          if (l === "END:VEVENT") {
            inside = false;
            const key = event.replace(/\s+/g, "");
            if (seen.has(key)) dup.push(event); else { seen.add(key); out.push(event); }
          }
        }
        const base = t.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g, "");
        const final = base.replace("END:VCALENDAR", out.join("") + "END:VCALENDAR");
        rs.innerHTML = `<div class="notice">Found ${seen.size} unique events and removed ${dup.length} duplicate events.</div><button class="btn" id="dl">Download cleaned .ics</button>`;
        $("#dl").onclick = () => textDownload(final, "calendar-cleaned.ics", "text/calendar");
        break;
      }
      case "timetable-calendar": {
        const rows = csvParse(await readText(f));
        if (rows.length < 2) throw Error("CSV needs a header row and at least one event row.");
        const h = rows[0].map(x => x.trim().toLowerCase());
        const ix = n => h.indexOf(n);
        const day = ix("day"), start = ix("start"), end = ix("end"), title = ix("title") >= 0 ? ix("title") : ix("subject"), date = ix("date");
        if (day < 0 || start < 0 || end < 0 || title < 0) throw Error("Required columns: day,start,end,title (optional date).");
        const prodBrand = PARENT_BRAND || "Progeni";
        const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${prodBrand}//Timetable//EN`];
        const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const hostDomain = SITE_URL ? new URL(SITE_URL).hostname : "bench.progeni.live";
        rows.slice(1).forEach((r, i) => {
          let d = date >= 0 && r[date] ? new Date(r[date]) : nextDay(days[(r[day] || "").toLowerCase()]);
          if (!d) return;
          const [sh, sm] = (r[start] || "09:00").split(":").map(Number), [eh, em] = (r[end] || "10:00").split(":").map(Number);
          const fmt = x => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
          let a = new Date(d); a.setHours(sh, sm, 0, 0);
          let b = new Date(d); b.setHours(eh, em, 0, 0);
          ics.push("BEGIN:VEVENT", `UID:ph-${Date.now()}-${i}@${hostDomain}`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(a)}`, `DTEND:${fmt(b)}`, `SUMMARY:${(r[title] || "Class").replace(/[,;]/g, " ")}`, "RRULE:FREQ=WEEKLY;COUNT=16", "END:VEVENT");
        });
        ics.push("END:VCALENDAR");
        rs.innerHTML = `<div class="notice">Created ${rows.length - 1} recurring calendar events from your CSV.</div><button class="btn" id="dl">Download timetable.ics</button>`;
        $("#dl").onclick = () => textDownload(ics.join("\r\n"), "timetable.ics", "text/calendar");
        break;
      }
      case "sticker-sheet": case "print-layout": case "ironon-sheet": {
        await sheetMaker(id, files, rs);
        break;
      }
      case "svg-cleaner": {
        const raw = await readText(f);
        const cleaned = cleanSVG(raw);
        rs.innerHTML = `<div class="notice">SVG sanitized. Stripped scripts, dangerous hrefs, and editor metadata.</div><button class="btn" id="dl">Download Cleaned SVG</button>`;
        $("#dl").onclick = () => textDownload(cleaned, "cleaned.svg", "image/svg+xml");
        break;
      }
      case "video-safe-zone": { await safeZone(f, rs); break; }
      case "bookmark-reading": {
        const t = await readText(f);
        const doc = new DOMParser().parseFromString(t, "text/html");
        const rawAnchors = [...doc.querySelectorAll("a[href]")].map(a => ({ href: a.href, text: a.textContent || a.href }));
        const safeLinks = filterBookmarkLinks(rawAnchors);
        const as = safeLinks.map(a => `<li><a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.text)}</a></li>`).join("");
        const out = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Offline Reading List</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6}li{margin:10px 0}a{color:#1d4ed8;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>Reading List</h1><p>Exported from Progeni.</p><ul>${as}</ul></body></html>`;
        rs.innerHTML = `<div class="notice">${safeLinks.length} valid links converted into clean offline reading list.</div><button class="btn" id="dl">Download reading-list.html</button>`;
        // Remove loading state
        $("#result.loading-result")?.remove();
        $("#dl").onclick = () => textDownload(out, "reading-list.html", "text/html");
        break;
      }
      case "csv-splitter": { csvTool(id, await readText(f), rs); break; }
      case "csv-date": { csvTool(id, await readText(f), rs); break; }
      case "contact-dedupe": { contactDedupe(await readText(f), rs); break; }
      case "vcard": { vcardTool(files, rs); break; }
      case "panorama": { panorama(f, rs); break; }
      default: rs.innerHTML = `<div class="warn">Ready for processing. Drop files to begin.</div>`;
    }
  } catch (e) {
    console.error(e);
    // Remove loading state on error
    if (rs) rs.innerHTML = `<div class="error">${esc(e.message || e)}</div>`;
  }
}

function nextDay(target) {
  const d = new Date();
  let add = (target - d.getDay() + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

/* Global Paper Sheet Maker (US Letter & A4 & 4x6") */
async function sheetMaker(id, files, rs) {
  const pSize = $("#paperSize") ? $("#paperSize").value : "letter";
  let w = 2550, h = 3300; // US Letter 300 DPI default
  if (pSize === "a4") { w = 2480; h = 3508; }
  else if (pSize === "4x6") { w = 1200; h = 1800; }
  else if (pSize === "a3") { w = 3508; h = 4960; }

  const maxAllowed = 12;
  const imgs = await Promise.all(files.slice(0, maxAllowed).map(imageFromFile));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);

  let cols = (id === "sticker-sheet" || pSize === "4x6") ? 3 : 2;
  if (pSize === "4x6") cols = 2;
  let gap = 50;
  let cellW = (c.width - gap * (cols + 1)) / cols;
  let cellH = cellW;

  imgs.forEach((im, i) => {
    let col = i % cols;
    let row = Math.floor(i / cols);
    let x = gap + col * (cellW + gap);
    let y = gap + row * (cellH + gap);
    let s = Math.min(cellW / im.width, cellH / im.height);
    let dw = im.width * s;
    let dh = im.height * s;
    ctx.drawImage(im, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
  });

  const b = await canvasBlob(c);
  const note = files.length > maxAllowed
    ? `<div class="notice">Placed ${imgs.length} images onto <strong>${pSize.toUpperCase()} sheet (300 DPI)</strong>. (${files.length - maxAllowed} additional files omitted to prevent page clipping).</div>`
    : `<div class="notice">${imgs.length} image(s) tiled onto <strong>${pSize.toUpperCase()} sheet (300 DPI)</strong>.</div>`;

  rs.innerHTML = `
    ${note}
    <img style="max-width:100%;max-height:420px;border:1px solid #cbd5e1;border-radius:12px;display:block;margin:0 auto 16px;" src="${URL.createObjectURL(b)}">
    <button class="btn" id="dl">Download High-Res Print Sheet (.PNG)</button>
  `;
  $("#dl").onclick = () => downloadBlob(b, `${id}-${pSize}-sheet.png`);
}

/* Audio & Video Tools */
const fmtTime = s => {
  if (!isFinite(s) || s < 0) s = 0;
  let h = Math.floor(s / 3600);
  let m = Math.floor((s % 3600) / 60);
  let sec = Math.floor(s % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/* Global Social Safe-Zone Overlays (TikTok, Instagram Reels, Shorts) */
async function safeZone(f, rs) {
  let im;
  if (f.type.startsWith("video") || /\.(mp4|mov|webm)$/i.test(f.name)) {
    const vSrc = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.src = vSrc;
    v.muted = true;
    try {
      await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
      v.currentTime = Math.min(1, v.duration / 2);
      await new Promise(r => v.onseeked = r);
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 720;
      c.height = v.videoHeight || 1280;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, c.width, c.height);
      im = await imageFromFile(await canvasBlob(c));
    } finally {
      URL.revokeObjectURL(vSrc);
    }
  } else {
    im = await imageFromFile(f);
  }
  const platform = ($("#platformSelect") ? $("#platformSelect").value : "tiktok") || "tiktok";
  const c = document.createElement("canvas");
  c.width = im.width; c.height = im.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0);

  ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
  ctx.lineWidth = Math.max(3, im.width / 240);

  let w9 = im.width, h9 = w9 / (9 / 16);
  if (h9 > im.height) { h9 = im.height; w9 = h9 * (9 / 16); }
  let ox = (im.width - w9) / 2, oy = (im.height - h9) / 2;

  ctx.strokeRect(ox, oy, w9, h9);
  ctx.fillStyle = "rgba(239, 68, 68, 0.25)";

  if (platform === "reels") {
    ctx.fillRect(ox + w9 * 0.82, oy + h9 * 0.46, w9 * 0.16, h9 * 0.40);
    ctx.fillRect(ox + w9 * 0.05, oy + h9 * 0.78, w9 * 0.75, h9 * 0.16);
    ctx.fillRect(ox, oy, w9, h9 * 0.08);
  } else if (platform === "shorts") {
    ctx.fillRect(ox + w9 * 0.82, oy + h9 * 0.40, w9 * 0.16, h9 * 0.46);
    ctx.fillRect(ox + w9 * 0.04, oy + h9 * 0.83, w9 * 0.76, h9 * 0.13);
    ctx.fillRect(ox, oy, w9, h9 * 0.08);
  } else {
    ctx.fillRect(ox + w9 * 0.82, oy + h9 * 0.45, w9 * 0.16, h9 * 0.42);
    ctx.fillRect(ox + w9 * 0.05, oy + h9 * 0.82, w9 * 0.75, h9 * 0.15);
    ctx.fillRect(ox, oy, w9, h9 * 0.10);
  }

  ctx.font = `${Math.round(w9 * 0.04)}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  const pName = platform === "reels" ? "Instagram Reels" : platform === "shorts" ? "YouTube Shorts" : "TikTok";
  ctx.fillText(`⚠️ ${pName} UI Covered Zones`, ox + w9 * 0.08, oy + h9 * 0.90);

  const b = await canvasBlob(c);
  rs.innerHTML = `
    <div class="notice">Red zones show areas obscured by <strong>${pName} UI</strong> (captions, right action buttons, header tabs). Keep critical text inside the center safe area!</div>
    <img style="max-width:100%;border-radius:12px;display:block;margin:0 auto 16px;" src="${URL.createObjectURL(b)}">
    <button class="btn" id="dl-overlay">Download Overlay PNG</button>
  `;
  $("#dl-overlay").onclick = () => downloadBlob(b, "video-safe-zone-overlay.png");
}

function parseChapters(input) {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const entries = [];
  const issues = [];
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*)$/);
    if (!m) { skipped++; continue; }
    const ts = normalizeTimestamp(m[1]);
    if (ts === null || ts === undefined) { skipped++; continue; }
    const title = m[2].trim();
    if (!title) { skipped++; continue; }
    entries.push({ ts, title });
  }
  if (entries.length === 0) return { entries: [], clean: "", issues: ["No valid chapters found"] };
  entries.sort((a, b) => a.ts - b.ts);
  if (skipped > 0) issues.push(`${skipped} line${skipped > 1 ? "s" : ""} skipped (expected "MM:SS Title" or "HH:MM:SS Title")`);
  // Enforce start at 00:00:00
  if (entries[0].ts !== 0) {
    issues.push(`Chapters must start at 00:00:00 — first chapter "${entries[0].title}" moved from ${fmtTime(entries[0].ts)} (fix your input if unintended)`);
    entries[0] = { ts: 0, title: entries[0].title };
  }
  // Duplicates
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].ts === entries[i - 1].ts) issues.push(`Duplicate timestamp ${fmtTime(entries[i].ts)} ("${entries[i].title}")`);
  }
  // Large-gap warning (> 15 min)
  for (let i = 1; i < entries.length; i++) {
    const gap = entries[i].ts - entries[i - 1].ts;
    if (gap > 900) issues.push(`Large gap of ${Math.round(gap / 60)} min before "${entries[i].title}"`);
  }
  const clean = formatChapters(entries);
  return { entries, clean, issues };
}

function normalizeTimestamp(s) {
  const parts = s.split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (isNaN(m) || isNaN(sec) || sec < 0 || sec >= 60) return null;
    return m * 60 + sec;
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const sec = parseInt(parts[2], 10);
    if (isNaN(h) || isNaN(m) || isNaN(sec) || m < 0 || m >= 60 || sec < 0 || sec >= 60) return null;
    return h * 3600 + m * 60 + sec;
  }
  return null;
}

function formatChapters(entries) {
  return entries.map(e => `${fmtTime(e.ts)} ${e.title}`).join("\n");
}

function csvTool(id, t, rs) {
  const rows = csvParse(t), h = rows[0];
  if (id === "csv-splitter") {
    rs.innerHTML = `
      <div class="controls">
        <label>Column to Split<select id="col">${h.map((x, i) => `<option value="${i}">${esc(x)}</option>`).join("")}</select></label>
        <label>Delimiter<input id="delim" value=" " maxlength="3" style="width:80px;"></label>
      </div>
      <button class="btn" id="go">Split Column</button>
    `;
    $("#go").onclick = () => {
      let c = +$("#col").value, d = $("#delim").value || " ";
      let maxParts = 1;
      const splitRows = rows.map((r, ri) => {
        const parts = (r[c] || "").split(d);
        if (ri > 0 && parts.length > maxParts) maxParts = parts.length;
        return { row: r, parts };
      });

      const headerColName = h[c] || "Column";
      const newHeaderCols = maxParts > 1 ? Array.from({ length: maxParts }, (_, i) => `${headerColName}_${i + 1}`) : [headerColName];
      const headerRow = [...h.slice(0, c), ...newHeaderCols, ...h.slice(c + 1)];

      const out = [headerRow];
      for (let ri = 1; ri < splitRows.length; ri++) {
        const { row, parts } = splitRows[ri];
        while (parts.length < maxParts) parts.push("");
        out.push([...row.slice(0, c), ...parts, ...row.slice(c + 1)]);
      }

      rs.insertAdjacentHTML("beforeend", `<div class="notice" style="margin-top:16px;">Column split complete into ${maxParts} columns (${out.length - 1} rows).</div><button class="btn secondary" id="dl">Download Cleaned CSV</button>`);
      $("#dl").onclick = () => textDownload(csvOut(out), "cleaned.csv", "text/csv");
    };
  } else {
    rs.innerHTML = `
      <div class="controls">
        <label>Date Column<select id="col">${h.map((x, i) => `<option value="${i}">${esc(x)}</option>`).join("")}</select></label>
        <label>Target Format<select id="fmt"><option value="YYYY-MM-DD">ISO standard (YYYY-MM-DD)</option><option value="MM/DD/YYYY">US standard (MM/DD/YYYY)</option><option value="DD/MM/YYYY">European standard (DD/MM/YYYY)</option></select></label>
      </div>
      <button class="btn" id="go">Normalize Dates</button>
    `;
    $("#go").onclick = () => {
      const c = +$("#col").value, fmt = $("#fmt").value;
      const out = rows.map((r, i) => i ? r.map((v, j) => j === c ? normalizeDate(v, fmt) : v) : r);
      rs.insertAdjacentHTML("beforeend", `<div class="notice" style="margin-top:16px;">Dates standardized to ${fmt}.</div><div class="warn" style="margin-top:8px;">Ambiguous date warning: values with day and month <= 12 are parsed using standard format order.</div><button class="btn secondary" id="dl">Download Normalized CSV</button>`);
      $("#dl").onclick = () => textDownload(csvOut(out), "normalized.csv", "text/csv");
    };
  }
}

function contactDedupe(t, rs) {
  const rows = csvParse(t), h = rows[0].map(x => x.toLowerCase());
  const ei = h.findIndex(x => x.includes("email")), pi = h.findIndex(x => x.includes("phone") || x.includes("mobile") || x.includes("cell"));
  const seen = new Set(), out = [rows[0]], dups = [];
  rows.slice(1).forEach(r => {
    const k = buildContactKey(r, ei, pi);
    if (seen.has(k)) dups.push(r); else { seen.add(k); out.push(r); }
  });
  rs.innerHTML = `<div class="notice">Found ${out.length - 1} unique contacts; merged and removed ${dups.length} duplicate entries.</div><button class="btn" id="dl">Download Deduplicated CSV</button>`;
  $("#dl").onclick = () => textDownload(csvOut(out), "contacts-deduped.csv", "text/csv");
}

async function vcardTool(files, rs) {
  const texts = await Promise.all(files.map(readText));
  const fullText = texts.join("\r\n");
  const cards = parseVCF(fullText);

  rs.innerHTML = `
    <div class="notice">Found <strong>${cards.length}</strong> valid vCard contact cards across ${files.length} file(s).</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      <button class="btn" id="dl-merge">Download All Merged (.VCF)</button>
    </div>
    <div style="max-height:220px;overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;">
      <strong style="display:block;margin-bottom:8px;font-size:13px;">Individual Contact Cards:</strong>
      ${cards.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
          <span>👤 ${esc(c.name)}</span>
          <button class="btn secondary" style="padding:4px 10px;font-size:12px;" id="dl-card-${i}">Save .vcf</button>
        </div>
      `).join("")}
    </div>
  `;

  $("#dl-merge").onclick = () => textDownload(cards.map(c => c.raw).join("\r\n"), "merged-contacts.vcf", "text/vcard");
  cards.forEach((c, i) => {
    const btn = $(`#dl-card-${i}`);
    if (btn) btn.onclick = () => textDownload(c.raw, `${c.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.vcf`, "text/vcard");
  });
}

async function panorama(f, rs) {
  const im = await imageFromFile(f);
  const partsEl = $("#panoramaParts");
  const parts = partsEl ? parseInt(partsEl.value, 10) : 3;
  const tileWidth = Math.floor(im.width / parts);
  const tileHeight = tileWidth; // square tiles
  const c = document.createElement("canvas"), ctx = c.getContext("2d");
  c.width = tileWidth; c.height = tileHeight;
  let html = `<div class="notice">Panorama split into ${parts} square carousel tiles (height = width/parts):</div>`;
  if (tileHeight > im.height) {
    html = `<div class="warn">Cannot yield square tiles (tile height ${tileHeight}px > image height ${im.height}px). Using rectangular tiles instead.</div>`;
  }
  html += `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;" id="pg"></div>`;
  rs.innerHTML = html;
  const tileBlobs = [];
  for (let i = 0; i < parts; i++) {
    c.width = tileWidth;
    c.height = tileHeight > im.height ? im.height : tileHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(im, i * tileWidth, 0, tileWidth, c.height, 0, 0, c.width, c.height);
    let b = await canvasBlob(c);
    tileBlobs.push(b);
    let img = document.createElement("img");
    img.src = URL.createObjectURL(b);
    img.style.width = "30%"; img.style.borderRadius = "8px"; img.style.cursor = "pointer";
    img.title = `Click to download Tile ${i + 1}`;
    img.onclick = () => downloadBlob(b, `carousel-tile-${i + 1}.png`);
    $("#pg").appendChild(img);
  }
  let dlAll = document.createElement("button");
  dlAll.className = "btn";
  dlAll.id = "dl-all-tiles";
  dlAll.textContent = "Download All Tiles";
  rs.appendChild(dlAll);
  dlAll.onclick = async () => {
    for (let i = 0; i < tileBlobs.length; i++) {
      downloadBlob(tileBlobs[i], `carousel-tile-${i + 1}.png`);
      await new Promise(r => setTimeout(r, 100));
    }
  };
}

/* Photo Timeline Builder (2.5) and Family Photo Date Organizer (2.6) run inside
   the shared Album Studio engine (album-studio.js — EXIF dating, embedded
   thumbnails, day/month grouping, rename planner). The legacy text-only
   photoTimeline() was retired. Duplicate Finder (2.3) and Best-Shot Finder
   (2.4) run inside the shared PhotoBatch engine (photo-batch-studio.js). */

function home() {
  let homeTitle = `${SITE_NAME}: Free Private File Tools in Your Browser`;
  if (homeTitle.length > 60) homeTitle = `${SITE_NAME}: Private File Tools`;
  document.title = homeTitle;

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.href = `${SITE_URL}/`;
  }

  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">30 Global Utilities · 100% Private</span>
      <h1>Fix everyday digital problems in seconds.</h1>
      <p>${esc(TAGLINE)} Instant client-side tools for crafters, creators, and professionals. Make Avery labels, sticker sheets, mirror T-shirt prints, repair subtitles, dedupe contacts, and convert CSVs without uploading your data to external servers.</p>
      <input id="search" class="search" placeholder="Search 30 tools (e.g., sticker sheet, avery labels, subtitle, csv, t-shirt)...">
      <div id="cats" class="categories"></div>
    </section>

    <section id="grid" class="grid"></section>
  `;

  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];
  $("#cats").innerHTML = cats.map((c, i) => `<button class="pill ${i === 0 ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

  const render = (cat = "All", q = "") => {
    $("#grid").innerHTML = TOOLS.filter(t => (cat === "All" || t.cat === cat) && (`${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q.toLowerCase()))).map(t => `
      <a class="tool-card" href="/tools/${t.id}/">
        <div class="icon">${t.icon}</div>
        <h2>${esc(t.name)}</h2>
        <p>${esc(t.desc)}</p>
        <span class="tag">${esc(t.cat)}</span>
      </a>
    `).join("") || `<div class="empty">No matching tools found.</div>`;
  };

  let cat = "All";
  render();
  document.querySelectorAll(".pill").forEach(b => b.onclick = () => {
    document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    cat = b.dataset.cat;
    render(cat, $("#search").value);
  });
  $("#search").oninput = e => render(cat, e.target.value);
}

function toolPage(id) {
  const tool = TOOLS.find(x => x.id === id);
  if (!tool) { home(); return; }
  let accept = "*/*", multi = false;

  if (["bookmark-cleaner", "bookmark-reading"].includes(id)) accept = ".html,.htm";
  if (["calendar-cleaner"].includes(id)) accept = ".ics,text/calendar";
  if (["subtitle-speed", "subtitle-linefix"].includes(id)) accept = ".srt";
  if (["svg-cleaner"].includes(id)) accept = ".svg,image/svg+xml";
  if (id.startsWith("csv") || id === "contact-dedupe" || id === "labels" || id === "timetable-calendar") accept = ".csv,text/csv";
  if (id === "vcard") accept = ".vcf,text/vcard";
  if (["sticker-sheet", "print-layout", "ironon-sheet", "best-shot", "wallpaper", "tshirt-mirror"].includes(id)) { multi = true; accept = "image/*"; }
  if (id === "photo-timeline") { multi = true; accept = "image/*"; }
  if (id === "family-organizer") { multi = true; accept = "*/*"; }
  if (id === "duplicate-finder") { multi = true; accept = "*/*"; }
  if (["print-border", "cross-stitch", "embroidery", "diamond-painting", "panorama"].includes(id)) accept = "image/*";
  if (id === "silence-map") accept = "audio/*";
  if (id === "video-safe-zone") accept = "video/*,image/*";
  if (id === "video-thumbnails") accept = "video/*";

  let body = picker(multi, accept);

  // Sticker Sheet Maker runs inside the dedicated Sticker Studio engine
  // (live layout controls, drag-to-reorder preview, PNG/PDF/SVG export).
  if (id === "sticker-sheet") {
    layout({ tool, body: body + `<div class="studio" id="studio"></div>` });
    const studio = window.StickerStudio.mount(document.getElementById("studio"));
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // Avery 5160 / Label Maker runs inside the dedicated Label Studio engine
  // (multi-line builder, sheet preview, PNG/HTML/Print export — see docs/LABELS_PLAN.md).
  if (id === "labels") {
    layout({ tool, body: body + `<div class="studio" id="studio"></div>` });
    const studio = window.LabelStudio.mount(document.getElementById("studio"));
    bindPicker(files => {
      const f = files[0];
      if (f) readText(f).then(t => studio.addCsv(t, f.name)).catch(() => studio.addCsv("", ""));
    });
    return;
  }

  // Cross-Stitch, Diamond Painting and Embroidery run inside the shared Pattern
  // Studio engine (DMC palette, median-cut + snap, symbol charts, drill planner,
  // skein estimates, CSV/PNG/print — see pattern-studio.js, docs/TOOLS_ROADMAP.md
  // 1.7–1.9).
  if (id === "cross-stitch" || id === "diamond-painting" || id === "embroidery") {
    layout({ tool, body: body + `<div class="studio" id="patternstudio"></div>` });
    const studio = window.PatternStudio.mount(document.getElementById("patternstudio"), {
      mode: id === "cross-stitch" ? "cross-stitch" : id === "diamond-painting" ? "diamond" : "embroidery"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // T-Shirt Print Mirror, Photo Print Border and Wallpaper Cropper run inside
  // the shared Image Studio engine (flip / border / crop modes — see
  // image-studio.js and docs/TOOLS_ROADMAP.md 1.3 / 1.6 / 2.1). The legacy
  // imageTransform() helper that used to serve these three was removed.
  if (id === "tshirt-mirror" || id === "print-border" || id === "wallpaper") {
    layout({ tool, body: body + `<div class="studio" id="imagestudio"></div>` });
    const studio = window.ImageStudio.mount(document.getElementById("imagestudio"), {
      mode: id === "tshirt-mirror" ? "mirror" : id === "print-border" ? "border" : "wallpaper"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // Photo Duplicate Finder and Photo Best-Shot Finder run inside the shared
  // Photo Batch Studio engine (exact SHA-256 + aHash/dHash dedupe; Laplacian
  // sharpness / exposure / contrast ranking — see photo-batch-studio.js and
  // docs/TOOLS_ROADMAP.md 2.3 / 2.4).
  if (id === "duplicate-finder" || id === "best-shot") {
    layout({ tool, body: body + `<div class="studio" id="photobatch"></div>` });
    const studio = window.PhotoBatch.mount(document.getElementById("photobatch"), {
      mode: id === "duplicate-finder" ? "dedupe" : "best-shot"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // Photo Timeline Builder (2.5) and Family Photo Date Organizer (2.6) run
  // inside the shared Album Studio engine (EXIF dating, embedded data-URL
  // thumbnails, day/month/year grouping, rename-pattern planner — see
  // album-studio.js). The legacy shared photoTimeline() was retired.
  if (id === "photo-timeline" || id === "family-organizer") {
    layout({ tool, body: body + `<div class="studio" id="albumstudio"></div>` });
    const studio = window.AlbumStudio.mount(document.getElementById("albumstudio"), {
      mode: id === "photo-timeline" ? "timeline" : "organizer"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // Video Thumbnail Contact Sheet (3.2) and Podcast Silence Map (3.4) run inside
  // the shared Media Studio engine — the seek-capture loop races every seek
  // against a timeout with a previous-frame fallback, and the silence scanner
  // decodes + scans in chunks with a waveform, gap list and CSV/TXT exports
  // (see media-studio.js). The legacy videoThumbs() / silenceMap() were retired.
  if (id === "video-thumbnails" || id === "silence-map") {
    layout({ tool, body: body + `<div class="studio" id="mediastudio"></div>` });
    const studio = window.MediaStudio.mount(document.getElementById("mediastudio"), {
      mode: id === "video-thumbnails" ? "thumbs" : "silence"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  if (id === "audio-chapters") {
    body = `
      <div class="controls">
        <label style="width:100%">Chapter Timestamps & Titles (MM:SS or HH:MM:SS Title)
          <textarea id="chap" rows="8" style="width:100%;font-family:monospace;" placeholder="00:00 Introduction&#10;02:15 Main Topic&#10;06:40 Key Insights&#10;11:20 Conclusion"></textarea>
        </label>
      </div>
      <div id="chap-preview" class="notice" style="display:none;margin-top:12px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn" id="dl-chap">Download Chapters.txt</button>
        <button class="btn secondary" id="clean-chap">Validate & Clean</button>
      </div>
    `;
    layout({ tool, body });
    const updatePreview = () => {
      const raw = $("#chap").value;
      const res = parseChapters(raw);
      const prev = $("#chap-preview");
      if (!prev) return;
      if (res.issues.length) {
        prev.innerHTML = `Issues: ${res.issues.join("; ")}<br><pre>${esc(res.clean || "")}</pre>`;
        prev.style.display = "block";
        prev.className = "warn";
      } else if (res.entries.length) {
        prev.innerHTML = `<pre>${esc(res.clean)}</pre>`;
        prev.style.display = "block";
        prev.className = "notice";
      } else {
        prev.style.display = "none";
      }
    };
    $("#clean-chap").onclick = updatePreview;
    $("#dl-chap").onclick = () => {
      const raw = $("#chap").value;
      const chapters = parseChapters(raw);
      textDownload(chapters.clean, "chapters.txt");
    };
    updatePreview();
    return;
  }

  // Iron-on Transfer Sheet and Print Layout Optimizer run inside the shared
  // Sheet Studio engine (mirror presets / aspect-aware packing, PNG + print —
  // see sheet-studio.js). The legacy shared sheetMaker() path stays for
  // sticker-sheet fallbacks, but these two tools never use it anymore.
  if (id === "ironon-sheet" || id === "print-layout") {
    layout({ tool, body: body + `<div class="studio" id="sheetstudio"></div>` });
    const studio = window.SheetStudio.mount(document.getElementById("sheetstudio"),
      id === "ironon-sheet" ? "ironon" : "printlayout");
    bindPicker(files => studio.addFiles(files));
    return;
  }

  // Subtitle Speed Checker (4.1) and Subtitle Line Fixer (4.2) run inside the
  // shared Subtitle Studio engine — profile-based CPS/duration/line/overlap
  // audits with CSV + annotated SRT exports, plus a two-pass rewrap with a
  // diff preview and fixed-SRT download (see subtitle-studio.js).
  if (id === "subtitle-speed" || id === "subtitle-linefix" || id === "subtitle-fix") {
    layout({ tool, body: body + `<div class="studio" id="subtitleapp"></div>` });
    const studio = window.SubtitleStudio.mount(document.getElementById("subtitleapp"), {
      mode: id === "subtitle-speed" ? "speed" : "fix"
    });
    bindPicker(files => studio.addFiles(files));
    return;
  }

  if (id === "panorama") {
    body = `
      <div class="controls">
        <label>Tile Count
          <select id="panoramaParts">
            <option value="2">2</option>
            <option value="3" selected>3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
        </label>
      </div>
    ` + body;
  }
  if (id === "video-safe-zone") {
    body = `
      <div class="controls">
        <label>Social Platform Preview
          <select id="platformSelect">
            <option value="tiktok" selected>TikTok UI (9:16 - Like, Share, Captions Safe Area)</option>
            <option value="reels">Instagram Reels (9:16)</option>
            <option value="shorts">YouTube Shorts (9:16)</option>
          </select>
        </label>
      </div>
    ` + body;
  }

  layout({ tool, body });
  let activeFiles = null;
  if (id === "video-safe-zone" && $("#platformSelect")) {
    $("#platformSelect").onchange = () => {
      if (activeFiles && activeFiles.length) processTool(id, activeFiles);
    };
  }
  bindPicker(files => {
    activeFiles = files;
    let old = $("#result");
    if (old) { revokeResultURLs(old); old.remove(); }
    processTool(id, files);
  });
}

function about(kind) {
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.href = `${SITE_URL}/${kind}/`;
  }
  document.title = kind === "privacy" ? `Privacy Policy: ${SITE_NAME} Zero-Upload Guarantee` : kind === "terms" ? `Terms of Service: ${SITE_NAME} Online Utilities` : kind === "contact" ? `Contact Us: ${SITE_NAME} Support & Inquiries` : `About ${SITE_NAME}: Privacy-First Browser Tools`;
  const title = kind === "privacy" ? "Privacy Policy" : kind === "terms" ? "Terms of Service" : kind === "contact" ? "Contact Support" : `About ${SITE_NAME}`;
  let content = `
    <h2>Browser-First Global Architecture</h2>
    <p>${SITE_NAME} is <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> designed on a simple principle: digital utility tasks should be instant, free, and 100% private. All 30 tools process files locally in your web browser. Your sensitive spreadsheets, personal photos, and contact lists never touch an external server.</p>
  `;
  if (kind === "contact") {
    content = `
      <h2>Direct Email Inquiries</h2>
      <p>For general support, feedback, and inquiries: <a href="mailto:${SUPPORT_EMAIL}" style="color:var(--brand);font-weight:700;">${SUPPORT_EMAIL}</a></p>
    `;
  }
  app.innerHTML = `
    <section class="tool-head">
      <span class="eyebrow">${PARENT_BRAND}</span>
      <h1>${title}</h1>
    </section>
    <section class="toolbox" style="line-height:1.8;">
      ${content}
    </section>
  `;
}

function setActiveNav() {
  const path = location.pathname;
  document.querySelectorAll("nav a").forEach(a => {
    const href = a.getAttribute("href");
    if (href && (path === href || (href !== "/" && path.startsWith(href)))) {
      a.classList.add("active");
    } else {
      a.classList.remove("active");
    }
  });
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "";
  const path = location.pathname.replace(/^\/+/, "/") || "/";
  let p = path || hash || "/";
  p = p.replace(/\/+$/, "") || "/";

  if (p === "/" || p === "") { home(); setActiveNav(); return; }
  if (p === "/about") { about("about"); return; }
  if (p === "/privacy") { about("privacy"); return; }
  if (p === "/terms") { about("terms"); return; }
  if (p === "/contact") { about("contact"); return; }
  if (p.startsWith("/tools/")) {
    const tid = p.split("/")[2];
    if (tid) { toolPage(tid); return; }
  }
  home();
}

addEventListener("hashchange", route);
addEventListener("popstate", route);
route();

document.addEventListener("click", e => {
  const a = e.target.closest('a[href^="/"]');
  if (!a) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("//") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
  e.preventDefault();
  history.pushState(null, "", href);
  route();
});
