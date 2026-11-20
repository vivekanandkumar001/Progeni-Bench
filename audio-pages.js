/*
 * audio-pages.js - static page generator for the Bench Audio Toolkit.
 *
 * Mirrors image-pages.js exactly: the site has no bundler and no server
 * renderer, so this module writes real HTML for every public audio tool so
 * crawlers, no-JS visitors and direct links get useful content. app.js mounts
 * the interactive toolkit on load and replaces #app with the working UI.
 *
 * Rules enforced here:
 *   - only "implemented" and "experimental" tools get a page;
 *   - experimental pages carry noindex, follow and stay out of the sitemap;
 *   - deferred/unavailable tools are documented honestly but never get a page;
 *   - canonical host is always https://bench.progeni.live.
 *
 * SEO constraints checked by scripts/verify.js (C35/C36/C37/C41): every page
 * must have a title <= 60 chars, a description of 120-155 chars, exactly one
 * <h1>, a canonical link, Open Graph tags and lang="en-IN".
 */
const fs = require('fs');
const path = require('path');

const site = require('./site.config.js');
const seo = require('./scripts/seo.js');
const C = require('./audio-tools.config.js');
const chrome = require('./scripts/site-chrome.js');
const icons = require('./icons.js');
const seoCopy = require('./scripts/seo-copy.js');

const SITE_URL = C.SITE_URL || site.SITE_URL;
const SITE_NAME = C.SITE_NAME || site.SITE_NAME;
const LOCALE = site.LOCALE || 'en';
const TAGLINE = site.TAGLINE || 'Fast, private browser utilities';

const PUBLIC = C.TOOLS.filter(t => t.status === 'implemented' || t.status === 'experimental');
const IMPLEMENTED = PUBLIC.filter(t => t.status === 'implemented');
const EXPERIMENTAL = PUBLIC.filter(t => t.status === 'experimental');

const HUB_FAQ = [
  {
    q: 'Are my audio files uploaded when I use the Bench Audio Toolkit?',
    a: 'No. Decoding, editing and encoding run inside your browser. Conversion and heavy filters use a same-origin FFmpeg.wasm engine that runs on your device; audio bytes are never sent to Bench or a third party.'
  },
  {
    q: 'How many audio tools are available?',
    a: `${PUBLIC.length} public audio tools are available: ${IMPLEMENTED.length} implemented tools and ${EXPERIMENTAL.length} experimental tools. Tools that need a model or an unreliable browser API are listed as deferred or unavailable instead of being faked.`
  },
  {
    q: 'Do the audio tools cost anything or need an account?',
    a: 'No. The tools are free and no account, password or subscription is required.'
  },
  {
    q: 'What are the audio tool limits?',
    a: `Each file can be up to ${C.LIMITS.maxFileBytes / (1024 * 1024)} MB and ${C.LIMITS.maxDurationSec / 60} minutes, with ${C.LIMITS.maxFiles} files per batch. The FFmpeg engine is about ${(C.LIMITS.ffmpegCoreBytes / (1024 * 1024)).toFixed(0)} MB and is cached after the first download.`
  }
];

const hubQuickAnswer = seo.quickAnswerHtml({
  answerHtml: `<strong>The Bench Audio Toolkit</strong> is a free set of ${PUBLIC.length} browser-based audio tools: ${IMPLEMENTED.length} ready tools and ${EXPERIMENTAL.length} experimental tools. Decoding, editing and encoding run locally with the Web Audio API and a same-origin FFmpeg.wasm engine, so audio is not uploaded.`,
  facts: seo.keyFacts([
    ['Tools', `${PUBLIC.length} public audio tools`],
    ['Engine', 'Web Audio API + same-origin FFmpeg.wasm'],
    ['Uploads', 'No audio is uploaded'],
    ['Account', 'Not required'],
    ['Limit', `${C.LIMITS.maxFileBytes / (1024 * 1024)} MB · ${C.LIMITS.maxDurationSec / 60} minutes per file`]
  ])
});

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(value) {
  // Escaping "<" prevents a registry string from ever closing the script tag.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function statusLabel(status) {
  return {
    implemented: 'Ready',
    experimental: 'Experimental',
    deferred: 'Deferred',
    unavailable: 'Unavailable',
    blocked: 'Blocked'
  }[status] || status;
}

function statusClass(status) {
  return 'itk-badge itk-badge-' + esc(status);
}

function statusBadge(status) {
  return status === 'implemented'
    ? ''
    : `<em class="${statusClass(status)}">${esc(statusLabel(status))}</em>`;
}

