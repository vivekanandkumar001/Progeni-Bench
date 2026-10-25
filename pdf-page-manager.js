(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PdfPageManager = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const MAX_SECONDARY_BYTES = 30 * 1024 * 1024;
  const MAX_SOURCE_PAGES = 150;
  const MAX_OUTPUT_PAGES = 250;
  const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
  const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 40_000_000;
  const THUMB_WIDTH = 142;
  const THUMB_HEIGHT = 166;
  const PAGE_CARD_HEIGHT = 210;
  const PAGE_ROW_GAP = 12;
  const MAX_HISTORY = 50;
  const MM_TO_PT = 72 / 25.4;

  let currentSession = null;
  let nextPageId = 1;

  function makeId() {
    return `pdf-page-${nextPageId++}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function insertPages(pages, entries, index) {
    if (!Array.isArray(pages) || !Array.isArray(entries)) throw new TypeError("Pages must be arrays.");
    if (!Number.isInteger(index) || index < 0 || index > pages.length) throw new RangeError("Insert position is outside the page list.");
    return [...pages.slice(0, index), ...entries, ...pages.slice(index)];
  }

  function deletePages(pages, ids) {
    const selected = new Set(ids);
    const next = pages.filter(page => !selected.has(page.id));
    if (next.length === 0) throw new Error("A PDF must contain at least one page.");
    if (next.length === pages.length) throw new Error("Select at least one page to delete.");
    return next;
  }

  function duplicatePages(pages, ids, index) {
    const selected = new Set(ids);
    const copies = pages.filter(page => selected.has(page.id)).map(page => ({ ...page, id: makeId() }));
    if (!copies.length) throw new Error("Select at least one page to duplicate.");
    return insertPages(pages, copies, index);
  }

  function movePages(pages, ids, targetIndex) {
    const selected = new Set(ids);
    const moving = pages.filter(page => selected.has(page.id));
    if (!moving.length) return pages.slice();
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= pages.length) {
      throw new RangeError("Move position is outside the page list.");
    }
    const beforeTarget = pages.slice(0, targetIndex).filter(page => !selected.has(page.id)).length;
    const remaining = pages.filter(page => !selected.has(page.id));
    remaining.splice(beforeTarget, 0, ...moving);
    return remaining;
  }

  function createHistory(initialPages, maxEntries = MAX_HISTORY) {
    let entries = [initialPages.slice()];
    let cursor = 0;
    return {
      push(pages) {
        entries = entries.slice(0, cursor + 1);
        entries.push(pages.slice());
        if (entries.length > maxEntries) entries.shift();
        cursor = entries.length - 1;
      },
      undo() {
        if (cursor === 0) return null;
        cursor -= 1;
        return entries[cursor].slice();
      },
      redo() {
        if (cursor >= entries.length - 1) return null;
        cursor += 1;
        return entries[cursor].slice();
      },
      reset(pages) {
        entries = [pages.slice()];
        cursor = 0;
      },
      referencesSource(sourceId) {
        return entries.some(snapshot => snapshot.some(page => page.sourceId === sourceId));
      },
      get canUndo() { return cursor > 0; },
      get canRedo() { return cursor < entries.length - 1; }
    };
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeError(error) {
    if (error && (error.name === "PasswordException" || /password|encrypt/i.test(error.message || ""))) {
      return "This PDF is encrypted or password-protected. Password-protected documents are not supported.";
    }
    if (error && error.name === "InvalidPDFException") {
      return "This file is not a valid PDF or is damaged. Check the file and try again.";
    }
    return error && error.message ? error.message : "The PDF could not be processed.";
  }

  async function loadPdfSource(file, sourceId, maxBytes) {
    if (!file || !file.size) throw new Error("Choose a non-empty PDF file.");
    if (file.size > maxBytes) throw new Error(`This PDF is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      throw new Error("Choose a PDF file.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
      throw new Error("This file does not have a valid PDF header.");
    }

    let pdfjsDocument = null;
    try {
      const loadingTask = root.pdfjsLib.getDocument({
        data: bytes.slice(),
        isEvalSupported: false,
        disableAutoFetch: true,
        cMapUrl: "/vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/vendor/pdfjs/standard_fonts/"
      });
      pdfjsDocument = await loadingTask.promise;
      if (pdfjsDocument.numPages > MAX_SOURCE_PAGES) {
        throw new Error(`This PDF has ${pdfjsDocument.numPages} pages. The limit is ${MAX_SOURCE_PAGES} pages per source.`);
      }
      const pdfLibDocument = await root.PDFLib.PDFDocument.load(bytes.slice(), {
        updateMetadata: false
      });
      if (pdfLibDocument.getPageCount() !== pdfjsDocument.numPages) {
        throw new Error("The PDF readers disagree about the page count. The document may be damaged.");
      }
      const pages = pdfLibDocument.getPages().map((page, pageIndex) => ({
        id: makeId(),
        kind: "pdf",
        sourceId,
        pageIndex,
        width: page.getWidth(),
        height: page.getHeight(),
        rotation: page.getRotation().angle
      }));
      return { id: sourceId, file, bytes, pdfjsDocument, pdfLibDocument, pages };
    } catch (error) {
      if (pdfjsDocument) {
        try { await pdfjsDocument.destroy(); } catch (destroyError) {
          console.warn("PDF.js cleanup failed after a document load error.", destroyError);
        }
      }
      throw error;
    }
  }

  function mount() {
    if (currentSession) currentSession.unmount();
    const ui = document.getElementById("pdfpm");
    if (!ui) return null;
    if (!root.pdfjsLib || !root.PDFLib) throw new Error("PDF.js and pdf-lib must be loaded before mounting.");
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

    const $ = selector => ui.querySelector(selector);
    const sources = new Map();
    const canvasCache = new Map();
    const renderPromises = new Map();
    const imageBitmaps = new Map();
    const listeners = [];
    const observers = new Set();
    const gridObservers = new Map();
    const scrollContainers = [];
    const mainSelection = new Set();
    const sourceSelection = new Set();
    let mainSource = null;
    let secondarySource = null;
    let pages = [];
    let originalPages = [];
    let history = createHistory([]);
    let outputUrl = null;
    let isBusy = false;
    let renderFrame = 0;
    let dragPageId = null;
    let alive = true;

    const errorEl = $("#pdfpm-error");
    const statusEl = $("#pdfpm-status");
    const editor = $("#pdfpm-editor");
    const pageViewport = $("#pdfpm-pages");
    const sourceViewport = $("#pdfpm-source-pages");
    const outputStatus = $("#pdfpm-export-status");
    const progress = $("#pdfpm-progress");

    function on(node, event, handler, options) {
      if (!node) return;
      node.addEventListener(event, handler, options);
      listeners.push([node, event, handler, options]);
    }

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.textContent = "";
      errorEl.hidden = true;
    }

    function setBusy(busy) {
      isBusy = busy;
      ui.setAttribute("aria-busy", String(busy));
      editor.querySelectorAll("button, input, select").forEach(control => {
        if (control.id === "pdfpm-download") return;
        control.disabled = busy;
      });
      updateControls();
    }

    function revokeOutput() {
      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
        outputUrl = null;
      }
      const download = $("#pdfpm-download");
      download.hidden = true;
      download.removeAttribute("href");
    }

    function updateControls() {
      const selectedCount = mainSelection.size;
      $("#pdfpm-delete").disabled = isBusy || selectedCount === 0 || selectedCount === pages.length;
      $("#pdfpm-duplicate").disabled = isBusy || selectedCount === 0 || pages.length + selectedCount > MAX_OUTPUT_PAGES;
      $("#pdfpm-move-up").disabled = isBusy || selectedCount === 0 || pages.findIndex(page => mainSelection.has(page.id)) <= 0;
      $("#pdfpm-move-down").disabled = isBusy || selectedCount === 0 || pages.findLastIndex(page => mainSelection.has(page.id)) >= pages.length - 1;
      $("#pdfpm-undo").disabled = isBusy || !history.canUndo;
      $("#pdfpm-redo").disabled = isBusy || !history.canRedo;
      $("#pdfpm-export").disabled = isBusy || pages.length === 0;
      $("#pdfpm-insert-source").disabled = isBusy || !secondarySource || sourceSelection.size === 0 ||
        pages.length + sourceSelection.size > MAX_OUTPUT_PAGES;
      $("#pdfpm-append-source").disabled = isBusy || !secondarySource ||
        pages.length + (secondarySource ? secondarySource.pages.length : 0) > MAX_OUTPUT_PAGES;
      $("#pdfpm-final-count").textContent = `${pages.length} ${pages.length === 1 ? "page" : "pages"} in the edited PDF`;
      $("#pdfpm-page-summary").textContent = `${pages.length} pages · ${mainSelection.size} selected · ${MAX_OUTPUT_PAGES} page output limit`;
    }

    function updateSelectionClasses(viewport) {
      if (!viewport) return;
      const selection = viewport === sourceViewport ? sourceSelection : mainSelection;
      viewport.querySelectorAll("[data-page-id]").forEach(card => {
        const checked = selection.has(card.dataset.pageId);
        card.classList.toggle("selected", checked);
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = checked;
      });
      if (viewport === sourceViewport) $("#pdfpm-insert-source").disabled = isBusy || !secondarySource ||
        sourceSelection.size === 0 || pages.length + sourceSelection.size > MAX_OUTPUT_PAGES;
      else updateControls();
    }

    function destroySource(source) {
      if (!source) return;
      for (const key of [...canvasCache.keys()]) {
        if (key.startsWith(`${source.id}:`)) canvasCache.delete(key);
      }
      for (const key of [...renderPromises.keys()]) {
        if (key.startsWith(`${source.id}:`)) renderPromises.delete(key);
      }
      sources.delete(source.id);
      source.pdfjsDocument.destroy().catch(error => console.warn("PDF.js document cleanup failed.", error));
    }

    function renderKey(entry) {
      return entry.kind === "pdf" ? `${entry.sourceId}:${entry.pageIndex}` : `image:${entry.id}`;
    }

    function drawImageThumb(entry, canvas) {
      const bitmapPromise = imageBitmaps.get(entry.id) ||
        createImageBitmap(new Blob([entry.imageBytes], { type: entry.mime }));
      imageBitmaps.set(entry.id, bitmapPromise);
      return bitmapPromise.then(bitmap => {
        if (!alive || !canvas.isConnected) return;
        const scale = Math.min(THUMB_WIDTH / bitmap.width, THUMB_HEIGHT / bitmap.height, 1);
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      });
    }

    async function drawPdfThumb(entry, canvas) {
      const source = sources.get(entry.sourceId);
      if (!source) throw new Error("The source PDF is no longer available. Reload it to render thumbnails.");
      const page = await source.pdfjsDocument.getPage(entry.pageIndex + 1);
      if (!alive || !canvas.isConnected) {
        page.cleanup();
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(THUMB_WIDTH / base.width, THUMB_HEIGHT / base.height, 0.4);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        await page.render({
          canvasContext: canvas.getContext("2d", { alpha: false }),
          viewport,
          background: "#ffffff"
        }).promise;
      } finally {
        page.cleanup();
      }
    }

    function renderThumbnail(entry, canvas) {
      const key = renderKey(entry);
      if (entry.kind === "blank") {
        canvas.width = 120;
        canvas.height = 156;
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "#d8dee8";
        context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
        context.fillStyle = "#64748b";
        context.font = "12px sans-serif";
        context.textAlign = "center";
        context.fillText("Blank page", 60, 80);
        return Promise.resolve();
      }
      if (canvasCache.has(key)) {
        const cached = canvasCache.get(key);
        canvas.width = cached.width;
        canvas.height = cached.height;
        canvas.getContext("2d").drawImage(cached, 0, 0);
        return Promise.resolve();
      }
      if (!renderPromises.has(key)) {
        const cached = document.createElement("canvas");
        const task = entry.kind === "image"
          ? drawImageThumb(entry, cached)
          : drawPdfThumb(entry, cached);
        renderPromises.set(key, task.then(() => {
          canvasCache.set(key, cached);
          return cached;
        }).finally(() => renderPromises.delete(key)));
      }
      return renderPromises.get(key).then(cached => {
        if (!alive || !canvas.isConnected) return;
        canvas.width = cached.width;
        canvas.height = cached.height;
        canvas.getContext("2d").drawImage(cached, 0, 0);
      });
    }

    function cardMarkup(entry, position, isMain) {
      const label = entry.kind === "blank" ? "Blank page" : entry.fileName;
      const moveText = isMain ? "Drag to reorder" : "Select pages to insert";
      return `<article class="pdfpm-page-card${mainSelection.has(entry.id) && isMain ? " selected" : ""}${sourceSelection.has(entry.id) && !isMain ? " selected" : ""}" data-page-id="${entry.id}" role="listitem"${isMain ? ' draggable="true"' : ""} aria-label="Page ${position + 1}: ${escapeHtml(label)}. ${moveText}.">
        <label class="pdfpm-select"><input type="checkbox" data-select-page aria-label="Select page ${position + 1}"${(isMain ? mainSelection : sourceSelection).has(entry.id) ? " checked" : ""}></label>
        <div class="pdfpm-thumbnail"><canvas aria-hidden="true"></canvas></div>
        <span class="pdfpm-page-label">Page ${position + 1}${entry.kind === "blank" ? " · blank" : entry.kind === "image" ? " · image" : ""}</span>
      </article>`;
    }

    function renderGrid(viewport, entries, isMain) {
      if (!viewport) return;
      const oldObserver = gridObservers.get(viewport);
      if (oldObserver) {
        oldObserver.disconnect();
        observers.delete(oldObserver);
        gridObservers.delete(viewport);
      }
      const savedScroll = viewport.scrollTop;
      const width = Math.max(1, viewport.clientWidth);
      const columns = Math.max(1, Math.floor((width - 24 + PAGE_ROW_GAP) / (132 + PAGE_ROW_GAP)));
      const rowHeight = PAGE_CARD_HEIGHT + PAGE_ROW_GAP;
      const totalRows = Math.ceil(entries.length / columns);
      const firstVisibleRow = Math.max(0, Math.floor(savedScroll / rowHeight) - 2);
      const lastVisibleRow = Math.min(totalRows, Math.ceil((savedScroll + viewport.clientHeight) / rowHeight) + 2);
      const startIndex = firstVisibleRow * columns;
      const endIndex = Math.min(entries.length, lastVisibleRow * columns);
      const grid = document.createElement("div");
      grid.className = "pdfpm-grid";
      if (!entries.length) {
        grid.innerHTML = '<p class="pdfpm-empty">No pages to show.</p>';
        viewport.replaceChildren(grid);
        return;
      }
      if (startIndex > 0) {
        const spacer = document.createElement("div");
        spacer.className = "pdfpm-spacer";
        spacer.style.height = `${firstVisibleRow * rowHeight}px`;
        spacer.setAttribute("aria-hidden", "true");
        grid.appendChild(spacer);
      }
      grid.insertAdjacentHTML("beforeend", entries.slice(startIndex, endIndex)
        .map((entry, offset) => cardMarkup(entry, startIndex + offset, isMain)).join(""));
      if (lastVisibleRow < totalRows) {
        const spacer = document.createElement("div");
        spacer.className = "pdfpm-spacer";
        spacer.style.height = `${(totalRows - lastVisibleRow) * rowHeight}px`;
        spacer.setAttribute("aria-hidden", "true");
        grid.appendChild(spacer);
      }
      viewport.replaceChildren(grid);
      viewport.scrollTop = savedScroll;

      const observer = typeof IntersectionObserver === "function"
        ? new IntersectionObserver(items => {
          items.forEach(item => {
            if (!item.isIntersecting) return;
            const card = item.target;
            observer.unobserve(card);
            const entry = entries.find(page => page.id === card.dataset.pageId);
            const canvas = card.querySelector("canvas");
            if (entry && canvas) renderThumbnail(entry, canvas).catch(error => {
              if (alive && canvas.isConnected) {
                const message = document.createElement("span");
                message.className = "pdfpm-thumb-error";
                message.textContent = "Preview unavailable";
                canvas.replaceWith(message);
              }
              console.warn("A PDF thumbnail could not be rendered.", error);
            });
          });
        }, { root: viewport, rootMargin: "240px" })
        : null;
      if (observer) {
        observers.add(observer);
        gridObservers.set(viewport, observer);
        viewport.querySelectorAll(".pdfpm-page-card").forEach(card => observer.observe(card));
      } else {
        viewport.querySelectorAll(".pdfpm-page-card").forEach(card => {
          const entry = entries.find(page => page.id === card.dataset.pageId);
          const canvas = card.querySelector("canvas");
          if (entry && canvas) renderThumbnail(entry, canvas).catch(error => console.warn("A PDF thumbnail could not be rendered.", error));
        });
      }
    }

    function renderMain() {
      if (!alive) return;
      renderGrid(pageViewport, pages, true);
      updateControls();
    }

    function renderSecondary() {
      const section = $("#pdfpm-source");
      section.hidden = !secondarySource;
      if (!secondarySource) {
        sourceViewport.replaceChildren();
        updateControls();
        return;
      }
      $("#pdfpm-source-info").textContent =
        `${secondarySource.file.name} · ${formatBytes(secondarySource.file.size)} · ${secondarySource.pages.length} pages`;
      renderGrid(sourceViewport, secondarySource.pages, false);
      updateControls();
    }

    function resetOutput() {
      revokeOutput();
      outputStatus.textContent = "";
      progress.hidden = true;
      progress.value = 0;
    }

    function commit(nextPages, selectedIds = []) {
      if (nextPages.length > MAX_OUTPUT_PAGES) throw new Error(`The edited PDF cannot exceed ${MAX_OUTPUT_PAGES} pages.`);
      if (!nextPages.length) throw new Error("A PDF must contain at least one page.");
      pages = nextPages;
      mainSelection.clear();
      selectedIds.forEach(id => {
        if (pages.some(page => page.id === id)) mainSelection.add(id);
      });
      history.push(pages);
      resetOutput();
      renderMain();
    }

    function insertionIndex() {
      const mode = $("#pdfpm-position").value;
      if (mode === "append" || mainSelection.size === 0) return pages.length;
      const selectedIndexes = pages
        .map((page, index) => mainSelection.has(page.id) ? index : -1)
        .filter(index => index >= 0);
      return mode === "before" ? selectedIndexes[0] : selectedIndexes[selectedIndexes.length - 1] + 1;
    }

    function selectedMainPages() {
      return pages.filter(page => mainSelection.has(page.id));
    }

    function updatePositionAndRender() {
      const custom = $("#pdfpm-page-size").value === "custom";
      $("#pdfpm-custom-size").hidden = !custom;
      $("#pdfpm-custom-size").setAttribute("aria-hidden", String(!custom));
    }

    function selectedDimensions(atIndex) {
      const mode = $("#pdfpm-page-size").value;
      if (mode === "adjacent") {
        const neighborIndex = $("#pdfpm-position").value === "before"
          ? Math.min(atIndex, pages.length - 1)
          : Math.max(0, atIndex - 1);
        const neighbor = pages[neighborIndex];
        if (neighbor) return { width: neighbor.width, height: neighbor.height, rotation: neighbor.rotation || 0 };
        return { width: 595.28, height: 841.89, rotation: 0 };
      }
      if (mode === "a4") return { width: 595.28, height: 841.89, rotation: 0 };
      if (mode === "letter") return { width: 612, height: 792, rotation: 0 };
      const width = Number($("#pdfpm-width").value);
      const height = Number($("#pdfpm-height").value);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 50 || width > 1000 || height < 50 || height > 1000) {
        throw new Error("Custom page width and height must each be between 50 mm and 1000 mm.");
      }
      return { width: width * MM_TO_PT, height: height * MM_TO_PT, rotation: 0 };
    }

    function commitInsertion(entries, announce) {
      if (pages.length + entries.length > MAX_OUTPUT_PAGES) {
        throw new Error(`This change would exceed the ${MAX_OUTPUT_PAGES}-page output limit.`);
      }
      const index = insertionIndex();
      commit(insertPages(pages, entries, index), entries.map(entry => entry.id));
      statusEl.textContent = `${entries.length} ${entries.length === 1 ? "page" : "pages"} ${announce} at position ${index + 1}.`;
    }

    function makeBlankPage() {
      const dims = selectedDimensions(insertionIndex());
      return { id: makeId(), kind: "blank", width: dims.width, height: dims.height, rotation: dims.rotation };
    }

    async function loadMainFile(file) {
      clearError();
      setBusy(true);
      statusEl.textContent = "Reading and validating the PDF locally…";
      try {
        const source = await loadPdfSource(file, "main", MAX_FILE_BYTES);
        if (!alive) {
          source.pdfjsDocument.destroy().catch(error => console.warn("PDF.js cleanup failed.", error));
          return;
        }
        for (const oldSource of sources.values()) destroySource(oldSource);
        sources.clear();
        for (const bitmap of imageBitmaps.values()) bitmap.then(value => value.close()).catch(() => {});
        imageBitmaps.clear();
        canvasCache.clear();
        renderPromises.clear();
        mainSource = source;
        sources.set(source.id, source);
        secondarySource = null;
        pages = source.pages.slice();
        originalPages = source.pages.slice();
        mainSelection.clear();
        sourceSelection.clear();
        history = createHistory(pages);
        editor.hidden = false;
        $("#pdfpm-file-info").replaceChildren();
        const name = document.createElement("strong");
        name.textContent = file.name;
        const details = document.createElement("span");
        details.textContent = `${formatBytes(file.size)} · ${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
        $("#pdfpm-file-info").append(name, details);
        renderSecondary();
        renderMain();
        resetOutput();
        statusEl.textContent = `Loaded ${file.name}. The original file remains unchanged.`;
      } catch (error) {
        showError(safeError(error));
        statusEl.textContent = "The PDF could not be loaded.";
      } finally {
        if (alive) setBusy(false);
      }
    }

    async function loadSecondaryFile(file) {
      clearError();
      if (secondarySource && pages.some(page => page.sourceId === secondarySource.id)) {
        showError("Remove inserted pages from the current source PDF before choosing a replacement, or reset the editor.");
        return;
      }
      if (secondarySource && history.referencesSource(secondarySource.id)) {
        showError("The second PDF is referenced by undo or redo history. Remove that source first to clear its history before replacing it.");
        return;
      }
      setBusy(true);
      statusEl.textContent = "Reading the second PDF locally…";
      try {
        const source = await loadPdfSource(file, "secondary", MAX_SECONDARY_BYTES);
        if (!alive) {
          source.pdfjsDocument.destroy().catch(error => console.warn("PDF.js cleanup failed.", error));
          return;
        }
        if (secondarySource) destroySource(secondarySource);
        secondarySource = source;
        sources.set(source.id, source);
        sourceSelection.clear();
        renderSecondary();
        statusEl.textContent = `Loaded ${file.name}. Select pages to insert or append the full PDF.`;
      } catch (error) {
        showError(safeError(error));
        statusEl.textContent = "The second PDF could not be loaded.";
      } finally {
        if (alive) setBusy(false);
      }
    }

    async function addImages(fileList) {
      const files = [...fileList];
      if (!files.length) return;
      clearError();
      const entries = [];
      try {
        for (const file of files) {
          if (!["image/png", "image/jpeg"].includes(file.type) &&
              !/\.(png|jpe?g)$/i.test(file.name)) {
            throw new Error(`${file.name} is not a supported PNG or JPEG image.`);
          }
          if (!file.size || file.size > 20 * 1024 * 1024) {
            throw new Error(`${file.name} must be non-empty and no larger than 20 MB.`);
          }
          const mime = file.type === "image/png" || /\.png$/i.test(file.name) ? "image/png" : "image/jpeg";
          const bytes = new Uint8Array(await file.arrayBuffer());
          const dims = selectedDimensions(insertionIndex() + entries.length);
          const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
          const totalImageBytes = pages.concat(entries)
            .filter(page => page.kind === "image")
            .reduce((total, page) => total + page.imageBytes.byteLength, 0);
          if (totalImageBytes + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) {
            bitmap.close();
            throw new Error(`Images in one edited document are limited to ${formatBytes(MAX_TOTAL_IMAGE_BYTES)} total.`);
          }
          if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
            bitmap.close();
            throw new Error(`${file.name} has too many pixels for a safe browser preview.`);
          }
          const id = makeId();
          entries.push({
            id, kind: "image", imageBytes: bytes, mime, fileName: file.name,
            imageWidth: bitmap.width, imageHeight: bitmap.height,
            width: dims.width, height: dims.height, rotation: dims.rotation
          });
          imageBitmaps.set(id, Promise.resolve(bitmap));
        }
        commitInsertion(entries, "inserted");
      } catch (error) {
        entries.forEach(entry => {
          const bitmap = imageBitmaps.get(entry.id);
          if (bitmap) bitmap.then(image => image.close()).catch(() => {});
          imageBitmaps.delete(entry.id);
        });
        showError(safeError(error));
      }
    }

    function removeSelected() {
      const count = mainSelection.size;
      if (!count) return;
      if (!window.confirm(`Delete ${count} selected ${count === 1 ? "page" : "pages"}? This can be undone.`)) return;
      try {
        commit(deletePages(pages, mainSelection), []);
        statusEl.textContent = `${count} ${count === 1 ? "page" : "pages"} deleted. Use Undo to restore them.`;
      } catch (error) { showError(safeError(error)); }
    }

    function duplicateSelected() {
      try {
        const copies = selectedMainPages().map(page => ({ ...page, id: makeId() }));
        const next = insertPages(pages, copies, insertionIndex());
        commit(next, copies.map(page => page.id));
        statusEl.textContent = `${copies.length} ${copies.length === 1 ? "page" : "pages"} duplicated.`;
      } catch (error) { showError(safeError(error)); }
    }

    function moveSelected(direction) {
      const ids = new Set(mainSelection);
      if (!ids.size) return;
      let next = pages.slice();
      if (direction < 0) {
        for (let i = 0; i < next.length; i += 1) {
          if (!ids.has(next[i].id) || i === 0 || ids.has(next[i - 1].id)) continue;
          const [page] = next.splice(i, 1);
          next.splice(i - 1, 0, page);
        }
      } else {
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (!ids.has(next[i].id) || i === next.length - 1 || ids.has(next[i + 1].id)) continue;
          const [page] = next.splice(i, 1);
          next.splice(i + 1, 0, page);
        }
      }
      if (next.some((page, index) => page !== pages[index])) {
        commit(next, [...ids]);
        statusEl.textContent = direction < 0 ? "Selected pages moved earlier." : "Selected pages moved later.";
      }
    }

    function undo() {
      const previous = history.undo();
      if (!previous) return;
      pages = previous;
      mainSelection.clear();
      resetOutput();
      renderMain();
      statusEl.textContent = "Undid the last page operation.";
    }

    function redo() {
      const next = history.redo();
      if (!next) return;
      pages = next;
      mainSelection.clear();
      resetOutput();
      renderMain();
      statusEl.textContent = "Redid the page operation.";
    }

    function resetToOriginal() {
      if (!mainSource || !window.confirm("Discard all page edits and return to the original PDF?")) return;
      for (const image of imageBitmaps.values()) image.then(bitmap => bitmap.close()).catch(() => {});
      imageBitmaps.clear();
      if (secondarySource) destroySource(secondarySource);
      secondarySource = null;
      sourceSelection.clear();
      pages = originalPages.slice();
      history.reset(pages);
      mainSelection.clear();
      renderSecondary();
      renderMain();
      resetOutput();
      statusEl.textContent = "The original page order has been restored.";
    }

    function addSelectedSourcePages(appendAll) {
      if (!secondarySource) return;
      const sourcePages = appendAll
        ? secondarySource.pages
        : secondarySource.pages.filter(page => sourceSelection.has(page.id));
      if (!sourcePages.length) {
        showError("Select one or more pages from the second PDF first.");
        return;
      }
      const entries = sourcePages.map(page => ({ ...page, id: makeId() }));
      const oldMode = $("#pdfpm-position").value;
      if (appendAll) $("#pdfpm-position").value = "append";
      try {
        commitInsertion(entries, appendAll ? "appended" : "inserted");
        sourceSelection.clear();
        updateSelectionClasses(sourceViewport);
      } catch (error) { showError(safeError(error)); }
      finally {
        if (appendAll) $("#pdfpm-position").value = oldMode;
      }
    }

    function removeSecondary() {
      if (!secondarySource) return;
      if (pages.some(page => page.sourceId === secondarySource.id)) {
        showError("Remove the inserted pages from the main document before removing this source PDF. Reset to original also removes it.");
        return;
      }
      const clearsHistory = history.referencesSource(secondarySource.id);
      destroySource(secondarySource);
      secondarySource = null;
      sourceSelection.clear();
      if (clearsHistory) {
        history.reset(pages);
        renderMain();
      }
      renderSecondary();
      statusEl.textContent = clearsHistory
        ? "The second PDF was removed from memory and its undo/redo history was cleared."
        : "The second PDF was removed from memory.";
    }

    async function exportPdf() {
      clearError();
      if (!pages.length || !mainSource) return;
      setBusy(true);
      progress.hidden = false;
      progress.value = 0;
      outputStatus.textContent = "Building a new PDF in browser memory…";
      const PDFDocument = root.PDFLib.PDFDocument;
      try {
        const output = await PDFDocument.create();
        for (let i = 0; i < pages.length; i += 1) {
          const entry = pages[i];
          if (entry.kind === "pdf") {
            const source = sources.get(entry.sourceId);
            if (!source) throw new Error("A source document needed for export is no longer available.");
            const [copiedPage] = await output.copyPages(source.pdfLibDocument, [entry.pageIndex]);
            output.addPage(copiedPage);
          } else if (entry.kind === "blank") {
            const page = output.addPage([entry.width, entry.height]);
            if (entry.rotation) page.setRotation(root.PDFLib.degrees(entry.rotation));
          } else if (entry.kind === "image") {
            const page = output.addPage([entry.width, entry.height]);
            if (entry.rotation) page.setRotation(root.PDFLib.degrees(entry.rotation));
            const image = entry.mime === "image/png"
              ? await output.embedPng(entry.imageBytes)
              : await output.embedJpg(entry.imageBytes);
            const margin = 36;
            const scale = Math.min((entry.width - margin * 2) / image.width, (entry.height - margin * 2) / image.height);
            if (!Number.isFinite(scale) || scale <= 0) throw new Error(`The chosen page size is too small for ${entry.fileName}.`);
            const width = image.width * scale;
            const height = image.height * scale;
            page.drawImage(image, {
              x: (entry.width - width) / 2,
              y: (entry.height - height) / 2,
              width,
              height
            });
          }
          progress.value = Math.round(((i + 1) / pages.length) * 85);
          if ((i + 1) % 5 === 0) {
            outputStatus.textContent = `Assembling page ${i + 1} of ${pages.length}…`;
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        output.setProducer("Progeni Bench PDF Page Manager");
        output.setCreator("Progeni Bench PDF Page Manager");
        const bytes = await output.save();
        if (bytes.byteLength > MAX_OUTPUT_BYTES) {
          throw new Error(`The output is ${formatBytes(bytes.byteLength)}. The browser safety limit is ${formatBytes(MAX_OUTPUT_BYTES)}.`);
        }
        progress.value = 92;
        outputStatus.textContent = "Reopening the exported PDF to validate it…";
        const validation = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
        if (validation.getPageCount() !== pages.length) {
          throw new Error(`Output validation failed: expected ${pages.length} pages, found ${validation.getPageCount()}.`);
        }
        const outputPages = validation.getPages();
        for (let i = 0; i < pages.length; i += 1) {
          const expected = pages[i];
          const actual = outputPages[i];
          if (Math.abs(actual.getWidth() - expected.width) > 0.5 ||
              Math.abs(actual.getHeight() - expected.height) > 0.5 ||
              actual.getRotation().angle !== (expected.rotation || 0)) {
            throw new Error(`Output validation failed on page ${i + 1}: its dimensions or rotation changed.`);
          }
        }
        revokeOutput();
        const blob = new Blob([bytes], { type: "application/pdf" });
        outputUrl = URL.createObjectURL(blob);
        const download = $("#pdfpm-download");
        download.href = outputUrl;
        download.download = `${(mainSource.file.name.replace(/\.pdf$/i, "") || "document")}-edited.pdf`;
        download.hidden = false;
        progress.value = 100;
        outputStatus.textContent = `Export ready · ${pages.length} pages · ${formatBytes(bytes.byteLength)}. Output reopened and validated.`;
        statusEl.textContent = "PDF export completed and validated.";
      } catch (error) {
        showError(safeError(error));
        outputStatus.textContent = "Export failed. Your source files and page edits are unchanged.";
      } finally {
        if (alive) setBusy(false);
      }
    }

    async function onFileSelection(input, callback) {
      const file = input.files && input.files[0];
      input.value = "";
      if (file) await callback(file);
    }

    on($("#pdfpm-file"), "change", event => onFileSelection(event.currentTarget, loadMainFile));
    on($("#pdfpm-drop"), "click", () => $("#pdfpm-file").click());
    on($("#pdfpm-drop"), "keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("#pdfpm-file").click();
      }
    });
    on($("#pdfpm-drop"), "dragover", event => {
      event.preventDefault();
      $("#pdfpm-drop").classList.add("drag");
    });
    on($("#pdfpm-drop"), "dragleave", () => $("#pdfpm-drop").classList.remove("drag"));
    on($("#pdfpm-drop"), "drop", event => {
      event.preventDefault();
      $("#pdfpm-drop").classList.remove("drag");
      const file = [...(event.dataTransfer?.files || [])].find(item => /\.pdf$/i.test(item.name) || item.type === "application/pdf");
      if (file) loadMainFile(file);
      else showError("Drop a PDF file to begin.");
    });
    on($("#pdfpm-select-all"), "click", () => {
      pages.forEach(page => mainSelection.add(page.id));
      updateSelectionClasses(pageViewport);
    });
    on($("#pdfpm-clear-selection"), "click", () => {
      mainSelection.clear();
      updateSelectionClasses(pageViewport);
    });
    on($("#pdfpm-delete"), "click", removeSelected);
    on($("#pdfpm-duplicate"), "click", duplicateSelected);
    on($("#pdfpm-move-up"), "click", () => moveSelected(-1));
    on($("#pdfpm-move-down"), "click", () => moveSelected(1));
    on($("#pdfpm-undo"), "click", undo);
    on($("#pdfpm-redo"), "click", redo);
    on($("#pdfpm-reset"), "click", resetToOriginal);
    on($("#pdfpm-add-blank"), "click", () => {
      try { commitInsertion([makeBlankPage()], "inserted"); }
      catch (error) { showError(safeError(error)); }
    });
    on($("#pdfpm-add-image"), "click", () => $("#pdfpm-image-file").click());
    on($("#pdfpm-image-file"), "change", event => {
      const files = [...event.currentTarget.files];
      event.currentTarget.value = "";
      addImages(files);
    });
    on($("#pdfpm-add-pdf"), "click", () => $("#pdfpm-second-file").click());
    on($("#pdfpm-second-file"), "change", event => onFileSelection(event.currentTarget, loadSecondaryFile));
    on($("#pdfpm-page-size"), "change", updatePositionAndRender);
    on($("#pdfpm-insert-source"), "click", () => addSelectedSourcePages(false));
    on($("#pdfpm-append-source"), "click", () => addSelectedSourcePages(true));
    on($("#pdfpm-source-select-all"), "click", () => {
      secondarySource?.pages.forEach(page => sourceSelection.add(page.id));
      updateSelectionClasses(sourceViewport);
    });
    on($("#pdfpm-close-source"), "click", removeSecondary);
    on($("#pdfpm-export"), "click", exportPdf);
    on(pageViewport, "change", event => {
      const input = event.target.closest("[data-select-page]");
      const card = input?.closest("[data-page-id]");
      if (!card) return;
      if (input.checked) mainSelection.add(card.dataset.pageId);
      else mainSelection.delete(card.dataset.pageId);
      updateSelectionClasses(pageViewport);
    });
    on(sourceViewport, "change", event => {
      const input = event.target.closest("[data-select-page]");
      const card = input?.closest("[data-page-id]");
      if (!card) return;
      if (input.checked) sourceSelection.add(card.dataset.pageId);
      else sourceSelection.delete(card.dataset.pageId);
      updateSelectionClasses(sourceViewport);
    });
    on(pageViewport, "dragstart", event => {
      const card = event.target.closest(".pdfpm-page-card");
      if (!card || isBusy) return;
      dragPageId = card.dataset.pageId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragPageId);
      card.classList.add("dragging");
    });
    on(pageViewport, "dragend", event => {
      event.target.closest(".pdfpm-page-card")?.classList.remove("dragging");
      dragPageId = null;
    });
    on(pageViewport, "dragover", event => {
      if (dragPageId) event.preventDefault();
    });
    on(pageViewport, "drop", event => {
      if (!dragPageId) return;
      event.preventDefault();
      const targetCard = event.target.closest(".pdfpm-page-card");
      const target = pages.findIndex(page => page.id === targetCard?.dataset.pageId);
      const from = pages.findIndex(page => page.id === dragPageId);
      if (target < 0 || from < 0 || target === from) return;
      const ids = mainSelection.has(dragPageId) ? new Set(mainSelection) : new Set([dragPageId]);
      const next = movePages(pages, ids, target);
      if (next.some((page, index) => page !== pages[index])) {
        commit(next, [...ids]);
        statusEl.textContent = "Page order updated.";
      }
    });
    [pageViewport, sourceViewport].forEach(viewport => {
      const onScroll = () => {
        if (renderFrame) cancelAnimationFrame(renderFrame);
        renderFrame = requestAnimationFrame(() => {
          if (viewport === pageViewport) renderGrid(pageViewport, pages, true);
          else if (secondarySource) renderGrid(sourceViewport, secondarySource.pages, false);
        });
      };
      on(viewport, "scroll", onScroll, { passive: true });
      scrollContainers.push(viewport);
    });
    on(window, "resize", () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(() => {
        renderGrid(pageViewport, pages, true);
        if (secondarySource) renderGrid(sourceViewport, secondarySource.pages, false);
      });
    });
    on(document, "keydown", event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y") return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault();
      if (event.key.toLowerCase() === "z" && event.shiftKey) redo();
      else if (event.key.toLowerCase() === "z") undo();
      else redo();
    });

    renderMain();
    updatePositionAndRender();
    currentSession = {
      unmount() {
        if (!alive) return;
        alive = false;
        observers.forEach(observer => observer.disconnect());
        observers.clear();
        gridObservers.clear();
        if (renderFrame) cancelAnimationFrame(renderFrame);
        listeners.forEach(([node, event, handler, options]) => node.removeEventListener(event, handler, options));
        revokeOutput();
        imageBitmaps.forEach(bitmap => bitmap.then(value => value.close()).catch(() => {}));
        imageBitmaps.clear();
        for (const source of sources.values()) {
          source.pdfjsDocument.destroy().catch(error => console.warn("PDF.js document cleanup failed.", error));
        }
        sources.clear();
        canvasCache.clear();
        renderPromises.clear();
        if (currentSession === this) currentSession = null;
      }
    };
    return currentSession;
  }

  function unmount() {
    if (currentSession) currentSession.unmount();
  }

  return {
    MAX_FILE_BYTES,
    MAX_SECONDARY_BYTES,
    MAX_SOURCE_PAGES,
    MAX_OUTPUT_PAGES,
    insertPages,
    deletePages,
    duplicatePages,
    movePages,
    createHistory,
    mount,
    unmount
  };
});
