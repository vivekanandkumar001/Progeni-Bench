const fs = require('fs');
const path = require('path');
const C = require('../../audio-tools.config.js');

const ROOT = path.join(__dirname, '..', '..');
const final = JSON.parse(fs.readFileSync(path.join(__dirname, 'audio-seodesc-final.json'), 'utf8'));

let src = fs.readFileSync(path.join(ROOT, 'audio-tools.config.js'), 'utf8');
let applied = 0, missing = [];
C.publicTools().forEach(t => {
  const value = final[t.id];
  if (!value) { missing.push(t.id + ' (no value)'); return; }
  const idAnchor = `id: "${t.id}",`;
  const start = src.indexOf(idAnchor);
  if (start < 0) { missing.push(t.id); return; }
  const kw = src.indexOf('keywords:', start);
  if (kw < 0) { missing.push(t.id + ' (no keywords anchor)'); return; }
  if (src.slice(start, kw).indexOf('seoDescription:') >= 0) return;
  src = src.slice(0, kw) + `    seoDescription:\n      "${value}",\n    ` + src.slice(kw);
  applied++;
});
fs.writeFileSync(path.join(ROOT, 'audio-tools.config.js'), src);
console.log('applied', applied, '| missing', missing.length ? missing.join(', ') : 'none');
