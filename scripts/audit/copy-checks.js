const fs = require('fs');
const path = require('path');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy-corpus.json'), 'utf8'));

const checks = [
  ['three-dots', /\.\.\./g],
  ['space-hyphen-space', / - /g],
  ['space-before-punct', /\s+[,.;:!?](?=\s|$)/g],
  ['double-space', /[^\s] {2,}[^\s]/g],
  ['straight-apostrophe', /[A-Za-z]'[A-Za-z]/g],
  ['repeated-word', /\b(\w+)\s+\1\b/gi],
  ['one-plural', /\b1\s+(files|bytes|pages|images|tracks|items|results|seconds|minutes|hours|labels|stickers|frames|layers|rows|columns|characters)\b/gi],
  ['please', /\bPlease\b/g],
  ['okay', /\bOkay\b/g],
  ['amp-prose', /\s&\s/g],
  ['eg-no-comma', /\be\.g\.(?=\s+[a-z])/g]
];

const t = {
  analyse: /analyse/gi,
  analyze: /analyze/gi,
  normalise: /normalis/gi,
  normalize: /normaliz/gi,
  colour: /colour/gi,
  color: /\bcolor\b/gi,
  licence: /licence/gi,
  license: /license/gi,
  behaviour: /behaviour/gi,
  behavior: /behavior/gi,
  cancelled: /cancelled/gi,
  canceled: /canceled/gi,
  customise: /customis/gi,
  customize: /customiz/gi,
  optimise: /optimis/gi,
  optimize: /optimiz/gi,
  organise: /organis/gi,
  organize: /organiz/gi,
  centre: /\bcentre\b/gi,
  center: /\bcenter\b/gi,
  mic: /\bmic\b/gi,
  microphone: /\bmicrophone\b/gi,
  wifi: /wi-?fi/gi,
  ffmpeg: /ffmpeg/gi,
  webAudio: /web audio/gi,
  mp3: /\bmp3\b/gi,
  wav: /\bwav\b/gi
};

const found = {};
const termHits = {};
for (const page of corpus) {
  if (!page.text) continue;
  const hay = [page.text, ...(page.buttons || []), ...(page.labels || []), ...(page.placeholders || []), page.title, page.description, ...(page.h1 || []), ...(page.headings || [])].join('\n');
  for (const [name, re] of checks) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(hay))) {
      const snippet = hay.slice(Math.max(0, m.index - 55), m.index + 70).replace(/\s+/g, ' ');
      (found[name] = found[name] || []).push({ page: page.url, snippet });
      if (found[name].length > 400) break;
    }
  }
  for (const [name, re] of Object.entries(t)) {
    re.lastIndex = 0;
    const n = (hay.match(re) || []).length;
    if (n) termHits[name] = (termHits[name] || 0) + n;
  }
}

for (const [name, list] of Object.entries(found)) {
  console.log('\n== ' + name + ' (' + list.length + ') ==');
  const seen = new Set();
  let n = 0;
  for (const hit of list) {
    if (seen.has(hit.snippet)) continue;
    seen.add(hit.snippet);
    console.log('  ' + hit.page + '  ' + hit.snippet);
    if (++n >= 25) { console.log('  ... ' + (list.length - n) + ' more'); break; }
  }
}
console.log('\n== term counts ==');
console.log(termHits);

// Buttons and headings ending with a full stop.
const periodButtons = [];
const periodHeadings = [];
for (const page of corpus) {
  for (const b of page.buttons || []) if (/\.$/.test(b) && !/\.\.\.$/.test(b)) periodButtons.push(page.url + ' :: ' + b);
  for (const h of page.headings || []) if (/[.:]$/.test(h)) periodHeadings.push(page.url + ' :: ' + h);
}
console.log('\n== button labels ending with a full stop (' + periodButtons.length + ') ==');
console.log(periodButtons.slice(0, 30).join('\n'));
console.log('\n== headings ending with punctuation (' + periodHeadings.length + ') ==');
console.log(periodHeadings.slice(0, 30).join('\n'));

// Button label vocabulary.
const buttons = {};
for (const page of corpus) for (const b of page.buttons || []) buttons[b] = (buttons[b] || 0) + 1;
console.log('\n== button labels ==');
console.log(Object.entries(buttons).sort((a, b) => b[1] - a[1]).slice(0, 80).map(([k, v]) => v + '  ' + JSON.stringify(k)).join('\n'));
