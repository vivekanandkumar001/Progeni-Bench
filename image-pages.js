/*
 * image-pages.js - static page generator for the Bench Image Toolkit.
 *
 * The site has no bundler and no server renderer. This module writes real
 * HTML for every public image tool so crawlers, no-JS visitors and direct
 * links get useful content. app.js mounts the interactive toolkit on load and
 * replaces #app with the working UI.
 *
 * Rules enforced here:
 *   - only "implemented" and "experimental" tools get a page;
 *   - experimental pages carry noindex, follow and stay out of the sitemap;
 *   - unavailable/deferred tools are documented honestly but never get a page;
 *   - canonical host is always https://bench.progeni.live.
 */
const fs = require('fs');
const path = require('path');

const site = require('./site.config.js');
const seo = require('./scripts/seo.js');
const C = require('./image-tools.config.js');
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
    q: 'Are my images uploaded when I use the Bench Image Toolkit?',
    a: 'No. Decoding, editing and encoding run inside your browser using Canvas and File APIs. Image bytes are not sent to Bench or a third party.'
  },
  {
    q: 'How many image tools are available?',
    a: `${PUBLIC.length} public image tools are available: ${IMPLEMENTED.length} implemented tools and ${EXPERIMENTAL.length} experimental tools. Image Studio adds a batch resize, convert and ZIP workflow.`
  },
  {
    q: 'Do the image tools cost anything or need an account?',
    a: 'No. The tools are free and no account, password or subscription is required.'
  },
  {
    q: 'What are the image tool limits?',
    a: `Each file can be up to ${C.LIMITS.maxFileBytes / (1024 * 1024)} MB and ${(C.LIMITS.maxPixels / 1e6).toFixed(0)} megapixels, with ${C.LIMITS.maxFiles} files per batch and a maximum dimension of ${C.LIMITS.maxDimension} px.`
  }
];

