# Progeni Bench — UI & Project Audit

Date: 2026-10-19
Scope: `index.html`, `styles.css`, `app.js`, `utils.js`, the 9 studio modules, `tools/*`, `about|contact|privacy|terms|404`, build/deploy config, tests, SEO assets, docs.
Method: static inspection + targeted verification of source lines. Findings below marked **[verified]** were re-read in source during this audit.

---

## P0 — Broken, shipping defects

### 1. SPA navigation from the home page breaks every studio tool **[verified]**
`index.html:54-56` loads only `site.config.js`, `utils.js`, `app.js` — none of the 9 studio scripts. But `app.js:1183-1193` intercepts in-app link clicks and re-routes client-side via `route()` → `toolPage()`, which calls `window.StickerStudio.mount(...)` etc. directly (`app.js:907, 916, 930, 943, 956, 969, 1000, 1058, 1070`) with no existence guard. On the home page these globals are `undefined` → `TypeError` and a blank tool body. Only a hard reload of `tools/*/index.html` works.
**Fix:** load studios on every page, or guard + dynamically import inside `toolPage()`.

### 2. `ReferenceError: seen is not defined` — Bookmark Cleaner **[verified]**
`app.js:233, 236` use `seen.has/add/size`, but no `seen` set is declared in that `case` block (compare `calendar-cleaner` which declares `const seen = new Set()` at `:241`). Every run throws; user sees a JS error instead of cleaned bookmarks.

### 3. Video Thumbnails / Silence Map crash on load **[verified]**
`app.js:994` (`rs.innerHTML = html`) is inside `toolPage()`, where `rs` is not in scope (`rs` exists only locally in `processTool`, `:203`). Both tools throw before the studio ever mounts.

### 4. vCard tool: crashes on phone numbers, dead buttons, unhandled rejection **[verified]**
- `app.js:662` stores `{ index, phones }`, then `:679` does `group.members.push(i)` while `group.members` is `undefined` → throws for typical `.vcf` files.
- `selectContact()` / `mergeContact()` / `keepContact()` referenced at `:709, 713, 714` are defined nowhere in the repo → buttons throw.
- Called without `await` at `app.js:336`, so the rejection is unhandled and the UI stays on "Processing…".

### 5. CSV Date ambiguity handler is dead and silently corrupts dates **[verified]**
- `app.js:618` `onclick="confirmAmbiguous()"` — function does not exist anywhere.
- `app.js:625` normalizes all rows immediately via `normalizeDate(v, fmt)`, applying US interpretation regardless of the `#resolveAmbiguous` selection (`:613-617`). The "Ask per cue" option is dead UI.

### 6. DOM XSS in the CSV Date preview **[verified]** (High→P0 on a static app)
`app.js:604` interpolates raw CSV cell text into HTML via `` <code>${a.original}</code> ``, inserted with `insertAdjacentHTML` at `:623`. A crafted CSV like `<img src=x onerror=alert(1)>` executes in-origin. `_headers:5` allows `script-src 'self' 'unsafe-inline'`, so inline handlers are not blocked.

### 7. SPA router wipes server-rendered legal/about/contact content **[verified]**
`app.js:1167-1171` routes `/about`, `/privacy`, `/terms`, `/contact` to `about()` (`:1121-1146`), which replaces `#app` with a single generic paragraph. Because every one of those pages loads `app.js`, the full static content is destroyed on load (privacy sections 1-2, terms 1-3, about "Who is it for?", contact guidance). Content/SEO/compliance regression plus a content flash.

### 8. 404 page throws and gets the wrong title **[verified]**
`404.html:16` uses `<main id="main">`, but `app.js:36` binds `app = $("#app")` → null. Unknown URLs fall through to `home()` (`:1176`), which overwrites `document.title` then throws at `app.js:844` on the null element; the SPA click handler never attaches.

