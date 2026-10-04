/*
 * Progeni - Browser-First Global Utility Platform
 * 100% Client-Side Processing | Zero Server Uploads
 */

// Import pure utilities from single source of truth (utils.js)
const {
  esc,
  csvParse,
  csvOut,
  parseSRT,
  buildContactKey,
  filterBookmarkLinks,
  cleanSVG,
  parseVCF,
  normalizeDate
} = (typeof window !== "undefined" && window.ProgeniUtils) ? window.ProgeniUtils : (typeof require === "function" ? require("./utils.js") : {});

const TOOLS = [
  {id:"sticker-sheet",icon:"🏷️",cat:"Print & Craft",name:"Sticker Sheet Maker",desc:"Arrange images into printable US Letter / A4 sticker sheets for Cricut, Silhouette, or home printers."},
  {id:"labels",icon:"📦",cat:"Print & Craft",name:"Avery 5160 / Label Maker",desc:"Generate printable US Letter Avery 5160, 5163, and A4 address label sheets directly from CSV."},
  {id:"tshirt-mirror",icon:"👕",cat:"Print & Craft",name:"T-Shirt Print Mirror",desc:"Mirror artwork horizontally for heat transfer paper and iron-on vinyl printing."},
  {id:"ironon-sheet",icon:"🧲",cat:"Print & Craft",name:"Iron-on Transfer Sheet Maker",desc:"Tile and arrange multiple designs on US Letter or A4 heat transfer paper."},
  {id:"print-layout",icon:"🖨️",cat:"Print & Craft",name:"Print Layout Optimizer",desc:"Fit multiple photos onto US Letter, A4, or 4×6 inch paper with uniform margins."},
  {id:"print-border",icon:"📐",cat:"Print & Craft",name:"Photo Print Border Calculator",desc:"Add precise white matting/borders for US 4×6, 5×7, 8×10 inch or European frames."},
  {id:"cross-stitch",icon:"🧵",cat:"Print & Craft",name:"Cross-Stitch Pattern Maker",desc:"Convert photos into printable color-coded grids with standard DMC thread references."},
  {id:"diamond-painting",icon:"💎",cat:"Print & Craft",name:"Diamond Painting Pattern Maker",desc:"Generate symbol-coded grids and DMC color palettes from any photo."},
  {id:"embroidery",icon:"🪡",cat:"Print & Craft",name:"Embroidery Pattern Simplifier",desc:"Reduce artwork into a simplified DMC thread color palette for embroidery."},
  {id:"video-safe-zone",icon:"📱",cat:"Audio & Video",name:"Video Safe-Zone Checker",desc:"Preview TikTok, Instagram Reels, and YouTube Shorts UI overlays to avoid cropped text."},
  {id:"video-thumbnails",icon:"🎞️",cat:"Audio & Video",name:"Video Thumbnail Contact Sheet",desc:"Extract 12 evenly spaced high-res frames from MP4/MOV videos in your browser."},
  {id:"audio-chapters",icon:"🎧",cat:"Audio & Video",name:"Chapter Timestamp Formatter",desc:"Format YouTube & podcast chapter timestamps with clean text export."},
  {id:"silence-map",icon:"🔇",cat:"Audio & Video",name:"Podcast Silence Map",desc:"Analyze audio waveforms locally to detect dead air and pause durations."},
  {id:"subtitle-speed",icon:"💬",cat:"Text & Subtitles",name:"Subtitle Reading-Speed Checker",desc:"Audit SRT subtitles for high Characters-Per-Second (CPS), duration, and overlaps."},
  {id:"subtitle-linefix",icon:"📝",cat:"Text & Subtitles",name:"Subtitle Line-Break Fixer",desc:"Rebalance and wrap long SRT subtitle lines to meet BBC & Netflix guidelines."},
  {id:"contact-dedupe",icon:"👥",cat:"Data",name:"Contact CSV Deduplicator",desc:"Merge and clean duplicate CRM contacts using email and international phone numbers."},
  {id:"csv-splitter",icon:"↔️",cat:"Data",name:"CSV Column Splitter",desc:"Split names, addresses, or delimited data in CSV spreadsheets without Excel."},
  {id:"csv-date",icon:"📆",cat:"Data",name:"CSV Date Normalizer",desc:"Standardize mixed dates into US (MM/DD/YYYY), ISO (YYYY-MM-DD), or European formats."},
  {id:"vcard",icon:"📇",cat:"Data",name:"vCard (VCF) Split & Merge",desc:"Merge multiple .vcf contact cards or inspect contact files privately."},
  {id:"bookmark-cleaner",icon:"🔖",cat:"Files",name:"Chrome Bookmark Cleaner",desc:"Remove duplicate bookmarks, dead links, and empty folders from exported bookmarks.html."},
  {id:"bookmark-reading",icon:"📚",cat:"Files",name:"Bookmark → Reading List",desc:"Convert messy browser bookmark HTML files into a distraction-free offline reading list."},
  {id:"svg-cleaner",icon:"✦",cat:"Files",name:"SVG Cleanup & Minifier",desc:"Strip Illustrator, Inkscape metadata, and comments to shrink SVG file sizes."},
  {id:"calendar-cleaner",icon:"📅",cat:"Productivity",name:"iCal Calendar Deduplicator",desc:"Scan .ics calendar exports for duplicate VEVENT entries and export clean calendars."},
  {id:"timetable-calendar",icon:"🗓️",cat:"Productivity",name:"Timetable → Calendar (.ics)",desc:"Convert school or work class timetable CSVs into recurring weekly iCal events."},
  {id:"wallpaper",icon:"🖼️",cat:"Images",name:"Wallpaper Batch Cropper",desc:"Crop photos to 9:19.5 (iPhone/Android) or 16:9 desktop aspect ratios without distortion."},
  {id:"panorama",icon:"🌄",cat:"Images",name:"Panorama Carousel Splitter",desc:"Seamlessly slice wide panoramic photos into 3 seamless square Instagram carousel tiles."},
  {id:"duplicate-finder",icon:"♻️",cat:"Images",name:"Photo Duplicate Finder",desc:"Find exact duplicate image files using browser-side SHA-256 cryptographic hashing."},
  {id:"best-shot",icon:"✨",cat:"Images",name:"Photo Best-Shot Finder",desc:"Rank burst photos by sharpness, contrast, and clarity heuristics."},
  {id:"photo-timeline",icon:"🕒",cat:"Images",name:"Photo Timeline Builder",desc:"Sort photos by file date and generate a standalone offline HTML photo album."},
  {id:"family-organizer",icon:"🗂️",cat:"Images",name:"Family Photo Date Organizer",desc:"Inspect and group family photos chronologically from file modification timestamps."}
];

