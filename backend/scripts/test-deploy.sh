#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://multi-lingual-word-widget.onrender.com}}"
CLIENT_ID="${CLIENT_ID:-smoketest-$(date +%s)}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "Running backend smoke tests against: $BASE_URL"

echo "[1/3] Health check"
health_status=$(curl -sS -o "$TMP_DIR/health.json" -w "%{http_code}" "$BASE_URL/health")
if [[ "$health_status" != "200" ]]; then
  cat "$TMP_DIR/health.json" >&2 || true
  fail "GET /health returned HTTP $health_status"
fi
if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$TMP_DIR/health.json"; then
  cat "$TMP_DIR/health.json" >&2 || true
  fail "GET /health missing ok=true"
fi

echo "[2/3] Generate batch check"
gen_status=$(curl -sS -o "$TMP_DIR/generate.json" -w "%{http_code}" -X POST "$BASE_URL/api/word" \
  -H "Content-Type: application/json" \
  -H "x-client-id: $CLIENT_ID" \
  -d '{"count":3,"theme":"anything"}')
if [[ "$gen_status" != "200" ]]; then
  cat "$TMP_DIR/generate.json" >&2 || true
  fail "POST /api/word returned HTTP $gen_status"
fi

if ! node -e '
const fs = require("fs");
const raw = fs.readFileSync(process.argv[1], "utf8");
const data = JSON.parse(raw);
if (!Array.isArray(data) || data.length === 0) process.exit(1);
for (const item of data) {
  if (!item || typeof item !== "object") process.exit(1);
  if (!item.word || !item.definition || !item.translations) process.exit(1);
}
' "$TMP_DIR/generate.json"; then
  cat "$TMP_DIR/generate.json" >&2 || true
  fail "POST /api/word response shape is invalid"
fi

echo "[3/3] Validation check (expect 400)"
invalid_status=$(curl -sS -o "$TMP_DIR/invalid.json" -w "%{http_code}" -X POST "$BASE_URL/api/word" \
  -H "Content-Type: application/json" \
  -d '{"count":0,"theme":"anything"}')
if [[ "$invalid_status" != "400" ]]; then
  cat "$TMP_DIR/invalid.json" >&2 || true
  fail "Expected HTTP 400 for invalid request, got $invalid_status"
fi
if ! grep -Eq '"invalid_request"|"count must be an integer between 1 and 100"' "$TMP_DIR/invalid.json"; then
  cat "$TMP_DIR/invalid.json" >&2 || true
  fail "Invalid request response did not contain expected error details"
fi

echo "PASS: deployment smoke tests passed"
