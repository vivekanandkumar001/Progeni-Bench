/*
 * Subtitle Studio pure-core tests (docs/TOOLS_ROADMAP.md 4.1 subtitle-speed / 4.2 subtitle-linefix)
 * Run: node --test test/subtitle.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  fmtHmsMs,
  fmtSrtTime,
  parseTimecode,
  parseSrt,
  serializeSrt,
  stripTags,
  measure,
  tokenize,
  wrapTokens,
  hardCutToken,
  splitAtClause,
  rewrapCue,
  fixCues,
  detectOverlaps,
  cueMetrics,
  auditCues,
  reportCsv,
  issuesSrt,
  fixedSrt,
  normalizeProfile,
  wpmToCps,
  PROFILE_LIST
} = require("../subtitle-studio.js").core;

function cue(index, start, end, lines) { return { index: index, start: start, end: end, lines: lines }; }

/* --------------------------------------------------------------- timecodes */

test("fmtHmsMs renders HH:MM:SS.mmm including files longer than an hour", () => {
  assert.strictEqual(fmtHmsMs(0), "00:00:00.000");
  assert.strictEqual(fmtHmsMs(65.5), "00:01:05.500");
  assert.strictEqual(fmtHmsMs(3661.25), "01:01:01.250");
  assert.strictEqual(fmtHmsMs(5400), "01:30:00.000"); // was "90:00" with the old fmtTime
  assert.strictEqual(fmtHmsMs(360000), "100:00:00.000");
  assert.strictEqual(fmtHmsMs(-4), "00:00:00.000");
});

test("fmtSrtTime uses the comma required by SubRip", () => {
  assert.strictEqual(fmtSrtTime(1.5), "00:00:01,500");
  assert.strictEqual(fmtSrtTime(3661.25), "01:01:01,250");
});

test("parseTimecode accepts comma, dot, MM:SS and bare HH:MM:SS forms", () => {
  assert.strictEqual(parseTimecode("00:00:01,500"), 1.5);
  assert.strictEqual(parseTimecode("01:30:00.000"), 5400);
  assert.strictEqual(parseTimecode("00:02:03.4"), 123.4);
  assert.strictEqual(parseTimecode("3:07"), 187);
  assert.strictEqual(parseTimecode("00:00:05"), 5);
  assert.ok(Number.isNaN(parseTimecode("nope")));
  assert.ok(Number.isNaN(parseTimecode(null)));
  assert.strictEqual(parseTimecode("00:00:09,000 X1:10 X2:20"), 9); // trailing metadata ignored
});

/* ------------------------------------------------------------- SRT layer */

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:03,000",
  "Hello world",
  "",
  "2",
  "00:00:03,500 --> 00:00:04,250",
  "<i>Second</i> cue",
  ""
].join("\n");

test("parseSrt produces {index, start, end, lines, raw}", () => {
  const cues = parseSrt(SRT);
  assert.strictEqual(cues.length, 2);
  assert.strictEqual(cues[0].index, 1);
  assert.strictEqual(cues[0].start, 1);
  assert.strictEqual(cues[0].end, 3);
  assert.deepStrictEqual(cues[0].lines, ["Hello world"]);
  assert.strictEqual(typeof cues[0].raw, "string");
  assert.strictEqual(cues[1].index, 2);
  assert.strictEqual(cues[1].start, 3.5);
  assert.strictEqual(cues[1].end, 4.25);
  assert.deepStrictEqual(cues[1].lines, ["<i>Second</i> cue"]);
});

test("parse + serialize round-trip preserves timecodes and text lines", () => {
  const cues = parseSrt(SRT);
  const again = parseSrt(serializeSrt(cues));
  assert.strictEqual(again.length, cues.length);
  for (let i = 0; i < cues.length; i++) {
    assert.strictEqual(again[i].start, cues[i].start);
    assert.strictEqual(again[i].end, cues[i].end);
    assert.deepStrictEqual(again[i].lines, cues[i].lines);
  }
});

