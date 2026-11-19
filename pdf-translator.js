(function (root) {
  "use strict";

  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  // No page-count limit: documents are bounded only by file size (15 MB),
  // extracted text (120k chars, DeepL quota) and the render budget below.
  // MAX_OUTPUT_PAGES stays as a runaway guard; continuation pages rarely triple the source count.
  const MAX_TEXT_CHARS = 120000;
  const MAX_PAGE_PIXELS = 4000000;
  const MAX_TOTAL_RENDER_PIXELS = 500000000;
  const MAX_OUTPUT_PAGES = 300;
  const OCR_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
  const TARGETS = [
    ["AR", "Arabic"], ["BG", "Bulgarian"], ["CS", "Czech"], ["DA", "Danish"],
    ["DE", "German"], ["EL", "Greek"], ["EN-GB", "English (UK)"],
    ["EN-US", "English (US)"], ["ES", "Spanish"], ["ET", "Estonian"],
    ["FI", "Finnish"], ["FR", "French"], ["HI", "Hindi"],
    ["HU", "Hungarian"], ["ID", "Indonesian"], ["IT", "Italian"],
    ["JA", "Japanese"], ["KO", "Korean"], ["LT", "Lithuanian"],
    ["LV", "Latvian"], ["NB", "Norwegian Bokmål"], ["NL", "Dutch"],
    ["PL", "Polish"], ["PT-BR", "Portuguese (Brazil)"],
    ["PT-PT", "Portuguese (Portugal)"], ["RO", "Romanian"], ["RU", "Russian"],
    ["SK", "Slovak"], ["SL", "Slovenian"], ["SV", "Swedish"],
    ["TR", "Turkish"], ["UK", "Ukrainian"], ["ZH", "Chinese"]
  ];
  const SOURCES = [
    ["", "Auto-detect"], ["AR", "Arabic"], ["BG", "Bulgarian"],
    ["CS", "Czech"], ["DA", "Danish"], ["DE", "German"], ["EL", "Greek"],
    ["EN", "English"], ["ES", "Spanish"], ["ET", "Estonian"], ["FI", "Finnish"],
    ["FR", "French"], ["HI", "Hindi"], ["HU", "Hungarian"], ["ID", "Indonesian"],
    ["IT", "Italian"], ["JA", "Japanese"], ["KO", "Korean"], ["LT", "Lithuanian"],
    ["LV", "Latvian"], ["NB", "Norwegian Bokmål"], ["NL", "Dutch"],
    ["PL", "Polish"], ["PT", "Portuguese"], ["RO", "Romanian"], ["RU", "Russian"],
    ["SK", "Slovak"], ["SL", "Slovenian"], ["SV", "Swedish"], ["TR", "Turkish"],
    ["UK", "Ukrainian"], ["ZH", "Chinese"]
  ];
  const ROMAN = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "ळ": "l", "क्ष": "ksh",
    "ज्ञ": "gy", "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z",
    "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y"
  };
  const MATRA = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o"
  };

  let file = null;
  let pdfDocument = null;
  let activeLoadingTask = null;
  let pdfReady = false;
  let activeWorker = null;
  let activeController = null;
  let runToken = 0;
  let outputUrl = null;
  // On-device translation cache: reuse the same Translator instance while translating one document.
  let onDeviceCache = { key: null, translator: null };

  function el(id) {
    return document.getElementById(id);
  }

  function romanizeHindi(value) {
    const input = Array.from(value);
    let out = "";
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      if (current === "्") continue;
      if (ROMAN[current]) {
        if (current === "क" && input[i + 1] === "्" && input[i + 2] === "ष") {
          out += "ksh";
          i += 2;
          continue;
        }
        if (current === "ज" && input[i + 1] === "्" && input[i + 2] === "ञ") {
          out += "gy";
          i += 2;
          continue;
        }
        out += ROMAN[current];
        if (input[i + 1] === "़") i += 1;
        if (input[i + 1] === "्") {
          i += 1;
          continue;
        }
        if (MATRA[input[i + 1]]) {
          out += MATRA[input[i + 1]];
          i += 1;
        } else {
          const code = current.codePointAt(0);
          const isConsonant = (code >= 0x0915 && code <= 0x0939) || (code >= 0x0958 && code <= 0x095f);
          const next = input[i + 1];
          if (isConsonant && next && !/\s|[.,!?;:()[\]{}]/.test(next)) out += "a";
        }
        continue;
      }
      if (MATRA[current]) out += MATRA[current];
      else if (current === "ं" || current === "ँ") out += "n";
      else if (current === "ः") out += "h";
      else out += current;
    }
    return out;
  }

  function updateProgress(percent, label) {
    const progress = el("pdf-progress");
    const status = el("pdf-status");
    progress.hidden = false;
    progress.value = percent;
    status.textContent = label;
  }

  function setError(message) {
    const box = el("pdf-error");
    box.hidden = !message;
    box.textContent = message || "";
    const button = el("pdf-run");
    if (button && !button.disabled) button.textContent = message ? "Retry translation" : "Translate PDF";
    if (message) {
      // Move focus to the offending field when the error is target-language specific,
      // otherwise focus the alert box so screen readers announce it.
      const targetSelect = el("pdf-target-language");
      if (/target language/i.test(message) && targetSelect) {
        targetSelect.setAttribute("aria-invalid", "true");
        targetSelect.focus({ preventScroll: true });
        targetSelect.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        box.focus({ preventScroll: true });
        box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function setBusy(busy) {
    el("pdf-run").disabled = busy || !pdfReady;
    el("pdf-cancel").hidden = !busy || !activeController;
    el("pdf-run").textContent = busy ? "Working…" : (!el("pdf-error").hidden && pdfReady ? "Retry translation" : "Translate PDF");
    el("pdf-controls").setAttribute("aria-busy", String(busy));
  }

  function showFileInfo() {
    const info = el("pdf-file-info");
    if (!file) {
      info.hidden = true;
      el("pdf-run").disabled = true;
      return;
    }
    info.hidden = false;
    el("pdf-file-name").textContent = file.name;
    el("pdf-file-size").textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    el("pdf-run").disabled = !pdfReady;
  }

  async function selectFile(candidate) {
    if (!candidate) return;
    const token = ++runToken;
    if (activeController) activeController.abort();
    activeController = null;
    if (activeWorker) {
      const worker = activeWorker;
      activeWorker = null;
      await worker.terminate();
    }
    if (token !== runToken) return;
    if (activeLoadingTask) {
      const task = activeLoadingTask;
      activeLoadingTask = null;
      await task.destroy();
    }
    if (token !== runToken) return;
    if (pdfDocument) {
      const documentToDestroy = pdfDocument;
      pdfDocument = null;
      await documentToDestroy.destroy();
    }
    if (token !== runToken) return;
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
    }
    file = null;
    pdfReady = false;
    el("pdf-page-count").textContent = "";
    setBusy(false);
    if (!/\.pdf$/i.test(candidate.name)) {
      showFileInfo();
      setError("Choose a PDF file. The filename must end with .pdf.");
      return;
    }
    if (candidate.size < 8 || candidate.size > MAX_FILE_BYTES) {
      showFileInfo();
      setError("PDFs must be non-empty and no larger than 15 MB.");
      return;
    }
    if (candidate.type && candidate.type !== "application/pdf") {
      showFileInfo();
      setError("The selected file's MIME type is not application/pdf.");
      return;
    }
    file = candidate;
    setError("");
    el("pdf-preview").hidden = true;
    el("pdf-result").hidden = true;
    showFileInfo();
    setBusy(true);
    updateProgress(2, "Checking PDF signature, structure and page count locally…");
    try {
      const header = new Uint8Array(await candidate.slice(0, 5).arrayBuffer());
      if (new TextDecoder().decode(header) !== "%PDF-") throw new Error("The file does not have a valid PDF signature.");
      const data = new Uint8Array(await candidate.arrayBuffer());
      const loadingTask = root.pdfjsLib.getDocument({
        data,
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true,
        cMapUrl: "/vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
        maxImageSize: 10000000,
        enableXfa: false
      });
      activeLoadingTask = loadingTask;
      const loadedDocument = await loadingTask.promise;
      if (token !== runToken) {
        await loadingTask.destroy();
        return;
      }
      activeLoadingTask = null;
      pdfDocument = loadedDocument;
      pdfReady = true;
      el("pdf-page-count").textContent = `${pdfDocument.numPages} page${pdfDocument.numPages === 1 ? "" : "s"}`;
      updateProgress(5, "PDF structure validated locally. Choose options and translate.");
    } catch (error) {
      if (token !== runToken) return;
      const message = error && error.name === "PasswordException"
        ? "Password-protected PDFs are not supported. Remove the password locally and try again."
        : error && error.message
          ? error.message
          : "The PDF is malformed or could not be opened.";
      setError(message);
      updateProgress(0, "PDF validation failed.");
    } finally {
      if (token === runToken) {
        activeLoadingTask = null;
        setBusy(false);
      }
    }
  }

  function parsePageRange(raw, pageCount) {
    const value = raw.trim();
    if (!value) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const selected = new Set();
    for (const part of value.split(",")) {
      const token = part.trim();
      const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
      if (!match) throw new Error("Enter page numbers like 1-3,6 or leave the field blank for every page.");
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > pageCount) {
        throw new Error(`Page ranges must be between 1 and ${pageCount}.`);
      }
      for (let page = start; page <= end; page += 1) selected.add(page);
    }
    if (!selected.size) throw new Error("Select at least one page.");
    return [...selected].sort((a, b) => a - b);
  }

  function resolveSourceLanguage(selectedValue, detectedLanguages) {
    const requested = typeof selectedValue === "string" ? selectedValue.trim() : "";
    if (requested) return requested;
    const choices = Array.isArray(detectedLanguages) ? detectedLanguages.filter(Boolean) : [];
    if (!choices.length) return "";

    for (const candidate of choices) {
      const normalized = String(candidate).trim().toUpperCase();
      if (!normalized) continue;
      const exact = SOURCES.find(([code]) => code === normalized || code === normalized.replace(/-.*$/, ""));
      if (exact) return exact[0];
    }
    return String(choices[0]).trim();
  }

  function wrapText(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split(/\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
        while (line && context.measureText(line).width > maxWidth) {
          let cut = line.length;
          while (cut > 1 && context.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      if (line) lines.push(line);
      if (!words.length) lines.push("");
    }
    return lines;
  }

  function reserveRenderPixels(budget, width, height) {
    const pixels = Math.ceil(width) * Math.ceil(height);
    if (pixels > MAX_PAGE_PIXELS) throw new Error("A page exceeds the safe render-size limit.");
    if (budget.total + pixels > MAX_TOTAL_RENDER_PIXELS) {
      throw new Error("This selection exceeds the safe total render-size limit. Choose fewer pages or a non-preserve output layout.");
    }
    budget.total += pixels;
  }

  function groupTextItems(items, viewport) {
    const lines = [];
    for (const item of items) {
      const text = String(item.str || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const size = Math.max(8, Math.hypot(item.transform[0], item.transform[1]) || item.height || 10);
      const line = lines.find(candidate => Math.abs(candidate.y - point[1]) <= Math.max(3, size * 0.35));
      const entry = {
        text,
        x: point[0],
        y: point[1],
        width: Math.max(1, item.width * viewport.scale),
        height: Math.max(size, item.height * viewport.scale || size),
        size
      };
      if (line) line.items.push(entry);
      else lines.push({ y: point[1], items: [entry] });
    }
    lines.sort((a, b) => a.y - b.y);
    const blocks = [];
    let current = null;
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      const lineText = line.items.map(item => item.text).join(" ").replace(/\s+/g, " ").trim();
      const x = Math.min(...line.items.map(item => item.x));
      const right = Math.max(...line.items.map(item => item.x + item.width));
      const size = line.items.reduce((sum, item) => sum + item.size, 0) / line.items.length;
      const height = Math.max(...line.items.map(item => item.height));
      const gap = current ? line.y - current.lastBaseline : Infinity;
      if (!current || gap > Math.max(size * 1.9, 24) || Math.abs(x - current.x) > viewport.width * 0.16) {
        current = { lines: [], x, top: line.y - height, width: right - x, bottom: line.y + 3, size, lastBaseline: line.y };
        blocks.push(current);
      }
      current.lines.push(lineText);
      current.x = Math.min(current.x, x);
      current.width = Math.max(current.width, right - current.x);
      current.top = Math.min(current.top, line.y - height);
      current.bottom = Math.max(current.bottom, line.y + 3);
      current.size = Math.max(current.size, size);
      current.lastBaseline = line.y;
    }
    return blocks.map((block, index) => ({
      id: `block-${index + 1}`,
      text: block.lines.join("\n"),
      x: Math.max(0, block.x),
      y: Math.max(0, block.top),
      width: Math.min(viewport.width - Math.max(0, block.x), block.width),
      height: Math.max(block.size * 1.2, block.bottom - block.top),
      fontSize: block.size,
      layoutScale: viewport.scale
    }));
  }

  async function loadOcrWorker(language, token) {
    if (activeWorker) return activeWorker;
    if (!root.Tesseract) throw new Error("Local OCR could not load. Reload the page and try again.");
    activeWorker = await root.Tesseract.createWorker(language, 1, {
      workerPath: "/vendor/tesseract/worker.min.js",
      corePath: "/vendor/tesseract/",
      langPath: OCR_LANG_PATH,
      logger: message => {
        if (token !== runToken || !message || !message.status) return;
        if (message.status === "recognizing text") {
          updateProgress(18, `Local OCR in progress (${Math.round((message.progress || 0) * 100)}%).`);
        }
      }
    });
    return activeWorker;
  }

  function ocrBlocks(result, viewport, pageNumber) {
    const items = [];
    for (const block of result.data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const text = (line.text || "").trim();
          if (!text) continue;
          const box = line.bbox;
          items.push({
            text,
            x: box.x0,
            y: box.y0,
            width: box.x1 - box.x0,
            height: box.y1 - box.y0,
            fontSize: Math.max(9, box.y1 - box.y0)
          });
        }
      }
    }
    return items.map((item, index) => ({ ...item, id: `p${pageNumber}-ocr-${index + 1}`, layoutScale: viewport.scale }));
  }

  // Zero-config, 100% free, fully private path: Chrome's built-in on-device
  // Translator API. Returns an array of {id, text} or null when unavailable.
  async function translateBatchOnDevice(blocks, options, controller) {
    if (typeof self === "undefined" || !self.Translator) return null;
    const target = String(options.targetLang || "").split("-")[0].toLowerCase();
    if (!target) return null;
    let source = String(options.sourceLang || "").trim().toLowerCase().split("-")[0];
    if (!source) {
      try {
        const detector = self.LanguageDetector ? await self.LanguageDetector.create() : null;
        if (detector) {
          const [guess] = await detector.detect(blocks.map(b => b.text).join("\n").slice(0, 1000));
          source = guess && guess.detectedLanguage ? guess.detectedLanguage.toLowerCase() : "en";
        } else {
          source = "en";
        }
      } catch {
        source = "en";
      }
    }
    const key = `${source}>${target}`;
    let translator = onDeviceCache.key === key ? onDeviceCache.translator : null;
    // Cache is invalid for this source/target combination: probe availability, then create.
    if (!translator) {
      try {
        const opts = { sourceLanguage: source, targetLanguage: target };
        if (typeof self.Translator.availability === "function") {
          const availability = await self.Translator.availability(opts);
          if (availability === "unavailable") return null; // signal: use server path
        }
        translator = await self.Translator.create(opts);
        onDeviceCache = { key, translator };
      } catch (error) {
        console.warn("on-device translator setup failed; will use the server fallback instead", error);
        return null;
      }
    }
    const translated = [];
    for (const block of blocks) {
      if (controller && controller.signal && controller.signal.aborted) {
        throw new DOMException("Translation cancelled.", "AbortError");
      }
      try {
        translated.push({ id: block.id, text: await translator.translate(block.text) });
      } catch (error) {
        console.warn("on-device translation failed for block; will use server fallback", error);
        return null;
      }
    }
    return translated;
  }

  async function translateBatch(blocks, options, controller) {
    const onDevice = await translateBatchOnDevice(blocks, options, controller)
      .catch(error => {
        if (error && error.name === "AbortError") throw error;
        console.warn("on-device translation failed; using server endpoint instead", error);
        return null;
      });
    if (onDevice) return onDevice;
    const response = await fetch("/api/translate/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: blocks.map(({ id, text }) => ({ id, text })),
        targetLang: options.targetLang,
        sourceLang: options.sourceLang || undefined,
        style: options.style
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Translation service returned ${response.status}.`);
    if (!Array.isArray(data.translations) || data.translations.length !== blocks.length) {
      throw new Error("The translation service returned an incomplete batch.");
    }
    return data.translations;
  }

  async function translateBlocks(blocks, options, controller, token, progress) {
    const tokenMaps = new Map();
    let tokenIndex = 0;
    const segments = [];
    for (const block of blocks) {
      const tokenMap = new Map();
      const protectedText = block.text.replace(
        /`[^`\n]*`|https?:\/\/[^\s<>()]+|[\w.+-]+@[\w.-]+\.[A-Z]{2,}|\b\d[\d,]*(?:\.\d+)?(?:%|[A-Za-z]{1,3})?/gi,
        token => {
          const placeholder = `PGTOKENX${tokenIndex++}END`;
          tokenMap.set(placeholder, token);
          return placeholder;
        }
      );
      tokenMaps.set(block.id, tokenMap);
      let remaining = protectedText;
      let part = 1;
      while (remaining.length > 4500) {
        let cut = remaining.lastIndexOf(" ", 4500);
        if (cut < 1500) cut = 4500;
        segments.push({ id: `${block.id}-part-${part++}`, parentId: block.id, text: remaining.slice(0, cut) });
        remaining = remaining.slice(cut).replace(/^\s+/, "");
      }
      segments.push({
        id: part === 1 ? block.id : `${block.id}-part-${part}`,
        parentId: block.id,
        text: remaining
      });
    }
    const translations = new Map();
    const detectedLanguages = new Set();
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const block of segments) {
      if (batch.length >= 25 || chars + block.text.length > 12000) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(block);
      chars += block.text.length;
    }
    if (batch.length) batches.push(batch);
    for (let index = 0; index < batches.length; index += 1) {
      if (token !== runToken || controller.signal.aborted) throw new DOMException("Translation cancelled.", "AbortError");
      const result = await translateBatch(batches[index], options, controller);
      for (const item of result) {
        if (typeof item.text !== "string" || !item.text.trim()) {
          throw new Error(`The translation provider returned empty text for ${item.id}.`);
        }
        const segment = segments.find(candidate => candidate.id === item.id);
        if (!segment) throw new Error(`The translation service returned an unknown block identifier: ${item.id}.`);
        if (item.detectedSourceLang) detectedLanguages.add(item.detectedSourceLang);
        const value = options.hinglish ? romanizeHindi(item.text) : item.text;
        if (!translations.has(segment.parentId)) translations.set(segment.parentId, []);
        translations.get(segment.parentId).push(value);
      }
      progress(index + 1, batches.length);
    }
    const warnings = [];
    for (const [id, parts] of translations) {
      let output = parts.join(" ");
      for (const [placeholder, original] of tokenMaps.get(id) || []) {
        const placeholderPattern = new RegExp(placeholder, "gi");
        if (!output.toLowerCase().includes(placeholder.toLowerCase())) {
          warnings.push(`${id}: a protected number, URL, email or code token could not be restored.`);
        } else {
          output = output.replace(placeholderPattern, original);
        }
      }
      translations.set(id, output);
    }
    return { translations, detectedLanguages: [...detectedLanguages], warnings };
  }

  function addTextPage(pdf, width, height, blocks, mode, pageNumber, overflow) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1.5, Math.sqrt(MAX_PAGE_PIXELS / (width * height)));
    canvas.width = Math.max(600, Math.ceil(width * scale));
    canvas.height = Math.max(750, Math.ceil(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pad = Math.max(32, canvas.width * 0.055);
    const maxWidth = canvas.width - pad * 2;
    let y = pad + 22;
    ctx.fillStyle = "#1f2937";
    ctx.font = `bold ${Math.max(16, canvas.width * 0.018)}px "Noto Sans Devanagari", sans-serif`;
    ctx.fillText(mode === "bilingual" ? `Page ${pageNumber} · Source and translation` : `Translated page ${pageNumber}`, pad, y);
    y += 30;
    const fontSize = Math.max(12, Math.min(18, canvas.width * 0.012));
    const lineHeight = fontSize * 1.45;
    const contents = [];
    for (const block of blocks) {
      if (mode === "continuation") {
        contents.push(block);
        continue;
      }
      if (mode === "bilingual") contents.push({ label: "Original", text: block.text, id: block.id });
      contents.push({ label: mode === "bilingual" ? "Translation" : "", text: block.translation, id: block.id });
    }
    for (const item of contents) {
      const labelHeight = item.label ? 22 : 0;
      ctx.font = `${fontSize}px "Noto Sans Devanagari", sans-serif`;
      const lines = wrapText(ctx, item.text, maxWidth);
      const availableLines = Math.floor((canvas.height - pad - y - labelHeight - 16) / lineHeight);
      if (availableLines < 1) {
        overflow.push(item);
        continue;
      }
      if (item.label) {
        ctx.fillStyle = "#475569";
        ctx.font = `bold ${Math.max(11, fontSize - 2)}px "Noto Sans Devanagari", sans-serif`;
        ctx.fillText(item.label, pad, y);
        y += labelHeight;
      }
      ctx.fillStyle = "#111827";
      ctx.font = `${fontSize}px "Noto Sans Devanagari", sans-serif`;
      const visibleLines = lines.slice(0, availableLines);
      for (const line of visibleLines) {
        ctx.fillText(line, pad, y);
        y += lineHeight;
      }
      y += 16;
      if (visibleLines.length < lines.length) {
        overflow.push({ ...item, text: lines.slice(visibleLines.length).join("\n") });
      }
    }
    return { canvas, scale };
  }

  function overflowUnchanged(previous, next) {
    return previous.length === next.length && previous.every((item, index) =>
      item.label === next[index].label && item.text === next[index].text
    );
  }

  async function addContinuationPages(pdf, width, height, pending, pageNumber, quality) {
    let remaining = pending;
    while (remaining.length) {
      if (pdf.getPageCount() >= MAX_OUTPUT_PAGES) {
        throw new Error(`The translated document would exceed the ${MAX_OUTPUT_PAGES}-page output limit.`);
      }
      const next = [];
      const page = addTextPage(pdf, width, height, remaining, "continuation", pageNumber, next);
      await embedCanvasPage(pdf, page.canvas, { width, height });
      page.canvas.width = page.canvas.height = 0;
      if (overflowUnchanged(remaining, next)) {
        throw new Error(`Page ${pageNumber} contains text that cannot fit on an output page.`);
      }
      remaining = next;
    }
    if (pending.length) quality.push(`Page ${pageNumber}: translated content continued on additional readable page(s).`);
  }

  async function embedCanvasPage(pdf, canvas, dimensions) {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode a translated page.")), "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = await pdf.embedPng(bytes);
    const page = pdf.addPage([dimensions.width, dimensions.height]);
    page.drawImage(image, { x: 0, y: 0, width: dimensions.width, height: dimensions.height });
  }

  async function renderTranslatedPage(pdf, page, extractedBlocks, translations, mode, pageNumber, quality, renderBudget) {
    const viewport = page.getViewport({ scale: 1 });
    let canvas = null;
    let ctx = null;
    let renderedScale = 1;
    if (mode === "preserve") {
      renderedScale = Math.min(1.5, Math.sqrt(MAX_PAGE_PIXELS / (viewport.width * viewport.height)));
      const scaledViewport = page.getViewport({ scale: renderedScale });
      reserveRenderPixels(renderBudget, scaledViewport.width, scaledViewport.height);
      canvas = document.createElement("canvas");
      canvas.width = Math.ceil(scaledViewport.width);
      canvas.height = Math.ceil(scaledViewport.height);
      ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    }

    const translated = extractedBlocks.map(block => ({
      ...block,
      text: block.text,
      translation: translations.get(block.id) || ""
    }));
    const overflow = [];
    if (mode === "preserve") {
      for (const block of translated) {
        const scaleRatio = renderedScale / (block.layoutScale || 1.5);
        const sx = block.x * scaleRatio;
        const sy = block.y * scaleRatio;
        const sw = Math.max(40, block.width * scaleRatio);
        const sh = Math.max(18, block.height * scaleRatio);
        if (sx >= canvas.width || sy >= canvas.height) {
          quality.push(`Page ${pageNumber}: a text block was outside the page bounds.`);
          continue;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(Math.max(0, sx - 2), Math.max(0, sy - 2), Math.max(0, Math.min(canvas.width - sx, sw + 4)), Math.max(0, Math.min(canvas.height - sy, sh + 4)));
        const size = Math.max(9, Math.min(block.fontSize * renderedScale, sh * 0.9));
        ctx.font = `${size}px "Noto Sans Devanagari", sans-serif`;
        const lines = wrapText(ctx, block.translation, Math.max(20, sw));
        const lineHeight = size * 1.25;
        const available = Math.max(1, Math.floor((sh - 2) / lineHeight));
        const visibleLines = lines.slice(0, available);
        ctx.fillStyle = "#111827";
        visibleLines.forEach((line, index) => ctx.fillText(line, Math.max(0, sx), Math.max(size, sy + size + index * lineHeight), sw));
        if (lines.length > visibleLines.length) {
          overflow.push({ label: "Translation", text: lines.slice(visibleLines.length).join("\n") });
          quality.push(`Page ${pageNumber}: a long translated block continued on an extra page.`);
        }
      }
      await embedCanvasPage(pdf, canvas, { width: viewport.width, height: viewport.height });
      canvas.width = canvas.height = 0;
      await addContinuationPages(pdf, viewport.width, viewport.height, overflow, pageNumber, quality);
    } else {
      const cleanBlocks = translated.map(block => ({ ...block, translation: block.translation }));
      const cleanOverflow = [];
      const cleanCanvas = addTextPage(pdf, viewport.width, viewport.height, cleanBlocks, mode, pageNumber, cleanOverflow);
      await embedCanvasPage(pdf, cleanCanvas.canvas, { width: viewport.width, height: viewport.height });
      await addContinuationPages(pdf, viewport.width, viewport.height, cleanOverflow, pageNumber, quality);
    }
  }

  async function createOutput(job, options, token) {
    const pdf = await root.PDFLib.PDFDocument.create();
    const previewBlocks = [];
    const quality = [];
    const pageQuality = [];
    let totalText = 0;
    const selectedSet = new Set(job.selectedPages);
    const renderBudget = { total: 0 };

    for (let pageNumber = 1; pageNumber <= job.pageCount; pageNumber += 1) {
      if (token !== runToken || job.controller.signal.aborted) throw new DOMException("Translation cancelled.", "AbortError");
      if (!selectedSet.has(pageNumber)) continue;
      const pageIssues = [];
      const page = await job.document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const textContent = await page.getTextContent();
      let blocks = groupTextItems(textContent.items || [], viewport);
      const hasNativeText = blocks.some(block => block.text.replace(/\s/g, "").length >= 12);
      let renderedCanvas = null;
      if (!hasNativeText && options.ocr) {
        updateProgress(18, `Rendering page ${pageNumber} for local OCR…`);
        const ocrViewport = page.getViewport({ scale: Math.min(1.5, Math.sqrt(MAX_PAGE_PIXELS / (page.view[2] * page.view[3]))) });
        reserveRenderPixels(renderBudget, ocrViewport.width, ocrViewport.height);
        renderedCanvas = document.createElement("canvas");
        renderedCanvas.width = Math.ceil(ocrViewport.width);
        renderedCanvas.height = Math.ceil(ocrViewport.height);
        const renderContext = renderedCanvas.getContext("2d", { alpha: false });
        renderContext.fillStyle = "#fff";
        renderContext.fillRect(0, 0, renderedCanvas.width, renderedCanvas.height);
        await page.render({ canvasContext: renderContext, viewport: ocrViewport }).promise;
        const worker = await loadOcrWorker(options.ocrLanguage, token);
        const ocrResult = await worker.recognize(renderedCanvas);
        blocks = ocrBlocks(ocrResult, ocrViewport, pageNumber);
        if (blocks.length) pageIssues.push("OCR text may contain recognition errors.");
        renderedCanvas.width = renderedCanvas.height = 0;
        renderedCanvas = null;
      }
      if (!blocks.length) {
        pageIssues.push("No extractable text found; page omitted.");
        quality.push(`Page ${pageNumber}: ${pageIssues[pageIssues.length - 1]}`);
        pageQuality.push({ page: pageNumber, status: "failed", issues: pageIssues });
        page.cleanup();
        continue;
      }

      blocks = blocks.map((block, index) => ({
        ...block,
        id: `p${pageNumber}-b${index + 1}`
      }));
      totalText += blocks.reduce((sum, block) => sum + block.text.length, 0);
      if (totalText > MAX_TEXT_CHARS) throw new Error("This document exceeds the 120,000 character text limit. Translate a smaller page range.");
      const processedPages = pageQuality.length;
      const start = 20 + Math.round((processedPages / job.selectedPages.length) * 62);
      updateProgress(start, `Translating page ${pageNumber} of ${job.pageCount}…`);
      const translationResult = await translateBlocks(blocks, options, job.controller, token, (done, count) => {
        const portion = Math.round((done / count) * 100);
        updateProgress(Math.min(82, start + Math.round(portion * 0.3)), `Translating page ${pageNumber} · batch ${done} of ${count}…`);
      });
      const translations = translationResult.translations;
      pageIssues.push(...translationResult.warnings);
      for (const detected of translationResult.detectedLanguages) job.detectedLanguages.add(detected);
      const resultBlocks = blocks.map(block => ({
        ...block,
        translation: translations.get(block.id) || ""
      }));
      previewBlocks.push(...resultBlocks);
      if (pdf.getPageCount() >= MAX_OUTPUT_PAGES) {
        throw new Error(`The translated document would exceed the ${MAX_OUTPUT_PAGES}-page output limit.`);
      }
      await renderTranslatedPage(pdf, page, blocks, translations, options.mode, pageNumber, pageIssues, renderBudget);
      quality.push(...pageIssues);
      pageQuality.push({
        page: pageNumber,
        status: pageIssues.length ? "warning" : "passed",
        issues: pageIssues
      });
      page.cleanup();
    }
    if (!pdf.getPageCount()) throw new Error("No readable text was found in the selected pages. Enable OCR for scanned PDFs.");
    const bytes = await pdf.save({ useObjectStreams: false });
    if (bytes.length > 80 * 1024 * 1024) throw new Error("The generated PDF is larger than the 80 MB download limit.");
    return { bytes, previewBlocks, quality, pageQuality, totalText, detectedLanguages: [...job.detectedLanguages] };
  }

  function renderPreview(blocks) {
    const list = el("pdf-preview-list");
    list.replaceChildren();
    for (const block of blocks.slice(0, 10)) {
      const item = document.createElement("article");
      item.className = "pdf-preview-block";
      const source = document.createElement("p");
      source.className = "pdf-preview-source";
      source.textContent = block.text;
      const output = document.createElement("p");
      output.className = "pdf-preview-translation";
      output.textContent = block.translation;
      item.append(source, output);
      list.appendChild(item);
    }
    el("pdf-preview-count").textContent = blocks.length > 10
      ? `Showing 10 of ${blocks.length} translated text blocks.`
      : `${blocks.length} translated text block${blocks.length === 1 ? "" : "s"}.`;
    el("pdf-preview").hidden = false;
  }

  function renderReport(quality, pageQuality, totalPages, totalText) {
    const list = el("pdf-quality");
    list.replaceChildren();
    for (const page of pageQuality) {
      const item = document.createElement("li");
      const label = page.status === "passed" ? "Passed" : page.status === "failed" ? "Failed" : "Warning";
      item.textContent = `Page ${page.page}: ${label}${page.issues.length ? ` · ${page.issues.join(" ")}` : ""}`;
      list.appendChild(item);
    }
    el("pdf-result-summary").textContent =
      `Generated ${totalPages} page(s) from ${totalText.toLocaleString()} extracted characters. Review the page warnings before using the PDF.`;
    if (quality.length > pageQuality.reduce((sum, page) => sum + page.issues.length, 0)) {
      const summary = document.createElement("li");
      summary.textContent = "Warning · some translated blocks required extra continuation pages.";
      list.appendChild(summary);
    }
  }

  async function run() {
    if (!file || !pdfReady || !pdfDocument) return;
    const token = ++runToken;
    activeController = new AbortController();
    const controller = activeController;
    setBusy(true);
    setError("");
    el("pdf-preview").hidden = true;
    el("pdf-result").hidden = true;
    updateProgress(12, "Preparing selected pages for translation…");
    try {
      const selectedPages = parsePageRange(el("pdf-page-range").value, pdfDocument.numPages);
      updateProgress(12, `Validated ${selectedPages.length} selected page(s). Preparing translation…`);
      const rawTarget = el("pdf-target-language").value.trim();
      const hinglish = rawTarget.toLowerCase() === "hinglish";
      const TARGET_ALIASES = { en: "EN-US", english: "EN-US", pt: "PT-BR", portuguese: "PT-BR" };
      const aliasCode = TARGET_ALIASES[rawTarget.toLowerCase()];
      const target = TARGETS.find(([code, name]) => code.toLowerCase() === rawTarget.toLowerCase() || name.toLowerCase() === rawTarget.toLowerCase())
        || (aliasCode ? TARGETS.find(([code]) => code === aliasCode) : null);
      if (!target && !hinglish) throw new Error("Choose a target language from the list.");
      const sourceLang = el("pdf-source-language").value || "";
      const mode = el("pdf-output-mode").value;
      if (target && target[0] === "HI" || sourceLang === "HI" || el("pdf-ocr-language").value === "hin" || mode === "bilingual") {
        const loadedFonts = await document.fonts.load('16px "Noto Sans Devanagari"', "हिन्दी");
        if (!loadedFonts.some(font => font.family.replace(/["']/g, "") === "Noto Sans Devanagari")) {
          throw new Error("The Devanagari font could not be loaded. Check your connection and retry.");
        }
      }
      const result = await createOutput({
        document: pdfDocument,
        pageCount: pdfDocument.numPages,
        selectedPages,
        controller,
        detectedLanguages: new Set()
      }, {
        targetLang: hinglish ? "HI" : target[0],
        hinglish,
        sourceLang,
        style: el("pdf-translation-style").value,
        mode,
        ocr: el("pdf-use-ocr").checked,
        ocrLanguage: el("pdf-ocr-language").value
      }, token);
      if (token !== runToken) return;
      updateProgress(94, "Validating generated PDF and preparing download…");
      const checked = await root.PDFLib.PDFDocument.load(result.bytes);
      if (checked.getPageCount() < 1) throw new Error("The generated PDF has no pages.");
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      const blob = new Blob([result.bytes], { type: "application/pdf" });
      outputUrl = URL.createObjectURL(blob);
      el("pdf-download").href = outputUrl;
      const fileBase = file.name.replace(/\.pdf$/i, "");
      const safeBase = fileBase.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "translated-document";
      el("pdf-download").download = `${safeBase}-${hinglish ? "hinglish" : target[0].toLowerCase()}.pdf`;
      renderPreview(result.previewBlocks);
      renderReport(result.quality, result.pageQuality, checked.getPageCount(), result.totalText);
      el("pdf-result").hidden = false;
      const detected = el("pdf-detected-source");
      const sourceSelect = el("pdf-source-language");
      const detectedSource = resolveSourceLanguage(sourceSelect.value, result.detectedLanguages);
      if (!sourceSelect.value && detectedSource) {
        sourceSelect.value = detectedSource;
      }
      detected.hidden = !!sourceSelect.value || !result.detectedLanguages.length;
      if (!detected.hidden) {
        const name = SOURCES.find(([code]) => code === result.detectedLanguages[0]);
        detected.textContent = `Detected source language: ${name ? name[1] : result.detectedLanguages[0]}.`;
      }
      updateProgress(100, "Translation complete. Review the preview and page-quality report.");
    } catch (error) {
      if (token !== runToken) return;
      if (error && error.name === "AbortError") {
        updateProgress(0, "Translation cancelled. Select Translate PDF to retry.");
        setError("Translation cancelled.");
      } else if (error && error.name === "PasswordException") {
        setError("Password-protected PDFs are not supported. Remove the password locally and try again.");
      } else {
        setError(error && error.message ? error.message : "PDF translation failed.");
        updateProgress(0, "Translation stopped. Correct the issue or retry.");
      }
    } finally {
      if (token === runToken && activeWorker) {
        await activeWorker.terminate();
        activeWorker = null;
      }
      if (token === runToken) {
        activeController = null;
        setBusy(false);
      }
    }
  }

  function mount() {
    const drop = el("pdf-drop");
    const input = el("pdf-file");
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => {
      const selected = input.files && input.files[0];
      input.value = "";
      selectFile(selected).catch(error => {
        console.error("PDF validation failed", error);
        setError("PDF validation failed. Select the file again to retry.");
      });
    });
    for (const eventName of ["dragenter", "dragover"]) {
      drop.addEventListener(eventName, event => {
        event.preventDefault();
        drop.classList.add("drag");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      drop.addEventListener(eventName, event => {
        event.preventDefault();
        drop.classList.remove("drag");
      });
    }
    drop.addEventListener("drop", event => {
      selectFile(event.dataTransfer && event.dataTransfer.files[0]).catch(error => {
        console.error("PDF validation failed", error);
        setError("PDF validation failed. Select the file again to retry.");
      });
    });
    el("pdf-run").addEventListener("click", run);
    el("pdf-cancel").addEventListener("click", () => {
      runToken += 1;
      if (activeController) activeController.abort();
      if (activeWorker) activeWorker.terminate().catch(error => console.error("OCR worker cleanup failed", error));
      activeWorker = null;
      activeController = null;
      setBusy(false);
      updateProgress(0, "Translation cancelled.");
      setError("Translation cancelled.");
    });
    const syncHinglishNote = () => {
      el("pdf-hinglish-note").hidden = el("pdf-target-language").value.trim().toLowerCase() !== "hinglish";
    };
    // Clear any stale error and restore the button label when the user changes the target language.
    el("pdf-target-language").addEventListener("change", () => {
      syncHinglishNote();
      // Clear the invalid state as soon as the user picks a valid target language.
      el("pdf-target-language").removeAttribute("aria-invalid");
      if (!el("pdf-error").hidden && /target language/i.test(el("pdf-error").textContent || "")) setError("");
    });
    el("pdf-hinglish-note").hidden = el("pdf-target-language").value.trim().toLowerCase() !== "hinglish";
    // OCR language only matters when OCR is enabled.
    const ocrCheckbox = el("pdf-use-ocr");
    const ocrLangSelect = el("pdf-ocr-language");
    const syncOcrLanguage = () => { ocrLangSelect.disabled = !ocrCheckbox.checked; };
    ocrCheckbox.addEventListener("change", syncOcrLanguage);
    syncOcrLanguage();
    if (root.pdfjsLib && root.pdfjsLib.GlobalWorkerOptions) {
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
    }
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
    }
    setError("");
    setBusy(false);
  }

  async function unmount() {
    runToken += 1;
    if (activeController) activeController.abort();
    activeController = null;
    const pending = [];
    if (activeWorker) {
      pending.push(activeWorker.terminate());
      activeWorker = null;
    }
    if (activeLoadingTask) {
      pending.push(activeLoadingTask.destroy());
      activeLoadingTask = null;
    }
    if (pdfDocument) {
      pending.push(pdfDocument.destroy());
      pdfDocument = null;
    }
    file = null;
    pdfReady = false;
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
    }
    await Promise.all(pending);
  }

  function getLanguages() {
    return { targets: TARGETS, sources: SOURCES };
  }

  root.PdfTranslator = { mount, unmount, getLanguages, parsePageRange, romanizeHindi, resolveSourceLanguage };
})(typeof window !== "undefined" ? window : globalThis);
