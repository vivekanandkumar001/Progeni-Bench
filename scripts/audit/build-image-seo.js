/*
 * Fixes the pre-existing image-toolkit SEO defects reported by verify.js C35:
 *   - 7 seoTitle values were longer than 60 characters;
 *   - 31 seoDescription values were outside the required 120-155 character
 *     range (they were copied from the shorter "summary" field).
 *
 * The rewrites are hand-written, unique, faithful to each tool's real
 * capabilities and the same voice as the rest of the registry. Output is
 * validated here and then written to scripts/audit/image-seo-final.json for
 * the applier step. Run: node scripts/audit/build-image-seo.js
 */
const fs = require('fs');
const path = require('path');
const C = require('../../image-tools.config.js');

// Titles shortened to <= 60 chars. Keys are tool ids. Note: verify.js measures
// the *HTML-escaped* title, so "&" costs 4 extra characters ("&amp;").
const titles = {
  'application-photo': 'Application Photo & Signature | Bench',
  'social-resize': 'Social & YouTube Image Sizes | Bench',
  'border-padding': 'Border, Padding & Corners | Bench',
  'product-shadow': 'Product Shadow & Background | Bench',
  'duplicate-finder': 'Duplicate Photo Finder | Bench',
  'srcset': 'Responsive srcset Generator | Bench',
  'recovery': 'Corruption Recovery | Bench',
  'base64': 'Base64 & Data URI Converter | Bench',
  'annotate': 'Text, Captions & Annotations | Bench',
  'splitter': 'Image Splitter & Grid Cutter | Bench',
  'favicon': 'Favicon & App Icon Generator | Bench',
  'gif-studio': 'GIF Studio: Create & Extract | Bench',
  'inspection': 'Image Inspector & Diagnostics | Bench',
  'photo-signature': 'Photo & Signature Composition | Bench'
};

