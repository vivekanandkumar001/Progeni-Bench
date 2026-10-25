const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const files = [
  'dist/index.html',
  'dist/about/index.html',
  'dist/audio/index.html',
  'audio-toolkit.js',
  'image-toolkit.js',
  'app.js',
  'audio-tools.config.js',
  'image-tools.config.js',
  'audio-pages.js',
  'image-pages.js',
  'build_seo_pages.js'
].map(f => path.join(ROOT, f)).filter(fs.existsSync);

const chars = {
  'em-dash U+2014': /\u2014/g,
  'en-dash U+2013': /\u2013/g,
  'ellipsis U+2026': /\u2026/g,
  'right-single U+2019': /\u2019/g,
  'left-single U+2018': /\u2018/g,
  'right-double U+201D': /\u201d/g,
  'left-double U+201C': /\u201c/g,
  'nbsp U+00A0': /\u00a0/g,
  'space-hyphen-space': / - /g,
  'three-dots': /\.\.\./g,
  'double-space': /[^\n] {2,}[^\n]/g
};

const report = { totals: {}, samples: {} };
for (const [name, re] of Object.entries(chars)) {
  report.totals[name] = 0;
  report.samples[name] = [];
}
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const [name, re] of Object.entries(chars)) {
    const matches = src.match(re) || [];
    report.totals[name] += matches.length;
    if (matches.length && report.samples[name].length < 8) {
      let idx = -1;
      while ((idx = src.indexOf(matches[0], idx + 1)) >= 0 && report.samples[name].length < 8) {
        const line = src.slice(0, idx).split('\n').length;
        const snippet = src.slice(Math.max(0, idx - 45), idx + 55).replace(/\n/g, '\\n');
        report.samples[name].push(path.relative(ROOT, file) + ':' + line + '  ' + JSON.stringify(snippet));
      }
    }
  }
}

// Exact codepoints for a few known-copy snippets.
function codepoints(file, needle) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const i = src.indexOf(needle);
  if (i < 0) return null;
  const s = src.slice(i, i + 90);
  return s.split('').map(c => c + ' (U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')').join(' ');
}
report.codepoints = {
  hero: codepoints('dist/index.html', '30 utilities'),
  heroLede: codepoints('dist/index.html', 'Free, client-side tools'),
  audioHub: codepoints('dist/audio/index.html', 'Private audio tools'),
  micCopy: codepoints('audio-toolkit.js', 'This page only reads')
};

fs.writeFileSync(path.join(__dirname, 'chars-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.totals, null, 2));
