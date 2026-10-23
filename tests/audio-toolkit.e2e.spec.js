/*
 * Bench Audio Toolkit - Chromium end-to-end tests.
 *
 * These prove the toolkit mounts from the real registry, that representative
 * tools produce real downloadable output, that the FFmpeg engine loads from
 * this origin under the production CSP, and that the microphone policy and the
 * experimental/deferred statuses behave honestly.
 *
 * The Node unit suite (test/audio-toolkit.test.js) checks the pure DSP core;
 * this suite exercises the real browser engines (Web Audio, MediaRecorder,
 * FFmpeg.wasm) that Node cannot.
 *
 * Selectors reflect the real markup in audio-toolkit.js:
 *   #atk-file / #atk-drop / #atk-run / #atk-results / #atk-status
 *   #atk-rec / #atk-rec-stop / #atk-meter-fill / #atk-timer
 */
import { test, expect } from '@playwright/test';

// Chromium is the verified target: it can run FFmpeg.wasm and provide a fake
// microphone for the recorder test. Skip the other projects rather than
// reporting environment-specific failures.
test.use({
  // Enables a synthetic microphone so the recorder test can exercise the real
  // MediaRecorder -> decode -> WAV path without a physical device.
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  }
});

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Audio e2e is verified on Chromium only.');

  // The production CSP keeps connect-src 'self', so fetch() of a blob: URL is
  // blocked (correctly). Capture the Blob objects the page creates instead, and
  // read their bytes directly - no network involved.
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    window.__blobs = new Map();
    URL.createObjectURL = obj => {
      const url = create(obj);
      if (obj instanceof Blob) window.__blobs.set(url, obj);
      return url;
    };
  });
});

/* Build a genuine 16-bit PCM WAV in Node so the browser has real audio to
   decode. No fixtures on disk, no network. */
function wavBuffer({ seconds = 1, sampleRate = 44100, freq = 440, channels = 1 } = {}) {
  const frames = Math.round(sampleRate * seconds);
  const blockAlign = channels * 2;
  const dataBytes = frames * blockAlign;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    const s = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5 * 32767);
    for (let c = 0; c < channels; c++) {
      buf.writeInt16LE(s, off);
      off += 2;
    }
  }
  return buf;
}

const WAV = wavBuffer({ seconds: 1 });

async function blobMeta(page, link) {
  const href = await link.getAttribute('href');
  expect(href && href.startsWith('blob:'), 'output must be a real blob URL').toBe(true);
  const meta = await page.evaluate(async url => {
    const blob = window.__blobs && window.__blobs.get(url);
    if (!blob) throw new Error('blob not captured: ' + url);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { size: bytes.length, type: blob.type, head: Array.from(bytes.slice(0, 4)) };
  }, href);
  return { href, ...meta };
}

/* ------------------------------------------------------------------- hub */

test('hub loads the real registry, licence note and honest unavailable list', async ({ page }) => {
  await page.goto('/audio/');
  await expect(page.locator('h1')).toContainText('Private audio tools');

  // Real generated tool pages are linked.
  await expect(page.locator('a[href="/audio/convert/"]').first()).toBeVisible();
  await expect(page.locator('a[href="/audio/trimmer/"]').first()).toBeVisible();
  await expect(page.locator('a[href="/audio/recorder/"]').first()).toBeVisible();

  // Deferred / unavailable entries are disclosed, never dressed up as tools.
  const statusList = page.locator('.itk-status-list');
  await expect(statusList).toBeVisible();
  await expect(statusList).toContainText('Deferred');
  await expect(statusList).toContainText('Unavailable');

  // GPL compliance is visible on the hub and links to the source offer.
  await expect(page.locator('h2', { hasText: 'Licences and source' })).toBeVisible();
  await expect(page.locator('a[href="/vendor/ffmpeg/NOTICE.txt"]')).toBeVisible();
});

test('production headers scope the microphone to /audio/* only', async ({ page }) => {
  const home = await page.request.get('/');
  expect(home.status()).toBe(200);
  expect(home.headers()['permissions-policy']).toContain('microphone=()');

  const audio = await page.request.get('/audio/recorder/');
  expect(audio.status()).toBe(200);
  expect(audio.headers()['permissions-policy']).toContain('microphone=(self)');

  // The wasm engine must be served with the correct MIME type and CSP allowance.
  const wasm = await page.request.get('/vendor/ffmpeg/ffmpeg-core.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  expect(home.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'");
});

test('SPA navigation from the home page mounts the toolkit without a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__atk_marker = 'kept'; });

  await page.click('a[href="/audio/"] >> nth=0');
  await expect(page).toHaveURL(/\/audio\/?$/);
  await expect(page.locator('h1')).toContainText('Private audio tools');

  // A full document reload would wipe the marker.
  expect(await page.evaluate(() => window.__atk_marker)).toBe('kept');

  // The client-rendered hub must keep the honesty and licence sections that the
  // server-rendered page shows.
  await expect(page.locator('.itk-status-list')).toBeVisible();
  await expect(page.locator('a[href="/vendor/ffmpeg/NOTICE.txt"]')).toBeVisible();
});

