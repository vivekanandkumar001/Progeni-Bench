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

  const TOOLS = [
    {
      id: "sticker-sheet",
      icon: "🏷️",
      cat: "Print & Craft",
      name: "Sticker Sheet Maker",
      keyword: "Sticker Sheet Maker",
      desc: "Build printable sticker sheets in your browser — custom grids, shapes, kiss-cut lines, and PNG / PDF / SVG die-line export for Cricut, Silhouette, or home printers.",
      seoDesc: "Create print-ready sticker sheets in your browser: custom grid, spacing, shapes, kiss-cut lines and PNG, PDF or SVG die-line export for Cricut. No uploads, no limits.",
      whatItDoes: "Arranges any number of transparent PNG or JPEG graphics onto a precise multi-column sticker layout on US Letter, A4, A3 or 4x6 paper at 300 DPI. Every sticker can be fitted (contain or cover), masked to a square, rounded or true-circle shape, outlined with a white kiss-cut border, extended with print bleed, and traced with dashed or solid cut lines plus optional corner registration marks for Print-Then-Cut workflows. A per-sticker editor gives you rotate, flip, size control (with live mm readout) and automatic transparent-edge trimming, and the whole sheet supports undo/redo, saved projects, zoom with a tilt-able 3D paper preview, multi-copy sheets, browser printing, and PNG / PDF / SVG die-line export.",
      howToUse: [
        "Choose your paper standard (US Letter, A4, A3, or 4x6 photo paper) and set columns, rows, spacing, margins, and bleed — or leave columns on Auto to fit everything on one page.",
        "Drag and drop your PNG, JPEG, WebP, or SVG graphics into the upload box with a live loading bar. There is no 12-image limit: extra designs automatically flow onto additional pages, and Sheet copies repeats every sticker up to 4 times.",
        "Style the sheet: contain or cover fit, square / rounded / circle shape, white kiss-cut border width, dashed or solid cut lines, cut line color, background color, and optional corner registration marks.",
        "Click the pencil on any thumbnail to open the per-sticker editor: rotate, flip, resize with mm readout, trim transparent edges, replace, duplicate, or delete. Drag thumbnails to reorder (or Ctrl+Arrow keys), and undo any step with Ctrl+Z.",
        "Preview flat in 2D with zoom/pan or switch to the 3D tilt view, then download a 300 DPI PNG, a print-ready multi-page PDF, an SVG die-line for Cricut / Silhouette, or send the sheet straight to your printer. Save the project in your browser or export it as JSON."
      ],
      limits: "Cut lines follow the chosen sticker shape (square, rounded, circle) — the tool does not auto-trace irregular artwork silhouettes into vector contours. PNG and SVG export the page currently shown (or all pages at once); PDF bundles every page into one file. Saved projects use this browser's local storage; use Export JSON to move a project between devices.",
      privacy: "All canvas operations and image composing execute locally in your web browser memory. Your illustrations and design assets are never transmitted to external cloud servers."
    },
    {
      id: "labels",
      icon: "📦",
      cat: "Print & Craft",
      name: "Avery 5160 / Label Maker",
      keyword: "Avery 5160 Label Maker",
      desc: "Build printable Avery 5160, 5163, 5167, L7160 and custom label sheets from CSV, pasted rows, or a single manual label — multi-line builder with live sheet preview.",
      seoDesc: "Make Avery 5160, 5163, 5167, L7160 and custom label sheets in your browser from CSV or pasted rows. Multi-line builder, address wizard, sequence numbers, live preview, PNG and print-ready export. Zero uploads.",
      whatItDoes: "Runs a full Label Studio engine: verified template geometry (Avery 5160 30-up, 5163 10-up, 5167 80-up return, EU L7160 21-up, name badges and fully custom grids) drives a live canvas preview built from the same layout the exports use, so preview and print always match. A multi-line builder (up to 6 lines) places {{Column}} tokens, sequence numbers, bold/italic/alignment, per-line sizes and auto-shrink overflow on every label; an address wizard detects name, street, city, state and zip columns automatically. Data comes from an uploaded CSV, pasted spreadsheet rows, or manual single-label mode, with a sortable inline-editable data table. Exports: 300 DPI PNG, standalone HTML, or direct print with exact @page sizing.",
      howToUse: [
        "Pick your label template (Avery 5160, 5163, 5167, L7160, name badge, or a custom grid) and nudge the calibration offsets if your printer feeds paper off-center.",
        "Load your data: upload a CSV, paste rows copied from Excel or Google Sheets, or skip data entirely to compose a single manual label.",
        "Build the label lines — click column chips to insert {{Column}} tokens, or press the Address wizard to detect and lay out name/address columns automatically.",
        "Fine-tune fonts, alignment, vertical position, repeat mode and overflow policy while watching the live sheet preview, page tabs and sheet-count report.",
        "Export a 300 DPI PNG, download standalone HTML, or open Print for physical output / Save as PDF — always print at 100% / Actual size."
      ],
      limits: "Text-only labels (up to 6 lines per label); QR/Code128 barcodes, logo artwork and UPC/EAN are not yet supported. Print at 100% scale — do not use 'Fit to page'. Margins for the 5163/5167/badge templates are provisional and can be corrected with the ±3 mm calibration offsets or the custom grid.",
      privacy: "Your CSV files, pasted rows and mailing lists are parsed purely in your browser and never uploaded. Saved presets store label layout only — row data persists locally only if you explicitly export a JSON project."
    },
    {
      id: "tshirt-mirror",
      icon: "👕",
      cat: "Print & Craft",
      name: "T-Shirt Print Mirror",
      keyword: "T-Shirt Print Mirror",
      desc: "Flip art horizontally, vertically or 180° for heat-transfer paper — SVG passthrough, before/after preview, batch download and PNG/JPEG/WebP export.",
      seoDesc: "Mirror or flip artwork for heat transfer paper in your browser: horizontal, vertical or 180° rotation, SVG vector passthrough, white-background flatten, before/after preview. Zero uploads.",
      whatItDoes: "Runs an Image Studio flip engine. Choose a horizontal flip (the classic heat-transfer mirror), a vertical flip, or a 180° rotation, and check the result in a before/after side-by-side preview before you print. Raster art exports as PNG (lossless), JPEG or WebP with a quality slider and an optional white-background flatten. Uploaded SVGs can pass straight through in vector mode: the file is re-serialised with a mirrored <g transform> so cutting machines and vinyl plotters keep true paths instead of a rasterised PNG. Multiple files can be flipped and downloaded one by one in batch, and a 'flipped sheet' hand-off note lists the mirrored filenames and explains how to feed them into the Iron-on Transfer Sheet Maker.",
      howToUse: [
        "Drop one or more graphics — PNG, JPEG, WebP or SVG — into the upload box (batch works on the whole set).",
        "Pick the flip axis: Horizontal for transfer paper, Vertical, or 180° rotation.",
        "Check the Before / After panels; toggle Flatten onto white background for JPEG export, or leave SVG passthrough on to keep vectors.",
        "Set the export format (PNG, JPEG or WebP) and quality, then press Download flipped for the active file.",
        "Use Download all for a batch, or grab the hand-off note to continue in the Iron-on Transfer Sheet Maker with mirroring already applied."
      ],
      limits: "Flips raster art at original pixel dimensions and rotates SVGs inside their viewBox; it does not perform colour separations or CMYK halftone dot screening for screen-printing. Batch mode downloads files one at a time (allow multiple downloads in your browser). Up to 30 files per session.",
      privacy: "Flips, SVG re-serialisation and canvas export all run in local browser memory. Your apparel designs and logos are never uploaded to any server."
    },
    {
      id: "ironon-sheet",
      icon: "🧲",
      cat: "Print & Craft",
      name: "Iron-on Transfer Sheet Maker",
      keyword: "Iron-on Transfer Sheet Maker",
      desc: "Lay out iron-on transfer designs on US Letter or A4 with one-click mirroring, paper presets, cut lines and 300 DPI PNG or print export.",
      seoDesc: "Make iron-on transfer sheets in your browser: mirror all images by default, light/dark/HTV presets, per-image mirror override, cut-line guides and 300 DPI PNG or print. No uploads.",
      whatItDoes: "Runs a Sheet Studio engine tuned for heat-transfer paper: a live canvas preview built from the exact layout the exports use, with a one-click Mirror all images toggle that is ON by default (the core iron-on requirement) and per-image mirror overrides in the thumbnail strip. Three preset profiles configure the sheet in one step — Light transfer paper (mirror), Dark transfer paper (no mirror) and HTV vinyl (mirror + cut lines) — and cut-line guides draw on every cell in the preview with an option to bake them into the export for scissor or plotter trimming. Choose Letter or A4 paper, margin, gap and 1-6 columns; designs never mirror across cells — each flips in place about its own center. Exports a 300 DPI PNG (150 DPI draft option) or prints with exact @page sizing.",
      howToUse: [
        "Pick a preset profile — Light transfer paper (mirror), Dark transfer paper (no mirror), or HTV vinyl (mirror + cut lines) — or toggle Mirror all images yourself; it starts ON because light transfer paper and HTV are applied face-down.",
        "Drop multiple PNG/JPEG designs into the upload box; thumbnails appear in the strip with a ⇄ badge that cycles each image between automatic, forced-mirrored and never-mirrored.",
        "Choose Letter or A4 paper and set margin, gap and columns (1-6) while watching the live sheet preview and page tabs for multi-page jobs.",
        "Enable cut lines to see dashed guides around every design, and optionally bake them into the exported PNG for trimming.",
        "Download a 300 DPI PNG or press Print — always print at 100% / Actual size, then press face-down so the mirrored artwork reads correctly."
      ],
      limits: "Mirrors each design horizontally in place (no rotation, color separation or CMYK halftone screening). Cut lines are rectangular guides around each cell — irregular artwork silhouettes are not auto-traced. Up to 40 images per session with automatic multi-page flow; print at 100% scale, not 'Fit to page'.",
      privacy: "All mirroring, compositing and PNG export happen in local browser memory using HTML5 Canvas. Your artwork, logos and designs are never uploaded to any server."
    },
    {
      id: "print-layout",
      icon: "🖨️",
      cat: "Print & Craft",
      name: "Print Layout Optimizer",
      keyword: "Print Layout Optimizer",
      desc: "Pack up to 40 photos onto Letter, A4, 4×6 or A3 paper with aspect-aware grids, auto-pack rows, mm borders and a printed-size report.",
      seoDesc: "Fit photos onto Letter, A4, 4×6 or A3 paper in your browser: aspect-aware uniform grids, greedy auto-pack rows, auto-rotate, mm borders with color, 150/300 DPI PNG. Zero uploads.",
      whatItDoes: "Runs a Sheet Studio layout engine with two packing modes: a uniform grid with selectable rows and columns whose cells fill the sheet minus margins (photos fit inside with their aspect ratio preserved and are letterboxed in the border color), and an auto-pack mode that greedily fills rows by aspect ratio at a computed target row height so mixed portrait and landscape shots waste almost nothing. Photos auto-rotate 90° when that fills the cell better. Margins, gaps and per-photo borders are controlled in millimeters with white, black or a custom border color, and the result is reported on screen (e.g. each photo printed at ≈ 102 × 136 mm). Supports Letter, A4, 4×6 and A3 paper, 150 or 300 DPI PNG export, and direct printing with exact @page sizing.",
      howToUse: [
        "Choose your paper (Letter, A4, 4×6 photo paper or A3) and a pack mode: Uniform grid for equal cells, or Auto-pack rows to let the engine fill rows by each photo's aspect ratio.",
        "Add up to 40 photos from the upload box — a progress note tracks loading and extras beyond 40 are skipped.",
        "Set margin, gap and border width in mm, pick white/black/custom border color, and toggle auto-rotate if landscape shots should turn 90° to fill their cell.",
        "Check the live preview, page tabs and the meta line for the resulting physical photo size before you print.",
        "Download a 150 or 300 DPI PNG, or press Print — always print at 100% / Actual size for true dimensions."
      ],
      limits: "Packs rectangular photos only — no freehand collage, diagonal rotation, polygonal cropping or rounded corners. In grid mode all photos share one cell size (varying aspects letterbox differently), while auto-pack mode sizes rows by aspect; up to 40 photos per session, flowing across multiple pages. Print at 100% scale for the reported mm sizes to hold true.",
      privacy: "Your photos are processed entirely in local browser memory with HTML5 Canvas and never leave your device — no server sees your images."
    },
    {
      id: "print-border",
      icon: "📐",
      cat: "Print & Craft",
      name: "Photo Print Border Calculator",
      keyword: "Photo Print Border Calculator",
      desc: "Add a precise mat border for 4×6, 5×7, 8×10, 8×11 or A4 frames at 200/300 DPI — fixed mm or % borders, custom colour and an optional mat keyline.",
      seoDesc: "Add precise print borders and mats to photos in your browser: 4×6, 5×7, 8×10, 8×11, A4 or custom sizes at 200/300 DPI, mm or % borders, crop-to-fill and PNG/JPEG export. No uploads.",
      whatItDoes: "Runs an Image Studio border engine that places your photo onto a real physical target — 4×6, 5×7, 8×10, 8×11, A4 or a custom size in mm or inches — and renders the result at a chosen 200 or 300 DPI, sized to the physical target. In Fit-inside mode the photo is scaled to sit inside the target with a uniform border, so a 4:5 photo prints inside a 5×7 without any edge cropping; in Fit-to-exact-target mode the photo crops to fill the canvas edge to edge. The border width is set in fixed millimetres or as a percentage of the short side, the colour is white, black or a custom pick, and an optional mat effect draws a thin keyline around the photo. A live report shows the output pixels, the physical size and the exact border and printed-photo dimensions, and the result exports as PNG or JPEG.",
      howToUse: [
        "Drop a photo and pick the target print size: 4×6, 5×7, 8×10, 8×11, A4 or Custom (switch the units between mm and inches).",
        "Choose the fitting mode: Fit inside for a uniform border around the whole photo, or Fit to exact target (crop to fill) to fill the canvas edge to edge.",
        "Set the border width in fixed mm or as a % of the short side, and pick white, black or a custom border colour.",
        "Enable the mat effect to add a thin keyline around the photo, and choose the output DPI (200 or 300).",
        "Read the on-screen report to confirm the physical dimensions, then download a PNG or JPEG — print at 100% / actual size for the stated measurements to hold true."
      ],
      limits: "Creates rectangular borders and mats only — no textured or beveled frames, drop shadows or rounded corners. Border percentages are relative to the shorter target side; print at 100% scale for the reported millimetre sizes to be accurate.",
      privacy: "Borders and mats are composited locally with HTML5 Canvas. Your personal photographs are never uploaded or stored on any server."
    },
    {
      id: "cross-stitch",
      icon: "🧵",
      cat: "Print & Craft",
      name: "Cross-Stitch Pattern Maker",
      keyword: "Cross-Stitch Pattern Maker",
      desc: "Turn any photo into a printable cross-stitch chart — 20–200 stitches wide, median-cut colours snapped to a 300-colour DMC floss palette, symbol charts, 10×10 grid lines and a skein shopping list.",
      seoDesc: "Convert photos into printable cross-stitch patterns in your browser: median-cut colour reduction, snap-to-DMC thread matching, symbol charts, 10×10 grid, skein estimates, PNG, CSV and print. No uploads.",
      whatItDoes: "Runs a full Pattern Studio engine. Your image is average-pooled into a stitch grid 20–200 stitches wide (rows follow the aspect ratio), reduced to 2–64 colours with median-cut quantisation, and optionally snapped to a real DMC embroidery floss palette of 300 numbered threads, so every cell carries a genuine floss code and name. Cells can be drawn as flat colour or as a symbol chart (each palette entry gets a stable glyph) over a light cell grid with heavy lines every 10 stitches, and an optional Floyd–Steinberg dithering pass smooths gradients. The legend lists the DMC code, thread name, swatch, chart symbol, stitch count, percentage and an estimated skein count (~1,700 stitches per skein), and the tool reports the finished size on 14-count Aida. Exports a PNG stretched to at least 2,000 px wide with the aspect ratio preserved, a CSV shopping list, and a black-and-white symbol-only print mode.",
      howToUse: [
        "Drop a photo or illustration (PNG, JPEG or WebP) into the upload box — processing stays entirely in your browser.",
        "Set the stitch width (20–200) and maximum colours (2–64); the grid rows follow your image's aspect ratio automatically.",
        "Choose whether to snap colours to the DMC floss palette (recommended for real thread matching) and toggle symbol chart, 10×10 heavy grid lines, dithering or the black-and-white symbol-only print mode.",
        "Check the live preview and legend — every colour shows its DMC code, name, chart symbol, stitch count percentage and estimated skeins, plus the physical size on 14-count Aida.",
        "Download the chart PNG, export the CSV floss shopping list, or press Print for a symbol chart plus legend you can stitch from."
      ],
      limits: "Charts are capped at a 200×200 cell grid (40,000 stitches) so the preview stays responsive; very large or very tall photos are automatically reduced to fit. Colour matches are nearest-neighbour in RGB against the built-in DMC table, which is accurate to typical floss shades but not a lab-grade match to a specific dye lot. Dithering is available for cross-stitch charts only, and the symbol set repeats after 64 colours.",
      privacy: "Photos are decoded and quantised entirely inside your browser with HTML5 Canvas. Your images, family portraits and craft projects are never uploaded to any server."
    },
    {
      id: "diamond-painting",
      icon: "💎",
      cat: "Print & Craft",
      name: "Diamond Painting Pattern Maker",
      keyword: "Diamond Painting Pattern Maker",
      desc: "Generate symbol-coded diamond painting drill charts — round or square drills, DMC drill counts per colour, a cm canvas planner and a CSV kit shopping list.",
      seoDesc: "Make diamond painting charts from photos in your browser: round or square drills with symbol letters, grid every 10 drills, DMC colour codes, a 2.5 mm canvas planner, drill totals and CSV. Zero uploads.",
      whatItDoes: "Uses the same Pattern Studio pipeline as the cross-stitch tool — average-pooled cells, median-cut reduction and snap-to-DMC — but renders every cell as a drill instead of a stitch. Drills are drawn as filled circles (round) or rounded squares with a highlight (square), each optionally stamped with a bold symbol letter, over a grid highlighted every 10 drills to match the standard drill-counting rulers. A canvas-size planner converts a physical width in centimetres to a drill count at the standard 2.5 mm diamond drill pitch and back, so kits can be planned from a real canvas size. The legend reports the DMC code, colour name, swatch, symbol and per-colour drill total, the grand total drill count and estimated skeins, and the physical canvas dimensions. Export the chart as a PNG (≥2,000 px wide), download a CSV kit shopping list mapping DMC codes to drill counts, or print the chart with its legend.",
      howToUse: [
        "Drop your source picture into the upload box — the image never leaves your device.",
        "Pick the drill shape (round or square with highlight), and set the drill width (20–200) and maximum colours (2–64); leave snap-to-DMC on to map drills to real floss codes.",
        "Use the canvas planner to type a canvas width in centimetres and press Plan drills — the engine converts it to a drill count using the ~2.5 mm pitch.",
        "Turn the symbol letter per cell and the grid-every-10-drills guide on or off, and watch the live preview and per-colour drill totals in the legend.",
        "Download the chart PNG, export the CSV shopping list (DMC code → drill count), or print the chart and legend for your work surface."
      ],
      limits: "Charts are capped at a 200×200 drill grid (40,000 drills) with the same automatic reduction for oversized or very tall photos. Drill colour codes follow DMC floss names — proprietary AB drill numbering is not included. The canvas planner assumes the standard 2.5 mm drill pitch; larger or smaller drills change the physical size. This produces a printable chart, not a plotted adhesive canvas or a cutting-machine file.",
      privacy: "Colour reduction, symbol assignment and drill rendering all execute in local browser memory with HTML5 Canvas. Your photos and kit plans are never sent to a remote server."
    },
    {
      id: "embroidery",
      icon: "🪡",
      cat: "Print & Craft",
      name: "Embroidery Pattern Simplifier",
      keyword: "Embroidery Pattern Simplifier",
      desc: "Reduce artwork to a simplified thread palette — median-cut to N colours, optional DMC matching or a pasted custom hex palette, with a side-by-side smooth preview and skein estimates.",
      seoDesc: "Simplify images into embroidery thread palettes in your browser: median-cut colour reduction, optional DMC floss matching, a custom pasted hex palette, smooth simplified export, area percentages and skein estimates. No uploads.",
      whatItDoes: "A dedicated colour-reduction studio rather than a stitch chart. Your image is average-pooled, clustered with median-cut quantisation to any thread count from 2 to 64, and either left as exact clustered colours or snapped to the shared DMC floss palette. You can also paste your own hex palette (one colour per line) to match non-DMC threads — ideal for planning from a specific thread set or a fabric swatch. The preview shows the original photograph beside a smooth, non-gridded simplified render so you can judge the reduction before committing, and the legend lists every thread's code or hex, name, swatch, share of the design as a percentage and an estimated skein count (~1,700 stitches per skein). Export a smooth simplified reference image (≥2,000 px wide), a stitched grid chart PNG, or a CSV palette report with hex, DMC code/name, count, percentage and skeins.",
      howToUse: [
        "Drag and drop the illustration or photo you want to reduce onto the upload box.",
        "Set the thread count with the Max colours slider (2–64) — median-cut clustering does the colour reduction.",
        "Leave Snap to DMC on for real floss codes, or paste your own hex list into the custom palette box and press Apply custom palette to match other threads.",
        "Compare the original and the smooth simplified preview side by side, and read the per-colour area percentages and estimated skeins in the legend.",
        "Export the smooth simplified PNG for reference, a grid chart PNG for stitching, or the CSV palette report for your floss shopping list."
      ],
      limits: "Designed for hand-embroidery colour planning and floss selection; it does not generate machine-embroidery files such as DST, PES or JEF, and it does not auto-trace stitch direction or shading. Custom palettes accept up to 64 hex colours. Reduction is capped at the same 200×200 cell grid as the other pattern tools, and median-cut produces representative colours rather than a perfectly perceptually uniform palette.",
      privacy: "All clustering, matching and export run locally in your browser via HTML5 Canvas. Your original artwork, textile concepts and photographs stay on your device."
    },
    {
      id: "video-safe-zone",
      icon: "📱",
      cat: "Audio & Video",
      name: "Video Safe-Zone Checker",
      keyword: "Video Safe-Zone Checker",
      desc: "Preview TikTok, Instagram Reels, and YouTube Shorts UI overlays to avoid cropped text.",
      seoDesc: "Preview TikTok, Reels, and Shorts safe zones in your browser. Check video text overlays against social media UI with zero file uploads.",
      whatItDoes: "Overlays precise 9:16 vertical safe zone boundaries for TikTok, Instagram Reels, and YouTube Shorts over your videos or frame grabs. Highlights critical obstruction zones where usernames, engagement action buttons (likes, shares, comments), audio discs, and captions cover screen content.",
      howToUse: [
        "Select your target social media platform (TikTok UI, Instagram Reels, or YouTube Shorts).",
        "Upload a short-form video clip (MP4, WebM, or MOV) or a static 9:16 frame export.",
        "Examine the red overlay guide showing where platform interface elements will appear.",
        "Download the overlaid guide image to adjust title placement and subtitle positioning in your video editor."
      ],
      limits: "Extracts and evaluates representative video frames for UI alignment. Does not re-render, compress, or re-encode full multi-minute video streams.",
      privacy: "Video frames are extracted locally using HTML5 Video elements and Canvas. Video files never travel across the network to external servers."
    },
    {
      id: "video-thumbnails",
      icon: "🎞️",
      cat: "Audio & Video",
      name: "Video Thumbnail Contact Sheet",
      keyword: "Video Thumbnail Contact Sheet",
      desc: "Extract 4–48 timestamped frames into a configurable PNG/JPEG contact sheet.",
      seoDesc: "Build video contact sheets with 4–48 timestamped frames, custom grid columns and resolution in your browser. Export PNG/JPEG plus a CSV of sampled times, with zero uploads.",
      whatItDoes: "Scans a local video file and extracts between 4 and 48 evenly spaced frames into a contact sheet whose grid columns, per-thumbnail resolution, padding and background colour you control. Every frame is stamped with a burned-in MM:SS.mmm timestamp and frame index so scenes can be located precisely, and each seek is raced against a timeout with an automatic previous-frame fallback, so an unresponsive codec never hangs the sheet. Export the sheet as PNG or JPEG (with quality control) and download a CSV of the sampled timestamps.",
      howToUse: [
        "Drop an MP4, WebM or MOV video into the extractor, or click Add file and pick one.",
        "Choose the frame count (4–48), grid columns, thumbnail width, padding, background colour and whether to burn timestamp labels.",
        "Watch the progress bar as the browser seeks through the timeline, then inspect the assembled contact sheet on screen.",
        "Download the sheet as PNG or JPEG, or grab the CSV of sampled timestamps for editing notes."
      ],
      limits: "Requires browser-supported codecs (H.264, VP8, VP9, AV1). High-bitrate ProRes, DNxHD, raw AVI, HEVC-in-MKV and DRM-protected files cannot be decoded. Seeks that time out after 8 seconds fall back to the previous frame and are reported as warnings.",
      privacy: "Video decoding, seeking and frame rendering occur entirely through local browser hardware acceleration. Zero bytes of your video footage are sent to any server."
    },
    {
      id: "audio-chapters",
      icon: "🎧",
      cat: "Audio & Video",
      name: "Chapter Timestamp Formatter",
      keyword: "Chapter Timestamp Formatter",
      desc: "Format YouTube & podcast chapter timestamps with clean text export.",
      seoDesc: "Format YouTube and podcast chapter timestamps in your browser. Clean and standardize video show notes with total privacy and zero uploads.",
      whatItDoes: "Validates, cleans, and standardizes podcast and YouTube video chapter markers. Ensures timestamps are sorted chronologically, correctly padded (MM:SS or HH:MM:SS), separated by valid delimiters, and compliant with platform chapter guidelines.",
      howToUse: [
        "Paste your raw timestamp notes and chapter titles into the multiline text input box.",
        "Verify the syntax to ensure the first chapter begins precisely at 00:00 as required by platforms.",
        "Click the Download Chapters button to receive a formatted chapters.txt file.",
        "Paste the cleaned output directly into your YouTube description, Spotify show notes, or podcast RSS feed."
      ],
      limits: "Formats and validates plain text timecode strings. Does not embed ID3v2 chapter frames directly into binary MP3 or M4A audio containers.",
      privacy: "Text formatting is executed in local browser JavaScript. Your unreleased episode titles and show notes remain 100% private on your device."
    },
    {
      id: "silence-map",
      icon: "🔇",
      cat: "Audio & Video",
      name: "Podcast Silence Map",
      keyword: "Podcast Silence Map",
      desc: "Detect dead air with a dBFS threshold slider, waveform view and CSV/TXT gap export.",
      seoDesc: "Find dead air in your browser with a dBFS threshold slider, window and channel controls. Waveform view, click-to-preview gaps, CSV/TXT export, zero uploads.",
      whatItDoes: "Decodes an audio track locally and scans its energy window-by-window to map every silence gap longer than a length you choose. Set the silence threshold as a dBFS slider (converted to amplitude), the analysis window size, the minimum gap length and the channel mode (left, right, mono mix or max-of-channels). The peak-envelope waveform shades each detected gap, and clicking a gap preview-plays just that stretch through an embedded player. Reports file duration, total silence, percentage silence and gap count, listing every gap as HH:MM:SS.mmm — including recordings longer than an hour.",
      howToUse: [
        "Drop a podcast audio track (WAV, MP3, AAC or OGG) into the silence detector.",
        "Set the silence threshold in dBFS, the window size, the minimum gap length and the channel mode for your recording.",
        "Review the shaded waveform and the gap table, and click any row to preview-play that stretch of audio.",
        "Download the gaps as CSV (Start, End, Duration) or a plain-text list, or copy the list to the clipboard."
      ],
      limits: "Decodes audio into browser RAM; extremely large audio files (>200 MB) may hit memory limits on constrained devices. Undecodable codecs (for example DRM-protected M4A, unsupported FLAC builds or raw AC-3) show codec guidance instead of results — convert to WAV or standard MP3 and retry.",
      privacy: "Audio decoding, waveform inspection, and silence mapping execute entirely on your local CPU. Unreleased audio files never leave your computer."
    },
    {
      id: "subtitle-speed",
      icon: "💬",
      cat: "Text & Subtitles",
      name: "Subtitle Reading-Speed Checker",
      keyword: "Subtitle Reading-Speed Checker",
      desc: "Audit SRT subtitles for reading speed (CPS), duration, line length and overlaps against Netflix, BBC or custom limits.",
      seoDesc: "Audit SRT subtitle reading speed in your browser. Detect high CPS lines, short durations, long lines and timecode overlaps locally with zero uploads.",
      whatItDoes: "Audits SubRip (.srt) subtitle files against broadcast reading-speed standards. Choose the Netflix profile (21 CPS, 1s minimum, 42 characters), the BBC profile (about 180 words per minute, 16-20 CPS), or a custom profile with your own CPS, minimum-duration and line-length limits. The engine strips styling tags before measuring, reports raw and clean character counts, and flags excessive CPS, short or zero-duration cues, overlong lines and overlapping timecodes (naming the neighbouring cue and the clashing range). It shows totals, flagged counts, an average CPS and the longest cue, and exports a CSV report or an annotated .issues.srt review copy.",
      howToUse: [
        "Upload your SubRip (.srt) subtitle caption file, or click Load sample to see the checker in action.",
        "Pick a reading-speed profile (Netflix, BBC or Custom) and tweak the CPS, minimum duration and character limits if you need to.",
        "Review the stats summary and the issue table, where each flagged cue lists its type, raw/clean character counts and details such as the overlapping neighbour and time range.",
        "Download the CSV report for a spreadsheet, the annotated .issues.srt for review, or click Fix line breaks to send the text straight to the line-break fixer."
      ],
      limits: "Audits SubRip SRT subtitle files. Does not directly extract proprietary binary subtitle streams embedded in container formats like MKV or MP4.",
      privacy: "Subtitle files are parsed purely within client-side memory. Confidential movie scripts, documentary translations, and transcripts remain strictly private."
    },
    {
      id: "subtitle-linefix",
      icon: "📝",
      cat: "Text & Subtitles",
      name: "Subtitle Line-Break Fixer",
      keyword: "Subtitle Line-Break Fixer",
      desc: "Rebalance and rewrap long SRT subtitle lines to your chosen characters-per-line and line-count limits.",
      seoDesc: "Rebalance long SRT subtitle lines in your browser. Two-pass rewrap to your character-per-line limit, with tag preservation and zero data uploads.",
      whatItDoes: "Rebalances and rewraps overlong SRT subtitle lines with a two-pass algorithm: it first splits at the clause punctuation nearest the midpoint for a natural break, then greedily wraps the remaining words to your character-per-line limit. Tokens that exceed the limit on their own are hard-cut, and inline styling tags such as <i> and {\\an8} are preserved as anchored spans so formatting survives the rewrap. Adjust the maximum characters per line (20-60), the maximum number of lines (1-3) and tag preservation, then compare a diff-style before/after preview with a changed-cue count. Timecodes are never touched, and you can download the fixed .srt or send it back to the speed checker.",
      howToUse: [
        "Drop your wide or single-line .srt subtitle file into the line-break fixer, or click Load sample.",
        "Set the maximum characters per line, the maximum number of lines and whether to preserve inline tags.",
        "Review the diff-style preview, which shows the changed-cue count and the before/after line breaks for each affected cue.",
        "Download the fixed .srt subtitle file, or click Send to speed checker to audit the repaired file for reading speed."
      ],
      limits: "Rewraps SubRip SRT subtitle text only. It does not alter timecodes, merge or split cues, or translate subtitle language.",
      privacy: "Subtitle files are parsed purely within client-side memory. Confidential movie scripts, documentary translations, and transcripts remain strictly private."
    },
    {
      id: "contact-dedupe",
      icon: "👥",
      cat: "Data",
      name: "Contact CSV Deduplicator",
      keyword: "Contact CSV Deduplicator",
      desc: "Merge and clean duplicate CRM contacts using email and international phone numbers.",
      seoDesc: "Deduplicate contact CSV files in your browser. Merge duplicate CRM records using email and normalized phone numbers with zero data uploads.",
      whatItDoes: "Identifies and removes duplicate customer or contact rows in CSV exports by normalizing email casing and stripping non-digit phone formatting. Preserves the first primary contact record while cleaning up duplicate entries caused by multiple marketing imports or CRM merges.",
      howToUse: [
        "Drop your CRM or address book CSV file into the contact deduplicator drop area.",
        "The tool automatically detects email and phone number columns across your dataset.",
        "Review the summary displaying total unique contacts preserved and duplicate rows removed.",
        "Download the cleaned, deduplicated CSV file ready for CRM import or email marketing."
      ],
      limits: "Matches records using normalized email strings and cleaned phone digits. Does not perform fuzzy phonetic name matching or nickname deduplication.",
      privacy: "Customer names, phone numbers, and emails are processed solely in local browser memory. Zero risk of CRM data leaks or privacy violations."
    },
    {
      id: "csv-splitter",
      icon: "↔️",
      cat: "Data",
      name: "CSV Column Splitter",
      keyword: "CSV Column Splitter",
      desc: "Split names, addresses, or delimited data in CSV spreadsheets without Excel.",
      seoDesc: "Split CSV columns in your browser without Excel. Separate full names and addresses into distinct columns locally with zero server uploads.",
      whatItDoes: "Splits combined spreadsheet columns (such as 'First Last' names, 'City, State, Zip' addresses, or compound product SKUs) into distinct separate columns based on spaces, commas, or custom delimiters without needing Microsoft Excel or complex spreadsheet formulas.",
      howToUse: [
        "Upload any standard CSV spreadsheet file from your local computer.",
        "Choose the specific column index containing the combined text you need to divide.",
        "Specify the delimiter character to split on (defaults to a single space character).",
        "Click the Split Column button and download your restructured, multi-column CSV file."
      ],
      limits: "Handles RFC 4180 compliant CSV files with quoted strings. Extremely large datasets (>50MB) may take several seconds to parse in browser memory.",
      privacy: "Spreadsheet records are parsed client-side with pure JavaScript. No sensitive financial records or corporate spreadsheets are transmitted online."
    },
    {
      id: "csv-date",
      icon: "📆",
      cat: "Data",
      name: "CSV Date Normalizer",
      keyword: "CSV Date Normalizer",
      desc: "Standardize mixed dates into US (MM/DD/YYYY), ISO (YYYY-MM-DD), or European formats.",
      seoDesc: "Standardize mixed date formats in CSV files in your browser. Convert dates to ISO YYYY-MM-DD or DD/MM/YYYY with zero server uploads.",
      whatItDoes: "Scans mixed-format date columns across spreadsheet rows and converts every value into a uniform target convention: ISO (YYYY-MM-DD), US (MM/DD/YYYY), or European (DD/MM/YYYY). Fixes inconsistent formatting resulting from disparate database exports or international data collection.",
      howToUse: [
        "Upload a CSV spreadsheet containing dates written in varying or inconsistent formats.",
        "Select the column index containing date information from your table header.",
        "Choose your target date format standard from the dropdown selection menu.",
        "Click Normalize Dates and download your standardized, clean CSV spreadsheet."
      ],
      limits: "Parses ISO, US, and European formatted date strings. Ambiguous numeric dates (such as 02/03/2024) are parsed adhering to standard convention rules.",
      privacy: "Data transformation happens strictly inside your local browser instance. No database records or customer logs are uploaded."
    },
    {
      id: "vcard",
      icon: "📇",
      cat: "Data",
      name: "vCard (VCF) Split & Merge",
      keyword: "vCard VCF Split and Merge",
      desc: "Merge multiple .vcf contact cards or inspect contact files privately.",
      seoDesc: "Split and merge vCard VCF contact files in your browser. Unfold RFC 6350 lines and inspect digital business cards with zero data uploads.",
      whatItDoes: "Parses RFC 6350 vCard files, handles multi-line folded fields, and enables users to inspect individual contact cards or combine multiple .vcf files into one master archive. Facilitates seamless contact migration across Android, Apple iOS, Microsoft Outlook, and Google Contacts.",
      howToUse: [
        "Select one or multiple .vcf contact cards from your device storage.",
        "The parser unfolds continuation lines and displays all detected contact records.",
        "Download individual .vcf cards or export a single combined master .vcf file.",
        "Import the resulting clean contact file into Apple Contacts, Outlook, or Google Contacts."
      ],
      limits: "Supports vCard versions 2.1, 3.0, and 4.0 text structures. Embedded base64 contact photos are preserved but not previewed as visual thumbnails.",
      privacy: "Your private address book and personal contact cards remain strictly on your machine. Client-side parsing ensures total privacy."
    },
    {
      id: "bookmark-cleaner",
      icon: "🔖",
      cat: "Files",
      name: "Chrome Bookmark Cleaner",
      keyword: "Chrome Bookmark Cleaner",
      desc: "Remove duplicate bookmarks, dead links, and empty folders from exported bookmarks.html.",
      seoDesc: "Clean and deduplicate browser bookmark HTML files in your browser. Remove duplicate URLs from Chrome and Firefox exports with zero uploads.",
      whatItDoes: "Parses exported Netscape Bookmark HTML files from Chrome, Firefox, Safari, or Edge, and strips duplicate URLs while maintaining folder structure integrity. Sanitizes messy bookmark collections to reduce clutter and speed up bookmark searches across desktop browsers.",
      howToUse: [
        "Export your browser bookmarks as an HTML file from Chrome or Firefox bookmark manager.",
        "Drop the exported bookmarks.html file into the cleaner drop zone.",
        "The parser scans links and removes duplicate URL entries while preserving folder hierarchies.",
        "Download your cleaned bookmarks.html file and import it back into your browser."
      ],
      limits: "Deduplicates by matching exact canonical URL strings. Does not check remote network connectivity for HTTP 404 broken links.",
      privacy: "Your browsing history and saved bookmarks are sensitive. All parsing is executed in local browser memory with zero external network requests."
    },
    {
      id: "bookmark-reading",
      icon: "📚",
      cat: "Files",
      name: "Bookmark → Reading List",
      keyword: "Bookmark to Reading List",
      desc: "Convert messy browser bookmark HTML files into a distraction-free offline reading list.",
      seoDesc: "Convert browser bookmark HTML exports into clean offline reading lists in your browser. Filter out dangerous URIs with zero server uploads.",
      whatItDoes: "Extracts valid HTTP and HTTPS links from complex bookmark exports and compiles them into a clean, minimalist, offline HTML reading list document. Filters out dangerous URI schemes and excessive nested folder tags, creating an uncluttered reading dashboard for long-form articles.",
      howToUse: [
        "Upload your browser's exported bookmarks.html file into the reading list converter.",
        "The tool sanitizes entries, automatically filtering out javascript: and data: URIs.",
        "Preview the clean list of saved articles and reading links rendered on screen.",
        "Download the standalone reading-list.html document for distraction-free offline reading."
      ],
      limits: "Filters out internal browser schemes (javascript:, data:, chrome:, file:). Does not scrape or archive the full offline text content of linked web pages.",
      privacy: "Your saved articles and reading links never leave your browser sandbox. Complete privacy and local offline storage guaranteed."
    },
    {
      id: "svg-cleaner",
      icon: "✦",
      cat: "Files",
      name: "SVG Cleanup & Minifier",
      keyword: "SVG Cleanup and Minifier",
      desc: "Strip Illustrator, Inkscape metadata, and comments to shrink SVG file sizes.",
      seoDesc: "Clean and sanitize SVG vector files in your browser. Strip Inkscape metadata, scripts, and comments to shrink file size with zero uploads.",
      whatItDoes: "Sanitizes and shrinks SVG vector graphics by recursively removing XML comments, Adobe Illustrator and Inkscape editor metadata namespaces, script tags, foreignObjects, and inline event handlers. Reduces SVG file size while eliminating potential cross-site scripting (XSS) vectors.",
      howToUse: [
        "Drop any vector .svg graphic file into the sanitizer interface.",
        "The parser strips non-standard namespaces, editor comments, and dangerous script tags.",
        "Review the notification displaying file sanitization details.",
        "Download the lightweight, secure, and production-ready SVG vector file."
      ],
      limits: "Optimizes XML document structure and removes security risks. Does not perform lossy coordinate rounding, curve approximation, or visual vector path simplification.",
      privacy: "Sanitization occurs entirely in browser memory using DOMParser. Vector illustrations and proprietary branding graphics are never uploaded to third parties."
    },
    {
      id: "calendar-cleaner",
      icon: "📅",
      cat: "Productivity",
      name: "iCal Calendar Deduplicator",
      keyword: "iCal Calendar Deduplicator",
      desc: "Scan .ics calendar exports for duplicate VEVENT entries and export clean calendars.",
      seoDesc: "Deduplicate iCal ICS calendar files in your browser. Remove duplicate VEVENT calendar entries from Outlook and Google exports with zero uploads.",
      whatItDoes: "Parses iCalendar (.ics) export files, detects duplicate VEVENT calendar blocks sharing identical summary, timestamp, and recurrence properties, and exports a streamlined calendar file. Eliminates annoying duplicated calendar alerts across desktop and mobile devices.",
      howToUse: [
        "Export your calendar from Google Calendar, Microsoft Outlook, or Apple Calendar as an .ics file.",
        "Drop the .ics file into the calendar deduplicator tool interface.",
        "The tool parses calendar entries, identifies duplicate event blocks, and removes duplicates.",
        "Download the cleaned .ics file and re-import it into your calendar application."
      ],
      limits: "Deduplicates based on normalized VEVENT string properties. Does not automatically resolve conflicting event time modifications or update remote CalDAV servers.",
      privacy: "Your personal and professional appointment schedules are kept strictly private on your computer. Zero calendar data is transmitted across the internet."
    },
    {
      id: "timetable-calendar",
      icon: "🗓️",
      cat: "Productivity",
      name: "Timetable → Calendar (.ics)",
      keyword: "Timetable to Calendar Converter",
      desc: "Convert school or work class timetable CSVs into recurring weekly iCal events.",
      seoDesc: "Convert timetable CSV spreadsheets into iCal calendar files in your browser. Create recurring weekly class events with zero data uploads.",
      whatItDoes: "Converts class schedules, university lectures, and work shift timetables from simple CSV spreadsheets into recurring weekly iCal (.ics) calendar events. Generates RFC 5545 compliant recurring VEVENT entries with proper time zone formatting and recurrence rules.",
      howToUse: [
        "Create a CSV with columns: day, start, end, title (e.g., Monday, 09:00, 10:30, Mathematics Lecture).",
        "Upload the CSV schedule file into the timetable converter interface.",
        "Review the number of recurring calendar events generated by the parser.",
        "Download timetable.ics and import it directly into Google Calendar, Apple Calendar, or Outlook."
      ],
      limits: "Generates recurring weekly events for a standard 16-week term. Custom bi-weekly alternating schedules require separate CSV exports.",
      privacy: "Student schedules and employee shift CSVs are parsed locally in browser memory with zero cloud transmission."
    },
    {
      id: "wallpaper",
      icon: "🖼️",
      cat: "Images",
      name: "Wallpaper Photo Cropper",
      keyword: "Wallpaper Photo Cropper",
      desc: "Crop photos to exact phone, tablet and desktop wallpapers — device presets, custom ratio and pixels, a draggable focal crop box, cover-crop or blur padding, PNG/JPEG/WebP export.",
      seoDesc: "Crop photos to phone wallpaper sizes in your browser: iPhone 1170×2532, Android 1080×2400, 16:9 desktop or a custom ratio and pixel size, a draggable focal point, blur padding, batch PNG/JPEG/WebP. Zero uploads.",
      whatItDoes: "Runs an Image Studio wallpaper engine that crops a photo to an exact screen aspect and pixel size. Choose a device preset (iPhone 1170×2532 and 1290×2796, Android 1080×2400, 16:9 desktop 1920×1080, 9:16 social, 4:3 tablet or 19.5:9 wide), or enter a custom ratio and custom output pixels. A crop box overlays the preview and you drag it to set the focal point, so the important part of the shot — a face, a landmark — stays in frame instead of being blindly centre-cropped. In Cover-crop mode the photo fills the output edge to edge with no distortion; in Blur-padding mode the crop is fitted and the leftover space is filled with a blurred, darkened copy of the image so nothing is cut off. Everything exports as PNG, JPEG or WebP with a quality slider, one photo at a time or as a batch with a shared ratio.",
      howToUse: [
        "Drop one or more photos (PNG, JPEG, WebP) into the upload box — batch works on the whole set with the same ratio.",
        "Pick a device / ratio preset, or choose Custom ratio and type the custom pixels for an exact wallpaper size.",
        "Drag the crop box on the preview to set the focal point so the subject stays centred; press Reset focal point to recentre.",
        "Choose Cover crop to fill the frame, or Blur padding to fit the whole photo with a softened background — no crop loss.",
        "Set the format and quality, then Download for the active photo or Download all for the batch; set the saved file as your wallpaper."
      ],
      limits: "Processes common raster photos (PNG, JPEG, WebP) up to 30 files per session and does not render animated live wallpapers. Blur padding relies on the browser's canvas blur filter, so the padding look varies slightly between browsers.",
      privacy: "Cropping, blur padding and canvas rendering happen entirely in local browser memory. Your personal photos remain 100% private."
    },
    {
      id: "panorama",
      icon: "🌄",
      cat: "Images",
      name: "Panorama Carousel Splitter",
      keyword: "Panorama Carousel Splitter",
      desc: "Seamlessly slice wide panoramic photos into 3 seamless square Instagram carousel tiles.",
      seoDesc: "Split panoramic photos into seamless Instagram carousel tiles in your browser. Slice wide landscape shots into 3 squares with zero uploads.",
      whatItDoes: "Splits ultra-wide panoramic photographs into 3 mathematically seamless square image tiles. Enables photographers and travelers to publish swipeable multi-slide panoramic carousels on Instagram and social feeds without ugly compression or letterboxing.",
      howToUse: [
        "Drag and drop an ultra-wide panoramic landscape photo file into the splitter.",
        "The splitter segments the image width into 3 mathematically seamless adjacent square tiles.",
        "Inspect the 3 carousel tiles rendered side-by-side in the preview pane.",
        "Click each tile to download the individual high-resolution square PNG image files."
      ],
      limits: "Slices images into 3 equal square segments. Requires wide landscape images with aspect ratio of at least 3:1 for optimal square proportions.",
      privacy: "Image slicing executes locally in Canvas memory. Your original landscape and vacation photos are never uploaded to any cloud server."
    },
    {
      id: "duplicate-finder",
      icon: "♻️",
      cat: "Images",
      name: "Photo Duplicate Finder",
      keyword: "Photo Duplicate Finder",
      desc: "Find exact and near-duplicate photos by hash, with a keep recommendation.",
      seoDesc: "Find duplicate and near-duplicate photos by SHA-256 and perceptual hash in your browser. Export a CSV or HTML cleanup report with zero uploads.",
      whatItDoes: "Groups selected files into exact byte-duplicates (size + SHA-256, hashed in a Web Worker) and perceptual near-duplicates (aHash/dHash Hamming distance with a sensitivity slider and similarity percentage). Per-group thumbnail strips carry group id, size, date and hash columns with checkboxes to select copies, and the recommended keeper (oldest date, then shortest name) is pre-marked. Any file type is accepted.",
      howToUse: [
        "Select multiple files, or drop an entire folder — every file type is accepted, not just images.",
        "Exact duplicates are grouped by byte size then SHA-256 hashed; images also get aHash/dHash perceptual hashes.",
        "Review each thumbnail group, tick the copies to remove, or use Keep recommended to keep the oldest copy.",
        "Export the cleanup report as CSV (Group,File,Size,Date,Hash,Distance) or as a standalone HTML report."
      ],
      limits: "Exact dedupe uses SHA-256 (needs https or localhost). Perceptual hashing catches resized and recompressed copies, but heavy edits or crops may fall outside the similarity threshold.",
      privacy: "Hashing and thumbnailing run entirely in your browser with Web Crypto and Canvas. Your files are never uploaded to any server."
    },
    {
      id: "best-shot",
      icon: "✨",
      cat: "Images",
      name: "Photo Best-Shot Finder",
      keyword: "Photo Best-Shot Finder",
      desc: "Rank burst photos by Laplacian sharpness, exposure and contrast.",
      seoDesc: "Rank burst photos by sharpness, exposure and contrast in your browser. Export a ranked CSV of the best shot locally with zero uploads.",
      whatItDoes: "Scores every photo with variance-of-Laplacian sharpness on an aspect-preserving 256 px downsample (letterboxed, never stretched), plus an exposure/clipping penalty and a contrast term. Blends them into a 0-100 composite score with adjustable weights and shows the sharpness/exposure/contrast breakdown per photo, a full ranked list with load-more, and a side-by-side compare of the top shots.",
      howToUse: [
        "Select a batch of burst photos taken in similar lighting from your camera roll.",
        "Each image is downsampled to 256 px, then a 3x3 Laplacian kernel measures sharpness while exposure and contrast are scored.",
        "Inspect the ranked list, per-photo breakdown and compare view, and adjust the weighting sliders to taste.",
        "Export the ranking as CSV or copy the winning filename to keep the crispest frame."
      ],
      limits: "Edge-based sharpness and exposure heuristics only — artistic composition and facial expressions are not judged. Unsupported files are skipped and reported instead of stopping the batch.",
      privacy: "Pixel data is analyzed inside local Canvas memory buffers without external API calls or machine learning cloud server uploads."
    },
    {
      id: "photo-timeline",
      icon: "🕒",
      cat: "Images",
      name: "Photo Timeline Builder",
      keyword: "Photo Timeline Builder",
      desc: "Build a chronological photo album with EXIF dates and embedded thumbnails in one HTML file.",
      seoDesc: "Build a chronological photo album from EXIF dates with embedded thumbnails in your browser. Export one self-contained offline photo-timeline.html with zero uploads.",
      whatItDoes: "Reads EXIF DateTimeOriginal (falling back to the file date), downscales every photo to an embedded data-URL thumbnail (default 400 px longest side), and groups the set by day with sticky headings and per-group counts (automatically switching to month or year groups for large sets). You get a click-to-open full-resolution lightbox, a per-file date-correction field with an EXIF / file / manual confidence badge, a total output-size report, and a single self-contained photo-timeline.html with lazy-loaded images and the original filenames as captions.",
      howToUse: [
        "Drop a folder or batch of photo files from a family event, wedding, or holiday.",
        "Each JPEG's EXIF DateTimeOriginal is read first; files without EXIF fall back to the file date and are flagged for correction.",
        "Review the day/month groups, click any thumbnail to open the full-resolution original, and fix any wrong dates inline.",
        "Check the embedded album-size report, add an album title, and download the standalone photo-timeline.html photo diary."
      ],
      limits: "Photo dating prefers EXIF DateTimeOriginal then the file date; EXIF GPS, lens model and facial tags are not read. Thumbnails are re-encoded client-side as JPEG data URLs, so very large sets produce a large single file.",
      privacy: "Album generation runs entirely in client-side JavaScript. Your personal photo libraries and event memories remain completely confidential."
    },
    {
      id: "family-organizer",
      icon: "🗂️",
      cat: "Images",
      name: "Family Photo Date Organizer",
      keyword: "Family Photo Date Organizer",
      desc: "Organize family photos into a year-to-month-to-day tree and export a rename plan.",
      seoDesc: "Organize family photos into a year, month and day tree with EXIF dating in your browser. Export an HTML archive index and a planned folder-rename CSV/JSON with zero uploads.",
      whatItDoes: "Builds a collapsible year → month → day summary tree with per-group counts and a thumbnail contact strip per group, then previews a proposed folder structure from an editable rename pattern (default YYYY/MM/YYYY-MM-DD_title.ext) as a live old-name → new-path table. Dates prefer EXIF DateTimeOriginal, wrong timestamps can be corrected per file or in bulk per group, and every entry carries a date-confidence badge. Since browsers cannot move files on disk, it exports a self-contained family-organizer.html archive index plus a planned-folder CSV and JSON mapping (original → proposed path).",
      howToUse: [
        "Select multiple family photos (and any other files) from your hard drive or camera backup.",
        "Photos are dated from EXIF DateTimeOriginal first, then the file date; non-image files still appear in the tree without a thumbnail.",
        "Inspect the year → month → day tree, fix wrong dates per file or in bulk per group, and tune the rename pattern to watch the proposed paths update live.",
        "Download family-organizer.html plus the planned-folder CSV or JSON, then apply the rename plan with your own file manager."
      ],
      limits: "Organizes and renames by date but never rewrites EXIF header tags or moves files on disk — it exports an HTML index and a rename plan instead. Thumbnails require browser-decodable image formats.",
      privacy: "All photo analysis and document compilation occur inside your local browser sandbox. No family pictures are ever uploaded to external servers."
    }
  ];

  return {
    PARENT_BRAND: PARENT_BRAND,
    PARENT_URL: PARENT_URL,
    SITE_NAME: SITE_NAME,
    SITE_SHORT: SITE_SHORT,
    SITE_URL: SITE_URL,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    TAGLINE: TAGLINE,
    LOCALE: LOCALE,
    TOOLS: TOOLS
  };
});
