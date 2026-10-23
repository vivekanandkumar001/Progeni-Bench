/*
 * Album Studio pure-core tests (docs/TOOLS_ROADMAP.md 2.5 / 2.6)
 * Run: node --test test/album.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  readExifDate,
  pickDate,
  itemDate,
  dayKey,
  monthKey,
  yearKey,
  groupByDay,
  groupByYearMonth,
  groupByYear,
  renamePattern,
  sanitizeTitle,
  extOf,
  baseOf,
  thumbPlan,
  parseInputDate,
  inputDate,
  DEFAULT_PATTERN,
  DEFAULT_THUMB_MAX
} = require("../album-studio.js").core;

/* ------------------------------------------------- hand-built minimal JPEG */

/* Build the TIFF block (byte order + IFD0 [+ Exif SubIFD] + ASCII strings). */
function buildTiff(opts) {
  const le = !!opts.le;
  const dateTime = opts.dateTime || "";
  const dateTimeOriginal = opts.dateTimeOriginal || "";
  const n0 = (dateTime ? 1 : 0) + (dateTimeOriginal ? 1 : 0);
  const ifd0Len = 2 + 12 * n0 + 4;
  const subOff = 8 + ifd0Len;
  const subLen = dateTimeOriginal ? 18 : 0;
  let dataOff = subOff + subLen;
  let dtOff = 0;
  let dtoOff = 0;
  if (dateTime) { dtOff = dataOff; dataOff += 20; }
  if (dateTimeOriginal) { dtoOff = dataOff; dataOff += 20; }

  const ab = new ArrayBuffer(dataOff);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);

  u8[0] = le ? 0x49 : 0x4D;
  u8[1] = le ? 0x49 : 0x4D;
  dv.setUint16(2, 0x002A, le);
  dv.setUint32(4, 8, le);

  dv.setUint16(8, n0, le);
  let e = 10;
  if (dateTime) {
    dv.setUint16(e, 0x0132, le);
    dv.setUint16(e + 2, 2, le);
    dv.setUint32(e + 4, 20, le);
    dv.setUint32(e + 8, dtOff, le);
    e += 12;
  }
  if (dateTimeOriginal) {
    dv.setUint16(e, 0x8769, le);
    dv.setUint16(e + 2, 4, le);
    dv.setUint32(e + 4, 1, le);
    dv.setUint32(e + 8, subOff, le);
    e += 12;
  }
  dv.setUint32(e, 0, le); // next IFD = none

  if (dateTimeOriginal) {
    dv.setUint16(subOff, 1, le);
    dv.setUint16(subOff + 2, 0x9003, le);
    dv.setUint16(subOff + 4, 2, le);
    dv.setUint32(subOff + 6, 20, le);
    dv.setUint32(subOff + 10, dtoOff, le);
    dv.setUint32(subOff + 14, 0, le);
  }

  const writeStr = (off, s) => {
    for (let i = 0; i < 20; i++) u8[off + i] = i < s.length ? s.charCodeAt(i) & 0xFF : 0;
  };
  if (dateTime) writeStr(dtOff, dateTime);
  if (dateTimeOriginal) writeStr(dtoOff, dateTimeOriginal);
  return u8;
}

/* Wrap a TIFF block in an APP1/"Exif\0\0" segment inside a JPEG SOI..EOI shell. */
function jpegWithExif(tiff) {
  const exifLen = 6 + tiff.length;
  const app1 = new Uint8Array(4 + exifLen);
  app1[0] = 0xFF;
  app1[1] = 0xE1;
  const segLen = exifLen + 2;
  app1[2] = (segLen >> 8) & 0xFF;
  app1[3] = segLen & 0xFF;
  app1[4] = 0x45; app1[5] = 0x78; app1[6] = 0x69; app1[7] = 0x66; app1[8] = 0; app1[9] = 0;
  app1.set(tiff, 10);
  const out = new Uint8Array(2 + app1.length + 2);
  out[0] = 0xFF;
  out[1] = 0xD8;
  out.set(app1, 2);
  out[out.length - 2] = 0xFF;
  out[out.length - 1] = 0xD9;
  return out;
}

/* ------------------------------------------------------------- EXIF reader */

test("readExifDate parses DateTimeOriginal (little-endian TIFF)", () => {
  const jpeg = jpegWithExif(buildTiff({ le: true, dateTimeOriginal: "2021:05:08 14:30:22" }));
  const d = readExifDate(jpeg);
  assert.ok(d instanceof Date);
  assert.strictEqual(d.getFullYear(), 2021);
  assert.strictEqual(d.getMonth(), 4);
  assert.strictEqual(d.getDate(), 8);
  assert.strictEqual(d.getHours(), 14);
  assert.strictEqual(d.getMinutes(), 30);
  assert.strictEqual(d.getSeconds(), 22);
});

