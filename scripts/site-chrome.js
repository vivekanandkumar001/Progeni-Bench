/*
 * Shared site chrome: one header for every generated page so the top bar,
 * search box and navigation never drift between the core, image and audio
 * builders again.
 */
const { SITE_NAME, TOOLS, PARENT_URL, TAGLINE } = require('../site.config.js');
const imageConfig = require('../image-tools.config.js');
const audioConfig = require('../audio-tools.config.js');
const brand = require('./brand.js');

const esc = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const publicCount = tools => tools.filter(tool => tool.status === 'implemented' || tool.status === 'experimental').length;

const toolCounts = {
  core: TOOLS.length,
  image: publicCount(imageConfig.TOOLS),
  audio: publicCount(audioConfig.TOOLS)
};
toolCounts.all = toolCounts.core + toolCounts.image + toolCounts.audio;

/**
 * Top navigation items – matching existing routed directories.
 * The mobile hamburger menu shows all top-level pages.
 */
/* Industry-style IA: navigation is grouped by the job the visitor wants to
 * do, not by internal toolkit folders. The mega menu keeps the full map
 * visible in two clicks; the search box handles exact-match visitors. */
const JOB_GROUPS = [
  { title: 'Convert', blurb: 'Change the format, keep the job.', links: [
    ['Image converter', '/image/convert/'],
    ['Image to PDF', '/image/image-to-pdf/'],
    ['Audio converter', '/audio/convert/'],
    ['MP3 / WAV / FLAC', '/audio/to-mp3/'],
    ['PDF translator', '/tools/pdf-translator/']
  ]},
  { title: 'Compress & resize', blurb: 'Smaller files, exact dimensions.', links: [
    ['Image compressor', '/image/compress/'],
    ['Target file size', '/image/compress-to-size/'],
    ['Resize image', '/image/resize/'],
    ['Crop image', '/image/crop/'],
    ['Audio compressor', '/audio/compress/']
  ]},
  { title: 'Edit & enhance', blurb: 'Fix, decorate and fine-tune.', links: [
    ['Colour adjustments', '/image/adjust/'],
    ['Visible watermark', '/image/watermark/'],
    ['Collage maker', '/image/collage/'],
    ['Audio trimmer', '/audio/trimmer/'],
    ['Fade in / out', '/audio/fade/']
  ]},
  { title: 'Organize & combine', blurb: 'Put the pieces in order.', links: [
    ['PDF page manager', '/tools/pdf-page-manager/'],
    ['vCard split & merge', '/tools/vcard/'],
    ['Bookmark cleaner', '/tools/bookmark-cleaner/'],
    ['Calendar dedupe', '/tools/calendar-cleaner/'],
    ['Audio joiner', '/audio/joiner/']
  ]},
  { title: 'Create & generate', blurb: 'Make something new.', links: [
    ['Favicon & app icons', '/image/favicon/'],
    ['QR code', '/image/qr-code/'],
    ['Open Graph image', '/image/og-image/'],
    ['GIF studio', '/image/gif-studio/'],
    ['Tone generator', '/audio/tone-generator/']
  ]},
  { title: 'Inspect & clean', blurb: 'Check quality, remove traces.', links: [
    ['Image inspector', '/image/inspection/'],
    ['EXIF & GPS remover', '/image/strip-metadata/'],
    ['Scan cleanup', '/image/scan-cleanup/'],
    ['Loudness analyser', '/audio/loudness-analyzer/'],
    ['Photo duplicate finder', '/tools/duplicate-finder/']
  ]},
  { title: 'Print & craft', blurb: 'Ready for paper, vinyl and fabric.', links: [
    ['Sticker sheet', '/tools/sticker-sheet/'],
    ['Label maker', '/tools/labels/'],
    ['T-shirt mirror', '/tools/tshirt-mirror/'],
    ['Iron-on transfer', '/tools/ironon-sheet/'],
    ['Cross-stitch pattern', '/tools/cross-stitch/']
  ]},
  { title: 'Toolkits & hubs', blurb: 'Jump straight into a full suite.', isHub: true, links: [
    [`All ${toolCounts.all} tools`, '/#tools'],
    [`Image toolkit (${toolCounts.image})`, '/image/'],
    [`Audio toolkit (${toolCounts.audio})`, '/audio/'],
    ['Image Studio', '/image/studio/'],
    ['Privacy & how it works', '/about/']
  ]}
];

