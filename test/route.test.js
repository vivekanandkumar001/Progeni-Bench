const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const { TOOLS } = require(path.join(ROOT, 'site.config.js'));

// These tests assert invariants of the *shipped* app.js source rather than a
// re-implementation of its logic. The client router cannot be executed under
// node:test (it needs `document`), so we verify the route table and the known
// regression guards directly against the source text.

test('route() maps every tool id present in site.config.js', () => {
  for (const tool of TOOLS) {
    // Each tool must be reachable: either via a hard-coded id branch or an
    // id.startsWith group check in toolPage(). Verify the id appears in app.js.
    assert.ok(
      appSrc.includes(`"${tool.id}"`) || appSrc.includes(`'${tool.id}'`),
      `tool id "${tool.id}" is not referenced in app.js`
    );
  }
});

test('route() leaves server-rendered info pages untouched', () => {
  // Guard against the regression where /about, /privacy, /terms, /contact were
  // re-rendered client-side, wiping their static content.
  const routeBody = appSrc.slice(appSrc.indexOf('function route()'));
  assert.match(routeBody, /"\/about"/);
  assert.match(routeBody, /"\/privacy"/);
  assert.match(routeBody, /"\/terms"/);
  assert.match(routeBody, /"\/contact"/);
  assert.doesNotMatch(routeBody, /about\("(about|privacy|terms|contact)"\)/);
});

test('router handles tools and 404 without crashing', () => {
  const routeBody = appSrc.slice(appSrc.indexOf('function route()'));
  assert.match(routeBody, /p\.startsWith\("\/tools\/"\)/);
  assert.match(routeBody, /\/404\.html/);
});

test('studio engines are lazy-loaded before mount (SPA navigation from home)', () => {
  assert.match(appSrc, /function ensureStudios\(/);
  assert.match(appSrc, /const STUDIO_SCRIPTS = \{/);
  // Every mount call must be reachable only after ensureStudios resolves.
  const mountCount = (appSrc.match(/\.mount\(/g) || []).length;
  const ensureCount = (appSrc.match(/ensureStudios\(/g) || []).length;
  assert.ok(mountCount > 0, 'expected studio mount calls');
  // one ensureStudios definition + one call per mount group
  assert.ok(ensureCount >= 8, `expected >=8 ensureStudios usages, got ${ensureCount}`);
});

test('regression guards for previously broken tools', () => {
  // Bookmark Cleaner declares its `seen` set before use.
  assert.match(appSrc, /let dup = 0;\s*\n\s*const seen = new Set\(\);/);
  // CSV date ambiguity is wired to a real handler (no dangling global onclick).
  assert.doesNotMatch(appSrc, /onclick="confirmAmbiguous\(\)"/);
  assert.match(appSrc, /confirmAmbiguous/);
  // vCard dead handlers removed.
  assert.doesNotMatch(appSrc, /onclick="selectContact\(/);
  assert.doesNotMatch(appSrc, /onclick="mergeContact\(/);
  assert.doesNotMatch(appSrc, /onclick="keepContact\(/);
  // Async tool handlers are awaited so rejections are surfaced.
  assert.match(appSrc, /await vcardTool\(/);
  assert.match(appSrc, /await panorama\(/);
});

test('duplicate home() definition is gone', () => {
  const matches = appSrc.match(/function home\(/g) || [];
  assert.equal(matches.length, 1, `expected a single home() definition, found ${matches.length}`);
});
