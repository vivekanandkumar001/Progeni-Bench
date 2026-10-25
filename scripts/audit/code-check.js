const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:3000/tools/family-organizer/', { waitUntil: 'networkidle' });
  const out = await p.evaluate(() => {
    return [...document.querySelectorAll('code')].map(el => ({
      text: el.textContent.trim().slice(0, 30),
      fs: getComputedStyle(el).fontSize,
      cls: el.className,
      parent: el.parentElement && (el.parentElement.className + ' <' + el.parentElement.tagName + '>'),
      html: el.outerHTML.slice(0, 120)
    }));
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
