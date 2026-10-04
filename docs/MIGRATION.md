# Subdomain Migration Guide: progeni.live → bench.progeni.live

This document outlines the step-by-step procedure to migrate the Utility platform from `progeni.live` to `bench.progeni.live`.

---

## When to Apply Redirects
> **Important**: Apply the 301 redirect rules below **ONLY** if `progeni.live` was previously serving the Utility tools directly. If `progeni.live` is serving a separate parent website (landing page, portfolio, or portal), do **NOT** add these wildcards to the parent site.

---

## 1. DNS Record Configuration
Add the following DNS record in your DNS provider (Cloudflare, Namecheap, Route53, etc.):

- **Type**: `CNAME`
- **Name / Host**: `bench`
- **Target**: `[TODO: Insert your hosting provider CNAME target, e.g., custom.netlify.com, cname.vercel-dns.com, or your Cloudflare Pages target]`
- **TTL**: `300` (or Auto)

---

## 2. SSL / HTTPS Certificate Verification
1. Add `bench.progeni.live` as a custom domain in your hosting dashboard (Netlify / Vercel / Cloudflare Pages).
2. Wait for automatic SSL certificate issuance (Let's Encrypt / DigiCert).
3. Test HTTPS connectivity:
   ```bash
   curl -I https://bench.progeni.live/
   ```
   Ensure HTTP status returns `200 OK` with valid TLS certificates.

---

## 3. Apply 301 Permanent Redirects

### Option A: Netlify (`_redirects`)
If hosting on Netlify and migrating legacy `progeni.live` traffic:
```
# Legacy Domain Migration Redirect
https://progeni.live/*  https://bench.progeni.live/:splat  301!
```

### Option B: Vercel (`vercel.json`)
If hosting on Vercel and migrating legacy `progeni.live` traffic:
```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [
        {
          "type": "host",
          "value": "progeni.live"
        }
      ],
      "destination": "https://bench.progeni.live/$1",
      "permanent": true
    }
  ]
}
```

---

## 4. Google Search Console (GSC) Setup
1. **Domain Property Verification**:
   - Add `progeni.live` as a **Domain Property** in Google Search Console via DNS TXT record verification.
   - A Domain Property automatically covers `progeni.live`, `bench.progeni.live`, and all other future subdomains under one unified property.
2. **Submit XML Sitemap**:
   - Navigate to **Sitemaps** under the `bench.progeni.live` property (or domain property).
   - Submit: `https://bench.progeni.live/sitemap.xml`
   - Verify that all 35 URLs are discovered and indexed.

---

## 5. 7-Day Post-Launch Checklist
- [ ] **Day 1**: Run live URL inspection on `https://bench.progeni.live/` and top tool pages to verify Googlebot fetches with status 200 and parses Schema JSON-LD.
- [ ] **Day 2**: Monitor server access logs and analytics for unexpected 404 errors or broken asset URLs.
- [ ] **Day 3**: Check Google Search Console **Page indexing (Coverage)** report for redirect anomalies or "Duplicate without user-selected canonical" warnings.
- [ ] **Day 5**: Confirm that Google has recognized `https://bench.progeni.live/...` as the canonical domain for all 30 tool pages.
- [ ] **Day 7**: Audit organic search impressions and ensure traffic has successfully transitioned without loss of ranking.
