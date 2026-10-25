const fs = require('fs');
const path = require('path');

function walk(d) {
  let r = [];
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) r = r.concat(walk(p));
    else if (f.name === 'index.html') r.push(p);
  }
  return r;
}

const root = process.argv[2] || path.join(__dirname, '..', '..', 'dist', 'audio');
const files = walk(root);
const titles = new Map(), descs = new Map();
const off = [];
for (const file of files) {
  const c = fs.readFileSync(file, 'utf8');
  const rel = path.relative('.', file).replace(/\\/g, '/');
  const tm = c.match(/<title>([^<]*)<\/title>/i);
  const t = tm ? tm[1].trim() : '';
  if (!t || t.length > 60) off.push(rel + ' title ' + (t ? t.length : 0));
  const dm = c.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const d = dm ? dm[1].trim() : '';
  if (!d || d.length < 120 || d.length > 155) off.push(rel + ' desc ' + (d ? d.length : 0));
  const h1 = (c.match(/<h1[^>]*>/gi) || []).length;
  if (h1 !== 1) off.push(rel + ' h1=' + h1);
  if (!/<link rel="canonical"/.test(c)) off.push(rel + ' no canonical');
  if (!/lang="en-IN"/.test(c)) off.push(rel + ' lang');
  if (!/og:title/.test(c) || !/og:description/.test(c) || !/og:image/.test(c)) off.push(rel + ' og');
  if (/AggregateRating|"Review"/.test(c)) off.push(rel + ' review-schema');
  const sm = c.match(/<script type="application\/ld\+json" id="schema">([\s\S]*?)<\/script>/);
  if (sm) { try { JSON.parse(sm[1]); } catch (e) { off.push(rel + ' bad json-ld'); } }
  else off.push(rel + ' no json-ld');
  if (titles.has(t)) off.push('DUP title ' + rel + ' & ' + titles.get(t)); else titles.set(t, rel);
  if (descs.has(d)) off.push('DUP desc ' + rel + ' & ' + descs.get(d)); else descs.set(d, rel);
}
console.log('pages:', files.length, '| issues:', off.length);
off.forEach(o => console.log('  -', o));
