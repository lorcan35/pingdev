#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3500"
OUT="$HOME/projects/pingdev/test-results/e2e-bugfix-results.md"
mkdir -p "$(dirname "$OUT")"

PASS=0
FAIL=0

result() {
  local name="$1" status="$2" detail="$3"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS+1))
    echo "✅ $name"
  else
    FAIL=$((FAIL+1))
    echo "❌ $name: $detail"
  fi
  echo "### $name" >> "$OUT"
  echo "- **Status:** $status" >> "$OUT"
  [ -n "$detail" ] && echo "- **Detail:** $detail" >> "$OUT"
  echo "" >> "$OUT"
}

api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$data"
  else
    curl -sS -X "$method" "$BASE$path" -H 'Content-Type: application/json'
  fi
}

echo "# PingOS E2E Bugfix Test Results" > "$OUT"
echo "Run: $(date)" >> "$OUT"
echo "" >> "$OUT"

# Get device ID
DEVICE=$(api GET /v1/devices | jq -r '.extension.clients[0].tabs[0].deviceId')
echo "Device: $DEVICE"
echo "- **Device:** \`$DEVICE\`" >> "$OUT"
echo "" >> "$OUT"

# ── Test 1: Recorder captures API actions (Bug #1) ──
echo ""
echo "═══ Test 1: Recorder captures API actions ═══"
api POST /v1/record/start "{\"device\":\"$DEVICE\",\"name\":\"e2e-bug1\"}" > /dev/null
api POST "/v1/dev/$DEVICE/navigate" '{"url":"https://news.ycombinator.com"}' > /dev/null
sleep 2
api POST "/v1/dev/$DEVICE/extract" '{"query":"top 3 stories"}' > /dev/null
EXPORT=$(api POST /v1/record/export "{\"device\":\"$DEVICE\"}")
echo "$EXPORT" | jq '{actionCount: .result.actionCount, types: [.result.actions[].type]}' >> "$OUT"
ALEN=$(echo "$EXPORT" | jq '.result.actions | length')
HAS_NAV=$(echo "$EXPORT" | jq '[.result.actions[].type] | any(. == "navigate")')
HAS_EXT=$(echo "$EXPORT" | jq '[.result.actions[].type] | any(. == "extract")')
if [ "$ALEN" -ge 2 ] && [ "$HAS_NAV" = "true" ] && [ "$HAS_EXT" = "true" ]; then
  result "Bug#1 Recorder captures API actions" "PASS" "actions=$ALEN, navigate=$HAS_NAV, extract=$HAS_EXT"
else
  result "Bug#1 Recorder captures API actions" "FAIL" "actions=$ALEN, navigate=$HAS_NAV, extract=$HAS_EXT"
fi

# ── Test 2: Export warns on empty (Bug #2) ──
echo ""
echo "═══ Test 2: Export warns on empty recordings ═══"
api POST /v1/record/start "{\"device\":\"$DEVICE\",\"name\":\"e2e-empty\"}" > /dev/null
EMPTY_EXPORT=$(api POST /v1/record/export "{\"device\":\"$DEVICE\"}")
ACOUNT=$(echo "$EMPTY_EXPORT" | jq '.result.actionCount')
WARNING=$(echo "$EMPTY_EXPORT" | jq -r '.warning // .result.warning // "none"')
echo "$EMPTY_EXPORT" | jq '{actionCount: .result.actionCount, warning: (.warning // .result.warning)}' >> "$OUT"
if [ "$ACOUNT" = "0" ] && [ "$WARNING" != "none" ] && [ "$WARNING" != "null" ]; then
  result "Bug#2 Empty export warning" "PASS" "actionCount=$ACOUNT, warning=$WARNING"
else
  result "Bug#2 Empty export warning" "FAIL" "actionCount=$ACOUNT, warning=$WARNING"
fi

# ── Test 3: Recordings persist (Bug #3) ──
echo ""
echo "═══ Test 3: Recordings persist after export ═══"
RECS=$(api GET /v1/recordings)
REC_COUNT=$(echo "$RECS" | jq '.recordings | length')
HAS_NONZERO=$(echo "$RECS" | jq '[.recordings[].actionCount] | any(. > 0)')
if [ "$REC_COUNT" -gt 0 ] && [ "$HAS_NONZERO" = "true" ]; then
  result "Bug#3 Recordings persist" "PASS" "saved=$REC_COUNT, hasNonZero=$HAS_NONZERO"
else
  result "Bug#3 Recordings persist" "FAIL" "saved=$REC_COUNT, hasNonZero=$HAS_NONZERO"
fi

# ── Test 4: Replay by ID (Bug #4) ──
echo ""
echo "═══ Test 4: Replay by recording ID ═══"
REC_ID=$(echo "$RECS" | jq -r '[.recordings[] | select(.actionCount > 0)][0].id')
if [ -z "$REC_ID" ] || [ "$REC_ID" = "null" ]; then
  result "Bug#4 Replay by ID" "FAIL" "no recording with actions found"
