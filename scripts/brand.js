/*
 * Brand asset URLs in one place.
 *
 * The favicon is the single source of truth for the Bench mark: the header
 * logo, the browser tab, the manifest and the Apple touch icon all point at
 * the same artwork. Because /assets/* is cached for a week, a short
 * content-hash query is appended so a new mark reaches returning visitors
 * immediately instead of waiting for the cache to expire.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let version = '';
try {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'favicon.svg'));
  version = '?v=' + crypto.createHash('sha1').update(svg).digest('hex').slice(0, 8);
} catch (err) {
  // First checkout without the asset: fall back to the plain URLs.
  version = '';
}

const logo = `/assets/favicon.svg${version}`;

function iconLinks() {
  return `  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico${version}" sizes="48x48">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png${version}">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png${version}">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png${version}">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg${version}">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png${version}">`;
}

module.exports = { version, logo, iconLinks };
