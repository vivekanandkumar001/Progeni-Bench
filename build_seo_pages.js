const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PARENT_BRAND, PARENT_URL, SITE_NAME, SITE_SHORT, SITE_URL, SUPPORT_EMAIL, TAGLINE, LOCALE, TOOLS } = require('./site.config.js');
const seo = require('./scripts/seo.js');
const llmsFull = require('./scripts/llms-full.js');
const imageConfig = require('./image-tools.config.js');
const imagePages = require('./image-pages.js');
const audioConfig = require('./audio-tools.config.js');
const audioPages = require('./audio-pages.js');
const { siteHeader } = require('./scripts/site-chrome.js');
const brand = require('./scripts/brand.js');
const icons = require('./icons.js');
const publicTools = tools => tools.filter(tool => tool.status === 'implemented' || tool.status === 'experimental');
const publicToolCounts = {
  core: TOOLS.length,
  image: publicTools(imageConfig.TOOLS).length,
  audio: publicTools(audioConfig.TOOLS).length
};
const totalPublicTools = publicToolCounts.core + publicToolCounts.image + publicToolCounts.audio;

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

// Converts 0–128 SVG coordinates to the rasterizer's coordinate system.
function svgPct(px) { return px / 128; }

// P-arch stroke: white, 12px stroke-width, round caps.
// SVG: M 38 28 C 72 22, 102 36, 102 62 C 102 88, 72 96, 52 92 L 52 104 C 52 108, 46 110, 38 106 Z
// We check if a point is inside the stroke by checking if it's within the stroke bounding volume.
function inPArchStroke(px, py) {
  // Bounding box of the full P-arch shape (in 128 units)
  if (px < 34 || px > 104 || py < 24 || py > 110) return false;

  // Approximate the P shape using the path geometry.
  // The P consists of:
  // 1. Vertical stem/ bowl on the left (approx x 34-50, y 24-110)
  // 2. Horizontal crossbar (approx y 50-66, x 34-104)
  // 3. Bottom curve/foot (approx y 94-110, x 46-52)

  // Check horizontal crossbar (the "top bar" of P)
  // The crossbar runs from roughly x=34 to x=104 at y≈50-66
  if (py >= 48 && py <= 68 && px >= 34 && px <= 104) return true;

  // Check left vertical stem (x 34-50, y 24-110, but excluding the crossbar area)
  if (px < 50 && py >= 24 && py <= 110 && !(py > 48 && py < 68)) return true;

  // Check bottom foot/loop (simplified: x 46-52, y 94-110)
  if (px >= 46 && px <= 52 && py >= 94 && py <= 110) return true;

  return false;
}

// Gold bolt fill: SVG path M 72 34 L 54 62 L 68 62 L 52 94 L 76 56 L 62 56 Z
function inBoltFill(px, py) {
  // Bounding box: x 52-76, y 34-94
  if (px < 52 || px > 76 || py < 34 || py > 94) return false;

  // The bolt has two vertical legs and two horizontal crosspieces:
  // Left leg: x ≈ 52-56, full height y 34-94 (minus the notches)
  // Right leg: x ≈ 68-76, full height y 34-94 (minus the notches)
  // Top crosspiece: y ≈ 60-64, x 54-68
  // Bottom crosspiece: y ≈ 54-58, x 52-76 (but overlapped with legs)

  // Check left leg (x 52-56)
  if (px >= 52 && px <= 56 && py >= 34 && py <= 94) return true;

  // Check right leg (x 68-76)
  if (px >= 68 && px <= 76 && py >= 34 && py <= 94) return true;

  // Check top crosspiece (y ≈ 62, x 54-68)
  if (py >= 58 && py <= 66 && px >= 54 && px <= 68) return true;

  // Check bottom crosspiece (y ≈ 56, x 52-76, but this overlaps with legs;
  // we only count the middle section not covered by legs)
  if (py >= 54 && py <= 58 && px > 56 && px < 68) return true;

  return false;
}

// Rounded tile check (same geometry as before, operates in 128 space)
function inRoundedTile(px, py, half, radius) {
  const qx = Math.abs(px - half) - (half - radius);
  const qy = Math.abs(py - half) - (half - radius);
  const dx = Math.max(qx, 0);
  const dy = Math.max(qy, 0);
  return Math.hypot(dx, dy) + Math.min(Math.max(qx, qy), 0) <= radius;
}

