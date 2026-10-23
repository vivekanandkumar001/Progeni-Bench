/*
 * Bench Audio Toolkit - unit tests.
 *
 * These validate the registry contract, the runtime's pure helpers, the
 * generated SEO pages and the honest status vocabulary. They run under
 * `node --test` with no DOM: audio-toolkit.js is UMD and keeps AudioContext,
 * MediaRecorder and FFmpeg inside browser-only paths, so the pure signal
 * processing is require()-able here.
 *
 * Prerequisite: `npm run build` (the page tests read generated files).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const C = require('../audio-tools.config.js');
const TK = require('../audio-toolkit.js');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ------------------------------------------------------------- registry */

test('audio registry: statuses and counts are internally consistent', () => {
  const by = {};
  for (const t of C.TOOLS) by[t.status] = (by[t.status] || 0) + 1;

  assert.strictEqual(C.TOOLS.length, 56, 'registry size changed');
  assert.strictEqual(by.implemented, 43);
  assert.strictEqual(by.experimental, 5);
  assert.strictEqual(by.deferred, 6);
  assert.strictEqual(by.unavailable, 2);
  assert.strictEqual(C.publicTools().length, 48, 'implemented + experimental');
});

test('audio registry: every tool has the required fields and a unique id/slug', () => {
  const ids = new Set();
  const slugs = new Set();
  for (const t of C.TOOLS) {
    assert.ok(t.id, 'missing id');
    assert.ok(!ids.has(t.id), 'duplicate id: ' + t.id);
    ids.add(t.id);
    assert.ok(t.name, 'missing name: ' + t.id);
    assert.ok(t.slug, 'missing slug: ' + t.id);
    assert.ok(!slugs.has(t.slug), 'duplicate slug: ' + t.slug);
    slugs.add(t.slug);
    assert.ok(t.category, 'missing category: ' + t.id);
    assert.ok(C.CATEGORIES.some(c => c.id === t.category), 'unknown category on ' + t.id);
    assert.ok(t.summary, 'missing summary: ' + t.id);
    assert.match(t.slug, /^[a-z0-9-]+$/, 'slug must be URL-safe: ' + t.slug);
  }
});

test('audio registry: every public tool declares a real engine', () => {
  const engines = new Set(['ffmpeg', 'web-audio', 'media-recorder']);
  for (const t of C.publicTools()) {
    assert.ok(engines.has(t.engine), `${t.id} has unknown engine ${t.engine}`);
  }
});

test('audio registry: non-public tools are documented honestly, not hidden', () => {
  const notPublic = C.TOOLS.filter(t => t.status !== 'implemented' && t.status !== 'experimental');
  assert.strictEqual(notPublic.length, 8);
  for (const t of notPublic) {
    assert.ok(['deferred', 'unavailable', 'blocked'].includes(t.status), t.id);
    assert.ok(t.reason && t.reason.length > 20, `${t.id} needs a real reason`);
  }
});

/* ------------------------------------------------------- runtime contract */

test('audio runtime: exposes the documented mount/unmount contract', () => {
  assert.strictEqual(typeof TK.mountTool, 'function');
  assert.strictEqual(typeof TK.mountHub, 'function');
  assert.strictEqual(typeof TK.mountStudio, 'function');
  assert.strictEqual(typeof TK.mountNotFound, 'function');
  assert.strictEqual(typeof TK.unmount, 'function');
  assert.strictEqual(typeof TK.cleanup, 'function');
  assert.ok(TK.PROCESSORS && typeof TK.PROCESSORS === 'object');
  assert.ok(TK.LIMITS && typeof TK.LIMITS === 'object');
});

test('audio runtime: every public handler exists and there are no orphans', () => {
  const publicHandlers = new Set(C.publicTools().map(t => t.handler));
  const implemented = Object.keys(TK.PROCESSORS);

  for (const h of publicHandlers) {
    assert.strictEqual(typeof TK.PROCESSORS[h], 'function', `missing processor for handler "${h}"`);
  }
  for (const h of implemented) {
    assert.ok(
      C.TOOLS.some(t => t.handler === h),
      `processor "${h}" is not referenced by any registry tool`
    );
  }
  assert.strictEqual(implemented.length, publicHandlers.size);
});

