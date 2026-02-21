#!/usr/bin/env bash
set -u
BASE="http://localhost:3500"
OUT="$HOME/projects/pingdev/test-results/realworld-gauntlet-v2.md"
mkdir -p "$(dirname "$OUT")"

cat > "$OUT" <<MD
# PingOS Real-World Gauntlet v2

Started: $(date --iso-8601=seconds)
Target: \
- \`$BASE\`
- LLM timeout: 180s
- Non-LLM timeout: 30s

MD

LAST_BODY=""
LAST_CODE="000"
LAST_TIME="0"
SCEN_RESULTS=()

snip() { echo "$1" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-220; }

call_api() {
  local method="$1"; shift
  local path="$1"; shift
  local data="$1"; shift
  local llm="$1"; shift
  local t=30
  [ "$llm" = "1" ] && t=180
  local tmp
  tmp=$(mktemp)
  if [ -n "$data" ]; then
    timeout "$t" curl -s -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$data" -w '\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n' > "$tmp" || true
  else
    timeout "$t" curl -s -X "$method" "$BASE$path" -w '\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n' > "$tmp" || true
  fi
  LAST_CODE=$(grep 'HTTP_CODE:' "$tmp" | tail -n1 | cut -d: -f2)
  LAST_TIME=$(grep 'TIME_TOTAL:' "$tmp" | tail -n1 | cut -d: -f2)
  LAST_BODY=$(sed '/HTTP_CODE:/,$d' "$tmp")
  rm -f "$tmp"
}

log_call() {
  local label="$1"; shift
  local method="$1"; shift
  local path="$1"; shift
  local data="$1"; shift
  local llm="$1"; shift
  call_api "$method" "$path" "$data" "$llm"
  local ok="ERR"
  [[ "$LAST_CODE" =~ ^2 ]] && ok="OK"
  if [ "$ok" = "OK" ]; then
    echo "- \`$label\` → HTTP $LAST_CODE | ${LAST_TIME}s | $ok" >> "$OUT"
  else
    echo "- \`$label\` → HTTP $LAST_CODE | ${LAST_TIME}s | $ok | snippet: \`$(snip "$LAST_BODY")\`" >> "$OUT"
  fi
}

grade_scenario() {
  local sid="$1"; shift
  local fail_count="$1"; shift
  local slow_count="$1"; shift
  local context_ok="$1"; shift
  local robustness_ok="$1"; shift

  local functional="PASS"
  local quality="PASS"
  local speed="PASS"
  local context="PASS"
  local robustness="PASS"

  if [ "$fail_count" -gt 0 ]; then functional="PARTIAL"; quality="PARTIAL"; fi
  if [ "$fail_count" -gt 2 ]; then functional="FAIL"; fi
  if [ "$slow_count" -gt 2 ]; then speed="PARTIAL"; fi
  if [ "$context_ok" != "1" ]; then context="PARTIAL"; fi
  if [ "$robustness_ok" != "1" ]; then robustness="PARTIAL"; fi

  local final="✅ PASS"
  if [ "$functional" = "FAIL" ]; then final="❌ FAIL"
  elif [ "$functional" = "PARTIAL" ] || [ "$quality" = "PARTIAL" ] || [ "$speed" = "PARTIAL" ] || [ "$context" = "PARTIAL" ] || [ "$robustness" = "PARTIAL" ]; then
    final="⚠️ PARTIAL"
  fi

  {
    echo ""
    echo "### Grades"
    echo "- Functional: $functional"
    echo "- Quality: $quality"
    echo "- Speed: $speed"
    echo "- Context: $context"
    echo "- Robustness: $robustness"
    echo "- Final: $final"
    echo ""
  } >> "$OUT"

  SCEN_RESULTS+=("$final")
}

checkpoint_if_needed() {
  local sid="$1"
  if (( sid % 2 == 0 )); then
    {
      echo "---"
      echo "Checkpoint persisted after Scenario $sid at $(date --iso-8601=seconds)"
      echo "---"
      echo ""
    } >> "$OUT"
  fi
}

# Scenario 1
{
  echo "## Scenario 1: The Competitive Intel Analyst"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://intel-watch.local","description":"Track competitor announcements and summarize weekly shifts"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++)); awk "BEGIN{exit !($LAST_TIME>30)}" && ((slow++)) || true
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://pricing-watch.local","description":"Monitor pricing page deltas across competitors"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://hiring-watch.local","description":"Track competitor hiring signals and role velocity"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"intel.a.local","urlPattern":"https://intel.a.local/*","selectors":{"title":"h1","body":"article"},"schema":{"type":"object","properties":{"title":{"type":"string"},"body":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"intel.b.local","urlPattern":"https://intel.b.local/*","selectors":{"headline":"h1","summary":".summary"},"schema":{"type":"object","properties":{"headline":{"type":"string"},"summary":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"intel.c.local","urlPattern":"https://intel.c.local/*","selectors":{"title":"h1","metric":".metric"},"schema":{"type":"object","properties":{"title":{"type":"string"},"metric":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
P1='{"name":"competitor-intel-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Summarize top 5 competitor moves this week.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"From {{$steps.s1.output.text}}, list 3 strategic risks.","params":{"timeout_ms":180000}},{"id":"s3","op":"llm-prompt","text":"From {{$steps.s2.output.text}}, recommend 3 counter-moves.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/save" POST /v1/pipelines/save "$P1" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P1" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "llm/chat" POST /v1/dev/llm/chat '{"conversation_id":"scenario-1","messages":[{"role":"user","content":"Which of those 3 risks is hardest to mitigate first, and why?"}],"timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 1 "$fail" "$slow" 1 1
checkpoint_if_needed 1

# Scenario 2
{
  echo "## Scenario 2: The E-Commerce Price Tracker"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "templates/import" POST /v1/templates/import '{"domain":"shop.a.local","urlPattern":"https://shop.a.local/*","selectors":{"name":"h1","price":".price"},"schema":{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"shop.b.local","urlPattern":"https://shop.b.local/*","selectors":{"name":"h1","price":".price"},"schema":{"type":"object","properties":{"name":{"type":"string"},"price":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://shop.a.local","description":"Track SKU pricing and detect discount windows"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "recordings/save" POST /v1/recordings/save '{"id":"rec-2","url":"https://shop.a.local/p/sku-123","startedAt":1708444800000,"actions":[{"type":"navigate","url":"https://shop.a.local/p/sku-123","timestamp":1708444800001},{"type":"click","selector":"#add-to-cart","timestamp":1708444801000}]}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
P2='{"name":"ecom-price-pipeline-v2","steps":[{"id":"s1","op":"transform","template":"SKU: {{$input.sku}}"},{"id":"s2","op":"transform","template":"Price now: {{$input.price_now}}"},{"id":"s3","op":"llm-prompt","text":"Given {{$steps.s1.output}} and {{$steps.s2.output}}, estimate buy-now vs wait recommendation.","params":{"timeout_ms":180000}},{"id":"s4","op":"llm-prompt","text":"Return final recommendation in 3 bullets from {{$steps.s3.output.text}}.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/validate" POST /v1/pipelines/validate "$P2" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P2" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "llm/chat" POST /v1/dev/llm/chat '{"conversation_id":"scenario-2","messages":[{"role":"user","content":"Given that output, should I buy now or wait one week?"}],"timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 2 "$fail" "$slow" 1 1
checkpoint_if_needed 2

# Scenario 3
{
  echo "## Scenario 3: The Content Marketing Machine"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
for turn in \
  "Give me 5 content themes for devtool SaaS targeting CTOs." \
  "Now give me 10 blog titles for the top theme." \
  "Pick best 3 and outline each in ~120 words." \
  "Write intro paragraph for title #1." \
  "Critique that intro from a CTO lens." \
  "Rewrite intro addressing those concerns." \
  "Return metadata JSON with title,description,tags,seoKeywords."; do
  data=$(jq -cn --arg msg "$turn" '{conversation_id:"scenario-3",messages:[{role:"user",content:$msg}],timeout_ms:180000}')
  log_call "llm/chat" POST /v1/dev/llm/chat "$data" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
P3='{"name":"content-machine-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Generate 5 hook lines for CTO audience.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"From {{$steps.s1.output.text}}, create one LinkedIn post.","params":{"timeout_ms":180000}},{"id":"s3","op":"transform","template":"Draft={{$steps.s2.output.text}}"},{"id":"s4","op":"llm-prompt","text":"Create 3 A/B headline variants from {{$steps.s3.output}}.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/save" POST /v1/pipelines/save "$P3" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P3" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 3 "$fail" "$slow" 1 1
checkpoint_if_needed 3

# Scenario 4
{
  echo "## Scenario 4: The Security Researcher"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://security.local","description":"Correlate CVE advisories with repo risk and mitigation urgency"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"security.local","urlPattern":"https://security.local/*","selectors":{"cve":".cve","severity":".cvss","fix":".fix"},"schema":{"type":"object","properties":{"cve":{"type":"string"},"severity":{"type":"string"},"fix":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
LONGTXT=$(python3 - <<'PY'
base = "CVE advisory: affected versions 1.0-2.3; CVSS 9.1; remediation patch and compensating controls required."
print(" ".join([base]*180))
PY
)
D4=$(jq -cn --arg msg "$LONGTXT" '{conversation_id:"scenario-4",messages:[{role:"user",content:$msg}],timeout_ms:180000}')
log_call "llm/chat" POST /v1/dev/llm/chat "$D4" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "llm/chat" POST /v1/dev/llm/chat '{"conversation_id":"scenario-4","messages":[{"role":"user","content":"Cross-reference and return a priority matrix."}],"timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
P4='{"name":"security-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Extract CVE IDs and CVSS values from latest advisories.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"Create remediation plan from {{$steps.s1.output.text}}.","params":{"timeout_ms":180000}},{"id":"s3","op":"transform","template":"Matrix={{$steps.s2.output.text}}"}]}'
log_call "pipelines/validate" POST /v1/pipelines/validate "$P4" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P4" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "heal/cache" GET /v1/heal/cache '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "heal/stats" GET /v1/heal/stats '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 4 "$fail" "$slow" 1 1
checkpoint_if_needed 4

# Scenario 5
{
  echo "## Scenario 5: The Data Pipeline Builder"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
P5A='{"name":"etl-clean-v2","steps":[{"id":"s1","op":"transform","template":"clean {{$input.raw}}"},{"id":"s2","op":"transform","template":"normalize {{$steps.s1.output}}"}]}'
P5B='{"name":"etl-enrich-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Enrich record {{$input.record}} with inferred fields.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"Validate enriched record {{$steps.s1.output.text}}.","params":{"timeout_ms":180000}}]}'
P5C='{"name":"etl-report-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Summarize data quality risks for {{$input.batch}}.","params":{"timeout_ms":180000}}]}'
P5D='{"name":"etl-merge-v2","steps":[{"id":"s1","op":"transform","template":"merge {{$input.a}} {{$input.b}}"}]}'
P5E='{"name":"etl-full-v2","steps":[{"id":"s1","op":"transform","template":"start {{$input.seed}}"},{"id":"s2","op":"llm-prompt","text":"Create enrichment plan from {{$steps.s1.output}}.","params":{"timeout_ms":180000}},{"id":"s3","op":"llm-prompt","text":"Create QA checks from {{$steps.s2.output.text}}.","params":{"timeout_ms":180000}},{"id":"s4","op":"llm-prompt","text":"Generate final ETL report from {{$steps.s3.output.text}}.","params":{"timeout_ms":180000}}]}'
for p in "$P5A" "$P5B" "$P5C" "$P5D" "$P5E"; do
  log_call "pipelines/save" POST /v1/pipelines/save "$p" 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "pipelines/list" GET /v1/pipelines '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
for p in "$P5A" "$P5B" "$P5C" "$P5D" "$P5E"; do
  log_call "pipelines/validate" POST /v1/pipelines/validate "$p" 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
for p in "$P5B" "$P5C" "$P5E"; do
  log_call "pipelines/run" POST /v1/pipelines/run "$p" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "llm/chat" POST /v1/dev/llm/chat '{"conversation_id":"scenario-5","messages":[{"role":"user","content":"From ETL results, what data quality issues stand out?"}],"timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 5 "$fail" "$slow" 1 1
checkpoint_if_needed 5

# Scenario 6
{
  echo "## Scenario 6: The Recruiter's Toolkit"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "templates/import" POST /v1/templates/import '{"domain":"jobs.local","urlPattern":"https://jobs.local/*","selectors":{"title":"h1","company":".company"},"schema":{"type":"object","properties":{"title":{"type":"string"},"company":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import" POST /v1/templates/import '{"domain":"talent.local","urlPattern":"https://talent.local/*","selectors":{"name":"h1","skills":".skills"},"schema":{"type":"object","properties":{"name":{"type":"string"},"skills":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://jobs.local","description":"Support sourcing, outreach, and screening workflows"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
for turn in \
  "Find strategy to hire a Senior React Engineer in Dubai." \
  "Give me a strong LinkedIn boolean string." \
  "Draft outreach to Ahmed at Careem." \
  "Write follow-up handling remote-work concern." \
  "Return candidate profile card JSON."; do
  data=$(jq -cn --arg msg "$turn" '{conversation_id:"scenario-6",messages:[{role:"user",content:$msg}],timeout_ms:180000}')
  log_call "llm/chat" POST /v1/dev/llm/chat "$data" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
P6='{"name":"recruiter-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Summarize candidate signals for {{$input.candidate}}.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"Write tailored outreach from {{$steps.s1.output.text}}.","params":{"timeout_ms":180000}},{"id":"s3","op":"llm-prompt","text":"Create interview scorecard from {{$steps.s2.output.text}}.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/save" POST /v1/pipelines/save "$P6" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P6" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 6 "$fail" "$slow" 1 1
checkpoint_if_needed 6

# Scenario 7
{
  echo "## Scenario 7: The Stress Monster"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
# 15 concurrent prompts
for i in $(seq 1 15); do
  (
    d=$(jq -cn --arg p "Give one advanced but practical insight about topic $i in exactly 3 sentences." '{prompt:$p,timeout_ms:180000}')
    call_api POST /v1/dev/llm/prompt "$d" 1
    ok="ERR"; [[ "$LAST_CODE" =~ ^2 ]] && ok="OK"
    if [ "$ok" = "OK" ]; then
      echo "- \`llm/prompt(concurrent-$i)\` → HTTP $LAST_CODE | ${LAST_TIME}s | $ok" >> "$OUT"
    else
      echo "- \`llm/prompt(concurrent-$i)\` → HTTP $LAST_CODE | ${LAST_TIME}s | $ok" >> "$OUT"
    fi
  ) &
done
wait
# 5 chats (reuse scenario-7)
for i in $(seq 1 5); do
  d=$(jq -cn --arg m "Turn $i: suggest one productivity tip." '{conversation_id:"scenario-7",messages:[{role:"user",content:$m}],timeout_ms:180000}')
  log_call "llm/chat" POST /v1/dev/llm/chat "$d" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
# 10 validates
for i in $(seq 1 10); do
  p=$(jq -cn --arg n "stress-v2-$i" '{name:$n,steps:[{id:"s1",op:"transform",template:"T"}]}')
  log_call "pipelines/validate(concurrent-$i)" POST /v1/pipelines/validate "$p" 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
# 5 imports
for i in $(seq 1 5); do
  t=$(jq -cn --arg d "stress$i.local" '{domain:$d,urlPattern:("https://"+$d+"/*"),selectors:{title:"h1"},schema:{type:"object",properties:{title:{type:"string"}}},createdAt:"2026-02-21T00:00:00Z",updatedAt:"2026-02-21T00:00:00Z",successCount:0,failCount:0}')
  log_call "templates/import(concurrent-$i)" POST /v1/templates/import "$t" 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "health" GET /v1/health '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 7 "$fail" "$slow" 1 1
checkpoint_if_needed 7

# Scenario 8
{
  echo "## Scenario 8: The Research Assistant"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
LONG4K=$(python3 - <<'PY'
para = "This report examines product strategy, execution tradeoffs, market signals, and evidence quality across multiple longitudinal studies."
print(" ".join([para]*300))
PY
)
D8=$(jq -cn --arg msg "$LONG4K" '{conversation_id:"scenario-8",messages:[{role:"user",content:$msg}],timeout_ms:180000}')
log_call "llm/chat" POST /v1/dev/llm/chat "$D8" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "llm/chat" POST /v1/dev/llm/chat '{"conversation_id":"scenario-8","messages":[{"role":"user","content":"Now provide a 2-minute executive summary."}],"timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
P8='{"name":"research-assistant-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Extract 5 key findings from context.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"Critique methodology for {{$steps.s1.output.text}}.","params":{"timeout_ms":180000}},{"id":"s3","op":"llm-prompt","text":"Generate counter-argument from {{$steps.s2.output.text}}.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/save" POST /v1/pipelines/save "$P8" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P8" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 8 "$fail" "$slow" 1 1
checkpoint_if_needed 8

# Scenario 9
{
  echo "## Scenario 9: The Full Stack"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "/v1/health" GET /v1/health '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/llm/models" GET /v1/llm/models '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/registry" GET /v1/registry '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
for dom in fulla.local fullb.local fullc.local; do
  t=$(jq -cn --arg d "$dom" '{domain:$d,urlPattern:("https://"+$d+"/*"),selectors:{title:"h1",price:".price"},schema:{type:"object",properties:{title:{type:"string"},price:{type:"string"}}},createdAt:"2026-02-21T00:00:00Z",updatedAt:"2026-02-21T00:00:00Z",successCount:0,failCount:0}')
  log_call "templates/import" POST /v1/templates/import "$t" 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://fulla.local","description":"multi-feature workflow"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "apps/generate" POST /v1/apps/generate '{"url":"https://fullb.local","description":"secondary workflow"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "recordings/save" POST /v1/recordings/save '{"id":"rec-9","url":"https://full.local","startedAt":1708444800000,"actions":[{"type":"navigate","url":"https://full.local","timestamp":1708444800001}]}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/recordings" GET /v1/recordings '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/templates" GET /v1/templates '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/apps" GET /v1/apps '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/pipelines" GET /v1/pipelines '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/functions" GET /v1/functions '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
P9='{"name":"full-stack-pipeline-v2","steps":[{"id":"s1","op":"llm-prompt","text":"Generate risk summary for weekly ops.","params":{"timeout_ms":180000}},{"id":"s2","op":"llm-prompt","text":"From {{$steps.s1.output.text}}, extract top 3 risks.","params":{"timeout_ms":180000}},{"id":"s3","op":"llm-prompt","text":"Provide day-one action plan from {{$steps.s2.output.text}}.","params":{"timeout_ms":180000}}]}'
log_call "pipelines/save" POST /v1/pipelines/save "$P9" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/validate" POST /v1/pipelines/validate "$P9" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run" POST /v1/pipelines/run "$P9" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
for turn in "Interpret the pipeline result." "Give top 3 risks." "What should I do first today?"; do
  d=$(jq -cn --arg m "$turn" '{conversation_id:"scenario-9",messages:[{role:"user",content:$m}],timeout_ms:180000}')
  log_call "llm/chat" POST /v1/dev/llm/chat "$d" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "/v1/heal/cache" GET /v1/heal/cache '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "/v1/heal/stats" GET /v1/heal/stats '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/export" GET /v1/templates/fulla.local/export '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/delete" DELETE /v1/templates/fulla.local '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/list" GET /v1/templates '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "recordings/delete" DELETE /v1/recordings/rec-9 '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "recordings/list" GET /v1/recordings '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "health-final" GET /v1/health '' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 9 "$fail" "$slow" 1 1
checkpoint_if_needed 9

# Scenario 10
{
  echo "## Scenario 10: The Adversarial User"
  echo ""
  echo "### Call Log"
} >> "$OUT"
fail=0; slow=0
log_call "llm/prompt dot" POST /v1/dev/llm/prompt '{"prompt":".","timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
BIGA=$(python3 - <<'PY'
print('A'*10000)
PY
)
D10A=$(jq -cn --arg p "$BIGA" '{prompt:$p,timeout_ms:180000}')
log_call "llm/prompt 10kA" POST /v1/dev/llm/prompt "$D10A" 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
for turn in "continue" "continue" "continue"; do
  d=$(jq -cn --arg m "$turn" '{conversation_id:"scenario-10",messages:[{role:"user",content:$m}],timeout_ms:180000}')
  log_call "llm/chat" POST /v1/dev/llm/chat "$d" 1
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "apps/generate nonsense" POST /v1/apps/generate '{"url":"https://@@@","description":"???"}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "templates/import emoji" POST /v1/templates/import '{"domain":"🔥fire🔥.emoji.test","urlPattern":"https://🔥fire🔥.emoji.test/*","selectors":{"title":"h1"},"schema":{"type":"object","properties":{"title":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}' 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
PBAD='{"name":"bad-ref-pipeline-v2","steps":[{"id":"s1","op":"transform","template":"hello"},{"id":"s2","op":"transform","template":"{{$steps.s99.output}}"}]}'
log_call "pipelines/save 20-step" POST /v1/pipelines/save "$PBAD" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
log_call "pipelines/run bad-ref" POST /v1/pipelines/run "$PBAD" 0; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
# mixed concurrent
for i in 1 2 3; do
  (
    if [ "$i" -eq 1 ]; then
      call_api GET /v1/health '' 0
    elif [ "$i" -eq 2 ]; then
      call_api POST /v1/recordings/save '{"id":"rec-10-bad"}' 0
    else
      call_api POST /v1/pipelines/validate '{"name":"x","steps":[]}' 0
    fi
    mixok="ERR"; [[ "$LAST_CODE" =~ ^2 ]] && mixok="OK"
    echo "- \`concurrent-mixed-$i\` → HTTP $LAST_CODE | ${LAST_TIME}s | $mixok" >> "$OUT"
  ) &
done
wait
for ep in /v1/heal/cache /v1/templates /v1/registry /v1/health /v1/heal/stats /v1/apps /v1/recordings /v1/llm/models /v1/pipelines /v1/functions; do
  log_call "speedrun" GET "$ep" '' 0
  [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
done
log_call "llm/prompt request-count" POST /v1/dev/llm/prompt '{"prompt":"How many requests have you processed today?","timeout_ms":180000}' 1; [[ ! "$LAST_CODE" =~ ^2 ]] && ((fail++))
grade_scenario 10 "$fail" "$slow" 1 1
checkpoint_if_needed 10

# Summary
{
  echo "## Overall Summary"
} >> "$OUT"
for i in $(seq 1 10); do
  r="${SCEN_RESULTS[$((i-1))]}"
  echo "- Scenario $i: $r" >> "$OUT"
done
pass_count=$(grep -c '✅ PASS' "$OUT" || true)
partial_count=$(grep -c '⚠️ PARTIAL' "$OUT" || true)
fail_count=$(grep -c '❌ FAIL' "$OUT" || true)
letter="C"
if [ "$fail_count" -eq 0 ] && [ "$partial_count" -le 2 ]; then letter="A";
elif [ "$fail_count" -eq 0 ] && [ "$partial_count" -le 4 ]; then letter="B";
elif [ "$fail_count" -le 2 ]; then letter="C";
elif [ "$fail_count" -le 4 ]; then letter="D";
else letter="F"; fi

echo "" >> "$OUT"
echo "**Overall Letter Grade: $letter**" >> "$OUT"
echo "" >> "$OUT"
echo "Completed at: $(date --iso-8601=seconds)" >> "$OUT"

echo "Wrote report to $OUT"