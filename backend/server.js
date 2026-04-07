const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const Fastify = require("fastify");
const cors = require("@fastify/cors");

const PORT = Number(process.env.PORT || 8787);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

const ACTIVE_PROVIDER = (process.env.ACTIVE_PROVIDER || "gemini").toLowerCase();
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 15000);
const DEFAULT_BATCH_SIZE = Number(process.env.DEFAULT_BATCH_SIZE || 50);

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30);

const PROVIDER_CONFIG = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview",
    apiKey: process.env.GEMINI_API_KEY || ""
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY || ""
  }
};

const LANG_CONFIG = [
  { code: "de", name: "German", include: true },
  { code: "id", name: "Indonesian", include: true },
  { code: "km", name: "Khmer", include: true },
  { code: "vi", name: "Vietnamese", include: true },
  { code: "ar", name: "Arabic", include: false },
  { code: "yue", name: "Cantonese", include: false },
  { code: "nl", name: "Dutch", include: false },
  { code: "fr", name: "French", include: false },
  { code: "el", name: "Greek", include: false },
  { code: "he", name: "Hebrew", include: false },
  { code: "hi", name: "Hindi", include: false },
  { code: "it", name: "Italian", include: false },
  { code: "ja", name: "Japanese", include: false },
  { code: "ko", name: "Korean", include: false },
  { code: "zh", name: "Mandarin", include: false },
  { code: "pl", name: "Polish", include: false },
  { code: "pt", name: "Portuguese", include: false },
  { code: "ru", name: "Russian", include: false },
  { code: "es", name: "Spanish", include: false },
  { code: "sw", name: "Swahili", include: false },
  { code: "tl", name: "Tagalog", include: false },
  { code: "th", name: "Thai", include: false },
  { code: "tr", name: "Turkish", include: false }
];

const limiterStore = new Map();

const app = Fastify({
  trustProxy: true,
  logger: false,
  bodyLimit: 16 * 1024
});

function getRequestId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${ts}_${rand}`;
}

function normalizeTheme(theme) {
  if (typeof theme !== "string") return "anything";
  const cleaned = theme.trim().toLowerCase();
  if (!cleaned) return "anything";
  return cleaned.slice(0, 40);
}

function normalizeCount(count) {
  if (typeof count !== "number" || !Number.isInteger(count)) {
    return DEFAULT_BATCH_SIZE;
  }
  if (count < 1) return 1;
  if (count > 100) return 100;
  return count;
}

function getClientKey(req) {
  const clientId = req.headers["x-client-id"];
  if (clientId && /^[a-zA-Z0-9._-]{3,64}$/.test(clientId)) {
    return `client:${clientId}`;
  }
  return `ip:${req.ip || "unknown"}`;
}

function checkRateLimit(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const current = limiterStore.get(key);

  if (!current || now >= current.resetAt) {
    limiterStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return null;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
    return {
      retryAfterSec: Math.max(retryAfterSec, 1),
      error: {
        code: "rate_limited",
        message: "Too many requests. Please retry later."
      }
    };
  }

  current.count += 1;
  return null;
}

function validateBody(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return "Body must be a JSON object.";
  }

  if (body.count != null && (!Number.isInteger(body.count) || body.count < 1 || body.count > 100)) {
    return "count must be an integer between 1 and 100.";
  }

  if (body.theme != null && typeof body.theme !== "string") {
    return "theme must be a string.";
  }

  if (typeof body.theme === "string" && body.theme.length > 120) {
    return "theme cannot exceed 120 characters.";
  }

  return null;
}

function buildBatchPrompt(count, theme) {
  const selectedLangs = LANG_CONFIG.filter((l) => l.include);
  const languageCodesList = JSON.stringify(selectedLangs.map((l) => `${l.name} (${l.code})`));

  return [
    {
      role: "system",
      content: `You are a Random Word API. Generate ${count} UNIQUE random English words with translations.\n\nRules:\n1. Return an ARRAY of ${count} word objects\n2. Each word should be intermediate difficulty, suitable for language learning\n3. Theme: ${theme}\n4. Translate each word into: ${languageCodesList}\n5. For non-Latin scripts (ar, el, he, hi, ja, km, ko, ru, th, yue, zh): romanization FIRST, then native script in parentheses\n6. Keep definitions under 50 characters\n7. Sort translations alphabetically by language code\n\nReturn format (JSON array):\n[\n  {\n    "word": "example",\n    "definition": "a representative sample",\n    "translations": {\n      "de": "Beispiel",\n      "id": "contoh"\n    }\n  }\n]\n\nIMPORTANT: Return ONLY the JSON array, no markdown, no code blocks, no explanations.`
    },
    {
      role: "user",
      content: `Generate ${count} unique words with translations for the theme "${theme}".`
    }
  ];
}

async function callLLM(messages) {
  const provider = PROVIDER_CONFIG[ACTIVE_PROVIDER];
  if (!provider) {
    throw new Error(`Unsupported provider: ${ACTIVE_PROVIDER}`);
  }
  if (!provider.apiKey) {
    throw new Error(`Missing API key for provider: ${ACTIVE_PROVIDER}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${provider.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 1
      }),
      signal: controller.signal
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Provider HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }

    if (payload && payload.error) {
      throw new Error(payload.error.message || JSON.stringify(payload.error));
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Provider returned an empty completion.");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function parseBatchResponse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON from provider: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Provider response must be a JSON array.");
  }

  const validWords = parsed.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (!item.word || !item.definition || !item.translations) return false;
    return true;
  });

  if (validWords.length === 0) {
    throw new Error("No valid words in provider batch response.");
  }

  return validWords;
}

async function start() {
  await app.register(cors, {
    origin: ALLOW_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-client-id"]
  });

  app.get("/health", async () => {
    return { ok: true, provider: ACTIVE_PROVIDER };
  });

  app.post("/api/word", async (req, reply) => {
  const requestId = getRequestId();

  try {
    const rateLimitError = checkRateLimit(req);
    if (rateLimitError) {
      reply.header("Retry-After", String(rateLimitError.retryAfterSec));
      return reply.status(429).send({
        error: rateLimitError.error
      });
    }

    const validationError = validateBody(req.body);
    if (validationError) {
      return reply.status(400).send({
        error: {
          code: "invalid_request",
          message: validationError,
          requestId
        }
      });
    }

    const theme = normalizeTheme(req.body.theme);
    const count = normalizeCount(req.body.count);

    const prompt = buildBatchPrompt(count, theme);
    const completion = await callLLM(prompt);
    const words = parseBatchResponse(completion);

    return reply.send(words);
  } catch (err) {
    const message = err && err.message ? err.message : "Unknown error";
    const isTimeout = /aborted|abort/i.test(message);

    return reply.status(isTimeout ? 504 : 502).send({
      error: {
        code: isTimeout ? "provider_timeout" : "provider_error",
        message: "Failed to generate word.",
        details: message,
        requestId
      }
    });
  }
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Backend API listening on port ${PORT}`);
  console.log(`Provider: ${ACTIVE_PROVIDER}`);
}

start().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
