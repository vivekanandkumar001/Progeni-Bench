/*
 * Media Studio pure-core tests (docs/TOOLS_ROADMAP.md 3.2 video-thumbnails / 3.4 silence-map)
 * Run: node --test test/media.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  DBFS_MIN,
  fmtTimeHMSms,
  fmtTimeMSms,
  frameTimes,
  gridPlan,
  dbfsToAmp,
  ampToDbfs,
  combineChannels,
  scanWindows,
  toGaps,
  peakEnvelope,
  summarize
} = require("../media-studio.js").core;

const TOL = 1e-9;

/* ------------------------------------------------------------- frame times */

test("frameTimes spreads requested frames from 0 to duration − eps", () => {
  const t = frameTimes(10, 5, 0.04);
  assert.strictEqual(t.length, 5);
  assert.strictEqual(t[0], 0);
  assert.strictEqual(t[4], 9.96);
  assert.strictEqual(t[4], 10 - 0.04);
  assert.ok(t[4] < 10);
});

test("frameTimes never emits a frame at exactly the duration", () => {
  for (const duration of [0.5, 1, 12.345, 60, 3599.999, 5400]) {
    for (const count of [4, 12, 24, 48]) {
      const t = frameTimes(duration, count, 0.04);
      assert.strictEqual(t.length, count);
      for (const x of t) {
        assert.ok(x < duration, `frame ${x} must be < duration ${duration}`);
        assert.ok(x >= 0);
      }
    }
  }
});

test("frameTimes is monotonically non-decreasing", () => {
  const t = frameTimes(30, 12, 0.04);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1], `t[${i}] < t[${i - 1}]`);
});

test("frameTimes handles count 1, zero duration and the default eps", () => {
  assert.deepStrictEqual(frameTimes(10, 1), [0]);
  assert.deepStrictEqual(frameTimes(0, 12), [0]);
  assert.deepStrictEqual(frameTimes(NaN, 4), [0]);
  // default eps = 0.04
  const def = frameTimes(5, 3);
  assert.strictEqual(def[2], 4.96);
});

/* --------------------------------------------------------------- grid plan */

test("gridPlan computes a 3×4 sheet for 12 frames with labels", () => {
  const p = gridPlan(12, 3, 480, 270, 10, 24);
  assert.strictEqual(p.count, 12);
  assert.strictEqual(p.cols, 3);
  assert.strictEqual(p.rows, 4);
  assert.strictEqual(p.thumbW, 480);
  assert.strictEqual(p.thumbH, 270);
  assert.strictEqual(p.labelH, 24);
  assert.strictEqual(p.cellH, 294);
  assert.strictEqual(p.width, 10 * 4 + 3 * 480); // 1480
  assert.strictEqual(p.height, 10 * 5 + 4 * 294); // 1226
  assert.strictEqual(p.cells.length, 12);
});

test("gridPlan cell positions and label strips are laid out row-major", () => {
  const p = gridPlan(12, 3, 480, 270, 10, 24);
  const c0 = p.cells[0];
  assert.strictEqual(c0.col, 0);
  assert.strictEqual(c0.row, 0);
  assert.strictEqual(c0.thumbX, 10);
  assert.strictEqual(c0.thumbY, 10);
  assert.strictEqual(c0.labelY, 10 + 270);
  const c1 = p.cells[1];
  assert.strictEqual(c1.thumbX, 10 + (480 + 10));
  const c3 = p.cells[3];
  assert.strictEqual(c3.row, 1);
  assert.strictEqual(c3.thumbX, 10);
  assert.strictEqual(c3.thumbY, 10 + (294 + 10));
});

test("gridPlan omits the label strip when labelH is 0", () => {
  const p = gridPlan(12, 3, 480, 270, 10);
  assert.strictEqual(p.labelH, 0);
  assert.strictEqual(p.cellH, 270);
  assert.strictEqual(p.height, 10 * 5 + 4 * 270); // 1130
});

test("gridPlan clamps columns to the frame count and handles 0 padding", () => {
  const wide = gridPlan(4, 8, 100, 50, 5);
  assert.strictEqual(wide.cols, 4);
  assert.strictEqual(wide.rows, 1);
  assert.strictEqual(wide.width, 5 * 5 + 4 * 100); // 425
  assert.strictEqual(wide.height, 5 * 2 + 1 * 50); // 60

  const tight = gridPlan(5, 3, 100, 50, 0);
  assert.strictEqual(tight.width, 300);
  assert.strictEqual(tight.height, 100);
});

test("gridPlan degrades safely for zero frames and bad columns", () => {
  const empty = gridPlan(0, 3, 100, 50, 10);
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(empty.rows, 0);
  assert.deepStrictEqual(empty.cells, []);
  assert.strictEqual(empty.width, 120);
  assert.strictEqual(empty.height, 20);

  const badCols = gridPlan(6, 0, 100, 50, 10);
  assert.strictEqual(badCols.cols, 1);
  assert.strictEqual(badCols.rows, 6);
});