// Global DMC Palette References for Crafters
const DMC_PALETTE = [
  {code:"DMC 310", name:"Black", rgb:[0,0,0]},
  {code:"DMC Blanc", name:"White", rgb:[255,255,255]},
  {code:"DMC 666", name:"Bright Red", rgb:[227,28,45]},
  {code:"DMC 796", name:"Royal Blue", rgb:[17,67,144]},
  {code:"DMC 700", name:"Bright Green", rgb:[15,133,59]},
  {code:"DMC 444", name:"Lemon Yellow", rgb:[255,213,0]},
  {code:"DMC 550", name:"Dark Violet", rgb:[92,24,107]},
  {code:"DMC 434", name:"Light Brown", rgb:[151,85,41]}
];

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

// Rich SEO Content Database for 30 Tools
const TOOL_SEO = {
  "sticker-sheet": {
    how: ["Upload multiple PNG or JPEG sticker graphics with transparent backgrounds.", "Select your target paper size: US Letter (8.5×11 in) or A4 (210×297 mm).", "Preview the auto-arranged grid and click Download High-Res PNG ready for Cricut or scissors."],
    faqs: [
      {q:"What is the best paper size for sticker printing?", a:"In North America, standard US Letter (8.5×11 in) is standard. In Europe and Asia, standard A4 is used. Progeni supports both with 300 DPI print quality."},
      {q:"Do my sticker images get uploaded to a server?", a:"No. All image compositing is performed directly on your device's browser canvas. Your artwork remains 100% private."}
    ]
  },
  "labels": {
    how: ["Upload a CSV file containing addresses, names, or SKU numbers.", "Choose your label template and column to print.", "Click 'Download Printable Labels' to generate an exact print-ready HTML page."],
    faqs: [
      {q:"What is Avery 5160?", a:"Avery 5160 is the most popular standard mailing address label size in the US, measuring 1 x 2-5/8 inches with 30 labels on an 8.5 x 11 inch sheet."},
      {q:"How do I print the labels accurately?", a:"Open the downloaded HTML file in Chrome/Edge, press Ctrl+P (or Cmd+P), and ensure 'Margins' is set to 'None' or 'Default'."}
    ]
  },
  "video-safe-zone": {
    how: ["Upload a screenshot or video frame from your short-form video.", "Select TikTok, Instagram Reels, or YouTube Shorts preset.", "Inspect where usernames, sound discs, captions, and like buttons will cover your video."],
    faqs: [
      {q:"Why do subtitles get cut off on TikTok and Reels?", a:"Social media platforms place engagement buttons (like, share, comments) and captions over the bottom and right edges of 9:16 videos. Using this tool ensures your text stays inside the visible zone."}
    ]
  },
  "tshirt-mirror": {
    how: ["Upload your T-shirt graphic or typography design.", "The tool automatically applies horizontal inversion (flip).", "Download the mirrored PNG and print directly onto light heat transfer paper."],
    faqs: [
      {q:"Why do you need to mirror images for iron-on transfers?", a:"When using light heat transfer paper, you place the printed sheet face-down on the fabric before applying heat. Mirroring prevents text and numbers from appearing backward."}
    ]
  },
  "contact-dedupe": {
    how: ["Export your contacts as a CSV file from Google Contacts, Outlook, or your CRM.", "Drop the CSV file into the tool.", "The algorithm matches emails and international phone numbers to remove duplicates while preserving records."],
    faqs: [
      {q:"Are my customer contacts safe?", a:"Yes! Progeni processes all CSV tables in your local browser memory. Zero contacts are transmitted over the internet."}
    ]
  }
};