test('audio runtime: processor errors are real Errors, never silent no-ops', () => {
  for (const [id, fn] of Object.entries(TK.PROCESSORS)) {
    assert.strictEqual(typeof fn, 'function', id);
  }
});

/* ----------------------------------------------------------- WAV encoder */

async function wavBytes(channels, sampleRate, opts) {
  const blob = TK.encodeWav(channels, sampleRate, opts);
  assert.ok(blob instanceof Blob, 'encodeWav must return a Blob');
  return Buffer.from(await blob.arrayBuffer());
}

function riffInfo(buf) {
  return {
    riff: buf.toString('ascii', 0, 4),
    wave: buf.toString('ascii', 8, 12),
    fmt: buf.toString('ascii', 12, 16),
    audioFormat: buf.readUInt16LE(20),
    channels: buf.readUInt16LE(22),
    sampleRate: buf.readUInt32LE(24),
    byteRate: buf.readUInt32LE(28),
    blockAlign: buf.readUInt16LE(32),
    bits: buf.readUInt16LE(34),
    data: buf.toString('ascii', 36, 40),
    dataBytes: buf.readUInt32LE(40),
    total: buf.length,
    buf
  };
}

test('encodeWav: writes a valid 16-bit PCM header and payload', async () => {
  const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const info = riffInfo(await wavBytes([left], 44100, { bits: 16 }));

  assert.strictEqual(info.riff, 'RIFF');
  assert.strictEqual(info.wave, 'WAVE');
  assert.strictEqual(info.fmt, 'fmt ');
  assert.strictEqual(info.data, 'data');
  assert.strictEqual(info.audioFormat, 1, '16-bit must be PCM (1)');
  assert.strictEqual(info.channels, 1);
  assert.strictEqual(info.sampleRate, 44100);
  assert.strictEqual(info.bits, 16);
  assert.strictEqual(info.blockAlign, 2);
  assert.strictEqual(info.byteRate, 44100 * 2);
  assert.strictEqual(info.dataBytes, 5 * 2);
  assert.strictEqual(info.total, 44 + 10);
});

test('encodeWav: interleaves stereo samples in order', async () => {
  const L = new Float32Array([0.25, 0.5]);
  const R = new Float32Array([-0.25, -0.5]);
  const info = riffInfo(await wavBytes([L, R], 8000, { bits: 16 }));

  assert.strictEqual(info.channels, 2);
  assert.strictEqual(info.blockAlign, 4);
  assert.strictEqual(info.dataBytes, 8);

  const s0 = info.buf.readInt16LE(44) / 32767;
  const s1 = info.buf.readInt16LE(46) / 32767;
  const s2 = info.buf.readInt16LE(48) / 32767;
  const s3 = info.buf.readInt16LE(50) / 32767;
  assert.ok(Math.abs(s0 - 0.25) < 0.001, 'L0');
  assert.ok(Math.abs(s1 + 0.25) < 0.001, 'R0');
  assert.ok(Math.abs(s2 - 0.5) < 0.001, 'L1');
  assert.ok(Math.abs(s3 + 0.5) < 0.001, 'R1');
});

test('encodeWav: 32-bit output is IEEE float (format code 3)', async () => {
  const info = riffInfo(await wavBytes([new Float32Array([0.1, -0.1])], 48000, { bits: 32 }));
  assert.strictEqual(info.audioFormat, 3, '32-bit must be IEEE float (3)');
  assert.strictEqual(info.bits, 32);
  assert.strictEqual(info.blockAlign, 4);
  assert.ok(Math.abs(info.buf.readFloatLE(44) - 0.1) < 1e-6);
});

test('encodeWav: clamps samples outside [-1, 1] instead of wrapping', async () => {
  const info = riffInfo(await wavBytes([new Float32Array([4, -4])], 8000, { bits: 16 }));
  assert.strictEqual(info.buf.readInt16LE(44), 32767);
  assert.strictEqual(info.buf.readInt16LE(46), -32767);
});