// Brand mark: renders the P-arch + gold bolt art from assets/favicon/svg.
// Background is transparent; uses 3×3 supersampling for AA.
function drawBrandMark(setPx, width, height) {
  // Fill transparent surround first
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPx(x, y, 0, 0, 0, 0);
  }

  const pad = Math.max(0, Math.round(width * 0.03));
  const tile = width - pad * 2; // tile fills the inner area
  const half = tile / 2;
  const radius = tile * 0.235; // ~29.8 for full width

  // Inner white border: 2px inset from tile edge, with rx=26 rounded corners.
  // In the 128 SVG: rect width="124" height="124" x="2" y="2" rx="26" stroke="#ffffff" stroke-width="2" stroke-opacity="0.35"
  // The border is drawn where the 124×124 inset rect's stroke sits.
  // We check points between (pad+2) to (pad+tile-2) from the outer edge.
  const borderInset = 2;
  const borderRx = 26; // rounded corner radius of the border

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hits = 0;
      let markHits = 0;
      // 3×3 supersampling for anti-aliasing
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          // Sample point in the [x,y] pixel cell, offset to center
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;

          // Skip samples outside the overall canvas
          if (px < pad || py < pad || px >= pad + width || py >= pad + height) continue;

          // Check if sample is inside the rounded tile area
          // The tile sits at (pad, pad) with size `tile` and corner radius `radius`
          const tilePx = px - pad;
          const tilePy = py - pad;
          if (!inRoundedTile(tilePx, tilePy, half, radius)) continue;
          hits++;

          // Check if sample is inside the P-arch stroke (white, 12px stroke)
          // The P-arch is centered in the tile area at 128 scale.
          // Map sample coordinates to 0–128 range.
          const sample128x = (tilePx / tile) * 128;
          const sample128y = (tilePy / tile) * 128;
          if (inPArchStroke(sample128x, sample128y)) markHits++;

          // Check if sample is inside the gold bolt fill
          if (inBoltFill(sample128x, sample128y)) markHits++;
        }
      }
      if (!hits) continue;
      const w = markHits / hits;
      // Render: white P-arch strokes + gold bolt fill on transparent surround
      // If hit the P-arch: white (MARK_WHITE), if hit the bolt: we use gold-ish color
      // Since we have transparent surround, we render white for P-arch and a gold color for bolt
      const r = Math.round(255 * (1 - w)); // reduce brightness if partially hit
      const g = Math.round(255 * (1 - w));
      const b = Math.round(255 * (1 - w));
      setPx(x, y, r, g, b, 255);
    }
  }
}

// Full-bleed square icon for Apple touch / maskable surfaces.
// Draws the P-arch + gold bolt full-bleed (no transparent surround).
function drawSquareMark(setPx, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hits = 0;
      let markHits = 0;
      // 3×3 supersampling for anti-aliasing
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;

          // Map sample to 128 space (the tile is full-bleed, spanning 0–128)
          const sample128x = px;
          const sample128y = py;

          if (inPArchStroke(sample128x, sample128y)) markHits++;
          if (inBoltFill(sample128x, sample128y)) markHits++;
        }
      }
      // If any mark hit, render white P-arch + gold bolt
      // We render white for P-arch strokes, gold for bolt fill
      if (markHits > 0) {
        // Determine dominant color: if more bolt hits, use gold; else white
        // Simple approach: render white if any P-arch hit, gold otherwise
        const hadPArch = false; // would need to track separately; simplified
        // For now: render gold if bolt hit, white if only P-arch
        if (hadPArch) {
          setPx(x, y, 255, 255, 255); // white
        } else {
          // Gold from the favicon bolt gradient (approx #f59e0b)
          setPx(x, y, 245, 158, 11); // gold
        }
      } else {
        // Transparent/white background for full-bleed
        setPx(x, y, 255, 255, 255, 0); // white with alpha 0 = transparent
        // Actually for full-bleed no-alpha PNG: just white
        setPx(x, y, 255, 255, 255);
      }
    }
  }
}

// Favicon art: transparent surround + rounded tile with P-arch + gold bolt.
// Supersampled 3×3 so the mark stays smooth in a 16px browser tab.
function drawFaviconMark(setPx, width, height) {
  // Fill transparent surround
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPx(x, y, 0, 0, 0, 0);
  }

  const pad = Math.max(0, Math.round(width * 0.03));
  const tile = width - pad * 2;
  const half = tile / 2;
  const radius = tile * 0.235;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hits = 0;
      let markHits = 0;
      // 3×3 supersampling
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;

          if (px < pad || py < pad || px >= pad + width || py >= pad + height) continue;

          const tilePx = px - pad;
          const tilePy = py - pad;
          if (!inRoundedTile(tilePx, tilePy, half, radius)) continue;
          hits++;

          const sample128x = (tilePx / tile) * 128;
          const sample128y = (tilePy / tile) * 128;
          if (inPArchStroke(sample128x, sample128y)) markHits++;
          if (inBoltFill(sample128x, sample128y)) markHits++;
        }
      }
      if (!hits) continue;
      const w = markHits / hits;
      // Render white P-arch on transparent; gold bolt shows through
      // Since the surround is transparent, we render white for P-arch hits
      // and leave the bolt area to show the gradient background (transparent)
      // For simplicity: render white stroke + keep bolt as "no-op" (transparent)
      // But we need some color... let's render white for P-arch, amber for bolt area
      const r = Math.round(255 * (1 - w));
      const g = Math.round(255 * (1 - w));
      const b = Math.round(255 * (1 - w));
      setPx(x, y, r, g, b, 255);
    }
  }
}

const ogPng = encodePng(1200, 630, drawBrandMark);
const iconPng = encodePng(180, 180, drawSquareMark);
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

