const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = 'http://localhost:3000/tools/timetable-calendar/';
const DIR = path.join(os.tmpdir(), 'opencode', 'header-qa');
fs.mkdirSync(DIR, { recursive: true });
const CSV = path.join(DIR, 'timetable.csv');
fs.writeFileSync(CSV, [
  'day,date,start,end,title',
  'Monday,2026-11-30,09:00,10:30,Mathematics',
  'Tuesday,2026-12-01,11:00,12:00,Physics Lab',
  'Wednesday,2026-12-02,14:00,15:30,History',
  'Thursday,2026-12-03,10:00,11:00,English'
].join('\n'));

const snap = () => {
  const q = s => document.querySelector(s);
  const cs = s => (q(s) ? getComputedStyle(q(s)) : null);
  const box = s => {
    const el = q(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const empty = q('#tt-empty');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    headerH: Math.round(q('.topbar').getBoundingClientRect().height),
    workspace: !!q('.tt-workspace'),
    gridCols: cs('.tt-grid') && cs('.tt-grid').gridTemplateColumns.split(' ').length,
    input: box('.tt-input'),
    guide: box('.tt-guide'),
    steps: document.querySelectorAll('.cs-steps li').length,
    example: q('.tt-example code') && q('.tt-example code').textContent.trim(),
    emptyShown: !!(empty && getComputedStyle(empty).display !== 'none'),
    result: q('#result') ? {
      cls: q('#result').className,
      head: q('.tt-result-head h2') && q('.tt-result-head h2').textContent.trim(),
      chip: q('.tt-chip') && q('.tt-chip').textContent.trim(),
      summary: [...document.querySelectorAll('.tt-summary > div')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      rowCount: document.querySelectorAll('.tt-row').length,
      rows: [...document.querySelectorAll('.tt-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)),
      rule: q('.tt-rule') && q('.tt-rule').textContent.replace(/\s+/g, ' ').trim(),
      noEvents: !!q('.tt-no-events'),
      dl: !!q('#dl')
    } : null,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  const OUT = path.join(os.tmpdir(), 'opencode', 'header-qa');

  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.tt-workspace', { timeout: 15000 });
    const initial = await page.evaluate(snap);

    await page.setInputFiles('#file', CSV);
    await page.waitForSelector('.tt-result', { timeout: 15000 });
    const loaded = await page.evaluate(snap);

    let download = null;
    if (vp.name === 'desktop') {
      const wait = page.waitForEvent('download', { timeout: 15000 });
      await page.click('#dl');
      const dl = await wait;
      const p = await dl.path();
      const body = p ? fs.readFileSync(p, 'utf8') : '';
      download = {
        name: dl.suggestedFilename(),
        bytes: p ? fs.statSync(p).size : null,
        events: (body.match(/BEGIN:VEVENT/g) || []).length,
        rrules: (body.match(/RRULE:FREQ=WEEKLY;COUNT=16/g) || []).length,
        hasZeroMs: /\.000Z/.test(body),
        head: body.slice(0, 120)
      };
    }

    await page.setInputFiles('#file', CSV);
    await page.waitForTimeout(250);
    const reloaded = await page.evaluate(snap);

    await page.screenshot({ path: path.join(OUT, 'timetable-calendar-' + vp.name + '.png'), fullPage: false });
    results[vp.name] = {
      initial: { workspace: initial.workspace, gridCols: initial.gridCols, steps: initial.steps, example: initial.example, emptyShown: initial.emptyShown, overflow: initial.overflow },
      loaded: { emptyShown: loaded.emptyShown, head: loaded.result.head, chip: loaded.result.chip, summary: loaded.result.summary, rowCount: loaded.result.rowCount, rows: loaded.result.rows, rule: loaded.result.rule, dl: loaded.result.dl, overflow: loaded.overflow },
      download,
      reloaded: { emptyShown: reloaded.emptyShown, head: reloaded.result && reloaded.result.head },
      errors
    };
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