/* -------------------------------------------------------------- Web Audio */

test('tone generator makes a real WAV without fetching the FFmpeg engine', async ({ page }) => {
  const engineRequests = [];
  page.on('request', r => { if (r.url().includes('/vendor/ffmpeg/')) engineRequests.push(r.url()); });

  await page.goto('/audio/tone-generator/');
  await expect(page.locator('#atk')).toBeVisible();
  await expect(page.locator('#atk-drop')).toHaveCount(0); // generator needs no file

  await page.fill('#atk-form input[data-opt="duration"]', '1');
  await page.click('#atk-run');

  await expect(page.locator('#atk-results')).not.toContainText('No results yet', { timeout: 20000 });
  const link = page.locator('#atk-results a[download]').first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('download')).toMatch(/\.wav$/);

  const meta = await blobMeta(page, link);
  expect(meta.size).toBeGreaterThan(44);
  expect(Buffer.from(meta.head).toString('ascii')).toBe('RIFF');
  expect(engineRequests.length, 'Web Audio tool must not download the engine').toBe(0);
});

test('trimmer cuts a real range from an uploaded WAV and previews the waveform', async ({ page }) => {
  await page.goto('/audio/trimmer/');
  await expect(page.locator('#atk')).toBeVisible();

  await page.setInputFiles('#atk-file', [{ name: 'tone.wav', mimeType: 'audio/wav', buffer: WAV }]);
  await expect(page.locator('#atk-files')).toContainText('tone.wav');

  // WAV output keeps this test on the Web Audio path (no engine download).
  await page.selectOption('#atk-form select[data-opt="format"]', 'wav');
  await page.fill('#atk-form input[data-opt="start"]', '0.2');
  await page.fill('#atk-form input[data-opt="end"]', '0.7');
  await page.click('#atk-run');

  await expect(page.locator('#atk-status')).toContainText('Done', { timeout: 20000 });
  const link = page.locator('#atk-results a[download]').first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('download')).toMatch(/\.wav$/);

  const meta = await blobMeta(page, link);
  expect(meta.size).toBeGreaterThan(44);
  expect(Buffer.from(meta.head).toString('ascii')).toBe('RIFF');
});

test('metronome starts a real click track and stops cleanly', async ({ page }) => {
  await page.goto('/audio/metronome/');
  await expect(page.locator('#atk-metro')).toBeVisible();
  await expect(page.locator('#atk-beat')).toContainText('Ready');

  await page.fill('#atk-form input[data-opt="bpm"]', '200');
  await page.click('#atk-metro');
  await expect(page.locator('#atk-metro-stop')).toBeVisible();
  await expect(page.locator('#atk-beat')).toContainText(/Beat [1-4] of 4/, { timeout: 5000 });

  await page.click('#atk-metro-stop');
  await expect(page.locator('#atk-metro')).toBeVisible();
  await expect(page.locator('#atk-beat')).toContainText('Stopped');
});

/* ---------------------------------------------------------------- FFmpeg */

test('a real FFmpeg conversion produces an MP3 and loads the same-origin engine', async ({ page }) => {
  test.setTimeout(120000);

  const engineRequests = [];
  page.on('request', r => { if (r.url().includes('/vendor/ffmpeg/')) engineRequests.push(r.url()); });

  await page.goto('/audio/to-mp3/');
  await expect(page.locator('#atk')).toBeVisible();
  await page.setInputFiles('#atk-file', [{ name: 'tone.wav', mimeType: 'audio/wav', buffer: WAV }]);
  await page.click('#atk-run');

  // The engine is ~31 MB and must compile the wasm before the first result.
  await expect(page.locator('#atk-status')).toContainText('Done', { timeout: 90000 });
  const link = page.locator('#atk-results a[download]').first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('download')).toMatch(/\.mp3$/);

  const meta = await blobMeta(page, link);
  expect(meta.size).toBeGreaterThan(1000);

  // A real MP3 starts with an ID3 tag or an MPEG frame sync (0xFF 0xEx/0xFx).
  const [b0, b1] = meta.head;
  const isId3 = b0 === 0x49 && b1 === 0x44;
  const isMpegSync = b0 === 0xff && (b1 & 0xe0) === 0xe0;
  expect(isId3 || isMpegSync, `not an MP3: ${meta.head.map(n => n.toString(16)).join(' ')}`).toBe(true);

  // The engine must come from this origin, never a CDN.
  expect(engineRequests.some(u => u.includes('/vendor/ffmpeg/'))).toBe(true);
  for (const url of engineRequests) {
    expect(url.startsWith('http://localhost:3000/'), 'engine must be same-origin: ' + url).toBe(true);
  }
});

