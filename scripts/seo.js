/*
 * scripts/seo.js - shared SEO, GEO and AEO helpers for the static generators.
 *
 * Build-time only. Nothing here is copied to dist/. The helpers keep metadata,
 * social cards, AI-discovery links and Schema.org nodes identical across the
 * core, image and audio page generators so a single change cannot leave one
 * toolkit with weaker markup than another.
 *
 * Rules:
 *   - no invented ratings, reviews, social profiles or guarantees;
 *   - every claim must be supported by site.config.js or a toolkit registry;
 *   - output is HTML-escaped unless a helper explicitly says otherwise.
 */
const site = require('../site.config.js');
const brand = require('./brand.js');

const SITE_URL = site.SITE_URL;
const SITE_NAME = site.SITE_NAME;
const PARENT_BRAND = site.PARENT_BRAND;
const PARENT_URL = site.PARENT_URL;
const SUPPORT_EMAIL = site.SUPPORT_EMAIL;
const TAGLINE = site.TAGLINE;
const LOCALE = site.LOCALE;
const LAST_UPDATED = site.LAST_UPDATED;
const PRICE_CURRENCY = site.PRICE_CURRENCY;

const OG_IMAGE = `${SITE_URL}/assets/og-image.png`;
const OG_IMAGE_WIDTH = '1200';
const OG_IMAGE_HEIGHT = '630';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTags(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value, maxLength) {
  const text = stripTags(value);
  if (!text) return '';
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  let sentence = match ? match[0] : text;
  const limit = maxLength || 220;
  if (sentence.length > limit) {
    const cut = sentence.lastIndexOf(' ', limit);
    sentence = sentence.slice(0, cut > 60 ? cut : limit).replace(/[.,;:—–-]+$/, '') + '…';
  }
  return sentence;
}

function jsonLd(schema) {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}

function absoluteUrl(pathname) {
  const clean = String(pathname || '/').replace(/^\/?/, '/');
  return `${SITE_URL}${clean}`;
}

function orgId() {
  return `${SITE_URL}/#organization`;
}

function websiteId() {
  return `${SITE_URL}/#website`;
}

function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': orgId(),
    name: PARENT_BRAND,
    url: PARENT_URL,
    description: `${SITE_NAME} is a free, privacy-first collection of browser-based file, image and audio tools published by ${PARENT_BRAND}.`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/assets/favicon-512.png`,
      width: 512,
      height: 512
    },
    brand: { '@type': 'Brand', name: SITE_NAME },
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT_EMAIL,
      url: `${SITE_URL}/contact/`,
      availableLanguage: ['en']
    }]
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': websiteId(),
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: LOCALE,
    description: TAGLINE,
    publisher: { '@id': orgId() }
  };
}

function speakable(cssSelectors) {
  return {
    '@type': 'SpeakableSpecification',
    cssSelector: cssSelectors || ['.quick-answer .answer-text', '.quick-answer .key-facts']
  };
}

function webPageNode({ url, name, description, type, dateModified, withSpeakable }) {
  const node = {
    '@type': type || 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: LOCALE,
    dateModified: dateModified || LAST_UPDATED,
    isPartOf: { '@id': websiteId() },
    publisher: { '@id': orgId() }
  };
  if (withSpeakable !== false) node.speakable = speakable();
  return node;
}

function breadcrumbList(items) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${items[items.length - 1].url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

function faqPageNode(faq) {
  const items = (faq || []).filter(item => item && item.q && item.a);
  if (!items.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: stripTags(item.q),
      acceptedAnswer: { '@type': 'Answer', text: stripTags(item.a) }
    }))
  };
}

function howToNode(name, description, steps, url) {
  const cleanSteps = (steps || []).map(stripTags).filter(Boolean);
  if (!cleanSteps.length) return null;
  const node = {
    '@type': 'HowTo',
    name: `How to use ${stripTags(name)}`,
    description: firstSentence(description),
    step: cleanSteps.map((text, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text
    }))
  };
  if (url) node.url = url;
  return node;
}

function softwareApplicationNode({ name, url, description, category, requirements, featureList }) {
  const node = {
    '@type': 'WebApplication',
    name: stripTags(name),
    url,
    description: stripTags(description),
    applicationCategory: category || 'UtilitiesApplication',
    operatingSystem: 'Any',
    browserRequirements: requirements || 'Requires a modern JavaScript-enabled browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: PRICE_CURRENCY
    },
    isAccessibleForFree: true,
    provider: { '@id': orgId() }
  };
  const features = (featureList || []).map(stripTags).filter(Boolean);
  if (features.length) node.featureList = features;
  return node;
}

function graph(nodes) {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter(Boolean)
  };
}

function discoveryLinks() {
  return [
    '  <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable site summary">',
    '  <link rel="alternate" type="text/plain" href="/llms-full.txt" title="Full LLM-readable tool reference">'
  ].join('\n');
}

function robotsContent(noindex) {
  return noindex
    ? 'noindex, follow, max-image-preview:large'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
}

function socialMeta({ title, description, canonicalUrl, imageAlt }) {
  return `  <meta property="og:site_name" content="${esc(SITE_NAME)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:image" content="${esc(OG_IMAGE)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="${OG_IMAGE_WIDTH}">
  <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">
  <meta property="og:image:alt" content="${esc(imageAlt || `${SITE_NAME} — free, private browser tools`)}">
  <meta property="og:locale" content="${esc(LOCALE)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(OG_IMAGE)}">
  <meta name="twitter:image:alt" content="${esc(imageAlt || `${SITE_NAME} — free, private browser tools`)}">`;
}

function headMeta({ title, description, canonicalUrl, imageAlt, noindex, schema }) {
  return `  <meta name="theme-color" content="#f4f6f9">
  <meta name="robots" content="${robotsContent(noindex)}">
  <meta name="author" content="${esc(PARENT_BRAND)}">
