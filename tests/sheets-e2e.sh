#!/usr/bin/env bash
# Google Sheets E2E test suite for PingOS
# Usage: ./sheets-e2e.sh [GATEWAY_URL] [DEVICE_ID]
set -euo pipefail

GW=${1:-http://localhost:3500}
DEV=${2:-chrome-TAB_ID}

PASS_COUNT=0
FAIL_COUNT=0

# ---------- helpers ----------

call_op() {
  local op="$1" payload="$2"
  curl -s -X POST "$GW/v1/dev/$DEV/$op" \
    -H 'Content-Type: application/json' \
    -d "$payload"
}

assert_ok() {
  local label="$1" result="$2"
  if echo "$result" | jq -e '.ok == true' >/dev/null 2>&1; then
    echo "PASS: $label"
    ((PASS_COUNT++))
  else
    echo "FAIL: $label — $result"
    ((FAIL_COUNT++))
  fi
}

# ---------- tests ----------

echo "=== Google Sheets E2E Tests ==="
echo "Gateway : $GW"
echo "Device  : $DEV"
echo ""

# 1. Recon — verify Sheets is detected
R=$(call_op recon '{}')
if echo "$R" | jq -e '.ok == true' >/dev/null 2>&1 && \
   echo "$R" | jq -r '.data' 2>/dev/null | grep -qiE 'canvas|grid|sheet'; then
  echo "PASS: recon — Sheets detected"
  ((PASS_COUNT++))
else
  echo "FAIL: recon — $R"
  ((FAIL_COUNT++))
fi

# 2. Click on cell A1
R=$(call_op click '{"selector":"cell=A1"}')
assert_ok "click cell A1" "$R"

# 3a. Press Enter to confirm
R=$(call_op press '{"key":"Enter"}')
assert_ok "press Enter" "$R"

# 3b. Press Tab to move to next cell
R=$(call_op press '{"key":"Tab"}')
assert_ok "press Tab" "$R"

# 4. Type "Hello PingOS" in formula bar
R=$(call_op type '{"selector":"#t-formula-bar-input","text":"Hello PingOS"}')
assert_ok "type in formula bar" "$R"

# 5. Press Enter to commit the value
R=$(call_op press '{"key":"Enter"}')
assert_ok "press Enter to commit" "$R"

# 6. Double-click cell A1 to re-enter edit mode
R=$(call_op dblclick '{"selector":"cell=A1"}')
assert_ok "dblclick cell A1" "$R"

# 7a. Press Ctrl+A (select all)
R=$(call_op press '{"key":"a","modifiers":["ctrl"]}')
assert_ok "press Ctrl+A" "$R"

# 7b. Press Ctrl+C (copy)
R=$(call_op press '{"key":"c","modifiers":["ctrl"]}')
assert_ok "press Ctrl+C" "$R"

# 8. Read formula bar content
R=$(call_op read '{"selector":"#t-formula-bar-input"}')
assert_ok "read formula bar" "$R"

# 9. Eval to extract cell values from accessibility layer
R=$(call_op eval '{"expression":"document.querySelector(\"#t-formula-bar-input\")?.textContent || \"\""}')
assert_ok "eval formula bar content" "$R"

# 10a. Scroll down
R=$(call_op scroll '{"direction":"down","amount":500}')
assert_ok "scroll down" "$R"

# 10b. Scroll back up
R=$(call_op scroll '{"direction":"up","amount":500}')
assert_ok "scroll up" "$R"

# 11. Click on Format menu
R=$(call_op click '{"selector":"role=menuitem:Format"}')
assert_ok "click Format menu" "$R"

# 12. Press Escape to close menu
R=$(call_op press '{"key":"Escape"}')
assert_ok "press Escape" "$R"

# ---------- canvas-specific tests ----------

# 13. Recon — verify canvas app detection and automation strategy
R=$(call_op recon '{}')
if echo "$R" | jq -e '.ok == true' >/dev/null 2>&1 && \
   echo "$R" | jq -e '.data.canvasApp == true' >/dev/null 2>&1; then
  echo "PASS: recon canvasApp detected"
  ((PASS_COUNT++))
else
  echo "FAIL: recon canvasApp — $R"
  ((FAIL_COUNT++))
fi

# 14. Verify automation strategy is 'aria-overlay' (Sheets has ARIA grid)
STRATEGY=$(echo "$R" | jq -r '.data.automationStrategy' 2>/dev/null)
if [ "$STRATEGY" = "aria-overlay" ]; then
  echo "PASS: automation strategy = aria-overlay"
  ((PASS_COUNT++))
else
  echo "FAIL: automation strategy = $STRATEGY (expected aria-overlay)"
  ((FAIL_COUNT++))
fi

# 15. Read cell via aria= prefix (fixed handleRead routing)
R=$(call_op read '{"selector":"cell=A1"}')
assert_ok "read cell=A1 via prefix selector" "$R"

# 16. Read cell range A1:C3
R=$(call_op read '{"selector":"cell=A1:C3"}')
assert_ok "read cell range A1:C3" "$R"

# 17. Canvas coordinate click (click at pixel 100,100 on the canvas)
R=$(call_op click '{"selector":"canvas","x":100,"y":100}')
assert_ok "canvas coordinate click (100,100)" "$R"

# 18. Arrow key navigation on focused canvas
R=$(call_op press '{"key":"ArrowRight"}')
assert_ok "press ArrowRight (canvas navigation)" "$R"

R=$(call_op press '{"key":"ArrowDown"}')
assert_ok "press ArrowDown (canvas navigation)" "$R"

# ---------- summary ----------

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo "=== Summary ==="
echo "$PASS_COUNT passed, $FAIL_COUNT failed (out of $TOTAL tests)"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
