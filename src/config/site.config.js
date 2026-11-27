/*
 * site.config.js - Single Source of Truth for Brand and Tool Metadata
 * UMD module for Browser and Node.js environments
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SiteConfig = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const PARENT_BRAND = "Progeni";
  const PARENT_URL = "https://progeni.live";
  const SITE_NAME = "Progeni Bench";
  const SITE_SHORT = "Bench";
  const SITE_URL = "https://bench.progeni.live";
  const SUPPORT_EMAIL = "support@progeni.live";
  const TAGLINE = "Small file jobs, done privately in your browser.";
  const LOCALE = "en-IN";
  // Date the public content was last reviewed. Used for schema dateModified,
  // sitemap lastmod and llms.txt so builds stay deterministic.
  const LAST_UPDATED = "2026-10-25";
  // Toolkits rewritten with distinct page copy get their own deterministic
  // lastmod so genuinely updated pages are not hidden behind one global date.
  const TOOLKIT_UPDATED = { image: "2026-11-20", audio: "2026-11-20" };
  // All tools are free, so the offer currency is only a schema formality.
  const PRICE_CURRENCY = "USD";
  const CLARITY_ID = "zgqmvac9i4";
  const INDEXNOW_KEY = "c032a188f5724bc4935ef7a07525d886";

  const TOOLS = [
  {
    "id": "sticker-sheet",
    "icon": "🏷️",
    "cat": "Print & Craft",
    "name": "Sticker Sheet Maker",
    "keyword": "Sticker Sheet Maker",
    "desc": "Build printable sticker sheets in your browser — custom grids, shapes, kiss-cut lines, and PNG / PDF / SVG die-line export for Cricut, Silhouette, or home printers.",
    "seoDesc": "Create print-ready sticker sheets in your browser: custom grid, spacing, shapes, kiss-cut lines and PNG/PDF/SVG die-line export for Cricut. No uploads.",
    "whatItDoes": "Arranges any number of transparent PNG or JPEG graphics onto a precise multi-column sticker layout on US Letter, A4, A3 or 4x6 paper at 300 DPI. Every sticker can be fitted (contain or cover), masked to a square, rounded or true-circle shape, outlined with a white kiss-cut border, extended with print bleed, and traced with dashed or solid cut lines plus optional corner registration marks for Print-Then-Cut workflows. A per-sticker editor gives you rotate, flip, size control (with live mm readout) and automatic transparent-edge trimming, and the whole sheet supports undo/redo, saved projects, zoom with a tilt-able 3D paper preview, multi-copy sheets, browser printing, and PNG / PDF / SVG die-line export.",
    "howToUse": [
      "Choose your paper standard (US Letter, A4, A3, or 4x6 photo paper) and set columns, rows, spacing, margins, and bleed — or leave columns on Auto to fit everything on one page.",
      "Drag and drop your PNG, JPEG, WebP, or SVG graphics into the upload box with a live loading bar. There is no 12-image limit: extra designs automatically flow onto additional pages, and Sheet copies repeats every sticker up to 4 times.",
      "Style the sheet: contain or cover fit, square / rounded / circle shape, white kiss-cut border width, dashed or solid cut lines, cut line color, background color, and optional corner registration marks.",
      "Click the pencil on any thumbnail to open the per-sticker editor: rotate, flip, resize with mm readout, trim transparent edges, replace, duplicate, or delete. Drag thumbnails to reorder (or Ctrl+Arrow keys), and undo any step with Ctrl+Z.",
      "Preview flat in 2D with zoom/pan or switch to the 3D tilt view, then download a 300 DPI PNG, a print-ready multi-page PDF, an SVG die-line for Cricut / Silhouette, or send the sheet straight to your printer. Save the project in your browser or export it as JSON."
    ],
    "limits": "Cut lines follow the chosen sticker shape (square, rounded, circle) — the tool does not auto-trace irregular artwork silhouettes into vector contours. PNG and SVG export the page currently shown (or all pages at once); PDF bundles every page into one file. Saved projects use this browser's local storage; use Export JSON to move a project between devices.",
    "privacy": "All canvas operations and image composing execute locally in your web browser memory. Your illustrations and design assets are never transmitted to external cloud servers.",
    "useCases": [
      "Cricut & Silhouette Print-Then-Cut: Arrange multiple custom sticker graphics on US Letter or A4 with corner registration marks for automated vinyl and paper cutting.",
      "Small Business Product Packaging: Format logo decals, thank-you stickers, and branded bag seals on multi-column adhesive paper sheets.",
      "Journaling & Planner Accessories: Pack custom hand-drawn characters, icon sets, and decorative washi strips onto 4x6 or A4 sticker sheets."
    ],
    "faq": [
      {
        "q": "Does Sticker Sheet Maker upload my artwork to an external server?",
        "a": "No. All image placement, bleed calculation, masking, and export generation happen entirely inside your web browser memory using HTML5 Canvas."
      },
      {
        "q": "What export formats are available for digital cutting machines?",
        "a": "You can download 300 DPI print-ready PNG sheets, multi-page vector PDFs, or SVG die-lines containing exact cut path contours for Cricut Design Space and Silhouette Studio."
      },
      {
        "q": "Can I adjust individual stickers independently on the sheet?",
        "a": "Yes. The built-in per-sticker editor allows you to rotate, mirror, resize with millimeter readouts, trim transparent borders, and reorder items via drag-and-drop."
      }
    ]
  },
  {
    "id": "labels",
    "icon": "📦",
    "cat": "Print & Craft",
    "name": "Avery 5160 / Label Maker",
    "keyword": "Avery 5160 Label Maker",
    "desc": "Build printable Avery 5160, 5163, 5167, L7160 and custom label sheets from CSV, pasted rows, or a single manual label — multi-line builder with live sheet preview.",
    "seoDesc": "Make Avery 5160, 5163, 5167, L7160 label sheets from CSV or pasted rows. Multi-line builder, live preview, PNG export. Zero uploads.",
    "whatItDoes": "Runs a full Label Studio engine: verified template geometry (Avery 5160 30-up, 5163 10-up, 5167 80-up return, EU L7160 21-up, name badges and fully custom grids) drives a live canvas preview built from the same layout the exports use, so preview and print always match. A multi-line builder (up to 6 lines) places {{Column}} tokens, sequence numbers, bold/italic/alignment, per-line sizes and auto-shrink overflow on every label; an address wizard detects name, street, city, state and zip columns automatically. Data comes from an uploaded CSV, pasted spreadsheet rows, or manual single-label mode, with a sortable inline-editable data table. Exports: 300 DPI PNG, standalone HTML, or direct print with exact @page sizing.",
    "howToUse": [
      "Pick your label template (Avery 5160, 5163, 5167, L7160, name badge, or a custom grid) and nudge the calibration offsets if your printer feeds paper off-center.",
      "Load your data: upload a CSV, paste rows copied from Excel or Google Sheets, or skip data entirely to compose a single manual label.",
      "Build the label lines — click column chips to insert {{Column}} tokens, or press the Address wizard to detect and lay out name/address columns automatically.",
      "Fine-tune fonts, alignment, vertical position, repeat mode and overflow policy while watching the live sheet preview, page tabs and sheet-count report.",
      "Export a 300 DPI PNG, download standalone HTML, or open Print for physical output / Save as PDF — always print at 100% / Actual size."
    ],
    "limits": "Text-only labels (up to 6 lines per label); QR/Code128 barcodes, logo artwork and UPC/EAN are not yet supported. Print at 100% scale — do not use 'Fit to page'. Margins for the 5163/5167/badge templates are provisional and can be corrected with the ±3 mm calibration offsets or the custom grid.",
    "privacy": "Your CSV files, pasted rows and mailing lists are parsed purely in your browser and never uploaded. Saved presets store label layout only — row data persists locally only if you explicitly export a JSON project.",
    "useCases": [
      "Address & Shipping Labels: Populate Avery 5160 or EU L7160 sheets from customer spreadsheets with automatic column mapping for names, streets, and postal codes.",
      "Warehouse & Storage Organization: Generate serial-numbered inventory tags, shelf bin markers, and equipment labels with custom {{Column}} token layouts.",
      "Event Badges & Attendee Tags: Create uniform conference badges and table place cards directly from pasted Excel or Google Sheets roster rows."
    ],
    "faq": [
      {
        "q": "Which Avery label templates are supported natively?",
        "a": "The tool includes verified geometric profiles for Avery 5160 (30-up), 5163 (10-up shipping), 5167 (80-up return address), EU L7160 (21-up on A4), and fully custom label grids."
      },
      {
        "q": "How do I ensure labels align with physical pre-cut label sheets?",
        "a": "Always configure your printer dialog to 100% scale (or 'Actual Size') without fit-to-page margins, and use the ±3 mm fine calibration offset inputs if your printer feeder drifts."
      },
      {
        "q": "Is my customer mailing list kept secure and private?",
        "a": "Yes. Your CSV data and pasted rows are parsed purely in browser RAM and are never transmitted, logged, or saved to any cloud database."
      }
    ]
  },
  {
    "id": "tshirt-mirror",
    "icon": "👕",
    "cat": "Print & Craft",
    "name": "T-Shirt Print Mirror",
    "keyword": "T-Shirt Print Mirror",
    "desc": "Flip art horizontally, vertically or 180° for heat-transfer paper — SVG passthrough, before/after preview, batch download and PNG/JPEG/WebP export.",
    "seoDesc": "Mirror or flip artwork for heat transfer: horizontal, vertical or 180° rotation, SVG passthrough, before/after preview. Zero uploads.",
    "whatItDoes": "Runs an Image Studio flip engine. Choose a horizontal flip (the classic heat-transfer mirror), a vertical flip, or a 180° rotation, and check the result in a before/after side-by-side preview before you print. Raster art exports as PNG (lossless), JPEG or WebP with a quality slider and an optional white-background flatten. Uploaded SVGs can pass straight through in vector mode: the file is re-serialised with a mirrored <g transform> so cutting machines and vinyl plotters keep true paths instead of a rasterised PNG. Multiple files can be flipped and downloaded one by one in batch, and a 'flipped sheet' hand-off note lists the mirrored filenames and explains how to feed them into the Iron-on Transfer Sheet Maker.",
    "howToUse": [
      "Drop one or more graphics — PNG, JPEG, WebP or SVG — into the upload box (batch works on the whole set).",
      "Pick the flip axis: Horizontal for transfer paper, Vertical, or 180° rotation.",
      "Check the Before / After panels; toggle Flatten onto white background for JPEG export, or leave SVG passthrough on to keep vectors.",
      "Set the export format (PNG, JPEG or WebP) and quality, then press Download flipped for the active file.",
      "Use Download all for a batch, or grab the hand-off note to continue in the Iron-on Transfer Sheet Maker with mirroring already applied."
    ],
    "limits": "Flips raster art at original pixel dimensions and rotates SVGs inside their viewBox; it does not perform colour separations or CMYK halftone dot screening for screen-printing. Batch mode downloads files one at a time (allow multiple downloads in your browser). Up to 30 files per session.",
    "privacy": "Flips, SVG re-serialisation and canvas export all run in local browser memory. Your apparel designs and logos are never uploaded to any server.",
    "useCases": [
      "Heat Transfer Paper Printing: Invert graphic artwork horizontally so light transfer paper prints transfer right-reading when pressed face-down on fabric.",
      "Vinyl Cutter & Heat Transfer Vinyl (HTV) Preparation: Mirror text and logos before sending cut jobs to vinyl plotters and craft cutting plotters.",
      "Sublimation Printing Alignment: Flip sublimation transfer graphics to ensure text, dates, and crests display in proper orientation on mugs, jerseys, and mousepads."
    ],
    "faq": [
      {
        "q": "Can I flip vector SVG artwork without converting it into raster pixels?",
        "a": "Yes. In vector passthrough mode, the tool re-serializes your SVG with an inverted transform matrix, preserving scalable vector curves for plotter cutting."
      },
      {
        "q": "Does the mirror tool reduce image resolution or compress graphics?",
        "a": "No. Bitmap graphics maintain their full original pixel dimensions, and you can export lossless PNGs or custom-quality WebP and JPEG files."
      },
      {
        "q": "Can I batch mirror multiple apparel graphics at once?",
        "a": "Yes. You can drop up to 30 files into the session to mirror them simultaneously and download each inverted design individually."
      }
    ]
  },
  {
    "id": "ironon-sheet",
    "icon": "🧲",
    "cat": "Print & Craft",
    "name": "Iron-on Transfer Sheet Maker",
    "keyword": "Iron-on Transfer Sheet Maker",
    "desc": "Lay out iron-on transfer designs on US Letter or A4 with one-click mirroring, paper presets, cut lines and 300 DPI PNG or print export.",
    "seoDesc": "Make iron-on transfer sheets: mirror all images, light/dark/HTV presets, cut-line guides, 300 DPI PNG or print. No uploads.",
    "whatItDoes": "Runs a Sheet Studio engine tuned for heat-transfer paper: a live canvas preview built from the exact layout the exports use, with a one-click Mirror all images toggle that is ON by default (the core iron-on requirement) and per-image mirror overrides in the thumbnail strip. Three preset profiles configure the sheet in one step — Light transfer paper (mirror), Dark transfer paper (no mirror) and HTV vinyl (mirror + cut lines) — and cut-line guides draw on every cell in the preview with an option to bake them into the export for scissor or plotter trimming. Choose Letter or A4 paper, margin, gap and 1-6 columns; designs never mirror across cells — each flips in place about its own center. Exports a 300 DPI PNG (150 DPI draft option) or prints with exact @page sizing.",
    "howToUse": [
      "Pick a preset profile — Light transfer paper (mirror), Dark transfer paper (no mirror), or HTV vinyl (mirror + cut lines) — or toggle Mirror all images yourself; it starts ON because light transfer paper and HTV are applied face-down.",
      "Drop multiple PNG/JPEG designs into the upload box; thumbnails appear in the strip with a ⇄ badge that cycles each image between automatic, forced-mirrored and never-mirrored.",
      "Choose Letter or A4 paper and set margin, gap and columns (1-6) while watching the live sheet preview and page tabs for multi-page jobs.",
      "Enable cut lines to see dashed guides around every design, and optionally bake them into the exported PNG for trimming.",
      "Download a 300 DPI PNG or press Print — always print at 100% / Actual size, then press face-down so the mirrored artwork reads correctly."
    ],
    "limits": "Mirrors each design horizontally in place (no rotation, color separation or CMYK halftone screening). Cut lines are rectangular guides around each cell — irregular artwork silhouettes are not auto-traced. Up to 40 images per session with automatic multi-page flow; print at 100% scale, not 'Fit to page'.",
    "privacy": "All mirroring, compositing and PNG export happen in local browser memory using HTML5 Canvas. Your artwork, logos and designs are never uploaded to any server.",
    "useCases": [
      "Iron-on Gang Sheet Creation: Pack multiple heat transfer designs onto a single US Letter or A4 sheet to minimize specialty paper waste.",
      "Light & Dark Fabric Presets: Rapidly toggle between mirrored mode for light transfer paper and unmirrored mode with cut outlines for dark transfer media.",
      "Team Apparel & Uniform Numbering: Lay out matching front crests, sleeve badges, and jersey numbers across multiple printable pages."
    ],
    "faq": [
      {
        "q": "Why does the tool mirror artwork by default upon upload?",
        "a": "Light fabric heat transfer paper and HTV require face-down application, which means the design must be inverted prior to printing to read forward on fabric."
      },
      {
        "q": "Can I override mirroring for individual graphics on the sheet?",
        "a": "Yes. Every image thumbnail features an override badge allowing you to toggle between automatic mirror, forced mirror, or forward-facing display."
      },
      {
        "q": "What export resolution does the iron-on sheet maker produce?",
        "a": "Exports render at a full 300 DPI for crisp photographic transfers, with an optional 150 DPI draft setting for rapid layout testing."
      }
    ]
  },
  {
    "id": "print-layout",
    "icon": "🖨️",
    "cat": "Print & Craft",
    "name": "Print Layout Optimizer",
    "keyword": "Print Layout Optimizer",
    "desc": "Pack up to 40 photos onto Letter, A4, 4×6 or A3 paper with aspect-aware grids, auto-pack rows, mm borders and a printed-size report.",
    "seoDesc": "Fit photos onto paper in your browser: uniform grids, auto-pack rows, auto-rotate, mm borders, 150/300 DPI PNG. Zero uploads.",
    "whatItDoes": "Runs a Sheet Studio layout engine with two packing modes: a uniform grid with selectable rows and columns whose cells fill the sheet minus margins (photos fit inside with their aspect ratio preserved and are letterboxed in the border color), and an auto-pack mode that greedily fills rows by aspect ratio at a computed target row height so mixed portrait and landscape shots waste almost nothing. Photos auto-rotate 90° when that fills the cell better. Margins, gaps and per-photo borders are controlled in millimeters with white, black or a custom border color, and the result is reported on screen (e.g. each photo printed at ≈ 102 × 136 mm). Supports Letter, A4, 4×6 and A3 paper, 150 or 300 DPI PNG export, and direct printing with exact @page sizing.",
    "howToUse": [
      "Choose your paper (Letter, A4, 4×6 photo paper or A3) and a pack mode: Uniform grid for equal cells, or Auto-pack rows to let the engine fill rows by each photo's aspect ratio.",
      "Add up to 40 photos from the upload box — a progress note tracks loading and extras beyond 40 are skipped.",
      "Set margin, gap and border width in mm, pick white/black/custom border color, and toggle auto-rotate if landscape shots should turn 90° to fill their cell.",
      "Check the live preview, page tabs and the meta line for the resulting physical photo size before you print.",
      "Download a 150 or 300 DPI PNG, or press Print — always print at 100% / Actual size for true dimensions."
    ],
    "limits": "Packs rectangular photos only — no freehand collage, diagonal rotation, polygonal cropping or rounded corners. In grid mode all photos share one cell size (varying aspects letterbox differently), while auto-pack mode sizes rows by aspect; up to 40 photos per session, flowing across multiple pages. Print at 100% scale for the reported mm sizes to hold true.",
    "privacy": "Your photos are processed entirely in local browser memory with HTML5 Canvas and never leave your device — no server sees your images.",
    "useCases": [
      "Photo Album Printing: Efficiently tile mixed portrait and landscape snapshots onto A4 or Letter photo paper with zero overlap.",
      "Artisan Mini Print Sheets: Create uniform grids of miniature art prints, flashcards, or trading cards with millimeter-exact border spacing.",
      "Contact Sheet Documentation: Compile proof sheets of up to 40 images with printed size metrics before making final large-format prints."
    ],
    "faq": [
      {
        "q": "What is the difference between Uniform Grid and Auto-Pack mode?",
        "a": "Uniform Grid creates identical cell dimensions for all photos, whereas Auto-Pack dynamically packs mixed aspect ratios into tight rows to minimize blank margins."
      },
      {
        "q": "Does the layout optimizer crop my original photographs?",
        "a": "No. In fit-inside mode, images preserve their exact native aspect ratios and are letterboxed cleanly within your chosen border color."
      },
      {
        "q": "What paper formats are supported for print export?",
        "a": "Standard presets include US Letter, A4, A3, and 4x6 inch photographic paper with direct browser @page print formatting and 300 DPI PNG export."
      }
    ]
  },
  {
    "id": "print-border",
    "icon": "📐",
    "cat": "Print & Craft",
    "name": "Photo Print Border Calculator",
    "keyword": "Photo Print Border Calculator",
    "desc": "Add a precise mat border for 4×6, 5×7, 8×10, 8×11 or A4 frames at 200/300 DPI — fixed mm or % borders, custom colour and an optional mat keyline.",
    "seoDesc": "Add print borders and mats: 4×6, 5×7, 8×10, A4 or custom sizes at 200/300 DPI, mm or % borders, crop-to-fill, PNG/JPEG export. No uploads.",
    "whatItDoes": "Runs an Image Studio border engine that places your photo onto a real physical target — 4×6, 5×7, 8×10, 8×11, A4 or a custom size in mm or inches — and renders the result at a chosen 200 or 300 DPI, sized to the physical target. In Fit-inside mode the photo is scaled to sit inside the target with a uniform border, so a 4:5 photo prints inside a 5×7 without any edge cropping; in Fit-to-exact-target mode the photo crops to fill the canvas edge to edge. The border width is set in fixed millimetres or as a percentage of the short side, the colour is white, black or a custom pick, and an optional mat effect draws a thin keyline around the photo. A live report shows the output pixels, the physical size and the exact border and printed-photo dimensions, and the result exports as PNG or JPEG.",
    "howToUse": [
      "Drop a photo and pick the target print size: 4×6, 5×7, 8×10, 8×11, A4 or Custom (switch the units between mm and inches).",
      "Choose the fitting mode: Fit inside for a uniform border around the whole photo, or Fit to exact target (crop to fill) to fill the canvas edge to edge.",
      "Set the border width in fixed mm or as a % of the short side, and pick white, black or a custom border colour.",
      "Enable the mat effect to add a thin keyline around the photo, and choose the output DPI (200 or 300).",
      "Read the on-screen report to confirm the physical dimensions, then download a PNG or JPEG — print at 100% / actual size for the stated measurements to hold true."
    ],
    "limits": "Creates rectangular borders and mats only — no textured or beveled frames, drop shadows or rounded corners. Border percentages are relative to the shorter target side; print at 100% scale for the reported millimetre sizes to be accurate.",
    "privacy": "Borders and mats are composited locally with HTML5 Canvas. Your personal photographs are never uploaded or stored on any server.",
    "useCases": [
      "Framing & Mat Simulation: Add clean 1/2 inch or 15 mm white mat borders to digital photos before printing for 4x6, 5x7, or 8x10 standard frames.",
      "Gallery Exhibition Keylines: Inset a delicate dark keyline between image and mat to enhance subject separation in fine art photography prints.",
      "Social Print Cropping: Format artwork for square or rectangular wall mounts without altering the native master image files."
    ],
    "faq": [
      {
        "q": "How do I calculate border width in millimeters vs percentage?",
        "a": "Select millimeters for an exact physical ruler measurement, or percentage to automatically scale the border proportional to the shorter side of the target."
      },
      {
        "q": "Will the tool upscale low-resolution photos?",
        "a": "The tool renders output at your specified 200 or 300 DPI target canvas dimensions, displaying live pixel readouts so you can verify source clarity."
      },
      {
        "q": "Can I choose custom mat colors beyond black and white?",
        "a": "Yes. An integrated color picker lets you sample any custom hex tint or match specific archival paper stock colors."
      }
    ]
  },
  {
    "id": "cross-stitch",
    "icon": "🧵",
    "cat": "Print & Craft",
    "name": "Cross-Stitch Pattern Maker",
    "keyword": "Cross-Stitch Pattern Maker",
    "desc": "Turn any photo into a printable cross-stitch chart — 20–200 stitches wide, median-cut colours snapped to a 300-colour DMC floss palette, symbol charts, 10×10 grid lines and a skein shopping list.",
    "seoDesc": "Convert photos to cross-stitch: DMC thread matching, symbol charts, 10×10 grid, skein estimates, PNG/CSV print. No uploads.",
    "whatItDoes": "Runs a full Pattern Studio engine. Your image is average-pooled into a stitch grid 20–200 stitches wide (rows follow the aspect ratio), reduced to 2–64 colours with median-cut quantisation, and optionally snapped to a real DMC embroidery floss palette of 300 numbered threads, so every cell carries a genuine floss code and name. Cells can be drawn as flat colour or as a symbol chart (each palette entry gets a stable glyph) over a light cell grid with heavy lines every 10 stitches, and an optional Floyd–Steinberg dithering pass smooths gradients. The legend lists the DMC code, thread name, swatch, chart symbol, stitch count, percentage and an estimated skein count (~1,700 stitches per skein), and the tool reports the finished size on 14-count Aida. Exports a PNG stretched to at least 2,000 px wide with the aspect ratio preserved, a CSV shopping list, and a black-and-white symbol-only print mode.",
    "howToUse": [
      "Drop a photo or illustration (PNG, JPEG or WebP) into the upload box — processing stays entirely in your browser.",
      "Set the stitch width (20–200) and maximum colours (2–64); the grid rows follow your image's aspect ratio automatically.",
      "Choose whether to snap colours to the DMC floss palette (recommended for real thread matching) and toggle symbol chart, 10×10 heavy grid lines, dithering or the black-and-white symbol-only print mode.",
      "Check the live preview and legend — every colour shows its DMC code, name, chart symbol, stitch count percentage and estimated skeins, plus the physical size on 14-count Aida.",
      "Download the chart PNG, export the CSV floss shopping list, or press Print for a symbol chart plus legend you can stitch from."
    ],
    "limits": "Charts are capped at a 200×200 cell grid (40,000 stitches) so the preview stays responsive; very large or very tall photos are automatically reduced to fit. Colour matches are nearest-neighbour in RGB against the built-in DMC table, which is accurate to typical floss shades but not a lab-grade match to a specific dye lot. Dithering is available for cross-stitch charts only, and the symbol set repeats after 64 colours.",
    "privacy": "Photos are decoded and quantised entirely inside your browser with HTML5 Canvas. Your images, family portraits and craft projects are never uploaded to any server.",
    "useCases": [
      "Photo to Cross-Stitch Conversion: Turn family portraits and pet photos into charted needlepoint patterns with authentic DMC embroidery floss codes.",
      "Pixel Art & Sprite Stitching: Convert retro gaming sprites and 8-bit graphics into clean 14-count Aida cloth stitching guides.",
      "Embroidery Project Floss Budgeting: Generate complete skein estimates and symbol keys before purchasing physical needlework supplies."
    ],
    "faq": [
      {
        "q": "How does the tool match colors to real embroidery thread?",
        "a": "Each pixel cluster is mapped via Euclidean color distance to the official DMC 6-strand cotton floss color catalogue with verified hex codes."
      },
      {
        "q": "What stitch count fabric is used for physical dimension estimates?",
        "a": "Calculations default to standard 14-count Aida (14 stitches per inch), providing exact finished project dimensions in centimeters and inches."
      },
      {
        "q": "Can I limit the total number of colors in my pattern?",
        "a": "Yes. The quantization slider lets you restrict the palette between 2 and 64 colors to simplify complex needlework projects."
      }
    ]
  },
  {
    "id": "diamond-painting",
    "icon": "💎",
    "cat": "Print & Craft",
    "name": "Diamond Painting Pattern Maker",
    "keyword": "Diamond Painting Pattern Maker",
    "desc": "Generate symbol-coded diamond painting drill charts — round or square drills, DMC drill counts per colour, a cm canvas planner and a CSV kit shopping list.",
    "seoDesc": "Make diamond painting charts: round or square drills, DMC floss codes, canvas size planner, and CSV shopping list with zero uploads.",
    "whatItDoes": "Uses the same Pattern Studio pipeline as the cross-stitch tool — average-pooled cells, median-cut reduction and snap-to-DMC — but renders every cell as a drill instead of a stitch. Drills are drawn as filled circles (round) or rounded squares with a highlight (square), each optionally stamped with a bold symbol letter, over a grid highlighted every 10 drills to match the standard drill-counting rulers. A canvas-size planner converts a physical width in centimetres to a drill count at the standard 2.5 mm diamond drill pitch and back, so kits can be planned from a real canvas size. The legend reports the DMC code, colour name, swatch, symbol and per-colour drill total, the grand total drill count and estimated skeins, and the physical canvas dimensions. Export the chart as a PNG (≥2,000 px wide), download a CSV kit shopping list mapping DMC codes to drill counts, or print the chart with its legend.",
    "howToUse": [
      "Drop your source picture into the upload box — the image never leaves your device.",
      "Pick the drill shape (round or square with highlight), and set the drill width (20–200) and maximum colours (2–64); leave snap-to-DMC on to map drills to real floss codes.",
      "Use the canvas planner to type a canvas width in centimetres and press Plan drills — the engine converts it to a drill count using the ~2.5 mm pitch.",
      "Turn the symbol letter per cell and the grid-every-10-drills guide on or off, and watch the live preview and per-colour drill totals in the legend.",
      "Download the chart PNG, export the CSV shopping list (DMC code → drill count), or print the chart and legend for your work surface."
    ],
    "limits": "Charts are capped at a 200×200 drill grid (40,000 drills) with the same automatic reduction for oversized or very tall photos. Drill colour codes follow DMC floss names — proprietary AB drill numbering is not included. The canvas planner assumes the standard 2.5 mm drill pitch; larger or smaller drills change the physical size. This produces a printable chart, not a plotted adhesive canvas or a cutting-machine file.",
    "privacy": "Colour reduction, symbol assignment and drill rendering all execute in local browser memory with HTML5 Canvas. Your photos and kit plans are never sent to a remote server.",
    "useCases": [
      "Custom Diamond Painting Canvases: Generate printable adhesive drill canvas charts from personal photos with standard 2.5 mm drill spacing.",
      "Mosaic Craft Charting: Plan square or round diamond drill mosaic layouts with high-contrast symbol legends.",
      "Drill Kit Inventory Check: Export complete DMC drill code summaries to cross-reference with your existing diamond painting beads."
    ],
    "faq": [
      {
        "q": "What physical drill dimension does the chart use?",
        "a": "The grid is calibrated precisely for standard 2.5 mm diamond drills, matching universal commercial craft canvas specifications."
      },
      {
        "q": "How are symbols assigned to different drill colors?",
        "a": "The engine assigns distinct, high-contrast alphanumeric symbols and geometric shapes to each color cluster to ensure legible chart printing."
      },
      {
        "q": "Are diamond painting color numbers identical to embroidery floss?",
        "a": "Yes. Diamond painting manufacturing standards use the classic DMC color numbering system, allowing direct crossover with standard thread charts."
      }
    ]
  },
  {
    "id": "embroidery",
    "icon": "🪡",
    "cat": "Print & Craft",
    "name": "Embroidery Pattern Simplifier",
    "keyword": "Embroidery Pattern Simplifier",
    "desc": "Reduce artwork to a simplified thread palette — median-cut to N colours, optional DMC matching or a pasted custom hex palette, with a side-by-side smooth preview and skein estimates.",
    "seoDesc": "Simplify images into embroidery palettes: median-cut colour reduction, DMC matching, custom hex palette, smooth export, skein estimates. No uploads.",
    "whatItDoes": "A dedicated colour-reduction studio rather than a stitch chart. Your image is average-pooled, clustered with median-cut quantisation to any thread count from 2 to 64, and either left as exact clustered colours or snapped to the shared DMC floss palette. You can also paste your own hex palette (one colour per line) to match non-DMC threads — ideal for planning from a specific thread set or a fabric swatch. The preview shows the original photograph beside a smooth, non-gridded simplified render so you can judge the reduction before committing, and the legend lists every thread's code or hex, name, swatch, share of the design as a percentage and an estimated skein count (~1,700 stitches per skein). Export a smooth simplified reference image (≥2,000 px wide), a stitched grid chart PNG, or a CSV palette report with hex, DMC code/name, count, percentage and skeins.",
    "howToUse": [
      "Drag and drop the illustration or photo you want to reduce onto the upload box.",
      "Set the thread count with the Max colours slider (2–64) — median-cut clustering does the colour reduction.",
      "Leave Snap to DMC on for real floss codes, or paste your own hex list into the custom palette box and press Apply custom palette to match other threads.",
      "Compare the original and the smooth simplified preview side by side, and read the per-colour area percentages and estimated skeins in the legend.",
      "Export the smooth simplified PNG for reference, a grid chart PNG for stitching, or the CSV palette report for your floss shopping list."
    ],
    "limits": "Designed for hand-embroidery colour planning and floss selection; it does not generate machine-embroidery files such as DST, PES or JEF, and it does not auto-trace stitch direction or shading. Custom palettes accept up to 64 hex colours. Reduction is capped at the same 200×200 cell grid as the other pattern tools, and median-cut produces representative colours rather than a perfectly perceptually uniform palette.",
    "privacy": "All clustering, matching and export run locally in your browser via HTML5 Canvas. Your original artwork, textile concepts and photographs stay on your device.",
    "useCases": [
      "Hand Embroidery Pattern Tracing: Simplify complex illustrations into flat color blocks and crisp boundary lines for transfer to linen or cotton fabric.",
      "Applique Patch Planning: Reduce intricate multi-tone graphics into manageable shapes for fabric cutting and satin-stitch edging.",
      "Thread Painting Outlines: Isolate primary color zones to plan thread blending and needle direction for embroidery projects."
    ],
    "faq": [
      {
        "q": "How does the pattern simplifier differ from the cross-stitch tool?",
        "a": "While cross-stitch creates a rigid pixelated grid, the embroidery simplifier reduces color gradients into continuous organic color regions suitable for satin and fill stitches."
      },
      {
        "q": "Does the tool support dithering to blend color transitions?",
        "a": "Yes. You can toggle error-diffusion dithering on or off depending on whether you prefer smooth color blending or hard, clean stitch boundaries."
      },
      {
        "q": "How can I transfer the finished design onto fabric?",
        "a": "Export a high-contrast black-and-white line version or color guide, print it at 100% scale, and transfer using water-soluble stabilizer or heat-transfer pens."
      }
    ]
  },
  {
    "id": "video-safe-zone",
    "icon": "📱",
    "cat": "Audio & Video",
    "name": "Video Safe-Zone Checker",
    "keyword": "Video Safe-Zone Checker",
    "desc": "Preview TikTok, Instagram Reels, and YouTube Shorts UI overlays to avoid cropped text.",
    "seoDesc": "Preview TikTok, Reels, and Shorts safe zones in your browser. Check video text overlays against social media UI with zero file uploads.",
    "whatItDoes": "Overlays precise 9:16 vertical safe zone boundaries for TikTok, Instagram Reels, and YouTube Shorts over your videos or frame grabs. Highlights critical obstruction zones where usernames, engagement action buttons (likes, shares, comments), audio discs, and captions cover screen content.",
    "howToUse": [
      "Select your target social media platform (TikTok UI, Instagram Reels, or YouTube Shorts).",
      "Upload a short-form video clip (MP4, WebM, or MOV) or a static 9:16 frame export.",
      "Examine the red overlay guide showing where platform interface elements will appear.",
      "Download the overlaid guide image to adjust title placement and subtitle positioning in your video editor."
    ],
    "limits": "Extracts and evaluates representative video frames for UI alignment. Does not re-render, compress, or re-encode full multi-minute video streams.",
    "privacy": "Video frames are extracted locally using HTML5 Video elements and Canvas. Video files never travel across the network to external servers.",
    "useCases": [
      "TikTok UI Overlay Testing: Inspect 9:16 vertical video frames against TikTok's profile button, description, and audio disc safe margins.",
      "Instagram Reels Caption Checking: Verify that lower-third titles and captions are not obscured by Reel comment icons and bottom navigation bars.",
      "YouTube Shorts Title Alignment: Ensure critical subject matter and subtitles stay inside the visible window across various mobile screen aspect ratios."
    ],
    "faq": [
      {
        "q": "Does this tool upload my video clips to a server for processing?",
        "a": "No. Video frames and stills are decoded entirely inside your browser using the HTML5 Video element and Canvas API without transmitting any video bytes."
      },
      {
        "q": "Can I inspect both still images and MP4/WebM video files?",
        "a": "Yes. You can upload video files to scrub and capture frames directly, or drag-and-drop vertical JPEG/PNG graphics to test overlay margins."
      },
      {
        "q": "Are the platform UI overlays kept up to date?",
        "a": "Yes. The overlay templates reflect modern mobile user interface elements for TikTok, Instagram Reels, and YouTube Shorts."
      }
    ]
  },
  {
    "id": "video-thumbnails",
    "icon": "🎞️",
    "cat": "Audio & Video",
    "name": "Video Thumbnail Contact Sheet",
    "keyword": "Video Thumbnail Contact Sheet",
    "desc": "Extract 4–48 timestamped frames into a configurable PNG/JPEG contact sheet.",
    "seoDesc": "Build video contact sheets with 4–48 frames, custom grid columns and resolution. Export PNG/JPEG plus CSV of sampled times. Zero uploads.",
    "whatItDoes": "Scans a local video file and extracts between 4 and 48 evenly spaced frames into a contact sheet whose grid columns, per-thumbnail resolution, padding and background colour you control. Every frame is stamped with a burned-in MM:SS.mmm timestamp and frame index so scenes can be located precisely, and each seek is raced against a timeout with an automatic previous-frame fallback, so an unresponsive codec never hangs the sheet. Export the sheet as PNG or JPEG (with quality control) and download a CSV of the sampled timestamps.",
    "howToUse": [
      "Drop an MP4, WebM or MOV video into the extractor, or click Add file and pick one.",
      "Choose the frame count (4–48), grid columns, thumbnail width, padding, background colour and whether to burn timestamp labels.",
      "Watch the progress bar as the browser seeks through the timeline, then inspect the assembled contact sheet on screen.",
      "Download the sheet as PNG or JPEG, or grab the CSV of sampled timestamps for editing notes."
    ],
    "limits": "Requires browser-supported codecs (H.264, VP8, VP9, AV1). High-bitrate ProRes, DNxHD, raw AVI, HEVC-in-MKV and DRM-protected files cannot be decoded. Seeks that time out after 8 seconds fall back to the previous frame and are reported as warnings.",
    "privacy": "Video decoding, seeking and frame rendering occur entirely through local browser hardware acceleration. Zero bytes of your video footage are sent to any server.",
    "useCases": [
      "Video Scene Indexing: Extract evenly spaced thumbnail sequences from video footage to create visual contact sheets and scene indexes.",
      "Client Video Review Proofs: Produce single-page summary sheets of video takes, B-roll reels, and commercial cuts for fast sign-off.",
      "Video Archive Cataloging: Document video content libraries with timestamped visual summaries for local drive archives."
    ],
    "faq": [
      {
        "q": "What video formats can be processed in the browser?",
        "a": "Any video codec supported natively by your browser (including MP4 with H.264, WebM with VP8/VP9, and modern AV1 files) can be indexed."
      },
      {
        "q": "Can I control how many thumbnail frames are captured?",
        "a": "Yes. You can specify capture intervals or total frame count across the duration of the video."
      },
      {
        "q": "Are timecodes stamped onto each extracted thumbnail?",
        "a": "Yes. The contact sheet bakes exact SMPTE or HH:MM:SS timecodes into each thumbnail cell for precise video navigation."
      }
    ]
  },
  {
    "id": "audio-chapters",
    "icon": "🎧",
    "cat": "Audio & Video",
    "name": "Chapter Timestamp Formatter",
    "keyword": "Chapter Timestamp Formatter",
    "desc": "Format YouTube & podcast chapter timestamps with clean text export.",
    "seoDesc": "Format YouTube and podcast chapter timestamps in your browser. Clean and standardize video show notes with total privacy and zero uploads.",
    "whatItDoes": "Validates, cleans, and standardizes podcast and YouTube video chapter markers. Ensures timestamps are sorted chronologically, correctly padded (MM:SS or HH:MM:SS), separated by valid delimiters, and compliant with platform chapter guidelines.",
    "howToUse": [
      "Paste your raw timestamp notes and chapter titles into the multiline text input box.",
      "Verify the syntax to ensure the first chapter begins precisely at 00:00 as required by platforms.",
      "Click the Download Chapters button to receive a formatted chapters.txt file.",
      "Paste the cleaned output directly into your YouTube description, Spotify show notes, or podcast RSS feed."
    ],
    "limits": "Formats and validates plain text timecode strings. Does not embed ID3v2 chapter frames directly into binary MP3 or M4A audio containers.",
    "privacy": "Text formatting is executed in local browser JavaScript. Your unreleased episode titles and show notes remain 100% private on your device.",
    "useCases": [
      "YouTube Video Chapter Timestamps: Format raw cue points into YouTube description syntax (e.g., 00:00 Introduction) for automatic video progress bar chapters.",
      "Podcast Show Notes Formatting: Generate clean timestamped episode summaries for Spotify, Apple Podcasts, and RSS feed show notes.",
      "Audiobook Track Indexing: Convert spoken audio markers into standardized chapter timestamps for digital audio distributors."
    ],
    "faq": [
      {
        "q": "What is the mandatory starting requirement for YouTube video chapters?",
        "a": "YouTube requires the very first chapter timestamp to begin at exactly 00:00, have at least three chapters, and maintain a minimum of 10 seconds per chapter."
      },
      {
        "q": "Can I paste raw seconds or decimal timestamps to convert them?",
        "a": "Yes. The parser recognizes raw second counts, MM:SS, and HH:MM:SS formats, converting them into standard chapter formatting."
      },
      {
        "q": "Can I export the formatted chapters directly to my clipboard?",
        "a": "Yes. A single-click copy button allows you to instantly transfer formatted chapters directly into YouTube Studio or your podcast host."
      }
    ]
  },
  {
    "id": "silence-map",
    "icon": "🔇",
    "cat": "Audio & Video",
    "name": "Podcast Silence Map",
    "keyword": "Podcast Silence Map",
    "desc": "Detect dead air with a dBFS threshold slider, waveform view and CSV/TXT gap export.",
    "seoDesc": "Find dead air in your browser: dBFS threshold slider, waveform view, click-to-preview gaps, CSV/TXT export. Zero uploads.",
    "whatItDoes": "Decodes an audio track locally and scans its energy window-by-window to map every silence gap longer than a length you choose. Set the silence threshold as a dBFS slider (converted to amplitude), the analysis window size, the minimum gap length and the channel mode (left, right, mono mix or max-of-channels). The peak-envelope waveform shades each detected gap, and clicking a gap preview-plays just that stretch through an embedded player. Reports file duration, total silence, percentage silence and gap count, listing every gap as HH:MM:SS.mmm — including recordings longer than an hour.",
    "howToUse": [
      "Drop a podcast audio track (WAV, MP3, AAC or OGG) into the silence detector.",
      "Set the silence threshold in dBFS, the window size, the minimum gap length and the channel mode for your recording.",
      "Review the shaded waveform and the gap table, and click any row to preview-play that stretch of audio.",
      "Download the gaps as CSV (Start, End, Duration) or a plain-text list, or copy the list to the clipboard."
    ],
    "limits": "Decodes audio into browser RAM; extremely large audio files (>200 MB) may hit memory limits on constrained devices. Undecodable codecs (for example DRM-protected M4A, unsupported FLAC builds or raw AC-3) show codec guidance instead of results — convert to WAV or standard MP3 and retry.",
    "privacy": "Audio decoding, waveform inspection, and silence mapping execute entirely on your local CPU. Unreleased audio files never leave your computer.",
    "useCases": [
      "Podcast Editing Audits: Locate long pauses, dead air, and unedited speaker gaps in raw audio tracks before manual editing.",
      "Voiceover Pacing Review: Visualize cadence, silence duration, and sentence rhythm across audiobook and voice recording sessions.",
      "Interview Audio Quality Check: Identify potential audio dropout issues or microphone mute accidents in recorded conversations."
    ],
    "faq": [
      {
        "q": "How is audio decoded without uploading large sound files?",
        "a": "Your browser's built-in Web Audio API decodes the audio waveform directly in RAM, calculating Root Mean Square (RMS) decibel levels locally."
      },
      {
        "q": "Can I adjust the silence threshold sensitivity?",
        "a": "Yes. You can customize the decibel cutoff (e.g. -40 dB or -50 dB) and minimum silence duration to distinguish natural breathing from dead air."
      },
      {
        "q": "What audio formats can I inspect?",
        "a": "Standard browser-supported audio formats including MP3, WAV, AAC, M4A, and OGG can be analyzed directly."
      }
    ]
  },
  {
    "id": "subtitle-speed",
    "icon": "💬",
    "cat": "Text & Subtitles",
    "name": "Subtitle Reading-Speed Checker",
    "keyword": "Subtitle Reading-Speed Checker",
    "desc": "Audit SRT subtitles for reading speed (CPS), duration, line length and overlaps against Netflix, BBC or custom limits.",
    "seoDesc": "Audit SRT subtitle reading speed in your browser. Detect high CPS lines, short durations, long lines and timecode overlaps locally with zero uploads.",
    "whatItDoes": "Audits SubRip (.srt) subtitle files against broadcast reading-speed standards. Choose the Netflix profile (21 CPS, 1s minimum, 42 characters), the BBC profile (about 180 words per minute, 16-20 CPS), or a custom profile with your own CPS, minimum-duration and line-length limits. The engine strips styling tags before measuring, reports raw and clean character counts, and flags excessive CPS, short or zero-duration cues, overlong lines and overlapping timecodes (naming the neighbouring cue and the clashing range). It shows totals, flagged counts, an average CPS and the longest cue, and exports a CSV report or an annotated .issues.srt review copy.",
    "howToUse": [
      "Upload your SubRip (.srt) subtitle caption file, or click Load sample to see the checker in action.",
      "Pick a reading-speed profile (Netflix, BBC or Custom) and tweak the CPS, minimum duration and character limits if you need to.",
      "Review the stats summary and the issue table, where each flagged cue lists its type, raw/clean character counts and details such as the overlapping neighbour and time range.",
      "Download the CSV report for a spreadsheet, the annotated .issues.srt for review, or click Fix line breaks to send the text straight to the line-break fixer."
    ],
    "limits": "Audits SubRip SRT subtitle files. Does not directly extract proprietary binary subtitle streams embedded in container formats like MKV or MP4.",
    "privacy": "Subtitle files are parsed purely within client-side memory. Confidential movie scripts, documentary translations, and transcripts remain strictly private.",
    "useCases": [
      "Streaming Accessibility Compliance: Audit SRT subtitle files against industry reading speed standards such as Netflix's 20 CPS or BBC's 17 CPS rules.",
      "Language Learning Caption Pacing: Ensure subtitles for non-native speakers maintain comfortable reading speeds without visual flashing.",
      "Video Caption QC: Flag subtitles with zero durations, negative timecodes, or overlapping speech blocks before final video burning."
    ],
    "faq": [
      {
        "q": "What is Characters Per Second (CPS) and why is it important?",
        "a": "CPS measures how quickly a viewer must read on-screen text. Rates exceeding 20-25 CPS often result in missed dialogue or viewer fatigue."
      },
      {
        "q": "Does the checker report overlapping subtitle cues?",
        "a": "Yes. The audit detects cue timecode collisions, highlighting cues where the start time precedes the previous cue's end time."
      },
      {
        "q": "Can I export an audit report of flagged subtitle issues?",
        "a": "Yes. You can export a detailed CSV audit report listing line numbers, text, CPS values, and timing violations."
      }
    ]
  },
  {
    "id": "subtitle-linefix",
    "icon": "📝",
    "cat": "Text & Subtitles",
    "name": "Subtitle Line-Break Fixer",
    "keyword": "Subtitle Line-Break Fixer",
    "desc": "Rebalance and rewrap long SRT subtitle lines to your chosen characters-per-line and line-count limits.",
    "seoDesc": "Rebalance long SRT subtitle lines in your browser. Two-pass rewrap to your character-per-line limit, with tag preservation and zero data uploads.",
    "whatItDoes": "Rebalances and rewraps overlong SRT subtitle lines with a two-pass algorithm: it first splits at the clause punctuation nearest the midpoint for a natural break, then greedily wraps the remaining words to your character-per-line limit. Tokens that exceed the limit on their own are hard-cut, and inline styling tags such as <i> and {\\an8} are preserved as anchored spans so formatting survives the rewrap. Adjust the maximum characters per line (20-60), the maximum number of lines (1-3) and tag preservation, then compare a diff-style before/after preview with a changed-cue count. Timecodes are never touched, and you can download the fixed .srt or send it back to the speed checker.",
    "howToUse": [
      "Drop your wide or single-line .srt subtitle file into the line-break fixer, or click Load sample.",
      "Set the maximum characters per line, the maximum number of lines and whether to preserve inline tags.",
      "Review the diff-style preview, which shows the changed-cue count and the before/after line breaks for each affected cue.",
      "Download the fixed .srt subtitle file, or click Send to speed checker to audit the repaired file for reading speed."
    ],
    "limits": "Rewraps SubRip SRT subtitle text only. It does not alter timecodes, merge or split cues, or translate subtitle language.",
    "privacy": "Subtitle files are parsed purely within client-side memory. Confidential movie scripts, documentary translations, and transcripts remain strictly private.",
    "useCases": [
      "Natural Syntactic Clause Rewrapping: Rebalance awkward multi-line subtitles so line breaks occur at natural linguistic commas and clause boundaries.",
      "Maximum Line Width Enforcement: Ensure no subtitle line exceeds character limits (such as 37 or 42 characters per line) for broadcast and streaming standards.",
      "Subtitle Duration & Tag Preservation: Reformat text layout while preserving exact millisecond start and end timecodes and italic styling tags."
    ],
    "faq": [
      {
        "q": "Will rewrapping subtitle lines change my audio synchronization?",
        "a": "No. The line-break fixer modifies only text formatting and line divisions; all original cue timecodes remain unaltered."
      },
      {
        "q": "How does the tool decide where to split a long subtitle line?",
        "a": "The algorithm evaluates clause boundaries and punctuation marks near the midpoint of the sentence rather than making arbitrary word wraps."
      },
      {
        "q": "Does the tool support standard SRT subtitle files?",
        "a": "Yes. It accepts SubRip (.srt) files with CRLF or LF line endings and exports compliant SRT files with clean line formatting."
      }
    ]
  },
  {
    "id": "contact-dedupe",
    "icon": "👥",
    "cat": "Data",
    "name": "Contact CSV Deduplicator",
    "keyword": "Contact CSV Deduplicator",
    "desc": "Merge and clean duplicate CRM contacts using email and international phone numbers.",
    "seoDesc": "Deduplicate contact CSV files in your browser. Merge duplicate CRM records using email and normalized phone numbers with zero data uploads.",
    "whatItDoes": "Identifies and removes duplicate customer or contact rows in CSV exports by normalizing email casing and stripping non-digit phone formatting. Preserves the first primary contact record while cleaning up duplicate entries caused by multiple marketing imports or CRM merges.",
    "howToUse": [
      "Drop your CRM or address book CSV file into the contact deduplicator drop area.",
      "The tool automatically detects email and phone number columns across your dataset.",
      "Review the summary displaying total unique contacts preserved and duplicate rows removed.",
      "Download the cleaned, deduplicated CSV file ready for CRM import or email marketing."
    ],
    "limits": "Matches records using normalized email strings and cleaned phone digits. Does not perform fuzzy phonetic name matching or nickname deduplication.",
    "privacy": "Customer names, phone numbers, and emails are processed solely in local browser memory. Zero risk of CRM data leaks or privacy violations.",
    "useCases": [
      "CRM Contact List Cleansing: Merge duplicate customer records from sales exports before importing into Mailchimp, HubSpot, or Salesforce.",
      "Phone Directory Consolidation: Remove duplicate entries in exported phonebook CSVs caused by multi-account syncing.",
      "Event Registration Deduplication: Identify duplicate attendee sign-ups based on case-insensitive email matching and normalized phone numbers."
    ],
    "faq": [
      {
        "q": "How are contact phone numbers compared for duplication?",
        "a": "Phone numbers are normalized by stripping spaces, parentheses, hyphens, and punctuation, allowing (555) 123-4567 to match 555-123-4567."
      },
      {
        "q": "Which record is kept when duplicates are detected?",
        "a": "You can choose keeper rules to retain either the first-seen entry, the most complete record, or the newest timestamped row."
      },
      {
        "q": "Are sensitive personal contacts uploaded to external cloud storage?",
        "a": "Never. All parsing, deduplication matching, and CSV output generation take place entirely inside your local browser memory."
      }
    ]
  },
  {
    "id": "csv-splitter",
    "icon": "↔️",
    "cat": "Data",
    "name": "CSV Column Splitter",
    "keyword": "CSV Column Splitter",
    "desc": "Split names, addresses, or delimited data in CSV spreadsheets without Excel.",
    "seoDesc": "Split CSV columns in your browser without Excel. Separate full names and addresses into distinct columns locally with zero server uploads.",
    "whatItDoes": "Splits combined spreadsheet columns (such as 'First Last' names, 'City, State, Zip' addresses, or compound product SKUs) into distinct separate columns based on spaces, commas, or custom delimiters without needing Microsoft Excel or complex spreadsheet formulas.",
    "howToUse": [
      "Upload any standard CSV spreadsheet file from your local computer.",
      "Choose the specific column index containing the combined text you need to divide.",
      "Specify the delimiter character to split on (defaults to a single space character).",
      "Click the Split Column button and download your restructured, multi-column CSV file."
    ],
    "limits": "Handles RFC 4180 compliant CSV files with quoted strings. Extremely large datasets (>50MB) may take several seconds to parse in browser memory.",
    "privacy": "Spreadsheet records are parsed client-side with pure JavaScript. No sensitive financial records or corporate spreadsheets are transmitted online.",
    "useCases": [
      "Customer Name Separation: Split single full name columns into dedicated First Name and Last Name fields for email personalization.",
      "Address & Location Parsing: Divide combined street, city, state, and postal code entries into structured individual columns.",
      "Delimited Text Field Extraction: Break hyphenated SKU codes, product identifiers, or category paths into separate relational columns."
    ],
    "faq": [
      {
        "q": "Does the splitter handle quoted fields containing commas?",
        "a": "Yes. The parser strictly adheres to RFC 4180 rules, preserving commas and line breaks that occur inside quotation marks."
      },
      {
        "q": "Can I choose custom splitting delimiters?",
        "a": "Yes. You can split columns on spaces, commas, hyphens, semicolons, pipe symbols, or custom character sequences."
      },
      {
        "q": "Is there a limit on how many rows can be split?",
        "a": "The tool easily handles tens of thousands of rows depending on your device RAM, running without remote server timeout limitations."
      }
    ]
  },
  {
    "id": "csv-date",
    "icon": "📆",
    "cat": "Data",
    "name": "CSV Date Normalizer",
    "keyword": "CSV Date Normalizer",
    "desc": "Standardize mixed dates into US (MM/DD/YYYY), ISO (YYYY-MM-DD), or European formats.",
    "seoDesc": "Standardize mixed date formats in CSV files in your browser. Convert dates to ISO YYYY-MM-DD or DD/MM/YYYY with zero server uploads.",
    "whatItDoes": "Scans mixed-format date columns across spreadsheet rows and converts every value into a uniform target convention: ISO (YYYY-MM-DD), US (MM/DD/YYYY), or European (DD/MM/YYYY). Fixes inconsistent formatting resulting from disparate database exports or international data collection.",
    "howToUse": [
      "Upload a CSV spreadsheet containing dates written in varying or inconsistent formats.",
      "Select the column index containing date information from your table header.",
      "Choose your target date format standard from the dropdown selection menu.",
      "Click Normalize Dates and download your standardized, clean CSV spreadsheet."
    ],
    "limits": "Parses ISO, US, and European formatted date strings. Ambiguous numeric dates (such as 02/03/2024) are parsed adhering to standard convention rules.",
    "privacy": "Data transformation happens strictly inside your local browser instance. No database records or customer logs are uploaded.",
    "useCases": [
      "Database Migration Date Normalization: Convert heterogeneous date formats (e.g. 05/12/2023, Dec 5 2023) into ISO 8601 (YYYY-MM-DD).",
      "International Date Ambiguity Resolution: Resolve ambiguous dates (like 03/04/2024 as March 4th vs April 3rd) with guided interactive prompts.",
      "Spreadsheet Standardization: Harmonize transaction dates across bank statements and accounting exports prior to financial modeling."
    ],
    "faq": [
      {
        "q": "How does the tool handle ambiguous day/month combinations?",
        "a": "When dates like 02/03/2024 can represent either Feb 3 or March 2, the tool flags the ambiguity and lets you specify the primary regional convention."
      },
      {
        "q": "What is the default normalized date output format?",
        "a": "Dates standardize to the universal ISO 8601 YYYY-MM-DD standard, which is natively supported by SQL databases, Excel, and analytics tools."
      },
      {
        "q": "What happens to rows with empty or non-date values?",
        "a": "Blank cells and recognized non-date strings are preserved in place without corrupting adjacent columns or altering row ordering."
      }
    ]
  },
  {
    "id": "vcard",
    "icon": "📇",
    "cat": "Data",
    "name": "vCard (VCF) Split & Merge",
    "keyword": "vCard VCF Split and Merge",
    "desc": "Merge multiple .vcf contact cards or inspect contact files privately.",
    "seoDesc": "Split and merge vCard VCF contact files in your browser. Unfold RFC 6350 lines and inspect digital business cards with zero data uploads.",
    "whatItDoes": "Parses RFC 6350 vCard files, handles multi-line folded fields, and enables users to inspect individual contact cards or combine multiple .vcf files into one master archive. Facilitates seamless contact migration across Android, Apple iOS, Microsoft Outlook, and Google Contacts.",
    "howToUse": [
      "Select one or multiple .vcf contact cards from your device storage.",
      "The parser unfolds continuation lines and displays all detected contact records.",
      "Download individual .vcf cards or export a single combined master .vcf file.",
      "Import the resulting clean contact file into Apple Contacts, Outlook, or Google Contacts."
    ],
    "limits": "Supports vCard versions 2.1, 3.0, and 4.0 text structures. Embedded base64 contact photos are preserved but not previewed as visual thumbnails.",
    "privacy": "Your private address book and personal contact cards remain strictly on your machine. Client-side parsing ensures total privacy.",
    "useCases": [
      "Bulk vCard Splitting: Break down single multi-contact .vcf export files into individual .vcf cards for compatibility with legacy systems.",
      "Contact Archive Merging: Combine hundreds of separate contact cards into a single unified .vcf file for easy phone import.",
      "Contact File Migration: Clean folded lines and format inconsistencies when transferring contacts between Apple iOS, Android, and Outlook."
    ],
    "faq": [
      {
        "q": "Does the vCard tool support RFC 6350 line folding?",
        "a": "Yes. The parser correctly unwraps folded lines and escaped characters commonly generated by Apple Contacts and Google Contacts."
      },
      {
        "q": "Which vCard specification versions are supported?",
        "a": "The engine parses both vCard 3.0 and vCard 4.0 specifications, preserving names, phone numbers, email addresses, and notes."
      },
      {
        "q": "Can I download extracted contacts as separate files?",
        "a": "Yes. You can download individual contact cards or combine all valid entries into one consolidated .vcf file."
      }
    ]
  },
  {
    "id": "bookmark-cleaner",
    "icon": "🔖",
    "cat": "Files",
    "name": "Chrome Bookmark Cleaner",
    "keyword": "Chrome Bookmark Cleaner",
    "desc": "Remove duplicate bookmarks, dead links, and empty folders from exported bookmarks.html.",
    "seoDesc": "Clean and deduplicate browser bookmark HTML files in your browser. Remove duplicate URLs from Chrome and Firefox exports with zero uploads.",
    "whatItDoes": "Parses exported Netscape Bookmark HTML files from Chrome, Firefox, Safari, or Edge, and strips duplicate URLs while maintaining folder structure integrity. Sanitizes messy bookmark collections to reduce clutter and speed up bookmark searches across desktop browsers.",
    "howToUse": [
      "Export your browser bookmarks as an HTML file from Chrome or Firefox bookmark manager.",
      "Drop the exported bookmarks.html file into the cleaner drop zone.",
      "The parser scans links and removes duplicate URL entries while preserving folder hierarchies.",
      "Download your cleaned bookmarks.html file and import it back into your browser."
    ],
    "limits": "Deduplicates by matching exact canonical URL strings. Does not check remote network connectivity for HTTP 404 broken links.",
    "privacy": "Your browsing history and saved bookmarks are sensitive. All parsing is executed in local browser memory with zero external network requests.",
    "useCases": [
      "Browser Bookmark Deduplication: Remove redundant bookmarks accumulated across multiple computers and browser sync profiles.",
      "Security Audit of Exported Bookmarks: Strip hazardous bookmarklets and obsolete javascript: URLs from your browser export files.",
      "HTML Bookmark File Minification: Clean legacy Netscape bookmark backups to reduce file size before importing into fresh browser installations."
    ],
    "faq": [
      {
        "q": "What bookmark file formats are accepted?",
        "a": "The cleaner supports standard HTML bookmark backup files (NETSCAPE-Bookmark-file-1 format) exported by Chrome, Firefox, Safari, and Edge."
      },
      {
        "q": "Does the cleaner delete folder hierarchies?",
        "a": "No. Your folder categories and organizational structure are retained while duplicate links inside those folders are pruned."
      },
      {
        "q": "How does it protect against malicious bookmarklets?",
        "a": "The cleaner filters out javascript:, data:, and file: URI protocols, preserving only legitimate http:// and https:// web addresses."
      }
    ]
  },
  {
    "id": "bookmark-reading",
    "icon": "📚",
    "cat": "Files",
    "name": "Bookmark → Reading List",
    "keyword": "Bookmark to Reading List",
    "desc": "Convert messy browser bookmark HTML files into a distraction-free offline reading list.",
    "seoDesc": "Convert browser bookmark HTML exports into clean offline reading lists in your browser. Filter out dangerous URIs with zero server uploads.",
    "whatItDoes": "Extracts valid HTTP and HTTPS links from complex bookmark exports and compiles them into a clean, minimalist, offline HTML reading list document. Filters out dangerous URI schemes and excessive nested folder tags, creating an uncluttered reading dashboard for long-form articles.",
    "howToUse": [
      "Upload your browser's exported bookmarks.html file into the reading list converter.",
      "The tool sanitizes entries, automatically filtering out javascript: and data: URIs.",
      "Preview the clean list of saved articles and reading links rendered on screen.",
      "Download the standalone reading-list.html document for distraction-free offline reading."
    ],
    "limits": "Filters out internal browser schemes (javascript:, data:, chrome:, file:). Does not scrape or archive the full offline text content of linked web pages.",
    "privacy": "Your saved articles and reading links never leave your browser sandbox. Bench reads the bookmark file locally, keeps the parsed list in memory, and exports a standalone HTML reading list.",
    "useCases": [
      "Reading List Digest Creation: Convert cluttered browser bookmark folders into a clean Markdown checklist for reading later in Obsidian or Notion.",
      "Domain-Grouped Research Lists: Group saved research bookmarks by website domain to organize sources for research papers and articles.",
      "Curated Resource Sharing: Format saved web links into shareable text summaries for team wikis, newsletters, and email digests."
    ],
    "faq": [
      {
        "q": "What output formats can I generate from my bookmarks?",
        "a": "You can copy or download your reading list as clean Markdown, structured HTML, or plain text link summaries."
      },
      {
        "q": "Does the tool group links by website domain?",
        "a": "Yes. You can toggle domain-based grouping to categorize articles and tools by their source publication."
      },
      {
        "q": "Can I copy the formatted reading list directly to my clipboard?",
        "a": "Yes. A single-click copy button allows instant pasting into your favorite note-taking application or document editor."
      }
    ]
  },
  {
    "id": "svg-cleaner",
    "icon": "✦",
    "cat": "Files",
    "name": "SVG Cleanup & Minifier",
    "keyword": "SVG Cleanup and Minifier",
    "desc": "Strip Illustrator, Inkscape metadata, and comments to shrink SVG file sizes.",
    "seoDesc": "Clean and sanitize SVG vector files in your browser. Strip Inkscape metadata, scripts, and comments to shrink file size with zero uploads.",
    "whatItDoes": "Sanitizes and shrinks SVG vector graphics by recursively removing XML comments, Adobe Illustrator and Inkscape editor metadata namespaces, script tags, foreignObjects, and inline event handlers. Reduces SVG file size while eliminating potential cross-site scripting (XSS) vectors.",
    "howToUse": [
      "Drop any vector .svg graphic file into the sanitizer interface.",
      "The parser strips non-standard namespaces, editor comments, and dangerous script tags.",
      "Review the notification displaying file sanitization details.",
      "Download the lightweight, secure, and production-ready SVG vector file."
    ],
    "limits": "Optimizes XML document structure and removes security risks. Does not perform lossy coordinate rounding, curve approximation, or visual vector path simplification.",
    "privacy": "Sanitization occurs entirely in browser memory using DOMParser. Vector illustrations and proprietary branding graphics are never uploaded to third parties.",
    "useCases": [
      "Vector Security Sanitization: Remove hidden JavaScript scripts, on* event handlers, and foreignObject tags from downloaded SVGs before web embedding.",
      "Web Asset Minification: Strip redundant XML namespaces, editor metadata (Inkscape, Illustrator), and comments to reduce SVG file size.",
      "Cricut & Plotter SVG Preparation: Clean messy vector files so cutting software imports true paths without XML parsing errors."
    ],
    "faq": [
      {
        "q": "Why is sanitizing SVG files critical for web security?",
        "a": "SVGs are XML documents that can embed executable JavaScript; unsanitized SVG uploads can execute cross-site scripting (XSS) attacks in browsers."
      },
      {
        "q": "Does the SVG cleaner strip essential vector graphic paths?",
        "a": "No. The cleaner selectively prunes scripting tags and metadata while preserving path, polygon, rect, circle, and viewBox geometry."
      },
      {
        "q": "Can I inspect the cleaned SVG before downloading?",
        "a": "Yes. You get a live side-by-side visual render and source code preview showing exactly what was sanitized."
      }
    ]
  },
  {
    "id": "calendar-cleaner",
    "icon": "📅",
    "cat": "Productivity",
    "name": "iCal Calendar Deduplicator",
    "keyword": "iCal Calendar Deduplicator",
    "desc": "Scan .ics calendar exports for duplicate VEVENT entries and export clean calendars.",
    "seoDesc": "Deduplicate iCal ICS calendar files in your browser. Remove duplicate VEVENT calendar entries from Outlook and Google exports with zero uploads.",
    "whatItDoes": "Parses iCalendar (.ics) export files, detects duplicate VEVENT calendar blocks sharing identical summary, timestamp, and recurrence properties, and exports a streamlined calendar file. Eliminates annoying duplicated calendar alerts across desktop and mobile devices.",
    "howToUse": [
      "Export your calendar from Google Calendar, Microsoft Outlook, or Apple Calendar as an .ics file.",
      "Drop the .ics file into the calendar deduplicator tool interface.",
      "The tool parses calendar entries, identifies duplicate event blocks, and removes duplicates.",
      "Download the cleaned .ics file and re-import it into your calendar application."
    ],
    "limits": "Deduplicates based on normalized VEVENT string properties. Does not automatically resolve conflicting event time modifications or update remote CalDAV servers.",
    "privacy": "Your personal and professional appointment schedules are kept strictly private on your computer. Zero calendar data is transmitted across the internet.",
    "useCases": [
      "Duplicate Calendar Event Purging: Remove duplicate meeting invites and repeated appointments from exported .ics calendar backups.",
      "Multi-Calendar Merge Cleanup: Clean combined calendar files after merging personal, school, and work schedules.",
      "Sync Error Repair: Eliminate phantom duplicate calendar entries caused by repeated cloud calendar sync failures."
    ],
    "faq": [
      {
        "q": "What calendar file formats are supported?",
        "a": "The cleaner processes standard iCalendar (.ics) files generated by Google Calendar, Apple Calendar, Microsoft Outlook, and Nextcloud."
      },
      {
        "q": "How does the tool identify duplicate events?",
        "a": "Events are matched based on identical start times, end times, event summaries (titles), and unique identifier (UID) fields."
      },
      {
        "q": "Are recurring event series preserved?",
        "a": "Yes. Valid recurring event rules (RRULE) and single-instance events are preserved while exact duplicates are discarded."
      }
    ]
  },
  {
    "id": "timetable-calendar",
    "icon": "🗓️",
    "cat": "Productivity",
    "name": "Timetable → Calendar (.ics)",
    "keyword": "Timetable to Calendar Converter",
    "desc": "Convert school or work class timetable CSVs into recurring weekly iCal events.",
    "seoDesc": "Convert timetable CSV spreadsheets into iCal calendar files in your browser. Create recurring weekly class events with zero data uploads.",
    "whatItDoes": "Converts class schedules, university lectures, and work shift timetables from simple CSV spreadsheets into recurring weekly iCal (.ics) calendar events. Generates RFC 5545 compliant recurring VEVENT entries with proper time zone formatting and recurrence rules.",
    "howToUse": [
      "Create a CSV with columns: day, start, end, title (e.g., Monday, 09:00, 10:30, Mathematics Lecture).",
      "Upload the CSV schedule file into the timetable converter interface.",
      "Review the number of recurring calendar events generated by the parser.",
      "Download timetable.ics and import it directly into Google Calendar, Apple Calendar, or Outlook."
    ],
    "limits": "Generates recurring weekly events for a standard 16-week term. Custom bi-weekly alternating schedules require separate CSV exports.",
    "privacy": "Student schedules and employee shift CSVs are parsed locally in browser memory with zero cloud transmission.",
    "useCases": [
      "Class Schedule to iCal Import: Convert weekly school, college, or university class timetable CSVs into calendar events.",
      "Shift Work Schedule Generation: Transform rotating weekly work shift spreadsheets into recurring calendar reminders.",
      "Fitness & Routine Calendar Planning: Turn weekly exercise class schedules into recurring calendar appointments for Apple or Google Calendar."
    ],
    "faq": [
      {
        "q": "How should my timetable CSV data be structured?",
        "a": "Rows should include day of the week (e.g. Monday), event name, start time (e.g. 09:00), end time, and optional location or notes."
      },
      {
        "q": "Does the tool create recurring calendar events?",
        "a": "Yes. It generates standard RRULE:FREQ=WEEKLY recurrence rules so your classes repeat each week throughout the term."
      },
      {
        "q": "Can the generated .ics file be imported on mobile phones?",
        "a": "Yes. The exported .ics file can be imported directly into Apple Calendar on iOS, Google Calendar on Android, or Outlook."
      }
    ]
  },
  {
    "id": "wallpaper",
    "icon": "🖼️",
    "cat": "Images",
    "name": "Wallpaper Photo Cropper",
    "keyword": "Wallpaper Photo Cropper",
    "desc": "Crop photos to exact phone, tablet and desktop wallpapers — device presets, custom ratio and pixels, a draggable focal crop box, cover-crop or blur padding, PNG/JPEG/WebP export.",
    "seoDesc": "Crop photos to wallpaper sizes: iPhone, Android, desktop, custom ratio. Blur padding, batch PNG/JPEG/WebP. Zero uploads.",
    "whatItDoes": "Runs an Image Studio wallpaper engine that crops a photo to an exact screen aspect and pixel size. Choose a device preset (iPhone 1170×2532 and 1290×2796, Android 1080×2400, 16:9 desktop 1920×1080, 9:16 social, 4:3 tablet or 19.5:9 wide), or enter a custom ratio and custom output pixels. A crop box overlays the preview and you drag it to set the focal point, so the important part of the shot — a face, a landmark — stays in frame instead of being blindly centre-cropped. In Cover-crop mode the photo fills the output edge to edge with no distortion; in Blur-padding mode the crop is fitted and the leftover space is filled with a blurred, darkened copy of the image so nothing is cut off. Everything exports as PNG, JPEG or WebP with a quality slider, one photo at a time or as a batch with a shared ratio.",
    "howToUse": [
      "Drop one or more photos (PNG, JPEG, WebP) into the upload box — batch works on the whole set with the same ratio.",
      "Pick a device / ratio preset, or choose Custom ratio and type the custom pixels for an exact wallpaper size.",
      "Drag the crop box on the preview to set the focal point so the subject stays centred; press Reset focal point to recentre.",
      "Choose Cover crop to fill the frame, or Blur padding to fit the whole photo with a softened background — no crop loss.",
      "Set the format and quality, then Download for the active photo or Download all for the batch; set the saved file as your wallpaper."
    ],
    "limits": "Processes common raster photos (PNG, JPEG, WebP) up to 30 files per session and does not render animated live wallpapers. Blur padding relies on the browser's canvas blur filter, so the padding look varies slightly between browsers.",
    "privacy": "Cropping, blur padding and canvas rendering happen entirely in local browser memory. Your personal photos remain 100% private.",
    "useCases": [
      "Device Wallpaper Formatting: Crop personal photos to exact smartphone screen ratios (iPhone, Samsung Galaxy, Pixel) without stretching.",
      "Desktop Wallpaper Resizing: Fit vertical or square photos onto 16:9 or 21:9 ultrawide desktop monitors using aesthetic blur padding.",
      "Tablet Lock Screen Preparation: Center subjects with custom focal point positioning for iPad and Android tablet aspect ratios."
    ],
    "faq": [
      {
        "q": "What is blur pad mode and how does it prevent image cropping?",
        "a": "Blur pad mode fits your entire uncropped photo in the center while filling side margins with a blurred, color-matched version of the background."
      },
      {
        "q": "Can I adjust which part of the photo stays visible?",
        "a": "Yes. An interactive focal point controller lets you drag the crop box to center faces, horizons, or key subjects."
      },
      {
        "q": "What image formats can I export?",
        "a": "You can download full-resolution PNG or high-quality JPEG wallpapers sized to match your screen resolution."
      }
    ]
  },
  {
    "id": "panorama",
    "icon": "🌄",
    "cat": "Images",
    "name": "Panorama Carousel Splitter",
    "keyword": "Panorama Carousel Splitter",
    "desc": "Seamlessly slice wide panoramic photos into 3 seamless square Instagram carousel tiles.",
    "seoDesc": "Split panoramic photos into seamless Instagram carousel tiles in your browser. Slice wide landscape shots into 3 squares with zero uploads.",
    "whatItDoes": "Splits ultra-wide panoramic photographs into 3 mathematically seamless square image tiles. Enables photographers and travelers to publish swipeable multi-slide panoramic carousels on Instagram and social feeds without ugly compression or letterboxing.",
    "howToUse": [
      "Drag and drop an ultra-wide panoramic landscape photo file into the splitter.",
      "The splitter segments the image width into 3 mathematically seamless adjacent square tiles.",
      "Inspect the 3 carousel tiles rendered side-by-side in the preview pane.",
      "Click each tile to download the individual high-resolution square PNG image files."
    ],
    "limits": "Slices images into 3 equal square segments. Requires wide landscape images with aspect ratio of at least 3:1 for optimal square proportions.",
    "privacy": "Image slicing executes locally in Canvas memory. Your original landscape and vacation photos are never uploaded to any cloud server.",
    "useCases": [
      "Instagram Carousel Panoramas: Split wide panoramic landscape shots into 2 to 6 seamless swipeable carousel slides.",
      "Multi-Post Photo Grids: Divide ultra-wide photography into contiguous square or 4:5 vertical photo posts.",
      "Print Triptych Planning: Segment panoramic cityscape or nature photography into multi-panel wall art triptychs."
    ],
    "faq": [
      {
        "q": "Will there be gaps or visible seams between the split tiles?",
        "a": "No. The splitter cuts pixels with edge-to-edge precision, ensuring seamless transitions when swiping on Instagram."
      },
      {
        "q": "What aspect ratios are supported for carousel slides?",
        "a": "You can divide into standard 1:1 squares or 4:5 vertical portrait tiles, which offer maximum screen real estate on mobile feeds."
      },
      {
        "q": "How are the split tiles numbered for upload?",
        "a": "Files are exported with sequential numbered filenames (e.g., tile-1.png, tile-2.png) to simplify multi-photo carousel uploads."
      }
    ]
  },
  {
    "id": "duplicate-finder",
    "icon": "♻️",
    "cat": "Images",
    "name": "Photo Duplicate Finder",
    "keyword": "Photo Duplicate Finder",
    "desc": "Find exact and near-duplicate photos by hash, with a keep recommendation.",
    "seoDesc": "Find duplicate and near-duplicate photos by SHA-256 and perceptual hash in your browser. Export a CSV or HTML cleanup report with zero uploads.",
    "whatItDoes": "Groups selected files into exact byte-duplicates (size + SHA-256, hashed in a Web Worker) and perceptual near-duplicates (aHash/dHash Hamming distance with a sensitivity slider and similarity percentage). Per-group thumbnail strips carry group id, size, date and hash columns with checkboxes to select copies, and the recommended keeper (oldest date, then shortest name) is pre-marked. Any file type is accepted.",
    "howToUse": [
      "Select multiple files, or drop an entire folder — every file type is accepted, not just images.",
      "Exact duplicates are grouped by byte size then SHA-256 hashed; images also get aHash/dHash perceptual hashes.",
      "Review each thumbnail group, tick the copies to remove, or use Keep recommended to keep the oldest copy.",
      "Export the cleanup report as CSV (Group,File,Size,Date,Hash,Distance) or as a standalone HTML report."
    ],
    "limits": "Exact dedupe uses SHA-256 (needs https or localhost). Perceptual hashing catches resized and recompressed copies, but heavy edits or crops may fall outside the similarity threshold.",
    "privacy": "Hashing and thumbnailing run entirely in your browser with Web Crypto and Canvas. Your files are never uploaded to any server.",
    "useCases": [
      "Camera Roll Duplicate Pruning: Detect nearly identical photos taken seconds apart to reclaim valuable storage space.",
      "Resized & Recompressed Photo Detection: Match identical images across folders regardless of differing dimensions or JPEG compression levels.",
      "Burst Mode Photo Cleanup: Group rapid-fire photo bursts and identify the best candidate while flagging redundant extras."
    ],
    "faq": [
      {
        "q": "How does perceptual hashing find duplicates at different sizes?",
        "a": "The engine uses dHash and aHash algorithms that analyze relative luminance gradients rather than exact file bytes, matching resized duplicates."
      },
      {
        "q": "Does the tool automatically suggest which photo to keep?",
        "a": "Yes. The recommendation algorithm highlights the oldest original capture date or highest-resolution file as the keeper."
      },
      {
        "q": "Are my private family photos uploaded to a cloud scanner?",
        "a": "No. All perceptual hashing and image comparison algorithms execute entirely inside your local browser memory."
      }
    ]
  },
  {
    "id": "best-shot",
    "icon": "✨",
    "cat": "Images",
    "name": "Photo Best-Shot Finder",
    "keyword": "Photo Best-Shot Finder",
    "desc": "Rank burst photos by Laplacian sharpness, exposure and contrast.",
    "seoDesc": "Rank burst photos by sharpness, exposure and contrast in your browser. Export a ranked CSV of the best shot locally with zero uploads.",
    "whatItDoes": "Scores every photo with variance-of-Laplacian sharpness on an aspect-preserving 256 px downsample (letterboxed, never stretched), plus an exposure/clipping penalty and a contrast term. Blends them into a 0-100 composite score with adjustable weights and shows the sharpness/exposure/contrast breakdown per photo, a full ranked list with load-more, and a side-by-side compare of the top shots.",
    "howToUse": [
      "Select a batch of burst photos taken in similar lighting from your camera roll.",
      "Each image is downsampled to 256 px, then a 3x3 Laplacian kernel measures sharpness while exposure and contrast are scored.",
      "Inspect the ranked list, per-photo breakdown and compare view, and adjust the weighting sliders to taste.",
      "Export the ranking as CSV or copy the winning filename to keep the crispest frame."
    ],
    "limits": "Edge-based sharpness and exposure heuristics only — artistic composition and facial expressions are not judged. Unsupported files are skipped and reported instead of stopping the batch.",
    "privacy": "Pixel data is analyzed inside local Canvas memory buffers without external API calls or machine learning cloud server uploads.",
    "useCases": [
      "Burst Photography Selection: Score multiple rapid-fire takes to identify the single sharpest photo with the crispest subject detail.",
      "Group Portrait Quality Assessment: Detect photos with motion blur or camera shake to select the cleanest group picture.",
      "Macro & Product Photography Culling: Rank close-up product captures by edge contrast and focal plane clarity."
    ],
    "faq": [
      {
        "q": "How is photo sharpness calculated mathematically?",
        "a": "The tool calculates Laplacian edge variance across the luminance channel, where higher edge gradient variance indicates sharper focus."
      },
      {
        "q": "Does the tool penalize overexposed or clipped highlights?",
        "a": "Yes. The composite scoring model balances edge sharpness with contrast metrics and clipped pixel ratios to avoid overexposed shots."
      },
      {
        "q": "Can I compare raw score rankings across all uploaded photos?",
        "a": "Yes. The interface ranks photos by composite quality score with visual badges identifying the #1 recommended keeper."
      }
    ]
  },
  {
    "id": "photo-timeline",
    "icon": "🕒",
    "cat": "Images",
    "name": "Photo Timeline Builder",
    "keyword": "Photo Timeline Builder",
    "desc": "Build a chronological photo album with EXIF dates and embedded thumbnails in one HTML file.",
    "seoDesc": "Build photo album from EXIF dates in your browser. Export offline HTML photo diary with lazy-loaded images. Zero uploads, no server dependency.",
    "whatItDoes": "Reads EXIF DateTimeOriginal (falling back to the file date), downscales every photo to an embedded data-URL thumbnail (default 400 px longest side), and groups the set by day with sticky headings and per-group counts (automatically switching to month or year groups for large sets). You get a click-to-open full-resolution lightbox, a per-file date-correction field with an EXIF / file / manual confidence badge, a total output-size report, and a single self-contained photo-timeline.html with lazy-loaded images and the original filenames as captions.",
    "howToUse": [
      "Drop a folder or batch of photo files from a family event, wedding, or holiday.",
      "Each JPEG's EXIF DateTimeOriginal is read first; files without EXIF fall back to the file date and are flagged for correction.",
      "Review the day/month groups, click any thumbnail to open the full-resolution original, and fix any wrong dates inline.",
      "Check the embedded album-size report, add an album title, and download the standalone photo-timeline.html photo diary."
    ],
    "limits": "Photo dating prefers EXIF DateTimeOriginal then the file date; EXIF GPS, lens model and facial tags are not read. Thumbnails are re-encoded client-side as JPEG data URLs, so very large sets produce a large single file.",
    "privacy": "Album generation runs entirely in client-side JavaScript. Your personal photo libraries and event memories remain completely confidential.",
    "useCases": [
      "Chronological Vacation Photo Sorting: Organize hundreds of trip snapshots into calendar-sorted day and month albums.",
      "Event Photo Sequencing: Order wedding or conference photos taken on multiple cameras into a single chronological timeline.",
      "Photo Archive Verification: Inspect EXIF capture timestamps to confirm whether legacy photo scans contain camera metadata."
    ],
    "faq": [
      {
        "q": "How does the tool determine when a photograph was taken?",
        "a": "It extracts the authentic EXIF DateTimeOriginal tag from the JPEG header, falling back to file modification dates if EXIF is absent."
      },
      {
        "q": "Can I manually override dates for scanned photographs?",
        "a": "Yes. You can edit dates for individual photos or batch-assign calendar dates to archival family photo scans."
      },
      {
        "q": "Can I download a timeline rename plan for my photo collection?",
        "a": "Yes. You can export a structured rename plan or download grouped photos organized by calendar day."
      }
    ]
  },
  {
    "id": "family-organizer",
    "icon": "🗂️",
    "cat": "Images",
    "name": "Family Photo Date Organizer",
    "keyword": "Family Photo Date Organizer",
    "desc": "Organize family photos into a year-to-month-to-day tree and export a rename plan.",
    "seoDesc": "Organize family photos by date in your browser. Export HTML archive index and CSV/JSON rename plan with confidence badges. Zero uploads.",
    "whatItDoes": "Builds a collapsible year → month → day summary tree with per-group counts and a thumbnail contact strip per group, then previews a proposed folder structure from an editable rename pattern (default YYYY/MM/YYYY-MM-DD_title.ext) as a live old-name → new-path table. Dates prefer EXIF DateTimeOriginal, wrong timestamps can be corrected per file or in bulk per group, and every entry carries a date-confidence badge. Since browsers cannot move files on disk, it exports a self-contained family-organizer.html archive index plus a planned-folder CSV and JSON mapping (original → proposed path).",
    "howToUse": [
      "Select multiple family photos (and any other files) from your hard drive or camera backup.",
      "Photos are dated from EXIF DateTimeOriginal first, then the file date; non-image files still appear in the tree without a thumbnail.",
      "Inspect the year → month → day tree, fix wrong dates per file or in bulk per group, and tune the rename pattern to watch the proposed paths update live.",
      "Download family-organizer.html plus the planned-folder CSV or JSON, then apply the rename plan with your own file manager."
    ],
    "limits": "Organizes and renames by date but never rewrites EXIF header tags or moves files on disk — it exports an HTML index and a rename plan instead. Thumbnails require browser-decodable image formats.",
    "privacy": "All photo analysis and document compilation occur inside your local browser sandbox. No family pictures are ever uploaded to external servers.",
    "useCases": [
      "Family Photo Archive Renaming: Standardize camera roll names into clean YYYY/MM/YYYY-MM-DD_title.ext formats for long-term storage.",
      "Multi-Device Photo Consolidation: Harmonize messy filenames from iPhones, Androids, and digital cameras into consistent date-first naming.",
      "Scanned Album Date Assignment: Organize historic family albums by year and decade with custom title tokens and safe collision numbering."
    ],
    "faq": [
      {
        "q": "What tokens can I use in the custom rename pattern?",
        "a": "You can use tokens for YYYY (year), MM (month), DD (day), original filename, title, and sequential collision numbers."
      },
      {
        "q": "What happens if two photos share the same date and title?",
        "a": "The engine automatically appends zero-padded collision avoidance numbers (-01, -02) so filenames stay unique."
      },
      {
        "q": "Are original files modified on my hard drive without confirmation?",
        "a": "No. Browser security prevents direct disk modification; you review the live rename plan and download the renamed files intentionally."
      }
    ]
  }
];

  TOOLS.push({
    "id": "pdf-translator",
    "icon": "🌐",
    "cat": "Files & Data",
    "name": "PDF Translator",
    "keyword": "PDF Translator",
    "desc": "Translate text PDFs into other languages, including best-effort Romanized Hindi, and download a readable PDF.",
    "seoDesc": "Translate PDFs with OCR for scanned pages, page selection, language and style controls, plus PDF download. Translation runs on your device when available.",
    "whatItDoes": "Extracts text in your browser, translates it entirely on your device on Chrome 138+ (built-in on-device Translator) or via a server endpoint as fallback, and assembles a downloadable PDF locally. It supports best-effort layout reconstruction, clean readable pages, bilingual source-and-translation pages, page ranges, and local OCR for image-only pages.",
    "howToUse": [
      "Choose a PDF under 15 MB and review its page count.",
      "Select a target language, translation style and output layout; optionally set a source language and page range.",
      "Enable local OCR for scanned pages. OCR requires downloading language data to your browser, but page images stay on your device.",
      "Translate and review the text preview and page-quality report before downloading the generated PDF."
    ],
    "limits": "Maximum 15 MB and 120,000 extracted characters per job. Complex tables, embedded image text, handwriting, unusual fonts and expanded translations can affect layout. Original-layout reconstruction is best-effort, links are not preserved as interactive links, and output pages are rasterized. Hinglish is Hindi translated then romanized; the mix of Hindi and English is not guaranteed. The on-device translator processes text locally; otherwise text goes to a server translation endpoint.",
    "privacy": "The PDF itself is parsed, rendered, OCR-processed and rebuilt locally in your browser. On Chrome 138+, translation runs entirely on your device — no text is sent anywhere. Otherwise extracted text is translated through a provider configured server-side (DeepL when set, or an anonymous fallback). OCR language data is downloaded from the Tesseract data host, but document images are not sent there.",
    "useCases": [
      "Translate text-based reports, guides and study materials while retaining their page structure where practical.",
      "Convert Hindi translations to Roman script for a best-effort Hinglish reading copy.",
      "OCR scanned English or Hindi pages locally before translating selected pages."
    ],
    "faq": [
      {
        "q": "Is my PDF uploaded to Bench?",
        "a": "No. PDF pages stay in your browser. On Chrome 138+, even extracted text never leaves your device — it is translated entirely on your device using the built-in on-device Translator."
      },
      {
        "q": "Does Hinglish use Roman script?",
        "a": "Yes. The tool translates to Hindi and romanizes that output. This is best-effort Romanized Hindi, not guaranteed natural Hindi-English mixing."
      },
      {
        "q": "Can scanned documents be translated?",
        "a": "Yes, when local OCR is enabled and the required language data is available. OCR may be incomplete for low-quality scans, handwriting and image-heavy pages."
      }
    ]
  });

  TOOLS.push({
    "id": "pdf-page-manager",
    "icon": "📑",
    "cat": "Files & Data",
    "name": "PDF Page Manager",
    "keyword": "PDF Page Manager",
    "desc": "Reorder, remove, duplicate, insert and merge PDF pages privately in your browser.",
    "seoDesc": "Edit PDF page order locally: delete, duplicate, insert blank or image pages, and merge selected pages from another PDF. No uploads.",
    "whatItDoes": "Builds a new PDF from the pages you choose, in the exact order shown in the editor. PDF.js reads documents and renders on-demand thumbnails; pdf-lib copies source pages, inserts blank pages and images, and writes the finished PDF entirely in browser memory. Original files are never modified or uploaded.",
    "howToUse": [
      "Choose or drop a PDF. Review its page count and select the pages you want to change.",
      "Drag pages to reorder them, or use the accessible move buttons. Delete or duplicate selected pages, or undo and redo edits.",
      "Insert pages from another PDF, append the whole document, add a blank page, or insert PNG/JPEG images. Choose the insertion point and page size.",
      "Export the edited document, review the output page count, and download the validated PDF."
    ],
    "limits": "Accepts unencrypted PDFs up to 50 MB and 150 pages per source; output is limited to 250 pages. A second PDF is limited to 30 MB. Image insertion supports PNG and JPEG. Digital signatures are invalidated by any edit; links, annotations, bookmarks, form fields, metadata and other advanced PDF features may not be preserved. Always compare exported files when those features matter.",
    "privacy": "PDF and image bytes are read and processed only in your browser. The editor does not call a PDF-processing API, send document contents to analytics, or persist files in localStorage or IndexedDB. Temporary thumbnails and output URLs are released when replaced or when you leave the page.",
    "useCases": [
      "Reorder or remove pages from reports, scanned documents and study materials.",
      "Combine selected pages from a second PDF or append another document.",
      "Add blank sheets or PNG/JPEG pages before printing or sharing a document."
    ],
    "faq": [
      {
        "q": "Are my documents uploaded?",
        "a": "No. Reading, thumbnail rendering, page editing and PDF export happen locally in browser memory. The tool makes no document-processing network requests."
      },
      {
        "q": "Can I edit an encrypted PDF?",
        "a": "Password-protected PDFs are not supported. The tool reports that restriction without attempting to bypass document protection."
      },
      {
        "q": "Will links, forms, bookmarks and signatures survive?",
        "a": "Digital signatures are invalidated when a PDF is edited. Links, annotations, bookmarks, forms, metadata and other advanced features may be lost; this tool does not promise to preserve them."
      }
    ]
  });

  return {
    PARENT_BRAND,
    PARENT_URL,
    SITE_NAME,
    SITE_SHORT,
    SITE_URL,
    SUPPORT_EMAIL,
    TAGLINE,
    LOCALE,
    LAST_UPDATED,
    TOOLKIT_UPDATED,
    PRICE_CURRENCY,
    CLARITY_ID,
    INDEXNOW_KEY,
    TOOLS
  };
});
