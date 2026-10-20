# Progeni Bench — Deep UI Re-Audit (2026-10-20)

Scope: complete UI surface — `index.html`, `styles.css`, `app.js`, `utils.js`, 9 studio modules, 30 `tools/*` pages, `about|contact|privacy|terms|404`, manifest, build pipeline.
Method: line-by-line re-verification of every finding in `docs/UI_PROJECT_AUDIT.md` (2026-10-19) against the current uncommitted working tree, plus a fresh pass for new issues.

---

## 1. Status of the 2026-10-19 audit — 24 of 38 items FIXED

The uncommitted working tree contains a large, high-quality fix pass. Verified fixed:

| # | Item | Evidence of fix |
|---|------|----------------|
| P0-1 | Studios crashed when navigated from home | `app.js:74-76` `ensureStudios()` dynamic script loader with `loadedScripts` cache; every mount at `:972, :983, :1000…` wrapped in `.catch` |
| P0-2 | `seen is not defined` (Bookmark Cleaner) | `app.js:284` now declares `const seen = new Set()` |
| P0-3 | `rs` out of scope in panorama | `app.js:814` — `async function panorama(f, rs)` takes `rs` as a parameter |
| P0-4 | vCard crashes + dead buttons | vCard rewritten (`app.js:745-812`): `dedupeGroups` model, single `render()`, handlers bound via `querySelectorAll("[data-act]/[data-save]")`; all interpolated values use `esc()` |
| P0-5 | Dead `confirmAmbiguous()` | Bound at `app.js:698`; EU/US ambiguity resolution implemented (`:645-655`) |
| P0-6 | DOM XSS in CSV-date preview | `app.js:677` — `<code>${esc(a.original)}</code>` |
| P0-7 | SPA wiped legal/about/contact content | `app.js:1206` — route() explicitly leaves static markup for `/about /privacy /terms /contact` |
| P0-8 | 404 page null-`#app` crash | `404.html:20` — `<main id="app" class="container" tabindex="-1">` |
| P0-9 | E2E tested stale `dist/` | `dist/` deleted + gitignored; `playwright.config.js` webServer now runs `npm run build && node scripts/serve.js` first |
| P1-10 | File picker mouse-only | `app.js:161` — `role="button" tabindex="0" aria-label="…"`, keydown at `:181` |
| P1-11 | Unhandled async rejections | `.catch` on every studio mount and `bindPicker` (`app.js:175, 975, 989, 1004…`) |
| P1-12 | Blob-URL leaks on navigation | `revokeResultURLs()` now called from `layout()` (`app.js:114`) and route swap (`:1178`) |
| P1-15 | One bad file discarded batch | `Promise.allSettled` at `sheet-studio.js:762`, `sticker-studio.js:1118`; `image-studio.js:389-394` per-file `.catch` with failure report |
| P1-16 | CSP gaps / Netlify-only headers | `_headers` now has `worker-src 'self' blob:`, HSTS, COOP, `form-action 'none'`, cache policy, and the `X-Frame-Options` contradiction removed; `vercel.json` mirrors all of it + `buildCommand` |
| P1-17 | `dist/` committed & stale | Deleted from tree, `.gitignore` now covers `dist/ test-results/ playwright-report/ results.txt all_tests.txt` |
| P2-18 | Duplicate `home()` | Only one definition remains (`app.js:894`) |
| P2-20 | Result-overwrite race | `processToken` check in error path (`app.js:391`) |
| P2-21 | Mobile nav never closed | `closeMobileNav()` (`:190`), Esc handler (`:210`), close-on-route (`:1232`); hamburger has `aria-expanded/aria-controls` |
| P2-22 | A11y gaps on shell | `aria-pressed` pills (`:918, 936-939`), `aria-live` region (`:222`), skip-link (`index.html:31`), `tabindex="-1"` on `<main>`, global `*:focus-visible` ring (`styles.css:1998-2002`) restores focus on all `outline:none` controls |
| P3-30 | Missing social meta | `og:image:alt` + full `twitter:*` set present (`index.html:15-19`) |
| P3-31 | No `<noscript>` on home | Full noscript block (`index.html:50-86`) |
| P3-34 | Duplicate `verify.js` | Root copy deleted; `npm verify` wired to `scripts/verify.js` |
| P3-35 | `python3` start script (Win-hostile) | `scripts/serve.js` + `engines: node>=20`; Playwright uses same server |
| P3-37 | Manifest SVG-only icons | `manifest.webmanifest:9-33` — 192/512 PNG + `maskable` + SVG; PNG favicons 48–512 added |

---

## 2. Still open (verified with fresh evidence)

### HIGH