test("readExifDate parses DateTimeOriginal (big-endian TIFF)", () => {
  const jpeg = jpegWithExif(buildTiff({ le: false, dateTimeOriginal: "1999:12:31 23:59:59" }));
  const d = readExifDate(jpeg.buffer); // accept an ArrayBuffer too
  assert.ok(d instanceof Date);
  assert.strictEqual(d.getFullYear(), 1999);
  assert.strictEqual(d.getMonth(), 11);
  assert.strictEqual(d.getDate(), 31);
  assert.strictEqual(d.getHours(), 23);
  assert.strictEqual(d.getMinutes(), 59);
});

test("readExifDate falls back to IFD0 DateTime when SubIFD is absent", () => {
  const jpeg = jpegWithExif(buildTiff({ le: true, dateTime: "2010:01:02 03:04:05" }));
  const d = readExifDate(jpeg);
  assert.ok(d instanceof Date);
  assert.strictEqual(d.getFullYear(), 2010);
  assert.strictEqual(d.getMonth(), 0);
  assert.strictEqual(d.getDate(), 2);
});

test("readExifDate prefers DateTimeOriginal over IFD0 DateTime", () => {
  const jpeg = jpegWithExif(buildTiff({
    le: false,
    dateTime: "2001:01:01 00:00:00",
    dateTimeOriginal: "2022:07:09 10:11:12"
  }));
  const d = readExifDate(jpeg);
  assert.strictEqual(d.getFullYear(), 2022);
  assert.strictEqual(d.getMonth(), 6);
  assert.strictEqual(d.getDate(), 9);
});

test("readExifDate returns null for non-JPEG and EXIF-less JPEG input", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  assert.strictEqual(readExifDate(png), null);
  assert.strictEqual(readExifDate(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA, 0, 2])), null);
  assert.strictEqual(readExifDate(null), null);
  assert.strictEqual(readExifDate(new Uint8Array([])), null);
});

test("readExifDate tolerates truncated / corrupt EXIF segments", () => {
  const jpeg = jpegWithExif(buildTiff({ le: true, dateTimeOriginal: "2020:02:02 12:00:00" }));
  // Truncated mid-APP1 (no room for a full segment) -> null, not a throw.
  assert.strictEqual(readExifDate(jpeg.slice(0, 8)), null);
  // Valid JPEG but the "Exif\0\0" signature is corrupted -> null.
  const broken = jpeg.slice();
  broken[6] = 0x00; // clobber the 'E' of "Exif\0\0"
  assert.strictEqual(readExifDate(broken), null);
  // Sanity: the untouched buffer still parses.
  assert.strictEqual(readExifDate(jpeg).getFullYear(), 2020);
});

/* --------------------------------------------------------------- pickDate */

test("pickDate prefers EXIF, then lastModified, then manual", () => {
  const exif = new Date(2021, 4, 8, 12, 0, 0);
  const a = pickDate({ lastModified: Date.UTC(2000, 0, 1) }, exif);
  assert.strictEqual(a.date, exif);
  assert.strictEqual(a.dateConfidence, "exif");

  const lm = Date.UTC(2015, 5, 15, 9, 30, 0);
  const b = pickDate({ lastModified: lm }, null);
  assert.strictEqual(b.date.getTime(), lm);
  assert.strictEqual(b.dateConfidence, "file");

  const c = pickDate({ lastModified: 0 }, null);
  assert.strictEqual(c.date, null);
  assert.strictEqual(c.dateConfidence, "manual");
});

test("itemDate honours manual override before date / lastModified", () => {
  const manual = new Date(2020, 0, 1, 12);
  assert.strictEqual(itemDate({ manualDate: manual, date: new Date(2019, 0, 1) }), manual);
  const d = new Date(2018, 3, 4);
  assert.strictEqual(itemDate({ date: d }), d);
  const lm = Date.UTC(2017, 2, 3);
  assert.strictEqual(itemDate({ lastModified: lm }).getTime(), lm);
  assert.strictEqual(itemDate({}), null);
});

/* ---------------------------------------------------------------- grouping */

test("groupByDay buckets by calendar day, counts, and sorts ascending", () => {
  const items = [
    { name: "c", date: new Date(2021, 4, 9, 10) },
    { name: "a", date: new Date(2021, 4, 8, 9) },
    { name: "b", date: new Date(2021, 4, 8, 18) },
    { name: "x", lastModified: 0 } // no usable date -> ignored
  ];
  const groups = groupByDay(items);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].key, "2021-05-08");
  assert.strictEqual(groups[0].count, 2);
  assert.deepStrictEqual(groups[0].items.map(i => i.name), ["a", "b"]);
  assert.strictEqual(groups[1].key, "2021-05-09");
  assert.strictEqual(groups[1].count, 1);
});