test('encodeWav: empty input still produces a decodable 44-byte header', async () => {
  const info = riffInfo(await wavBytes([new Float32Array(0)], 8000, { bits: 16 }));
  assert.strictEqual(info.total, 44);
  assert.strictEqual(info.dataBytes, 0);
  assert.strictEqual(info.buf.readUInt32LE(4), 36, 'RIFF chunk size');
});

/* ------------------------------------------------------------ DSP helpers */

test('combineChannels: left, right, mono average and max modes', () => {
  const L = new Float32Array([0.2, -0.4, 0.9]);
  const R = new Float32Array([-0.2, 0.4, 0.1]);
  const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

  const left = TK.combineChannels([L, R], 'left');
  close(left[0], 0.2, 'L0');
  close(left[1], -0.4, 'L1');
  close(left[2], 0.9, 'L2');

  const right = TK.combineChannels([L, R], 'right');
  close(right[0], -0.2, 'R0');
  close(right[1], 0.4, 'R1');
  close(right[2], 0.1, 'R2');

  const mono = TK.combineChannels([L, R], 'mono');
  assert.strictEqual(mono.length, 3);
  close(mono[0], 0, 'average of 0.2 and -0.2');
  close(mono[2], 0.5, 'average of 0.9 and 0.1');

  const max = TK.combineChannels([L, R], 'max');
  close(max[2], 0.9, 'picks the largest magnitude');

  assert.strictEqual(TK.combineChannels([], 'mono').length, 0);
  assert.strictEqual(TK.combineChannels([L], 'right').length, 3, 'falls back to the only channel');
});

test('peakEnvelope: returns the requested bucket count with real min/max', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0, 0, 0]);
  const env = TK.peakEnvelope(samples, 4);
  assert.strictEqual(env.length, 4);
  assert.strictEqual(env[0].min, 0);
  assert.strictEqual(env[0].max, 0.5);
  assert.strictEqual(env[1].min, -0.5);
  assert.strictEqual(env[1].max, 1);
  assert.strictEqual(TK.peakEnvelope(samples, 0).length, 0);
  assert.strictEqual(TK.peakEnvelope(new Float32Array(0), 4).length, 0);
});

test('scanWindows: RMS and mean-absolute methods agree on digital silence', () => {
  const silent = new Float32Array(1000);
  const rms = TK.scanWindows(silent, { windowSize: 100, threshold: 0.01, method: 'rms' });
  const ma = TK.scanWindows(silent, { windowSize: 100, threshold: 0.01, method: 'ma' });
  assert.strictEqual(rms.length, 10);
  assert.strictEqual(ma.length, 10);
  assert.ok(rms.every(f => f === 1), 'all windows silent (rms)');
  assert.ok(ma.every(f => f === 1), 'all windows silent (ma)');
});

test('scanWindows: loud windows are flagged as non-silent', () => {
  const loud = new Float32Array(400).fill(0.5);
  const flags = TK.scanWindows(loud, { windowSize: 100, threshold: 0.01, method: 'rms' });
  assert.ok(flags.every(f => f === 0));
});

test('flagsToGaps: merges runs into gaps and honours the minimum length', () => {
  const flags = [0, 1, 1, 1, 0, 1, 0, 0, 1, 1];
  const gaps = TK.flagsToGaps(flags, 0.5, 1.0);
  assert.strictEqual(gaps.length, 2, 'only runs of at least 2 windows at 0.5s survive');
  assert.deepStrictEqual(gaps[0], { start: 0.5, end: 2, duration: 1.5 });
  assert.deepStrictEqual(gaps[1], { start: 4, end: 5, duration: 1 });
});

test('analyseLevels: reports peak, RMS, clipping and frame count', () => {
  const ch = [new Float32Array([1, -1, 0.5, -0.5])];
  const lv = TK.analyseLevels(ch, 0, 4);
  assert.strictEqual(lv.peak, 1);
  assert.strictEqual(lv.peakDbfs, 0);
  assert.strictEqual(lv.clipped, 2, 'samples at full scale count as clipped');
  assert.strictEqual(lv.frames, 4);
  assert.ok(Math.abs(lv.rms - Math.sqrt((1 + 1 + 0.25 + 0.25) / 4)) < 1e-6);
});