const hubQuickAnswer = seo.quickAnswerHtml({
  answerHtml: `<strong>The Bench Image Toolkit</strong> is a free set of ${PUBLIC.length} browser-based image tools: ${IMPLEMENTED.length} ready tools, ${EXPERIMENTAL.length} experimental tools and a batch Image Studio. Images are decoded, edited and encoded locally with Canvas, so the files are not uploaded.`,
  facts: seo.keyFacts([
    ['Tools', `${PUBLIC.length} public image tools`],
    ['Batch studio', 'Image Studio: resize, convert, compress, ZIP export'],
    ['Uploads', 'No image is uploaded'],
    ['Account', 'Not required'],
    ['Limit', `${C.LIMITS.maxFileBytes / (1024 * 1024)} MB per file · ${C.LIMITS.maxFiles} files per batch`]
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

function categoryName(id) {
  const cat = C.CATEGORIES.find(c => c.id === id);
  return cat ? cat.name : id;
}

function categoryBlurb(id) {
  const cat = C.CATEGORIES.find(c => c.id === id);
  return cat ? cat.blurb : '';
}

function publicUrl(tool) {
  return `${SITE_URL}/image/${tool.slug}/`;
}

function headExtras(title, desc, canonicalUrl, opts) {
  opts = opts || {};
  return seo.headMeta({
    title,
    description: desc,
    canonicalUrl,
    imageAlt: `${SITE_NAME} — private browser image tools`,
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
${chrome.siteHeader({ active: 'image' })}

<main id="app" class="container tk-page tk-page--image" tabindex="-1">
${body}
</main>

${chrome.siteFooter({
    directory: `
  <details class="footer-directory">
    <summary class="footer-directory-title">Image tools by category</summary>
    <div class="category-blocks">
      ${C.CATEGORIES.map(cat => {
        const tools = PUBLIC.filter(t => t.category === cat.id);
        if (!tools.length) return '';
        return `<div class="category-block"><h3>${esc(cat.name)}</h3><ul>${tools.map(t => `<li><a href="/image/${esc(t.slug)}/">${icons.toolIcon('image', t.slug, t.icon)} ${esc(t.name)}</a></li>`).join('')}</ul></div>`;
      }).join('')}
    </div>
  </details>`
  })}
<script src="/site.config.js"></script>
<script src="/seo-copy.js"></script>
<script src="/utils.js"></script>
<script src="/icons.js"></script>
<script src="/app.js"></script>
</body>
</html>
`;
}

function pageBreadcrumb(current, parent) {
  const trail = parent ? `<a href="${parent.url}">${esc(parent.label)}</a> <span aria-hidden="true">/</span> ` : '';
  return `<nav class="tool-breadcrumb tk-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${trail}<span aria-current="page">${esc(current)}</span></nav>`;
}

function toolCard(tool) {
  return `<a class="itk-tool-card" href="/image/${esc(tool.slug)}/">
  <strong><span class="itk-card-icon" aria-hidden="true">${icons.toolIcon('image', tool.slug, tool.icon)}</span>${esc(tool.name)}</strong>
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

  return `${pageBreadcrumb('Image toolkit')}
<section class="tk-hero tk-hero--hub">
  <div class="tk-hero-main">
    <section class="tool-head itk-head tk-head">
      <span class="eyebrow">Bench Image Toolkit</span>
      <h1>Private image tools that run in your browser</h1>
      <p>Compress, resize, convert, edit, inspect and generate images without uploading them. Every tool below has a real client-side handler and a tested download path.</p>
      <div class="itk-meta tk-stats">
        <span class="itk-chip">${IMPLEMENTED.length} implemented tools</span>
        <span class="itk-chip">${EXPERIMENTAL.length} experimental</span>
        <span class="itk-chip">No account</span>
        <span class="itk-chip">No uploads</span>
      </div>
      <div class="tk-actions">
        <a class="btn btn-lg" href="/image/studio/">Open Image Studio</a>
        <a class="btn secondary" href="/">Browse all Bench tools</a>
      </div>
    </section>
  </div>
  <aside class="tk-hero-side" aria-label="Toolkit highlights">
    <span class="tk-trust-pill"><span aria-hidden="true">&#128274;</span> 100% local · no upload · no signup</span>
    <section class="tk-start-card">
      <span class="tk-kicker">Start here</span>
      <h2>Pick a job, not a format</h2>
      <a href="/image/compress/">Compress for web <span aria-hidden="true">→</span></a>
      <a href="/image/resize/">Resize to exact pixels <span aria-hidden="true">→</span></a>
      <a href="/image/studio/">Batch a whole folder <span aria-hidden="true">→</span></a>
    </section>
    <section class="tk-start-card tk-start-card--quiet">
      <span class="tk-kicker">Good to know</span>
      <p>Every result is created in this tab. Close the page and the files are gone.</p>
    </section>
  </aside>
</section>

${hubQuickAnswer}

<section class="tk-section-head">
  <div>
    <span class="tk-kicker">Tool directory</span>
    <h2>${PUBLIC.length} tools grouped by what you need to do</h2>
  </div>
  <p>Choose a category below, or open Image Studio when one recipe should apply to every file.</p>
</section>
<section class="itk-categories tk-categories">
${categories}
</section>

<section class="toolbox itk-notice-box tk-notice">
  <span class="tk-kicker">Before you start</span>
  <h2>Status and limits</h2>
  <p>Implemented tools are covered by automated tests and produce real files. Experimental tools run real pixel work but have limited validation; their results should be checked before important use. Limits: ${esc(C.LIMITS.maxFileBytes / (1024 * 1024))} MB per file, ${esc((C.LIMITS.maxPixels / 1e6).toFixed(0))} megapixels per image, ${esc(C.LIMITS.maxFiles)} files per batch, and a maximum dimension of ${esc(C.LIMITS.maxDimension)} px.</p>
  <p class="itk-muted">Looking for the older file utilities? <a href="/">Browse the full Bench directory</a>.</p>
</section>

<section class="home-faq tk-faq" aria-labelledby="image-faq-title">
  <div class="tk-section-head">
    <div>
      <span class="tk-kicker">Answers first</span>
      <h2 id="image-faq-title">Quick answers about the image toolkit</h2>
    </div>
  </div>
  <div class="home-faq-grid">
    ${HUB_FAQ.map(({ q, a }) => `<article class="home-faq-item"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n    ')}
  </div>
</section>`;
}

const studioQuickAnswer = seo.quickAnswerHtml({
  answerHtml: `<strong>Image Studio</strong> applies one resize, format and quality recipe to up to ${C.LIMITS.maxFiles} images, then exports each result or a ZIP. Decoding, cropping, conversion and compression all run locally in your browser.`,
  facts: seo.keyFacts([
    ['Batch size', `Up to ${C.LIMITS.maxFiles} images`],
    ['Outputs', 'WebP, JPEG or PNG · individual files or ZIP'],
    ['Uploads', 'No image is uploaded'],
    ['Account', 'Not required'],
    ['Limit', `${C.LIMITS.maxFileBytes / (1024 * 1024)} MB per file`]
  ])
});

function studioBody() {
  return `${pageBreadcrumb('Image Studio', { label: 'Image toolkit', url: '/image/' })}
<section class="tk-hero tk-hero--studio">
  <div class="tk-hero-main">
    <section class="tool-head itk-head tk-head">
      <span class="eyebrow">Bench Image Toolkit · Studio</span>
      <h1>Image Studio</h1>
      <p>A three-step batch recipe for real work: add images, choose one set of export settings, then download every result or a ZIP. Everything runs locally — the files never leave your device.</p>
      <div class="itk-meta tk-stats"><span class="itk-chip">Up to ${esc(C.LIMITS.maxFiles)} files</span><span class="itk-chip">WebP, JPEG or PNG</span><span class="itk-chip">Optional square crop</span></div>
      <div class="tk-actions"><a class="btn" href="#studio-workspace">Open the workspace</a><a class="btn secondary" href="/image/">Back to all image tools</a></div>
    </section>
  </div>
  <aside class="tk-hero-side" aria-label="Studio highlights">
    <span class="tk-trust-pill"><span aria-hidden="true">&#128274;</span> 100% local · no upload · no signup</span>
    <section class="tk-start-card">
      <span class="tk-kicker">Three steps</span>
      <h2>One recipe, every file</h2>
      <ol class="tk-step-list"><li><b>01</b> Add images</li><li><b>02</b> Choose a recipe</li><li><b>03</b> Export results</li></ol>
    </section>
    <section class="tk-start-card tk-start-card--quiet">
      <span class="tk-kicker">Need one file only?</span>
      <p>Use a single-purpose tool for a one-off crop, convert or compression job.</p>
      <a href="/image/resize/">Open Resize Image <span aria-hidden="true">→</span></a>
    </section>
  </aside>
</section>

${studioQuickAnswer}

<section class="tk-section-head" id="studio-workspace">
  <div>
    <span class="tk-kicker">Workspace</span>
    <h2>Prepare a consistent batch</h2>
  </div>
  <p>Static guide below. JavaScript mounts the interactive studio in the same two-pane layout.</p>
</section>
<section class="itk-grid itk-studio-static tk-studio-static">
  <div class="itk-panel tk-panel">
    <span class="tk-step-badge">01</span>
    <h2>Add images</h2>
    <p>Drop JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF or SVG files, or use the picker. The live studio shows each preview, dimensions and byte size before you run anything.</p>
    <span class="tk-step-badge">02</span>
    <h2>Choose a recipe</h2>
    <ul>
      <li>Output format: WebP, JPEG or PNG.</li>
      <li>Maximum width: 0 keeps the original size; the default is 1600 px.</li>
      <li>Square crop, quality, background colour and metadata stripping.</li>
    </ul>
    <span class="tk-step-badge">03</span>
    <h2>Export</h2>
    <p>Download each successful result, or take one ZIP containing everything. Files that fail are listed separately and never replaced with a fake success.</p>
    <noscript><p><em>Enable JavaScript to use the interactive studio. The individual tool pages below also need JavaScript because all processing happens in your browser.</em></p></noscript>
  </div>
  <div class="itk-panel tk-panel">
    <span class="tk-kicker">Why a studio?</span>
    <h2>One pipeline, no duplicate pages</h2>
    <p>Batch resize, batch convert and batch compression share exactly the same decode → transform → encode pipeline. Folding them into one recipe avoids three thin, duplicate pages while keeping the individual single-purpose tools available.</p>
    <h2>Related tools</h2>
    <div class="tool-links tk-links">
      <a href="/image/compress/">${icons.toolIcon('image', 'compress')} Image Compressor</a>
      <a href="/image/resize/">${icons.toolIcon('image', 'resize')} Resize Image</a>
      <a href="/image/convert/">${icons.toolIcon('image', 'convert')} Image Converter</a>
      <a href="/image/strip-metadata/">${icons.toolIcon('image', 'strip-metadata')} EXIF &amp; GPS Remover</a>
      <a href="/image/batch-rename/">${icons.toolIcon('image', 'batch-rename')} Batch Rename &amp; Export</a>
    </div>
    <p><a class="btn" href="/image/">Browse every image tool</a></p>
  </div>
</section>

<section class="seo-section itk-seo tk-seo">
  <span class="tk-kicker">Details</span>
  <h2>What Image Studio does</h2>
  <p>Image Studio applies one resize, format and quality recipe to several images at once. It is intended for preparing web images, marketplace photos and consistent documentation. It is not a photo editor: use the individual crop, annotate, watermark and adjustment tools for per-image edits.</p>
  <h2>Privacy &amp; security</h2>
  <p>Decoding and encoding use the browser Canvas API. Files are read from local memory, results are temporary object URLs, and no image bytes are sent to Bench or a third party. Object URLs are revoked when results are replaced or the page is left.</p>
  <h2>Limits</h2>
  <p>Each file is limited to ${esc(C.LIMITS.maxFileBytes / (1024 * 1024))} MB and ${esc((C.LIMITS.maxPixels / 1e6).toFixed(0))} megapixels. A batch is limited to ${esc(C.LIMITS.maxFiles)} files and an estimated ${esc((C.LIMITS.maxBatchPixels / 1e6).toFixed(0))} megapixels of work. Very large or unusual files may still be rejected by the browser decoder; that failure is reported instead of hidden.</p>
</section>`;
}

function relatedTools(tool) {
  return PUBLIC.filter(t => t.slug !== tool.slug && t.category === tool.category).slice(0, 6);
}

function toolBody(tool) {
  const related = relatedTools(tool);
  const copy = seoCopy.forTool(tool, 'image');
  const faq = (tool.faq || []).filter(f => f && f.q && f.a);
  const useCases = tool.useCases || [];
  const howTo = copy.howTo(tool.howTo);
  const limitations = tool.limitations || tool.reason || 'No additional limitations are documented for this build.';
  const experimental = tool.status === 'experimental';

  const fallback = `<section class="toolbox workspace-preview itk-fallback">
    <div class="workspace-preview-head">
      <span class="workspace-preview-icon" aria-hidden="true">&#8681;</span>
      <div><strong>Interactive workspace</strong><span>Add a file, adjust the settings, then download the result.</span></div>
    </div>
    <ol class="workspace-steps">
      <li><span class="step-no">1</span><div><strong>Add ${tool.requiresFile === false ? 'your settings' : 'your files'}</strong><small>${esc((tool.inputs || []).join(', ') || 'Image files')} · up to ${esc(tool.maxFiles || 1)} file${(tool.maxFiles || 1) === 1 ? '' : 's'}</small></div></li>
      <li><span class="step-no">2</span><div><strong>Choose the options</strong><small>Every setting is applied locally in this tab.</small></div></li>
      <li><span class="step-no">3</span><div><strong>Download the output</strong><small>${esc(seo.formatOutputs(tool.outputs))} — no uploads, no account.</small></div></li>
    </ol>
    <div class="workspace-noscript">
      <h2>About this tool</h2>
      <p>${esc(copy.description)}</p>
      <p><em>Enable JavaScript to use the interactive tool. Processing happens locally in your browser; nothing is uploaded.</em></p>
    </div>
  </section>`;

  const quickFacts = seo.keyFacts([
    ['Cost', 'Free · no account needed'],
    ['Uploads', 'No image is uploaded'],
    ['Inputs', (tool.inputs || []).join(', ') || 'Image files'],
    ['Output', seo.formatOutputs(tool.outputs)],
    ['Batch', `${tool.maxFiles || 1} file${(tool.maxFiles || 1) === 1 ? '' : 's'} per run`],
    ['Limit', `${C.LIMITS.maxFileBytes / (1024 * 1024)} MB per file · ${(C.LIMITS.maxPixels / 1e6).toFixed(0)} MP`]
  ]);
  const quickAnswer = seo.quickAnswerHtml({
    answerHtml: `<strong>${esc(tool.name)}</strong> ${esc(copy.quickAnswer)}`,
    facts: quickFacts,
    className: 'quick-answer--summary'
  });

  return `<nav class="itk-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/image/">Image toolkit</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(tool.name)}</span></nav>

<section class="tool-head itk-head tool-head--compact">
  <div class="tool-head-top">
    <span class="eyebrow">Bench Image Toolkit${tool.status === 'implemented' ? '' : ` · ${statusBadge(tool.status)}`}</span>
    <div class="itk-meta">
      ${(tool.inputs || []).map(f => `<span class="itk-chip">${esc(f)}</span>`).join('')}
      <span class="itk-chip">up to ${esc(tool.maxFiles || 1)} file${(tool.maxFiles || 1) === 1 ? '' : 's'}</span>
      <span class="itk-chip">${esc((C.LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0))} MB / file</span>
    </div>
  </div>
  <h1><span class="tool-head-icon" data-icon="${icons.iconName('image', tool.slug, tool.icon)}">${icons.toolIcon('image', tool.slug, tool.icon)}</span>${esc(tool.name)}</h1>
  <p>${esc(tool.summary)} <strong>Nothing is uploaded.</strong></p>
</section>

${experimental ? `<div class="itk-status warn"><strong>Experimental</strong><span>${esc(limitations)}</span></div>` : ''}

${fallback}

${quickAnswer}

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
  <h2>How your image is processed</h2>
  <p>${esc(copy.processNote('Canvas in your browser'))}</p>
  <h2>Privacy &amp; security</h2>
  <p>${esc(copy.privacyNote)}</p>
  ${faq.length ? `<h2>Frequently asked questions</h2><div class="faq-list">${faq.map(f => `<div class="faq-item"><strong>${esc(f.q)}</strong><p>${esc(copy.faqAnswer(f.q, f.a))}</p></div>`).join('')}</div>` : ''}
  ${related.length ? `<h2>Related image tools</h2><div class="tool-links">${related.map(t => `<a href="/image/${esc(t.slug)}/">${icons.toolIcon('image', t.slug, t.icon)} ${esc(t.name)}</a>`).join('')}</div>` : ''}
</section>`;
}

function hubSchema() {
  return seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: `${SITE_URL}/image/`,
      name: 'Bench Image Toolkit: private browser image tools',
      description: 'Private browser image tools for compression, resizing, conversion, editing, metadata and creation.',
      type: 'CollectionPage',
      dateModified: seoCopy.UPDATED.image
    }),
    {
      '@type': 'ItemList',
      name: 'Working image tools',
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
      { name: 'Image toolkit', url: `${SITE_URL}/image/` }
    ]),
    seo.faqPageNode(HUB_FAQ)
  ]);
}

function studioSchema() {
  return seo.graph([
    seo.organizationNode(),
    seo.websiteNode(),
    seo.webPageNode({
      url: `${SITE_URL}/image/studio/`,
      name: 'Image Studio: batch resize and convert',
      description: 'Batch resize, convert and compress images locally in the browser.',
      dateModified: seoCopy.UPDATED.image
    }),
    seo.softwareApplicationNode({
      name: 'Image Studio',
      url: `${SITE_URL}/image/studio/`,
      description: 'Batch resize, convert and compress images locally in the browser.',
      category: 'MultimediaApplication',
      requirements: 'Requires a modern browser with Canvas support',
      featureList: ['Batch resize', 'Format conversion', 'Compression', 'ZIP export']
    }),
    seo.howToNode('Image Studio', 'Batch resize, convert and compress images locally in the browser.', [
      'Add images with the file picker or by dropping them onto the page.',
      'Choose the output format, maximum width, square crop, quality and metadata settings.',
      'Export each successful result, or download one ZIP containing every image.'
    ], `${SITE_URL}/image/studio/`),
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Image toolkit', url: `${SITE_URL}/image/` },
      { name: 'Image Studio', url: `${SITE_URL}/image/studio/` }
    ])
  ]);
}

function toolSchema(tool) {
  const copy = seoCopy.forTool(tool, 'image');
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
      requirements: 'Requires a modern browser with Canvas support',
      featureList: tool.useCases
    }),
    seo.howToNode(tool.name, copy.description, copy.howTo(tool.howTo), publicUrl(tool)),
    seo.breadcrumbList([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Image toolkit', url: `${SITE_URL}/image/` },
      { name: tool.name, url: publicUrl(tool) }
    ]),
    seo.faqPageNode(faq)
  ]);
}

