const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  console.log('🚀 Starting Chrome live inspection in visible window...');
  
  const consoleErrors = [];
  const networkErrors = [];

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    slowMo: 700 // slow down operations so the user can watch live
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
      console.log(`❌ [Console Error @ ${page.url()}]:`, msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: err.message });
    console.log(`💥 [Page Error @ ${page.url()}]:`, err.message);
  });

  page.on('requestfailed', req => {
    networkErrors.push({ url: req.url(), error: req.failure() ? req.failure().errorText : 'failed' });
    console.log(`⚠️ [Network Failed]: ${req.url()} - ${req.failure() ? req.failure().errorText : 'failed'}`);
  });

  try {
    // 1. Home Page
    console.log('\n--- 1. Testing Home Page (https://bench.progeni.live/) ---');
    await page.goto('https://bench.progeni.live/', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());

    // Scroll down slowly
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);

    // Search for a tool
    console.log('Testing search input: "sticker"...');
    const searchInput = page.locator('#search');
    if (await searchInput.isVisible()) {
      await searchInput.fill('sticker');
      await page.waitForTimeout(1500);
      await searchInput.fill('csv');
      await page.waitForTimeout(1500);
      await searchInput.fill('');
      await page.waitForTimeout(1000);
    }

    // 2. CSV Date Normalizer
    console.log('\n--- 2. Testing CSV Date Normalizer (/tools/csv-date/) ---');
    await page.goto('https://bench.progeni.live/tools/csv-date/', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());
    const bodyText = await page.textContent('body');
    if (bodyText.includes('[object Object]')) {
      consoleErrors.push({ url: page.url(), text: 'Found [object Object] in rendered DOM' });
      console.log('❌ Found [object Object] in page body!');
    } else {
      console.log('✅ Key facts rendered clean, no [object Object] artifacts.');
    }
    await page.waitForTimeout(1500);

    // 3. PDF Translator Tool
    console.log('\n--- 3. Testing PDF Translator (/tools/pdf-translator/) ---');
    await page.goto('https://bench.progeni.live/tools/pdf-translator/', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());
    await page.waitForTimeout(1500);

    // 4. Image Toolkit Hub
    console.log('\n--- 4. Testing Image Toolkit Hub (/image/) ---');
    await page.goto('https://bench.progeni.live/image/', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
    await page.waitForTimeout(1500);

    // 5. Audio Toolkit Hub
    console.log('\n--- 5. Testing Audio Toolkit Hub (/audio/) ---');
    await page.goto('https://bench.progeni.live/audio/', { waitUntil: 'networkidle' });
    console.log('Title:', await page.title());
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
    await page.waitForTimeout(1500);

    // 6. About & Privacy pages
    console.log('\n--- 6. Testing About & Privacy Pages ---');
    await page.goto('https://bench.progeni.live/about/', { waitUntil: 'networkidle' });
    console.log('About Title:', await page.title());
    await page.waitForTimeout(1000);

    await page.goto('https://bench.progeni.live/privacy/', { waitUntil: 'networkidle' });
    console.log('Privacy Title:', await page.title());
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    console.log('\n--- Inspection Summary ---');
    console.log(`Console errors encountered: ${consoleErrors.length}`);
    console.log(`Network failures encountered: ${networkErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Errors:', JSON.stringify(consoleErrors, null, 2));
    }
    await browser.close();
    console.log('Browser closed cleanly.');
  }
})();