/* ------------------------------------------------------------- dBFS / level */

test("dbfsToAmp converts dBFS to linear amplitude", () => {
  assert.strictEqual(dbfsToAmp(0), 1);
  assert.strictEqual(dbfsToAmp(-20), 0.1);
  assert.ok(Math.abs(dbfsToAmp(-6) - 0.501187) < 1e-5);
  assert.ok(Math.abs(dbfsToAmp(-40) - 0.01) < TOL);
});

test("dbfsToAmp floors very low / invalid values at 0", () => {
  assert.strictEqual(dbfsToAmp(DBFS_MIN), 0);
  assert.strictEqual(dbfsToAmp(-Infinity), 0);
  assert.strictEqual(dbfsToAmp(null), 0);
  assert.strictEqual(dbfsToAmp(-999), 0);
  assert.strictEqual(DBFS_MIN, -120);
});

test("ampToDbfs inverts dbfsToAmp and returns -Infinity for silence", () => {
  assert.ok(Math.abs(ampToDbfs(1) - 0) < TOL);
  assert.ok(Math.abs(ampToDbfs(0.1) - (-20)) < 1e-6);
  assert.strictEqual(ampToDbfs(0), -Infinity);
  const round = ampToDbfs(dbfsToAmp(-33));
  assert.ok(Math.abs(round - (-33)) < 1e-6);
});

test("combineChannels handles left / right / mix / max and mono sources", () => {
  const l = new Float32Array([1, 0]);
  const r = new Float32Array([0, 1]);
  assert.deepStrictEqual(Array.from(combineChannels([l, r], "left")), [1, 0]);
  assert.deepStrictEqual(Array.from(combineChannels([l, r], "right")), [0, 1]);
  assert.deepStrictEqual(Array.from(combineChannels([l, r], "mix")), [0.5, 0.5]);
  const a = new Float32Array([0.1, -0.2]);
  const b = new Float32Array([-0.9, 0.3]);
  const max = Array.from(combineChannels([a, b], "max"));
  assert.ok(Math.abs(max[0] - -0.9) < 1e-6, "picks the larger magnitude (negative)");
  assert.ok(Math.abs(max[1] - 0.3) < 1e-6, "picks the larger magnitude (positive)");
  // a single channel is returned for any mode
  assert.deepStrictEqual(Array.from(combineChannels([l], "right")), [1, 0]);
  assert.strictEqual(combineChannels([], "mix").length, 0);
});

/* -------------------------------------------------------------- scan flags */

test("scanWindows flags one window per sample at windowSize 1 (RMS)", () => {
  const flags = scanWindows(new Float32Array([0, 0, 0, 1, 1, 1]), { windowSize: 1, threshold: 0.5 });
  assert.deepStrictEqual(flags, [1, 1, 1, 0, 0, 0]);
});

test("scanWindows respects the threshold boundary and partial final window", () => {
  const constHalf = scanWindows(new Float32Array([0.5, 0.5, 0.5]), { windowSize: 3, threshold: 0.5 });
  assert.deepStrictEqual(constHalf, [0]); // 0.5 < 0.5 is false -> not silent
  const above = scanWindows(new Float32Array([0.5, 0.5, 0.5]), { windowSize: 3, threshold: 0.6 });
  assert.deepStrictEqual(above, [1]);

  const partial = scanWindows(new Float32Array([0, 0, 0, 0, 1]), { windowSize: 2, threshold: 0.5 });
  assert.deepStrictEqual(partial, [1, 1, 0]);
});

test("scanWindows supports mean-absolute mode and handles empty input", () => {
  const samples = new Float32Array([1, 0]);
  assert.deepStrictEqual(scanWindows(samples, { windowSize: 2, threshold: 0.6, method: "ma" }), [1]);
  assert.deepStrictEqual(scanWindows(samples, { windowSize: 2, threshold: 0.6, method: "rms" }), [0]);
  assert.deepStrictEqual(scanWindows(new Float32Array(0), { windowSize: 4, threshold: 0.1 }), []);
});

/* ----------------------------------------------------------- gap extraction */

test("toGaps joins silent runs and applies the minimum gap length", () => {
  const flags = [1, 1, 0, 1, 1, 1, 0, 1];
  const gaps = toGaps(flags, 0.5, 1.0, 0);
  assert.strictEqual(gaps.length, 2);
  assert.strictEqual(gaps[0].start, 0);
  assert.strictEqual(gaps[0].end, 1);
  assert.strictEqual(gaps[0].duration, 1);
  assert.strictEqual(gaps[1].start, 1.5);
  assert.strictEqual(gaps[1].end, 3);
  assert.strictEqual(gaps[1].duration, 1.5);
  assert.strictEqual(gaps[1].windows, 3);
});

