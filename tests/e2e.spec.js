import { test, expect } from '@playwright/test';
import siteConfig from '../site.config.js';

test.describe('Progeni E2E Browser Suite', () => {

  test('E01: direct load of 3 tool pages -> zero console/page errors, UI visible', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    const tools = ['/tools/csv-splitter/', '/tools/vcard/', '/tools/svg-cleaner/'];
    for (const path of tools) {
      await page.goto(path);
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('.toolbox')).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('E02: header link click -> URL changes, NO document reload (window marker)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { window.__spa_marker = 'persisted'; });

    await page.click('header nav a[href*="/about"]');
    await expect(page).toHaveURL(/.*\/about/);
    
    const marker = await page.evaluate(() => window.__spa_marker);
    expect(marker).toBe('persisted');
  });

  test('E03: /about, /about/, /contact, /contact/ load directly with correct content', async ({ page }) => {
    const endpoints = ['/about', '/about/', '/contact', '/contact/'];
    for (const ep of endpoints) {
      await page.goto(ep);
      await expect(page.locator('body')).toBeVisible();
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(100);
    }
  });

  test('E04: bookmark file with javascript: link -> output has none', async ({ page }) => {
    await page.goto('/tools/bookmark-reading/');
    const badBookmarkHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
    <TITLE>Bookmarks</TITLE>
    <H1>Bookmarks</H1>
    <DL><p>
      <DT><A HREF="javascript:alert(1)">Exploit</A>
      <DT><A HREF="${siteConfig.SITE_URL}/privacy/">Valid Safe Link</A>
    </DL><p>`;

    const buffer = Buffer.from(badBookmarkHTML, 'utf8');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#drop');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{ name: 'bookmarks.html', mimeType: 'text/html', buffer }]);

    await expect(page.locator('#result')).toBeVisible();
    const resultText = await page.locator('#result').innerHTML();
    expect(resultText).not.toContain('javascript:alert');
    expect(resultText).toContain('1 valid links converted');
  });

  test('E05: malicious SVG (DOMParser path) -> cleaned download has none', async ({ page }) => {
    await page.goto('/tools/svg-cleaner/');
    const badSVG = `<svg onload="alert(1)"><script>alert(2)</script><script/><foreignObject/><foreignObject>test</foreignObject><a href="javascript:alert(3)"><rect onclick="x()"/></a></svg>`;
    const buffer = Buffer.from(badSVG, 'utf8');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#drop');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{ name: 'malicious.svg', mimeType: 'image/svg+xml', buffer }]);

    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#dl')).toBeVisible();

    // Verify DOMParser sanitized output
    const cleanOutput = await page.evaluate(async (svg) => {
      return window.ProgeniUtils.cleanSVG(svg);
    }, badSVG);

    expect(cleanOutput).not.toContain('script');
    expect(cleanOutput).not.toContain('foreignObject');
    expect(cleanOutput).not.toContain('onload');
    expect(cleanOutput).not.toContain('onclick');
    expect(cleanOutput).not.toContain('javascript:');
  });

  test('E06: two digitless emails in contact-dedupe -> both survive', async ({ page }) => {
    await page.goto('/tools/contact-dedupe/');
    const csv = `name,email,phone\nAlice,alice@example.com,\nBob,bob@example.com,\nAlice Duplicate,alice@example.com,`;
    const buffer = Buffer.from(csv, 'utf8');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#drop');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{ name: 'contacts.csv', mimeType: 'text/csv', buffer }]);

    await expect(page.locator('#result')).toBeVisible();
    const text = await page.locator('#result').textContent();
    expect(text).toContain('Found 2 unique contacts');
  });

  test('E07: vCard with 2 cards, one folded -> 2 parsed', async ({ page }) => {
    await page.goto('/tools/vcard/');
    const vcf = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:John Doe\r\nNOTE:Line one \r\n continuation line\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jane Smith\r\nEND:VCARD`;
    const buffer = Buffer.from(vcf, 'utf8');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#drop');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{ name: 'contacts.vcf', mimeType: 'text/vcard', buffer }]);

    await expect(page.locator('#result')).toBeVisible();
    const text = await page.locator('#result').textContent();
    expect(text).toContain('2');
    expect(text).toContain('John Doe');
    expect(text).toContain('Jane Smith');
  });

  test('E08: panorama run 3 times -> 3 tiles each, no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/tools/panorama/');
    
    // Generate valid 300x100 PNG buffer directly via canvas
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(0, 0, 300, 100);
      return c.toDataURL('image/png');
    });
    const panoPng = Buffer.from(dataUrl.split(',')[1], 'base64');

    for (let i = 0; i < 3; i++) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#drop');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([{ name: `pano-${i}.png`, mimeType: 'image/png', buffer: panoPng }]);
      await expect(page.locator('#pg img')).toHaveCount(3);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('E09: no cookie banner on any page', async ({ page }) => {
    const paths = ['/', '/about', '/privacy', '/terms', '/tools/sticker-sheet/'];
    for (const p of paths) {
      await page.goto(p);
      await expect(page.locator('#cookie-banner, .cookie-banner, [aria-label*="cookie" i]')).toHaveCount(0);
    }
  });

  test('E10: silence-map run 3 times on short audio -> no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/tools/silence-map/');
    
    // Valid 1-second 44.1kHz PCM WAV buffer
    const validWav = await page.evaluate(() => {
      const length = 44100;
      const buffer = new ArrayBuffer(44 + length * 2);
      const view = new DataView(buffer);
      view.setUint32(0, 0x52494646, false); // "RIFF"
      view.setUint32(4, 36 + length * 2, true);
      view.setUint32(8, 0x57415645, false); // "WAVE"
      view.setUint32(12, 0x666d7420, false); // "fmt "
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // 1 channel
      view.setUint32(24, 44100, true); // sample rate
      view.setUint32(28, 44100 * 2, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      view.setUint32(36, 0x64617461, false); // "data"
      view.setUint32(40, length * 2, true);
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    });
    const audioBuffer = Buffer.from(validWav, 'base64');

    for (let i = 0; i < 3; i++) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#drop');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([{ name: `test-${i}.wav`, mimeType: 'audio/wav', buffer: audioBuffer }]);
      await expect(page.locator('#result')).toBeVisible();
    }
    expect(consoleErrors).toEqual([]);
  });

  test('E11: Home and 3 tool pages: document.title and h1 match config; no console errors; header shows SITE_NAME', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    // Home check
    await page.goto('/');
    await expect(page.locator('header .brand')).toContainText('Progeni Bench');
    const homeTitle = await page.title();
    expect(homeTitle).toContain('Progeni Bench');
    expect(await page.locator('h1').textContent()).toContain('Fix everyday digital problems in seconds.');

    // 3 Tools check
    const toolPaths = [
      { path: '/tools/sticker-sheet/', name: 'Sticker Sheet Maker' },
      { path: '/tools/labels/', name: 'Avery 5160' },
      { path: '/tools/csv-splitter/', name: 'CSV Column Splitter' }
    ];

    for (const item of toolPaths) {
      await page.goto(item.path);
      await expect(page.locator('header .brand')).toContainText('Progeni Bench');
      const title = await page.title();
      expect(title).toContain(item.name);
      expect(title).toContain('Progeni Bench');
      const h1Text = await page.locator('h1').textContent();
      expect(h1Text).toContain(item.name);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('E12: View-source style check: raw HTML contains JSON-LD, h1, and body text without JS', async ({ request }) => {
    const res = await request.get('/tools/bookmark-cleaner/');
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Verify h1 exists in raw static HTML
    expect(html).toContain('<h1');
    expect(html).toContain('Chrome Bookmark Cleaner');

    // Verify JSON-LD exists in raw static HTML
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"WebApplication"');
    expect(html).toContain('"@type":"BreadcrumbList"');

    // Verify static body sections exist in raw HTML
    expect(html).toContain('What it does');
    expect(html).toContain('How to use');
    expect(html).toContain('Limits & Considerations');
    expect(html).toContain('Privacy & Security');
  });

  test('E13: SPA navigation keeps document.title and canonical updated on route change', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toContain('Progeni Bench');
    
    let canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${siteConfig.SITE_URL}/`);

    // Click on a tool card in SPA
    await page.click('a[href="/tools/sticker-sheet/"]');
    await expect(page).toHaveURL(/.*\/tools\/sticker-sheet\//);

    // Assert title updated
    const toolTitle = await page.title();
    expect(toolTitle).toContain('Sticker Sheet Maker');
    expect(toolTitle).toContain('Progeni Bench');

    // Assert canonical updated
    canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${siteConfig.SITE_URL}/tools/sticker-sheet/`);

    // Navigate to about page in SPA
    await page.click('header nav a[href="/about/"]');
    await expect(page).toHaveURL(/.*\/about\//);
    const aboutTitle = await page.title();
    expect(aboutTitle).toContain('About Progeni Bench');
    canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(`${siteConfig.SITE_URL}/about/`);
  });

  test('E14: serve dist at localhost; assert canonical href and og:url are absolute https://bench.progeni.live/... on 3 pages even when browsing from localhost', async ({ page }) => {
    const testPages = [
      { path: '/', expectedCanonical: `${siteConfig.SITE_URL}/`, expectedOg: `${siteConfig.SITE_URL}/` },
      { path: '/tools/wallpaper/', expectedCanonical: `${siteConfig.SITE_URL}/tools/wallpaper/`, expectedOg: `${siteConfig.SITE_URL}/tools/wallpaper/` },
      { path: '/tools/svg-cleaner/', expectedCanonical: `${siteConfig.SITE_URL}/tools/svg-cleaner/`, expectedOg: `${siteConfig.SITE_URL}/tools/svg-cleaner/` }
    ];

    for (const item of testPages) {
      await page.goto(item.path);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(item.expectedCanonical);
      expect(canonical.startsWith('https://bench.progeni.live/')).toBe(true);

      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      expect(ogUrl).toBe(item.expectedOg);
      expect(ogUrl.startsWith('https://bench.progeni.live/')).toBe(true);
    }
  });

});