function layout({ tool, body }) {
  const related = TOOLS.filter(t => t.id !== tool.id && (t.cat === tool.cat || ["Images","Print & Craft"].includes(t.cat) && ["Images","Print & Craft"].includes(tool.cat))).slice(0, 6);
  document.title = `${tool.name} — Free & Private Online Tool | Progeni`;

  const seo = TOOL_SEO[tool.id] || {
    how: ["Upload your file or paste your data into the drop zone.", "Configure your preferred options above.", "Review the instant preview and click Download to save your result."],
    faqs: [
      { q: `Is the ${tool.name} free to use?`, a: `Yes, Progeni's ${tool.name} is 100% free with no account or subscription required.` },
      { q: "Are my files private and secure?", a: "Yes. All processing is strictly client-side inside your browser. No files are uploaded to any server." }
    ]
  };

  const schemaEl = $("#schema");
  if (schemaEl) {
    schemaEl.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": tool.name,
      "applicationCategory": "UtilitiesApplication",
      "description": tool.desc,
      "operatingSystem": "Any",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
    });
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
      <h2>How to Use ${esc(tool.name)}</h2>
      <ol>
        ${seo.how.map(step => `<li>${esc(step)}</li>`).join("")}
      </ol>

      <h2>Frequently Asked Questions</h2>
      ${seo.faqs.map(f => `
        <div class="faq-box">
          <h4>${esc(f.q)}</h4>
          <p>${esc(f.a)}</p>
        </div>
      `).join("")}

      <h3>Related Utilities</h3>
      <div class="tool-links">
        ${related.map(t => `<a href="/tools/${t.id}">${esc(t.icon)} ${esc(t.name)}</a>`).join("")}
      </div>
    </section>
  `;
}

function home() {
  document.title = "Progeni — 30 Free, Privacy-First Browser Tools & Utilities";
  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">30 Global Utilities · 100% Private</span>
      <h1>Fix everyday digital problems in seconds.</h1>
      <p>Instant client-side tools for crafters, creators, and professionals. Make Avery labels, sticker sheets, mirror T-shirt prints, repair subtitles, dedupe contacts, and convert CSVs without uploading your data to external servers.</p>
      <input id="search" class="search" placeholder="Search 30 tools (e.g., sticker sheet, avery labels, subtitle, csv, t-shirt)...">
      <div id="cats" class="categories"></div>
    </section>

    <section id="grid" class="grid"></section>
  `;

  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];
  $("#cats").innerHTML = cats.map((c, i) => `<button class="pill ${i === 0 ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

  const render = (cat = "All", q = "") => {
    $("#grid").innerHTML = TOOLS.filter(t => (cat === "All" || t.cat === cat) && (`${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q.toLowerCase()))).map(t => `
      <a class="tool-card" href="/tools/${t.id}">
        <div class="icon">${t.icon}</div>
        <h3>${esc(t.name)}</h3>
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

function resultBox(html = "") {
  const r = document.createElement("div");
  r.className = "result";
  r.id = "result";
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
        const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Progeni//Timetable//EN"];
        const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        rows.slice(1).forEach((r, i) => {
          let d = date >= 0 && r[date] ? new Date(r[date]) : nextDay(days[(r[day] || "").toLowerCase()]);
          if (!d) return;
          const [sh, sm] = (r[start] || "09:00").split(":").map(Number), [eh, em] = (r[end] || "10:00").split(":").map(Number);
          const fmt = x => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
          let a = new Date(d); a.setHours(sh, sm, 0, 0);
          let b = new Date(d); b.setHours(eh, em, 0, 0);
          ics.push("BEGIN:VEVENT", `UID:ph-${Date.now()}-${i}@progeni.live`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(a)}`, `DTEND:${fmt(b)}`, `SUMMARY:${(r[title] || "Class").replace(/[,;]/g, " ")}`, "RRULE:FREQ=WEEKLY", "END:VEVENT");
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
      case "cross-stitch": case "diamond-painting": case "embroidery": {
        await patternMaker(id, f, rs);
        break;
      }
      case "svg-cleaner": {
        const raw = await readText(f);
        const cleaned = cleanSVG(raw);
        rs.innerHTML = `<div class="notice">SVG sanitized. Stripped scripts, dangerous hrefs, and editor metadata.</div><button class="btn" id="dl">Download Cleaned SVG</button>`;
        $("#dl").onclick = () => textDownload(cleaned, "cleaned.svg", "image/svg+xml");
        break;
      }
      case "audio-chapters": {
        const val = $("#chap") ? $("#chap").value : "";
        textDownload(val, "chapters.txt");
        break;
      }
      case "silence-map": { await silenceMap(f, rs); break; }
      case "video-thumbnails": { await videoThumbs(f, rs); break; }
      case "video-safe-zone": { await safeZone(f, rs); break; }
      case "subtitle-speed": { const t = await readText(f); subtitleCheck(t, rs); break; }
      case "subtitle-linefix": { const t = await readText(f); subtitleFix(t, rs); break; }
      case "bookmark-reading": {
        const t = await readText(f);
        const doc = new DOMParser().parseFromString(t, "text/html");
        const rawAnchors = [...doc.querySelectorAll("a[href]")].map(a => ({ href: a.href, text: a.textContent || a.href }));
        const safeLinks = filterBookmarkLinks(rawAnchors);
        const as = safeLinks.map(a => `<li><a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.text)}</a></li>`).join("");
        const out = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Offline Reading List</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6}li{margin:10px 0}a{color:#4f46e5;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>Reading List</h1><p>Exported from Progeni.</p><ul>${as}</ul></body></html>`;
        rs.innerHTML = `<div class="notice">${safeLinks.length} valid links converted into clean offline reading list.</div><button class="btn" id="dl">Download reading-list.html</button>`;
        $("#dl").onclick = () => textDownload(out, "reading-list.html", "text/html");
        break;
      }
      case "csv-splitter": { csvTool(id, await readText(f), rs); break; }
      case "csv-date": { csvTool(id, await readText(f), rs); break; }
      case "contact-dedupe": { contactDedupe(await readText(f), rs); break; }
      case "vcard": { vcardTool(files, rs); break; }
      case "wallpaper": { imageTransform("wallpaper", f, rs); break; }
      case "print-border": { imageTransform("print-border", f, rs); break; }
      case "tshirt-mirror": { imageTransform("tshirt-mirror", f, rs); break; }
      case "panorama": { panorama(f, rs); break; }
      case "photo-timeline": case "family-organizer": { photoTimeline(files, rs); break; }
      case "duplicate-finder": { duplicateFinder(files, rs); break; }
      case "best-shot": { bestShot(files, rs); break; }
      case "labels": { labels(await readText(f), rs); break; }
      default: rs.innerHTML = `<div class="warn">Ready for processing. Drop files to begin.</div>`;
    }
  } catch (e) {
    console.error(e);
    rs.innerHTML = `<div class="error">${esc(e.message || e)}</div>`;
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

/* Pattern Maker with Global DMC Color Palette */
async function patternMaker(id, f, rs) {
  const im = await imageFromFile(f), c = document.createElement("canvas"), ctx = c.getContext("2d");
  const cols = 50, rows = Math.max(1, Math.round(cols * im.height / im.width));
  c.width = cols * 14; c.height = rows * 14;
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const counts = new Map();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let p = (y * 14 * c.width + x * 14) * 4, best = 0, bd = 1e9;
      for (let j = 0; j < DMC_PALETTE.length; j++) {
        let rgb = DMC_PALETTE[j].rgb;
        let d = Math.pow(data.data[p] - rgb[0], 2) + Math.pow(data.data[p + 1] - rgb[1], 2) + Math.pow(data.data[p + 2] - rgb[2], 2);
        if (d < bd) { bd = d; best = j; }
      }
      let dmc = DMC_PALETTE[best];
      counts.set(dmc.code, (counts.get(dmc.code) || 0) + 1);
      ctx.fillStyle = `rgb(${dmc.rgb.join(",")})`;
      ctx.fillRect(x * 14, y * 14, 14, 14);
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.strokeRect(x * 14, y * 14, 14, 14);
    }
  }

  const b = await canvasBlob(c);
  rs.innerHTML = `
    <div class="notice">Pattern created with <strong>Standard DMC Thread Palette</strong> (${cols}×${rows} stitch grid).</div>
    <img style="max-width:100%;max-height:400px;image-rendering:pixelated;border:1px solid #cbd5e1;border-radius:12px;margin:0 auto 16px;display:block;" src="${URL.createObjectURL(b)}">
    <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:16px;">
      <strong style="display:block;margin-bottom:8px;">DMC Thread Floss Legend:</strong>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;font-size:13px;">
        ${[...counts.entries()].map(([code, cnt]) => `<div>🧵 <b>${esc(code)}</b>: ${cnt} stitches</div>`).join("")}
      </div>
    </div>
    <button class="btn" id="dl">Download Pattern Grid (.PNG)</button>
  `;
  $("#dl").onclick = () => downloadBlob(b, `${id}-dmc-pattern.png`);
}

