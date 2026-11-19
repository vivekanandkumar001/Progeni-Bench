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

// Icon set: same Lucide-derived inline SVGs the static builders use.
const benchIcons = (typeof window !== "undefined" && window.BenchIcons)
  ? window.BenchIcons
  : (typeof require === "function" ? require("./icons.js") : null);
const benchIcon = (name, className) => benchIcons ? benchIcons.svgIcon(name, className) : "";
const benchToolIcon = (group, id, emoji) => benchIcons ? benchIcons.toolIcon(group, id, emoji) : "";

// Global DMC Palette References for Crafters
// (The shared DMC floss table now lives in data/dmc.js — loaded as window.DMC_PALETTE
// and consumed by pattern-studio.js for the cross-stitch / diamond / embroidery tools.)

/*
 * Lazily load the studio engine scripts. The home page (and every non-tool page)
 * only pulls in site.config.js / utils.js / app.js, but the SPA router re-renders
 * tool pages client-side. Without this loader, clicking a tool link from the home
 * page would hit `window.StickerStudio.mount` while the studio global is undefined.
 */
const STUDIO_SCRIPTS = {
  sticker: "/sticker-studio.js",
  label: "/label-studio.js",
  sheet: "/sheet-studio.js",
  pattern: "/pattern-studio.js",
  image: "/image-studio.js",
  photobatch: "/photo-batch-studio.js",
  album: "/album-studio.js",
  media: "/media-studio.js",
  subtitle: "/subtitle-studio.js",
  dmc: "/data/dmc.js"
};
const loadedScripts = new Map();
let pdfRouteToken = 0;
let pdfManagerRouteToken = 0;

function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);
  // Already present in the document (studio pages preload all engines).
  if (document.querySelector(`script[src="${src}"]`)) {
    const done = Promise.resolve();
    loadedScripts.set(src, done);
    return done;
  }
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  loadedScripts.set(src, p);
  return p;
}

async function ensureStudios(...keys) {
  // Sequential on purpose: some engines read globals defined by an earlier one at
  // module-evaluation time (e.g. pattern-studio.js reads window.DMC_PALETTE from
  // data/dmc.js). Promise.all would race those two and intermittently break the
  // pattern tool. Load in order and await each before the next.
  for (const k of keys) {
    await loadScript(STUDIO_SCRIPTS[k]);
  }
}

/*
 * Bench Image Toolkit is lazy-loaded too. Only visitors entering /image/* pay
 * for the registry and runtime; the rest of the site keeps its small payload.
 * The registry must load before the runtime so image-toolkit.js can read
 * window.ImageToolConfig at module-evaluation time.
 */
const IMAGE_SCRIPTS = {
  config: "/image-tools.config.js",
  toolkit: "/image-toolkit.js"
};
let imageLoadPromise = null;
let imageRouteToken = 0;

function ensureImageToolkit() {
  if (typeof window !== "undefined" && window.ImageToolkit) return Promise.resolve(window.ImageToolkit);
  if (!imageLoadPromise) {
    imageLoadPromise = loadScript(IMAGE_SCRIPTS.config)
      .then(() => loadScript(IMAGE_SCRIPTS.toolkit))
      .then(() => {
        if (!window.ImageToolkit) throw new Error("The image toolkit did not initialise.");
        return window.ImageToolkit;
      })
      .catch(err => {
        imageLoadPromise = null;
        throw err;
      });
  }
  return imageLoadPromise;
}

function leaveImageToolkit() {
  imageRouteToken++;
  if (typeof window !== "undefined" && window.ImageToolkit && typeof window.ImageToolkit.unmount === "function") {
    window.ImageToolkit.unmount();
  }
}

async function mountImageRoute(kind, slug) {
  const token = ++imageRouteToken;
  const pathAtStart = location.pathname;
  const target = $("#app");
  try {
    const toolkit = await ensureImageToolkit();
    if (token !== imageRouteToken || location.pathname !== pathAtStart) return;
    if (kind === "studio") toolkit.mountStudio();
    else if (kind === "hub") toolkit.mountHub();
    else toolkit.mountTool(slug);
    setActiveNav();
  } catch (err) {
    if (token !== imageRouteToken) return;
    if (target) {
      target.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Image Toolkit</span><h1>Image toolkit could not load</h1><p>' +
        esc(err && err.message ? err.message : String(err)) +
        '</p><p><a class="btn" href="/image/">Try the image toolkit again</a> <a class="btn secondary" href="/">Return to all tools</a></p></section>';
    }
  }
}

/*
 * Bench Audio Toolkit is lazy-loaded on /audio/* only, exactly like the image
 * toolkit. The registry must evaluate before the runtime so audio-toolkit.js
 * can read window.AudioToolConfig at module-evaluation time.
 */
const AUDIO_SCRIPTS = {
  config: "/audio-tools.config.js",
  toolkit: "/audio-toolkit.js"
};
let audioLoadPromise = null;
let audioRouteToken = 0;

function ensureAudioToolkit() {
  if (typeof window !== "undefined" && window.AudioToolkit) return Promise.resolve(window.AudioToolkit);
  if (!audioLoadPromise) {
    audioLoadPromise = loadScript(AUDIO_SCRIPTS.config)
      .then(() => loadScript(AUDIO_SCRIPTS.toolkit))
      .then(() => {
        if (!window.AudioToolkit) throw new Error("The audio toolkit did not initialise.");
        return window.AudioToolkit;
      })
      .catch(err => {
        audioLoadPromise = null;
        throw err;
      });
  }
  return audioLoadPromise;
}

function leaveAudioToolkit() {
  audioRouteToken++;
  if (typeof window !== "undefined" && window.AudioToolkit && typeof window.AudioToolkit.unmount === "function") {
    window.AudioToolkit.unmount();
  }
}

async function mountAudioRoute(kind, slug) {
  const token = ++audioRouteToken;
  const pathAtStart = location.pathname;
  const target = $("#app");
  try {
    const toolkit = await ensureAudioToolkit();
    if (token !== audioRouteToken || location.pathname !== pathAtStart) return;
    if (kind === "studio") toolkit.mountStudio();
    else if (kind === "hub") toolkit.mountHub();
    else toolkit.mountTool(slug);
    setActiveNav();
  } catch (err) {
    if (token !== audioRouteToken) return;
    if (target) {
      target.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Audio Toolkit</span><h1>Audio toolkit could not load</h1><p>' +
        esc(err && err.message ? err.message : String(err)) +
        '</p><p><a class="btn" href="/audio/">Try the audio toolkit again</a> <a class="btn secondary" href="/">Return to all tools</a></p></section>';
    }
  }
}

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
  const hasTranslationBackend = tool.id === "pdf-translator";

  // Release any object URLs from the previous tool view before we replace #app.
  if (app) revokeResultURLs(app);

  let pageTitle = `${tool.name}: Free Online, No Upload | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = `${tool.name}: Free Online | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = `${tool.name} | ${SITE_NAME}`;
  if (pageTitle.length > 60) pageTitle = tool.name.slice(0, 60);
  document.title = pageTitle;

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.href = `${SITE_URL}/tools/${tool.id}/`;
  }

  const faqList = (tool.faq && tool.faq.length) ? tool.faq : [];
  const useCasesList = (tool.useCases && tool.useCases.length) ? tool.useCases : [];
  const answerFirst = String(tool.whatItDoes || tool.desc || "").replace(/<[^>]*>/g, " ");
  const answerMatch = answerFirst.match(/^.*?[.!?](?=\s|$)/);
  const answerSentence = (answerMatch ? answerMatch[0] : answerFirst).trim();
  const quickFacts = [
    ["Cost", "Free · no account needed"],
    ["Runs", hasTranslationBackend ? "PDF pages local, extracted text translated by DeepL" : "Entirely in your browser"],
    ["Uploads", hasTranslationBackend ? "PDF pages stay local; extracted text is sent to DeepL" : "No file uploads"],
    ["Works on", "Modern desktop, tablet and mobile browsers"]
  ];
  if (useCasesList.length) quickFacts.push(["Best for", useCasesList[0]]);

  app.innerHTML = `
    <nav class="tool-breadcrumb" aria-label="Breadcrumb">
      <a href="/">All tools</a><span aria-hidden="true">/</span><span class="tool-breadcrumb-cat">${esc(tool.cat)}</span><span aria-hidden="true">/</span><span aria-current="page">${esc(tool.name)}</span>
    </nav>
    <div class="tool-shell">
      <section class="tool-head">
        <span class="eyebrow">${esc(tool.cat)} · ${hasTranslationBackend ? "Local PDF processing · provider-backed translation" : "100% Private Client-Side"}</span>
        <h1><span class="tool-head-icon" data-icon="${esc(benchIcons ? benchIcons.iconName("core", tool.id, tool.icon) : "")}" aria-hidden="true">${benchToolIcon("core", tool.id, tool.icon)}</span>${esc(tool.keyword || tool.name)}</h1>
        <p>${esc(tool.desc)} ${hasTranslationBackend
          ? "<strong>PDF pages stay in your browser.</strong> Extracted text is sent to DeepL through a server-side endpoint."
          : "<strong>Zero server uploads</strong> — all processing happens directly in your browser."}</p>
      </section>

      <aside class="quick-answer quick-answer--rail" id="quick-answer" aria-labelledby="quick-answer-title">
        <h2 id="quick-answer-title">At a glance</h2>
        <p class="answer-text"><strong>${esc(tool.name)}</strong> is a free ${esc(String(tool.cat).toLowerCase())} tool that runs in your browser. ${esc(answerSentence)}</p>
        <dl class="key-facts">
          ${quickFacts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
        </dl>
      </aside>
    </div>

    <section class="toolbox">${body}</section>

    <details class="tool-details" id="tool-details">
      <summary>About this tool — how it works, limits &amp; FAQ
        <svg class="tool-details-chev" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </summary>
      <div class="tool-details-body">
        <h2>What it does</h2>
        <p>${esc(tool.whatItDoes || tool.desc)}</p>

        ${useCasesList.length > 0 ? `
        <h2>Common use cases</h2>
        <ul>
          ${useCasesList.map(u => `<li>${esc(u)}</li>`).join("")}
        </ul>
        ` : ""}

        <h2>How to use</h2>
        <ol>
          ${(tool.howToUse || []).map(step => `<li>${esc(step)}</li>`).join("")}
        </ol>

      <h2>Limits &amp; considerations</h2>
      <p>${esc(tool.limits || "Processes standard files client-side.")}</p>

      ${faqList.length > 0 ? `
      <h2>Frequently asked questions</h2>
      <div class="faq-list">
        ${faqList.map(f => `<div class="faq-item"><strong>${esc(f.q)}</strong><p>${esc(f.a)}</p></div>`).join("")}
      </div>
      ` : ""}

      <h2>Privacy &amp; security</h2>
      <p>${esc(tool.privacy || "Processed locally in your browser.")}</p>

      <h2>Related ${esc(tool.cat)} tools</h2>
      <div class="tool-links">
        ${related.map(t => `<a href="/tools/${t.id}/">${benchToolIcon("core", t.id, t.icon)} ${esc(t.name)}</a>`).join("")}
      </div>
      </div>
    </details>
  `;
}

