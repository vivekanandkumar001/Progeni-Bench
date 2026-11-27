/*
 * Media Studio — shared video-thumbnail / audio-silence engine for two tools:
 *
 *   mode "thumbs"   — Video Thumbnail Contact Sheet (docs/TOOLS_ROADMAP.md 3.2)
 *        Configurable frame count (4–48), grid columns, per-thumb width,
 *        output padding and background colour. Seeks the video with a
 *        Promise.race timeout per frame and falls back to the previous frame
 *        (recording a warning) when a seek fails or times out — the loop never
 *        hangs. Burns a MM:SS.mmm timestamp + frame index under every thumb,
 *        shows a progress bar, and exports PNG / JPEG (with quality) plus an
 *        optional CSV of the sampled timestamps.
 *
 *   mode "silence"  — Podcast Silence Map (3.4)
 *        Silence threshold as a dBFS slider (converted to amplitude), window
 *        size, minimum gap length and channel mode (left / right / mix / max).
 *        Decodes locally, scans in chunks so the UI stays responsive, draws a
 *        peak-envelope waveform with the detected gaps shaded, lets you click a
 *        gap to preview-play it via an embedded <audio> element, and reports
 *        duration / total silence / % silence / gap count plus a gap list.
 *        Exports CSV (Start,End,Duration) and a plain-text list, with a copy
 *        button. Uses HH:MM:SS.mmm everywhere (fixes the old >1 h truncation).
 *
 * Shared pure core (frameTimes, gridPlan, fmtTimeHMSms, dbfsToAmp,
 * scanWindows, toGaps, peakEnvelope, summarize, combineChannels, ...) is
 * exported under MediaStudio.core for node --test (test/media.test.js).
 *
 * 100% client-side. Loaded before app.js; exposes window.MediaStudio.
 * Follows the conventions of image-studio.js / photo-batch-studio.js / album-studio.js
 * (IIFE, window global, pure core export, mount() returning a handle).
 */