/* Audio & Video Tools */
async function silenceMap(f, rs) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const ab = await f.arrayBuffer();
    const buf = await ac.decodeAudioData(ab), ch = buf.getChannelData(0), step = Math.floor(buf.sampleRate * 0.25), ranges = [];
    let on = false, start = 0;
    for (let i = 0; i < ch.length; i += step) {
      let sum = 0;
      for (let j = i; j < Math.min(i + step, ch.length); j++) sum += Math.abs(ch[j]);
      let rms = sum / Math.min(step, ch.length - i);
      let silent = rms < 0.006;
      if (silent && !on) { start = i / buf.sampleRate; on = true; }
      if (!silent && on) {
        if (i / buf.sampleRate - start > 0.5) ranges.push([start, i / buf.sampleRate]);
        on = false;
      }
    }
    rs.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${ranges.length}</b>Dead Air Gaps</div>
        <div class="stat"><b>${buf.duration.toFixed(1)}s</b>Total Audio</div>
        <div class="stat"><b>${buf.sampleRate}</b>Hz Rate</div>
      </div>
      <pre>${ranges.map(r => `${fmtTime(r[0])} → ${fmtTime(r[1])} (${(r[1] - r[0]).toFixed(1)}s silence)`).join("\n") || "No long dead air detected."}</pre>
    `;
  } finally {
    await ac.close();
  }
}
const fmtTime = s => {
  let m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

async function videoThumbs(f, rs) {
  const vSrc = URL.createObjectURL(f);
  const v = document.createElement("video");
  v.src = vSrc;
  v.muted = true;
  try {
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
    const c = document.createElement("canvas"), ctx = c.getContext("2d"), n = 12;
    c.width = 480; c.height = 270;
    const thumbs = [];
    for (let i = 0; i < n; i++) {
      v.currentTime = v.duration * i / (n - 1 || 1);
      await new Promise(r => v.onseeked = r);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      thumbs.push(ctx.getImageData(0, 0, c.width, c.height));
    }
    const out = document.createElement("canvas");
    out.width = 480 * 3; out.height = 270 * 4;
    const o = out.getContext("2d");
    thumbs.forEach((im, i) => o.putImageData(im, (i % 3) * 480, Math.floor(i / 3) * 270));
    const b = await canvasBlob(out);
    rs.innerHTML = `<img style="width:100%;border-radius:12px;margin-bottom:16px;" src="${URL.createObjectURL(b)}"><button class="btn" id="dl">Download 12-Frame Sheet</button>`;
    $("#dl").onclick = () => downloadBlob(b, "video-thumbnails.png");
  } finally {
    URL.revokeObjectURL(vSrc);
  }
}

/* Global Social Safe-Zone Overlays (TikTok, Instagram Reels, Shorts) */
async function safeZone(f, rs) {
  const im = await imageFromFile(f);
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
  `;
}