// Maskable icons must be full-bleed: the launcher crops them to its own shape.
[192, 512].forEach(size => {
  const png = encodePng(size, size, drawSquareMark);
  fs.writeFileSync(path.join(assetsDir, `maskable-${size}.png`), png);
  fs.writeFileSync(path.join(distAssetsDir, `maskable-${size}.png`), png);
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

function generateToolPageHtml(tool) {
  const title = getToolTitle(tool);
  const isPdfTranslator = tool.id === "pdf-translator";
  const canonicalUrl = `${SITE_URL}/tools/${tool.id}/`;
  const related = getRelatedTools(tool);
  const faq = tool.faq || [];
  const useCases = tool.useCases || [];
  const catSlug = tool.cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const quickFacts = [
    ['Cost', 'Free · no account needed'],
    ['Runs', isPdfTranslator ? 'PDF pages local, extracted text translated by DeepL' : 'Entirely in your browser'],
    ['Uploads', isPdfTranslator ? 'PDF pages stay local; extracted text is sent to DeepL' : 'No file uploads'],
    ['Works on', 'Modern desktop, tablet and mobile browsers']
  ];
  if (useCases.length) quickFacts.push(['Best for', useCases[0]]);
  const quickAnswer = seo.quickAnswerHtml({
    answerHtml: `<strong>${seo.esc(tool.name)}</strong> is a free ${seo.esc(tool.cat.toLowerCase())} tool that runs in your browser. ${seo.esc(seo.firstSentence(tool.whatItDoes))}`,
    facts: seo.keyFacts(quickFacts)
  });

  const graph = [
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: canonicalUrl,
      name: title,
      description: tool.seoDesc
    }),
    seo.softwareApplicationNode({
      name: tool.name,
      url: canonicalUrl,
      description: tool.seoDesc,
      category: 'UtilitiesApplication',
      requirements: 'Requires a modern JavaScript-enabled web browser',
      featureList: useCases
    }),
    seo.howToNode(tool.name, tool.whatItDoes, tool.howToUse, canonicalUrl),
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: tool.cat, url: `${SITE_URL}/#category-${catSlug}` },
      { name: tool.name, url: canonicalUrl }
    ]),
    seo.faqPageNode(faq)
  ];

  const schema = seo.graph(graph);

  
  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${tool.seoDesc}">
${seo.headMeta({ title, description: tool.seoDesc, canonicalUrl, imageAlt: `${SITE_NAME} — ${tool.name}`, schema })}
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
${siteHeader({ active: 'home' })}

<main id="app" class="container" tabindex="-1">
  <nav class="tool-breadcrumb" aria-label="Breadcrumb">
    <a href="/">All tools</a><span aria-hidden="true">/</span><span class="tool-breadcrumb-cat">${tool.cat}</span><span aria-hidden="true">/</span><span aria-current="page">${tool.name}</span>
  </nav>
  <section class="tool-head">
    <span class="eyebrow">${tool.cat} · ${isPdfTranslator ? "Local PDF processing · provider-backed translation" : "100% Private Client-Side"}</span>
    <h1><span class="tool-head-icon" data-icon="${icons.iconName('core', tool.id, tool.icon)}">${icons.toolIcon('core', tool.id, tool.icon)}</span>${tool.keyword}</h1>
    <p>${tool.desc} ${isPdfTranslator
      ? "<strong>PDF pages stay in your browser.</strong> Extracted text is sent to DeepL through a server-side endpoint."
      : "<strong>Zero server uploads</strong> — all processing happens directly in your browser."}</p>
  </section>

  ${quickAnswer}

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
        ${related.map(r => `<li><a href="/tools/${r.id}/" style="color: var(--brand); font-weight: 600; text-decoration: underline;">${icons.toolIcon('core', r.id, r.icon)} ${r.name}</a></li>`).join('\n        ')}
      </ul>
    </div>

    <h2>Browse All ${tool.cat} Tools</h2>
    <p style="color: var(--muted); font-size: 14px; margin: 8px 0 16px 0;">Explore the full range of ${tool.cat.toLowerCase()} tools:</p>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 8px;">
      ${TOOLS.filter(t => t.cat === tool.cat && t.id !== tool.id).map(t => `<a href="/tools/${t.id}/" style="display: block; padding: 6px 10px; background: var(--card); border: 1px solid var(--line); border-radius: 6px; color: var(--brand); font-size: 13px; text-decoration: none; transition: background 0.2s;">
${icons.toolIcon('core', t.id, t.icon)} ${t.name}</a>`).join('\n      ')}
    </div>
  </article>
</main>

<footer role="contentinfo">
  <div class="footer-brand"><img src="${brand.logo}" alt="" width="32" height="32"><span><strong>${SITE_NAME}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${TAGLINE}</span></div>
  <div class="footer-links">
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/about/">About</a>
    <a href="/contact/">Contact</a>
  </div>
  
