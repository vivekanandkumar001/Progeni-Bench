const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PARENT_BRAND, PARENT_URL, SITE_NAME, SITE_SHORT, SITE_URL, SUPPORT_EMAIL, TAGLINE, LOCALE, TOOLS } = require('./site.config.js');
const imageConfig = require('./image-tools.config.js');
const imagePages = require('./image-pages.js');
const audioConfig = require('./audio-tools.config.js');
const audioPages = require('./audio-pages.js');

const baseDir = __dirname;
const distDir = path.join(baseDir, 'dist');
const toolsDir = path.join(baseDir, 'tools');
const distToolsDir = path.join(distDir, 'tools');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
if (!fs.existsSync(distToolsDir)) fs.mkdirSync(distToolsDir, { recursive: true });

// Ensure assets folder is copied to dist/
const assetsDir = path.join(baseDir, 'assets');
const distAssetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, distAssetsDir, { recursive: true });
}

// Ensure assets and OG / Icon images exist
function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

// Assembles a PNG buffer from already-deflated raw scanline data.
function assemblePng(width, height, compressed, colorType) {
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;          // bit depth
  ihdrData[9] = colorType;  // 2 = RGB, 6 = RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  return Buffer.concat([signature, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// Encodes raw RGB pixels (drawn via a setPx callback) into a PNG buffer
function encodePng(width, height, drawFn) {
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  const setPx = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * rowSize + 1 + x * 3;
    rawData[p] = r;
    rawData[p + 1] = g;
    rawData[p + 2] = b;
  };
  drawFn(setPx, width, height);
  return assemblePng(width, height, zlib.deflateSync(rawData), 2);
}

// Encodes raw RGBA pixels (drawn via a setPx callback with alpha) into a PNG
// buffer. Used for favicons so the rounded tile has a transparent surround.
function encodePngRGBA(width, height, drawFn) {
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  const setPx = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * rowSize + 1 + x * 4;
    rawData[p] = r;
    rawData[p + 1] = g;
    rawData[p + 2] = b;
    rawData[p + 3] = a;
  };
  drawFn(setPx, width, height);
  return assemblePng(width, height, zlib.deflateSync(rawData), 6);
}

// Wraps one or more PNG buffers into a .ico container. Modern browsers (and
// Googlebot) accept PNG-compressed ICO entries, so we embed the PNGs directly.
function encodeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0;                // palette size
    dir[o + 3] = 0;                // reserved
    dir.writeUInt16LE(1, o + 4);   // colour planes
    dir.writeUInt16LE(32, o + 6);  // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Light corporate brand art: soft gray field + rounded brand-blue tile + white bolt
function drawBrandMark(setPx, width, height) {
  const bg = [244, 246, 249];
  const brand = [29, 78, 216];
  const white = [255, 255, 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPx(x, y, bg[0], bg[1], bg[2]);
  }

  const tile = Math.round(Math.min(width, height) * 0.68);
  const tx = Math.round((width - tile) / 2);
  const ty = Math.round((height - tile) / 2);
  const rad = tile * 0.22;
  const half = tile / 2;
  const inner = half - rad;
  const bolt = [
    [0.58, 0.16], [0.33, 0.55], [0.49, 0.55],
    [0.33, 0.85], [0.67, 0.45], [0.50, 0.45]
  ];

  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const qx = Math.abs(x + 0.5 - half) - inner;
      const qy = Math.abs(y + 0.5 - half) - inner;
      const dx = Math.max(qx, 0);
      const dy = Math.max(qy, 0);
      if (Math.hypot(dx, dy) + Math.min(Math.max(qx, qy), 0) > rad) continue;
      const c = pointInPoly(x / tile, y / tile, bolt) ? white : brand;
      setPx(tx + x, ty + y, c[0], c[1], c[2]);
    }
  }
}

// Favicon art: transparent surround + a full-bleed rounded brand-blue tile with
// a white bolt. Supersampled 2x2 for smooth edges at small sizes.
function drawFaviconMark(setPx, width, height) {
  const brand = [29, 78, 216];
  const white = [255, 255, 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPx(x, y, 0, 0, 0, 0);
  }

  const pad = Math.max(0, Math.round(width * 0.03));
  const tile = width - pad * 2;
  const half = tile / 2;
  const rad = tile * 0.22;
  const inner = half - rad;
  const bolt = [
    [0.58, 0.16], [0.33, 0.55], [0.49, 0.55],
    [0.33, 0.85], [0.67, 0.45], [0.50, 0.45]
  ];

  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      let hits = 0;
      let boltHits = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = x + (sx + 0.5) / 2;
          const py = y + (sy + 0.5) / 2;
          const qx = Math.abs(px - half) - inner;
          const qy = Math.abs(py - half) - inner;
          const dx = Math.max(qx, 0);
          const dy = Math.max(qy, 0);
          if (Math.hypot(dx, dy) + Math.min(Math.max(qx, qy), 0) > rad) continue;
          hits++;
          if (pointInPoly(px / tile, py / tile, bolt)) boltHits++;
        }
      }
      if (!hits) continue;
      const w = boltHits / hits;
      setPx(
        pad + x, pad + y,
        Math.round(brand[0] * (1 - w) + white[0] * w),
        Math.round(brand[1] * (1 - w) + white[1] * w),
        Math.round(brand[2] * (1 - w) + white[2] * w),
        Math.round((hits / 4) * 255)
      );
    }
  }
}

