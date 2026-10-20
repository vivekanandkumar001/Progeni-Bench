#!/usr/bin/env node
/*
 * Minimal cross-platform static file server for local preview / e2e tests.
 * Usage: node scripts/serve.js [port] [dir]
 * Defaults: port 3000, dir dist
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2], 10) || 3000;
const root = path.resolve(process.argv[3] || 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.vcf': 'text/vcard; charset=utf-8'
};

function send(res, status, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('Not found'); return; }
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(root, urlPath);

  // Prevent path traversal outside the served root.
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return send(res, 200, path.join(filePath, 'index.html'));
    }
    if (!err && stat.isFile()) return send(res, 200, filePath);

    // Try appending .html / /index.html (mirrors cleanUrls behavior).
    const withHtml = `${filePath}.html`;
    fs.stat(withHtml, (e2, s2) => {
      if (!e2 && s2.isFile()) return send(res, 200, withHtml);
      const indexHtml = path.join(filePath, 'index.html');
      fs.stat(indexHtml, (e3, s3) => {
        if (!e3 && s3.isFile()) return send(res, 200, indexHtml);
        send(res, 404, path.join(root, '404.html'));
      });
    });
  });
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