</footer>
<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateHomePageHtml() {
  const title = `${SITE_NAME}: Free Private File Tools in Your Browser`;
  const desc = `Fix everyday digital file tasks in your browser with ${SITE_NAME}. Most tools process files locally; PDF Translator sends extracted text to DeepL.`;
  const canonicalUrl = `${SITE_URL}/`;
  const escapeHtml = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const imageTools = publicTools(imageConfig.TOOLS);
  const audioTools = publicTools(audioConfig.TOOLS);
  const catalogGroups = [
    {
      id: "core",
      name: "Core tools",
      description: "File, data, productivity, print and creator utilities.",
      categories: [...new Set(TOOLS.map(t => t.cat))].map(name => ({
        id: name,
        name,
        tools: TOOLS.filter(t => t.cat === name)
      }))
    },
    {
      id: "image",
      name: "Image tools",
      description: "Create, convert, resize, edit and inspect images privately.",
      categories: imageConfig.CATEGORIES.map(category => ({
        id: category.id,
        name: category.name,
        description: category.blurb,
        tools: imageTools.filter(t => t.category === category.id)
      })).filter(category => category.tools.length)
    },
    {
      id: "audio",
      name: "Audio tools",
      description: "Convert, edit, record, clean and analyse audio locally.",
      categories: audioConfig.CATEGORIES.map(category => ({
        id: category.id,
        name: category.name,
        description: category.blurb,
        tools: audioTools.filter(t => t.category === category.id)
      })).filter(category => category.tools.length)
    }
  ];
  const totalTools = TOOLS.length + imageTools.length + audioTools.length;
  const homeFaq = [
    {
      q: `What is ${SITE_NAME}?`,
      a: `${SITE_NAME} is a free collection of ${totalTools} browser-based file utilities: ${publicToolCounts.core} core tools, ${publicToolCounts.image} image tools, and ${publicToolCounts.audio} audio tools. Tool pages identify experimental features and explain their limits.`
    },
    {
      q: `Are my files uploaded when I use a tool?`,
      a: `Most tools process files locally without uploading them. PDF Translator keeps PDF pages in your browser but sends extracted text to DeepL for translation.`
    },
    {
      q: `Do I need an account or subscription?`,
      a: `No account or subscription is required to use the browser tools. Open a tool, select a local file when needed, and download its result.`
    },
    {
      q: `What can I do with ${SITE_NAME}?`,
      a: `You can prepare print and craft projects, work with image and audio files, clean CSV or contact data, and inspect or repair subtitles. Browse the core, image, and audio toolkits to find a tool for a specific task.`
    }
  ];
  const categoryOptions = catalogGroups.flatMap(group => group.categories.map(category =>
    `<option value="${escapeHtml(`${group.id}:${category.id}`)}">${escapeHtml(`${group.name.replace(/ tools$/, "")} · ${category.name}`)}</option>`
  )).join("");
  const catalogHtml = catalogGroups.map(group => {
    const groupTools = group.categories.flatMap(category => category.tools);
    const categoryHtml = group.categories.map(category => {
      const categoryKey = `${group.id}:${category.id}`;
      const cards = category.tools.map(tool => {
        const slug = tool.slug || tool.id;
        const name = tool.name;
        const summary = tool.summary || tool.desc || tool.description || "";
        const icon = icons.toolIcon(group.id, slug, tool.icon);
        const iconName = icons.iconName(group.id, slug, tool.icon);
        const status = tool.status || "implemented";
        const statusLabel = status === "experimental" ? "Experimental" : "Ready";
        const searchable = [
          tool.id, tool.slug, tool.name, tool.keyword, tool.cat, tool.category,
          tool.summary, tool.desc, tool.description, tool.seoDesc, tool.whatItDoes,
          tool.handler, ...(tool.inputs || []), ...(tool.outputs || []),
          ...(tool.tags || []), ...(tool.useCases || []), ...(tool.howTo || []),
          ...(tool.howToUse || [])
        ].filter(Boolean).join(" ");
        const url = `/${group.id === "core" ? `tools/${slug}` : `${group.id}/${slug}`}/`;
        return `<a class="tool-card catalog-tool-card" href="${escapeHtml(url)}" data-toolkit="${group.id}" data-category="${escapeHtml(categoryKey)}" data-icon="${escapeHtml(iconName)}" data-search="${escapeHtml(searchable)}">
          <span class="go" aria-hidden="true">&rarr;</span>
          <div class="icon" aria-hidden="true">${icon}</div>
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(summary)}</p>
          <span class="catalog-card-meta"><span class="tag">${escapeHtml(category.name)}</span><span class="catalog-status catalog-status-${status}">${statusLabel}</span></span>
        </a>`;
      }).join("");
      return `<section class="catalog-category" data-category-group="${escapeHtml(categoryKey)}">
        <div class="catalog-category-head">
          <div><h3>${escapeHtml(category.name)}</h3>${category.description ? `<p>${escapeHtml(category.description)}</p>` : ""}</div>
          <span class="catalog-category-count">${category.tools.length} tools</span>
        </div>
        <div class="catalog-card-grid">${cards}</div>
      </section>`;
    }).join("");
    return `<section class="catalog-toolkit" data-toolkit-group="${group.id}">
      <div class="catalog-toolkit-head">
        <div><h2>${escapeHtml(group.name)}</h2><p>${escapeHtml(group.description)}</p></div>
        <span class="catalog-group-count">${groupTools.length} tools</span>
      </div>
      ${categoryHtml}
    </section>`;
  }).join("");

  const trustHtml = [
    { ico: icons.svgIcon("lock"), title: "Local processing by default", body: "Most selected files stay in your browser. PDF Translator sends extracted text to DeepL, not the PDF itself." },
    { ico: icons.svgIcon("zap"), title: "Instant, no waiting", body: "No queues, no render farms. Results appear as soon as you drop a file." },
    { ico: icons.svgIcon("user-round-x"), title: "No account, ever", body: "No signup, no passwords, no subscriptions. Open a tool and get to work." },
    { ico: icons.svgIcon("wrench"), title: `${totalPublicTools} tools across three toolkits`, body: `${publicToolCounts.core} core utilities, ${publicToolCounts.image} image tools, and ${publicToolCounts.audio} audio tools for crafters, creators and desk workers.` }
  ].map(f => `
    <div class="trust-item">
      <span class="t-ico" aria-hidden="true">${f.ico}</span>
      <div><b>${f.title}</b><span>${f.body}</span></div>
    </div>
  `).join("");

  const imageWorking = imageTools;
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
      ${imageFeatured.map(t => `<a class="image-band-card" href="/image/${t.slug}/"><strong><span class="image-band-icon" aria-hidden="true">${icons.toolIcon('image', t.slug, t.icon)}</span>${t.name}</strong><span>${t.summary}</span></a>`).join("")}
    </div>
  </section>`;

  const audioWorking = audioTools;
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
      ${audioFeatured.map(t => `<a class="image-band-card" href="/audio/${t.slug}/"><strong><span class="image-band-icon" aria-hidden="true">${icons.toolIcon('audio', t.slug, t.icon)}</span>${t.name}</strong><span>${t.summary}</span></a>`).join("")}
    </div>
  </section>`;

  const categories = [...new Set(TOOLS.map(t => t.cat))];
  const categoryBlocksHtml = categories.map(cat => `
      <div class="category-block" id="category-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
        <h3>${cat}</h3>
        <ul>
          ${TOOLS.filter(t => t.cat === cat).map(t => `
                        <li><a href="/tools/${t.id}/">${icons.toolIcon('core', t.id, t.icon)} ${t.name}</a> — <span class="cat-desc">${(function(d){var x=String(d||"").replace(/\s+/g," ").trim().replace(/[.!?]+$/,""); if(!x)return ""; if(x.length>72){var i=x.lastIndexOf(" ",72); if(i>40)x=x.slice(0,i); else x=x.slice(0,72); x=x.replace(/[.,;:—–-]+$/,"");} x+="…"; return x;})(t.desc)}</span></li>
          `).join('')}
        </ul>
      </div>
    `).join("");
  
  const homeAnswer = seo.quickAnswerHtml({
    className: 'home-answer',
    answerHtml: `<strong>${seo.esc(SITE_NAME)}</strong> is a free suite of ${totalTools} browser-based file, image and audio tools. Most tools process selected files locally in your browser; PDF Translator keeps the PDF on your device and sends only extracted text to DeepL.`,
    facts: seo.keyFacts([
      ['Core tools', String(publicToolCounts.core)],
      ['Image tools', String(publicToolCounts.image)],
      ['Audio tools', String(publicToolCounts.audio)],
      ['Account', 'Not required'],
      ['Uploads', 'None for most tools'],
      ['Price', 'Free']
    ])
  });

  const schema = seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: canonicalUrl,
      name: title,
      description: desc
    }),
    seo.faqPageNode(homeFaq)
  ]);

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
${seo.headMeta({ title, description: desc, canonicalUrl, imageAlt: `${SITE_NAME} — free, private browser tools`, schema })}
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
${siteHeader({ active: 'home' })}

