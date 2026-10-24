#!/usr/bin/env node
/*
 * Minimal cross-platform static file server for local preview / e2e tests.
 * Usage: node scripts/serve.js [port] [dir]
 * Defaults: port 3000, dir dist
 *
 * It also applies the security headers declared in the deployed `_headers`
 * file (copied into dist by the build), so local preview and Playwright run
 * under the same CSP, Permissions-Policy and cache rules as production. This
 * matters for the audio toolkit: the FFmpeg engine needs 'wasm-unsafe-eval'
 * and the microphone is only allowed on /audio/*.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2], 10) || 3000;
const root = path.resolve(process.argv[3] || 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.vcf': 'text/vcard; charset=utf-8'
};

/* ------------------------------------------------------------- _headers --- */
/* Build a tiny subset of the Netlify `_headers` format: a path pattern line
   followed by indented `Name: value` lines. Supports `*` as a wildcard. Later
   matching rules override earlier ones for the same header name, matching the
   host's precedence. */
function patternToRegExp(pattern) {
  if (pattern === '/*') return /^\/.*$/;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function loadHeaderRules() {
  const file = path.join(root, '_headers');
  if (!fs.existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { re: patternToRegExp(line.trim()), headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    current.headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
  }
  return rules;
}

const HEADER_RULES = loadHeaderRules();

function headersFor(urlPath) {
  const out = {};
  for (const rule of HEADER_RULES) {
    if (!rule.re.test(urlPath)) continue;
    for (const [name, value] of rule.headers) out[name] = value;
  }
  return out;
}

function send(res, status, filePath, urlPath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/html' }, headersFor(urlPath)));
      res.end('Not found');
      return;
    }
    res.writeHead(
      status,
      Object.assign(
        { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' },
        headersFor(urlPath)
      )
    );
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(root, urlPath);

  // Prevent path traversal outside the served root.
  if (!filePath.startsWith(root)) {
    res.writeHead(403, headersFor(urlPath));
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return send(res, 200, path.join(filePath, 'index.html'), urlPath);
    }
    if (!err && stat.isFile()) return send(res, 200, filePath, urlPath);

    // Try appending .html / /index.html (mirrors cleanUrls behavior).
    const withHtml = `${filePath}.html`;
    fs.stat(withHtml, (e2, s2) => {
      if (!e2 && s2.isFile()) return send(res, 200, withHtml, urlPath);
      const indexHtml = path.join(filePath, 'index.html');
      fs.stat(indexHtml, (e3, s3) => {
        if (!e3 && s3.isFile()) return send(res, 200, indexHtml, urlPath);
        send(res, 404, path.join(root, '404.html'), urlPath);
      });
    });
  });
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port} (${HEADER_RULES.length} header rules)`);
});