function picker(multiple = false, accept = "*/*") {
  return `<div class="drop" id="drop" role="button" tabindex="0">
    <strong>Drop ${multiple ? "files" : "a file"} here</strong>
    <span>or click to browse from device</span>
    <input id="file" type="file" ${multiple ? "multiple" : ""} accept="${accept}" hidden>
  </div>`;
}

function bindPicker(cb) {
  const d = $("#drop"), f = $("#file");
  if (!d || !f) return;
  const fire = files => {
    if (!files || !files.length) return;
    try {
      const r = cb(files);
      if (r && typeof r.catch === "function") r.catch(err => console.error(err));
    } catch (err) {
      console.error(err);
    }
  };
  d.onclick = () => f.click();
  d.onkeydown = e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f.click(); }
  };
  ["dragenter", "dragover"].forEach(x => d.addEventListener(x, e => { e.preventDefault(); d.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(x => d.addEventListener(x, e => { e.preventDefault(); d.classList.remove("drag"); }));
  d.addEventListener("drop", e => fire([...(e.dataTransfer ? e.dataTransfer.files : [])]));
  f.onchange = () => fire([...f.files]);
}

function closeMobileNav() {
  const nav = document.getElementById("primary-nav");
  if (nav && nav.classList.contains("open")) {
    nav.classList.remove("open");
    const hamburger = document.getElementById("hamburger");
    if (hamburger) hamburger.setAttribute("aria-expanded", "false");
  }
}

// Mobile navigation toggle
document.getElementById("hamburger")?.addEventListener("click", () => {
  const nav = document.getElementById("primary-nav");
  if (nav) {
    nav.classList.toggle("open");
    const hamburger = document.getElementById("hamburger");
    if (hamburger) hamburger.setAttribute("aria-expanded", nav.classList.contains("open"));
  }
});

// Close the mobile nav on Escape or when clicking outside it.
addEventListener("keydown", e => { if (e.key === "Escape") closeMobileNav(); });
document.addEventListener("click", e => {
  const nav = document.getElementById("primary-nav");
  if (!nav || !nav.classList.contains("open")) return;
  if (nav.contains(e.target) || (e.target.closest && e.target.closest("#hamburger"))) return;
  closeMobileNav();
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
let processToken = 0;
async function processTool(id, files) {
  const f = files[0];
  const token = ++processToken;
  let rsReal = $("#result");
  if (!rsReal) rsReal = resultBox();

  // Guard writes so a slow earlier run can never overwrite a newer one.
  const rs = new Proxy(rsReal, {
    get(target, prop, recv) {
      const val = Reflect.get(target, prop, recv);
      if (typeof val === "function") {
        return (...args) => {
          if (token !== processToken) return undefined;
          if (prop === "querySelectorAll") return val.apply(target, args);
          return val.apply(target, args);
        };
      }
      return val;
    },
    set(target, prop, value) {
      if (token !== processToken) return true;
      return Reflect.set(target, prop, value);
    }
  });

  // Show loading state
  if (token === processToken) {
    rs.innerHTML = `
      <div class="loading-result">
        <div class="loader">Processing...</div>
      </div>
    `;
  }

  try {
    switch (id) {
      case "bookmark-cleaner": {
        const t = await readText(f), doc = new DOMParser().parseFromString(t, "text/html"), links = [...doc.querySelectorAll("a[href]")];
        // Normalize URL for comparison: strip query/fragment, lowercase host, remove www.
        function normalizeUrl(u) {
          try {
            const p = new URL(u, "https://progeni.invalid");
            p.hash = ""; p.search = "";
            let h = p.hostname.toLowerCase();
            if (h.startsWith("www.")) h = h.slice(4);
            p.hostname = h;
            return p.toString();
          } catch (e) { return u; }
        }
        let dup = 0;
        const seen = new Set();
        links.forEach(a => {
          let u = normalizeUrl(a.href);
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
            // Component-aware dedupe: extract SUMMARY, DTSTART, DTEND as the key
            const summaryMatch = event.match(/SUMMARY:[^\n]*/);
            const dtstartMatch = event.match(/DTSTART[^:]*?:([^\n]*)/);
            const dtendMatch = event.match(/DTEND[^:]*?:([^\n]*)/);
            const key = [
              (summaryMatch ? summaryMatch[0] : "").trim(),
              (dtstartMatch ? dtstartMatch[1] : "").trim(),
              (dtendMatch ? dtendMatch[1] : "").trim()
            ].join("|");
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
          // ICS timezone fix: treat times as UTC so the "Z" suffix is correct.
          // Use Date.UTC() to construct dates from year/month/day + hour:minute,
          // then format with explicit UTC components and a trailing "Z".
          const fmt = x => {
            const d = new Date(x);
            const ms = d.getMilliseconds();
            const paddedMs = String(ms).padStart(3, "0");
            return d.getUTCFullYear()
              + String(d.getUTCMonth() + 1).padStart(2, "0")
              + String(d.getUTCDate()).padStart(2, "0")
              + "T"
              + String(d.getUTCHours()).padStart(2, "0")
              + String(d.getUTCMinutes()).padStart(2, "0")
              + String(d.getUTCSeconds()).padStart(2, "0")
              + "."
              + paddedMs
              + "Z";
          };
          let a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0));
          let b = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0));
          ics.push("BEGIN:VEVENT", `UID:ph-${Date.now()}-${i}@${hostDomain}`, `DTSTAMP:${fmt(a)}`, `DTSTART:${fmt(a)}`, `DTEND:${fmt(b)}`, `SUMMARY:${(r[title] || "Class").replace(/[,;]/g, " ")}`, "RRULE:FREQ=WEEKLY;COUNT=16", "END:VEVENT");
        });
        ics.push("END:VCALENDAR");
        rs.innerHTML = `<div class="notice">Created ${rows.length - 1} recurring calendar events from your CSV.</div><button class="btn" id="dl">Download timetable.ics</button>`;
        $("#dl").onclick = () => textDownload(ics.join("\r\n"), "timetable.ics", "text/calendar");
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
        $("#dl").onclick = () => textDownload(out, "reading-list.html", "text/html");
        break;
      }
      case "csv-splitter": { csvTool(id, await readText(f), rs); break; }
      case "csv-date": { csvTool(id, await readText(f), rs); break; }
      case "contact-dedupe": { contactDedupe(await readText(f), rs); break; }
      case "vcard": { await vcardTool(files, rs); break; }
      case "panorama": { await panorama(f, rs); break; }
      default: rs.innerHTML = `<div class="warn">Ready for processing. Drop files to begin.</div>`;
    }
  } catch (e) {
    console.error(e);
    // Remove loading state on error
    if (token === processToken && rs) rs.innerHTML = `<div class="error">${esc(e.message || e)}</div>`;
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
    <img alt="Preview of the generated print sheet" style="max-width:100%;max-height:420px;border:1px solid #cbd5e1;border-radius:12px;display:block;margin:0 auto 16px;" src="${URL.createObjectURL(b)}">
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
    <img alt="Safe-zone overlay preview for ${esc(pName)}" style="max-width:100%;border-radius:12px;display:block;margin:0 auto 16px;" src="${URL.createObjectURL(b)}">
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
    // csv-date or csv-date-preview mode
    rs.innerHTML = `
      <div class="controls">
        <label>Date Column<select id="col">${h.map((x, i) => `<option value="${i}">${esc(x)}</option>`).join("")}</select></label>
        <label>Target Format<select id="fmt"><option value="YYYY-MM-DD">ISO standard (YYYY-MM-DD)</option><option value="MM/DD/YYYY">US standard (MM/DD/YYYY)</option><option value="DD/MM/YYYY">European standard (DD/MM/YYYY)</option></select></label>
      </div>
      <button class="btn" id="go">Normalize Dates</button>
    `;
    $("#go").onclick = () => {
      const c = +$("#col").value, fmt = $("#fmt").value;
      // First pass: identify ambiguous dates (where day and month both <= 12)
      const ambiguous = [];
      const rowIsAmbiguous = new Map();
      rows.slice(1).forEach((r, i) => {
        const v = r[c] || "";
        const m = String(v).match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (m) {
          const a = +m[1], b = +m[2]; // a could be day or month
          if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
            // Ambiguous: both interpretations valid
            ambiguous.push({ rowIndex: i, original: v, val1: a, val2: b, year: m[3] });
            rowIsAmbiguous.set(i, true);
          }
        }
      });

      // normalizeDate() defaults ambiguous values to US MM/DD/YYYY. When the user
      // picks the European option we pre-swap the ambiguous cell to a canonical
      // DD/MM/YYYY value first so the normalization honors their choice.
      const buildOut = resolve => rows.map((r, i) => {
        if (!i) return r;
        return r.map((v, j) => {
          if (j !== c) return v;
          if (resolve === "eu" && rowIsAmbiguous.has(i)) {
            const m = String(v).match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
            if (m) v = `${m[2]}/${m[1]}/${m[3]}`; // swap day/month -> unambiguous DMY
          }
          return normalizeDate(v, fmt);
        });
      });

      const writeResult = out => {
        const existing = $("#csv-date-out");
        if (existing) existing.remove();
        rs.insertAdjacentHTML("beforeend", `<div id="csv-date-out"><div class="notice" style="margin-top:16px;">Dates standardized to ${fmt}.</div><button class="btn secondary" id="dl">Download Normalized CSV</button></div>`);
        $("#dl").onclick = () => textDownload(csvOut(out), "normalized.csv", "text/csv");
      };

      if (ambiguous.length === 0) { writeResult(buildOut("us")); return; }

      // Preview + explicit choice for ambiguous dates
      const previewHtml = `
        <div id="ambiguous-preview" style="margin: 16px 0; padding: 12px; background: #fffbeb; border: 1px solid #f6e05e; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Date Ambiguity Preview</div>
          <p style="font-size:13px;margin-bottom:8px;">${ambiguous.length} date(s) could be parsed as either US (MM/DD/YYYY) or European (DD/MM/YYYY) format. These have day and month both ≤ 12:</p>
          <div style="max-height:200px;overflow-y:auto;font-size:13px;background:#fff;padding:8px;border:1px solid #f6e05e;border-radius:4px;">
            ${ambiguous.map(a => `
              <div style="margin: 6px 0; padding: 4px; border-bottom: 1px solid #fee678;">
                <div style="font-weight:600;margin-bottom:2px;">Row ${a.rowIndex + 1}: <code>${esc(a.original)}</code></div>
                <div style="font-size:11px;color:#64748b;">
                  <span style="margin-right:6px;">Parsed as US (MM/DD/YYYY): <strong>${a.val1}/${a.val2}/${a.year}</strong></span>
                  <span style="margin-right:6px;">Parsed as European (DD/MM/YYYY): <strong>${a.val2}/${a.val1}/${a.year}</strong></span>
                </div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top:8px;">
            <select id="resolveAmbiguous" style="padding:4px 8px;font-size:12px;margin-right:8px;">
              <option value="us">Apply US format (MM/DD/YYYY) to all ambiguous</option>
              <option value="eu">Apply European format (DD/MM/YYYY) to all ambiguous</option>
            </select>
            <button class="btn tiny" id="confirmAmbiguous" style="font-size:11px;">Continue</button>
          </div>
        </div>
      `;

      const old = $("#ambiguous-preview");
      if (old) old.remove();
      rs.insertAdjacentHTML("afterbegin", previewHtml);
      $("#confirmAmbiguous").onclick = () => {
        const resolve = $("#resolveAmbiguous").value === "eu" ? "eu" : "us";
        const preview = $("#ambiguous-preview");
        if (preview) preview.remove();
        writeResult(buildOut(resolve));
      };
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

  // Extract and normalize phone numbers from each card
  function extractPhone(raw) {
    const m = raw.match(/TEL[^:]*?:(.*)/i);
    if (!m) return null;
    return normalizePhone(m[1].trim());
  }

  cards.forEach((c, i) => { c._phone = extractPhone(c.raw); c._index = i; });

  // Group cards that share a phone number (candidates for merging).
  const groupMap = new Map();
  cards.forEach(c => {
    if (!c._phone) return;
    if (!groupMap.has(c._phone)) groupMap.set(c._phone, []);
    groupMap.get(c._phone).push(c._index);
  });
  const dedupeGroups = [...groupMap.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([phone, members], gi) => ({ phone, members, gi, action: "merge" }));

  const render = () => {
    rs.innerHTML = `
      <div class="notice">Found <strong>${cards.length}</strong> valid vCard contact cards.</div>
      ${dedupeGroups.length > 0 ? `
        <div style="margin: 16px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Deduplication Preview</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${dedupeGroups.map(g => {
              const keep = g.action === "merge" ? g.members[0] : null;
              return `
              <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
                <div style="font-size:12px;color: #64748b;margin-bottom:4px;">Duplicate group #${g.gi + 1} · shares phone ${esc(g.phone)}</div>
                <div style="font-size:13px;margin-bottom:6px;">
                  ${g.members.map(i => `👤 ${esc(cards[i].name)}`).join(", ")}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn tiny" style="padding:4px 8px;font-size:11px;" data-act="merge" data-g="${g.gi}">Merge into one</button>
                  <button class="btn secondary" style="padding:4px 8px;font-size:11px;" data-act="keep" data-g="${g.gi}">Keep separate</button>
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:6px;">Action: <strong>${keep === null ? "keep separate" : `merge → keeping ${esc(cards[keep].name)}`}</strong></div>
              </div>`;
            }).join("")}
          </div>
        </div>
      ` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="dl-merge">Download Merged (.VCF)</button>
      </div>
      <div style="max-height:220px;overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;">
        <strong style="display:block;margin-bottom:8px;font-size:13px;">Individual Contact Cards:</strong>
        ${cards.map((c, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
            <span>👤 ${esc(c.name)} ${c._phone ? `<span style="font-size:11px;color:#64748b;">${esc(c._phone)}</span>` : ""}</span>
            <button class="btn secondary" style="padding:4px 10px;font-size:12px;" data-save="${i}">Save .vcf</button>
          </div>
        `).join("")}
      </div>
    `;

    rs.querySelectorAll("[data-act]").forEach(btn => {
      btn.onclick = () => {
        const g = dedupeGroups[+btn.dataset.g];
        g.action = btn.dataset.act === "keep" ? "keep" : "merge";
        render();
      };
    });
    rs.querySelectorAll("[data-save]").forEach(btn => {
      btn.onclick = () => {
        const c = cards[+btn.dataset.save];
        textDownload(c.raw, `${(c.name || "contact").replace(/[^a-zA-Z0-9_-]/g, "_")}.vcf`, "text/vcard");
      };
    });

    // Merge: within a "merge" group keep the first card and drop the rest.
    $("#dl-merge").onclick = () => {
      const kept = new Set();
      const dropped = new Set();
      dedupeGroups.forEach(g => {
        if (g.action !== "merge") return;
        g.members.slice(1).forEach(i => dropped.add(i));
      });
      const merged = cards.filter(c => !dropped.has(c._index));
      textDownload(merged.map(c => c.raw).join("\r\n"), "merged-contacts.vcf", "text/vcard");
    };
  };

  render();
}

async function panorama(f, rs) {
  const im = await imageFromFile(f);
  // Allow parts selection 2-6; default to 3 if no selector
  const partsEl = $("#panoramaParts");
  const partsDefault = partsEl ? parseInt(partsEl.value, 10) : 3;
  const parts = Math.max(2, Math.min(6, partsDefault || 3));

  const tileW = im.width / parts;
  const tileH = im.height / parts; // keep aspect per row; overall sheets stay rectangular

  // If the user wants square tiles, compute max parts that keeps height >= width per tile
  const requestedSquare = true;
  let actualParts = parts;
  let tileWidth, tileHeight;
  if (requestedSquare) {
    // Max parts such that tileHeight (im.height / parts) >= tileWidth (im.width / parts)
    // i.e. parts <= sqrt(im.height / im.width * parts) ... simpler: just check if we can do square
    const maxSquareParts = Math.floor(im.height / im.width * parts);
    actualParts = Math.max(2, Math.min(parts, maxSquareParts > 0 ? maxSquareParts : 2));
    tileWidth = Math.floor(im.width / actualParts);
    tileHeight = Math.floor(im.height / actualParts);
  } else {
    tileWidth = Math.floor(im.width / actualParts);
    tileHeight = Math.floor(im.height / actualParts);
  }

  const c = document.createElement("canvas"), ctx = c.getContext("2d");

  let html = `<div class="notice">Panorama split into <strong>${actualParts}</strong> tile${actualParts !== 1 ? "s" : ""}${
    requestedSquare ? " (square)" : ""
  }</strong>:</div>`;

  // Check if square tiles fit
  if (tileHeight > im.height) {
    html = `<div class="warn">Cannot yield square tiles (tile height ${tileHeight}px > image height ${im.height}px). Using rectangular tiles with per-row aspect ratio.</div>`;
    // Fall back to rectangular: each row gets its portion, tiles are width-justified
    tileWidth = Math.floor(im.width / parts);
    tileHeight = Math.floor(im.height / parts);
  }

  html += `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;" id="pg"></div>`;
  rs.innerHTML = html;
  const tileBlobs = [];
  for (let i = 0; i < actualParts; i++) {
    c.width = tileWidth;
    c.height = tileHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(im, i * tileWidth, 0, tileWidth, im.height, 0, 0, c.width, c.height);
    let b = await canvasBlob(c);
    tileBlobs.push(b);
    let img = document.createElement("img");
    img.src = URL.createObjectURL(b);
    img.alt = `Panorama tile ${i + 1} of ${actualParts}`;
    img.style.width = "28%"; img.style.borderRadius = "8px"; img.style.cursor = "pointer";
    img.title = `Click to download Tile ${i + 1}`;
    img.onclick = () => downloadBlob(b, `panorama-tile-${i + 1}.png`);
    $("#pg").appendChild(img);
  }
  let dlAll = document.createElement("button");
  dlAll.className = "btn";
  dlAll.id = "dl-all-tiles";
  dlAll.textContent = `Download All ${actualParts} Tiles`;
  rs.appendChild(dlAll);
  dlAll.onclick = async () => {
    for (let i = 0; i < tileBlobs.length; i++) {
      downloadBlob(tileBlobs[i], `panorama-tile-${i + 1}.png`);
      await new Promise(r => setTimeout(r, 100));
    }
  };
}

/* Photo Timeline Builder (2.5) and Family Photo Date Organizer (2.6) run inside
   the shared Album Studio engine (album-studio.js — EXIF dating, embedded
   thumbnails, day/month grouping, rename planner). The legacy text-only
   photoTimeline() was retired. Duplicate Finder (2.3) and Best-Shot Finder
   (2.4) run inside the shared PhotoBatch engine (photo-batch-studio.js). */

/* ---------- Search, suggestions and recently viewed ---------- */
const BENCH_RECENT_KEY = "bench:recent-tools";
let benchCatalogRender = null;

function benchNormalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function benchReadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(BENCH_RECENT_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(item => item && typeof item.href === "string" && typeof item.name === "string")
      .slice(0, 6);
  } catch (err) {
    return [];
  }
}

function benchRememberTool(href, name, icon) {
  if (!href || !name) return;
  try {
    const iconName = (benchIcons && benchIcons.paths[icon]) ? icon : (benchIcons ? benchIcons.iconFromHref(href) : "");
    const next = [{ href, name, icon: iconName, t: Date.now() }, ...benchReadRecent().filter(item => item.href !== href)].slice(0, 6);
    localStorage.setItem(BENCH_RECENT_KEY, JSON.stringify(next));
  } catch (err) { /* storage may be blocked or full */ }
}

function benchRememberCurrentTool() {
  const match = location.pathname.match(/^\/(tools|image|audio)\/([^/]+)\/?$/);
  if (!match) return;
  const head = document.querySelector(".tool-head h1");
  if (!head) return;
  const iconEl = document.querySelector(".tool-head-icon");
  const iconName = iconEl ? iconEl.dataset.icon : "";
  const name = head.textContent.trim() || match[2].replace(/-/g, " ");
  benchRememberTool(location.pathname, name, iconName);
}

let benchCategoryNames = null;

/* Image/audio category ids are slugs ("image:compress"); show the readable
   label from the hidden category select instead. */
function benchCategoryName(value) {
  if (!value) return "";
  if (!benchCategoryNames) {
    benchCategoryNames = new Map();
    const select = document.getElementById("category-filter");
    if (select) {
      [...select.options].forEach(option => {
        if (!option.value || option.value === "all") return;
        benchCategoryNames.set(option.value, option.textContent.replace(/^(Core|Image|Audio)\s*·\s*/, "").trim());
      });
    }
  }
  return benchCategoryNames.get(value) || value;
}

function benchRenderRecent() {
  const wrap = document.getElementById("recent-tools");
  if (!wrap) return;
  const items = benchReadRecent();
  if (!items.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="recent-head">
      <h2>Recently viewed</h2>
      <button type="button" class="recent-clear" data-clear-recent>Clear</button>
    </div>
    <div class="recent-list">
      ${items.map(item => `<a class="recent-item" href="${esc(item.href)}"><span class="recent-icon" aria-hidden="true">${benchIcon((benchIcons && benchIcons.paths[item.icon]) ? item.icon : (benchIcons ? benchIcons.iconFromHref(item.href) : ""))}</span><span>${esc(item.name)}</span></a>`).join("")}
    </div>`;
  const clear = wrap.querySelector("[data-clear-recent]");
  if (clear) clear.addEventListener("click", () => {
    try { localStorage.removeItem(BENCH_RECENT_KEY); } catch (err) { /* ignore */ }
    benchRenderRecent();
  });
}

function benchSearchIndex() {
  return [...document.querySelectorAll("#grid .tool-card")].map(card => {
    const title = card.querySelector("h3");
    return {
      href: card.getAttribute("href") || "/",
      name: title ? title.textContent.trim() : "",
      icon: card.dataset.icon || (benchIcons ? benchIcons.iconFromHref(card.getAttribute("href")) : ""),
      category: benchCategoryName(card.dataset.category),
      text: benchNormalize(`${card.dataset.search || ""} ${card.textContent}`)
    };
  }).filter(item => item.name);
}

function benchSearchMatches(index, query, limit) {
  const terms = benchNormalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  index.forEach(item => {
    const name = benchNormalize(item.name);
    const category = benchNormalize(item.category);
    let score = 0;
    for (const term of terms) {
      if (name.startsWith(term)) score += 8;
      else if (name.includes(term)) score += 5;
      else if (category.includes(term)) score += 2;
      else if (item.text.includes(term)) score += 1;
      else return;
    }
    scored.push({ item, score });
  });
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit || 7).map(entry => entry.item);
}

function installHeaderSearch() {
  const input = document.getElementById("search");
  const wrap = document.getElementById("header-search");
  const panel = document.getElementById("search-suggestions");
  const status = document.getElementById("search-status");
  if (!input || !wrap || !panel) return;
  // Checked per keystroke: the catalogue disappears when a tool view mounts.
  const onHome = () => !!document.getElementById("grid");
  let active = -1;

  // Non-home pages have no catalog DOM, so the full suggestion list is matched
  // against a static index fetched once, lazily, on first use.
  let globalIndex = null;
  let globalIndexLoading = false;
  const loadGlobalIndex = () => {
    if (globalIndex || globalIndexLoading) return;
    globalIndexLoading = true;
    fetch("/search-index.json")
      .then(response => (response.ok ? response.json() : []))
      .then(list => {
        globalIndex = (Array.isArray(list) ? list : []).map(item => ({
          href: item.href,
          name: item.name,
          category: item.category,
          text: benchNormalize(`${item.text || ""} ${item.name || ""}`),
          icon: (benchIcons && item.href ? benchIcons.iconFromHref(item.href) : "") || ""
        })).filter(item => item.name);
        if (input.value.trim()) refresh();
      })
      .catch(() => { /* keep the "Search all tools" hint as a fallback */ })
      .finally(() => { globalIndexLoading = false; });
  };

  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const visibleItems = () => [...panel.querySelectorAll(".search-suggestion")];

  const setActive = index => {
    const items = visibleItems();
    if (!items.length) return;
    active = (index + items.length) % items.length;
    items.forEach((el, i) => {
      el.classList.toggle("active", i === active);
      el.setAttribute("aria-selected", i === active ? "true" : "false");
    });
    input.setAttribute("aria-activedescendant", items[active].id);
    items[active].scrollIntoView({ block: "nearest" });
  };

  const paint = matches => {
    if (!matches.length) { close(); return; }
    panel.innerHTML = matches.map((item, i) => `
      <a class="search-suggestion" role="option" id="search-option-${i}" href="${esc(item.href)}" tabindex="-1" aria-selected="false">
        <span class="suggestion-icon" aria-hidden="true">${benchIcon(item.icon)}</span>
        <span class="suggestion-text"><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></span>
        <span class="suggestion-go" aria-hidden="true">↵</span>
      </a>`).join("");
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
    if (status) status.textContent = `${matches.length} matching tools`;
  };

  const paintAllToolsHint = value => {
    panel.innerHTML = `
      <a class="search-suggestion search-suggestion-all" role="option" href="/?q=${encodeURIComponent(value)}" tabindex="-1" aria-selected="false">
        <span class="suggestion-icon" aria-hidden="true">${benchIcon("search")}</span>
        <span class="suggestion-text"><strong>Search all tools for “${esc(value)}”</strong><small>Opens the full catalogue</small></span>
        <span class="suggestion-go" aria-hidden="true">↵</span>
      </a>`;
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (status) status.textContent = "Press Enter to search all tools";
  };

  const refresh = () => {
    const value = input.value.trim();
    if (onHome()) {
      paint(benchSearchMatches(benchSearchIndex(), value, 7));
      if (benchCatalogRender) benchCatalogRender();
    } else if (value) {
      if (globalIndex) {
        const matches = benchSearchMatches(globalIndex, value, 7);
        if (matches.length) paint(matches);
        else paintAllToolsHint(value);
      } else {
        paintAllToolsHint(value);
        loadGlobalIndex();
      }
    } else {
      close();
    }
  };

  input.addEventListener("input", refresh);
  input.addEventListener("focus", () => { if (input.value.trim()) refresh(); });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(active + 1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(active - 1); return; }
    if (event.key === "Enter") {
      const items = visibleItems();
      if (active >= 0 && items[active]) { event.preventDefault(); items[active].click(); return; }
      if (onHome()) { event.preventDefault(); refresh(); }
      else { event.preventDefault(); location.href = `/?q=${encodeURIComponent(input.value.trim())}`; }
      return;
    }
    if (event.key === "Escape") {
      if (!panel.hidden) { event.preventDefault(); close(); }
      else if (input.value) { input.value = ""; refresh(); }
    }
  });
  // Activating a suggestion hides the panel immediately — never rely on the
  // navigation that follows to clear it (same-page target, slow load, or a
  // same-URL navigation where the document never reloads).
  panel.addEventListener("click", event => {
    if (event.target.closest(".search-suggestion")) close();
  });
  document.addEventListener("click", event => {
    if (!wrap.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
    event.preventDefault();
    input.focus();
    input.select();
  });
}

function initHomeCatalog() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  const searchEl = document.getElementById("search");
  const toolkitSelect = document.getElementById("toolkit-filter");
  const categorySelect = document.getElementById("category-filter");
  const tabs = [...document.querySelectorAll("[data-toolkit-tab]")];
  const chipRow = document.querySelector(".catalog-category-filters");
  const countEl = document.querySelector(".grid-count");
  const cards = [...grid.querySelectorAll(".tool-card")];
  const total = cards.length;
  let activeToolkit = "all";
  let activeCategory = "all";

  const index = new Map(cards.map(card => [card, benchNormalize(`${card.dataset.search || ""} ${card.textContent}`)]));
  const categories = categorySelect
    ? [...categorySelect.options].slice(1).map(option => {
        const parts = option.value.split(":");
        return { value: option.value, toolkit: parts[0], name: parts.slice(1).join(":") };
      })
    : [];

  const renderChips = () => {
    if (!chipRow) return;
    const visible = categories.filter(item => activeToolkit === "all" || item.toolkit === activeToolkit);
    chipRow.innerHTML = `<button class="category-filter-button${activeCategory === "all" ? " active" : ""}" type="button" data-category-tab="all" aria-pressed="${activeCategory === "all"}">All categories</button>`
      + visible.map(item => `<button class="category-filter-button${activeCategory === item.value ? " active" : ""}" type="button" data-category-tab="${esc(item.value)}" aria-pressed="${activeCategory === item.value}">${esc(item.name)}</button>`).join("");
  };

  const render = () => {
    const terms = benchNormalize(searchEl ? searchEl.value : "").split(/\s+/).filter(Boolean);
    let visible = 0;
    cards.forEach(card => {
      const text = index.get(card) || "";
      const matches = (activeToolkit === "all" || card.dataset.toolkit === activeToolkit)
        && (activeCategory === "all" || card.dataset.category === activeCategory)
        && terms.every(term => text.includes(term));
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    grid.querySelectorAll(".catalog-category").forEach(section => {
      const count = [...section.querySelectorAll(".tool-card")].filter(card => !card.hidden).length;
      section.hidden = count === 0;
      const label = section.querySelector(".catalog-category-count");
      if (label) label.textContent = `${count} ${count === 1 ? "tool" : "tools"}`;
    });
    grid.querySelectorAll(".catalog-toolkit").forEach(section => {
      const count = [...section.querySelectorAll(".tool-card")].filter(card => !card.hidden).length;
      section.hidden = count === 0;
      const label = section.querySelector(".catalog-group-count");
      if (label) label.textContent = `${count} ${count === 1 ? "tool" : "tools"}`;
    });
    if (countEl) countEl.innerHTML = visible === total ? `<strong>${total}</strong> tools` : `Showing <strong>${visible}</strong> of ${total} tools`;
    tabs.forEach(tab => {
      const on = tab.dataset.toolkitTab === activeToolkit;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-pressed", String(on));
    });
    if (toolkitSelect) toolkitSelect.value = activeToolkit;
    if (categorySelect) categorySelect.value = activeCategory;
    renderEmpty(visible);
  };

  const renderEmpty = visible => {
    let empty = grid.querySelector(".search-empty");
    if (visible === 0 && !empty) {
      const query = searchEl && searchEl.value.trim();
      empty = document.createElement("div");
      empty.className = "empty search-empty";
      empty.setAttribute("role", "status");
      empty.innerHTML = `<p><strong>No tools match ${query ? `“${esc(query)}”` : "these filters"}.</strong> Try a shorter search or a different category.</p>
        <div class="search-empty-actions">
          <button class="btn secondary btn-sm" type="button" data-clear-filters>Clear search and filters</button>
          <a class="btn secondary btn-sm" href="/image/">Browse image tools</a>
          <a class="btn secondary btn-sm" href="/audio/">Browse audio tools</a>
        </div>`;
      grid.appendChild(empty);
      const clear = empty.querySelector("[data-clear-filters]");
      if (clear) clear.addEventListener("click", reset);
    } else if (visible > 0 && empty) {
      empty.remove();
    }
  };

  const reset = () => {
    activeToolkit = "all";
    activeCategory = "all";
    if (searchEl) searchEl.value = "";
    renderChips();
    render();
  };

  const setToolkit = value => {
    activeToolkit = value;
    if (activeCategory !== "all" && activeCategory.split(":")[0] !== value) activeCategory = "all";
    renderChips();
    render();
  };

  tabs.forEach(tab => tab.addEventListener("click", () => setToolkit(tab.dataset.toolkitTab)));
  if (chipRow) chipRow.addEventListener("click", event => {
    const chip = event.target.closest("[data-category-tab]");
    if (!chip) return;
    activeCategory = chip.dataset.categoryTab;
    renderChips();
    render();
  });
  document.querySelectorAll("[data-clear-filters]").forEach(button => button.addEventListener("click", reset));
  if (toolkitSelect) toolkitSelect.addEventListener("change", () => setToolkit(toolkitSelect.value));
  if (categorySelect) categorySelect.addEventListener("change", () => {
    activeCategory = categorySelect.value;
    renderChips();
    render();
  });

  benchCatalogRender = () => render();
  const initialQuery = new URLSearchParams(location.search).get("q");
  if (initialQuery && searchEl) searchEl.value = initialQuery;
  renderChips();
  render();
  benchRenderRecent();
}

function home() {
  // If #app was replaced by a tool view earlier in this session, the catalogue
  // markup is gone. Rebuilding it from JS would produce the legacy layout, so
  // load the pre-rendered home document instead.
  if (!document.getElementById("grid")) {
    window.location.replace("/");
    return;
  }

  const topbar = document.querySelector(".topbar");
  let headerSearch = document.getElementById("header-search");
  if (!headerSearch && topbar) {
    headerSearch = document.createElement("div");
    headerSearch.className = "header-search";
    headerSearch.id = "header-search";
    headerSearch.innerHTML = `
      <label class="sr-only" for="search">Search Bench tools</label>
      <input id="search" class="search" type="search" aria-label="Search Bench tools" placeholder="Search tools by name, task or format…">
    `;
    topbar.insertBefore(headerSearch, topbar.querySelector("#primary-nav") || topbar.querySelector("#hamburger"));
  }
  if (headerSearch) headerSearch.hidden = false;

  let homeTitle = `${SITE_NAME}: Free Private File Tools in Your Browser`;
  if (homeTitle.length > 60) homeTitle = `${SITE_NAME}: Private File Tools`;
  document.title = homeTitle;

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    canonicalEl.href = `${SITE_URL}/`;
  }

  const existingGrid = $("#grid");
  if (existingGrid) {
    benchRenderRecent();
    initHomeCatalog();
    return;
  }

  const trustHtml = [
    { ico: benchIcon("lock"), title: "Local processing by default", body: "Most selected files stay in your browser. PDF Translator sends extracted text to DeepL, not the PDF itself." },
    { ico: benchIcon("zap"), title: "Instant, no waiting", body: "No queues, no render farms. Results appear as soon as you drop a file." },
    { ico: benchIcon("user-round-x"), title: "No account, ever", body: "No signup, no passwords, no subscriptions. Open a tool and get to work." },
    { ico: benchIcon("wrench"), title: `${TOOLS.length + 42 + 48} tools across three toolkits`, body: `${TOOLS.length} core utilities, 42 image tools, and 48 audio tools for crafters, creators and desk workers.` }
  ].map(f => `
    <div class="trust-item">
      <span class="t-ico" aria-hidden="true">${f.ico}</span>
      <div><b>${esc(f.title)}</b><span>${esc(f.body)}</span></div>
    </div>
  `).join("");

  app.innerHTML = `
    <section class="hero">
      <div class="hero-inner">
        <span class="eyebrow"><span class="dot" aria-hidden="true"></span>${TOOLS.length + 42 + 48} tools · local processing by default</span>
        <h1>Fix everyday file jobs <span class="accent">with local processing by default</span>.</h1>
        <p class="hero-lede">${esc(TAGLINE)} Free tools for crafters, creators and desk workers. Most tools process files locally; PDF Translator keeps pages on your device and sends extracted text to DeepL.</p>
        <div class="catalog-controls" aria-label="Filter tools">
          <label for="toolkit-filter">Toolkit
            <select id="toolkit-filter"><option value="all">All toolkits</option><option value="core">Core tools</option><option value="image">Image tools</option><option value="audio">Audio tools</option></select>
          </label>
          <select id="category-filter" class="sr-only" aria-hidden="true" tabindex="-1"><option value="all">All categories</option></select>
          <button class="catalog-clear" type="button" data-clear-filters>Clear filters</button>
        </div>
        <div class="toolkit-shortcuts" aria-label="Browse specialist toolkits">
          <span>More tools:</span>
          <a href="/image/">42 image tools <span aria-hidden="true">→</span></a>
          <a href="/audio/">48 audio tools <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>

    <section class="tools-section" aria-label="Browser utility grid">
      <div class="section-head">
        <h2>Core tools</h2>
        <p class="grid-count" aria-live="polite" aria-atomic="true">Showing <strong>${TOOLS.length}</strong> of ${TOOLS.length} core tools</p>
      </div>
      <div id="grid" class="grid"></div>
    </section>

    <section class="trust" aria-label="Why use ${esc(SITE_NAME)}">
      ${trustHtml}
    </section>

    <section class="privacy-band">
      <h2>Local file processing, with an explicit translation exception</h2>
      <p>Most ${esc(SITE_NAME)} tools process selected files locally in your browser. PDF Translator keeps PDF pages on your device but sends extracted text blocks to DeepL through a server-side function. Review that tool's privacy notice before using it.</p>
      <div class="privacy-points">
        <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>Local by default.</b> Files stay on your device in most tools; PDF Translator sends extracted text to DeepL.</span></div>
        <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No account required.</b> Immediate access — no signup, passwords or subscriptions.</span></div>
        <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No trackers.</b> No third-party analytics cookies or behavioural monitoring scripts.</span></div>
      </div>
    </section>

    <section class="category-directory">
      <h2>Browse utilities by category</h2>
      <p>Every utility runs 100% client-side in your web browser. Pick a category below to jump straight to a specialised file tool.</p>
      <div class="category-blocks"></div>
    </section>
  `;

  const categories = [...new Set(TOOLS.map(t => t.cat))];
  const categoryFilter = $("#category-filter");
  categoryFilter.innerHTML += categories.map(cat =>
    `<option value="${esc(`core:${cat}`)}">Core · ${esc(cat)}</option>`
  ).join("");
  $(".category-blocks").innerHTML = categories.map(cat => `
    <div class="category-block" id="category-${esc(cat.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
      <h3>${esc(cat)}</h3>
      <ul>
        ${TOOLS.filter(t => t.cat === cat).map(t => `
          <li><a href="/tools/${t.id}/">${benchToolIcon("core", t.id, t.icon)} ${esc(t.name)}</a> — <span class="cat-desc">${esc(t.desc.slice(0, 70))}…</span></li>
        `).join('')}
      </ul>
    </div>
  `).join("");

  $("#grid").innerHTML = TOOLS.map(t => `
    <a class="tool-card" href="/tools/${t.id}/" data-toolkit="core" data-category="${esc(`core:${t.cat}`)}" data-icon="${esc(benchIcons ? benchIcons.iconName("core", t.id, t.icon) : "")}" data-search="${esc(`${t.id} ${t.keyword || ""} ${t.desc}`)}">
      <span class="go" aria-hidden="true">&rarr;</span>
      <div class="icon" aria-hidden="true">${benchToolIcon("core", t.id, t.icon)}</div>
      <h2>${esc(t.name)}</h2>
      <p>${esc(t.desc)}</p>
      <span class="tag">${esc(t.cat)}</span>
    </a>
  `).join("");

  initHomeCatalog();
}

function toolPage(id) {
  const tool = TOOLS.find(x => x.id === id);
  if (!tool) { home(); return; }

  if (id === "pdf-page-manager") {
    const body = `
      <section class="pdfpm" id="pdfpm" aria-busy="false">
        <div class="pdfpm-drop" id="pdfpm-drop" role="button" tabindex="0">
          <strong>Drop a PDF here or choose a file</strong>
          <span>PDFs are read and edited locally · Maximum 50 MB and 150 pages</span>
          <input id="pdfpm-file" type="file" accept=".pdf,application/pdf" hidden>
        </div>
        <div class="pdfpm-error" id="pdfpm-error" role="alert" hidden></div>
        <p class="pdfpm-status" id="pdfpm-status" role="status" aria-live="polite">Choose a PDF to begin.</p>
        <section class="pdfpm-editor" id="pdfpm-editor" aria-label="PDF page editor" hidden>
          <div class="pdfpm-file-info" id="pdfpm-file-info"></div>
          <div class="pdfpm-warning" role="note"><strong>PDF compatibility:</strong> Editing invalidates digital signatures. Links, annotations, bookmarks, forms, metadata and other advanced features may not be preserved.</div>
          <div class="pdfpm-toolbar" role="toolbar" aria-label="Page editing actions">
            <button class="btn secondary btn-sm" id="pdfpm-select-all" type="button">Select all</button>
            <button class="btn secondary btn-sm" id="pdfpm-clear-selection" type="button">Clear selection</button>
            <button class="btn danger btn-sm" id="pdfpm-delete" type="button" disabled>Delete selected</button>
            <button class="btn secondary btn-sm" id="pdfpm-duplicate" type="button" disabled>Duplicate selected</button>
            <button class="btn secondary btn-sm" id="pdfpm-move-up" type="button" disabled>Move earlier</button>
            <button class="btn secondary btn-sm" id="pdfpm-move-down" type="button" disabled>Move later</button>
            <button class="btn secondary btn-sm" id="pdfpm-undo" type="button" disabled>Undo</button>
            <button class="btn secondary btn-sm" id="pdfpm-redo" type="button" disabled>Redo</button>
            <button class="btn secondary btn-sm" id="pdfpm-reset" type="button">Reset to original</button>
          </div>
          <div class="pdfpm-insert-bar">
            <label for="pdfpm-position">Insert position</label>
            <select id="pdfpm-position">
              <option value="before">Before selected page</option>
              <option value="after">After selected page</option>
              <option value="append">At end</option>
            </select>
            <button class="btn secondary btn-sm" id="pdfpm-add-pdf" type="button">Choose another PDF</button>
            <input id="pdfpm-second-file" type="file" accept=".pdf,application/pdf" hidden>
            <button class="btn secondary btn-sm" id="pdfpm-add-blank" type="button">Insert blank page</button>
            <button class="btn secondary btn-sm" id="pdfpm-add-image" type="button">Insert image page</button>
            <input id="pdfpm-image-file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple hidden>
            <label for="pdfpm-page-size">Page size</label>
            <select id="pdfpm-page-size">
              <option value="adjacent">Match adjacent page</option>
              <option value="a4">A4 portrait</option>
              <option value="letter">US Letter portrait</option>
              <option value="custom">Custom dimensions</option>
            </select>
            <span class="pdfpm-custom-size" id="pdfpm-custom-size" hidden>
              <label>Width (mm) <input id="pdfpm-width" type="number" min="50" max="1000" value="210"></label>
              <label>Height (mm) <input id="pdfpm-height" type="number" min="50" max="1000" value="297"></label>
            </span>
          </div>
          <p class="pdfpm-help">Drag a page to reorder it. Keyboard users can select pages and use Move earlier/later. Thumbnails render only near the visible scroll area.</p>
          <div class="pdfpm-page-summary" id="pdfpm-page-summary" aria-live="polite"></div>
          <div class="pdfpm-pages" id="pdfpm-pages" role="list" aria-label="PDF pages"></div>
          <section class="pdfpm-source" id="pdfpm-source" aria-labelledby="pdfpm-source-title" hidden>
            <div class="pdfpm-source-head">
              <div><h2 id="pdfpm-source-title">Pages from another PDF</h2><p id="pdfpm-source-info"></p></div>
              <div class="pdfpm-source-actions">
                <button class="btn secondary btn-sm" id="pdfpm-source-select-all" type="button">Select all source pages</button>
                <button class="btn secondary btn-sm" id="pdfpm-insert-source" type="button" disabled>Insert selected pages</button>
                <button class="btn secondary btn-sm" id="pdfpm-append-source" type="button">Append entire PDF</button>
                <button class="btn secondary btn-sm" id="pdfpm-close-source" type="button">Remove source PDF</button>
              </div>
            </div>
            <div class="pdfpm-pages pdfpm-source-pages" id="pdfpm-source-pages" role="list" aria-label="Pages in the second PDF"></div>
          </section>
          <div class="pdfpm-export">
            <div><strong id="pdfpm-final-count"></strong><span id="pdfpm-export-status" role="status" aria-live="polite"></span></div>
            <progress id="pdfpm-progress" max="100" value="0" aria-label="PDF export progress" hidden></progress>
            <div class="pdfpm-export-actions">
              <button class="btn" id="pdfpm-export" type="button" disabled>Export edited PDF</button>
              <a class="btn secondary" id="pdfpm-download" href="#" download hidden>Download PDF</a>
            </div>
          </div>
        </section>
      </section>
    `;
    layout({ tool, body });
    const routeToken = ++pdfManagerRouteToken;
    loadScript("/vendor/pdfjs/pdf.min.js")
      .then(() => loadScript("/vendor/pdf-lib/pdf-lib.min.js"))
      .then(() => loadScript("/pdf-page-manager.js"))
      .then(() => {
        if (routeToken !== pdfManagerRouteToken || !$("#pdfpm")) return;
        if (!window.PdfPageManager || !window.pdfjsLib || !window.PDFLib) {
          throw new Error("A local PDF component did not initialize.");
        }
        window.PdfPageManager.mount();
      })
      .catch(err => {
        if (routeToken !== pdfManagerRouteToken) return;
        const error = $("#pdfpm-error");
        if (error) {
          error.hidden = false;
          error.textContent = `PDF Page Manager could not load: ${err.message || err}`;
        }
      });
    return;
  }

  if (id === "pdf-translator") {
    const body = `
      <div class="pdf-translator" id="pdf-controls" aria-busy="false">
        <div class="pdf-drop" id="pdf-drop" role="button" tabindex="0" aria-label="Drop a PDF here or choose a file from your device">
          <svg class="pdf-drop-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4l4 4"/><path d="M20 16.5a4.5 4.5 0 0 0-3.5-4.4A6 6 0 0 0 6.6 9.2 4.5 4.5 0 0 0 4 13.5V16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5z" opacity="0.9"/></svg>
          <strong>Drop a PDF here</strong>
          <span>or choose a file from your device · maximum 15 MB and 120,000 extracted characters</span>
          <input id="pdf-file" type="file" accept=".pdf,application/pdf" hidden tabindex="-1">
        </div>
        <div id="pdf-file-info" class="pdf-file-info" hidden>
          <svg class="pdf-file-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>
          <span class="pdf-file-body">
            <strong id="pdf-file-name"></strong>
            <span class="pdf-file-meta"><span id="pdf-file-size"></span> · <span id="pdf-page-count">Checking pages…</span></span>
          </span>
        </div>
        <div class="pdf-settings">
          <div class="pdf-field">
            <label for="pdf-source-language">Source language</label>
            <select id="pdf-source-language" aria-describedby="pdf-source-help"></select>
            <span class="pdf-help" id="pdf-source-help">Auto-detect is recommended unless you know the document language.</span>
          </div>
          <div class="pdf-field">
            <label for="pdf-target-language">Target language</label>
            <select id="pdf-target-language" aria-describedby="pdf-hinglish-note"></select>
            <span class="pdf-help" id="pdf-hinglish-note" hidden>Hinglish is Hindi translated by DeepL and then romanized; natural English-Hindi mixing is not guaranteed.</span>
          </div>
          <div class="pdf-field">
            <label for="pdf-translation-style">Translation style</label>
            <select id="pdf-translation-style">
              <option value="faithful">Faithful</option>
              <option value="formal">Formal (where supported)</option>
              <option value="conversational">Conversational (where supported)</option>
            </select>
          </div>
          <div class="pdf-field">
            <label for="pdf-output-mode">Output layout</label>
            <select id="pdf-output-mode">
              <option value="preserve">Preserve original layout (best effort)</option>
              <option value="readable">Clean readable layout</option>
              <option value="bilingual">Bilingual source + translation</option>
            </select>
          </div>
          <div class="pdf-field pdf-field-wide">
            <label for="pdf-page-range">Pages to include</label>
            <input id="pdf-page-range" type="text" inputmode="text" placeholder="All pages (or e.g. 1-3, 6)" autocomplete="off" spellcheck="false" aria-describedby="pdf-page-range-help">
            <span class="pdf-help" id="pdf-page-range-help">Only selected pages are included in the output PDF.</span>
          </div>
        </div>
        <label class="pdf-check" for="pdf-use-ocr">
          <input id="pdf-use-ocr" type="checkbox">
          <span><strong>Use local OCR on scanned pages</strong><small>English or Hindi OCR data downloads as needed. Page images stay on your device.</small></span>
        </label>
        <div class="pdf-field pdf-ocr-field">
          <label for="pdf-ocr-language">OCR language</label>
          <select id="pdf-ocr-language" disabled>
            <option value="eng">English</option>
            <option value="hin">Hindi</option>
          </select>
        </div>
        <div class="pdf-actions">
          <button class="btn" id="pdf-run" type="button" disabled>Translate PDF</button>
          <button class="btn secondary" id="pdf-cancel" type="button" hidden>Cancel</button>
        </div>
        <div class="pdf-progress-wrap">
          <progress id="pdf-progress" max="100" value="0" aria-label="Translation progress" hidden></progress>
          <p id="pdf-status" role="status" aria-live="polite">Select a PDF to validate it in your browser.</p>
        </div>
        <div class="error pdf-error" id="pdf-error" role="alert" tabindex="-1" hidden></div>
        <div class="error pdf-error" id="pdf-runtime-error" role="alert" hidden></div>
        <section class="pdf-preview" id="pdf-preview" aria-labelledby="pdf-preview-heading" hidden>
          <h2 id="pdf-preview-heading">Translation preview</h2>
          <p id="pdf-preview-count"></p>
          <div id="pdf-preview-list"></div>
        </section>
        <section class="pdf-result" id="pdf-result" aria-labelledby="pdf-result-heading" hidden>
          <h2 id="pdf-result-heading">PDF quality report</h2>
          <p id="pdf-result-summary"></p>
          <p id="pdf-detected-source" hidden></p>
          <ul id="pdf-quality"></ul>
          <a class="btn" id="pdf-download" href="#" download>Download translated PDF</a>
        </section>
        <p class="pdf-privacy-note">Privacy: the PDF itself is never uploaded. In Chrome 138+, translation happens entirely on your device using the built-in Translator — nothing, not even the extracted text, leaves your computer. On other browsers or older Chrome versions, extracted text may be processed by DeepL through a server endpoint.</p>
      </div>
    `;
    layout({ tool, body });
    const target = $("#pdf-runtime-error");
    const routeToken = ++pdfRouteToken;
    loadScript("/vendor/pdfjs/pdf.min.js")
      .then(() => loadScript("/vendor/pdf-lib/pdf-lib.min.js"))
      .then(() => loadScript("/vendor/tesseract/tesseract.min.js"))
      .then(() => loadScript("/pdf-translator.js"))
      .then(() => {
        if (routeToken !== pdfRouteToken || !$("#pdf-controls")) return;
        if (!window.PdfTranslator || !window.pdfjsLib || !window.PDFLib) {
          throw new Error("A PDF processing component did not initialize.");
        }
        const languages = window.PdfTranslator.getLanguages();
        $("#pdf-source-language").innerHTML = languages.sources.map(([code, name]) =>
          `<option value="${esc(code)}">${esc(name)}</option>`
        ).join("");
        $("#pdf-target-language").innerHTML = languages.targets.map(([code, name]) =>
          `<option value="${esc(code)}">${esc(name)} (${esc(code)})</option>`
        ).join("") + '<option value="Hinglish">Hinglish (HI · Roman Hindi)</option>';
        $("#pdf-target-language").value = "Hinglish";
        const fontPath = "/vendor/fonts/noto-sans-devanagari/400.css";
        if (!document.querySelector(`link[href="${fontPath}"]`)) {
          const fontCss = document.createElement("link");
          fontCss.rel = "stylesheet";
          fontCss.href = fontPath;
          document.head.appendChild(fontCss);
        }
        window.PdfTranslator.mount();
      })
      .catch(err => {
        if (routeToken !== pdfRouteToken) return;
        if (target) {
          target.hidden = false;
          target.textContent = `PDF Translator could not load: ${err.message || err}`;
        }
      });
    return;
  }

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
    ensureStudios("sticker").then(() => {
      const studio = window.StickerStudio.mount(document.getElementById("studio"));
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // Avery 5160 / Label Maker runs inside the dedicated Label Studio engine
  // (multi-line builder, sheet preview, PNG/HTML/Print export — see docs/LABELS_PLAN.md).
  if (id === "labels") {
    layout({ tool, body: body + `<div class="studio" id="studio"></div>` });
    ensureStudios("label").then(() => {
      const studio = window.LabelStudio.mount(document.getElementById("studio"));
      bindPicker(files => {
        const f = files[0];
        if (f) readText(f).then(t => studio.addCsv(t, f.name)).catch(() => studio.addCsv("", ""));
      });
    }).catch(err => console.error(err));
    return;
  }

  // Cross-Stitch, Diamond Painting and Embroidery run inside the shared Pattern
  // Studio engine (DMC palette, median-cut + snap, symbol charts, drill planner,
  // skein estimates, CSV/PNG/print — see pattern-studio.js, docs/TOOLS_ROADMAP.md
  // 1.7–1.9).
  if (id === "cross-stitch" || id === "diamond-painting" || id === "embroidery") {
    layout({ tool, body: body + `<div class="studio" id="patternstudio"></div>` });
    ensureStudios("dmc", "pattern").then(() => {
      const studio = window.PatternStudio.mount(document.getElementById("patternstudio"), {
        mode: id === "cross-stitch" ? "cross-stitch" : id === "diamond-painting" ? "diamond" : "embroidery"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // T-Shirt Print Mirror, Photo Print Border and Wallpaper Cropper run inside
  // the shared Image Studio engine (flip / border / crop modes — see
  // image-studio.js and docs/TOOLS_ROADMAP.md 1.3 / 1.6 / 2.1). The legacy
  // imageTransform() helper that used to serve these three was removed.
  if (id === "tshirt-mirror" || id === "print-border" || id === "wallpaper") {
    layout({ tool, body: body + `<div class="studio" id="imagestudio"></div>` });
    ensureStudios("image").then(() => {
      const studio = window.ImageStudio.mount(document.getElementById("imagestudio"), {
        mode: id === "tshirt-mirror" ? "mirror" : id === "print-border" ? "border" : "wallpaper"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // Photo Duplicate Finder and Photo Best-Shot Finder run inside the shared
  // Photo Batch Studio engine (exact SHA-256 + aHash/dHash dedupe; Laplacian
  // sharpness / exposure / contrast ranking — see photo-batch-studio.js and
  // docs/TOOLS_ROADMAP.md 2.3 / 2.4).
  if (id === "duplicate-finder" || id === "best-shot") {
    layout({ tool, body: body + `<div class="studio" id="photobatch"></div>` });
    ensureStudios("photobatch").then(() => {
      const studio = window.PhotoBatch.mount(document.getElementById("photobatch"), {
        mode: id === "duplicate-finder" ? "dedupe" : "best-shot"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // Photo Timeline Builder (2.5) and Family Photo Date Organizer (2.6) run
  // inside the shared Album Studio engine (EXIF dating, embedded data-URL
  // thumbnails, day/month/year grouping, rename-pattern planner — see
  // album-studio.js). The legacy shared photoTimeline() was retired.
  if (id === "photo-timeline" || id === "family-organizer") {
    layout({ tool, body: body + `<div class="studio" id="albumstudio"></div>` });
    ensureStudios("album").then(() => {
      const studio = window.AlbumStudio.mount(document.getElementById("albumstudio"), {
        mode: id === "photo-timeline" ? "timeline" : "organizer"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // Video Thumbnail Contact Sheet (3.2) and Podcast Silence Map (3.4) run inside
  // the shared Media Studio engine — the seek-capture loop races every seek
  // against a timeout with a previous-frame fallback, and the silence scanner
  // decodes + scans in chunks with a waveform, gap list and CSV/TXT exports
  // (see media-studio.js). The legacy videoThumbs() / silenceMap() were retired.
  if (id === "video-thumbnails" || id === "silence-map") {
    layout({ tool, body: body + `<div class="studio" id="mediastudio"></div>` });
    ensureStudios("media").then(() => {
      const studio = window.MediaStudio.mount(document.getElementById("mediastudio"), {
        mode: id === "video-thumbnails" ? "thumbs" : "silence"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
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
    ensureStudios("sheet").then(() => {
      const studio = window.SheetStudio.mount(document.getElementById("sheetstudio"),
        id === "ironon-sheet" ? "ironon" : "printlayout");
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
    return;
  }

  // Subtitle Speed Checker (4.1) and Subtitle Line Fixer (4.2) run inside the
  // shared Subtitle Studio engine — profile-based CPS/duration/line/overlap
  // audits with CSV + annotated SRT exports, plus a two-pass rewrap with a
  // diff preview and fixed-SRT download (see subtitle-studio.js).
  if (id === "subtitle-speed" || id === "subtitle-linefix") {
    layout({ tool, body: body + `<div class="studio" id="subtitleapp"></div>` });
    ensureStudios("subtitle").then(() => {
      const studio = window.SubtitleStudio.mount(document.getElementById("subtitleapp"), {
        mode: id === "subtitle-speed" ? "speed" : "fix"
      });
      bindPicker(files => studio.addFiles(files));
    }).catch(err => console.error(err));
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

function setActiveNav() {
  const path = location.pathname;
  document.querySelectorAll("#primary-nav a").forEach(a => {
    const href = a.getAttribute("href");
    const isHomeLink = href === "/" && (path === "/" || path.startsWith("/tools/"));
    const isActive = isHomeLink || (href && href !== "/" && (path === href || path.startsWith(href)));
    a.classList.toggle("active", !!isActive);
    if (isActive) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function route() {
  pdfRouteToken += 1;
  pdfManagerRouteToken += 1;
  if (window.PdfPageManager && typeof window.PdfPageManager.unmount === "function") {
    window.PdfPageManager.unmount();
  }
  if (window.PdfTranslator && typeof window.PdfTranslator.unmount === "function") {
    window.PdfTranslator.unmount().catch(err => console.error("PDF Translator cleanup failed", err));
  }
  const hash = location.hash.replace(/^#/, "") || "";
  const path = location.pathname.replace(/^\/+/, "/") || "/";
  let p = path || hash || "/";
  p = p.replace(/\/+$/, "") || "/";

  leaveImageToolkit();
  leaveAudioToolkit();

  if (p === "/" || p === "") { home(); setActiveNav(); return; }

  // Bench Image Toolkit routes. Mounting is async because the registry and
  // runtime are lazy-loaded; a navigation token prevents a slow load from
  // overwriting a page the visitor has already moved on to.
  if (p === "/image" || p.startsWith("/image/")) {
    if (p === "/image" || p === "/image/studio") {
      mountImageRoute(p === "/image" ? "hub" : "studio");
    } else {
      const slug = p.split("/")[2];
      mountImageRoute("tool", slug);
    }
    return;
  }

  // Bench Audio Toolkit routes, lazy-loaded exactly like the image toolkit.
  if (p === "/audio" || p.startsWith("/audio/")) {
    if (p === "/audio") {
      mountAudioRoute("hub");
    } else {
      const slug = p.split("/")[2];
      mountAudioRoute("tool", slug);
    }
    return;
  }

  // The 404 document is static and must not be replaced by the homepage.
  if (document.body && document.body.dataset.page === "404") { setActiveNav(); return; }
  if (p === "/404.html" || p === "/404") { return; }
  if (p === "/about" || p === "/privacy" || p === "/terms" || p === "/contact") {
    setActiveNav();
    return;
  }
  // The 404 document is static and must not be replaced by the homepage.
  if (p === "/404.html" || p === "/404") { return; }
  if (p.startsWith("/tools/")) {
    const tid = p.split("/")[2];
    if (tid) return toolPage(tid);
  }
  home();
}

function subtitleCheck(srtText) {
  const cues = parseSRT(srtText);
  let issues = 0;
  const report = [];
  cues.forEach((cue, i) => {
    const dur = cue.end - cue.start;
    if (dur <= 0) {
      issues++;
      report.push(`Cue ${i+1}: Zero duration (start=${cue.start}, end=${cue.end})`);
    }
  });
  rs.innerHTML = `<div class="notice">Zero-duration cues: ${issues}/${cues.length}</div>`;
  if (report.length) report.forEach(r => console.log(r));
  return issues;
}

installHeaderSearch();
benchRememberCurrentTool();
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
  if (href === "/" && location.pathname !== "/") return;
  // Legal/info pages are fully server-rendered with their own content. A
  // client-side route change would leave the previous page's body in place and
  // keep its title/canonical, so let the browser load the real document.
  if (/^\/(about|privacy|terms|contact)(\/|$)/.test(href)) return;
  const card = a.closest(".tool-card");
  if (card) {
    const cardTitle = card.querySelector("h3");
    if (cardTitle) benchRememberTool(href, cardTitle.textContent.trim(), card.dataset.icon || "");
  }
  e.preventDefault();
  history.pushState(null, "", href);
  closeMobileNav();
  route();
});