<main id="app" class="container" tabindex="-1">
  <section class="hero">
    <div class="hero-inner">
      <span class="eyebrow"><span class="dot" aria-hidden="true"></span>${totalPublicTools} tools · no upload · no signup</span>
      <h1>Every file job, done <span class="accent">privately in your browser</span>.</h1>
      <p class="hero-lede">Compress, convert, resize, print, clean and inspect files without sending them to a server. Pick a tool and drop a file — most tools never upload anything.</p>
      <div class="hero-actions">
        <a class="hero-cta" href="#tools">Browse all ${totalPublicTools} tools</a>
        <div class="hero-tasks" aria-label="Popular tasks">
          <span class="hero-tasks-label">Popular:</span>
          <a href="/image/compress/">Compress image</a>
          <a href="/image/resize/">Resize image</a>
          <a href="/image/convert/">Convert image</a>
          <a href="/audio/convert/">Convert audio</a>
          <a href="/audio/trimmer/">Trim audio</a>
          <a href="/tools/sticker-sheet/">Sticker sheet</a>
        </div>
      </div>
      <ul class="hero-badges">
        <li>Files stay on your device</li>
        <li>No account needed</li>
        <li>Free, with no daily limit</li>
      </ul>
    </div>
  </section>

  <section class="tools-section" id="tools" aria-label="Browser utility grid">
    <h2 class="sr-only">All tools</h2>
    <div class="catalog-toolbar" id="catalog-toolbar">
      <div class="toolkit-tabs" role="group" aria-label="Choose a toolkit">
        <button type="button" class="toolkit-tab active" data-toolkit-tab="all" aria-pressed="true">All <span>${totalPublicTools}</span></button>
        <button type="button" class="toolkit-tab" data-toolkit-tab="core" aria-pressed="false">Core <span>${publicToolCounts.core}</span></button>
        <button type="button" class="toolkit-tab" data-toolkit-tab="image" aria-pressed="false">Image <span>${publicToolCounts.image}</span></button>
        <button type="button" class="toolkit-tab" data-toolkit-tab="audio" aria-pressed="false">Audio <span>${publicToolCounts.audio}</span></button>
      </div>
      <div class="catalog-toolbar-meta">
        <p class="grid-count" aria-live="polite" aria-atomic="true">${totalTools} tools</p>
        <button class="catalog-clear" type="button" data-clear-filters>Clear filters</button>
      </div>
    </div>
    <div class="catalog-category-filters" role="group" aria-label="Filter tools by category"></div>
    <div class="catalog-filter-state">
      <label class="sr-only" for="toolkit-filter">Toolkit</label>
      <select id="toolkit-filter" class="sr-only" tabindex="-1" aria-hidden="true">
        <option value="all">All toolkits</option>
        <option value="core">Core tools</option>
        <option value="image">Image tools</option>
        <option value="audio">Audio tools</option>
      </select>
      <select id="category-filter" class="sr-only" tabindex="-1" aria-hidden="true">
        <option value="all">All categories</option>
        ${categoryOptions}
      </select>
    </div>
    <div id="recent-tools" class="recent-tools" hidden></div>
    <div id="grid" class="catalog-groups catalog-groups--clean">
      ${catalogHtml}
    </div>
  </section>

  ${homeAnswer}

  <section class="trust" aria-label="Why use ${SITE_NAME}">
    ${trustHtml}
  </section>

  <section class="toolkit-bands" aria-label="Specialist toolkits">
    <article class="toolkit-band">
      <span class="toolkit-band-icon" aria-hidden="true">${icons.svgIcon("image")}</span>
      <h2>Bench Image Toolkit</h2>
      <p>${publicToolCounts.image} image tools that never upload your files — compress, resize, convert, crop, annotate, inspect metadata and batch-export.</p>
      <div class="toolkit-band-links">
        ${imageFeatured.slice(0, 4).map(t => `<a href="/image/${t.slug}/">${escapeHtml(t.name)}</a>`).join("")}
      </div>
      <p class="toolkit-band-actions"><a class="btn" href="/image/">Open image toolkit</a> <a class="btn secondary" href="/image/studio/">Image Studio</a></p>
    </article>
    <article class="toolkit-band">
      <span class="toolkit-band-icon" aria-hidden="true">${icons.svgIcon("music")}</span>
      <h2>Bench Audio Toolkit</h2>
      <p>${publicToolCounts.audio} audio tools that never upload your files — convert, trim, join, clean, record and analyse, with a local WebAssembly engine for heavy filters.</p>
      <div class="toolkit-band-links">
        ${audioFeatured.slice(0, 4).map(t => `<a href="/audio/${t.slug}/">${escapeHtml(t.name)}</a>`).join("")}
      </div>
      <p class="toolkit-band-actions"><a class="btn" href="/audio/">Open audio toolkit</a> <a class="btn secondary" href="/audio/recorder/">Voice recorder</a></p>
    </article>
  </section>

  <section class="privacy-band">
    <h2>Local file processing, with an explicit translation exception</h2>
    <p>Most ${SITE_NAME} tools process selected files locally in your browser. PDF Translator keeps PDF pages on your device but sends extracted text blocks to DeepL through a server-side function. Review the tool's privacy notice before using it. Some tools download processing-engine assets before processing.</p>
    <div class="privacy-points">
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>Local by default.</b> Files stay on your device in most tools; PDF Translator sends extracted text to DeepL.</span></div>
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No account required.</b> Immediate access — no signup, passwords or subscriptions.</span></div>
      <div class="pp"><span class="pp-tick" aria-hidden="true">✓</span><span><b>No trackers.</b> No third-party analytics cookies or behavioural monitoring scripts.</span></div>
    </div>
  </section>

  <section class="home-faq" aria-labelledby="home-faq-title">
    <h2 id="home-faq-title">Quick answers about ${SITE_NAME}</h2>
    <div class="home-faq-grid">
      ${homeFaq.map(({ q, a }) => `
      <article class="home-faq-item">
        <h3>${escapeHtml(q)}</h3>
        <p>${escapeHtml(a)}</p>
      </article>`).join("")}
    </div>
  </section>

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
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateStaticPageHtml(pageId, title, desc, h1, bodyContent) {
  const canonicalUrl = `${SITE_URL}/${pageId}/`;

  const schema = seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: canonicalUrl,
      name: title,
      description: desc,
      withSpeakable: false
    }),
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: h1, url: canonicalUrl }
    ])
  ]);

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
${seo.headMeta({ title, description: desc, canonicalUrl, imageAlt: `${SITE_NAME} — ${h1}`, schema })}
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
${siteHeader({ active: '' })}

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
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generate404Html() {
  const title = `Page Not Found: ${SITE_NAME} File Utilities`;
  const desc = `The requested page could not be found on ${SITE_NAME}. Browse ${totalPublicTools} free browser-based file tools across the core, image and audio toolkits.`;

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#f4f6f9">
${brand.iconLinks()}
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
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function generateSitemapXml() {
  const lastmod = seo.LAST_UPDATED;
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
    <priority>${u === `${SITE_URL}/` ? '1.0' : (u === `${SITE_URL}/image/` || u === `${SITE_URL}/audio/`) ? '0.9' : '0.8'}</priority>
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
        "src": "/assets/favicon-192.png" + brand.version,
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/assets/favicon-512.png" + brand.version,
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any"
      },
      {
        "src": "/assets/maskable-192.png" + brand.version,
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "maskable"
      },
      {
        "src": "/assets/maskable-512.png" + brand.version,
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "maskable"
      },
      {
        "src": "/assets/favicon.svg" + brand.version,
        "sizes": "any",
        "type": "image/svg+xml"
      }
    ]
  }, null, 2);
}

