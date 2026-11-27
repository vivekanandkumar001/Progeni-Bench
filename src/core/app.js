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
  normalizeDate,
  normalizePhone
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
  CLARITY_ID,
  TOOLS
} = (typeof window !== "undefined" && window.SiteConfig) ? window.SiteConfig : (typeof require === "function" ? require("../config/site.config.js") : {});

// Initialize Microsoft Clarity (Heatmaps & Session Recording) if configured
if (typeof window !== "undefined" && CLARITY_ID && !window.__clarity_loaded) {
  window.__clarity_loaded = true;
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", CLARITY_ID);
}

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
// Search index is derived from 122 pre-rendered cards. Reading their DOM text
// on every keystroke was the main source of input lag on the home page.
let catalogIndexCache = null;
// Bump this cache tag whenever pdf-translator.js or pdf-page-manager.js changes —
// it prevents stale heuristic browser caches serving old builds after a redeploy.
const PDF_CACHE_TAG = "20261119a";

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
    <section class="tool-head tool-head--compact">
      <div class="tool-head-top">
        <span class="eyebrow">${esc(tool.cat)} · ${hasTranslationBackend ? "Local PDF processing · provider-backed translation" : "100% Private Client-Side"}</span>
        <div class="tool-head-chips">
          <span class="itk-chip">Free · no signup</span>
          <span class="itk-chip">${hasTranslationBackend ? "PDF local · text to DeepL" : "Zero uploads"}</span>
        </div>
      </div>
      <h1><span class="tool-head-icon" data-icon="${esc(benchIcons ? benchIcons.iconName("core", tool.id, tool.icon) : "")}" aria-hidden="true">${benchToolIcon("core", tool.id, tool.icon)}</span>${esc(tool.keyword || tool.name)}</h1>
      <p>${esc(tool.desc)} ${hasTranslationBackend
        ? "<strong>PDF pages stay in your browser.</strong> Extracted text is sent to DeepL through a server-side endpoint."
        : "<strong>Zero server uploads</strong> — all processing happens directly in your browser."}</p>
    </section>

    <section class="toolbox">${body}</section>

    <aside class="quick-answer quick-answer--summary" id="quick-answer" aria-labelledby="quick-answer-title">
      <div class="quick-answer-copy">
        <h2 id="quick-answer-title">At a glance</h2>
        <p class="answer-text"><strong>${esc(tool.name)}</strong> is a free ${esc(String(tool.cat).toLowerCase())} tool that runs in your browser. ${esc(answerSentence)}</p>
      </div>
      <dl class="key-facts">
        ${quickFacts.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
      </dl>
    </aside>

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

function closeNavPanels() {
  if (typeof window !== "undefined" && window.__benchHeader) { window.__benchHeader.closeNavPanels(); return; }
  document.querySelectorAll(".nav-trigger[aria-expanded='true']").forEach(trigger => {
    trigger.setAttribute("aria-expanded", "false");
    const panel = document.getElementById(trigger.getAttribute("aria-controls"));
    if (panel) panel.hidden = true;
  });
}

function closeMobileNav(restoreFocus = false) {
  if (typeof window !== "undefined" && window.__benchHeader) { window.__benchHeader.closeMobileNav(restoreFocus); return; }
  const nav = document.getElementById("primary-nav");
  const hamburger = document.getElementById("hamburger");
  if (!nav) return;
  const wasOpen = nav.classList.contains("open");
  nav.classList.remove("open");
  document.body.classList.remove("nav-open");
  if (hamburger) hamburger.setAttribute("aria-expanded", "false");
  closeNavPanels();
  if (restoreFocus && wasOpen && hamburger) hamburger.focus();
}

function toggleNavPanel(trigger) {
  if (typeof window !== "undefined" && window.__benchHeader) { window.__benchHeader.toggleNavPanel(trigger); return; }
  const panel = document.getElementById(trigger.getAttribute("aria-controls"));
  if (!panel) return;
  const wasOpen = trigger.getAttribute("aria-expanded") === "true";
  closeNavPanels();
  const suggestions = document.getElementById("search-suggestions");
  if (suggestions && !suggestions.hidden) {
    suggestions.hidden = true;
    const searchInput = document.getElementById("search");
    if (searchInput) searchInput.setAttribute("aria-expanded", "false");
  }
  if (wasOpen) {
    trigger.focus();
    return;
  }
  trigger.setAttribute("aria-expanded", "true");
  panel.hidden = false;
}

// Desktop dropdowns and the mobile drawer share the same nav markup, so one
// delegated handler serves both. header.js normally binds these early; guard
// here so cached/standalone app.js never double-binds.
if (typeof window !== "undefined" && !window.__benchNavBound) {
  window.__benchNavBound = true;
  document.addEventListener("click", e => {
    const trigger = e.target.closest && e.target.closest(".nav-trigger");
    if (trigger) {
      toggleNavPanel(trigger);
      return;
    }

    const nav = document.getElementById("primary-nav");
    const onHamburger = !!(e.target.closest && e.target.closest("#hamburger"));

    if (nav && nav.contains(e.target)) {
      if (e.target.closest("a")) {
        closeMobileNav();
        closeNavPanels();
      }
      return;
    }
    if (onHamburger) return;
    closeNavPanels();
    if (nav && nav.classList.contains("open")) closeMobileNav();
  });

  document.getElementById("hamburger")?.addEventListener("click", () => {
    const nav = document.getElementById("primary-nav");
    const hamburger = document.getElementById("hamburger");
    if (!nav || !hamburger) return;
    const open = !nav.classList.contains("open");
    closeNavPanels();
    if (open) {
      const suggestions = document.getElementById("search-suggestions");
      if (suggestions) suggestions.hidden = true;
      const searchInput = document.getElementById("search");
      if (searchInput) searchInput.setAttribute("aria-expanded", "false");
    }
    nav.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    hamburger.setAttribute("aria-expanded", String(open));
  });

  // Escape closes the topmost open layer first, then returns focus sensibly.
  addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const openTrigger = document.querySelector(".nav-trigger[aria-expanded='true']");
    if (openTrigger) {
      closeNavPanels();
      openTrigger.focus();
      return;
    }
    closeMobileNav(true);
  });
}

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
        const kept = [...doc.querySelectorAll("a[href]")];
        const rsEl = $("#result"); if (rsEl) rsEl.classList.add("bm-result");
        const ez = $("#bm-empty"); if (ez) ez.hidden = true;
        const rows = kept.slice(0, 12).map(a => `
          <li class="bm-row">
            <span class="bm-row-icon" aria-hidden="true">${benchToolIcon("core", "bookmark-cleaner", "bookmark")}</span>
            <span class="bm-row-info"><strong>${esc(a.textContent.trim() || "Untitled bookmark")}</strong><small>${esc(a.getAttribute("href") || "")}</small></span>
            <span class="bm-row-tag">kept</span>
          </li>
        `).join("");
        rs.innerHTML = `
          <div class="bm-result-head">
            <div><h2>Bookmarks cleaned</h2><p>Duplicate URLs are removed — the first occurrence of each link is kept.</p></div>
            <span class="bm-chip">${seen.size} unique</span>
          </div>
          <div class="bm-summary">
            <div><b>${links.length}</b><span>Links scanned</span></div>
            <div><b>${seen.size}</b><span>Unique kept</span></div>
            <div><b>${dup}</b><span>Duplicates removed</span></div>
          </div>
          ${kept.length ? `
            <section class="bm-list">
              <div class="bm-section-head"><h3>Kept bookmarks</h3><p>Showing up to 12 links. Folders, order and the original HTML are preserved.</p></div>
              <ul class="bm-rows">${rows}</ul>
              ${kept.length > 12 ? `<p class="bm-note">Showing the first 12 of ${kept.length} kept bookmarks.</p>` : ""}
            </section>
          ` : `
            <div class="bm-no-links"><strong>No bookmark links found.</strong><span>This file has no &lt;a href&gt; entries to clean.</span></div>
          `}
          <div class="bm-actions">
            <button class="btn" id="dl">Download cleaned bookmarks.html</button>
            <span>Standard Netscape bookmark format · opens in any browser</span>
          </div>
        `;
        $("#dl").onclick = () => textDownload(out, "bookmarks-cleaned.html", "text/html");
        break;
      }
      case "calendar-cleaner": {
        const t = await readText(f), lines = t.split(/\r?\n/), out = [], seen = new Set(), dup = [], keptEvents = [];
        let event = "", inside = false;
        const field = (m, fallback) => m ? String(m[1] != null ? m[1] : m[0]).replace(/^[^:]*:/, "").trim() : fallback;
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
              field(summaryMatch, ""),
              field(dtstartMatch, ""),
              field(dtendMatch, "")
            ].join("|");
            if (seen.has(key)) {
              dup.push(event);
            } else {
              seen.add(key);
              out.push(event);
              keptEvents.push({ title: field(summaryMatch, "Untitled event"), start: field(dtstartMatch, "—"), end: field(dtendMatch, "—") });
            }
          }
        }
        const base = t.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g, "");
        const final = base.replace("END:VCALENDAR", out.join("") + "END:VCALENDAR");
        const rsEl = $("#result"); if (rsEl) rsEl.classList.add("cal-result");
        const ez = $("#cal-empty"); if (ez) ez.hidden = true;
        const rows = keptEvents.slice(0, 20).map((e, i) => `
          <li class="cal-row">
            <span class="cal-num">${i + 1}</span>
            <span class="cal-info"><strong>${esc(e.title)}</strong><small>${esc(e.start)} → ${esc(e.end)}</small></span>
            <span class="cal-tag">kept</span>
          </li>
        `).join("");
        rs.innerHTML = `
          <div class="cal-result-head">
            <div><h2>Calendar cleaned</h2><p>Events are compared by title and start/end time — later copies are removed.</p></div>
            <span class="cal-chip">${seen.size} unique event${seen.size === 1 ? "" : "s"}</span>
          </div>
          <div class="cal-summary">
            <div><b>${seen.size + dup.length}</b><span>Events scanned</span></div>
            <div><b>${seen.size}</b><span>Unique kept</span></div>
            <div><b>${dup.length}</b><span>Duplicates removed</span></div>
          </div>
          ${keptEvents.length ? `
            <section class="cal-list">
              <div class="cal-section-head"><h3>Kept events</h3><p>Showing up to 20. The downloaded .ics contains every unique event.</p></div>
              <ul class="cal-rows">${rows}</ul>
              ${keptEvents.length > 20 ? `<p class="cal-note">Showing the first 20 of ${keptEvents.length} events.</p>` : ""}
            </section>
          ` : `
            <div class="cal-no-events"><strong>No events found.</strong><span>This file has no VEVENT blocks to clean.</span></div>
          `}
          <div class="cal-actions">
            <button class="btn" id="dl">Download cleaned .ics</button>
            <span>Standard iCalendar file · opens in any calendar app</span>
          </div>
        `;
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
        const clock = (hour, minute) => String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
        const events = [];
        rows.slice(1).forEach((r, i) => {
          let d = date >= 0 && r[date] ? new Date(r[date]) : nextDay(days[(r[day] || "").toLowerCase()]);
          if (!d || isNaN(d.getTime())) return;
          const [sh, sm] = (r[start] || "09:00").split(":").map(Number), [eh, em] = (r[end] || "10:00").split(":").map(Number);
          const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0));
          const b = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0));
          const summary = String(r[title] || "Class").replace(/[,;]/g, " ");
          ics.push("BEGIN:VEVENT", `UID:ph-${Date.now()}-${i}@${hostDomain}`, `DTSTAMP:${fmt(a)}`, `DTSTART:${fmt(a)}`, `DTEND:${fmt(b)}`, `SUMMARY:${summary}`, "RRULE:FREQ=WEEKLY;COUNT=16", "END:VEVENT");
          events.push({
            title: summary,
            when: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
            time: clock(sh, sm) + " – " + clock(eh, em)
          });
        });
        ics.push("END:VCALENDAR");
        const rsEl = $("#result"); if (rsEl) rsEl.classList.add("tt-result");
        const ez = $("#tt-empty"); if (ez) ez.hidden = true;
        const skipped = rows.length - 1 - events.length;
        const rowsHtml = events.slice(0, 20).map((e, i) => `
          <li class="tt-row">
            <span class="tt-num">${i + 1}</span>
            <span class="tt-info"><strong>${esc(e.title)}</strong><small>${esc(e.when)}</small></span>
            <span class="tt-time">${esc(e.time)}</span>
            <span class="tt-tag">weekly</span>
          </li>
        `).join("");
        rs.innerHTML = `
          <div class="tt-result-head">
            <div><h2>Timetable converted</h2><p>Each row became a weekly event. The first occurrence and time are shown below.</p></div>
            <span class="tt-chip">${events.length} recurring event${events.length === 1 ? "" : "s"}</span>
          </div>
          <div class="tt-summary">
            <div><b>${rows.length - 1}</b><span>Rows scanned</span></div>
            <div><b>${events.length}</b><span>Events created</span></div>
            <div><b>${skipped}</b><span>Rows skipped</span></div>
          </div>
          ${events.length ? `
            <section class="tt-list">
              <div class="tt-section-head"><h3>Scheduled classes</h3><p>Showing up to 20. The downloaded .ics contains every event.</p></div>
              <ul class="tt-rows">${rowsHtml}</ul>
              ${events.length > 20 ? `<p class="tt-note">Showing the first 20 of ${events.length} events.</p>` : ""}
            </section>
          ` : `
            <div class="tt-no-events"><strong>No events could be created.</strong><span>Check your day/date values and try again.</span></div>
          `}
          <div class="tt-rule">
            <span class="tt-rule-badge">iCal</span>
            <div><strong>Weekly repeat included</strong><small>RRULE:FREQ=WEEKLY;COUNT=16 · times exported in UTC so calendar apps read them correctly.</small></div>
          </div>
          <div class="tt-actions">
            <button class="btn" id="dl">Download timetable.ics</button>
            <span>Standard .ics · works with Google Calendar, Outlook and Apple Calendar</span>
          </div>
        `;
        $("#dl").onclick = () => textDownload(ics.join("\r\n"), "timetable.ics", "text/calendar");
        break;
      }
      case "svg-cleaner": {
        const raw = await readText(f);
        const cleaned = cleanSVG(raw);
        const rawDoc = new DOMParser().parseFromString(raw, "image/svg+xml");
        const cleanDoc = new DOMParser().parseFromString(cleaned, "image/svg+xml");
        const rawTags = rawDoc.querySelectorAll("*").length;
        const cleanTags = cleanDoc.querySelectorAll("*").length;
        const removedTags = Math.max(0, rawTags - cleanTags);
        const previewUrl = URL.createObjectURL(new Blob([cleaned], { type: "image/svg+xml" }));
        const rsEl = $("#result"); if (rsEl) rsEl.classList.add("sv-result");
        const ez = $("#sv-empty"); if (ez) ez.hidden = true;
        rs.innerHTML = `
          <div class="sv-result-head">
            <div><h2>SVG sanitized</h2><p>Scripts, event handlers, unsafe URLs and editor metadata have been stripped.</p></div>
            <span class="sv-chip">${cleanTags} element${cleanTags === 1 ? "" : "s"} kept</span>
          </div>
          <div class="sv-summary">
            <div><b>${fmtBytes(raw.length)}</b><span>Original size</span></div>
            <div><b>${fmtBytes(cleaned.length)}</b><span>Cleaned size</span></div>
            <div><b>${removedTags}</b><span>Elements removed</span></div>
          </div>
          <div class="sv-grid">
            <figure class="sv-preview">
              <div class="sv-preview-frame"><img src="${previewUrl}" alt="Preview of the sanitized SVG"></div>
              <figcaption>Cleaned SVG preview — rendered locally in your browser.</figcaption>
            </figure>
            <div class="sv-checks">
              <h3>What was removed</h3>
              <ul>
                <li><span aria-hidden="true">✓</span><div><strong>Active content</strong><small>&lt;script&gt;, &lt;iframe&gt;, &lt;object&gt; and event-handler attributes.</small></div></li>
                <li><span aria-hidden="true">✓</span><div><strong>Unsafe URLs</strong><small>javascript:, vbscript: and data: links in href or style values.</small></div></li>
                <li><span aria-hidden="true">✓</span><div><strong>Editor metadata</strong><small>Inkscape, Sodipodi and Sketch namespaces plus risky style blocks.</small></div></li>
              </ul>
              <p class="sv-privacy"><strong>100% local.</strong> Your SVG never leaves this device.</p>
            </div>
          </div>
          <div class="sv-actions">
            <button class="btn" id="dl">Download cleaned SVG</button>
            <span>Valid SVG/XML · ready to use in web, print or design tools</span>
          </div>
        `;
        $("#dl").onclick = () => textDownload(cleaned, "cleaned.svg", "image/svg+xml");
        break;
      }
      case "video-safe-zone": { await safeZone(f, rs); break; }
      case "bookmark-reading": {
        const t = await readText(f);
        const doc = new DOMParser().parseFromString(t, "text/html");
        const rawAnchors = [...doc.querySelectorAll("a[href]")].map(a => ({ href: a.href, text: a.textContent || a.href }));
        const safeLinks = filterBookmarkLinks(rawAnchors);
        const skipped = rawAnchors.length - safeLinks.length;
        const domain = href => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch (e) { return "link"; } };
        const as = safeLinks.map(a => `<li><a href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.text)}</a></li>`).join("");
        const out = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Offline Reading List</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6}li{margin:10px 0}a{color:#1d4ed8;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><h1>Reading List</h1><p>Exported from Progeni.</p><ul>${as}</ul></body></html>`;
        const rsEl = $("#result"); if (rsEl) rsEl.classList.add("rl-result");
        const ez = $("#rl-empty"); if (ez) ez.hidden = true;
        const rows = safeLinks.slice(0, 20).map((a, i) => `
          <li class="rl-row">
            <span class="rl-num">${i + 1}</span>
            <span class="rl-info"><strong>${esc(a.text || "Untitled link")}</strong><small>${esc(a.href)}</small></span>
            <span class="rl-domain">${esc(domain(a.href))}</span>
          </li>
        `).join("");
        rs.innerHTML = `
          <div class="rl-result-head">
            <div><h2>Reading list ready</h2><p>Unsafe and malformed links are filtered out before export.</p></div>
            <span class="rl-chip">${safeLinks.length} usable link${safeLinks.length === 1 ? "" : "s"}</span>
          </div>
          <div class="rl-summary">
            <div><b>${rawAnchors.length}</b><span>Links found</span></div>
            <div><b>${safeLinks.length}</b><span>Kept for reading</span></div>
            <div><b>${skipped}</b><span>Filtered out</span></div>
          </div>
          ${safeLinks.length ? `
            <section class="rl-list">
              <div class="rl-section-head"><h3>Links in your list</h3><p>Showing up to 20. The downloaded HTML contains every kept link.</p></div>
              <ol class="rl-rows">${rows}</ol>
              ${safeLinks.length > 20 ? `<p class="rl-note">Showing the first 20 of ${safeLinks.length} links.</p>` : ""}
            </section>
          ` : `
            <div class="rl-no-links"><strong>No usable links found.</strong><span>The file had no safe http(s) links to add to a reading list.</span></div>
          `}
          <div class="rl-actions">
            <button class="btn" id="dl">Download reading-list.html</button>
            <span>Simple offline HTML · opens in any browser · keeps hrefs intact</span>
          </div>
        `;
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
  const rsEl = $("#result"); if (rsEl) rsEl.classList.add("vz-result");
  const ez = $("#vz-empty"); if (ez) ez.hidden = true;
  rs.innerHTML = `
    <div class="vz-result-head">
      <h2>Overlay ready — ${esc(pName)}</h2>
      <span class="vz-result-chip">9:16 guide · ${im.width} × ${im.height} px</span>
    </div>
    <div class="notice">Red zones show areas obscured by <strong>${pName} UI</strong> (captions, right action buttons, header tabs). Keep critical text inside the center safe area!</div>
    <figure class="vz-preview">
      <img alt="Safe-zone overlay preview for ${esc(pName)}" src="${URL.createObjectURL(b)}">
      <figcaption>Your frame with the ${esc(pName)} guide drawn on it. Download it to use as a reference in your editor.</figcaption>
    </figure>
    <div class="vz-result-actions">
      <button class="btn" id="dl-overlay">Download overlay PNG</button>
      <span class="vz-result-hint">Switch platform above to compare overlays instantly.</span>
    </div>
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
    const rsEl = $("#result"); if (rsEl) rsEl.classList.add("cs-result");
    const ez = $("#cs-empty"); if (ez) ez.hidden = true;
    rs.innerHTML = `
      <div class="cs-result-head">
        <div><h2>Split a column</h2><p>Choose the column that holds combined values and the character that separates them.</p></div>
        <span class="cs-chip">${rows.length - 1} data rows · ${h.length} columns</span>
      </div>
      <div class="cs-controls">
        <label class="cs-field"><span>Column to split</span><select id="col">${h.map((x, i) => `<option value="${i}">${esc(x || "Column " + (i + 1))}</option>`).join("")}</select></label>
        <label class="cs-field"><span>Delimiter</span><input id="delim" value=" " maxlength="3" aria-label="Delimiter"><small>Use a space, comma, slash or any short separator.</small></label>
        <button class="btn" id="go">Preview split</button>
      </div>
      <div class="cs-preview" id="cs-preview">
        <div class="cs-preview-empty"><strong>No split preview yet.</strong><span>Pick a column and delimiter, then run the split to see the new headers and sample rows.</span></div>
      </div>
      <div class="cs-download" id="cs-download"></div>
    `;
    $("#go").onclick = () => {
      const c = +$("#col").value, d = $("#delim").value || " ";
      let maxParts = 1;
      const splitRows = rows.map((r, ri) => {
        const parts = String(r[c] || "").split(d);
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
      const cell = x => "<td>" + esc(String(x == null ? "" : x)) + "</td>";
      const previewEl = $("#cs-preview");
      previewEl.innerHTML = `
        <div class="cs-preview-head"><h3>Preview</h3><span>${maxParts} part${maxParts === 1 ? "" : "s"} from “${esc(headerColName)}”</span></div>
        <div class="cs-tablewrap"><table class="cs-table"><thead><tr>${headerRow.map(x => "<th>" + esc(String(x)) + "</th>").join("")}</tr></thead>
          <tbody>${out.slice(1, 9).map(r => "<tr>" + r.map(cell).join("") + "</tr>").join("")}</tbody></table></div>
        <p class="cs-note">Showing up to 8 sample rows. The download contains all ${out.length - 1} rows.</p>
      `;
      $("#cs-download").innerHTML = `
        <div class="cs-ready"><strong>Ready to download.</strong><span>${out.length - 1} rows · ${out[0].length} columns · UTF-8 CSV</span></div>
        <button class="btn" id="dl">Download cleaned CSV</button>
      `;
      $("#dl").onclick = () => textDownload(csvOut(out), "cleaned.csv", "text/csv");
    };
  } else {
    // csv-date or csv-date-preview mode
    const rsEl = $("#result"); if (rsEl) rsEl.classList.add("cs-result");
    const ez = $("#cs-date-empty"); if (ez) ez.hidden = true;
    rs.innerHTML = `
      <div class="cs-result-head">
        <div><h2>Normalize dates</h2><p>Choose the column holding dates and the format you want in the cleaned file.</p></div>
        <span class="cs-chip">${rows.length - 1} data rows · ${h.length} columns</span>
      </div>
      <div class="cs-controls">
        <label class="cs-field"><span>Date column</span><select id="col">${h.map((x, i) => `<option value="${i}">${esc(x || "Column " + (i + 1))}</option>`).join("")}</select></label>
        <label class="cs-field"><span>Target format</span><select id="fmt"><option value="YYYY-MM-DD">ISO standard (YYYY-MM-DD)</option><option value="MM/DD/YYYY">US standard (MM/DD/YYYY)</option><option value="DD/MM/YYYY">European standard (DD/MM/YYYY)</option></select><small>Ambiguous values are flagged before conversion.</small></label>
        <button class="btn" id="go">Preview dates</button>
      </div>
      <div class="cs-preview" id="cs-date-preview">
        <div class="cs-preview-empty"><strong>No preview yet.</strong><span>Pick a column and target format, then run the normalizer to sample the conversions.</span></div>
      </div>
      <div class="cs-download" id="cs-date-download"></div>
    `;
    $("#go").onclick = () => {
      const c = +$("#col").value, fmt = $("#fmt").value;
      const dlWrap = $("#cs-date-download");
      if (dlWrap) dlWrap.innerHTML = "";
      // First pass: identify ambiguous dates (where day and month both <= 12)
      const ambiguous = [];
      const rowIsAmbiguous = new Map();
      // Keep indices aligned with `rows` (header is row 0). The preview and
      // buildOut both use these indices, so an off-by-one would swap the wrong
      // data row when the visitor chooses the European interpretation.
      rows.forEach((r, i) => {
        if (!i) return;
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

      const cell = x => "<td>" + esc(String(x == null ? "" : x)) + "</td>";
      const renderPreview = out => {
        const preview = $("#cs-date-preview");
        if (!preview) return;
        const samples = out.slice(1, 9).map((r, i) => {
          const original = rows[i + 1][c];
          const changed = String(original) !== String(r[c]);
          return "<tr>" + cell(original) + cell(r[c]) + '<td class="cs-date-state ' + (changed ? "cs-date-state--changed" : "") + '">' + (changed ? "changed" : "same") + "</td></tr>";
        }).join("");
        preview.innerHTML = `
          <div class="cs-preview-head"><h3>Conversion preview</h3><span>${fmt} · ${rows.length - 1} rows</span></div>
          <div class="cs-tablewrap"><table class="cs-table"><thead><tr><th>Original</th><th>Normalized</th><th>Status</th></tr></thead><tbody>${samples}</tbody></table></div>
          <p class="cs-note">Showing up to 8 sample rows. The download contains all ${out.length - 1} rows.</p>
        `;
      };

      const writeResult = out => {
        renderPreview(out);
        if (!dlWrap) return;
        dlWrap.innerHTML = `
          <div class="cs-ready"><strong>Ready to download.</strong><span>${out.length - 1} rows · ${fmt} · UTF-8 CSV</span></div>
          <button class="btn" id="dl">Download normalized CSV</button>
        `;
        $("#dl").onclick = () => textDownload(csvOut(out), "normalized.csv", "text/csv");
      };

      if (ambiguous.length === 0) { writeResult(buildOut("us")); return; }

      // Preview + explicit choice for ambiguous dates
      const previewHtml = `
        <div id="ambiguous-preview" class="cs-ambiguity">
          <div class="cs-ambiguity-head">
            <span class="cs-ambiguity-badge">${ambiguous.length}</span>
            <div><strong>Ambiguous dates found</strong><p>${ambiguous.length} value${ambiguous.length === 1 ? "" : "s"} could be read as US (MM/DD/YYYY) or European (DD/MM/YYYY). Choose how to interpret them before downloading.</p></div>
          </div>
          <div class="cs-ambiguity-list">
            ${ambiguous.slice(0, 8).map(a => `
              <div class="cs-ambiguity-row">
                <span class="cs-ambiguity-row-id">Row ${a.rowIndex + 1}</span>
                <code>${esc(a.original)}</code>
                <span>US <strong>${a.val1}/${a.val2}/${a.year}</strong></span>
                <span>EU <strong>${a.val2}/${a.val1}/${a.year}</strong></span>
              </div>
            `).join("")}
          </div>
          ${ambiguous.length > 8 ? `<p class="cs-note">Showing the first 8 of ${ambiguous.length} ambiguous values.</p>` : ""}
          <div class="cs-ambiguity-actions">
            <label class="sr-only" for="resolveAmbiguous">How to read ambiguous dates</label>
            <select id="resolveAmbiguous">
              <option value="us">Apply US format (MM/DD/YYYY)</option>
              <option value="eu">Apply European format (DD/MM/YYYY)</option>
            </select>
            <button class="btn" id="confirmAmbiguous" type="button">Apply &amp; continue</button>
          </div>
        </div>
      `;

      const old = $("#ambiguous-preview");
      if (old) old.remove();
      $("#cs-date-preview").insertAdjacentHTML("afterbegin", previewHtml);
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
  const rows = csvParse(t).filter(r => r.some(c => String(c).trim() !== ""));
  if (!rows.length) {
    rs.innerHTML = '<div class="error">No CSV rows found. Paste a CSV with a header row or upload a file.</div>';
    return;
  }
  const h = rows[0].map(x => String(x).toLowerCase());
  const ei = h.findIndex(x => x.includes("email"));
  const pi = h.findIndex(x => x.includes("phone") || x.includes("mobile") || x.includes("cell"));
  const seen = new Map(), out = [rows[0]], dups = [];
  rows.slice(1).forEach((r, i) => {
    const k = buildContactKey(r, ei, pi);
    if (seen.has(k)) dups.push({ row: i + 2, data: r, first: seen.get(k) });
    else { seen.set(k, i + 2); out.push(r); }
  });
  const label = (i) => esc(h[i] ? h[i].replace(/[_-]/g, " ") : "Column " + (i + 1));
  const preview = (list, count) => list.slice(0, count).map(r =>
    "<tr>" + r.map(c => "<td>" + esc(String(c == null ? "" : c)) + "</td>").join("") + "</tr>"
  ).join("");
  const dupRows = dups.slice(0, 8).map(d =>
    '<tr><td class="cd-num">' + d.row + '</td><td class="cd-num">' + d.first + "</td>" +
    d.data.map(c => "<td>" + esc(String(c == null ? "" : c)) + "</td>").join("") + "</tr>"
  ).join("");
  const rsEl = $("#result"); if (rsEl) rsEl.classList.add("cd-result");
  const ez = $("#cd-empty"); if (ez) ez.hidden = true;
  rs.innerHTML = `
    <div class="cd-result-head">
      <h2>Deduplication complete</h2>
      <span class="cd-result-chip">${ei >= 0 || pi >= 0 ? "Email / phone match" : "Full-row match"}</span>
    </div>
    <div class="cd-summary">
      <div><b>${rows.length - 1}</b><span>Rows read</span></div>
      <div><b>${out.length - 1}</b><span>Unique kept</span></div>
      <div><b>${dups.length}</b><span>Duplicates removed</span></div>
      <div><b>${out.length - 1 ? Math.round(dups.length / (rows.length - 1) * 100) : 0}%</b><span>Duplicate rate</span></div>
    </div>
    <div class="cd-tables">
      <section class="cd-table-panel">
        <h3>Kept contacts <span>${out.length - 1}</span></h3>
        <div class="cd-tablewrap"><table class="cd-table"><thead><tr>${h.map(label).map(x => "<th>" + x + "</th>").join("")}</tr></thead>
          <tbody>${preview(out.slice(1), 10)}</tbody></table></div>
        ${out.length > 11 ? '<p class="cd-table-note">Showing the first 10 kept contacts. The download contains all ' + (out.length - 1) + '.</p>' : ""}
      </section>
      <section class="cd-table-panel cd-table-panel--dups">
        <h3>Removed duplicates <span>${dups.length}</span></h3>
        ${dups.length
          ? '<div class="cd-tablewrap"><table class="cd-table"><thead><tr><th>Row</th><th>Matches</th>' + h.map(label).map(x => "<th>" + x + "</th>").join("") + '</tr></thead><tbody>' + dupRows + "</tbody></table></div>" + (dups.length > 8 ? '<p class="cd-table-note">Showing the first 8 removed rows.</p>' : "")
          : '<div class="cd-no-dups"><strong>No duplicates found.</strong><span>Every contact was kept in the cleaned file.</span></div>'}
      </section>
    </div>
    <div class="cd-result-actions">
      <button class="btn" id="dl">Download deduplicated CSV</button>
      <span>Header row preserved · original column order kept · works fully offline</span>
    </div>
  `;
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

  const withPhone = cards.filter(c => c._phone).length;
  const initial = name => String(name || "?").trim().charAt(0).toUpperCase();
  const rsEl = $("#result"); if (rsEl) rsEl.classList.add("vc-result");
  const ez = $("#vc-empty"); if (ez) ez.hidden = true;
  const render = () => {
    rs.innerHTML = `
      <div class="vc-result-head">
        <div><h2>vCards loaded</h2><p>Review possible duplicates, then download the cleaned set or any single contact.</p></div>
        <span class="vc-chip">${cards.length} card${cards.length === 1 ? "" : "s"} · ${dedupeGroups.length} duplicate group${dedupeGroups.length === 1 ? "" : "s"}</span>
      </div>
      <div class="vc-summary">
        <div><b>${cards.length}</b><span>Contacts</span></div>
        <div><b>${withPhone}</b><span>With phone</span></div>
        <div><b>${dedupeGroups.length}</b><span>Duplicate groups</span></div>
      </div>
      ${dedupeGroups.length > 0 ? `
        <section class="vc-dedupe">
          <div class="vc-section-head"><h3>Review possible duplicates</h3><p>Cards sharing a phone number are grouped. Decide whether to merge or keep each group separate.</p></div>
          <div class="vc-groups">
            ${dedupeGroups.map(g => {
              const keep = g.action === "merge" ? g.members[0] : null;
              return `
              <div class="vc-group">
                <div class="vc-group-head">
                  <span class="vc-group-id">Group ${g.gi + 1}</span>
                  <span class="vc-group-phone">${esc(g.phone)}</span>
                </div>
                <div class="vc-group-names">
                  ${g.members.map(i => `<span class="vc-person"><span class="vc-avatar">${esc(initial(cards[i].name))}</span>${esc(cards[i].name)}</span>`).join("")}
                </div>
                <div class="vc-group-actions">
                  <button class="btn btn-sm" data-act="merge" data-g="${g.gi}">Merge into one</button>
                  <button class="btn secondary btn-sm" data-act="keep" data-g="${g.gi}">Keep separate</button>
                </div>
                <div class="vc-group-status ${keep === null ? "vc-group-status--keep" : "vc-group-status--merge"}">Action: <strong>${keep === null ? "keep separate" : `merge → keeping ${esc(cards[keep].name)}`}</strong></div>
              </div>`;
            }).join("")}
          </div>
        </section>
      ` : `
        <div class="vc-no-dups"><strong>No duplicate phone numbers found.</strong><span>Every card is distinct — download the set as-is.</span></div>
      `}
      <div class="vc-actions">
        <button class="btn" id="dl-merge">Download merged .vcf</button>
        <span>Merge drops later cards in each group. Everything runs locally.</span>
      </div>
      <section class="vc-list">
        <div class="vc-section-head"><h3>Individual cards</h3><p>Save any single contact as its own .vcf file.</p></div>
        <ul class="vc-cards">
          ${cards.map((c, i) => `
            <li class="vc-card">
              <span class="vc-avatar vc-avatar--lg">${esc(initial(c.name))}</span>
              <div class="vc-card-info"><strong>${esc(c.name)}</strong><small>${c._phone ? esc(c._phone) : "No phone number"}</small></div>
              <button class="btn secondary btn-sm" data-save="${i}">Save .vcf</button>
            </li>
          `).join("")}
        </ul>
      </section>
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

  // Square carousel tiles: cap the count at how many full-height squares fit
  // across the source, then slice adjacent crops from left to right.
  const maxSquareParts = Math.max(2, Math.floor(im.width / Math.max(1, im.height)));
  const actualParts = Math.max(2, Math.min(parts, maxSquareParts));
  const tileWidth = Math.max(1, Math.floor(im.width / actualParts));
  const tileHeight = Math.max(1, Math.min(tileWidth, im.height));
  const sourceY = Math.max(0, Math.floor((im.height - tileHeight) / 2));

  const c = document.createElement("canvas"), ctx = c.getContext("2d");
  const tileBlobs = [];
  const warned = tileWidth > im.height;

  for (let i = 0; i < actualParts; i++) {
    c.width = tileWidth;
    c.height = tileHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(im, i * tileWidth, sourceY, tileWidth, tileHeight, 0, 0, c.width, c.height);
    tileBlobs.push(await canvasBlob(c));
  }

  const rsEl = $("#result"); if (rsEl) rsEl.classList.add("pg-result");
  const ez = $("#pg-empty"); if (ez) ez.hidden = true;
  const tileCards = tileBlobs.map((blob, i) => `
    <figure class="pg-tile">
      <button type="button" class="pg-tile-media" data-tile="${i}" aria-label="Download tile ${i + 1}">
        <img src="${URL.createObjectURL(blob)}" alt="Panorama tile ${i + 1} of ${tileBlobs.length}">
      </button>
      <figcaption class="pg-tile-foot">
        <span class="pg-tile-num">Tile ${i + 1}</span>
        <button type="button" class="btn secondary btn-sm" data-tile="${i}">Download</button>
      </figcaption>
    </figure>
  `).join("");

  rs.innerHTML = `
    <div class="pg-result-head">
      <div><h2>Panorama sliced</h2><p>Tiles are ready to download in order — click any preview to save that slide.</p></div>
      <span class="pg-chip">${tileBlobs.length} tile${tileBlobs.length === 1 ? "" : "s"}</span>
    </div>
    <div class="pg-summary">
      <div><b>${im.width} × ${im.height}</b><span>Source pixels</span></div>
      <div><b>${tileWidth} × ${tileHeight}</b><span>Each tile</span></div>
      <div><b>${tileBlobs.length}</b><span>Carousel slides</span></div>
    </div>
    ${warned ? `<div class="pg-warn">Tiles use the full image height, so each slide is slightly wider than it is tall.</div>` : ""}
    ${actualParts !== parts ? `<div class="pg-note">The requested count was adjusted to fit this image's proportions.</div>` : ""}
    <section class="pg-list">
      <div class="pg-section-head"><h3>Carousel tiles</h3><p>Click a tile or use its Download button. Files are named in slide order.</p></div>
      <div class="pg-tiles" id="pg">${tileCards}</div>
    </section>
    <div class="pg-actions">
      <button class="btn" id="dl-all-tiles">Download all ${tileBlobs.length} tiles</button>
      <span>Each tile is a high-resolution PNG · saved locally from your browser</span>
    </div>
  `;

  const downloadTile = i => downloadBlob(tileBlobs[i], `panorama-tile-${i + 1}.png`);
  $("#pg").querySelectorAll("[data-tile]").forEach(el => {
    el.onclick = () => downloadTile(Number(el.dataset.tile));
  });
  const dlAll = $("#dl-all-tiles");
  dlAll.onclick = async () => {
    for (let i = 0; i < tileBlobs.length; i++) {
      downloadTile(i);
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
  if (catalogIndexCache) return catalogIndexCache;
  catalogIndexCache = [...document.querySelectorAll("#grid .tool-card")].map(card => {
    const title = card.querySelector("h3") || card.querySelector("h2");
    return {
      href: card.getAttribute("href") || "/",
      name: title ? title.textContent.trim() : "",
      icon: card.dataset.icon || (benchIcons ? benchIcons.iconFromHref(card.getAttribute("href")) : ""),
      category: benchCategoryName(card.dataset.category),
      text: benchNormalize(`${card.dataset.search || ""} ${card.textContent}`)
    };
  }).filter(item => item.name);
  return catalogIndexCache;
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

  // Hiding/showing 122 cards is layout work. Coalesce rapid keystrokes into one
  // animation frame so typing stays responsive on phones.
  let catalogRenderQueued = false;
  const queueCatalogRender = () => {
    if (!benchCatalogRender) return;
    if (typeof requestAnimationFrame !== "function") { benchCatalogRender(); return; }
    if (catalogRenderQueued) return;
    catalogRenderQueued = true;
    requestAnimationFrame(() => {
      catalogRenderQueued = false;
      benchCatalogRender();
    });
  };

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
      queueCatalogRender();
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
  input.addEventListener("focus", () => {
    closeNavPanels();
    if (input.value.trim()) refresh();
  });
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
  const countsByCategory = new Map();
  cards.forEach(card => {
    const key = card.dataset.category;
    if (key) countsByCategory.set(key, (countsByCategory.get(key) || 0) + 1);
  });
  const categories = categorySelect
    ? [...categorySelect.options].slice(1).map(option => {
        const parts = option.value.split(":");
        const toolkit = parts[0];
        const rawText = (option.textContent || "").trim();
        const label = rawText.includes("·") ? rawText.split("·").slice(1).join("·").trim() : (rawText || parts.slice(1).join(":"));
        return {
          value: option.value,
          toolkit,
          name: label,
          allName: toolkit === "image" && label === "Convert" ? "Image Convert" : label,
          count: countsByCategory.get(option.value) || 0
        };
      })
    : [];

  const clearButtons = [...document.querySelectorAll("[data-clear-filters]")];

  const renderChips = () => {
    if (!chipRow) return;
    const visible = categories.filter(item => activeToolkit === "all" || item.toolkit === activeToolkit);
    const allCount = visible.reduce((sum, item) => sum + item.count, 0);
    chipRow.innerHTML = `<button class="category-filter-button${activeCategory === "all" ? " active" : ""}" type="button" data-category-tab="all" aria-pressed="${activeCategory === "all"}">All categories <span class="cat-chip-count">${allCount}</span></button>`
      + visible.map(item => {
        const label = activeToolkit === "all" ? item.allName : item.name;
        return `<button class="category-filter-button${activeCategory === item.value ? " active" : ""}" type="button" data-category-tab="${esc(item.value)}" aria-pressed="${activeCategory === item.value}">${esc(label)} <span class="cat-chip-count">${item.count}</span></button>`;
      }).join("");
  };

  const render = () => {
    const query = searchEl ? searchEl.value.trim() : "";
    const terms = benchNormalize(query).split(/\s+/).filter(Boolean);
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
    const hasFilters = activeToolkit !== "all" || activeCategory !== "all" || !!query;
    if (countEl) {
      countEl.classList.toggle("is-filtered", hasFilters);
      countEl.innerHTML = hasFilters
        ? `Showing <strong>${visible}</strong> of ${total} tools`
        : `<strong>${total}</strong> tools`;
    }
    clearButtons.forEach(btn => {
      if (btn.closest(".catalog-toolbar")) btn.hidden = !hasFilters;
    });
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

  // The pre-rendered catalog was rebuilt — discard the derived search index.
  catalogIndexCache = null;
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
      .then(() => loadScript(`/pdf-page-manager.js?v=${PDF_CACHE_TAG}`))
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
      .then(() => loadScript(`/pdf-translator.js?v=${PDF_CACHE_TAG}`))
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

  if (id === "wallpaper") {
    body = `
      <section class="wp-intake" aria-labelledby="wp-intake-title">
        <div class="wp-intake-copy">
          <span class="eyebrow">Step 1 · Source photos</span>
          <h2 id="wp-intake-title">Add photos to crop</h2>
          <p>Drop in one photo or a whole batch. Pick an exact wallpaper size in the cropper below — every image is processed locally.</p>
        </div>
        ${body}
      </section>
    `;
  }

  if (id === "duplicate-finder") {
    body = `
      <section class="pb-intake" aria-labelledby="pb-intake-title">
        <div class="pb-intake-copy">
          <span class="eyebrow">Step 1 · Add files</span>
          <h2 id="pb-intake-title">Choose files to scan</h2>
          <p>Drop in photos, documents or any other files. Exact copies are matched by content, and images are also checked for resized near-duplicates.</p>
        </div>
        ${body}
      </section>
    `;
  }

  if (id === "best-shot") {
    body = `
      <section class="pb-intake bs-intake" aria-labelledby="bs-intake-title">
        <div class="pb-intake-copy">
          <span class="eyebrow">Step 1 · Add burst photos</span>
          <h2 id="bs-intake-title">Choose the frames to rank</h2>
          <p>Drop in several takes from the same moment. Each photo is scored locally for sharpness, exposure and contrast — no upload, no cloud AI.</p>
        </div>
        ${body}
      </section>
    `;
  }

  if (id === "photo-timeline") {
    body = `
      <section class="pb-intake al-intake" aria-labelledby="al-intake-title">
        <div class="pb-intake-copy">
          <span class="eyebrow">Step 1 · Add photos</span>
          <h2 id="al-intake-title">Build your photo timeline</h2>
          <p>Drop in a whole event or folder. EXIF dates are read locally and each photo becomes part of one self-contained HTML album.</p>
        </div>
        ${body}
      </section>
    `;
  }

  if (id === "family-organizer") {
    body = `
      <section class="pb-intake al-intake" aria-labelledby="al-intake-title">
        <div class="pb-intake-copy">
          <span class="eyebrow">Step 1 · Add family files</span>
          <h2 id="al-intake-title">Gather the years to organize</h2>
          <p>Add photos and documents together. Review a year → month → day tree, correct dates, and export a planned folder structure.</p>
        </div>
        ${body}
      </section>
    `;
  }

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
      <div class="chap-workspace">
        <div class="chap-grid">
          <section class="chap-panel chap-input" aria-labelledby="chap-input-title">
            <h2 id="chap-input-title">Chapter source</h2>
            <p class="chap-hint">One chapter per line — <code>MM:SS Title</code> or <code>HH:MM:SS Title</code>. Lines are sorted and normalized automatically.</p>
            <label class="chap-field" for="chap">Timestamps &amp; titles
              <textarea id="chap" rows="9" spellcheck="false" placeholder="00:00 Introduction&#10;02:15 Main Topic&#10;06:40 Key Insights&#10;11:20 Conclusion"></textarea>
            </label>
            <div class="chap-input-bar">
              <span class="chap-count" id="chap-count">0 lines</span>
              <div class="chap-input-actions">
                <button type="button" class="btn secondary btn-sm" id="chap-sample">Load example</button>
                <button type="button" class="btn secondary btn-sm" id="chap-clear">Clear</button>
              </div>
            </div>
          </section>
          <section class="chap-panel chap-output" aria-labelledby="chap-output-title">
            <div class="chap-output-head">
              <h2 id="chap-output-title">Cleaned chapters</h2>
              <span class="chap-status" id="chap-status" hidden></span>
            </div>
            <div id="chap-preview" class="notice chap-preview" style="display:none;"></div>
          </section>
        </div>
        <div class="chap-actions">
          <button class="btn" id="dl-chap" disabled>Download chapters.txt</button>
          <button class="btn secondary" id="clean-chap">Validate &amp; clean</button>
          <span class="chap-actions-hint">Everything runs locally — your chapter list is never uploaded.</span>
        </div>
      </div>
    `;
    layout({ tool, body });
    const sample = "00:00 Introduction\n02:15 Main Topic\n06:40 Key Insights\n11:20 Conclusion";
    const updatePreview = () => {
      const raw = $("#chap").value;
      const hasInput = !!raw.trim();
      const lines = raw.split(/\r?\n/).filter(l => l.trim()).length;
      const count = $("#chap-count");
      if (count) count.textContent = lines + (lines === 1 ? " line" : " lines");
      const res = parseChapters(raw);
      const prev = $("#chap-preview");
      const status = $("#chap-status");
      const dl = $("#dl-chap");
      if (dl) dl.disabled = !hasInput || res.entries.length === 0;
      if (!prev) return;
      if (hasInput && (res.issues.length || res.entries.length)) {
        let html = "";
        if (res.issues.length) {
          html += '<ul class="chap-issues">' + res.issues.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>";
        }
        if (res.entries.length) {
          const rows = res.entries.map((e, i) => {
            const gap = i === 0 ? "" : fmtTime(e.ts - res.entries[i - 1].ts);
            return '<li class="chap-row"><span class="chap-time">' + esc(fmtTime(e.ts)) + '</span><span class="chap-title">' + esc(e.title) + '</span>' + (gap ? '<span class="chap-gap">+' + esc(gap) + '</span>' : "") + "</li>";
          }).join("");
          html += '<ol class="chap-rows">' + rows + "</ol>";
          html += '<details class="chap-raw"><summary>Show normalized text</summary><pre>' + esc(res.clean) + "</pre></details>";
        }
        prev.innerHTML = html;
        prev.style.display = "block";
        prev.className = "chap-preview " + (res.issues.length ? "warn" : "notice");
        if (status) {
          status.hidden = false;
          status.textContent = res.entries.length + (res.entries.length === 1 ? " chapter" : " chapters") + (res.issues.length ? " · " + res.issues.length + " note" + (res.issues.length === 1 ? "" : "s") : " · ready");
          status.className = "chap-status " + (res.issues.length ? "chap-status--warn" : "chap-status--ok");
        }
      } else {
        prev.style.display = "none";
        if (status) status.hidden = true;
      }
    };
    $("#clean-chap").onclick = updatePreview;
    $("#dl-chap").onclick = () => {
      const chapters = parseChapters($("#chap").value);
      if (!chapters.entries.length) return;
      textDownload(chapters.clean, "chapters.txt");
    };
    const sampleBtn = $("#chap-sample");
    if (sampleBtn) sampleBtn.onclick = () => { $("#chap").value = sample; updatePreview(); };
    const clearBtn = $("#chap-clear");
    if (clearBtn) clearBtn.onclick = () => { $("#chap").value = ""; updatePreview(); $("#chap").focus(); };
    let chapTimer = 0;
    $("#chap").addEventListener("input", () => {
      clearTimeout(chapTimer);
      chapTimer = setTimeout(updatePreview, 180);
    });
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

  if (id === "contact-dedupe") {
    const sampleCsv = "name,email,phone,city\nAisha Rao,aisha@example.com,9876543210,Delhi\nRavi Kumar,ravi@example.com,9876543211,Mumbai\nAisha R.,aisha@example.com,9876543210,Delhi\nMeera Shah,meera@example.com,9822334455,Pune\nRavi K.,ravi@example.com,9876543211,Mumbai";
    body = `
      <div class="cd-workspace">
        <div class="cd-grid">
          <section class="cd-panel cd-input" aria-labelledby="cd-input-title">
            <h2 id="cd-input-title">Your contact list</h2>
            <p class="cd-hint">Upload a CSV with a header row, or paste spreadsheet rows below. Email and phone columns are used as the identity key when present.</p>
            ${body}
            <label class="cd-field" for="cd-paste">Or paste CSV rows
              <textarea id="cd-paste" rows="6" spellcheck="false" placeholder="name,email,phone&#10;Aisha Rao,aisha@example.com,9876543210&#10;Ravi Kumar,ravi@example.com,9876543211"></textarea>
            </label>
            <div class="cd-input-actions">
              <button type="button" class="btn" id="cd-use-paste">Use pasted CSV</button>
              <button type="button" class="btn secondary" id="cd-sample">Load example</button>
              <button type="button" class="btn secondary" id="cd-reset">Clear</button>
            </div>
            <p class="cd-status" id="cd-status" aria-live="polite"></p>
          </section>
          <aside class="cd-panel cd-guide" aria-labelledby="cd-guide-title">
            <h2 id="cd-guide-title">How matching works</h2>
            <ol class="cd-steps">
              <li><strong>Find identity columns</strong><span>Headers containing “email” or “phone / mobile / cell” become the match key.</span></li>
              <li><strong>Keep the first row</strong><span>The earliest occurrence stays; later matches are listed as removed duplicates.</span></li>
              <li><strong>Download clean CSV</strong><span>Header and column order are preserved, so the file drops straight back into your CRM.</span></li>
            </ol>
            <p class="cd-privacy"><strong>100% local.</strong> Contacts are compared in your browser — nothing is uploaded or stored.</p>
          </aside>
        </div>
        <div class="cd-empty" id="cd-empty">
          <strong>No list processed yet.</strong>
          <span>Add a CSV above to see unique contacts, removed duplicates and a clean download.</span>
        </div>
      </div>
    `;
    layout({ tool, body });
    const runDedupe = text => {
      const old = $("#result"); if (old) old.remove();
      try { contactDedupe(text, resultBox()); }
      catch (err) {
        const rs = resultBox();
        rs.innerHTML = '<div class="error">Could not read that CSV: ' + esc(err && err.message ? err.message : String(err)) + "</div>";
      }
    };
    const setStatus = msg => { const s = $("#cd-status"); if (s) s.textContent = msg; };
    bindPicker(files => {
      if (!files || !files[0]) return;
      setStatus("Reading " + files[0].name + "…");
      readText(files[0]).then(text => { runDedupe(text); setStatus(files[0].name + " processed locally."); })
        .catch(err => setStatus("Could not read that file: " + (err && err.message ? err.message : String(err))));
    });
    const usePaste = $("#cd-use-paste");
    if (usePaste) usePaste.onclick = () => {
      const text = $("#cd-paste").value;
      if (!text.trim()) { setStatus("Paste some CSV rows first."); return; }
      runDedupe(text); setStatus("Pasted rows processed locally.");
    };
    const sample = $("#cd-sample");
    if (sample) sample.onclick = () => {
      $("#cd-paste").value = sampleCsv;
      runDedupe(sampleCsv); setStatus("Example list loaded and processed.");
    };
    const reset = $("#cd-reset");
    if (reset) reset.onclick = () => {
      const old = $("#result"); if (old) old.remove();
      $("#cd-paste").value = "";
      const ez = $("#cd-empty"); if (ez) ez.hidden = false;
      setStatus("Cleared.");
    };
    return;
  }

  if (id === "timetable-calendar") {
    body = `
      <div class="tt-workspace">
        <div class="tt-grid">
          <section class="tt-panel tt-input" aria-labelledby="tt-input-title">
            <h2 id="tt-input-title">Your timetable CSV</h2>
            <p class="cs-hint">Upload a timetable with a day or date, start time, end time and title. Every row becomes a recurring weekly event.</p>
            ${body}
            <div class="tt-example">
              <span>Expected columns</span>
              <code>day,start,end,title</code>
              <small>Use <code>Monday</code> in the day column, or include a <code>date</code> column for a fixed first class. <code>subject</code> works instead of <code>title</code>.</small>
            </div>
            <p class="cs-formats">Accepts .csv / text-csv with a header row. Times use 24-hour <code>HH:MM</code>. Everything stays on your device.</p>
          </section>
          <aside class="tt-panel tt-guide" aria-labelledby="tt-guide-title">
            <h2 id="tt-guide-title">How conversion works</h2>
            <ol class="cs-steps">
              <li><strong>Read each class row</strong><span>Day names schedule the next matching weekday; a date column pins the first occurrence exactly.</span></li>
              <li><strong>Build a weekly event</strong><span>Start and end times become UTC iCalendar values with a 16-week repeat rule.</span></li>
              <li><strong>Download the .ics</strong><span>Import it into any calendar app to see the whole term at once.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Your timetable is converted in the browser — no upload, no storage.</p>
          </aside>
        </div>
        <div class="tt-empty cs-empty" id="tt-empty">
          <strong>No timetable loaded yet.</strong>
          <span>Add a CSV above to preview the generated classes and download a ready-to-import .ics file.</span>
        </div>
      </div>
    `;
  }

  if (id === "calendar-cleaner") {
    body = `
      <div class="cal-workspace">
        <div class="cal-grid">
          <section class="cal-panel cal-input" aria-labelledby="cal-input-title">
            <h2 id="cal-input-title">Your calendar file</h2>
            <p class="cs-hint">Export a calendar as an .ics file, then remove repeated events locally.</p>
            ${body}
            <p class="cs-formats">Accepts .ics / text-calendar. Event order and calendar settings are preserved. Nothing is uploaded.</p>
          </section>
          <aside class="cal-panel cal-guide" aria-labelledby="cal-guide-title">
            <h2 id="cal-guide-title">How cleanup works</h2>
            <ol class="cs-steps">
              <li><strong>Compare whole events</strong><span>Title plus start and end times form the match key — not just the name.</span></li>
              <li><strong>Keep the first copy</strong><span>Later duplicates are removed while the calendar structure stays intact.</span></li>
              <li><strong>Download the clean file</strong><span>Import the .ics back into your calendar app to replace the duplicates.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Your events never leave this device.</p>
          </aside>
        </div>
        <div class="cal-empty cs-empty" id="cal-empty">
          <strong>No calendar loaded yet.</strong>
          <span>Add an .ics file above to scan for duplicate events and download a cleaned copy.</span>
        </div>
      </div>
    `;
  }

  if (id === "svg-cleaner") {
    body = `
      <div class="sv-workspace">
        <div class="sv-setup-grid">
          <section class="sv-panel sv-input" aria-labelledby="sv-input-title">
            <h2 id="sv-input-title">Your SVG file</h2>
            <p class="cs-hint">Upload an SVG from a design tool or the web. It is parsed and sanitized locally before you download a safe copy.</p>
            ${body}
            <p class="cs-formats">Accepts .svg / image-svg+xml. Scripts and unsafe links are removed — nothing is uploaded.</p>
          </section>
          <aside class="sv-panel sv-guide" aria-labelledby="sv-guide-title">
            <h2 id="sv-guide-title">How sanitizing works</h2>
            <ol class="cs-steps">
              <li><strong>Parse the XML</strong><span>Invalid SVG documents are rejected before any cleaning begins.</span></li>
              <li><strong>Strip active content</strong><span>Scripts, embedded frames, dangerous hrefs and editor namespaces are removed.</span></li>
              <li><strong>Download a safe SVG</strong><span>The cleaned file keeps the artwork and viewBox, ready for web or print.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Sanitizing happens entirely in your browser.</p>
          </aside>
        </div>
        <div class="sv-empty cs-empty" id="sv-empty">
          <strong>No SVG loaded yet.</strong>
          <span>Add an SVG above to preview the sanitized version and download a safe copy.</span>
        </div>
      </div>
    `;
  }

  if (id === "bookmark-reading") {
    body = `
      <div class="rl-workspace">
        <div class="rl-grid">
          <section class="rl-panel rl-input" aria-labelledby="rl-input-title">
            <h2 id="rl-input-title">Your bookmarks file</h2>
            <p class="cs-hint">Export bookmarks from your browser as HTML, then turn the safe links into a clean, portable reading list.</p>
            ${body}
            <p class="cs-formats">Accepts .html / .htm bookmark exports. Filtering happens locally — nothing is uploaded.</p>
          </section>
          <aside class="rl-panel rl-guide" aria-labelledby="rl-guide-title">
            <h2 id="rl-guide-title">What you get</h2>
            <ol class="cs-steps">
              <li><strong>Only real links</strong><span>JavaScript, data and other unsafe URL schemes are dropped before export.</span></li>
              <li><strong>One tidy page</strong><span>The result is a single HTML file with every kept link and its title.</span></li>
              <li><strong>Works offline</strong><span>Open it in any browser, share it, or keep it as a personal reading queue.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Your bookmarks never leave this device.</p>
          </aside>
        </div>
        <div class="rl-empty cs-empty" id="rl-empty">
          <strong>No bookmarks file loaded yet.</strong>
          <span>Add an HTML bookmark export above to build your offline reading list.</span>
        </div>
      </div>
    `;
  }

  if (id === "bookmark-cleaner") {
    body = `
      <div class="bm-workspace">
        <div class="bm-grid">
          <section class="bm-panel bm-input" aria-labelledby="bm-input-title">
            <h2 id="bm-input-title">Your bookmarks file</h2>
            <p class="cs-hint">Export bookmarks from your browser as an HTML file, then upload it here. Duplicate URLs are removed locally.</p>
            ${body}
            <p class="cs-formats">Accepts .html / .htm bookmark exports. Nothing is uploaded — cleanup happens in your browser.</p>
          </section>
          <aside class="bm-panel bm-guide" aria-labelledby="bm-guide-title">
            <h2 id="bm-guide-title">How cleanup works</h2>
            <ol class="cs-steps">
              <li><strong>Scan every link</strong><span>Each bookmark URL is normalized — query strings, fragments and “www.” are ignored for comparison.</span></li>
              <li><strong>Keep the first copy</strong><span>Later links pointing to the same address are removed; folders and ordering stay intact.</span></li>
              <li><strong>Download the clean file</strong><span>Import it back into your browser to replace the duplicate-heavy export.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Your bookmarks never leave this device.</p>
          </aside>
        </div>
        <div class="bm-empty cs-empty" id="bm-empty">
          <strong>No bookmarks file loaded yet.</strong>
          <span>Add an HTML bookmark export above to scan for duplicate URLs and download a cleaned copy.</span>
        </div>
      </div>
    `;
  }

  if (id === "vcard") {
    body = `
      <div class="vc-workspace">
        <div class="vc-grid">
          <section class="vc-panel vc-input" aria-labelledby="vc-input-title">
            <h2 id="vc-input-title">Your vCard files</h2>
            <p class="cs-hint">Upload one or more .vcf files. Contacts are parsed locally, then cards sharing a phone number are flagged for review.</p>
            ${body}
            <p class="cs-formats">Accepts .vcf / text-vcard. Multiple files are combined into one list. Nothing is uploaded.</p>
          </section>
          <aside class="vc-panel vc-guide" aria-labelledby="vc-guide-title">
            <h2 id="vc-guide-title">What you can do</h2>
            <ol class="cs-steps">
              <li><strong>Review duplicate groups</strong><span>Cards with the same normalized phone number are grouped so you can merge or keep them.</span></li>
              <li><strong>Download the merged set</strong><span>One .vcf containing every kept card, with original fields preserved.</span></li>
              <li><strong>Save individual cards</strong><span>Export any single contact as its own .vcf file.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> vCards are parsed in your browser — no upload, no storage.</p>
          </aside>
        </div>
        <div class="vc-empty cs-empty" id="vc-empty">
          <strong>No vCards loaded yet.</strong>
          <span>Add one or more .vcf files above to review contacts and possible duplicates.</span>
        </div>
      </div>
    `;
  }

  if (id === "csv-date") {
    body = `
      <div class="cs-workspace">
        <div class="cs-grid">
          <section class="cs-panel cs-input" aria-labelledby="cs-date-input-title">
            <h2 id="cs-date-input-title">Your CSV file</h2>
            <p class="cs-hint">Upload a CSV with a header row. Mixed date formats are detected and flagged before conversion.</p>
            ${body}
            <p class="cs-formats">Accepts .csv / text-csv. Quoted values and multiple separators are handled. Everything stays on your device.</p>
          </section>
          <aside class="cs-panel cs-guide" aria-labelledby="cs-date-guide-title">
            <h2 id="cs-date-guide-title">How normalization works</h2>
            <ol class="cs-steps">
              <li><strong>Choose the date column</strong><span>Every column from your header is available, even if the values are in different formats.</span></li>
              <li><strong>Review ambiguous values</strong><span>Dates where day and month are both ≤ 12 are shown with US and European readings so you decide.</span></li>
              <li><strong>Download clean CSV</strong><span>All other columns are preserved and the header stays exactly as it was.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Dates are parsed in your browser — no upload, no storage.</p>
          </aside>
        </div>
        <div class="cs-empty" id="cs-date-empty">
          <strong>No file loaded yet.</strong>
          <span>Add a CSV above to pick a date column, preview conversions and download the normalized file.</span>
        </div>
      </div>
    `;
  }

  if (id === "csv-splitter") {
    body = `
      <div class="cs-workspace">
        <div class="cs-grid">
          <section class="cs-panel cs-input" aria-labelledby="cs-input-title">
            <h2 id="cs-input-title">Your CSV file</h2>
            <p class="cs-hint">Upload a CSV with a header row. The tool detects every column, so you can choose which one holds combined values.</p>
            ${body}
            <p class="cs-formats">Accepts .csv / text-csv. Quoted commas and line breaks are handled correctly. Everything stays on your device.</p>
          </section>
          <aside class="cs-panel cs-guide" aria-labelledby="cs-guide-title">
            <h2 id="cs-guide-title">How splitting works</h2>
            <ol class="cs-steps">
              <li><strong>Pick a column</strong><span>Choose the column containing values joined by a separator, such as a full name or a tag list.</span></li>
              <li><strong>Set the delimiter</strong><span>Enter the character that separates parts — a space, comma, slash or any short string.</span></li>
              <li><strong>Preview &amp; download</strong><span>New columns are numbered automatically. The header and all other columns are preserved.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Your file is parsed in the browser — no upload, no storage.</p>
          </aside>
        </div>
        <div class="cs-empty" id="cs-empty">
          <strong>No file loaded yet.</strong>
          <span>Add a CSV above to pick a column, preview the split and download the cleaned file.</span>
        </div>
      </div>
    `;
  }

  if (id === "panorama") {
    body = `
      <div class="pg-workspace">
        <div class="pg-grid">
          <section class="pg-panel pg-input" aria-labelledby="pg-input-title">
            <h2 id="pg-input-title">Your panorama</h2>
            <p class="cs-hint">Upload one wide photo. It is sliced locally into adjacent tiles you can swipe through as a carousel.</p>
            ${body}
            <label class="pg-field" for="panoramaParts"><span>Tile count</span>
              <select id="panoramaParts">
                <option value="2">2 tiles</option>
                <option value="3" selected>3 tiles</option>
                <option value="4">4 tiles</option>
                <option value="5">5 tiles</option>
                <option value="6">6 tiles</option>
              </select>
              <small>Choose how many slides the carousel should have. The final count adapts to very wide or narrow images.</small>
            </label>
            <p class="cs-formats">Accepts JPEG, PNG and WebP images. Everything stays on your device — no upload, no storage.</p>
          </section>
          <aside class="pg-panel pg-guide" aria-labelledby="pg-guide-title">
            <h2 id="pg-guide-title">How splitting works</h2>
            <ol class="cs-steps">
              <li><strong>Load a wide photo</strong><span>Panoramas with a wide aspect give the cleanest carousel tiles.</span></li>
              <li><strong>Pick the slide count</strong><span>Two to six tiles are supported; the preview updates when you upload.</span></li>
              <li><strong>Download the set</strong><span>Save tiles one at a time by clicking a preview, or grab them all at once.</span></li>
            </ol>
            <p class="cs-privacy"><strong>100% local.</strong> Slicing happens in your browser — your photo is never uploaded.</p>
          </aside>
        </div>
        <div class="pg-empty cs-empty" id="pg-empty">
          <strong>No panorama loaded yet.</strong>
          <span>Add a wide image above to preview the tiles and download your carousel set.</span>
        </div>
      </div>
    `;
  }
  if (id === "video-safe-zone") {
    body = `
      <div class="vz-workspace">
        <div class="vz-grid">
          <section class="vz-panel vz-setup" aria-labelledby="vz-setup-title">
            <h2 id="vz-setup-title">Set up your check</h2>
            <div class="controls vz-controls">
              <label for="platformSelect">Social platform preview
                <select id="platformSelect">
                  <option value="tiktok" selected>TikTok UI (9:16 · likes, share, captions)</option>
                  <option value="reels">Instagram Reels (9:16)</option>
                  <option value="shorts">YouTube Shorts (9:16)</option>
                </select>
              </label>
            </div>
            ${body}
            <p class="vz-formats">Accepts MP4, WebM, MOV clips or a still image. The first frame is used for the guide.</p>
          </section>
          <aside class="vz-panel vz-guide" aria-labelledby="vz-guide-title">
            <h2 id="vz-guide-title">How to read the overlay</h2>
            <ul class="vz-legend">
              <li><span class="vz-swatch vz-swatch-frame" aria-hidden="true"></span><div><strong>9:16 frame</strong><small>Red outline marks the vertical canvas the platform actually shows.</small></div></li>
              <li><span class="vz-swatch vz-swatch-zone" aria-hidden="true"></span><div><strong>UI covered zones</strong><small>Shaded red areas hide content behind captions, action buttons and tabs.</small></div></li>
              <li><span class="vz-swatch vz-swatch-safe" aria-hidden="true"></span><div><strong>Safe area</strong><small>The clear centre. Keep titles, subtitles and key subjects inside it.</small></div></li>
            </ul>
            <p class="vz-privacy"><strong>Stays on your device.</strong> Video frames are decoded locally — no file is uploaded.</p>
          </aside>
        </div>
        <div class="vz-empty" id="vz-empty">
          <strong>No frame loaded yet.</strong>
          <span>Add a vertical image or a short video clip above to preview its platform overlay.</span>
        </div>
      </div>
    `;
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
    ["#cs-empty", "#cs-date-empty", "#vc-empty", "#bm-empty", "#rl-empty", "#sv-empty", "#cal-empty", "#tt-empty", "#pg-empty"].forEach(sel => {
      const csEmpty = $(sel);
      if (csEmpty) csEmpty.hidden = false;
    });
    processTool(id, files);
  });
}

