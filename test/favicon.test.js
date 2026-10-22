const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Google Search does NOT support SVG favicons: it accepts BMP/GIF/ICO/PNG/
// JPEG/PPM/TIFF and wants a square that is a multiple of 48px. These tests
// guard the raster favicon pipeline so the search-result icon never regresses
// back to an SVG-only setup (which renders as a blank space in the SERP).

function readPngDims(file) {
  const buf = fs.readFileSync(file);
  assert.deepEqual(
    buf.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    `${file} is not a PNG`
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

test('raster favicons exist as square PNGs (48/96/192/512)', () => {
  for (const size of [48, 96, 192, 512]) {
    const file = path.join(ROOT, 'assets', `favicon-${size}.png`);
    assert.ok(fs.existsSync(file), `missing assets/favicon-${size}.png`);
    const { width, height, colorType } = readPngDims(file);
    assert.equal(width, size, `favicon-${size}.png width`);
    assert.equal(height, size, `favicon-${size}.png height`);
    // 6 = RGBA, so the rounded tile can have a transparent surround.
    assert.equal(colorType, 6, `favicon-${size}.png should be RGBA`);
  }
});

test('every generated page links a PNG/ICO favicon (not just SVG)', () => {
  const pages = [
    'index.html',
    '404.html',
    'about/index.html',
    'privacy/index.html',
    'terms/index.html',
    'contact/index.html',
    'tools/csv-splitter/index.html',
    'tools/sticker-sheet/index.html'
  ];
  for (const page of pages) {
    const file = path.join(ROOT, page);
    assert.ok(fs.existsSync(file), `missing ${page}`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<link rel="icon" href="\/favicon\.ico"/, `${page} lacks /favicon.ico link`);
    assert.match(
      html,
      /<link rel="icon" type="image\/png" sizes="48x48" href="\/assets\/favicon-48\.png">/,
      `${page} lacks the 48x48 PNG favicon link`
    );
  }
});

test('/favicon.ico is a valid ICO container with multiple entries', () => {
  const file = path.join(ROOT, 'favicon.ico');
  assert.ok(fs.existsSync(file), 'missing favicon.ico at site root');
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt16LE(0), 0, 'ICO reserved field');
  assert.equal(buf.readUInt16LE(2), 1, 'ICO type must be 1');
  const count = buf.readUInt16LE(4);
  assert.ok(count >= 2, `expected >=2 ICO entries, got ${count}`);
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32LE(6 + i * 16 + 12);
    assert.deepEqual(
      buf.subarray(off, off + 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      `ICO entry ${i} is not PNG-encoded`
    );
  }
});

test('web manifest declares PNG icons with maskable purpose', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const png192 = manifest.icons.find(i => i.src === '/assets/favicon-192.png');
  const maskable = manifest.icons.find(i => i.purpose === 'maskable');
  assert.ok(png192, 'manifest missing 192x192 PNG icon');
  assert.equal(png192.type, 'image/png');
  assert.ok(maskable, 'manifest missing a maskable icon');
});

test('robots.txt does not block the favicon assets', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:\s*\/favicon|\/assets\//);
});
