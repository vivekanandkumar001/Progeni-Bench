const fs = require('fs');
const C = require('../../audio-tools.config.js');
const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'audio-toolkit.js'), 'utf8');

// Extract `function name(...) { ... }` bodies by brace matching.
function bodyOf(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

const pub = C.TOOLS.filter(t => t.status === 'implemented' || t.status === 'experimental');
const rows = [];
for (const tool of pub) {
  const body = bodyOf(tool.handler);
  if (body === null) {
    rows.push({ tool: tool.slug, handler: tool.handler, verdict: 'NO FUNCTION' });
    continue;
  }
  const lines = body.split('\n').filter(l => l.trim()).length;
  const throwOnly = /^\s*throw new Error/.test(body.trim()) && lines <= 3;
  const returns = /return\s*\{/.test(body);
  const outputs = /outputs\s*:/.test(body);
  const progressOnly = !returns && !outputs;
  rows.push({
    tool: tool.slug,
    handler: tool.handler,
    status: tool.status,
    engine: tool.engine,
    lines,
    returns,
    outputs,
    note: throwOnly ? 'THROW-ONLY' : progressOnly ? 'NO RETURN' : ''
  });
}

const bad = rows.filter(r => r.note);
console.log('public tools:', rows.length);
console.log('suspicious:', bad.length);
for (const r of bad) console.log(' ', JSON.stringify(r));
console.log('\nsmallest handlers:');
for (const r of rows.filter(r => !r.note).sort((a, b) => a.lines - b.lines).slice(0, 12)) {
  console.log(' ', r.lines.toString().padStart(4), r.tool, '(' + r.handler + ')', r.engine);
}
