/*
 * image-tools.config.js - typed registry for Bench Image Toolkit.
 *
 * UMD module: browser (window.ImageToolConfig) and Node.js (require).
 * The build script generates /image/<slug>/ pages from this list; app.js and
 * image-toolkit.js consume the same objects at runtime. A tool is never listed
 * as "implemented" unless image-toolkit.js exports a processor with the same
 * handler id (enforced by test/image-toolkit.test.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ImageToolConfig = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SITE_URL = "https://bench.progeni.live";
  const SITE_NAME = "Progeni Bench";

  const LIMITS = {
    maxFileBytes: 50 * 1024 * 1024,
    maxPixels: 40 * 1000 * 1000,
    maxDimension: 12000,
    maxFiles: 30,
    maxBatchPixels: 160 * 1000 * 1000,
    maxPdfPages: 40,
    concurrency: 2
  };

  const CATEGORIES = [
    { id: "compress", name: "Compress & Optimize", blurb: "Smaller files without guesswork." },
    { id: "resize", name: "Resize & Prepare", blurb: "Exact dimensions, ratios and application presets." },
    { id: "convert", name: "Convert", blurb: "Change format, PDF, data URI and vector rasterisation." },
    { id: "edit", name: "Edit & Design", blurb: "Crop, colour, annotations, collage and composition." },
    { id: "documents", name: "Documents & Scan", blurb: "Clean scans and document workflows." },
    { id: "metadata", name: "Metadata & Privacy", blurb: "Inspect, strip, hash and compare." },
    { id: "create", name: "Create & Developer", blurb: "Icons, social cards, QR, SVG and srcset." },
    { id: "animation", name: "Animation & Batch", blurb: "GIF, sprite sheets and bulk exports." },
    { id: "diagnostics", name: "Diagnostics", blurb: "Understand why an image fails." },
    { id: "ai", name: "AI Processing", blurb: "Provider-based features that are not configured yet." }
  ];

  /* ------------------------------------------------------------------ options */
  /* Option fields are rendered by the shared UI. showIf is evaluated against
     the current form values, so dependent controls only appear when relevant. */

  const BACKGROUND = {
    key: "background", label: "Background colour (JPG / flatten transparency)",
    type: "color", value: "#ffffff",
    help: "Used when the output format cannot store transparency."
  };

  const FORMAT_OUT = {
    key: "format", label: "Output format",
    type: "select", value: "auto",
    options: [
      { value: "auto", label: "Keep source (recommended)" },
      { value: "jpeg", label: "JPEG (.jpg)" },
      { value: "png", label: "PNG (.png)" },
      { value: "webp", label: "WebP (.webp)" },
      { value: "avif", label: "AVIF (where the browser supports it)" },
      { value: "bmp", label: "BMP (.bmp)" },
      { value: "tiff", label: "TIFF (.tiff)" }
    ]
  };

  const QUALITY = {
    key: "quality", label: "Quality",
    type: "range", min: 20, max: 100, step: 1, value: 82,
    help: "Ignored for PNG. Lower values make smaller JPEG/WebP/AVIF files."
  };

  const RESIZE_LOCK = {
    key: "lockAspect", label: "Lock aspect ratio",
    type: "checkbox", value: true
  };

  const COMPRESS_OPTIONS = [
    FORMAT_OUT, QUALITY,
    { key: "maxWidth", label: "Maximum width (0 = keep original)", type: "number", min: 0, max: 12000, step: 1, value: 0 },
    BACKGROUND
  ];

  const TARGET_OPTIONS = [
    { key: "targetKb", label: "Target file size (KB)", type: "number", min: 5, max: 10240, step: 1, value: 100,
      help: "The encoder searches quality first, then reduces dimensions if you allow it." },
    { key: "format", label: "Output format", type: "select", value: "jpeg",
      options: [
        { value: "jpeg", label: "JPEG (.jpg)" },
        { value: "webp", label: "WebP (.webp)" },
        { value: "avif", label: "AVIF (where supported)" },
        { value: "png", label: "PNG (.png) - lossless, size cannot be tuned" }
      ] },
    { key: "allowResize", label: "Allow downscaling to reach the target", type: "checkbox", value: true },
    { key: "minQuality", label: "Minimum quality before stopping", type: "range", min: 20, max: 90, step: 1, value: 40 },
    BACKGROUND
  ];

  const RESIZE_OPTIONS = [
    { key: "mode", label: "Resize by", type: "select", value: "pixels",
      options: [
        { value: "pixels", label: "Pixels" },
        { value: "percent", label: "Percentage" }
      ] },
    { key: "width", label: "Width (px)", type: "number", min: 1, max: 12000, step: 1, value: 1280,
      showIf: { key: "mode", value: ["pixels"] } },
    { key: "height", label: "Height (px)", type: "number", min: 1, max: 12000, step: 1, value: 720,
      showIf: { key: "mode", value: ["pixels"] } },
    RESIZE_LOCK,
    { key: "percent", label: "Scale (%)", type: "number", min: 1, max: 400, step: 1, value: 50,
      showIf: { key: "mode", value: ["percent"] } },
    { key: "fit", label: "When the aspect ratio differs", type: "select", value: "fit",
      options: [
        { value: "fit", label: "Fit inside, transparent/background padding" },
        { value: "fill", label: "Fill and crop the overflow" },
        { value: "stretch", label: "Stretch to exact dimensions" }
      ] },
    { key: "format", label: "Output format", type: "select", value: "auto",
      options: [
        { value: "auto", label: "Keep source (recommended)" },
        { value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" },
        { value: "webp", label: "WebP" }, { value: "avif", label: "AVIF (where supported)" }
      ] },
    QUALITY, BACKGROUND
  ];

  const CROP_OPTIONS = [
    { key: "ratio", label: "Aspect ratio", type: "select", value: "free",
      options: [
        { value: "free", label: "Free (use crop box)" },
        { value: "1:1", label: "Square (1:1)" },
        { value: "4:5", label: "Portrait (4:5)" },
        { value: "5:4", label: "Landscape (5:4)" },
        { value: "3:2", label: "Photo (3:2)" },
        { value: "16:9", label: "Widescreen (16:9)" },
        { value: "9:16", label: "Story/Reel (9:16)" }
      ] },
    { key: "x", label: "Crop left (%)", type: "range", min: 0, max: 95, step: 1, value: 0 },
    { key: "y", label: "Crop top (%)", type: "range", min: 0, max: 95, step: 1, value: 0 },
    { key: "w", label: "Crop width (%)", type: "range", min: 5, max: 100, step: 1, value: 100 },
    { key: "h", label: "Crop height (%)", type: "range", min: 5, max: 100, step: 1, value: 100 },
    { key: "shape", label: "Crop shape", type: "select", value: "rect",
      options: [
        { value: "rect", label: "Rectangle" },
        { value: "rounded", label: "Rounded rectangle" },
        { value: "circle", label: "Circle (transparent corners)" }
      ] },
    { key: "radius", label: "Corner radius (px, rounded mode)", type: "number", min: 0, max: 500, step: 1, value: 24 },
    { key: "outputWidth", label: "Output width (0 = crop size)", type: "number", min: 0, max: 12000, step: 1, value: 0 },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [
        { value: "png", label: "PNG (keeps transparency)" },
        { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }
      ] },
    QUALITY, BACKGROUND
  ];

  const STRAIGHTEN_OPTIONS = [
    { key: "rotate", label: "Quarter turn", type: "select", value: "0",
      options: [
        { value: "0", label: "None" }, { value: "90", label: "90 degrees clockwise" },
        { value: "180", label: "180 degrees" }, { value: "270", label: "90 degrees anticlockwise" }
      ] },
    { key: "angle", label: "Straighten angle (degrees)", type: "range", min: -45, max: 45, step: 0.5, value: 0 },
    { key: "flipH", label: "Flip horizontally", type: "checkbox", value: false },
    { key: "flipV", label: "Flip vertically", type: "checkbox", value: false },
    { key: "format", label: "Output format", type: "select", value: "auto",
      options: [
        { value: "auto", label: "Keep source" }, { value: "png", label: "PNG" },
        { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }
      ] },
    QUALITY, BACKGROUND
  ];

  const ADJUST_OPTIONS = [
    { key: "brightness", label: "Brightness (%)", type: "range", min: 0, max: 200, step: 1, value: 100 },
    { key: "contrast", label: "Contrast (%)", type: "range", min: 0, max: 200, step: 1, value: 100 },
    { key: "saturation", label: "Saturation (%)", type: "range", min: 0, max: 200, step: 1, value: 100 },
    { key: "hue", label: "Hue rotation (degrees)", type: "range", min: -180, max: 180, step: 1, value: 0 },
    { key: "grayscale", label: "Grayscale", type: "checkbox", value: false },
    { key: "sepia", label: "Sepia", type: "checkbox", value: false },
    { key: "invert", label: "Invert", type: "checkbox", value: false },
    { key: "format", label: "Output format", type: "select", value: "auto",
      options: [
        { value: "auto", label: "Keep source" }, { value: "jpg", label: "JPEG" },
        { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }
      ] },
    QUALITY, BACKGROUND
  ];

  const REGION_OPTIONS = [
    { key: "mode", label: "Treatment", type: "select", value: "blur",
      options: [
        { value: "blur", label: "Blur" },
        { value: "pixelate", label: "Pixelate" },
        { value: "solid", label: "Solid redaction block" }
      ] },
    { key: "x", label: "Region left (%)", type: "range", min: 0, max: 95, step: 1, value: 20 },
    { key: "y", label: "Region top (%)", type: "range", min: 0, max: 95, step: 1, value: 20 },
    { key: "w", label: "Region width (%)", type: "range", min: 5, max: 100, step: 1, value: 60 },
    { key: "h", label: "Region height (%)", type: "range", min: 5, max: 100, step: 1, value: 40 },
    { key: "strength", label: "Blur radius / pixel size", type: "range", min: 1, max: 60, step: 1, value: 12 },
    { key: "color", label: "Redaction colour", type: "color", value: "#000000" },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const TEXT_OPTIONS = [
    { key: "text", label: "Text", type: "textarea", value: "Hello", rows: 2 },
    { key: "position", label: "Position", type: "select", value: "bottom",
      options: [
        { value: "top", label: "Top" }, { value: "center", label: "Centre" },
        { value: "bottom", label: "Bottom" }, { value: "custom", label: "Custom x/y" }
      ] },
    { key: "x", label: "Custom x (%)", type: "range", min: 0, max: 100, step: 1, value: 50,
      showIf: { key: "position", value: ["custom"] } },
    { key: "y", label: "Custom y (%)", type: "range", min: 0, max: 100, step: 1, value: 50,
      showIf: { key: "position", value: ["custom"] } },
    { key: "size", label: "Font size (% of image height)", type: "range", min: 1, max: 25, step: 0.5, value: 6 },
    { key: "color", label: "Text colour", type: "color", value: "#ffffff" },
    { key: "stroke", label: "Outline colour", type: "color", value: "#000000" },
    { key: "background", label: "Caption bar colour (blank = none)", type: "text", value: "" },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const BORDER_OPTIONS = [
    { key: "padding", label: "Outer padding (px)", type: "number", min: 0, max: 1000, step: 1, value: 40 },
    { key: "border", label: "Border width (px)", type: "number", min: 0, max: 200, step: 1, value: 0 },
    { key: "borderColor", label: "Border colour", type: "color", value: "#111827" },
    { key: "radius", label: "Rounded corner radius (px)", type: "number", min: 0, max: 500, step: 1, value: 0 },
    { key: "bgColor", label: "Canvas colour", type: "color", value: "#ffffff" },
    { key: "gradient", label: "Add a gradient instead of a flat canvas", type: "checkbox", value: false },
    { key: "bgColor2", label: "Gradient second colour", type: "color", value: "#dbeafe" },
    { key: "shadow", label: "Drop shadow", type: "checkbox", value: false },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const WATERMARK_OPTIONS = [
    { key: "text", label: "Watermark text", type: "text", value: "Sample" },
    { key: "position", label: "Placement", type: "select", value: "center",
      options: [
        { value: "center", label: "Centred" },
        { value: "bottom-right", label: "Bottom right" },
        { value: "bottom-left", label: "Bottom left" },
        { value: "top-right", label: "Top right" },
        { value: "tile", label: "Tiled across the image" }
      ] },
    { key: "opacity", label: "Opacity (%)", type: "range", min: 5, max: 100, step: 1, value: 45 },
    { key: "size", label: "Font size (% of image width)", type: "range", min: 1, max: 20, step: 0.5, value: 5 },
    { key: "color", label: "Watermark colour", type: "color", value: "#ffffff" },
    { key: "angle", label: "Rotation (degrees)", type: "range", min: -90, max: 90, step: 1, value: -30 },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const MEME_OPTIONS = [
    { key: "top", label: "Top text", type: "text", value: "WHEN THE BUILD" },
    { key: "bottom", label: "Bottom text", type: "text", value: "ACTUALLY PASSES" },
    { key: "size", label: "Text size (% of image height)", type: "range", min: 3, max: 20, step: 0.5, value: 8 },
    { key: "color", label: "Text colour", type: "color", value: "#ffffff" },
    { key: "stroke", label: "Stroke colour", type: "color", value: "#000000" },
    { key: "uppercase", label: "Uppercase", type: "checkbox", value: true },
    { key: "format", label: "Output format", type: "select", value: "jpeg",
      options: [{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const COLLAGE_OPTIONS = [
    { key: "cols", label: "Columns", type: "number", min: 1, max: 6, step: 1, value: 3 },
    { key: "gap", label: "Gap (px)", type: "number", min: 0, max: 200, step: 1, value: 16 },
    { key: "bg", label: "Background colour", type: "color", value: "#ffffff" },
    { key: "fit", label: "Image fit", type: "select", value: "cover",
      options: [{ value: "cover", label: "Cover cells" }, { value: "contain", label: "Contain with padding" }] },
    { key: "outputWidth", label: "Output width (px)", type: "number", min: 200, max: 8000, step: 1, value: 1600 },
    { key: "format", label: "Output format", type: "select", value: "jpeg",
      options: [{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const SPLIT_OPTIONS = [
    { key: "rows", label: "Rows", type: "number", min: 1, max: 20, step: 1, value: 2 },
    { key: "cols", label: "Columns", type: "number", min: 1, max: 20, step: 1, value: 2 },
    { key: "format", label: "Tile format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const MERGE_OPTIONS = [
    { key: "direction", label: "Direction", type: "select", value: "horizontal",
      options: [{ value: "horizontal", label: "Side by side" }, { value: "vertical", label: "Stacked" }] },
    { key: "gap", label: "Gap (px)", type: "number", min: 0, max: 500, step: 1, value: 0 },
    { key: "bg", label: "Canvas colour", type: "color", value: "#ffffff" },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const ICON_OPTIONS = [
    { key: "size", label: "Canvas size (px)", type: "number", min: 16, max: 2048, step: 1, value: 512 },
    { key: "padding", label: "Padding (% of canvas)", type: "range", min: 0, max: 40, step: 1, value: 6 },
    { key: "radius", label: "Rounded corner radius (% of canvas)", type: "range", min: 0, max: 50, step: 1, value: 18 },
    { key: "bg", label: "Canvas colour", type: "color", value: "#ffffff" }
  ];

  const OG_OPTIONS = [
    { key: "title", label: "Headline", type: "text", value: "Built privately in your browser" },
    { key: "subtitle", label: "Subtitle", type: "text", value: "Bench Image Toolkit" },
    { key: "overlay", label: "Dark overlay (%)", type: "range", min: 0, max: 90, step: 1, value: 35 },
    { key: "textColor", label: "Text colour", type: "color", value: "#ffffff" },
    { key: "accent", label: "Accent bar colour", type: "color", value: "#3b82f6" },
    { key: "align", label: "Text alignment", type: "select", value: "left",
      options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }] }
  ];

  const QR_OPTIONS = [
    { key: "text", label: "Text or URL to encode", type: "textarea", rows: 3, value: "https://bench.progeni.live/image/" },
    { key: "size", label: "Image size (px)", type: "number", min: 64, max: 2048, step: 1, value: 512 },
    { key: "margin", label: "Quiet-zone margin (modules)", type: "number", min: 0, max: 10, step: 1, value: 4 },
    { key: "ecLevel", label: "Error correction", type: "select", value: "M",
      options: [{ value: "L", label: "L - 7%" }, { value: "M", label: "M - 15%" }, { value: "Q", label: "Q - 25%" }, { value: "H", label: "H - 30%" }] },
    { key: "dark", label: "Foreground colour", type: "color", value: "#111827" },
    { key: "light", label: "Background colour", type: "color", value: "#ffffff" },
    { key: "svg", label: "Also download SVG", type: "checkbox", value: true }
  ];

  const BARCODE_OPTIONS = [
    { key: "text", label: "Barcode value", type: "text", value: "BENCH-2026" },
    { key: "barcodeFormat", label: "Format", type: "select", value: "CODE128",
      options: [
        { value: "CODE128", label: "CODE128 (letters and numbers)" },
        { value: "EAN13", label: "EAN-13 (12/13 digits)" },
        { value: "EAN8", label: "EAN-8 (7/8 digits)" },
        { value: "CODE39", label: "CODE39 (A-Z, 0-9, symbols)" },
        { value: "UPC", label: "UPC-A (11/12 digits)" }
      ] },
    { key: "width", label: "Bar width", type: "number", min: 1, max: 6, step: 1, value: 2 },
    { key: "height", label: "Bar height (px)", type: "number", min: 30, max: 400, step: 1, value: 120 },
    { key: "displayValue", label: "Show value below bars", type: "checkbox", value: true },
    { key: "dark", label: "Bar colour", type: "color", value: "#111827" },
    { key: "light", label: "Background colour", type: "color", value: "#ffffff" }
  ];

  const SVG_OPTIONS = [
    { key: "minify", label: "Minify markup", type: "checkbox", value: true },
    { key: "stripComments", label: "Remove comments", type: "checkbox", value: true },
    { key: "removeXmlns", label: "Remove width/height attributes", type: "checkbox", value: false }
  ];

  const PLACEHOLDER_OPTIONS = [
    { key: "width", label: "Width (px)", type: "number", min: 1, max: 4000, step: 1, value: 1200 },
    { key: "height", label: "Height (px)", type: "number", min: 1, max: 4000, step: 1, value: 630 },
    { key: "bg", label: "Background", type: "color", value: "#e2e8f0" },
    { key: "fg", label: "Text colour", type: "color", value: "#1e3a8a" },
    { key: "text", label: "Label", type: "text", value: "1200 x 630" },
    { key: "output", label: "Output", type: "select", value: "svg",
      options: [{ value: "svg", label: "SVG (sharp at any size)" }, { value: "png", label: "PNG" }] }
  ];

  const SRCSET_OPTIONS = [
    { key: "widths", label: "Widths (comma separated)", type: "text", value: "320, 640, 960, 1280, 1920" },
    { key: "format", label: "Output format", type: "select", value: "webp",
      options: [{ value: "webp", label: "WebP" }, { value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }] },
    QUALITY
  ];

  const SHADOW_OPTIONS = [
    { key: "padding", label: "Padding (px)", type: "number", min: 0, max: 800, step: 1, value: 80 },
    { key: "bg", label: "Background colour", type: "color", value: "#f8fafc" },
    { key: "shadowBlur", label: "Shadow softness (px)", type: "number", min: 0, max: 200, step: 1, value: 40 },
    { key: "shadowOpacity", label: "Shadow opacity (%)", type: "range", min: 0, max: 80, step: 1, value: 28 },
    { key: "radius", label: "Rounded corners (px)", type: "number", min: 0, max: 200, step: 1, value: 18 },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const GIF_OPTIONS = [
    { key: "mode", label: "GIF mode", type: "select", value: "create",
      options: [
        { value: "create", label: "Create from images" },
        { value: "frames", label: "Extract frames from a GIF" }
      ] },
    { key: "delay", label: "Frame delay (ms)", type: "number", min: 20, max: 5000, step: 10, value: 250 },
    { key: "width", label: "Output width (px, 0 = original)", type: "number", min: 0, max: 4000, step: 1, value: 640 },
    { key: "colors", label: "Palette colours", type: "number", min: 2, max: 256, step: 1, value: 128 },
    { key: "loop", label: "Loop forever", type: "checkbox", value: true }
  ];

  const SPRITE_OPTIONS = [
    { key: "cols", label: "Columns", type: "number", min: 1, max: 20, step: 1, value: 4 },
    { key: "cell", label: "Cell size (px)", type: "number", min: 16, max: 1024, step: 1, value: 128 },
    { key: "gap", label: "Gap (px)", type: "number", min: 0, max: 100, step: 1, value: 0 },
    { key: "bg", label: "Background", type: "color", value: "#ffffff" }
  ];

  const RENAME_OPTIONS = [
    { key: "pattern", label: "Filename pattern", type: "text", value: "image-{n}" },
    { key: "start", label: "Start number", type: "number", min: 1, max: 100000, step: 1, value: 1 },
    { key: "format", label: "Output format", type: "select", value: "auto",
      options: [{ value: "auto", label: "Keep source" }, { value: "jpg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }] },
    QUALITY
  ];

  const SCAN_OPTIONS = [
    { key: "mode", label: "Cleanup mode", type: "select", value: "grayscale",
      options: [
        { value: "grayscale", label: "Grayscale document" },
        { value: "binarize", label: "High-contrast binarise" },
        { value: "colour", label: "Keep colour, improve contrast" }
      ] },
    { key: "threshold", label: "Binarise threshold", type: "range", min: 0, max: 255, step: 1, value: 160 },
    { key: "contrast", label: "Contrast (%)", type: "range", min: 100, max: 250, step: 1, value: 130 },
    { key: "deskew", label: "Deskew angle (degrees)", type: "range", min: -15, max: 15, step: 0.5, value: 0 },
    { key: "format", label: "Output format", type: "select", value: "png",
      options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }] },
    QUALITY
  ];

  const DPI_OPTIONS = [
    { key: "dpi", label: "DPI/PPI to write", type: "number", min: 36, max: 1200, step: 1, value: 300 },
    { key: "apply", label: "Write this DPI into a copy (PNG/JPEG only)", type: "checkbox", value: false }
  ];

  const BASE64_OPTIONS = [
    { key: "mode", label: "Mode", type: "select", value: "encode",
      options: [
        { value: "encode", label: "Image file to Base64 / data URI" },
        { value: "decode", label: "Base64 / data URI to image" }
      ] },
    { key: "text", label: "Base64 or data URI (decode mode)", type: "textarea", rows: 5, value: "",
      showIf: { key: "mode", value: ["decode"] } },
    { key: "mime", label: "Decoded image MIME type", type: "select", value: "image/png",
      options: [
        { value: "image/png", label: "PNG" }, { value: "image/jpeg", label: "JPEG" },
        { value: "image/webp", label: "WebP" }, { value: "image/gif", label: "GIF" }
      ],
      showIf: { key: "mode", value: ["decode"] } }
  ];

  const PDF_OPTIONS = [
    { key: "pageSize", label: "Page size", type: "select", value: "image",
      options: [
        { value: "image", label: "One page per image (image-sized)" },
        { value: "a4", label: "A4 portrait" },
        { value: "letter", label: "US Letter portrait" }
      ] },
    { key: "margin", label: "Page margin (mm)", type: "number", min: 0, max: 40, step: 1, value: 0 },
    { key: "quality", label: "JPEG quality inside PDF", type: "range", min: 40, max: 100, step: 1, value: 88 }
  ];

  const PRESETS = {
    photo: {
      "upsc-photo": { label: "UPSC application photo (350 x 450 px, 20-50 KB)", w: 350, h: 450, targetKb: 50, category: "Government application" },
      "ssc-photo": { label: "SSC / railway application photo (276 x 354 px, 20-50 KB)", w: 276, h: 354, targetKb: 50, category: "Government application" },
      "neet-photo": { label: "NEET / JEE application photo (passport ratio)", w: 350, h: 450, targetKb: 50, category: "Government application" },
      "gate-photo": { label: "GATE application photo (passport ratio)", w: 350, h: 450, targetKb: 50, category: "Government application" },
      "passport-2x2": { label: "US passport photo (2 x 2 in at 300 DPI = 600 x 600)", w: 600, h: 600, targetKb: 240, category: "Visa & passport" },
      "visa-35x45": { label: "Schengen visa photo (35 x 45 mm at 300 DPI)", w: 413, h: 531, targetKb: 240, category: "Visa & passport" },
      "visa-2x2": { label: "US visa photo (2 x 2 in at 300 DPI = 600 x 600)", w: 600, h: 600, targetKb: 240, category: "Visa & passport" },
      "signature-350x150": { label: "Signature strip (350 x 150 px, 10-20 KB)", w: 350, h: 150, targetKb: 20, category: "Signature" },
      "signature-140x60": { label: "Compact signature (140 x 60 px, under 10 KB)", w: 140, h: 60, targetKb: 10, category: "Signature" }
    },
    social: {
      "youtube-thumbnail": { label: "YouTube thumbnail (1280 x 720)", w: 1280, h: 720, category: "YouTube" },
      "youtube-banner": { label: "YouTube channel banner (2560 x 1440)", w: 2560, h: 1440, category: "YouTube" },
      "instagram-square": { label: "Instagram square post (1080 x 1080)", w: 1080, h: 1080, category: "Instagram" },
      "instagram-portrait": { label: "Instagram portrait post (1080 x 1350)", w: 1080, h: 1350, category: "Instagram" },
      "instagram-story": { label: "Instagram / Facebook story (1080 x 1920)", w: 1080, h: 1920, category: "Instagram" },
      "facebook-post": { label: "Facebook post (1200 x 630)", w: 1200, h: 630, category: "Facebook" },
      "facebook-cover": { label: "Facebook cover (1640 x 624)", w: 1640, h: 624, category: "Facebook" },
      "linkedin-post": { label: "LinkedIn post (1200 x 627)", w: 1200, h: 627, category: "LinkedIn" },
      "linkedin-banner": { label: "LinkedIn profile banner (1584 x 396)", w: 1584, h: 396, category: "LinkedIn" },
      "x-post": { label: "X / Twitter post (1600 x 900)", w: 1600, h: 900, category: "X" }
    }
  };

  function presetOptions(presetMap) {
    return [
      { key: "preset", label: "Preset", type: "select", value: Object.keys(presetMap)[0],
        options: Object.keys(presetMap).map(function (id) { return { value: id, label: presetMap[id].label }; }) },
      { key: "customWidth", label: "Custom width (px)", type: "number", min: 1, max: 12000, step: 1, value: 600,
        showIf: { key: "preset", value: ["custom"] } },
      { key: "customHeight", label: "Custom height (px)", type: "number", min: 1, max: 12000, step: 1, value: 600,
        showIf: { key: "preset", value: ["custom"] } },
      { key: "fit", label: "Fit", type: "select", value: "cover",
        options: [
          { value: "cover", label: "Crop to fill the exact size" },
          { value: "pad", label: "Fit with background padding" }
        ] },
      { key: "maxKb", label: "Maximum file size (KB, 0 = no limit)", type: "number", min: 0, max: 10240, step: 1, value: 0,
        help: "Constrained presets start with their commonly requested limit. It is a starting point, not proof of acceptance." },
      { key: "background", label: "Padding / background colour", type: "color", value: "#ffffff" },
      QUALITY
    ];
  }

  /* Tool definitions are appended below by section. Each entry is validated by
     the test suite: id, slug, category, seo, content, options and handler. */
  const TOOLS = [];
  /* __TOOL_DEFS__ */

  const CLIENT_PRIVACY =
    "Decoding, editing and encoding all run inside your browser using Canvas and File APIs. " +
    "The file is never uploaded, logged or stored by Bench, and the result exists only in a temporary object URL " +
    "until you download it or close the page.";

  function makeTool(def) {
    const tool = Object.assign({
      slug: def.id,
      status: "implemented",
      execution: "client",
      requiresFile: true,
      maxFiles: 1,
      inputs: ["JPEG", "PNG", "WebP", "GIF", "BMP", "TIFF", "SVG", "AVIF"],
      outputs: ["image"],
      privacy: CLIENT_PRIVACY,
      keywords: []
    }, def);
    if (!tool.seoTitle) tool.seoTitle = tool.name + ": private browser tool | Bench";
    if (!tool.seoDescription) tool.seoDescription = tool.summary;
    if (!tool.faq || !tool.faq.length) {
      tool.faq = [
        { q: "Does " + tool.name + " upload my images?", a: tool.privacy },
        { q: "What limits apply to " + tool.name + "?", a: tool.limitations },
        { q: "Is " + tool.name + " free to use?", a: "Yes. The tool runs locally in your browser with no account, subscription or watermark on your output. Bench is supported by the rest of its free utility catalogue." }
      ];
    }
    return tool;
  }
  const T = makeTool;

  /* ------------------------------------------------------ compress & optimize */

  TOOLS.push(T({
    id: "compress",
    name: "Image Compressor",
    category: "compress",
    handler: "compress",
    summary: "Shrink JPEG, PNG, WebP and AVIF images with real before/after sizes. Drop several files to compress them in one pass.",
    description: "Re-encodes images at your chosen quality and format, keeps transparency where the format allows it, and reports the exact byte size of every result. Batch compression processes files one at a time in your browser, so very large batches can take a while.",
    keywords: ["compress image", "reduce image size", "bulk image compression", "jpg compressor", "png compressor", "webp compressor"],
    options: COMPRESS_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Drop one or more images, or use the file picker. The original preview, dimensions, type and size appear immediately.",
      "Choose an output format and quality. Keeping the source format is safest; JPEG and WebP give the largest reductions for photos.",
      "Run the compressor. Each file reports its before/after size, the percentage saved and its real output dimensions.",
      "Download a single result or all successful results as a ZIP. Failed files are listed separately and never replace successful output."
    ],
    limitations: "Canvas re-encoding removes EXIF, GPS and other metadata, which is usually desirable but means camera settings cannot be preserved. PNG output is lossless, so quality does not change its size. AVIF encoding depends on browser support and is skipped with a clear message when unavailable. Files are limited to 50 MB and 40 megapixels each.",
    useCases: ["Shrink photos before emailing them.", "Prepare web images without uploading client material.", "Create consistently compressed batches for a store or blog."]
  }));

  TOOLS.push(T({
    id: "compress-to-size",
    name: "Compress to Target Size",
    category: "compress",
    handler: "targetSize",
    summary: "Hit a 10 KB, 20 KB, 50 KB, 100 KB, 200 KB, 500 KB, 1 MB or custom size by searching quality and, if allowed, dimensions.",
    keywords: ["compress to 20kb", "compress to 50kb", "compress to 100kb", "compress to 1mb", "target file size", "photo under 20 kb"],
    options: TARGET_OPTIONS,
    outputs: ["image"],
    howTo: [
      "Upload the image and enter the exact target in kilobytes. Preset targets are shown in the field help.",
      "Choose JPEG, WebP or AVIF. Leave downscaling enabled unless the required pixel dimensions are fixed.",
      "Start the search. Bench tests real encodings, narrows in on quality and only reduces dimensions when necessary.",
      "Check the achieved size and the note. If the target cannot be met without dropping below your minimum quality, the tool says so instead of hiding it."
    ],
    limitations: "A target size is reached by actually re-encoding, so the result may be slightly under or over the goal. PNG is lossless and cannot be quality-tuned, so target-size search is not offered for PNG. Very small targets on large photos can require substantial downscaling. Application forms that demand exact pixels should keep downscaling disabled.",
    useCases: ["Meet a government form upload limit in kilobytes.", "Prepare a thumbnail below a strict CDN limit.", "Reduce a photo for an email attachment without guessing the quality slider."]
  }));

  /* --------------------------------------------------------- resize & prepare */

  TOOLS.push(T({
    id: "resize",
    name: "Resize Image",
    category: "resize",
    handler: "resize",
    summary: "Resize by pixels or percentage with aspect-ratio lock, fit, fill or stretch, and optional batch output.",
    keywords: ["resize image", "bulk resize", "change image dimensions", "scale image", "resize photo"],
    options: RESIZE_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Add one or more images. Select pixels or percentage mode.",
      "Enter the target width and height, or a scale percentage. Keep aspect lock on to avoid distortion.",
      "Choose fit, fill or stretch for images whose ratio differs from the target.",
      "Run the resize and download individual files or a ZIP with predictable names."
    ],
    limitations: "Upscaling cannot create detail that was never captured; it only interpolates pixels. Enlarging beyond roughly 2x usually looks soft. Very large outputs are bounded by the 40-megapixel processing limit.",
    useCases: ["Make every product photo the same width.", "Scale screenshots down for documentation.", "Resize a batch for a website upload form."]
  }));

  TOOLS.push(T({
    id: "crop",
    name: "Crop Image",
    category: "resize",
    handler: "crop",
    summary: "Crop with a percentage box, fixed aspect ratios, rounded corners or a true circular crop with transparent corners.",
    keywords: ["crop image", "circle crop", "square crop", "aspect ratio crop", "round profile picture"],
    options: CROP_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload an image. The original dimensions and a live crop summary are shown.",
      "Pick a fixed ratio or set the crop box with the left, top, width and height sliders.",
      "Choose rectangle, rounded or circle. Circle and rounded crops export as PNG so the corners stay transparent.",
      "Run the crop and export one file or a ZIP for a batch."
    ],
    limitations: "The crop box is specified as percentages, not freehand handles, so exact pixel placement uses the percentage readout. A circle crop always fits inside the selected box; it does not add a background unless you pick JPEG.",
    useCases: ["Create a circular profile picture.", "Crop a landscape photo to a 9:16 story.", "Standardise thumbnails to a square."]
  }));

  TOOLS.push(T({
    id: "application-photo",
    name: "Application Photo & Signature Presets",
    category: "resize",
    handler: "presetCrop",
    summary: "Prepare passport, visa, UPSC, SSC, NEET, JEE, GATE and signature images with configurable size presets and a target KB limit.",
    keywords: ["passport photo maker", "visa photo", "upsc photo resizer", "ssc photo signature", "neet photo", "signature resizer", "application photo"],
    presets: PRESETS.photo,
    options: presetOptions(PRESETS.photo),
    outputs: ["image"],
    howTo: [
      "Upload a clear, front-facing photo or a signature scan and choose the closest preset.",
      "Use cover to crop to the exact frame or pad to keep the full image on a background colour.",
      "Set a maximum KB only if your application form states one. The encoder searches real output sizes.",
      "Download the result and verify the pixel dimensions against the official instructions before submitting."
    ],
    limitations: "Preset dimensions are commonly requested starting points, not verified rules for every exam, state or year. Official notifications change; always confirm the current requirements. The tool does not detect faces, validate background purity, measure head size or guarantee acceptance by any authority.",
    useCases: ["Prepare a passport-ratio photo for an online form.", "Make a signature strip below a portal's KB limit.", "Create consistently sized application photos."]
  }));

  TOOLS.push(T({
    id: "social-resize",
    name: "Social Media & YouTube Image Sizes",
    category: "resize",
    handler: "presetCrop",
    summary: "Crop and export images for YouTube thumbnails and banners, Instagram, Facebook, LinkedIn and X presets.",
    keywords: ["youtube thumbnail size", "youtube banner", "instagram post size", "facebook cover", "linkedin banner", "social media image resizer"],
    presets: PRESETS.social,
    options: presetOptions(PRESETS.social),
    maxFiles: 10,
    outputs: ["image", "zip"],
    howTo: [
      "Upload one or more images and pick a platform preset.",
      "Cover crops to fill the frame; pad keeps the whole image on a background colour.",
      "Run the export and download individual results or a ZIP.",
      "Check safe areas inside the platform's own editor - profile overlays and device crops may still cover edges."
    ],
    limitations: "Published social dimensions change and some platforms crop the same asset differently on mobile. These presets use widely used pixel sizes but do not account for every overlay or safe area. Text and important subjects should stay away from edges.",
    useCases: ["Make a 1280 x 720 YouTube thumbnail.", "Resize a photo for an Instagram story.", "Prepare a LinkedIn banner from a wider photo."]
  }));

  TOOLS.push(T({
    id: "dpi",
    name: "DPI Inspector & Setter",
    category: "resize",
    handler: "dpi",
    summary: "Read the embedded DPI/PPI of PNG and JPEG files, inspect pixel dimensions, and write a corrected DPI copy.",
    keywords: ["dpi checker", "ppi inspector", "change dpi", "300 dpi image", "print resolution"],
    options: DPI_OPTIONS,
    outputs: ["report", "image"],
    howTo: [
      "Upload a PNG or JPEG. The tool reads the PNG pHYs chunk or the JPEG JFIF/EXIF density fields.",
      "Compare the embedded DPI with the pixel dimensions and the physical print size the tool reports.",
      "If you need a corrected copy, enable writing and enter the target DPI.",
      "Download the rewritten file. A verification pass re-reads the output and shows the written value."
    ],
    limitations: "Changing DPI metadata does not add pixels or improve print quality; it only changes the stated physical size. Some cameras and editors omit density metadata entirely. The setter supports PNG and JPEG only. CMYK and embedded ICC profiles are reported but not colour-managed.",
    useCases: ["Check whether a printer-ready file really says 300 DPI.", "Correct a 72 DPI screenshot for a print layout.", "Confirm physical dimensions before ordering a print."]
  }));


  /* ------------------------------------------------------------------ convert */

  TOOLS.push(T({
    id: "convert",
    name: "Image Converter",
    category: "convert",
    handler: "convert",
    summary: "Convert between JPEG, PNG, WebP, AVIF, BMP, TIFF, GIF and ICO, and rasterise SVG, with batch output and transparent handling.",
    keywords: ["image converter", "png to jpg", "jpg to png", "webp converter", "tiff converter", "bmp converter", "svg to png", "ico converter", "batch convert"],
    options: [
      { key: "format", label: "Convert to", type: "select", value: "png",
        options: [
          { value: "png", label: "PNG - lossless, transparency" },
          { value: "jpeg", label: "JPEG - small photos, no transparency" },
          { value: "webp", label: "WebP - small files, transparency" },
          { value: "avif", label: "AVIF - modern, browser dependent" },
          { value: "bmp", label: "BMP - uncompressed legacy" },
          { value: "tiff", label: "TIFF - uncompressed raster" },
          { value: "gif", label: "GIF - 256 colours, single frame" },
          { value: "ico", label: "ICO - PNG-compressed icon (256 px)" }
        ] },
      QUALITY, BACKGROUND,
      { key: "svgSize", label: "SVG raster width (px, 0 = intrinsic)", type: "number", min: 0, max: 8000, step: 1, value: 0 }
    ],
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Drop one or more images. Bench sniffs the real format from the file bytes and decodes it before conversion.",
      "Pick the destination format. JPEG flattens transparency onto the chosen background; PNG, WebP and AVIF keep it.",
      "For SVG input, set a raster width or leave 0 to use the document's intrinsic size.",
      "Run the conversion and download one file or all successful outputs as a ZIP."
    ],
    limitations: "Animated GIF stays a single frame, and animation is not preserved when converting to other formats. HEIC/HEIF input is not decoded because no decoder is bundled; those files are rejected with an explanation. TIFF output is uncompressed and therefore large. AVIF output is only produced when the browser exposes an AVIF encoder.",
    useCases: ["Convert PNG screenshots to compact WebP.", "Rasterise a logo SVG for a site that needs PNG.", "Turn a batch of photos into JPEG for a print shop."]
  }));

  TOOLS.push(T({
    id: "image-to-pdf",
    name: "Image to PDF",
    category: "convert",
    handler: "imageToPdf",
    summary: "Combine JPEG, PNG, WebP or rasterised SVG images into a single PDF, one page per image or fitted to A4/Letter.",
    keywords: ["image to pdf", "jpg to pdf", "png to pdf", "photo to pdf", "image sequence pdf"],
    options: PDF_OPTIONS,
    maxFiles: LIMITS.maxPdfPages,
    outputs: ["document"],
    howTo: [
      "Add images in the order you want them to appear. The file list is processed in that order.",
      "Choose image-sized pages for exact aspect ratios, or A4/Letter for a document with optional margins.",
      "Set the internal JPEG quality. Higher quality makes a larger PDF.",
      "Run the export and download the finished PDF. Pages are assembled locally from real JPEG image streams."
    ],
    limitations: "The PDF contains raster images, not searchable text or vector objects. Transparency is flattened onto white. Orientation is taken from the decoded image, so EXIF-rotated phone photos are normalised. A maximum of 40 pages is enforced to keep memory use bounded.",
    useCases: ["Turn a set of photos into one document.", "Package scanned pages for email.", "Create a simple portfolio PDF without an upload service."]
  }));

  TOOLS.push(T({
    id: "base64",
    name: "Base64 & Data URI Converter",
    category: "convert",
    handler: "base64",
    summary: "Encode an image to Base64 or a data URI, or decode Base64 back into a real, decodable image file.",
    keywords: ["image to base64", "base64 to image", "data uri converter", "embed image css", "base64 encoder"],
    options: BASE64_OPTIONS,
    requiresFile: false,
    maxFiles: 1,
    inputs: ["JPEG", "PNG", "WebP", "GIF", "BMP", "SVG"],
    outputs: ["text", "image"],
    howTo: [
      "Choose encode to turn an uploaded image into Base64 text and a ready-to-paste data URI.",
      "Choose decode and paste a raw Base64 string or a complete data URI.",
      "For raw Base64 without a MIME prefix, select the expected output type.",
      "Copy the text or download the decoded image. The tool verifies that decoded bytes actually match the chosen image type."
    ],
    limitations: "Base64 inflates data by roughly 33 percent, so it is unsuitable for large images. Data URIs increase HTML/CSS size and block parsing; use them only for small assets. Decoding rejects malformed input and does not guess arbitrary binary formats.",
    useCases: ["Embed a tiny icon in CSS.", "Recover an image from an API response.", "Generate a data URI for an email template."]
  }));

  /* -------------------------------------------------------------- edit & design */

  TOOLS.push(T({
    id: "transform",
    name: "Rotate, Flip & Straighten",
    category: "edit",
    handler: "transform",
    summary: "Rotate by 90-degree steps, flip horizontally or vertically, or straighten a tilted photo with automatic canvas expansion.",
    keywords: ["rotate image", "flip image", "straighten photo", "mirror image", "rotate 90 degrees"],
    options: STRAIGHTEN_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload one or more images.",
      "Choose a quarter turn, a fine straighten angle, or both flips.",
      "The result canvas expands automatically so no corner of a rotated image is clipped.",
      "Run the transform and download individual files or a ZIP."
    ],
    limitations: "Fine rotation introduces interpolation and may soften edges slightly. Straightening does not auto-detect horizons; enter the angle manually. EXIF orientation is applied on decode, so the preview matches the visible image rather than the raw sensor orientation.",
    useCases: ["Fix a sideways phone photo.", "Mirror artwork for heat-transfer printing.", "Straighten a scanned page."]
  }));

  TOOLS.push(T({
    id: "adjust",
    name: "Colour Adjustments",
    category: "edit",
    handler: "adjust",
    summary: "Adjust brightness, contrast, saturation and hue, or apply grayscale, sepia and inversion, with an original/result comparison.",
    keywords: ["brightness", "contrast", "saturation", "hue", "grayscale image", "sepia filter", "invert colors", "photo editor"],
    options: ADJUST_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload an image and move the brightness, contrast, saturation or hue controls.",
      "Toggle grayscale, sepia or inversion for a one-click look.",
      "Compare the result with the untouched original shown beside it. Reset restores the initial state.",
      "Export the result in the source format or choose PNG/JPEG/WebP."
    ],
    limitations: "Adjustments are applied once to the decoded pixels; there are no curves, levels or selective masks. Repeated JPEG exports accumulate compression loss, so export once at the end. The tool is not a colour-managed editor and does not convert CMYK or apply ICC transforms.",
    useCases: ["Brighten an underexposed photo.", "Create a black-and-white version.", "Fix a slightly dull product shot."]
  }));

  TOOLS.push(T({
    id: "blur-redact",
    name: "Blur, Pixelate & Redact",
    category: "edit",
    handler: "redact",
    summary: "Blur, pixelate or paint over a rectangular region to hide sensitive details, with no upload to a server.",
    keywords: ["blur part of image", "redact image", "pixelate face", "hide information", "censor image"],
    options: REGION_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload an image and set the region with the left, top, width and height sliders.",
      "Choose blur, pixelate or a solid block, then set the strength.",
      "Check the result preview to confirm the sensitive area is fully covered.",
      "Export as PNG to avoid JPEG artefacts reintroducing detail around the redaction."
    ],
    limitations: "Blur and pixelation reduce detail but are not mathematically irreversible; for truly sensitive data use the solid block mode or crop the region out entirely. The tool edits one rectangle at a time per run. It does not detect faces or text automatically.",
    useCases: ["Hide an address before posting a screenshot.", "Pixelate a face in a public photo.", "Cover an account number in a receipt."]
  }));

  TOOLS.push(T({
    id: "annotate",
    name: "Text, Captions & Annotations",
    category: "edit",
    handler: "annotate",
    summary: "Add a caption, label, callout text or a caption bar to an image with real canvas rendering.",
    keywords: ["add text to image", "image caption", "annotate image", "label photo", "add text to photo"],
    options: TEXT_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload an image and type the text.",
      "Choose top, centre, bottom or a custom position, then set the font size and colours.",
      "Add a caption bar by entering a background colour; leave it blank for outlined text only.",
      "Run the annotation and download the rendered image."
    ],
    limitations: "Text is rendered as pixels, not editable layers. The tool supports a single text block per run and uses the browser's available sans-serif font. Emoji rendering depends on the operating system. Line breaks are preserved but long lines are wrapped to the image width.",
    useCases: ["Caption a screenshot for documentation.", "Add a name label to a photo.", "Create a simple quote graphic."]
  }));

  TOOLS.push(T({
    id: "border-padding",
    name: "Border, Padding & Rounded Corners",
    category: "edit",
    handler: "border",
    summary: "Add a border, outer padding, rounded corners, a colour or gradient canvas and an optional drop shadow.",
    keywords: ["add border to image", "image padding", "rounded corners", "canvas background", "photo frame"],
    options: BORDER_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload an image and choose the padding and border width.",
      "Set a flat canvas colour or enable a two-colour gradient.",
      "Add rounded corners and an optional drop shadow for a card-like presentation.",
      "Export as PNG for transparency or JPEG for a smaller flat result."
    ],
    limitations: "The border is uniform on all sides. Rounded corners are applied to the image itself, not to a separate frame layer. Transparent output is only available in PNG/WebP; JPEG uses the chosen canvas colour.",
    useCases: ["Prepare an image for a marketplace listing.", "Add a clean white margin for print.", "Create a rounded card image for a slide."]
  }));

  TOOLS.push(T({
    id: "watermark",
    name: "Visible Watermark",
    category: "edit",
    handler: "watermark",
    summary: "Add visible text watermarks with configurable placement, opacity, rotation, tiling and colour.",
    keywords: ["watermark image", "add watermark", "protect photo", "batch watermark", "copyright text"],
    options: WATERMARK_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload one or more images and enter the watermark text.",
      "Pick a corner, centre it, or tile it across the image.",
      "Adjust opacity, size, colour and rotation. The result preview updates after processing.",
      "Run the watermark and download individual files or a ZIP."
    ],
    limitations: "Visible watermarks can be cropped or removed by a determined editor; they are a deterrent, not cryptographic protection. The tool adds text only, not a logo image. Tiled watermark spacing is automatic and may need a larger or smaller font size for very wide images.",
    useCases: ["Mark draft photos sent to a client.", "Add a copyright line to a portfolio image.", "Watermark a batch before sharing previews."]
  }));

  TOOLS.push(T({
    id: "meme",
    name: "Meme Generator",
    category: "edit",
    handler: "meme",
    summary: "Turn any image into a classic top/bottom caption meme with outlined text, local processing and instant download.",
    keywords: ["meme generator", "meme maker", "top bottom text", "caption meme", "image macro"],
    options: MEME_OPTIONS,
    outputs: ["image"],
    howTo: [
      "Upload a photo and type the top and bottom captions.",
      "Adjust the text size and colours; uppercase is on by default for the classic look.",
      "Run the generator and check the real rendered result.",
      "Download the finished image. Nothing is posted to a social network."
    ],
    limitations: "Text is wrapped and scaled to fit the width, but very long captions can still overlap the image. Only two caption blocks are supported; there is no draggable text. The tool does not host or publish memes.",
    useCases: ["Make a reaction image from a photo.", "Create a light-hearted team graphic.", "Caption a screenshot for a chat group."]
  }));

  TOOLS.push(T({
    id: "collage",
    name: "Collage Maker",
    category: "edit",
    handler: "collage",
    summary: "Arrange multiple images into a clean grid collage with configurable columns, gap, background and output width.",
    keywords: ["collage maker", "photo grid", "combine photos", "photo collage", "grid image"],
    options: COLLAGE_OPTIONS,
    maxFiles: 20,
    outputs: ["image"],
    howTo: [
      "Add two or more images and choose the number of columns.",
      "Set the gap, background colour and output width.",
      "Pick cover to fill each cell or contain to show whole images with padding.",
      "Run the collage and download the finished grid."
    ],
    limitations: "The grid is even; cells cannot have different sizes. Images are cropped or padded to fit their cell. Very large collages are bounded by the 40-megapixel limit. No text labels or drag-to-reorder controls are provided.",
    useCases: ["Combine a trip's photos into one grid.", "Create a product round-up image.", "Make a simple mood board."]
  }));

  TOOLS.push(T({
    id: "splitter",
    name: "Image Splitter & Grid Cutter",
    category: "edit",
    handler: "split",
    summary: "Split an image into a rows x columns grid of equal tiles and download every tile in a ZIP.",
    keywords: ["split image", "image grid cutter", "instagram grid", "tile image", "cut image into pieces"],
    options: SPLIT_OPTIONS,
    maxFiles: 3,
    outputs: ["zip"],
    howTo: [
      "Upload the image to split.",
      "Choose the number of rows and columns. A 3 x 3 grid produces nine tiles.",
      "Select the tile format and run the splitter.",
      "Download the ZIP. Each tile is named with its row and column position."
    ],
    limitations: "Tiles are equal-sized slices and may not divide exactly at the edges; remainder pixels stay with the final row/column. There is no overlap or seam blending. A maximum of 20 x 20 tiles per image is enforced.",
    useCases: ["Create an Instagram grid from one photo.", "Cut a poster into printable panels.", "Build a puzzle-like tile set."]
  }));

  TOOLS.push(T({
    id: "merge",
    name: "Side-by-Side Image Merge",
    category: "edit",
    handler: "merge",
    summary: "Merge two or more images horizontally or vertically with an optional gap and background colour.",
    keywords: ["merge images", "side by side image", "combine two photos", "stitch images", "image joiner"],
    options: MERGE_OPTIONS,
    maxFiles: 10,
    outputs: ["image"],
    howTo: [
      "Add the images in the order you want them joined.",
      "Choose side by side or stacked, then set a gap and background colour.",
      "Run the merge; different heights or widths are aligned without stretching.",
      "Download the merged result."
    ],
    limitations: "Images keep their original pixel sizes, which can produce uneven bands. Only simple edge-to-edge joining is supported; there is no blending, overlap or perspective correction. The result is bounded by the 40-megapixel limit.",
    useCases: ["Put a before and after photo side by side.", "Join scanned pages vertically.", "Compare two design revisions."]
  }));

  TOOLS.push(T({
    id: "compare",
    name: "Image Compare & Similarity",
    category: "edit",
    handler: "compare",
    summary: "Compare two images visually and numerically with dimensions, exact hashes and a perceptual similarity score.",
    keywords: ["compare images", "image similarity", "before after compare", "image diff", "perceptual hash compare"],
    options: [],
    maxFiles: 2,
    outputs: ["report", "image"],
    howTo: [
      "Upload exactly two images.",
      "The tool reports dimensions, byte sizes, exact SHA-256 hashes and a perceptual similarity percentage.",
      "A labelled side-by-side comparison image is generated for visual review.",
      "Download the comparison image and the text report."
    ],
    limitations: "Perceptual similarity uses a 64-bit average hash and is a heuristic, not forensic proof of identity or manipulation. Images with different crops, rotations or heavy colour grading may score low even when related. The comparison canvas is scaled to a readable common height.",
    useCases: ["Check whether two exports are byte-identical.", "Compare an original with a compressed result.", "Review a design revision beside its predecessor."]
  }));

  TOOLS.push(T({
    id: "product-shadow",
    name: "Product Photo Shadow & Background",
    category: "edit",
    handler: "productShadow",
    summary: "Place a product cut-out on a clean background with padding, rounded corners and a soft realistic drop shadow.",
    keywords: ["product photo background", "add shadow to image", "product image enhancer", "ecommerce photo", "transparent png shadow"],
    options: SHADOW_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload a transparent PNG or a photo with a clean background.",
      "Choose the padding, background colour, shadow softness and corner radius.",
      "Run the tool; the product is composited on the canvas without altering its pixels.",
      "Download the result for a listing, slide or catalogue."
    ],
    limitations: "This is a deterministic layout and shadow effect, not AI background removal. Transparent source cut-outs work best; a busy source background remains visible. The shadow is a canvas blur behind the image and is not physically simulated.",
    useCases: ["Give a transparent product cut-out a catalogue background.", "Add breathing room around a listing image.", "Create consistent thumbnails for a shop."]
  }));

  /* ------------------------------------------------------------ documents/scan */

  TOOLS.push(T({
    id: "scan-cleanup",
    name: "Scan Cleanup & Deskew",
    category: "documents",
    handler: "scanCleanup",
    status: "experimental",
    summary: "Convert phone photos of documents into cleaner grayscale or binarised pages and correct a manually measured tilt.",
    keywords: ["scan cleanup", "deskew scan", "binarize document", "document scanner", "white background scan"],
    options: SCAN_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Photograph the page flat and with even lighting, then upload it.",
      "Choose grayscale or binarise for text, or colour to keep stamps and signatures.",
      "Enter a deskew angle measured from a horizontal or vertical page edge.",
      "Run the cleanup and inspect the result before using it as a document."
    ],
    limitations: "Experimental: there is no perspective correction, automatic page-edge detection, shadow removal or OCR. Binarisation can erase faint pencil marks and colour stamps. Deskew is manual and expands the canvas, which can add a small border. It is not a replacement for a dedicated document scanner.",
    useCases: ["Make a photographed receipt easier to read.", "Improve contrast on a scanned handout.", "Straighten a slightly tilted page."]
  }));

  /* -------------------------------------------------------- metadata & privacy */

  TOOLS.push(T({
    id: "metadata-viewer",
    name: "Metadata & EXIF Viewer",
    category: "metadata",
    handler: "inspect",
    summary: "Inspect EXIF, GPS, camera details, dimensions, transparency, colour profile presence and embedded DPI in JPEG, PNG, GIF, WebP and TIFF files.",
    keywords: ["exif viewer", "metadata viewer", "gps metadata", "photo metadata", "image inspector", "icc profile"],
    options: [],
    maxFiles: LIMITS.maxFiles,
    outputs: ["report"],
    howTo: [
      "Upload one or more images.",
      "Read the decoded dimensions, real detected format, transparency status and byte size.",
      "For JPEG/TIFF, inspect camera make/model, capture date, orientation, resolution and GPS coordinates when present.",
      "Download the report as JSON or text. The report never includes image bytes."
    ],
    limitations: "The parser reads common EXIF and PNG/WebP header fields, not every proprietary maker note. Colour profiles are detected by presence, not interpreted, so CMYK conversions are not offered. GPS values are shown as stored; the tool does not map them or verify accuracy.",
    useCases: ["Check whether a photo contains location data.", "Read camera settings from a JPEG.", "Inspect why a print file reports the wrong DPI."]
  }));

  TOOLS.push(T({
    id: "strip-metadata",
    name: "EXIF & GPS Remover",
    category: "metadata",
    handler: "stripMetadata",
    summary: "Remove EXIF, GPS, camera and embedded metadata by re-encoding the image, then verify the exported file no longer carries a JPEG EXIF block.",
    keywords: ["remove exif", "remove gps from photo", "strip metadata", "privacy photo", "delete exif data"],
    options: [
      { key: "format", label: "Output format", type: "select", value: "auto",
        options: [
          { value: "auto", label: "Keep source (JPEG stays JPEG, PNG stays PNG)" },
          { value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }
        ] },
      QUALITY, BACKGROUND
    ],
    maxFiles: LIMITS.maxFiles,
    outputs: ["image", "zip"],
    howTo: [
      "Upload photos or screenshots and choose the output format.",
      "Run the remover. Re-encoding drops EXIF, GPS, XMP and most ancillary chunks.",
      "Read the verification line: Bench re-scans the encoded bytes for an EXIF signature.",
      "Download the cleaned file and, for sensitive material, check it again with the Metadata Viewer."
    ],
    limitations: "Re-encoding removes metadata that Canvas does not copy, which covers EXIF/GPS in practice but is not a formal guarantee for every proprietary chunk in every format. Transparency requires PNG/WebP. Removing metadata does not remove visible identifying details such as faces, reflections or document text.",
    useCases: ["Share a photo without home GPS coordinates.", "Clean images before publishing a listing.", "Remove camera details from a screenshot."]
  }));

  TOOLS.push(T({
    id: "image-hash",
    name: "Image Hash Generator",
    category: "metadata",
    handler: "hash",
    summary: "Generate exact SHA-256 hashes plus perceptual average and difference hashes for image identity and similarity checks.",
    keywords: ["image hash", "sha256 image", "perceptual hash", "ahash", "dhash", "file fingerprint"],
    options: [
      { key: "algorithm", label: "Hash", type: "select", value: "all",
        options: [
          { value: "all", label: "SHA-256 + aHash + dHash" },
          { value: "sha256", label: "SHA-256 (exact bytes)" },
          { value: "perceptual", label: "Perceptual hashes only" }
        ] }
    ],
    maxFiles: LIMITS.maxFiles,
    outputs: ["report"],
    howTo: [
      "Upload one or more images.",
      "Bench hashes the original file bytes for SHA-256 and samples a 9 x 8 grayscale grid for dHash.",
      "Download the JSON or CSV report.",
      "Use SHA-256 for exact identity and the perceptual hashes for near-duplicate grouping."
    ],
    limitations: "SHA-256 changes completely after any re-encode. Perceptual hashes are similarity heuristics and can produce false matches on flat or highly repetitive images. They are not cryptographic proofs and should not be used for forensic attribution.",
    useCases: ["Record a stable fingerprint before editing.", "Find near-duplicate exports.", "Compare two files without uploading them."]
  }));

  TOOLS.push(T({
    id: "duplicate-finder",
    name: "Duplicate & Similar Photo Finder",
    category: "metadata",
    handler: "dedupe",
    summary: "Find byte-identical duplicates and visually similar photos using SHA-256 and perceptual hashing, entirely in the browser.",
    keywords: ["duplicate photo finder", "similar images", "find duplicate images", "perceptual duplicate", "photo cleanup"],
    options: [
      { key: "threshold", label: "Similarity threshold (Hamming distance, lower is stricter)", type: "range", min: 0, max: 16, step: 1, value: 6,
        help: "0 = identical perceptual hash, 6 = likely near-duplicate, 16 = loose similarity." },
      { key: "includeSimilar", label: "Group near-duplicates as well as exact matches", type: "checkbox", value: true }
    ],
    maxFiles: LIMITS.maxFiles,
    outputs: ["report", "zip"],
    howTo: [
      "Add a folder or a batch of photos.",
      "Bench computes SHA-256 for exact matches and a 64-bit perceptual hash for near matches.",
      "Review the groups. The first file in a group is the suggested original; later files are duplicates or variants.",
      "Download the report, and optionally a ZIP containing the files Bench marked as unique."
    ],
    limitations: "Similarity detection compares downscaled grayscale fingerprints, so rotations, crops and severe colour edits can reduce the score. It does not read EXIF dates or delete files automatically. Review groups before discarding anything, especially when similar-looking graphics are intentionally repeated.",
    useCases: ["Clean up repeated downloads.", "Find resized copies of the same photo.", "Review a client folder for accidental duplicates."]
  }));

  TOOLS.push(T({
    id: "palette",
    name: "Colour Palette & Histogram",
    category: "metadata",
    handler: "palette",
    summary: "Extract a dominant colour palette, inspect RGB/luminance histograms and sample colours from an image.",
    keywords: ["color palette extractor", "dominant color", "histogram", "image colors", "color picker"],
    options: [
      { key: "colors", label: "Palette colours", type: "range", min: 3, max: 16, step: 1, value: 8 },
      { key: "histogram", label: "Include histograms in the report", type: "checkbox", value: true }
    ],
    maxFiles: 5,
    outputs: ["report", "image"],
    howTo: [
      "Upload an image. Bench downsamples it for analysis without altering the original.",
      "Choose how many palette colours to extract; median-cut quantisation groups similar pixels.",
      "Review hex values, RGB values and relative shares, and inspect the luminance histogram.",
      "Download the palette report or a swatch image."
    ],
    limitations: "Median-cut palettes are representative, not perceptually perfect; flat graphics give cleaner results than photos. The histogram counts decoded pixels after EXIF orientation is applied. Colour values are sRGB canvas values and are not converted from embedded ICC profiles.",
    useCases: ["Pull a brand palette from a photo.", "Choose matching colours for a design.", "Inspect whether an image is mostly dark or blown out."]
  }));

  /* ----------------------------------------------------------- create & develop */

  TOOLS.push(T({
    id: "favicon",
    name: "Favicon & App Icon Generator",
    category: "create",
    handler: "favicon",
    summary: "Generate 16, 32, 48, 96, 180, 192 and 512 px PNG icons, a multi-entry ICO and a web manifest snippet from one square image.",
    keywords: ["favicon generator", "app icon", "ico generator", "apple touch icon", "png icons"],
    options: ICON_OPTIONS,
    outputs: ["zip"],
    howTo: [
      "Upload a square logo or photo. Non-square images are centred on the chosen canvas.",
      "Set the canvas size, padding, corner radius and background colour.",
      "Run the generator. Every icon is rendered at its real target size, not scaled up from one bitmap.",
      "Download the ZIP with the PNGs, favicon.ico and a manifest snippet."
    ],
    limitations: "The ICO contains PNG-compressed entries, which modern browsers and Google accept. It does not create a multi-resolution legacy BMP icon for very old Windows versions. Icons are raster output, not a vector redesign, and a detailed logo may lose clarity at 16 px.",
    useCases: ["Create a complete favicon set for a new site.", "Make an Apple touch icon.", "Produce app icons from a square brand mark."]
  }));

  TOOLS.push(T({
    id: "og-image",
    name: "Open Graph Image Generator",
    category: "create",
    handler: "ogImage",
    summary: "Compose a 1200 x 630 social preview card from an image with a headline, subtitle, overlay and accent bar.",
    keywords: ["open graph image", "social preview", "og image generator", "twitter card", "1200x630"],
    options: OG_OPTIONS,
    outputs: ["image"],
    howTo: [
      "Upload a background image.",
      "Enter the headline and subtitle, then choose left or centred alignment.",
      "Adjust the dark overlay so the text stays readable over the image.",
      "Run the export and download the 1200 x 630 PNG or JPEG."
    ],
    limitations: "The output is a single 1200 x 630 card; Twitter/X may crop previews differently. Text wrapping is automatic but long headlines can shrink or clip. The tool does not upload the result or validate how a specific social network will render it.",
    useCases: ["Create a link preview for a blog post.", "Make a consistent social card for a product page.", "Produce a readable preview over a dark photo."]
  }));

  TOOLS.push(T({
    id: "qr-code",
    name: "QR Code Generator",
    category: "create",
    handler: "qrCode",
    requiresFile: false,
    summary: "Generate a real QR code for text or a URL with size, quiet zone, colours and error-correction control, as PNG or SVG.",
    keywords: ["qr code generator", "make qr code", "url qr", "qr png", "qr svg"],
    options: QR_OPTIONS,
    outputs: ["image", "text"],
    howTo: [
      "Type or paste the text or URL to encode. No image upload is needed.",
      "Set the output size, quiet-zone margin, colours and error-correction level.",
      "Generate and scan the preview with your phone before publishing.",
      "Download the PNG, and optionally a crisp SVG for print."
    ],
    limitations: "The encoded content is public by design. Very long text creates a dense QR code that may be hard to scan at small sizes. Error correction raises recoverability but also density. Use a high-contrast foreground/background pair and keep the quiet zone intact.",
    useCases: ["Create a QR code for a menu or landing page.", "Add a scannable link to a poster.", "Generate a print-quality SVG code."]
  }));

  TOOLS.push(T({
    id: "qr-decode",
    name: "QR Code Reader",
    category: "create",
    handler: "qrDecode",
    summary: "Decode a QR code from a screenshot or photo locally in the browser, with no image upload.",
    keywords: ["qr code reader", "scan qr from image", "decode qr", "read qr screenshot"],
    options: [],
    maxFiles: 5,
    outputs: ["report"],
    howTo: [
      "Upload a screenshot or photo containing a QR code.",
      "Bench locates and decodes the code locally.",
      "Read the decoded text or copy it.",
      "If no code is found, crop closer to the code or improve contrast and try again."
    ],
    limitations: "Decoding works best on sharp, front-facing screenshots. Blur, perspective, glare, tiny codes and stylised codes can fail. The tool does not follow the decoded URL, which avoids turning a QR scan into an unwanted network request. It decodes QR only, not barcodes.",
    useCases: ["Read a QR code from a screenshot.", "Recover a link from a photo without opening it.", "Check what a printed code contains."]
  }));

  TOOLS.push(T({
    id: "barcode",
    name: "Barcode Generator",
    category: "create",
    handler: "barcode",
    requiresFile: false,
    summary: "Generate CODE128, EAN-13, EAN-8, CODE39 or UPC-A barcodes as real PNG images with validation.",
    keywords: ["barcode generator", "code128", "ean13", "upc barcode", "barcode png"],
    options: BARCODE_OPTIONS,
    outputs: ["image"],
    howTo: [
      "Enter the value and choose the barcode format.",
      "Set bar width, height, colours and whether to show the value.",
      "Generate; invalid checksums or characters are reported instead of drawing a misleading code.",
      "Download the PNG and verify it with the scanner used by your workflow."
    ],
    limitations: "The tool generates barcodes but does not read them. EAN/UPC check digits are validated but not certified by GS1. Code 128 support covers the browser library's standard character set. Always test a generated barcode with the actual scanner before printing a production run.",
    useCases: ["Make an internal asset label.", "Create an EAN-13 graphic from a valid number.", "Produce a CODE128 barcode for a shipping label."]
  }));

  TOOLS.push(T({
    id: "svg-optimizer",
    name: "SVG Optimizer & Validator",
    category: "create",
    handler: "svgOptimize",
    summary: "Remove scripts, event handlers and dangerous URLs, validate basic SVG structure, and minify markup for safer embedding.",
    keywords: ["svg optimizer", "svg minifier", "svg sanitizer", "clean svg", "svg validator"],
    options: SVG_OPTIONS,
    inputs: ["SVG"],
    outputs: ["text"],
    maxFiles: 10,
    howTo: [
      "Upload SVG files or paste is not required; the tool uses file input.",
      "Bench rejects scripts, foreignObject, inline event handlers and javascript:/data URLs in links.",
      "Choose minification and comment removal.",
      "Download the cleaned SVG. The report shows removed elements and the before/after size."
    ],
    limitations: "Sanitising is defensive cleanup, not a formal security audit. Complex SVG features such as external references, embedded fonts and animation are not optimised and may be removed or preserved conservatively. This is an optimiser and sanitiser, not a vector tracer, and it never turns a raster image into true vectors.",
    useCases: ["Remove unsafe markup before publishing an SVG.", "Reduce a hand-authored SVG's size.", "Check why an SVG fails to render."]
  }));

  TOOLS.push(T({
    id: "placeholder",
    name: "Image Placeholder Generator",
    category: "create",
    handler: "placeholder",
    requiresFile: false,
    summary: "Generate clean SVG or PNG placeholders with exact dimensions, custom colours and a label.",
    keywords: ["image placeholder", "placeholder generator", "dummy image", "svg placeholder", "mockup image"],
    options: PLACEHOLDER_OPTIONS,
    outputs: ["image", "text"],
    howTo: [
      "Enter the width, height and label.",
      "Choose background and text colours.",
      "Generate an SVG for sharp scaling or a PNG for compatibility.",
      "Download and drop it into a layout or prototype."
    ],
    limitations: "The SVG is a simple rectangle and text, not a photograph or a design template. The PNG is rendered at the requested size and can become large at very high dimensions. Text uses the browser's sans-serif font, so exact brand typography is not guaranteed.",
    useCases: ["Reserve layout space while a photo is pending.", "Create a mockup image of the right ratio.", "Generate a labelled test asset."]
  }));

  TOOLS.push(T({
    id: "srcset",
    name: "Responsive Image srcset Generator",
    category: "create",
    handler: "srcset",
    summary: "Generate multiple resized WebP, JPEG or PNG widths plus a ready-to-use srcset and sizes snippet.",
    keywords: ["srcset generator", "responsive images", "image widths", "webp srcset", "retina images"],
    options: SRCSET_OPTIONS,
    maxFiles: 10,
    outputs: ["zip", "text"],
    howTo: [
      "Upload one or more images and list the widths you need.",
      "Choose WebP for modern sites or JPEG/PNG for compatibility.",
      "Run the generator. Widths larger than the source are skipped rather than upscaled.",
      "Download the ZIP and paste the generated srcset markup into your HTML."
    ],
    limitations: "The tool generates width descriptors only, not art-directed picture elements with separate crops. It does not upload files to a CDN or rewrite URLs. Generated HTML must be adjusted to your own file paths and loading strategy.",
    useCases: ["Prepare responsive image variants for a static site.", "Create WebP widths for a blog.", "Generate the srcset attribute without hand-resizing."]
  }));

  /* --------------------------------------------------------------- animation & batch */

  TOOLS.push(T({
    id: "gif-studio",
    name: "GIF Studio: Create & Extract",
    category: "animation",
    handler: "gif",
    summary: "Build an animated GIF from a sequence of images, or extract every frame from an existing GIF, with frame delay and resize controls.",
    keywords: ["gif maker", "images to gif", "gif frame extractor", "animated gif", "gif resize"],
    options: GIF_OPTIONS,
    maxFiles: 30,
    inputs: ["JPEG", "PNG", "WebP", "GIF", "BMP"],
    outputs: ["image", "zip"],
    howTo: [
      "For create mode, add images in playback order and set the delay between frames.",
      "Choose an output width and palette size. Smaller palettes produce smaller GIFs.",
      "For extract mode, upload one animated GIF and run; every decoded frame is exported as a PNG in a ZIP.",
      "Preview the result and confirm the frame order before publishing."
    ],
    limitations: "GIF is limited to 256 colours and has no alpha gradients, so photos can show banding. Create mode uses a fresh palette per frame and does not perform inter-frame optimisation, so files can be larger than specialised tools. Extract mode reads standard GIF frames; unusual or corrupt files may fail with a clear error. There is no video-to-GIF conversion.",
    useCases: ["Turn a short image sequence into an animation.", "Recover frames from a GIF.", "Make a lightweight reaction animation."]
  }));

  TOOLS.push(T({
    id: "sprite-sheet",
    name: "Sprite Sheet Generator",
    category: "animation",
    handler: "spriteSheet",
    summary: "Pack images into an evenly spaced sprite sheet with a generated CSS background-position snippet.",
    keywords: ["sprite sheet", "css sprite", "sprites generator", "animation frames", "texture atlas"],
    options: SPRITE_OPTIONS,
    maxFiles: 30,
    outputs: ["image", "text"],
    howTo: [
      "Add the frames in the order they should appear.",
      "Set columns, cell size and gap. Images are scaled into square cells.",
      "Generate the sheet and the matching CSS.",
      "Download the PNG and copy the CSS snippet into your stylesheet."
    ],
    limitations: "All cells are square and the same size; images are contained, not cropped. The generated CSS assumes the exact column count and cell size shown in the report. There is no packed/irregular atlas or JSON texture-map export.",
    useCases: ["Create a simple CSS animation sprite.", "Pack UI icons into one request.", "Build a game prototype sheet."]
  }));

  TOOLS.push(T({
    id: "batch-rename",
    name: "Batch Rename & Export",
    category: "animation",
    handler: "batchRename",
    summary: "Rename a batch of images with a numbered pattern and optionally convert format, then download everything as a ZIP.",
    keywords: ["batch rename images", "bulk rename photos", "export images zip", "sequential filenames"],
    options: RENAME_OPTIONS,
    maxFiles: LIMITS.maxFiles,
    outputs: ["zip"],
    howTo: [
      "Add images in the order they should be numbered.",
      "Enter a pattern such as product-{n}; {n} is replaced with a zero-padded sequence.",
      "Choose keep-source or a conversion format.",
      "Run the batch and download the ZIP. Duplicate or unsafe names are sanitised automatically."
    ],
    limitations: "Renaming happens only inside the ZIP download; files on your disk are not modified. Sequence numbers are assigned in the listed order. The ZIP is generated in browser memory and should be kept under the batch limits.",
    useCases: ["Rename product photos for an upload form.", "Create a numbered photo sequence.", "Standardise a mixed-format batch."]
  }));

  /* ----------------------------------------------------------------- diagnostics */

  TOOLS.push(T({
    id: "inspection",
    name: "Image Inspector & Diagnostics",
    category: "diagnostics",
    handler: "diagnose",
    summary: "Check real file signatures, decodability, dimensions, transparency, orientation and compression advice, and get a plain-English failure diagnosis.",
    keywords: ["image inspector", "why image not opening", "image diagnostics", "transparency checker", "compression recommendation"],
    options: [],
    maxFiles: 10,
    outputs: ["report"],
    howTo: [
      "Upload the file that is causing trouble.",
      "Bench sniffs the signature independently of the extension and attempts a real decode.",
      "Read dimensions, transparency, orientation, profile presence and a compression recommendation.",
      "If decoding fails, the report explains whether the container is malformed, unsupported or simply not an image."
    ],
    limitations: "This is inspection and heuristic advice, not forensic verification or guaranteed repair. It does not parse every vendor-specific chunk, and a successful decode does not prove that a file is free of hidden corruption. Compression advice is based on format and pixel count, not a visual quality judgment.",
    useCases: ["Diagnose a file that a website rejects.", "Check whether a PNG really has transparency.", "Decide whether re-encoding will help."]
  }));

  TOOLS.push(T({
    id: "recovery",
    name: "Corruption Recovery (Best Effort)",
    category: "diagnostics",
    handler: "recover",
    status: "experimental",
    summary: "Attempt a best-effort decode and re-encode of a damaged image, with an honest report when recovery is impossible.",
    keywords: ["repair corrupt image", "recover damaged jpg", "image recovery", "corrupt png", "best effort repair"],
    options: [
      { key: "format", label: "Recovered output format", type: "select", value: "png",
        options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }] },
      QUALITY
    ],
    outputs: ["image", "report"],
    howTo: [
      "Upload the damaged image.",
      "Bench checks the file signature and asks the browser decoder to decode it.",
      "If a partial or complete image can be decoded, it is re-encoded without the damaged container structure.",
      "If decoding fails, no output is invented; the report explains the failure and suggests alternate recovery paths."
    ],
    limitations: "Experimental and strictly best effort. This tool cannot reconstruct missing pixel data, repair truncated entropy streams or guarantee recovery. It re-encodes whatever the browser can decode, so some corruption is simply discarded. Keep the original file and never rely on a repaired copy as the only version.",
    useCases: ["Salvage an image that partially opens.", "Normalise a file with a damaged header.", "Get a clear explanation when recovery is impossible."]
  }));

  TOOLS.push(T({
    id: "photo-signature",
    name: "Photo & Signature Composition",
    category: "resize",
    handler: "composePhotoSignature",
    status: "experimental",
    summary: "Combine an application photo and a signature into one canvas with a configurable layout and export size.",
    keywords: ["photo signature combine", "application photo signature", "merge photo and signature", "signature composition"],
    options: [
      { key: "layout", label: "Layout", type: "select", value: "stacked",
        options: [{ value: "stacked", label: "Photo above signature" }, { value: "side", label: "Photo left, signature right" }] },
      { key: "canvasWidth", label: "Canvas width (px)", type: "number", min: 120, max: 4000, step: 1, value: 600 },
      { key: "gap", label: "Gap (px)", type: "number", min: 0, max: 200, step: 1, value: 20 },
      { key: "background", label: "Background colour", type: "color", value: "#ffffff" },
      { key: "format", label: "Output format", type: "select", value: "jpeg",
        options: [{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }] },
      QUALITY
    ],
    maxFiles: 2,
    outputs: ["image"],
    howTo: [
      "Add exactly two images: the photo first, then the signature.",
      "Choose stacked or side-by-side and set the canvas width and gap.",
      "Run the composition. Each source is contained without distortion.",
      "Download the combined image and verify it against the portal's instructions."
    ],
    limitations: "Experimental convenience tool: it does not detect faces, crop to official ratios or guarantee that a combined image will be accepted. Use the application preset tool first if exact photo and signature dimensions are required. The output is one combined raster image.",
    useCases: ["Assemble a photo and signature for a practice form.", "Create a single reference image for an application file.", "Combine two scans without a desktop editor."]
  }));

  /* ------------------------------------------------------- unavailable / deferred */
  /* These entries exist so the catalogue and documentation are honest. No page is
     generated and no upload control is shown for a status other than implemented
     or experimental. */

  TOOLS.push(T({ id: "ocr", name: "Image to Text OCR", category: "documents", status: "deferred", requiresFile: false, summary: "Local OCR for screenshots and scanned documents.", reason: "An OCR engine and language pack are not bundled. Shipping Tesseract.js with an English model adds roughly 10-15 MB to the static deployment and needs a dedicated loading, cancellation and accuracy test pass. Deferred rather than faked." }));
  TOOLS.push(T({ id: "searchable-pdf", name: "Searchable PDF", category: "documents", status: "deferred", summary: "OCR a scan and add an invisible text layer to a PDF.", reason: "Depends on the OCR engine and a PDF text-layer writer. Neither is available in the current dependency set." }));
  TOOLS.push(T({ id: "pdf-to-image", name: "PDF to Image", category: "convert", status: "deferred", summary: "Rasterise PDF pages to PNG or JPEG.", reason: "PDF decoding requires PDF.js or a server engine. Adding a full PDF renderer for one tool was not justified in this build." }));
  TOOLS.push(T({ id: "heic-convert", name: "HEIC / HEIF Converter", category: "convert", status: "deferred", summary: "Decode iPhone HEIC photos in the browser.", reason: "No HEIC decoder is bundled. Browser support is inconsistent and libheif adds a large WASM payload; files are rejected with an explanation instead of producing a broken output." }));
  TOOLS.push(T({ id: "video-to-gif", name: "Video to GIF", category: "animation", status: "deferred", summary: "Convert a short video clip into an animated GIF.", reason: "Requires video seeking, frame extraction and a bounded duration workflow. Image-only GIF tools are implemented; video decoding is deferred." }));
  TOOLS.push(T({ id: "barcode-read", name: "Barcode Reader", category: "create", status: "deferred", summary: "Read CODE128/EAN/UPC barcodes from images.", reason: "The bundled QR decoder does not read 1D barcodes. A separate decoder was not added without a tested implementation." }));
  TOOLS.push(T({ id: "html-to-image", name: "HTML to Image", category: "create", status: "deferred", summary: "Render safe HTML into an image.", reason: "Requires an HTML/CSS rasteriser with strict sanitisation. Deferred to avoid an unsafe rendering surface." }));
  TOOLS.push(T({ id: "vector-trace", name: "Raster to SVG Vector Trace", category: "create", status: "deferred", summary: "Trace a bitmap into editable vector paths.", reason: "Not implemented. Bench does not embed a raster image inside SVG and call it vector tracing." }));
  TOOLS.push(T({ id: "cmyk", name: "CMYK / ICC Conversion", category: "metadata", status: "deferred", summary: "Profile-aware CMYK to RGB and RGB to CMYK conversion.", reason: "Canvas is sRGB and does not expose colour-managed CMYK transforms. A correct implementation needs a colour-management engine and profile handling." }));
  TOOLS.push(T({ id: "url-inspector", name: "Image URL Inspector", category: "diagnostics", status: "deferred", summary: "Inspect a remote image by URL.", reason: "Remote fetching would create SSRF and CORS risks, and the project has no isolated fetch service. The tool is intentionally unavailable." }));

  const AI_REASON = "No inference provider is configured. Bench does not simulate AI results, and the project has no funded GPU endpoint. The provider adapter interface is present so a vetted local or hosted model can be added without changing the tool registry.";
  [
    ["background-remover", "AI Background Remover", "Remove a subject's background and create transparency."],
    ["background-replace", "AI Background Replacement", "Replace a background with a colour, gradient or image."],
    ["object-removal", "AI Object Removal / Inpainting", "Erase an object and reconstruct the surrounding pixels."],
    ["upscale", "AI Image Upscaler", "Increase resolution with a learned upscaling model."],
    ["denoise-restore", "AI Denoise & Restore", "Reduce noise, deblur and restore old photos."],
    ["colorize", "AI Photo Colorization", "Add plausible colour to a black-and-white photo."],
    ["low-light", "AI Low-Light Enhancement", "Lift exposure while limiting noise."],
    ["portrait-blur", "AI Portrait Background Blur", "Detect a portrait and blur its background."],
    ["product-enhance", "AI Product Photo Enhancement", "Clean a product image for a catalogue."],
    ["face-enhance", "AI Face Enhancement", "Restore facial detail at small sizes."],
    ["caption", "AI Caption & Alt Text", "Generate a description or accessible alt text for an image."]
  ].forEach(function (row) {
    TOOLS.push(T({
      id: row[0], name: row[1], category: "ai", status: "unavailable",
      summary: row[2], reason: AI_REASON, requiresFile: true
    }));
  });

  const byId = {};
  TOOLS.forEach(function (t) {
    byId[t.id] = t;
  });

  function getTool(id) {
    return byId[id] || null;
  }

  function isPublicTool(tool) {
    return tool && (tool.status === "implemented" || tool.status === "experimental");
  }

  return {
    SITE_URL: SITE_URL,
    SITE_NAME: SITE_NAME,
    LIMITS: LIMITS,
    CATEGORIES: CATEGORIES,
    TOOLS: TOOLS,
    PRESETS: PRESETS,
    getTool: getTool,
    isPublicTool: isPublicTool,
    publicTools: function () { return TOOLS.filter(isPublicTool); },
    categoriesWithTools: function () {
      return CATEGORIES.filter(function (c) {
        return TOOLS.some(function (t) { return t.category === c.id && isPublicTool(t); });
      });
    }
  };
});