test("groupByYearMonth nests day groups and sums counts", () => {
  const items = [
    { date: new Date(2020, 0, 2) },
    { date: new Date(2020, 0, 2) },
    { date: new Date(2020, 0, 5) },
    { date: new Date(2021, 11, 24) }
  ];
  const months = groupByYearMonth(items);
  assert.strictEqual(months.length, 2);
  assert.strictEqual(months[0].key, "2020-01");
  assert.strictEqual(months[0].label, "January 2020");
  assert.strictEqual(months[0].count, 3);
  assert.strictEqual(months[0].days.length, 2);
  assert.strictEqual(months[0].days[0].count, 2);
  assert.strictEqual(months[1].key, "2021-12");
  assert.strictEqual(months[1].month, 12);
});

test("groupByYear builds the year -> month -> day tree", () => {
  const items = [
    { date: new Date(2019, 6, 4) },
    { date: new Date(2019, 6, 4) },
    { date: new Date(2022, 1, 1) }
  ];
  const years = groupByYear(items);
  assert.strictEqual(years.length, 2);
  assert.strictEqual(years[0].key, "2019");
  assert.strictEqual(years[0].count, 2);
  assert.strictEqual(years[0].months.length, 1);
  assert.strictEqual(years[0].months[0].days.length, 1);
  assert.strictEqual(years[1].year, 2022);
});

test("key helpers render zero-padded keys", () => {
  const d = new Date(2021, 4, 8);
  assert.strictEqual(dayKey(d), "2021-05-08");
  assert.strictEqual(monthKey(d), "2021-05");
  assert.strictEqual(yearKey(d), "2021");
  assert.strictEqual(dayKey(null), null);
});

/* ------------------------------------------------------------ rename pattern */

test("renamePattern uses the default YYYY/MM/YYYY-MM-DD_title.ext layout", () => {
  assert.strictEqual(DEFAULT_PATTERN, "YYYY/MM/YYYY-MM-DD_title.ext");
  const out = renamePattern({ y: 2021, m: 5, d: 8, title: "beach day", ext: "jpg" });
  assert.strictEqual(out, "2021/05/2021-05-08_beach day.jpg");
});

test("renamePattern supports a custom token order and strips the leading dot on ext", () => {
  const out = renamePattern({ y: 1999, m: 12, d: 1, title: "IMG_0001", ext: ".PNG", pattern: "YYYY-MM-DD_title.ext" });
  assert.strictEqual(out, "1999-12-01_IMG_0001.PNG");
});

test("renamePattern drops the separator when the title is empty", () => {
  const out = renamePattern({ y: 2020, m: 1, d: 2, title: "", ext: "jpeg" });
  assert.strictEqual(out, "2020/01/2020-01-02.jpeg");
});

test("renamePattern sanitizes path separators in the title", () => {
  assert.strictEqual(sanitizeTitle("a/b\\c:d*e?f"), "a_b_c_d_e_f");
  const out = renamePattern({ y: 2020, m: 6, d: 7, title: "../etc/passwd", ext: "jpg" });
  assert.ok(out.startsWith("2020/06/"));
  assert.strictEqual(out.indexOf(".."), -1);
  assert.strictEqual(out.indexOf("/etc"), -1);
});

test("extOf / baseOf split filenames safely", () => {
  assert.strictEqual(extOf("IMG_1234.JPG"), "jpg");
  assert.strictEqual(extOf("archive.tar.gz"), "gz");
  assert.strictEqual(extOf("noext"), "");
  assert.strictEqual(baseOf("holiday/IMG_1234.JPG"), "IMG_1234");
  assert.strictEqual(baseOf("holiday\\IMG_1234.JPG"), "IMG_1234");
  assert.strictEqual(baseOf(".hidden"), ".hidden");
});

/* --------------------------------------------------------------- thumb plan */

test("thumbPlan fits the longest side and never upscales", () => {
  const land = thumbPlan(4000, 3000, 400);
  assert.strictEqual(land.width, 400);
  assert.strictEqual(land.height, 300);
  const port = thumbPlan(3000, 4000, 400);
  assert.strictEqual(port.width, 300);
  assert.strictEqual(port.height, 400);
  const small = thumbPlan(100, 50, 400);
  assert.strictEqual(small.width, 100);
  assert.strictEqual(small.height, 50);
  assert.strictEqual(small.scale, 1);
  const sq = thumbPlan(200, 200, 100);
  assert.strictEqual(sq.width, 100);
  assert.strictEqual(sq.height, 100);
  assert.strictEqual(DEFAULT_THUMB_MAX, 400);
});

/* ------------------------------------------------------------- date inputs */

test("parseInputDate / inputDate round-trip a yyyy-mm-dd value", () => {
  const d = parseInputDate("2021-05-08");
  assert.strictEqual(d.getFullYear(), 2021);
  assert.strictEqual(d.getMonth(), 4);
  assert.strictEqual(d.getDate(), 8);
  assert.strictEqual(inputDate(d), "2021-05-08");
  assert.strictEqual(inputDate(null), "");
  assert.strictEqual(parseInputDate("nope"), null);
});
