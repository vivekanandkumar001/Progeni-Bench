const crypto = require("crypto");

const ALLOWED_TARGETS = new Set([
  "AR", "BG", "CS", "DA", "DE", "EL", "EN-GB", "EN-US", "ES", "ET", "FI",
  "FR", "HI", "HU", "ID", "IT", "JA", "KO", "LT", "LV", "NB", "NL", "PL",
  "PT-BR", "PT-PT", "RO", "RU", "SK", "SL", "SV", "TR", "UK", "ZH"
]);
const ALLOWED_SOURCES = new Set([
  "AR", "BG", "CS", "DA", "DE", "EL", "EN", "ES", "ET", "FI", "FR", "HI",
  "HU", "ID", "IT", "JA", "KO", "LT", "LV", "NB", "NL", "PL", "PT", "RO",
  "RU", "SK", "SL", "SV", "TR", "UK", "ZH"
]);
const FORMALITY_TARGETS = new Set([
  "DE", "ES", "FR", "IT", "NL", "PL", "PT-BR", "PT-PT", "RU"
]);
const rateBuckets = new Map();
const responseCache = new Map();
let quotaWarned = false;
const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_BLOCKS = 50;
const MAX_BLOCK_CHARS = 5000;
const MAX_TOTAL_CHARS = 15000;
const MAX_DAILY_CHARS_PER_IP = 150000;
const CACHE_TTL_MS = 5 * 60 * 1000;
// DeepL target language codes that carry region modifiers. Google Translate
// supports the same codes, but if it rejects one we retry with the base language.
const REGION_SUFFIX = /^([A-Z]{2})-[A-Z]{2}$/;

function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Expected a JSON object.";
  }
  if (!Array.isArray(body.blocks) || body.blocks.length < 1 || body.blocks.length > MAX_BLOCKS) {
    return `Send between 1 and ${MAX_BLOCKS} text blocks per request.`;
  }
  if (!ALLOWED_TARGETS.has(body.targetLang)) return "Choose a supported target language.";
  if (body.sourceLang && !ALLOWED_SOURCES.has(body.sourceLang)) return "Choose a supported source language.";
  if (!["faithful", "formal", "conversational"].includes(body.style)) return "Choose a supported translation style.";

  const ids = new Set();
  let totalChars = 0;
  for (const block of body.blocks) {
    if (!block || typeof block.id !== "string" || !/^[\w-]{1,80}$/.test(block.id) || ids.has(block.id)) {
      return "Text blocks must have unique, stable identifiers.";
    }
    if (typeof block.text !== "string" || !block.text.trim() || block.text.length > MAX_BLOCK_CHARS) {
      return "Text blocks must contain between 1 and 5,000 characters.";
    }
    ids.add(block.id);
    totalChars += block.text.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) return `Keep each request under ${MAX_TOTAL_CHARS} characters.`;
  return null;
}

function isRateLimited(ip, now = Date.now()) {
  if (rateBuckets.size > 2048) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= 60000) rateBuckets.delete(key);
    }
  }
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= 60000) {
    if (!bucket && rateBuckets.size >= 4096) return true;
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_MINUTE;
}

function pruneCache(now = Date.now()) {
  for (const [key, entry] of responseCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) responseCache.delete(key);
  }
  while (responseCache.size > 128) responseCache.delete(responseCache.keys().next().value);
}

