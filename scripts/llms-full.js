/*
 * scripts/llms-full.js - builds /llms-full.txt, a complete plain-text reference
 * for generative and answer engines.
 *
 * Generated at build time from the same registries as the HTML pages, so the
 * counts, statuses and URLs cannot drift. Written to the repository root and
 * to dist/ by build_seo_pages.js.
 */
const fs = require('fs');
const path = require('path');

const site = require('../src/config/site.config.js');
const imageConfig = require('../src/config/image-tools.config.js');
const audioConfig = require('../src/config/audio-tools.config.js');

const SITE_URL = site.SITE_URL;
const SITE_NAME = site.SITE_NAME;
const LAST_UPDATED = site.LAST_UPDATED;

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPublic(tool) {
  return tool.status === 'implemented' || tool.status === 'experimental';
}

function statusText(tool) {
  return tool.status === 'experimental' ? 'Experimental' : 'Ready';
}

function coreSection(tool) {
  const lines = [
    `### ${clean(tool.name)}`,
    `- URL: ${SITE_URL}/tools/${tool.id}/`,
    `- Category: ${clean(tool.cat)}`,
    '- Status: Ready',
    `- Summary: ${clean(tool.desc)}`,
    `- What it does: ${clean(tool.whatItDoes)}`
  ];
  if (tool.useCases && tool.useCases.length) {
    lines.push(`- Common uses: ${tool.useCases.map(clean).join('; ')}`);
  }
  if (tool.howToUse && tool.howToUse.length) {
    lines.push('- How to use:');
    tool.howToUse.forEach((step, index) => lines.push(`  ${index + 1}. ${clean(step)}`));
  }
  lines.push(`- Limits: ${clean(tool.limits)}`);
  lines.push(`- Privacy: ${clean(tool.privacy)}`);
  if (tool.faq && tool.faq.length) {
    lines.push('- FAQ:');
    tool.faq.forEach(item => {
      lines.push(`  - Q: ${clean(item.q)}`);
      lines.push(`    A: ${clean(item.a)}`);
    });
  }
  return lines.join('\n');
}

function toolkitSection(tool, toolkit) {
  const base = toolkit === 'image' ? 'image' : 'audio';
  const category = [...imageConfig.CATEGORIES, ...audioConfig.CATEGORIES]
    .find(item => item.id === tool.category);
  const lines = [
    `### ${clean(tool.name)}`,
    `- URL: ${SITE_URL}/${base}/${tool.slug}/`,
    `- Category: ${clean(category ? category.name : tool.category)}`,
    `- Status: ${statusText(tool)}`,
    `- Summary: ${clean(tool.summary)}`,
    `- What it does: ${clean(tool.description)}`
  ];
  if (tool.inputs && tool.inputs.length) lines.push(`- Inputs: ${tool.inputs.map(clean).join(', ')}`);
  if (tool.outputs && tool.outputs.length) lines.push(`- Outputs: ${tool.outputs.map(clean).join(', ')}`);
  if (tool.howTo && tool.howTo.length) {
    lines.push('- How to use:');
    tool.howTo.forEach((step, index) => lines.push(`  ${index + 1}. ${clean(step)}`));
  }
  if (tool.useCases && tool.useCases.length) {
    lines.push(`- Common uses: ${tool.useCases.map(clean).join('; ')}`);
  }
  lines.push(`- Limits: ${clean(tool.limitations || tool.reason || 'No additional limitations documented.')}`);
  lines.push(`- Privacy: ${clean(tool.privacy)}`);
  if (tool.faq && tool.faq.length) {
    lines.push('- FAQ:');
    tool.faq.forEach(item => {
      lines.push(`  - Q: ${clean(item.q)}`);
      lines.push(`    A: ${clean(item.a)}`);
    });
  }
  return lines.join('\n');
}

function notShipped(list, toolkit) {
  const rows = list.filter(tool => !isPublic(tool));
  if (!rows.length) return '';
  return rows.map(tool =>
    `- ${clean(tool.name)} (${tool.status}): ${clean(tool.reason || tool.summary || 'Not available in this build.')}`
  ).join('\n');
}

