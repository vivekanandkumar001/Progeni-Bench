const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../utils.js');
const seo = require('../scripts/seo.js');
const config = require('../site.config.js');

test('keyFactsHtml renders escaped dt/dd pairs instead of object strings', () => {
  const html = seo.keyFactsHtml([
    ['Cost', 'Free'],
    ['Runs', '<img src=x onerror=alert(1)>'],
    ['', 'ignored'],
  ]);
  assert.match(html, /<div><dt>Cost<\/dt><dd>Free<\/dd><\/div>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.doesNotMatch(html, /<dt><\/dt>/);
});

test('quickAnswerHtml reuses the same key-facts renderer', () => {
  const html = seo.quickAnswerHtml({
    title: 'At a glance',
    answerHtml: '<strong>Tool</strong> runs locally.',
    facts: seo.keyFacts([['Cost', 'Free']]),
  });
  assert.match(html, /<dl class="key-facts">\s*<div><dt>Cost<\/dt><dd>Free<\/dd><\/div>/);
});

test('tool registry text is clean UTF-8 with publishable meta descriptions', () => {
  assert.equal(config.TOOLS.length, 32);
  const blob = JSON.stringify(config.TOOLS);
  assert.doesNotMatch(blob, /Ã.|â€|Â°/, 'tool copy must not contain double-encoded text');
  for (const tool of config.TOOLS) {
    assert.ok(tool.seoDesc.length >= 120 && tool.seoDesc.length <= 155,
      `${tool.id} meta description length ${tool.seoDesc.length}`);
  }
});

test('tool metadata stays unique', () => {
  const titles = new Set(config.TOOLS.map(t => t.name));
  const descs = new Set(config.TOOLS.map(t => t.seoDesc));
  assert.equal(titles.size, config.TOOLS.length);
  assert.equal(descs.size, config.TOOLS.length);
});

test('CSV parsing keeps quoted commas and round-trips through csvOut', () => {
  const rows = utils.csvParse('name,note\n"Doe, Jane","said ""hi"""\n');
  assert.deepEqual(rows[1], ['Doe, Jane', 'said "hi"']);
  const out = utils.csvOut(rows);
  assert.match(out, /"Doe, Jane","said ""hi"""/);
});

test('normalizeDate formats numeric and ISO dates deterministically', () => {
  assert.equal(utils.normalizeDate('05/03/2024', 'YYYY-MM-DD'), '2024-05-03');
  assert.equal(utils.normalizeDate('2024-05-03', 'DD/MM/YYYY'), '03/05/2024');
  assert.equal(utils.normalizeDate('31/12/2024', 'MM/DD/YYYY'), '12/31/2024');
});

test('escaping strips executable HTML from user-provided text', () => {
  assert.equal(utils.esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
});