const POPULAR_TOOLS = [
  ['Compress image', '/image/compress/'],
  ['Resize image', '/image/resize/'],
  ['Image converter', '/image/convert/'],
  ['Audio converter', '/audio/convert/'],
  ['MP3 converter', '/audio/to-mp3/'],
  ['Sticker sheet', '/tools/sticker-sheet/'],
  ['PDF page manager', '/tools/pdf-page-manager/'],
  ['Favicon generator', '/image/favicon/']
];

const STUDIO_LINKS = [
  ['Image Studio', '/image/studio/'],
  ['Sticker Sheet', '/tools/sticker-sheet/'],
  ['Label Maker', '/tools/labels/'],
  ['Pattern Studio', '/tools/cross-stitch/'],
  ['Photo Timeline', '/tools/photo-timeline/'],
  ['PDF Page Manager', '/tools/pdf-page-manager/']
];

const SEARCH_ICON = '<svg class="search-box-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8.25" cy="8.25" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M12.2 12.2L15.75 15.75" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const NAV_CARET = '<svg class="nav-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const NAV_LOCK = '<svg class="nav-lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

/**
 * Search combobox. Rendered on every page; app.js upgrades it with live
 * suggestions on the home page and sends other pages to /?q=…
 */
function searchHtml() {
  return `<div class="topbar-search" id="header-search" role="search">
      <label class="sr-only" for="search">Search Bench tools</label>
      <div class="search-box">
        ${SEARCH_ICON}
        <input id="search" class="search-box-input" type="search" name="q" autocomplete="off" spellcheck="false"
          placeholder="Search ${toolCounts.all} tools…"
          aria-label="Search Bench tools" role="combobox" aria-expanded="false" aria-controls="search-suggestions" aria-autocomplete="list" aria-haspopup="listbox">
        <kbd class="search-kbd" aria-hidden="true">/</kbd>
      </div>
      <div class="search-suggestions" id="search-suggestions" role="listbox" aria-label="Tool suggestions" hidden></div>
      <p class="sr-only" id="search-status" role="status" aria-live="polite"></p>
    </div>`;
}

/**
 * @param {{active?: string}} [options]
 */