const ogPng = encodePng(1200, 630, drawBrandMark);
const iconPng = encodePng(180, 180, drawBrandMark);
fs.writeFileSync(path.join(assetsDir, 'og-image.png'), ogPng);
fs.writeFileSync(path.join(distAssetsDir, 'og-image.png'), ogPng);
fs.writeFileSync(path.join(assetsDir, 'apple-touch-icon.png'), iconPng);
fs.writeFileSync(path.join(distAssetsDir, 'apple-touch-icon.png'), iconPng);

// Raster favicons. Google Search does NOT support SVG favicons — it accepts
// BMP/GIF/ICO/PNG/JPEG/PPM/TIFF and wants a square that is a multiple of 48px,
// so we ship 48/96/192/512 PNGs plus a /favicon.ico fallback for browsers.
const faviconSizes = [48, 96, 192, 512];
const faviconPngs = {};
faviconSizes.forEach(size => {
  const png = encodePngRGBA(size, size, drawFaviconMark);
  faviconPngs[size] = png;
  fs.writeFileSync(path.join(assetsDir, `favicon-${size}.png`), png);
  fs.writeFileSync(path.join(distAssetsDir, `favicon-${size}.png`), png);
});

// /favicon.ico — classic fallback requested by browsers and used by Googlebot.
// Embed 16/32/48 PNG entries (48 satisfies Google's "multiple of 48" rule).
const faviconIco = encodeIco([
  { size: 16, png: encodePngRGBA(16, 16, drawFaviconMark) },
  { size: 32, png: encodePngRGBA(32, 32, drawFaviconMark) },
  { size: 48, png: faviconPngs[48] }
]);
fs.writeFileSync(path.join(baseDir, 'favicon.ico'), faviconIco);
fs.writeFileSync(path.join(distDir, 'favicon.ico'), faviconIco);

function getToolTitle(tool) {
  let title = `${tool.name}: Free Online, No Upload | ${SITE_NAME}`;
  if (title.length > 60) title = `${tool.name}: Free Online Tool | ${SITE_NAME}`;
  if (title.length > 60) title = `${tool.name}: Free Online | ${SITE_NAME}`;
  if (title.length > 60) title = `${tool.name} | ${SITE_NAME}`;
  if (title.length > 60) title = tool.name.slice(0, 60);
  return title;
}

function getRelatedTools(currentTool) {
  const sameCategory = TOOLS.filter(t => t.cat === currentTool.cat && t.id !== currentTool.id);
  const otherCategory = TOOLS.filter(t => t.cat !== currentTool.cat && t.id !== currentTool.id);
  const selected = [...sameCategory, ...otherCategory].slice(0, 5);
  return selected;
}

