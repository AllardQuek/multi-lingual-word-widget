# Backend v1 (Minimal)

This backend is a **simple anonymous API** for multilingual word generation.

Runtime: **Node.js + Fastify**

## Why this v1
- Stateless: no database required
- Minimal contract: `count` + `theme`
- Basic abuse protection: in-memory per-IP or `x-client-id` rate limit
- Provider-flexible: Gemini or OpenAI via OpenAI-compatible API

## API

### Health
- `GET /health`

Response:
```json
{ "ok": true, "provider": "gemini" }
```

### Generate word batch
- `POST /api/word`
- Headers:
  - `Content-Type: application/json`
  - Optional: `x-client-id: <stable-device-id>`

Request body:
```json
{
  "count": 50,
  "theme": "anything"
}
```

Response body (array):
```json
[ 
  {
    "word": "example",
    "definition": "a representative sample",
    "translations": {
      "de": "Beispiel",
      "id": "contoh"
    }
  }
]
```

Notes:
- `count` default: `50`, min: `1`, max: `100`
- Translation languages are configured server-side to mirror `script_llm.js`

Error shape:
```json
{
  "error": {
    "code": "provider_error",
    "message": "Failed to generate word.",
    "details": "...",
    "requestId": "req_xxx"
  }
}
```

## Local run

From `backend/`:

```bash
cp .env.example .env
pnpm install
export $(grep -v '^#' .env | xargs)
pnpm start
```

Server defaults to `http://localhost:8787`.

Environment file:
- `backend/.env`

Backend loads only `backend/.env`.

Using Bun:

```bash
cp .env.example .env
bun install
export $(grep -v '^#' .env | xargs)
bun run start
```

## Environment variables
- `PORT`
- `ALLOW_ORIGIN`
- `ACTIVE_PROVIDER` (`gemini` or `openai`)
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_MODEL`
- `LLM_TIMEOUT_MS`
- `DEFAULT_BATCH_SIZE`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`

## Deployment notes
- Suitable for Render/Fly/VM deployment as a single web service.
- In-memory limiter is per-instance. For multi-instance scaling, replace with Redis-backed limiting.