function siteHeader(options) {
  const active = (options && options.active) || '';
  const allActive = active !== 'about' && active !== 'contact';
  const aboutAttrs = active === 'about' ? ' class="nav-link active" aria-current="page"' : ' class="nav-link"';
  const contactAttrs = active === 'contact' ? ' class="nav-link active" aria-current="page"' : ' class="nav-link"';

  const jobGroups = JOB_GROUPS.map(group => `
            <section class="mega-group${group.isHub ? ' mega-group--hubs' : ''}">
              <h3>${esc(group.title)}</h3>
              <p>${esc(group.blurb)}</p>
              <ul>${group.links.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>
            </section>`).join('');

  const popularLinks = POPULAR_TOOLS.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('');
  const studioLinks = STUDIO_LINKS.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('');

  return `<header class="topbar" role="banner">
  <div class="topbar-row">
    <a class="brand" href="/" aria-label="${esc(SITE_NAME)} home">
      <img src="${brand.logo}" alt="" width="32" height="32" class="brand-logo">
      <span class="brand-name">${esc(SITE_NAME)}</span>
    </a>
    <nav id="primary-nav" class="primary-nav" aria-label="Primary navigation">
      <div class="nav-item nav-item--mega">
        <button class="nav-trigger${allActive ? ' active' : ''}" type="button" data-nav-key="all" aria-expanded="false" aria-controls="nav-all-tools">All tools ${NAV_CARET}</button>
        <div class="nav-panel mega-panel" id="nav-all-tools" hidden>
          <div class="mega-inner">
            <div class="mega-head">
              <span class="mega-eyebrow">Browse by job</span>
              <a class="mega-view-all" href="/#tools">View all ${toolCounts.all} tools <span aria-hidden="true">→</span></a>
            </div>
            <div class="mega-grid">${jobGroups}
            </div>
            <div class="mega-foot">
              <span class="mega-trust">${NAV_LOCK} 100% local · no upload · no signup</span>
              <a href="/about/">How it works</a>
            </div>
          </div>
        </div>
      </div>
      <div class="nav-item nav-item--menu">
        <button class="nav-trigger" type="button" data-nav-key="popular" aria-expanded="false" aria-controls="nav-popular">Popular ${NAV_CARET}</button>
        <div class="nav-panel menu-panel" id="nav-popular" hidden>
          <span class="mega-eyebrow">Most used this week</span>
          <ul class="menu-list">${popularLinks}</ul>
        </div>
      </div>
      <div class="nav-item nav-item--menu">
        <button class="nav-trigger" type="button" data-nav-key="studios" aria-expanded="false" aria-controls="nav-studios">Studios ${NAV_CARET}</button>
        <div class="nav-panel menu-panel" id="nav-studios" hidden>
          <span class="mega-eyebrow">Batch workflows</span>
          <ul class="menu-list">${studioLinks}</ul>
        </div>
      </div>
      <a href="/about/"${aboutAttrs}>About</a>
      <a href="/contact/"${contactAttrs}>Contact</a>
      <div class="nav-mobile-foot">${NAV_LOCK}<span>100% local · no upload · no signup</span></div>
    </nav>
    ${searchHtml()}
    <span class="topbar-trust" title="Files stay on this device">${NAV_LOCK}<span>100% local</span></span>
    <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;
}

const FOOTER_LINKS = [
  { href: '/', label: 'All tools' },
  { href: '/image/', label: 'Images' },
  { href: '/audio/', label: 'Audio & Video' },
  { href: '/about/', label: 'About' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/terms/', label: 'Terms' },
  { href: '/contact/', label: 'Contact' }
];

/* Legal / trust pages. Tool pages already surface related tools in their body,
   so they keep just these four links in the footer. */
const LEGAL_LINKS = [
  { href: '/privacy/', label: 'Privacy' },
  { href: '/terms/', label: 'Terms' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' }
];

function footerLinksHtml(links) {
  const items = links || FOOTER_LINKS;
  return items.map(link => `<a href="${link.href}">${esc(link.label)}</a>`).join('\n    ');
}

/**
 * Canonical site footer — one markup shape for every generated page so the
 * bottom of the page never drifts between hubs, tool pages and legal pages.
 *
 * Layout contract (kept compact on purpose):
 *   - one row on desktop: brand + tagline on the left, links on the right;
 *   - the optional category directory wraps onto its own full-width row and
 *     only renders its content when opened, so a closed footer stays a single
 *     short bar instead of reserving a tall block.
 *
 * @param {{directory?: string, links?: Array}} [options]
 */
function siteFooter({ directory = null, links = FOOTER_LINKS } = {}) {
  const brandMark = `<div class="footer-brand"><img src="${brand.logo}" alt="" width="32" height="32"><span><strong>${esc(SITE_NAME)}</strong> — <a href="${PARENT_URL}" target="_blank" rel="noopener">A Progeni project</a> · ${esc(TAGLINE)}</span></div>`;
  return `<footer role="contentinfo">
  ${brandMark}
  <div class="footer-links">
    ${footerLinksHtml(links)}
  </div>
  ${directory || ''}
</footer>`;
}

module.exports = { esc, siteHeader, searchHtml, footerLinksHtml, siteFooter, toolCounts, FOOTER_LINKS, LEGAL_LINKS };
