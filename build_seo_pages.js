const fs = require('fs');
const path = require('path');

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

function generateToolPageHtml(tool) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": tool.name,
        "url": `https://progeni.live/tools/${tool.id}`,
        "description": tool.desc,
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": `How do I use the ${tool.name}?`,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `Simply upload or drop your file into the tool on Progeni. Select your desired settings, and download your processed result instantly. Zero files are uploaded to remote servers.`
            }
          },
          {
            "@type": "Question",
            "name": "Is my data private and secure?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Yes. Progeni processes all files 100% locally inside your browser memory using HTML5 APIs. No files or private data leave your computer."
            }
          }
        ]
      }
    ]
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${tool.name} — Free & Private Online Tool | Progeni</title>
  <meta name="description" content="${tool.desc} 100% private, client-side browser processing with Progeni.">
  <meta name="theme-color" content="#0b1020">
  <meta property="og:title" content="${tool.name} — Progeni">
  <meta property="og:description" content="${tool.desc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://progeni.live/tools/${tool.id}">
  <link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/styles.css">
  <link rel="canonical" href="https://progeni.live/tools/${tool.id}">
  <script type="application/ld+json" id="schema">${JSON.stringify(schema)}</script>
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/">Progeni<span>.</span></a>
  <nav aria-label="Primary navigation">
    <a href="/">All tools</a>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/contact">Contact</a>
  </nav>
</header>

<main id="app" class="container" tabindex="-1">
  <section class="tool-head">
    <span class="eyebrow">${tool.cat} · 100% Private Client-Side</span>
    <h1>${tool.icon} ${tool.name}</h1>
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
</main>

<footer role="contentinfo">
  <div><strong>Progeni</strong> — browser-first utilities for everyday digital problems. 100% private & client-side.</div>
  <div class="footer-links">
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </div>
</footer>
<script src="/utils.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

// Build tools directory
const baseDir = __dirname;
const toolsDir = path.join(baseDir, 'tools');
const distDir = path.join(baseDir, 'dist');
const distToolsDir = path.join(distDir, 'tools');

if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, {recursive: true});
if (!fs.existsSync(distToolsDir)) fs.mkdirSync(distToolsDir, {recursive: true});

TOOLS.forEach(tool => {
  const html = generateToolPageHtml(tool);
  
  // Write to workspace tools/
  const tDir = path.join(toolsDir, tool.id);
  if (!fs.existsSync(tDir)) fs.mkdirSync(tDir, {recursive: true});
  fs.writeFileSync(path.join(tDir, 'index.html'), html, 'utf8');

  // Write to dist/tools/
  const dtDir = path.join(distToolsDir, tool.id);
  if (!fs.existsSync(dtDir)) fs.mkdirSync(dtDir, {recursive: true});
  fs.writeFileSync(path.join(dtDir, 'index.html'), html, 'utf8');
});

// Copy all static files to dist/
const filesToCopy = [
  'index.html', 'app.js', 'utils.js', 'styles.css', '_headers', '_redirects',
  'manifest.webmanifest', 'robots.txt', 'sitemap.xml', '404.html', 'vercel.json'
];
filesToCopy.forEach(f => {
  const src = path.join(baseDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, f));
  }
});

// Copy directories
['about', 'privacy', 'terms', 'contact', 'assets'].forEach(d => {
  const srcDir = path.join(baseDir, d);
  const destDir = path.join(distDir, d);
  if (fs.existsSync(srcDir)) {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, {recursive: true});
    fs.readdirSync(srcDir).forEach(f => {
      fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    });
  }
});

console.log(`Successfully generated rich SEO pages for all ${TOOLS.length} tools and mirrored to dist/!`);
