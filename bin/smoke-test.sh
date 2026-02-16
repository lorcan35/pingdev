#!/usr/bin/env bash
# PingOS Smoke Test — verifies the gateway works with zero external dependencies
# Run: bash bin/smoke-test.sh
set -euo pipefail

PORT=3599
PASS=0
FAIL=0
GATEWAY_PID=""

cleanup() {
  if [ -n "$GATEWAY_PID" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== PingOS Smoke Test ==="
echo ""

# --- Start gateway with inline mock driver ---
echo "[1/5] Starting gateway on port $PORT..."

npx tsx -e "
import { createGateway } from './packages/std/src/gateway.js';
import { ModelRegistry } from './packages/std/src/registry.js';

const registry = new ModelRegistry('best');
registry.register({
  registration: {
    id: 'smoke-test',
    name: 'Smoke Test Driver',
    type: 'local',
    capabilities: {
      llm: true, streaming: false, vision: false, toolCalling: false,
      imageGen: false, search: false, deepResearch: false, thinking: false,
    },
    endpoint: 'local://smoke',
    priority: 1,
  },
  async health() { return { status: 'online', lastCheck: Date.now(), latencyMs: 1 }; },
  async execute(req) { return { text: 'smoke-ok: ' + req.prompt, driver: 'smoke-test', durationMs: 1 }; },
});

await createGateway({ port: $PORT, registry });
console.log('GATEWAY_READY');
" &
GATEWAY_PID=$!

# Wait for gateway to be ready (up to 10 seconds)
READY=false
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$PORT/v1/health" > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 0.5
done

if [ "$READY" != "true" ]; then
  echo "  FAIL — Gateway did not start within 10 seconds"
  exit 1
fi
echo "  OK — Gateway started (PID $GATEWAY_PID)"

# --- Test health endpoint ---
echo "[2/5] Testing GET /v1/health..."
HEALTH=$(curl -sf "http://localhost:$PORT/v1/health" 2>/dev/null || echo "CURL_FAIL")
if echo "$HEALTH" | grep -q '"healthy"'; then
  echo "  PASS — Health check returned healthy"
  PASS=$((PASS + 1))
else
  echo "  FAIL — Health check failed: $HEALTH"
  FAIL=$((FAIL + 1))
fi

# --- Test registry endpoint ---
echo "[3/5] Testing GET /v1/registry..."
REGISTRY=$(curl -sf "http://localhost:$PORT/v1/registry" 2>/dev/null || echo "CURL_FAIL")
if echo "$REGISTRY" | grep -q '"smoke-test"'; then
  echo "  PASS — Registry lists smoke-test driver"
  PASS=$((PASS + 1))
else
  echo "  FAIL — Registry did not list driver: $REGISTRY"
  FAIL=$((FAIL + 1))
fi

# --- Test prompt endpoint ---
echo "[4/5] Testing POST /v1/dev/llm/prompt..."
PROMPT=$(curl -sf "http://localhost:$PORT/v1/dev/llm/prompt" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"hello"}' 2>/dev/null || echo "CURL_FAIL")
if echo "$PROMPT" | grep -q '"smoke-ok: hello"'; then
  echo "  PASS — Prompt returned correct response"
  PASS=$((PASS + 1))
else
  echo "  FAIL — Prompt response unexpected: $PROMPT"
  FAIL=$((FAIL + 1))
fi

# --- Test error handling ---
echo "[5/5] Testing error handling (unsupported capability)..."
ERROR=$(curl -s "http://localhost:$PORT/v1/dev/llm/prompt" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","require":{"deepResearch":true}}' 2>/dev/null || echo "CURL_FAIL")
if echo "$ERROR" | grep -q '"ENOENT"'; then
  echo "  PASS — Error returned ENOENT for missing capability"
  PASS=$((PASS + 1))
else
  echo "  FAIL — Error response unexpected: $ERROR"
  FAIL=$((FAIL + 1))
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  echo "SMOKE TEST FAILED"
  exit 1
else
  echo "SMOKE TEST PASSED"
  exit 0
fi
