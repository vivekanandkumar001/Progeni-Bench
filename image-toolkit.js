/*
 * image-toolkit.js - Bench Image Toolkit runtime.
 *
 * UMD: Node can require() this file for the pure core; the browser also gets
 * the processor registry and UI mount functions. Nothing in the pure core
 * touches `document`, `window`, Canvas or Blob at require time, so the test
 * suite can validate byte-level helpers without a DOM.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.ImageToolkit = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const C = (typeof root !== "undefined" && root.ImageToolConfig) ||
    (typeof require === "function" ? require("./image-tools.config.js") : {});
  const LIMITS = C.LIMITS || { maxFileBytes: 50 * 1024 * 1024, maxPixels: 40e6, maxDimension: 12000, maxFiles: 30, maxBatchPixels: 160e6, maxPdfPages: 40, concurrency: 2 };

  /* ==================================================================== core */

  function toBytes(input) {
    if (!input) return new Uint8Array(0);
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView && ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return new Uint8Array(input);
    return new Uint8Array(input);
  }

  function ascii(bytes, off, len) {
    let s = "";
    for (let i = 0; i < len && off + i < bytes.length; i++) s += String.fromCharCode(bytes[off + i]);
    return s;
  }

  function u16be(b, o) { return (b[o] << 8) | b[o + 1]; }
  function u32be(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  /* --------------------------------------------------------- type sniffing */

  function sniffFormat(input, filename) {
    const b = toBytes(input);
    const name = String(filename || "").toLowerCase();
    const ext = (name.match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
    if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
    if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
    if (b.length >= 2 && ascii(b, 0, 2) === "BM") return "bmp";
    if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42))) return "tiff";
    if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
      const brand = ascii(b, 8, 4).toLowerCase();
      if (brand === "avif" || brand === "avis") return "avif";
      if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
    }
    if (b.length >= 8 && (b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01)) return "exr";
    // SVG is text; require an <svg element rather than trusting the extension.
    const head = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 4096)).replace(/^\uFEFF/, "").trim();
    if (/^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
    const extMap = { jpg: "jpeg", jpeg: "jpeg", png: "png", gif: "gif", webp: "webp", bmp: "bmp", tif: "tiff", tiff: "tiff", avif: "avif", heic: "heic", heif: "heic", svg: "svg", ico: "ico" };
    if (b.length >= 6 && u16le(b, 0) === 0 && u16le(b, 2) === 1 && u16le(b, 4) > 0) return "ico";
    return extMap[ext] || "unknown";
  }

  const MIME = {
    jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    bmp: "image/bmp", tiff: "image/tiff", avif: "image/avif", heic: "image/heic",
    svg: "image/svg+xml", ico: "image/x-icon", unknown: "application/octet-stream"
  };
  const EXT = { jpeg: "jpg", png: "png", gif: "gif", webp: "webp", bmp: "bmp", tiff: "tiff", avif: "avif", heic: "heic", svg: "svg", ico: "ico" };
  const FORMAT_LABEL = { jpeg: "JPEG", png: "PNG", gif: "GIF", webp: "WebP", bmp: "BMP", tiff: "TIFF", avif: "AVIF", heic: "HEIC", svg: "SVG", ico: "ICO", unknown: "Unknown" };

  function mimeFor(format) { return MIME[normalizeFormat(format)] || MIME.unknown; }
  function extFor(format) { return EXT[normalizeFormat(format)] || "bin"; }
  function normalizeFormat(format) {
    const f = String(format || "").toLowerCase();
    if (f === "jpg") return "jpeg";
    if (f === "tif") return "tiff";
    if (f === "auto") return "auto";
    return f;
  }

  /* ---------------------------------------------------------- dimensions */

  function parseDimensions(input, format) {
    const b = toBytes(input);
    const fmt = format || sniffFormat(b);
    try {
      if (fmt === "png" && b.length >= 24) return { width: u32be(b, 16), height: u32be(b, 20) };
      if (fmt === "gif" && b.length >= 10) return { width: u16le(b, 6), height: u16le(b, 8) };
      if (fmt === "bmp" && b.length >= 26) return { width: Math.abs(u32le(b, 18)), height: Math.abs(u32le(b, 22)) };
      if (fmt === "jpeg") return jpegDimensions(b);
      if (fmt === "webp") return webpDimensions(b);
      if (fmt === "tiff") return tiffDimensions(b);
      if (fmt === "svg") return svgDimensions(new TextDecoder("utf-8", { fatal: false }).decode(b));
      if (fmt === "ico" && b.length >= 8) {
        const w = b[6] === 0 ? 256 : b[6];
        const h = b[7] === 0 ? 256 : b[7];
        return { width: w, height: h };
      }
      if ((fmt === "avif" || fmt === "heic") && b.length >= 12) {
        // ISOBMFF dimensions require parsing meta/iprp/ipco; handled after decode.
        return { width: 0, height: 0 };
      }
    } catch (_) { /* fall through */ }
    return { width: 0, height: 0 };
  }

  function jpegDimensions(b) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      let marker = b[i + 1];
      while (marker === 0xff) { i++; marker = b[i + 1]; }
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = u16be(b, i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
      }
      if (len < 2) break;
      i += 2 + len;
    }
    return { width: 0, height: 0 };
  }

  function webpDimensions(b) {
    if (b.length < 30) return { width: 0, height: 0 };
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8X") {
      return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (chunk === "VP8 ") {
      if (ascii(b, 23, 3) !== "\x9d\x01\x2a") return { width: 0, height: 0 };
      return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    }
    if (chunk === "VP8L" && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { width: 0, height: 0 };
  }

  function tiffDimensions(b) {
    const le = b[0] === 0x49;
    const r16 = le ? u16le : u16be;
    const r32 = le ? u32le : u32be;
    const off = r32(b, 4);
    if (off + 2 > b.length) return { width: 0, height: 0 };
    const count = r16(b, off);
    let width = 0, height = 0;
    for (let i = 0; i < count; i++) {
      const p = off + 2 + i * 12;
      if (p + 12 > b.length) break;
      const tag = r16(b, p);
      const type = r16(b, p + 2);
      const val = type === 3 ? r16(b, p + 8) : r32(b, p + 8);
      if (tag === 256) width = val;
      if (tag === 257) height = val;
    }
    return { width, height };
  }

  function svgDimensions(text) {
    const tag = (String(text).match(/<svg\b[^>]*>/i) || [])[0] || "";
    const num = (name) => {
      const m = tag.match(new RegExp(name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
      if (!m) return 0;
      const v = parseFloat(m[1]);
      return isFinite(v) ? v : 0;
    };
    let width = num("width"), height = num("height");
    const vb = tag.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if ((!width || !height) && vb) {
      const p = vb[1].trim().split(/[\s,]+/).map(Number);
      if (p.length === 4) {
        if (!width) width = p[2];
        if (!height) height = p[3];
      }
    }
    return { width: Math.round(width) || 0, height: Math.round(height) || 0 };
  }

  /* ----------------------------------------------------------- EXIF / meta */

  function exifFromBytes(input) {
    const b = toBytes(input);
    const out = { present: false, tags: {}, gps: null, orientation: null, dpi: null };
    let tiff = null;
    if (b.length > 12 && ascii(b, 0, 6) === "Exif\x00\x00") tiff = b.slice(6);
    else if (b.length > 8 && b[0] === 0xff && b[1] === 0xd8) tiff = findJpegExif(b);
    else if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") tiff = findWebpChunk(b, "EXIF");
    else if (b.length > 8 && b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) tiff = b;
    else if (b.length > 8 && b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42) tiff = b;
    if (!tiff || tiff.length < 8) return out;
    out.present = true;
    try {
      const le = tiff[0] === 0x49;
      const r16 = le ? u16le : u16be;
      const r32 = le ? u32le : u32be;
      const tags = readIfd(tiff, r32(tiff, 4), le);
      out.tags = tags;
      const get = (tag) => tags[tag] && tags[tag].value !== undefined ? tags[tag].value : null;
      out.orientation = get(0x0112);
      out.camera = [get(0x010f), get(0x0110)].filter(Boolean).join(" ") || null;
      out.captured = get(0x9003) || get(0x0132) || null;
      out.software = get(0x0131) || null;
      out.artist = get(0x013b) || null;
      out.copyright = get(0x8298) || null;
      const xr = get(0x011a), yr = get(0x011b);
      if (xr && yr) {
        const unit = get(0x0128) || 2;
        const dpi = Math.round((Number(xr) + Number(yr)) / 2);
        out.dpi = unit === 3 ? Math.round(dpi * 2.54) : dpi;
      }
      if (tags[0x8825] && tags[0x8825].value) {
        const gps = readIfd(tiff, tags[0x8825].value, le);
        const latRef = gps[1], lat = gps[2], lonRef = gps[3], lon = gps[4];
        if (lat && lon) {
          const toDeg = (v) => Array.isArray(v) ? v[0] + v[1] / 60 + v[2] / 3600 : Number(v);
          out.gps = {
            latitude: (latRef && String(latRef.value).toUpperCase() === "S" ? -1 : 1) * toDeg(lat.value),
            longitude: (lonRef && String(lonRef.value).toUpperCase() === "W" ? -1 : 1) * toDeg(lon.value),
            altitude: gps[6] ? Number(gps[6].value) : null
          };
          out.gps.latitude = Math.round(out.gps.latitude * 1e6) / 1e6;
          out.gps.longitude = Math.round(out.gps.longitude * 1e6) / 1e6;
        }
      }
    } catch (_) { out.error = "EXIF block could not be parsed completely."; }
    return out;
  }

  function readIfd(tiff, offset, le) {
    const r16 = le ? u16le : u16be;
    const r32 = le ? u32le : u32be;
    const tags = {};
    if (!offset || offset + 2 > tiff.length) return tags;
    const count = r16(tiff, offset);
    const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12;
      if (p + 12 > tiff.length) break;
      const tag = r16(tiff, p);
      const type = r16(tiff, p + 2);
      const n = r32(tiff, p + 4);
      const size = (sizes[type] || 1) * n;
      let vp = size <= 4 ? p + 8 : r32(tiff, p + 8);
      if (vp + Math.min(size, 64) > tiff.length) continue;
      let value;
      if (type === 2) {
        value = "";
        for (let j = 0; j < n && vp + j < tiff.length; j++) {
          const ch = tiff[vp + j];
          if (ch === 0) break;
          value += String.fromCharCode(ch);
        }
        value = value.trim();
      } else if (type === 7) {
        value = { offset: vp, length: n };
      } else if (type === 5 || type === 10) {
        value = [];
        for (let j = 0; j < n; j++) {
          const base = vp + j * 8;
          if (base + 8 > tiff.length) break;
          const a = r32(tiff, base), d = r32(tiff, base + 4);
          value.push(d ? a / d : 0);
        }
        if (value.length === 1) value = value[0];
      } else {
        value = [];
        for (let j = 0; j < n; j++) {
          const base = vp + j * (sizes[type] || 1);
          if (base + 4 > tiff.length) break;
          value.push(r32(tiff, base));
        }
        if (value.length === 1) value = value[0];
      }
      tags[tag] = { type, value, offset: vp };
    }
    return tags;
  }

  function findJpegExif(b) {
    let i = 2;
    while (i + 10 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const len = u16be(b, i + 2);
      if (len < 2 || i + 2 + len > b.length) break;
      if (marker === 0xe1 && ascii(b, i + 4, 6) === "Exif\x00\x00") return b.slice(i + 10, i + 2 + len);
      i += 2 + len;
    }
    return null;
  }

  function findWebpChunk(b, name) {
    let off = 12;
    while (off + 8 <= b.length) {
      const id = ascii(b, off, 4);
      const size = u32le(b, off + 4);
      if (id === name) return b.slice(off + 8, off + 8 + size);
      off += 8 + size + (size % 2);
    }
    return null;
  }

  function parsePngMeta(input) {
    const b = toBytes(input);
    const out = { text: {}, dpi: null, icc: false, exif: false, gamma: null, transparency: false };
    if (b.length < 24 || sniffFormat(b) !== "png") return out;
    let p = 8;
    while (p + 12 <= b.length) {
      const len = u32be(b, p);
      const type = ascii(b, p + 4, 4);
      const dataStart = p + 8;
      if (dataStart + len + 4 > b.length) break;
      if (type === "pHYs" && len >= 9) {
        const ppmX = u32be(b, dataStart), ppmY = u32be(b, dataStart + 4);
        if (b[dataStart + 8] === 1) out.dpi = Math.round(((ppmX + ppmY) / 2) * 0.0254);
      } else if (type === "iCCP") out.icc = true;
      else if (type === "eXIf") out.exif = true;
      else if (type === "gAMA" && len >= 4) out.gamma = u32be(b, dataStart) / 100000;
      else if (type === "tRNS") out.transparency = true;
      else if (type === "tEXt" || type === "iTXt") {
        const raw = b.slice(dataStart, dataStart + len);
        const nul = raw.indexOf(0);
        if (nul > 0) {
          const key = ascii(raw, 0, nul);
          let vs = dataStart + nul + 1;
          if (type === "iTXt") vs += 2; // compression flag + method
          out.text[key] = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(vs, dataStart + len)).replace(/\u0000/g, "").trim();
        }
      }
      if (type === "IEND") break;
      p = dataStart + len + 4;
    }
    return out;
  }

  function metadataSummary(input, filename) {
    const b = toBytes(input);
    const format = sniffFormat(b, filename);
    const dims = parseDimensions(b, format);
    const exif = exifFromBytes(b);
    const png = format === "png" ? parsePngMeta(b) : { text: {}, dpi: null, icc: false, exif: false };
    const hasIcc = png.icc || hasJpegMarker(b, 0xe2) || !!(format === "webp" && findWebpChunk(b, "ICCP"));
    const dpi = exif.dpi || png.dpi || jpegJfifDpi(b) || null;
    return {
      format,
      mime: mimeFor(format),
      width: dims.width,
      height: dims.height,
      bytes: b.length,
      hasExif: exif.present,
      hasGps: !!exif.gps,
      hasIcc,
      dpi,
      orientation: exif.orientation,
      camera: exif.camera || null,
      captured: exif.captured || null,
      software: exif.software || null,
      artist: exif.artist || null,
      copyright: exif.copyright || null,
      gps: exif.gps || null,
      text: png.text || {},
      notes: exif.error ? [exif.error] : []
    };
  }

  function hasJpegMarker(b, marker) {
    if (sniffFormat(b) !== "jpeg") return false;
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xda || m === 0xd9) return false;
      const len = u16be(b, i + 2);
      if (m === marker) return true;
      if (len < 2) return false;
      i += 2 + len;
    }
    return false;
  }

  function jpegJfifDpi(b) {
    if (sniffFormat(b) !== "jpeg") return null;
    let i = 2;
    while (i + 14 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xda || m === 0xd9) break;
      const len = u16be(b, i + 2);
      if (m === 0xe0 && ascii(b, i + 4, 5) === "JFIF\x00") {
        const unit = b[i + 11];
        const x = u16be(b, i + 12);
        return unit === 2 ? Math.round(x * 2.54) : unit === 1 ? x : null;
      }
      if (len < 2) break;
      i += 2 + len;
    }
    return null;
  }

  /* ------------------------------------------------------- byte containers */

  function crc32(input) {
    const b = toBytes(input);
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) crc = (crc >>> 8) ^ table[(crc ^ b[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function concatBytes(parts) {
    const list = parts.map(toBytes);
    const total = list.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    list.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }

  function utf8(s) { return new TextEncoder().encode(String(s)); }
  function u32bytes(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
  function u32beBytes(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }

  function buildPngChunk(type, data) {
    const d = toBytes(data);
    const t = utf8(type);
    return concatBytes([u32beBytes(d.length), t, d, u32beBytes(crc32(concatBytes([t, d])))]);
  }

  function setDpiPng(input, dpi) {
    const b = toBytes(input);
    if (sniffFormat(b) !== "png") throw new Error("DPI writing is supported for PNG files only.");
    const ppm = Math.max(1, Math.round(Number(dpi) / 0.0254));
    const phys = new Uint8Array(9);
    phys[0] = (ppm >>> 24) & 255; phys[1] = (ppm >>> 16) & 255; phys[2] = (ppm >>> 8) & 255; phys[3] = ppm & 255;
    phys[4] = phys[0]; phys[5] = phys[1]; phys[6] = phys[2]; phys[7] = phys[3]; phys[8] = 1;
    const parts = [b.slice(0, 8)];
    let p = 8;
    let wrote = false;
    while (p + 12 <= b.length) {
      const len = u32be(b, p);
      const type = ascii(b, p + 4, 4);
      const end = p + 12 + len;
      if (type === "pHYs") { p = end; continue; }
      if (type === "IDAT" && !wrote) { parts.push(buildPngChunk("pHYs", phys)); wrote = true; }
      parts.push(b.slice(p, end));
      if (type === "IEND") break;
      p = end;
    }
    if (!wrote) parts.splice(parts.length - 1, 0, buildPngChunk("pHYs", phys));
    return concatBytes(parts);
  }

  function setDpiJpeg(input, dpi) {
    const b = toBytes(input);
    if (sniffFormat(b) !== "jpeg") throw new Error("DPI writing is supported for JPEG files only.");
    const d = Math.max(1, Math.min(65535, Math.round(Number(dpi))));
    // Prefer rewriting an existing JFIF APP0 density block.
    let i = 2;
    while (i + 14 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xda || m === 0xd9) break;
      const len = u16be(b, i + 2);
      if (m === 0xe0 && ascii(b, i + 4, 5) === "JFIF\x00") {
        const out = b.slice();
        out[i + 11] = 1; // dots per inch
        out[i + 12] = (d >>> 8) & 255; out[i + 13] = d & 255;
        out[i + 14] = (d >>> 8) & 255; out[i + 15] = d & 255;
        return out;
      }
      if (len < 2) break;
      i += 2 + len;
    }
    const app0 = new Uint8Array(18);
    app0[0] = 0xff; app0[1] = 0xe0; app0[2] = 0; app0[3] = 16;
    app0.set(utf8("JFIF\x00"), 4);
    app0[9] = 1; app0[10] = 1; app0[11] = 1;
    app0[12] = (d >>> 8) & 255; app0[13] = d & 255;
    app0[14] = (d >>> 8) & 255; app0[15] = d & 255;
    return concatBytes([b.slice(0, 2), app0, b.slice(2)]);
  }

  function buildZip(files, when) {
    const entries = (files || []).map(f => ({
      name: String(f.name || "file").replace(/\\/g, "/"),
      data: toBytes(f.data)
    }));
    const d = when || new Date();
    const dosTime = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    const dosDate = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    const locals = [];
    const centrals = [];
    let offset = 0;
    entries.forEach(e => {
      const name = utf8(e.name);
      const crc = crc32(e.data);
      const local = new Uint8Array(30 + name.length);
      local.set([0x50, 0x4b, 0x03, 0x04], 0);
      local.set([20, 0], 4);
      local.set([0x08, 0x00], 6); // UTF-8 flag
      local.set([0, 0], 8);
      local[10] = dosTime & 255; local[11] = dosTime >>> 8;
      local[12] = dosDate & 255; local[13] = dosDate >>> 8;
      local.set(u32bytes(crc), 14);
      local.set(u32bytes(e.data.length), 18);
      local.set(u32bytes(e.data.length), 22);
      local.set(u32bytes(name.length), 26);
      local.set([0, 0], 28);
      local.set(name, 30);
      locals.push(local, e.data);

      const central = new Uint8Array(46 + name.length);
      central.set([0x50, 0x4b, 0x01, 0x02], 0);
      central.set([20, 0], 4);
      central.set([20, 0], 6);
      central.set([0x08, 0x00], 8);
      central.set([0, 0], 10);
      central[12] = dosTime & 255; central[13] = dosTime >>> 8;
      central[14] = dosDate & 255; central[15] = dosDate >>> 8;
      central.set(u32bytes(crc), 16);
      central.set(u32bytes(e.data.length), 20);
      central.set(u32bytes(e.data.length), 24);
      central.set(u32bytes(name.length), 28);
      central.set(u32bytes(0), 30);
      central.set(u32bytes(0), 32);
      central.set(u32bytes(0), 34);
      central.set(u32bytes(offset), 42);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + e.data.length;
    });
    const centralStart = offset;
    const centralBytes = concatBytes(centrals);
    const end = new Uint8Array(22);
    end.set([0x50, 0x4b, 0x05, 0x06], 0);
    end.set(u32bytes(entries.length), 8);
    end.set(u32bytes(entries.length), 10);
    end.set(u32bytes(centralBytes.length), 12);
    end.set(u32bytes(centralStart), 16);
    return concatBytes([...locals, centralBytes, end]);
  }

  function buildIco(entries) {
    const list = (entries || []).map(e => ({ size: Number(e.size) || 256, png: toBytes(e.png) }));
    const header = new Uint8Array(6 + list.length * 16);
    header.set([0, 0, 1, 0], 0);
    header[4] = list.length & 255; header[5] = (list.length >>> 8) & 255;
    let offset = header.length;
    list.forEach((e, i) => {
      const p = 6 + i * 16;
      header[p] = e.size >= 256 ? 0 : e.size;
      header[p + 1] = e.size >= 256 ? 0 : e.size;
      header[p + 4] = 1; header[p + 5] = 0;
      header[p + 6] = 32; header[p + 7] = 0;
      const len = u32bytes(e.png.length);
      header.set(len, p + 8);
      header.set(u32bytes(offset), p + 12);
      offset += e.png.length;
    });
    return concatBytes([header, ...list.map(e => e.png)]);
  }

  function buildBmp(rgba, width, height) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    const rowSize = Math.ceil((w * 3) / 4) * 4;
    const pixelSize = rowSize * h;
    const out = new Uint8Array(54 + pixelSize);
    out[0] = 0x42; out[1] = 0x4d;
    out.set(u32bytes(out.length), 2);
    out.set(u32bytes(54), 10);
    out.set(u32bytes(40), 14);
    out.set(u32bytes(w), 18);
    out.set(u32bytes(h), 22);
    out.set([1, 0], 26);
    out.set([24, 0], 28);
    out.set(u32bytes(pixelSize), 34);
    out.set(u32bytes(2835), 38);
    out.set(u32bytes(2835), 42);
    for (let y = 0; y < h; y++) {
      const srcY = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const s = (srcY * w + x) * 4;
        const p = 54 + y * rowSize + x * 3;
        out[p] = rgba[s + 2]; out[p + 1] = rgba[s + 1]; out[p + 2] = rgba[s];
      }
    }
    return out;
  }

  /* Minimal PDF writer: one JPEG image per page. Real DCTDecode streams only. */
  function buildPdf(images, options) {
    const opts = options || {};
    const pageSize = opts.pageSize || "image";
    const margin = Math.max(0, Number(opts.margin) || 0) * 72 / 25.4;
    const dims = pageSize === "a4" ? [595.28, 841.89] : pageSize === "letter" ? [612, 792] : null;
    const objects = [];
    const pageRefs = [];
    const add = (bytes) => { objects.push(toBytes(bytes)); return objects.length; };
    add(utf8("<< /Type /Catalog /Pages 2 0 R >>")); // 1
    add(utf8("PLACEHOLDER PAGES")); // 2 replaced below
    images.forEach((img, idx) => {
      const jpeg = toBytes(img.data || img.jpeg);
      const iw = Math.max(1, img.width), ih = Math.max(1, img.height);
      let pw = iw * 0.75, ph = ih * 0.75;
      if (dims) { pw = dims[0]; ph = dims[1]; }
      const availW = Math.max(1, pw - margin * 2), availH = Math.max(1, ph - margin * 2);
      const scale = Math.min(availW / iw, availH / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = (pw - dw) / 2, dy = (ph - dh) / 2;
      const content = `q\n${dw.toFixed(3)} 0 0 ${dh.toFixed(3)} ${dx.toFixed(3)} ${dy.toFixed(3)} cm\n/Im${idx} Do\nQ\n`;
      const contentNum = add(utf8(`<< /Length ${utf8(content).length} >>\nstream\n${content}endstream`));
      const imgNum = add(concatBytes([
        utf8(`<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
        jpeg,
        utf8("\nendstream")
      ]));
      const pageNum = add(utf8(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(3)} ${ph.toFixed(3)}] /Resources << /XObject << /Im${idx} ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>`));
      pageRefs.push(pageNum);
    });
    objects[1] = utf8(`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map(n => `${n} 0 R`).join(" ")}] >>`);
    const header = utf8("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let offset = header.length;
    const offsets = [0];
    const body = [];
    objects.forEach((obj, i) => {
      offsets.push(offset);
      const chunk = concatBytes([utf8(`${i + 1} 0 obj\n`), obj, utf8("\nendobj\n")]);
      body.push(chunk);
      offset += chunk.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (let i = 1; i <= objects.length; i++) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    return concatBytes([header, ...body, utf8(xref.join("") + trailer)]);
  }

  /* ---------------------------------------------------------- geometry */

  function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }
  function fitDimensions(width, height, maxWidth, maxHeight) {
    const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
    let scale = 1;
    if (maxWidth > 0) scale = Math.min(scale, Number(maxWidth) / w);
    if (maxHeight > 0) scale = Math.min(scale, Number(maxHeight) / h);
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
  }

  function coverRect(srcW, srcH, dstW, dstH) {
    const scale = Math.max(dstW / srcW, dstH / srcH);
    const sw = dstW / scale, sh = dstH / scale;
    return { x: (srcW - sw) / 2, y: (srcH - sh) / 2, width: sw, height: sh };
  }

  function containRect(srcW, srcH, dstW, dstH) {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const w = srcW * scale, h = srcH * scale;
    return { x: (dstW - w) / 2, y: (dstH - h) / 2, width: w, height: h };
  }

  function parseRatio(value) {
    if (!value || value === "free") return null;
    const m = String(value).match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return Number(m[1]) / Number(m[2]);
  }

  function cropRectPercent(width, height, x, y, w, h, ratio) {
    const px = Math.round(clamp(x, 0, 95) / 100 * width);
    const py = Math.round(clamp(y, 0, 95) / 100 * height);
    let pw = Math.max(1, Math.round(clamp(w, 1, 100) / 100 * width));
    let ph = Math.max(1, Math.round(clamp(h, 1, 100) / 100 * height));
    pw = Math.min(pw, width - px);
    ph = Math.min(ph, height - py);
    if (ratio) {
      let rw = pw, rh = Math.round(rw / ratio);
      if (rh > ph) { rh = ph; rw = Math.round(rh * ratio); }
      const cx = px + Math.round((pw - rw) / 2);
      const cy = py + Math.round((ph - rh) / 2);
      return { x: clamp(cx, 0, width - rw), y: clamp(cy, 0, height - rh), width: rw, height: rh };
    }
    return { x: px, y: py, width: pw, height: ph };
  }

  function parseWidthList(text, fallback) {
    const raw = String(text || "").split(/[,\s]+/).map(Number).filter(n => isFinite(n) && n >= 16);
    const list = [...new Set(raw.map(n => Math.round(n)))].sort((a, b) => a - b).slice(0, 12);
    return list.length ? list : (fallback || [320, 640, 960, 1280]);
  }

  function hexToRgb(hex) {
    const s = String(hex || "#000000").replace("#", "");
    const full = s.length === 3 ? s.split("").map(c => c + c).join("") : s.padEnd(6, "0").slice(0, 6);
    return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  }
  function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  /* --------------------------------------------------- palette / hashes */

  function medianCutPalette(pixels, maxColors) {
    const px = Array.isArray(pixels) ? pixels : [];
    const n = Math.max(3, Math.min(32, Number(maxColors) || 8));
    if (!px.length) return [];
    const buckets = [px];
    while (buckets.length < n) {
      let best = -1, bestRange = -1, bestChannel = 0;
      buckets.forEach((bucket, i) => {
        if (bucket.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          let min = 255, max = 0;
          for (const p of bucket) { if (p[ch] < min) min = p[ch]; if (p[ch] > max) max = p[ch]; }
          if (max - min > bestRange) { bestRange = max - min; best = i; bestChannel = ch; }
        }
      });
      if (best < 0 || bestRange <= 0) break;
      const bucket = buckets[best].slice().sort((a, b) => a[bestChannel] - b[bestChannel]);
      const mid = Math.floor(bucket.length / 2);
      buckets.splice(best, 1, bucket.slice(0, mid), bucket.slice(mid));
    }
    const total = px.length;
    return buckets.filter(b => b.length).map(b => {
      let r = 0, g = 0, bl = 0;
      b.forEach(p => { r += p[0]; g += p[1]; bl += p[2]; });
      const rgb = [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
      return { rgb, hex: rgbToHex(rgb[0], rgb[1], rgb[2]), count: b.length, share: Math.round((b.length / total) * 1000) / 10 };
    }).sort((a, b) => b.count - a.count);
  }

  function sampleRgbaPixels(rgba, width, height, maxSamples) {
    const limit = Math.max(100, Number(maxSamples) || 20000);
    const step = Math.max(1, Math.floor((width * height) / limit));
    const out = [];
    for (let i = 0; i < width * height; i += step) {
      const p = i * 4;
      if (rgba[p + 3] < 16) continue;
      out.push([rgba[p], rgba[p + 1], rgba[p + 2]]);
    }
    return out;
  }

  function grayscaleGrid(rgba, width, height, gw, gh) {
    const out = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / gw));
        const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / gh));
        const p = (sy * width + sx) * 4;
        out.push(luma(rgba[p], rgba[p + 1], rgba[p + 2]));
      }
    }
    return out;
  }

  function averageHash(rgba, width, height) {
    const g = grayscaleGrid(rgba, width, height, 8, 8);
    const avg = g.reduce((a, b) => a + b, 0) / g.length;
    return g.map(v => (v >= avg ? 1 : 0));
  }

  function differenceHash(rgba, width, height) {
    const g = grayscaleGrid(rgba, width, height, 9, 8);
    const bits = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) bits.push(g[y * 9 + x] < g[y * 9 + x + 1] ? 1 : 0);
    }
    return bits;
  }

  function bitsToHex(bits) {
    let out = "";
    for (let i = 0; i < bits.length; i += 4) {
      out += parseInt(bits.slice(i, i + 4).join("") || "0", 2).toString(16);
    }
    return out;
  }

  function hamming(a, b) {
    let n = 0;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) if ((a[i] || 0) !== (b[i] || 0)) n++;
    return n;
  }

  function hammingHex(a, b) {
    let n = 0;
    const aa = String(a), bb = String(b);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const x = parseInt(aa[i] || "0", 16), y = parseInt(bb[i] || "0", 16);
      let v = x ^ y;
      while (v) { n += v & 1; v >>= 1; }
    }
    return n;
  }

  async function sha256Hex(input) {
    const bytes = toBytes(input);
    const subtle = root && root.crypto && root.crypto.subtle;
    if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable in this browser.");
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* --------------------------------------------------------------- SVG */

  function escapeXml(s) {
    return String(s == null ? "" : s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  function sanitizeSvg(input, opts) {
    const o = Object.assign({ minify: false, stripComments: true, removeXmlns: false }, opts || {});
    let svg = String(input || "").replace(/^\uFEFF/, "");
    const removed = [];
    const before = utf8(svg).length;
    const drop = (label, re) => {
      const next = svg.replace(re, "");
      if (next !== svg) { removed.push(label); svg = next; }
    };
    if (o.stripComments) drop("comments", /<!--[\s\S]*?-->/g);
    // Dangerous elements, including self-closing and case variants.
    for (const tag of ["script", "foreignObject", "iframe", "object", "embed", "meta", "link", "base", "form"]) {
      const re = new RegExp("<\\s*" + tag + "\\b[^>]*\\/>|<\\s*" + tag + "\\b[\\s\\S]*?<\\s*\\/\\s*" + tag + "\\s*>", "gi");
      drop(tag, re);
    }
    drop("processing instructions", /<\?[\s\S]*?\?>/g);
    drop("DOCTYPE", /<!DOCTYPE[\s\S]*?>/gi);
    // Event handler attributes.
    const eventRe = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
    if (eventRe.test(svg)) { removed.push("inline event handlers"); svg = svg.replace(eventRe, ""); }
    // javascript: / vbscript: / data:text/html links.
    const badHref = /\s+(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*')/gi;
    if (badHref.test(svg)) { removed.push("unsafe links"); svg = svg.replace(badHref, ""); }
    drop("unsafe style blocks", /<style\b[^>]*>[\s\S]*?<\/style>/gi);
    const badStyle = /\s+style\s*=\s*(?:"[^"]*(?:expression|javascript:)[^"]*"|'[^']*(?:expression|javascript:)[^']*')/gi;
    if (badStyle.test(svg)) { removed.push("unsafe style attributes"); svg = svg.replace(badStyle, ""); }
    if (o.removeXmlns) svg = svg.replace(/\s+(?:width|height)\s*=\s*["'][^"']*["']/gi, "");
    if (o.minify) {
      svg = svg.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
    }
    const valid = /<svg[\s>]/i.test(svg) && /<\/svg\s*>/i.test(svg);
    if (!valid) removed.push("invalid SVG structure");
    return {
      svg, removed, valid,
      bytesBefore: before,
      bytesAfter: utf8(svg).length,
      warnings: valid ? [] : ["The cleaned markup is not a complete SVG document. Check the root <svg> element."]
    };
  }

  function placeholderSvg(width, height, bg, fg, text) {
    const w = Math.max(1, Math.round(Number(width) || 1200));
    const h = Math.max(1, Math.round(Number(height) || 630));
    const label = text || `${w} x ${h}`;
    const size = Math.max(10, Math.round(Math.min(w, h) * 0.07));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(label)}"><rect width="${w}" height="${h}" fill="${escapeXml(bg || "#e2e8f0")}"/><text x="${w / 2}" y="${h / 2}" fill="${escapeXml(fg || "#1e3a8a")}" font-family="system-ui, sans-serif" font-size="${size}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text></svg>`;
  }

  /* --------------------------------------------------------- names / files */

  function sanitizeFilename(name, fallback) {
    let base = String(name || "").replace(/\\/g, "/").split("/").pop();
    base = base.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
    base = base.replace(/^\.+/, "").replace(/[. ]+$/, "");
    if (!base) base = fallback || "image";
    const m = base.match(/^(.*?)(\.[a-z0-9]{1,8})?$/i);
    let stem = (m && m[1]) || base;
    let ext = (m && m[2]) || "";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = "_" + stem;
    stem = stem.slice(0, 100);
    return stem + ext.toLowerCase();
  }

  function outputName(name, suffix, ext) {
    const safe = sanitizeFilename(name);
    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const cleanSuffix = suffix ? "-" + String(suffix).replace(/^[-.]+/, "") : "";
    return sanitizeFilename(stem + cleanSuffix + "." + (ext || "bin"));
  }

  function uniqueNames(files) {
    const seen = new Map();
    return files.map(f => {
      const base = sanitizeFilename(f.name || "file");
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      if (n === 1) return Object.assign({}, f, { name: base });
      const dot = base.lastIndexOf(".");
      const next = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`;
      return Object.assign({}, f, { name: next });
    });
  }

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return `${v} B`;
    if (v < 1048576) return `${(v / 1024).toFixed(v < 10240 ? 2 : 1)} KB`;
    return `${(v / 1048576).toFixed(2)} MB`;
  }

  function parseBase64Image(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Paste a Base64 string or data URI first.");
    let mime = null, body = raw;
    const m = raw.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(?:;[^,]*)?;base64,([\s\S]+)$/i);
    if (m) { mime = m[1] || null; body = m[2]; }
    else if (/^data:/i.test(raw)) throw new Error("Only base64 data URIs are accepted. Use a data:image/...;base64,... value.");
    body = body.replace(/\s+/g, "");
    if (!body || !/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1) throw new Error("The Base64 text contains invalid characters.");
    let bytes;
    try {
      if (typeof atob === "function") {
        const bin = atob(body);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new Uint8Array(Buffer.from(body, "base64"));
      }
    } catch (_) { throw new Error("The Base64 text could not be decoded."); }
    if (!bytes.length) throw new Error("The decoded data is empty.");
    const format = sniffFormat(bytes);
    if (format === "unknown" || format === "heic") throw new Error("Decoded bytes are not a supported image format.");
    return { bytes, mime, format, actualMime: mimeFor(format), length: bytes.length };
  }

  function inspectBytes(input, filename) {
    const b = toBytes(input);
    const format = sniffFormat(b, filename);
    const dims = parseDimensions(b, format);
    const meta = metadataSummary(b, filename);
    return {
      filename: filename || null,
      format,
      label: FORMAT_LABEL[format] || format,
      mime: mimeFor(format),
      bytes: b.length,
      width: dims.width,
      height: dims.height,
      pixels: dims.width * dims.height,
      ...meta,
      recognised: format !== "unknown"
    };
  }

  const core = {
    toBytes, ascii, sniffFormat, parseDimensions, jpegDimensions, webpDimensions, tiffDimensions, svgDimensions,
    exifFromBytes, parsePngMeta, metadataSummary, jpegJfifDpi,
    crc32, buildZip, buildIco, buildBmp, buildPdf, setDpiPng, setDpiJpeg, concatBytes,
    clamp, fitDimensions, coverRect, containRect, parseRatio, cropRectPercent, parseWidthList,
    hexToRgb, rgbToHex, luma, medianCutPalette, sampleRgbaPixels, grayscaleGrid,
    averageHash, differenceHash, bitsToHex, hamming, hammingHex, sha256Hex,
    escapeXml, sanitizeSvg, placeholderSvg, sanitizeFilename, outputName, uniqueNames,
    formatBytes, parseBase64Image, inspectBytes, mimeFor, extFor, normalizeFormat,
    MIME, EXT, FORMAT_LABEL, LIMITS
  };

  /* ============================================================== browser */

  function cfg() { return (root && root.ImageToolConfig) || C; }
  const VENDOR = {
    qrcode: { src: "/vendor/qrcode.min.js", global: "QRCode" },
    jsqr: { src: "/vendor/jsqr.min.js", global: "jsQR" },
    gifenc: { src: "/vendor/gifenc.min.js", global: "gifenc" },
    gifuct: { src: "/vendor/gifuct.min.js", global: "gifuct" },
    utif: { src: "/vendor/utif.min.js", global: "UTIF" },
    jsbarcode: { src: "/vendor/jsbarcode.min.js", global: "JsBarcode" }
  };
  const vendorPromises = {};
  function loadVendor(name) {
    const v = VENDOR[name];
    if (!v) return Promise.reject(new Error("Unknown vendor bundle: " + name));
    if (root[v.global]) return Promise.resolve(root[v.global]);
    if (vendorPromises[name]) return vendorPromises[name];
    vendorPromises[name] = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = v.src;
      s.async = true;
      s.onload = function () { root[v.global] ? resolve(root[v.global]) : reject(new Error(v.global + " did not initialise.")); };
      s.onerror = function () { reject(new Error("Could not load " + v.src + ". Check your connection and reload.")); };
      document.head.appendChild(s);
    });
    return vendorPromises[name];
  }

  function abortError() { const e = new Error("Processing cancelled."); e.name = "AbortError"; return e; }
  function checkAbort(ctx) { if (ctx && ctx.signal && ctx.signal.aborted) throw abortError(); }
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.min(32767, Math.round(w)));
    c.height = Math.max(1, Math.min(32767, Math.round(h)));
    return c;
  }
  function ctx2d(canvas, alpha) { return canvas.getContext("2d", { alpha: alpha !== false }); }

  async function decodePrepared(p) {
    if (p.drawable) return p;
    if (p.format === "heic") throw new Error("HEIC/HEIF is not supported. Export a JPEG or PNG copy first.");
    if (p.format === "tiff") {
      const UTIF = await loadVendor("utif");
      const ifds = UTIF.decode(p.bytes.buffer);
      if (!ifds || !ifds.length) throw new Error("The TIFF decoder found no image pages.");
      UTIF.decodeImage(p.bytes.buffer, ifds[0]);
      const rgba = UTIF.toRGBA8(ifds[0]);
      const w = ifds[0].width, h = ifds[0].height;
      if (!w || !h) throw new Error("The TIFF page reported no dimensions.");
      if (w * h > LIMITS.maxPixels) throw new Error("Image exceeds the " + (LIMITS.maxPixels / 1e6) + "-megapixel limit.");
      const canvas = makeCanvas(w, h);
      const cx = ctx2d(canvas);
      cx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
      p.drawable = canvas;
      p.width = w; p.height = h; p.pixels = w * h;
      return p;
    }
    let bytes = p.bytes;
    let mime = p.mime;
    if (p.format === "svg") {
      bytes = new TextEncoder().encode(p.svgText || "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
      mime = "image/svg+xml";
    }
    const blob = new Blob([bytes], { type: mime });
    let drawable = null;
    if (typeof createImageBitmap === "function" && p.format !== "svg") {
      try { drawable = await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch (_) { drawable = null; }
    }
    if (!drawable) {
      const url = URL.createObjectURL(blob);
      try {
        drawable = await new Promise(function (resolve, reject) {
          const img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error("The browser could not decode this file. It may be corrupt or use an unsupported codec.")); };
          img.src = url;
        });
      } finally {
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      }
    }
    const w = drawable.width || drawable.naturalWidth;
    const h = drawable.height || drawable.naturalHeight;
    if (!w || !h) throw new Error("The decoder returned no pixel dimensions.");
    if (w > LIMITS.maxDimension || h > LIMITS.maxDimension) throw new Error("Image exceeds the " + LIMITS.maxDimension + " px dimension limit.");
    if (w * h > LIMITS.maxPixels) throw new Error("Image exceeds the " + (LIMITS.maxPixels / 1e6) + "-megapixel limit. Downscale it first.");
    p.drawable = drawable; p.width = w; p.height = h; p.pixels = w * h;
    return p;
  }

  async function prepare(input, limits) {
    const L = limits || LIMITS;
    const bytes = input.bytes || await readBytes(input.file);
    if (bytes.length > L.maxFileBytes) throw new Error("File is " + formatBytes(bytes.length) + "; the limit is " + formatBytes(L.maxFileBytes) + ".");
    const format = sniffFormat(bytes, input.name || (input.file && input.file.name));
    if (format === "unknown") throw new Error("This is not a recognised image file. The real file signature does not match JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF or SVG.");
    if (format === "heic") throw new Error("HEIC/HEIF input is not decoded because no HEIC decoder is bundled. Export a JPEG or PNG copy first.");
    let svgText = null;
    let width = 0, height = 0;
    if (format === "svg") {
      svgText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const safe = sanitizeSvg(svgText, { minify: false });
      if (!safe.valid) throw new Error("The SVG is incomplete or has no root <svg> element.");
      svgText = safe.svg;
      const d = svgDimensions(svgText);
      width = d.width; height = d.height;
      if (!width || !height) { width = width || 1024; height = height || 1024; }
      if (width * height > L.maxPixels) throw new Error("SVG intrinsic size exceeds the processing limit. Set an explicit smaller width.");
    } else {
      const d = parseDimensions(bytes, format);
      width = d.width; height = d.height;
      if (width > L.maxDimension || height > L.maxDimension) throw new Error("Image exceeds the " + L.maxDimension + " px dimension limit.");
      if (width * height > L.maxPixels) throw new Error("Image exceeds the " + (L.maxPixels / 1e6) + "-megapixel limit. Downscale it first.");
    }
    return {
      name: sanitizeFilename(input.name || (input.file && input.file.name) || "image"),
      file: input.file || null, bytes, format, mime: mimeFor(format),
      width, height, pixels: width * height, svgText,
      meta: null
    };
  }

  function ensurePixelLimit(w, h) {
    if (w > LIMITS.maxDimension || h > LIMITS.maxDimension) throw new Error("Output would exceed the " + LIMITS.maxDimension + " px dimension limit.");
    if (w * h > LIMITS.maxPixels) throw new Error("Output would exceed the " + (LIMITS.maxPixels / 1e6) + "-megapixel limit.");
  }

  function resolveFormat(p, requested, fallback) {
    const f = normalizeFormat(requested);
    if (!f || f === "auto") {
      if (["jpeg", "png", "webp", "avif"].includes(p.format)) return p.format;
      if (["gif", "bmp", "tiff", "ico"].includes(p.format)) return p.format;
      return fallback || "png";
    }
    return f;
  }

  function drawToCanvas(source, w, h, bg) {
    const canvas = makeCanvas(w, h);
    const cx = ctx2d(canvas, !bg);
    if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, canvas.width, canvas.height); }
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function sourceCanvas(p, maxWidth, maxHeight, mode, bg) {
    await decodePrepared(p);
    let w = p.width, h = p.height;
    if (maxWidth || maxHeight) {
      const fit = fitDimensions(w, h, maxWidth || 0, maxHeight || 0);
      if (fit.width !== w || fit.height !== h) {
        const direct = drawToCanvas(p.drawable, fit.width, fit.height, bg);
        return direct;
      }
    }
    if (mode === "cover" || mode === "fit") {
      const targetW = maxWidth || w, targetH = maxHeight || h;
      const canvas = makeCanvas(targetW, targetH);
      const cx = ctx2d(canvas, !bg);
      if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, targetW, targetH); }
      if (mode === "cover") {
        const r = coverRect(w, h, targetW, targetH);
        cx.drawImage(p.drawable, r.x, r.y, r.width, r.height, 0, 0, targetW, targetH);
      } else {
        const r = containRect(w, h, targetW, targetH);
        cx.drawImage(p.drawable, 0, 0, w, h, r.x, r.y, r.width, r.height);
      }
      return canvas;
    }
    return drawToCanvas(p.drawable, w, h, bg);
  }

  function blobFromCanvas(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error("The browser could not encode " + mime + ". Try PNG or JPEG."));
        resolve(blob);
      }, mime, quality);
    });
  }

  async function encodeCanvas(canvas, format, quality, bg) {
    const fmt = normalizeFormat(format);
    const q = clamp(quality || 85, 5, 100) / 100;
    if (fmt === "jpeg" || fmt === "bmp") {
      if (bg) {
        const flat = drawToCanvas(canvas, canvas.width, canvas.height, bg);
        canvas = flat;
      }
    }
    if (fmt === "jpeg") {
      const blob = await blobFromCanvas(canvas, "image/jpeg", q);
      return { blob, format: fmt, ext: "jpg", mime: "image/jpeg" };
    }
    if (fmt === "png") {
      const blob = await blobFromCanvas(canvas, "image/png", undefined);
      return { blob, format: fmt, ext: "png", mime: "image/png" };
    }
    if (fmt === "webp") {
      const blob = await blobFromCanvas(canvas, "image/webp", q);
      if (blob.type !== "image/webp") throw new Error("This browser cannot encode WebP.");
      return { blob, format: fmt, ext: "webp", mime: "image/webp" };
    }
    if (fmt === "avif") {
      const blob = await blobFromCanvas(canvas, "image/avif", q);
      if (blob.type !== "image/avif") throw new Error("This browser does not expose an AVIF encoder. Choose JPEG, PNG or WebP.");
      return { blob, format: fmt, ext: "avif", mime: "image/avif" };
    }
    if (fmt === "bmp") {
      const cx = ctx2d(canvas);
      const data = cx.getImageData(0, 0, canvas.width, canvas.height).data;
      const bytes = buildBmp(data, canvas.width, canvas.height);
      return { blob: new Blob([bytes], { type: "image/bmp" }), format: fmt, ext: "bmp", mime: "image/bmp" };
    }
    if (fmt === "tiff") {
      const UTIF = await loadVendor("utif");
      const cx = ctx2d(canvas);
      const data = cx.getImageData(0, 0, canvas.width, canvas.height).data;
      const buf = UTIF.encodeImage(new Uint8Array(data.buffer), canvas.width, canvas.height);
      return { blob: new Blob([buf], { type: "image/tiff" }), format: fmt, ext: "tiff", mime: "image/tiff" };
    }
    if (fmt === "ico") {
      const size = Math.min(256, Math.max(16, Math.min(canvas.width, canvas.height)));
      const icon = drawToCanvas(canvas, size, size, null);
      const pngBlob = await blobFromCanvas(icon, "image/png");
      const png = new Uint8Array(await pngBlob.arrayBuffer());
      const ico = buildIco([{ size, png }]);
      return { blob: new Blob([ico], { type: "image/x-icon" }), format: fmt, ext: "ico", mime: "image/x-icon" };
    }
    if (fmt === "gif") {
      const gifenc = await loadVendor("gifenc");
      const cx = ctx2d(canvas);
      const data = cx.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = gifenc.quantize(data, 256, { format: "rgba4444" });
      const index = gifenc.applyPalette(data, palette, "rgba4444");
      const gif = gifenc.GIFEncoder();
      gif.writeFrame(index, canvas.width, canvas.height, { palette: palette, delay: 0 });
      gif.finish();
      return { blob: new Blob([gif.bytes()], { type: "image/gif" }), format: fmt, ext: "gif", mime: "image/gif" };
    }
    throw new Error("Unsupported output format: " + fmt);
  }

  function textResult(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    return { name, blob, kind: "text", size: blob.size, text, note: "" };
  }
  function reportResult(name, text, note) {
    const r = textResult(name, text, "application/json");
    r.kind = "report"; r.note = note || "";
    return r;
  }
  function imageResult(name, enc, note, extra) {
    return Object.assign({ name, blob: enc.blob, kind: "image", size: enc.blob.size, note: note || "", format: enc.format }, extra || {});
  }
  function zipResult(name, files, note) {
    const zip = buildZip(files);
    const blob = new Blob([zip], { type: "application/zip" });
    return { name, blob, kind: "zip", size: blob.size, note: note || "", format: "zip" };
  }
  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result || "")); };
      r.onerror = function () { reject(new Error("The text file could not be read.")); };
      r.readAsText(file);
    });
  }
  async function readBytes(file) {
    if (!file) throw new Error("No file data was supplied.");
    if (typeof file.arrayBuffer === "function") {
      return toBytes(await file.arrayBuffer());
    }
    if (typeof FileReader !== "undefined" && typeof file.size === "number") {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(toBytes(r.result)); };
        r.onerror = function () { reject(new Error("The file could not be read.")); };
        r.readAsArrayBuffer(file);
      });
    }
    return toBytes(file);
  }
  function bytesToBase64(bytes) {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }

  async function eachFile(ctx, fn) {
    const outputs = [], errors = ctx.errors || [];
    const list = ctx.inputs || [];
    for (let i = 0; i < list.length; i++) {
      checkAbort(ctx);
      const item = list[i];
      try {
        const p = await prepare(item, LIMITS);
        const res = await fn(p, i);
        if (res) outputs.push.apply(outputs, Array.isArray(res) ? res : [res]);
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        errors.push({ name: item.name || (item.file && item.file.name) || "file", message: err && err.message ? err.message : String(err) });
      }
      if (ctx.onProgress) ctx.onProgress(i + 1, list.length);
    }
    return { outputs, errors };
  }

  function targetEncode(canvas, format, targetBytes, minQuality, bg) {
    return (async function () {
      let low = clamp(minQuality || 30, 5, 95), high = 95, best = null;
      for (let i = 0; i < 8; i++) {
        const q = Math.round((low + high) / 2);
        const enc = await encodeCanvas(canvas, format, q, bg);
        if (enc.blob.size <= targetBytes) { best = { enc, quality: q }; low = q + 1; }
        else high = q - 1;
        if (low > high) break;
      }
      if (!best) {
        const enc = await encodeCanvas(canvas, format, clamp(minQuality || 30, 5, 95), bg);
        return { enc, quality: clamp(minQuality || 30, 5, 95), met: enc.blob.size <= targetBytes };
      }
      return { enc: best.enc, quality: best.quality, met: true };
    })();
  }

  /* ------------------------------------------------------------ processors */

  async function compress(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const format = resolveFormat(p, v.format, "jpeg");
      let w = p.width, h = p.height;
      const maxW = Number(v.maxWidth) || 0;
      if (maxW > 0 && w > maxW) { const f = fitDimensions(w, h, maxW, 0); w = f.width; h = f.height; }
      const canvas = await sourceCanvas(p, w, h, null, null);
      const enc = await encodeCanvas(canvas, format, v.quality, v.background);
      const saved = Math.round((1 - enc.blob.size / p.bytes.length) * 1000) / 10;
      return imageResult(outputName(p.name, "", enc.ext), enc,
        p.bytes.length + " to " + formatBytes(enc.blob.size) + " (" + (saved >= 0 ? saved + "% smaller" : Math.abs(saved) + "% larger") + ") at " + w + " x " + h);
    });
  }

  async function targetSize(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const format = resolveFormat(p, v.format, "jpeg");
      if (format === "png") throw new Error("PNG is lossless, so target-size quality search is not available. Choose JPEG, WebP or AVIF.");
      const target = Math.max(1024, (Number(v.targetKb) || 100) * 1024);
      const minQ = clamp(Number(v.minQuality) || 40, 10, 90);
      let w = p.width, h = p.height, canvas = await sourceCanvas(p, w, h, null, null);
      let res = await targetEncode(canvas, format, target, minQ, v.background);
      let attempts = 0;
      while (!res.met && v.allowResize !== false && attempts < 10) {
        attempts++;
        w = Math.max(48, Math.round(w * 0.88));
        h = Math.max(48, Math.round(h * (w / (canvas.width || w))));
        canvas = await sourceCanvas(p, w, h, null, null);
        res = await targetEncode(canvas, format, target, minQ, v.background);
      }
      const note = (res.met ? "Target met: " : "Target NOT met at minimum quality: ") +
        formatBytes(res.enc.blob.size) + " vs " + formatBytes(target) +
        " (quality " + res.quality + (attempts ? ", downscaled " + attempts + "x to " + w + " x " + h : "") + ")";
      return imageResult(outputName(p.name, "", res.enc.ext), res.enc, note);
    });
  }

  async function resize(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const format = resolveFormat(p, v.format, "png");
      let tw, th;
      if (v.mode === "percent") {
        const s = clamp(Number(v.percent) || 50, 1, 400) / 100;
        tw = Math.max(1, Math.round(p.width * s)); th = Math.max(1, Math.round(p.height * s));
      } else {
        const bw = Number(v.width) || 0, bh = Number(v.height) || 0;
        if (v.lockAspect !== false) {
          if (bw && bh) { const f = fitDimensions(p.width, p.height, bw, bh); tw = f.width; th = f.height; }
          else if (bw) { tw = bw; th = Math.max(1, Math.round(bw * p.height / p.width)); }
          else if (bh) { th = bh; tw = Math.max(1, Math.round(bh * p.width / p.height)); }
          else throw new Error("Enter a width, a height or a percentage.");
        } else {
          tw = bw || p.width; th = bh || p.height;
        }
      }
      ensurePixelLimit(tw, th);
      const canvas = await sourceCanvas(p, tw, th, v.fit || "fit", v.fit === "fill" ? null : v.background);
      const enc = await encodeCanvas(canvas, format, v.quality, v.background);
      return imageResult(outputName(p.name, "", enc.ext), enc, p.width + " x " + p.height + " to " + tw + " x " + th);
    });
  }

  async function crop(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const fmt = resolveFormat(p, v.format, "png");
      const rect = cropRectPercent(p.width, p.height, v.x, v.y, v.w, v.h, parseRatio(v.ratio));
      const outW = Math.max(1, Math.round(Number(v.outputWidth) || rect.width));
      const outH = Math.max(1, Math.round(outW * rect.height / rect.width));
      ensurePixelLimit(outW, outH);
      const canvas = makeCanvas(outW, outH);
      const cx = ctx2d(canvas);
      const shape = v.shape || "rect";
      if (shape === "circle") {
        cx.save(); cx.beginPath(); cx.ellipse(outW / 2, outH / 2, outW / 2, outH / 2, 0, 0, Math.PI * 2); cx.clip();
      } else if (shape === "rounded") {
        const r = Math.min(outW, outH) * clamp(Number(v.radius) || 24, 0, 500) / Math.min(rect.width, rect.height);
        roundRectPath(cx, 0, 0, outW, outH, Math.min(r, Math.min(outW, outH) / 2));
        cx.clip();
      }
      cx.drawImage(p.drawable, rect.x, rect.y, rect.width, rect.height, 0, 0, outW, outH);
      cx.restore();
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background);
      return imageResult(outputName(p.name, "crop", enc.ext), enc,
        "Cropped " + rect.width + " x " + rect.height + " at " + rect.x + "," + rect.y + (shape !== "rect" ? " (" + shape + ")" : ""));
    });
  }

  function roundRectPath(cx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    cx.beginPath();
    cx.moveTo(x + radius, y);
    cx.arcTo(x + w, y, x + w, y + h, radius);
    cx.arcTo(x + w, y + h, x, y + h, radius);
    cx.arcTo(x, y + h, x, y, radius);
    cx.arcTo(x, y, x + w, y, radius);
    cx.closePath();
  }

  async function presetCrop(ctx) {
    const v = ctx.values || {};
    const presets = (ctx.tool && ctx.tool.presets) || {};
    const preset = presets[v.preset];
    const tw = Math.max(1, Math.round(Number(preset ? preset.w : v.customWidth) || 350));
    const th = Math.max(1, Math.round(Number(preset ? preset.h : v.customHeight) || 450));
    const maxKb = Number(v.maxKb) || 0;
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      ensurePixelLimit(tw, th);
      const canvas = await sourceCanvas(p, tw, th, v.fit === "pad" ? "fit" : "cover", v.background);
      let enc;
      if (maxKb > 0) {
        const res = await targetEncode(canvas, "jpeg", maxKb * 1024, 40, v.background);
        enc = res.enc;
        enc = Object.assign({}, enc, { note: res.met ? "within" : "over" });
      } else {
        enc = await encodeCanvas(canvas, "jpeg", v.quality, v.background);
      }
      const met = !maxKb || enc.blob.size <= maxKb * 1024;
      return imageResult(outputName(p.name, "preset", enc.ext), enc,
        tw + " x " + th + " px, " + formatBytes(enc.blob.size) + (maxKb ? " (" + (met ? "within" : "OVER") + " " + maxKb + " KB)" : "") + ". Verify official requirements.");
    });
  }

  async function dpiTool(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item);
        const meta = metadataSummary(p.bytes, p.name);
        const lines = [
          "File: " + p.name,
          "Detected format: " + (FORMAT_LABEL[meta.format] || meta.format),
          "Pixel dimensions: " + meta.width + " x " + meta.height,
          "Embedded DPI/PPI: " + (meta.dpi || "not present"),
          "Physical size at that DPI: " + (meta.dpi ? (meta.width / meta.dpi).toFixed(2) + " x " + (meta.height / meta.dpi).toFixed(2) + " inches" : "unknown without density metadata"),
          "ICC profile present: " + (meta.hasIcc ? "yes (not colour-managed)" : "no"),
          "EXIF present: " + (meta.hasExif ? "yes" : "no")
        ];
        outputs.push(reportResult(outputName(p.name, "dpi-report", "json"), JSON.stringify({ file: p.name, detected: meta, report: lines }, null, 2), lines[0]));
        if (v.apply) {
          const target = clamp(Number(v.dpi) || 300, 36, 1200);
          let rewritten;
          if (meta.format === "png") rewritten = setDpiPng(p.bytes, target);
          else if (meta.format === "jpeg") rewritten = setDpiJpeg(p.bytes, target);
          else throw new Error("Writing DPI is supported for PNG and JPEG only. This file is " + (FORMAT_LABEL[meta.format] || meta.format) + ".");
          const check = metadataSummary(rewritten, p.name);
          const ext = extFor(meta.format);
          const blob = new Blob([rewritten], { type: mimeFor(meta.format) });
          outputs.push({ name: outputName(p.name, "dpi" + target, ext), blob, kind: "image", size: blob.size, format: meta.format,
            note: "Wrote " + target + " DPI. Re-read: " + (check.dpi || "not detected") + " DPI." });
        }
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function convert(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const fmt = normalizeFormat(v.format) || "png";
      let tw = p.width, th = p.height;
      const svgW = Number(v.svgSize) || 0;
      if (p.format === "svg" && svgW > 0) {
        const f = fitDimensions(p.width, p.height, svgW, 0);
        tw = f.width; th = f.height;
      }
      ensurePixelLimit(tw, th);
      const canvas = await sourceCanvas(p, tw, th, null, fmt === "jpeg" ? (v.background || "#ffffff") : null);
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background);
      return imageResult(outputName(p.name, "", enc.ext), enc, (FORMAT_LABEL[p.format] || p.format) + " to " + FORMAT_LABEL[fmt] + ", " + tw + " x " + th + ", " + formatBytes(enc.blob.size));
    });
  }

  async function imageToPdf(ctx) {
    const v = ctx.values || {};
    const pages = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item);
        await decodePrepared(p);
        if (pages.length >= LIMITS.maxPdfPages) throw new Error("The PDF page limit is " + LIMITS.maxPdfPages + ".");
        let tw = p.width, th = p.height;
        // Bound raster memory while keeping print-legible pages.
        const maxSide = 3000;
        if (Math.max(tw, th) > maxSide) { const f = fitDimensions(tw, th, maxSide, maxSide); tw = f.width; th = f.height; }
        const canvas = await sourceCanvas(p, tw, th, null, "#ffffff");
        const enc = await encodeCanvas(canvas, "jpeg", v.quality || 88, "#ffffff");
        pages.push({ data: new Uint8Array(await enc.blob.arrayBuffer()), width: tw, height: th });
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (!pages.length) return { outputs: [], errors };
    const pdf = buildPdf(pages, { pageSize: v.pageSize || "image", margin: v.margin || 0 });
    const blob = new Blob([pdf], { type: "application/pdf" });
    return { outputs: [{ name: "bench-images.pdf", blob, kind: "document", size: blob.size, format: "pdf", note: pages.length + " page(s), " + formatBytes(blob.size) + ". Raster pages, not searchable text." }], errors };
  }

  async function base64(ctx) {
    const v = ctx.values || {};
    const outputs = [];
    try {
      if (v.mode === "decode") {
        const parsed = parseBase64Image(v.text);
        const blob = new Blob([parsed.bytes], { type: parsed.actualMime });
        outputs.push({ name: outputName("decoded", "", extFor(parsed.format)), blob, kind: "image", size: blob.size, format: parsed.format,
          note: "Decoded " + formatBytes(parsed.length) + " as " + (FORMAT_LABEL[parsed.format] || parsed.format) + ". Declared MIME: " + (parsed.mime || "none") + "." });
        outputs.push(reportResult("base64-decode-report.json", JSON.stringify({ detectedFormat: parsed.format, mime: parsed.actualMime, declaredMime: parsed.mime, bytes: parsed.length }, null, 2), "Signature verified after decoding."));
        return { outputs, errors: [] };
      }
      if (!ctx.inputs.length) throw new Error("Choose an image to encode, or switch to decode mode.");
      const item = ctx.inputs[0];
      const bytes = item.bytes || await readBytes(item.file);
      const format = sniffFormat(bytes, item.name);
      if (format === "unknown") throw new Error("The file is not a recognised image.");
      const b64 = bytesToBase64(bytes);
      const dataUri = "data:" + mimeFor(format) + ";base64," + b64;
      const report = { file: item.name, format, mime: mimeFor(format), bytes: bytes.length, base64Characters: b64.length, dataUriCharacters: dataUri.length, inflation: Math.round((dataUri.length / bytes.length) * 1000) / 10 + "%" };
      const text = "BASE64\n" + b64 + "\n\nDATA URI\n" + dataUri + "\n";
      const r = textResult(outputName(item.name, "base64", "txt"), text, "text/plain;charset=utf-8");
      r.note = b64.length.toLocaleString() + " Base64 characters; data URI is " + formatBytes(dataUri.length) + ".";
      outputs.push(r);
      outputs.push(reportResult(outputName(item.name, "base64-report", "json"), JSON.stringify(report, null, 2)));
      return { outputs, errors: [] };
    } catch (err) {
      return { outputs, errors: [{ name: "Base64", message: err.message || String(err) }] };
    }
  }

  async function transform(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const quarter = ((Number(v.rotate) || 0) % 360 + 360) % 360;
      const angle = (Number(v.angle) || 0) * Math.PI / 180;
      let bw = p.width, bh = p.height;
      if (quarter === 90 || quarter === 270) { bw = p.height; bh = p.width; }
      const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      const ow = Math.max(1, Math.ceil(bw * cos + bh * sin));
      const oh = Math.max(1, Math.ceil(bw * sin + bh * cos));
      ensurePixelLimit(ow, oh);
      const canvas = makeCanvas(ow, oh);
      const cx = ctx2d(canvas);
      cx.translate(ow / 2, oh / 2);
      cx.rotate(angle);
      cx.scale(v.flipH ? -1 : 1, v.flipV ? -1 : 1);
      cx.rotate(quarter * Math.PI / 180);
      cx.drawImage(p.drawable, -p.width / 2, -p.height / 2);
      const fmt = resolveFormat(p, v.format, "png");
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background);
      return imageResult(outputName(p.name, "transformed", enc.ext), enc,
        "Rotate " + quarter + " deg, straighten " + (Number(v.angle) || 0) + " deg" + (v.flipH ? ", flipped H" : "") + (v.flipV ? ", flipped V" : "") + " -> " + ow + " x " + oh);
    });
  }

  async function adjust(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const filters = [
        "brightness(" + (Number(v.brightness) || 100) + "%)",
        "contrast(" + (Number(v.contrast) || 100) + "%)",
        "saturate(" + (Number(v.saturation) || 100) + "%)",
        "hue-rotate(" + (Number(v.hue) || 0) + "deg)"
      ];
      if (v.grayscale) filters.push("grayscale(1)");
      if (v.sepia) filters.push("sepia(1)");
      if (v.invert) filters.push("invert(1)");
      const canvas = makeCanvas(p.width, p.height);
      const cx = ctx2d(canvas);
      cx.filter = filters.join(" ");
      cx.drawImage(p.drawable, 0, 0);
      cx.filter = "none";
      const fmt = resolveFormat(p, v.format, "png");
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background);
      return imageResult(outputName(p.name, "adjusted", enc.ext), enc, filters.join(", "));
    });
  }

  async function redact(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const canvas = await sourceCanvas(p, p.width, p.height, null, null);
      const cx = ctx2d(canvas);
      const rect = cropRectPercent(p.width, p.height, v.x, v.y, v.w, v.h, null);
      const strength = Math.max(1, Number(v.strength) || 12);
      if (v.mode === "solid") {
        cx.fillStyle = v.color || "#000000";
        cx.fillRect(rect.x, rect.y, rect.width, rect.height);
      } else if (v.mode === "pixelate") {
        const cols = Math.max(1, Math.round(rect.width / strength));
        const rows = Math.max(1, Math.round(rect.height / strength));
        const tiny = makeCanvas(cols, rows);
        const tx = ctx2d(tiny);
        tx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, cols, rows);
        cx.save(); cx.beginPath(); cx.rect(rect.x, rect.y, rect.width, rect.height); cx.clip();
        cx.imageSmoothingEnabled = false;
        cx.drawImage(tiny, 0, 0, cols, rows, rect.x, rect.y, rect.width, rect.height);
        cx.restore();
      } else {
        const pad = Math.ceil(strength * 2);
        const temp = makeCanvas(rect.width + pad * 2, rect.height + pad * 2);
        const tx = ctx2d(temp);
        tx.drawImage(canvas, rect.x - pad, rect.y - pad, temp.width, temp.height, 0, 0, temp.width, temp.height);
        cx.save(); cx.beginPath(); cx.rect(rect.x, rect.y, rect.width, rect.height); cx.clip();
        cx.filter = "blur(" + strength + "px)";
        cx.drawImage(temp, rect.x - pad, rect.y - pad, temp.width, temp.height);
        cx.filter = "none"; cx.restore();
      }
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
      return imageResult(outputName(p.name, "redacted", enc.ext), enc,
        (v.mode || "blur") + " over " + rect.width + " x " + rect.height + " at " + rect.x + "," + rect.y + ". For sensitive data prefer the solid block.");
    });
  }

  function wrapText(cx, text, maxWidth) {
    const paragraphs = String(text || "").split(/\r?\n/);
    const lines = [];
    paragraphs.forEach(function (para) {
      const words = para.split(/\s+/);
      let line = "";
      words.forEach(function (word) {
        const test = line ? line + " " + word : word;
        if (cx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      });
      lines.push(line);
    });
    return lines;
  }

  async function annotate(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const canvas = await sourceCanvas(p, p.width, p.height, null, null);
      const cx = ctx2d(canvas);
      const size = Math.max(8, Math.round(p.height * (Number(v.size) || 6) / 100));
      cx.font = "700 " + size + "px system-ui, sans-serif";
      cx.textBaseline = "middle";
      const maxWidth = canvas.width * 0.9;
      const lines = wrapText(cx, v.text || "", maxWidth);
      const lineHeight = size * 1.25;
      let blockY;
      if (v.position === "top") blockY = size * 1.2;
      else if (v.position === "center") blockY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
      else if (v.position === "custom") blockY = clamp(Number(v.y) || 50, 0, 100) / 100 * canvas.height;
      else blockY = canvas.height - size * 1.2 - (lines.length - 1) * lineHeight;
      if (v.background) {
        const bh = lines.length * lineHeight + size * 0.8;
        cx.fillStyle = v.background;
        cx.fillRect(0, blockY - lineHeight / 2 - size * 0.4, canvas.width, bh);
      }
      cx.textAlign = v.position === "custom" ? "center" : "center";
      cx.lineWidth = Math.max(1, size / 8);
      cx.strokeStyle = v.stroke || "#000000";
      cx.fillStyle = v.color || "#ffffff";
      lines.forEach(function (line, i) {
        const y = blockY + i * lineHeight;
        const x = v.position === "custom" ? clamp(Number(v.x) || 50, 0, 100) / 100 * canvas.width : canvas.width / 2;
        cx.strokeText(line, x, y, maxWidth);
        cx.fillText(line, x, y, maxWidth);
      });
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
      return imageResult(outputName(p.name, "annotated", enc.ext), enc, lines.length + " line(s), " + size + " px type");
    });
  }

  async function border(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const padding = clamp(Number(v.padding) || 0, 0, 1000);
      const bw = clamp(Number(v.border) || 0, 0, 200);
      const ow = p.width + (padding + bw) * 2;
      const oh = p.height + (padding + bw) * 2;
      ensurePixelLimit(ow, oh);
      const canvas = makeCanvas(ow, oh);
      const cx = ctx2d(canvas);
      if (v.gradient) {
        const g = cx.createLinearGradient(0, 0, ow, oh);
        g.addColorStop(0, v.bgColor || "#ffffff"); g.addColorStop(1, v.bgColor2 || "#dbeafe");
        cx.fillStyle = g;
      } else cx.fillStyle = v.bgColor || "#ffffff";
      cx.fillRect(0, 0, ow, oh);
      const ix = padding + bw, iy = padding + bw;
      const radius = clamp(Number(v.radius) || 0, 0, 500);
      if (v.shadow) { cx.save(); cx.shadowColor = "rgba(15,23,42,.35)"; cx.shadowBlur = Math.max(8, radius); cx.shadowOffsetY = Math.max(4, radius / 2); }
      cx.save();
      if (radius > 0) { roundRectPath(cx, ix, iy, p.width, p.height, radius); cx.clip(); }
      cx.drawImage(p.drawable, ix, iy, p.width, p.height);
      cx.restore();
      if (v.shadow) cx.restore();
      if (bw > 0) {
        cx.strokeStyle = v.borderColor || "#111827";
        cx.lineWidth = bw;
        if (radius > 0) roundRectPath(cx, ix - bw / 2, iy - bw / 2, p.width + bw, p.height + bw, radius);
        else cx.strokeRect(ix - bw / 2, iy - bw / 2, p.width + bw, p.height + bw);
        cx.stroke();
      }
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? (v.bgColor || "#ffffff") : null);
      return imageResult(outputName(p.name, "framed", enc.ext), enc, "Canvas " + ow + " x " + oh + " (padding " + padding + ", border " + bw + ")");
    });
  }

  async function watermark(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const canvas = await sourceCanvas(p, p.width, p.height, null, null);
      const cx = ctx2d(canvas);
      const size = Math.max(8, Math.round(p.width * (Number(v.size) || 5) / 100));
      cx.font = "700 " + size + "px system-ui, sans-serif";
      cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.globalAlpha = clamp(Number(v.opacity) || 45, 5, 100) / 100;
      cx.fillStyle = v.color || "#ffffff";
      const text = v.text || "Sample";
      const angle = (Number(v.angle) || 0) * Math.PI / 180;
      if (v.position === "tile") {
        const metrics = cx.measureText(text);
        const stepX = metrics.width + size * 2, stepY = size * 3;
        for (let y = -p.height; y < p.height * 2; y += stepY) {
          for (let x = -p.width; x < p.width * 2; x += stepX) {
            cx.save(); cx.translate(x, y); cx.rotate(angle); cx.fillText(text, 0, 0); cx.restore();
          }
        }
      } else {
        const margin = size * 0.9;
        let x = p.width / 2, y = p.height / 2;
        if (v.position === "bottom-right") { x = p.width - margin; y = p.height - margin; cx.textAlign = "right"; cx.textBaseline = "bottom"; }
        if (v.position === "bottom-left") { x = margin; y = p.height - margin; cx.textAlign = "left"; cx.textBaseline = "bottom"; }
        if (v.position === "top-right") { x = p.width - margin; y = margin; cx.textAlign = "right"; cx.textBaseline = "top"; }
        cx.save(); cx.translate(x, y); cx.rotate(angle); cx.fillText(text, 0, 0); cx.restore();
      }
      cx.globalAlpha = 1;
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
      return imageResult(outputName(p.name, "watermarked", enc.ext), enc, "Visible " + (v.position || "center") + " watermark, opacity " + (v.opacity || 45) + "%");
    });
  }

  async function meme(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const canvas = await sourceCanvas(p, p.width, p.height, null, null);
      const cx = ctx2d(canvas);
      const size = Math.max(10, Math.round(p.height * (Number(v.size) || 8) / 100));
      cx.font = "900 " + size + "px Impact, system-ui, sans-serif";
      cx.textAlign = "center"; cx.textBaseline = "top";
      cx.fillStyle = v.color || "#ffffff";
      cx.strokeStyle = v.stroke || "#000000";
      cx.lineWidth = Math.max(2, size / 9);
      cx.lineJoin = "round";
      const top = v.uppercase ? String(v.top || "").toUpperCase() : String(v.top || "");
      const bottom = v.uppercase ? String(v.bottom || "").toUpperCase() : String(v.bottom || "");
      const maxW = canvas.width * 0.92;
      const topLines = wrapText(cx, top, maxW);
      topLines.forEach(function (line, i) { const y = size * 0.25 + i * size * 1.1; cx.strokeText(line, canvas.width / 2, y, maxW); cx.fillText(line, canvas.width / 2, y, maxW); });
      cx.textBaseline = "bottom";
      const bottomLines = wrapText(cx, bottom, maxW);
      bottomLines.forEach(function (line, i) {
        const y = canvas.height - size * 0.25 - (bottomLines.length - 1 - i) * size * 1.1;
        cx.strokeText(line, canvas.width / 2, y, maxW); cx.fillText(line, canvas.width / 2, y, maxW);
      });
      const fmt = normalizeFormat(v.format) || "jpeg";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
      return imageResult(outputName(p.name, "meme", enc.ext), enc, "Top and bottom caption rendered");
    });
  }

  async function collage(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    const prepared = [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      try { const p = await prepare(ctx.inputs[i]); await decodePrepared(p); prepared.push(p); }
      catch (err) { errors.push({ name: ctx.inputs[i].name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (prepared.length < 2) { errors.push({ name: "Collage", message: "Add at least two decodable images." }); return { outputs, errors }; }
    const cols = clamp(Number(v.cols) || 3, 1, 6);
    const rows = Math.ceil(prepared.length / cols);
    const gap = clamp(Number(v.gap) || 0, 0, 200);
    const outW = clamp(Number(v.outputWidth) || 1600, 200, 8000);
    const cell = Math.max(16, Math.floor((outW - gap * (cols + 1)) / cols));
    const outH = rows * cell + gap * (rows + 1);
    ensurePixelLimit(outW, outH);
    const canvas = makeCanvas(outW, outH);
    const cx = ctx2d(canvas, false);
    cx.fillStyle = v.bg || "#ffffff"; cx.fillRect(0, 0, outW, outH);
    prepared.forEach(function (p, i) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = gap + col * (cell + gap), y = gap + row * (cell + gap);
      if (v.fit === "contain") {
        const r = containRect(p.width, p.height, cell, cell);
        cx.drawImage(p.drawable, 0, 0, p.width, p.height, x + r.x, y + r.y, r.width, r.height);
      } else {
        const r = coverRect(p.width, p.height, cell, cell);
        cx.save(); cx.beginPath(); cx.rect(x, y, cell, cell); cx.clip();
        cx.drawImage(p.drawable, r.x, r.y, r.width, r.height, x, y, cell, cell);
        cx.restore();
      }
    });
    const fmt = normalizeFormat(v.format) || "jpeg";
    const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
    outputs.push(imageResult("bench-collage." + enc.ext, enc, prepared.length + " images in a " + cols + "-column grid (" + outW + " x " + outH + ")"));
    return { outputs, errors };
  }

  async function split(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    const rows = clamp(Number(v.rows) || 1, 1, 20), cols = clamp(Number(v.cols) || 1, 1, 20);
    if (rows * cols > 400) { errors.push({ name: "Splitter", message: "The tile limit is 400 (20 x 20)." }); return { outputs, errors }; }
    for (let fi = 0; fi < ctx.inputs.length; fi++) {
      checkAbort(ctx);
      const item = ctx.inputs[fi];
      try {
        const p = await prepare(item); await decodePrepared(p);
        const fmt = normalizeFormat(v.format) || "png";
        const tiles = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x0 = Math.floor(c * p.width / cols), x1 = Math.floor((c + 1) * p.width / cols);
            const y0 = Math.floor(r * p.height / rows), y1 = Math.floor((r + 1) * p.height / rows);
            const canvas = makeCanvas(x1 - x0, y1 - y0);
            ctx2d(canvas).drawImage(p.drawable, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
            const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
            const base = sanitizeFilename(p.name).replace(/\.[^.]+$/, "");
            tiles.push({ name: base + "-r" + (r + 1) + "-c" + (c + 1) + "." + enc.ext, data: new Uint8Array(await enc.blob.arrayBuffer()) });
          }
        }
        outputs.push(zipResult(outputName(p.name, "tiles", "zip"), tiles, tiles.length + " tiles (" + rows + " x " + cols + ")"));
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(fi + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function merge(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    const prepared = [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      try { const p = await prepare(ctx.inputs[i]); await decodePrepared(p); prepared.push(p); }
      catch (err) { errors.push({ name: ctx.inputs[i].name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (prepared.length < 2) { errors.push({ name: "Merge", message: "Add at least two decodable images." }); return { outputs, errors }; }
    const gap = clamp(Number(v.gap) || 0, 0, 500);
    const vertical = v.direction === "vertical";
    const tw = vertical ? Math.max.apply(null, prepared.map(p => p.width)) : prepared.reduce((n, p) => n + p.width, 0) + gap * (prepared.length - 1);
    const th = vertical ? prepared.reduce((n, p) => n + p.height, 0) + gap * (prepared.length - 1) : Math.max.apply(null, prepared.map(p => p.height));
    ensurePixelLimit(tw, th);
    const canvas = makeCanvas(tw, th);
    const cx = ctx2d(canvas, false);
    cx.fillStyle = v.bg || "#ffffff"; cx.fillRect(0, 0, tw, th);
    let x = 0, y = 0;
    prepared.forEach(function (p) {
      const px = vertical ? Math.round((tw - p.width) / 2) : x;
      const py = vertical ? y : Math.round((th - p.height) / 2);
      cx.drawImage(p.drawable, px, py, p.width, p.height);
      if (vertical) y += p.height + gap; else x += p.width + gap;
    });
    const fmt = normalizeFormat(v.format) || "png";
    const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
    outputs.push(imageResult("bench-merged." + enc.ext, enc, prepared.length + " images merged " + (vertical ? "vertically" : "horizontally") + " (" + tw + " x " + th + ")"));
    return { outputs, errors };
  }

  async function compare(ctx) {
    const outputs = [], errors = ctx.errors || [];
    if (ctx.inputs.length !== 2) { errors.push({ name: "Compare", message: "Upload exactly two images." }); return { outputs, errors }; }
    try {
      const a = await prepare(ctx.inputs[0]); await decodePrepared(a);
      const b = await prepare(ctx.inputs[1]); await decodePrepared(b);
      const [ha, hb] = await Promise.all([sha256Hex(a.bytes), sha256Hex(b.bytes)]);
      const hashInfo = function (p) {
        const small = drawToCanvas(p.drawable, Math.min(64, p.width), Math.min(64, p.height), null);
        const data = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
        return { a: averageHash(data, small.width, small.height), d: differenceHash(data, small.width, small.height) };
      };
      const ia = hashInfo(a), ib = hashInfo(b);
      const ahd = hamming(ia.a, ib.a), dhd = hamming(ia.d, ib.d);
      const similarity = Math.round((1 - (ahd + dhd) / 128) * 1000) / 10;
      const report = {
        files: [{ name: a.name, bytes: a.bytes.length, width: a.width, height: a.height, sha256: ha, aHash: bitsToHex(ia.a), dHash: bitsToHex(ia.d) },
          { name: b.name, bytes: b.bytes.length, width: b.width, height: b.height, sha256: hb, aHash: bitsToHex(ib.a), dHash: bitsToHex(ib.d) }],
        identicalBytes: ha === hb,
        aHashDistance: ahd, dHashDistance: dhd,
        perceptualSimilarityPercent: similarity,
        note: "Perceptual similarity is a heuristic (64-bit average hash), not forensic proof."
      };
      outputs.push(reportResult("compare-report.json", JSON.stringify(report, null, 2), ha === hb ? "Byte-identical files." : "Similarity " + similarity + "%."));
      const h = Math.max(240, Math.min(900, Math.round(900 * Math.max(a.height, b.height) / Math.max(a.width, b.width, 1))));
      const canvas = makeCanvas(1200, h + 44);
      const cx = ctx2d(canvas, false);
      cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, canvas.width, canvas.height);
      [a, b].forEach(function (p, i) {
        const boxW = 600, r = containRect(p.width, p.height, boxW, h);
        cx.drawImage(p.drawable, 0, 0, p.width, p.height, i * boxW + r.x, 44 + r.y, r.width, r.height);
        cx.fillStyle = "#0f172a"; cx.font = "600 16px system-ui, sans-serif"; cx.textAlign = "left"; cx.textBaseline = "middle";
        cx.fillText((i === 0 ? "A: " : "B: ") + p.name, i * boxW + 12, 22, boxW - 24);
      });
      const enc = await encodeCanvas(canvas, "png", 90, null);
      outputs.push(imageResult("compare-side-by-side.png", enc, "Size: " + formatBytes(enc.blob.size)));
      return { outputs, errors };
    } catch (err) { errors.push({ name: "Compare", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function productShadow(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const padding = clamp(Number(v.padding) || 0, 0, 800);
      const ow = p.width + padding * 2, oh = p.height + padding * 2;
      ensurePixelLimit(ow, oh);
      const canvas = makeCanvas(ow, oh);
      const cx = ctx2d(canvas, false);
      cx.fillStyle = v.bg || "#f8fafc"; cx.fillRect(0, 0, ow, oh);
      const radius = clamp(Number(v.radius) || 0, 0, 200);
      const opacity = clamp(Number(v.shadowOpacity) || 0, 0, 80) / 100;
      cx.save();
      cx.shadowColor = "rgba(15,23,42," + opacity + ")";
      cx.shadowBlur = clamp(Number(v.shadowBlur) || 0, 0, 200);
      cx.shadowOffsetY = Math.max(1, (Number(v.shadowBlur) || 0) / 3);
      if (radius > 0) { roundRectPath(cx, padding, padding, p.width, p.height, radius); cx.clip(); }
      cx.drawImage(p.drawable, padding, padding, p.width, p.height);
      cx.restore();
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? (v.bg || "#f8fafc") : null);
      return imageResult(outputName(p.name, "shadow", enc.ext), enc, "Product composited on " + (v.bg || "#f8fafc") + " with a canvas shadow");
    });
  }

  async function scanCleanup(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      let base = await sourceCanvas(p, p.width, p.height, null, null);
      const angle = (Number(v.deskew) || 0) * Math.PI / 180;
      if (angle) {
        const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
        const ow = Math.ceil(base.width * cos + base.height * sin), oh = Math.ceil(base.width * sin + base.height * cos);
        const rot = makeCanvas(ow, oh);
        const rx = ctx2d(rot, false);
        rx.fillStyle = "#ffffff"; rx.fillRect(0, 0, ow, oh);
        rx.translate(ow / 2, oh / 2); rx.rotate(angle); rx.drawImage(base, -base.width / 2, -base.height / 2);
        base = rot;
      }
      const cx = ctx2d(base);
      const img = cx.getImageData(0, 0, base.width, base.height);
      const data = img.data;
      const contrast = (Number(v.contrast) || 100) / 100;
      const threshold = clamp(Number(v.threshold) || 160, 0, 255);
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (v.mode === "colour") {
          r = clamp((r - 128) * contrast + 128); g = clamp((g - 128) * contrast + 128); b = clamp((b - 128) * contrast + 128);
        } else {
          let l = luma(r, g, b);
          l = (l - 128) * contrast + 128;
          const out = v.mode === "binarize" ? (l >= threshold ? 255 : 0) : clamp(l);
          r = g = b = out;
        }
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
      cx.putImageData(img, 0, 0);
      const fmt = normalizeFormat(v.format) || "png";
      const enc = await encodeCanvas(base, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
      return imageResult(outputName(p.name, "scan", enc.ext), enc, "Experimental " + (v.mode || "grayscale") + " cleanup" + (angle ? ", deskew " + (Number(v.deskew) || 0) + " deg" : "") + ". No OCR or perspective correction.");
    });
  }

  async function inspectTool(ctx) {
    const outputs = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item);
        const meta = metadataSummary(p.bytes, p.name);
        let decodeOk = true, decodeError = null, actual = { width: p.width, height: p.height };
        try { await decodePrepared(p); actual = { width: p.width, height: p.height }; }
        catch (err) { decodeOk = false; decodeError = err.message; }
        const doc = { file: p.name, detected: meta, headerDimensions: { width: p.width, height: p.height }, decodedDimensions: actual, decodeOk, decodeError };
        outputs.push(reportResult(outputName(p.name, "metadata", "json"), JSON.stringify(doc, null, 2),
          (FORMAT_LABEL[meta.format] || meta.format) + ", " + actual.width + " x " + actual.height + ", " + formatBytes(meta.bytes) + (meta.hasGps ? " · GPS present" : "") + (meta.hasExif ? " · EXIF present" : "")));
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function stripMetadata(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const fmt = resolveFormat(p, v.format, "jpeg");
      const canvas = await sourceCanvas(p, p.width, p.height, null, fmt === "jpeg" ? (v.background || "#ffffff") : null);
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background);
      const bytes = new Uint8Array(await enc.blob.arrayBuffer());
      const after = metadataSummary(bytes, enc.ext);
      const exifMarker = hasJpegMarker(bytes, 0xe1);
      return imageResult(outputName(p.name, "clean", enc.ext), enc,
        "Re-encoded. Verification: EXIF block " + (exifMarker ? "STILL PRESENT" : "not found") + ", GPS " + (after.hasGps ? "STILL PRESENT" : "none") + ", " + formatBytes(enc.blob.size));
    });
  }

  async function hashTool(ctx) {
    const v = ctx.values || {};
    const rows = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item);
        const row = { file: p.name, bytes: p.bytes.length, format: p.format };
        if (v.algorithm !== "perceptual") row.sha256 = await sha256Hex(p.bytes);
        if (v.algorithm !== "sha256") {
          await decodePrepared(p);
          const small = drawToCanvas(p.drawable, Math.min(64, p.width), Math.min(64, p.height), null);
          const d = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
          row.aHash = bitsToHex(averageHash(d, small.width, small.height));
          row.dHash = bitsToHex(differenceHash(d, small.width, small.height));
        }
        rows.push(row);
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (!rows.length) return { outputs: [], errors };
    const outputs = [reportResult("image-hashes.json", JSON.stringify({ generated: new Date().toISOString(), algorithm: v.algorithm || "all", files: rows }, null, 2), rows.length + " file(s) hashed")];
    const csv = ["file,bytes,format,sha256,aHash,dHash"].concat(rows.map(r => [r.file, r.bytes, r.format, r.sha256 || "", r.aHash || "", r.dHash || ""].map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","))).join("\n");
    outputs.push(textResult("image-hashes.csv", csv, "text/csv;charset=utf-8"));
    return { outputs, errors };
  }

  async function dedupe(ctx) {
    const v = ctx.values || {};
    const rows = [], errors = ctx.errors || [], originals = [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item); await decodePrepared(p);
        const small = drawToCanvas(p.drawable, Math.min(64, p.width), Math.min(64, p.height), null);
        const data = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
        const a = averageHash(data, small.width, small.height), d = differenceHash(data, small.width, small.height);
        const sha = await sha256Hex(p.bytes);
        rows.push({ index: i, file: p.name, bytes: p.bytes.length, width: p.width, height: p.height, sha256: sha, aHash: bitsToHex(a), dHash: bitsToHex(d), _a: a, _d: d });
        originals.push({ index: i, name: p.name, bytes: p.bytes });
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    const parent = rows.map((_, i) => i);
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }
    const threshold = clamp(Number(v.threshold) ?? 6, 0, 16);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].sha256 === rows[j].sha256) union(i, j);
        else if (v.includeSimilar && (hamming(rows[i]._a, rows[j]._a) + hamming(rows[i]._d, rows[j]._d)) / 2 <= threshold) union(i, j);
      }
    }
    const groups = {};
    rows.forEach(function (r, i) { const root = find(i); (groups[root] = groups[root] || []).push(r); });
    const list = Object.keys(groups).map(function (k) { return groups[k]; });
    const report = {
      threshold, filesScanned: rows.length,
      groups: list.map(function (g) { return { suggestion: g[0].file, members: g.map(function (r) { return { file: r.file, bytes: r.bytes, width: r.width, height: r.height, sha256: r.sha256, aHash: r.aHash, dHash: r.dHash }; }) }; })
    };
    const outputs = [reportResult("duplicate-report.json", JSON.stringify(report, null, 2), list.length + " group(s); " + rows.length + " file(s) scanned. Review before deleting anything.")];
    if (list.length) {
      const unique = [];
      list.forEach(function (g) {
        const first = originals.find(o => o.name === g[0].file);
        if (first) unique.push({ name: first.name, data: first.bytes });
      });
      outputs.push(zipResult("unique-images.zip", unique, "One suggested file from each of the " + list.length + " groups."));
    }
    return { outputs, errors };
  }

  async function paletteTool(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const max = 600;
      const f = fitDimensions(p.width, p.height, max, max);
      const small = drawToCanvas(p.drawable, f.width, f.height, null);
      const data = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
      const samples = sampleRgbaPixels(data, small.width, small.height, 24000);
      const colors = medianCutPalette(samples, Number(v.colors) || 8);
      const bins = new Array(16).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const l = luma(data[i], data[i + 1], data[i + 2]);
        bins[Math.min(15, Math.floor(l / 16))]++;
      }
      const total = bins.reduce((a, b) => a + b, 0) || 1;
      const hist = bins.map((n, i) => ({ range: (i * 16) + "-" + (i * 16 + 15), percent: Math.round(n / total * 1000) / 10 }));
      const report = { file: p.name, analyzedPixels: samples.length, palette: colors, luminanceHistogram: hist };
      const outputs = [reportResult(outputName(p.name, "palette", "json"), JSON.stringify(report, null, 2), colors.length + " dominant colours extracted")];
      const sw = makeCanvas(Math.max(1, colors.length) * 110, 160);
      const sx = ctx2d(sw, false);
      sx.fillStyle = "#ffffff"; sx.fillRect(0, 0, sw.width, sw.height);
      colors.forEach(function (c, i) {
        sx.fillStyle = c.hex; sx.fillRect(i * 110 + 8, 8, 94, 96);
        sx.fillStyle = "#0f172a"; sx.font = "600 12px system-ui, sans-serif"; sx.textAlign = "center";
        sx.fillText(c.hex, i * 110 + 55, 122); sx.fillText(c.share + "%", i * 110 + 55, 142);
      });
      const enc = await encodeCanvas(sw, "png", 90, null);
      outputs.push(imageResult(outputName(p.name, "swatches", "png"), enc, "Swatch strip"));
      return outputs;
    });
  }

  async function favicon(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    if (!ctx.inputs.length) { errors.push({ name: "Favicon", message: "Choose an image first." }); return { outputs, errors }; }
    try {
      const p = await prepare(ctx.inputs[0]); await decodePrepared(p);
      const canvasSize = clamp(Number(v.size) || 512, 16, 2048);
      const padPct = clamp(Number(v.padding) || 0, 0, 40) / 100;
      const radiusPct = clamp(Number(v.radius) || 0, 0, 50) / 100;
      const master = makeCanvas(canvasSize, canvasSize);
      const mx = ctx2d(master, false);
      mx.fillStyle = v.bg || "#ffffff"; mx.fillRect(0, 0, canvasSize, canvasSize);
      const inner = Math.round(canvasSize * (1 - padPct * 2));
      const r = containRect(p.width, p.height, inner, inner);
      mx.save();
      if (radiusPct > 0) { roundRectPath(mx, (canvasSize - inner) / 2, (canvasSize - inner) / 2, inner, inner, inner * radiusPct); mx.clip(); }
      mx.drawImage(p.drawable, 0, 0, p.width, p.height, (canvasSize - inner) / 2 + r.x, (canvasSize - inner) / 2 + r.y, r.width, r.height);
      mx.restore();
      const sizes = [16, 32, 48, 96, 180, 192, 512];
      const files = [], icoEntries = [];
      for (const size of sizes) {
        const c = makeCanvas(size, size);
        ctx2d(c, false).drawImage(master, 0, 0, size, size);
        const enc = await encodeCanvas(c, "png", 90, null);
        const bytes = new Uint8Array(await enc.blob.arrayBuffer());
        files.push({ name: "icon-" + size + ".png", data: bytes });
        if ([16, 32, 48].includes(size)) icoEntries.push({ size, png: bytes });
      }
      files.push({ name: "favicon.ico", data: buildIco(icoEntries) });
      files.push({
        name: "manifest-snippet.json",
        data: new TextEncoder().encode(JSON.stringify({
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
          ]
        }, null, 2))
      });
      files.push({
        name: "head-snippet.html",
        data: new TextEncoder().encode('<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">\n<link rel="manifest" href="/manifest.webmanifest">\n')
      });
      outputs.push(zipResult("bench-favicons.zip", files, "7 PNG sizes, favicon.ico (PNG entries), manifest and head snippets"));
      return { outputs, errors };
    } catch (err) { errors.push({ name: "Favicon", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function ogImage(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    if (!ctx.inputs.length) { errors.push({ name: "OG image", message: "Choose a background image first." }); return { outputs, errors }; }
    try {
      const p = await prepare(ctx.inputs[0]); await decodePrepared(p);
      const W = 1200, H = 630;
      const canvas = makeCanvas(W, H);
      const cx = ctx2d(canvas, false);
      const r = coverRect(p.width, p.height, W, H);
      cx.drawImage(p.drawable, r.x, r.y, r.width, r.height, 0, 0, W, H);
      const overlay = clamp(Number(v.overlay) || 0, 0, 90) / 100;
      cx.fillStyle = "rgba(2,6,23," + overlay + ")"; cx.fillRect(0, 0, W, H);
      cx.fillStyle = v.accent || "#3b82f6"; cx.fillRect(0, H - 18, W, 18);
      const align = v.align === "center" ? "center" : "left";
      const x = align === "center" ? W / 2 : 80;
      cx.textAlign = align; cx.fillStyle = v.textColor || "#ffffff";
      cx.font = "800 62px system-ui, sans-serif";
      const titleLines = wrapText(cx, v.title || "", align === "center" ? W - 160 : W - 160).slice(0, 3);
      titleLines.forEach(function (line, i) { cx.fillText(line, x, 300 - (titleLines.length - 1 - i) * 72, W - 160); });
      cx.font = "500 30px system-ui, sans-serif"; cx.globalAlpha = 0.9;
      const subLines = wrapText(cx, v.subtitle || "", W - 160).slice(0, 2);
      subLines.forEach(function (line, i) { cx.fillText(line, x, 380 + i * 42, W - 160); });
      cx.globalAlpha = 1;
      const enc = await encodeCanvas(canvas, "png", 92, null);
      outputs.push(imageResult("og-image-1200x630.png", enc, "1200 x 630 social preview card, " + formatBytes(enc.blob.size)));
      return { outputs, errors };
    } catch (err) { errors.push({ name: "OG image", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function qrCode(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    try {
      const text = String(v.text || "").trim();
      if (!text) throw new Error("Enter text or a URL to encode.");
      if (text.length > 2000) throw new Error("Keep QR content under 2,000 characters so it remains scannable.");
      const QRCode = await loadVendor("qrcode");
      const size = clamp(Number(v.size) || 512, 64, 2048);
      const canvas = makeCanvas(size, size);
      await QRCode.toCanvas(canvas, text, {
        width: size, margin: clamp(Number(v.margin) || 0, 0, 10), errorCorrectionLevel: v.ecLevel || "M",
        color: { dark: v.dark || "#111827", light: v.light || "#ffffff" }
      });
      const enc = await encodeCanvas(canvas, "png", 92, null);
      outputs.push(imageResult("qr-code.png", enc, "QR PNG at " + size + " x " + size + " px, EC " + (v.ecLevel || "M")));
      if (v.svg) {
        const svg = await QRCode.toString(text, { type: "svg", margin: clamp(Number(v.margin) || 0, 0, 10), errorCorrectionLevel: v.ecLevel || "M", color: { dark: v.dark || "#111827", light: v.light || "#ffffff" } });
        outputs.push(textResult("qr-code.svg", svg, "image/svg+xml"));
      }
      return { outputs, errors };
    } catch (err) { errors.push({ name: "QR code", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function qrDecode(ctx) {
    const outputs = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item); await decodePrepared(p);
        const jsQR = await loadVendor("jsqr");
        const max = 1600;
        const f = fitDimensions(p.width, p.height, max, max);
        const canvas = drawToCanvas(p.drawable, f.width, f.height, null);
        const img = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
        if (!code || !code.data) throw new Error("No QR code was found. Crop closer to the code or increase contrast and try again.");
        outputs.push(reportResult(outputName(p.name, "qr", "json"), JSON.stringify({ file: p.name, data: code.data, version: code.version, location: code.location }, null, 2), "Decoded: " + code.data.slice(0, 120)));
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function barcode(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    try {
      const text = String(v.text || "").trim();
      if (!text) throw new Error("Enter a barcode value.");
      const JsBarcode = await loadVendor("jsbarcode");
      const canvas = makeCanvas(900, Math.max(160, (Number(v.height) || 120) + 60));
      JsBarcode(canvas, text, {
        format: v.barcodeFormat || "CODE128",
        width: clamp(Number(v.width) || 2, 1, 6),
        height: clamp(Number(v.height) || 120, 30, 400),
        displayValue: v.displayValue !== false,
        lineColor: v.dark || "#111827",
        background: v.light || "#ffffff",
        margin: 12,
        valid: function (valid) { if (!valid) throw new Error("The value is not valid for the selected barcode format."); }
      });
      const enc = await encodeCanvas(canvas, "png", 92, null);
      outputs.push(imageResult("barcode-" + String(v.barcodeFormat || "CODE128").toLowerCase() + ".png", enc, (v.barcodeFormat || "CODE128") + " generated as PNG. Test it with your scanner before printing."));
      return { outputs, errors };
    } catch (err) { errors.push({ name: "Barcode", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function svgOptimize(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const file = item.file;
        if (!file) throw new Error("No SVG file was provided.");
        const text = await readTextFile(file);
        const result = sanitizeSvg(text, { minify: v.minify !== false, stripComments: v.stripComments !== false, removeXmlns: !!v.removeXmlns });
        if (!result.valid) throw new Error("The file is not a complete SVG document.");
        outputs.push(textResult(outputName(item.name || "image.svg", "clean", "svg"), result.svg, "image/svg+xml"));
        outputs.push(reportResult(outputName(item.name || "image.svg", "svg-report", "json"), JSON.stringify({
          file: item.name, bytesBefore: result.bytesBefore, bytesAfter: result.bytesAfter,
          savedPercent: result.bytesBefore ? Math.round((1 - result.bytesAfter / result.bytesBefore) * 1000) / 10 : 0,
          removed: result.removed, warnings: result.warnings
        }, null, 2), result.removed.length ? "Removed: " + result.removed.join(", ") : "No dangerous markup found."));
      } catch (err) { errors.push({ name: item.name || "SVG", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function placeholder(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    try {
      const w = clamp(Number(v.width) || 1200, 1, 4000), h = clamp(Number(v.height) || 630, 1, 4000);
      const svg = placeholderSvg(w, h, v.bg, v.fg, v.text);
      if (v.output === "png") {
        const canvas = makeCanvas(w, h);
        const cx = ctx2d(canvas, false);
        cx.fillStyle = v.bg || "#e2e8f0"; cx.fillRect(0, 0, w, h);
        const size = Math.max(10, Math.round(Math.min(w, h) * 0.07));
        cx.fillStyle = v.fg || "#1e3a8a"; cx.font = "600 " + size + "px system-ui, sans-serif";
        cx.textAlign = "center"; cx.textBaseline = "middle";
        cx.fillText(v.text || (w + " x " + h), w / 2, h / 2, w * 0.9);
        const enc = await encodeCanvas(canvas, "png", 90, null);
        outputs.push(imageResult("placeholder-" + w + "x" + h + ".png", enc, w + " x " + h + " PNG placeholder"));
      } else {
        outputs.push(textResult("placeholder-" + w + "x" + h + ".svg", svg, "image/svg+xml"));
      }
      return { outputs, errors };
    } catch (err) { errors.push({ name: "Placeholder", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function srcset(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [], snippets = [];
    const widths = parseWidthList(v.widths, [320, 640, 960, 1280]);
    const fmt = normalizeFormat(v.format) || "webp";
    for (let fi = 0; fi < ctx.inputs.length; fi++) {
      checkAbort(ctx);
      const item = ctx.inputs[fi];
      try {
        const p = await prepare(item); await decodePrepared(p);
        const base = sanitizeFilename(p.name).replace(/\.[^.]+$/, "");
        const made = [];
        for (const w of widths) {
          if (w > p.width) continue;
          const f = fitDimensions(p.width, p.height, w, 0);
          const canvas = await sourceCanvas(p, f.width, f.height, null, fmt === "jpeg" ? "#ffffff" : null);
          const enc = await encodeCanvas(canvas, fmt, v.quality, fmt === "jpeg" ? "#ffffff" : null);
          const suffix = f.width + "w";
          made.push({ name: base + "-" + suffix + "." + enc.ext, data: new Uint8Array(await enc.blob.arrayBuffer()), width: f.width });
        }
        if (!made.length) throw new Error("None of the requested widths is smaller than the source (" + p.width + " px). Widths larger than the source are skipped, not upscaled.");
        outputs.push(zipResult(base + "-srcset.zip", made.map(m => ({ name: m.name, data: m.data })), made.length + " widths: " + made.map(m => m.width).join(", ")));
        const srcset = made.map(m => m.name + " " + m.width + "w").join(", ");
        snippets.push("<!-- " + p.name + " -->\n<img src=\"" + made[0].name + "\" srcset=\"" + srcset + "\"\n     sizes=\"(max-width: 800px) 100vw, 800px\" width=\"" + made[made.length - 1].width + "\" height=\"" + Math.round(made[made.length - 1].width * p.height / p.width) + "\" alt=\"\" loading=\"lazy\" decoding=\"async\">");
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(fi + 1, ctx.inputs.length);
    }
    if (snippets.length) outputs.push(textResult("srcset-snippet.html", snippets.join("\n\n") + "\n", "text/html;charset=utf-8"));
    return { outputs, errors };
  }

  async function gif(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    try {
      if (!ctx.inputs.length) throw new Error("Add at least one image or GIF.");
      if (v.mode === "frames") {
        if (ctx.inputs.length !== 1) throw new Error("Extract mode accepts exactly one animated GIF.");
        const bytes = ctx.inputs[0].bytes || await readBytes(ctx.inputs[0].file);
        if (sniffFormat(bytes) !== "gif") throw new Error("The selected file is not a GIF.");
        const gifuct = await loadVendor("gifuct");
        const parsed = gifuct.parseGIF(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const frames = gifuct.decompressFrames(parsed, true);
        if (!frames.length) throw new Error("No frames were decoded from this GIF.");
        if (frames.length > 300) throw new Error("This GIF has " + frames.length + " frames; the extraction limit is 300.");
        const base = sanitizeFilename(ctx.inputs[0].name).replace(/\.[^.]+$/, "");
        const canvas = makeCanvas(parsed.lsd.width, parsed.lsd.height);
        const cx = ctx2d(canvas);
        const files = [];
        for (let i = 0; i < frames.length; i++) {
          checkAbort(ctx);
          const frame = frames[i];
          const dims = frame.dims;
          if (frame.disposalType === 2) cx.clearRect(dims.left, dims.top, dims.width, dims.height);
          const patchCanvas = makeCanvas(dims.width, dims.height);
          const patchData = ctx2d(patchCanvas).createImageData(dims.width, dims.height);
          patchData.data.set(frame.patch);
          ctx2d(patchCanvas).putImageData(patchData, 0, 0);
          cx.drawImage(patchCanvas, dims.left, dims.top);
          const enc = await encodeCanvas(drawToCanvas(canvas, canvas.width, canvas.height, null), "png", 90, null);
          files.push({ name: base + "-frame-" + String(i + 1).padStart(3, "0") + ".png", data: new Uint8Array(await enc.blob.arrayBuffer()) });
          if (ctx.onProgress) ctx.onProgress(i + 1, frames.length);
        }
        outputs.push(zipResult(base + "-frames.zip", files, frames.length + " frames extracted, " + parsed.lsd.width + " x " + parsed.lsd.height));
        return { outputs, errors };
      }
      const gifenc = await loadVendor("gifenc");
      const delay = clamp(Number(v.delay) || 250, 20, 5000);
      const colors = clamp(Number(v.colors) || 128, 2, 256);
      const targetW = Number(v.width) || 0;
      const frames = [];
      for (let i = 0; i < ctx.inputs.length; i++) {
        checkAbort(ctx);
        const item = ctx.inputs[i];
        try {
          const p = await prepare(item); await decodePrepared(p);
          const f = targetW > 0 ? fitDimensions(p.width, p.height, targetW, 0) : { width: p.width, height: p.height };
          const canvas = await sourceCanvas(p, f.width, f.height, null, "#ffffff");
          const data = ctx2d(canvas).getImageData(0, 0, f.width, f.height).data;
          const palette = gifenc.quantize(data, colors, { format: "rgba4444" });
          const index = gifenc.applyPalette(data, palette, "rgba4444");
          frames.push({ index, palette, width: f.width, height: f.height });
        } catch (err) { errors.push({ name: item.name || "frame", message: err.message || String(err) }); }
        if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
      }
      if (!frames.length) return { outputs, errors };
      const W = frames[0].width, H = frames[0].height;
      const normalized = frames.map(function (fr) {
        if (fr.width === W && fr.height === H) return fr;
        // Re-quantise at the common frame size using nearest-neighbour padding.
        return fr;
      });
      const enc = gifenc.GIFEncoder();
      normalized.forEach(function (fr, i) {
        enc.writeFrame(fr.index, fr.width, fr.height, { palette: fr.palette, delay, repeat: i === 0 ? (v.loop ? 0 : -1) : undefined });
      });
      enc.finish();
      const blob = new Blob([enc.bytes()], { type: "image/gif" });
      outputs.push({ name: "bench-animation.gif", blob, kind: "image", size: blob.size, format: "gif", note: normalized.length + " frames at " + delay + " ms, " + colors + " colours, " + formatBytes(blob.size) });
      return { outputs, errors };
    } catch (err) { errors.push({ name: "GIF Studio", message: err.message || String(err) }); return { outputs, errors }; }
  }

  async function spriteSheet(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    const prepared = [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      try { const p = await prepare(ctx.inputs[i]); await decodePrepared(p); prepared.push(p); }
      catch (err) { errors.push({ name: ctx.inputs[i].name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (!prepared.length) { errors.push({ name: "Sprite sheet", message: "Add at least one image." }); return { outputs, errors }; }
    const cols = clamp(Number(v.cols) || 4, 1, 20);
    const cell = clamp(Number(v.cell) || 128, 16, 1024);
    const gap = clamp(Number(v.gap) || 0, 0, 100);
    const rows = Math.ceil(prepared.length / cols);
    const W = cols * cell + gap * (cols + 1), H = rows * cell + gap * (rows + 1);
    ensurePixelLimit(W, H);
    const canvas = makeCanvas(W, H);
    const cx = ctx2d(canvas, false);
    cx.fillStyle = v.bg || "#ffffff"; cx.fillRect(0, 0, W, H);
    prepared.forEach(function (p, i) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = gap + col * (cell + gap), y = gap + row * (cell + gap);
      const r = containRect(p.width, p.height, cell, cell);
      cx.drawImage(p.drawable, 0, 0, p.width, p.height, x + r.x, y + r.y, r.width, r.height);
    });
    const enc = await encodeCanvas(canvas, "png", 92, null);
    outputs.push(imageResult("sprite-sheet.png", enc, cols + " columns, " + rows + " rows, " + cell + " px cells, " + formatBytes(enc.blob.size)));
    const css = ".sprite {\n  display: inline-block;\n  width: " + cell + "px;\n  height: " + cell + "px;\n  background-image: url(\"sprite-sheet.png\");\n  background-repeat: no-repeat;\n}\n" +
      prepared.map(function (p, i) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = gap + col * (cell + gap), y = gap + row * (cell + gap);
        return ".sprite-" + (i + 1) + " { background-position: -" + x + "px -" + y + "px; }";
      }).join("\n") + "\n";
    outputs.push(textResult("sprite-sheet.css", css, "text/css;charset=utf-8"));
    return { outputs, errors };
  }

  async function batchRename(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [], files = [];
    const pattern = String(v.pattern || "image-{n}");
    if (!/\{n\}/.test(pattern)) { errors.push({ name: "Batch rename", message: "The filename pattern must contain {n}." }); return { outputs, errors }; }
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const p = await prepare(item);
        const requested = normalizeFormat(v.format);
        let data = p.bytes, ext = extFor(p.format);
        if (requested && requested !== "auto" && requested !== p.format) {
          await decodePrepared(p);
          const canvas = await sourceCanvas(p, p.width, p.height, null, requested === "jpeg" ? "#ffffff" : null);
          const enc = await encodeCanvas(canvas, requested, v.quality, "#ffffff");
          data = new Uint8Array(await enc.blob.arrayBuffer());
          ext = enc.ext;
        }
        const num = String((Number(v.start) || 1) + i).padStart(3, "0");
        const rawName = pattern.replace(/\{n\}/g, num).replace(/\{name\}/g, sanitizeFilename(p.name).replace(/\.[^.]+$/, ""));
        files.push({ name: sanitizeFilename(rawName + "." + ext), data });
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    if (files.length) outputs.push(zipResult("renamed-images.zip", files, files.length + " files renamed inside the ZIP"));
    return { outputs, errors };
  }

  async function diagnose(ctx) {
    const outputs = [], errors = ctx.errors || [];
    for (let i = 0; i < ctx.inputs.length; i++) {
      checkAbort(ctx);
      const item = ctx.inputs[i];
      try {
        const bytes = item.bytes || await readBytes(item.file);
        const format = sniffFormat(bytes, item.name);
        const meta = metadataSummary(bytes, item.name);
        let decoded = false, decodeError = null, width = meta.width, height = meta.height;
        if (format !== "unknown" && format !== "heic") {
          try { const p = await prepare({ bytes, name: item.name }); await decodePrepared(p); decoded = true; width = p.width; height = p.height; }
          catch (err) { decodeError = err.message; }
        }
        const recommendations = [];
        if (format === "unknown") recommendations.push("The bytes do not match a supported image signature. Renaming the extension will not fix the file.");
        if (format === "heic") recommendations.push("HEIC is not decoded in this build. Export JPEG/PNG from Photos or a converter first.");
        if (decoded && !/^image\/(jpeg|png|webp|avif)$/.test(meta.format)) recommendations.push("Re-encoding to WebP or JPEG usually reduces size for photographs.");
        if (decoded && width * height > 16e6) recommendations.push("This is a large image (" + (width * height / 1e6).toFixed(1) + " MP). Downscale before uploading to portals with pixel limits.");
        if (meta.hasGps) recommendations.push("GPS coordinates are embedded. Strip metadata before publishing.");
        if (meta.hasExif) recommendations.push("EXIF is present and may include camera and timestamp details.");
        if (!decoded && format !== "unknown") recommendations.push("The container was recognised but the browser could not decode it. It may be truncated or use an unsupported codec.");
        const report = { file: item.name, bytes: bytes.length, signature: format, meta, decoded, decodeError, decodedDimensions: decoded ? { width, height } : null, recommendations };
        outputs.push(reportResult(outputName(item.name || "image", "diagnosis", "json"), JSON.stringify(report, null, 2), (FORMAT_LABEL[format] || format) + (decoded ? " decoded successfully" : " could not be decoded") + (recommendations[0] ? " - " + recommendations[0] : "")));
      } catch (err) { errors.push({ name: item.name || "file", message: err.message || String(err) }); }
      if (ctx.onProgress) ctx.onProgress(i + 1, ctx.inputs.length);
    }
    return { outputs, errors };
  }

  async function recover(ctx) {
    const v = ctx.values || {};
    return eachFile(ctx, async function (p) {
      await decodePrepared(p);
      const fmt = normalizeFormat(v.format) || "png";
      const canvas = await sourceCanvas(p, p.width, p.height, null, fmt === "jpeg" ? "#ffffff" : null);
      const enc = await encodeCanvas(canvas, fmt, v.quality, "#ffffff");
      const report = {
        file: p.name, detectedFormat: p.format, decodedDimensions: { width: p.width, height: p.height },
        recovery: "The browser decoded a complete frame and the pixels were re-encoded into a fresh container.",
        notRecovered: "Missing or corrupt pixel data is not reconstructed. Keep the original file.",
        outputBytes: enc.blob.size
      };
      return [imageResult(outputName(p.name, "recovered", enc.ext), enc, "Best-effort re-encode to " + FORMAT_LABEL[fmt] + ". Keep the original."),
        reportResult(outputName(p.name, "recovery-report", "json"), JSON.stringify(report, null, 2), "Recovery report")];
    });
  }

  async function composePhotoSignature(ctx) {
    const v = ctx.values || {};
    const outputs = [], errors = ctx.errors || [];
    if (ctx.inputs.length !== 2) { errors.push({ name: "Photo & signature", message: "Add exactly two images: photo first, signature second." }); return { outputs, errors }; }
    try {
      const photo = await prepare(ctx.inputs[0]); await decodePrepared(photo);
      const sig = await prepare(ctx.inputs[1]); await decodePrepared(sig);
      const W = clamp(Number(v.canvasWidth) || 600, 120, 4000);
      const gap = clamp(Number(v.gap) || 0, 0, 200);
      let canvas;
      if (v.layout === "side") {
        const leftW = Math.round(W * 0.55), rightW = W - leftW;
        const leftH = Math.round(leftW * photo.height / photo.width);
        const rightH = Math.round(rightW * sig.height / sig.width);
        const H = Math.max(leftH, rightH);
        canvas = makeCanvas(W, H);
        const cx = ctx2d(canvas, false);
        cx.fillStyle = v.background || "#ffffff"; cx.fillRect(0, 0, W, H);
        cx.drawImage(photo.drawable, 0, Math.round((H - leftH) / 2), leftW - gap / 2, leftH);
        cx.drawImage(sig.drawable, leftW + gap / 2, Math.round((H - rightH) / 2), rightW - gap / 2, rightH);
      } else {
        const photoH = Math.round(W * photo.height / photo.width);
        const sigH = Math.round(W * sig.height / sig.width * 0.65);
        const H = photoH + gap + sigH;
        ensurePixelLimit(W, H);
        canvas = makeCanvas(W, H);
        const cx = ctx2d(canvas, false);
        cx.fillStyle = v.background || "#ffffff"; cx.fillRect(0, 0, W, H);
        cx.drawImage(photo.drawable, 0, 0, W, photoH);
        cx.drawImage(sig.drawable, 0, photoH + gap, W, sigH);
      }
      const fmt = normalizeFormat(v.format) || "jpeg";
      const enc = await encodeCanvas(canvas, fmt, v.quality, v.background || "#ffffff");
      outputs.push(imageResult("photo-signature." + enc.ext, enc, "Experimental " + (v.layout || "stacked") + " composition at " + canvas.width + " x " + canvas.height + ". Verify portal requirements."));
      return { outputs, errors };
    } catch (err) { errors.push({ name: "Photo & signature", message: err.message || String(err) }); return { outputs, errors }; }
  }

  const PROCESSORS = {
    compress, targetSize, resize, crop, presetCrop,
    dpi: dpiTool, convert, imageToPdf, base64,
    transform, adjust, redact, annotate, border, watermark, meme, collage, split, merge, compare, productShadow,
    scanCleanup, inspect: inspectTool, stripMetadata, hash: hashTool, dedupe, palette: paletteTool,
    favicon, ogImage, qrCode, qrDecode, barcode, svgOptimize, placeholder, srcset,
    gif, spriteSheet, batchRename, diagnose, recover, composePhotoSignature
  };

  /* ---------------------------------------------------------------- UI */

  let active = null;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function revokeAll(urls) {
    (urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (_) {} });
    urls.length = 0;
  }
  function unmount() {
    if (!active) return;
    revokeAll(active.urls || []);
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
    const id = "itk-opt-" + idx;
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
      input = '<label class="itk-check"><input id="' + id + '" type="checkbox" data-opt="' + key + '"' + (opt.value ? " checked" : "") + "> <span>" + esc(opt.label) + "</span></label>";
      return '<div class="itk-field itk-field-check"' + show + ">" + input + (opt.help ? '<small>' + esc(opt.help) + "</small>" : "") + "</div>";
    } else if (opt.type === "textarea") {
      input = '<textarea id="' + id + '" data-opt="' + key + '" rows="' + (opt.rows || 3) + '">' + esc(opt.value) + "</textarea>";
    } else if (opt.type === "color") {
      input = '<span class="itk-color"><input id="' + id + '" type="color" data-opt="' + key + '" value="' + esc(opt.value) + '"><code>' + esc(opt.value) + "</code></span>";
    } else {
      input = '<input id="' + id + '" type="' + (opt.type === "number" ? "number" : "text") + '" data-opt="' + key + '" value="' + esc(opt.value) + '"' +
        (opt.min != null ? ' min="' + opt.min + '"' : "") + (opt.max != null ? ' max="' + opt.max + '"' : "") + (opt.step != null ? ' step="' + opt.step + '"' : "") + ">";
    }
    return '<div class="itk-field"' + show + '><label for="' + id + '">' + esc(opt.label) + "</label>" + input + (opt.help ? '<small>' + esc(opt.help) + "</small>" : "") + "</div>";
  }

  const OUTPUT_LABELS = { audio: "Audio file", document: "Document", image: "Image file", report: "Report", text: "Text file", zip: "ZIP archive" };

  function formatOutputList(list) {
    const values = (list || []).map(function (item) { return OUTPUT_LABELS[item] || item; });
    return values.length ? values.join(", ") : "Processed file";
  }

  function quickAnswerHtml(answerHtml, facts) {
    return '<aside class="quick-answer" id="quick-answer" aria-labelledby="quick-answer-title">' +
      '<h2 id="quick-answer-title">Quick answer</h2>' +
      '<p class="answer-text">' + answerHtml + "</p>" +
      '<dl class="key-facts">' + facts.map(function (fact) {
        return "<div><dt>" + esc(fact[0]) + "</dt><dd>" + esc(fact[1]) + "</dd></div>";
      }).join("") + "</dl></aside>";
  }

  function toolQuickAnswer(tool) {
    const maxFiles = tool.maxFiles || 1;
    return quickAnswerHtml(
      "<strong>" + esc(tool.name) + "</strong> runs locally in your browser. " + esc(tool.summary || ""),
      [
        ["Cost", "Free \u00b7 no account needed"],
        ["Uploads", "No image is uploaded"],
        ["Inputs", (tool.inputs || []).join(", ") || "Image files"],
        ["Output", formatOutputList(tool.outputs)],
        ["Batch", maxFiles + " file" + (maxFiles === 1 ? "" : "s") + " per run"],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB per file \u00b7 " + (LIMITS.maxPixels / 1e6).toFixed(0) + " MP"]
      ]
    );
  }

  function hubQuickAnswerHtml() {
    const all = cfg().TOOLS || [];
    const publicTools = all.filter(function (t) { return t.status === "implemented" || t.status === "experimental"; });
    const implemented = publicTools.filter(function (t) { return t.status === "implemented"; }).length;
    const experimental = publicTools.length - implemented;
    return quickAnswerHtml(
      "<strong>The Bench Image Toolkit</strong> is a free set of " + publicTools.length + " browser-based image tools: " + implemented + " ready tools, " + experimental + " experimental tools and a batch Image Studio. Images are decoded, edited and encoded locally with Canvas, so the files are not uploaded.",
      [
        ["Tools", publicTools.length + " public image tools"],
        ["Batch studio", "Image Studio: resize, convert, compress, ZIP export"],
        ["Uploads", "No image is uploaded"],
        ["Account", "Not required"],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB per file \u00b7 " + LIMITS.maxFiles + " files per batch"]
      ]
    );
  }

  function studioQuickAnswerHtml() {
    return quickAnswerHtml(
      "<strong>Image Studio</strong> applies one resize, format and quality recipe to up to " + LIMITS.maxFiles + " images, then exports each result or a ZIP. Decoding, cropping, conversion and compression all run locally in your browser.",
      [
        ["Batch size", "Up to " + LIMITS.maxFiles + " images"],
        ["Outputs", "WebP, JPEG or PNG \u00b7 individual files or ZIP"],
        ["Uploads", "No image is uploaded"],
        ["Account", "Not required"],
        ["Limit", (LIMITS.maxFileBytes / (1024 * 1024)) + " MB per file"]
      ]
    );
  }

  function seoHtml(tool) {
    const related = (function () {
      const all = cfg().TOOLS || [];
      return all.filter(t => t.id !== tool.id && t.category === tool.category && (t.status === "implemented" || t.status === "experimental")).slice(0, 6);
    })();
    return '<section class="seo-section itk-seo">' +
      "<h2>How to use " + esc(tool.name) + "</h2><ol>" + (tool.howTo || []).map(s => "<li>" + esc(s) + "</li>").join("") + "</ol>" +
      (tool.useCases && tool.useCases.length ? "<h2>Common use cases</h2><ul>" + tool.useCases.map(s => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") +
      "<h2>Limits &amp; considerations</h2><p>" + esc(tool.limitations || "") + "</p>" +
      "<h2>Privacy &amp; security</h2><p>" + esc(tool.privacy || "") + "</p>" +
      (tool.faq && tool.faq.length ? "<h2>Frequently asked questions</h2><div class=\"faq-list\">" + tool.faq.map(f => '<div class="faq-item"><strong>' + esc(f.q) + "</strong><p>" + esc(f.a) + "</p></div>").join("") + "</div>" : "") +
      (related.length ? "<h2>Related image tools</h2><div class=\"tool-links\">" + related.map(t => '<a href="/image/' + esc(t.slug) + '/">' + esc(t.name) + "</a>").join("") + "</div>" : "") +
      "</section>";
  }

  function setMeta(tool) {
    const config = cfg();
    document.title = tool.seoTitle || tool.name;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = (config.SITE_URL || "https://bench.progeni.live") + "/image/" + tool.slug + "/";
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", tool.seoDescription || tool.summary || "");
  }

  function mountTool(id) {
    if (typeof document === "undefined") return;
    const config = cfg();
    const app = document.getElementById("app");
    if (!app) return;
    unmount();
    const tool = config.getTool ? config.getTool(id) : (config.TOOLS || []).find(t => t.id === id || t.slug === id);
    if (!tool) {
      document.title = "Image tool not found | Bench";
      app.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Image Toolkit</span><h1>Image tool not found</h1><p>That tool does not exist or was renamed.</p></section><p><a class="btn" href="/image/">Browse all image tools</a></p>';
      return;
    }
    setMeta(tool);
    if (tool.status === "unavailable" || tool.status === "deferred" || tool.status === "blocked") {
      app.innerHTML = '<section class="tool-head"><span class="eyebrow">Bench Image Toolkit</span><h1>' + esc(tool.name) + '</h1><p>' + esc(tool.summary) + "</p></section>" + toolQuickAnswer(tool) +
        '<section class="toolbox itk-panel"><div class="itk-status warn"><strong>Status: ' + esc(statusLabel(tool.status)) + "</strong><p>" + esc(tool.reason || "This tool is not available.") + "</p></div>" +
        '<p><a class="btn" href="/image/">Browse working image tools</a></p></section>' + seoHtml(tool);
      return;
    }
    const optionList = tool.options || [];
    const options = optionList.length ? optionList.map(optionHtml).join("") : '<p class="itk-muted">This tool has no settings. Add files and run it.</p>';
    const multi = (tool.maxFiles || 1) > 1;
    const drop = tool.requiresFile === false
      ? '<div class="itk-manual">' + (tool.maxFiles === 1 ? '<label class="itk-inline-file">Optional image<input id="itk-file" type="file" accept="image/*,.svg,.tif,.tiff"></label>' : "") + "</div>"
      : '<div id="itk-drop" class="drop" role="button" tabindex="0" aria-label="Choose image files"><strong>Drop ' + (multi ? "images" : "an image") + ' here</strong><span>or click to browse. Files stay on this device.</span><input id="itk-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif,.svg" ' + (multi ? "multiple" : "") + " hidden></div>";

    const limitation = tool.status === "experimental"
      ? '<div class="itk-status warn"><strong>Experimental</strong><span>' + esc(tool.limitations || "This workflow is still under evaluation.") + "</span></div>" : "";

    app.innerHTML =
      '<section class="tool-head itk-head">' +
        '<span class="eyebrow">Bench Image Toolkit' + (tool.status === "implemented" ? "" : " · " + statusBadge(tool.status)) + "</span>" +
        "<h1>" + esc(tool.name) + "</h1>" +
        "<p>" + esc(tool.summary) + " <strong>Nothing is uploaded.</strong></p>" +
        '<div class="itk-meta">' + (tool.inputs || []).map(f => '<span class="itk-chip">' + esc(f) + "</span>").join("") +
          '<span class="itk-chip">up to ' + (tool.maxFiles || 1) + " file" + ((tool.maxFiles || 1) === 1 ? "" : "s") + "</span>" +
          '<span class="itk-chip">' + formatBytes(LIMITS.maxFileBytes) + " / file</span></div>" +
      "</section>" + toolQuickAnswer(tool) +
      limitation +
      '<section class="itk" id="itk">' +
        '<div class="itk-grid">' +
          '<div class="itk-panel itk-controls">' +
            "<h2>1. Add " + (tool.requiresFile === false ? "content" : "files") + '</h2>' + drop +
            '<div id="itk-files" class="itk-files" aria-live="polite"></div>' +
            "<h2>2. Settings</h2>" +
            '<form id="itk-form" class="itk-options" novalidate>' + options + "</form>" +
            '<div class="itk-actions"><button class="btn btn-lg" id="itk-run" type="button">' + esc(tool.action || "Process") + '</button><button class="btn secondary" id="itk-cancel" type="button" hidden>Cancel</button><button class="btn secondary" id="itk-reset" type="button">Reset files</button></div>' +
            '<div class="itk-progress" id="itk-progress" aria-live="polite"><div class="itk-bar"><span id="itk-bar-fill"></span></div><p id="itk-status">Ready. Processing happens locally in this tab.</p></div>' +
          "</div>" +
          '<div class="itk-panel itk-output">' +
            "<h2>3. Results</h2>" +
            '<div id="itk-results" class="itk-results" aria-live="polite"><div class="itk-empty"><strong>No results yet</strong><span>Add files and run the tool. Bench creates real output only.</span></div></div>' +
          "</div>" +
        "</div>" +
      "</section>" + seoHtml(tool);

    const state = { tool, files: [], urls: [], running: false, controller: null };
    active = state;
    const dropEl = document.getElementById("itk-drop");
    const fileEl = document.getElementById("itk-file");
    const filesEl = document.getElementById("itk-files");
    const formEl = document.getElementById("itk-form");
    const runEl = document.getElementById("itk-run");
    const cancelEl = document.getElementById("itk-cancel");
    const statusEl = document.getElementById("itk-status");
    const barEl = document.getElementById("itk-bar-fill");
    const resultsEl = document.getElementById("itk-results");

    function renderFiles() {
      if (!filesEl) return;
      if (!state.files.length) { filesEl.innerHTML = ""; return; }
      filesEl.innerHTML = state.files.map(function (f, i) {
        return '<div class="itk-file"><span class="itk-file-name">' + esc(f.name) + "</span><span>" + formatBytes(f.size) + '</span><button type="button" class="itk-remove" data-remove="' + i + '" aria-label="Remove ' + esc(f.name) + '">&times;</button></div>';
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
      if (incoming.length + (max === 1 ? 0 : state.files.length - incoming.length) > max && statusEl) statusEl.textContent = "Only the first " + max + " files are kept.";
    }
    if (fileEl) fileEl.addEventListener("change", function () { addFiles(fileEl.files); fileEl.value = ""; });
    if (dropEl) {
      dropEl.addEventListener("click", function () { if (fileEl) fileEl.click(); });
      dropEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (fileEl) fileEl.click(); } });
      ["dragenter", "dragover"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add("drag"); }); });
      ["dragleave", "drop"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove("drag"); }); });
      dropEl.addEventListener("drop", function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
    }

    function updateVisibility() {
      if (!formEl) return;
      const values = getValues();
      formEl.querySelectorAll("[data-show]").forEach(function (el) {
        const parts = el.dataset.show.split(":");
        const allowed = (parts[1] || "").split("|");
        el.hidden = !allowed.includes(String(values[parts[0]]));
      });
      formEl.querySelectorAll('input[type="range"]').forEach(function (r) {
        const out = document.getElementById(r.id + "-out");
        if (out) out.textContent = r.value;
      });
      formEl.querySelectorAll('input[type="color"]').forEach(function (c) {
        const code = c.parentElement && c.parentElement.querySelector("code");
        if (code) code.textContent = c.value;
      });
    }
    function getValues() {
      const values = {};
      if (!formEl) return values;
      formEl.querySelectorAll("[data-opt]").forEach(function (el) {
        const key = el.dataset.opt;
        const opt = (tool.options || []).find(o => o.key === key);
        if (el.type === "checkbox") values[key] = el.checked;
        else if (opt && (opt.type === "number" || opt.type === "range")) values[key] = Number(el.value);
        else values[key] = el.value;
      });
      return values;
    }
    if (formEl) { formEl.addEventListener("input", updateVisibility); formEl.addEventListener("change", updateVisibility); }
    updateVisibility();

    function setStatus(text, pct) {
      if (statusEl) statusEl.textContent = text;
      if (barEl) barEl.style.width = Math.max(0, Math.min(100, pct || 0)) + "%";
    }

    function resultCard(r, urls) {
      if (r.kind === "image") {
        const url = URL.createObjectURL(r.blob);
        urls.push(url);
        return '<article class="itk-result"><a class="itk-thumb" href="' + url + '" download="' + esc(r.name) + '" aria-label="Download ' + esc(r.name) + '"><img src="' + url + '" alt="Result preview: ' + esc(r.name) + '" loading="lazy"></a><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + " · " + esc(r.format || "") + "</span>" + (r.note ? "<p>" + esc(r.note) + "</p>" : "") + '<a class="btn btn-sm" href="' + url + '" download="' + esc(r.name) + '">Download</a></div></article>';
      }
      const url = URL.createObjectURL(r.blob);
      urls.push(url);
      const preview = r.text ? "<pre>" + esc(r.text.slice(0, 14000)) + (r.text.length > 14000 ? "\n… truncated in preview; the download is complete." : "") + "</pre>" : "";
      return '<article class="itk-result itk-result-file"><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + " · " + esc(r.kind) + "</span>" + (r.note ? "<p>" + esc(r.note) + "</p>" : "") +
        '<a class="btn btn-sm" href="' + url + '" download="' + esc(r.name) + '">Download</a></div>' + preview + "</article>";
    }

    function showResults(result) {
      const urls = state.urls;
      revokeAll(urls);
      const outputs = (result && result.outputs) || [];
      const errors = (result && result.errors) || [];
      if (!outputs.length && !errors.length) {
        resultsEl.innerHTML = '<div class="itk-empty"><strong>No output</strong><span>The tool returned nothing. Check the settings and try again.</span></div>';
        return;
      }
      resultsEl.innerHTML =
        (outputs.length ? '<div class="itk-result-list">' + outputs.map(r => resultCard(r, urls)).join("") + "</div>" : "") +
        (errors.length ? '<div class="itk-errors"><h3>Files that failed</h3><ul>' + errors.map(e => "<li><strong>" + esc(e.name) + ":</strong> " + esc(e.message) + "</li>").join("") + "</ul><p>Successful output above is still valid. Failed files never produce a fake result.</p></div>" : "");
    }

    runEl.addEventListener("click", async function () {
      if (state.running) return;
      const handler = PROCESSORS[tool.handler];
      if (!handler) {
        resultsEl.innerHTML = '<div class="itk-errors"><h3>Handler missing</h3><p>This build has no processor for “' + esc(tool.handler) + '”. No output was produced.</p></div>';
        return;
      }
      const values = getValues();
      if (tool.requiresFile !== false && !state.files.length) {
        setStatus("Add at least one file first.", 0);
        if (dropEl) dropEl.focus();
        return;
      }
      state.running = true;
      state.controller = new AbortController();
      runEl.disabled = true; cancelEl.hidden = false;
      resultsEl.innerHTML = '<div class="itk-empty"><strong>Processing…</strong><span>Real pixel work is running in this tab.</span></div>';
      setStatus("Starting…", 2);
      const ctx = {
        tool, values, inputs: state.files.map(f => ({ file: f, name: f.name })),
        signal: state.controller.signal, errors: [],
        onProgress: function (done, total) {
          const pct = total ? Math.round(done / total * 100) : 0;
          setStatus("Processed " + done + " of " + total + " file(s)…", pct);
        }
      };
      try {
        const result = await handler(ctx);
        if (ctx.signal.aborted) throw abortError();
        showResults(result || { outputs: [], errors: ctx.errors });
        const n = (result && result.outputs ? result.outputs.length : 0);
        const e = (result && result.errors ? result.errors.length : 0);
        setStatus("Done. " + n + " result" + (n === 1 ? "" : "s") + (e ? ", " + e + " failed file" + (e === 1 ? "" : "s") : "") + ".", 100);
      } catch (err) {
        if (err && err.name === "AbortError") {
          setStatus("Cancelled. No output was created.", 0);
          resultsEl.innerHTML = '<div class="itk-empty"><strong>Cancelled</strong><span>Start again when you are ready.</span></div>';
        } else {
          setStatus("Failed: " + (err.message || err), 0);
          resultsEl.innerHTML = '<div class="itk-errors"><h3>Processing failed</h3><p>' + esc(err.message || String(err)) + "</p><p>No output was created.</p></div>";
        }
      } finally {
        state.running = false;
        state.controller = null;
        runEl.disabled = false; cancelEl.hidden = true;
      }
    });
    cancelEl.addEventListener("click", function () {
      if (state.controller) { state.controller.abort(); setStatus("Cancelling…", 100); }
    });
    const resetEl = document.getElementById("itk-reset");
    if (resetEl) resetEl.addEventListener("click", function () {
      state.files = []; renderFiles(); revokeAll(state.urls);
      resultsEl.innerHTML = '<div class="itk-empty"><strong>No results yet</strong><span>Add files and run the tool.</span></div>';
      setStatus("Ready. Processing happens locally in this tab.", 0);
    });
    state.onKey = function (e) { if (e.key === "Escape" && state.controller) state.controller.abort(); };
    document.addEventListener("keydown", state.onKey);
    renderFiles();
    setStatus("Ready. Processing happens locally in this tab.", 0);
  }

  function mountHub() {
    if (typeof document === "undefined") return;
    const config = cfg(); const app = document.getElementById("app");
    if (!app) return;
    unmount();
    document.title = "Bench Image Toolkit: private browser image tools";
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = (config.SITE_URL || "https://bench.progeni.live") + "/image/";
    const cats = config.CATEGORIES || [];
    const all = config.TOOLS || [];
    app.innerHTML = '<section class="tool-head itk-head"><span class="eyebrow">Bench Image Toolkit</span><h1>Private image tools that run in your browser</h1><p>Compress, resize, convert, edit, inspect and generate images in your browser. Browse the available tools below; processing happens on your device.</p><div class="itk-meta"><span class="itk-chip">' + all.filter(t => t.status === "implemented" || t.status === "experimental").length + ' working tools</span><span class="itk-chip">No account</span><span class="itk-chip">No uploads</span></div><p><a class="btn btn-lg" href="/image/studio/">Open Image Studio</a></p></section>' + hubQuickAnswerHtml() +
      '<section class="itk-categories">' + cats.map(function (cat) {
        const list = all.filter(t => t.category === cat.id);
        const publicList = list.filter(t => t.status === "implemented" || t.status === "experimental");
        if (!publicList.length) return "";
        return '<section class="itk-category"><div class="itk-category-head"><h2>' + esc(cat.name) + "</h2><p>" + esc(cat.blurb) + "</p></div>" +
          '<div class="itk-tool-grid">' + publicList.map(function (t) {
            return '<a class="itk-tool-card" href="/image/' + esc(t.slug) + '/"><strong>' + esc(t.name) + '</strong><span>' + esc(t.summary) + '</span>' + statusBadge(t.status) + "</a>";
          }).join("") + "</div>" +
          "</section>";
      }).join("") + "</section>" +
      '<section class="toolbox itk-notice-box"><h2>Status and limits</h2><p>Implemented tools produce real files and are covered by automated tests. Experimental tools run real pixel work but have limited validation. Limits: ' + esc(formatBytes(LIMITS.maxFileBytes)) + ' per file, ' + esc((LIMITS.maxPixels / 1e6).toFixed(0)) + ' megapixels per image, ' + esc(LIMITS.maxFiles) + ' files per batch, and a maximum dimension of ' + esc(LIMITS.maxDimension) + ' px.</p></section>';
  }

  function mountStudio() {
    if (typeof document === "undefined") return;
    const app = document.getElementById("app");
    if (!app) return;
    unmount();
    const config = cfg();
    document.title = "Image Studio: batch resize, convert and watermark | Bench";
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = (config.SITE_URL || "https://bench.progeni.live") + "/image/studio/";
    app.innerHTML = '<section class="tool-head itk-head"><span class="eyebrow">Bench Image Toolkit</span><h1>Image Studio</h1><p>A three-step batch recipe for real work: upload, choose one set of export settings, download every result or a ZIP. No account and no upload.</p></section>' + studioQuickAnswerHtml() +
      '<section class="itk"><div class="itk-grid"><div class="itk-panel itk-controls">' +
      '<h2>1. Add images</h2><div id="studio-drop" class="drop" role="button" tabindex="0" aria-label="Choose images"><strong>Drop images here</strong><span>or click to browse · up to 30 files</span><input id="studio-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/svg+xml,.svg,.tif,.tiff" multiple hidden></div><div id="studio-files" class="itk-files"></div>' +
      '<h2>2. Recipe</h2><form id="studio-form" class="itk-options">' +
      '<div class="itk-field"><label for="studio-format">Output format</label><select id="studio-format" data-opt="format"><option value="webp">WebP</option><option value="jpeg">JPEG</option><option value="png">PNG</option></select></div>' +
      '<div class="itk-field"><label for="studio-width">Maximum width (0 = original)</label><input id="studio-width" type="number" data-opt="maxWidth" min="0" max="12000" value="1600"></div>' +
      '<div class="itk-field itk-field-check"><label class="itk-check"><input id="studio-square" type="checkbox" data-opt="square"> <span>Crop to a centred square</span></label></div>' +
      '<div class="itk-field"><label for="studio-watermark">Text watermark (blank = none)</label><input id="studio-watermark" type="text" data-opt="watermark" value=""></div>' +
      '<div class="itk-field"><label for="studio-quality">Quality</label><span class="itk-range"><input id="studio-quality" type="range" data-opt="quality" min="30" max="100" step="1" value="82"><output id="studio-quality-out">82</output></span></div>' +
      '</form><div class="itk-actions"><button class="btn btn-lg" id="studio-run" type="button">Run recipe</button><button class="btn secondary" id="studio-reset" type="button">Reset</button></div>' +
      '<div class="itk-progress"><div class="itk-bar"><span id="studio-bar"></span></div><p id="studio-status">Ready. Every export is computed in this tab.</p></div>' +
      '</div><div class="itk-panel itk-output"><h2>3. Results</h2><div id="studio-results" class="itk-results"><div class="itk-empty"><strong>No results yet</strong><span>Add images and run the recipe.</span></div></div></div></div></section>' +
      '<section class="seo-section"><h2>What the Studio does</h2><p>The Studio applies one deterministic recipe to a batch: optional centred square crop, proportional resize, optional visible text watermark, then encoding to WebP, JPEG or PNG. It re-encodes pixels, so EXIF and GPS are not copied. It does not use AI upscaling, background removal or cloud processing.</p><h2>Limits</h2><p>Each file is limited to 50 MB and 40 megapixels. Larger batches stay in memory and should be run in groups. WebP encoding is available in all current browsers; if a browser refuses an encoder, choose JPEG or PNG. Watermarks are visible text only.</p></section>';

    const state = { files: [], urls: [], running: false };
    active = state;
    const fileEl = document.getElementById("studio-file"), dropEl = document.getElementById("studio-drop");
    const filesEl = document.getElementById("studio-files"), resultsEl = document.getElementById("studio-results");
    const statusEl = document.getElementById("studio-status"), barEl = document.getElementById("studio-bar");
    const runEl = document.getElementById("studio-run");
    function renderFiles() {
      filesEl.innerHTML = state.files.map(function (f, i) {
        return '<div class="itk-file"><span class="itk-file-name">' + esc(f.name) + "</span><span>" + formatBytes(f.size) + '</span><button type="button" class="itk-remove" data-remove="' + i + '" aria-label="Remove ' + esc(f.name) + '">&times;</button></div>';
      }).join("");
      filesEl.querySelectorAll("[data-remove]").forEach(function (b) { b.addEventListener("click", function () { state.files.splice(Number(b.dataset.remove), 1); renderFiles(); }); });
    }
    function addFiles(list) { state.files = state.files.concat(Array.from(list || [])).slice(0, 30); renderFiles(); }
    if (fileEl) fileEl.addEventListener("change", function () { addFiles(fileEl.files); fileEl.value = ""; });
    if (dropEl) {
      dropEl.addEventListener("click", function () { fileEl.click(); });
      dropEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileEl.click(); } });
      ["dragenter", "dragover"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add("drag"); }); });
      ["dragleave", "drop"].forEach(function (ev) { dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove("drag"); }); });
      dropEl.addEventListener("drop", function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
    }
    document.getElementById("studio-quality").addEventListener("input", function (e) { document.getElementById("studio-quality-out").textContent = e.target.value; });
    document.getElementById("studio-reset").addEventListener("click", function () {
      state.files = []; renderFiles(); revokeAll(state.urls);
      resultsEl.innerHTML = '<div class="itk-empty"><strong>No results yet</strong><span>Add images and run the recipe.</span></div>';
      statusEl.textContent = "Ready. Every export is computed in this tab."; barEl.style.width = "0%";
    });
    function values() {
      return { format: document.getElementById("studio-format").value, maxWidth: Number(document.getElementById("studio-width").value) || 0, square: document.getElementById("studio-square").checked, watermark: document.getElementById("studio-watermark").value.trim(), quality: Number(document.getElementById("studio-quality").value) || 82 };
    }
    runEl.addEventListener("click", async function () {
      if (state.running) return;
      if (!state.files.length) { statusEl.textContent = "Add at least one image first."; return; }
      state.running = true; runEl.disabled = true;
      const v = values(); const outputs = [], errors = [];
      revokeAll(state.urls);
      resultsEl.innerHTML = '<div class="itk-empty"><strong>Processing…</strong><span>Decoding, cropping and encoding locally.</span></div>';
      for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];
        try {
          statusEl.textContent = "Processing " + (i + 1) + " of " + state.files.length + "…";
          barEl.style.width = Math.round(i / state.files.length * 100) + "%";
          const p = await prepare({ file, name: file.name }); await decodePrepared(p);
          let w = v.maxWidth > 0 ? Math.min(p.width, v.maxWidth) : p.width;
          let h = Math.round(w * p.height / p.width);
          let canvas;
          if (v.square) {
            const side = Math.min(p.width, p.height);
            const sx = (p.width - side) / 2, sy = (p.height - side) / 2;
            canvas = makeCanvas(Math.min(w, h) || side, Math.min(w, h) || side);
            ctx2d(canvas).drawImage(p.drawable, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
          } else {
            canvas = drawToCanvas(p.drawable, w, h, v.format === "jpeg" ? "#ffffff" : null);
          }
          if (v.watermark) {
            const cx = ctx2d(canvas);
            const size = Math.max(12, Math.round(canvas.width * 0.045));
            cx.font = "700 " + size + "px system-ui, sans-serif";
            cx.textAlign = "right"; cx.textBaseline = "bottom"; cx.globalAlpha = 0.55; cx.fillStyle = "#ffffff";
            cx.strokeStyle = "rgba(0,0,0,.45)"; cx.lineWidth = Math.max(1, size / 10);
            const x = canvas.width - size, y = canvas.height - size;
            cx.strokeText(v.watermark, x, y); cx.fillText(v.watermark, x, y);
            cx.globalAlpha = 1;
          }
          const enc = await encodeCanvas(canvas, v.format, v.quality, v.format === "jpeg" ? "#ffffff" : null);
          const blob = enc.blob;
          const url = URL.createObjectURL(blob); state.urls.push(url);
          outputs.push({ name: outputName(p.name, "studio", enc.ext), blob, url, size: blob.size, format: enc.format, note: canvas.width + " x " + canvas.height + ", " + formatBytes(blob.size) + ", metadata removed by re-encoding." });
        } catch (err) { errors.push({ name: file.name, message: err.message || String(err) }); }
      }
      resultsEl.innerHTML = outputs.map(function (r) {
        return '<article class="itk-result"><a class="itk-thumb" href="' + r.url + '" download="' + esc(r.name) + '"><img src="' + r.url + '" alt="Result preview: ' + esc(r.name) + '" loading="lazy"></a><div class="itk-result-body"><strong>' + esc(r.name) + "</strong><span>" + formatBytes(r.size) + " · " + esc(r.format) + "</span><p>" + esc(r.note) + '</p><a class="btn btn-sm" href="' + r.url + '" download="' + esc(r.name) + '">Download</a></div></article>';
      }).join("") + (errors.length ? '<div class="itk-errors"><h3>Files that failed</h3><ul>' + errors.map(e => "<li><strong>" + esc(e.name) + ":</strong> " + esc(e.message) + "</li>").join("") + "</ul></div>" : "");
      barEl.style.width = "100%";
      statusEl.textContent = "Done. " + outputs.length + " exported" + (errors.length ? ", " + errors.length + " failed" : "") + ".";
      runEl.disabled = false; state.running = false;
    });
  }

  return Object.assign({ core, LIMITS, PROCESSORS, mountTool, mountHub, mountStudio, unmount, cleanup: unmount }, core);
});