function getFooterDirectoryHtml() {
  const categories = [...new Set(TOOLS.map(t => t.cat))];
  return `
  <div class="footer-directory">
    <div class="footer-directory-title">Explore all 30 private browser utilities by category</div>
    <div class="category-blocks">
      ${categories.map(cat => `
        <div class="category-block">
          <h3>${cat}</h3>
          <ul>
            ${TOOLS.filter(t => t.cat === cat).map(t => `
              <li><a href="/tools/${t.id}/">${t.icon} ${t.name}</a></li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function generateToolPageHtml(tool) {
  const title = getToolTitle(tool);
  const canonicalUrl = `${SITE_URL}/tools/${tool.id}/`;
  const related = getRelatedTools(tool);
  const faq = tool.faq || [];
  const useCases = tool.useCases || [];
  const catSlug = tool.cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const graph = [
    {
      "@type": "WebApplication",
      "name": tool.name,
      "url": canonicalUrl,
      "description": tool.seoDesc,
      "applicationCategory": "UtilitiesApplication",
      "operatingSystem": "Any",
      "browserRequirements": "Requires modern JavaScript-enabled web browser",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "INR"
      },
      "isAccessibleForFree": true,
      "provider": {
        "@type": "Organization",
        "name": PARENT_BRAND,
        "url": PARENT_URL
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": `${SITE_URL}/`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": tool.cat,
          "item": `${SITE_URL}/#category-${catSlug}`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": tool.name,
          "item": canonicalUrl
        }
      ]
    }
  ];

  if (faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "mainEntity": faq.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": f.a
        }
      }))
    });
  }

  const schema = {
    "@context": "https://schema.org",
    "@graph": graph
  };

  const footerDir = getFooterDirectoryHtml();

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${tool.seoDesc}">
  <meta name="theme-color" content="#f4f6f9">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${tool.seoDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta property="og:image:alt" content="${SITE_NAME} - free, private browser tools">
  <meta property="og:locale" content="${LOCALE}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:image" content="${SITE_URL}/assets/og-image.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/"><img src="/assets/favicon.svg" alt="${SITE_NAME}" width="34" height="34" class="brand-logo"> ${SITE_NAME}<span>.</span></a>
  <nav id="primary-nav" aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/image/">Image toolkit</a>
    <a href="/audio/">Audio toolkit</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
  <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span></button>
</header>

<main id="app" class="container" tabindex="-1">
  <section class="tool-head">
    <span class="eyebrow">${tool.cat} · 100% Private Client-Side</span>
    <h1>${tool.keyword}</h1>
    <p>${tool.desc} <strong>Zero server uploads</strong> — all processing happens directly in your browser.</p>
  </section>

  <!-- Pre-rendered Noscript / Crawler Fallback -->
  <noscript>
    <section class="toolbox">
      <h2>About ${tool.name}</h2>
      <p>${tool.desc}</p>
      <p><em>Please enable JavaScript in your browser to run this client-side utility.</em></p>
    </section>
  </noscript>

  <article class="tool-content seo-section" style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 24px; line-height: 1.8;">
    <h2>What it does</h2>
    <p>${tool.whatItDoes}</p>

    ${useCases.length > 0 ? `
    <h2>Common use cases</h2>
    <ul>
      ${useCases.map(u => `<li>${u}</li>`).join('\n      ')}
    </ul>
    ` : ''}

    <h2>How to use</h2>
    <ol>
      ${tool.howToUse.map(step => `<li>${step}</li>`).join('\n      ')}
    </ol>

    <h2>Limits & Considerations</h2>
    <p>${tool.limits}</p>

    ${faq.length > 0 ? `
    <h2>Frequently Asked Questions</h2>
    <div class="faq-list">
      ${faq.map(f => `<div class="faq-item" style="margin: 14px 0;"><strong>${f.q}</strong><p style="margin: 4px 0 0 0; color: var(--muted);">${f.a}</p></div>`).join('\n      ')}
    </div>
    ` : ''}

    <h2>Privacy & Security</h2>
    <p>${tool.privacy}</p>

    <h2>Related ${tool.cat} Tools</h2>
    <div class="tool-links">
      <ul class="related-links" style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        ${related.map(r => `<li><a href="/tools/${r.id}/" style="color: var(--brand); font-weight: 600; text-decoration: underline;">${r.icon} ${r.name}</a></li>`).join('\n        ')}
      </ul>
    </div>

    <h2>Browse All ${tool.cat} Tools</h2>
    <p style="color: var(--muted); font-size: 14px; margin: 8px 0 16px 0;">Explore the full range of ${tool.cat.toLowerCase()} tools:</p>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 8px;">
      ${TOOLS.filter(t => t.cat === tool.cat && t.id !== tool.id).map(t => `<a href="/tools/${t.id}/" style="display: block; padding: 6px 10px; background: var(--card); border: 1px solid var(--line); border-radius: 6px; color: var(--brand); font-size: 13px; text-decoration: none; transition: background 0.2s;">
${t.icon} ${t.name}</a>`).join('\n      ')}
    </div>
  </article>
</main>

<footer role="contentinfo">
  <div class="footer-brand"><img src="/assets/favicon.svg" alt="" width="32" height="32"><span><strong>${SITE_NAME}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${TAGLINE}</span></div>
  <div class="footer-links">
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/about/">About</a>
    <a href="/contact/">Contact</a>
  </div>
  ${footerDir}
</footer>
<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateHomePageHtml() {
  const title = `${SITE_NAME}: Free Private File Tools in Your Browser`;
  const desc = `Fix everyday digital file tasks in your browser with ${SITE_NAME}. Convert CSVs, repair subtitles, format Avery labels, and crop photos with zero uploads.`;
  const canonicalUrl = `${SITE_URL}/`;
  const cats = ["All", ...new Set(TOOLS.map(t => t.cat))];
  const catsHtml = cats.map((c, i) => `<button class="pill ${i === 0 ? "active" : ""}" data-cat="${c}" aria-pressed="${i === 0 ? "true" : "false"}">${c}</button>`).join("");
  const gridHtml = TOOLS.map(t => `
      <a class="tool-card" href="/tools/${t.id}/" data-cat="${t.cat}">
        <span class="go" aria-hidden="true">&rarr;</span>
        <div class="icon" aria-hidden="true">${t.icon}</div>
        <h2>${t.name}</h2>
        <p>${t.desc}</p>
        <span class="tag">${t.cat}</span>
      </a>
    `).join("");

  const trustHtml = [
    { ico: "🔒", title: "Nothing leaves your device", body: "Files are processed in-browser with Web APIs — zero uploads, zero network transfer." },
    { ico: "⚡", title: "Instant, no waiting", body: "No queues, no render farms. Results appear as soon as you drop a file." },
    { ico: "🙅", title: "No account, ever", body: "No signup, no passwords, no subscriptions. Open a tool and get to work." },
    { ico: "🧰", title: "30 focused utilities", body: "Crafters, creators and desk workers — labels, subtitles, CSVs, images and more." }
  ].map(f => `
    <div class="trust-item">
      <span class="t-ico" aria-hidden="true">${f.ico}</span>
      <div><b>${f.title}</b><span>${f.body}</span></div>
    </div>
  `).join("");

  const imageWorking = imageConfig.TOOLS.filter(t => t.status === "implemented" || t.status === "experimental");
  const imageFeatured = ["compress", "resize", "crop", "convert", "watermark", "metadata-viewer", "favicon", "qr-code"]
    .map(id => imageConfig.getTool(id))
    .filter(Boolean);
  const imageBandHtml = `
  <section class="image-band" aria-labelledby="image-toolkit-heading">
    <div class="image-band-copy">
      <span class="eyebrow">New · Bench Image Toolkit</span>
      <h2 id="image-toolkit-heading">Image tools that never upload your files</h2>
      <p>Compress, resize, convert, crop, annotate, inspect metadata, generate favicons and QR codes, and batch-export — all in your browser. ${imageWorking.length} tools have a real client-side handler; anything unavailable is labelled instead of faked.</p>
      <p class="image-band-actions"><a class="btn btn-lg" href="/image/">Open the image toolkit</a> <a class="btn secondary" href="/image/studio/">Try Image Studio</a></p>
    </div>
    <div class="image-band-grid">
      ${imageFeatured.map(t => `<a class="image-band-card" href="/image/${t.slug}/"><strong>${t.name}</strong><span>${t.summary}</span></a>`).join("")}
    </div>
  </section>`;

  const audioWorking = audioConfig.TOOLS.filter(t => t.status === "implemented" || t.status === "experimental");
  const audioFeatured = ["convert", "trimmer", "compress", "joiner", "loudness-normalizer", "noise-reducer", "recorder", "waveform-image"]
    .map(id => audioConfig.getTool(id))
    .filter(Boolean);
  const audioBandHtml = `
  <section class="image-band audio-band" aria-labelledby="audio-toolkit-heading">
    <div class="image-band-copy">
      <span class="eyebrow">New · Bench Audio Toolkit</span>
      <h2 id="audio-toolkit-heading">Audio tools that never upload your files</h2>
      <p>Convert, compress, trim, join, clean, record, analyse and tag audio — all in your browser. ${audioWorking.length} tools have a real client-side handler; conversion and heavy filters use a local WebAssembly engine, and anything unavailable is labelled instead of faked.</p>
      <p class="image-band-actions"><a class="btn btn-lg" href="/audio/">Open the audio toolkit</a> <a class="btn secondary" href="/audio/recorder/">Try the voice recorder</a></p>
    </div>
    <div class="image-band-grid">
      ${audioFeatured.map(t => `<a class="image-band-card" href="/audio/${t.slug}/"><strong>${t.name}</strong><span>${t.summary}</span></a>`).join("")}
    </div>
  </section>`;

  const categories = [...new Set(TOOLS.map(t => t.cat))];
  const categoryBlocksHtml = categories.map(cat => `
      <div class="category-block" id="category-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
        <h3>${cat}</h3>
        <ul>
          ${TOOLS.filter(t => t.cat === cat).map(t => `
            <li><a href="/tools/${t.id}/">${t.icon} ${t.name}</a> — <span class="cat-desc">${t.desc.slice(0, 70)}…</span></li>
          `).join('')}
        </ul>
      </div>
    `).join("");
  const footerDir = getFooterDirectoryHtml();

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": canonicalUrl,
        "inLanguage": LOCALE,
        "description": TAGLINE,
        "publisher": {
          "@type": "Organization",
          "name": PARENT_BRAND,
          "url": PARENT_URL,
          "logo": `${SITE_URL}/assets/favicon.svg`
        }
      },
      {
        "@type": "Organization",
        "name": PARENT_BRAND,
        "url": PARENT_URL,
        "logo": `${SITE_URL}/assets/favicon.svg`,
        "brand": {
          "@type": "Brand",
          "name": SITE_NAME
        }
      }
    ]
  };

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#f4f6f9">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta property="og:image:alt" content="${SITE_NAME} - free, private browser tools">
  <meta property="og:locale" content="${LOCALE}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:image" content="${SITE_URL}/assets/og-image.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/"><img src="/assets/favicon.svg" alt="${SITE_NAME}" width="34" height="34" class="brand-logo"> ${SITE_NAME}<span>.</span></a>
  <nav id="primary-nav" aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/image/">Image toolkit</a>
    <a href="/audio/">Audio toolkit</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
  <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span></button>