test('analyseLevels: a sub-range only measures that range', () => {
  const ch = [new Float32Array([0.1, 0.2, 0.9, 0.1])];
  const lv = TK.analyseLevels(ch, 2, 3);
  assert.strictEqual(lv.frames, 1);
  assert.ok(Math.abs(lv.peak - 0.9) < 1e-6);
});

/* -------------------------------------------------------------- utilities */

test('parseTime: accepts seconds, mm:ss and hh:mm:ss', () => {
  assert.strictEqual(TK.parseTime('30'), 30);
  assert.strictEqual(TK.parseTime('1:30'), 90);
  assert.strictEqual(TK.parseTime('01:02:03'), 3723);
  assert.strictEqual(TK.parseTime('0:05.5'), 5.5);
  assert.strictEqual(TK.parseTime(''), null);
  assert.strictEqual(TK.parseTime('   '), null);
});

test('ampToDbfs / dbfsToAmp: correct at reference points and round-trip', () => {
  assert.strictEqual(TK.ampToDbfs(0), -Infinity);
  assert.strictEqual(TK.ampToDbfs(1), 0);
  assert.ok(Math.abs(TK.ampToDbfs(0.5) - -6.0206) < 0.001);
  assert.strictEqual(TK.dbfsToAmp(-Infinity), 0);
  assert.strictEqual(TK.dbfsToAmp(0), 1);
  assert.ok(Math.abs(TK.dbfsToAmp(-6.0206) - 0.5) < 0.001);
});

test('formatTime, formatBytes and safeName behave predictably', () => {
  assert.strictEqual(TK.formatTime(0), '0:00.00');
  assert.strictEqual(TK.formatTime(61.5), '1:01.50');
  assert.strictEqual(TK.formatBytes(512), '512 B');
  assert.strictEqual(TK.formatBytes(2048), '2.0 KB');
  assert.strictEqual(TK.formatBytes(5 * 1024 * 1024), '5.00 MB');
  assert.strictEqual(TK.safeName('My Song.mp3', 'wav'), 'My Song.wav');
  assert.strictEqual(TK.safeName('bad/name<>?.wav', 'mp3'), 'bad_name_.mp3');
  assert.strictEqual(TK.safeName('', 'wav'), 'audio.wav');
});

test('clamp, num and r3 never leak NaN into results', () => {
  assert.strictEqual(TK.clamp(5, 0, 1), 1);
  assert.strictEqual(TK.clamp(-5, 0, 1), 0);
  assert.strictEqual(TK.num('nope', 7), 7);
  assert.strictEqual(TK.num('3.5', 0), 3.5);
  assert.strictEqual(TK.r3(1.23456), 1.235);
  assert.strictEqual(TK.r3('bad'), 0);
});

test('assertFileSize: rejects oversized files with a readable message', () => {
  assert.doesNotThrow(() => TK.assertFileSize({ size: 10 }));
  assert.throws(
    () => TK.assertFileSize({ size: TK.LIMITS.maxFileBytes + 1 }),
    /over the/
  );
});

/* ------------------------------------------------------- generated pages */

const AUDIO_PAGES = [];
(function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name === 'index.html') AUDIO_PAGES.push(full);
  }
})(path.join(ROOT, 'audio'));

test('generated pages: hub plus every public tool has a page', () => {
  assert.ok(exists('audio/index.html'), 'missing audio hub');
  for (const t of C.publicTools()) {
    assert.ok(exists(path.join('audio', t.slug, 'index.html')), 'missing page for ' + t.slug);
  }
  assert.strictEqual(AUDIO_PAGES.length, C.publicTools().length + 1);
});

test('generated pages: no page exists for deferred or unavailable tools', () => {
  for (const t of C.TOOLS) {
    if (t.status === 'implemented' || t.status === 'experimental') continue;
    assert.ok(!exists(path.join('audio', t.slug, 'index.html')), 'should not exist: ' + t.slug);
  }
});