// Descriptions rewritten to 120-155 chars.
const descs = {
  compress: 'Shrink JPEG, PNG, WebP and AVIF images with real before and after sizes. Drop several files at once and compress the whole batch in one pass.',
  resize: 'Resize images by pixels or percentage with aspect-ratio lock, fit, fill or stretch modes, plus optional batch output for many files at once.',
  crop: 'Crop any image with a percentage box, fixed aspect ratios, rounded corners or a true circular crop with transparent corners, then export as PNG or JPEG.',
  'social-resize': 'Crop and export images for YouTube thumbnails and banners, Instagram, Facebook, LinkedIn, X and other presets with exact pixel dimensions.',
  dpi: 'Read the embedded DPI or PPI of PNG and JPEG files, inspect real pixel dimensions, and write a corrected DPI copy without resampling the image.',
  'image-to-pdf': 'Combine JPEG, PNG, WebP or rasterised SVG images into a single PDF, with one page per image or each image fitted neatly to A4 or Letter.',
  base64: 'Encode an image to Base64 or a full data URI for embedding in code, or decode Base64 back into a real, decodable image file you can download.',
  'blur-redact': 'Blur, pixelate or paint over a rectangular region to hide faces, numbers or private details. The image is never uploaded and nothing is stored.',
  annotate: 'Add a caption, label, callout text or a solid caption bar to an image with real canvas rendering, configurable colour, size and placement.',
  'border-padding': 'Add a border, outer padding, rounded corners, a solid or gradient canvas and an optional drop shadow to frame any image cleanly.',
  watermark: 'Add visible text watermarks with configurable placement, opacity, rotation, tiling across the image and colour, exported as a flattened image.',
  meme: 'Turn any image into a classic top and bottom caption meme with outlined Impact-style text, local processing and an instant download with no upload.',
  collage: 'Arrange several images into a clean grid collage with configurable columns, gap, background colour and output width, then download the result.',
  splitter: 'Split an image or a scanned page into a rows by columns grid of equal tiles and download every tile together in a single ZIP archive.',
  merge: 'Merge two or more images horizontally or vertically into one strip with an optional gap and background colour, useful for comparisons and receipts.',
  compare: 'Compare two images visually and numerically with dimensions, exact SHA-256 hashes and a perceptual similarity score, all computed locally.',
  'product-shadow': 'Place a product cut-out on a clean background with padding, rounded corners and a soft realistic drop shadow for marketplace listings.',
  'scan-cleanup': 'Turn phone photos of documents into cleaner grayscale or binarised pages and correct a manually measured tilt before you export.',
  'image-hash': 'Generate an exact SHA-256 hash plus perceptual average and difference hashes for image identity, deduplication and similarity checks.',
  palette: 'Extract a dominant colour palette with hex values, inspect RGB and luminance histograms, and sample exact colours from anywhere in an image.',
  'og-image': 'Compose a 1200 by 630 social preview card from an image with a headline, subtitle, dark overlay and an accent bar for Open Graph sharing.',
  'qr-code': 'Generate a real QR code for text or a URL with size, quiet zone, foreground and background colours and error-correction level, as PNG or SVG.',
  'qr-decode': 'Decode a QR code from a screenshot or photo entirely in your browser, with no upload, and read the exact text or URL it contains.',
  barcode: 'Generate CODE128, EAN-13, EAN-8, CODE39 or UPC-A barcodes as real PNG or SVG images with built-in checksum validation for each symbology.',
  'svg-optimizer': 'Remove scripts, event handlers and dangerous URLs, validate basic SVG structure, and minify the markup for safer, smaller embedding.',
  placeholder: 'Generate clean SVG or PNG placeholder images with exact dimensions, custom background and text colours, and an optional centred label.',
  srcset: 'Generate several resized WebP, JPEG or PNG widths plus a ready-to-paste srcset and sizes snippet for responsive, faster-loading pages.',
  'sprite-sheet': 'Pack several images into an evenly spaced sprite sheet and get a generated CSS background-position snippet for each frame automatically.',
  'batch-rename': 'Rename a batch of images with a numbered pattern and optionally convert the format, then download every file together as a single ZIP.',
  recovery: 'Attempt a best-effort decode and re-encode of a damaged image, with an honest report and clear reasons when recovery is not possible.',
  'photo-signature': 'Combine an application photo and a signature into one canvas with a configurable layout, spacing and export dimensions for forms.'
};

const pub = C.TOOLS.filter(t => t.status === 'implemented' || t.status === 'experimental');
const finalTitles = {};
const finalDescs = {};
const problems = [];

// verify.js measures the title exactly as escaped into the HTML document.
function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

pub.forEach(t => {
  const title = titles[t.id] || t.seoTitle || `${t.name} | Bench Image Toolkit`;
  const desc = descs[t.id] || t.seoDescription || t.summary;
  if (esc(title).length > 60) problems.push(`${t.id} title escaped ${esc(title).length}`);
  if (!desc || desc.length < 120 || desc.length > 155) problems.push(`${t.id} desc ${desc ? desc.length : 0}`);
  if (/["\\]/.test(title) || /["\\]/.test(desc)) problems.push(`${t.id} quote/backslash`);
  finalTitles[t.id] = title;
  finalDescs[t.id] = desc;
});

// Uniqueness across the whole public set.
const seenT = new Set(), seenD = new Set();
Object.keys(finalTitles).forEach(k => { if (seenT.has(finalTitles[k])) problems.push('dup title ' + k); seenT.add(finalTitles[k]); });
Object.keys(finalDescs).forEach(k => { if (seenD.has(finalDescs[k])) problems.push('dup desc ' + k); seenD.add(finalDescs[k]); });

if (problems.length) {
  console.log('PROBLEMS:');
  problems.forEach(p => console.log('  -', p));
  process.exit(1);
}

console.log(`validated ${pub.length} image titles (<=60) and descriptions (120-155), all unique`);
fs.writeFileSync(path.join(__dirname, 'image-seo-final.json'), JSON.stringify({ titles: finalTitles, descs: finalDescs }, null, 2));
console.log('written scripts/audit/image-seo-final.json');
