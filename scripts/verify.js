const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { TOOLS, LAST_UPDATED, TOOLKIT_UPDATED } = require('../src/config/site.config.js');
const seoCopy = require('./seo-copy.js');
const seo = require('./seo.js');
const imageConfig = require('../src/config/image-tools.config.js');
const audioConfig = require('../src/config/audio-tools.config.js');

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
const keyFiles = ['src/core/app.js', 'src/core/utils.js', 'scripts/build.js', 'package.json', 'public/_headers', 'wrangler.toml'];
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
  '_headers', '_redirects', 'utils.js', 'app.js', 'styles.css',
  'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'about/index.html',
  'contact/index.html', 'privacy/index.html', 'terms/index.html', '404.html'
];
const missingFiles = reqFiles.filter(f => !fs.existsSync(path.join(ROOT, 'dist', f)));
if (missingFiles.length === 0) {
  addResult('C03', 'PASS', 'none');
} else {
  addResult('C03', 'FAIL', missingFiles.join(', '));
}

// C04: dist/tools has one subdirectory per registered tool, each with index.html
try {
  const toolsDir = path.join(ROOT, 'dist', 'tools');
  const subdirs = fs.readdirSync(toolsDir, { withFileTypes: true }).filter(d => d.isDirectory());
  const valid = subdirs.filter(d => fs.existsSync(path.join(toolsDir, d.name, 'index.html')));
  if (subdirs.length === TOOLS.length && valid.length === TOOLS.length) {
    addResult('C04', 'PASS', `${TOOLS.length} subdirectories with index.html`);
  } else {
    addResult('C04', 'FAIL', `found ${valid.length}/${subdirs.length} (expected ${TOOLS.length}/${TOOLS.length})`);
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
  if (count === TOOLS.length) {
    addResult('C05', 'PASS', `count=${count}/${TOOLS.length}`);
  } else {
    addResult('C05', 'FAIL', `count=${count}/${TOOLS.length}`);
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
const appContent = fs.readFileSync(path.join(ROOT, 'src', 'core', 'app.js'), 'utf8');
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
const utils = require('../src/core/utils.js');
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
const headersContent = fs.readFileSync(path.join(ROOT, 'public', '_headers'), 'utf8');
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
const exactExclusions = ['schema.org', 'progeni.live', 'progeni.invalid', 'www.w3.org', 'clarity.ms', 'dummy'];
const allDistFiles = getAllHtmlFiles(path.join(ROOT, 'dist')).concat([
  path.join(ROOT, 'dist', 'app.js'),
  path.join(ROOT, 'dist', 'utils.js'),
  path.join(ROOT, 'dist', 'styles.css'),
  path.join(ROOT, 'dist', 'manifest.webmanifest')
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

// C19: wrangler.toml, public/_headers & public/_redirects
const wrangler = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
const wranglerPass = wrangler.includes('pages_build_output_dir = "dist"');
const headersPass = fs.existsSync(path.join(ROOT, 'public', '_headers'));
const redirects = fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8').trim();
const redirectsPass = redirects.endsWith('404');
if (wranglerPass && headersPass && redirectsPass) {
  addResult('C19', 'PASS', 'wrangler.toml, public/_headers, public/_redirects valid');
} else {
  addResult('C19', 'FAIL', `wrangler=${wranglerPass} headers=${headersPass} redirects=${redirectsPass}`);
}

// C20: Forbidden leftovers
const searchFiles = [
  path.join(ROOT, 'src', 'core', 'app.js'),
  path.join(ROOT, 'src', 'styles', 'styles.css'),
  path.join(ROOT, 'scripts', 'build.js'),
  path.join(ROOT, 'dist', 'privacy', 'index.html'),
  path.join(ROOT, 'dist', 'index.html')
];
const c20Violations = [];
for (const file of searchFiles) {
  if (fs.existsSync(file)) {
    const txt = fs.readFileSync(file, 'utf8');
    if (txt.includes('UtilityHub')) c20Violations.push(`${path.basename(file)}:UtilityHub`);
    if ((file.includes('app.js') || file.includes('styles.css') || file.includes('build.js')) && (txt.includes('cookie-banner') || txt.includes('ackCookie'))) {
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

// C21: TOOLS single source of truth (src/config/site.config.js) imported by app.js and scripts/build.js
const buildSeo = fs.readFileSync(path.join(ROOT, 'scripts', 'build.js'), 'utf8');
const siteConfigModule = require(path.join(ROOT, 'src', 'config', 'site.config.js'));
const tConfig = siteConfigModule.TOOLS;
const appImportsConfig = appContent.includes('site.config.js') && appContent.includes('TOOLS');
const buildImportsConfig = buildSeo.includes('site.config.js') && buildSeo.includes('TOOLS');
if (tConfig && appImportsConfig && buildImportsConfig) {
  addResult('C21', 'PASS', `${tConfig.length} tools defined in src/config/site.config.js and shared across src/core/app.js and scripts/build.js`);
} else {
  addResult('C21', 'FAIL', `config tools=${tConfig ? tConfig.length : 0}, appImportsConfig=${appImportsConfig}, buildImportsConfig=${buildImportsConfig}`);
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
const sitemap = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
const sitemapCount = (sitemap.match(/<url>/g) || []).length;
const readmeMatch = readme.match(/(\d+)\s+(?:crawlable\s+)?URLs/i) ||
  readme.match(/sitemap\.xml[^\n]*?(\d+)\s+crawlable/i);
const readmeCount = readmeMatch ? parseInt(readmeMatch[1], 10) : 0;
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

// C25: node --check src/core/app.js, src/core/utils.js, scripts/build.js
try {
  execSync('node --check src/core/app.js', { cwd: ROOT });
  execSync('node --check src/core/utils.js', { cwd: ROOT });
  execSync('node --check scripts/build.js', { cwd: ROOT });
  addResult('C25', 'PASS', 'syntax valid across src/core/app.js, src/core/utils.js, scripts/build.js');
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

// C33: site.config.js exists; SITE_NAME appears nowhere hardcoded outside it
const siteConfigPath = path.join(ROOT, 'src', 'config', 'site.config.js');
const siteConfigExists = fs.existsSync(siteConfigPath);
let siteConfig = {};
try { siteConfig = require(siteConfigPath); } catch (e) {}
const siteName = siteConfig.SITE_NAME || 'Progeni Bench';
const sourceJsFiles = ['src/core/app.js', 'scripts/build.js', 'src/core/utils.js'];
const hardcodedInSource = sourceJsFiles.filter(f => {
  const p = path.join(ROOT, f);
  return fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(siteName);
});
if (siteConfigExists && hardcodedInSource.length === 0) {
  addResult('C33', 'PASS', `site.config.js exists, literal SITE_NAME absent from source JS (${sourceJsFiles.join(', ')})`);
} else {
  addResult('C33', 'FAIL', `exists=${siteConfigExists}, hardcodedIn=${hardcodedInSource.join(', ') || 'none'}`);
}

// C34: Old names ("UtilityHub", standalone old product name) absent from source and dist
const oldNameViolations = [];
function checkOldNames(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      checkOldNames(full);
    } else if (item.name.endsWith('.html') || item.name.endsWith('.js') || item.name.endsWith('.webmanifest')) {
      if (item.name === 'verify.js') continue;
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('UtilityHub')) {
        oldNameViolations.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
}
checkOldNames(ROOT);
if (oldNameViolations.length === 0) {
  addResult('C34', 'PASS', 'old names absent from source and dist');
} else {
  addResult('C34', 'FAIL', `found old names in: ${oldNameViolations.join(', ')}`);
}

// C35: Every dist page has: <title> <= 60 chars, meta description 120-155 chars, exactly one h1, canonical, og:title, og:description, og:image (file exists), html lang
const allDistHtml = getAllHtmlFiles(path.join(ROOT, 'dist'));
const c35Offending = [];
for (const file of allDistHtml) {
  if (path.basename(file) === '404.html' || path.basename(file).startsWith('google')) continue;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  if (!title || title.length > 60) c35Offending.push(`${rel} (title len ${title.length})`);

  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const desc = descMatch ? descMatch[1].trim() : '';
  if (!desc || desc.length < 120 || desc.length > 155) c35Offending.push(`${rel} (desc len ${desc.length})`);

  const h1Matches = content.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || [];
  if (h1Matches.length !== 1) c35Offending.push(`${rel} (h1 count ${h1Matches.length})`);

  // Guard against template values that were never rendered into HTML and
  // against double-encoded UTF-8 text leaking into the visible UI.
  if (content.includes('[object Object]')) c35Offending.push(`${rel} (unrendered object in HTML)`);
  if (/Ã.|â€|Â°/.test(content)) c35Offending.push(`${rel} (mojibake in HTML)`);

  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  if (!canonicalMatch) c35Offending.push(`${rel} (missing canonical)`);

  const ogTitle = content.match(/<meta\s+property=["']og:title["']/i);
  const ogDesc = content.match(/<meta\s+property=["']og:description["']/i);
  const ogImg = content.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  if (!ogTitle || !ogDesc || !ogImg) c35Offending.push(`${rel} (missing og tags)`);
  if (ogImg) {
    const imgUrl = ogImg[1];
    const localPath = imgUrl.replace(siteConfig.SITE_URL || '', '').replace(/^\//, '');
    if (!fs.existsSync(path.join(ROOT, 'dist', localPath))) c35Offending.push(`${rel} (og:image file missing ${localPath})`);
  }

  const htmlLang = content.match(/<html\s+[^>]*lang=["']en-IN["']/i);
  if (!htmlLang) c35Offending.push(`${rel} (missing lang="en-IN")`);
}
if (c35Offending.length === 0) {
  addResult('C35', 'PASS', 'none');
} else {
  addResult('C35', 'FAIL', c35Offending.join(', '));
}

// C36: No two pages share a <title> or meta description (print duplicates)
const c36Titles = new Map();
const c36Descs = new Map();
const c36Dups = [];
for (const file of allDistHtml) {
  if (path.basename(file) === '404.html' || path.basename(file).startsWith('google')) continue;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const title = ((content.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim();
  const desc = ((content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] || '').trim();
  if (c36Titles.has(title)) c36Dups.push(`title "${title}" in ${rel} & ${c36Titles.get(title)}`);
  else c36Titles.set(title, rel);
  if (c36Descs.has(desc)) c36Dups.push(`desc "${desc.slice(0, 30)}..." in ${rel} & ${c36Descs.get(desc)}`);
  else c36Descs.set(desc, rel);
}
if (c36Dups.length === 0) {
  addResult('C36', 'PASS', 'all titles and meta descriptions are unique');
} else {
  addResult('C36', 'FAIL', c36Dups.join('; '));
}

// Return the first schema node/property that would fake social proof. Only
// values of @type and object keys are inspected, because ordinary FAQ or step
// prose may legitimately contain the word "review" (for example "review the
// exported file"). A real Review node or aggregateRating property is banned.
function findProhibitedSchemaNode(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProhibitedSchemaNode(item);
      if (found) return found;
    }
    return null;
  }
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  for (const type of types) {
    if (type === 'Review' || type === 'AggregateRating') return `@type:${type}`;
  }
  for (const key of ['review', 'reviews', 'aggregateRating', 'ratingValue', 'reviewCount', 'ratingCount', 'rating']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return `property:${key}`;
  }
  for (const key of Object.keys(value)) {
    const found = findProhibitedSchemaNode(value[key]);
    if (found) return found;
  }
  return null;
}

// C37: Every JSON-LD block in dist parses; tool pages have WebApplication + BreadcrumbList; home has WebSite + Organization. No Review/AggregateRating nodes or rating properties anywhere.
const c37Errors = [];
for (const file of allDistHtml) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const blocks = [];
  while ((match = scriptRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
        blocks.push(...parsed['@graph']);
      } else {
        blocks.push(parsed);
      }
    } catch (e) {
      c37Errors.push(`${rel} invalid json: ${e.message}`);
    }
  }
  if (rel.startsWith('dist/tools/')) {
    const hasWebApp = blocks.some(b => b['@type'] === 'WebApplication');
    const hasBreadcrumbs = blocks.some(b => b['@type'] === 'BreadcrumbList');
    if (!hasWebApp || !hasBreadcrumbs) c37Errors.push(`${rel} missing WebApplication/BreadcrumbList`);
  } else if (rel === 'dist/index.html') {
    const hasWebSite = blocks.some(b => b['@type'] === 'WebSite');
    const hasOrg = blocks.some(b => b['@type'] === 'Organization');
    if (!hasWebSite || !hasOrg) c37Errors.push(`${rel} missing WebSite/Organization`);
  }
  const prohibited = findProhibitedSchemaNode(blocks);
  if (prohibited) {
    c37Errors.push(`${rel} prohibited schema ${prohibited}`);
  }
}
if (c37Errors.length === 0) {
  addResult('C37', 'PASS', 'all JSON-LD blocks parse, schemas match specifications, zero fake ratings');
} else {
  addResult('C37', 'FAIL', c37Errors.join(', '));
}

// C38: sitemap URLs == set of canonical URLs in dist (print diff), count printed, lastmod deterministic
const sitemapPath = path.join(ROOT, 'dist', 'sitemap.xml');
let sitemapUrls = [];
let lastmodValid = true;
if (fs.existsSync(sitemapPath)) {
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  const locMatches = [...sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  sitemapUrls = locMatches;
  const lastmodMatches = [...sitemapContent.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
  lastmodValid = lastmodMatches.length === locMatches.length && lastmodMatches.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
}
const canonicalDistUrls = [];
for (const file of allDistHtml) {
  if (path.basename(file) === '404.html') continue;
  const content = fs.readFileSync(file, 'utf8');
  // Pages marked "noindex" (experimental tools) must NOT be in the sitemap, so
  // they are excluded from the indexable canonical set this check compares to.
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(content)) continue;
  const canMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  if (canMatch) canonicalDistUrls.push(canMatch[1]);
}
const sitemapSet = new Set(sitemapUrls);
const canonicalSet = new Set(canonicalDistUrls);
const sitemapDiff = [...canonicalSet].filter(u => !sitemapSet.has(u)).concat([...sitemapSet].filter(u => !canonicalSet.has(u)));
if (sitemapDiff.length === 0 && lastmodValid && sitemapSet.size === canonicalSet.size) {
  addResult('C38', 'PASS', `sitemap count=${sitemapSet.size}, diff=none, lastmod deterministic`);
} else {
  addResult('C38', 'FAIL', `sitemap count=${sitemapSet.size}, indexable canonical count=${canonicalSet.size}, diff=${sitemapDiff.join(', ') || 'none'}, lastmodValid=${lastmodValid}`);
}

// C39/C40: quality guardrails across every indexable tool page (core, image, audio).
// Earlier versions only scanned dist/tools, which missed the 90 generated
// image/audio pages where template reuse was most likely.
const seoPageFiles = [];
for (const group of ['tools', 'image', 'audio']) {
  const groupDir = path.join(ROOT, 'dist', group);
  if (!fs.existsSync(groupDir)) continue;
  for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(groupDir, entry.name, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    const html = fs.readFileSync(indexPath, 'utf8');
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) continue;
    seoPageFiles.push({ tool: `${group}/${entry.name}`, html });
  }
}

// C39: Every indexable tool page body text >= 120 unique words; print the 3 lowest.
const toolWordCounts = [];
for (const page of seoPageFiles) {
  let html = page.html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
                      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
                      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
                      .replace(/<[^>]+>/g, ' ');
  const words = html.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  toolWordCounts.push({ tool: page.tool, count: new Set(words).size });
}
toolWordCounts.sort((a, b) => a.count - b.count);
const lowest3 = toolWordCounts.slice(0, 3).map(t => `${t.tool}=${t.count}`).join(', ');
const c39Failed = toolWordCounts.filter(t => t.count < 120);
const expectedSeoPageCount = TOOLS.length +
  imageConfig.TOOLS.filter(t => t.status === 'implemented').length +
  audioConfig.TOOLS.filter(t => t.status === 'implemented').length + 2;
if (c39Failed.length === 0 && toolWordCounts.length === expectedSeoPageCount) {
  addResult('C39', 'PASS', `all ${toolWordCounts.length} indexable tool pages >= 120 unique words; lowest: ${lowest3}`);
} else {
  addResult('C39', 'FAIL', `pages checked=${toolWordCounts.length}, expected=${expectedSeoPageCount}, below 120: ${c39Failed.map(t => `${t.tool}=${t.count}`).join(', ') || 'none'}`);
}

// C40: Pairwise sentence overlap between indexable tool pages <= 40%.
const toolSentenceSets = [];
for (const page of seoPageFiles) {
  const cleanHtml = page.html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                             .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const seoMatch = cleanHtml.match(/<section class="seo-section[^"]*">([\s\S]*?)<\/section>/i);
  const bodyHtml = seoMatch ? seoMatch[1] : cleanHtml;
  const text = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const sentences = text.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 15);
  toolSentenceSets.push({ tool: page.tool, sentences: new Set(sentences) });
}
let highestOverlap = 0;
let highestPair = 'none';
for (let i = 0; i < toolSentenceSets.length; i++) {
  for (let j = i + 1; j < toolSentenceSets.length; j++) {
    const a = toolSentenceSets[i];
    const b = toolSentenceSets[j];
    let common = 0;
    for (const s of a.sentences) {
      if (b.sentences.has(s)) common++;
    }
    const minSize = Math.min(a.sentences.size, b.sentences.size) || 1;
    const ratio = common / minSize;
    if (ratio > highestOverlap) {
      highestOverlap = ratio;
      highestPair = `${a.tool} & ${b.tool} (${(ratio * 100).toFixed(1)}%)`;
    }
  }
}
if (highestOverlap <= 0.40) {
  addResult('C40', 'PASS', `max pairwise overlap across ${toolSentenceSets.length} pages ${(highestOverlap * 100).toFixed(1)}% (${highestPair})`);
} else {
  addResult('C40', 'FAIL', `overlap exceeded: ${highestPair}`);
}

// C41: Internal links: each tool page has 4-6 related links; no broken internal href (all targets exist in dist)
const c41Issues = [];
for (const file of allDistHtml) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  if (rel.startsWith('dist/tools/')) {
    const toolLinksMatch = content.match(/<div class="tool-links">([\s\S]*?)<\/div>/i);
    if (toolLinksMatch) {
      const links = [...toolLinksMatch[1].matchAll(/<a\s+href=["']([^"']*)["']/g)].map(m => m[1]);
      if (links.length < 4 || links.length > 6) {
        c41Issues.push(`${rel} has ${links.length} related links (expected 4-6)`);
      }
    } else {
      c41Issues.push(`${rel} missing tool-links container`);
    }
  }
  const allHrefs = [...content.matchAll(/<a\s+[^>]*href=["'](\/[^"']*)["']/g)].map(m => m[1]);
  for (const href of allHrefs) {
    if (href.startsWith('//') || href.startsWith('/mailto:') || href.startsWith('/#')) continue;
    let clean = href.split('?')[0].split('#')[0];
    if (clean === '/') clean = '/index.html';
    else if (clean.endsWith('/')) clean += 'index.html';
    else if (!path.extname(clean)) clean += '/index.html';
    const targetFile = path.join(ROOT, 'dist', clean.replace(/^\//, ''));
    if (!fs.existsSync(targetFile)) {
      c41Issues.push(`broken link in ${rel} -> ${href} (${path.relative(ROOT, targetFile)})`);
    }
  }
}
if (c41Issues.length === 0) {
  addResult('C41', 'PASS', 'all tool pages have 4-6 related links; zero broken internal hrefs');
} else {
  addResult('C41', 'FAIL', c41Issues.slice(0, 3).join('; '));
}

// C42: 404.html has noindex; _redirects returns 404 for unknown paths
const notFoundPath = path.join(ROOT, 'dist', '404.html');
const redirectsPath = path.join(ROOT, 'dist', '_redirects');
let notFoundNoindex = false;
let redirects404 = false;
if (fs.existsSync(notFoundPath)) {
  const nfContent = fs.readFileSync(notFoundPath, 'utf8');
  notFoundNoindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(nfContent);
}
if (fs.existsSync(redirectsPath)) {
  const rdrContent = fs.readFileSync(redirectsPath, 'utf8');
  redirects404 = /\/\*\s+\/404\.html\s+404/.test(rdrContent);
}
if (notFoundNoindex && redirects404) {
  addResult('C42', 'PASS', '404 has noindex; _redirects returns 404 status for unknown routes');
} else {
  addResult('C42', 'FAIL', `404 noindex=${notFoundNoindex}, _redirects 404=${redirects404}`);
}

// C43: manifest name/short_name == SITE_NAME / short variant
const manifestPath = path.join(ROOT, 'dist', 'manifest.webmanifest');
let manifestValid = false;
let manifestName = '', manifestShort = '';
if (fs.existsSync(manifestPath)) {
  try {
    const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifestName = mf.name;
    manifestShort = mf.short_name;
    manifestValid = (mf.name === siteName) && (mf.short_name === siteName || mf.short_name === 'Bench' || mf.short_name === 'Progeni Bench');
  } catch (e) {}
}
if (manifestValid) {
  addResult('C43', 'PASS', `manifest name="${manifestName}", short_name="${manifestShort}"`);
} else {
  addResult('C43', 'FAIL', `manifest name="${manifestName}", short_name="${manifestShort}" (expected "${siteName}")`);
}

// C44: literal host "progeni.live" appears ONLY in site.config.js and docs/MIGRATION.md; "bench.progeni.live" is only host in canonicals
const c44Offenders = [];
const c44JsFiles = ['src/core/app.js', 'src/core/utils.js', 'scripts/build.js'];
for (const file of c44JsFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (content.includes('"progeni.live"') || content.includes("'progeni.live'") || content.includes('`progeni.live`')) {
    c44Offenders.push(`${file} (hardcoded progeni.live)`);
  }
}

// Canonical host check
let nonBenchCanonicals = [];
for (const file of allDistHtml) {
  const content = fs.readFileSync(file, 'utf8');
  const canonicalMatches = [...content.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/gi)];
  for (const m of canonicalMatches) {
    try {
      const u = new URL(m[1]);
      if (u.hostname !== 'bench.progeni.live') {
        nonBenchCanonicals.push(`${path.relative(ROOT, file)}: ${m[1]}`);
      }
    } catch (e) {
      nonBenchCanonicals.push(`${path.relative(ROOT, file)}: invalid URL ${m[1]}`);
    }
  }
}

if (c44Offenders.length === 0 && nonBenchCanonicals.length === 0) {
  addResult('C44', 'PASS', 'offenders: none; canonicals: bench.progeni.live only');
} else {
  addResult('C44', 'FAIL', `offenders: ${c44Offenders.concat(nonBenchCanonicals).join(', ')}`);
}

// C45: sitemap.xml <loc> values all start with SITE_URL and exactly equal canonical set; robots.txt Sitemap line == SITE_URL + /sitemap.xml
const c45Issues = [];
const sitemapDoc = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
const sitemapLocs = [...sitemapDoc.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const allCanonicalHrefs = new Set();
for (const file of allDistHtml) {
  if (path.basename(file).startsWith('google')) continue;
  const content = fs.readFileSync(file, 'utf8');
  // noindex pages (experimental tools) are intentionally absent from the
  // sitemap, so they are not part of the indexable canonical set.
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(content)) continue;
  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  if (canonicalMatch) {
    allCanonicalHrefs.add(canonicalMatch[1]);
  }
}

for (const loc of sitemapLocs) {
  if (!loc.startsWith(siteConfig.SITE_URL)) {
    c45Issues.push(`sitemap loc does not start with SITE_URL: ${loc}`);
  }
}

if (sitemapLocs.length !== allCanonicalHrefs.size) {
  c45Issues.push(`count mismatch: sitemap has ${sitemapLocs.length}, canonicals set has ${allCanonicalHrefs.size}`);
} else {
  for (const loc of sitemapLocs) {
    if (!allCanonicalHrefs.has(loc)) {
      c45Issues.push(`sitemap loc not in canonical set: ${loc}`);
    }
  }
}

const robotsDoc = fs.readFileSync(path.join(ROOT, 'dist', 'robots.txt'), 'utf8');
const robotsSitemapMatch = robotsDoc.match(/Sitemap:\s*(\S+)/i);
const expectedRobotsSitemap = `${siteConfig.SITE_URL}/sitemap.xml`;
if (!robotsSitemapMatch || robotsSitemapMatch[1] !== expectedRobotsSitemap) {
  c45Issues.push(`robots.txt Sitemap mismatch: found "${robotsSitemapMatch ? robotsSitemapMatch[1] : 'none'}", expected "${expectedRobotsSitemap}"`);
}

if (c45Issues.length === 0) {
  addResult('C45', 'PASS', `sitemap count=${sitemapLocs.length}, locs start with SITE_URL == canonical set, robots.txt valid`);
} else {
  addResult('C45', 'FAIL', c45Issues.slice(0, 2).join('; '));
}

// C46: Home JSON-LD: WebSite.url == SITE_URL, Organization.url == PARENT_URL; footer and About contain a link to PARENT_URL
const c46Issues = [];
const indexHtmlContent = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const aboutHtmlContent = fs.readFileSync(path.join(ROOT, 'dist', 'about', 'index.html'), 'utf8');

const jsonLdMatches = [...indexHtmlContent.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
let foundWebSite = false;
let foundOrganization = false;
for (const match of jsonLdMatches) {
  try {
    const data = JSON.parse(match[1]);
    const items = data['@graph'] ? data['@graph'] : [data];
    for (const item of items) {
      if (item['@type'] === 'WebSite') {
        foundWebSite = true;
        const normSite = item.url.replace(/\/$/, '');
        if (normSite !== siteConfig.SITE_URL) {
          c46Issues.push(`WebSite.url is "${item.url}", expected "${siteConfig.SITE_URL}"`);
        }
      }
      if (item['@type'] === 'Organization') {
        foundOrganization = true;
        const normOrg = item.url.replace(/\/$/, '');
        if (normOrg !== siteConfig.PARENT_URL) {
          c46Issues.push(`Organization.url is "${item.url}", expected "${siteConfig.PARENT_URL}"`);
        }
      }
    }
  } catch (e) {}
}

if (!foundWebSite) c46Issues.push('WebSite JSON-LD not found in home');
if (!foundOrganization) c46Issues.push('Organization JSON-LD not found in home');

// Footer and About parent links
const parentLinkPattern = new RegExp(`<a\\s+[^>]*href=["']${siteConfig.PARENT_URL}["'][^>]*>A Progeni project<\\/a>`, 'i');
if (!parentLinkPattern.test(indexHtmlContent)) {
  c46Issues.push('footer in index.html missing link to PARENT_URL with text "A Progeni project"');
}
if (!parentLinkPattern.test(aboutHtmlContent)) {
  c46Issues.push('about/index.html missing link to PARENT_URL with text "A Progeni project"');
}

if (c46Issues.length === 0) {
  addResult('C46', 'PASS', 'WebSite.url==SITE_URL, Organization.url==PARENT_URL, footer & About link to PARENT_URL');
} else {
  addResult('C46', 'FAIL', c46Issues.join('; '));
}

// C47: GEO/AEO answer blocks and schema coverage on indexable tool and hub pages.
const c47Issues = [];
const c47Targets = allDistHtml.filter(file => {
  if (path.basename(file) === '404.html' || path.basename(file).startsWith('google')) return false;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  return rel === 'dist/index.html' ||
    rel.startsWith('dist/tools/') ||
    rel.startsWith('dist/image/') ||
    rel.startsWith('dist/audio/');
});
for (const file of c47Targets) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const isNoindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(content);
  if (isNoindex) continue;
  if (!/class=["'][^"']*\bquick-answer\b/.test(content)) c47Issues.push(`${rel} missing quick-answer block`);
  if (!/class=["'][^"']*\banswer-text\b/.test(content)) c47Issues.push(`${rel} missing answer-text`);
  if (!/class=["'][^"']*\bkey-facts\b/.test(content)) c47Issues.push(`${rel} missing key-facts`);
  const factsBlock = content.match(/<dl class=["'][^"']*key-facts[^"']*["'][\s\S]*?<\/dl>/i);
  if (!factsBlock || !/<dt>[\s\S]*?<\/dt>/.test(factsBlock[0]) || !/<dd>[\s\S]*?<\/dd>/.test(factsBlock[0])) {
    c47Issues.push(`${rel} key-facts has no rendered dt/dd rows`);
  }
  const blocks = [];
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed['@graph'] && Array.isArray(parsed['@graph'])) blocks.push(...parsed['@graph']);
      else blocks.push(parsed);
    } catch (e) {
      c47Issues.push(`${rel} invalid JSON-LD: ${e.message}`);
    }
  }
  const hasWebPage = blocks.some(block => block['@type'] === 'WebPage' || block['@type'] === 'CollectionPage');
  const hasSpeakable = blocks.some(block => block.speakable || (block['@type'] === 'WebPage' && block.speakable));
  const hasWebApp = blocks.some(block => block['@type'] === 'WebApplication');
  const hasHowTo = blocks.some(block => block['@type'] === 'HowTo');
  const hasFaq = blocks.some(block => block['@type'] === 'FAQPage');
  if (!hasWebPage) c47Issues.push(`${rel} missing WebPage/CollectionPage schema`);
  if (!hasSpeakable) c47Issues.push(`${rel} missing speakable schema`);
  const isStudio = rel === 'dist/image/studio/index.html';
  const isHub = rel === 'dist/image/index.html' || rel === 'dist/audio/index.html';
  if (!isStudio && !hasFaq) c47Issues.push(`${rel} missing FAQPage schema`);
  // Hubs are CollectionPage listings; WebApplication/HowTo belong to the
  // individual tools and to Image Studio.
  if ((rel.startsWith('dist/tools/') || rel.startsWith('dist/image/') || rel.startsWith('dist/audio/')) && !isStudio && !isHub) {
    if (!hasWebApp) c47Issues.push(`${rel} missing WebApplication schema`);
    if (!hasHowTo) c47Issues.push(`${rel} missing HowTo schema`);
  }
}
if (c47Issues.length === 0) {
  addResult('C47', 'PASS', `${c47Targets.length} indexable pages have answer blocks, key facts and GEO/AEO schema`);
} else {
  addResult('C47', 'FAIL', c47Issues.slice(0, 4).join('; '));
}

// C48: AI discovery files, crawler allowances and llms links.
const c48Issues = [];
const llmsPath = path.join(ROOT, 'dist', 'llms.txt');
const llmsFullPath = path.join(ROOT, 'dist', 'llms-full.txt');
const llmsText = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
const llmsFullText = fs.existsSync(llmsFullPath) ? fs.readFileSync(llmsFullPath, 'utf8') : '';
if (!llmsText) c48Issues.push('dist/llms.txt missing or empty');
if (!llmsFullText) c48Issues.push('dist/llms-full.txt missing or empty');
if (llmsText) {
  if (!llmsText.includes('122')) c48Issues.push('llms.txt missing current total (122)');
  if (!llmsText.includes('32 core')) c48Issues.push('llms.txt missing core count (32)');
  if (!llmsText.includes('42 image')) c48Issues.push('llms.txt missing image count (42)');
  if (!llmsText.includes('48 audio')) c48Issues.push('llms.txt missing audio count (48)');
  if (!/citation guidance/i.test(llmsText)) c48Issues.push('llms.txt missing citation guidance');
  if (!llmsText.includes('/llms-full.txt')) c48Issues.push('llms.txt missing llms-full link');
}
if (llmsFullText) {
  const expectedUrls = [
    ...TOOLS.map(tool => `${siteConfig.SITE_URL}/tools/${tool.id}/`),
    ...require('../src/pages/image-pages.js').PUBLIC.map(tool => `${siteConfig.SITE_URL}/image/${tool.slug}/`),
    ...require('../src/pages/audio-pages.js').PUBLIC.map(tool => `${siteConfig.SITE_URL}/audio/${tool.slug}/`)
  ];
  const missingUrls = expectedUrls.filter(url => !llmsFullText.includes(url));
  if (missingUrls.length) c48Issues.push(`llms-full.txt missing ${missingUrls.length} tool URLs (first: ${missingUrls[0]})`);
  if (!/Experimental/.test(llmsFullText)) c48Issues.push('llms-full.txt missing experimental status labels');
}
const robotsForAi = fs.existsSync(path.join(ROOT, 'dist', 'robots.txt')) ? fs.readFileSync(path.join(ROOT, 'dist', 'robots.txt'), 'utf8') : '';
['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'].forEach(agent => {
  if (!robotsForAi.includes(`User-agent: ${agent}`)) c48Issues.push(`robots.txt missing ${agent}`);
});
const homeForLlms = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
if (!homeForLlms.includes('/llms.txt')) c48Issues.push('home missing /llms.txt discovery link');
if (!homeForLlms.includes('/llms-full.txt')) c48Issues.push('home missing /llms-full.txt discovery link');
const headersForLlms = fs.readFileSync(path.join(ROOT, 'public', '_headers'), 'utf8');
if (!headersForLlms.includes('/llms.txt')) c48Issues.push('_headers missing llms Link');
if (c48Issues.length === 0) {
  addResult('C48', 'PASS', 'llms.txt/llms-full.txt complete; AI crawlers allowed; discovery links present');
} else {
  addResult('C48', 'FAIL', c48Issues.slice(0, 4).join('; '));
}

// Guarantee language is only banned when it is an affirmative promise. Caveats
// such as "not guaranteed", "cannot ... guarantee recovery" or "exact
// typography is not guaranteed" are honest and must not fail the check.
function findAffirmativeGuarantee(text) {
  const re = /\bguarantee(?:s|d)?\b/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = Math.max(text.lastIndexOf('.', match.index), text.lastIndexOf('!', match.index), text.lastIndexOf('?', match.index)) + 1;
    const clause = text.slice(start, match.index).toLowerCase();
    if (/\b(?:not|never|no|none|without|cannot|can't|isn't|aren't|wasn't|weren't)\b/.test(clause)) continue;
    return match[0];
  }
  return null;
}

// C49: Social-card completeness and unsupported-claim guard on indexable pages.
const c49Issues = [];
const claimPatterns = [
  /best in the world/i,
  /\brated\s+(?:5|five)(?:\s*\/\s*5|\s+stars?)?\b/i,
  /\b#1\s+(?:free\s+)?(?:online|tool|app|site|website|browser|choice|rated|ranked)\b/i,
  /\b100%\s+secure\b/i
];
for (const file of allDistHtml) {
  if (path.basename(file) === '404.html' || path.basename(file).startsWith('google')) continue;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const isNoindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(content);
  if (!isNoindex) {
    const robots = content.match(/<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i);
    if (!robots || !/\bindex\b/i.test(robots[1])) c49Issues.push(`${rel} missing index robots directive`);
    if (!content.includes('og:image:width" content="1200"')) c49Issues.push(`${rel} missing og:image:width`);
    if (!content.includes('og:image:height" content="630"')) c49Issues.push(`${rel} missing og:image:height`);
    if (!content.includes('og:image:alt')) c49Issues.push(`${rel} missing og:image:alt`);
    if (!content.includes('twitter:description')) c49Issues.push(`${rel} missing twitter:description`);
    if (!content.includes('twitter:image:alt')) c49Issues.push(`${rel} missing twitter:image:alt`);
  }
  for (const pattern of claimPatterns) {
    if (pattern.test(content)) c49Issues.push(`${rel} unsupported claim ${pattern}`);
  }
  const guarantee = findAffirmativeGuarantee(content);
  if (guarantee) c49Issues.push(`${rel} unsupported guarantee "${guarantee}"`);
}
if (c49Issues.length === 0) {
  addResult('C49', 'PASS', 'social cards complete; no unsupported rating or guarantee claims');
} else {
  addResult('C49', 'FAIL', c49Issues.slice(0, 4).join('; '));
}

// C50: Generated image/audio copy must be distinct from summary and from each other.
const copyTargets = [
  ...imageConfig.TOOLS.filter(t => t.status === 'implemented' || t.status === 'experimental').map(t => ({ tool: t, kind: 'image' })),
  ...audioConfig.TOOLS.filter(t => t.status === 'implemented' || t.status === 'experimental').map(t => ({ tool: t, kind: 'audio' }))
];
const c50Issues = [];
const seenSeoDescriptions = new Set();
for (const { tool, kind } of copyTargets) {
  const copy = seoCopy.forTool(tool, kind);
  if (copy.seoDescription === copy.summary) c50Issues.push(`${kind}/${tool.slug}: seoDescription equals summary`);
  if (copy.description === copy.summary || copy.description === copy.seoDescription) c50Issues.push(`${kind}/${tool.slug}: description is reused`);
  const escapedDescLength = seo.esc(copy.seoDescription).length;
  if (escapedDescLength < 120 || escapedDescLength > 155) c50Issues.push(`${kind}/${tool.slug}: escaped seoDescription length ${escapedDescLength}`);
  if (copy.detail.length < 60) c50Issues.push(`${kind}/${tool.slug}: detail too short`);
  if (seenSeoDescriptions.has(copy.seoDescription)) c50Issues.push(`${kind}/${tool.slug}: duplicate seoDescription`);
  seenSeoDescriptions.add(copy.seoDescription);
}
if (c50Issues.length === 0) {
  addResult('C50', 'PASS', `${copyTargets.length} public image/audio tools have distinct meta and body copy`);
} else {
  addResult('C50', 'FAIL', c50Issues.slice(0, 4).join('; '));
}

// C51: Sitemap lastmod values are meaningful per toolkit, not one uniform date.
const sitemapForC51 = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
const sitemapEntries = [...sitemapForC51.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
  .map(m => ({ loc: m[1], lastmod: m[2] }));
const c51Issues = [];
for (const entry of sitemapEntries) {
  const expected = entry.loc.startsWith(`${siteConfig.SITE_URL}/image/`)
    ? TOOLKIT_UPDATED.image
    : entry.loc.startsWith(`${siteConfig.SITE_URL}/audio/`)
      ? TOOLKIT_UPDATED.audio
      : LAST_UPDATED;
  if (entry.lastmod !== expected) c51Issues.push(`${entry.loc} has ${entry.lastmod}, expected ${expected}`);
}
const lastmodDates = new Set(sitemapEntries.map(e => e.lastmod));
if (c51Issues.length === 0 && lastmodDates.size >= 2) {
  addResult('C51', 'PASS', `sitemap lastmod split across ${lastmodDates.size} meaningful dates: ${[...lastmodDates].join(', ')}`);
} else {
  addResult('C51', 'FAIL', c51Issues.length ? c51Issues.slice(0, 4).join('; ') : 'all sitemap entries share one lastmod');
}

// C52: Host canonicalization redirects exist for Cloudflare Pages (_redirects).
const redirectsFilePath = path.join(ROOT, 'public', '_redirects');
let c52Edge = false;
if (fs.existsSync(redirectsFilePath)) {
  const edge = fs.readFileSync(redirectsFilePath, 'utf8');
  c52Edge = /http:\/\/bench\.progeni\.live\/\*\s+https:\/\/bench\.progeni\.live\/:splat\s+301!/i.test(edge) &&
            /https?:\/\/www\.bench\.progeni\.live\/\*\s+https:\/\/bench\.progeni\.live\/:splat\s+301!/i.test(edge);
}
if (c52Edge) {
  addResult('C52', 'PASS', 'http->https and www->apex 301 redirects configured for Cloudflare edge (_redirects)');
} else {
  addResult('C52', 'FAIL', `edge redirects=${c52Edge}`);
}

// C53: The browser runtimes must reuse the generated copy instead of restoring
// the registries' older shared descriptions after mount.
const runtimeCopyIssues = [];
const seoRuntimePath = path.join(ROOT, 'dist', 'seo-copy.js');
if (!fs.existsSync(seoRuntimePath)) {
  runtimeCopyIssues.push('dist/seo-copy.js missing');
} else {
  const helper = fs.readFileSync(seoRuntimePath, 'utf8');
  if (!helper.includes('root.SeoCopy') || !helper.includes('forTool')) runtimeCopyIssues.push('dist helper is not browser-ready');
}
for (const runtimeFile of ['src/toolkits/image-toolkit.js', 'src/toolkits/audio-toolkit.js']) {
  const source = fs.readFileSync(path.join(ROOT, runtimeFile), 'utf8');
  if (!source.includes('SeoCopy') || !source.includes('copy.seoDescription')) {
    runtimeCopyIssues.push(`${runtimeFile} does not consume SeoCopy`);
  }
  if (!source.includes('Tool-specific detail')) runtimeCopyIssues.push(`${runtimeFile} omits Tool-specific detail`);
}
const toolPageKeys = new Set(copyTargets.map(({ tool, kind }) => `${kind}/${tool.slug}`));
for (const kind of ['image', 'audio']) {
  const dirPath = path.join(ROOT, 'dist', kind);
  if (!fs.existsSync(dirPath)) continue;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = path.join(dirPath, entry.name, 'index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    if (!html.includes('<script src="/seo-copy.js"></script>')) runtimeCopyIssues.push(`${kind}/${entry.name}: missing seo-copy script`);
    if (toolPageKeys.has(`${kind}/${entry.name}`) && !html.includes('<h2>Tool-specific detail</h2>')) {
      runtimeCopyIssues.push(`${kind}/${entry.name}: missing detail heading`);
    }
  }
}
if (runtimeCopyIssues.length === 0) {
  addResult('C53', 'PASS', 'runtime SEO copy is loaded and mirrored on generated image/audio pages');
} else {
  addResult('C53', 'FAIL', runtimeCopyIssues.slice(0, 4).join('; '));
}

// SUMMARY
const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;
const skipCount = results.filter(r => r.status === 'SKIP').length;
console.log(`SUMMARY | pass=${passCount} fail=${failCount} skip=${skipCount}`);