function setActiveNav() {
  const path = location.pathname;
  const nav = document.getElementById("primary-nav");
  if (!nav) return;

  // Clear panel links too: the mega menu is a map, not a second active state.
  nav.querySelectorAll("a").forEach(a => {
    a.classList.remove("active");
    a.removeAttribute("aria-current");
  });

  nav.querySelectorAll(":scope > a").forEach(a => {
    const href = a.getAttribute("href");
    const isActive = !!href && href !== "/" && (path === href || path.startsWith(href));
    a.classList.toggle("active", isActive);
    if (isActive) a.setAttribute("aria-current", "page");
  });

  const allTrigger = nav.querySelector('.nav-trigger[data-nav-key="all"]');
  if (allTrigger) {
    const isAllActive = !path.startsWith("/about/") && !path.startsWith("/contact/");
    allTrigger.classList.toggle("active", isAllActive);
  }
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
    } else if (p === "/audio/studio") {
      mountAudioRoute("studio");
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
  if (href.includes("#")) {
    const [targetPath, targetHash] = href.split("#");
    const normPath = targetPath || "/";
    if (location.pathname !== normPath) return;
    const anchor = targetHash ? document.getElementById(targetHash) : null;
    if (anchor) {
      e.preventDefault();
      history.pushState(null, "", href);
      closeMobileNav();
      closeNavPanels();
      anchor.scrollIntoView({ behavior: "smooth" });
      return;
    }
  }
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
