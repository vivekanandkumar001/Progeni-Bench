#!/usr/bin/env node
/*
 * Builds the small, same-origin vendor bundles used by image-toolkit.js and
 * copies the FFmpeg.wasm engine used by audio-toolkit.js.
 *
 * The site is a static, no-bundler deployment, so third-party libraries are
 * pre-bundled here and committed under vendor/. They are loaded on demand by
 * the toolkits (only the routes that need them pay the download cost).
 *
 * FFmpeg: the audio toolkit loads the *official* @ffmpeg/core (GPL-2.0-or-later,
 * includes libmp3lame) plus the MIT @ffmpeg/ffmpeg wrapper. These are copied
 * verbatim from node_modules into vendor/ffmpeg/ together with their licence
 * texts and a source offer, so the GPL obligations are met for a static host.
 *
 * Run with: npm run build:vendor
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY_DIR = path.join(ROOT, 'scripts', 'vendor-entries');
const OUT_DIR = path.join(ROOT, 'public', 'vendor');

const BUNDLES = [
  { out: 'qrcode.min.js', entry: 'qrcode-entry.js' },
  { out: 'jsqr.min.js', entry: 'jsqr-entry.js' },
  { out: 'gifenc.min.js', entry: 'gifenc-entry.js' },
  { out: 'gifuct.min.js', entry: 'gifuct-entry.js' },
  { out: 'utif.min.js', entry: 'utif-entry.js' },
  { out: 'jsbarcode.min.js', entry: 'jsbarcode-entry.js' }
];

/* Copy the FFmpeg.wasm engine and write its licence notices. */
function buildFfmpegVendor() {
  const destDir = path.join(OUT_DIR, 'ffmpeg');
  fs.mkdirSync(destDir, { recursive: true });

  const coreDir = path.join(ROOT, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
  const ffmpegDir = path.join(ROOT, 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'umd');

  const copies = [
    [path.join(coreDir, 'ffmpeg-core.js'), 'ffmpeg-core.js'],
    [path.join(coreDir, 'ffmpeg-core.wasm'), 'ffmpeg-core.wasm'],
    [path.join(ffmpegDir, 'ffmpeg.js'), 'ffmpeg.js'],
    [path.join(ffmpegDir, '814.ffmpeg.js'), '814.ffmpeg.js']
  ];

  const missing = [];
  copies.forEach(([src, name]) => {
    if (!fs.existsSync(src)) { missing.push(src); return; }
    fs.copyFileSync(src, path.join(destDir, name));
    console.log(`vendor/ffmpeg/${name}  ${(fs.statSync(src).size / 1024).toFixed(1)} KB`);
  });
  if (missing.length) {
    throw new Error('Missing FFmpeg source files. Run `npm install` first:\n  ' + missing.join('\n  '));
  }

  const coreVersion = require(path.join(ROOT, 'node_modules', '@ffmpeg', 'core', 'package.json')).version;
  const wrapperVersion = require(path.join(ROOT, 'node_modules', '@ffmpeg', 'ffmpeg', 'package.json')).version;

  const notice = `FFmpeg.wasm engine shipped with the Bench Audio Toolkit
=====================================================

Files in this directory:
  ffmpeg.js, 814.ffmpeg.js   - @ffmpeg/ffmpeg ${wrapperVersion}, MIT licence
  ffmpeg-core.js             - @ffmpeg/core ${coreVersion}, GPL-2.0-or-later
  ffmpeg-core.wasm           - compiled FFmpeg (GPL build, includes libmp3lame)

@ffmpeg/core is licensed under the GNU General Public License, version 2 or
later. It is distributed here unmodified. Because this site ships a GPL
binary, the corresponding source is available:

  FFmpeg source:        https://ffmpeg.org/download.html
  libmp3lame (LAME):    https://lame.sourceforge.io/
  @ffmpeg/core source:  https://github.com/ffmpegwasm/ffmpeg.wasm
  Exact build:          @ffmpeg/core ${coreVersion}
  Build instructions:   https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/docs/build.md

No modifications were made to the FFmpeg or @ffmpeg/core sources. The wrapper
(@ffmpeg/ffmpeg, MIT) is loaded by the page, which requests the core files from
this same directory at runtime. If you need the source for a specific binary
build, write to ${'legal@progeni.live'} and it will be provided.

Full licence texts:
  - GPL-2.0-or-later: https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt
  - MIT:              https://opensource.org/license/mit
`;
  fs.writeFileSync(path.join(destDir, 'NOTICE.txt'), notice, 'utf8');
  console.log('vendor/ffmpeg/NOTICE.txt written');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  for (const bundle of BUNDLES) {
    await esbuild.build({
      entryPoints: [path.join(ENTRY_DIR, bundle.entry)],
      outfile: path.join(OUT_DIR, bundle.out),
      bundle: true,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2019'],
      logLevel: 'warning'
    });
    const size = fs.statSync(path.join(OUT_DIR, bundle.out)).size;
    console.log(`vendor/${bundle.out}  ${(size / 1024).toFixed(1)} KB`);
  }
  buildFfmpegVendor();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