### 9. Deployed core is stale vs source **[verified]**
`git status` shows `app.js` and `utils.js` modified but uncommitted; `dist/app.js`/`dist/utils.js`/`dist/label-studio.js` differ from root. The Playwright suite runs against `dist`, so E2E currently tests a stale build (E04 asserts new copy that dist does not contain). `npm run build` before testing; add a clean step.

---

## P1 — High

10. **Keyboard users cannot open the file picker** — `picker()` (`app.js:156-162`) hides the `<input type="file">`; `bindPicker()` (`:164-172`) only handles `click`/drag on a non-focusable `<div>` (no `tabindex`/`role`/keydown). Core upload is mouse-only.
11. **Async failures escape error handling** — `app.js:336` (`vcardTool`) and `:337` (`panorama`) not awaited; `bindPicker` → `studio.addFiles()` has no `.catch` (`:164-172`). `safeZone` video extraction has no timeout (`:419-421`) and can hang.
12. **Blob URL leaks on SPA navigation** — `app.js:395, 472, 809` create object URLs; `revokeResultURLs()` (`:46-51`) runs only on the next file drop, never on route change or `layout()` (`:81`).
13. **All ten studio scripts (~490 KB) load on every tool page** — e.g. `tools/csv-date/index.html:92-104`; non-deferred, blocking parse, only one studio used per page.
14. **Studios: history/preview memory** — `sticker-studio.js:118-136` stores full base64 data URLs in a 60-deep history; `image-studio.js:557` does full-res `toDataURL` on every re-render; module-scoped caches (`imgCache`, `state.items`) never reset across mounts.
15. **One bad file discards the whole batch** — `sheet-studio.js:762-770` and `sticker-studio.js:1117-1139` use `Promise.all`; a single unreadable image rejects and the `.catch` drops all successful results. Use `Promise.allSettled`.
16. **Security headers: CSP gaps and Netlify-only** — `_headers:5` lacks `worker-src 'self' blob:` (blob worker at `photo-batch-studio.js:576` silently degrades), has no HSTS/`Cache-Control`, and contradicts `frame-ancestors 'none'` with `X-Frame-Options: SAMEORIGIN`. `vercel.json` has no `headers` at all, so Vercel deploys ship with no CSP/security headers.
17. **`dist/` is committed (66 files) and stale**; `dist/package.json` is a leftover `"utilityhub"` artifact served at `/package.json`. `.gitignore` has no `dist/`.

---

## P2 — Medium

18. Dead duplicate `home()` — `app.js:114` and `:834` (second wins). `verify.js` C07 does not detect duplicate function definitions.
19. Unreachable code: `sheetMaker`/its cases (`app.js:308, 356`), `subtitle-fix` branch (`:1068`, id absent from `TOOLS`), `groupMap` (`:684-695`), `fmtBytes`/`readDataURL` (`:54-56`).
20. Race conditions — `processTool` has no request token; concurrent drops can let a stale result overwrite a newer one; `#result` can be duplicated.
21. Mobile nav never closes after SPA navigation (`app.js:1183-1193` never removes `.open`; no Esc/outside-click/focus return).
22. Accessibility — no `aria-pressed` on category pills, placeholder-only search input (`app.js:849-857`); preview `<img>` without `alt` (`:395, 472, 809`); `#app` lacks `tabindex="-1"` for skip-link on the homepage; weak focus rings where `outline:none` is set (`styles.css:200, 396, 794-805, 1440-1451, 1639-1651, 1851-1863`).
23. No `prefers-reduced-motion` handling despite infinite animations (`:505, 514`). `color-scheme: light` is pinned deliberately — the product is light-only (no dark theme). *(Fixed: reduced-motion guard added.)*
24. Contrast risks — placeholder `#8b95a3` on white (`styles.css:206`), "NO IMAGE" `#94a3b8` on `#f1f5f9` (`:1568`), `.st-progress-label` dark-on-blue (`:1003-1012`).
25. Dead/duplicate CSS (`styles.css:443` vs `:1323`; dead `.skeleton`, `.ad-slot`, `.monetization-card`, `.tip-btn`, `.share-btn`, `.faq-box`, `.btn-lg`); undefined `var(--shadow)` used in `contact/index.html:42`.
26. Contact page has no form at all — `contact/index.html:40-53` is a `mailto:` link only (no endpoint, no honeypot/spam protection; address harvestable).
27. Duplicated bootstrapping — identical header/nav/footer + full `<head>` in 35/36 HTML files, plus a second copy inside `build_seo_pages.js`; `404.html` already diverges (no nav, different footer).
28. `label-studio.js:368-386` injects imported `font.family` unescaped into a `<style>` block (CSS injection via crafted preset). `sticker-studio.js:1021` interpolates `it.url` raw into SVG `href` (imported project JSON can inject scriptable SVG).
29. `test/route.test.js:4-16` tests a private re-implementation of the router, not `app.js` — misleading coverage.

