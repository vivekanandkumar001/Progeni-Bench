/*
 * Scratch UI audit: every generated page should have one h1, a viewport meta,
 * a canonical, alt text on images, no empty links, no template leakage
 * (undefined / NaN / [object Object]), and every internal href/src should
 * resolve to a real file in dist.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function resolves(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return fs.existsSync(path.join(DIST, 'index.html'));
  const target = path.join(DIST, decodeURIComponent(clean));
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  if (fs.existsSync(target + '.html')) return true;
  if (fs.existsSync(path.join(target, 'index.html'))) return true;
  return false;
}

const files = walk(DIST);
const issues = [];
for (const file of files) {
  const rel = '/' + path.relative(DIST, file).replace(/\\/g, '/');
  // Not real pages: the 404 shell has no canonical by design, and the Google
  // Search Console verification file is a bare token.
  if (rel === '/404.html' || /^\/google[0-9a-f]+\.html$/.test(rel)) continue;
  const html = fs.readFileSync(file, 'utf8');

  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) issues.push(`${rel}: ${h1s} <h1> elements`);

  if (!/<meta name="viewport"/i.test(html)) issues.push(`${rel}: missing viewport meta`);
  if (!/<link rel="canonical" href="https:\/\/bench\.progeni\.live\//i.test(html)) issues.push(`${rel}: missing absolute canonical`);

  for (const img of html.match(/<img\b[^>]*>/gi) || []) {
    if (!/\balt=/.test(img)) issues.push(`${rel}: <img> without alt: ${img.slice(0, 90)}`);
  }

  for (const [, href] of html.matchAll(/\bhref="([^"]*)"/g)) {
    if (href.startsWith('/') && !href.startsWith('//') && !resolves(href)) {
      issues.push(`${rel}: broken link ${href}`);
    }
    if (href === '' || href === '#') issues.push(`${rel}: empty href`);
  }
  for (const [, src] of html.matchAll(/\bsrc="([^"]*)"/g)) {
    if (src.startsWith('/') && !src.startsWith('//') && !resolves(src)) {
      issues.push(`${rel}: broken src ${src}`);
    }
  }

  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(html)) {
    issues.push(`${rel}: template leakage (undefined/NaN/[object Object])`);
  }
}

console.log(`pages: ${files.length}`);
if (issues.length) {
  console.log(`issues: ${issues.length}`);
  for (const issue of issues.slice(0, 80)) console.log(' - ' + issue);
  process.exitCode = 1;
} else {
  console.log('issues: 0');
}