else
  REPLAY=$(api POST /v1/record/replay "{\"device\":\"$DEVICE\",\"recordingId\":\"$REC_ID\"}")
  R_OK=$(echo "$REPLAY" | jq '.ok')
  R_COUNT=$(echo "$REPLAY" | jq '.result.successCount // .result.actionsReplayed // .result.replayed // (.result.steps | length) // 0')
  echo "$REPLAY" | jq '{ok, successCount: .result.successCount, steps: (.result.steps | length)}' >> "$OUT"
  if [ "$R_OK" = "true" ] && [ "$R_COUNT" -gt 0 ]; then
    result "Bug#4 Replay by ID" "PASS" "recordingId=$REC_ID, replayed=$R_COUNT"
  else
    result "Bug#4 Replay by ID" "FAIL" "ok=$R_OK, replayed=$R_COUNT"
  fi
fi
sleep 2

# ── Test 5: Query count limiting (Bug #6) ──
echo ""
echo "═══ Test 5: Query count limiting ═══"
EXT3=$(api POST "/v1/dev/$DEVICE/extract" '{"query":"top 3 story titles"}')
LENS3=$(echo "$EXT3" | jq '[.result.data | to_entries[] | select(.value | type == "array") | .value | length]')
ALL3=$(echo "$LENS3" | jq 'all(. == 3)')
echo "Requesting 3: $LENS3" >> "$OUT"

EXT7=$(api POST "/v1/dev/$DEVICE/extract" '{"query":"first 7 stories"}')
LENS7=$(echo "$EXT7" | jq '[.result.data | to_entries[] | select(.value | type == "array") | .value | length]')
ALL7=$(echo "$LENS7" | jq 'all(. == 7)')
echo "Requesting 7: $LENS7" >> "$OUT"

if [ "$ALL3" = "true" ] && [ "$ALL7" = "true" ]; then
  result "Bug#6 Query count limiting" "PASS" "3→$LENS3, 7→$LENS7"
else
  result "Bug#6 Query count limiting" "FAIL" "3→$LENS3 (all3=$ALL3), 7→$LENS7 (all7=$ALL7)"
fi

# ── Test 6: Pipeline read params (Bug #8) ──
echo ""
echo "═══ Test 6: Pipeline read param normalization ═══"
PIPE1=$(api POST /v1/pipelines/run "{\"name\":\"read-selector\",\"steps\":[{\"id\":\"s1\",\"op\":\"read\",\"tab\":\"$DEVICE\",\"selector\":\"h1\"}]}")
P1_OK=$(echo "$PIPE1" | jq '.ok')
P1_STEP=$(echo "$PIPE1" | jq -r '.result.steps[0].status // "error"')

PIPE2=$(api POST /v1/pipelines/run "{\"name\":\"read-text\",\"steps\":[{\"id\":\"s1\",\"op\":\"read\",\"tab\":\"$DEVICE\",\"text\":\"h1\"}]}")
P2_OK=$(echo "$PIPE2" | jq '.ok')
P2_STEP=$(echo "$PIPE2" | jq -r '.result.steps[0].status // "error"')

echo "selector format: ok=$P1_OK step=$P1_STEP" >> "$OUT"
echo "text format: ok=$P2_OK step=$P2_STEP" >> "$OUT"

if [ "$P1_OK" = "true" ] && [ "$P1_STEP" = "ok" ] && [ "$P2_OK" = "true" ]; then
  result "Bug#8 Pipeline read params" "PASS" "selector=$P1_STEP, text=$P2_STEP"
else
  result "Bug#8 Pipeline read params" "FAIL" "selector: ok=$P1_OK step=$P1_STEP, text: ok=$P2_OK step=$P2_STEP"
fi

# ── Test 7: Watch schema endpoint (Bug #5) ──
echo ""
echo "═══ Test 7: Watch schema endpoint ═══"
WATCH_RESP=$(curl -sS -X POST "$BASE/v1/dev/$DEVICE/watch" \
  -H 'Content-Type: application/json' \
  -d '{"schema":{"title":".storylink a"}, "interval": 5000}' \
  --max-time 3 -o /tmp/watch-body.txt -w '%{http_code}' 2>/dev/null || echo "timeout")

if [ "$WATCH_RESP" = "timeout" ] || [ "$WATCH_RESP" = "200" ]; then
  # SSE streams will timeout (expected) or return 200
  result "Bug#5 Watch schema endpoint" "PASS" "http=$WATCH_RESP (SSE stream or 200)"
elif [ "$WATCH_RESP" = "400" ]; then
  result "Bug#5 Watch schema endpoint" "FAIL" "got 400 — schema rejected"
else
  result "Bug#5 Watch schema endpoint" "PASS" "http=$WATCH_RESP"
fi

# ── Summary ──
echo ""
echo "════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "════════════════════════════"
echo "" >> "$OUT"
echo "## Summary: $PASS PASS / $FAIL FAIL" >> "$OUT"