</header>

<main id="app" class="container" tabindex="-1">
  <section class="hero">
    <div class="hero-inner">
      <span class="eyebrow"><span class="dot" aria-hidden="true"></span>30 utilities · 100% private · runs in your browser</span>
      <h1>Fix everyday file jobs <span class="accent">without uploading a thing</span>.</h1>
      <p class="hero-lede">Free, client-side tools for crafters, creators and desk workers. Make Avery labels and sticker sheets, mirror T-shirt prints, repair subtitles, dedupe contacts and convert CSVs — all processed locally on your device.</p>
      <div class="hero-search">
        <label class="sr-only" for="search">Search tools</label>
        <input id="search" class="search" type="search" aria-label="Search 30 tools" placeholder="Search 30 tools (e.g., sticker sheet, avery labels, subtitle, csv, t-shirt)...">
      </div>
      <div id="cats" class="categories" role="group" aria-label="Filter tools by category">${catsHtml}</div>
    </div>
  </section>

  <section class="trust" aria-label="Why use ${SITE_NAME}">
    ${trustHtml}
  </section>

  <section class="tools-section" aria-label="Browser utility grid">
    <div class="section-head">
      <h2>All tools</h2>
      <p class="grid-count">Showing <strong>${TOOLS.length}</strong> of ${TOOLS.length} tools</p>
    </div>
    <div id="grid" class="grid">
      ${gridHtml}
    </div>
  </section>

  ${imageBandHtml}

  ${audioBandHtml}

  <section class="privacy-band">
    <h2>100% private, client-side architecture</h2>
    <p>Unlike conventional web utilities that upload your sensitive documents, spreadsheets, photos and personal data to remote servers, ${SITE_NAME} runs entirely inside your browser using modern Web APIs — Web Workers, HTML5 Canvas, the Web Audio API and the File Reader API. Your files are processed in your device's memory and never cross the network.</p>
    <div class="privacy-points">
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>Zero server uploads.</b> Nothing is transmitted; files stay on your machine.</span></div>
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No account required.</b> Immediate access — no signup, passwords or subscriptions.</span></div>
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No trackers.</b> No third-party analytics cookies or behavioural monitoring scripts.</span></div>
    </div>
  </section>

  <section class="category-directory">
    <h2>Browse utilities by category</h2>
    <p>Every utility runs 100% client-side in your web browser. Pick a category below to jump straight to a specialised file tool.</p>
    <div class="category-blocks">
      ${categoryBlocksHtml}
    </div>
  </section>
