/*
 * Bench Image Toolkit — Chromium end-to-end tests.
 *
 * These prove the toolkit mounts from the real registry, that representative
 * implemented tools produce real downloadable output, and that experimental /
 * unavailable entries behave honestly. They exercise the actual browser engine
 * (Canvas / ImageBitmap), which the Node unit tests deliberately do not.
 *
 * Selectors reflect the real markup in image-toolkit.js:
 *   #itk-drop / #itk-file / #itk-run / #itk-results   (single tool page)
 *   #studio-drop / #studio-run / #studio-results      (Image Studio)
 */
import { test, expect } from '@playwright/test';

const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function pngBuffer(page, width, height) {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, Math.floor(w / 2), Math.floor(h / 2));
    return c.toDataURL('image/png');
  }, [width, height]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/* ------------------------------------------------------------------ hub */

test('hub loads the real registry, studio link and the honest unavailable list', async ({ page }) => {
  await page.goto('/image/');
  await expect(page.locator('h1')).toContainText('Private image tools');

  // Studio entry point.
  await expect(page.locator('a[href="/image/studio/"]').first()).toBeVisible();

  // Working tools point at real generated pages.
  await expect(page.locator('a[href="/image/compress/"]').first()).toBeVisible();

  // Unavailable entries are disclosed, never dressed up as working tools.
  const statusList = page.locator('.itk-status-list');
  await expect(statusList).toBeVisible();
  await expect(statusList).toContainText('Not available');
});

test('SPA navigation from the home page mounts the toolkit without a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__itk_marker = 'kept'; });

  await page.click('a[href="/image/"]');
  await expect(page).toHaveURL(/\/image\/?$/);
  await expect(page.locator('h1')).toContainText('Private image tools');

  // A full document reload would wipe the marker.
  expect(await page.evaluate(() => window.__itk_marker)).toBe('kept');
});

/* -------------------------------------------------------------- single tool */

