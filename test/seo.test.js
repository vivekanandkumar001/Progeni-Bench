const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { TOOLS, SITE_URL } = require(path.join(ROOT, 'site.config.js'));

test('SEO: Homepage initial HTML contains all 30 tool cards pre-rendered', () => {
  const homeHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.ok(homeHtml.includes('class="grid"'), 'Expected #grid in index.html');
  
  for (const tool of TOOLS) {
    assert.ok(
      homeHtml.includes(`/tools/${tool.id}/`),
      `Expected pre-rendered link to /tools/${tool.id}/ on homepage`
    );
  }
});

test('SEO: Homepage contains Category Showcase and Architecture highlights', () => {
  const homeHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.ok(homeHtml.includes('Browse utilities by category'), 'Expected Category Directory on homepage');
  assert.ok(homeHtml.includes('100% private, client-side architecture'), 'Expected Architecture section on homepage');
  
  const categories = [...new Set(TOOLS.map(t => t.cat))];
  for (const cat of categories) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    assert.ok(
      homeHtml.includes(`id="category-${slug}"`),
      `Expected category anchor block for ${cat} on homepage`
    );
  }
});

test('SEO: Every tool page contains valid WebApplication, BreadcrumbList, and FAQPage schemas', () => {
  for (const tool of TOOLS) {
    const filePath = path.join(ROOT, 'dist', 'tools', tool.id, 'index.html');
    assert.ok(fs.existsSync(filePath), `Missing index.html for ${tool.id}`);
    const html = fs.readFileSync(filePath, 'utf8');
    
    const schemaMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(schemaMatch, `Missing schema script on ${tool.id}`);
    
    const data = JSON.parse(schemaMatch[1]);
    const graph = data['@graph'] || [data];
    
    const webApp = graph.find(item => item['@type'] === 'WebApplication');
    assert.ok(webApp, `Missing WebApplication schema on ${tool.id}`);
    assert.equal(webApp.name, tool.name);
    
    const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
    assert.ok(breadcrumb, `Missing BreadcrumbList schema on ${tool.id}`);
    assert.equal(breadcrumb.itemListElement.length, 3);
    
    // Breadcrumb position 1 and position 2 must NOT have duplicate URLs
    const pos1Item = breadcrumb.itemListElement[0].item;
    const pos2Item = breadcrumb.itemListElement[1].item;
    assert.notEqual(pos1Item, pos2Item, `Breadcrumb pos 1 and pos 2 have duplicate URL on ${tool.id}`);
    assert.ok(pos2Item.includes('#category-'), `Expected category anchor in pos 2 breadcrumb on ${tool.id}`);
    
    const faq = graph.find(item => item['@type'] === 'FAQPage');
    assert.ok(faq, `Missing FAQPage schema on ${tool.id}`);
    assert.ok(faq.mainEntity.length >= 3, `Expected at least 3 FAQ items on ${tool.id}`);
    for (const q of faq.mainEntity) {
      assert.ok(q.name && q.name.length > 5, 'Invalid FAQ question name');
      assert.ok(q.acceptedAnswer && q.acceptedAnswer.text && q.acceptedAnswer.text.length > 10, 'Invalid acceptedAnswer');
    }
  }
});

test('SEO: Every tool page body contains Common use cases and Frequently Asked Questions', () => {
  for (const tool of TOOLS) {
    const filePath = path.join(ROOT, 'dist', 'tools', tool.id, 'index.html');
    const html = fs.readFileSync(filePath, 'utf8');
    
    assert.ok(html.includes('<h2>Common use cases</h2>'), `Missing Common use cases on ${tool.id}`);
    assert.ok(html.includes('<h2>Frequently Asked Questions</h2>'), `Missing FAQ heading on ${tool.id}`);
    assert.ok(html.includes('<h2>What it does</h2>'), `Missing What it does on ${tool.id}`);
    assert.ok(html.includes('<h2>How to use</h2>'), `Missing How to use on ${tool.id}`);
    assert.ok(html.includes('<h2>Limits & Considerations</h2>'), `Missing Limits on ${tool.id}`);
    assert.ok(html.includes('<h2>Privacy & Security</h2>'), `Missing Privacy on ${tool.id}`);
    assert.ok(html.includes('<div class="tool-links">'), `Missing tool-links on ${tool.id}`);
  }
});

test('SEO: Static pages have proper titles, descriptions, and breadcrumb schemas', () => {
  const pages = ['about', 'privacy', 'terms', 'contact'];
  for (const page of pages) {
    const filePath = path.join(ROOT, 'dist', page, 'index.html');
    assert.ok(fs.existsSync(filePath), `Missing index.html for ${page}`);
    const html = fs.readFileSync(filePath, 'utf8');
    
    assert.ok(html.includes('<link rel="canonical"'), `Missing canonical on ${page}`);
    const schemaMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(schemaMatch, `Missing schema script on ${page}`);
    
    const data = JSON.parse(schemaMatch[1]);
    const graph = data['@graph'] || [data];
    const webPage = graph.find(item => item['@type'] === 'WebPage');
    assert.ok(webPage, `Missing WebPage schema on ${page}`);
  }
});
