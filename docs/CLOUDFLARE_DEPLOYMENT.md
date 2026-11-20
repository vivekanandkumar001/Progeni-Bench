# Cloudflare Pages Deployment & GSC Coverage Guide

## 1. Cloudflare Pages Deployment

Progeni Bench is now configured for direct deployment to Cloudflare Pages.

### Configuration Added
- **`wrangler.toml`**: Configured with `pages_build_output_dir = "dist"`, `nodejs_compat` flag.
- **`.node-version`**: Pinned to Node.js `20`.
- **`functions/api/translate.js`**: Cloudflare Pages Function adapter for the serverless PDF Translation endpoint with rate limiting and quota support.
- **`dist/_headers` & `dist/_redirects`**: Natively supported by Cloudflare Pages for strict Content-Security-Policy (CSP), HSTS, and 404 routing.

---

### Option A: Cloudflare Dashboard (Recommended — Automatic Git Deployments)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select your repository: `vivekanandkumar001/Progeni-Bench`.
3. Configure the build settings:
   - **Framework preset**: `None`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables** (optional, for PDF translation service):
     - `DEEPL_AUTH_KEY`: *(Your DeepL API key, if using official DeepL)*
     - `UPSTASH_REDIS_REST_URL`: *(Upstash Redis REST URL, if using distributed rate limiting)*
     - `UPSTASH_REDIS_REST_TOKEN`: *(Upstash Redis token)*
4. Click **Save and Deploy**.
5. Once deployed, attach your custom domain:
   - Go to **Custom domains** → **Set up a custom domain**.
   - Enter `bench.progeni.live`.
   - If your DNS for `progeni.live` is already managed on Cloudflare, Cloudflare will automatically configure the CNAME and generate SSL!

---

### Option B: Cloudflare CLI (Wrangler)

If deploying directly from your machine:
```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Build the production site
npm run build

# 3. Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=progeni-bench
```

---

## 2. Google Search Console (GSC) Coverage Report Analysis

From the uploaded report (`https___bench.progeni.live_-Coverage-2026-11-20.zip`):
- **Indexed**: 15 pages (generating impressions, up to 17/day)
- **Discovered — currently not indexed**: 106 pages
- **Crawled — currently not indexed**: 2 pages

### Why are pages "Discovered — currently not indexed"?
1. **Rapid Catalog Expansion**: On October 24, 2026, the sitemap expanded from 35 tools to 122 tools. For a new subdomain (`bench.progeni.live`), Google allocates crawl budget gradually. Googlebot knows these 106 URLs exist (from `sitemap.xml` and homepage links), but queues them for crawling according to domain authority and crawl limits.
2. **Action in GSC**:
   - The validation status in your report shows **"Started"** for the 106 discovered pages — Google is actively processing the queue.
   - For priority tools, go to **URL Inspection** in Google Search Console and click **Request Indexing**.

### What were the fixes completed?
- Fixed `[object Object]` rendering in key facts metadata across core tools.
- Fixed European date ambiguity index alignment in CSV Date Normalizer.
- Fixed search bar responsiveness with requestAnimationFrame coalescing and caching.
- Enforced mobile fingertip touch targets (>= 44px) across controls and buttons.
- Full static HTML pre-rendered for all 122 tools so Googlebot sees complete content without executing JavaScript.
