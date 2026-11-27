/*
 * Progeni - Pure Utility Module
 * Shared between Browser (client-side) and Node.js (automated tests)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProgeniUtils = factory();
    root.Utils = root.ProgeniUtils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  /**
   * Escape HTML special characters to prevent XSS.
   */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  /**
   * RFC 4180 compliant CSV parser.
   */
  function csvParse(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const str = String(text ?? "");
    for (let i = 0; i < str.length; i++) {
      const c = str[i], n = str[i + 1];
      if (c === '"' && q && n === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (c === '"') {
        q = !q;
        continue;
      }
      if (c === ',' && !q) {
        row.push(cell);
        cell = "";
        continue;
      }
      if ((c === "\n" || c === "\r") && !q) {
        if (c === "\r" && n === "\n") i++;
        row.push(cell);
        cell = "";
        if (row.some(function (x) { return x !== ""; })) rows.push(row);
        row = [];
        continue;
      }
      cell += c;
    }
    row.push(cell);
    if (row.some(function (x) { return x !== ""; })) rows.push(row);
    return rows;
  }

  /**
   * CSV Serializer with proper escaping.
   */
  function csvOut(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        v = String(v ?? "");
        return /[",\n\r]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
      }).join(",");
    }).join("\r\n");
  }

  /**
   * Parse SubRip (.SRT) subtitle content.
   */
  function parseSRT(t) {
    return String(t ?? "").split(/\r?\n\r?\n/).map(function (x) {
      const l = x.split(/\r?\n/);
      const tm = l.findIndex(function (a) { return a.includes("-->"); });
      if (tm < 0) return null;
      const m = l[tm].match(/(\d\d):(\d\d):(\d\d),(\d+)\s+-->\s+(\d\d):(\d\d):(\d\d),(\d+)/);
      if (!m) return null;
      const sec = function (a, b, c, d) {
        return +a * 3600 + +b * 60 + +c + +d / 1000;
      };
      return {
        raw: l,
        num: l[0],
        start: sec(m[1], m[2], m[3], m[4]),
        end: sec(m[5], m[6], m[7], m[8]),
        text: l.slice(tm + 1).join(" ")
      };
    }).filter(Boolean);
  }

  /**
   * Generate robust contact deduplication key.
   * Compares email (case-insensitive) or phone (digits only).
   */
  function buildContactKey(row, emailIdx, phoneIdx) {
    const email = emailIdx >= 0 ? String(row[emailIdx] || "").trim().toLowerCase() : "";
    const phone = phoneIdx >= 0 ? String(row[phoneIdx] || "").replace(/\D/g, "") : "";
    return email || phone || JSON.stringify(row).toLowerCase();
  }

  /**
   * Filter bookmark HTML to only allow safe http:// and https:// links.
   * Neutralizes javascript:, data:, file:, etc.
   */
  function filterBookmarkLinks(links) {
    return links.filter(function (item) {
      const href = String(item.href || "").trim();
      try {
        const u = new URL(href, "https://progeni.invalid");
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (e) {
        return false;
      }
    });
  }

  function cleanSVG(svgString) {
    const raw = String(svgString ?? "");
    if (typeof window !== "undefined") {
      if (typeof DOMParser === "undefined") {
        throw new Error("DOMParser unavailable in this browser environment");
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "image/svg+xml");
      if (doc.querySelector("parsererror")) {
        throw new Error("Invalid SVG document");
      }
      const dangerousTags = ["script", "foreignobject", "iframe", "object", "embed"];
      // Collapse whitespace/control characters before scheme checks so that
      // obfuscated values such as "java\tscript:" or "  javascript:" are caught.
      const normalizeVal = v => String(v).replace(/[\u0000-\u0020]+/g, "").toLowerCase();
      Array.from(doc.querySelectorAll("*")).forEach(function (el) {
        const tag = el.tagName.toLowerCase();
        if (dangerousTags.includes(tag)) {
          el.remove();
          return;
        }
        Array.from(el.attributes).forEach(function (attr) {
          const name = attr.name.toLowerCase();
          const val = normalizeVal(attr.value);
          if (name.startsWith("on")) {
            el.removeAttribute(attr.name);
          } else if ((name === "href" || name === "xlink:href") && (val.startsWith("javascript:") || val.startsWith("data:text/html") || val.startsWith("data:image/svg+xml") || val.startsWith("vbscript:"))) {
            el.removeAttribute(attr.name);
          } else if (name === "style" && (val.includes("javascript:") || val.includes("expression(") || val.includes("@import"))) {
            el.removeAttribute(attr.name);
          } else if (name.startsWith("inkscape:") || name.startsWith("sodipodi:") || name.startsWith("sketch:")) {
            el.removeAttribute(attr.name);
          }
        });
      });
      // <style> blocks can smuggle @import / url() payloads.
      Array.from(doc.querySelectorAll("style")).forEach(function (st) {
        const css = normalizeVal(st.textContent || "");
        if (css.includes("javascript:") || css.includes("expression(") || css.includes("@import")) st.remove();
      });
      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc.documentElement).trim();
    }

    // Node.js Regex Fallback
    let clean = raw;
    clean = clean.replace(/<!--[\s\S]*?-->/g, "");
    clean = clean.replace(/\s+(?:inkscape|sodipodi|sketch|custom):[a-zA-Z-]+="[^"]*"/gi, "");
    clean = clean.replace(/<(?:inkscape|sodipodi):[a-zA-Z-]+[\s\S]*?\/>/gi, "");
    clean = clean.replace(/<(?:inkscape|sodipodi):[a-zA-Z-]+[\s\S]*?<\/(?:inkscape|sodipodi):[a-zA-Z-]+>/gi, "");

    const badTags = ["script", "foreignObject", "iframe", "object", "embed"];
    badTags.forEach(function (t) {
      const rePaired = new RegExp("<" + t + "\\b[^>]*>[\\s\\S]*?<\\/" + t + ">", "gi");
      const reSelf = new RegExp("<" + t + "\\b[^>]*\\/?>", "gi");
      clean = clean.replace(rePaired, "");
      clean = clean.replace(reSelf, "");
    });

    clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    clean = clean.replace(/\s+(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|"[^"]*javascript:[^"]*"|'[^']*javascript:[^']*')/gi, ' href="#"');
    clean = clean.replace(/\s+(?:href|xlink:href)\s*=\s*(?:"\s*data:text\/html[^"]*"|'\s*data:text\/html[^']*'|"[^"]*data:text\/html[^"]*"|'[^']*data:text\/html[^']*')/gi, ' href="#"');

    return clean.trim();
  }

  /**
   * Parse vCard (.vcf) format into individual valid cards, handling line folding.
   */
  function parseVCF(vcfText) {
    const rawLines = String(vcfText ?? "").replace(/\r/g, "").split("\n");
    const unfoldedLines = [];
    
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if ((line.startsWith(" ") || line.startsWith("\t")) && unfoldedLines.length > 0) {
        unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
      } else if (line.trim() !== "") {
        unfoldedLines.push(line);
      }
    }

    const cards = [];
    let currentCard = [];
    let inside = false;

    for (let i = 0; i < unfoldedLines.length; i++) {
      const l = unfoldedLines[i].trim();
      if (l.toUpperCase() === "BEGIN:VCARD") {
        inside = true;
        currentCard = ["BEGIN:VCARD"];
        continue;
      }
      if (inside) {
        currentCard.push(l);
        if (l.toUpperCase() === "END:VCARD") {
          inside = false;
          let fn = "";
          currentCard.forEach(function (cline) {
            if (cline.toUpperCase().startsWith("FN:") || cline.toUpperCase().startsWith("FN;")) {
              fn = cline.split(":")[1] || "";
            } else if (!fn && (cline.toUpperCase().startsWith("N:") || cline.toUpperCase().startsWith("N;"))) {
              fn = cline.split(":")[1] ? cline.split(":")[1].replace(/;/g, " ").trim() : "";
            }
          });
          cards.push({
            raw: currentCard.join("\r\n"),
            name: fn.trim() || "Contact-" + (cards.length + 1)
          });
          currentCard = [];
        }
      }
    }

    return cards;
  }

  /**
   * Standardize dates strictly into ISO, US, or European formats.
   */
  function normalizeDate(v, targetFormat) {
    if (!v) return "";
    const str = String(v).trim();
    
    // Check for ISO: YYYY-MM-DD
    let m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    let y, mo, d;
    if (m) {
      y = m[1]; mo = m[2].padStart(2, "0"); d = m[3].padStart(2, "0");
    } else {
      // Check for DD/MM/YYYY or MM/DD/YYYY
      m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (m) {
        if (Number(m[1]) > 12) {
          d = m[1].padStart(2, "0"); mo = m[2].padStart(2, "0"); y = m[3];
        } else {
          mo = m[1].padStart(2, "0"); d = m[2].padStart(2, "0"); y = m[3];
        }
      } else {
        const parsed = new Date(str);
        if (isNaN(parsed.getTime())) return str;
        y = String(parsed.getFullYear());
        mo = String(parsed.getMonth() + 1).padStart(2, "0");
        d = String(parsed.getDate()).padStart(2, "0");
      }
    }

    if (targetFormat === "DD/MM/YYYY") return d + "/" + mo + "/" + y;
    if (targetFormat === "MM/DD/YYYY") return mo + "/" + d + "/" + y;
    return y + "-" + mo + "-" + d;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function pad4(n) {
    return String(n).padStart(4, "0");
  }

  function fmtTimeHMSms(seconds) {
    const sec = Number(seconds) || 0;
    let s = Math.max(0, Number(sec) || 0);
    if (!Number.isFinite(s)) s = 0;
    let ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const ss = Math.floor(ms / 1000); ms -= ss * 1000;
    return pad2(h) + ":" + pad2(m) + ":" + pad2(ss) + "." + String(ms).padStart(3, "0");
  }

  const fmtHmsMs = fmtTimeHMSms;

  function parseTimecode(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (m) {
      const h = +m[1], mn = +m[2], secv = +m[3], msv = m[4] ? +m[4] : 0;
      if (mn >= 60 || secv >= 60) return null;
      return h * 3600 + mn * 60 + secv + msv / 1000;
    }
    m = s.match(/^(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (m) {
      const mn = +m[1], secv = +m[2], msv = m[3] ? +m[3] : 0;
      if (mn >= 60 || secv >= 60) return null;
      return mn * 60 + secv + msv / 1000;
    }
    const n = Number(s);
    if (!isNaN(n) && n >= 0) return n;
    return null;
  }

  function normalizePhone(n) {
    if (!n) return "";
    const s = String(n).replace(/\D/g, "");
    // US/Canada: 1 + 10 digits -> (NXX) NXX-XXXX
    // International: keep as-is with plus
    if (s.length === 11 && s[0] === "1") s = s.slice(1);
    if (s.length === 10) {
      return "(" + s.slice(0, 3) + ") " + s.slice(3, 6) + "-" + s.slice(6);
    }
    if (s.length > 0 && s[0] === "+") return "+" + s.slice(1).replace(/\D/g, "").match(/^(\d{1,3})(\d{3})(\d{3})(\d{4})/) ? "+$1 $2 $3-$4" : "+" + s.slice(1);
    return s;
  }

  function formatPhone(n) {
    if (!n) return "";
    // Strip to digits only
    const s = String(n).replace(/\D/g, "");
    if (s.length === 10) return "(" + s.slice(0, 3) + ") " + s.slice(3, 6) + "-" + s.slice(6);
    if (s.length === 11 && s[0] === "1") return "(" + s.slice(1, 4) + ") " + s.slice(4, 7) + "-" + s.slice(7, 10);
    if (s.length > 0 && s[0] === "+") return "+" + s.slice(1).replace(/\D/g, "").match(/^(\d{1,3})(\d{3})(\d{3})(\d{4})/) ? "+$1 $2 $3-$4" : "+" + s.slice(1);
    return s;
  }

  return {
    esc: esc,
    csvParse: csvParse,
    csvOut: csvOut,
    parseSRT: parseSRT,
    buildContactKey: buildContactKey,
    filterBookmarkLinks: filterBookmarkLinks,
    cleanSVG: cleanSVG,
    parseVCF: parseVCF,
    normalizeDate: normalizeDate,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    pad2: pad2,
    pad4: pad4,
    fmtTimeHMSms: fmtTimeHMSms,
    fmtHmsMs: fmtHmsMs,
    parseTimecode: parseTimecode
  };
});
