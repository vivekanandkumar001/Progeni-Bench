#!/usr/bin/env node
/*
 * Builds the small, same-origin vendor bundles used by image-toolkit.js.
 *
 * The site is a static, no-bundler deployment, so third-party libraries are
 * pre-bundled here and committed under vendor/. They are loaded on demand by
 * the toolkit (only QR/GIF/TIFF/barcode routes pay the download cost).
 *
 * Run with: npm run build:vendor
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY_DIR = path.join(ROOT, 'scripts', 'vendor-entries');
const OUT_DIR = path.join(ROOT, 'vendor');

const BUNDLES = [
  { out: 'qrcode.min.js', entry: 'qrcode-entry.js' },
  { out: 'jsqr.min.js', entry: 'jsqr-entry.js' },
  { out: 'gifenc.min.js', entry: 'gifenc-entry.js' },
  { out: 'gifuct.min.js', entry: 'gifuct-entry.js' },
  { out: 'utif.min.js', entry: 'utif-entry.js' },
  { out: 'jsbarcode.min.js', entry: 'jsbarcode-entry.js' }
];

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
})().catch(err => {
  console.error(err);
  process.exit(1);
});