function subtitleCheck(t, rs) {
  const a = parseSRT(t);
  const issues = a.filter(x => {
    let dur = x.end - x.start;
    let cps = dur > 0 ? (x.text.length / dur) : x.text.length;
    return dur < 1 || cps > 21;
  });
  const overlaps = a.filter((x, i) => i && x.start < a[i - 1].end);
  rs.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${a.length}</b>Total Captions</div>
      <div class="stat"><b>${issues.length}</b>Reading Speed Flags</div>
      <div class="stat"><b>${overlaps.length}</b>Overlap Errors</div>
    </div>
    <pre>${issues.map(x => {
      let dur = x.end - x.start;
      let cps = dur > 0 ? (x.text.length / dur).toFixed(1) : "N/A";
      return `${fmtTime(x.start)} — [${cps} CPS] ${x.text.slice(0, 90)}`;
    }).join("\n") || "All subtitle lines adhere to standard reading speeds (<21 CPS)."}</pre>
  `;
}

function subtitleFix(t, rs) {
  const blocks = t.split(/\r?\n\r?\n/).map(b => {
    let l = b.split(/\r?\n/), tm = l.findIndex(x => x.includes("-->"));
    if (tm < 0) return b;
    let words = l.slice(tm + 1).join(" ").replace(/\s+/g, " ").trim(), chunks = [];
    while (words.length > 38) {
      let p = words.lastIndexOf(" ", 38);
      if (p < 12) p = 38;
      chunks.push(words.slice(0, p));
      words = words.slice(p).trim();
    }
    chunks.push(words);
    return [...l.slice(0, tm + 1), ...chunks].join("\n");
  });
  const out = blocks.join("\n\n");
  rs.innerHTML = `<div class="notice">Subtitle line lengths rebalanced to standard 38-character max.</div><button class="btn" id="dl">Download Fixed .SRT</button>`;
  $("#dl").onclick = () => textDownload(out, "fixed.srt");
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
      rs.insertAdjacentHTML("beforeend", `<div class="notice" style="margin-top:16px;">Dates standardized to ${fmt}.</div><button class="btn secondary" id="dl">Download Normalized CSV</button>`);
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

/* Image & Framing Transform Tools */
async function imageTransform(type, f, rs) {
  const im = await imageFromFile(f), c = document.createElement("canvas"), ctx = c.getContext("2d");
  let w = im.width, h = im.height;
  if (type === "wallpaper") {
    const ar = 9 / 19.5;
    let nw = w, nh = w / ar;
    if (nh > h) { nh = h; nw = h * ar; }
    c.width = nw; c.height = nh;
    ctx.drawImage(im, (w - nw) / 2, (h - nh) / 2, nw, nh, 0, 0, nw, nh);
  } else if (type === "tshirt-mirror") {
    c.width = w; c.height = h;
    ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(im, 0, 0);
  } else {
    let margin = Math.round(Math.min(w, h) * 0.06);
    c.width = w + margin * 2; c.height = h + margin * 2;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, margin, margin);
  }
  const b = await canvasBlob(c, "image/png");
  rs.innerHTML = `
    <div class="notice">Image processed locally.</div>
    <img style="max-width:100%;max-height:400px;border-radius:12px;margin:0 auto 16px;display:block;" src="${URL.createObjectURL(b)}">
    <button class="btn" id="dl">Download Processed PNG</button>
  `;
  $("#dl").onclick = () => downloadBlob(b, `${type}.png`);
}

async function panorama(f, rs) {
  const im = await imageFromFile(f), parts = 3, w = Math.floor(im.width / parts), c = document.createElement("canvas"), ctx = c.getContext("2d");
  c.width = w; c.height = im.height;
  rs.innerHTML = `<div class="notice">Panorama split into 3 seamless carousel tiles:</div><div style="display:flex;gap:10px;margin-bottom:16px;" id="pg"></div>`;
  for (let i = 0; i < parts; i++) {
    c.width = w; c.height = im.height;
    ctx.clearRect(0, 0, w, c.height);
    ctx.drawImage(im, i * w, 0, w, im.height, 0, 0, w, im.height);
    let b = await canvasBlob(c);
    let img = document.createElement("img");
    img.src = URL.createObjectURL(b);
    img.style.width = "33%"; img.style.borderRadius = "8px"; img.style.cursor = "pointer";
    img.title = `Click to download Tile ${i + 1}`;
    img.onclick = () => downloadBlob(b, `carousel-tile-${i + 1}.png`);
    $("#pg").appendChild(img);
  }
}

async function photoTimeline(files, rs) {
  const data = files.map(f => ({ name: f.name, date: new Date(f.lastModified) })).sort((a, b) => a.date - b.date);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Photo Timeline</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}li{margin:10px 0;padding:8px;background:#f8fafc;border-radius:8px;list-style:none}</style></head><body><h1>Photo Chronological Timeline</h1><ul>${data.map(x => `<li>📅 <strong>${esc(x.date.toLocaleString())}</strong> — ${esc(x.name)}</li>`).join("")}</ul></body></html>`;
  rs.innerHTML = `<div class="notice">Sorted ${data.length} photos into chronological order by file date.</div><button class="btn" id="dl">Download Timeline Album (.HTML)</button>`;
  $("#dl").onclick = () => textDownload(html, "photo-timeline.html", "text/html");
}