async function checkGlobalQuota(ip, charCount, now = Date.now()) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  // No Redis configured: fall back to a per-instance in-memory limiter.
  // (Serverless instances are ephemeral, so this is best-effort — still enough
  // to stop accidental abuse on a single warm instance and keep DeepL costs sane.)
  // Loud, single-line warning so operators know why.
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production") {
      if (!quotaWarned) {
        quotaWarned = true;
        console.warn("pdf-translation: UPSTASH_REDIS_REST_URL/TOKEN not set — using per-instance in-memory rate limiter. Configure Upstash Redis for distributed quota enforcement.");
      }
      return { configured: true, allowed: !isRateLimited(ip, now), localOnly: true };
    }
    return { configured: true, allowed: !isRateLimited(ip, now), localOnly: true };
  }

  const minute = Math.floor(now / 60000);
  const day = new Date(now).toISOString().slice(0, 10);
  const ipHash = crypto.createHmac("sha256", process.env.DEEPL_AUTH_KEY || "pdf-translator-local-fallback").update(ip).digest("hex").slice(0, 32);
  const minuteKey = `bench:pdf-translate:minute:${ipHash}:${minute}`;
  const dayKey = `bench:pdf-translate:chars:${ipHash}:${day}`;
  let pipelineUrl;
  try {
    pipelineUrl = new URL("/pipeline", redisUrl);
    if (pipelineUrl.protocol !== "https:") throw new Error("Redis URL must use HTTPS.");
  } catch {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn("pdf-translation: UPSTASH_REDIS_REST_URL is invalid — falling back to per-instance rate limiter.");
    }
    return { configured: true, allowed: !isRateLimited(ip, now), localOnly: true };
  }

  const response = await fetch(pipelineUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      ["INCR", minuteKey],
      ["EXPIRE", minuteKey, 120],
      ["INCRBY", dayKey, charCount],
      ["EXPIRE", dayKey, 86400]
    ]),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Global quota store returned an error.");
  const commands = await response.json();
  const minuteCount = Number(commands && commands[0] && commands[0].result);
  const dailyChars = Number(commands && commands[2] && commands[2].result);
  if (!Number.isFinite(minuteCount) || !Number.isFinite(dailyChars)) {
    throw new Error("Global quota store returned an invalid result.");
  }
  return {
    configured: true,
    allowed: minuteCount <= MAX_REQUESTS_PER_MINUTE && dailyChars <= MAX_DAILY_CHARS_PER_IP
  };
}

// ---------- Providers ----------