**H1 — Tool pages still load ALL 10 studio scripts (~490 KB) AND the studios execute twice.**
Every `tools/*/index.html` still statically includes every studio (`tools/labels/index.html:103-111`: sticker, label, sheet, dmc, pattern, image, photo-batch, album, media…). Meanwhile `app.js:970-988` calls `ensureStudios("sticker")` → `loadScript()` creates a *second* `<script>` for the same URL (the `loadedScripts` map starts empty and never records static tags), so the studio parses and executes again on every tool mount.
Fix: delete the static studio tags from all tool pages (keep `site.config.js`/`utils.js`/`app.js`), letting `ensureStudios` load exactly the one studio needed; optionally seed `loadedScripts` from existing `document.scripts` for safety.

**H2 — No reduced-motion support.**
`prefers-reduced-motion` had no handling; `styles.css:505, 514` include infinite keyframe animations. `color-scheme` is intentionally pinned light.
Fix: wrap animations/transitions in `@media (prefers-reduced-motion: reduce)`. **Outcome:** only the reduced-motion guard was kept; the site is deliberately light-only (any dark theme was removed). See §4 H2.

### MEDIUM

**M1 — Undefined `var(--shadow)` on the contact card.**
`contact/index.html:50` and `build_seo_pages.js:771` use `box-shadow: var(--shadow)`, but `styles.css` only defines `--shadow-xs/sm/md` (`:23-25`). The property is invalid-at-computed-value time → the "Direct Email Inquiries" card silently renders with no shadow, breaking visual parity with the app's cards.
Fix: use `var(--shadow-sm)`, or add a `--shadow` alias token.

**M2 — Placeholder contrast still fails WCAG AA.**
`.search::placeholder` `#8b95a3` on white (`styles.css:206`) ≈ 2.9:1 (needs 4.5:1). Also `.st-progress-label` dark-on-blue and the "NO IMAGE" `#94a3b8`-on-`#f1f5f9` (~2.2:1) remain from the previous audit. The new `*:focus-visible` rule fixed focus visibility but not text contrast.
Fix: `#6b7684`-class greys for placeholders; bump "NO IMAGE" to `#64748b`.

**M3 — Dead CSS + dead monetization scaffolding still shipped.**
`.skeleton` (`styles.css:511`), `.ad-slot`/`.ad-slot-label` (`:565, 578`), `.faq-box` (`:673-687`) are referenced nowhere in any HTML/JS (verified by cross-file grep). ~2 KB of dead rules, plus misleading "ad slot" markup in a privacy-first product's stylesheet.
Fix: delete the blocks.

**M4 — Contact is still a bare `mailto:` with no form, and CSP now forbids forms anyway.**
`contact/index.html:53-54` is an email link only; `form-action 'none'` in both `_headers` and `vercel.json` means no future inline form can post. Acceptable for a static privacy-first site, but the page presents itself as "Contact Support" with no expectations set (no response-time guarantee beyond a line of copy, no issue tracker link).
Fix: at minimum add a GitHub-issues/feedback link; document the deliberate no-form decision.

**M5 — Studio-level memory behavior only partially improved.**
Export paths now revoke on a timer (`album-studio.js:444`, `media-studio.js:362`, `label-studio.js:443`…) and `media-studio` revokes video/audio URLs on replace (`:918-919`) — good. But module-scoped caches (`imgCache`, sticker history storing 60 deep base64 data URLs) still survive across unmount→mount cycles within a session, and `image-studio` still does full-resolution `toDataURL` per re-render. Not re-verified line-by-line this pass; treat as known-acceptable for v1, address before adding more studios.

### LOW / HYGIENE

**L1 — Untracked root junk:** `Chart.csv`, `Metadata.csv`, `Table.csv` (test artifacts) and `favicon.ico` sit untracked at repo root. Add to `.gitignore` or delete.
**L2 — CSP still allows `script-src 'unsafe-inline'`.** The new inline-handler-free `app.js` makes tightening feasible: move the remaining inline `onclick`/JSON-LD to external files or hashes, then drop `unsafe-inline`.
**L3 — Boilerplate duplication:** identical header/nav/footer + `<head>` across 35 HTML files and a second copy inside `build_seo_pages.js` (divergence already observed in `404.html`). A tiny build-time layout include would eliminate the drift class permanently.
**L4 — Panorama dead locals:** `app.js:862-863` compute `col`/`row` with the odd `| 1` bitwise-or-1 expressions; both are unused. Delete.
**L5 — `label-studio.js`/`sticker-studio.js` injection surface** (imported font-family into `<style>`, raw `it.url` into SVG `href`) was not re-verified this pass — still treat as open until confirmed fixed.

---

## 3. UI quality assessment (current state)

**Strengths**
- Consistent design-token foundation (colors, spacing, shadows, radii all as custom properties); one coherent card/button/toolbar language across the app shell and studios.
- Feedback model is now uniform: `aria-live="polite"` status region, `.notice/.warn/.error` result states, per-file failure reporting in batch flows, busy/disabled states in studios.
- Privacy story is real and consistently expressed: everything client-side, no network calls, honest per-tool privacy copy (`app.js:150`).
- Keyboard reachability of the shell is now genuinely good: skip link, focus-visible rings, Esc-closable nav, `role=button` picker with keydown.
- SEO landing pages carry unique titles/descriptions/canonicals/JSON-LD that match the sitemap exactly.

