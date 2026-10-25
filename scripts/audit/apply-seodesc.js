const fs = require('fs');
const path = require('path');
const C = require('../../audio-tools.config.js');

const ROOT = path.join(__dirname, '..', '..');
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'audio-seodesc-overrides.json'), 'utf8'));
const generated = JSON.parse(fs.readFileSync(path.join(__dirname, 'audio-seodesc.json'), 'utf8'));

const final = {};
C.publicTools().forEach(t => {
  final[t.id] = overrides[t.id] || generated[t.id];
});

// Validate
let bad = [];
Object.keys(final).forEach(k => {
  const n = final[k].length;
  if (n < 120 || n > 155) bad.push(k + ' ' + n);
  if (final[k].indexOf("'") >= 0) bad.push(k + ' has single quote');
});
const seen = new Set();
Object.keys(final).forEach(k => {
  if (seen.has(final[k])) bad.push('dup ' + k);
  seen.add(final[k]);
});
if (bad.length) { console.log('INVALID:', bad.join(', ')); process.exit(1); }
console.log('all', Object.keys(final).length, 'seoDescription values valid and unique');

// Rewrite the registry: insert seoDescription after the summary line of each tool block.
let src = fs.readFileSync(path.join(ROOT, 'audio-tools.config.js'), 'utf8');
let applied = 0, missing = [];
C.publicTools().forEach(t => {
  // Find the tool block by its id and insert seoDescription before "keywords:".
  const idAnchor = `id: "${t.id}",`;
  const start = src.indexOf(idAnchor);
  if (start < 0) { missing.push(t.id); return; }
  const kw = src.indexOf('keywords:', start);
  if (kw < 0) { missing.push(t.id + ' (no keywords)'); return; }
  // skip if already present right before keywords
  const between = src.slice(start, kw);
  if (between.indexOf('seoDescription:') >= 0) return;
  const value = final[t.id].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const indent = '    ';
  src = src.slice(0, kw) + `${indent}seoDescription:\n${indent}  "${value}",\n${indent}` + src.slice(kw);
  applied++;
});
fs.writeFileSync(path.join(ROOT, 'audio-tools.config.js'), src);
console.log('applied', applied, 'missing', missing.length ? missing.join(', ') : 'none');
