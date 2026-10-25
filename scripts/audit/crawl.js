/*
 * Site audit crawler.
 *
 * Loads every sitemap URL in Chromium and records what is actually wrong:
 * console/page errors, failed requests, HTTP status, missing or duplicated
 * <title>/<h1>, canonical + robots-meta presence, and whether the main UI
 * renders. Output is JSON so it can be diffed between runs.
 *
 * Run with the built site served on :3000:
 *   node scripts/serve.js 3000 dist &
 *   node scripts/audit/crawl.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.AUDIT_BASE || 'http://localhost:3000';
const ROOT = path.join(__dirname, '..', '..');

function sitemapPaths() {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  return locs.map(u => u.replace('https://bench.progeni.live', '') || '/');
}

(async () => {
  const paths = sitemapPaths();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const results = [];
  const titleSeen = new Map();

  for (const p of paths) {
    const entry = { path: p, errors: [], failed: [], status: null };
    const onConsole = m => { if (m.type() === 'error') entry.errors.push(m.text().slice(0, 300)); };
    const onPageError = e => entry.errors.push('PAGEERROR: ' + e.message.slice(0, 300));
    const onFailed = r => {
      const f = r.failure();
      entry.failed.push(`${r.url().replace(BASE, '')} :: ${f ? f.errorText : 'unknown'}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onFailed);

    try {
      const res = await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 30000 });
      entry.status = res ? res.status() : null;
      await page.waitForTimeout(400);

      entry.title = await page.title();
      entry.h1 = await page.locator('h1').first().textContent().catch(() => null);
      entry.canonical = await page.getAttribute('link[rel=canonical]', 'href').catch(() => null);
      entry.robots = await page.getAttribute('meta[name=robots]', 'content').catch(() => null);
      entry.desc = await page.getAttribute('meta[name=description]', 'content').catch(() => null);
      entry.ogTitle = await page.getAttribute('meta[property="og:title"]', 'content').catch(() => null);
      entry.ld = await page.locator('script[type="application/ld+json"]').count();
      entry.mainVisible = await page.locator('#app, main, .container').first().isVisible().catch(() => false);
      entry.bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
      entry.cardCount = await page.locator('a.tool-card, .itk-tool-card').count();
    } catch (e) {
      entry.errors.push('NAV: ' + e.message.slice(0, 300));
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onFailed);
    }

    entry.h1 = entry.h1 ? entry.h1.trim() : null;
    if (entry.title) {
      const k = entry.title.trim();
      if (!titleSeen.has(k)) titleSeen.set(k, []);
      titleSeen.get(k).push(p);
    }
    results.push(entry);
  }

  await browser.close();

  const dupTitles = [...titleSeen.entries()].filter(([, v]) => v.length > 1);
  const problems = results.filter(e =>
    e.status !== 200 || e.errors.length || e.failed.length ||
    !e.title || !e.h1 || !e.canonical || !e.desc || !e.ogTitle || e.bodyLen < 400
  );

  const out = { base: BASE, generated: new Date().toISOString(), total: paths.length, dupTitles, results };
  const dir = path.join(ROOT, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'audit-report.json'), JSON.stringify(out, null, 2));

  console.log(`Audited ${paths.length} pages.`);
  console.log(`Pages with problems: ${problems.length}`);
  console.log(`Duplicated titles: ${dupTitles.length}`);
  console.log('');
  for (const e of problems) {
    console.log(`- ${e.path}  status=${e.status} bodyLen=${e.bodyLen} ld=${e.ld}`);
    if (!e.title) console.log('    ! missing title');
    if (!e.h1) console.log('    ! missing h1');
    if (!e.canonical) console.log('    ! missing canonical');
    if (!e.desc) console.log('    ! missing description');
    if (!e.ogTitle) console.log('    ! missing og:title');
    if (e.bodyLen < 400) console.log('    ! thin body');
    e.errors.slice(0, 4).forEach(x => console.log('    console: ' + x));
    e.failed.slice(0, 4).forEach(x => console.log('    failed:  ' + x));
  }
  if (dupTitles.length) {
    console.log('\nDuplicate titles:');
    dupTitles.forEach(([t, ps]) => console.log(`  "${t}" -> ${ps.join(', ')}`));
  }
})();