test("toGaps includes a run exactly at the minimum gap", () => {
  const gaps = toGaps([1, 1], 0.5, 1.0, 0);
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].duration, 1);
});

test("toGaps includes shorter runs when the minimum is lowered and offsets the start time", () => {
  const flags = [1, 1, 0, 1, 1, 1, 0, 1];
  const short = toGaps(flags, 0.5, 0.5, 0);
  assert.strictEqual(short.length, 3);
  assert.strictEqual(short[2].start, 3.5);
  assert.strictEqual(short[2].end, 4);
  assert.strictEqual(short[2].duration, 0.5);

  const offset = toGaps(flags, 0.5, 1.0, 10);
  assert.strictEqual(offset[0].start, 10);
  assert.strictEqual(offset[1].start, 11.5);
});

test("toGaps tolerates floating-point window durations and empty input", () => {
  const exact = toGaps([1, 1, 1], 0.1, 0.3, 0);
  assert.strictEqual(exact.length, 1);
  assert.ok(Math.abs(exact[0].duration - 0.3) < TOL);
  assert.deepStrictEqual(toGaps([], 0.25, 0.5, 0), []);
  assert.deepStrictEqual(toGaps([0, 0, 0], 0.25, 0.5, 0), []);
});

/* ------------------------------------------------------------- timecode fmt */

test("fmtTimeHMSms formats HH:MM:SS.mmm and fixes the >1h truncation bug", () => {
  assert.strictEqual(fmtTimeHMSms(0), "00:00:00.000");
  assert.strictEqual(fmtTimeHMSms(65.5), "00:01:05.500");
  assert.strictEqual(fmtTimeHMSms(3661.25), "01:01:01.250");
  assert.strictEqual(fmtTimeHMSms(5400), "01:30:00.000");   // was "90:00" before
  assert.strictEqual(fmtTimeHMSms(360000), "100:00:00.000");
});

test("fmtTimeHMSms clamps invalid input and carries rounding", () => {
  assert.strictEqual(fmtTimeHMSms(-5), "00:00:00.000");
  assert.strictEqual(fmtTimeHMSms(NaN), "00:00:00.000");
  assert.strictEqual(fmtTimeHMSms(59.9999), "00:01:00.000");
  assert.strictEqual(fmtTimeHMSms(3599.999), "00:59:59.999");
});

test("fmtTimeMSms renders compact MM:SS.mmm labels", () => {
  assert.strictEqual(fmtTimeMSms(0), "00:00.000");
  assert.strictEqual(fmtTimeMSms(65.5), "01:05.500");
  assert.strictEqual(fmtTimeMSms(3661.25), "61:01.250");
});

/* ------------------------------------------------------------ peak envelope */

test("peakEnvelope buckets min/max peaks per column", () => {
  const samples = new Float32Array([0, 1, -1, 0.5, -0.5, 0]);
  const env = peakEnvelope(samples, 3);
  assert.strictEqual(env.length, 3);
  assert.deepStrictEqual(env[0], { min: 0, max: 1 });
  assert.deepStrictEqual(env[1], { min: -1, max: 0.5 });
  assert.deepStrictEqual(env[2], { min: -0.5, max: 0 });
});

test("peakEnvelope with one bucket spans the whole signal", () => {
  const env = peakEnvelope(new Float32Array([0, 1, -1, 0.5, -0.5, 0]), 1);
  assert.deepStrictEqual(env[0], { min: -1, max: 1 });
});

test("peakEnvelope handles zero buckets and empty samples", () => {
  assert.deepStrictEqual(peakEnvelope(new Float32Array([1, 2]), 0), []);
  assert.deepStrictEqual(peakEnvelope(new Float32Array(0), 8), []);
  assert.deepStrictEqual(peakEnvelope(null, 8), []);
});

/* ----------------------------------------------------------------- summarize */

test("summarize totals silence and computes the percentage share", () => {
  const gaps = [
    { start: 0, end: 1, duration: 1 },
    { start: 2, end: 3, duration: 1 }
  ];
  const s = summarize(gaps, 10);
  assert.strictEqual(s.count, 2);
  assert.strictEqual(s.duration, 10);
  assert.strictEqual(s.totalSilence, 2);
  assert.strictEqual(s.percentSilence, 20);
  assert.strictEqual(s.longest, 1);
  assert.strictEqual(s.firstStart, 0);
});

test("summarize is safe with no gaps or unknown duration", () => {
  const empty = summarize([], 12);
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(empty.totalSilence, 0);
  assert.strictEqual(empty.percentSilence, 0);
  assert.strictEqual(empty.longest, 0);
  assert.strictEqual(empty.firstStart, null);

  const unknown = summarize([{ start: 0, end: 2, duration: 2 }], 0);
  assert.strictEqual(unknown.percentSilence, 0);
});
