/*
 * Shared site chrome: one header for every generated page so the top bar,
 * search box and navigation never drift between the core, image and audio
 * builders again.
 */
const { SITE_NAME, TOOLS } = require('../site.config.js');
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

const NAV_ITEMS = [
  { key: 'home', href: '/', label: 'All tools' },
  { key: 'image', href: '/image/', label: 'Image' },
  { key: 'audio', href: '/audio/', label: 'Audio' },
  { key: 'about', href: '/about/', label: 'About' }
];

const SEARCH_ICON = '<svg class="search-box-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8.25" cy="8.25" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M12.2 12.2L15.75 15.75" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

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
          placeholder="Search ${toolCounts.all} tools — try “compress image” or “mp3”"
          aria-label="Search Bench tools" role="combobox" aria-expanded="false" aria-controls="search-suggestions" aria-autocomplete="list" aria-haspopup="listbox">
        <kbd class="search-kbd" aria-hidden="true">/</kbd>
      </div>
      <div class="search-suggestions" id="search-suggestions" role="listbox" aria-label="Tool suggestions" hidden></div>
      <p class="sr-only" id="search-status" role="status" aria-live="polite"></p>
    </div>`;
}

/**
 * @param {{active?: 'home'|'image'|'audio'|'about'|string}} [options]
 */
function siteHeader(options) {
  const active = (options && options.active) || '';
  const nav = NAV_ITEMS.map(item => {
    const isActive = item.key === active;
    return `<a href="${item.href}"${isActive ? ' class="active" aria-current="page"' : ''}>${esc(item.label)}</a>`;
  }).join('');
  return `<header class="topbar" role="banner">
  <div class="topbar-row">
    <a class="brand" href="/" aria-label="${esc(SITE_NAME)} home">
      <img src="${brand.logo}" alt="" width="32" height="32" class="brand-logo">
      <span class="brand-name">${esc(SITE_NAME)}</span>
    </a>
    ${searchHtml()}
    <nav id="primary-nav" aria-label="Primary navigation">
      ${nav}
    </nav>
    <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span></button>
  </div>
</header>`;
}

const FOOTER_LINKS = [
  { href: '/', label: 'All tools' },
  { href: '/image/', label: 'Image' },
  { href: '/audio/', label: 'Audio' },
  { href: '/about/', label: 'About' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/terms/', label: 'Terms' },
  { href: '/contact/', label: 'Contact' }
];

function footerLinksHtml() {
  return FOOTER_LINKS.map(link => `<a href="${link.href}">${esc(link.label)}</a>`).join('\n    ');
}

module.exports = { esc, siteHeader, searchHtml, footerLinksHtml, toolCounts };
