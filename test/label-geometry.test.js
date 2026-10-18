/*
 * Label Studio pure-core tests (docs/LABELS_PLAN.md §7)
 * Run: node --test test/label-geometry.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const { TEMPLATES, SHEETS, parseTable, detectDelim, resolveLine, applyTransform, headerIndex, normalizeLine } = require("../label-studio.js");

const TOL = 0.02; // mm

test("every preset template grid closes to the sheet edge within 0.02 mm", () => {
  for (const t of TEMPLATES.filter(x => x.id !== "custom")) {
    const S = SHEETS[t.region];
    assert.ok(S, `${t.id} has a known sheet region`);
    const w = 2 * t.mX + t.cols * t.lw + (t.cols - 1) * t.gX;
    const h = 2 * t.mY + t.rows * t.lh + (t.rows - 1) * t.gY;
    assert.ok(Math.abs(w - S.w) <= TOL, `${t.id} width closes: ${w} vs ${S.w}`);
    assert.ok(Math.abs(h - S.h) <= TOL, `${t.id} height closes: ${h} vs ${S.h}`);
  }
});

test("Avery 5160 is exactly 3 x 10 of 1in x 2-5/8in labels", () => {
  const t = TEMPLATES.find(x => x.id === "avery5160");
  assert.strictEqual(t.cols * t.rows, 30);
  assert.ok(Math.abs(t.lw - 25.4 * 2.625) < 1e-6);
  assert.ok(Math.abs(t.lh - 25.4) < 1e-6);
});

test("Avery L7160 is 3 x 7 = 21 labels of 63.5 x 38.1 mm on A4", () => {
  const t = TEMPLATES.find(x => x.id === "l7160");
  assert.strictEqual(t.region, "a4");
  assert.strictEqual(t.cols * t.rows, 21);
  assert.strictEqual(t.lw, 63.5);
  assert.strictEqual(t.lh, 38.1);
  // 8 rows of 38.1 mm would not fit A4 (304.8 > 297) — regression guard
  assert.ok(t.rows * t.lh <= SHEETS.a4.h);
});

test("delimiter detection: tab, semicolon, pipe, comma", () => {
  assert.strictEqual(detectDelim("a\tb\tc"), "\t");
  assert.strictEqual(detectDelim("a;b;c"), ";");
  assert.strictEqual(detectDelim("a|b|c"), "|");
  assert.strictEqual(detectDelim("a,b,c"), ",");
});

test("parseTable: TSV rows split on tabs", () => {
  const t = parseTable("Name\tCity\nAda\tLondon\nGrace\tNYC");
  assert.deepStrictEqual(t, [["Name", "City"], ["Ada", "London"], ["Grace", "NYC"]]);
});

test("parseTable: semicolon rows (Excel EU export)", () => {
  const t = parseTable("Name;Zip;City\nAda;10115;Berlin");
  assert.deepStrictEqual(t, [["Name", "Zip", "City"], ["Ada", "10115", "Berlin"]]);
});

test("parseTable: quoted CSV with embedded commas and CRLF", () => {
  const t = parseTable('Name,City\r\n"Doe, Jane",Springfield\r\n');
  assert.deepStrictEqual(t, [["Name", "City"], ["Doe, Jane", "Springfield"]]);
});

test("parseTable: empty input returns []", () => {
  assert.deepStrictEqual(parseTable(""), []);
  assert.deepStrictEqual(parseTable("   \n  "), []);
});

test("resolveLine: case-insensitive header match with spaces/underscores normalized", () => {
  const headers = ["First Name", "ZIP_CODE"];
  assert.strictEqual(resolveLine("{{first name}}", ["Ada", "10115"], headers, 0, 1), "Ada");
  assert.strictEqual(resolveLine("{{zip code}}", ["Ada", "10115"], headers, 0, 1), "10115");
});

test("resolveLine: missing token resolves to empty and is reported once", () => {
  const un = new Set();
  const out = resolveLine("[{{Nope}}]", ["Ada"], ["First"], 0, 1, un);
  assert.strictEqual(out, "[]");
  assert.deepStrictEqual([...un], ["Nope"]);
});

test("resolveLine: {{seq}} counter and zero padding, {{seqTotal}}", () => {
  const headers = [];
  assert.strictEqual(resolveLine("{{seq}}", null, headers, 0, 8), "1");
  assert.strictEqual(resolveLine("{{seq}}", null, headers, 7, 8), "8");
  assert.strictEqual(resolveLine("{{seq:4}}", null, headers, 6, 8), "0007");
  assert.strictEqual(resolveLine("{{seqTotal}}", null, headers, 0, 8), "8");
  assert.strictEqual(resolveLine("{{ seq :3 }}", null, headers, 6, 8), "007");
});

test("resolveLine: manual mode (null row) collapses tokens, keeps literal text", () => {
  assert.strictEqual(resolveLine("Tel: {{Phone}}", null, [], 0, 1), "Tel: ");
  assert.strictEqual(resolveLine("Plain line", null, [], 0, 1), "Plain line");
});

test("resolveLine: empty tokens do not leave double spaces", () => {
  assert.strictEqual(resolveLine("{{City}}, {{State}} {{Zip}}", ["London", "", "SW1A"], ["City", "State", "Zip"], 0, 1), "London, SW1A");
  assert.strictEqual(resolveLine("{{Missing}}ok", [], [], 0, 1), "ok");
});

test("applyTransform: upper and title case", () => {
  assert.strictEqual(applyTransform("ada lovelace", "upper"), "ADA LOVELACE");
  assert.strictEqual(applyTransform("ada lovelace", "title"), "Ada Lovelace");
  assert.strictEqual(applyTransform("123 main st, apt 4b", "title"), "123 Main St, Apt 4b");
  assert.strictEqual(applyTransform("Keep AS is", "none"), "Keep AS is");
});

test("headerIndex is separator-insensitive", () => {
  assert.strictEqual(headerIndex(["First Name", "Last-Name"], "first_name"), 0);
  assert.strictEqual(headerIndex(["First Name", "Last-Name"], "last name"), 1);
  assert.strictEqual(headerIndex(["First Name"], "City"), -1);
});

test("normalizeLine clamps and defaults every field", () => {
  const l = normalizeLine({ tpl: 123, size: 999, bold: "yes", align: "weird", transform: "shout" });
  assert.strictEqual(l.tpl, "123");
  assert.strictEqual(l.size, 48);
  assert.strictEqual(l.bold, true);
  assert.strictEqual(l.align, "left");
  assert.strictEqual(l.transform, "none");
  const l2 = normalizeLine({ size: 2, align: "center", transform: "title" });
  assert.strictEqual(l2.size, 6);
  assert.strictEqual(l2.align, "center");
  assert.strictEqual(l2.transform, "title");
});