function generateHubHtml() {
  const title = 'Bench Image Toolkit: private browser image tools';
  const desc = 'Compress, resize, convert, crop, watermark, inspect and generate images in your browser. Real client-side processing, no uploads and no account.';
  return shell(title, desc, `${SITE_URL}/image/`, hubBody(), { schema: hubSchema() });
}

function generateStudioHtml() {
  const title = 'Image Studio: batch resize and convert | Bench';
  const desc = 'Batch resize, convert and compress images locally in your browser. Choose one export recipe, download every result or a ZIP. No uploads.';
  return shell(title, desc, `${SITE_URL}/image/studio/`, studioBody(), { schema: studioSchema() });
}

function generateToolHtml(tool) {
  const title = tool.seoTitle || `${tool.name} | Bench Image Toolkit`;
  const desc = seoCopy.forTool(tool, 'image').seoDescription;
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

function buildImagePages(baseDir) {
  baseDir = baseDir || __dirname;
  const distDir = path.join(baseDir, 'dist');
  const targets = [baseDir, distDir];

  const pages = [
    ['image', generateHubHtml()],
    [path.join('image', 'studio'), generateStudioHtml()]
  ];
  PUBLIC.forEach(tool => {
    pages.push([path.join('image', tool.slug), generateToolHtml(tool)]);
  });

  targets.forEach(root => {
    pages.forEach(([relative, html]) => writePage(root, relative, html));
  });

  return {
    count: pages.length,
    publicTools: PUBLIC.map(t => t.slug),
    experimental: EXPERIMENTAL.map(t => t.slug),
    indexable: ['', 'studio'].concat(IMPLEMENTED.map(t => t.slug))
  };
}

module.exports = {
  SITE_URL,
  PUBLIC,
  IMPLEMENTED,
  EXPERIMENTAL,
  generateHubHtml,
  generateStudioHtml,
  generateToolHtml,
  buildImagePages,
  statusLabel
};

if (require.main === module) {
  const result = buildImagePages(__dirname);
  console.log(`image pages: ${result.count} written to image/ and dist/image/`);
}
