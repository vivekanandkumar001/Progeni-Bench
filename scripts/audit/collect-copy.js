/*
 * Collect the rendered text of every page (after client-side mounts) so the
 * copy can be reviewed like a user reads it.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', '..', 'dist');
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'copy-corpus.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}
function urlOf(file) {
  let rel = '/' + path.relative(DIST, file).replace(/\\/g, '/');
  if (rel === '/index.html') return '/';
  if (rel.endsWith('/index.html')) return rel.slice(0, -'index.html'.length);
  return rel;
}

const files = walk(DIST).filter(f => {
  const u = urlOf(f);
  return !u.startsWith('/google') && u !== '/404.html';
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const corpus = [];
  for (const file of files) {
    const url = urlOf(file);
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 20000 });
      // Wait for a toolkit mount if the page has one.
      await page.waitForTimeout(200);
      const data = await page.evaluate(() => {
        const norm = s => s.replace(/\s+/g, ' ').trim();
        return {
          title: document.title,
          description: (document.querySelector('meta[name="description"]') || {}).content || '',
          h1: Array.from(document.querySelectorAll('h1')).map(h => norm(h.textContent)),
          headings: Array.from(document.querySelectorAll('h2,h3')).map(h => h.tagName + ': ' + norm(h.textContent)),
          text: norm(document.body.innerText),
          buttons: Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent).map(b => norm(b.textContent) || b.getAttribute('aria-label') || ''),
          labels: Array.from(document.querySelectorAll('label')).filter(l => l.offsetParent).map(l => norm(l.textContent)),
          placeholders: Array.from(document.querySelectorAll('[placeholder]')).map(i => i.getAttribute('placeholder')),
          links: Array.from(document.querySelectorAll('a[href]')).filter(a => a.offsetParent).map(a => ({ text: norm(a.textContent), href: a.getAttribute('href') })),
          alt: Array.from(document.querySelectorAll('img[alt]')).map(i => ({ alt: i.getAttribute('alt'), src: i.getAttribute('src') })),
          emptyState: Array.from(document.querySelectorAll('.itk-empty, .empty, [data-empty]')).map(e => norm(e.innerText))
        };
      });
      corpus.push({ url, ...data });
    } catch (err) {
      corpus.push({ url, error: String(err.message || err) });
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(corpus, null, 2));
  console.log('pages:', corpus.length, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
