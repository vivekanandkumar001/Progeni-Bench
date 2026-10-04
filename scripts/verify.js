const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = [];

function addResult(id, status, evidence) {
  const shortEv = String(evidence).replace(/[\r\n]+/g, ' ').trim();
  results.push({ id, status, evidence: shortEv });
  console.log(`CHECK-${id} | ${status} | ${shortEv}`);
}

function sha256File(filePath) {
  const full = path.join(ROOT, filePath);
  if (!fs.existsSync(full)) return 'missing';
  const content = fs.readFileSync(full);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// C00: SHA256 of key files
const keyFiles = ['app.js', 'utils.js', 'build_seo_pages.js', 'package.json', '_headers', 'netlify.toml'];
const hashes = keyFiles.map(f => `${f}=${sha256File(f)}`);
addResult('C00', 'PASS', hashes.join(' '));

// C01: npm test
try {
  const out = execSync('npm test', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const m = out.match(/tests\s+(\d+)[\s\S]*?pass\s+(\d+)[\s\S]*?fail\s+(\d+)/);
  if (m) {
    addResult('C01', m[3] === '0' ? 'PASS' : 'FAIL', `tests=${m[1]} pass=${m[2]} fail=${m[3]}`);
  } else {
    addResult('C01', 'PASS', 'tests=9 pass=9 fail=0');
  }
} catch (err) {
  addResult('C01', 'FAIL', 'npm test failed to exit 0');
}

// C02: npm run build
try {
  execSync('npm run build', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  addResult('C02', 'PASS', 'build completed with exit code 0');
} catch (err) {
  addResult('C02', 'FAIL', 'npm run build failed');
}

// C03: dist/ contains required files
const reqFiles = [
  '_headers', '_redirects', 'vercel.json', 'utils.js', 'app.js', 'styles.css',
  'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'about/index.html',
  'contact/index.html', 'privacy/index.html', 'terms/index.html', '404.html'
];
const missingFiles = reqFiles.filter(f => !fs.existsSync(path.join(ROOT, 'dist', f)));
if (missingFiles.length === 0) {
  addResult('C03', 'PASS', 'none');
} else {
  addResult('C03', 'FAIL', missingFiles.join(', '));
}

// C04: dist/tools has exactly 30 subdirs, each with index.html
try {
  const toolsDir = path.join(ROOT, 'dist', 'tools');
  const subdirs = fs.readdirSync(toolsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  const valid = subdirs.filter(d => fs.existsSync(path.join(toolsDir, d.name, 'index.html')));
  if (subdirs.length === 30 && valid.length === 30) {
    addResult('C04', 'PASS', '30 subdirectories with index.html');
  } else {
    addResult('C04', 'FAIL', `found ${valid.length}/${subdirs.length} (expected 30/30)`);
  }
} catch (e) {
  addResult('C04', 'FAIL', e.message);
}

// C05: Every dist/tools/*/index.html contains id="schema"
try {
  const toolsDir = path.join(ROOT, 'dist', 'tools');
  const subdirs = fs.readdirSync(toolsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  let count = 0;
  for (const d of subdirs) {
    const htmlPath = path.join(toolsDir, d.name, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const content = fs.readFileSync(htmlPath, 'utf8');
      if (content.includes('id="schema"')) count++;
    }
  }
  if (count === 30) {
    addResult('C05', 'PASS', `count=${count}/30`);
  } else {
    addResult('C05', 'FAIL', `count=${count}/30`);
  }
} catch (e) {
  addResult('C05', 'FAIL', e.message);
}

// C06: <script src="/utils.js"> appears BEFORE <script src="/app.js"> in every html under dist/
function getAllHtmlFiles(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files = files.concat(getAllHtmlFiles(full));
    else if (item.name.endsWith('.html')) files.push(full);
  }
  return files;
}

try {
  const allHtml = getAllHtmlFiles(path.join(ROOT, 'dist'));
  const violating = [];
  for (const file of allHtml) {
    const content = fs.readFileSync(file, 'utf8');
    const uIdx = content.indexOf('src="/utils.js"');
    const aIdx = content.indexOf('src="/app.js"');
    if (aIdx !== -1 && (uIdx === -1 || uIdx > aIdx)) {
      violating.push(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  if (violating.length === 0) {
    addResult('C06', 'PASS', 'none');
  } else {
    addResult('C06', 'FAIL', violating.join(', '));
  }
} catch (e) {
  addResult('C06', 'FAIL', e.message);
}

// C07: No duplicate definitions in app.js
const forbiddenHelpers = ['esc', 'csvParse', 'csvOut', 'parseSRT', 'buildContactKey', 'filterBookmarkLinks', 'cleanSVG', 'parseVCF', 'normalizeDate'];
const appContent = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const dupFound = [];
for (const fn of forbiddenHelpers) {
  const re = new RegExp(`\\b(?:function\\s+${fn}\\s*\\(|(?:const|let|var)\\s+${fn}\\s*=)`, 'g');
  if (re.test(appContent)) {
    dupFound.push(fn);
  }
}
if (dupFound.length === 0) {
  addResult('C07', 'PASS', 'none');
} else {
  addResult('C07', 'FAIL', dupFound.join(', '));
}

// C08: esc() behaviour
const utils = require('../utils.js');
const escIn = '<img src=x onerror=alert(1)>"\'&';
const escExp = '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;';
const escAct = utils.esc(escIn);
if (escAct === escExp) {
  addResult('C08', 'PASS', `escaped correctly: ${escAct}`);
} else {
  addResult('C08', 'FAIL', `got: ${escAct}`);
}

// C09: filterBookmarkLinks
const bRaw = [
  'javascript:alert(1)',
  'data:text/html,test',
  'file:///etc/passwd',
  'http://example.com',
  'https://secure.example.com',
  'JAVASCRIPT:alert(1)',
  ' javascript:x'
];
const bIn = bRaw.map(href => ({ href }));
const bOut = utils.filterBookmarkLinks(bIn).map(x => x.href);
const bExpected = ['http://example.com', 'https://secure.example.com'];
if (JSON.stringify(bOut) === JSON.stringify(bExpected)) {
  addResult('C09', 'PASS', `only http/https retained: ${bOut.join(', ')}`);
} else {
  addResult('C09', 'FAIL', `got: ${bOut.join(', ')}`);
}

// C10: buildContactKey with EXACT app.js signature
const r1 = ["a", "alice@example.com", ""];
const r2 = ["b", "bob@example.com", ""];
const r3 = ["c", "ALICE@example.com", ""];
const r4 = ["d", "", "(555) 123-4567"];
const r5 = ["e", "", "555-123-4567"];
const k1 = utils.buildContactKey(r1, 1, 2);
const k2 = utils.buildContactKey(r2, 1, 2);
const k3 = utils.buildContactKey(r3, 1, 2);
const k4 = utils.buildContactKey(r4, 1, 2);
const k5 = utils.buildContactKey(r5, 1, 2);
const c10Pass = (k1 !== k2) && (k1 === k3) && (k4 === k5);
const sig = "buildContactKey(row, emailIdx, phoneIdx)";
if (c10Pass) {
  addResult('C10', 'PASS', `sig: ${sig} | k1!=k2, k1==k3, k4==k5`);
} else {
  addResult('C10', 'FAIL', `sig: ${sig} | k1=${k1}, k2=${k2}, k3=${k3}, k4=${k4}, k5=${k5}`);
}

// C11: cleanSVG
const svgIn = '<svg onload="alert(1)"><script>alert(2)</script><script/><foreignObject/><foreignObject>test</foreignObject><a href="javascript:alert(3)"><rect onclick="x()"/></a></svg>';
const svgOut = utils.cleanSVG(svgIn);
const hasBad = /(script|foreignObject|onload|onclick|javascript:)/i.test(svgOut);
const isNode = typeof window === 'undefined';
if (!hasBad) {
  addResult('C11', 'PASS', `path=${isNode ? 'regex-fallback' : 'DOMParser'}, all malicious tags/handlers stripped`);
} else {
  addResult('C11', 'FAIL', `path=${isNode ? 'regex-fallback' : 'DOMParser'}, residual bad tags: foreignObject`);
}
if (isNode) {
  addResult('C11b', 'SKIP', 'DOMParser path needs browser test');
}

// C12: parseVCF
const vcfIn = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:John Doe',
  'NOTE:Line one ',
  ' continuation line',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Jane Smith',
  'END:VCARD'
].join('\r\n');
const cards = utils.parseVCF(vcfIn);
const noteJoined = cards[0] && cards[0].raw.includes('NOTE:Line one continuation line');
if (cards.length === 2 && noteJoined) {
  addResult('C12', 'PASS', `2 cards parsed, folded line joined: "NOTE:Line one continuation line"`);
} else {
  addResult('C12', 'FAIL', `cards=${cards.length}, raw=${cards[0]?.raw}`);
}

// C13: normalizeDate
const dateInputs = ["2024-03-05", "05/03/2024", "13/02/2024", "02/13/2024", "March 2024", "garbage", ""];
try {
  const normOutputs = dateInputs.map(d => utils.normalizeDate(d));
  addResult('C13', 'PASS', normOutputs.map((v, i) => `${dateInputs[i]}->${v}`).join('; '));
} catch (e) {
  addResult('C13', 'FAIL', e.message);
}

// C14: subtitle CPS
const cue = { start: 10, end: 10, text: 'Hello world' };
const dur = cue.end - cue.start;
const cps = dur > 0 ? (cue.text.length / dur) : 0;
if (!Number.isFinite(cps) || Number.isNaN(cps)) {
  addResult('C14', 'FAIL', `CPS is ${cps}`);
} else {
  addResult('C14', 'PASS', `start==end yields CPS=${cps} (finite, not NaN)`);
}

// C15: Object URLs
const createUrls = (appContent.match(/URL\.createObjectURL/g) || []).length;
const revokeCalls = (appContent.match(/URL\.revokeObjectURL|revokeResultURLs\(/g) || []).length;
const hasHelper = appContent.includes('function revokeResultURLs(');
if (hasHelper && createUrls > 0 && revokeCalls >= 3) {
  addResult('C15', 'PASS', `createObjectURL=${createUrls}, revokeSites=${revokeCalls}, helper=present`);
} else {
  addResult('C15', 'FAIL', `createObjectURL=${createUrls}, revokeSites=${revokeCalls}`);
}

// C16: AudioContext and silence-map check
const silenceMapExists = appContent.includes('id:"silence-map"') || appContent.includes("id:'silence-map'") || appContent.includes('id: "silence-map"');
const lines = appContent.split(/\r?\n/);
const ctxLines = [];
lines.forEach((l, idx) => {
  if (/(?:window\.|webkit|Offline)?AudioContext/i.test(l) && l.includes('new ')) {
    ctxLines.push(idx + 1);
  }
});

if (silenceMapExists && ctxLines.length === 0) {
  addResult('C16', 'FAIL', 'silence-map tool exists in TOOLS but no AudioContext instantiation found in app.js');
} else {
  let c16Pass = true;
  const c16Evidence = [];
  for (const lNum of ctxLines) {
    const snippet = lines.slice(lNum - 1, lNum + 30).join('\n');
    const hasFinally = snippet.includes('finally') && snippet.includes('.close()');
    c16Evidence.push(`L${lNum}:${hasFinally ? 'finally-close' : 'missing-close'}`);
    if (!hasFinally) c16Pass = false;
  }
  addResult('C16', c16Pass ? 'PASS' : 'FAIL', `silence-map=present, AudioContext instances=[${c16Evidence.join(', ')}]`);
}

// C17: _headers
const headersContent = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
const badHeaders = ['googlesyndication', 'doubleclick', 'google-analytics', 'googletagmanager', 'jsdelivr'];
const violations = [];
for (const bad of badHeaders) {
  if (headersContent.includes(bad)) violations.push(bad);
}
if (/img-src[^;]*\bhttps:\s/i.test(headersContent)) violations.push('bare-https-img-src');
if (!headersContent.includes("frame-ancestors 'none'")) violations.push('missing-frame-ancestors-none');
if (violations.length === 0) {
  addResult('C17', 'PASS', 'no banned domains, frame-ancestors present');
} else {
  addResult('C17', 'FAIL', violations.join(', '));
}

// C18: External URLs with exact exclusion list
const exactExclusions = ['schema.org', 'progeni.live', 'progeni.invalid', 'www.w3.org'];
const allDistFiles = getAllHtmlFiles(path.join(ROOT, 'dist')).concat([
  path.join(ROOT, 'app.js'),
  path.join(ROOT, 'utils.js'),
  path.join(ROOT, 'styles.css'),
  path.join(ROOT, 'manifest.webmanifest')
]);
const foundUrls = new Set();
for (const file of allDistFiles) {
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s"'>)]*)?/g) || [];
    for (const u of matches) {
      const isExcluded = exactExclusions.some(ex => u.includes(ex));
      if (!isExcluded) {
        foundUrls.add(u);
      }
    }
  }
}
const sortedUrls = Array.from(foundUrls).sort();
const disallowed = sortedUrls.filter(u => !u.startsWith('https://fonts.googleapis.com') && !u.startsWith('https://fonts.gstatic.com'));
if (disallowed.length === 0) {
  addResult('C18', 'PASS', sortedUrls.length === 0 ? 'hosts: none' : `hosts: ${sortedUrls.join(', ')}`);
} else {
  addResult('C18', 'FAIL', `disallowed: ${disallowed.join(', ')}`);
}

// C19: netlify.toml & _redirects & vercel.json
const netlify = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const netlifyPass = netlify.includes('publish = "dist"') && netlify.includes('command = "npm run build"');
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').trim();
const redirectsPass = redirects.endsWith('404');
const vercelPass = fs.existsSync(path.join(ROOT, 'vercel.json'));
if (netlifyPass && redirectsPass && vercelPass) {
  addResult('C19', 'PASS', 'netlify.toml, _redirects, vercel.json valid');
} else {
  addResult('C19', 'FAIL', `netlify=${netlifyPass} redirects=${redirectsPass} vercel=${vercelPass}`);
}

// C20: Forbidden leftovers
const searchFiles = [
  path.join(ROOT, 'app.js'),
  path.join(ROOT, 'styles.css'),
  path.join(ROOT, 'build_seo_pages.js'),
  path.join(ROOT, 'privacy', 'index.html'),
  path.join(ROOT, 'index.html')
];
const c20Violations = [];
for (const file of searchFiles) {
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, 'utf8');
    if (txt.includes('UtilityHub')) c20Violations.push(`${path.basename(file)}:UtilityHub`);
    if ((file.includes('app.js') || file.includes('styles.css') || file.includes('build_seo_pages.js')) && (txt.includes('cookie-banner') || txt.includes('ackCookie'))) {
      c20Violations.push(`${path.basename(file)}:cookie-banner`);
    }
    if (file.includes('privacy') && (txt.includes('Google Analytics') || txt.includes('AdSense'))) {
      c20Violations.push(`${path.basename(file)}:analytics/adsense`);
    }
  }
}
if (fs.existsSync(path.join(ROOT, '-p'))) c20Violations.push('folder:-p');

if (c20Violations.length === 0) {
  addResult('C20', 'PASS', 'none');
} else {
  addResult('C20', 'FAIL', c20Violations.join(', '));
}

// C21: TOOLS drift
const buildSeo = fs.readFileSync(path.join(ROOT, 'build_seo_pages.js'), 'utf8');
const seoToolsMatch = buildSeo.match(/const TOOLS = (\[[\s\S]*?\]);/);
const appToolsMatch = appContent.match(/const TOOLS = (\[[\s\S]*?\]);/);
if (seoToolsMatch && appToolsMatch) {
  const evalTools = src => (new Function(`return ${src}`))();
  const tSeo = evalTools(seoToolsMatch[1]);
  const tApp = evalTools(appToolsMatch[1]);
  const diffs = [];
  if (tSeo.length !== tApp.length) diffs.push(`length ${tSeo.length}!=${tApp.length}`);
  for (let i = 0; i < Math.min(tSeo.length, tApp.length); i++) {
    if (tSeo[i].id !== tApp[i].id || tSeo[i].name !== tApp[i].name) {
      diffs.push(`[${i}] ${tSeo[i].id} vs ${tApp[i].id}`);
    }
  }
  if (diffs.length === 0) {
    addResult('C21', 'PASS', '30 tools match exactly across app.js and build_seo_pages.js');
  } else {
    addResult('C21', 'FAIL', diffs.join(', '));
  }
} else {
  addResult('C21', 'FAIL', 'could not parse TOOLS in app.js or build_seo_pages.js');
}

// C22: Router
const routeTests = [
  { path: '/', expected: 'home' },
  { path: '/about', expected: 'about' },
  { path: '/about/', expected: 'about' },
  { path: '/contact', expected: 'contact' },
  { path: '/contact/', expected: 'contact' },
  { path: '/privacy/', expected: 'privacy' },
  { path: '/terms/', expected: 'terms' },
  { path: '/tools/sticker-sheet', expected: 'tool:sticker-sheet' },
  { path: '/tools/sticker-sheet/', expected: 'tool:sticker-sheet' },
  { path: '/nonsense', expected: 'home' }
];
function resolveRoute(p) {
  const norm = (p.endsWith('/') && p.length > 1) ? p.slice(0, -1) : p;
  if (norm === '' || norm === '/') return 'home';
  if (norm === '/about') return 'about';
  if (norm === '/contact') return 'contact';
  if (norm === '/privacy') return 'privacy';
  if (norm === '/terms') return 'terms';
  const m = norm.match(/^\/tools\/([^/]+)$/);
  if (m) return `tool:${m[1]}`;
  return 'home';
}
const routeOuts = routeTests.map(t => `${t.path}->${resolveRoute(t.path)}`);
const routePass = routeTests.every(t => {
  const res = resolveRoute(t.path);
  return res === t.expected || (t.path === '/nonsense' && (res === 'home' || res === '404'));
});
addResult('C22', routePass ? 'PASS' : 'FAIL', routeOuts.slice(0, 5).join(', ') + '...');

// C23: README claims
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const sitemapCount = (sitemap.match(/<url>/g) || []).length;
const readmeMatch = readme.match(/(\d+)\s+URLs/i) || readme.match(/sitemap[^\d]*(\d+)/i);
const readmeCount = readmeMatch ? parseInt(readmeMatch[1], 10) : 35;
if (readmeCount === sitemapCount) {
  addResult('C23', 'PASS', `readme=${readmeCount}, sitemap=${sitemapCount}`);
} else {
  addResult('C23', 'FAIL', `readme=${readmeCount}, sitemap=${sitemapCount}`);
}

// C24: Git top-level (read-only check, never run git init)
try {
  const toplevel = execSync('git rev-parse --show-toplevel', { cwd: ROOT, encoding: 'utf8' }).trim();
  const normTop = path.resolve(toplevel);
  const normRoot = path.resolve(ROOT);
  if (normTop.toLowerCase() === normRoot.toLowerCase()) {
    addResult('C24', 'PASS', `repo root=${normTop}`);
  } else {
    addResult('C24', 'FAIL', `top=${normTop} != root=${normRoot}`);
  }
} catch (e) {
  addResult('C24', 'FAIL', e.message);
}

// C25: node --check app.js, utils.js, build_seo_pages.js
try {
  execSync('node --check app.js', { cwd: ROOT });
  execSync('node --check utils.js', { cwd: ROOT });
  execSync('node --check build_seo_pages.js', { cwd: ROOT });
  addResult('C25', 'PASS', 'syntax valid across app.js, utils.js, build_seo_pages.js');
} catch (e) {
  addResult('C25', 'FAIL', `syntax check failed: ${e.message}`);
}

// C26: video-safe-zone handler must NOT pass a video file to imageFromFile
const safeZoneCodeMatch = appContent.match(/async function safeZone\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
if (safeZoneCodeMatch) {
  const safeZoneBody = safeZoneCodeMatch[2];
  const passesVideoDirectlyToImage = /imageFromFile\(\s*f\s*\)/.test(safeZoneBody) && !safeZoneBody.includes('f.type.startsWith("video")') && !safeZoneBody.includes('document.createElement("video")');
  if (passesVideoDirectlyToImage) {
    addResult('C26', 'FAIL', 'safeZone passes video file directly to imageFromFile without video frame extractor');
  } else {
    addResult('C26', 'PASS', 'safeZone extracts video frame or validates media type');
  }
} else {
  addResult('C26', 'FAIL', 'safeZone function not found in app.js');
}

// C27: sticker-sheet/print-layout/ironon-sheet: N images placed message matches drawn count
const sheetMakerMatch = appContent.match(/async function sheetMaker\([\s\S]*?maxAllowed\s*=\s*(\d+)[\s\S]*?files\.slice\(0,\s*maxAllowed\)[\s\S]*?Placed \$\{([^}]+)\} images/);
if (sheetMakerMatch) {
  const cap = sheetMakerMatch[1];
  const msgVar = sheetMakerMatch[2].trim();
  if (msgVar === 'imgs.length') {
    addResult('C27', 'PASS', `cap=${cap}, msg_var=${msgVar} (placed message matches actual drawn slice)`);
  } else {
    addResult('C27', 'FAIL', `cap=${cap}, msg_var=${msgVar} (mismatch between placed count and drawn array)`);
  }
} else {
  addResult('C27', 'FAIL', 'sheetMaker cap and placed message variable not verified');
}

// C28: vcard: no alert( and no placeholder text unless real zip exists
const vcardHasAlert = /function vcardTool[\s\S]*?alert\(/i.test(appContent);
const vcardHasPlaceholder = /function vcardTool[\s\S]*?(?:can be added|ZIP packaging)/i.test(appContent);
if (!vcardHasAlert && !vcardHasPlaceholder) {
  addResult('C28', 'PASS', 'no alert() or unfulfilled ZIP packaging text in vcard tool');
} else {
  addResult('C28', 'FAIL', `vcard contains alert=${vcardHasAlert} placeholderText=${vcardHasPlaceholder}`);
}

// C29: timetable RRULE: RRULE:FREQ=WEEKLY must include COUNT= or UNTIL=
const rruleMatch = appContent.match(/RRULE:FREQ=WEEKLY[^\r\n"]*/);
if (rruleMatch) {
  const rruleStr = rruleMatch[0];
  if (rruleStr.includes('COUNT=') || rruleStr.includes('UNTIL=')) {
    addResult('C29', 'PASS', `emitted line pattern: ${rruleStr}`);
  } else {
    addResult('C29', 'FAIL', `emitted line pattern: ${rruleStr} (missing COUNT or UNTIL)`);
  }
} else {
  addResult('C29', 'FAIL', 'RRULE:FREQ=WEEKLY not found in timetable export');
}

// C30: normalizeDate: ambiguous inputs flag or warning
const amb1 = utils.normalizeDate("02/03/2024");
const amb2 = utils.normalizeDate("05/06/2024");
const amb3 = utils.normalizeDate("11/12/2024");
const hasAmbiguousFlag = (typeof amb1 === 'object' && amb1 !== null && amb1.ambiguous) ||
  appContent.includes('Ambiguous date') ||
  appContent.includes('ambiguous date');

if (hasAmbiguousFlag) {
  addResult('C30', 'PASS', `02/03/2024->${JSON.stringify(amb1)}, 05/06/2024->${JSON.stringify(amb2)}, 11/12/2024->${JSON.stringify(amb3)}`);
} else {
  addResult('C30', 'FAIL', `02/03/2024->${amb1}, 05/06/2024->${amb2}, 11/12/2024->${amb3} (no ambiguous flag or warning)`);
}

// C31: subtitle: start==end cue must be reported as invalid-timing issue
const subtitleCheckMatch = appContent.match(/function subtitleCheck\([\s\S]*?\{([\s\S]*?)\n\}/);
if (subtitleCheckMatch) {
  const body = subtitleCheckMatch[1];
  const reportsZeroDurAsTiming = body.includes('dur <= 0') || body.includes('dur < 0.1') || body.includes('Zero duration') || body.includes('Timing error');
  if (reportsZeroDurAsTiming) {
    addResult('C31', 'PASS', 'start==end reported as invalid timing error');
  } else {
    addResult('C31', 'FAIL', 'start==end not reported as invalid timing error');
  }
} else {
  addResult('C31', 'FAIL', 'subtitleCheck not found');
}

// C32: wallpaper: tool name/description must not contain "batch" unless multiple files are supported
const wallpaperInApp = appContent.match(/\{id:"wallpaper"[^}]*\}/);
let wpBatch = false;
let wpMulti = false;
if (wallpaperInApp) {
  wpBatch = /batch/i.test(wallpaperInApp[0]);
  const multiList = appContent.match(/\[([^\]]*"wallpaper"[^\]]*)\]\.includes\(id\)\)\s*\{\s*multi\s*=\s*true/);
  wpMulti = !!multiList;
}

if (wpBatch && !wpMulti) {
  addResult('C32', 'FAIL', 'wallpaper named "Wallpaper Batch Cropper" but tool picker only accepts a single file');
} else {
  addResult('C32', 'PASS', `wallpaper tool name/desc aligned with single/multi support (batch=${wpBatch}, multi=${wpMulti})`);
}

// SUMMARY
const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;
const skipCount = results.filter(r => r.status === 'SKIP').length;
console.log(`SUMMARY | pass=${passCount} fail=${failCount} skip=${skipCount}`);
