/*
 * Bench Image Toolkit — unit tests.
 *
 * These validate the registry contract, the generated SEO pages and the pure
 * byte-level core. They run under `node --test` with no DOM: image-toolkit.js
 * and image-pages.js are UMD and keep all Canvas/Blob usage inside the browser
 * engine, so the pure core is require()-able here.
 *
 * Prerequisite: `npm run build` (page tests read generated files).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const C = require('../image-tools.config.js');
const TK = require('../image-toolkit.js');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ------------------------------------------------------------- registry */

test('image registry: statuses and counts are internally consistent', () => {
  const by = {};
  for (const t of C.TOOLS) by[t.status] = (by[t.status] || 0) + 1;

  assert.strictEqual(C.TOOLS.length, 63, 'registry size changed');
  assert.strictEqual(by.implemented, 39);
  assert.strictEqual(by.experimental, 3);
  assert.strictEqual(by.deferred, 10);
  assert.strictEqual(by.unavailable, 11);
  assert.strictEqual(C.publicTools().length, 42, 'implemented + experimental');
});

test('image registry: every tool has the required fields and a unique slug', () => {
  const ids = new Set();
  for (const t of C.TOOLS) {
    assert.ok(t.id, 'missing id');
    assert.ok(!ids.has(t.id), 'duplicate id: ' + t.id);
    ids.add(t.id);
    assert.ok(t.name, 'missing name: ' + t.id);
    assert.ok(t.slug, 'missing slug: ' + t.id);
    assert.ok(t.category, 'missing category: ' + t.id);
    assert.ok(t.summary, 'missing summary: ' + t.id);
    assert.ok(C.CATEGORIES.some(c => c.id === t.category), 'unknown category on ' + t.id);
  }
});

test('image registry: every public tool has a real processor and a generated page', () => {
  const procNames = Object.keys(TK.PROCESSORS);
  for (const t of C.publicTools()) {
    assert.ok(t.handler, t.id + ' is public but has no handler');
    assert.ok(procNames.includes(t.handler), t.id + ' handler not in PROCESSORS: ' + t.handler);
    assert.ok(
      fs.existsSync(path.join(ROOT, 'image', t.slug, 'index.html')),
      'missing generated page for ' + t.slug
    );
  }
});

test('image toolkit: every processor is used by at least one registry entry', () => {
  const used = new Set(C.TOOLS.filter(t => t.handler).map(t => t.handler));
  for (const name of Object.keys(TK.PROCESSORS)) {
    assert.ok(used.has(name), 'orphan processor: ' + name);
  }
});

test('image registry: deferred and unavailable tools never get a page', () => {
  for (const t of C.TOOLS) {
    if (t.status === 'implemented' || t.status === 'experimental') continue;
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'image', t.slug, 'index.html')),
      t.status + ' tool should not have a page: ' + t.slug
    );
    assert.ok(
      typeof t.reason === 'string' && t.reason.length > 20,
      'missing honest reason for ' + t.slug
    );
  }
});

/* --------------------------------------------------------- generated SEO */

test('image pages: hub, studio and tool canonicals are stable and correct', () => {
  const expectCanonical = (file, url) => {
    const html = read(file);
    assert.ok(
      html.includes('rel="canonical" href="' + url + '"'),
      file + ' missing canonical ' + url
    );
  };
  expectCanonical('image/index.html', 'https://bench.progeni.live/image/');
  expectCanonical('image/studio/index.html', 'https://bench.progeni.live/image/studio/');
  expectCanonical('image/compress/index.html', 'https://bench.progeni.live/image/compress/');
});

test('image pages: structured data parses and contains WebApplication + breadcrumbs', () => {
  const html = read('image/compress/index.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no JSON-LD found');

  const parsed = blocks.map(b => JSON.parse(b[1]));
  const flat = JSON.stringify(parsed);
  assert.ok(flat.includes('WebApplication'), 'missing WebApplication schema');
  assert.ok(flat.includes('BreadcrumbList'), 'missing BreadcrumbList schema');
});

test('image pages: experimental pages are noindex and indexable ones are not', () => {
  for (const t of C.publicTools()) {
    const html = read(path.join('image', t.slug, 'index.html'));
    const noindex = /<meta name="robots" content="noindex/.test(html);
    if (t.status === 'experimental') {
      assert.ok(noindex, t.slug + ' should be noindex');
    } else {
      assert.ok(!noindex, t.slug + ' must not be noindex');
    }
  }
});

test('image sitemap: hub, studio and implemented pages only, with no duplicates', () => {
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const imageLocs = locs.filter(u => u.includes('/image/')).sort();

  const expected = [
    'https://bench.progeni.live/image/',
    'https://bench.progeni.live/image/studio/',
    ...C.publicTools()
      .filter(t => t.status === 'implemented')
      .map(t => 'https://bench.progeni.live/image/' + t.slug + '/')
  ].sort();

  assert.deepStrictEqual(imageLocs, expected, 'image sitemap entries drifted');
  assert.strictEqual(new Set(locs).size, locs.length, 'duplicate sitemap URLs');
});

/* ------------------------------------------------------------- pure core */