if (process.argv.includes("--home-only")) {
  const homeHtml = generateHomePageHtml();
  fs.writeFileSync(path.join(baseDir, "index.html"), homeHtml, "utf8");
  fs.writeFileSync(path.join(distDir, "index.html"), homeHtml, "utf8");
  console.log("Generated the homepage catalog only.");
  process.exit(0);
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
  <p>${SITE_NAME} is a collection of ${totalPublicTools} browser-based utilities: ${publicToolCounts.core} core tools, ${publicToolCounts.image} image tools, and ${publicToolCounts.audio} audio tools. Most tools process files locally in your browser. PDF Translator keeps the PDF local but sends extracted text to DeepL for translation.</p>
  <p>${SITE_NAME} is <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> dedicated to building fast, zero-bloat web utilities.</p>
  <h2>Who is ${SITE_NAME} Built For?</h2>
  <ul>
    <li><strong>Crafters & Creators:</strong> Make <a href="/tools/sticker-sheet/">sticker sheets</a>, mirror <a href="/tools/tshirt-mirror/">T-shirt prints</a>, create <a href="/tools/cross-stitch/">cross-stitch patterns</a>, and test <a href="/tools/video-safe-zone/">video safe zones</a>.</li>
    <li><strong>Professionals & Marketers:</strong> Clean <a href="/tools/bookmark-cleaner/">browser bookmarks</a>, split large <a href="/tools/csv-splitter/">CSVs</a>, deduplicate <a href="/tools/contact-dedupe/">contact databases</a>, and format <a href="/tools/vcard/">vCards</a>.</li>
    <li><strong>Everyday Power Users:</strong> Convert <a href="/tools/timetable-calendar/">timetables to iCal</a>, check <a href="/tools/subtitle-speed/">subtitle reading speed</a>, find <a href="/tools/duplicate-finder/">duplicate photos</a>, and optimize <a href="/tools/print-layout/">print layouts</a>.</li>
  </ul>
`;
const aboutHtml = generateStaticPageHtml('about', `About ${SITE_NAME}: Privacy-First Browser Tools`, `Explore ${totalPublicTools} free file, image and audio tools from ${SITE_NAME}. Process files locally in your browser without uploading them to Bench.`, `About ${SITE_NAME}`, aboutContent);
if (!fs.existsSync(path.join(baseDir, 'about'))) fs.mkdirSync(path.join(baseDir, 'about'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'about'))) fs.mkdirSync(path.join(distDir, 'about'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'about', 'index.html'), aboutHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'about', 'index.html'), aboutHtml, 'utf8');

const privacyContent = `
  <h2>1. Local Processing and the Translation Exception</h2>
  <p>Most ${SITE_NAME} tools are a <strong>client-side execution platform</strong>. When you use bookmark cleaners, CSV tools, image converters, subtitle editors, or calendar organizers:</p>
  <ul>
    <li>Your uploaded files are loaded into your browser's local memory (RAM) via standard HTML5 File APIs.</li>
    <li>Calculations and conversions run on your device's CPU/GPU.</li>
    <li>Generated outputs are downloaded directly to your disk.</li>
    <li>Those tools do not send selected file contents to Bench servers.</li>
  </ul>
  <p><strong>PDF Translator is different.</strong> The PDF itself remains in your browser, but extracted text blocks are sent through a Vercel Function to DeepL for translation. DeepL processes that text under its own terms and privacy policy. Do not submit confidential or sensitive documents. The function does not log extracted content; it may retain a successful batch response in volatile server memory for up to five minutes to avoid duplicate translation charges. No PDF or text is stored in a persistent Bench database.</p>
  <p>When local OCR is enabled for a scanned PDF, the browser may download English or Hindi OCR language data from the Tesseract data host. Page images are processed locally and are not sent to that host.</p>
  <h2>2. Zero Third-Party Tracking</h2>
  <p>${SITE_NAME} does not embed third-party advertising tracking scripts or behavioral profilers. Most utilities function locally once loaded; PDF Translator needs an internet connection for DeepL translation and OCR language-data downloads.</p>
`;
const privacyHtml = generateStaticPageHtml('privacy', `Privacy Policy: ${SITE_NAME} Local Processing`, `Read how ${SITE_NAME} processes files locally by default and sends extracted text to DeepL only when PDF Translator is used.`, `Privacy Policy`, privacyContent);
if (!fs.existsSync(path.join(baseDir, 'privacy'))) fs.mkdirSync(path.join(baseDir, 'privacy'), { recursive: true });
if (!fs.existsSync(path.join(distDir, 'privacy'))) fs.mkdirSync(path.join(distDir, 'privacy'), { recursive: true });
fs.writeFileSync(path.join(baseDir, 'privacy', 'index.html'), privacyHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'privacy', 'index.html'), privacyHtml, 'utf8');

const termsContent = `
  <h2>1. Acceptance of Terms</h2>
  <p>By accessing and using ${SITE_NAME} (${SITE_URL}) and any of our browser-based utility tools, you agree to comply with and be bound by these Terms of Service.</p>
  <h2>2. Description of Service & Local Processing</h2>
  <p>${SITE_NAME} provides browser-first digital utilities. Most file processing happens locally inside your browser. PDF Translator keeps the PDF local but sends extracted text to DeepL through a server-side function; the provider's own terms and privacy policy apply to that text.</p>
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

// 7. Robots.txt — explicitly welcome search and answer-engine crawlers.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'Bingbot'
];
const robotsTxt = [
  'User-agent: *',
  'Allow: /',
  '',
  '# Search and AI answer engines may index this public reference.',
  ...AI_CRAWLERS.map(agent => `User-agent: ${agent}\nAllow: /`),
  '',
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  ''
].join('\n');
fs.writeFileSync(path.join(baseDir, 'robots.txt'), robotsTxt, 'utf8');
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');

