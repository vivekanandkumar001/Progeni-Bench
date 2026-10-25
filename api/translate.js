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
const MAX_REQUESTS_PER_MINUTE = 30;
const MAX_BLOCKS = 50;
const MAX_BLOCK_CHARS = 5000;
const MAX_TOTAL_CHARS = 15000;
const MAX_DAILY_CHARS_PER_IP = 150000;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production") return { configured: false, allowed: false };
    return { configured: true, allowed: !isRateLimited(ip, now), localOnly: true };
  }

  const minute = Math.floor(now / 60000);
  const day = new Date(now).toISOString().slice(0, 10);
  const ipHash = crypto.createHmac("sha256", process.env.DEEPL_AUTH_KEY).update(ip).digest("hex").slice(0, 32);
  const minuteKey = `bench:pdf-translate:minute:${ipHash}:${minute}`;
  const dayKey = `bench:pdf-translate:chars:${ipHash}:${day}`;
  let pipelineUrl;
  try {
    pipelineUrl = new URL("/pipeline", redisUrl);
    if (pipelineUrl.protocol !== "https:") throw new Error("Redis URL must use HTTPS.");
  } catch {
    return { configured: false, allowed: false };
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

  const authKey = process.env.DEEPL_AUTH_KEY;
  if (!authKey) return json(res, 503, { error: "PDF translation is not configured yet. Please try again later." });

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

  const apiUrl = process.env.DEEPL_API_URL || "https://api.deepl.com/v2/translate";
  if (apiUrl !== "https://api.deepl.com/v2/translate" && apiUrl !== "https://api-free.deepl.com/v2/translate") {
    return json(res, 503, { error: "Translation provider configuration is invalid." });
  }
  const digest = crypto.createHash("sha256")
    .update(authKey)
    .update(apiUrl)
    .update(process.env.DEEPL_GLOSSARY_ID || "")
    .update(process.env.DEEPL_GLOSSARY_SOURCE_LANG || "")
    .update(process.env.DEEPL_GLOSSARY_TARGET_LANG || "")
    .update(JSON.stringify(body))
    .digest("hex");
  pruneCache();
  const cached = responseCache.get(digest);
  if (cached) return json(res, 200, cached.result);

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

  try {
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
      return json(res, status, {
        error: status === 429
          ? "The translation provider is rate-limiting requests. Wait briefly and retry."
          : "The translation provider could not complete this batch. Retry the translation."
      });
    }
    const providerData = await providerResponse.json();
    if (!Array.isArray(providerData.translations) || providerData.translations.length !== body.blocks.length) {
      throw new Error("Provider returned an incomplete batch.");
    }
    const result = {
      translations: providerData.translations.map((translation, index) => ({
        id: body.blocks[index].id,
        text: translation.text,
        detectedSourceLang: translation.detected_source_language || null
      }))
    };
    responseCache.set(digest, { createdAt: Date.now(), result });
    return json(res, 200, result);
  } catch (error) {
    console.error("pdf-translation-provider-error", {
      name: error && error.name ? error.name : "Error",
      message: error && error.message ? error.message : "Unknown provider error"
    });
    return json(res, 502, { error: "Translation failed before a complete response was received. Retry the batch." });
  }
}

module.exports = handler;
module.exports.validateRequest = validateRequest;
module.exports.isRateLimited = isRateLimited;
module.exports.checkGlobalQuota = checkGlobalQuota;