</main>

<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${TAGLINE}</div>
  <div class="footer-links">
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/about/">About</a>
    <a href="/contact/">Contact</a>
  </div>
  ${footerDir}
</footer>

<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateStaticPageHtml(pageId, title, desc, h1, bodyContent) {
  const canonicalUrl = `${SITE_URL}/${pageId}/`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "name": title,
        "url": canonicalUrl,
        "description": desc,
        "isPartOf": {
          "@type": "WebSite",
          "name": SITE_NAME,
          "url": `${SITE_URL}/`
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": `${SITE_URL}/`
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": h1,
            "item": canonicalUrl
          }
        ]
      }
    ]
  };

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#f4f6f9">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta property="og:image:alt" content="${SITE_NAME} - free, private browser tools">
  <meta property="og:locale" content="${LOCALE}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:image" content="${SITE_URL}/assets/og-image.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/"><img src="/assets/favicon.svg" alt="${SITE_NAME}" width="34" height="34" class="brand-logo"> ${SITE_NAME}<span>.</span></a>
  <nav id="primary-nav" aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/image/">Image toolkit</a>
    <a href="/audio/">Audio toolkit</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
  <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span></button>
</header>

<main id="app" class="container" tabindex="-1">
  <section class="tool-head">
    <span class="eyebrow">${SITE_NAME}</span>
    <h1>${h1}</h1>
  </section>
  <section class="toolbox" style="line-height: 1.8;">
    ${bodyContent}
  </section>
</main>

