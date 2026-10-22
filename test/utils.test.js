const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esc,
  csvParse,
  csvOut,
  parseSRT,
  buildContactKey,
  filterBookmarkLinks,
  cleanSVG,
  parseVCF,
  normalizeDate
} = require('../utils.js');

test('a) esc() properly escapes HTML special characters and XSS payloads', () => {
  const payload = '<img src=x onerror=alert(1)>';
  assert.equal(esc(payload), '&lt;img src=x onerror=alert(1)&gt;');
  
  const entities = '"\'&<>';
  assert.equal(esc(entities), '&quot;&#39;&amp;&lt;&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('b) filterBookmarkLinks() drops javascript:, data:, file: URIs and preserves only http/https', () => {
  const rawLinks = [
    { href: 'javascript:alert(document.cookie)', text: 'Malicious Link' },
    { href: 'data:text/html,<script>alert(1)</script>', text: 'Data URI' },
    { href: 'file:///etc/passwd', text: 'Local File' },
    { href: 'https://example.com/safe-page', text: 'Safe HTTPS' },
    { href: 'http://insecure.example.com', text: 'Safe HTTP' },
    { href: '   https://trimmed.com/path  ', text: 'Trimmed Link' }
  ];

  const filtered = filterBookmarkLinks(rawLinks);
  assert.equal(filtered.length, 3);
  assert.equal(filtered[0].href, 'https://example.com/safe-page');
  assert.equal(filtered[1].href, 'http://insecure.example.com');
  assert.equal(filtered[2].href, '   https://trimmed.com/path  ');
});

test('c) buildContactKey() deduplicates on email/phone without dropping digitless emails', () => {
  // 1. Two different digitless emails must NOT collapse into the same key
  const row1 = ['Alice Smith', 'alice@example.com', ''];
  const row2 = ['Bob Jones', 'bob@work.org', ''];
  const key1 = buildContactKey(row1, 1, 2);
  const key2 = buildContactKey(row2, 1, 2);
  assert.notEqual(key1, key2);
  assert.equal(key1, 'alice@example.com');
  assert.equal(key2, 'bob@work.org');

  // 2. Same email with different case must collapse into the same key
  const row3 = ['Alice S.', 'ALICE@EXAMPLE.COM', ''];
  const key3 = buildContactKey(row3, 1, 2);
  assert.equal(key1, key3);

  // 3. Same phone with different formatting must collapse into the same key
  const rowPhone1 = ['Charlie', '', '(555) 123-4567'];
  const rowPhone2 = ['Charlie C.', '', '+1-555-123-4567'];
  const rowPhone3 = ['Charlie Custom', '', '555.123.4567'];
  assert.equal(buildContactKey(rowPhone1, 1, 2), '5551234567');
  assert.equal(buildContactKey(rowPhone3, 1, 2), '5551234567');

  // 4. Rows with no email or phone fall back to full row JSON
  const rowNoContact1 = ['Item A', '', ''];
  const rowNoContact2 = ['Item B', '', ''];
  assert.notEqual(buildContactKey(rowNoContact1, 1, 2), buildContactKey(rowNoContact2, 1, 2));
});

test('d) parseSRT() parses valid subtitles and calculates correct duration', () => {
  const srt = `1
00:00:01,000 --> 00:00:04,500
First line of caption

2
00:00:05,000 --> 00:00:08,000
Second subtitle line`;
  const parsed = parseSRT(srt);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].start, 1);
  assert.equal(parsed[0].end, 4.5);
  assert.equal(parsed[0].text, 'First line of caption');
  assert.equal(parsed[1].start, 5);
  assert.equal(parsed[1].end, 8);
});

test('e) cleanSVG() strips <script>, <foreignObject>, on* handlers, and dangerous hrefs', () => {
  const maliciousSVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org">
  <!-- Secret comment -->
  <inkscape:grid id="grid1"/>
  <rect width="100" height="100" fill="red" onload="alert('pwned')" onclick="fetch('//evil.com')"/>
  <a href="javascript:alert(1)"><text y="20">Click me</text></a>
  <a href="https://example.com"><circle r="10" cx="50" cy="50"/></a>
  <script>alert('XSS')</script>
  <script/>
  <SCRIPT>alert('UPPER')</SCRIPT>
  <foreignObject width="100" height="50">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <iframe src="javascript:alert(2)"></iframe>
    </body>
  </foreignObject>
  <foreignObject/>
  <FOREIGNOBJECT>x</FOREIGNOBJECT>
  <a href="javascript:alert(3)"><rect onclick="x()"/></a>
</svg>`;

  const cleaned = cleanSVG(maliciousSVG);
  assert.equal(/<script/i.test(cleaned), false);
  assert.equal(/foreignObject/i.test(cleaned), false);
  assert.equal(/onload=/i.test(cleaned), false);
  assert.equal(/onclick=/i.test(cleaned), false);
  assert.equal(/javascript:/i.test(cleaned), false);
  assert.equal(cleaned.includes('Secret comment'), false);
  assert.equal(cleaned.includes('inkscape:grid'), false);
  assert.equal(cleaned.includes('https://example.com'), true);
});

test('f) parseVCF() parses multiple vCards and handles RFC 6350 line folding', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
NOTE:This is a very long note that is folded 
 into two lines per RFC 6350.
TEL;TYPE=CELL:(555) 000-1111
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
EMAIL:jane@example.com
END:VCARD`;

  const cards = parseVCF(vcf);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].name, 'John Doe');
  assert.equal(cards[0].raw.includes('NOTE:This is a very long note that is folded into two lines per RFC 6350.'), true);
  assert.equal(cards[1].name, 'Jane Smith');
});

test('g) normalizeDate() correctly standardizes dates', () => {
  assert.equal(normalizeDate('2026-10-04', 'MM/DD/YYYY'), '10/04/2026');
  assert.equal(normalizeDate('2026-10-04', 'DD/MM/YYYY'), '04/10/2026');
  assert.equal(normalizeDate('10/04/2026', 'YYYY-MM-DD'), '2026-10-04');
  assert.equal(normalizeDate('25/12/2026', 'YYYY-MM-DD'), '2026-12-25');
});

test('h) csvParse() and csvOut() handle quotes, delimiters, and round-tripping', () => {
  const input = 'id,name,address\n1,"Doe, John","123 Main St,\nSuite 4"';
  const rows = csvParse(input);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], 'Doe, John');
  assert.equal(rows[1][2], '123 Main St,\nSuite 4');

  const serialized = csvOut(rows);
  const roundTripped = csvParse(serialized);
  assert.deepEqual(rows, roundTripped);
});