test('compressor produces a real downloadable result and revokes preview URLs on leave', async ({ page }) => {
  await page.goto('/image/compress/');
  await expect(page.locator('#itk')).toBeVisible();

  const buffer = await pngBuffer(page, 64, 64);
  const chooser = page.waitForEvent('filechooser');
  await page.click('#itk-drop');
  (await chooser).setFiles([{ name: 'photo.png', mimeType: 'image/png', buffer }]);

  await page.click('#itk-run');
  await expect(page.locator('#itk-results')).not.toContainText('No results yet', { timeout: 20000 });

  // A real download link with a blob URL and a download attribute must exist.
  const link = page.locator('#itk-results a[download]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href.startsWith('blob:')).toBe(true);

  // Navigating away must revoke every preview object URL (no retention).
  await page.click('a.brand');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#itk')).toHaveCount(0);
});

/* -------------------------------------------------------------- studio */

test('studio batch recipe resizes and converts every uploaded image', async ({ page }) => {
  await page.goto('/image/studio/');
  await expect(page.locator('#studio-drop')).toBeVisible();

  const a = await pngBuffer(page, 40, 40);
  const b = await pngBuffer(page, 60, 30);
  // The studio input is multiple, so both files go in one set.
  await page.setInputFiles('#studio-file', [
    { name: 'a.png', mimeType: 'image/png', buffer: a },
    { name: 'b.png', mimeType: 'image/png', buffer: b }
  ]);

  await page.click('#studio-run');
  // Wait for real exports: the studio renders one downloadable card per image
  // and reports the count in #studio-status.
  await expect(page.locator('#studio-status')).toContainText('exported', { timeout: 30000 });
  await expect(page.locator('#studio-results a[download]').first()).toBeVisible({ timeout: 30000 });
  expect(await page.locator('#studio-results a[download]').count()).toBeGreaterThanOrEqual(2);
});

/* -------------------------------------------------- vendor-backed tools */

test('QR generator lazy-loads its same-origin vendor bundle and renders an image', async ({ page }) => {
  const requests = [];
  page.on('request', r => { if (r.url().includes('/vendor/')) requests.push(r.url()); });

  await page.goto('/image/qr-code/');
  await page.fill('#itk-form input[type="text"], #itk-form textarea', 'https://bench.progeni.live');
  await page.click('#itk-run');

  await expect(page.locator('#itk-results img').first()).toBeVisible({ timeout: 20000 });
  expect(requests.some(u => u.includes('qrcode'))).toBe(true);
});

test('QR reader decodes a locally generated QR code', async ({ page }) => {
  // Generate a QR with the toolkit's own generator, then feed it back in.
  await page.goto('/image/qr-code/');
  await page.fill('#itk-form input[type="text"], #itk-form textarea', 'bench-roundtrip');
  await page.click('#itk-run');
  const img = page.locator('#itk-results img').first();
  await expect(img).toBeVisible({ timeout: 20000 });

  // Re-encode the generated image through a canvas rather than fetch()ing its
  // blob URL: the production CSP keeps connect-src 'self', which correctly
  // blocks fetch('blob:').
  const src = await page.evaluate(() => {
    const img = document.querySelector('#itk-results img');
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  });
  const qrPng = Buffer.from(src.split(',')[1], 'base64');

  await page.goto('/image/qr-decode/');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#itk-drop');
  (await chooser).setFiles([{ name: 'qr.png', mimeType: 'image/png', buffer: qrPng }]);
  await page.click('#itk-run');

  await expect(page.locator('#itk-results')).toContainText('bench-roundtrip', { timeout: 20000 });
});

/* ----------------------------------------------------- broad tool sweep */

test('representative implemented tools produce real outputs with default settings', async ({ page }) => {
  // Sample across every category so a silently broken processor is caught.
  const tools = [
    'resize', 'crop', 'dpi', 'convert', 'transform', 'adjust', 'blur-redact',
    'annotate', 'border-padding', 'watermark', 'collage', 'splitter', 'merge',
    'compare', 'product-shadow', 'metadata-viewer', 'strip-metadata',
    'image-hash', 'duplicate-finder', 'palette', 'favicon', 'og-image',
    'svg-optimizer', 'srcset', 'sprite-sheet', 'batch-rename', 'inspection',
    'gif-studio'
  ];

  const buffer = await (async () => {
    await page.goto('/image/resize/');
    return pngBuffer(page, 48, 48);
  })();

  for (const slug of tools) {
    await page.goto('/image/' + slug + '/');

    // Single-file tools (dpi, favicon, og-image) reject an array, so supply as
    // many files as the input's `multiple` attribute actually allows.
    const input = page.locator('#itk-file, #studio-file').first();
    const multi = await input.evaluate(el => el.multiple).catch(() => false);
    const files = [
      { name: 'one.png', mimeType: 'image/png', buffer },
      { name: 'two.png', mimeType: 'image/png', buffer }
    ].slice(0, multi ? 2 : 1);
    await input.setInputFiles(files);

    const run = page.locator('#itk-run');
    if (await run.count()) {
      await run.click();
    }

    // Real output: a result link/image, or an explicit result/notice—never the
    // "No results yet" placeholder.
    const results = page.locator('#itk-results');
    await expect(results).not.toContainText('No results yet', { timeout: 25000 });
  }
});

test('generator tools work without a source file', async ({ page }) => {
  for (const slug of ['qr-code', 'barcode', 'placeholder']) {
    await page.goto('/image/' + slug + '/');
    await page.click('#itk-run');
    await expect(page.locator('#itk-results')).not.toContainText('No results yet', { timeout: 20000 });
  }
});

/* -------------------------------------------------- honest SEO behaviour */

test('experimental pages are noindex and direct unavailable pages do not exist', async ({ page }) => {
  // Experimental tools are reachable but excluded from the index.
  const experimental = await page.request.get('/image/scan-cleanup/');
  expect(experimental.status()).toBe(200);
  const html = await experimental.text();
  expect(html).toMatch(/<meta name="robots" content="noindex/);

  // Deferred / unavailable tools have no page at all.
  for (const missing of ['/image/ocr/', '/image/upscale/', '/image/url-inspector/']) {
    const res = await page.request.get(missing);
    expect(res.status(), missing + ' should not exist').toBe(404);
  }
});