test('generated pages: SEO constraints hold for every audio page', () => {
  const titles = new Map();
  const descs = new Map();
  for (const file of AUDIO_PAGES) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');

    const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    assert.ok(title, `${rel}: missing title`);
    assert.ok(title.length <= 60, `${rel}: title is ${title.length} chars`);
    assert.ok(!titles.has(title), `${rel}: duplicate title with ${titles.get(title)}`);
    titles.set(title, rel);

    const desc = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] || '';
    assert.ok(desc, `${rel}: missing description`);
    assert.ok(desc.length >= 120 && desc.length <= 155, `${rel}: description is ${desc.length} chars`);
    assert.ok(!descs.has(desc), `${rel}: duplicate description with ${descs.get(desc)}`);
    descs.set(desc, rel);

    assert.strictEqual((html.match(/<h1[^>]*>/gi) || []).length, 1, `${rel}: needs exactly one h1`);
    assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/bench\.progeni\.live\/audio\//, `${rel}: canonical`);
    assert.match(html, /<html\s+[^>]*lang="en-IN"/i, `${rel}: lang`);
    assert.match(html, /og:title/, `${rel}: og:title`);
    assert.match(html, /og:description/, `${rel}: og:description`);
    assert.match(html, /og:image/, `${rel}: og:image`);
  }
});

test('generated pages: JSON-LD parses and carries no fake ratings', () => {
  for (const file of AUDIO_PAGES) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    const block = html.match(/<script type="application\/ld\+json" id="schema">([\s\S]*?)<\/script>/);
    assert.ok(block, `${rel}: missing JSON-LD`);
    assert.doesNotThrow(() => JSON.parse(block[1]), `${rel}: invalid JSON-LD`);
    assert.ok(!/AggregateRating|"Review"/.test(block[1]), `${rel}: prohibited review schema`);
  }
});

test('generated pages: experimental tools are noindex and excluded from the sitemap', () => {
  const sitemap = read('sitemap.xml');
  const experimental = C.publicTools().filter(t => t.status === 'experimental');
  const implemented = C.publicTools().filter(t => t.status === 'implemented');

  assert.ok(experimental.length > 0, 'expected some experimental tools');

  for (const t of experimental) {
    const html = read(path.join('audio', t.slug, 'index.html'));
    assert.match(html, /<meta name="robots" content="noindex, follow">/, `${t.slug} must be noindex`);
    assert.ok(!sitemap.includes(`/audio/${t.slug}/`), `${t.slug} must not be in the sitemap`);
  }
  for (const t of implemented) {
    assert.ok(sitemap.includes(`/audio/${t.slug}/`), `${t.slug} must be in the sitemap`);
  }
});

test('generated pages: every tool page links back to the hub and its category peers', () => {
  for (const t of C.publicTools()) {
    const html = read(path.join('audio', t.slug, 'index.html'));
    assert.match(html, /href="\/audio\/"/, `${t.slug}: needs a link back to the hub`);
    assert.ok(html.includes(`<h1>${esc(t.name)}</h1>`) || html.includes(t.name), `${t.slug}: missing name`);
  }
});

test('generated pages: the hub lists every public tool and no unavailable one', () => {
  const html = read('audio/index.html');
  for (const t of C.publicTools()) {
    assert.ok(html.includes(`/audio/${t.slug}/`), `hub is missing ${t.slug}`);
  }
  for (const t of C.TOOLS) {
    if (t.status === 'implemented' || t.status === 'experimental') continue;
    assert.ok(!html.includes(`href="/audio/${t.slug}/"`), `hub must not link unavailable ${t.slug}`);
  }
});

/* -------------------------------------------------------------- FFmpeg UX */

test('audio toolkit: FFmpeg is only claimed on tools that really use it', () => {
  for (const t of C.publicTools()) {
    if (t.engine !== 'ffmpeg') continue;
    const html = read(path.join('audio', t.slug, 'index.html'));
    assert.match(
      html,
      /FFmpeg/,
      `${t.slug} uses FFmpeg and must say so in its processing note`
    );
  }
});
