import crypto from "node:crypto";

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

async function checkGlobalQuota(ip, charCount, env, now = Date.now()) {
  const redisUrl = (env && env.UPSTASH_REDIS_REST_URL) || (typeof process !== "undefined" && process.env && process.env.UPSTASH_REDIS_REST_URL);
  const redisToken = (env && env.UPSTASH_REDIS_REST_TOKEN) || (typeof process !== "undefined" && process.env && process.env.UPSTASH_REDIS_REST_TOKEN);
  const deeplKey = (env && env.DEEPL_AUTH_KEY) || (typeof process !== "undefined" && process.env && process.env.DEEPL_AUTH_KEY);

  if (!redisUrl || !redisToken) {
    if (!quotaWarned) {
      quotaWarned = true;
      console.warn("pdf-translation: UPSTASH_REDIS_REST_URL/TOKEN not set — using per-instance in-memory rate limiter.");
    }
    return { configured: true, allowed: !isRateLimited(ip, now), localOnly: true };
  }

  const minute = Math.floor(now / 60000);
  const day = new Date(now).toISOString().slice(0, 10);
  const ipHash = crypto.createHmac("sha256", deeplKey || "pdf-translator-local-fallback").update(ip).digest("hex").slice(0, 32);
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

async function translateWithDeepL(body, authKey, env) {
  const apiUrl = (env && env.DEEPL_API_URL) || (typeof process !== "undefined" && process.env && process.env.DEEPL_API_URL) || "https://api.deepl.com/v2/translate";
  if (apiUrl !== "https://api.deepl.com/v2/translate" && apiUrl !== "https://api-free.deepl.com/v2/translate") {
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
  const glossaryId = (env && env.DEEPL_GLOSSARY_ID) || (typeof process !== "undefined" && process.env && process.env.DEEPL_GLOSSARY_ID);
  const glossarySrc = (env && env.DEEPL_GLOSSARY_SOURCE_LANG) || (typeof process !== "undefined" && process.env && process.env.DEEPL_GLOSSARY_SOURCE_LANG);
  const glossaryTgt = (env && env.DEEPL_GLOSSARY_TARGET_LANG) || (typeof process !== "undefined" && process.env && process.env.DEEPL_GLOSSARY_TARGET_LANG);
  if (glossaryId && body.sourceLang === glossarySrc && body.targetLang === glossaryTgt) {
    payload.glossary_id = glossaryId;
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
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*"
          },
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          if (!Array.isArray(data) || !Array.isArray(data[0])) {
            console.warn("pdf-translation: google fallback malformed payload", { candidate, blockIndex: body.blocks.indexOf(block) });
            continue;
          }
          translated = data[0].map(pair => pair && pair[0] ? pair[0] : "").join("");
          const detected = data[2] && typeof data[2] === "string" ? data[2].toUpperCase() : null;
          translations.push({ id: block.id, text: translated, detectedSourceLang: detected });
          translated = null;
          console.log("pdf-translation: google fallback succeeded", { candidate, chars: block.text.length });
          break;
        }
      } catch (fetchError) {
        console.warn("pdf-translation: google fallback fetch error", {
          candidate,
          message: fetchError && fetchError.message ? String(fetchError.message).slice(0, 200) : "unknown"
        });
      }
    }
    if (translated === null && !translations.some(t => t.id === block.id)) {
      const err = new Error("The translation fallback could not process this block. Retry, or configure DEEPL_AUTH_KEY for reliable service.");
      err.httpStatus = 502;
      throw err;
    }
  }
  return { translations };
}

async function translateWithProvider(body, authKey, env) {
  if (authKey) {
    try {
      return { result: await translateWithDeepL(body, authKey, env), provider: "deepl" };
    } catch (error) {
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

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host) {
    let originHost;
    try { originHost = new URL(origin).host; } catch {
      return jsonResponse(403, { error: "Request origin is not allowed." });
    }
    if (originHost !== host) {
      return jsonResponse(403, { error: "Request origin is not allowed." });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Expected a JSON object." });
  }

  const validationError = validateRequest(body);
  if (validationError) return jsonResponse(400, { error: validationError });

  const authKey = (env && env.DEEPL_AUTH_KEY) || (typeof process !== "undefined" && process.env && process.env.DEEPL_AUTH_KEY) || null;
  const ip = String(
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  ).split(",")[0].trim();

  let quota;
  try {
    quota = await checkGlobalQuota(ip, body.blocks.reduce((sum, block) => sum + block.text.length, 0), env);
  } catch (error) {
    console.error("pdf-translation-quota-error", {
      name: error && error.name ? error.name : "Error",
      message: "Global quota service could not be reached."
    });
    return jsonResponse(503, { error: "Translation is temporarily unavailable because the quota service could not be reached." });
  }

  if (!quota.configured) {
    return jsonResponse(503, { error: "Translation is not configured for production. Configure the server-side quota service." });
  }
  if (!quota.allowed) {
    return jsonResponse(429, { error: "Translation quota exceeded. Try again later." });
  }

  const providerKey = authKey || "google-fallback";
  const digest = crypto.createHash("sha256")
    .update(providerKey)
    .update((env && env.DEEPL_API_URL) || "")
    .update((env && env.DEEPL_GLOSSARY_ID) || "")
    .update((env && env.DEEPL_GLOSSARY_SOURCE_LANG) || "")
    .update((env && env.DEEPL_GLOSSARY_TARGET_LANG) || "")
    .update(JSON.stringify(body))
    .digest("hex");

  pruneCache();
  const cached = responseCache.get(digest);
  if (cached) {
    return jsonResponse(200, Object.assign({ provider: cached.provider || "unknown" }, cached.result), {
      "X-Translation-Provider": cached.provider || "unknown"
    });
  }

  try {
    const { result, provider } = await translateWithProvider(body, authKey, env);
    responseCache.set(digest, { createdAt: Date.now(), result, provider });
    return jsonResponse(200, Object.assign({ provider }, result), {
      "X-Translation-Provider": provider
    });
  } catch (error) {
    console.error("pdf-translation-provider-error", {
      name: error && error.name ? error.name : "Error",
      message: error && error.message ? error.message : "Unknown provider error"
    });
    const httpStatus = error && error.httpStatus ? error.httpStatus : 502;
    const message = error && error.message ? error.message : "Translation failed before a complete response was received. Retry the batch.";
    return jsonResponse(httpStatus, { error: message });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Allow": "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