// DeepL official API (preferred). Requires DEEPL_AUTH_KEY.
// Returns { translations: [...] } on success, throws on failure.
async function translateWithDeepL(body, authKey) {
  const apiUrl = process.env.DEEPL_API_URL || "https://api.deepl.com/v2/translate";
  if (
    apiUrl !== "https://api.deepl.com/v2/translate" &&
    apiUrl !== "https://api-free.deepl.com/v2/translate"
  ) {
    throw new Error("Invalid DEEPL_API_URL configuration.");
  }
  const payload = {
    text: body.blocks.map(block => block.text),
    target_lang: body.targetLang
  };
  if (body.sourceLang) payload.source_lang = body.sourceLang;
  if (FORMALITY_TARGETS.has(body.targetLang) && body.style !== "faithful") {
    payload.formality = body.style === "formal" ? "prefer_more" : "prefer_less";
  }
  if (
    process.env.DEEPL_GLOSSARY_ID &&
    body.sourceLang === process.env.DEEPL_GLOSSARY_SOURCE_LANG &&
    body.targetLang === process.env.DEEPL_GLOSSARY_TARGET_LANG
  ) {
    payload.glossary_id = process.env.DEEPL_GLOSSARY_ID;
  }
  let providerResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    providerResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${authKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    if (![429, 500, 502, 503, 504].includes(providerResponse.status) || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  if (!providerResponse.ok) {
    const status = providerResponse.status === 429 ? 429 : 502;
    const err = new Error(status === 429
      ? "The translation provider is rate-limiting requests. Wait briefly and retry."
      : "The translation provider could not complete this batch. Retry the translation.");
    err.httpStatus = status;
    throw err;
  }
  const providerData = await providerResponse.json();
  if (!Array.isArray(providerData.translations) || providerData.translations.length !== body.blocks.length) {
    throw new Error("Provider returned an incomplete batch.");
  }
  return {
    translations: providerData.translations.map((translation, index) => ({
      id: body.blocks[index].id,
      text: translation.text,
      detectedSourceLang: translation.detected_source_language || null
    }))
  };
}

// Zero-signup fallback: Google Translate's internal endpoint. No key required.
// Best-effort quality; ToS grey zone — operators should set DEEPL_AUTH_KEY for production.
// Falls back to the base language when a region-specific target code is rejected.
async function translateWithGoogle(body) {
  const baseTarget = REGION_SUFFIX.test(body.targetLang) ? body.targetLang.slice(0, 2).toLowerCase() : body.targetLang.toLowerCase();
  const source = body.sourceLang ? body.sourceLang.toLowerCase() : "auto";
  const translations = [];
  for (const block of body.blocks) {
    let translated = null;
    for (const candidate of [body.targetLang.toLowerCase(), baseTarget]) {
      try {
        const url = "https://translate.googleapis.com/translate_a/single"
          + "?client=gtx&sl=" + encodeURIComponent(source)
          + "&tl=" + encodeURIComponent(candidate)
          + "&dt=t&q=" + encodeURIComponent(block.text);
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ProgeniBench/1.0)" },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data) || !Array.isArray(data[0])) continue;
        translated = data[0].map(pair => pair && pair[0] ? pair[0] : "").join("");
        const detected = data[2] && typeof data[2] === "string" ? data[2].toUpperCase() : null;
        translations.push({ id: block.id, text: translated, detectedSourceLang: detected });
        translated = null; // sentinel: pushed
        break;
      } catch {
        // try next candidate
      }
    }
    if (translated === null && !translations.some(t => t.id === block.id)) {
      // Both candidates failed for this block.
      const err = new Error("The translation fallback could not process this block. Retry, or configure DEEPL_AUTH_KEY for reliable service.");
      err.httpStatus = 502;
      throw err;
    }
  }
  return { translations };
}

// Provider chain: DeepL when configured, Google fallback otherwise.
async function translateWithProvider(body, authKey) {
  if (authKey) {
    try {
      return { result: await translateWithDeepL(body, authKey), provider: "deepl" };
    } catch (error) {
      // Only fall back to the anonymous provider for transient DeepL failures;
      // never fall back on quota/rate-limit errors — that would double-spend.
      if (error && error.httpStatus === 429) throw error;
      console.error("pdf-translation-deepl-failed", {
        name: error && error.name ? error.name : "Error",
        message: "DeepL failed; falling back to anonymous provider."
      });
      return { result: await translateWithGoogle(body), provider: "google-fallback" };
    }
  }
  return { result: await translateWithGoogle(body), provider: "google-fallback" };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Use POST to translate text." });
  }
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin && host) {
    let originHost;
    try { originHost = new URL(origin).host; } catch { return json(res, 403, { error: "Request origin is not allowed." }); }
    if (originHost !== host) return json(res, 403, { error: "Request origin is not allowed." });
  }

  const body = req.body;
  const validationError = validateRequest(body);
  if (validationError) return json(res, 400, { error: validationError });

  // No authKey guard here: provider chain falls back to the anonymous provider.
  // (The 503 that used to fire when DEEPL_AUTH_KEY was missing is replaced by
  // the documented fallback so the tool works out of the box.)
  const authKey = process.env.DEEPL_AUTH_KEY || null;

  const ip = String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  let quota;
  try {
    quota = await checkGlobalQuota(ip, body.blocks.reduce((sum, block) => sum + block.text.length, 0));
  } catch (error) {
    console.error("pdf-translation-quota-error", {
      name: error && error.name ? error.name : "Error",
      message: "Global quota service could not be reached."
    });
    return json(res, 503, { error: "Translation is temporarily unavailable because the quota service could not be reached." });
  }
  if (!quota.configured) {
    return json(res, 503, { error: "Translation is not configured for production. Configure the server-side quota service." });
  }
  if (!quota.allowed) return json(res, 429, { error: "Translation quota exceeded. Try again later." });

  // Provider cache key.
  const providerKey = authKey || "google-fallback";
  const digest = crypto.createHash("sha256")
    .update(providerKey)
    .update(process.env.DEEPL_API_URL || "")
    .update(process.env.DEEPL_GLOSSARY_ID || "")
    .update(process.env.DEEPL_GLOSSARY_SOURCE_LANG || "")
    .update(process.env.DEEPL_GLOSSARY_TARGET_LANG || "")
    .update(JSON.stringify(body))
    .digest("hex");
  pruneCache();
  const cached = responseCache.get(digest);
  if (cached) {
    res.setHeader("X-Translation-Provider", cached.provider || "unknown");
    return json(res, 200, Object.assign({ provider: cached.provider || "unknown" }, cached.result));
  }

  try {
    const { result, provider } = await translateWithProvider(body, authKey);
    responseCache.set(digest, { createdAt: Date.now(), result, provider });
    res.setHeader("X-Translation-Provider", provider);
    return json(res, 200, Object.assign({ provider }, result));
  } catch (error) {
    console.error("pdf-translation-provider-error", {
      name: error && error.name ? error.name : "Error",
      message: error && error.message ? error.message : "Unknown provider error"
    });
    const httpStatus = error && error.httpStatus ? error.httpStatus : 502;
    const message = error && error.message ? error.message : "Translation failed before a complete response was received. Retry the batch.";
    return json(res, httpStatus, { error: message });
  }
}

module.exports = handler;
module.exports.validateRequest = validateRequest;
module.exports.isRateLimited = isRateLimited;
module.exports.checkGlobalQuota = checkGlobalQuota;
