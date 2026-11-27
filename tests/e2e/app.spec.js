const { test, expect } = require('@playwright/test');

test('home catalog filters from search and fits a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#grid .tool-card')).toHaveCount(122);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);

  await page.locator('#search').fill('sticker');
  await expect(page.locator('#grid .tool-card:visible')).toHaveCount(1);
  await expect(page.locator('#grid .tool-card:visible h3')).toContainText('Sticker Sheet Maker');
});

test('tool page renders real key facts, not object strings', async ({ page }) => {
  await page.goto('/tools/csv-date/');
  const facts = page.locator('#quick-answer .key-facts');
  await expect(facts.locator('dt')).toHaveCount(5);
  await expect(facts.locator('dd').first()).toHaveText('Free · no account needed');
  await expect(page.locator('body')).not.toContainText('[object Object]');
});

test('CSV date normalizer honours the European ambiguity choice', async ({ page }) => {
  await page.goto('/tools/csv-date/');
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__download = blob; return create(blob); };
  });
  await page.locator('#file').setInputFiles({
    name: 'dates.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,id\n01/02/2024,1\n03/04/2024,2\n05/06/2024,3\n'),
  });
  await page.locator('#go').click();
  await expect(page.locator('#ambiguous-preview .ambiguity-row')).toHaveCount(3);
  await expect(page.locator('#ambiguous-preview .cs-ambiguity-row')).toHaveCount(3);
  await page.selectOption('#resolveAmbiguous', 'eu');
  await page.locator('#confirmAmbiguous').click();
  await page.locator('#dl').click();

  const csv = await page.evaluate(async () => window.__download ? await window.__download.text() : '');
  expect(csv).toContain('2024-02-01,1');
  expect(csv).toContain('2024-04-03,2');
  expect(csv).toContain('2024-06-05,3');
});

test('phone touch targets are at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const sizes = await page.locator(
    '.hero-tasks a, .toolkit-band-links a, .tool-breadcrumb a, .footer-links a, ' +
    '.search-box-input, .hamburger, .toolkit-tab, .catalog-clear, .recent-clear, .recent-item'
  ).evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(r => r.w > 0 && r.h > 0));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter(r => r.h < 44 || r.w < 44)).toEqual([]);
});

test('image toolkit keeps generated SEO copy after mounting', async ({ page }) => {
  await page.goto('/image/application-photo/');
  await expect(page.locator('#itk-form')).toBeAttached();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /target KB limit\. No upload\.$/);
  await expect(page.locator('.itk-seo h2', { hasText: 'Tool-specific detail' })).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('[object Object]');
  expect(text).not.toMatch(/[ÃÂ]/);
});

test('audio toolkit keeps generated SEO copy after mounting', async ({ page }) => {
  await page.goto('/audio/convert/');
  await expect(page.locator('#atk-form')).toBeAttached();
  await expect(page.locator('.itk-seo h2', { hasText: 'Tool-specific detail' })).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('[object Object]');
  expect(text).not.toMatch(/[ÃÂ]/);
});
