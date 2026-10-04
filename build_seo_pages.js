const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PARENT_BRAND, SITE_NAME, SITE_URL, TAGLINE, LOCALE, TOOLS } = require('./site.config.js');

const baseDir = __dirname;
const distDir = path.join(baseDir, 'dist');
const toolsDir = path.join(baseDir, 'tools');
const distToolsDir = path.join(distDir, 'tools');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
if (!fs.existsSync(distToolsDir)) fs.mkdirSync(distToolsDir, { recursive: true });

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

function createPng(width, height, r, g, b) {
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const p = rowOffset + 1 + x * 3;
      rawData[p] = r;
      rawData[p + 1] = g;
      rawData[p + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
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
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  return Buffer.concat([signature, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const assetsDir = path.join(baseDir, 'assets');
const distAssetsDir = path.join(distDir, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
if (!fs.existsSync(distAssetsDir)) fs.mkdirSync(distAssetsDir, { recursive: true });

const ogPng = createPng(1200, 630, 11, 16, 32);
const iconPng = createPng(180, 180, 11, 16, 32);
fs.writeFileSync(path.join(assetsDir, 'og-image.png'), ogPng);
fs.writeFileSync(path.join(distAssetsDir, 'og-image.png'), ogPng);
fs.writeFileSync(path.join(assetsDir, 'apple-touch-icon.png'), iconPng);
fs.writeFileSync(path.join(distAssetsDir, 'apple-touch-icon.png'), iconPng);

function getToolTitle(tool) {
  let title = `${tool.name}: Free Online, No Upload | ${SITE_NAME}`;
  if (title.length > 60) title = `${tool.name}: Free Online Tool | ${SITE_NAME}`;
  if (title.length > 60) title = `${tool.name}: Free Online, No Upload`;
  if (title.length > 60) title = `${tool.name} | ${SITE_NAME}`;
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
  const canonicalUrl = `${SITE_URL}/tools/${tool.id}/`;
  const related = getRelatedTools(tool);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
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
        "isAccessibleForFree": true
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
            "item": `${SITE_URL}/`
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": tool.name,
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
  <meta name="description" content="${tool.seoDesc}">
  <meta name="theme-color" content="#0b1020">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${tool.seoDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/">${SITE_NAME}<span>.</span></a>
  <nav aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
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

  <article class="tool-content" style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 24px; line-height: 1.8;">
    <h2>What it does</h2>
    <p>${tool.whatItDoes}</p>

    <h2>How to use</h2>
    <ol>
      ${tool.howToUse.map(step => `<li>${step}</li>`).join('\n      ')}
    </ol>

    <h2>Limits & Considerations</h2>
    <p>${tool.limits}</p>

    <h2>Privacy & Security</h2>
    <p>${tool.privacy}</p>

    <h2>Related ${tool.cat} Tools</h2>
    <div class="tool-links">
      <ul class="related-links" style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        ${related.map(r => `<li><a href="/tools/${r.id}/" style="color: var(--brand); font-weight: 600; text-decoration: underline;">${r.icon} ${r.name}</a></li>`).join('\n        ')}
      </ul>
    </div>
  </article>
</main>

<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> is a ${PARENT_BRAND} project — ${TAGLINE}</div>
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

function generateHomePageHtml() {
  const title = `${SITE_NAME}: Free Private File Tools in Your Browser`;
  const desc = `Fix everyday digital file tasks in your browser with ${SITE_NAME}. Convert CSVs, repair subtitles, format Avery labels, and crop photos with zero uploads.`;
  const canonicalUrl = `${SITE_URL}/`;

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": canonicalUrl,
        "inLanguage": LOCALE,
        "description": TAGLINE
      },
      {
        "@type": "Organization",
        "name": PARENT_BRAND,
        "url": canonicalUrl,
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
  <meta name="theme-color" content="#0b1020">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/">${SITE_NAME}<span>.</span></a>
  <nav aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
</header>

<main id="app" class="container">
  <section class="hero">
    <span class="eyebrow">30 Global Utilities · 100% Private</span>
    <h1>Free Private File Tools in Your Browser</h1>
    <p>Instant client-side tools for crafters, creators, and professionals. Make Avery labels, sticker sheets, mirror T-shirt prints, repair subtitles, dedupe contacts, and convert CSVs without uploading your data to external servers.</p>
  </section>
</main>

<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> is a ${PARENT_BRAND} project — ${TAGLINE}</div>
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

function generateStaticPageHtml(pageId, title, desc, h1, bodyContent) {
  const canonicalUrl = `${SITE_URL}/${pageId}/`;

  return `<!doctype html>
<html lang="${LOCALE}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#0b1020">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="${canonicalUrl}">
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/">${SITE_NAME}<span>.</span></a>
  <nav aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/about/">About</a>
    <a href="/privacy/">Privacy</a>
    <a href="/terms/">Terms</a>
    <a href="/contact/">Contact</a>
  </nav>
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
  <div><strong>${SITE_NAME}</strong> is a ${PARENT_BRAND} project — ${TAGLINE}</div>
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
  <meta name="theme-color" content="#0b1020">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/styles.css">
</head>
<body><a class="skip-link" href="#main">Skip to main content</a>
<main id="main" class="container" style="text-align: center; padding: 60px 20px;">
  <h1>Page Not Found</h1>
  <p>The page you are looking for does not exist on ${SITE_NAME}.</p>
  <p>The link might be outdated or mistyped.</p>
  <br>
  <a href="/" class="btn">Return to ${SITE_NAME} Homepage</a>
</main>
<footer role="contentinfo">
  <div><strong>${SITE_NAME}</strong> is a ${PARENT_BRAND} project — ${TAGLINE}</div>
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
  const lastmod = "2026-10-05";
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/about/`,
    `${SITE_URL}/privacy/`,
    `${SITE_URL}/terms/`,
    `${SITE_URL}/contact/`,
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
    "short_name": "Bench",
    "description": TAGLINE,
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0b1020",
    "theme_color": "#0b1020",
    "icons": [
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

// 2. Build home page
const homeHtml = generateHomePageHtml();
fs.writeFileSync(path.join(baseDir, 'index.html'), homeHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'index.html'), homeHtml, 'utf8');

// 3. Build static pages
const aboutContent = `
  <h2>Browser-First Global Architecture</h2>
  <p>${SITE_NAME} is designed on a simple principle: digital utility tasks should be instant, free, and 100% private. All 30 tools process files locally in your web browser. Your sensitive spreadsheets, personal photos, and contact lists never touch an external server.</p>
  <p>${SITE_NAME} is a ${PARENT_BRAND} project dedicated to building fast, zero-bloat web utilities.</p>
  <h2>Who is ${SITE_NAME} Built For?</h2>
  <ul>
    <li><strong>Crafters & Creators:</strong> Make sticker sheets, mirror T-shirt prints, create cross-stitch patterns, and test video safe zones.</li>
    <li><strong>Professionals & Marketers:</strong> Clean browser bookmarks, split large CSVs, deduplicate contact databases, and format vCards.</li>
    <li><strong>Everyday Power Users:</strong> Convert timetables to iCal, check subtitle reading speed, find duplicate photos, and optimize print layouts.</li>
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
  <div style="background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px; box-shadow: var(--shadow); max-width: 680px;">
    <h2>Direct Email Inquiries</h2>
    <p>For general support, feedback, and inquiries regarding ${SITE_NAME}:</p>
    <p style="font-size: 18px; font-weight: 700; color: var(--brand);">
      📧 <a href="mailto:support@progeni.live" style="color: var(--brand); text-decoration: underline;">support@progeni.live</a>
    </p>
    <h3>Feature Suggestions & Bug Reports</h3>
    <p>${SITE_NAME} is constantly expanding its suite of client-side web tools. Let us know if you have an idea for a utility that can save time without uploading files to a cloud server.</p>
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
  'site.config.js', 'app.js', 'utils.js', 'styles.css', '_headers', '_redirects', 'vercel.json', 'netlify.toml'
];
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