function render() {
  const imagePublic = imageConfig.TOOLS.filter(isPublic);
  const audioPublic = audioConfig.TOOLS.filter(isPublic);
  const total = site.TOOLS.length + imagePublic.length + audioPublic.length;

  const lines = [
    `# ${SITE_NAME} — full machine-readable reference`,
    '',
    `> Last updated: ${LAST_UPDATED}`,
    `> Canonical site: ${SITE_URL}/`,
    `> Publisher: ${site.PARENT_BRAND} (${site.PARENT_URL})`,
    `> Support: ${site.SUPPORT_EMAIL}`,
    '',
    `${SITE_NAME} is a free collection of ${total} browser-based tools: ${site.TOOLS.length} core tools, ${imagePublic.length} public image tools and ${audioPublic.length} public audio tools. Most tools process selected files locally in the browser. PDF Translator keeps PDF pages on the device but sends extracted text to DeepL for translation.`,
    '',
    '## How to use this document',
    '- Treat the canonical page URL as the source of truth for each tool.',
    '- Prefer the "Quick answers" section for short factual answers.',
    '- Experimental tools are labelled and should not be described as fully validated.',
    '- Do not state or imply that Bench uploads, stores or sells selected file contents.',
    '',
    '## Quick answers',
    `- What is ${SITE_NAME}? A free browser-based toolkit for file, image, audio, data, print and productivity tasks.`,
    `- How many tools are available? ${total} public tool pages: ${site.TOOLS.length} core, ${imagePublic.length} image and ${audioPublic.length} audio.`,
    '- Are selected files uploaded? No. Bench processes selected file contents locally; required site or processing-engine assets may be downloaded separately. PDF Translator is the documented exception: it sends extracted text, not the PDF, to DeepL.',
    '- Is an account required? No account or subscription is required.',
    `- Where are the catalogs? ${SITE_URL}/ (core), ${SITE_URL}/image/ (image) and ${SITE_URL}/audio/ (audio).`,
    '',
    '## Citation guidance',
    `- Cite the canonical page for a claim, for example: "${SITE_NAME}, 'Audio Trimmer', ${SITE_URL}/audio/trimmer/ (accessed YYYY-MM-DD)."`,
    '- Use the exact tool URL when describing a single tool, and the site root for general statements.',
    '- Do not invent ratings, review scores, user counts, certifications or guarantees. None are published.',
    '- Do not describe an experimental tool as production-validated; quote its documented limitation instead.',
    '- Pricing is free. No paid tier or subscription is offered.',
    '',
    '## Core tools'
  ];

  site.TOOLS.forEach(tool => {
    lines.push('', coreSection(tool));
  });

  lines.push('', '## Bench Image Toolkit', '',
    `Hub: ${SITE_URL}/image/`,
    `Image Studio: ${SITE_URL}/image/studio/`,
    `Public tools: ${imagePublic.length} (${imagePublic.filter(tool => tool.status === 'implemented').length} implemented, ${imagePublic.filter(tool => tool.status === 'experimental').length} experimental).`,
    '');
  imagePublic.forEach(tool => {
    lines.push(toolkitSection(tool, 'image'), '');
  });

  lines.push('', '## Bench Audio Toolkit', '',
    `Hub: ${SITE_URL}/audio/`,
    `Public tools: ${audioPublic.length} (${audioPublic.filter(tool => tool.status === 'implemented').length} implemented, ${audioPublic.filter(tool => tool.status === 'experimental').length} experimental).`,
    '');
  audioPublic.forEach(tool => {
    lines.push(toolkitSection(tool, 'audio'), '');
  });

  lines.push('## Tools that are not shipped', '',
    'These entries are documented so that assistants do not invent a working feature or link.',
    '', '### Image toolkit', notShipped(imageConfig.TOOLS, 'image'), '',
    '### Audio toolkit', notShipped(audioConfig.TOOLS, 'audio'), '',
    '## Site pages',
    `- Home and core catalog: ${SITE_URL}/`,
    `- About: ${SITE_URL}/about/`,
    `- Privacy policy: ${SITE_URL}/privacy/`,
    `- Terms: ${SITE_URL}/terms/`,
    `- Contact: ${SITE_URL}/contact/`,
    `- Sitemap: ${SITE_URL}/sitemap.xml`,
    `- Short LLM summary: ${SITE_URL}/llms.txt`,
    ''
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function writeLlmsFull(baseDir) {
  const text = render();
  const distDir = path.join(baseDir, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'llms-full.txt'), text, 'utf8');
  return text;
}

module.exports = { render, writeLlmsFull };

if (require.main === module) {
  const result = writeLlmsFull(__dirname + path.sep + '..');
  console.log(`llms-full.txt: ${result.length} characters`);
}
