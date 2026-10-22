# Deploy & Index Handoff

Everything that can be done without your accounts is done and pushed.
This file covers the two steps only you can complete: **Vercel deploy** and
**Google Search Console indexing**.

- Repo: `https://github.com/vivekanandkumar001/progeni_bench`
- Branch: `main` (in sync, HEAD `256a03d`)
- Custom domain: `bench.progeni.live`
- Build: `npm run build` → output `dist/` (auto-detected from `vercel.json`)

---

## 1. Vercel deploy

`vercel.json` is already correct and committed:

```json
{
  "buildCommand": "npm run build",
  "cleanUrls": true,
  "trailingSlash": true,
  "outputDirectory": "dist",
  "headers": [ ... CSP, HSTS, nosniff, referrer-policy, cache ... ]
}
```

### Option A — Dashboard (recommended, no CLI install)

1. Go to <https://vercel.com/new> and sign in.
2. **Import Git Repository** → choose `vivekanandkumar001/progeni_bench`.
3. Settings are auto-read from `vercel.json`; confirm:
   - Framework Preset: **Other**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install` (default)
   - Node.js Version: **20.x** or newer
4. Click **Deploy**. First build ≈ 1–2 min.
5. Wait for **Ready**, then open the generated `*.vercel.app` URL and spot-check
   `/`, `/image/`, `/image/compress/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`.

### Option B — CLI

```bash
npm i -g vercel
vercel login          # opens browser, uses YOUR account
vercel link           # link this folder to a new/existing project
vercel --prod         # production deploy
```

The CLI is not installed in this environment and I have no Vercel token, so I
cannot run this for you — it requires your authentication.

### Attach the domain

1. Vercel project → **Settings → Domains → Add** → `bench.progeni.live`.
2. Follow the DNS instruction Vercel shows (usually a `CNAME` to
   `cname.vercel-dns.com` at your DNS provider, or Vercel nameservers).
3. Wait for **Valid Configuration** (TLS is issued automatically).
4. Optionally set `www.bench.progeni.live` → redirect to the apex.

### Post-deploy verification (run these once live)

```bash
curl -sI https://bench.progeni.live/ | findstr /I "HTTP content-security-policy strict-transport"
curl -s  https://bench.progeni.live/robots.txt
curl -s  https://bench.progeni.live/sitemap.xml | findstr /C:"<loc>" | find /C "<loc>"
# expect 76
curl -sI https://bench.progeni.live/image/compress/
curl -sI https://bench.progeni.live/llms.txt
```

Expected: `200` on all, CSP + HSTS headers present, sitemap exposing 76 URLs.

---

## 2. Google Search Console (requires your account)

I have **no GSC credential in this environment**, so I could not submit the
sitemap or request indexing. The site is already *index-ready* (verified below);
the remaining actions need your Google account.

### Verified indexability (done locally)

| Check | Result |
|---|---|
| Sitemap URLs | 76 (35 legacy + 41 image) |
| Pages with correct `bench.progeni.live` canonical | 76 / 76 indexable |
| Pages missing canonical | 0 |
| `robots.txt` | `Allow: /` + sitemap reference |
| Intentionally `noindex` | 3 experimental pages only |
| Deferred/unavailable tools | no page generated (correct) |
| `llms.txt` in dist | yes (fixed in `256a03d`) |

### Steps in Search Console

1. Open <https://search.google.com/search-console>.
2. Add property **`bench.progeni.live`** (Domain property).
   - A verification file already exists at the web root:
     `/google2b1950b2899ed288.html` — it is committed and ships in `dist/`.
   - If the domain property needs DNS verification (TXT record), add the TXT
     record your DNS provider shows.
   - Alternatively add a **URL-prefix** property
     `https://bench.progeni.live/` which uses the HTML file method.
3. After verification: **Sitemaps → Add a new sitemap** → `sitemap.xml` → Submit.
4. Use **URL Inspection** on the priority URLs, then **Request Indexing**:
   - `https://bench.progeni.live/`
   - `https://bench.progeni.live/image/`
   - `https://bench.progeni.live/image/studio/`
   - a sample of tool pages, e.g. `/image/compress/`, `/image/resize/`,
     `/image/convert/`, `/image/favicon/`, `/image/qr-code/`
5. Watch **Pages** (Indexing) for the next few days.

### Honest expectation

Nobody can force Google to index a page. The site now has:
- crawlable static HTML for every public page,
- correct canonicals and one sitemap,
- `robots.txt` allowing everything indexable,
- structured data (WebApplication, BreadcrumbList, FAQPage) per page,
- `noindex` only where intended.

Indexing still depends on Google's crawl budget and quality assessment, and can
take days to weeks. "All pages indexed" is a goal to monitor, not something that
can be guaranteed or instantly triggered.

### Optional: programmatic submission

If you want me to actually submit the sitemap / request indexing, provide:
- a Google Cloud service account JSON with the Search Console API enabled, and
- that service account added as a user on the property,

then I can call the Search Console API. As chosen, you'll supply this access
separately.

---

## 3. Deploy checklist

- [ ] Import repo at <https://vercel.com/new> (or `vercel --prod` after login)
- [ ] Confirm build `npm run build`, output `dist`, Node 20+
- [ ] Deploy → Ready
- [ ] Add domain `bench.progeni.live` → Valid Configuration → HTTPS
- [ ] Run the post-deploy `curl` checks above
- [ ] GSC: add property, verify, submit `sitemap.xml`, request indexing
- [ ] Re-check GSC **Pages** report after a few days

## 4. Rollback

Redeploy the previous Vercel deployment (Deployments → … → **Promote to
Production**), or revert the source:

```bash
git revert 256a03d aaffdad    # undo the two toolkit commits
npm run build
```