<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${TAGLINE}</div>
  <div class="footer-links">
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/about/">About</a>
    <a href="/contact/">Contact</a>
  </div>
</footer>
<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generate404Html() {
  const title = `Page Not Found: ${SITE_NAME} File Utilities`;
  const desc = `The requested page could not be found on ${SITE_NAME}. Browse our collection of 30 free, privacy-first client-side file tools.`;

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#f4f6f9">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
</head>
<body data-page="404"><a class="skip-link" href="#app">Skip to main content</a>
<main id="app" class="container" tabindex="-1" style="text-align: center; padding: 60px 20px;">
  <h1>Page Not Found</h1>
  <p>The page you are looking for does not exist on ${SITE_NAME}.</p>
  <p>The link might be outdated or mistyped.</p>
  <br>
  <a href="/" class="btn">Return to ${SITE_NAME} Homepage</a>
</main>
<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${TAGLINE}</div>
  <div class="footer-links"><a href="/privacy/">Privacy</a><a href="/about/">About</a></div>
</footer>
<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateSitemapXml() {
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/about/`,
    `${SITE_URL}/privacy/`,
    `${SITE_URL}/terms/`,
    `${SITE_URL}/contact/`,
    `${SITE_URL}/image/`,
    `${SITE_URL}/image/studio/`,
    ...imagePages.IMPLEMENTED.map(t => `${SITE_URL}/image/${t.slug}/`),
    `${SITE_URL}/audio/`,
    ...audioPages.IMPLEMENTED.map(t => `${SITE_URL}/audio/${t.slug}/`),
    ...TOOLS.map(t => `${SITE_URL}/tools/${t.id}/`)
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${u === `${SITE_URL}/` ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  return xml;
}

function generateManifestJson() {
  return JSON.stringify({
    "name": SITE_NAME,
    "short_name": SITE_SHORT,
    "description": TAGLINE,
    "start_url": "/",
    "display": "standalone",
    "background_color": "#f4f6f9",
    "theme_color": "#f4f6f9",
    "icons": [
      {
        "src": "/assets/favicon-192.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/assets/favicon-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/assets/favicon-512.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable"
      },
      {
        "src": "/assets/favicon.svg",
        "sizes": "any",
        "type": "image/svg+xml"
      }
    ]
  }, null, 2);
}

// 1. Build tool pages
TOOLS.forEach(tool => {
  const html = generateToolPageHtml(tool);
  const tDir = path.join(toolsDir, tool.id);
  if (!fs.existsSync(tDir)) fs.mkdirSync(tDir, { recursive: true });
  fs.writeFileSync(path.join(tDir, 'index.html'), html, 'utf8');

  const dtDir = path.join(distToolsDir, tool.id);
  if (!fs.existsSync(dtDir)) fs.mkdirSync(dtDir, { recursive: true });
  fs.writeFileSync(path.join(dtDir, 'index.html'), html, 'utf8');
});

// 1b. Build Bench Image Toolkit pages (hub, studio, one page per public tool)
const imagePageBuild = imagePages.buildImagePages(baseDir);
console.log(`Generated ${imagePageBuild.count} image toolkit pages (${imagePageBuild.publicTools.length} public tools).`);

// 1c. Build Bench Audio Toolkit pages (hub, one page per public tool)
const audioPageBuild = audioPages.buildAudioPages(baseDir);
console.log(`Generated ${audioPageBuild.count} audio toolkit pages (${audioPageBuild.publicTools.length} public tools).`);

// 2. Build home page
const homeHtml = generateHomePageHtml();
fs.writeFileSync(path.join(baseDir, 'index.html'), homeHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'index.html'), homeHtml, 'utf8');

// 3. Build static pages
const aboutContent = `
  <h2>Browser-First Global Architecture</h2>
  <p>${SITE_NAME} is designed on a simple principle: digital utility tasks should be instant, free, and 100% private. All 30 tools process files locally in your web browser. Your sensitive spreadsheets, personal photos, and contact lists never touch an external server.</p>
  <p>${SITE_NAME} is <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> dedicated to building fast, zero-bloat web utilities.</p>
  <h2>Who is ${SITE_NAME} Built For?</h2>
  <ul>
    <li><strong>Crafters & Creators:</strong> Make <a href="/tools/sticker-sheet/">sticker sheets</a>, mirror <a href="/tools/tshirt-mirror/">T-shirt prints</a>, create <a href="/tools/cross-stitch/">cross-stitch patterns</a>, and test <a href="/tools/video-safe-zone/">video safe zones</a>.</li>
    <li><strong>Professionals & Marketers:</strong> Clean <a href="/tools/bookmark-cleaner/">browser bookmarks</a>, split large <a href="/tools/csv-splitter/">CSVs</a>, deduplicate <a href="/tools/contact-dedupe/">contact databases</a>, and format <a href="/tools/vcard/">vCards</a>.</li>
    <li><strong>Everyday Power Users:</strong> Convert <a href="/tools/timetable-calendar/">timetables to iCal</a>, check <a href="/tools/subtitle-speed/">subtitle reading speed</a>, find <a href="/tools/duplicate-finder/">duplicate photos</a>, and optimize <a href="/tools/print-layout/">print layouts</a>.</li>
  </ul>
`;
const aboutHtml = generateStaticPageHtml('about', `About ${SITE_NAME}: Privacy-First Browser Tools`, `Learn about ${SITE_NAME}, a fast client-side web utility suite with 30 tools. We process digital tasks privately in your browser with zero data uploads.`, `About ${SITE_NAME}`, aboutContent);
if (!fs.existsSync(path.join(baseDir, 'about'))) fs.mkdirSync(path.join(baseDir, 'about'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'about'))) fs.mkdirSync(path.join(distDir, 'about'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'about', 'index.html'), aboutHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'about', 'index.html'), aboutHtml, 'utf8');

const privacyContent = `
  <h2>1. The Zero-Upload Guarantee</h2>
  <p>${SITE_NAME} is designed from the ground up as a <strong>client-side execution platform</strong>. When you use our bookmark cleaners, CSV tools, image converters, subtitle editors, or calendar organizers:</p>
  <ul>
    <li>Your uploaded files are loaded into your browser's local memory (RAM) via standard HTML5 File APIs.</li>
    <li>Calculations and conversions run on your device's CPU/GPU.</li>
    <li>Generated outputs are downloaded directly to your disk.</li>
    <li><strong>None of your files, images, or document contents are ever sent to our servers or stored on remote databases.</strong></li>
  </ul>
  <h2>2. Zero Third-Party Tracking</h2>
  <p>${SITE_NAME} does not embed third-party advertising tracking scripts or behavioral profilers. All utility tools function entirely offline once loaded into your web browser.</p>
`;
const privacyHtml = generateStaticPageHtml('privacy', `Privacy Policy: ${SITE_NAME} Zero-Upload Guarantee`, `Read the ${SITE_NAME} zero-upload privacy guarantee. All files and documents process locally inside your browser memory with zero tracking and zero ads.`, `Privacy Policy`, privacyContent);
if (!fs.existsSync(path.join(baseDir, 'privacy'))) fs.mkdirSync(path.join(baseDir, 'privacy'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'privacy'))) fs.mkdirSync(path.join(distDir, 'privacy'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'privacy', 'index.html'), privacyHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'privacy', 'index.html'), privacyHtml, 'utf8');

const termsContent = `
  <h2>1. Acceptance of Terms</h2>
  <p>By accessing and using ${SITE_NAME} (${SITE_URL}) and any of our browser-based utility tools, you agree to comply with and be bound by these Terms of Service.</p>
  <h2>2. Description of Service & Local Processing</h2>
  <p>${SITE_NAME} provides 30 browser-first digital utilities. All file processing occurs locally inside your web browser using client-side JavaScript. ${SITE_NAME} does not upload, store, or view your source files or generated outputs on external servers.</p>
  <h2>3. Disclaimer of Warranties</h2>
  <p>All utilities, software routines, and calculations on ${SITE_NAME} are provided "as is" and "as available" without warranty of any kind.</p>
`;
const termsHtml = generateStaticPageHtml('terms', `Terms of Service: ${SITE_NAME} Online Utilities`, `Read the terms of service for using ${SITE_NAME} browser-based utilities. Free client-side tools provided with clear usage and limitation policies.`, `Terms of Service`, termsContent);
if (!fs.existsSync(path.join(baseDir, 'terms'))) fs.mkdirSync(path.join(baseDir, 'terms'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'terms'))) fs.mkdirSync(path.join(distDir, 'terms'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'terms', 'index.html'), termsHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'terms', 'index.html'), termsHtml, 'utf8');

const contactContent = `
  <div style="background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px; box-shadow: var(--shadow-sm); max-width: 680px;">
    <h2>Direct Email Inquiries</h2>
    <p>For general support, feedback, and inquiries regarding ${SITE_NAME}:</p>
    <p style="font-size: 18px; font-weight: 700; color: var(--brand);">
      📧 <a href="mailto:${SUPPORT_EMAIL}" style="color: var(--brand); text-decoration: underline;">${SUPPORT_EMAIL}</a>
    </p>
    <h3>Feature Suggestions & Bug Reports</h3>
    <p>${SITE_NAME} is constantly expanding its suite of client-side web tools. Let us know if you have an idea for a utility that can save time without uploading files to a cloud server.</p>
    <p>When reporting a bug, include the tool name, your browser and version, and the steps that triggered the problem. Since every tool runs entirely in your browser, these details let us reproduce the issue without ever asking for your files.</p>
    <h3>Why there is no contact form</h3>
    <p>We deliberately run this site without a web contact form. A form would require a server-side endpoint to receive your message — an extra place where data is collected and retained. Email goes straight from your mail provider to our inbox, which keeps the data path as short as the tools themselves keep yours.</p>
    <p style="margin-top: 24px; color: var(--muted); font-size: 14px;">We usually respond to all inquiries within 24 to 48 business hours.</p>
  </div>
`;
const contactHtml = generateStaticPageHtml('contact', `Contact Us: ${SITE_NAME} Support & Inquiries`, `Contact the ${SITE_NAME} team for support, feature suggestions, bug reports, and partnership inquiries. We respond within 24 to 48 business hours.`, `Contact Support`, contactContent);
if (!fs.existsSync(path.join(baseDir, 'contact'))) fs.mkdirSync(path.join(baseDir, 'contact'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'contact'))) fs.mkdirSync(path.join(distDir, 'contact'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'contact', 'index.html'), contactHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'contact', 'index.html'), contactHtml, 'utf8');

// 4. Build 404 page
const notFoundHtml = generate404Html();
fs.writeFileSync(path.join(baseDir, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(distDir, '404.html'), notFoundHtml, 'utf8');

// 5. Build sitemap.xml
const sitemapXml = generateSitemapXml();
fs.writeFileSync(path.join(baseDir, 'sitemap.xml'), sitemapXml, 'utf8');
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');

// 6. Build manifest
const manifestJson = generateManifestJson();
fs.writeFileSync(path.join(baseDir, 'manifest.webmanifest'), manifestJson, 'utf8');
fs.writeFileSync(path.join(distDir, 'manifest.webmanifest'), manifestJson, 'utf8');

// 7. Robots.txt
const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
fs.writeFileSync(path.join(baseDir, 'robots.txt'), robotsTxt, 'utf8');
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');

// 8. Copy static files to dist/
const filesToCopy = [
  'site.config.js', 'app.js', 'sticker-studio.js', 'label-studio.js', 'sheet-studio.js', 'pattern-studio.js', 'image-studio.js', 'photo-batch-studio.js', 'album-studio.js', 'media-studio.js', 'subtitle-studio.js', 'utils.js', 'styles.css', 'image-tools.config.js', 'image-toolkit.js', 'audio-tools.config.js', 'audio-toolkit.js', '_headers', '_redirects', 'vercel.json', 'netlify.toml', 'llms.txt'
];
fs.readdirSync(baseDir).forEach(f => {
  if (f.startsWith('google') && f.endsWith('.html')) {
    filesToCopy.push(f);
  }
});
filesToCopy.forEach(f => {
  const src = path.join(baseDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, f));
  }
});

// Copy assets
if (fs.existsSync(assetsDir)) {
  fs.readdirSync(assetsDir).forEach(f => {
    fs.copyFileSync(path.join(assetsDir, f), path.join(distAssetsDir, f));
  });
}

// Copy same-origin vendor bundles used lazily by image-toolkit.js and the
// FFmpeg engine (/vendor/ffmpeg/) used lazily by audio-toolkit.js. Recurse so
// subdirectories such as vendor/ffmpeg/ are copied too.
const vendorDir = path.join(baseDir, 'vendor');
if (fs.existsSync(vendorDir)) {
  const distVendorDir = path.join(distDir, 'vendor');
  const copyTree = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(f => {
      const src = path.join(from, f);
      const dest = path.join(to, f);
      if (fs.statSync(src).isDirectory()) copyTree(src, dest);
      else fs.copyFileSync(src, dest);
    });
  };
  copyTree(vendorDir, distVendorDir);
}

// Copy shared data modules (DMC palette used by pattern-studio.js)
const dataDir = path.join(baseDir, 'data');
if (fs.existsSync(dataDir)) {
  const distDataDir = path.join(distDir, 'data');
  if (!fs.existsSync(distDataDir)) fs.mkdirSync(distDataDir, { recursive: true });
  fs.readdirSync(dataDir).forEach(f => {
    const src = path.join(dataDir, f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(distDataDir, f));
  });
}

// 9. Keep zip_contents/ synchronized with dist/ if directory exists
const zipDir = path.join(baseDir, 'zip_contents');
if (fs.existsSync(zipDir)) {
  function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, item.name);
      const d = path.join(dest, item.name);
      if (item.isDirectory()) {
        copyRecursive(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }
  copyRecursive(distDir, zipDir);
}

console.log(`Successfully generated rich SEO pages for all ${TOOLS.length} tools and mirrored to dist/!`);