function publicUrl(tool) {
  return `${SITE_URL}/audio/${tool.slug}/`;
}

function headExtras(title, desc, canonicalUrl, opts) {
  opts = opts || {};
  return seo.headMeta({
    title,
    description: desc,
    canonicalUrl,
    imageAlt: `${SITE_NAME} — private browser audio tools`,
    noindex: opts.noindex,
    schema: opts.schema
  });
}

function shell(title, desc, canonicalUrl, body, opts) {
  opts = opts || {};
  return `<!doctype html>
<html lang="${esc(LOCALE)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">${headExtras(title, desc, canonicalUrl, opts)}
</head>
<body><a class="skip-link" href="#app">Skip to main content</a>
${chrome.siteHeader({ active: 'audio' })}

<main id="app" class="container" tabindex="-1">
${body}
</main>

${chrome.siteFooter({
    directory: `
  <details class="footer-directory">
    <summary class="footer-directory-title">Audio tools by category</summary>
    <div class="category-blocks">
      ${C.CATEGORIES.map(cat => {
        const tools = PUBLIC.filter(t => t.category === cat.id);
        if (!tools.length) return '';
        return `<div class="category-block"><h3>${esc(cat.name)}</h3><ul>${tools.map(t => `<li><a href="/audio/${esc(t.slug)}/">${icons.toolIcon('audio', t.slug, t.icon)} ${esc(t.name)}</a></li>`).join('')}</ul></div>`;
      }).join('')}
    </div>
  </details>`
  })}
<script src="/site.config.js"></script>
<script src="/utils.js"></script>
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function toolCard(tool) {
  return `<a class="itk-tool-card" href="/audio/${esc(tool.slug)}/">
  <strong><span class="itk-card-icon" aria-hidden="true">${icons.toolIcon('audio', tool.slug, tool.icon)}</span>${esc(tool.name)}</strong>
  <span>${esc(tool.summary)}</span>
  ${statusBadge(tool.status)}
</a>`;
}

function hubBody() {
  const categories = C.CATEGORIES.map(cat => {
    const tools = PUBLIC.filter(t => t.category === cat.id);
    if (!tools.length) return '';
    return `<section class="itk-category">
  <div class="itk-category-head">
    <h2>${esc(cat.name)}</h2>
    <p>${esc(cat.blurb)}</p>
  </div>
  <div class="itk-tool-grid">${tools.map(toolCard).join('\n')}</div>
</section>`;
  }).join('\n');

  return `<section class="tool-head itk-head atk-head">
  <span class="eyebrow">Bench Audio Toolkit</span>
  <h1>Private audio tools that run in your browser</h1>
  <p>Convert, compress, trim, join, clean, record, analyse and inspect audio without uploading it. Every tool below has a real client-side handler and a tested download path. Tools that are not ready are labelled honestly instead of pretending to work.</p>
  <div class="itk-meta">
    <span class="itk-chip">${IMPLEMENTED.length} implemented tools</span>
    <span class="itk-chip">${EXPERIMENTAL.length} experimental</span>
    <span class="itk-chip">No account</span>
    <span class="itk-chip">No uploads</span>
  </div>
  <p><a class="btn btn-lg" href="/audio/trimmer/">Start with the Audio Trimmer</a> <a class="btn secondary" href="/">Browse all Bench tools</a></p>
</section>

${hubQuickAnswer}

<section class="itk-categories">
${categories}
</section>

<section class="toolbox itk-notice-box">
  <h2>Status and limits</h2>
  <p>Implemented tools are covered by automated tests and produce real files. Experimental tools run real signal processing but have documented quality caveats; their results should be checked before important use. Limits: ${esc(C.LIMITS.maxFileBytes / (1024 * 1024))} MB per file, ${esc(C.LIMITS.maxDurationSec / 60)} minutes per file, ${esc(C.LIMITS.maxFiles)} files per batch. Conversion and complex filters use a ${esc((C.LIMITS.ffmpegCoreBytes / (1024 * 1024)).toFixed(0))} MB FFmpeg engine downloaded once and cached.</p>
  <h2>How processing works</h2>
  <p>Simple editing, analysis, recording and WAV export use the Web Audio API directly in the tab. Format conversion and complex filters (loudness normalisation, denoise, speed, EQ) use a WebAssembly build of FFmpeg that runs on your device. Either way, the audio bytes never leave your machine and Bench keeps no copy.</p>
  <h2>Licences and source</h2>
  <p>The FFmpeg engine shipped here is the official <code>@ffmpeg/core</code> build, licensed under the <strong>GNU General Public License v2.0 or later</strong>. It is served unmodified from this site at <code>/vendor/ffmpeg/</code> and is never loaded from a third-party CDN. The JavaScript wrapper (<code>@ffmpeg/ffmpeg</code>) is MIT licensed.</p>
  <p>Full attributions, exact version numbers and a written offer to supply the corresponding source code are published in <a href="/vendor/ffmpeg/NOTICE.txt">/vendor/ffmpeg/NOTICE.txt</a>. That notice names the upstream FFmpeg project and the ffmpeg.wasm packaging project, including their source repositories.</p>
  <p class="itk-muted">Looking for the older file utilities? <a href="/">Browse the full Bench directory</a>.</p>
</section>

<section class="home-faq" aria-labelledby="audio-faq-title">
  <h2 id="audio-faq-title">Quick answers about the audio toolkit</h2>
  <div class="home-faq-grid">
    ${HUB_FAQ.map(({ q, a }) => `<article class="home-faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n    ')}
  </div>
</section>`;
}

function relatedTools(tool) {
  return PUBLIC.filter(t => t.slug !== tool.slug && t.category === tool.category).slice(0, 6);
}

function toolBody(tool) {
  const related = relatedTools(tool);
  const copy = seoCopy.forTool(tool, 'audio');
  const faq = (tool.faq || []).filter(f => f && f.q && f.a);
  const useCases = tool.useCases || [];
  const howTo = copy.howTo(tool.howTo);
  const limitations = tool.limitations || tool.reason || 'No additional limitations are documented for this build.';
  const experimental = tool.status === 'experimental';

  const engineShort = tool.engine === 'ffmpeg'
    ? 'FFmpeg.wasm on your device'
    : tool.engine === 'media-recorder'
      ? 'Browser microphone capture'
      : 'Web Audio API in your browser';
  const engineNote = copy.processNote(engineShort);

  const fallback = `<section class="toolbox itk-fallback">
    <h2>How this tool works without JavaScript</h2>
    <p>${esc(copy.description)}</p>
    <p><em>Enable JavaScript to use the interactive tool. Processing happens locally in your browser; nothing is uploaded.</em></p>
  </section>`;

  const quickAnswer = seo.quickAnswerHtml({
    answerHtml: `<strong>${esc(tool.name)}</strong> ${esc(copy.quickAnswer)}`,
    facts: seo.keyFacts([
      ['Cost', 'Free · no account needed'],
      ['Uploads', 'No audio is uploaded'],
      ['Inputs', (tool.inputs || []).join(', ') || (tool.requiresFile === false ? 'No file needed' : 'Audio file')],
      ['Output', seo.formatOutputs(tool.outputs)],
      ['Engine', engineShort],
      ['Limit', `${C.LIMITS.maxFileBytes / (1024 * 1024)} MB · ${C.LIMITS.maxDurationSec / 60} minutes per file`]
    ])
  });

  return `<nav class="itk-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/audio/">Audio toolkit</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(tool.name)}</span></nav>

<section class="tool-head itk-head">
  <span class="eyebrow">Bench Audio Toolkit${tool.status === 'implemented' ? '' : ` · ${statusBadge(tool.status)}`}</span>
  <h1><span class="tool-head-icon" data-icon="${icons.iconName('audio', tool.slug, tool.icon)}">${icons.toolIcon('audio', tool.slug, tool.icon)}</span>${esc(tool.name)}</h1>
  <p>${esc(tool.summary)} <strong>Nothing is uploaded.</strong></p>
  <div class="itk-meta">
    ${(tool.inputs || []).slice(0, 5).map(f => `<span class="itk-chip">${esc(f)}</span>`).join('')}
    <span class="itk-chip">${esc(tool.requiresFile === false ? 'no file needed' : 'up to ' + (tool.maxFiles || 1) + ' file' + ((tool.maxFiles || 1) === 1 ? '' : 's'))}</span>
    <span class="itk-chip">${esc((C.LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0))} MB / file</span>
  </div>
</section>

${quickAnswer}

${experimental ? `<div class="itk-status warn"><strong>Experimental</strong><span>${esc(limitations)}</span></div>` : ''}

${fallback}

<section class="seo-section itk-seo">
  <h2>What it does</h2>
  <p>${esc(copy.description)}</p>
  <h2>Tool-specific detail</h2>
  <p>${esc(copy.detail)}</p>
  <h2>How to use</h2>
  <ol>${howTo.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
  ${useCases.length ? `<h2>Common use cases</h2><ul>${useCases.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
  <h2>Limits &amp; considerations</h2>
  <p>${esc(limitations)}</p>
  <h2>How your audio is processed</h2>
  <p>${esc(engineNote)}</p>
  <h2>Privacy &amp; security</h2>
  <p>${esc(copy.privacyNote)}</p>
  ${faq.length ? `<h2>Frequently asked questions</h2><div class="faq-list">${faq.map(f => `<div class="faq-item"><strong>${esc(f.q)}</strong><p>${esc(copy.faqAnswer(f.q, f.a))}</p></div>`).join('')}</div>` : ''}
  ${related.length ? `<h2>Related audio tools</h2><div class="tool-links">${related.map(t => `<a href="/audio/${esc(t.slug)}/">${icons.toolIcon('audio', t.slug, t.icon)} ${esc(t.name)}</a>`).join('')}</div>` : ''}
</section>`;
}

function hubSchema() {
  return seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: `${SITE_URL}/audio/`,
      name: 'Bench Audio Toolkit: private browser audio tools',
      description: 'Private browser audio tools for conversion, compression, editing, cleaning, recording, analysis and metadata.',
      type: 'CollectionPage',
      dateModified: seoCopy.UPDATED.audio
    }),
    {
      '@type': 'ItemList',
      name: 'Working audio tools',
      numberOfItems: PUBLIC.length,
      itemListElement: PUBLIC.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: t.name,
        url: publicUrl(t)
      }))
    },
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Audio toolkit', url: `${SITE_URL}/audio/` }
    ]),
    seo.faqPageNode(HUB_FAQ)
  ]);
}

function toolSchema(tool) {
  const copy = seoCopy.forTool(tool, 'audio');
  const faq = (tool.faq || [])
    .filter(f => f && f.q && f.a)
    .map(f => ({ q: f.q, a: copy.faqAnswer(f.q, f.a) }));
  return seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: publicUrl(tool),
      name: tool.seoTitle || tool.name,
      description: copy.seoDescription,
      dateModified: copy.updated
    }),
    seo.softwareApplicationNode({
      name: tool.name,
      url: publicUrl(tool),
      description: copy.seoDescription,
      category: 'MultimediaApplication',
      requirements: 'Requires a modern browser with Web Audio and WebAssembly support',
      featureList: tool.useCases
    }),
    seo.howToNode(tool.name, copy.description, copy.howTo(tool.howTo), publicUrl(tool)),
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Audio toolkit', url: `${SITE_URL}/audio/` },
      { name: tool.name, url: publicUrl(tool) }
    ]),
    seo.faqPageNode(faq)
  ]);
}

function generateHubHtml() {
  const title = 'Bench Audio Toolkit: private browser audio tools';
  const desc = 'Convert, compress, trim, join, clean, record and analyse audio right in your browser. Real client-side processing, no uploads and no account.';
  return shell(title, desc, `${SITE_URL}/audio/`, hubBody(), { schema: hubSchema() });
}

function generateToolHtml(tool) {
  const title = tool.seoTitle || `${tool.name} | Bench Audio Toolkit`;
  const desc = seoCopy.forTool(tool, 'audio').seoDescription;
  return shell(title, desc, publicUrl(tool), toolBody(tool), {
    schema: toolSchema(tool),
    noindex: tool.status === 'experimental'
  });
}

function writePage(root, relative, html) {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

function buildAudioPages(baseDir) {
  baseDir = baseDir || __dirname;
  const distDir = path.join(baseDir, 'dist');
  const targets = [baseDir, distDir];

  const pages = [
    ['audio', generateHubHtml()]
  ];
  PUBLIC.forEach(tool => {
    pages.push([path.join('audio', tool.slug), generateToolHtml(tool)]);
  });

  targets.forEach(root => {
    pages.forEach(([relative, html]) => writePage(root, relative, html));
  });

  return {
    count: pages.length,
    publicTools: PUBLIC.map(t => t.slug),
    experimental: EXPERIMENTAL.map(t => t.slug),
    indexable: [''].concat(IMPLEMENTED.map(t => t.slug))
  };
}

module.exports = {
  SITE_URL,
  PUBLIC,
  IMPLEMENTED,
  EXPERIMENTAL,
  generateHubHtml,
  generateToolHtml,
  buildAudioPages,
  statusLabel
};

if (require.main === module) {
  const result = buildAudioPages(__dirname);
  console.log(`audio pages: ${result.count} written to audio/ and dist/audio/`);
}
