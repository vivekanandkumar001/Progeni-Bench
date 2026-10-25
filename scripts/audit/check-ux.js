/*
 * User-point-of-view UX audit across every generated page.
 *
 * Checks, at phone and desktop widths:
 *   - horizontal document overflow and elements pushed off-screen
 *   - text smaller than 12px
 *   - tap targets smaller than 40px (phone, buttons/standalone links only)
 *   - WCAG AA text contrast (solid backgrounds only)
 *   - clipped/truncated text
 *   - heading structure (one h1, no skipped levels)
 *   - duplicate ids
 *   - unlabelled form controls
 *   - buttons/links with no accessible name
 *   - images without alt
 *   - console errors
 *
 * Usage: node scripts/audit/check-ux.js [pathFilter]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const BASE = 'http://localhost:3000';
const FILTER = process.argv[2] || '';

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
  return !u.startsWith('/google') && u !== '/404.html' && (!FILTER || u.includes(FILTER));
});

const inPage = () => {
  const ISSUES = [];
  const push = (type, el, detail) => {
    const text = (el && el.textContent ? el.textContent : '').trim().replace(/\s+/g, ' ').slice(0, 70);
    const sel = el && el.tagName ? el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : '';
    ISSUES.push({ type, sel, text, detail });
  };

  const isVisible = el => {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) {
    push('doc-overflow', de, de.scrollWidth + 'px > ' + vw + 'px viewport');
  }

  const all = Array.from(document.querySelectorAll('body *'));

  /* Off-screen elements (ignore intentionally wide scroll containers). */
  for (const el of all) {
    if (!isVisible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    let p = el.parentElement, scrollable = false;
    while (p && p !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { scrollable = true; break; }
      p = p.parentElement;
    }
    const r = el.getBoundingClientRect();
    if (!scrollable && r.width < vw * 1.4 && (r.right > vw + 2 || r.left < -2)) {
      push('off-screen', el, Math.round(r.left) + '..' + Math.round(r.right) + ' vs 0..' + vw);
    }
  }

  /* Tiny text. */
  for (const el of all) {
    if (!isVisible(el)) continue;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) push('tiny-text', el, fs + 'px');
  }

  /* Tap targets (phone only). Inline links inside prose are exempt. */
  if (vw <= 500) {
    const interactive = document.querySelectorAll('button, [role="button"], input, select, textarea, summary, a');
    for (const el of interactive) {
      if (!isVisible(el) || el.disabled) continue;
      if (el.tagName === 'A' && el.closest('p, li, .seo-section, footer')) continue;
      let r = el.getBoundingClientRect();
      // A checkbox or radio wrapped in a label is tapped through the whole
      // label row, so measure that instead of the small visual box.
      if (el.type === 'checkbox' || el.type === 'radio') {
        const lab = el.closest('label');
        if (lab) r = lab.getBoundingClientRect();
      }
      if (r.width < 40 || r.height < 40) push('tap-target', el, Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }

  /* Contrast, solid backgrounds only. */
  const parse = s => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const n = m[1].split(',').map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const mix = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  });
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = el => {
    const stack = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      if (Number(cs.opacity) < 1) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = mix(stack[i], base);
    return base;
  };
  for (const el of all) {
    if (!isVisible(el)) continue;
    if (el.closest('h1, h2, h3, option')) continue;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    const c = mix(fg, bg);
    const L1 = lum(c), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fs = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 600;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    if (ratio < (large ? 3 : 4.5)) push('contrast', el, ratio.toFixed(2) + ':1 at ' + fs + 'px');
  }

  /* Clipped text. */
  for (const el of all) {
    if (!isVisible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 3);
      if (hasText) push('clipped-text', el, el.scrollWidth + '>' + el.clientWidth);
    }
  }

  /* Heading structure. */
  const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(isVisible);
  const h1s = heads.filter(h => h.tagName === 'H1');
  if (h1s.length !== 1) push('heading-count', h1s[0] || document.body, h1s.length + ' h1 elements');
  let prev = 0;
  for (const h of heads) {
    const n = Number(h.tagName[1]);
    if (prev && n > prev + 1) push('heading-skip', h, 'h' + prev + ' -> h' + n);
    prev = n;
  }

  /* Duplicate ids. */
  const seen = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    const id = el.id;
    if (!id) continue;
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) push('duplicate-id', document.getElementById(id), id + ' x' + n);

  /* Form labels. */
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!isVisible(el) || el.type === 'hidden') continue;
    const id = el.id;
    const labelled = (id && document.querySelector('label[for="' + id + '"]')) ||
      el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
      (el.closest('label'));
    if (!labelled) push('unlabelled-control', el, el.type || el.tagName);
  }

  /* Empty accessible names. */
  for (const el of document.querySelectorAll('button, a[href]')) {
    if (!isVisible(el)) continue;
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (!name) push('empty-control', el, el.getAttribute('href') || el.type || '');
  }

  /* Images without alt. */
  for (const img of document.querySelectorAll('img')) {
    if (!isVisible(img)) continue;
    if (!img.hasAttribute('alt')) push('img-no-alt', img, img.getAttribute('src') || '');
  }

  return {
    title: document.title,
    vw,
    vh,
    issues: ISSUES,
    docHeight: de.scrollHeight
  };
};

(async () => {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const findings = [];
  const consoleErrors = [];
  let done = 0;

  for (const file of files) {
    const url = urlOf(file);
    const page = await desktop.newPage();
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(url + ' :: ' + m.text()); });
    page.on('pageerror', e => consoleErrors.push(url + ' :: pageerror ' + String(e)));
    try {
      await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(120);
      const d = await page.evaluate(inPage);
      for (const issue of d.issues) findings.push({ page: url, mode: 'desktop', ...issue });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(60);
      const m = await page.evaluate(inPage);
      for (const issue of m.issues) findings.push({ page: url, mode: 'mobile', ...issue });
    } catch (err) {
      findings.push({ page: url, mode: 'load', type: 'load-error', detail: String(err.message || err) });
    }
    await page.close();
    done++;
    if (done % 25 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');
  await browser.close();

  const byType = {};
  for (const f of findings) (byType[f.type] = byType[f.type] || []).push(f);
  console.log('pages audited:', files.length);
  console.log('findings:', findings.length);
  console.log('console errors:', consoleErrors.length);
  for (const type of Object.keys(byType).sort((a, b) => byType[b].length - byType[a].length)) {
    const list = byType[type];
    console.log('\n== ' + type + ' (' + list.length + ') ==');
    const seen = new Set();
    let shown = 0;
    for (const f of list) {
      const key = type + '|' + f.sel + '|' + f.detail;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log('  [' + f.mode + '] ' + f.page + '  ' + f.sel + '  ' + f.detail + (f.text ? '  "' + f.text + '"' : ''));
      if (++shown >= 40) { console.log('  ... ' + (list.length - shown) + ' more'); break; }
    }
  }
  if (consoleErrors.length) {
    console.log('\n== console errors (' + consoleErrors.length + ') ==');
    for (const e of consoleErrors.slice(0, 30)) console.log('  ' + e);
  }

  fs.writeFileSync(path.join(__dirname, 'ux-findings.json'), JSON.stringify({ findings, consoleErrors }, null, 2));
  console.log('\nwrote scripts/audit/ux-findings.json');
})().catch(err => { console.error(err); process.exit(1); });