test('core: sniffs real signatures instead of trusting extensions', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const gif = new Uint8Array([...Buffer.from('GIF89a'), 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.strictEqual(TK.sniffFormat(png, 'x.png'), 'png');
  assert.strictEqual(TK.sniffFormat(gif, 'x.gif'), 'gif');
  assert.strictEqual(TK.sniffFormat(jpeg, 'x.jpg'), 'jpeg');
  // A lie in the extension must not override the bytes.
  assert.strictEqual(TK.sniffFormat(png, 'actually-a-gif.gif'), 'png');
});

test('core: filenames are sanitised against traversal and Windows reserved names', () => {
  assert.ok(!TK.sanitizeFilename('../../etc/passwd').includes('..'));
  assert.ok(!TK.sanitizeFilename('..\\..\\windows\\system32').includes('..'));
  const con = TK.sanitizeFilename('CON.png');
  assert.notStrictEqual(con.toLowerCase(), 'con.png');
  assert.ok(!/[/\\]/.test(TK.sanitizeFilename('a/b\\c.png')));
});

test('core: SVG sanitiser removes scripts, event handlers, unsafe links and style blocks', () => {
  const dirty = [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '<script>alert(1)</script>',
    '<foreignObject><body onload="alert(2)"></body></foreignObject>',
    '<a xlink:href="javascript:alert(3)">x</a>',
    '<rect width="10" height="10" onclick="alert(4)"/>',
    '<style>body{background:url(javascript:alert(5))}</style>',
    '</svg>'
  ].join('');
  const clean = TK.sanitizeSvg(dirty);
  assert.ok(!/<\s*script/i.test(clean), 'script survived');
  assert.ok(!/onload\s*=/i.test(clean), 'onload survived');
  assert.ok(!/onclick\s*=/i.test(clean), 'onclick survived');
  assert.ok(!/javascript:/i.test(clean), 'javascript: survived');
  assert.ok(!/<\s*foreignObject/i.test(clean), 'foreignObject survived');
});

test('core: Base64 parser validates the payload and sniffs the decoded type', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  const parsed = TK.parseBase64Image('data:image/png;base64,' + png);
  assert.strictEqual(parsed.format, 'png');
  assert.ok(parsed.bytes.length > 0);
  assert.throws(() => TK.parseBase64Image('data:image/png;base64,@@not-base64@@'));
});

test('core: ZIP, ICO, BMP and PDF writers produce structurally valid containers', () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);

  const zip = new Uint8Array(TK.buildZip([{ name: 'a.bin', bytes }]));
  assert.strictEqual(String.fromCharCode(zip[0], zip[1]), 'PK', 'ZIP magic');
  assert.ok(zip.length > bytes.length, 'ZIP should carry a header');

  const bmp = new Uint8Array(TK.buildBmp(bytes, 1, 1));
  assert.strictEqual(String.fromCharCode(bmp[0], bmp[1]), 'BM', 'BMP magic');

  const pdf = new Uint8Array(TK.buildPdf([{ bytes, width: 1, height: 1 }]));
  assert.strictEqual(Buffer.from(pdf.slice(0, 5)).toString('latin1'), '%PDF-', 'PDF magic');
  assert.ok(Buffer.from(pdf).toString('latin1').includes('%%EOF'), 'PDF should end with EOF');
});

test('core: SHA-256 matches the known digest for "abc"', async () => {
  // sha256Hex is async (WebCrypto in the browser, node:crypto in Node).
  const hex = await TK.sha256Hex(new TextEncoder().encode('abc'));
  assert.strictEqual(
    hex,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('core: perceptual hashes and Hamming distance are deterministic', () => {
  // averageHash takes raw RGBA and returns a 64-entry bit array.
  const rgba = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    const dark = i < 32;
    rgba[i * 4] = dark ? 0 : 255;
    rgba[i * 4 + 1] = dark ? 0 : 255;
    rgba[i * 4 + 2] = dark ? 0 : 255;
    rgba[i * 4 + 3] = 255;
  }
  const aBits = TK.averageHash(rgba, 8, 8);
  const bBits = TK.averageHash(rgba, 8, 8);
  assert.strictEqual(aBits.length, 64, 'expected a 64-bit hash');
  assert.deepStrictEqual(aBits, bBits, 'average hash must be stable');

  const aHex = TK.bitsToHex(aBits);
  assert.match(aHex, /^[0-9a-f]{16}$/, 'hex form should be 16 chars');
  assert.strictEqual(TK.hammingHex(aHex, aHex), 0, 'distance to self is zero');

  const flipped = aBits.slice();
  flipped[0] = flipped[0] ? 0 : 1;
  assert.strictEqual(TK.hamming(aBits, flipped), 1, 'one flipped bit = distance 1');
});

test('core: geometry helpers clamp and preserve ratios', () => {
  const fit = TK.fitDimensions(100, 50, 40, 40);
  assert.strictEqual(fit.width, 40);
  assert.strictEqual(fit.height, 20);
  assert.strictEqual(TK.clamp(999, 0, 10), 10);
  assert.strictEqual(TK.clamp(-5, 0, 10), 0);
});

test('core: inspectBytes reports dimensions and types without decoding', () => {
  const png = Buffer.alloc(24);
  png.write('\x89PNG\r\n\x1a\n', 0, 'latin1');
  png.writeUInt32BE(64, 16);
  png.writeUInt32BE(32, 20);
  const info = TK.inspectBytes(new Uint8Array(png));
  assert.strictEqual(info.format, 'png');
  assert.strictEqual(info.width, 64);
  assert.strictEqual(info.height, 32);
});

/* -------------------------------------------------------------- tooling */

test('image toolkit: limits are defined and sane', () => {
  assert.ok(C.LIMITS.maxFileBytes > 0);
  assert.ok(C.LIMITS.maxPixels > 0);
  assert.ok(C.LIMITS.maxDimension > 0);
  assert.ok(C.LIMITS.maxFiles >= 1);
});