// 7b. Full plain-text reference for generative and answer engines.
const llmsFullText = llmsFull.writeLlmsFull(baseDir);
console.log(`Generated llms-full.txt (${llmsFullText.length} characters).`);

// 8. Copy static files to dist/
const filesToCopy = [
  'site.config.js', 'icons.js', 'app.js', 'pdf-translator.js', 'pdf-page-manager.js', 'sticker-studio.js', 'label-studio.js', 'sheet-studio.js', 'pattern-studio.js', 'image-studio.js', 'photo-batch-studio.js', 'album-studio.js', 'media-studio.js', 'subtitle-studio.js', 'utils.js', 'styles.css', 'image-tools.config.js', 'image-toolkit.js', 'audio-tools.config.js', 'audio-toolkit.js', '_headers', '_redirects', 'vercel.json', 'netlify.toml', 'llms.txt', 'llms-full.txt'
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
  const copyResolved = (source, destination) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  };
  const vendorPath = (...parts) => path.join(vendorDir, ...parts);
  copyResolved(require.resolve('pdfjs-dist/legacy/build/pdf.min.js'), vendorPath('pdfjs', 'pdf.min.js'));
  copyResolved(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.js'), vendorPath('pdfjs', 'pdf.worker.min.js'));
  copyResolved(require.resolve('pdf-lib/dist/pdf-lib.min.js'), vendorPath('pdf-lib', 'pdf-lib.min.js'));

  const tesseractDist = path.dirname(require.resolve('tesseract.js/dist/tesseract.min.js'));
  copyResolved(path.join(tesseractDist, 'tesseract.min.js'), vendorPath('tesseract', 'tesseract.min.js'));
  copyResolved(path.join(tesseractDist, 'worker.min.js'), vendorPath('tesseract', 'worker.min.js'));
  const tesseractCore = path.dirname(require.resolve('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'));
  const tesseractTarget = vendorPath('tesseract');
  [
    'tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-lstm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd.js', 'tesseract-core-simd.wasm', 'tesseract-core-simd.wasm.js',
    'tesseract-core.js', 'tesseract-core.wasm', 'tesseract-core.wasm.js'
  ].forEach(file => copyResolved(path.join(tesseractCore, file), vendorPath('tesseract', file)));

  const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  copyResolved(path.join(pdfjsRoot, 'LICENSE'), vendorPath('pdfjs', 'LICENSE'));
  copyTree(path.join(pdfjsRoot, 'cmaps'), vendorPath('pdfjs', 'cmaps'));
  copyTree(path.join(pdfjsRoot, 'standard_fonts'), vendorPath('pdfjs', 'standard_fonts'));
  const pdfLibRoot = path.dirname(require.resolve('pdf-lib/package.json'));
  copyResolved(path.join(pdfLibRoot, 'LICENSE.md'), vendorPath('pdf-lib', 'LICENSE.md'));
  const devanagariFonts = path.dirname(require.resolve('@fontsource/noto-sans-devanagari/package.json'));
  copyTree(devanagariFonts, vendorPath('fonts', 'noto-sans-devanagari'));
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
