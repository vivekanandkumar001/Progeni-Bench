# Audit tooling

Developer-only scripts used to audit the built site. None of these run as part of
`npm run build` or `npm test`; run them manually from the repository root after a
build (`npm run build`).

| Script | Purpose |
| --- | --- |
| `crawl.js` | Crawl every sitemap URL in Chromium and record console/page errors, HTTP status, title/H1 and canonical issues. |
| `check-ui.js` | Static + rendered UI checks against `dist/`. |
| `check-ux.js` | Accessibility checks: labels, accessible names, image `alt`, console errors. |
| `check-handlers.js` | Verify every registered audio tool has a matching handler. |
| `check-audio-pages.js` | SEO audit of generated audio pages (titles/descriptions). |
| `chars.js` | Report non-ASCII characters in the built pages. |
| `collect-copy.js` | Capture rendered page copy for review. |
| `copy-checks.js` | Validate the captured copy corpus. |
| `build-image-seo.js` / `build-seodesc.js` | Generate validated SEO overrides for the image/audio registries. |
| `apply-seodesc*.js` | Apply reviewed SEO overrides to the registries. |
| `dump-tools.js` | Dump the audio registry for inspection. |

Most browser scripts expect the built site on `http://localhost:3000`:

```bash
npm run build
node scripts/serve.js 3000 dist
node scripts/audit/crawl.js
```

The browser audits import `playwright`, which is installed transitively through
`@playwright/test`. Generated reports (`*.json`) stay in this folder and are not
part of the production bundle.
