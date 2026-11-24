/*
 * audio-toolkit.js - Bench Audio Toolkit runtime.
 *
 * Client-side audio processing for the /audio/* routes. Two engines:
 *
 *   1. Web Audio API  - decode, analysis, recording, simple DSP, WAV encode.
 *   2. FFmpeg.wasm    - codec conversion and complex filters, lazy-loaded from
 *                       /vendor/ffmpeg/ ONLY when a page needs it (~31 MB).
 *
 * Contract mirrors image-toolkit.js: the module exposes
 * { core, LIMITS, PROCESSORS, mountTool, mountHub, mountStudio, unmount, cleanup }.
 * The registry (audio-tools.config.js) must load first.
 *
 * A tool is only mounted as interactive when its handler id exists in
 * PROCESSORS; mountTool refuses otherwise, so the registry can never advertise
 * a processor that does not exist (enforced by test/audio-toolkit.test.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AudioToolkit = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function benchIcons() {
    if (typeof window !== "undefined" && window.BenchIcons) return window.BenchIcons;
    if (typeof globalThis !== "undefined" && globalThis.BenchIcons) return globalThis.BenchIcons;
    return null;
  }
  function iconSvg(tool) {
    const icons = benchIcons();
    return icons ? icons.toolIcon("audio", tool.slug, tool.icon) : "";
  }
  function iconName(tool) {
    const icons = benchIcons();
    return icons ? icons.iconName("audio", tool.slug, tool.icon) : "";
  }
  function seoCopyFor(tool, kind) {
    const lib = (typeof window !== "undefined" && window.SeoCopy) ||
      (typeof globalThis !== "undefined" && globalThis.SeoCopy) || null;
    return lib && typeof lib.forTool === "function" ? lib.forTool(tool, kind) : null;
  }

  function cfg() {
    if (typeof window !== "undefined" && window.AudioToolConfig) return window.AudioToolConfig;
    if (typeof globalThis !== "undefined" && globalThis.AudioToolConfig) return globalThis.AudioToolConfig;
    return { TOOLS: [], LIMITS: {}, CATEGORIES: [], getTool: function () { return null; } };
  }
  const LIMITS = {
    maxFileBytes: 100 * 1024 * 1024,
    maxDecodedFrames: 90 * 1000 * 1000,
    maxDurationSec: 1800,
    maxFiles: 20,
    concurrency: 1
  };

  /* ============================================================ small utils */

  function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function r3(v) { return Math.round(num(v, 0) * 1000) / 1000; }
  function formatBytes(bytes) {
    const b = num(bytes, 0);
    if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + " MB";
    if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  }
  function formatTime(sec) {
    const s = Math.max(0, num(sec, 0));
    const m = Math.floor(s / 60);
    const ss = (s - m * 60);
    return m + ":" + (ss < 10 ? "0" : "") + ss.toFixed(2);
  }
  function parseTime(text) {
    const t = String(text == null ? "" : text).trim();
    if (!t) return null;
    if (t.indexOf(":") >= 0) {
      const parts = t.split(":").map(x => num(x, 0));
      let s = 0;
      for (let i = 0; i < parts.length; i++) s = s * 60 + parts[i];
      return s;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ampToDbfs(v) {
    const a = Math.abs(num(v, 0));
    if (a <= 0) return -Infinity;
    return 20 * Math.log10(a);
  }
  function dbfsToAmp(db) { return Math.pow(10, num(db, -Infinity) / 20); }
  function safeName(name, ext) {
    let base = String(name || "audio").replace(/\.[a-z0-9]+$/i, "");
    base = base.replace(/[^\w .\-()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "audio";
    return base + (ext ? "." + ext : "");
  }

  /* ==================================================== WAV / PCM encoding */

  /* Encode an AudioBuffer (or plain channel arrays) to a 16-bit or 32-bit
     float PCM WAV Blob. Deterministic, no external dependency. */
  function encodeWav(channels, sampleRate, opts) {
    const o = opts || {};
    const bits = o.bits === 32 ? 32 : 16;
    const ch = channels || [];
    const nch = Math.max(1, ch.length);
    const length = nch ? ch[0].length : 0;
    const bytesPerSample = bits / 8;
    const blockAlign = nch * bytesPerSample;
    const dataBytes = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    function wstr(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
    wstr(0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    wstr(8, "WAVE");
    wstr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, bits === 32 ? 3 : 1, true); // 3 = IEEE float, 1 = PCM int
    view.setUint16(22, nch, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bits, true);
    wstr(36, "data");
    view.setUint32(40, dataBytes, true);
    let off = 44;
    if (bits === 32) {
      for (let i = 0; i < length; i++) {
        for (let c = 0; c < nch; c++) { view.setFloat32(off, clamp(num(ch[c][i], 0), -1, 1), true); off += 4; }
      }
    } else {
      for (let i = 0; i < length; i++) {
        for (let c = 0; c < nch; c++) { view.setInt16(off, Math.round(clamp(num(ch[c][i], 0), -1, 1) * 32767), true); off += 2; }
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  /* Turn an AudioBuffer into plain channel arrays. */
  function bufferToChannels(audioBuffer) {
    const out = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) out.push(audioBuffer.getChannelData(c));
    return out;
  }

  /* ======================================================== decode helpers */

  let sharedContext = null;
  function audioContext() {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!sharedContext) sharedContext = new AC();
    if (sharedContext.state === "suspended" && sharedContext.resume) sharedContext.resume().catch(function () {});
    return sharedContext;
  }

  function arrayBufferOf(file) {
    if (!file) return Promise.reject(new Error("No file provided."));
    if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Could not read the file.")); };
      fr.readAsArrayBuffer(file);
    });
  }

  function assertFileSize(file) {
    if (file && file.size != null && file.size > LIMITS.maxFileBytes) {
      throw new Error("File is " + formatBytes(file.size) + ", over the " + formatBytes(LIMITS.maxFileBytes) + " limit.");
    }
  }

  /* Decode a File/Blob into an AudioBuffer using the browser decoder. */
  async function decodeAudio(file, onProgress) {
    assertFileSize(file);
    const ac = audioContext();
    if (!ac) throw new Error("This browser does not support the Web Audio API.");
    if (onProgress) onProgress(2, "Reading file");
    const ab = await arrayBufferOf(file);
    if (onProgress) onProgress(8, "Decoding audio");
    const buffer = await new Promise(function (resolve, reject) {
      // slice(0) avoids detaching the original in some engines
      ac.decodeAudioData(ab.slice(0), resolve, function () {
        reject(new Error("Could not decode this audio file. It may be corrupt, DRM-protected, or use an unsupported codec."));
      });
    });
    const frames = buffer.length * buffer.numberOfChannels;
    if (frames > LIMITS.maxDecodedFrames) {
      throw new Error("Decoded audio is too large to process safely in the browser.");
    }
    if (buffer.duration > LIMITS.maxDurationSec) {
      throw new Error("Audio is " + formatTime(buffer.duration) + ", over the " + Math.round(LIMITS.maxDurationSec / 60) + " minute limit.");
    }
    if (onProgress) onProgress(15, "Decoded " + formatTime(buffer.duration));
    return buffer;
  }

  /* ================================================== simple DSP functions */

  function combineChannels(channels, mode) {
    const list = (channels || []).filter(Boolean);
    if (!list.length) return new Float32Array(0);
    if (mode === "right") return list[1] || list[0];
    if (mode === "left" || !list[1]) return list[0];
    const len = list[0].length;
    const out = new Float32Array(len);
    if (mode === "max") {
      for (let i = 0; i < len; i++) {
        let m = 0;
        for (let c = 0; c < list.length; c++) { const v = list[c][i]; if (Math.abs(v) > Math.abs(m)) m = v; }
        out[i] = m;
      }
    } else {
      const inv = 1 / list.length;
      for (let i = 0; i < len; i++) { let s = 0; for (let c = 0; c < list.length; c++) s += list[c][i]; out[i] = s * inv; }
    }
    return out;
  }

  function peakEnvelope(samples, buckets) {
    const n = samples ? samples.length : 0;
    const b = Math.max(0, Math.round(num(buckets, 0)));
    const out = [];
    if (!n || b <= 0) return out;
    for (let k = 0; k < b; k++) {
      const start = Math.floor(k * n / b);
      const end = Math.max(start + 1, Math.floor((k + 1) * n / b));
      let min = Infinity, max = -Infinity;
      for (let i = start; i < end && i < n; i++) { const v = samples[i]; if (v < min) min = v; if (v > max) max = v; }
      if (min === Infinity) { min = 0; max = 0; }
      out.push({ min: min, max: max });
    }
    return out;
  }

  /* Windowed RMS / mean-abs silence flags. */
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
      for (let j = i; j < end; j++) { const v = samples[j]; sum += method === "ma" ? Math.abs(v) : v * v; }
      const len = end - i;
      const val = method === "ma" ? sum / len : Math.sqrt(sum / len);
      flags.push(val < thr ? 1 : 0);
    }
    return flags;
  }

  function flagsToGaps(flags, windowSec, minGapSec) {
    const f = flags || [];
    const w = Math.max(0, num(windowSec, 0));
    const min = Math.max(0, num(minGapSec, 0));
    const gaps = [];
    let i = 0;
    while (i < f.length) {
      if (f[i]) {
        let j = i;
        while (j < f.length && f[j]) j++;
        if ((j - i) * w >= min - 1e-9) gaps.push({ start: r3(i * w), end: r3(j * w), duration: r3((j - i) * w) });
        i = j;
      } else i++;
    }
    return gaps;
  }

  /* Read raw peak/RMS/clipping stats from decoded channels. */
  function analyseLevels(channels, from, to) {
    const list = (channels || []).filter(Boolean);
    const start = Math.max(0, Math.floor(num(from, 0)));
    const endFrame = list.length ? Math.min(list[0].length, Math.ceil(num(to, list[0].length))) : 0;
    let peak = 0, sumSq = 0, count = 0, clipped = 0;
    for (let c = 0; c < list.length; c++) {
      const d = list[c];
      for (let i = start; i < endFrame; i++) {
        const v = d[i];
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sumSq += v * v; count++;
      }
    }
    const rms = count ? Math.sqrt(sumSq / count) : 0;
    return { peak: peak, peakDbfs: ampToDbfs(peak), rms: rms, rmsDbfs: ampToDbfs(rms), clipped: clipped, frames: Math.max(0, endFrame - start) };
  }

  /* ================================================== FFmpeg.wasm loader */

  const FFMPEG_BASE = "/vendor/ffmpeg/";
  let ffmpegPromise = null;

  /* Load the FFmpeg.wasm engine once. Same-origin URLs on purpose: the worker
     imports the core by URL and must resolve sibling assets; blob URLs break
     that in 0.12. */
  function loadFFmpeg(onStatus) {
    if (typeof window === "undefined") return Promise.reject(new Error("FFmpeg loads in the browser only."));
    if (ffmpegPromise) return ffmpegPromise;
    ffmpegPromise = new Promise(function (resolve, reject) {
      function boot() {
        try {
          if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
            throw new Error("The FFmpeg engine failed to initialise.");
          }
          const ff = new window.FFmpegWASM.FFmpeg();
          if (onStatus) ff.on("log", function (e) { onStatus(e && e.message); });
          ff.load({
            coreURL: FFMPEG_BASE + "ffmpeg-core.js",
            wasmURL: FFMPEG_BASE + "ffmpeg-core.wasm"
          }).then(function () { resolve(ff); }).catch(reject);
        } catch (err) { reject(err); }
      }
      if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) { boot(); return; }
      const s = document.createElement("script");
      s.src = FFMPEG_BASE + "ffmpeg.js";
      s.onload = boot;
      s.onerror = function () { ffmpegPromise = null; reject(new Error("Could not download the FFmpeg engine. Check your connection and try again.")); };
      document.head.appendChild(s);
    }).catch(function (err) { ffmpegPromise = null; throw err; });
    return ffmpegPromise;
  }

  function ffExec(ff, args) {
    return ff.exec(args);
  }
  async function ffWrite(ff, name, data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await ff.writeFile(name, bytes);
  }
  async function ffRead(ff, name) {
    const data = await ff.readFile(name);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  /* Run FFmpeg with a temp input, run args, read a temp output, clean up. */
  async function ffRun(onStatus, inputName, inputData, args, outputName) {
    const ff = await loadFFmpeg(onStatus);
    await ffWrite(ff, inputName, inputData);
    try {
      await ffExec(ff, args);
      return await ffRead(ff, outputName);
    } finally {
      try { await ff.deleteFile(inputName); } catch (_) {}
      try { await ff.deleteFile(outputName); } catch (_) {}
    }
  }

  /* ====================================================== feature detection */

  function canRecordAudio() {
    return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  function canPlayback() {
    return typeof window !== "undefined" && !!audioContext();
  }

  /* ============================================================ exports so far */

  const core = {
    num: num, clamp: clamp, r3: r3, formatBytes: formatBytes, formatTime: formatTime,
    parseTime: parseTime, esc: esc, ampToDbfs: ampToDbfs, dbfsToAmp: dbfsToAmp, safeName: safeName,
    encodeWav: encodeWav, bufferToChannels: bufferToChannels, decodeAudio: decodeAudio,
    combineChannels: combineChannels, peakEnvelope: peakEnvelope, scanWindows: scanWindows,
    flagsToGaps: flagsToGaps, analyseLevels: analyseLevels,
    loadFFmpeg: loadFFmpeg, ffRun: ffRun, ffExec: ffExec, ffWrite: ffWrite, ffRead: ffRead,
    canRecordAudio: canRecordAudio, canPlayback: canPlayback, audioContext: audioContext,
    assertFileSize: assertFileSize, arrayBufferOf: arrayBufferOf
  };

  /* ============================================================ processors */
  /*
   * Every processor has the signature:
   *   async function (ctx) -> { outputs: [...], errors: [...], report?: object }
   * ctx = { files, values, tool, onProgress, signal, canvas }
   * An output = { name, blob, size, kind: "audio"|"image"|"text"|"zip", note, text? }
   */

  function audioOut(name, blob, note) {
    return { name: name, blob: blob, size: blob.size, kind: "audio", note: note || "" };
  }
  function textOut(name, text) {
    return { name: name, text: text, kind: "text", size: text.length };
  }
  function imageOut(name, blob, note) {
    return { name: name, blob: blob, size: blob.size, kind: "image", note: note || "" };
  }

  function extForFormat(format) {
    return ({ mp3: "mp3", wav: "wav", m4a: "m4a", ogg: "ogg", opus: "opus", flac: "flac", aiff: "aiff" })[format] || "bin";
  }
  function mimeForFormat(format) {
    return ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", aiff: "audio/aiff" })[format] || "application/octet-stream";
  }

  /* FFmpeg audio-encoder arguments for a chosen format + bitrate. */
  function ffmpegCodecArgs(format, bitrate) {
    const br = String(bitrate || "192");
    switch (format) {
      case "mp3": return ["-c:a", "libmp3lame", "-b:a", br + "k"];
      case "m4a": return ["-c:a", "aac", "-b:a", br + "k", "-f", "ipod"];
      case "ogg": return ["-c:a", "libvorbis", "-b:a", br + "k"];
      case "opus": return ["-c:a", "libopus", "-b:a", br + "k", "-f", "opus"];
      case "flac": return ["-c:a", "flac"];
      case "aiff": return ["-c:a", "pcm_s16be", "-f", "aiff"];
      case "wav": return ["-c:a", "pcm_s16le"];
      default: return ["-c:a", "libmp3lame", "-b:a", br + "k"];
    }
  }

  function ffmpegChannelArgs(channels) {
    if (channels === "mono") return ["-ac", "1"];
    if (channels === "stereo") return ["-ac", "2"];
    return [];
  }
  function ffmpegSampleRateArgs(sampleRate) {
    if (!sampleRate || sampleRate === "keep") return [];
    return ["-ar", String(sampleRate)];
  }

  /* Decode a file to raw WAV bytes so it can be fed to FFmpeg reliably,
     regardless of the source container. Returns { bytes, name, buffer }. */
  async function fileToWavBytes(file, onProgress) {
    const buffer = await decodeAudio(file, onProgress);
    const channels = bufferToChannels(buffer);
    const blob = encodeWav(channels, buffer.sampleRate, { bits: 32 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes: bytes, buffer: buffer };
  }

  /* Generic FFmpeg transcode: decode to WAV, re-encode to the requested format. */
  async function ffmpegTranscode(ctx, opts) {
    const o = opts || {};
    const file = ctx.files[0];
    const v = ctx.values || {};
    const format = o.format || v.format || "mp3";
    ctx.onProgress(5, "Preparing audio");
    const prep = await fileToWavBytes(file, ctx.onProgress);
    ctx.onProgress(35, "Encoding " + format.toUpperCase());
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"]
      .concat(o.filterArgs || [])
      .concat(ffmpegChannelArgs(o.channels != null ? o.channels : v.channels))
      .concat(ffmpegSampleRateArgs(o.sampleRate != null ? o.sampleRate : v.sampleRate))
      .concat(ffmpegCodecArgs(format, o.bitrate != null ? o.bitrate : v.bitrate))
      .concat([outName]);
    const bytes = await ffRun(null, "in.wav", prep.bytes, args, outName);
    ctx.onProgress(92, "Validating output");
    if (!bytes || bytes.length < 128) throw new Error("The encoder produced an empty file.");
    const blob = new Blob([bytes], { type: mimeForFormat(format) });
    const base = safeName(o.baseName || file.name, "");
    return {
      outputs: [audioOut(base + "." + extForFormat(format), blob,
        format.toUpperCase() + ", " + formatBytes(blob.size) + " (from " + formatBytes(file.size) + ")")],
      errors: [],
      report: { buffer: prep.buffer }
    };
  }

  /* ------------------------------------------------------- convert handlers */

  async function convert(ctx) { return ffmpegTranscode(ctx, {}); }
  async function compressAudio(ctx) {
    const v = ctx.values || {};
    const res = await ffmpegTranscode(ctx, { format: "mp3", bitrate: v.bitrate || "128", channels: v.channels, sampleRate: v.sampleRate });
    const file = ctx.files[0];
    const saved = file.size - res.outputs[0].size;
    const pct = file.size ? Math.round(saved / file.size * 100) : 0;
    res.outputs[0].note = "MP3 " + formatBytes(res.outputs[0].size) + " - " + pct + "% smaller than " + formatBytes(file.size) + ".";
    return res;
  }
  async function toWav(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    ctx.onProgress(70, "Writing WAV");
    let channels = bufferToChannels(buffer);
    if (v.channels === "mono" && channels.length > 1) channels = [combineChannels(channels, "avg")];
    if (v.channels === "stereo" && channels.length === 1) channels = [channels[0], channels[0].slice()];
    // Browser resampling via OfflineAudioContext when a rate is requested.
    let sampleRate = buffer.sampleRate;
    if (v.sampleRate && v.sampleRate !== "keep" && Number(v.sampleRate) !== buffer.sampleRate) {
      sampleRate = Number(v.sampleRate);
      channels = await resampleChannels(channels, buffer.sampleRate, sampleRate);
    }
    const blob = encodeWav(channels, sampleRate, { bits: 16 });
    ctx.onProgress(96, "Done");
    return { outputs: [audioOut(safeName(file.name, "wav"), blob, "16-bit PCM WAV, " + sampleRate + " Hz, " + channels.length + " ch, " + formatBytes(blob.size))], errors: [], report: { buffer: buffer } };
  }
  async function toMp3(ctx) { return ffmpegTranscode(ctx, { format: "mp3" }); }
  async function toFlac(ctx) { return ffmpegTranscode(ctx, { format: "flac" }); }
  async function toM4a(ctx) { return ffmpegTranscode(ctx, { format: "m4a" }); }
  async function toAiff(ctx) { return ffmpegTranscode(ctx, { format: "aiff" }); }
  async function toOgg(ctx) {
    const v = ctx.values || {};
    const fmt = v.codec === "opus" ? "opus" : "ogg";
    return ffmpegTranscode(ctx, { format: fmt });
  }

  /* Offline sample-rate conversion for the WAV path. */
  async function resampleChannels(channels, fromRate, toRate) {
    if (typeof OfflineAudioContext === "undefined") return channels;
    const length = Math.max(1, Math.round(channels[0].length * toRate / fromRate));
    const offline = new OfflineAudioContext(channels.length, length, toRate);
    const buf = offline.createBuffer(channels.length, channels[0].length, fromRate);
    for (let c = 0; c < channels.length; c++) buf.copyToChannel(channels[c], c);
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return bufferToChannels(rendered);
  }

  /* -------------------------------------------------- base64 / data uri */

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function base64ToBytes(b64) {
    const clean = String(b64).replace(/\s+/g, "");
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function audioToBase64(ctx) {
    const file = ctx.files[0];
    ctx.onProgress(20, "Reading");
    const bytes = new Uint8Array(await arrayBufferOf(file));
    ctx.onProgress(70, "Base64 encoding");
    const b64 = bytesToBase64(bytes);
    const type = file.type || "audio/mpeg";
    const text = (ctx.values && ctx.values.wrap) ? ("data:" + type + ";base64," + b64) : b64;
    return { outputs: [textOut(safeName(file.name, "txt"), text)], errors: [] };
  }

  async function base64ToAudio(ctx) {
    const v = ctx.values || {};
    let raw = String(v.data || "").trim();
    if (!raw) throw new Error("Paste a Base64 string or data URI first.");
    let mime = "audio/mpeg";
    const m = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (m) { mime = m[1] || mime; raw = m[3]; }
    let bytes;
    try { bytes = base64ToBytes(raw); } catch (_) { throw new Error("That is not valid Base64 data."); }
    if (!bytes.length) throw new Error("The Base64 string decoded to zero bytes.");
    const ext = ({ "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/flac": "flac", "audio/aiff": "aiff" })[mime] || guessExtFromBytes(bytes);
    const blob = new Blob([bytes], { type: mime });
    return { outputs: [audioOut(safeName(v.filename || "decoded-audio", ext), blob, formatBytes(blob.size) + " reconstructed")], errors: [] };
  }

  function guessExtFromBytes(b) {
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "mp3";
    if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return "mp3";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "wav";
    if (b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43) return "flac";
    if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "ogg";
    if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "m4a";
    if (b[0] === 0x46 && b[1] === 0x4F && b[2] === 0x52 && b[3] === 0x4D) return "aiff";
    return "bin";
  }

  /* --------------------------------------------------------- ringtone */

  async function ringtone(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const start = parseTime(v.start) || 0;
    const dur = clamp(num(v.duration, 30), 1, 40);
    const fade = clamp(num(v.fade, 1), 0, 10);
    const format = v.format || "mp3";
    ctx.onProgress(8, "Preparing");
    const prep = await fileToWavBytes(file, ctx.onProgress);
    const buf = prep.buffer;
    const end = Math.min(buf.duration, start + dur);
    if (start >= buf.duration) throw new Error("Start time is past the end of the file.");
    const filterArgs = ["-ss", String(start), "-t", String(r3(end - start))];
    if (fade > 0) {
      filterArgs.push("-af", "afade=t=in:st=0:d=" + fade + ",afade=t=out:st=" + Math.max(0, r3(end - start - fade)) + ":d=" + fade);
    }
    ctx.onProgress(45, "Encoding ringtone");
    const outName = "ringtone." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(filterArgs).concat(ffmpegCodecArgs(format, v.bitrate)).concat([outName]);
    const bytes = await ffRun(null, "in.wav", prep.bytes, args, outName);
    const blob = new Blob([bytes], { type: mimeForFormat(format) });
    return { outputs: [audioOut(safeName(file.name, "") + "-ringtone." + extForFormat(format), blob, formatTime(end - start) + " ringtone, " + formatBytes(blob.size))], errors: [] };
  }

  /* ------------------------------------------------------ batch rename */

  async function batchRename(ctx) {
    const v = ctx.values || {};
    const prefix = String(v.prefix || "audio");
    const startNum = num(v.start, 1);
    const digits = clamp(num(v.digits, 2), 1, 5);
    const format = v.format || "keep";
    const outputs = [], errors = [];
    for (let i = 0; i < ctx.files.length; i++) {
      const file = ctx.files[i];
      const n = String(startNum + i).padStart(digits, "0");
      try {
        ctx.onProgress(10 + Math.round(i / ctx.files.length * 80), "File " + (i + 1) + " of " + ctx.files.length);
        if (format === "keep") {
          const bytes = new Uint8Array(await arrayBufferOf(file));
          const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "bin";
          outputs.push(audioOut(prefix + "-" + n + "." + ext, new Blob([bytes], { type: file.type || "audio/mpeg" }), formatBytes(file.size)));
        } else {
          const sub = await ffmpegTranscode({ files: [file], values: { format: format }, onProgress: function () {} }, { format: format, baseName: prefix + "-" + n });
          outputs.push(sub.outputs[0]);
        }
      } catch (err) { errors.push({ name: file.name, message: err.message || String(err) }); }
    }
    return { outputs: outputs, errors: errors };
  }

  /* ----------------------------------------------------------- audio zip */

  async function audioZip(ctx) {
    const entries = [];
    const errors = [];
    for (let i = 0; i < ctx.files.length; i++) {
      const file = ctx.files[i];
      try {
        ctx.onProgress(5 + Math.round(i / ctx.files.length * 60), "Packing " + (i + 1) + "/" + ctx.files.length);
        const bytes = new Uint8Array(await arrayBufferOf(file));
        entries.push({ name: file.name, bytes: bytes });
      } catch (err) { errors.push({ name: file.name, message: err.message || String(err) }); }
    }
    if (!entries.length) throw new Error("No files could be read.");
    ctx.onProgress(75, "Building ZIP");
    const blob = makeZip(entries);
    return { outputs: [{ name: "audio-files.zip", blob: blob, size: blob.size, kind: "zip", note: entries.length + " files, " + formatBytes(blob.size) }], errors: errors };
  }

  /* Minimal ZIP writer (store method, no compression) - deterministic. */
  function makeZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    function crc32(bytes) {
      let c, crc = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) {
        c = (crc ^ bytes[i]) & 0xFF;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    const enc = new TextEncoder();
    for (let e = 0; e < entries.length; e++) {
      const nameBytes = enc.encode(entries[e].name);
      const data = entries[e].bytes;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);
      central.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset });
      offset += local.length + data.length;
    }
    const centralChunks = [];
    let centralSize = 0;
    for (let i = 0; i < central.length; i++) {
      const c = central[i];
      const rec = new Uint8Array(46 + c.nameBytes.length);
      const cv = new DataView(rec.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
      cv.setUint32(16, c.crc, true);
      cv.setUint32(20, c.size, true);
      cv.setUint32(24, c.size, true);
      cv.setUint16(28, c.nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true); cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, c.offset, true);
      rec.set(c.nameBytes, 46);
      centralChunks.push(rec);
      centralSize += rec.length;
    }
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(chunks.concat(centralChunks, [eocd]), { type: "application/zip" });
  }

  /* ------------------------------------------------------ edit: trim */

  /* Slice channel arrays by sample range. */
  function sliceChannels(channels, startFrame, endFrame) {
    return channels.map(function (d) {
      const s = clamp(startFrame, 0, d.length);
      const e = clamp(endFrame, s, d.length);
      return d.slice(s, e);
    });
  }

  async function trim(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer);
    const start = clamp(parseTime(v.start) || 0, 0, buffer.duration);
    const end = clamp(parseTime(v.end) || buffer.duration, 0, buffer.duration);
    if (end - start < 0.005) throw new Error("The selected range is empty. Set an end time after the start time.");
    const sr = buffer.sampleRate;
    const sliced = sliceChannels(channels, Math.round(start * sr), Math.round(end * sr));
    ctx.onProgress(65, "Encoding selection");
    const format = v.format || "wav";
    if (format === "wav") {
      const blob = encodeWav(sliced, sr, { bits: 16 });
      return { outputs: [audioOut(safeName(file.name, "") + "-trim.wav", blob, formatTime(end - start) + " from " + formatTime(start) + ", " + formatBytes(blob.size))], errors: [] };
    }
    const wav = encodeWav(sliced, sr, { bits: 32 });
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(format, v.bitrate)).concat([outName]);
    const out = await ffRun(null, "in.wav", bytes, args, outName);
    const blob = new Blob([out], { type: mimeForFormat(format) });
    return { outputs: [audioOut(safeName(file.name, "") + "-trim." + extForFormat(format), blob, formatTime(end - start) + " clip, " + formatBytes(blob.size))], errors: [] };
  }

  /* ------------------------------------------------------ edit: silence */

  async function silenceRemove(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const mono = combineChannels(bufferToChannels(buffer), "avg");
    const thr = dbfsToAmp(num(v.threshold, -35));
    const win = Math.max(1, Math.round(buffer.sampleRate * 0.02)); // 20 ms window
    ctx.onProgress(40, "Scanning for silence");
    const flags = scanWindows(mono, { windowSize: win, threshold: thr, method: "rms" });
    const winSec = win / buffer.sampleRate;
    const gaps = flagsToGaps(flags, winSec, 0.1);

    if (v.mode === "map") {
      const lines = gaps.map(function (g, i) { return (i + 1) + ". " + formatTime(g.start) + " - " + formatTime(g.end) + " (" + g.duration.toFixed(2) + "s)"; });
      const text = "Silence map for " + file.name + "\nThreshold: " + num(v.threshold, -35) + " dBFS\nTotal gaps: " + gaps.length + "\n\n" + (lines.join("\n") || "No silence detected.");
      return { outputs: [textOut(safeName(file.name, "txt"), text)], errors: [] };
    }

    const sr = buffer.sampleRate;
    const channels = bufferToChannels(buffer);
    let startFrame = 0, endFrame = buffer.length;
    if (v.mode === "edges") {
      // trim leading/trailing runs only
      let s = 0;
      while (s < flags.length && flags[s]) s++;
      let e2 = flags.length;
      while (e2 > s && flags[e2 - 1]) e2--;
      startFrame = Math.round(s * win);
      endFrame = Math.round(e2 * win);
    }
    ctx.onProgress(60, "Building output");
    let outChannels;
    if (v.mode === "edges") {
      outChannels = sliceChannels(channels, startFrame, endFrame);
    } else {
      // Strip: concatenate non-silent runs.
      const keep = [];
      let i = 0;
      while (i < flags.length) {
        if (!flags[i]) {
          let j = i;
          while (j < flags.length && !flags[j]) j++;
          keep.push([Math.round(i * win), Math.round(j * win)]);
          i = j;
        } else i++;
      }
      if (!keep.length) throw new Error("Everything was detected as silence. Lower the threshold.");
      const totalFrames = keep.reduce(function (a, r) { return a + (r[1] - r[0]); }, 0);
      outChannels = channels.map(function () { return new Float32Array(totalFrames); });
      let pos = 0;
      keep.forEach(function (r) {
        for (let c = 0; c < channels.length; c++) { outChannels[c].set(channels[c].subarray(r[0], r[1]), pos); }
        pos += r[1] - r[0];
      });
    }
    if (outChannels[0].length < 16) throw new Error("The result is empty. Lower the threshold or use a different mode.");
    const format = v.format || "wav";
    if (format === "wav") {
      const blob = encodeWav(outChannels, sr, { bits: 16 });
      return { outputs: [audioOut(safeName(file.name, "") + "-silence-removed.wav", blob, "Removed " + gaps.length + " gap(s), now " + formatBytes(blob.size))], errors: [] };
    }
    const wav = encodeWav(outChannels, sr, { bits: 32 });
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(format, v.bitrate)).concat([outName]);
    const out = await ffRun(null, "in.wav", bytes, args, outName);
    return { outputs: [audioOut(safeName(file.name, "") + "-silence-removed." + extForFormat(format), new Blob([out], { type: mimeForFormat(format) }), "Removed " + gaps.length + " gap(s)")], errors: [] };
  }

  /* ------------------------------------------------------ edit: join */

  async function join(ctx) {
    const v = ctx.values || {};
    if (ctx.files.length < 2) throw new Error("Add at least two files to join.");
    // Decode all files, resample to the first file's rate, then concatenate.
    const decoded = [];
    for (let i = 0; i < ctx.files.length; i++) {
      ctx.onProgress(5 + Math.round(i / ctx.files.length * 45), "Decoding " + (i + 1) + "/" + ctx.files.length);
      const buf = await decodeAudio(ctx.files[i]);
      decoded.push(buf);
    }
    const targetRate = decoded[0].sampleRate;
    const targetCh = var_Channels(decoded);
    const parts = [];
    for (let i = 0; i < decoded.length; i++) {
      let ch = bufferToChannels(decoded[i]);
      if (decoded[i].sampleRate !== targetRate) ch = await resampleChannels(ch, decoded[i].sampleRate, targetRate);
      ch = conformChannels(ch, targetCh);
      parts.push(ch);
    }
    ctx.onProgress(60, "Joining");
    const combined = joinChannels(parts);
    const format = v.format || "wav";
    const crossfade = clamp(num(v.crossfade, 0), 0, 10);
    if (format === "wav" && crossfade === 0) {
      const blob = encodeWav(combined, targetRate, { bits: 16 });
      return { outputs: [audioOut("joined.wav", blob, ctx.files.length + " files, " + formatBytes(blob.size))], errors: [] };
    }
    const wav = encodeWav(combined, targetRate, { bits: 32 });
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(format, v.bitrate)).concat([outName]);
    const out = await ffRun(null, "in.wav", bytes, args, outName);
    return { outputs: [audioOut("joined." + extForFormat(format), new Blob([out], { type: mimeForFormat(format) }), ctx.files.length + " files, " + formatBytes(out.length))], errors: [] };
  }

  function var_Channels(decoded) { return Math.max.apply(null, decoded.map(function (b) { return b.numberOfChannels; })); }
  function conformChannels(ch, target) {
    if (ch.length === target) return ch;
    if (ch.length === 1 && target === 2) return [ch[0], ch[0].slice()];
    if (ch.length === 2 && target === 1) return [combineChannels(ch, "avg")];
    return ch.slice(0, target);
  }
  function joinChannels(parts) {
    const total = parts.reduce(function (a, p) { return a + p[0].length; }, 0);
    const nch = parts[0].length;
    const out = [];
    for (let c = 0; c < nch; c++) out.push(new Float32Array(total));
    let pos = 0;
    parts.forEach(function (p) {
      for (let c = 0; c < nch; c++) { out[c].set(p[c], pos); }
      pos += p[0].length;
    });
    return out;
  }

  /* ------------------------------------------------------ edit: split */

  async function split(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer);
    const sr = buffer.sampleRate;
    let ranges = [];
    if (v.mode === "points") {
      const points = String(v.points || "").split(",").map(function (x) { return parseTime(x); }).filter(function (x) { return x != null && x > 0 && x < buffer.duration; }).sort(function (a, b) { return a - b; });
      let prev = 0;
      points.forEach(function (p) { ranges.push([prev, p]); prev = p; });
      ranges.push([prev, buffer.duration]);
    } else {
      const chunk = clamp(num(v.chunk, 300), 1, buffer.duration);
      for (let t = 0; t < buffer.duration; t += chunk) ranges.push([t, Math.min(buffer.duration, t + chunk)]);
    }
    ranges = ranges.filter(function (r) { return r[1] - r[0] > 0.005; });
    if (!ranges.length) throw new Error("No valid split ranges were produced.");
    const outputs = [];
    const format = v.format || "wav";
    for (let i = 0; i < ranges.length; i++) {
      ctx.onProgress(20 + Math.round(i / ranges.length * 70), "Part " + (i + 1) + "/" + ranges.length);
      const sl = sliceChannels(channels, Math.round(ranges[i][0] * sr), Math.round(ranges[i][1] * sr));
      const name = safeName(file.name, "") + "-part" + String(i + 1).padStart(2, "0") + "." + extForFormat(format);
      if (format === "wav") {
        const blob = encodeWav(sl, sr, { bits: 16 });
        outputs.push(audioOut(name, blob, formatTime(ranges[i][0]) + " - " + formatTime(ranges[i][1])));
      } else {
        const wav = encodeWav(sl, sr, { bits: 32 });
        const bytes = new Uint8Array(await wav.arrayBuffer());
        const on = "o." + extForFormat(format);
        const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(format, v.bitrate)).concat([on]);
        const out = await ffRun(null, "in.wav", bytes, args, on);
        outputs.push(audioOut(name, new Blob([out], { type: mimeForFormat(format) }), formatTime(ranges[i][0]) + " - " + formatTime(ranges[i][1])));
      }
    }
    return { outputs: outputs, errors: [] };
  }

  /* ------------------------------------------------------ edit: fade */

  async function fade(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer);
    const sr = buffer.sampleRate;
    const dur = buffer.duration;
    const inSec = clamp(num(v.fadeIn, 0), 0, dur);
    const outSec = clamp(num(v.fadeOut, 0), 0, dur);
    ctx.onProgress(55, "Applying fades");
    const n = buffer.length;
    const inFrames = Math.round(inSec * sr);
    const outFrames = Math.round(outSec * sr);
    for (let i = 0; i < n; i++) {
      let g = 1;
      if (inFrames > 0 && i < inFrames) g = Math.min(g, i / inFrames);
      if (outFrames > 0 && i >= n - outFrames) g = Math.min(g, (n - i) / outFrames);
      if (g !== 1) for (let c = 0; c < channels.length; c++) channels[c][i] *= g;
    }
    return finishPcm(ctx, file, channels, sr, v, "faded");
  }

  /* Encode PCM channels in the requested output format. */
  async function finishPcm(ctx, file, channels, sr, v, suffix) {
    const format = (v && v.format) || "wav";
    if (format === "wav") {
      const blob = encodeWav(channels, sr, { bits: 16 });
      return { outputs: [audioOut(safeName(file.name, "") + "-" + suffix + ".wav", blob, formatBytes(blob.size))], errors: [] };
    }
    const wav = encodeWav(channels, sr, { bits: 32 });
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(format, v && v.bitrate)).concat([outName]);
    const out = await ffRun(null, "in.wav", bytes, args, outName);
    return { outputs: [audioOut(safeName(file.name, "") + "-" + suffix + "." + extForFormat(format), new Blob([out], { type: mimeForFormat(format) }), formatBytes(out.length))], errors: [] };
  }

  /* ------------------------------------------------------ edit: reverse */

  async function reverse(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer).map(function (d) { return d.slice().reverse(); });
    ctx.onProgress(70, "Reversed");
    return finishPcm(ctx, file, channels, buffer.sampleRate, v, "reversed");
  }

  /* ------------------------------------------------------ edit: speed / pitch */

  async function speed(ctx) {
    const v = ctx.values || {};
    const factor = clamp(num(v.factor, 1.25), 0.5, 3);
    if (Math.abs(factor - 1) < 0.001) throw new Error("The speed factor is 1.0 (unchanged). Move the slider.");
    // FFmpeg atempo accepts 0.5-2 per instance; chain two for >2.
    let filter;
    if (factor <= 2) filter = "atempo=" + factor;
    else filter = "atempo=2,atempo=" + (factor / 2);
    return ffFilterTool(ctx, { filter: filter, suffix: "speed" });
  }
  async function pitch(ctx) {
    const v = ctx.values || {};
    const semis = clamp(num(v.semitones, 2), -12, 12);
    if (semis === 0) throw new Error("Zero semitones is no change. Move the slider.");
    const ratio = Math.pow(2, semis / 12);
    // Resample shifts pitch+duration; atempo restores duration -> pitch-only.
    const tempo = 1 / ratio;
    let atempo;
    if (tempo >= 0.5 && tempo <= 2) atempo = "atempo=" + r3(tempo);
    else if (tempo > 2) atempo = "atempo=2,atempo=" + r3(tempo / 2);
    else atempo = "atempo=0.5,atempo=" + r3(tempo / 0.5);
    const filter = "asetrate=44100*" + r3(ratio) + ",aresample=44100," + atempo;
    return ffFilterTool(ctx, { filter: filter, suffix: "pitch", experimental: true });
  }

  /* Run a generic single -af filter chain through FFmpeg. */
  async function ffFilterTool(ctx, opts) {
    const o = opts || {};
    const v = ctx.values || {};
    const file = ctx.files[0];
    ctx.onProgress(8, "Preparing");
    const prep = await fileToWavBytes(file, ctx.onProgress);
    const format = v.format || "mp3";
    ctx.onProgress(45, o.status || "Filtering");
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav", "-af", o.filter]
      .concat(ffmpegChannelArgs(v.channels))
      .concat(ffmpegCodecArgs(format, v.bitrate))
      .concat([outName]);
    const bytes = await ffRun(o.onStatus || null, "in.wav", prep.bytes, args, outName);
    if (!bytes || bytes.length < 128) throw new Error("The filter produced an empty file.");
    const blob = new Blob([bytes], { type: mimeForFormat(format) });
    return { outputs: [audioOut(safeName(file.name, "") + "-" + (o.suffix || "out") + "." + extForFormat(format), blob, formatBytes(blob.size) + (o.experimental ? " (estimate)" : ""))], errors: [] };
  }

  /* ------------------------------------------------------ edit: volume/normalize */

  async function volumeNormalize(ctx) {
    const v = ctx.values || {};
    let filter;
    if (v.mode === "peak") {
      const target = dbfsToAmp(num(v.peak, -1));
      // measure peak first via our own decode, then apply gain
      const buffer = await decodeAudio(ctx.files[0], ctx.onProgress);
      const levels = analyseLevels(bufferToChannels(buffer));
      if (levels.peak <= 0) throw new Error("The file is silent; there is nothing to normalise.");
      const gainDb = ampToDbfs(target) - ampToDbfs(levels.peak);
      filter = "volume=" + r3(gainDb) + "dB,alimiter=limit=0.98";
    } else {
      filter = "volume=" + num(v.gain, 6) + "dB,alimiter=limit=0.98";
    }
    return ffFilterTool(ctx, { filter: filter, suffix: "volume" });
  }

  /* ------------------------------------------------------ edit: loop */

  async function loop(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer);
    const sr = buffer.sampleRate;
    const start = clamp(parseTime(v.start) || 0, 0, buffer.duration);
    const end = clamp(parseTime(v.end) || buffer.duration, 0, buffer.duration);
    if (end - start < 0.01) throw new Error("The loop section is empty.");
    const times = clamp(num(v.times, 4), 2, 50);
    const section = sliceChannels(channels, Math.round(start * sr), Math.round(end * sr));
    const parts = [];
    for (let i = 0; i < times; i++) parts.push(section);
    ctx.onProgress(60, "Building loop");
    const combined = joinChannels(parts);
    return finishPcm(ctx, file, combined, sr, v, "loop");
  }

  /* ------------------------------------------------------ edit: crossfade */

  async function crossfade(ctx) {
    const v = ctx.values || {};
    if (ctx.files.length !== 2) throw new Error("Add exactly two files for a crossfade.");
    const a = await decodeAudio(ctx.files[0]);
    const b = await decodeAudio(ctx.files[1]);
    const targetRate = a.sampleRate;
    let chA = bufferToChannels(a);
    let chB = bufferToChannels(b);
    if (b.sampleRate !== targetRate) chB = await resampleChannels(chB, b.sampleRate, targetRate);
    const targetCh = Math.max(chA.length, chB.length);
    chA = conformChannels(chA, targetCh); chB = conformChannels(chB, targetCh);
    const dur = clamp(num(v.duration, 3), 0.5, 30);
    const xf = Math.min(Math.round(dur * targetRate), chA[0].length, chB[0].length);
    ctx.onProgress(60, "Crossfading");
    const lenA = chA[0].length, lenB = chB[0].length;
    const total = lenA + lenB - xf;
    const out = [];
    for (let c = 0; c < targetCh; c++) out.push(new Float32Array(total));
    for (let c = 0; c < targetCh; c++) {
      const A = chA[c], B = chB[c], O = out[c];
      O.set(A.subarray(0, lenA - xf), 0);
      for (let i = 0; i < xf; i++) {
        const t = i / xf;
        // equal-power fade
        O[lenA - xf + i] = A[lenA - xf + i] * Math.cos(t * Math.PI / 2) + B[i] * Math.sin(t * Math.PI / 2);
      }
      O.set(B.subarray(xf), lenA - xf + xf >= 0 ? lenA - xf + xf : 0);
      // fix: place B tail after the crossfade region
      for (let i = xf; i < lenB; i++) O[lenA - xf + i] = B[i];
    }
    return finishPcm(ctx, ctx.files[0], out, targetRate, v, "crossfade");
  }

  /* ------------------------------------------------------ edit: channels */

  async function channelsTool(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    let filter;
    switch (v.mode) {
      case "swap": filter = "pan=stereo|c0=c1|c1=c0"; break;
      case "left": filter = "pan=mono|c0=c0"; break;
      case "right": filter = "pan=mono|c0=c1"; break;
      case "mono": filter = "pan=mono|c0=0.5*c0+0.5*c1"; break;
      case "dual": filter = "pan=stereo|c0=c0|c1=c0"; break;
      default: filter = "anull";
    }
    return ffFilterTool(ctx, { filter: filter, suffix: "channels" });
  }

  /* ------------------------------------------------------ clean: denoise */

  async function denoise(ctx) {
    const v = ctx.values || {};
    const nf = num(v.noiseFloor, -50);
    const track = v.track ? "track_noise=1" : "track_noise=0";
    const filter = "afftdn=nr=" + num(v.strength, 12) + ":nf=" + nf + ":" + track;
    return ffFilterTool(ctx, { filter: filter, suffix: "denoised", status: "Reducing noise", experimental: true });
  }

  /* ------------------------------------------------------ clean: voice enhance */

  async function voiceEnhance(ctx) {
    const v = ctx.values || {};
    const hp = clamp(num(v.highpass, 80), 0, 200);
    const presence = num(v.presence, 3);
    const comp = ({ off: "", light: "acompressor=threshold=-18dB:ratio=2:attack=20:release=250",
      medium: "acompressor=threshold=-20dB:ratio=3:attack=15:release=200",
      strong: "acompressor=threshold=-22dB:ratio=5:attack=10:release=150" })[v.compress || "medium"] || "";
    const chain = [];
    if (hp > 0) chain.push("highpass=f=" + hp);
    if (presence > 0) chain.push("equalizer=f=3000:t=q:w=1.5:g=" + presence);
    if (comp) chain.push(comp);
    chain.push("alimiter=limit=0.98");
    return ffFilterTool(ctx, { filter: chain.join(","), suffix: "enhanced", status: "Enhancing voice", experimental: true });
  }

  /* ------------------------------------------------------ clean: equalizer */

  async function equalizer(ctx) {
    const v = ctx.values || {};
    const bass = num(v.bass, 0), mid = num(v.mid, 0), treble = num(v.treble, 0);
    if (bass === 0 && mid === 0 && treble === 0) throw new Error("All bands are at 0 dB, which does not change the audio.");
    const chain = [];
    if (bass !== 0) chain.push("equalizer=f=100:t=q:w=1:g=" + bass);
    if (mid !== 0) chain.push("equalizer=f=" + clamp(num(v.midFreq, 1000), 200, 8000) + ":t=q:w=1:g=" + mid);
    if (treble !== 0) chain.push("equalizer=f=8000:t=q:w=1:g=" + treble);
    chain.push("alimiter=limit=0.98");
    return ffFilterTool(ctx, { filter: chain.join(","), suffix: "eq" });
  }

  /* ------------------------------------------------------ clean: loudnorm */

  async function loudnorm(ctx) {
    const v = ctx.values || {};
    const target = num(v.target, -16);
    const peak = num(v.peak, -1);
    // Two-pass loudnorm: measure, then normalise.
    const file = ctx.files[0];
    ctx.onProgress(6, "Preparing");
    const prep = await fileToWavBytes(file, ctx.onProgress);
    const ff = await loadFFmpeg();
    await ffWrite(ff, "in.wav", prep.bytes);
    ctx.onProgress(30, "Measuring loudness");
    const measure = "loudnorm=I=" + target + ":TP=" + peak + ":LRA=11:print_format=json";
    const logs = [];
    const logHandler = function (e) { logs.push(e && e.message); };
    ff.on("log", logHandler);
    try { await ffExec(ff, ["-hide_banner", "-y", "-i", "in.wav", "-af", measure, "-f", "null", "-"]); } catch (_) {}
    ff.off("log", logHandler);
    const measured = parseLoudnormJson(logs.join("\n"));
    ctx.onProgress(65, "Normalising");
    let filter = measure;
    if (measured && measured.input_i != null) {
      filter = "loudnorm=I=" + target + ":TP=" + peak + ":LRA=11:measured_I=" + measured.input_i +
        ":measured_TP=" + measured.input_tp + ":measured_LRA=" + measured.input_lra +
        ":measured_thresh=" + measured.input_thresh + ":offset=" + measured.target_offset + ":linear=true:print_format=summary";
    }
    const format = v.format || "mp3";
    const outName = "out." + extForFormat(format);
    const args = ["-hide_banner", "-y", "-i", "in.wav", "-af", filter].concat(ffmpegCodecArgs(format, v.bitrate)).concat([outName]);
    await ffExec(ff, args);
    const bytes = await ffRead(ff, outName);
    try { await ff.deleteFile("in.wav"); await ff.deleteFile(outName); } catch (_) {}
    const blob = new Blob([bytes], { type: mimeForFormat(format) });
    const report = measured
      ? "Input: " + measured.input_i + " LUFS, TP " + measured.input_tp + " dBTP\nTarget: " + target + " LUFS, ceiling " + peak + " dBTP"
      : "Target: " + target + " LUFS (measurement unavailable; single-pass applied)";
    return {
      outputs: [
        audioOut(safeName(file.name, "") + "-normalized." + extForFormat(format), blob, target + " LUFS, " + formatBytes(blob.size)),
        textOut(safeName(file.name, "loudness.txt"), "Loudness normalisation report\nFile: " + file.name + "\n" + report)
      ],
      errors: []
    };
  }

  function parseLoudnormJson(text) {
    const m = text.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (!m) return null;
    try {
      const j = JSON.parse(m[0]);
      return { input_i: j.input_i, input_tp: j.input_tp, input_lra: j.input_lra, input_thresh: j.input_thresh, target_offset: j.target_offset };
    } catch (_) { return null; }
  }

  /* ------------------------------------------------------ metadata: clipping */

  async function clipping(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const channels = bufferToChannels(buffer);
    const thr = dbfsToAmp(num(v.threshold, -0.1));
    ctx.onProgress(60, "Scanning samples");
    const sr = buffer.sampleRate;
    const runs = [];
    let count = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      let clippedHere = false;
      for (let c = 0; c < channels.length; c++) {
        const a = Math.abs(channels[c][i]);
        if (a > peak) peak = a;
        if (a >= thr) { clippedHere = true; }
      }
      if (clippedHere) { count++; if (!runs.length || i - runs[runs.length - 1].end > sr * 0.1) runs.push({ start: i, end: i }); else runs[runs.length - 1].end = i; }
    }
    const lines = [
      "Clipping report for " + file.name,
      "Threshold: " + num(v.threshold, -0.1) + " dBFS",
      "Peak: " + ampToDbfs(peak).toFixed(2) + " dBFS",
      "Clipped sample-frames: " + count + (count ? " (" + (count / buffer.length * 100).toFixed(3) + "% of the file)" : ""),
      "",
      count ? "Clipped regions:" : "No clipping detected at this threshold.",
    ];
    runs.slice(0, 40).forEach(function (r, i) { lines.push((i + 1) + ". " + formatTime(r.start / sr) + " - " + formatTime(r.end / sr)); });
    if (runs.length > 40) lines.push("... and " + (runs.length - 40) + " more");
    return { outputs: [textOut(safeName(file.name, "txt"), lines.join("\n"))], errors: [], report: { peakDbfs: ampToDbfs(peak), clipped: count } };
  }

  /* ------------------------------------------------------ metadata: silence detect */

  async function silenceDetect(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const mono = combineChannels(bufferToChannels(buffer), "avg");
    const win = Math.max(1, Math.round(buffer.sampleRate * 0.02));
    const thr = dbfsToAmp(num(v.threshold, -40));
    const minDur = num(v.minDuration, 0.3);
    ctx.onProgress(55, "Scanning");
    const flags = scanWindows(mono, { windowSize: win, threshold: thr, method: "rms" });
    const gaps = flagsToGaps(flags, win / buffer.sampleRate, minDur);
    const total = gaps.reduce(function (a, g) { return a + g.duration; }, 0);
    const lines = [
      "Silence map for " + file.name,
      "Threshold: " + num(v.threshold, -40) + " dBFS, minimum gap " + minDur + "s",
      "Gaps found: " + gaps.length + " (total " + total.toFixed(2) + "s of " + buffer.duration.toFixed(2) + "s)",
      "",
    ];
    gaps.forEach(function (g, i) { lines.push((i + 1) + ". " + formatTime(g.start) + " - " + formatTime(g.end) + " (" + g.duration.toFixed(2) + "s)"); });
    if (!gaps.length) lines.push("No gaps detected. Lower the threshold if you expected silence.");
    return { outputs: [textOut(safeName(file.name, "txt"), lines.join("\n"))], errors: [], report: { gaps: gaps } };
  }

  /* ------------------------------------------------------ record: recorder */

  async function record(ctx) {
    // The recorder is driven by live UI (see mountRecorder), so the batch
    // processor simply reports that a recorded take must be supplied first.
    throw new Error("Use the recorder controls on this page: press Record, then Stop, then download.");
  }
  // Live-only tool. The page mounts the meter (mountMicCheck); this handler
  // exists so a batch invocation fails loudly instead of pretending to work.
  async function micCheck() {
    throw new Error("Use the live microphone meter on this page: press Start test, then allow microphone access.");
  }
  async function stereoTest(ctx) {
    // Generate a short test tone buffer for the chosen channel layout.
    const v = ctx.values || {};
    const freq = clamp(num(v.tone, 440), 100, 4000);
    const sr = 44100, dur = 2;
    const left = new Float32Array(sr * dur);
    const right = new Float32Array(sr * dur);
    for (let i = 0; i < left.length; i++) {
      const s = Math.sin(2 * Math.PI * freq * i / sr) * 0.5;
      const t = i / sr;
      const on = (v.channel === "sweep") ? (Math.floor(t * 2) % 2 === 0) : true;
      if (v.channel === "left" || v.channel === "both") left[i] = s;
      if (v.channel === "right" || v.channel === "both") right[i] = s;
      if (v.channel === "sweep") { if (on) left[i] = s; else right[i] = s; }
    }
    const blob = encodeWav([left, right], sr, { bits: 16 });
    return { outputs: [audioOut("stereo-test.wav", blob, v.channel + " channel, " + freq + " Hz")], errors: [] };
  }

  /* ------------------------------------------------------ music: tones */

  async function tone(ctx) {
    const v = ctx.values || {};
    const freq = clamp(num(v.frequency, 440), 20, 20000);
    const dur = clamp(num(v.duration, 5), 1, 600);
    const amp = clamp(num(v.amplitude, 50), 1, 100) / 100;
    const wave = v.wave || "sine";
    const sr = 44100;
    const n = Math.round(sr * dur);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = (i * freq / sr) % 1;
      let s;
      if (wave === "square") s = ph < 0.5 ? 1 : -1;
      else if (wave === "triangle") s = 4 * Math.abs(ph - 0.5) - 1;
      else if (wave === "sawtooth") s = 2 * ph - 1;
      else s = Math.sin(2 * Math.PI * ph);
      // short fade to avoid clicks
      const envEdge = Math.min(1, i / (sr * 0.01), (n - i) / (sr * 0.01));
      d[i] = s * amp * envEdge;
    }
    const blob = encodeWav([d], sr, { bits: 16 });
    ctx.onProgress(90, "Rendered");
    return { outputs: [audioOut("tone-" + freq + "hz.wav", blob, freq + " Hz " + wave + ", " + dur + "s")], errors: [] };
  }

  async function noise(ctx) {
    const v = ctx.values || {};
    const dur = clamp(num(v.duration, 60), 1, 1800);
    const amp = clamp(num(v.amplitude, 40), 1, 100) / 100;
    const colour = v.colour || "white";
    const sr = 44100;
    const n = Math.round(sr * dur);
    const d = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      let s;
      if (colour === "pink") {
        // Paul Kellet's economy pink filter
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        s = (b0 + b1 + b2 + white * 0.1848) * 0.2;
      } else if (colour === "brown") {
        last = (last + 0.02 * white) / 1.02;
        s = last * 3.5;
      } else s = white;
      const envEdge = Math.min(1, i / (sr * 0.02), (n - i) / (sr * 0.02));
      d[i] = clamp(s * amp * envEdge, -1, 1);
    }
    const blob = encodeWav([d], sr, { bits: 16 });
    return { outputs: [audioOut(colour + "-noise.wav", blob, colour + " noise, " + dur + "s, " + formatBytes(blob.size))], errors: [] };
  }

  // Live-only tool. The page mounts a real Web Audio scheduler
  // (mountMetronome); this handler exists only to fail loudly out of context.
  async function metronome() {
    throw new Error("Use the live metronome on this page: press Start.");
  }

  /* ------------------------------------------------------ music: bpm / key */

  async function bpm(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const mono = combineChannels(bufferToChannels(buffer), "avg");
    const sr = buffer.sampleRate;
    ctx.onProgress(40, "Detecting onsets");
    // Onset strength via short-window energy difference.
    const hop = Math.round(sr * 0.01);
    const frames = Math.floor(mono.length / hop);
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const s = f * hop, e = s + hop;
      for (let i = s; i < e && i < mono.length; i++) sum += mono[i] * mono[i];
      energy[f] = sum;
    }
    const flux = new Float32Array(frames);
    for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);
    // Autocorrelation of onset flux over plausible beat periods.
    const minBpm = clamp(num(v.bpm, 60), 40, 120);
    const minLag = Math.round(60 / 200 / 0.01); // 200 BPM
    const maxLag = Math.round(60 / minBpm / 0.01);
    let bestLag = 0, bestScore = -1;
    for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
      let s = 0;
      for (let f = lag; f < frames; f++) s += flux[f] * flux[f - lag];
      if (s > bestScore) { bestScore = s; bestLag = lag; }
    }
    const bpmVal = bestLag ? Math.round(60 / (bestLag * 0.01)) : 0;
    // Key estimate: peak spectral energy fitted to pitch classes.
    ctx.onProgress(75, "Estimating key");
    const key = await estimateKey(mono, sr);
    const text = [
      "Analysis of " + file.name,
      "Estimated tempo: " + (bpmVal || "unknown") + " BPM (onset autocorrelation)",
      "Estimated key: " + key.name + " " + key.mode + " (chroma estimate)",
      "",
      "Both values are estimates. Tempo detection needs a steady beat; the key estimate is a coarse spectral hint, not a definitive analysis."
    ].join("\n");
    return { outputs: [textOut(safeName(file.name, "txt"), text)], errors: [], report: { bpm: bpmVal, key: key } };
  }

  async function estimateKey(mono, sr) {
    // Sample a handful of windows; sum Goertzel-style energy across 12 pitch classes.
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const chroma = new Float64Array(12);
    const fftSize = 4096;
    const win = Math.min(mono.length, fftSize);
    const step = Math.max(1, Math.floor(mono.length / 40));
    const freqs = {};
    for (let midi = 21; midi <= 108; midi++) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      if (f >= sr / 2) break;
      freqs[midi] = f;
    }
    for (let off = 0; off + win <= mono.length; off += step) {
      for (let midi in freqs) {
        const f = freqs[midi];
        let re = 0, im = 0;
        const w = 2 * Math.PI * f / sr;
        for (let i = 0; i < win; i += 4) { // stride 4 keeps this cheap
          re += mono[off + i] * Math.cos(w * i);
          im -= mono[off + i] * Math.sin(w * i);
        }
        chroma[midi % 12] += Math.sqrt(re * re + im * im);
      }
    }
    let best = 0;
    for (let i = 1; i < 12; i++) if (chroma[i] > chroma[best]) best = i;
    return { name: names[best], mode: "major/minor ambiguous", chroma: Array.from(chroma) };
  }

  /* ------------------------------------------------------ music: spectrogram */

  async function spectrogram(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const mono = combineChannels(bufferToChannels(buffer), "avg");
    const sr = buffer.sampleRate;
    const fftSize = clamp(parseInt(v.fft, 10) || 2048, 256, 8192);
    const bins = fftSize / 2;
    ctx.onProgress(35, "Computing spectrogram");
    const frames = Math.min(1400, Math.floor(mono.length / (fftSize / 4)) || 1);
    const canvas = ctx.canvas || newCanvas(1000, 400);
    const W = canvas.width, H = canvas.height;
    const cx = canvas.getContext("2d");
    cx.fillStyle = "#05060a"; cx.fillRect(0, 0, W, H);
    const img = cx.createImageData(W, H);
    const logScale = (v.scale || "log") === "log";
    // simple Hann window
    const hann = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1));
    for (let x = 0; x < W; x++) {
      const frame = Math.floor(x / W * frames);
      const start = frame * (fftSize / 4);
      const mag = fftMag(mono, start, hann, fftSize);
      for (let y = 0; y < H; y++) {
        let bin;
        if (logScale) {
          const frac = 1 - y / H;
          bin = Math.round(Math.pow(frac, 2) * (bins - 1));
        } else bin = Math.round((1 - y / H) * (bins - 1));
        const val = mag[bin] || 0;
        const db = 20 * Math.log10(val / fftSize + 1e-9);
        const norm = clamp((db + 90) / 90, 0, 1);
        const idx = (y * W + x) * 4;
        img.data[idx] = Math.round(norm * 255);
        img.data[idx + 1] = Math.round(Math.pow(norm, 0.8) * 200);
        img.data[idx + 2] = Math.round(Math.pow(norm, 0.5) * 255);
        img.data[idx + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    ctx.onProgress(85, "Rendering image");
    const blob = await canvasToBlob(canvas);
    return { outputs: [imageOut(safeName(file.name, "") + "-spectrogram.png", blob, "Spectrogram, " + fftSize + "-point FFT, " + frames + " frames")], errors: [] };
  }

  function fftMag(samples, start, hann, size) {
    const half = size / 2;
    const out = new Float32Array(half);
    // Direct DFT is fine for our small frame count and keeps this dependency-free.
    for (let k = 0; k < half; k++) {
      let re = 0, im = 0;
      const w = -2 * Math.PI * k / size;
      for (let i = 0; i < size; i++) {
        const s = (samples[start + i] || 0) * hann[i];
        re += s * Math.cos(w * i);
        im += s * Math.sin(w * i);
      }
      out[k] = Math.sqrt(re * re + im * im);
    }
    return out;
  }

  function newCanvas(w, h) {
    const c = (typeof document !== "undefined") ? document.createElement("canvas") : { width: w, height: h, getContext: function () { return null; } };
    c.width = w; c.height = h;
    return c;
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas.toBlob) { reject(new Error("Canvas export is unavailable.")); return; }
      canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error("Could not export the image.")); }, "image/png");
    });
  }

  /* ------------------------------------------------------ developer: waveform image */

  async function waveformImage(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    const mono = combineChannels(bufferToChannels(buffer), "max");
    const W = clamp(num(v.width, 1600), 200, 4000);
    const H = clamp(num(v.height, 400), 80, 1200);
    const canvas = ctx.canvas || newCanvas(W, H);
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext("2d");
    cx.fillStyle = v.background || "#ffffff"; cx.fillRect(0, 0, W, H);
    const buckets = peakEnvelope(mono, W);
    cx.fillStyle = v.bar || "#1d4ed8";
    const mid = H / 2;
    if (v.style === "wave") {
      cx.beginPath();
      cx.moveTo(0, mid);
      for (let x = 0; x < W; x++) cx.lineTo(x, mid - buckets[x].max * mid * 0.95);
      for (let x = W - 1; x >= 0; x--) cx.lineTo(x, mid - buckets[x].min * mid * 0.95);
      cx.closePath(); cx.fill();
    } else {
      for (let x = 0; x < W; x++) {
        const top = mid - buckets[x].max * mid * 0.95;
        const bot = mid - buckets[x].min * mid * 0.95;
        cx.fillRect(x, top, 1, Math.max(1, bot - top));
      }
    }
    const blob = await canvasToBlob(canvas);
    return { outputs: [imageOut(safeName(file.name, "") + "-waveform.png", blob, W + "x" + H + " waveform")], errors: [] };
  }

  /* ------------------------------------------------------ developer: player snippet */

  async function playerSnippet(ctx) {
    const v = ctx.values || {};
    const src = String(v.src || "audio.mp3");
    const mime = String(v.mime || "audio/mpeg");
    const preload = ["none", "metadata", "auto"].indexOf(v.preload) >= 0 ? v.preload : "metadata";
    const attrs = ["controls", v.loop ? "loop" : "", "preload=\"" + preload + "\""].filter(Boolean).join(" ");
    const html = "<audio " + attrs + ">\n" +
      "  <source src=\"" + esc(src) + "\" type=\"" + esc(mime) + "\">\n" +
      "  Your browser does not support the audio element. <a href=\"" + esc(src) + "\">Download the audio</a>.\n" +
      "</audio>";
    return { outputs: [textOut("audio-player.html", html)], errors: [] };
  }

  /* ------------------------------------------------------ developer: rss validator */

  async function rssValidate(ctx) {
    const v = ctx.values || {};
    const xml = String(v.feed || "");
    if (!xml.trim()) throw new Error("Paste your RSS XML first.");
    const issues = [];
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    if (!items.length) issues.push("No <item> elements found. Is this a valid RSS feed?");
    items.forEach(function (item, i) {
      const enc = item.match(/<enclosure\b[^>]*>/i);
      if (!enc) { issues.push("Item " + (i + 1) + ": missing <enclosure>."); return; }
      const url = /url=["']([^"']+)["']/i.exec(enc[0]);
      const type = /type=["']([^"']+)["']/i.exec(enc[0]);
      const len = /length=["']([^"']+)["']/i.exec(enc[0]);
      if (!url) issues.push("Item " + (i + 1) + ": enclosure has no url.");
      else if (!/^https?:\/\//i.test(url[1])) issues.push("Item " + (i + 1) + ": enclosure url is not http(s).");
      if (!type) issues.push("Item " + (i + 1) + ": enclosure has no type.");
      else if (!/^audio\//i.test(type[1])) issues.push("Item " + (i + 1) + ": enclosure type '" + type[1] + "' is not an audio MIME type.");
      if (!len) issues.push("Item " + (i + 1) + ": enclosure has no length (podcast apps need it).");
      else if (!/^\d+$/.test(len[1])) issues.push("Item " + (i + 1) + ": enclosure length '" + len[1] + "' is not numeric.");
    });
    const lines = ["Podcast RSS enclosure report", "Items checked: " + items.length, ""];
    if (issues.length) { lines.push("Issues found: " + issues.length); issues.forEach(function (s) { lines.push("- " + s); }); }
    else lines.push("No enclosure problems found. (URLs were validated for structure, not reachability.)");
    return { outputs: [textOut("rss-report.txt", lines.join("\n"))], errors: [], report: { issues: issues } };
  }

  /* ------------------------------------------------------ metadata: viewer / id3 / integrity / mime / dedupe */

  async function metadata(ctx) {
    const file = ctx.files[0];
    const buffer = await decodeAudio(file, ctx.onProgress);
    ctx.onProgress(60, "Reading tags");
    const tags = readId3(await new Uint8Array(await arrayBufferOf(file)));
    const levels = analyseLevels(bufferToChannels(buffer));
    const json = {
      file: file.name, sizeBytes: file.size, mimeType: file.type || "unknown",
      durationSec: r3(buffer.duration), sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
      bitrateKbps: buffer.duration ? Math.round(file.size * 8 / buffer.duration / 1000) : null,
      peakDbfs: r3(levels.peakDbfs), rmsDbfs: r3(levels.rmsDbfs), tags: tags
    };
    const lines = [
      "Audio metadata: " + file.name, "",
      "Size: " + formatBytes(file.size),
      "Type: " + (file.type || "unknown"),
      "Duration: " + formatTime(buffer.duration),
      "Sample rate: " + buffer.sampleRate + " Hz",
      "Channels: " + buffer.numberOfChannels,
      "Approx. bitrate: " + (json.bitrateKbps != null ? json.bitrateKbps + " kbps" : "n/a"),
      "Peak: " + json.peakDbfs + " dBFS, RMS: " + json.rmsDbfs + " dBFS",
      "", "Tags:", Object.keys(tags).length ? Object.keys(tags).map(function (k) { return "  " + k + ": " + tags[k]; }).join("\n") : "  (none found)"
    ];
    return { outputs: [textOut(safeName(file.name, "") + "-metadata.json", JSON.stringify(json, null, 2)), textOut(safeName(file.name, "") + "-metadata.txt", lines.join("\n"))], errors: [] };
  }

  /* Read ID3v1 and ID3v2 text frames directly from the bytes. */
  function readId3(bytes) {
    const tags = {};
    try {
      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        const ver = bytes[3];
        const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
        let off = 10;
        const end = Math.min(bytes.length, 10 + size);
        const map = { TIT2: "title", TPE1: "artist", TALB: "album", TCON: "genre", TRCK: "track", TDRC: "year", COMM: "comment", TPE2: "albumArtist" };
        while (off + 10 < end) {
          const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
          if (!/^[A-Z0-9]{4}$/.test(id)) break;
          const fsize = (bytes[off + 4] << 24) | (bytes[off + 5] << 16) | (bytes[off + 6] << 8) | bytes[off + 7];
          if (fsize <= 0 || off + 10 + fsize > end) break;
          if (map[id]) {
            let textStart = off + 10;
            let encByte = bytes[textStart];
            if (id === "COMM") { textStart += 4; encByte = bytes[off + 10]; }
            const body = bytes.subarray(textStart + 1, off + 10 + fsize);
            let val = decodeText(body, encByte);
            if (id === "COMM") val = val.replace(/^\x00+/, "").trim();
            if (val && !tags[map[id]]) tags[map[id]] = val.replace(/\x00/g, "").trim();
          }
          off += 10 + fsize;
        }
      }
      // ID3v1 at the end
      if (bytes.length > 128) {
        const t = bytes.subarray(bytes.length - 128);
        if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
          const dec = function (o, len) { let s = ""; for (let i = 0; i < len; i++) { const c = t[o + i]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
          if (!tags.title) tags.title = dec(3, 30);
          if (!tags.artist) tags.artist = dec(33, 30);
          if (!tags.album) tags.album = dec(63, 30);
        }
      }
    } catch (_) {}
    return tags;
  }
  function decodeText(bytes, encByte) {
    try {
      if (encByte === 1) return new TextDecoder("utf-16").decode(bytes);
      if (encByte === 3) return new TextDecoder("utf-8").decode(bytes);
      return new TextDecoder("latin1").decode(bytes);
    } catch (_) { return new TextDecoder("utf-8").decode(bytes); }
  }

  async function id3Edit(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    ctx.onProgress(10, "Reading file");
    const bytes = new Uint8Array(await arrayBufferOf(file));
    const metaArgs = [];
    const fields = [["title", "title"], ["artist", "artist"], ["album", "album"], ["genre", "genre"], ["track", "track"], ["comment", "comment"]];
    fields.forEach(function (f) {
      const val = String(v[f[0]] == null ? "" : v[f[0]]).trim();
      if (val) metaArgs.push("-metadata", f[1] + "=" + val);
    });
    if (!metaArgs.length) throw new Error("Fill in at least one tag field to write.");
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "mp3";
    ctx.onProgress(50, "Writing tags");
    const outName = "tagged." + ext;
    const args = ["-hide_banner", "-y", "-i", "in." + ext, "-c", "copy"].concat(metaArgs).concat([outName]);
    const out = await ffRun(null, "in." + ext, bytes, args, outName);
    const blob = new Blob([out], { type: file.type || "audio/mpeg" });
    // verify by re-reading tags
    const check = readId3(out);
    return { outputs: [audioOut(safeName(file.name, "") + "-tagged." + ext, blob, "Tags: " + JSON.stringify(check) + ", " + formatBytes(blob.size))], errors: [] };
  }

  async function integrity(ctx) {
    const file = ctx.files[0];
    ctx.onProgress(15, "Checking signature");
    const head = new Uint8Array((await arrayBufferOf(file)).slice(0, 16));
    const sig = detectSignature(head);
    const ext = ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
    let decodeOk = true, decodeErr = "";
    try { await decodeAudio(file, ctx.onProgress); } catch (e) { decodeOk = false; decodeErr = e.message; }
    const mismatched = sig.ext && ext && ext !== sig.ext && !(sig.alt || []).includes(ext);
    const lines = [
      "Integrity check: " + file.name, "",
      "Reported size: " + formatBytes(file.size),
      "Signature: " + sig.name + (sig.ext ? " (." + sig.ext + ")" : ""),
      "Extension: ." + (ext || "?"),
      mismatched ? "WARNING: the extension does not match the file signature." : "Extension matches the signature.",
      decodeOk ? "Decodes cleanly." : "DECODE FAILED: " + decodeErr,
      "", decodeOk ? "This file is structurally sound and playable in this browser." : "This file could not be decoded and may be corrupt or unsupported."
    ];
    return { outputs: [textOut(safeName(file.name, "") + "-integrity.txt", lines.join("\n"))], errors: [], report: { decodeOk: decodeOk, signature: sig.name, mismatched: mismatched } };
  }

  const SIGNATURES = [
    { name: "MP3 (ID3)", ext: "mp3", test: function (b) { return b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33; } },
    { name: "MP3", ext: "mp3", test: function (b) { return b[0] === 0xFF && (b[1] & 0xE0) === 0xE0; } },
    { name: "WAV", ext: "wav", test: function (b) { return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; } },
    { name: "FLAC", ext: "flac", test: function (b) { return b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43; } },
    { name: "OGG", ext: "ogg", alt: ["opus"], test: function (b) { return b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53; } },
    { name: "M4A/MP4", ext: "m4a", alt: ["mp4", "aac"], test: function (b) { return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; } },
    { name: "AIFF", ext: "aiff", alt: ["aif"], test: function (b) { return b[0] === 0x46 && b[1] === 0x4F && b[2] === 0x52 && b[3] === 0x4D; } },
    { name: "AMR", ext: "amr", test: function (b) { return b[0] === 0x23 && b[1] === 0x21 && b[2] === 0x41 && b[3] === 0x4D; } },
    { name: "AC3", ext: "ac3", test: function (b) { return b[0] === 0x0B && b[1] === 0x77; } },
    { name: "Matroska/WebM", ext: "webm", alt: ["mka", "mkv"], test: function (b) { return b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3; } }
  ];
  function detectSignature(b) {
    for (let i = 0; i < SIGNATURES.length; i++) { try { if (SIGNATURES[i].test(b)) return SIGNATURES[i]; } catch (_) {} }
    return { name: "Unknown", ext: null };
  }

  async function mimeCheck(ctx) {
    const file = ctx.files[0];
    const bytes = new Uint8Array(await arrayBufferOf(file));
    const sig = detectSignature(bytes.subarray(0, 16));
    const ext = ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
    const mimeByExt = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/opus", m4a: "audio/mp4", aac: "audio/aac", aiff: "audio/aiff", aif: "audio/aiff", amr: "audio/amr", ac3: "audio/ac3", webm: "audio/webm" };
    const lines = [
      "MIME & signature check: " + file.name, "",
      "Detected format: " + sig.name + (sig.ext ? " (." + sig.ext + ")" : ""),
      "File extension: ." + (ext || "?"),
      "Reported MIME type (from the browser): " + (file.type || "(none)"),
      "Suggested MIME type for ." + ext + ": " + (mimeByExt[ext] || "application/octet-stream"),
      "Suggested MIME for the detected format: " + (sig.ext ? (mimeByExt[sig.ext] || "application/octet-stream") : "unknown")
    ];
    return { outputs: [textOut(safeName(file.name, "") + "-mime.txt", lines.join("\n"))], errors: [] };
  }

  async function audioDedupe(ctx) {
    const hashes = [];
    const errors = [];
    for (let i = 0; i < ctx.files.length; i++) {
      ctx.onProgress(10 + Math.round(i / ctx.files.length * 70), "Hashing " + (i + 1) + "/" + ctx.files.length);
      try {
        const buffer = await decodeAudio(ctx.files[i]);
        const mono = combineChannels(bufferToChannels(buffer), "avg");
        const h = fnvHash(mono, buffer.sampleRate, buffer.numberOfChannels);
        hashes.push({ name: ctx.files[i].name, hash: h, duration: buffer.duration, rate: buffer.sampleRate });
      } catch (e) { errors.push({ name: ctx.files[i].name, message: e.message }); }
    }
    const groups = {};
    hashes.forEach(function (h) { (groups[h.hash] = groups[h.hash] || []).push(h); });
    const dups = Object.keys(groups).filter(function (k) { return groups[k].length > 1; });
    const lines = ["Duplicate audio report", "Files analysed: " + hashes.length, ""];
    if (dups.length) {
      lines.push("Exact duplicate groups found: " + dups.length);
      dups.forEach(function (k, i) { lines.push("Group " + (i + 1) + ":"); groups[k].forEach(function (g) { lines.push("  - " + g.name + " (" + formatTime(g.duration) + ")"); }); });
    } else lines.push("No exact duplicates found among the decoded audio.");
    lines.push("", "Note: matching is exact on decoded samples at the original sample rate. Different bitrates of the same song are NOT flagged - that would be approximate similarity.");
    return { outputs: [textOut("duplicate-report.txt", lines.join("\n"))], errors: errors };
  }
  function fnvHash(samples, rate, ch) {
    let h = 0x811c9dc5;
    const step = Math.max(1, Math.floor(samples.length / 20000));
    for (let i = 0; i < samples.length; i += step) {
      const v = Math.round(samples[i] * 32767) | 0;
      h ^= v & 0xff; h = (h * 0x01000193) >>> 0;
      h ^= (v >> 8) & 0xff; h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16) + "-" + rate + "x" + ch + "-" + samples.length;
  }

  /* ------------------------------------------------------ metadata: loudness analyze */

  async function loudnessAnalyze(ctx) {
    const v = ctx.values || {};
    const file = ctx.files[0];
    const target = num(v.target, -16);
    ctx.onProgress(10, "Preparing");
    const prep = await fileToWavBytes(file, ctx.onProgress);
    const ff = await loadFFmpeg();
    await ffWrite(ff, "in.wav", prep.bytes);
    ctx.onProgress(40, "Measuring");
    const logs = [];
    const handler = function (e) { logs.push(e && e.message); };
    ff.on("log", handler);
    try { await ffExec(ff, ["-hide_banner", "-y", "-i", "in.wav", "-af", "loudnorm=I=" + target + ":TP=-1:print_format=json", "-f", "null", "-"]); } catch (_) {}
    try { await ffExec(ff, ["-hide_banner", "-i", "in.wav", "-af", "ebur128", "-f", "null", "-"]); } catch (_) {}
    ff.off("log", handler);
    try { await ff.deleteFile("in.wav"); } catch (_) {}
    const m = parseLoudnormJson(logs.join("\n"));
    const levels = analyseLevels(bufferToChannels(prep.buffer));
    const lines = [
      "Loudness report: " + file.name, "",
      m ? "Integrated loudness: " + m.input_i + " LUFS" : "Integrated loudness: unavailable",
      m ? "True peak: " + m.input_tp + " dBTP" : "True peak: unavailable",
      m ? "Loudness range (LRA): " + m.input_lra + " LU" : "",
      "Sample peak: " + r3(levels.peakDbfs) + " dBFS",
      "RMS: " + r3(levels.rmsDbfs) + " dBFS",
      "", "Target: " + target + " LUFS",
    ];
    if (m) {
      const diff = Math.abs(parseFloat(m.input_i) - target);
      lines.push(diff <= 1 ? "PASS: within 1 LU of the target." : "OFF TARGET by " + diff.toFixed(1) + " LU. Use the Loudness Normalizer to fix it.");
    }
    return { outputs: [textOut(safeName(file.name, "") + "-loudness.txt", lines.join("\n"))], errors: [], report: m || {} };
  }

  /* ============================================================ processor map */
  /*
   * Handler id -> function. mountTool refuses to mount a tool whose handler is
   * absent, so the registry can never advertise a processor that does not exist.
   */
  const PROCESSORS = {
    convert: convert,
    compressAudio: compressAudio,
    toWav: toWav,
    toMp3: toMp3,
    toFlac: toFlac,
    toM4a: toM4a,
    toOgg: toOgg,
    toAiff: toAiff,
    audioToBase64: audioToBase64,
    base64ToAudio: base64ToAudio,
    ringtone: ringtone,
    batchRename: batchRename,
    audioZip: audioZip,
    trim: trim,
    silenceRemove: silenceRemove,
    join: join,
    split: split,
    fade: fade,
    reverse: reverse,
    speed: speed,
    pitch: pitch,
    volumeNormalize: volumeNormalize,
    loop: loop,
    crossfade: crossfade,
    channels: channelsTool,
    denoise: denoise,
    voiceEnhance: voiceEnhance,
    equalizer: equalizer,
    loudnorm: loudnorm,
    clipping: clipping,
    silenceDetect: silenceDetect,
    record: record,
    micCheck: micCheck,
    stereoTest: stereoTest,
    tone: tone,
    noise: noise,
    metronome: metronome,
    bpm: bpm,
    spectrogram: spectrogram,
    waveformImage: waveformImage,
    metadata: metadata,
    id3Edit: id3Edit,
    loudnessAnalyze: loudnessAnalyze,
    integrity: integrity,
    audioDedupe: audioDedupe,
    mimeCheck: mimeCheck,
    playerSnippet: playerSnippet,
    rssValidate: rssValidate
  };

  core.PROCESSORS = PROCESSORS;

  /* ================================================================== UI */

  let active = null;

  function revokeAll(urls) {
    (urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (_) {} });
    (urls || []).length = 0;
  }
  function unmount() {
    if (!active) return;
    revokeAll(active.urls || []);
    if (active.cleanup) { try { active.cleanup(); } catch (_) {} }
    if (active.onKey) document.removeEventListener("keydown", active.onKey);
    active = null;
  }
  function statusLabel(status) {
    return ({ implemented: "Ready", experimental: "Experimental", deferred: "Deferred", unavailable: "Not available", blocked: "Blocked" })[status] || status;
  }
  function statusClass(status) { return status === "implemented" ? "ok" : status === "experimental" ? "warn" : "muted"; }
  function statusBadge(status) {
    return status === "implemented" ? "" : '<em class="itk-badge ' + statusClass(status) + '">' + esc(statusLabel(status)) + "</em>";
  }

  function optionHtml(opt, idx) {
    const id = "atk-opt-" + idx;
    const key = esc(opt.key);
    const show = opt.showIf ? ' data-show="' + esc(opt.showIf.key) + ":" + esc((opt.showIf.value || []).join("|")) + '"' : "";
    let input = "";
    if (opt.type === "select") {
      input = '<select id="' + id + '" data-opt="' + key + '">' + (opt.options || []).map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(opt.value) ? " selected" : "") + ">" + esc(o.label) + "</option>";
      }).join("") + "</select>";
    } else if (opt.type === "range") {
      input = '<span class="itk-range"><input id="' + id + '" type="range" data-opt="' + key + '" min="' + opt.min + '" max="' + opt.max + '" step="' + (opt.step || 1) + '" value="' + opt.value + '" aria-describedby="' + id + '-out"><output id="' + id + '-out" for="' + id + '">' + esc(opt.value) + "</output></span>";
    } else if (opt.type === "checkbox") {
      input = '<label class="itk-check"><input id="' + id + '" type="checkbox" data-opt="' + key + '"' + (opt.value ? " checked" : "") + '> <span>' + esc(opt.label) + "</span></label>";
      return '<div class="itk-field itk-field-check"' + show + ">" + input + (opt.help ? '<small>' + esc(opt.help) + "</small>" : "") + "</div>";
    } else if (opt.type === "textarea") {
      input = '<textarea id="' + id + '" data-opt="' + key + '" rows="' + (opt.rows || 3) + '">' + esc(opt.value) + "</textarea>";
    } else if (opt.type === "color") {
      input = '<span class="itk-color"><input id="' + id + '" type="color" data-opt="' + key + '" value="' + esc(opt.value) + '"><code>' + esc(opt.value) + "</code></span>";
    } else {
      input = '<input id="' + id + '" type="' + (opt.type === "number" ? "number" : "text") + '" data-opt="' + key + '" value="' + esc(opt.value) + '"' +
        (opt.min != null ? ' min="' + opt.min + '"' : "") + (opt.max != null ? ' max="' + opt.max + '"' : "") + (opt.step != null ? ' step="' + opt.step + '"' : "") + ">";
    }
    return '<div class="itk-field"' + show + '><label for="' + id + '">' + esc(opt.label) + "</label>" + input + (opt.help ? "<small>" + esc(opt.help) + "</small>" : "") + "</div>";
  }

  const OUTPUT_LABELS = { audio: "Audio file", document: "Document", image: "Image file", report: "Report", text: "Text file", zip: "ZIP archive" };

  function formatOutputList(list) {
    const values = (list || []).map(function (item) { return OUTPUT_LABELS[item] || item; });
    return values.length ? values.join(", ") : "Processed file";
  }

  function quickAnswerHtml(answerHtml, facts) {
    return '<aside class="quick-answer quick-answer--summary" id="quick-answer" aria-labelledby="quick-answer-title">' +
      '<div class="quick-answer-copy"><h2 id="quick-answer-title">Quick answer</h2>' +
      '<p class="answer-text">' + answerHtml + "</p></div>" +
      '<dl class="key-facts">' + facts.map(function (fact) {
        return "<div><dt>" + esc(fact[0]) + "</dt><dd>" + esc(fact[1]) + "</dd></div>";
      }).join("") + "</dl></aside>";
  }

  function engineShort(tool) {
    return tool.engine === "ffmpeg"
      ? "FFmpeg.wasm on your device"
      : tool.engine === "media-recorder"
        ? "Browser microphone capture"
        : "Web Audio API in your browser";
  }

  function toolQuickAnswer(tool) {
    const copy = seoCopyFor(tool, "audio");
    return quickAnswerHtml(
      "<strong>" + esc(tool.name) + "</strong> " +
        esc(copy ? copy.quickAnswer : "processes audio locally in your browser. " + (tool.summary || "")),
      [
        ["Cost", "Free \u00b7 no account needed"],
        ["Uploads", "No audio is uploaded"],
        ["Inputs", (tool.inputs || []).join(", ") || (tool.requiresFile === false ? "No file needed" : "Audio file")],
        ["Output", formatOutputList(tool.outputs)],
        ["Engine", engineShort(tool)],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB \u00b7 " + (LIMITS.maxDurationSec / 60) + " minutes per file"]
      ]
    );
  }

  function hubQuickAnswerHtml(publicTools) {
    const implemented = publicTools.filter(function (t) { return t.status === "implemented"; }).length;
    const experimental = publicTools.length - implemented;
    return quickAnswerHtml(
      "<strong>The Bench Audio Toolkit</strong> is a free set of " + publicTools.length + " browser-based audio tools: " + implemented + " ready tools and " + experimental + " experimental tools. Decoding, editing and encoding run locally with the Web Audio API and a same-origin FFmpeg.wasm engine, so audio is not uploaded.",
      [
        ["Tools", publicTools.length + " public audio tools"],
        ["Engine", "Web Audio API + same-origin FFmpeg.wasm"],
        ["Uploads", "No audio is uploaded"],
        ["Account", "Not required"],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB \u00b7 " + (LIMITS.maxDurationSec / 60) + " minutes per file"]
      ]
    );
  }

  function studioQuickAnswerHtml() {
    return quickAnswerHtml(
      "<strong>Audio Studio</strong> applies several operations to one audio file in order, then exports the result. Decoding, editing and encoding run locally in your browser.",
      [
        ["Cost", "Free \u00b7 no account needed"],
        ["Uploads", "No audio is uploaded"],
        ["Inputs", "Audio file"],
        ["Output", "Audio file"],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB \u00b7 " + (LIMITS.maxDurationSec / 60) + " minutes per file"]
      ]
    );
  }

  function seoHtml(tool) {
    const copy = seoCopyFor(tool, "audio");
    const config = cfg();
    const related = (config.TOOLS || []).filter(function (t) {
      return t.id !== tool.id && t.category === tool.category && (t.status === "implemented" || t.status === "experimental");
    }).slice(0, 6);
    const faq = (tool.faq || []).filter(function (f) { return f && f.q && f.a; });
    const useCases = tool.useCases || [];
    const howTo = copy ? copy.howTo(tool.howTo) : (tool.howTo || []);
    const limitations = tool.limitations || tool.reason || "No additional limitations are documented.";
    const engineNote = copy ? copy.processNote(engineShort(tool)) : "Processing runs locally in your browser; nothing is uploaded.";
    return '<section class="seo-section itk-seo">' +
      "<h2>What it does</h2><p>" + esc(copy ? copy.description : (tool.description || tool.summary || "")) + "</p>" +
      "<h2>Tool-specific detail</h2><p>" + esc(copy ? copy.detail : (tool.summary || "")) + "</p>" +
      "<h2>How to use</h2><ol>" + howTo.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      (useCases.length ? "<h2>Common use cases</h2><ul>" + useCases.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") +
      "<h2>Limits &amp; considerations</h2><p>" + esc(limitations) + "</p>" +
      "<h2>How your audio is processed</h2><p>" + esc(engineNote) + "</p>" +
      "<h2>Privacy &amp; security</h2><p>" + esc(copy ? copy.privacyNote : (tool.privacy || "Processing runs locally in your browser. Nothing is uploaded.")) + "</p>" +
      (faq.length ? '<h2>Frequently asked questions</h2><div class="faq-list">' + faq.map(function (f) { return '<div class="faq-item"><strong>' + esc(f.q) + "</strong><p>" + esc(copy ? copy.faqAnswer(f.q, f.a) : f.a) + "</p></div>"; }).join("") + "</div>" : "") +
      (related.length ? '<h2>Related audio tools</h2><div class="tool-links">' + related.map(function (t) { return '<a href="/audio/' + esc(t.slug) + '/">' + iconSvg(t) + " " + esc(t.name) + "</a>"; }).join("") + "</div>" : "") +
      "</section>";
  }

  function setMeta(tool) {
    const config = cfg();
    const copy = seoCopyFor(tool, "audio");
    document.title = tool.seoTitle || tool.name;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = (config.SITE_URL || "https://bench.progeni.live") + "/audio/" + tool.slug + "/";
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", copy ? copy.seoDescription : (tool.seoDescription || tool.summary || ""));
  }

  const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.oga,.opus,.aiff,.aif,.amr,.wma,.webm,.wv,.ape,.ac3";

  /* --- Collection of option values from the rendered form. */
  function readValues(formEl) {
    const v = {};
    if (!formEl) return v;
    formEl.querySelectorAll("[data-opt]").forEach(function (el) {
      const key = el.dataset.opt;
      if (el.type === "checkbox") v[key] = el.checked;
      else if (el.type === "range" || el.type === "number") v[key] = Number(el.value);
      else v[key] = el.value;
    });
    return v;
  }
  function applyVisibility(formEl) {
    if (!formEl) return;
    formEl.querySelectorAll("[data-show]").forEach(function (field) {
      const parts = field.dataset.show.split(":");
      const key = parts[0], vals = (parts[1] || "").split("|");
      const ctrl = formEl.querySelector('[data-opt="' + key + '"]');
      const current = ctrl ? (ctrl.type === "checkbox" ? String(ctrl.checked) : ctrl.value) : "";
      field.hidden = vals.indexOf(current) < 0;
    });
  }

  /* --- Simple transport + waveform preview used by most pages. */
  function previewHtml() {
    return '<div class="atk-preview" id="atk-preview" hidden>' +
      '<canvas class="atk-wave" id="atk-wave" aria-label="Waveform preview"></canvas>' +
      '<div class="atk-transport"><button class="btn btn-sm" type="button" id="atk-play">Play</button><button class="btn secondary btn-sm" type="button" id="atk-stop">Stop</button><span class="atk-time" id="atk-time">0:00.00</span></div>' +
      "</div>";
  }

  function drawWave(canvas, buffer) {
    if (!canvas || !buffer) return;
    const W = canvas.clientWidth || 600, H = canvas.clientHeight || 96;
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext("2d");
    cx.clearRect(0, 0, W, H);
    const mono = combineChannels(bufferToChannels(buffer), "max");
    const env = peakEnvelope(mono, W);
    cx.fillStyle = "#1d4ed8";
    const mid = H / 2;
    for (let x = 0; x < env.length; x++) {
      const top = mid - env[x].max * mid * 0.95;
      const bot = mid - env[x].min * mid * 0.95;
      cx.fillRect(x, top, 1, Math.max(1, bot - top));
    }
  }

  /* --- Result rendering. */
  function renderResults(container, outputs, errors, urls) {
    if (!outputs.length && !errors.length) {
      container.innerHTML = '<div class="itk-empty"><strong>No output</strong><span>Nothing was produced.</span></div>';
      return;
    }
    const cards = outputs.map(function (r) {
      if (r.kind === "text") {
        return '<article class="itk-result"><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + " text</span>" +
          '<textarea class="atk-text" readonly rows="8">' + esc(r.text) + "</textarea>" +
          '<button class="btn btn-sm" type="button" data-copy="' + esc(r.name) + '">Copy</button> ' +
          '<a class="btn btn-sm" href="' + (r.url || "#") + '" data-download="' + esc(r.name) + '">Download</a></div></article>';
      }
      if (r.kind === "image") {
        return '<article class="itk-result"><a class="itk-thumb" href="' + r.url + '" download="' + esc(r.name) + '"><img src="' + r.url + '" alt="' + esc(r.name) + '" loading="lazy"></a><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + "</span><p>" + esc(r.note) + '</p><a class="btn btn-sm" href="' + r.url + '" download="' + esc(r.name) + '">Download</a></div></article>';
      }
      return '<article class="itk-result"><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + "</span>" +
        '<audio controls preload="metadata" src="' + r.url + '"></audio><p>' + esc(r.note) + "</p>" +
        '<a class="btn btn-sm" href="' + r.url + '" download="' + esc(r.name) + '">Download</a></div></article>';
    }).join("");
    const errHtml = errors.length ? '<div class="itk-errors"><h3>Errors</h3><ul>' + errors.map(function (e) { return "<li><strong>" + esc(e.name) + ":</strong> " + esc(e.message) + "</li>"; }).join("") + "</ul></div>" : "";
    container.innerHTML = cards + errHtml;
  }

  /* ============================================ interactive page mounting */

  function mountTool(id) {
    if (typeof document === "undefined") return;
    const config = cfg();
    const app = document.getElementById("app");
    if (!app) return;
    unmount();
    const tool = config.getTool ? config.getTool(id) : (config.TOOLS || []).find(function (t) { return t.id === id || t.slug === id; });
    if (!tool) {
      document.title = "Audio tool not found | Bench";
      app.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Audio Toolkit</span><h1>Audio tool not found</h1><p>That tool does not exist or was renamed.</p></section><p><a class="btn" href="/audio/">Browse all audio tools</a></p>';
      return;
    }
    setMeta(tool);

    if (tool.status === "unavailable" || tool.status === "deferred" || tool.status === "blocked") {
      app.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Audio Toolkit</span><h1><span class="tool-head-icon" data-icon="' + esc(iconName(tool)) + '" aria-hidden="true">' + iconSvg(tool) + '</span>' + esc(tool.name) + "</h1><p>" + esc(tool.summary) + "</p></section>" + toolQuickAnswer(tool) +
        '<section class="toolbox itk-panel"><div class="itk-status warn"><strong>Status: ' + esc(statusLabel(tool.status)) + "</strong><p>" + esc(tool.reason || "This tool is not available.") + "</p></div>" +
        '<p><a class="btn" href="/audio/">Browse working audio tools</a></p></section>' + seoHtml(tool);
      return;
    }

    const optionList = tool.options || [];
    const options = optionList.length ? optionList.map(optionHtml).join("") : '<p class="itk-muted">This tool has no settings. Add a file and run it.</p>';
    const multi = (tool.maxFiles || 1) > 1;
    const drop = tool.requiresFile === false
      ? ""
      : '<div id="atk-drop" class="drop" role="button" tabindex="0"><strong>Drop ' + (multi ? "audio files" : "an audio file") + ' here</strong><span>or click to browse. Files stay on this device.</span><input id="atk-file" type="file" accept="' + AUDIO_ACCEPT + '" ' + (multi ? "multiple" : "") + " hidden></div>";

    const limitation = tool.status === "experimental"
      ? '<div class="itk-status warn"><strong>Experimental</strong><span>' + esc(tool.limitations || tool.reason || "This workflow is still under evaluation.") + "</span></div>" : "";

    const isRecorder = tool.handler === "record";
    const isMicCheck = tool.handler === "micCheck";
    const isMetronome = tool.handler === "metronome";
    const isLiveAudio = isRecorder || isMicCheck || isMetronome;

    const recorderPanel = isRecorder
      ? '<div class="atk-recorder" id="atk-recorder">' +
          '<p class="itk-muted">Your browser will ask for microphone permission when you press Start. The take is processed in this tab and is never uploaded or stored.</p>' +
          '<div class="itk-actions"><button class="btn btn-lg" type="button" id="atk-rec">Start recording</button><button class="btn secondary" type="button" id="atk-rec-stop" hidden>Stop</button></div>' +
          '<div class="atk-meter" aria-hidden="true"><span id="atk-meter-fill"></span></div>' +
          '<div class="atk-timer" id="atk-timer">0:00.0</div>' +
        "</div>"
      : "";
    const micPanel = isMicCheck
      ? '<div class="atk-recorder" id="atk-mic">' +
          '<p class="itk-muted">Press Start test and allow microphone access. This page only reads your live input level - no recording is made, saved or uploaded.</p>' +
          '<div class="itk-actions"><button class="btn btn-lg" type="button" id="atk-mic-start">Start test</button><button class="btn secondary" type="button" id="atk-mic-stop" hidden>Stop test</button></div>' +
          '<div class="atk-meter" aria-hidden="true"><span id="atk-meter-fill"></span></div>' +
          '<div class="atk-timer" id="atk-timer">Not started</div>' +
        "</div>"
      : "";
    const metroPanel = isMetronome
      ? '<div class="atk-recorder" id="atk-metro-panel">' +
          '<p class="itk-muted">The click track is synthesised in your browser. Start it, then change the tempo or beats per bar - the next beat picks up the new settings.</p>' +
          '<div class="atk-actions-row"><div class="itk-actions"><button class="btn btn-lg" type="button" id="atk-metro">Start metronome</button><button class="btn secondary" type="button" id="atk-metro-stop" hidden>Stop</button></div>' +
          '<div class="atk-beat" id="atk-beat" aria-live="polite">Ready</div></div>' +
        "</div>"
      : "";

    const emptyResults = isMicCheck
      ? '<div class="itk-empty"><strong>No recording is made</strong><span>The meter reads live input only. Stopping releases the microphone immediately.</span></div>'
      : isMetronome
        ? '<div class="itk-empty"><strong>Live click track</strong><span>Audio is synthesised in real time. Nothing is downloaded or stored.</span></div>'
        : '<div class="itk-empty"><strong>No results yet</strong><span>Bench creates real output only.</span></div>';

    const addSection = tool.requiresFile === false
      ? (isRecorder ? "" : "")
      : '<h2><span class="step-no">1</span>Add ' + (multi ? "files" : "a file") + "</h2>" + drop + '<div id="atk-files" class="itk-files" aria-live="polite"></div>';

    app.innerHTML =
      '<section class="tool-head itk-head tool-head--compact">' +
        '<div class="tool-head-top">' +
          '<span class="eyebrow">Bench Audio Toolkit' + (tool.status === "implemented" ? "" : " · " + statusBadge(tool.status)) + "</span>" +
          '<div class="itk-meta">' + (tool.inputs || []).slice(0, 5).map(function (f) { return '<span class="itk-chip">' + esc(f) + "</span>"; }).join("") +
            '<span class="itk-chip">' + (tool.engine === "ffmpeg" ? "FFmpeg engine" : tool.engine === "media-recorder" ? "Microphone" : "Web Audio") + "</span>" +
            '<span class="itk-chip">' + formatBytes(LIMITS.maxFileBytes) + " / file</span></div>" +
        "</div>" +
        "<h1><span class=\"tool-head-icon\" data-icon=\"" + esc(iconName(tool)) + "\" aria-hidden=\"true\">" + iconSvg(tool) + "</span>" + esc(tool.name) + "</h1>" +
        "<p>" + esc(tool.summary) + " <strong>Nothing is uploaded.</strong></p>" +
      "</section>" +
      limitation +
      '<section class="itk" id="atk">' +
        '<div class="itk-grid">' +
          '<div class="itk-panel itk-controls">' +
            addSection +
            recorderPanel +
            micPanel +
            metroPanel +
            (optionList.length || tool.requiresFile !== false ? '<h2><span class="step-no">' + (tool.requiresFile === false ? "1" : "2") + '</span>Settings</h2>' : "") +
            '<form id="atk-form" class="itk-options" novalidate>' + options + "</form>" +
            (isLiveAudio ? "" : '<div class="itk-actions"><button class="btn btn-lg" id="atk-run" type="button">' + esc(tool.action || "Process") + '</button><button class="btn secondary" id="atk-reset" type="button">Reset</button></div>') +
            '<div class="itk-progress" id="atk-progress" aria-live="polite"><div class="itk-bar" role="progressbar" aria-label="Processing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="atk-bar-fill"></span></div><p id="atk-status">Ready. Processing happens locally in this tab.</p></div>' +
          "</div>" +
          '<div class="itk-panel itk-output">' +
            '<h2><span class="step-no">' + (isLiveAudio && !isRecorder ? "2" : (tool.requiresFile === false ? "2" : "3")) + '</span>' + (isLiveAudio && !isRecorder ? "Notes" : "Results") + "</h2>" +
            previewHtml() +
            '<div id="atk-results" class="itk-results" aria-live="polite">' + emptyResults + "</div>" +
          "</div>" +
        "</div>" +
      "</section>" + toolQuickAnswer(tool) + seoHtml(tool);

    const state = { tool: tool, files: [], urls: [], running: false };
    active = state;
    const dropEl = document.getElementById("atk-drop");
    const fileEl = document.getElementById("atk-file");
    const filesEl = document.getElementById("atk-files");
    const formEl = document.getElementById("atk-form");
    const runEl = document.getElementById("atk-run");
    const resetEl = document.getElementById("atk-reset");
    const statusEl = document.getElementById("atk-status");
    const barEl = document.getElementById("atk-bar-fill");
    const resultsEl = document.getElementById("atk-results");
    const previewEl = document.getElementById("atk-preview");
    const waveEl = document.getElementById("atk-wave");
    const playEl = document.getElementById("atk-play");
    const stopEl = document.getElementById("atk-stop");
    const timeEl = document.getElementById("atk-time");

    function progress(pct, msg) {
      const value = clamp(pct, 0, 100);
      if (barEl) {
        barEl.style.width = value + "%";
        if (barEl.parentElement) barEl.parentElement.setAttribute("aria-valuenow", String(Math.round(value)));
      }
      if (statusEl && msg) statusEl.textContent = msg;
    }
    applyVisibility(formEl);
    if (formEl) formEl.addEventListener("change", function () { applyVisibility(formEl); });
    if (formEl) formEl.addEventListener("input", function (e) {
      const out = e.target.getAttribute && e.target.getAttribute("aria-describedby");
      if (out) { const o = document.getElementById(out); if (o) o.textContent = e.target.value; }
    });

    function renderFiles() {
      if (!filesEl) return;
      filesEl.innerHTML = state.files.map(function (f, i) {
        return '<div class="itk-file"><span class="itk-file-name" title="' + esc(f.name) + '">' + esc(f.name) + "</span><span>" + formatBytes(f.size) + '</span><button type="button" class="itk-remove" data-remove="' + i + '" aria-label="Remove ' + esc(f.name) + '">&times;</button></div>';
      }).join("");
      filesEl.querySelectorAll("[data-remove]").forEach(function (b) {
        b.addEventListener("click", function () { state.files.splice(Number(b.dataset.remove), 1); renderFiles(); });
      });
    }
    function addFiles(list) {
      const max = Math.max(1, tool.maxFiles || 1);
      const incoming = Array.from(list || []);
      if (!incoming.length) return;
      if (max === 1) state.files = [incoming[0]];
      else state.files = state.files.concat(incoming).slice(0, max);
      renderFiles();
      loadPreview();
    }
    function loadPreview() {
      if (!fileEl && !state.files.length) return;
      if (!state.files.length || !previewEl) return;
      decodeAudio(state.files[0]).then(function (buffer) {
        previewEl.hidden = false;
        drawWave(waveEl, buffer);
        state.previewBuffer = buffer;
        state.waveUrl = URL.createObjectURL(state.files[0]);
      }).catch(function () { previewEl.hidden = true; });
    }
    if (fileEl) fileEl.addEventListener("change", function () { addFiles(fileEl.files); fileEl.value = ""; });
    if (dropEl) {
      dropEl.addEventListener("click", function () { if (fileEl) fileEl.click(); });
      dropEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (fileEl) fileEl.click(); } });
      ["dragover", "dragenter"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove("over"); }); });
      dropEl.addEventListener("drop", function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    }

    // Transport
    let playSource = null;
    if (playEl) playEl.addEventListener("click", function () {
      if (!state.previewBuffer) return;
      const ac = audioContext();
      if (playSource) { try { playSource.stop(); } catch (_) {} }
      playSource = ac.createBufferSource();
      playSource.buffer = state.previewBuffer;
      playSource.connect(ac.destination);
      playSource.onended = function () { if (timeEl) timeEl.textContent = formatTime(state.previewBuffer.duration); };
      playSource.start();
      const t0 = ac.currentTime;
      state.playTimer = setInterval(function () { if (timeEl) timeEl.textContent = formatTime(Math.min(state.previewBuffer.duration, ac.currentTime - t0)); }, 100);
    });
    if (stopEl) stopEl.addEventListener("click", function () {
      if (playSource) { try { playSource.stop(); } catch (_) {} }
      if (state.playTimer) clearInterval(state.playTimer);
    });

    // Copy buttons for text outputs (delegated)
    if (resultsEl) resultsEl.addEventListener("click", function (e) {
      const btn = e.target.closest && e.target.closest("[data-copy]");
      if (btn) {
        const ta = btn.parentElement.querySelector("textarea");
        if (ta && navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1200); });
      }
    });

    async function run() {
      if (state.running) return;
      if (tool.requiresFile !== false && !state.files.length) { progress(0, "Add at least one file first."); return; }
      const processor = PROCESSORS[tool.handler];
      if (!processor) { progress(0, "This tool has no processor in this build."); return; }
      state.running = true; runEl.disabled = true;
      revokeAll(state.urls);
      resultsEl.innerHTML = '<div class="itk-empty"><strong>Working…</strong><span>Processing locally.</span></div>';
      const values = readValues(formEl);
      try {
        const res = await processor({ files: state.files, values: values, tool: tool, onProgress: progress, canvas: document.createElement("canvas") });
        const outputs = (res.outputs || []).map(function (o) {
          if (o.kind !== "text" && o.blob) { const u = URL.createObjectURL(o.blob); state.urls.push(u); o.url = u; }
          return o;
        });
        renderResults(resultsEl, outputs, res.errors || [], state.urls);
        progress(100, "Done. " + outputs.length + " output" + (outputs.length === 1 ? "" : "s") + ((res.errors || []).length ? ", " + res.errors.length + " error(s)" : "") + ".");
      } catch (err) {
        renderResults(resultsEl, [], [{ name: tool.name, message: err && err.message ? err.message : String(err) }], state.urls);
        progress(0, "Failed: " + (err && err.message ? err.message : String(err)));
      } finally {
        runEl.disabled = false; state.running = false;
      }
    }
    if (runEl) runEl.addEventListener("click", run);
    if (resetEl) resetEl.addEventListener("click", function () {
      state.files = []; renderFiles(); revokeAll(state.urls);
      if (previewEl) previewEl.hidden = true;
      resultsEl.innerHTML = '<div class="itk-empty"><strong>No results yet</strong><span>Bench creates real output only.</span></div>';
      progress(0, "Ready. Processing happens locally in this tab.");
    });
    if (formEl && runEl) formEl.addEventListener("submit", function (e) { e.preventDefault(); run(); });

    if (isRecorder) mountRecorder(state, tool, progress, resultsEl);
    if (isMicCheck) mountMicCheck(state, progress);
    if (isMetronome) mountMetronome(state, progress);
  }

  /* --- Microphone recorder + live meter wiring. */
  function mountRecorder(state, tool, progress, resultsEl) {
    const recBtn = document.getElementById("atk-rec");
    const stopBtn = document.getElementById("atk-rec-stop");
    const meter = document.getElementById("atk-meter-fill");
    const timer = document.getElementById("atk-timer");
    if (!recBtn) return;

    if (!canRecordAudio()) {
      progress(0, "This browser does not support microphone recording (MediaRecorder).");
      recBtn.disabled = true;
      return;
    }

    let stream = null, recorder = null, chunks = [], startedAt = 0, tick = null, rafStream = null, analyser = null, sourceNode = null;
    function stopTracks() {
      if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      stream = null;
      if (tick) { clearInterval(tick); tick = null; }
      if (analyser) { analyser = null; }
      if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
      if (meter) meter.style.width = "0%";
    }

    state.cleanup = stopTracks;

    recBtn.addEventListener("click", async function () {
      try {
        progress(5, "Requesting microphone permission…");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ac = audioContext();
        sourceNode = ac.createMediaStreamSource(stream);
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        tick = setInterval(function () {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i] - 128) / 128; if (v > peak) peak = v; }
          if (meter) meter.style.width = Math.round(peak * 100) + "%";
          if (timer) timer.textContent = ((Date.now() - startedAt) / 1000).toFixed(1) + "s";
        }, 80);

        chunks = [];
        const mime = pickRecorderMime();
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = async function () {
          stopTracks();
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          state.recordingBlob = blob;
          const takeName = "recording-" + new Date().toISOString().replace(/[:.]/g, "-") + (blob.type.indexOf("wav") >= 0 ? ".wav" : ".webm");
          const file = new File([blob], takeName, { type: blob.type });
          state.files = [file];
          if (tool.handler === "record") {
            // allow export / trim via the normal pipeline
            const v = readValues(document.getElementById("atk-form"));
            const out = [];
            if (v.format === "wav" || !v.format) {
              // MediaRecorder produces WebM/Opus in most browsers. Never rename
              // those bytes ".wav" - decode the take and write a real PCM WAV.
              try {
                const buffer = await decodeAudio(file);
                const wavBlob = encodeWav(bufferToChannels(buffer), buffer.sampleRate, { bits: 16 });
                out.push({ name: takeName.replace(/\.[a-z0-9]+$/i, ".wav"), blob: wavBlob, size: wavBlob.size, kind: "audio", note: "Recorded take, " + formatBytes(wavBlob.size) });
              } catch (e) {
                out.push({ name: takeName, blob: blob, size: blob.size, kind: "audio", note: "Recorded (" + (blob.type || "audio") + "); WAV conversion failed: " + e.message });
              }
            } else {
              try {
                const wav = await fileToWavBytes(file);
                const ext = extForFormat(v.format);
                const on = "out." + ext;
                const args = ["-hide_banner", "-y", "-i", "in.wav"].concat(ffmpegCodecArgs(v.format, "192")).concat([on]);
                const bytes = await ffRun(null, "in.wav", wav.bytes, args, on);
                out.push({ name: takeName.replace(/\.[a-z0-9]+$/i, "." + ext), blob: new Blob([bytes], { type: mimeForFormat(v.format) }), size: bytes.length, kind: "audio", note: "Recorded take, " + formatBytes(bytes.length) });
              } catch (e) { out.push({ name: takeName, blob: blob, size: blob.size, kind: "audio", note: "Recorded (conversion failed: " + e.message + ")" }); }
            }
            const urls = out.map(function (o) { const u = URL.createObjectURL(o.blob); o.url = u; state.urls.push(u); return o; });
            renderResults(resultsEl, urls, [], state.urls);
            progress(100, "Recorded " + timer.textContent + ".");
          } else {
            progress(100, "Recording captured. Review the level; the meter confirmed your microphone works.");
          }
        };
        startedAt = Date.now();
        recorder.start();
        recBtn.hidden = true; if (stopBtn) stopBtn.hidden = false;
        progress(20, "Recording…");
      } catch (err) {
        stopTracks();
        progress(0, "Microphone error: " + (err && err.message ? err.message : String(err)) + ". Check your browser's permission settings.");
      }
    });

    if (stopBtn) stopBtn.addEventListener("click", function () {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recBtn.hidden = false; stopBtn.hidden = true;
    });
  }

  /* --- Live microphone check: meter only, no recording is ever created. */
  function mountMicCheck(state, progress) {
    const startBtn = document.getElementById("atk-mic-start");
    const stopBtn = document.getElementById("atk-mic-stop");
    const meter = document.getElementById("atk-meter-fill");
    const timer = document.getElementById("atk-timer");
    if (!startBtn) return;

    let stream = null, tick = null, sourceNode = null, startedAt = 0, peak = 0;

    function release() {
      if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      stream = null;
      if (tick) { clearInterval(tick); tick = null; }
      if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
      if (meter) meter.style.width = "0%";
    }
    state.cleanup = release;

    startBtn.addEventListener("click", async function () {
      try {
        progress(5, "Requesting microphone permission…");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ac = audioContext();
        sourceNode = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        peak = 0;
        startedAt = Date.now();
        tick = setInterval(function () {
          analyser.getByteTimeDomainData(data);
          let level = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > level) level = v;
          }
          if (level > peak) peak = level;
          if (meter) meter.style.width = Math.round(level * 100) + "%";
          if (timer) timer.textContent = ((Date.now() - startedAt) / 1000).toFixed(1) + "s";
        }, 80);
        startBtn.hidden = true;
        if (stopBtn) stopBtn.hidden = false;
        progress(20, "Listening. Speak or tap the microphone and watch the meter.");
      } catch (err) {
        release();
        progress(0, "Microphone error: " + (err && err.message ? err.message : String(err)) + ". Check your browser's permission settings.");
      }
    });

    if (stopBtn) stopBtn.addEventListener("click", function () {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      release();
      startBtn.hidden = false;
      stopBtn.hidden = true;
      if (timer) timer.textContent = "Stopped after " + elapsed + "s";
      if (peak > 0.02) progress(100, "Microphone works. Peak input was " + Math.round(peak * 100) + "% of full scale.");
      else progress(0, "No input detected. Check that the right microphone is selected and not muted.");
    });
  }

  /* --- Live metronome: Web Audio lookahead scheduler (no file output). */
  function mountMetronome(state, progress) {
    const startBtn = document.getElementById("atk-metro");
    const stopBtn = document.getElementById("atk-metro-stop");
    const beatEl = document.getElementById("atk-beat");
    if (!startBtn) return;

    let timer = null, running = false, nextNote = 0, beatIndex = 0;

    function clickAt(time, accent) {
      const ac = audioContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(accent ? 1760 : 1100, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.34 : 0.2, time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(time);
      osc.stop(time + 0.07);
    }

    function schedule() {
      const ac = audioContext();
      const v = readValues(document.getElementById("atk-form"));
      const bpm = clamp(num(v.bpm, 120), 30, 300);
      const beats = Math.round(clamp(num(v.beats, 4), 1, 12));
      const interval = 60 / bpm;
      while (nextNote < ac.currentTime + 0.15) {
        const accent = beatIndex % beats === 0;
        clickAt(nextNote, accent);
        const shown = (beatIndex % beats) + 1;
        const delay = Math.max(0, (nextNote - ac.currentTime) * 1000);
        setTimeout(function () {
          if (running && beatEl) beatEl.textContent = "Beat " + shown + " of " + beats;
        }, delay);
        nextNote += interval;
        beatIndex++;
      }
    }

    function stop() {
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      startBtn.hidden = false;
      if (stopBtn) stopBtn.hidden = true;
      if (beatEl) beatEl.textContent = "Stopped";
      progress(0, "Metronome stopped.");
    }
    state.cleanup = stop;

    startBtn.addEventListener("click", function () {
      if (running) return;
      const ac = audioContext();
      if (ac.state === "suspended" && ac.resume) ac.resume();
      running = true;
      beatIndex = 0;
      nextNote = ac.currentTime + 0.1;
      schedule();
      timer = setInterval(schedule, 25);
      startBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = false;
      progress(20, "Metronome running. Tempo changes apply on the next beat.");
    });

    if (stopBtn) stopBtn.addEventListener("click", stop);
  }

  function pickRecorderMime() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    for (let i = 0; i < candidates.length; i++) if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    return "";
  }

  /* ==================================================== hub + studio mount */

  function hubInfoHtml(config) {
    const limits = config.LIMITS || {};
    return '<section class="toolbox itk-notice-box">' +
      '<h2>Status and limits</h2><p>Implemented tools are covered by automated tests and produce real files. Experimental tools run real signal processing but have documented quality caveats; their results should be checked before important use. Limits: ' + esc(limits.maxFileBytes / (1024 * 1024)) + ' MB per file, ' + esc(limits.maxDurationSec / 60) + ' minutes per file, ' + esc(limits.maxFiles) + ' files per batch.</p>' +
      '<h2>How processing works</h2><p>Simple editing, analysis, recording and WAV export use the Web Audio API directly in the tab. Format conversion and complex filters (loudness normalisation, denoise, speed, EQ) use a WebAssembly build of FFmpeg that runs on your device. Either way, the audio bytes never leave your machine and Bench keeps no copy.</p>' +
      '<h2>Licences and source</h2><p>The FFmpeg engine shipped here is the official <code>@ffmpeg/core</code> build, licensed under the <strong>GNU General Public License v2.0 or later</strong>. It is served unmodified from this site at <code>/vendor/ffmpeg/</code> and is never loaded from a third-party CDN. The JavaScript wrapper (<code>@ffmpeg/ffmpeg</code>) is MIT licensed.</p>' +
      '<p>Full attributions, exact version numbers and a written offer to supply the corresponding source code are published in <a href="/vendor/ffmpeg/NOTICE.txt">/vendor/ffmpeg/NOTICE.txt</a>. That notice names the upstream FFmpeg project and the ffmpeg.wasm packaging project, including their source repositories.</p>' +
      '<p class="itk-muted">Looking for the older file utilities? <a href="/">Browse the full Bench directory</a>.</p>' +
      '</section>';
  }

  function mountHub() {
    if (typeof document === "undefined") return;
    const app = document.getElementById("app");
    if (!app) return;
    unmount();
    const config = cfg();
    // Landing directly on /audio/ keeps the richer server-rendered hub (status
    // and limits, processing notes and GPL source offer).
    // Only rebuild the hub after client-side navigation, where #app is empty.
    if (app.querySelector(".itk-notice-box")) { setActiveNav(); return; }
    const PUBLIC = (config.TOOLS || []).filter(function (t) { return t.status === "implemented" || t.status === "experimental"; });
    const cats = (config.CATEGORIES || []).map(function (cat) {
      const tools = PUBLIC.filter(function (t) { return t.category === cat.id; });
      if (!tools.length) return "";
      return '<section class="itk-category"><div class="itk-category-head"><h2>' + esc(cat.name) + "</h2><p>" + esc(cat.blurb) + "</p></div>" +
        '<div class="itk-tool-grid">' + tools.map(function (t) {
          return '<a class="itk-tool-card" href="/audio/' + esc(t.slug) + '/"><strong><span class="itk-card-icon" aria-hidden="true">' + iconSvg(t) + "</span>" + esc(t.name) + "</strong><span>" + esc(t.summary) + "</span>" + statusBadge(t.status) + "</a>";
        }).join("") + "</div></section>";
    }).join("");
    const impl = PUBLIC.filter(function (t) { return t.status === "implemented"; }).length;
    const exp = PUBLIC.filter(function (t) { return t.status === "experimental"; }).length;
    app.innerHTML = '<section class="tool-head itk-head atk-head"><span class="eyebrow">Bench Audio Toolkit</span><h1>Private audio tools that run in your browser</h1>' +
      "<p>Convert, compress, trim, join, clean, record, analyse and inspect audio without uploading it. Every tool has a real client-side handler and a tested download path.</p>" +
      '<div class="itk-meta"><span class="itk-chip">' + impl + ' implemented</span><span class="itk-chip">' + exp + ' experimental</span><span class="itk-chip">No account</span><span class="itk-chip">No uploads</span></div></section>' +
      hubQuickAnswerHtml(PUBLIC) +
      '<section class="itk-categories">' + cats + "</section>" + hubInfoHtml(config);
    setActiveNav();
  }

  function mountStudio() {
    if (typeof document === "undefined") return;
    const app = document.getElementById("app");
    if (!app) return;
    unmount();
    app.innerHTML = '<section class="tool-head itk-head"><span class="eyebrow">Bench Audio Toolkit</span><h1>Audio Studio</h1>' +
      "<p>Load one audio file, then apply several operations in order and export the result. Everything runs locally.</p></section>" +
      studioQuickAnswerHtml() +
      '<section class="itk-grid"><div class="itk-panel"><h2>1. Add audio</h2><div id="atk-drop" class="drop" role="button" tabindex="0"><strong>Drop an audio file</strong><span>or click to browse. Stays on this device.</span><input id="atk-file" type="file" accept="' + AUDIO_ACCEPT + '" hidden></div>' +
      '<div class="itk-actions"><button class="btn btn-lg" id="atk-studio-run" type="button">Run chain</button></div>' +
      '<div class="itk-progress"><div class="itk-bar"><span id="atk-bar-fill"></span></div><p id="atk-status">Ready.</p></div></div>' +
      '<div class="itk-panel"><h2>2. Results</h2><div id="atk-results" class="itk-results"><div class="itk-empty"><strong>No results yet</strong><span>Add a file and run the chain.</span></div></div></div></section>';

    let file = null;
    const dropEl = document.getElementById("atk-drop");
    const fileEl = document.getElementById("atk-file");
    const runEl = document.getElementById("atk-studio-run");
    const statusEl = document.getElementById("atk-status");
    const barEl = document.getElementById("atk-bar-fill");
    const resultsEl = document.getElementById("atk-results");
    const urls = [];
    active = { urls: urls, cleanup: function () { revokeAll(urls); } };

    function pick() { if (fileEl) fileEl.click(); }
    if (dropEl) { dropEl.addEventListener("click", pick); dropEl.addEventListener("dragover", function (e) { e.preventDefault(); }); dropEl.addEventListener("drop", function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0]) { file = e.dataTransfer.files[0]; if (statusEl) statusEl.textContent = "Loaded " + file.name; } }); }
    if (fileEl) fileEl.addEventListener("change", function () { if (fileEl.files[0]) { file = fileEl.files[0]; if (statusEl) statusEl.textContent = "Loaded " + file.name; } fileEl.value = ""; });
    if (runEl) runEl.addEventListener("click", async function () {
      if (!file) { statusEl.textContent = "Add a file first."; return; }
      revokeAll(urls);
      runEl.disabled = true;
      try {
        // A fixed, real chain: loudness-normalise + fade + MP3 encode.
        const wav = await fileToWavBytes(file, function (p, m) { barEl.style.width = p + "%"; if (m) statusEl.textContent = m; });
        barEl.style.width = "60%"; statusEl.textContent = "Normalising and encoding";
        const args = ["-hide_banner", "-y", "-i", "in.wav", "-af", "loudnorm=I=-16:TP=-1:LRA=11,afade=t=in:st=0:d=1", "-c:a", "libmp3lame", "-b:a", "192k", "out.mp3"];
        const bytes = await ffRun(null, "in.wav", wav.bytes, args, "out.mp3");
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob); urls.push(url);
        renderResults(resultsEl, [{ name: safeName(file.name, "") + "-studio.mp3", blob: blob, size: blob.size, kind: "audio", note: "Normalised to -16 LUFS, fade-in, MP3 192 kbps.", url: url }], [], urls);
        barEl.style.width = "100%"; statusEl.textContent = "Done.";
      } catch (err) {
        renderResults(resultsEl, [], [{ name: file.name, message: err.message }], urls);
        statusEl.textContent = "Failed: " + err.message;
      } finally { runEl.disabled = false; }
    });
  }

  function mountNotFound(slug) {
    const app = document.getElementById("app");
    if (app) app.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Audio Toolkit</span><h1>Audio tool not found</h1><p>No audio tool matches "' + esc(slug) + '".</p></section><p><a class="btn" href="/audio/">Browse all audio tools</a></p>';
  }

  function setActiveNav() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("#primary-nav a").forEach(function (a) {
      const href = a.getAttribute("href");
      if (href === "/audio/" && location.pathname.indexOf("/audio") === 0) a.classList.add("active");
    });
  }

  return Object.assign({ core: core, LIMITS: LIMITS, PROCESSORS: PROCESSORS, mountTool: mountTool, mountHub: mountHub, mountStudio: mountStudio, mountNotFound: mountNotFound, unmount: unmount, cleanup: unmount }, core);
});