**Weaknesses (ranked by user impact)**
1. Weight: ~490 KB of studio JS parsed on every tool page, executed twice (H1) — slow first interaction on mid-range mobiles, the exact devices the photo/label tools target.
2. Contact/feedback dead-end (M4).
3. Residual contrast failures on secondary text (M2).

**Recommended order**
1. H1 (strip static studio tags; verify `ensureStudios` single-loads) — biggest perf win, small diff.
2. M1–M3 (one-line/one-block CSS fixes).
3. L1/L4 cleanup, then L2 CSP hardening, then L3 build-layout refactor.

---

## 4. Fix pass — 2026-10-20 (implemented)

All items below are applied in the working tree; `npm run build`, `npm test` (207/207) and `npm run verify` (47 pass / 0 fail / 1 skip) are green, and the result was spot-checked in a browser (home + `tools/sticker-sheet`).

| # | Item | What was done |
|---|------|----------------|
| H1 | Double studio loading | Removed all 10 static `<script src="*-studio.js">` tags from the tool-page template in `build_seo_pages.js`; tool pages now ship only `site.config.js`, `utils.js`, `app.js`. `ensureStudios()` in `app.js` now loads **sequentially** (`for…of await`) so `data/dmc.js` always evaluates before `pattern-studio.js` (which reads `window.DMC_PALETTE` at module init). Verified in-browser: only the needed studio loads, DMC palette = 300 entries, pattern studio mounts. |
| H2 | Reduced-motion guard | The site is light-only by design: `color-scheme: light` is pinned, there is no theme toggle, and there are **zero** `data-theme` / `theme-toggle` / `progeni-theme` / `prefers-color-scheme` occurrences across all HTML/CSS/JS (source, generated and `dist`) — verified by grep. Added a blanket `@media (prefers-reduced-motion: reduce)` guard that disables the loader spin and all transitions/animations. |
| M1 | Undefined `var(--shadow)` | Contact card now uses `var(--shadow-sm)`. |
| M2 | Contrast failures | `.search::placeholder` → `var(--placeholder)` `#6b7280`; "NO IMAGE" placeholders → `var(--noimg-fg)` `#64748b` (AA on `--surface-2`); `.st-progress-fill` gradient darkened to `--brand-solid`→`--brand-solid-2` and label changed to white with a text-shadow (was dark-on-light-blue); `.tool-content` prose → `var(--body-fg)`; `pre` and notice surfaces tokenized. |
| M3 | Dead CSS | Deleted `.skeleton`+`@keyframes skeleton-loading`, `.ad-slot`/`.ad-slot-label`, `.monetization-card`/`.tip-btn`/`.share-btn` (and its responsive rule), and `.faq-box`/`h4`/`p`. ~2 KB removed; grep confirms zero references remain. |
| M4 | Contact page | Added bug-report guidance ("include tool name, browser, steps") and a "Why there is no contact form" section documenting the deliberate no-form decision. Email-only by design (no public issue tracker exists to link). |
| L1 | Root junk | `Chart.csv`, `Metadata.csv`, `Table.csv` added to `.gitignore` (files left in place). |
| L4 | Panorama dead locals | Removed unused `col`/`row` (`| 1`) computations in `app.js`. |
| L5 | Injection surface | Already fixed in the tree — `label-studio.js` sanitizes `font-family`; `sticker-studio.js` sanitizes SVG `image` href. Marked closed. |
| L6 | Landing redesign (bold modern) | Rebuilt the home page (generator `generateHomePageHtml()` **and** the `app.js home()` SPA fallback kept structurally identical). New hero: eyebrow with live-dot, big two-tone headline (`.hero h1 .accent`), lede, prominent `.hero-search`, category pills. Added a `.trust` strip (4 benefit cards), a `.tools-section` with `.section-head` + live `.grid-count`, polished `.tool-card`s with a hover/focus `.go` arrow, a `.privacy-band` (3 ticked privacy points) and a restyled `.category-directory`/`.category-blocks`. `getFooterDirectoryHtml()` reused the same classes, so **all** inline `style="…"` attributes are gone from the home + footer markup. The `#search` / `#cats` / `#grid` / `.tool-card` / `.pill` contract is preserved, so `wireFilters()` still filters by `data-cat` + text — verified in-browser (search "subtitle" → 2, a category → 9, All → 30) on both the server-rendered page and the forced SPA re-render. |

Deliberately **not** done (deprioritized, unchanged): **L2** (`script-src 'unsafe-inline'`) and **L3** (build-layout include).
