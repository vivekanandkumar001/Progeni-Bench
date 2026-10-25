# SEO, GEO and AEO

This repository builds a static site. Search and answer engines only see what
the generators write into `dist/`, so all discoverability work happens at build
time in `build_seo_pages.js`, `image-pages.js`, `audio-pages.js` and
`scripts/seo.js`.

## Terms

- **SEO** — classic search indexing: titles, descriptions, canonicals, sitemaps,
  internal links and crawl rules.
- **GEO** — generative engine optimisation: complete, citable facts and
  machine-readable files that a language model can quote without guessing.
- **AEO** — answer engine optimisation: one clear answer near the top of each
  page plus structured data that describes the same answer.

## What every indexable page gets

1. A title of 60 characters or fewer and a unique description of 120–155
   characters.
2. One `<h1>`, a self-referencing canonical URL and valid Open Graph/Twitter
   tags, including image dimensions and alt text.
3. `index, follow, max-image-preview:large` robots directives.
4. An answer-first `.quick-answer` block with a short answer and a `.key-facts`
   definition list.
5. Schema.org JSON-LD: `Organization`, `WebSite`, `WebPage`,
   `BreadcrumbList`, `WebApplication`, `HowTo`, `FAQPage` and a
   `SpeakableSpecification` for the answer block.
6. `<link rel="alternate" type="text/plain">` discovery links to `/llms.txt`
   and `/llms-full.txt`.
7. Internal links back to the relevant toolkit hub and sibling tools.

Experimental pages keep `noindex, follow` and stay out of the sitemap.

## Machine-readable files

- `llms.txt` — a hand-curated short summary with quick answers, tool groups and
  citation guidance.
- `llms-full.txt` — generated from the same registries as the HTML. It lists
  every public tool, its URL, status, inputs/outputs, how-to steps, limits,
  privacy note and FAQ. It is written to the repository root and to `dist/`.
- `sitemap.xml` — the exact set of indexable canonical URLs.
- `robots.txt` — allows all crawlers and explicitly names major search and AI
  crawlers. The `Sitemap:` line must stay exactly
  `Sitemap: https://bench.progeni.live/sitemap.xml`.

## Truthfulness rules

- Never publish ratings, review counts, user counts, certifications or
  guarantees that the project cannot support.
- Describe PDF Translator as local PDF processing with extracted text sent to
  DeepL. Do not describe it as a fully offline tool.
- Label experimental tools as experimental and quote their documented limits.
- Keep counts derived from the registries. Do not hardcode totals in templates.

## Adding or changing a tool

1. Edit `site.config.js` or the matching `*-tools.config.js` registry.
2. Run `npm run build`. Generated pages and `llms-full.txt` update themselves.
3. Run `npm run verify`. Checks `C35`–`C49` cover titles, descriptions, schema,
   sitemap/canonical equality, answer blocks, AI discovery files and truthful
   structured data.
4. Update `llms.txt` by hand only when the short summary or counts change.

## Verification

```bash
npm run build
npm test
npm run verify
```

`C47` requires an answer block and key facts on indexable tool and hub pages.
`C48` checks `llms.txt`, `llms-full.txt`, robots allowances and discovery links.
`C49` checks social-card completeness and the absence of unsupported claims.
