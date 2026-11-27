# PDF Page Manager

The PDF Page Manager at `/tools/pdf-page-manager/` edits PDFs entirely in the
browser. It uses the repository's same-origin PDF.js 3.11.174 bundle to read
documents and render thumbnails, and pdf-lib 1.17.1 to assemble and validate
the downloadable PDF. Both libraries are already included in the project;
pdf-lib is pinned to its exact version in `package.json` and the lockfile.
PDF.js is Apache-2.0 licensed and pdf-lib is MIT licensed; the build copies
their license texts alongside their vendor bundles.

## Use

1. Open **PDF Page Manager** from the Bench tool directory and choose or drop a
   PDF.
2. Select pages and reorder them by dragging or using the keyboard-accessible
   move controls. Delete, duplicate, insert blank/image pages, or choose a
   second PDF to insert selected pages or append the whole document.
3. Undo, redo, or reset edits; export and download the validated PDF.

The original files are unchanged. All PDF/image bytes and export data stay in
browser memory; the tool does not make a PDF-processing request, use
localStorage/IndexedDB, or send document contents to analytics.

## Limits and compatibility

- Main PDF: 50 MB and 150 pages. Secondary PDF: 30 MB and 150 pages.
- Edited output: 250 pages and 200 MB. Inserted PNG/JPEG files: 20 MB each,
  40 MB combined, and at most 40 million decoded pixels per image.
- Password-protected/encrypted PDFs are unsupported. Image insertion supports
  PNG and JPEG.
- Export reconstructs the document from pages. Editing invalidates digital
  signatures, and links, annotations, bookmarks, forms, metadata, layers, and
  other advanced features may be lost. Compare the exported file if those
  features matter. The exporter validates page count, page dimensions, and
  rotation, but cannot guarantee preservation of every PDF feature.

## Development and deployment

From the `bench` directory run:

```powershell
npm run build
npm test
npx playwright test --project=chromium tests/pdf-page-manager.e2e.spec.js
npm start
```

Deploy the generated `dist/` directory using the existing Bench static-site
deployment process on Cloudflare Pages. No backend or new
environment variables are required. The build generates the tool route and
copies the local editor script; PDF processing libraries are served from the
existing `/vendor/` assets.