(function () {
  "use strict";

  /* ============================================================== pure core */

  const num = function (v, d) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  const r3 = function (x) { return Math.round(x * 1000) / 1000; };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const pad = function (n, w) { return String(Math.trunc(Math.abs(n))).padStart(w, "0"); };
  const r3r = function (x) { return Math.round(x * 1000) / 1000; };
  const dur3 = function (windows, windowSec) { return Math.round(windows * windowSec * 1000) / 1000; };

  const DBFS_MIN = -120;

  /* -------------------------------------------------- timecode formatting */

  /* HH:MM:SS.mmm — never truncates the hour component (old fmtTime bug:
     90 min of audio displayed as "90:00" instead of "01:30:00"). */
  let fmtTimeHMSms = function (sec) {
    try {
      if (typeof window !== 'undefined' && window.Utils && window.Utils.fmtTimeHMSms) return window.Utils.fmtTimeHMSms(sec);
      if (typeof ProgeniUtils !== 'undefined' && ProgeniUtils.fmtTimeHMSms) return ProgeniUtils.fmtTimeHMSms(sec);
    } catch (e) {}
    let s = num(sec, 0);
    if (!Number.isFinite(s) || s < 0) s = 0;
    let ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const sInt = Math.floor(ms / 1000); ms -= sInt * 1000;
    return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(sInt, 2) + "." + pad(ms, 3);
  };
  if (typeof module === 'object' && module.exports) {
    try {
      const U = require('../core/utils');
      if (U.fmtTimeHMSms) fmtTimeHMSms = U.fmtTimeHMSms;
    } catch (e) {}
  }

  /* MM:SS.mmm — compact label used under each thumbnail. */
  function fmtTimeMSms(sec) {
    let s = num(sec, 0);
    if (!Number.isFinite(s) || s < 0) s = 0;
    let ms = Math.round(s * 1000);
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const sInt = Math.floor(ms / 1000); ms -= sInt * 1000;
    return pad(m, 2) + ":" + pad(sInt, 2) + "." + pad(ms, 3);
  }

  /* -------------------------------------------------- frame-time planning */

  /* Evenly spaced sample times from 0 to (duration − eps). The final frame is
     deliberately short of the exact duration, which is blank in some codecs. */
  function frameTimes(duration, count, eps) {
    const d = num(duration, 0);
    const n = Math.max(1, Math.round(num(count, 1)));
    const e = Math.max(0, num(eps, 0.04));
    if (!(d > 0)) return [0];
    let last = Math.max(0, d - e);
    if (last >= d) last = Math.max(0, d - 0.001);
    const out = [];
    if (n === 1) return [0];
    for (let i = 0; i < n; i++) out.push(r3r(last * i / (n - 1)));
    return out;
  }

  /* Contact-sheet geometry. `labelH` is the extra strip under each thumb used
     for the burned-in timestamp label (0 when labels are off). */
  function gridPlan(count, cols, thumbW, thumbH, padding, labelH) {
    const n = Math.max(0, Math.round(num(count, 0)));
    const tw = Math.max(1, Math.round(num(thumbW, 320)));
    const th = Math.max(1, Math.round(num(thumbH, Math.round(tw * 9 / 16))));
    const p = Math.max(0, Math.round(num(padding, 10)));
    const lh = Math.max(0, Math.round(num(labelH, 0)));
    const c = clamp(Math.round(num(cols, 1)), 1, Math.max(1, n || 1));
    const rows = n > 0 ? Math.ceil(n / c) : 0;
    const cellH = th + lh;
    const width = p * (c + 1) + c * tw;
    const height = rows > 0 ? p * (rows + 1) + rows * cellH : p * 2;
    const cells = [];
    for (let i = 0; i < n; i++) {
      const col = i % c;
      const row = Math.floor(i / c);
      const x = p + col * (tw + p);
      const y = p + row * (cellH + p);
      cells.push({
        i: i, col: col, row: row,
        x: x, y: y,
        thumbX: x, thumbY: y, thumbW: tw, thumbH: th,
        labelX: x, labelY: y + th, labelW: tw, labelH: lh
      });
    }
    return {
      count: n, cols: c, rows: rows,
      thumbW: tw, thumbH: th, padding: p, labelH: lh,
      cellW: tw, cellH: cellH, width: width, height: height, cells: cells
    };
  }

  /* -------------------------------------------------- audio level helpers */

  /* dBFS (0 dB = full scale) -> linear amplitude. -Infinity / very low -> 0. */
  function dbfsToAmp(db) {
    const d = num(db, DBFS_MIN);
    if (!Number.isFinite(d) || d <= DBFS_MIN) return 0;
    return Math.pow(10, d / 20);
  }

  function ampToDbfs(amp) {
    const a = Math.abs(num(amp, 0));
    if (a <= 0) return -Infinity;
    return 20 * Math.log10(a);
  }

  /* Flatten an arbitrary set of channels into one analysis signal. */
  function combineChannels(channels, mode) {
    const list = Array.isArray(channels) ? channels.filter(Boolean) : [];
    if (!list.length) return new Float32Array(0);
    if (mode === "right") return list[1] || list[0];
    if (mode === "left" || !list[1]) return list[0];
    const len = list[0].length;
    const out = new Float32Array(len);
    if (mode === "max") {
      for (let i = 0; i < len; i++) {
        let m = 0;
        for (let c = 0; c < list.length; c++) {
          const v = list[c][i];
          if (Math.abs(v) > Math.abs(m)) m = v;
        }
        out[i] = m;
      }
    } else {
      const inv = 1 / list.length;
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < list.length; c++) s += list[c][i];
        out[i] = s * inv;
      }
    }
    return out;
  }

  /* Window-by-window silence flags. Flags are 1 when the window level is below
     `threshold` (an amplitude), else 0. `method` is "rms" (default) or "ma". */
  function scanWindows(samples, opts) {
    const o = opts || {};
    const n = samples ? samples.length : 0;
    const win = Math.max(1, Math.round(num(o.windowSize, 1)));
    const thr = Math.max(0, num(o.threshold, 0));
    const method = o.method === "ma" ? "ma" : "rms";
    const flags = [];
    if (!n) return flags;
    for (let i = 0; i < n; i += win) {
      const end = Math.min(i + win, n);
      let sum = 0;
      for (let j = i; j < end; j++) {
        const v = samples[j];
        sum += method === "ma" ? Math.abs(v) : v * v;
      }
      const len = end - i;
      const val = method === "ma" ? sum / len : Math.sqrt(sum / len);
      flags.push(val < thr ? 1 : 0);
    }
    return flags;
  }

  /* Convert a flag array into gaps. A gap is a run of consecutive silent
     windows whose length (runLength × windowSec) is at least minGapSec. */
  function toGaps(flags, windowSec, minGapSec, startTime) {
    const f = flags || [];
    const w = Math.max(0, num(windowSec, 0));
    const min = Math.max(0, num(minGapSec, 0));
    const t0 = Math.max(0, num(startTime, 0));
    const gaps = [];
    let i = 0;
    while (i < f.length) {
      if (f[i]) {
        let j = i;
        while (j < f.length && f[j]) j++;
        const duration = r3r((j - i) * w);
        if (dur3(j - i, w) >= min - 1e-9) {
          gaps.push({ start: r3r(t0 + i * w), end: r3r(t0 + j * w), duration: duration, windows: j - i });
        }
        i = j;
      } else {
        i++;
      }
    }
    return gaps;
  }

  /* Peak (min/max) envelope with `buckets` columns — used for the waveform. */
  function peakEnvelope(samples, buckets) {
    const n = samples ? samples.length : 0;
    const b = Math.max(0, Math.round(num(buckets, 0)));
    const out = [];
    if (!n || b <= 0) return out;
    for (let k = 0; k < b; k++) {
      const start = Math.floor(k * n / b);
      const end = Math.max(start + 1, Math.floor((k + 1) * n / b));
      let min = Infinity, max = -Infinity;
      for (let i = start; i < end && i < n; i++) {
        const v = samples[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min === Infinity) { min = 0; max = 0; }
      out.push({ min: min, max: max });
    }
    return out;
  }

  function summarize(gaps, duration) {
    const g = gaps || [];
    let total = 0;
    let longest = 0;
    for (let i = 0; i < g.length; i++) {
      const d = num(g[i].duration, 0);
      total += d;
      if (d > longest) longest = d;
    }
    const dur = Math.max(0, num(duration, 0));
    return {
      count: g.length,
      duration: dur,
      totalSilence: r3r(total),
      percentSilence: dur > 0 ? (total / dur) * 100 : 0,
      longest: r3r(longest),
      firstStart: g.length ? num(g[0].start, 0) : null
    };
  }

  /* ------------------------------------------------------------------ DOM */

  let root = null;
  let noteTimer = 0;
  const $ = function (sel) { return root ? root.querySelector(sel) : null; };
  const $$ = function (sel) { return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; };

  const state = {
    mode: "thumbs",
    root: null,
    file: null,
    duration: 0,
    running: false,
    warnings: [],
    frames: [],
    plan: null,
    sheetCanvas: null,
    buffer: null,
    gaps: [],
    envelope: [],
    audioUrl: null,
    videoUrl: null,
    playUntil: 0,
    thumbs: {
      count: 12,
      cols: 3,
      width: 480,
      padding: 14,
      bg: "#0f172a",
      labels: true,
      quality: 0.92,
      seekTimeout: 8000
    },
    silence: {
      thresholdDb: -45,
      windowMs: 100,
      minGapSec: 0.5,
      channel: "mix"
    }
  };

  const THUMB_WIDTHS = [240, 320, 480, 640, 960];

  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function escapeAttr(s) { return esc(s); }

  function setProgress(on, pct, msg) {
    const bar = $("#med-progress");
    if (!bar) return;
    bar.hidden = !on;
    const fill = $("#med-progress-fill");
    if (fill) fill.style.width = clamp(num(pct, 0), 0, 100) + "%";
    if (msg != null) {
      const label = $("#med-progress-label");
      if (label) label.textContent = msg;
    }
  }

  function setStatus(msg) {
    const el = $("#med-status");
    if (el) el.textContent = msg;
  }

  function flash(msg) {
    setStatus(msg);
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      noteTimer = 0;
      renderModeMeta();
    }, 3600);
  }

  function showError(msg) {
    const el = $("#med-error");
    if (!el) return;
    el.hidden = !msg;
    el.innerHTML = msg ? "⚠️ " + esc(msg) : "";
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }

  function downloadText(text, name, type) {
    downloadBlob(new Blob([text], { type: type || "text/plain;charset=utf-8" }), name);
  }

  function sleep0() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* ----------------------------------------------------- video seek helpers */

  function withTimeout(promise, ms, msg) {
    let t = 0;
    const timeout = new Promise(function (_, reject) {
      t = setTimeout(function () { reject(new Error(msg)); }, ms);
    });
    return Promise.race([promise, timeout]).finally(function () { clearTimeout(t); });
  }

  /* Race the "seeked" event against a timeout; a failed/timed-out seek rejects
     so the caller can fall back instead of hanging forever. */
  function seekRace(v, time, ms) {
    let cancel = function () {};
    const seekP = new Promise(function (resolve, reject) {
      const onSeeked = function () { cancel(); resolve(true); };
      const onError = function () { cancel(); reject(new Error("the video element errored while seeking")); };
      cancel = function () {
        v.removeEventListener("seeked", onSeeked);
        v.removeEventListener("error", onError);
      };
      v.addEventListener("seeked", onSeeked);
      v.addEventListener("error", onError);
      try { v.currentTime = time; } catch (e) { cancel(); reject(e); }
    });
    const timeoutP = new Promise(function (_, reject) {
      const timer = setTimeout(function () { reject(new Error("seek timed out after " + ms + " ms")); }, ms);
      const prev = cancel;
      cancel = function () { clearTimeout(timer); prev(); };
    });
    return Promise.race([seekP, timeoutP]).finally(function () { cancel(); });
  }

  /* ------------------------------------------------------------ thumbs mode */

  function loadVideo(file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const meta = new Promise(function (resolve, reject) {
      v.addEventListener("loadedmetadata", function () { resolve(true); }, { once: true });
      v.addEventListener("error", function () {
        reject(new Error("The browser could not decode this video. Try an MP4 (H.264/AAC) or WebM (VP8/VP9) export — ProRes, DNxHD, HEVC-in-MKV and DRM-protected files are usually unsupported."));
      }, { once: true });
    });
    v.src = url;
    return withTimeout(meta, 30000, "Timed out waiting for video metadata (30 s). The file may be corrupt or use an unsupported codec.")
      .then(function () {
        const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        return {
          v: v, url: url, duration: duration,
          width: v.videoWidth || 640,
          height: v.videoHeight || 360
        };
      });
  }

  function drawLabel(ctx, cell, frame, plan) {
    if (plan.labelH <= 0) return;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(cell.labelX, cell.labelY, cell.labelW, plan.labelH);
    ctx.fillStyle = "#e2e8f0";
    const fs = Math.max(10, Math.round(plan.labelH * 0.5));
    ctx.font = fs + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";
    const label = "#" + pad(frame.index + 1, 2) + "  " + fmtTimeMSms(frame.t);
    ctx.fillText(label, cell.labelX + Math.max(4, Math.round(cell.labelW * 0.02)), cell.labelY + plan.labelH / 2 + 1);
    ctx.restore();
  }

  async function captureSheet(file) {
    if (!file) return;
    state.running = true;
    state.warnings = [];
    state.frames = [];
    state.plan = null;
    state.file = file;
    syncThumbsState();
    showError("");
    renderWarnings();
    setProgress(true, 1, "Loading video…");
    setStatus("Loading video…");

    let loaded;
    try {
      loaded = await loadVideo(file);
    } catch (e) {
      state.running = false;
      setProgress(false, 0, "");
      showError(e && e.message ? e.message : String(e));
      setStatus("Could not read this video.");
      return;
    }

    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = loaded.url;
    state.duration = loaded.duration;

    const o = state.thumbs;
    const tw = Math.max(80, Math.round(o.width));
    const th = Math.max(1, Math.round(tw * loaded.height / loaded.width));
    const labelH = state.thumbs.labels ? clamp(Math.round(th * 0.16), 18, 40) : 0;
    const plan = gridPlan(state.thumbs.count, state.thumbs.cols, tw, th, state.thumbs.padding, labelH);

    const canvas = $("#med-canvas");
    if (!canvas) { state.running = false; return; }
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = state.thumbs.bg;
    ctx.fillRect(0, 0, plan.width, plan.height);

    state.plan = plan;
    state.sheetCanvas = canvas;

    const times = frameTimes(loaded.duration, state.thumbs.count, 0.04);
    setProgress(true, 4, "Extracting " + times.length + " frames…");
    setStatus("Extracting " + times.length + " frames…");

    for (let i = 0; i < times.length; i++) {
      const cell = plan.cells[i];
      let ok = true, err = "";
      try {
        await seekRace(loaded.v, times[i], state.thumbs.seekTimeout);
        ctx.drawImage(loaded.v, cell.thumbX, cell.thumbY, cell.thumbW, cell.thumbH);
      } catch (e) {
        ok = false;
        err = e && e.message ? e.message : String(e);
        state.warnings.push("Frame " + (i + 1) + " @ " + fmtTimeMSms(times[i]) + " — " + err + " (copied previous frame)");
        if (i > 0) {
          const p = plan.cells[i - 1];
          ctx.drawImage(canvas, p.thumbX, p.thumbY, p.thumbW, p.thumbH, cell.thumbX, cell.thumbY, cell.thumbW, cell.thumbH);
        } else {
          ctx.save();
          ctx.fillStyle = "#334155";
          ctx.fillRect(cell.thumbX, cell.thumbY, cell.thumbW, cell.thumbH);
          ctx.restore();
        }
      }
      const frame = { index: i, t: times[i], ok: ok, error: err, timecode: fmtTimeMSms(times[i]) };
      state.frames.push(frame);
      if (state.thumbs.labels) drawLabel(ctx, cell, frame, plan);
      setProgress(true, 2 + Math.round(((i + 1) / times.length) * 97), "Frame " + (i + 1) + " / " + times.length);
      await sleep0();
    }

    setProgress(false, 100, "");
    state.running = false;
    syncThumbsState();
    flash("Contact sheet ready — " + times.length + " frames.");
    renderWarnings();
    renderModeMeta();
  }

  function renderWarnings() {
    const el = $("#med-warn");
    if (!el) return;
    if (!state.warnings.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = "<strong>" + state.warnings.length + " frame warning" + (state.warnings.length === 1 ? "" : "s") + "</strong><ul>"
      + state.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
  }

  function thumbsCsv() {
    const lines = ["Index,Timecode,Seconds,Status"];
    state.frames.forEach(function (f) {
      lines.push([(f.index + 1), f.timecode, f.t.toFixed(3), f.ok ? "ok" : "fallback"].join(","));
    });
    return lines.join("\r\n");
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (!canvas) { resolve(null); return; }
      canvas.toBlob(function (b) { resolve(b); }, type, quality);
    });
  }

  function thumbsDownload(type) {
    if (!state.sheetCanvas) { flash("Load a video first."); return; }
    const q = type === "image/jpeg" ? state.thumbs.quality : undefined;
    canvasToBlob(state.sheetCanvas, type, q).then(function (blob) {
      if (!blob) return;
      const ext = type === "image/jpeg" ? "jpg" : "png";
      downloadBlob(blob, "video-contact-sheet." + ext);
    });
  }

  /* ----------------------------------------------------------- silence mode */

  function loadAudio(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("The Web Audio API is unavailable in this browser, so audio cannot be decoded."));
    const url = URL.createObjectURL(file);
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = url;
    const ac = new AC();
    return file.arrayBuffer()
      .then(function (ab) { return ac.decodeAudioData(ab.slice(0)); })
      .then(function (buf) { return buf; })
      .finally(function () { try { if (ac.close) ac.close(); } catch (e) { /* ignore */ } });
  }

  async function scanChunked(samples, opts, onProgress) {
    const win = Math.max(1, opts.windowSize);
    const total = Math.ceil(samples.length / win);
    const flags = new Uint8Array(total);
    const CHUNK = 40000;
    for (let start = 0; start < total; start += 20000) {
      const end = Math.min(total, start + CHUNK);
      for (let w = start; w < end; w++) {
        const i = w * win;
        const e = Math.min(i + win, samples.length);
        let sum = 0;
        for (let j = i; j < e; j++) { const v = samples[j]; sum += v * v; }
        const len = e - i;
        flags[w] = Math.sqrt(sum / (len || 1)) < opts.threshold ? 1 : 0;
      }
      if (onProgress) onProgress(total ? end / total : 1);
      await sleep0();
    }
    return flags;
  }

  async function analyseAudio() {
    if (!state.buffer) return;
    state.running = true;
    syncSilenceState();
    showError("");
    const buf = state.buffer;
    const sr = buf.sampleRate;
    const o = state.silence;
    const channels = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
    const mono = combineChannels(channels, o.channel);
    const windowSize = Math.max(1, Math.round(sr * o.windowMs / 1000));
    const thr = dbfsToAmp(o.thresholdDb);
    const windowSec = windowSize / sr;

    setProgress(true, 2, "Scanning waveform…");
    setStatus("Scanning waveform…");
    const flags = await scanChunked(mono, { windowSize: windowSize, threshold: thr }, function (frac) {
      setProgress(true, 2 + Math.round(frac * 94), "Scanning waveform… " + Math.round(frac * 100) + "%");
    });

    state.gaps = toGaps(flags, windowSec, state.silence.minGapSec, 0);
    state.duration = buf.duration;
    state.envelope = peakEnvelope(mono, 1200);
    renderWaveform(mono, state.gaps, state.duration);
    renderGapReport();
    setProgress(false, 100, "");
    state.running = false;
    syncSilenceState();
    renderModeMeta();
  }

  function renderWaveform(samples, gaps, duration) {
    const canvas = $("#med-wave");
    if (!canvas) return;
    const parent = canvas.parentElement;
    const avail = (parent && parent.clientWidth) || canvas.clientWidth || 900;
    const outW = clamp(Math.round(avail), 320, 1600);
    const outH = 180;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, outW, outH);

    // shade the detected gaps behind the waveform
    const dur = duration > 0 ? duration : 1;
    ctx.fillStyle = "rgba(239,68,68,0.22)";
    gaps.forEach(function (g) {
      const x1 = clamp((g.start / dur) * outW, 0, outW);
      const x2 = clamp((g.end / dur) * outW, 0, outW);
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), outH);
    });

    // zero line
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, outH / 2);
    ctx.lineTo(outW, outH / 2);
    ctx.stroke();

    const env = peakEnvelope(samples, outW);
    ctx.fillStyle = "#1d4ed8";
    for (let x = 0; x < env.length; x++) {
      const e = env[x];
      const top = outH / 2 - e.max * (outH / 2) * 0.94;
      const bottom = outH / 2 - e.min * (outH / 2) * 0.94;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }

  function playGap(gap) {
    const a = $("#med-audio");
    if (!a || !state.audioUrl) return;
    if (!a.src) a.src = state.audioUrl;
    state.playUntil = gap.end;
    try { a.currentTime = gap.start; } catch (e) { /* ignore */ }
    const p = a.play();
    if (p && p.catch) p.catch(function () { /* autoplay may be blocked */ });
  }

  function renderGapReport() {
    const s = summarize(state.gaps, state.duration);
    const stats = $("#med-stats");
    if (stats) {
      stats.innerHTML =
        '<div class="stat"><b>' + fmtTimeHMSms(s.duration) + '</b>File duration</div>' +
        '<div class="stat"><b>' + s.count + '</b>Silence gaps</div>' +
        '<div class="stat"><b>' + s.totalSilence.toFixed(2) + 's</b>Total silence</div>' +
        '<div class="stat"><b>' + s.percentSilence.toFixed(1) + '%</b>Silence share</div>' +
        '<div class="stat"><b>' + (s.longest ? s.longest.toFixed(2) + 's' : '—') + '</b>Longest gap</div>';
    }
    const list = $("#med-gaps");
    if (!list) return;
    if (!state.gaps.length) {
      list.innerHTML = '<div class="med-empty">No silence at or above the current threshold. Lower the threshold (more negative dBFS) or shorten the minimum gap.</div>';
    } else {
      list.innerHTML =
        '<table class="med-table"><thead><tr><th>#</th><th>Start</th><th>End</th><th>Duration</th><th></th></tr></thead><tbody>' +
        state.gaps.map(function (g, i) {
          return '<tr data-gap="' + i + '" tabindex="0"><td>' + (i + 1) + '</td><td class="med-mono">' + fmtTimeHMSms(g.start) +
            '</td><td class="med-mono">' + fmtTimeHMSms(g.end) + '</td><td class="med-mono">' + g.duration.toFixed(2) + 's</td>' +
            '<td><button type="button" class="med-play" data-gap="' + i + '" aria-label="Preview gap ' + (i + 1) + '">▶ Play</button></td></tr>';
        }).join("") + "</tbody></table>";
    }
    bindGapClicks();
  }

  function bindGapClicks() {
    $$("[data-gap]").forEach(function (el) {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      const idx = parseInt(el.getAttribute("data-gap"), 10);
      const go = function () { if (state.gaps[idx]) playGap(state.gaps[idx]); };
      el.addEventListener("click", go);
      if (el.tagName === "TR") {
        el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      }
    });
  }

  function gapsCsv() {
    const lines = ["Start,End,Duration"];
    state.gaps.forEach(function (g) {
      lines.push([fmtTimeHMSms(g.start), fmtTimeHMSms(g.end), fmtTimeHMSms(g.duration)].join(","));
    });
    return lines.join("\r\n");
  }

  function gapsText() {
    if (!state.gaps.length) return "No silence detected.";
    return state.gaps.map(function (g, i) {
      return (i + 1) + ". " + fmtTimeHMSms(g.start) + " → " + fmtTimeHMSms(g.end) + "  (" + g.duration.toFixed(2) + "s)";
    }).join("\n");
  }

  /* ------------------------------------------------------- render / controls */

  function syncThumbsState() {
    if (state.mode !== "thumbs" || !root) return;
    const has = state.frames.length > 0 && !!state.sheetCanvas && !state.running;
    ["#med-dl-png", "#med-dl-jpeg", "#med-csv"].forEach(function (sel) {
      const b = $(sel); if (b) b.disabled = !has;
    });
    const empty = $("#med-preview-empty");
    if (empty) empty.hidden = has;
    const prev = $("#med-preview");
    if (prev) prev.classList.toggle("has-sheet", !!state.sheetCanvas);
  }

  function syncSilenceState() {
    if (state.mode !== "silence" || !root) return;
    const has = !!state.buffer && !state.running;
    ["#med-csv", "#med-txt", "#med-copy"].forEach(function (sel) {
      const b = $(sel); if (b) b.disabled = !has;
    });
    const empty = $("#med-silence-empty");
    if (empty) empty.hidden = has;
    const results = $("#med-results");
    if (results) results.classList.toggle("has-data", has);
  }

  function renderModeMeta() {
    if (state.mode === "thumbs") {
      syncThumbsState();
      if (!state.plan) { setStatus("No video loaded yet."); return; }
      setStatus(state.frames.length + " frames · " + state.plan.width + "×" + state.plan.height + " px sheet · " +
        state.plan.cols + " cols × " + state.plan.rows + " rows" + (state.warnings.length ? " · " + state.warnings.length + " warnings" : ""));
    } else {
      syncSilenceState();
      if (!state.buffer) { setStatus("No audio loaded yet."); return; }
      const s = summarize(state.gaps, state.duration);
      setStatus(fmtTimeHMSms(state.duration) + " audio · " + s.count + " gaps · " + s.percentSilence.toFixed(1) + "% silence");
    }
  }

  function thumbsMarkup() {
    const widthOpts = THUMB_WIDTHS.map(function (w) {
      return '<option value="' + w + '"' + (w === state.thumbs.width ? " selected" : "") + ">" + w + " px</option>";
    }).join("");
    const colOpts = [];
    for (let c = 1; c <= 8; c++) colOpts.push('<option value="' + c + '"' + (c === state.thumbs.cols ? " selected" : "") + ">" + c + "</option>");
    return '' +
      '<div class="studio-controls med-controls med-thumb-controls">' +
        '<div class="med-basic-grid">' +
          '<label class="st-field"><span>Frame count <b id="med-count-v">' + state.thumbs.count + '</b></span>' +
            '<input type="range" id="med-count" min="4" max="48" step="1" value="' + state.thumbs.count + '" aria-label="Frame count"></label>' +
          '<label class="st-field"><span>Grid columns</span><select id="med-cols" aria-label="Grid columns">' + colOpts.join("") + "</select></label>" +
        "</div>" +
        '<details class="med-advanced" id="med-advanced">' +
          '<summary><span>Layout &amp; export</span><small>Thumb size, padding, labels, quality</small></summary>' +
          '<div class="med-advanced-grid">' +
            '<label class="st-field"><span>Thumbnail width</span><select id="med-width" aria-label="Thumbnail width">' + widthOpts + "</select></label>" +
            '<label class="st-field"><span>Padding <b id="med-pad-v">' + state.thumbs.padding + ' px</b></span>' +
              '<input type="range" id="med-pad" min="0" max="48" step="1" value="' + state.thumbs.padding + '" aria-label="Padding"></label>' +
            '<label class="st-field"><span>Background</span><input type="color" id="med-bg" value="' + state.thumbs.bg + '" aria-label="Background colour"></label>' +
            '<label class="st-check"><input type="checkbox" id="med-labels"' + (state.thumbs.labels ? " checked" : "") + "> Burn timestamp + frame index</label>" +
            '<label class="st-field"><span>JPEG quality <b id="med-q-v">' + Math.round(state.thumbs.quality * 100) + '%</b></span>' +
              '<input type="range" id="med-q" min="40" max="100" step="1" value="' + Math.round(state.thumbs.quality * 100) + '" aria-label="JPEG quality"></label>' +
          "</div>" +
        "</details>" +
      "</div>" +
      '<div class="st-progress" id="med-progress" hidden><div class="st-progress-fill" id="med-progress-fill"></div><div class="st-progress-label" id="med-progress-label"></div></div>' +
      '<div class="med-preview">' +
        '<div class="med-preview-empty" id="med-preview-empty"><strong>No contact sheet yet.</strong><span>Add a video above to sample evenly spaced frames into a printable grid.</span></div>' +
        '<canvas id="med-canvas" aria-label="Video contact sheet preview"></canvas>' +
      "</div>" +
      '<div class="med-warnings" id="med-warn" hidden></div>' +
      '<div class="med-error" id="med-error" hidden></div>' +
      '<div class="studio-bar"><div class="studio-meta" id="med-status" aria-live="polite">No video loaded yet.</div>' +
        '<div class="studio-actions">' +
          '<button type="button" class="btn" id="med-dl-png">Download PNG</button>' +
          '<button type="button" class="btn secondary" id="med-dl-jpeg">Download JPEG</button>' +
          '<button type="button" class="btn secondary" id="med-csv">Download CSV</button>' +
          '<button type="button" class="btn secondary" id="med-clear">Clear</button>' +
        "</div></div>";
  }

  function silenceMarkup() {
    return '' +
      '<div class="studio-controls med-controls med-silence-controls">' +
        '<div class="med-basic-grid">' +
          '<label class="st-field"><span>Silence threshold <b id="med-thr-v">' + state.silence.thresholdDb + ' dBFS</b></span>' +
            '<input type="range" id="med-thr" min="-80" max="-10" step="1" value="' + state.silence.thresholdDb + '" aria-label="Silence threshold in dBFS"></label>' +
          '<label class="st-field"><span>Minimum gap <b id="med-gap-v">' + state.silence.minGapSec.toFixed(2) + ' s</b></span>' +
            '<input type="range" id="med-gap" min="0.1" max="5" step="0.1" value="' + state.silence.minGapSec + '" aria-label="Minimum gap length"></label>' +
        "</div>" +
        '<details class="med-advanced" id="med-advanced">' +
          '<summary><span>Detection detail</span><small>Window size, channel mode</small></summary>' +
          '<div class="med-advanced-grid">' +
            '<label class="st-field"><span>Window size <b id="med-win-v">' + state.silence.windowMs + ' ms</b></span>' +
              '<input type="range" id="med-win" min="20" max="1000" step="10" value="' + state.silence.windowMs + '" aria-label="Analysis window size"></label>' +
            '<label class="st-field"><span>Channel mode</span><select id="med-ch" aria-label="Channel mode">' +
              ["left", "right", "mix", "max"].map(function (m) {
                return '<option value="' + m + '"' + (m === state.silence.channel ? " selected" : "") + ">" + esc(m === "max" ? "Max of channels" : m === "mix" ? "Mix (mono)" : m) + "</option>";
              }).join("") + "</select></label>" +
          "</div>" +
        "</details>" +
      "</div>" +
      '<div class="st-progress" id="med-progress" hidden><div class="st-progress-fill" id="med-progress-fill"></div><div class="st-progress-label" id="med-progress-label"></div></div>' +
      '<div class="med-results" id="med-results">' +
        '<div class="med-results-head"><h2>Silence analysis</h2><span class="med-results-tip">Click a shaded area or a gap row to preview it</span></div>' +
        '<div class="med-silence-empty" id="med-silence-empty"><strong>No audio analysed yet.</strong><span>Add an audio file above to see its waveform, silence gaps and export list.</span></div>' +
        '<div class="stats" id="med-stats"></div>' +
        '<div class="med-wave"><canvas id="med-wave" aria-label="Waveform with silence gaps shaded"></canvas></div>' +
        '<audio id="med-audio" preload="none" aria-label="Gap preview player"></audio>' +
        '<div class="med-error" id="med-error" hidden></div>' +
        '<div class="med-gaps" id="med-gaps"></div>' +
      "</div>" +
      '<div class="studio-bar"><div class="studio-meta" id="med-status" aria-live="polite">No audio loaded yet.</div>' +
        '<div class="studio-actions">' +
          '<button type="button" class="btn" id="med-csv" disabled>Download CSV</button>' +
          '<button type="button" class="btn secondary" id="med-txt" disabled>Download text list</button>' +
          '<button type="button" class="btn secondary" id="med-copy" disabled>Copy list</button>' +
          '<button type="button" class="btn secondary" id="med-clear">Clear</button>' +
        "</div></div>";
  }

  function debounceRerun() {
    if (state._debounce) clearTimeout(state._debounce);
    state._debounce = setTimeout(function () {
      state._debounce = 0;
      if (!state.file) return;
      if (state.mode === "thumbs") captureSheet(state.file);
      else if (state.buffer) analyseAudio();
    }, 280);
  }

  function bindThumbsControls() {
    const count = $("#med-count");
    if (count) count.addEventListener("input", function () {
      state.thumbs.count = clamp(parseInt(count.value, 10) || 12, 4, 48);
      const v = $("#med-count-v"); if (v) v.textContent = state.thumbs.count;
      debounceRerun();
    });
    const cols = $("#med-cols");
    if (cols) cols.addEventListener("change", function () { state.thumbs.cols = clamp(parseInt(cols.value, 10) || 3, 1, 8); debounceRerun(); });
    const width = $("#med-width");
    if (width) width.addEventListener("change", function () { state.thumbs.width = parseInt(width.value, 10) || 480; debounceRerun(); });
    const pad = $("#med-pad");
    if (pad) pad.addEventListener("input", function () {
      state.thumbs.padding = clamp(parseInt(pad.value, 10) || 0, 0, 48);
      const v = $("#med-pad-v"); if (v) v.textContent = state.thumbs.padding + " px";
      debounceRerun();
    });
    const bg = $("#med-bg");
    if (bg) bg.addEventListener("input", function () { state.thumbs.bg = bg.value; debounceRerun(); });
    const labels = $("#med-labels");
    if (labels) labels.addEventListener("change", function () { state.thumbs.labels = labels.checked; debounceRerun(); });
    const q = $("#med-q");
    if (q) q.addEventListener("input", function () {
      state.thumbs.quality = clamp((parseInt(q.value, 10) || 92) / 100, 0.4, 1);
      const v = $("#med-q-v"); if (v) v.textContent = Math.round(state.thumbs.quality * 100) + "%";
    });
    const png = $("#med-dl-png"); if (png) png.addEventListener("click", function () { thumbsDownload("image/png"); });
    const jpg = $("#med-dl-jpeg"); if (jpg) jpg.addEventListener("click", function () { thumbsDownload("image/jpeg"); });
    const csv = $("#med-csv"); if (csv) csv.addEventListener("click", function () {
      if (!state.frames.length) { flash("Load a video first."); return; }
      downloadText(thumbsCsv(), "video-thumbnails.csv", "text/csv;charset=utf-8");
    });
  }

  function bindSilenceControls() {
    const thr = $("#med-thr");
    if (thr) thr.addEventListener("input", function () {
      state.silence.thresholdDb = clamp(parseInt(thr.value, 10) || -45, -80, -10);
      const v = $("#med-thr-v"); if (v) v.textContent = state.silence.thresholdDb + " dBFS";
      debounceRerun();
    });
    const win = $("#med-win");
    if (win) win.addEventListener("input", function () {
      state.silence.windowMs = clamp(parseInt(win.value, 10) || 100, 20, 1000);
      const v = $("#med-win-v"); if (v) v.textContent = state.silence.windowMs + " ms";
      debounceRerun();
    });
    const gap = $("#med-gap");
    if (gap) gap.addEventListener("input", function () {
      state.silence.minGapSec = clamp(parseFloat(gap.value) || 0.5, 0.1, 5);
      const v = $("#med-gap-v"); if (v) v.textContent = state.silence.minGapSec.toFixed(2) + " s";
      debounceRerun();
    });
    const ch = $("#med-ch");
    if (ch) ch.addEventListener("change", function () { state.silence.channel = $("#med-ch").value; debounceRerun(); });

    const csv = $("#med-csv"); if (csv) csv.addEventListener("click", function () {
      if (!state.buffer) { flash("Load audio first."); return; }
      downloadText(gapsCsv(), "silence-map.csv", "text/csv;charset=utf-8");
    });
    const txt = $("#med-txt"); if (txt) txt.addEventListener("click", function () {
      if (!state.buffer) { flash("Load audio first."); return; }
      downloadText("Silence map — " + fmtTimeHMSms(state.duration) + "\n\n" + gapsText() + "\n", "silence-map.txt");
    });
    const copy = $("#med-copy"); if (copy) copy.addEventListener("click", function () {
      copyList(gapsText());
    });
    if (waveformCanvas()) {
      $("#med-wave").addEventListener("click", function (e) {
        if (!state.duration) return;
        const rect = $("#med-wave").getBoundingClientRect();
        const frac = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const t = frac * state.duration;
        const hit = state.gaps.find(function (g) { return t >= g.start && t <= g.end; });
        if (hit) playGap(hit);
      });
    }
    if ($("#med-audio")) {
      $("#med-audio").addEventListener("timeupdate", function (e) {
        if (state.playUntil && e.target.currentTime >= state.playUntil) {
          e.target.pause();
          state.playUntil = 0;
        }
      });
    }
  }

  function waveformCanvas() { return $("#med-wave"); }

  function copyList(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash("Gap list copied to clipboard."); },
        function () { flash("Copy failed — select the list and copy manually."); });
    } else {
      flash("Clipboard unavailable in this browser.");
    }
  }

  function bindClear() {
    const btn = $("#med-clear");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (state.videoUrl) { URL.revokeObjectURL(state.videoUrl); state.videoUrl = null; }
      if (state.audioUrl) { URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; }
      state.file = null;
      state.duration = 0;
      state.frames = [];
      state.plan = null;
      state.sheetCanvas = null;
      state.buffer = null;
      state.gaps = [];
      state.envelope = [];
      state.warnings = [];
      showError("");
      renderWarnings();
      syncThumbsState();
      syncSilenceState();
      if (state.mode === "thumbs") {
        const c = $("#med-canvas");
        if (c) { const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height); }
      } else {
        const stats = $("#med-stats"); if (stats) stats.innerHTML = "";
        const gaps = $("#med-gaps"); if (gaps) gaps.innerHTML = "";
        const wave = $("#med-wave"); if (wave) { const x = wave.getContext("2d"); x.clearRect(0, 0, wave.width, wave.height); }
      }
      flash("Cleared.");
    });
  }

  function mount(el, options) {
    root = el;
    if (!root) {
      return { addFiles: function () {}, state: function () { return state; }, reset: function () {} };
    }
    const opt = options || {};
    state.mode = opt.mode === "silence" ? "silence" : "thumbs";
    state.root = el;
    state.file = null;
    state.duration = 0;
    state.frames = [];
    state.plan = null;
    state.sheetCanvas = null;
    state.buffer = null;
    state.gaps = [];
    state.envelope = [];
    state.warnings = [];
    state.running = false;

    const tip = state.mode === "thumbs"
      ? "Frames are grabbed with a per-seek timeout and an automatic previous-frame fallback, so a stubborn video never hangs the sheet. Timestamps are burned under every thumb."
      : "Audio is decoded and scanned locally in chunks. Shade-detected gaps can be clicked to preview-play; nothing is uploaded.";

    root.className = "studio med-studio med-" + state.mode;
    root.innerHTML =
      '<p class="med-tip">' + tip + "</p>" +
      '<div class="studio-toolbar"><button type="button" class="btn" id="med-add">＋ Add file</button>' +
      '<input type="file" id="med-file" hidden></div>' +
      (state.mode === "thumbs" ? thumbsMarkup() : silenceMarkup());

    const fileInput = $("#med-file");
    if (fileInput) fileInput.accept = state.mode === "thumbs" ? "video/*" : "audio/*";
    const addBtn = $("#med-add");
    if (addBtn) addBtn.addEventListener("click", function () { if (fileInput) fileInput.click(); });
    if (fileInput) fileInput.addEventListener("change", function () {
      const files = fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
      if (files.length) addFiles(files);
    });

    bindClear();
    if (state.mode === "thumbs") bindThumbsControls();
    else bindSilenceControls();

    renderModeMeta();

    const api = {
      addFiles: addFiles,
      state: function () { return state; },
      mode: function () { return state.mode; },
      frames: function () { return state.frames; },
      plan: function () { return state.plan; },
      sheet: function () { return state.sheetCanvas; },
      csvText: thumbsCsv,
      exportBlob: function (type) {
        return canvasToBlob(state.sheetCanvas, type === "jpeg" || type === "image/jpeg" ? "image/jpeg" : "image/png",
          type === "jpeg" || type === "image/jpeg" ? state.thumbs.quality : undefined);
      },
      gaps: function () { return state.gaps; },
      stats: function () { return summarize(state.gaps, state.duration); },
      gapsCsv: gapsCsv,
      gapsText: gapsText,
      reanalyse: function () { if (state.mode === "silence" && state.buffer) return analyseAudio(); return Promise.resolve(); },
      reset: function () { const b = $("#med-clear"); if (b) b.click(); }
    };
    api._active = api;
    if (typeof window !== "undefined" && window.MediaStudio) window.MediaStudio._active = api;
    return api;
  }

  async function addFiles(files) {
    const f = files && files[0];
    if (!f) return;
    state.file = f;
    showError("");
    syncThumbsState();
    syncSilenceState();
    if (state.mode === "thumbs") {
      await captureSheet(f);
      return;
    }
    setProgress(true, 1, "Decoding audio…");
    setStatus("Decoding audio…");
    try {
      const buf = await loadAudio(f);
      state.buffer = buf;
      state.duration = buf.duration;
      const a = $("#med-audio");
      if (a && state.audioUrl) a.src = state.audioUrl;
      await analyseAudio();
    } catch (e) {
      state.buffer = null;
      setProgress(false, 0, "");
      const msg = (e && e.message ? e.message : String(e));
      showError("Could not decode this audio file. Your browser may not support its codec or container (for example DRM-protected M4A, some FLAC builds, or raw AC-3). Try converting to WAV or a standard MP3 (128 kbps+) and upload again — everything still stays on your device.\n\nDetails: " + msg);
      setStatus("Could not decode this audio file.");
      syncSilenceState();
    }
  }

  /* --------------------------------------------------------------- export */

  const api = {
    mount: mount,
    core: {
      num: num,
      clamp: clamp,
      esc: esc,
      pad: pad,
      DBFS_MIN: DBFS_MIN,
      THUMB_WIDTHS: THUMB_WIDTHS,
      fmtTimeHMSms: fmtTimeHMSms,
      fmtTimeMSms: fmtTimeMSms,
      frameTimes: frameTimes,
      gridPlan: gridPlan,
      dbfsToAmp: dbfsToAmp,
      ampToDbfs: ampToDbfs,
      combineChannels: combineChannels,
      scanWindows: scanWindows,
      toGaps: toGaps,
      peakEnvelope: peakEnvelope,
      summarize: summarize
    }
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") window.MediaStudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
