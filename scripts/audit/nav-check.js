const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const before = await p.evaluate(() => {
    const nav = document.querySelector('nav');
    const h = document.getElementById('hamburger');
    return { navDisplay: getComputedStyle(nav).display, expanded: h.getAttribute('aria-expanded'), rects: [...nav.querySelectorAll('a')].map(a => ({ t: a.textContent, ...a.getBoundingClientRect().toJSON() })) };
  });
  await p.click('#hamburger');
  await p.waitForTimeout(150);
  const open = await p.evaluate(() => {
    const nav = document.querySelector('nav');
    const h = document.getElementById('hamburger');
    return { display: getComputedStyle(nav).display, expanded: h.getAttribute('aria-expanded'), rects: [...nav.querySelectorAll('a')].map(a => ({ t: a.textContent, w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) })) };
  });
  await p.click('nav a[href="/audio/"]');
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ url: location.pathname, open: document.querySelector('nav').classList.contains('open'), expanded: document.getElementById('hamburger').getAttribute('aria-expanded') }));
  console.log(JSON.stringify({ before, open, after }, null, 2));
  await b.close();
})();