test("serializeSrt re-sequences numbering from 1 and keeps tags", () => {
  const out = serializeSrt([
    { index: 7, start: 1, end: 3, lines: ["A"] },
    { index: 9, start: 3, end: 4, lines: ["B"] }
  ]);
  assert.ok(out.startsWith("1\n00:00:01,000 --> 00:00:03,000\nA"));
  assert.ok(out.includes("\n\n2\n00:00:03,000 --> 00:00:04,000\nB"));
  assert.ok(serializeSrt(parseSrt(SRT)).includes("<i>Second</i> cue"));
});

test("parseSrt tolerates a BOM, CRLF and a missing index line", () => {
  const messy = "\uFEFF00:00:01,000 --> 00:00:02,000\r\nNo index here\r\n";
  const cues = parseSrt(messy);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].index, 1);
  assert.deepStrictEqual(cues[0].lines, ["No index here"]);
});

/* ------------------------------------------------------------- tag stripping */

test("stripTags removes positional and formatting tags but keeps the text", () => {
  assert.strictEqual(stripTags("<i>Hello</i> <b>world</b>"), "Hello world");
  assert.strictEqual(stripTags("{\\an8}Hi {\\pos(20,30)}there"), "Hi there");
  assert.strictEqual(measure("<i>Hello</i>"), 5);
});

test("tokenize keeps tags attached to their chunk and measures visible width", () => {
  const t = tokenize("<i>Hello</i> world");
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t[0].text, "<i>Hello</i>");
  assert.strictEqual(t[0].width, 5);
  assert.strictEqual(t[1].width, 5);
});

/* -------------------------------------------------------------- char metrics */

test("cueMetrics reports both raw and clean character counts plus CPS", () => {
  const m = cueMetrics(cue(1, 0, 2, ["<i>abcdefghij</i>"]));
  assert.strictEqual(m.chars, 10);
  assert.ok(m.rawChars > m.chars, "raw count must include the markup");
  assert.strictEqual(m.cps, 5);
  assert.strictEqual(m.duration, 2);
  assert.strictEqual(m.maxLine, 10);
});

/* ------------------------------------------------------------------ audit */

test("auditCues flags fast CPS, short duration and long lines", () => {
  const a = auditCues([
    cue(1, 0, 2, ["abcdefghij"]),
    cue(2, 2, 2.5, ["abcdefghijklmnopqrst"]),
    cue(3, 3, 10, ["x".repeat(50)])
  ], PROFILE_LIST[0]); // netflix
  assert.strictEqual(a.total, 3);
  assert.strictEqual(a.flagged, 2);
  assert.strictEqual(a.counts.cps, 1);
  assert.strictEqual(a.counts.duration, 1);
  assert.strictEqual(a.counts.line, 1);
  assert.strictEqual(a.rows[0].flag, false);
  assert.ok(a.rows[1].issues.some(function (x) { return x.type === "cps"; }));
  assert.strictEqual(a.rows[1].cps, 40);
  assert.ok(a.rows[2].issues.some(function (x) { return x.type === "line"; }));
});

test("auditCues reports zero/negative duration and too-many-lines separately", () => {
  const a = auditCues([
    cue(1, 5, 5, ["zero"]),
    cue(2, 6, 9, ["one", "two", "three"])
  ], PROFILE_LIST[0]);
  assert.strictEqual(a.rows[0].issues.some(function (x) { return x.type === "duration" && x.kind === "zero"; }), true);
  assert.strictEqual(a.counts.lines, 1);
});

test("auditCues computes average CPS and the longest cue across rows", () => {
  const a = auditCues([
    cue(1, 0, 1, ["abcdefghij"]), // 10 CPS
    cue(2, 1, 3, ["abcdefghijklmno"]) // 7.5 CPS, 2s long
  ], PROFILE_LIST[0]);
  assert.strictEqual(a.avgCps, 8.75);
  assert.strictEqual(a.longest.index, 2);
  assert.strictEqual(a.longest.duration, 2);
});

/* --------------------------------------------------------- overlap detection */