/* ------------------------------------------------------------- microphone */

test.describe('microphone', () => {
  test.use({ permissions: ['microphone'] });

  test('voice recorder captures a real take and exports a genuine WAV', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/audio/recorder/');
    await expect(page.locator('#atk-rec')).toBeVisible();

    await page.click('#atk-rec');
    await expect(page.locator('#atk-rec-stop')).toBeVisible({ timeout: 15000 });
    // The meter must react to the fake device, proving audio is flowing.
    await expect(page.locator('#atk-meter-fill')).not.toHaveCSS('width', '0px', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.click('#atk-rec-stop');

    const link = page.locator('#atk-results a[download]').first();
    await expect(link).toBeVisible({ timeout: 20000 });
    expect(await link.getAttribute('download')).toMatch(/\.wav$/);

    // The take is decoded and re-encoded, so the bytes are a real RIFF/WAVE
    // file - not WebM bytes merely renamed to .wav.
    const meta = await blobMeta(page, link);
    expect(meta.size).toBeGreaterThan(44);
    expect(Buffer.from(meta.head).toString('ascii')).toBe('RIFF');
  });

  test('microphone check meters live input without creating a recording', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/audio/mic-check/');
    await expect(page.locator('#atk-mic-start')).toBeVisible();

    await page.click('#atk-mic-start');
    await expect(page.locator('#atk-mic-stop')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#atk-meter-fill')).not.toHaveCSS('width', '0px', { timeout: 15000 });
    await page.waitForTimeout(600);

    await page.click('#atk-mic-stop');
    await expect(page.locator('#atk-mic-start')).toBeVisible();
    await expect(page.locator('#atk-status')).toContainText('Microphone works', { timeout: 5000 });

    // A mic check must not offer a download: nothing is recorded.
    await expect(page.locator('#atk-results a[download]')).toHaveCount(0);
    await expect(page.locator('#atk-results')).toContainText('No recording is made');
  });
});

/* ------------------------------------------------------ honest SEO states */

test('experimental pages are noindex and deferred/unavailable tools have no page', async ({ page }) => {
  for (const slug of ['pitch', 'noise-reducer', 'voice-enhancer', 'bpm-detector', 'id3-editor']) {
    const res = await page.request.get('/audio/' + slug + '/');
    expect(res.status(), slug).toBe(200);
    expect(await res.text(), slug).toMatch(/<meta name="robots" content="noindex/);
  }

  for (const slug of ['transcription', 'vocal-remover', 'ai-denoise', 'audio-restoration', 'audio-translate', 'system-audio-record', 'text-to-speech', 'speaker-diarization']) {
    const res = await page.request.get('/audio/' + slug + '/');
    expect(res.status(), slug + ' should not exist').toBe(404);
  }
});

test('every public tool page mounts a real control surface with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // A representative page from each category.
  const slugs = [
    'convert', 'trimmer', 'equalizer', 'mic-check', 'metronome',
    'clipping-detector', 'audio-to-base64'
  ];

  for (const slug of slugs) {
    await page.goto('/audio/' + slug + '/');
    await expect(page.locator('#atk'), slug).toBeVisible();
    await expect(page.locator('#atk-results'), slug).toBeVisible();
    if (slug === 'mic-check') {
      // A live tool: the control surface is the meter, not a fake Run button.
      await expect(page.locator('#atk-mic-start'), slug).toBeVisible();
      await expect(page.locator('#atk-run'), slug).toHaveCount(0);
    } else if (slug === 'metronome') {
      await expect(page.locator('#atk-metro'), slug).toBeVisible();
      await expect(page.locator('#atk-run'), slug).toHaveCount(0);
    } else {
      await expect(page.locator('#atk-run'), slug).toBeVisible();
      // No "handler missing" fallback: the runtime would refuse to mount.
      await expect(page.locator('#atk-results'), slug).toContainText('No results yet');
    }
  }

  expect(errors, 'console/page errors: ' + errors.join(' | ')).toEqual([]);
});
