# PDF Translator

PDF Translator is a browser-based PDF workflow with DeepL-backed text
translation. The original PDF is parsed and rendered in the browser. Only
extracted text blocks are sent to `/api/translate`; the server-side Vercel
Function forwards them to DeepL. OCR runs locally with Tesseract.js, although
its English and Hindi language-data files are fetched from the configured
Tesseract data host.

## Local development

From the `bench` directory:

```bash
npm install
npm test
npm run build
npm run verify
```

`npm start` serves only the generated `dist/` site; it does not run the API
Function. Use the Vercel CLI's local development server to exercise the
Function:

```bash
vercel dev
```

Link the local project and configure the environment variables below in
Vercel, or pull them into a local environment with `vercel env pull`. Keep
local environment files out of source control and never paste secrets into
client-side code.

## Vercel and provider setup

1. Create a DeepL API key. The default endpoint is the paid API. For a DeepL
   Free API key, set `DEEPL_API_URL` to
   `https://api-free.deepl.com/v2/translate`. (Optional — without it, the
   tool falls back to an anonymous Google Translate endpoint, though quality
   and reliability are lower and the ToS of that endpoint is grey-zone.)
2. Provision an Upstash Redis database with its REST API enabled. (Optional —
   without it, each Function instance keeps its own in-memory rate limiter;
   this is best-effort on serverless because instances are ephemeral, but it
   is enough to stop accidental bursts on a warm instance.)
3. Set these variables for the Vercel environments that will serve the tool:

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `DEEPL_AUTH_KEY` | No | Server-only DeepL authentication key. When unset, an anonymous Google Translate endpoint is used as a fallback provider |
   | `UPSTASH_REDIS_REST_URL` | No | HTTPS REST URL used for global quotas. When unset, a per-instance in-memory limiter is used instead |
   | `UPSTASH_REDIS_REST_TOKEN` | No | Upstash REST bearer token |
   | `DEEPL_API_URL` | No | Paid or Free DeepL translation endpoint |
   | `DEEPL_GLOSSARY_ID` | No | DeepL glossary ID |
   | `DEEPL_GLOSSARY_SOURCE_LANG` | No | Source language for that glossary |
   | `DEEPL_GLOSSARY_TARGET_LANG` | No | Target language for that glossary |

   A glossary is applied only when the request's explicit source and target
   match the configured glossary language pair. Auto-detected source language
   requests do not use a glossary.

   Provider selection order: DeepL (if `DEEPL_AUTH_KEY` is set) → anonymous
   Google Translate fallback. The `X-Translation-Provider` response header
   reports which one served the request (`deepl` or `google-fallback`).
   The DeepL provider is retried up to 3 times on transient 429/5xx errors;
   if DeepL fails for a non-quota reason, the request falls back to the
   anonymous provider automatically. Quota/rate-limit failures (HTTP 429)
   never fall back to the anonymous provider so costs stay predictable.

4. Deploy the project from the `bench` directory with the repository's
   `vercel.json`. It sets `dist` as the static output and gives
   `api/translate.js` a 60-second maximum duration.
5. After deployment, verify that the Function is present with a GET request:

   ```bash
   curl -i https://YOUR_HOST/api/translate
   ```

   The Function should return `405` with an `Allow: POST` header and a JSON
   error. A static-site 404 or HTML page means the Function was not included
   in the deployment. Then test a non-confidential sample PDF in the browser;
   a real translation uses the configured DeepL account.

Production translation fails closed when either the DeepL key or Upstash
configuration is missing. Local development can use a process-local request
limiter when Upstash is not configured; this is not suitable for production.

## Limits and output behavior

- Input PDF: at most 15 MB. There is no source page-count limit; note that the upstream DeepL daily quota (below) is the effective ceiling for very large documents.
- Extracted text: at most 120,000 characters for a job.
- Translation requests: at most 50 blocks, 5,000 characters per block, and
  15,000 characters total.
- Output: at most 300 pages and 80 MB. Rendering is capped at 4 million pixels
  per rasterized page and 500 million pixels per job.
- Upstash quotas: 30 translation requests per minute and 150,000 input
  characters per UTC day per hashed client IP.
- The endpoint retries transient DeepL responses up to three times. Successful
  responses can be kept in volatile Function memory for up to five minutes to
  deduplicate retries within a warm instance.
- DeepL formality controls are available only for language pairs that DeepL
  supports. â€œFaithfulâ€ does not add custom instructions to DeepL.
- Hinglish is implemented as best-effort Romanization of a Hindi translation.
  It is not a natural-language Hinglish model and can produce awkward
  transliteration. A DeepL glossary may help preserve domain-specific words.
- Clean and bilingual layouts rebuild content as rasterized pages.
  â€œPreserve layoutâ€ renders the source page and paints translations over
  extracted text areas; it cannot reliably retain typography or original
  layout. Links, selectable text, form fields, signatures, annotations, and
  document metadata are not preserved. Review the generated PDF and its
  per-page quality report before relying on it.
- Pages without extractable text are omitted unless OCR is enabled. OCR may
  misread content. Output expansion is placed on readable continuation pages.

## Privacy, retention, and security

- The PDF file and page images are not uploaded to Progeni or DeepL.
- Extracted text is sent to the Progeni Vercel Function and then to DeepL for
  translation. Do not use the tool for confidential or regulated documents.
- The Function does not intentionally log document text. Vercel and DeepL
  handle request metadata and translation data under their respective service
  terms and retention policies.
- Successful translated response payloads may be held in volatile Function
  memory for up to five minutes. They are not written to persistent storage.
- Upstash holds minute and daily counters keyed by an HMAC of the client IP,
  not the raw IP or document text. The counters expire after approximately
  two minutes and 24 hours, respectively.
- Tesseract language data is downloaded from
  `https://tessdata.projectnaptha.com`; page images and recognized text remain
  in the browser until the translation request is made.
- Text is sent to the configured provider. When `DEEPL_AUTH_KEY` is set, it is
  sent to DeepL; otherwise it is sent to Google Translate's internal endpoint
  (the anonymous fallback provider). Both providers handle request metadata and
  text under their own terms and retention policies.
- The DeepL key and Upstash token must only be configured as server-side
  environment variables. The endpoint validates input, restricts allowed
  provider URLs, checks browser origins when present, and does not enable
  cross-origin access.
- Leaving the tool revokes its temporary download URL and terminates the PDF
  and OCR workers.

## Tests and rollback

Run the focused unit suite and static build checks:

```bash
npm test
npm run build
npm run verify
```

The unit tests cover request validation, origin/method checks, quota behavior,
provider response mapping, page-range parsing, and Romanization. They do not
replace a browser test with a synthetic PDF or a live DeepL integration test.

To disable translation immediately, remove `DEEPL_AUTH_KEY` from the affected
Vercel environment and redeploy; the endpoint will return a configuration
error instead of forwarding requests. For a full rollback, use Vercel's
deployment rollback and verify the previous static site and Function
configuration together.