test("detectOverlaps reports the neighbouring cue index and overlapping range", () => {
  const pairs = detectOverlaps([
    cue(1, 0, 2, ["a"]),
    cue(2, 1.5, 3, ["b"]),
    cue(3, 4, 5, ["c"])
  ]);
  assert.strictEqual(pairs.length, 1);
  assert.strictEqual(pairs[0].fromIndex, 1);
  assert.strictEqual(pairs[0].toIndex, 2);
  assert.strictEqual(pairs[0].start, 1.5);
  assert.strictEqual(pairs[0].end, 2);
  assert.strictEqual(pairs[0].duration, 0.5);
});

test("detectOverlaps finds overlaps even when cues are out of order", () => {
  const pairs = detectOverlaps([cue(1, 3, 5, ["a"]), cue(2, 0, 4, ["b"])]);
  assert.strictEqual(pairs.length, 1);
  assert.strictEqual(pairs[0].fromIndex, 2);
  assert.strictEqual(pairs[0].toIndex, 1);
});

test("auditCues attaches the overlap issue with neighbour and HH:MM:SS.mmm range", () => {
  const a = auditCues([cue(1, 0, 2, ["a"]), cue(2, 1.5, 3, ["b"])], PROFILE_LIST[0]);
  assert.strictEqual(a.counts.overlap, 1);
  const iss = a.rows[1].issues.filter(function (x) { return x.type === "overlap"; });
  assert.strictEqual(iss.length, 1);
  assert.strictEqual(iss[0].neighbor, 1);
  assert.strictEqual(iss[0].range.start, 1.5);
  assert.ok(iss[0].detail.includes("overlaps cue #1"));
  assert.ok(iss[0].detail.includes("00:00:01.500"));
});

/* ---------------------------------------------------------------- profiles */

test("normalizeProfile clamps custom limits and wpmToCps derives BBC's CPS", () => {
  const p = normalizeProfile({ id: "custom", cps: 999, minDuration: -2, maxCharsPerLine: 500, maxLines: 9 });
  assert.strictEqual(p.cps, 60);
  assert.strictEqual(p.minDuration, 0);
  assert.strictEqual(p.maxCharsPerLine, 120);
  assert.strictEqual(p.maxLines, 6);
  assert.strictEqual(wpmToCps(180), 18);
  assert.strictEqual(normalizeProfile(PROFILE_LIST[1]).cps, 18);
});

/* -------------------------------------------------------------- wrapping */

test("wrapTokens greedily packs tokens and never exceeds the width", () => {
  const lines = wrapTokens(tokenize("one two three four five"), 11);
  assert.deepStrictEqual(lines, ["one two", "three four", "five"]);
  lines.forEach(function (l) { assert.ok(measure(l) <= 11); });
});

test("wrapTokens hard-cuts a token longer than the width", () => {
  assert.deepStrictEqual(wrapTokens(tokenize("abcdefghijklmnopqrstuvwxyz"), 10), ["abcdefghij", "klmnopqrst", "uvwxyz"]);
});

test("hardCutToken splits over-long tokens and preserves embedded tags", () => {
  assert.deepStrictEqual(hardCutToken("abcdefghijkl", 5), ["abcde", "fghij", "kl"]);
  const pieces = hardCutToken("ab<i>cd</i>efghij", 5);
  assert.strictEqual(pieces.join("").replace(/<[^>]*>/g, ""), "abcdefghij");
  assert.ok(pieces.join("").includes("<i>")); // the tag survived the cut
  pieces.forEach(function (p) { assert.ok(stripTags(p).length <= 5); });
});

test("wrapTokens keeps zero-width tag tokens attached without extra spaces", () => {
  assert.deepStrictEqual(wrapTokens(tokenize("{\\an8}Hello world"), 20), ["{\\an8}Hello world"]);
});

/* ------------------------------------------------------- clause + two-pass */

test("splitAtClause breaks at the punctuation nearest the midpoint", () => {
  assert.deepStrictEqual(splitAtClause("Count the stars, then count them all again.", 30), ["Count the stars,", "then count them all again."]);
  assert.deepStrictEqual(splitAtClause("Short line", 30), ["Short line"]);
  assert.strictEqual(splitAtClause("no punctuation anywhere at all in this line", 10).length, 1);
});