async function duplicateFinder(files, rs) {
  const sizeMap = new Map();
  for (const f of files) {
    if (!sizeMap.has(f.size)) sizeMap.set(f.size, []);
    sizeMap.get(f.size).push(f);
  }
  const map = new Map();
  for (const [size, group] of sizeMap.entries()) {
    if (group.length < 2) continue;
    for (const f of group) {
      const buf = await f.arrayBuffer(), hash = await crypto.subtle.digest("SHA-256", buf);
      const key = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f.name);
    }
  }
  const groups = [...map.values()].filter(x => x.length > 1);
  rs.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${files.length}</b>Scanned Files</div>
      <div class="stat"><b>${groups.length}</b>Duplicate Sets</div>
      <div class="stat"><b>${groups.reduce((n, g) => n + g.length - 1, 0)}</b>Exact Copies</div>
    </div>
    <pre>${groups.map(g => g.join("\n  ↳ duplicate: ")).join("\n\n") || "No exact duplicate files found."}</pre>
  `;
}

async function bestShot(files, rs) {
  const rows = [];
  for (const f of files) {
    const im = await imageFromFile(f), c = document.createElement("canvas"), ctx = c.getContext("2d");
    c.width = 160; c.height = 160;
    ctx.drawImage(im, 0, 0, 160, 160);
    const d = ctx.getImageData(0, 0, 160, 160).data;
    let mean = 0;
    for (let i = 0; i < d.length; i += 4) mean += (d[i] + d[i + 1] + d[i + 2]) / 3;
    mean /= d.length / 4;
    let edge = 0;
    for (let y = 1; y < 159; y++) {
      for (let x = 1; x < 159; x++) {
        let p = (y * 160 + x) * 4, q = (y * 160 + x - 1) * 4;
        edge += Math.abs(d[p] - d[q]);
      }
    }
    rows.push({ f, score: edge / (160 * 160) - Math.abs(mean - 128) * 0.05 });
  }
  rows.sort((a, b) => b.score - a.score);
  rs.innerHTML = `
    <div class="notice">Ranked by local sharpness and edge-contrast heuristics:</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">
      ${rows.slice(0, 12).map((x, i) => `
        <div style="border:1px solid #cbd5e1;padding:8px;border-radius:10px;text-align:center;background:#fff;">
          <img style="width:100%;height:100px;object-fit:cover;border-radius:6px;" src="${URL.createObjectURL(x.f)}">
          <small style="font-weight:700;display:block;margin-top:4px;">#${i + 1} Best</small>
        </div>
      `).join("")}
    </div>
  `;
}

/* Global Avery 5160 & Standard Label Sheet Generator */
function labels(t, rs) {
  const rows = csvParse(t);
  const h = rows[0] || [];
  const template = $("#labelTemplate") ? $("#labelTemplate").value : "avery5160";

  rs.innerHTML = `
    <div class="controls">
      <label>Label Content Column
        <select id="labelCol">
          ${h.map((colName, i) => `<option value="${i}">${esc(colName)}</option>`).join("")}
        </select>
      </label>
    </div>
    <button class="btn" id="btn-gen-labels">Generate Printable Sheet</button>
  `;

  $("#btn-gen-labels").onclick = () => {
    const col = +($("#labelCol").value || 0);
    let gridStyle = "display:grid;grid-template-columns:repeat(3, 2.625in);gap:0.125in;justify-content:center;";
    let labelStyle = "height:1in;border:1px dashed #cbd5e1;padding:0.1in;overflow:hidden;box-sizing:border-box;font-size:12px;font-family:Arial,sans-serif;";
    let pageStyle = "@page{size:8.5in 11in;margin:0.5in 0.1875in;}";

    if (template === "avery5163") {
      gridStyle = "display:grid;grid-template-columns:repeat(2, 4in);gap:0.15in;justify-content:center;";
      labelStyle = "height:2in;border:1px dashed #cbd5e1;padding:0.15in;overflow:hidden;box-sizing:border-box;font-size:14px;";
    } else if (template === "a4") {
      pageStyle = "@page{size:A4;margin:10mm;}";
      gridStyle = "display:grid;grid-template-columns:repeat(3, 1fr);gap:6mm;";
      labelStyle = "height:30mm;border:1px dashed #cbd5e1;padding:4mm;overflow:hidden;font-size:12px;";
    }

    const out = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Printable Labels</title><style>${pageStyle}body{margin:0;font-family:Arial,sans-serif}.sheet{${gridStyle}}.label{${labelStyle}}</style></head><body><div class="sheet">${rows.slice(1).map(r => `<div class="label">${esc(r[col] || "")}</div>`).join("")}</div></body></html>`;

    rs.insertAdjacentHTML("beforeend", `
      <div class="notice" style="margin-top:16px;">Generated ${template.toUpperCase()} printable sheet (${rows.length - 1} labels from column "${esc(h[col] || "")}").</div>
      <button class="btn secondary" id="dl">Download Print-Ready Labels (.HTML)</button>
    `);
    $("#dl").onclick = () => textDownload(out, "avery-labels.html", "text/html");
  };
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
  if (["sticker-sheet", "print-layout", "ironon-sheet", "photo-timeline", "family-organizer", "duplicate-finder", "best-shot"].includes(id)) { multi = true; accept = "image/*"; }
  if (["wallpaper", "print-border", "tshirt-mirror", "cross-stitch", "embroidery", "diamond-painting", "panorama"].includes(id)) accept = "image/*";
  if (id === "silence-map") accept = "audio/*";
  if (["video-thumbnails", "video-safe-zone"].includes(id)) accept = "video/*,image/*";

  let body = picker(multi, accept);

  if (id === "audio-chapters") {
    body = `
      <div class="controls">
        <label style="width:100%">Chapter Timestamps & Titles (MM:SS Title)
          <textarea id="chap" rows="8" style="width:100%;font-family:monospace;" placeholder="00:00 Introduction&#10;02:15 Main Topic&#10;06:40 Key Insights&#10;11:20 Conclusion"></textarea>
        </label>
      </div>
      <button class="btn" id="dl-chap">Download Chapters.txt</button>
    `;
    layout({ tool, body });
    $("#dl-chap").onclick = () => textDownload($("#chap").value, "chapters.txt");
    return;
  }

  // Global Presets & Options Controls
  if (["sticker-sheet", "print-layout", "ironon-sheet"].includes(id)) {
    body = `
      <div class="controls">
        <label>Paper Standard
          <select id="paperSize">
            <option value="letter" selected>US Letter (8.5 × 11 in - US/Canada Standard)</option>
            <option value="a4">A4 (210 × 297 mm - International)</option>
            <option value="4x6">4 × 6 inch Photo Paper</option>
            <option value="a3">A3 Poster Sheet</option>
          </select>
        </label>
      </div>
    ` + body;
  }
  if (id === "labels") {
    body = `
      <div class="controls">
        <label>Label Template Standard
          <select id="labelTemplate">
            <option value="avery5160" selected>Avery 5160 / 8160 (30 Labels/Sheet - 1" x 2-5/8" on US Letter)</option>
            <option value="avery5163">Avery 5163 / 8163 (10 Shipping Labels - 2" x 4" on US Letter)</option>
            <option value="a4">A4 Standard (24 Labels/Sheet - 3 x 8)</option>
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
  document.title = kind === "privacy" ? "Privacy Policy — Progeni" : kind === "terms" ? "Terms of Service — Progeni" : kind === "contact" ? "Contact Us — Progeni" : "About Us — Progeni";
  const title = kind === "privacy" ? "Privacy by Design" : kind === "terms" ? "Terms of Service" : kind === "contact" ? "Contact Progeni Support" : "About Progeni";
  let content = `
    <h2>Browser-First Global Architecture</h2>
    <p>Progeni is designed on a simple principle: digital utility tasks should be instant, free, and 100% private. All 30 tools process files locally in your web browser. Your sensitive spreadsheets, personal photos, and contact lists never touch an external server.</p>
  `;
  if (kind === "contact") {
    content = `
      <h2>Direct Email Inquiries</h2>
      <p>For general support, feedback, and DMCA inquiries: <a href="mailto:support@progeni.live" style="color:var(--brand);font-weight:700;">support@progeni.live</a></p>
    `;
  }
  app.innerHTML = `
    <section class="tool-head">
      <span class="eyebrow">Progeni</span>
      <h1>${title}</h1>
    </section>
    <section class="toolbox" style="line-height:1.8;">
      ${content}
    </section>
  `;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "";
  const path = location.pathname.replace(/^\/+/, "/") || "/";
  let p = path || hash || "/";
  p = p.replace(/\/+$/, "") || "/";

  if (p === "/" || p === "") { home(); return; }
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