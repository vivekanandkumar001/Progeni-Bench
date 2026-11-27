/*
 * Subtitle Studio — shared SRT engine for two tools (docs/TOOLS_ROADMAP.md 4.1 / 4.2):
 *
 *   mode "speed" — Subtitle Reading-Speed Checker (4.1)
 *        One shared SRT parse/serialize layer. Profile selector (Netflix 21 CPS,
 *        BBC ~180 WPM / 18 CPS, or Custom with editable CPS / minimum duration /
 *        max characters per line / max lines). Formatting tags (<i>, <b>, {\an8},
 *        {\pos(...)}) are stripped before measuring and both raw and clean counts
 *        are reported. The issue list covers OVERLAP cues — each row names the
 *        neighbouring cue index and the overlapping HH:MM:SS.mmm range — plus CPS,
 *        duration, zero/negative duration, long-line and too-many-lines flags.
 *        Exports a CSV issue report and an annotated ".issues.srt" sidecar with
 *        NOTE comments. "Fix line breaks" hands the text to mode "fix" through
 *        the localStorage key "subtitle-handoff" (and a link to the fixer page).
 *
 *   mode "fix" — Subtitle Line-Break Fixer (4.2)
 *        Two-pass rewrap: split at the sentence/clause punctuation nearest the
 *        midpoint, then greedy-wrap; tokens longer than the limit are hard-cut.
 *        Controls: max chars/line (20–60), max lines (1–3) and a preserve-tags
 *        toggle. <i>/{\an8} tags are kept as anchored spans instead of being
 *        flattened, and original timecodes are never touched. A diff-style
 *        preview highlights every changed cue with a changed-cues count, and the
 *        fixed SRT downloads with "send to speed checker" reverse hand-off.
 *
 * Shared pure core (parseSrt, serializeSrt, stripTags, fmtHmsMs, parseTimecode,
 * rewrapCue, splitAtClause, wrapTokens, fixCues, auditCues, detectOverlaps, ...)
 * is exported under SubtitleStudio.core for node --test (test/subtitle.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.SubtitleStudio.
 * Follows the conventions of media-studio.js / image-studio.js / label-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  /* ============================================================== pure core */

  function num(v, d) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : d;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function padNum(n, w) { return String(Math.trunc(Math.abs(n))).padStart(w, "0"); }

  /* -------------------------------------------------- timecode formatting */

  /* HH:MM:SS.mmm — used for every on-screen / CSV / NOTE reading (never
     truncates the hour component, so feature-length files stay readable). */
  let fmtHmsMs = function (sec) {
    try {
      if (typeof window !== 'undefined' && window.Utils && window.Utils.fmtHmsMs) return window.Utils.fmtHmsMs(sec);
      if (typeof ProgeniUtils !== 'undefined' && ProgeniUtils.fmtHmsMs) return ProgeniUtils.fmtHmsMs(sec);
    } catch (e) {}
    let s = num(sec, 0);
    if (!Number.isFinite(s) || s < 0) s = 0;
    let ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const si = Math.floor(ms / 1000); ms -= si * 1000;
    return padNum(h, 2) + ":" + padNum(m, 2) + ":" + padNum(si, 2) + "." + padNum(ms, 3);
  };
  if (typeof module === 'object' && module.exports) {
    try {
      const U = require('../core/utils');
      if (U.fmtHmsMs) fmtHmsMs = U.fmtHmsMs;
    } catch (e) {}
  }
  const fmtTimeHMSms = fmtHmsMs;

  /* HH:MM:SS,mmm — the comma form required by the SubRip format on export. */
  function fmtSrtTime(sec) {
    return fmtHmsMs(sec).replace(".", ",");
  }

  /* Parse "HH:MM:SS,mmm", "HH:MM:SS.mmm", "MM:SS.mmm" or "HH:MM:SS"
     (position metadata after the timecode is ignored). Returns seconds or NaN. */
  function parseTimecode(str) {
    if (str == null) return NaN;
    const s = String(str).trim().replace(",", ".");
    const m = s.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/);
    if (!m) return NaN;
    const h = parseInt(m[1] || "0", 10);
    const mi = parseInt(m[2], 10);
    const se = parseInt(m[3], 10);
    const frac = (m[4] || "0");
    const ms = parseInt(frac.length === 1 ? frac + "00" : frac.length === 2 ? frac + "0" : frac.slice(0, 3), 10);
    if (![h, mi, se, ms].every(Number.isFinite)) return NaN;
    if (mi >= 60 || se >= 60) return NaN;
    return h * 3600 + mi * 60 + se + ms / 1000;
  }

  /* ------------------------------------------------------------ SRT layer */

  /* Parse SubRip text into cues: {index, start, end, lines, raw}. Blocks
     without a valid "start --> end" line are skipped; a missing numeric index
     line falls back to the running sequence. */
  function parseSrt(text) {
    const src = String(text == null ? "" : text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const cues = [];
    let auto = 0;
    src.split(/\n{2,}/).forEach(function (block) {
      const raw = block.replace(/^\n+|\n+$/g, "");
      if (!raw.trim()) return;
      const lines = raw.split("\n");
      const ti = lines.findIndex(function (l) { return l.indexOf("-->") >= 0; });
      if (ti < 0) return;
      const tm = lines[ti].match(/^(.*?)-->\s*(.*)$/);
      if (!tm) return;
      const start = parseTimecode(tm[1]);
      const end = parseTimecode(tm[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      let index = auto + 1;
      if (ti > 0) {
        const n = parseInt((lines.slice(0, ti).join(" ").match(/^(\d+)/) || [])[1], 10);
        if (Number.isFinite(n)) index = n;
      }
      auto = index;
      let textLines = lines.slice(ti + 1);
      while (textLines.length && textLines[textLines.length - 1].trim() === "") textLines.pop();
      cues.push({ index: index, start: start, end: end, lines: textLines, raw: raw });
    });
    if (cues.length === 0) {
      const lines = src.split("\n");
      const ti = lines.findIndex(function (l) { return l.indexOf("-->") >= 0; });
      if (ti >= 0) {
        const tm = lines[ti].match(/^(.*?)-->\s*(.*)$/);
        if (tm) {
          const start = parseTimecode(tm[1]);
          const end = parseTimecode(tm[2]);
          if (Number.isFinite(start) && Number.isFinite(end)) {
            let index = 1;
            if (ti > 0) {
              const n = parseInt((lines.slice(0, ti).join(" ").match(/^(\d+)/) || [])[1], 10);
              if (!Number.isFinite(n)) index = 1; else index = n;
            } else {
              const n = parseInt((lines[0] || "").trim(), 10);
              if (Number.isFinite(n) && String(n) === (lines[0] || "").trim()) {
                // has index
              } else {
                index = 1;
              }
            }
            let textLines = lines.slice(ti + 1);
            while (textLines.length && textLines[0].trim() === "") textLines.shift();
            while (textLines.length && textLines[textLines.length - 1].trim() === "") textLines.pop();
            if (ti === 0) {
              const n = parseInt((lines[0] || "").trim(), 10);
              if (!Number.isFinite(n) || String(n) !== (lines[0] || "").trim()) {
                index = 1;
              }
            }
            cues.push({ index: index, start: start, end: end, lines: textLines, raw: src.replace(/\n+$/, "") });
          }
        }
      }
    }
    return cues;
  }

  /* Serialize cues back to SubRip, re-sequencing numbering from 1. */
  function serializeSrt(cues) {
    const list = cues || [];
    return list.map(function (c, i) {
      const lines = Array.isArray(c.lines) ? c.lines : String(c.lines == null ? "" : c.lines).split("\n");
      return [String(i + 1), fmtSrtTime(c.start) + " --> " + fmtSrtTime(c.end)].concat(lines).join("\n");
    }).join("\n\n") + (list.length ? "\n" : "");
  }

  /* Remove SubRip/ASS formatting markup: <i>, </i>, <b>, <font ...>,
     {\an8}, {\pos(1,2)}, {\i1} etc. Never touches visible characters. */
  function stripTags(text) {
    return String(text == null ? "" : text)
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^{}]*\}/g, "");
  }

  const PUNCT = ".,;:!?\u2026\u3002\uff0c\uff1b\uff1a\uff01\uff1f";

  /* Visible width of a string with formatting tags removed. */
  function measure(text) {
    return stripTags(text).length;
  }

  /* Split a whitespace-delimited string into measured tokens. A token keeps any
     tags attached inside its own chunk, so <i>world</i> stays one token while a
     standalone {\an8} becomes a zero-width token. */
  function tokenize(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().split(" ").filter(function (t) {
      return t !== "";
    }).map(function (t) {
      return { text: t, width: measure(t) };
    });
  }

  function tokenWidth(t) {
    return typeof t === "string" ? measure(t) : num(t && t.width, 0);
  }
  function tokenText(t) {
    return typeof t === "string" ? t : String(t && t.text == null ? "" : t.text);
  }

  /* Join tokens, inserting a single space only between two visible chunks. */
  function joinTokens(tokens) {
    let out = "";
    let prevVisible = false;
    tokens.forEach(function (t) {
      const txt = tokenText(t);
      const visible = tokenWidth(t) > 0;
      if (out !== "" && prevVisible && visible) out += " ";
      out += txt;
      prevVisible = visible;
    });
    return out;
  }

  /* Cut one over-long token into pieces that each fit `width` visible chars,
     keeping any formatting tags attached to the characters they surround. */
  function hardCutToken(text, width) {
    const w = Math.max(1, Math.round(width));
    const pieces = [];
    let cur = "", vis = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "<") {
        const e = text.indexOf(">", i);
        if (e >= 0) { cur += text.slice(i, e + 1); i = e; continue; }
      }
      if (c === "{") {
        const e = text.indexOf("}", i);
        if (e >= 0) { cur += text.slice(i, e + 1); i = e; continue; }
      }
      cur += c;
      vis++;
      if (vis >= w) { pieces.push(cur); cur = ""; vis = 0; }
    }
    if (cur !== "") pieces.push(cur);
    return pieces.length ? pieces : [text];
  }

  /* Greedy wrap. Accepts an array of token objects (from tokenize) or plain
     strings. Zero-width tag tokens attach to the current line without adding a
     space; tokens wider than `width` are hard-cut. Returns an array of lines. */
  function wrapTokens(tokens, width) {
    const w = Math.max(1, Math.round(num(width, 42)));
    const list = (tokens || []).map(function (t) {
      return { text: tokenText(t), width: tokenWidth(t) };
    });
    const lines = [];
    let cur = [];
    let curVis = 0;
    const flush = function () {
      if (cur.length) { lines.push(joinTokens(cur)); cur = []; curVis = 0; }
    };
    list.forEach(function (tok) {
      if (tok.width <= 0) { cur.push(tok); return; }
      if (tok.width > w) {
        flush();
        const pieces = hardCutToken(tok.text, w);
        for (let k = 0; k < pieces.length - 1; k++) lines.push(pieces[k]);
        cur = [{ text: pieces[pieces.length - 1], width: measure(pieces[pieces.length - 1]) }];
        curVis = cur[0].width;
        return;
      }
      const cand = curVis + tok.width + (curVis > 0 ? 1 : 0);
      if (curVis > 0 && cand > w) flush();
      cur.push(tok);
      curVis = curVis > 0 ? curVis + tok.width + 1 : tok.width;
    });
    flush();
    if (!lines.length) lines.push("");
    return lines;
  }

  /* Sentence/clause split: when the text is wider than `width`, break it at the
     punctuation mark nearest the midpoint (preferring a break whose prefix still
     fits the width). Returns [text] when no useful break exists. */
  function splitAtClause(text, width) {
    const clean = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (!clean) return [""];
    const w = Math.max(1, Math.round(num(width, 42)));
    if (measure(clean) <= w) return [clean];
    const positions = [];
    for (let i = 0; i < clean.length; i++) {
      if (PUNCT.indexOf(clean[i]) < 0) continue;
      let j = i + 1;
      while (j < clean.length && clean[j] === " ") j++;
      if (j >= clean.length) continue;
      positions.push({ raw: j, vis: measure(clean.slice(0, i + 1)) });
    }
    if (!positions.length) return [clean];
    const mid = measure(clean) / 2;
    let pool = positions.filter(function (p) { return p.vis <= w; });
    if (!positions.length) return [clean];
    if (!pool.length) pool = positions;
    let best = pool[0];
    positions.forEach(function (p) {
      if (Math.abs(p.vis - mid) < Math.abs(best.vis - mid)) best = p;
    });
    if (positions.indexOf(best) < 0) {
      positions.forEach(function (p) {
        if (Math.abs(p.vis - mid) < Math.abs(best.vis - mid)) best = p;
      });
    }
    const a = clean.slice(0, best.raw).trim();
    const b = clean.slice(best.raw).trim();
    if (!a || !b) return [clean];
    return [a, b];
  }

  /* Two-pass wrap: clause split first, then greedy wrap; fall back to plain
     greedy wrap when the clause split would need more lines. */
  function twoPassWrap(text, width) {
    const greedy = wrapTokens(tokenize(text), width);
    const parts = splitAtClause(text, width);
    let balanced = [];
    parts.forEach(function (p) { balanced = balanced.concat(wrapTokens(tokenize(p), width)); });
    return balanced.length <= greedy.length ? balanced : greedy;
  }

  /* Rewrap a cue's lines. Never loses text: when the balanced result needs more
     than `maxLines` lines the width is widened so the text folds into exactly
     `maxLines` lines (the caller flags the resulting overflow). maxLines 1 is
     single-line mode. */
  function rewrapCue(lines, maxChars, maxLines) {
    const mc = Math.round(clamp(num(maxChars, 42), 10, 200));
    const ml = Math.round(clamp(num(maxLines, 2), 1, 6));
    const text = (Array.isArray(lines) ? lines : [String(lines == null ? "" : lines)])
      .join(" ").replace(/\s+/g, " ").trim();
    if (!text) return [""];
    if (ml <= 1) return [text];
    if (measure(text) <= mc) return [text];
    let out = twoPassWrap(text, mc);
    if (out.length > ml) {
      const eff = Math.max(mc, Math.ceil(measure(text) / ml));
      out = twoPassWrap(text, eff);
      if (out.length > ml) out = out.slice(0, ml - 1).concat([out.slice(ml - 1).join(" ")]);
    }
    return out;
  }

  /* Fix every cue. Returns per-cue {position, index, timecode, before, after,
     changed, hardCut, overflow, linesNeeded}. `before`/`after` are line arrays.
     Timecodes are copied verbatim — only the text lines change. */
  function fixCues(cues, opts) {
    const o = opts || {};
    const maxChars = Math.round(clamp(num(o.maxChars, 38), 10, 200));
    const maxLines = Math.round(clamp(num(o.maxLines, 2), 1, 6));
    const preserve = o.preserveTags !== false;
    return (cues || []).map(function (c) {
      const before = (Array.isArray(c.lines) ? c.lines.slice() : [String(c.lines == null ? "" : c.lines)]);
      const source = before.map(function (l) { return preserve ? l : stripTags(l); });
      const after = rewrapCue(source, maxChars, maxLines);
      const changed = before.join("\n") !== after.join("\n");
      const joined = source.join(" ").replace(/\s+/g, " ").trim();
      const hardCut = tokenize(joined).some(function (t) { return t.width > maxChars; });
      const overflow = after.some(function (l) { return measure(l) > maxChars; });
      return {
        position: c.__pos != null ? c.__pos : 0,
        index: c.index,
        start: c.start,
        end: c.end,
        timecode: fmtHmsMs(c.start) + " --> " + fmtHmsMs(c.end),
        before: before,
        after: after,
        changed: changed,
        hardCut: hardCut,
        overflow: overflow && !hardCut,
        linesNeeded: after.length
      };
    });
  }

  /* --------------------------------------------------------------- profiles */

  const PROFILE_LIST = [
    { id: "netflix", label: "Netflix — 21 CPS, 1.0s min, 42 chars/line, 2 lines", cps: 21, minDuration: 1, maxCharsPerLine: 42, maxLines: 2, wpm: null },
    { id: "bbc", label: "BBC - ~180 WPM / 18 CPS, 1.0s min, 37 chars/line, 2 lines", cps: 18, wpm: 180, minDuration: 1, maxCharsPerLine: 37, maxLines: 2 },
    { id: "custom", label: "Custom — set your own limits", cps: 21, minDuration: 1, maxCharsPerLine: 42, maxLines: 2 }
  ];

  function normalizeProfile(p) {
    const src = p || {};
    const id = ["netflix", "bbc", "custom"].indexOf(p && p.id) >= 0 ? p.id : "netflix";
    const base = PROFILE_LIST.filter(function (x) { return x.id === id; })[0] || PROFILE_LIST[0];
    return {
      id: id,
      label: p && p.label ? p.label : PROFILE_LIST.filter(function (x) { return x.id === id; })[0].label,
      cps: clamp(num(p && p.cps, base.cps), 1, 60),
      minDuration: clamp(num(p && p.minDuration, base.minDuration), 0, 20),
      maxCharsPerLine: Math.round(clamp(num(p && p.maxCharsPerLine, base.maxCharsPerLine), 5, 120)),
      maxLines: Math.round(clamp(num(p && p.maxLines, base.maxLines), 1, 6)),
      wpm: p && p.wpm ? num(p.wpm, null) : base.wpm
    };
  }

  /* Convert a words-per-minute guideline into CPS using an average English word
     length of 6 characters (including the trailing space). */
  function wpmToCps(wpm) {
    const n = num(wpm, 0);
    if (!(n > 0)) return 0;
    return r2(n * 6 / 60);
  }

  /* -------------------------------------------------------- overlap / audit */

  /* Overlapping adjacent cues. Returns pairs {from, to, fromIndex, toIndex,
     start, end, duration} in chronological order. */
  function detectOverlaps(cues) {
    const list = cues || [];
    const order = list.map(function (_, i) { return i; })
      .sort(function (a, b) { return list[a].start - list[b].start || a - b; });
    const pairs = [];
    for (let k = 0; k < order.length - 1; k++) {
      const i = order[k], j = order[k + 1];
      const a = list[i], b = list[j];
      if (b.start < a.end - 1e-9) {
        const end = Math.min(a.end, b.end);
        pairs.push({
          from: i, to: j,
          fromIndex: a.index, toIndex: b.index,
          start: b.start, end: end, duration: Math.max(0, end - b.start)
        });
      }
    }
    return pairs;
  }

  /* Char/line metrics for one cue (tags stripped for the "clean" figures). */
  function cueMetrics(cue) {
    const lines = (Array.isArray(cue.lines) ? cue.lines : []).map(function (l) { return stripTags(l); });
    const clean = lines.join(" ").replace(/\s+/g, " ").trim();
    const rawText = (Array.isArray(cue.lines) ? cue.lines : []).join("\n");
    const duration = r3(cue.end - cue.start);
    return {
      cleanLines: lines,
      cleanText: clean,
      chars: clean.length,
      rawChars: rawText.length,
      duration: duration,
      cps: duration > 0 ? r2(clean.length / duration) : 0,
      maxLine: lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0)
    };
  }

  /* Full audit against a profile. Returns per-cue rows, issue counts, aggregate
     stats (avg CPS, longest cue) and the overlap pairs. */
  function auditCues(cues, profile) {
    const P = normalizeProfile(profile);
    const list = cues || [];
    const overlaps = detectOverlaps(list);
    const overlapByTo = {};
    overlaps.forEach(function (o) { overlapByTo[o.to] = o; });

    const rows = list.map(function (c, i) {
      const m = cueMetrics(c);
      const issues = [];
      if (m.duration <= 0) {
        issues.push({ type: "duration", kind: "zero", detail: "zero or negative duration (" + fmtHmsMs(m.duration) + ")" });
      } else if (m.duration < P.minDuration) {
        issues.push({ type: "duration", kind: "short", detail: "duration " + fmtHmsMs(m.duration) + " is below the " + fmtHmsMs(P.minDuration) + " minimum" });
      }
      if (m.duration > 0 && m.cps > P.cps + 1e-9) {
        issues.push({
          type: "cps", kind: "fast",
          detail: m.cps + " CPS exceeds " + P.cps + " CPS (" + m.chars + " clean chars / " + fmtHmsMs(m.duration) + ")",
          cps: m.cps, chars: m.chars, rawChars: m.rawChars
        });
      }
      m.cleanLines.forEach(function (l, li) {
        if (l.length > P.maxCharsPerLine) {
          issues.push({ type: "line", kind: "long", line: li + 1, detail: "line " + (li + 1) + " is " + l.length + " chars (max " + P.maxCharsPerLine + ")" });
        }
      });
      if (m.cleanLines.length > P.maxLines) {
        issues.push({ type: "lines", kind: "many", detail: m.cleanLines.length + " lines (max " + P.maxLines + ")" });
      }
      const ov = overlapByTo[i];
      if (ov) {
        issues.push({
          type: "overlap", kind: "overlap",
          neighbor: ov.fromIndex, neighborPos: ov.from,
          range: { start: ov.start, end: ov.end },
          detail: "overlaps cue #" + ov.fromIndex + " (" + fmtHmsMs(ov.start) + " \u2192 " + fmtHmsMs(ov.end) + ", " + fmtHmsMs(ov.duration) + ")"
        });
      }
      return {
        position: i,
        index: c.index,
        start: c.start,
        end: c.end,
        duration: m.duration,
        lines: m.cleanLines,
        rawLines: Array.isArray(c.lines) ? c.lines : [],
        chars: m.chars,
        rawChars: m.rawChars,
        cps: m.cps,
        maxLine: m.maxLine,
        issues: issues,
        flag: issues.length > 0
      };
    });

    const counts = { cps: 0, duration: 0, line: 0, lines: 0, overlap: 0 };
    rows.forEach(function (r) {
      r.issues.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
    });

    let longest = null;
    rows.forEach(function (r) {
      if (!longest || r.duration > longest.duration) longest = r;
    });
    const finite = rows.map(function (r) { return r.cps; }).filter(function (v) { return v > 0; });
    const avgCps = finite.length ? r2(finite.reduce(function (a, b) { return a + b; }, 0) / finite.length) : 0;

    return {
      profile: P,
      rows: rows,
      total: rows.length,
      flagged: rows.filter(function (r) { return r.flag; }).length,
      counts: counts,
      issueTotal: rows.reduce(function (a, r) { return a + r.issues.length; }, 0),
      avgCps: avgCps,
      totalChars: rows.reduce(function (a, r) { return a + r.chars; }, 0),
      totalRawChars: rows.reduce(function (a, r) { return a + r.rawChars; }, 0),
      longest: longest ? { position: longest.position, index: longest.index, duration: longest.duration, start: longest.start, chars: longest.chars } : null,
      overlaps: overlaps
    };
  }

  /* ------------------------------------------------------------- CSV / SRT */

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvOut(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  }

  /* CSV issue report: one row per cue with all metrics and a joined issue list. */
  function reportCsv(audit) {
    const head = ["Cue", "Start", "End", "Duration (s)", "Lines", "Chars clean", "Chars raw", "CPS", "Max line", "Flagged", "Issues"];
    const rows = [head];
    (audit.rows || []).forEach(function (r) {
      rows.push([
        r.index, fmtHmsMs(r.start), fmtHmsMs(r.end), r.duration, r.lines.length,
        r.chars, r.rawChars, r.cps, r.maxLine, r.flag ? "yes" : "no",
        r.issues.map(function (x) {
          if (x.type === "overlap") return "OVERLAP vs #" + x.neighbor + " (" + fmtHmsMs(x.range.start) + " \u2192 " + fmtHmsMs(x.range.end) + ")";
          return x.type.toUpperCase() + ": " + x.detail;
        }).join(" | ")
      ]);
    });
    return csvOut(rows) + "\r\n";
  }

  /* Annotated SRT: the cues themselves plus a NOTE comment line after the text
     of every flagged cue. Meant as a review sidecar (.issues.srt), not playback. */
  function issuesSrt(cues, audit) {
    const list = cues || [];
    const byPos = {};
    ((audit && audit.rows) || []).forEach(function (r) { byPos[r.position] = r; });
    return list.map(function (c, i) {
      const lines = Array.isArray(c.lines) ? c.lines.slice() : [];
      const r = byPos[i];
      if (r && r.flag) {
        r.issues.forEach(function (x) {
          const tag = x.type.toUpperCase();
          lines.push("NOTE [" + tag + "] cue #" + c.index + " \u2014 " + x.detail);
        });
      }
      return [String(i + 1), fmtSrtTime(c.start) + " --> " + fmtSrtTime(c.end)].concat(lines).join("\n");
    }).join("\n\n") + (list.length ? "\n" : "");
  }

  /* Fixed SRT: only the text lines change; numbering and timecodes are stable. */
  function fixedSrt(cues, opts) {
    const fixed = fixCues(cues, opts);
    return serializeSrt((cues || []).map(function (c, i) {
      return { start: c.start, end: c.end, lines: fixed[i] ? fixed[i].after : c.lines };
    }));
  }

  /* ============================================================== UI engine */

  const HANDOFF_KEY = "subtitle-handoff";
  const SAMPLE_SRT = [
    "1",
    "00:00:01,000 --> 00:00:03,400",
    "<i>Hello</i> and welcome to this detailed presentation about subtitle timing standards.",
    "",
    "2",
    "00:00:03,400 --> 00:00:03,900",
    "This caption is far too fast for anyone to read comfortably.",
    "",
    "3",
    "00:00:03,800 --> 00:00:06,000",
    "{\\an8}This cue deliberately overlaps with the previous caption.",
    "",
    "4",
    "00:00:06,000 --> 00:00:06,150",
    "Tiny.",
    "",
    "5",
    "00:00:07,000 --> 00:00:07,100",
    "{\\an8}{\\pos(20,30)}A negative looking, near zero duration cue."
  ].join("\n");

  const state = {
    mode: "speed",
    text: "",
    name: "",
    profile: "netflix",
    custom: { cps: 21, minDuration: 1, maxCharsPerLine: 42, maxLines: 2 },
    fix: { maxChars: 38, maxLines: 2, preserveTags: true },
    cues: [],
    audit: null,
    fixResult: null,
    parseWarnings: []
  };

  let root = null;
  let flashTimer = 0;
  let inputTimer = 0;

  function $(sel) { return root ? root.querySelector(sel) : null; }
  function $$(sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }

  function flash(msg) {
    const el = $("#sub-status");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.classList.remove("on"); }, 3200);
  }

  function currentProfile() {
    if (state.profile === "custom") {
      return normalizeProfile({
        id: "custom", label: "Custom",
        cps: state.custom.cps,
        minDuration: state.custom.minDuration,
        maxCharsPerLine: state.custom.maxCharsPerLine,
        maxLines: state.custom.maxLines
      });
    }
    const base = PROFILE_LIST.filter(function (p) { return p.id === state.profile; })[0] || PROFILE_LIST[0];
    return normalizeProfile(base);
  }

  function readHandoff(expectFrom) {
    try {
      const raw = localStorage.getItem(HANDOFF_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o.text !== "string" || o.from !== expectFrom) return null;
      return o;
    } catch (e) { return null; }
  }
  function writeHandoff(from, text) {
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify({ from: from, text: text, at: Date.now() })); } catch (e) { /* ignore */ }
  }
  function clearHandoff() {
    try { localStorage.removeItem(HANDOFF_KEY); } catch (e) { /* ignore */ }
  }

  function parseText(text) {
    state.text = String(text == null ? "" : text);
    state.cues = parseSrt(state.text);
    const nonEmpty = state.text.trim() !== "";
    state.parseWarnings = [];
    if (nonEmpty && !state.cues.length) state.parseWarnings.push("No SubRip cues were found \u2014 check that each block has a 'start --> end' timecode line.");
    return state.cues;
  }

  function analyze() {
    state.audit = auditCues(state.cues, currentProfile());
    state.fixResult = null;
  }
  function runFix() {
    state.fixResult = fixCues(state.cues, state.fix);
  }

  function run() {
    if (state.mode === "speed") analyze(); else runFix();
    render();
  }

  /* --------------------------------------------------------------- markup */

  function speedControls() {
    const opts = PROFILE_LIST.map(function (p) {
      return '<option value="' + p.id + '"' + (state.profile === p.id ? " selected" : "") + ">" + esc(p.label) + "</option>";
    }).join("");
    const off = state.profile === "custom" ? "" : " disabled";
    return '' +
      '<div class="studio-controls sub-controls">' +
        '<label class="st-field sub-wide"><span>Reading-speed profile</span><select id="sub-profile" aria-label="Reading-speed profile">' + opts + "</select></label>" +
        '<details class="sub-advanced" id="sub-advanced">' +
          '<summary><span>Custom limits</span><small>Only used with the Custom profile</small></summary>' +
          '<div class="sub-advanced-grid">' +
            '<label class="st-field"><span>CPS limit <b class="st-readout" id="sub-cps-r"></b></span><input type="number" id="sub-cps" min="1" max="60" step="1" value="' + state.custom.cps + '"' + off + "></label>" +
            '<label class="st-field"><span>Min duration (s)</span><input type="number" id="sub-min" min="0" max="20" step="0.1" value="' + state.custom.minDuration + '"' + off + "></label>" +
            '<label class="st-field"><span>Max chars / line</span><input type="number" id="sub-maxchars" min="5" max="120" step="1" value="' + state.custom.maxCharsPerLine + '"' + off + "></label>" +
            '<label class="st-field"><span>Max lines</span><input type="number" id="sub-maxlines" min="1" max="6" step="1" value="' + state.custom.maxLines + '"' + off + "></label>" +
          "</div>" +
        "</details>" +
      "</div>";
  }

  function fixControls() {
    return '' +
      '<div class="studio-controls sub-controls">' +
        '<label class="st-field"><span>Max chars / line <b class="st-readout" id="sub-fmax-r">' + state.fix.maxChars + "</b></span>" +
          '<input type="range" id="sub-fmax" min="20" max="60" step="1" value="' + state.fix.maxChars + '" aria-label="Maximum characters per line"></label>' +
        '<label class="st-field"><span>Max lines</span><select id="sub-fmaxlines" aria-label="Maximum lines per cue">' +
          [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (state.fix.maxLines === n ? " selected" : "") + ">" + n + (n === 1 ? " (single line)" : " lines") + "</option>"; }).join("") +
        "</select></label>" +
        '<label class="st-check"><input type="checkbox" id="sub-ftags"' + (state.fix.preserveTags ? " checked" : "") + "> Preserve &lt;i&gt; / {\\an8} tags</label>" +
      "</div>";
  }

  function textPanel(placeholder) {
    return '' +
      '<div class="sub-textpanel">' +
        '<textarea id="sub-text" class="sub-textarea" rows="9" spellcheck="false" placeholder="' + esc(placeholder) + '" aria-label="SubRip subtitle text">' + esc(state.text) + "</textarea>" +
        '<div class="sub-filebar">' +
          '<button type="button" class="btn secondary" id="sub-add">\uFF0B Add .srt file</button>' +
          '<input type="file" id="sub-file" accept=".srt,.txt,text/plain" hidden>' +
          '<button type="button" class="btn secondary" id="sub-sample">Load sample</button>' +
          '<button type="button" class="btn secondary" id="sub-clear">Clear</button>' +
          '<span class="sub-filemeta" id="sub-filemeta"></span>' +
        "</div>" +
      "</div>";
  }

  function speedMarkup() {
    return '' +
      '<div class="sub-workspace">' +
        '<div class="sub-grid">' +
          '<section class="sub-panel sub-input" aria-labelledby="sub-source-title">' +
            '<div class="sub-panel-head"><h2 id="sub-source-title">Subtitle source</h2><span class="sub-panel-kicker">SubRip .srt</span></div>' +
            textPanel("Paste SubRip (.srt) subtitles here, or use Add .srt file\u2026") +
          "</section>" +
          '<aside class="sub-panel sub-settings" aria-labelledby="sub-settings-title">' +
            '<h2 id="sub-settings-title">Audit settings</h2>' +
            '<p class="sub-panel-hint">Start with a broadcast profile. Open custom limits only when you need your own thresholds.</p>' +
            speedControls() +
            '<p class="sub-privacy"><strong>Stays local.</strong> Subtitle text is parsed and measured entirely in your browser.</p>' +
          "</aside>" +
        "</div>" +
        '<section class="sub-results" id="sub-results" aria-labelledby="sub-results-title">' +
          '<div class="sub-results-head"><div><h2 id="sub-results-title">Reading-speed audit</h2><p>Flagged cues are ranked by timecode with CPS, duration, line and overlap notes.</p></div>' +
            '<span class="sub-status" id="sub-status" aria-live="polite"></span></div>' +
          '<div class="sub-empty-banner" id="sub-empty"><strong>No subtitles analysed yet.</strong><span>Load a sample or paste your .srt file to see the audit and export a report.</span></div>' +
          '<div class="studio-toolbar sub-actions">' +
            '<button type="button" class="btn" id="sub-run">Analyze subtitles</button>' +
            '<button type="button" class="btn secondary" id="sub-csv" disabled>Download CSV report</button>' +
            '<button type="button" class="btn secondary" id="sub-issues" disabled>Annotated .issues.srt</button>' +
            '<a class="btn secondary sub-handoff" id="sub-handoff" href="/tools/subtitle-linefix/" aria-disabled="true">Fix line breaks \u2192</a>' +
          "</div>" +
          '<div class="sub-result-body">' +
            '<div class="sub-stats" id="sub-stats" aria-live="polite"></div>' +
            '<div class="sub-issues" id="sub-issue-list" aria-live="polite"></div>' +
          "</div>" +
        "</section>" +
      "</div>";
  }

  function fixMarkup() {
    return '' +
      '<div class="sub-workspace">' +
        '<div class="sub-grid">' +
          '<section class="sub-panel sub-input" aria-labelledby="sub-source-title">' +
            '<div class="sub-panel-head"><h2 id="sub-source-title">Subtitle source</h2><span class="sub-panel-kicker">SubRip .srt</span></div>' +
            textPanel("Paste SubRip (.srt) subtitles here to rebalance the line breaks\u2026") +
          "</section>" +
          '<aside class="sub-panel sub-settings" aria-labelledby="sub-settings-title">' +
            '<h2 id="sub-settings-title">Line-break rules</h2>' +
            '<p class="sub-panel-hint">Set how much text can sit on one line. Timecodes are never changed.</p>' +
            fixControls() +
            '<p class="sub-privacy"><strong>Stays local.</strong> Your subtitle file never leaves this browser.</p>' +
          "</aside>" +
        "</div>" +
        '<section class="sub-results" id="sub-results" aria-labelledby="sub-results-title">' +
          '<div class="sub-results-head"><div><h2 id="sub-results-title">Rewrap preview</h2><p>Compare the original and fixed line breaks before downloading.</p></div>' +
            '<span class="sub-status" id="sub-status" aria-live="polite"></span></div>' +
          '<div class="sub-empty-banner" id="sub-empty"><strong>No subtitles loaded yet.</strong><span>Load a sample or paste your .srt file to preview the rebalanced line breaks.</span></div>' +
          '<div class="studio-toolbar sub-actions">' +
            '<button type="button" class="btn" id="sub-run">Fix line breaks</button>' +
            '<button type="button" class="btn secondary" id="sub-download" disabled>Download fixed .srt</button>' +
            '<a class="btn secondary sub-handoff" id="sub-handoff" href="/tools/subtitle-speed/" aria-disabled="true">Send to speed checker \u2192</a>' +
          "</div>" +
          '<div class="sub-result-body">' +
            '<div class="sub-stats" id="sub-stats" aria-live="polite"></div>' +
            '<div class="sub-diff" id="sub-diff" aria-live="polite"></div>' +
          "</div>" +
        "</section>" +
      "</div>";
  }

  /* --------------------------------------------------------------- render */

  function statChip(label, value, extra) {
    return '<div class="sub-stat' + (extra ? " " + extra : "") + '"><b>' + esc(value) + "</b><span>" + esc(label) + "</span></div>";
  }

  function renderSpeed() {
    const a = state.audit;
    const stats = $("#sub-stats");
    if (stats) {
      if (!state.text.trim()) {
        stats.innerHTML = '<div class="sub-empty">Paste or load an .srt file to audit reading speed, duration, line length and overlaps.</div>';
      } else if (!a || !a.total) {
        stats.innerHTML = '<div class="sub-empty">' + esc(state.parseWarnings.join(" ") || "No cues to show.") + "</div>";
      } else {
        const longest = a.longest;
        stats.innerHTML = [
          statChip("Total cues", a.total),
          statChip("Flagged cues", a.flagged, a.flagged ? "warn" : "ok"),
          statChip("CPS flags", a.counts.cps),
          statChip("Duration flags", a.counts.duration),
          statChip("Long lines", a.counts.line),
          statChip("Too many lines", a.counts.lines),
          statChip("Overlaps", a.counts.overlap),
          statChip("Avg CPS", a.avgCps),
          statChip("Longest cue", longest ? fmtHmsMs(longest.duration) + " (#" + longest.index + ")" : "n/a"),
          statChip("Profile", a.profile.id === "bbc" ? "BBC ~" + a.profile.wpm + " WPM" : a.profile.id === "netflix" ? "Netflix " + a.profile.cps + " CPS" : "Custom " + a.profile.cps + " CPS")
        ].join("");
      }
    }

    const list = $("#sub-issue-list");
    if (!list) return;
    if (!a || !a.rows.length) { list.innerHTML = ""; return; }
    const flagged = a.rows.filter(function (r) { return r.flag; });
    if (!flagged.length) {
      list.innerHTML = '<div class="sub-ok">All ' + a.total + " cues pass the " + esc(a.profile.id) + " profile (" + a.profile.cps + " CPS, " + fmtHmsMs(a.profile.minDuration) + " min, " + a.profile.maxCharsPerLine + " chars/line).</div>";
      return;
    }
    const rows = flagged.map(function (r) {
      return "<tr>" +
        "<td class=\"sub-mono\">#" + r.index + "</td>" +
        '<td class="sub-mono">' + fmtHmsMs(r.start) + " \u2192 " + fmtHmsMs(r.end) + "</td>" +
        '<td class="sub-mono">' + r.cps + "</td>" +
        '<td class="sub-mono">' + r.chars + "/" + r.rawChars + "</td>" +
        '<td class="sub-mono">' + r.lines.length + " \u00b7 max " + r.maxLine + "</td>" +
        "<td>" + r.issues.map(function (x) { return '<span class="sub-tag sub-' + x.type + '">' + esc(x.type.toUpperCase()) + "</span> " + esc(x.detail); }).join("<br>") + "</td>" +
        "</tr>";
    }).join("");
    list.innerHTML =
      '<div class="sub-tablewrap"><table class="sub-table"><thead><tr>' +
      "<th>Cue</th><th>Timecode</th><th>CPS</th><th>Clean/raw chars</th><th>Lines</th><th>Issues</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function renderFix() {
    const f = state.fixResult;
    const stats = $("#sub-stats");
    const changed = f ? f.filter(function (r) { return r.changed; }).length : 0;
    const overflow = f ? f.filter(function (r) { return r.overflow; }).length : 0;
    const hard = f ? f.filter(function (r) { return r.hardCut; }).length : 0;
    if (stats) {
      if (!state.text.trim()) {
        stats.innerHTML = '<div class="sub-empty">Paste or load an .srt file to rebalance line breaks. Timecodes are never changed.</div>';
      } else if (!f || !f.length) {
        stats.innerHTML = '<div class="sub-empty">' + esc(state.parseWarnings.join(" ") || "No cues to fix.") + "</div>";
      } else {
        stats.innerHTML = [
          statChip("Total cues", f.length),
          statChip("Changed cues", changed, changed ? "warn" : "ok"),
          statChip("Unchanged", f.length - changed),
          statChip("Chars / line", state.fix.maxChars),
          statChip("Max lines", state.fix.maxLines),
          statChip("Tags", state.fix.preserveTags ? "preserved" : "flattened"),
          statChip("Needs >" + state.fix.maxLines + " lines", overflow),
          statChip("Hard-cut tokens", hard)
        ].join("");
      }
    }

    const box = $("#sub-diff");
    if (!box) return;
    if (!f || !f.length) { box.innerHTML = ""; return; }
    const shown = f.filter(function (r) { return r.changed; });
    if (!shown.length) {
      box.innerHTML = '<div class="sub-ok">Nothing to change \u2014 every cue already fits ' + state.fix.maxChars + " chars/line.</div>";
      return;
    }
    const rows = shown.map(function (r) {
      const before = r.before.map(function (l) { return '<span class="sub-b">' + esc(l) + "</span>"; }).join("");
      const after = r.after.map(function (l) { return '<span class="sub-a">' + esc(l) + "</span>"; }).join("");
      const warn = r.hardCut ? '<span class="sub-tag sub-line">HARD CUT</span>' : (r.overflow ? '<span class="sub-tag sub-duration">need ' + r.linesNeeded + " lines</span>" : "");
      return '<tr class="sub-changed">' +
        '<td class="sub-mono">#' + r.index + "</td>" +
        '<td class="sub-mono">' + fmtHmsMs(r.start) + " \u2192 " + fmtHmsMs(r.end) + "</td>" +
        '<td class="sub-before">' + before + "</td>" +
        '<td class="sub-after">' + after + warn + "</td>" +
        "</tr>";
    }).join("");
    box.innerHTML =
      '<div class="sub-tablewrap"><table class="sub-table sub-difftable"><thead><tr>' +
      "<th>Cue</th><th>Timecode</th><th>Before</th><th>After (fixed)</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function syncSubtitleState() {
    if (!root) return;
    const has = state.cues.length > 0;
    const results = $("#sub-results");
    if (results) results.classList.toggle("has-data", has);
    const empty = $("#sub-empty");
    if (empty) empty.hidden = has;
    [["#sub-csv", has], ["#sub-issues", has], ["#sub-download", has], ["#sub-run", has]].forEach(function (pair) {
      const b = $(pair[0]); if (b) b.disabled = !pair[1];
    });
    const handoff = $("#sub-handoff");
    if (handoff) {
      handoff.setAttribute("aria-disabled", has ? "false" : "true");
      handoff.classList.toggle("is-disabled", !has);
    }
  }

  function render() {
    if (!root) return;
    syncSubtitleState();
    if (state.mode === "speed") renderSpeed(); else renderFix();
    const meta = $("#sub-filemeta");
    if (meta) {
      meta.textContent = state.cues.length
        ? (state.name ? state.name + " \u00b7 " : "") + state.cues.length + " cues parsed"
        : (state.text.trim() ? "No cues parsed" : "No file loaded");
    }
    const cpsReadout = $("#sub-cps-r");
    if (cpsReadout) cpsReadout.textContent = state.profile === "custom" ? String(state.custom.cps) : String(currentProfile().cps);
    const fmaxReadout = $("#sub-fmax-r");
    if (fmaxReadout) fmaxReadout.textContent = String(state.fix.maxChars);
  }

  /* -------------------------------------------------------------- exports */

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function downloadText(text, name, type) {
    download(new Blob([text], { type: type || "text/plain" }), name);
  }

  function baseName(fallback) {
    const n = state.name || fallback;
    return String(n).replace(/\.[a-z0-9]+$/i, "") || fallback;
  }
  function csvReportText() {
    if (!state.audit) analyze();
    return reportCsv(state.audit);
  }
  function issuesSrtText() {
    if (!state.audit) analyze();
    return issuesSrt(state.cues, state.audit);
  }
  function fixedSrtText() {
    return fixedSrt(state.cues, state.fix);
  }

  /* -------------------------------------------------------------- controls */

  function scheduleRun() {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(run, 220);
  }

  function onInput(e) {
    state.text = e.target.value;
    state.cues = parseSrt(state.text);
    state.parseWarnings = [];
    if (state.text.trim() && !state.cues.length) state.parseWarnings.push("No SubRip cues were found \u2014 check that each block has a 'start --> end' timecode line.");
    scheduleRun();
  }

  function bindControls() {
    const on = function (sel, ev, fn) { const el = $(sel); if (el) el.addEventListener(ev, fn); };

    on("#sub-text", "input", onInput);
    on("#sub-text", "change", run);

    on("#sub-add", "click", function () { const f = $("#sub-file"); if (f) f.click(); });
    on("#sub-file", "change", function (e) {
      const files = e.target.files ? Array.prototype.slice.call(e.target.files) : [];
      if (files.length) addFiles(files);
      e.target.value = "";
    });
    on("#sub-sample", "click", function () { addText(SAMPLE_SRT, "sample.srt"); flash("Sample subtitles loaded."); });
    on("#sub-clear", "click", function () { clear(); });

    on("#sub-run", "click", run);

    on("#sub-profile", "change", function (e) {
      state.profile = e.target.value;
      const custom = state.profile === "custom";
      ["#sub-cps", "#sub-min", "#sub-maxchars", "#sub-maxlines"].forEach(function (sel) {
        const el = $(sel); if (el) el.disabled = !custom;
      });
      run();
      flash(custom ? "Custom profile \u2014 edit the limits below." : "Profile: " + e.target.options[e.target.selectedIndex].text);
    });

    [["#sub-cps", "cps"], ["#sub-min", "minDuration"], ["#sub-maxchars", "maxCharsPerLine"], ["#sub-maxlines", "maxLines"]].forEach(function (pair) {
      on(pair[0], "input", function (e) {
        state.custom[pair[1]] = num(e.target.value, state.custom[pair[1]]);
        if (state.profile !== "custom") { state.profile = "custom"; const sel = $("#sub-profile"); if (sel) sel.value = "custom"; }
        scheduleRun();
      });
    });

    on("#sub-csv", "click", function () {
      if (!state.cues.length) { flash("Load or paste subtitles first."); return; }
      downloadText(csvReportText(), baseName("subtitles") + ".issues.csv", "text/csv");
      flash("CSV issue report downloaded.");
    });
    on("#sub-issues", "click", function () {
      if (!state.cues.length) { flash("Load or paste subtitles first."); return; }
      downloadText(issuesSrtText(), baseName("subtitles") + ".issues.srt", "text/plain");
      flash("Annotated .issues.srt downloaded.");
    });
    on("#sub-handoff", "click", function () {
      if (state.mode !== "speed") return;
      if (!state.text.trim()) { flash("Nothing to hand off yet."); return; }
      writeHandoff("speed", state.text);
      flash("Stored for the line-break fixer \u2014 opening it now\u2026");
    });

    /* fix mode */
    on("#sub-fmax", "input", function (e) {
      state.fix.maxChars = Math.round(clamp(num(e.target.value, 38), 20, 60));
      const r = $("#sub-fmax-r"); if (r) r.textContent = String(state.fix.maxChars);
      scheduleRun();
    });
    on("#sub-fmaxlines", "change", function (e) { state.fix.maxLines = Math.round(clamp(num(e.target.value, 2), 1, 3)); run(); });
    on("#sub-ftags", "change", function (e) { state.fix.preserveTags = !!e.target.checked; run(); });
    on("#sub-download", "click", function () {
      if (!state.cues.length) { flash("Load or paste subtitles first."); return; }
      downloadText(fixedSrtText(), baseName("subtitles") + ".fixed.srt", "text/plain");
      flash("Fixed .srt downloaded \u2014 timecodes unchanged.");
    });
    on("#sub-handoff", "click", function () {
      if (state.mode !== "fix") return;
      if (!state.text.trim()) { flash("Nothing to hand off yet."); return; }
      writeHandoff("fix", state.text);
      flash("Stored for the speed checker \u2014 opening it now\u2026");
    });
  }

  /* --------------------------------------------------------------- inputs */

  function addText(text, name) {
    state.name = name || "";
    state.text = String(text == null ? "" : text);
    state.cues = parseSrt(state.text);
    state.parseWarnings = [];
    if (state.text.trim() && !state.cues.length) state.parseWarnings.push("No SubRip cues were found \u2014 check that each block has a 'start --> end' timecode line.");
    const ta = $("#sub-text");
    if (ta) ta.value = state.text;
    run();
  }

  function addFiles(files) {
    const f = files && files[0];
    if (!f) return Promise.resolve();
    return new Promise(function (resolve) {
      const r = new FileReader();
      r.onload = function () {
        addText(r.result, f.name);
        flash("Loaded " + f.name + " (" + state.cues.length + " cues).");
        resolve();
      };
      r.onerror = function () { flash("Could not read " + (f.name || "file") + "."); resolve(); };
      r.readAsText(f);
    });
  }

  function clear() {
    state.name = "";
    state.text = "";
    state.cues = [];
    state.audit = null;
    state.fixResult = null;
    state.parseWarnings = [];
    const ta = $("#sub-text");
    if (ta) ta.value = "";
    run();
    flash("Cleared.");
  }

  /* ---------------------------------------------------------------- mount */

  function mount(el, options) {
    root = el;
    const opt = options || {};
    state.mode = opt.mode === "fix" ? "fix" : "speed";
    state.cues = [];
    state.audit = null;
    state.fixResult = null;
    state.parseWarnings = [];

    if (!root) {
      return { addText: function () {}, addFiles: function () {}, state: function () { return state; } };
    }

    const tip = state.mode === "speed"
      ? "Everything is parsed in your browser. Pick a broadcast profile (or set your own limits), paste SubRip text or drop an .srt file, and review the flagged cues \u2014 overlaps name the neighbouring cue and range. Tags like <i> and {\\an8} are stripped before measuring, and both raw and clean character counts are reported."
      : "Two-pass rewrap: the cue is first split at the clause punctuation nearest the midpoint, then greedy-wrapped \u2014 long tokens are only hard-cut when they cannot fit. <i>/{ \\an8 } tags stay anchored and timecodes are never touched.";

    root.className = "studio sub-studio sub-" + state.mode;
    root.innerHTML =
      '<p class="sub-tip">' + tip + "</p>" +
      (state.mode === "speed" ? speedMarkup() : fixMarkup());

    bindControls();

    const ho = readHandoff(state.mode === "speed" ? "fix" : "speed");
    if (ho) {
      clearHandoff();
      addText(ho.text, "hand-off.srt");
      flash("Loaded " + state.cues.length + " cues from the other subtitle tool.");
    } else {
      render();
    }

    const api = {
      mode: function () { return state.mode; },
      state: function () { return state; },
      addText: addText,
      addFiles: addFiles,
      reset: clear,
      setProfile: function (id) {
        state.profile = p2id(id);
        const sel = $("#sub-profile"); if (sel) sel.value = state.profile;
        run();
      },
      csvReport: function () { if (!state.audit) analyze(); return reportCsv(state.audit); },
      issuesSrt: function () { if (!state.audit) analyze(); return issuesSrt(state.cues, state.audit); },
      fixedSrt: function () { return fixedSrt(state.cues, state.fix); },
      audit: function () { return state.audit; },
      fixResult: function () { return state.fixResult; },
      parse: function () { return state.cues; },
      setText: function (t, n) { addText(t, n); }
    };
    if (typeof window !== "undefined" && window.SubtitleStudio) window.SubtitleStudio._active = api;
    return api;
  }

  function p2id(id) { return id === "bbc" ? "bbc" : id === "custom" ? "custom" : "netflix"; }

  /* --------------------------------------------------------- handoff load */

  /* If a hand-off exists when the page first mounts, the app can pull it into
     the textarea even before mount() is called. */
  function takeHandoff() {
    const want = state.mode === "speed" ? "fix" : "speed";
    const ho = readHandoff(want);
    if (!ho) return null;
    clearHandoff();
    return ho.text;
  }

  /* ================================================================ export */

  const api = {
    mount: mount,
    takeHandoff: takeHandoff,
    core: {
      num: num,
      clamp: clamp,
      esc: esc,
      PROFILE_LIST: PROFILE_LIST,
      normalizeProfile: normalizeProfile,
      wpmToCps: wpmToCps,
      fmtHmsMs: fmtHmsMs,
      fmtSrtTime: fmtSrtTime,
      parseTimecode: parseTimecode,
      parseSrt: parseSrt,
      serializeSrt: serializeSrt,
      stripTags: stripTags,
      measure: measure,
      tokenize: tokenize,
      joinTokens: joinTokens,
      hardCutToken: hardCutToken,
      wrapTokens: wrapTokens,
      splitAtClause: splitAtClause,
      rewrapCue: rewrapCue,
      fixCues: fixCues,
      detectOverlaps: detectOverlaps,
      cueMetrics: cueMetrics,
      auditCues: auditCues,
      reportCsv: reportCsv,
      issuesSrt: issuesSrt,
      fixedSrt: fixedSrt,
      csvOut: csvOut,
      SAMPLE_SRT: SAMPLE_SRT,
      HANDOFF_KEY: HANDOFF_KEY
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.SubtitleStudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
