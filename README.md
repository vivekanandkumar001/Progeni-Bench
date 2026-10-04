# Progeni Bench - Production README

Progeni Bench is a Progeni project delivering fast, zero-bloat browser utilities with 100% private client-side processing.

## 🚀 Quick Start

### Local Development
```bash
# Build static pages and distribution package
npm run build

# Run unit test suite
npm test

# Serve the dist folder
npm start
# Or: python3 -m http.server 3000 --directory dist
```

### Deployment

#### Netlify
1. Connect repository or upload `dist/` folder
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Custom domain: `progeni.live` (HTTPS automatic)

#### Vercel
1. Connect repository
2. `vercel.json` has `cleanUrls: true` enabled
3. Set custom domain: `progeni.live` (HTTPS automatic)

#### Cloudflare Pages
1. Build command: `npm run build`
2. Build output directory: `dist`
3. Configure custom domain: `progeni.live`

## 📦 What's Included

The `dist/` folder contains everything needed for static production hosting:

- **index.html** - Single-page app root with fast category search
- **app.js** - Client-side router + 30 tool processors (zero dependencies)
- **utils.js** - Pure utility helper module (XSS escaping, CSV parsing, SRT parser)
- **styles.css** - Custom responsive styling and CSS variables
- **_headers** - Strict Content-Security-Policy & security headers
- **_redirects** - Netlify 404 handler
- **manifest.webmanifest** - PWA configuration
- **sitemap.xml** - 35 crawlable URLs for `progeni.live`
- **robots.txt** - Crawler directives
- **about/index.html** - About page
- **privacy/index.html** - Privacy policy
- **terms/index.html** - Terms of service
- **contact/index.html** - Contact & support page
- **tools/** - 30 pre-rendered static tool pages with Schema.org JSON-LD
- **assets/** - favicon.svg
- **vercel.json** - Vercel clean URL routing configuration

## 🛠️ Available Tools (30 Total)

### Files & Data
- Chrome Bookmark Cleaner
- Calendar Cleaner (.ics)
- Timetable → Calendar (.ics)
- Bookmark → Reading List
- CSV Column Splitter
- CSV Date Normalizer
- Contact CSV Deduplicator
- vCard Split / Merge

### Creative & Craft
- Sticker Sheet Maker (US Letter / A4 / 4x6 / A3)
- Print Layout Optimizer
- Cross-Stitch Pattern Maker (DMC Palettes)
- Embroidery Pattern Simplifier
- Diamond Painting Pattern Maker
- SVG Cleanup & Minifier

### Audio & Video
- Chapter Timestamp Formatter
- Podcast Silence Map
- Video Thumbnail Contact Sheet
- Video Safe-Zone Checker (TikTok / Reels / Shorts)
- Subtitle Reading-Speed Checker
- Subtitle Line-Break Fixer

### Printing & Merchandise
- Photo Print Border Calculator
- T-Shirt Print Mirror
- Iron-on Transfer Sheet Maker
- Avery 5160 / Label Maker

### Photos & Images
- Wallpaper Batch Cropper
- Panorama Carousel Splitter
- Photo Timeline Builder (by file date)
- Family Photo Date Organizer (by file date)
- Photo Duplicate Finder (SHA-256)
- Photo Best-Shot Finder

## 🔒 Privacy & Security

- **100% Client-Side Processing** - Files never leave your browser
- **Zero Server Uploads** - All computations happen locally via HTML5 APIs
- **Zero Third-Party Tracking** - No remote analytics, tracking cookies, or tracking scripts
- **Strict CSP Headers** - Frame-ancestor and XSS protection enabled