---

## P3 — Low / hygiene

30. Missing social meta (`og:image:alt`, `twitter:*`) on all pages; redundant logo `alt="... Logo"`; emoji inside `<h1>`.
31. `index.html:36` has no `<noscript>` fallback (tool pages do).
32. `llms.txt` claims "WebAssembly" — no `.wasm`/WebAssembly reference exists in the JS.
33. Repo junk: untracked `results.txt` (22 KB), `all_tests.txt` (27 KB); tracked `test-results/.last-run.json`; add all to `.gitignore` and `git rm --cached`.
34. Duplicate `verify.js` at root and `scripts/verify.js` (differ by 4 path lines); neither is wired into `package.json`; root copy can false-PASS (`verify.js:34`).
35. `npm start` uses `python3` (`package.json:9`) which fails on this Windows machine; `playwright.config.js:11` uses `python` — inconsistent. No `engines`/`.nvmrc`; no CI.
36. `PROGENI_PRODUCTION_AUDIT.md` is stale (domain `progeni.live`, "33 URLs" vs 35, `app.js` "32 KB" vs ~55 KB, "no studios", `_redirects 200` vs 404, `X-Frame-Options DENY` vs SAMEORIGIN) — mark historical.
37. Manifest ships only an SVG icon (no 192/512 PNG maskable) → installability warnings.
38. SVG sanitizer (`utils.js:147-157`) is defense-in-depth only (entity-encoded `javascript:`, `<style>@import` not handled); `image-studio.js:219-232` `wrapSvg` bypasses `cleanSVG` entirely.

---

## Verified clean
- No real secrets/tokens/API keys anywhere in the repo (only false positives: `/etc/passwd` test vector, "token"/"phone token" domain words). No `.env` files.
- `sitemap.xml` (35 URLs) exactly matches the 30 `tools/` dirs + 5 core pages. `robots.txt`, `llms.txt` links, `manifest`, and Google verification file are consistent.
- No duplicate `id` attributes; no broken internal links across 36 HTML files; titles/descriptions/canonicals unique and present.
- 192 `node --test` unit tests pass and provide real coverage of studio geometry/parsing/quantization logic.
- Only one Web Worker (correctly torn down); no `eval`/`new Function`/`getUserMedia`; no `!important` abuse.

---

## Recommended order
1. Fix P0 1-8 (studios from home, `seen`, `rs`, vCard, csv-date, XSS, legal-page wipe, 404) and rebuild `dist/`.
2. Repo hygiene: stop tracking `dist/` + `test-results/`, delete `dist/package.json`, gitignore artifacts.
3. Guard/lazy-load studios; wrap async studio calls with `.catch`; revoke blob URLs on route change.
4. Mirror `_headers` into `vercel.json`; add `worker-src blob:`; remove the XFO contradiction; add HSTS + asset caching.
5. Accessibility pass (picker keyboard support, labels/aria, focus rings, alt text, reduced-motion).
6. Mark `PROGENI_PRODUCTION_AUDIT.md` historical; wire `test:e2e`/`verify` scripts; fix `python3` on Windows.