${socialMeta({ title, description, canonicalUrl, imageAlt })}
${brand.iconLinks()}
  <link rel="stylesheet" href="${brand.stylesHref}">
  <script src="${brand.headerSrc}" defer></script>
  <link rel="canonical" href="${esc(canonicalUrl)}">
${discoveryLinks()}${schema ? `\n  <script type="application/ld+json" id="schema">${jsonLd(schema)}</script>` : ''}`;
}

/*
 * Answer-first block. `answerHtml` is trusted build-time HTML built from
 * escaped registry data; `facts` is a list of { label, value } pairs rendered
 * as a definition list that answer engines can quote directly.
 */
function keyFacts(pairs) {
  return (pairs || []).filter(pair => pair && pair[0] && pair[1]).map(([label, value]) => ({ label, value }));
}

/* Shared renderer for { label, value } fact pairs. Every builder uses this so
 * a definition list never degrades into "[object Object],[object Object]". */
function keyFactsHtml(pairs) {
  return (pairs || [])
    .map(pair => Array.isArray(pair) ? { label: pair[0], value: pair[1] } : pair)
    .filter(fact => fact && fact.label && fact.value)
    .map(fact => `    <div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`)
    .join('\n');
}

function quickAnswerHtml({ id, title, answerHtml, facts, className }) {
  const blockId = id || 'quick-answer';
  const list = (facts || []).filter(fact => fact && fact.label && fact.value);
  return `<aside class="quick-answer${className ? ` ${className}` : ''}" id="${esc(blockId)}" aria-labelledby="${esc(blockId)}-title">
  <h2 id="${esc(blockId)}-title">${esc(title || 'Quick answer')}</h2>
  <p class="answer-text">${answerHtml}</p>
${list.length ? `  <dl class="key-facts">
${keyFactsHtml(list)}
  </dl>
` : ''}</aside>`;
}

const OUTPUT_LABELS = {
  audio: 'Audio file',
  document: 'Document',
  image: 'Image file',
  report: 'Report',
  text: 'Text file',
  zip: 'ZIP archive'
};

function formatOutputs(outputs) {
  const list = (outputs || []).map(output => OUTPUT_LABELS[output] || output);
  return list.length ? list.join(', ') : 'Processed file';
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  PARENT_BRAND,
  PARENT_URL,
  SUPPORT_EMAIL,
  TAGLINE,
  LOCALE,
  LAST_UPDATED,
  PRICE_CURRENCY,
  OG_IMAGE,
  esc,
  stripTags,
  firstSentence,
  jsonLd,
  absoluteUrl,
  orgId,
  websiteId,
  organizationNode,
  websiteNode,
  speakable,
  webPageNode,
  breadcrumbList,
  faqPageNode,
  howToNode,
  softwareApplicationNode,
  graph,
  discoveryLinks,
  robotsContent,
  socialMeta,
  headMeta,
  quickAnswerHtml,
  keyFacts,
  keyFactsHtml,
  formatOutputs
};