test("rewrapCue splits at a clause punctuation near the midpoint rather than greedily", () => {
  const out = rewrapCue(["Count the stars, then count them all again."], 30, 2);
  assert.deepStrictEqual(out, ["Count the stars,", "then count them all again."]);
  out.forEach(function (l) { assert.ok(measure(l) <= 30); });
});

test("rewrapCue obeys the character width and the line cap", () => {
  const out = rewrapCue(["one two three four five six seven eight nine ten"], 12, 3);
  assert.ok(out.length <= 3);
  assert.strictEqual(out.join(" "), "one two three four five six seven eight nine ten");
});

test("rewrapCue folds into a single line when maxLines is 1", () => {
  assert.deepStrictEqual(rewrapCue(["one two three four five"], 5, 1), ["one two three four five"]);
});

test("rewrapCue hard-cuts a token that cannot fit the limit", () => {
  assert.deepStrictEqual(rewrapCue(["abcdefghijklmnopqrstuvwxyz"], 10, 3), ["abcdefghij", "klmnopqrst", "uvwxyz"]);
});

test("rewrapCue preserves <i> and {\\an8} tags as anchored spans", () => {
  const out = rewrapCue(["{\\an8}One two three four five six"], 10, 3);
  assert.ok(out[0].startsWith("{\\an8}"));
  assert.ok(out.join(" ").indexOf("One") >= 0);
  const ital = rewrapCue(["<i>Hello world</i> this is a test"], 10, 3);
  assert.strictEqual(ital.join(" "), "<i>Hello world</i> this is a test");
});

/* ----------------------------------------------------------------- fixCues */

test("fixCues returns {before, after, changed} per cue and leaves timecodes alone", () => {
  const cues = [
    cue(1, 1, 3, ["Count the stars, then count them all again."]),
    cue(2, 3, 5, ["Short."])
  ];
  const fixed = fixCues(cues, { maxChars: 30, maxLines: 2, preserveTags: true });
  assert.strictEqual(fixed.length, 2);
  assert.deepStrictEqual(fixed[0].before, ["Count the stars, then count them all again."]);
  assert.deepStrictEqual(fixed[0].after, ["Count the stars,", "then count them all again."]);
  assert.strictEqual(fixed[0].changed, true);
  assert.strictEqual(fixed[1].changed, false);
  assert.ok(fixedSrt(cues, { maxChars: 30, maxLines: 2 }).includes("00:00:01,000 --> 00:00:03,000"));
});

test("fixCues flags hard-cut tokens and strips tags when preserveTags is off", () => {
  const long = cue(1, 0, 2, ["See https://example.com/a/very/long/path/that/never/ends"]);
  assert.strictEqual(fixCues([long], { maxChars: 20, maxLines: 2 })[0].hardCut, true);

  const tagged = cue(1, 0, 2, ["<i>Hello</i> world"]);
  assert.deepStrictEqual(fixCues([tagged], { maxChars: 40, maxLines: 2, preserveTags: false })[0].after, ["Hello world"]);
  assert.ok(fixCues([tagged], { maxChars: 40, maxLines: 2, preserveTags: true })[0].after.join(" ").includes("<i>Hello</i>"));
});

/* --------------------------------------------------------- CSV / issues SRT */

test("reportCsv writes a header plus one row per cue with overlap detail", () => {
  const a = auditCues([cue(1, 0, 2, ["a"]), cue(2, 1.5, 3, ["b"])], PROFILE_LIST[0]);
  const csv = reportCsv(a);
  assert.strictEqual(csv.split("\r\n")[0], "Cue,Start,End,Duration (s),Lines,Chars clean,Chars raw,CPS,Max line,Flagged,Issues");
  assert.ok(csv.includes("OVERLAP vs #1"));
  assert.ok(csv.includes("00:00:01.500"));
});

test("issuesSrt appends NOTE comments for flagged cues only", () => {
  const cues = [cue(1, 0, 2, ["a"]), cue(2, 1.5, 3, ["b"])];
  const a = auditCues(cues, PROFILE_LIST[0]);
  const srt = issuesSrt(cues, a);
  assert.ok(srt.includes("NOTE [OVERLAP] cue #2"));
  assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:02,000"));
  assert.ok(!srt.includes("NOTE [OVERLAP] cue #1"));
});
