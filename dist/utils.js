/*
 * Progeni - Pure Utility Module
 * Shared between Browser (client-side) and Node.js (automated tests)
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProgeniUtils = factory();
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
      dangerousTags.forEach(function (tag) {
        doc.querySelectorAll(tag).forEach(function (el) { el.remove(); });
      });
      const allEls = doc.querySelectorAll("*");
      allEls.forEach(function (el) {
        const attrs = Array.from(el.attributes);
        attrs.forEach(function (attr) {
          const name = attr.name.toLowerCase();
          const val = attr.value.trim().toLowerCase();
          if (name.startsWith("on")) {
            el.removeAttribute(attr.name);
          } else if ((name === "href" || name === "xlink:href") && (val.startsWith("javascript:") || val.startsWith("data:text/html") || val.startsWith("data:image/svg+xml"))) {
            el.removeAttribute(attr.name);
          } else if (name.startsWith("inkscape:") || name.startsWith("sodipodi:") || name.startsWith("sketch:")) {
            el.removeAttribute(attr.name);
          }
        });
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

  return {
    esc: esc,
    csvParse: csvParse,
    csvOut: csvOut,
    parseSRT: parseSRT,
    buildContactKey: buildContactKey,
    filterBookmarkLinks: filterBookmarkLinks,
    cleanSVG: cleanSVG,
    parseVCF: parseVCF,
    normalizeDate: normalizeDate
  };
});
