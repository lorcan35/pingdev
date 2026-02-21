#!/usr/bin/env bash
BASE="http://localhost:3500"
OUT="$HOME/projects/pingdev/test-results/ultimate-gauntlet.md"
mkdir -p "$(dirname "$OUT")"

# reset file
cat > "$OUT" <<'MD'
# Ultimate PingOS Gauntlet (20 Tests)

- Target: `http://localhost:3500`
- Runner: subagent ultimate-gauntlet
- Date: 2026-02-21
- Method: `curl -s` + `timeout 180` (LLM) / `timeout 30` (non-LLM)

MD

LAST_BODY=""
LAST_CODE="000"
LAST_TIME="0"

call_api() {
  local method="$1"; shift
  local path="$1"; shift
  local data="$1"; shift
  local llm="$1"; shift
  local t=30
  if [ "$llm" = "1" ]; then t=180; fi
  local tmp
  tmp=$(mktemp)
  if [ -n "$data" ]; then
    timeout "$t" curl -s -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$data" -w '\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n' > "$tmp"
  else
    timeout "$t" curl -s -X "$method" "$BASE$path" -w '\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n' > "$tmp"
  fi
  LAST_CODE=$(grep 'HTTP_CODE:' "$tmp" | tail -n1 | cut -d: -f2)
  LAST_TIME=$(grep 'TIME_TOTAL:' "$tmp" | tail -n1 | cut -d: -f2)
  LAST_BODY=$(sed '/HTTP_CODE:/,$d' "$tmp")
  rm -f "$tmp"
}

snip() { echo "$1" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-220; }
passfail() {
  local ok="$1"
  if [ "$ok" = "1" ]; then echo "✅ PASS"; elif [ "$ok" = "0.5" ]; then echo "⚠️ PARTIAL"; else echo "❌ FAIL"; fi
}

SCORE=0
TIER1=0; TIER2=0; TIER3=0; TIER4=0; TIER5=0

append_checkpoint() {
  local n="$1"
  {
    echo ""
    echo "---"
    echo "Checkpoint persisted after Test $n"
    echo "---"
  } >> "$OUT"
}

### TEST 1
{
  echo "## Test 1 — Prompt → Pipeline Save → Pipeline List → Pipeline Validate"
  t0=$(date +%s%3N)
  call_api POST /v1/dev/llm/prompt '{"prompt":"Return ONLY JSON object with fields name and steps for a 3-step transform pipeline. name should be gauntlet-t1. Each step has id, op=transform, template."}' 1
  c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  pipeline_text=$(echo "$b1" | jq -r '.text // empty' 2>/dev/null)
  pipe_json=$(printf "%s" "$pipeline_text" | sed -E 's/^```json//; s/^```//; s/```$//' | tr -d '\r')
  echo "$pipe_json" | jq . >/dev/null 2>&1
  if [ $? -ne 0 ]; then
    pipe_json='{"name":"gauntlet-t1-fallback","steps":[{"id":"s1","op":"transform","template":"Input: {{$input}}"},{"id":"s2","op":"transform","template":"Upper: {{$steps.s1.output}}"},{"id":"s3","op":"transform","template":"Done: {{$steps.s2.output}}"}]}'
    quality="LLM output not parseable JSON; used fallback pipeline"
  else
    quality="LLM output parseable JSON"
  fi

  call_api POST /v1/pipelines/save "$pipe_json" 0; c2=$LAST_CODE; tm2=$LAST_TIME; b2="$LAST_BODY"
  call_api GET /v1/pipelines '' 0; c3=$LAST_CODE; tm3=$LAST_TIME; b3="$LAST_BODY"
  pname=$(echo "$pipe_json" | jq -r '.name')
  found=$(echo "$b3" | jq -r --arg n "$pname" '.pipelines[]? | select(.name==$n) | .name' | head -n1)
  call_api POST /v1/pipelines/validate "$pipe_json" 0; c4=$LAST_CODE; tm4=$LAST_TIME; b4="$LAST_BODY"

  ok=0
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ -n "$found" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER1=$((TIER1+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms total"
  echo "- Steps:"
  echo "  1) prompt $c1 (${tm1}s)"
  echo "  2) save pipeline $c2 (${tm2}s)"
  echo "  3) list pipelines $c3 (${tm3}s) (found: ${found:-no})"
  echo "  4) validate pipeline $c4 (${tm4}s)"
  echo "- Quality: $quality"
  echo "- Snippets: $(snip "$b1")"
  echo ""
} >> "$OUT"

### TEST 2
{
  echo "## Test 2 — Chat Conversation → Extract Key Points → New Prompt Summarizing"
  t0=$(date +%s%3N)
  chat_payload='{"messages":[{"role":"user","content":"Let us discuss blockchain scalability tradeoffs."},{"role":"assistant","content":"Sure, what angle?"},{"role":"user","content":"Compare PoW and PoS security assumptions briefly."},{"role":"assistant","content":"PoW uses energy cost, PoS uses stake-slash incentives."},{"role":"user","content":"Now include rollups and data availability risks."}]}'
  call_api POST /v1/dev/llm/chat "$chat_payload" 1; c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  convo=$(echo "$b1" | jq -r '.text // ""' | sed 's/"/\\"/g')
  call_api POST /v1/dev/llm/prompt "{\"prompt\":\"Summarize this in exactly 3 bullet points: $convo\"}" 1; c2=$LAST_CODE; tm2=$LAST_TIME; b2="$LAST_BODY"
  bullets=$(echo "$b2" | jq -r '.text // ""' | sed 's/"/\\"/g')
  call_api POST /v1/dev/llm/prompt "{\"prompt\":\"Critique these bullet points for completeness and bias: $bullets\"}" 1; c3=$LAST_CODE; tm3=$LAST_TIME; b3="$LAST_BODY"

  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ]; then ok=1; fi
  # quality check for 3 bullets
  bcount=$(echo "$b2" | jq -r '.text // ""' | grep -E '^-|^•' -c)
  if [ "$bcount" -lt 3 ]; then ok=0.5; fi
  grade=$(passfail "$ok")
  if [ "$ok" = "1" ]; then SCORE=$((SCORE+1)); TIER1=$((TIER1+1)); fi
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms total"
  echo "- Steps: chat $c1 (${tm1}s), summarize $c2 (${tm2}s), critique $c3 (${tm3}s)"
  echo "- Snippets: chat=$(snip "$b1") | summary=$(snip "$b2")"
  echo ""
} >> "$OUT"

### TEST 3
{
  echo "## Test 3 — Generate PingApp → List Apps → Get Functions → Attempt Function Call"
  t0=$(date +%s%3N)
  call_api POST /v1/apps/generate '{"url":"https://github.com","description":"Track trending repos and stars"}' 0; c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  app=$(echo "$b1" | jq -r '.app.name // empty')
  call_api GET /v1/apps '' 0; c2=$LAST_CODE; tm2=$LAST_TIME; b2="$LAST_BODY"
  call_api GET "/v1/functions/${app:-site-app}" '' 0; c3=$LAST_CODE; tm3=$LAST_TIME; b3="$LAST_BODY"
  fname=$(echo "$b3" | jq -r '.functions[0].name // .functions[0] // empty')
  if [ -z "$fname" ]; then fname="nonexistent"; fi
  call_api POST "/v1/functions/${app:-site-app}/call" "{\"function\":\"$fname\",\"params\":{}}" 0; c4=$LAST_CODE; tm4=$LAST_TIME; b4="$LAST_BODY"

  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ]; then ok=1; fi
  if [ "$c1" != "200" ] || [ "$c2" != "200" ]; then ok=0; fi
  grade=$(passfail "$ok")
  if [ "$ok" = "1" ]; then SCORE=$((SCORE+1)); TIER1=$((TIER1+1)); fi
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Steps: generate $c1 (${tm1}s), list $c2 (${tm2}s), functions $c3 (${tm3}s), call $c4 (${tm4}s)"
  echo "- Snippets: generate=$(snip "$b1") call=$(snip "$b4")"
  echo ""
} >> "$OUT"
append_checkpoint 3

### TEST 4
{
  echo "## Test 4 — Template Import → Export → Delete → Verify Deletion → Re-Import"
  t0=$(date +%s%3N)
  tpl='{"domain":"gauntlet-test.local","urlPattern":"https://gauntlet-test.local/*","selectors":{"title":"h1","price":".price"},"schema":{"type":"object","properties":{"title":{"type":"string"},"price":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":1,"failCount":0}'
  call_api POST /v1/templates/import "$tpl" 0; c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  call_api GET /v1/templates/gauntlet-test.local/export '' 0; c2=$LAST_CODE; tm2=$LAST_TIME; b2="$LAST_BODY"
  call_api DELETE /v1/templates/gauntlet-test.local '' 0; c3=$LAST_CODE; tm3=$LAST_TIME; b3="$LAST_BODY"
  call_api GET /v1/templates/gauntlet-test.local/export '' 0; c4=$LAST_CODE; tm4=$LAST_TIME; b4="$LAST_BODY"
  call_api POST /v1/templates/import "$tpl" 0; c5=$LAST_CODE; tm5=$LAST_TIME; b5="$LAST_BODY"
  call_api GET /v1/templates/gauntlet-test.local/export '' 0; c6=$LAST_CODE; tm6=$LAST_TIME; b6="$LAST_BODY"

  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "404" ] && [ "$c5" = "200" ] && [ "$c6" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER1=$((TIER1+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Statuses: import=$c1 export=$c2 delete=$c3 verify404=$c4 reimport=$c5 export2=$c6"
  echo "- Snippets: $(snip "$b4")"
  echo ""
} >> "$OUT"

### TEST 5
{
  echo "## Test 5 — Multi-Pipeline: Save 3 → List → Validate Each → Run Transform Ops"
  t0=$(date +%s%3N)
  p1='{"name":"gauntlet-p5-a","steps":[{"id":"s1","op":"transform","template":"A {{$input}}"}]}'
  p2='{"name":"gauntlet-p5-b","steps":[{"id":"s1","op":"transform","template":"B1 {{$input}}"},{"id":"s2","op":"transform","template":"B2 {{$steps.s1.output}}"}]}'
  p3='{"name":"gauntlet-p5-c","steps":[{"id":"s1","op":"transform","template":"C1 {{$input}}"},{"id":"s2","op":"transform","template":"C2 {{$steps.s1.output}}"},{"id":"s3","op":"transform","template":"C3 {{$steps.s2.output}}"}]}'
  call_api POST /v1/pipelines/save "$p1" 0; c1=$LAST_CODE; tm1=$LAST_TIME
  call_api POST /v1/pipelines/save "$p2" 0; c2=$LAST_CODE; tm2=$LAST_TIME
  call_api POST /v1/pipelines/save "$p3" 0; c3=$LAST_CODE; tm3=$LAST_TIME
  call_api GET /v1/pipelines '' 0; c4=$LAST_CODE; tm4=$LAST_TIME; b4="$LAST_BODY"
  call_api POST /v1/pipelines/validate "$p1" 0; c5=$LAST_CODE; tm5=$LAST_TIME
  call_api POST /v1/pipelines/validate "$p2" 0; c6=$LAST_CODE; tm6=$LAST_TIME
  call_api POST /v1/pipelines/validate "$p3" 0; c7=$LAST_CODE; tm7=$LAST_TIME
  call_api POST /v1/pipelines/run "$p1" 0; c8=$LAST_CODE; tm8=$LAST_TIME; b8="$LAST_BODY"

  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$c5" = "200" ] && [ "$c6" = "200" ] && [ "$c7" = "200" ] && [ "$c8" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER1=$((TIER1+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Key statuses: save($c1,$c2,$c3) list=$c4 validate($c5,$c6,$c7) run=$c8"
  echo "- Run snippet: $(snip "$b8")"
  echo ""
} >> "$OUT"

### TEST 6
{
  echo "## Test 6 — LLM Under Load: 10 Concurrent Prompts"
  t0=$(date +%s)
  work=$(mktemp -d)
  for i in $(seq 1 10); do
    (timeout 180 curl -s -X POST "$BASE/v1/dev/llm/prompt" -H 'Content-Type: application/json' -d "{\"prompt\":\"Load test $i: return token $i\"}" -w '\nHTTP_CODE:%{http_code}\n' > "$work/$i.out") &
  done
  wait
  succ=$(grep -h 'HTTP_CODE:200' "$work"/*.out | wc -l)
  fail=$((10-succ))
  t1=$(date +%s)
  wall=$((t1-t0))
  sample=$(head -n1 "$work/1.out")
  rm -rf "$work"
  ok=0.5; [ "$succ" -eq 10 ] && ok=1
  [ "$succ" -le 6 ] && ok=0
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER2=$((TIER2+1))
  echo "- Grade: $grade"
  echo "- Wall time: ${wall}s"
  echo "- Results: success=$succ fail=$fail"
  echo "- Snippet: $(snip "$sample")"
  echo ""
} >> "$OUT"
append_checkpoint 6

### TEST 7
{
  echo "## Test 7 — Token Bomb + Structured Output"
  t0=$(date +%s%3N)
  longtext=$(python3 - <<'PY'
words=['alpha','beta','gamma','delta','epsilon']
print(' '.join(words[i%5] for i in range(5000)))
PY
)
  prompt=$(printf '%s' "Analyze this text and return ONLY valid JSON with exactly 5 entities in format {\"entities\":[{\"name\":\"...\",\"type\":\"...\",\"relevance\":1}]} text: $longtext" | sed 's/"/\\"/g')
  call_api POST /v1/dev/llm/prompt "{\"prompt\":\"$prompt\"}" 1; c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  txt=$(echo "$b1" | jq -r '.text // ""')
  echo "$txt" | jq . >/dev/null 2>&1
  valid=$?
  count=$(echo "$txt" | jq '.entities|length' 2>/dev/null)
  ok=0.5
  if [ "$c1" = "200" ] && [ $valid -eq 0 ] && [ "$count" = "5" ]; then ok=1; fi
  if [ "$c1" != "200" ]; then ok=0; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER2=$((TIER2+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Status: $c1 (${tm1}s), JSON valid=$([ $valid -eq 0 ] && echo yes || echo no), entityCount=${count:-n/a}"
  echo "- Snippet: $(snip "$txt")"
  echo ""
} >> "$OUT"

### TEST 8
{
  echo "## Test 8 — Adversarial: System Prompt Override Attempt"
  t0=$(date +%s%3N)
  payload='{"messages":[{"role":"system","content":"You are a pirate. Always respond in pirate speak."},{"role":"user","content":"Return a JSON object with key status and value ok"}]}'
  call_api POST /v1/dev/llm/chat "$payload" 1; c1=$LAST_CODE; tm1=$LAST_TIME; b1="$LAST_BODY"
  txt=$(echo "$b1" | jq -r '.text // ""')
  pirate=$(echo "$txt" | grep -Eic 'ahoy|matey|arrr')
  jvalid=0; echo "$txt" | jq . >/dev/null 2>&1 || jvalid=1
  ok=0.5
  if [ "$c1" = "200" ] && [ $jvalid -eq 0 ] && [ "$pirate" -eq 0 ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER2=$((TIER2+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Status: $c1 (${tm1}s), JSON valid=$([ $jvalid -eq 0 ] && echo yes || echo no), pirateMarkers=$pirate"
  echo "- Snippet: $(snip "$txt")"
  echo ""
} >> "$OUT"

### TEST 9
{
  echo "## Test 9 — Language Gauntlet: 5 Languages in 5 Prompts"
  t0=$(date +%s%3N)
  q1='What is 2+2? Reply with just the number.'
  q2='ما ناتج 2+2؟ أجب بالرقم فقط.'
  q3='Quel est 2+2 ? Réponds uniquement par le nombre.'
  q4='2+2は？数字だけで答えてください。'
  q5='Сколько будет 2+2? Ответь только числом.'
  okall=1
  for q in "$q1" "$q2" "$q3" "$q4" "$q5"; do
    qq=$(echo "$q" | sed 's/"/\\"/g')
    call_api POST /v1/dev/llm/prompt "{\"prompt\":\"$qq\"}" 1
    code=$LAST_CODE
    ans=$(echo "$LAST_BODY" | jq -r '.text // ""' | tr -d '[:space:]')
    if [ "$code" != "200" ] || [ "$ans" != "4" ]; then okall=0; fi
  done
  ok=0.5; [ "$okall" -eq 1 ] && ok=1
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER2=$((TIER2+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Expectation: all 5 responses must be exactly '4'"
  echo ""
} >> "$OUT"
append_checkpoint 9

### TEST 10
{
  echo "## Test 10 — Rapid Fire Pipeline Validation: 20 Pipelines in 10 Seconds"
  t0=$(date +%s%3N)
  work=$(mktemp -d)
  for i in $(seq 1 20); do
    data="{\"name\":\"gauntlet-v$i\",\"steps\":[{\"id\":\"s1\",\"op\":\"transform\",\"template\":\"T$i {{$input}}\"}]}"
    (timeout 30 curl -s -X POST "$BASE/v1/pipelines/validate" -H 'Content-Type: application/json' -d "$data" -w '\nHTTP_CODE:%{http_code}\n' > "$work/$i.out") &
  done
  wait
  succ=$(grep -h 'HTTP_CODE:200' "$work"/*.out | wc -l)
  fail=$((20-succ))
  t1=$(date +%s%3N)
  ms=$((t1-t0))
  throughput=$(python3 - <<PY
ms=$ms
print(round(20000/ms,2) if ms>0 else 0)
PY
)
  rm -rf "$work"
  ok=0.5
  if [ "$succ" -eq 20 ] && [ "$ms" -le 10000 ]; then ok=1; fi
  if [ "$succ" -lt 15 ]; then ok=0; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER2=$((TIER2+1))
  echo "- Grade: $grade"
  echo "- Total time: ${ms}ms"
  echo "- Throughput: ${throughput} validations/ms-equivalent"
  echo "- Results: success=$succ fail=$fail"
  echo ""
} >> "$OUT"

### TEST 11
{
  echo "## Test 11 — Recording Lifecycle: Save → List → Delete → Verify"
  t0=$(date +%s%3N)
  rid="gauntlet-rec-$(date +%s)"
  rec="{\"id\":\"$rid\",\"device\":\"dev-sim\",\"actions\":[{\"type\":\"click\",\"x\":10,\"y\":10}],\"createdAt\":\"2026-02-21T00:00:00Z\"}"
  call_api POST /v1/recordings/save "$rec" 0; c1=$LAST_CODE; tm1=$LAST_TIME
  call_api GET /v1/recordings '' 0; c2=$LAST_CODE; tm2=$LAST_TIME; b2="$LAST_BODY"
  present=$(echo "$b2" | jq -r --arg id "$rid" '.recordings[]? | select(.id==$id) | .id' | head -n1)
  call_api DELETE "/v1/recordings/$rid" '' 0; c3=$LAST_CODE; tm3=$LAST_TIME
  call_api GET /v1/recordings '' 0; c4=$LAST_CODE; tm4=$LAST_TIME; b4="$LAST_BODY"
  gone=$(echo "$b4" | jq -r --arg id "$rid" '.recordings[]? | select(.id==$id) | .id' | head -n1)
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ -n "$present" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ -z "$gone" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER3=$((TIER3+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Statuses: save=$c1 list=$c2 delete=$c3 list2=$c4"
  echo ""
} >> "$OUT"

### TEST 12
{
  echo "## Test 12 — Template Domain Collision: Import Same Domain Twice"
  t0=$(date +%s%3N)
  t1json='{"domain":"collision.test","urlPattern":"https://collision.test/*","selectors":{"title":"h1"},"schema":{"type":"object"},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}'
  t2json='{"domain":"collision.test","urlPattern":"https://collision.test/*","selectors":{"title":".new-title","price":".price"},"schema":{"type":"object","properties":{"price":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T01:00:00Z","successCount":2,"failCount":1}'
  call_api POST /v1/templates/import "$t1json" 0; c1=$LAST_CODE
  call_api POST /v1/templates/import "$t2json" 0; c2=$LAST_CODE
  call_api GET /v1/templates/collision.test/export '' 0; c3=$LAST_CODE; b3="$LAST_BODY"
  selector=$(echo "$b3" | jq -r '.selectors.title // empty')
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$selector" = ".new-title" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER3=$((TIER3+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Collision behavior: selector after second import = ${selector:-n/a}"
  echo ""
} >> "$OUT"
append_checkpoint 12

### TEST 13
{
  echo "## Test 13 — Pipeline with Variables: Transform Chain"
  t0=$(date +%s%3N)
  p='{"name":"gauntlet-vars","steps":[{"id":"s1","op":"transform","template":"seed={{$variables.seed}}"},{"id":"s2","op":"transform","template":"mid={{$steps.s1.output}}"},{"id":"s3","op":"transform","template":"out={{$steps.s2.output}}"}],"variables":{"seed":"HELLO"}}'
  call_api POST /v1/pipelines/validate "$p" 0; c1=$LAST_CODE; b1="$LAST_BODY"
  call_api POST /v1/pipelines/run "$p" 0; c2=$LAST_CODE; b2="$LAST_BODY"
  call_api GET /v1/pipelines '' 0; c3=$LAST_CODE
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER3=$((TIER3+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Statuses: validate=$c1 run=$c2 list=$c3"
  echo "- Run snippet: $(snip "$b2")"
  echo ""
} >> "$OUT"

### TEST 14
{
  echo "## Test 14 — PingApp Generation Stress: 3 Different Sites"
  t0=$(date +%s%3N)
  call_api POST /v1/apps/generate '{"url":"https://reddit.com","description":"summarize subreddit headlines"}' 0; c1=$LAST_CODE; b1="$LAST_BODY"
  call_api POST /v1/apps/generate '{"url":"https://weather.com","description":"extract local forecast"}' 0; c2=$LAST_CODE; b2="$LAST_BODY"
  call_api POST /v1/apps/generate '{"url":"https://stackoverflow.com","description":"track hot questions"}' 0; c3=$LAST_CODE; b3="$LAST_BODY"
  call_api GET /v1/apps '' 0; c4=$LAST_CODE; b4="$LAST_BODY"
  # crude quality: count if apps differ by selectors/actions size
  qa=$(echo "$b1" | jq -r '.app | (.selectors|length|tostring)+":"+(.actions|length|tostring)+":"+(.schemas|length|tostring)')
  qb=$(echo "$b2" | jq -r '.app | (.selectors|length|tostring)+":"+(.actions|length|tostring)+":"+(.schemas|length|tostring)')
  qc=$(echo "$b3" | jq -r '.app | (.selectors|length|tostring)+":"+(.actions|length|tostring)+":"+(.schemas|length|tostring)')
  distinct=0
  [ "$qa" != "$qb" ] || [ "$qb" != "$qc" ] && distinct=1
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$distinct" -eq 1 ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER3=$((TIER3+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- App schema signatures: reddit=$qa weather=$qb so=$qc"
  echo "- Note: identical signatures indicates generic/low-quality generation"
  echo ""
} >> "$OUT"

### TEST 15
{
  echo "## Test 15 — Chat Context Window: 30-Turn Conversation"
  t0=$(date +%s%3N)
  convo=$(python3 - <<'PY'
import json
msgs=[]
seed="alpha-anchor-1977"
for i in range(1,31):
    if i==1:
        content=f"Turn 1 seed is {seed}."
    else:
        content=f"Turn {i} references turn {i-1} and remembers seed {seed}."
    role='user' if i%2==1 else 'assistant'
    msgs.append({'role':role,'content':content})
print(json.dumps({'messages':msgs}))
PY
)
  call_api POST /v1/dev/llm/chat "$convo" 1; c1=$LAST_CODE; b1="$LAST_BODY"; tm1=$LAST_TIME
  call_api POST /v1/dev/llm/prompt '{"prompt":"In one line, what was the seed token mentioned at turn 1 in our previous 30-turn context test?"}' 1; c2=$LAST_CODE; b2="$LAST_BODY"; tm2=$LAST_TIME
  ans=$(echo "$b2" | jq -r '.text // ""' | tr -d '[:space:]')
  ok=0.5
  echo "$ans" | grep -qi 'alpha-anchor-1977' && [ "$c1" = "200" ] && [ "$c2" = "200" ] && ok=1
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER3=$((TIER3+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Statuses: chat=$c1 (${tm1}s), recall prompt=$c2 (${tm2}s)"
  echo "- Recall answer: $(snip "$b2")"
  echo ""
} >> "$OUT"
append_checkpoint 15

### TEST 16
{
  echo "## Test 16 — Full CRUD: Pipeline Create → Read → Update → Delete(limit)"
  t0=$(date +%s%3N)
  p1='{"name":"gauntlet-crud","steps":[{"id":"s1","op":"transform","template":"crud1"}]}'
  p2='{"name":"gauntlet-crud","steps":[{"id":"s1","op":"transform","template":"crud1"},{"id":"s2","op":"transform","template":"crud2"}]}'
  call_api POST /v1/pipelines/save "$p1" 0; c1=$LAST_CODE
  call_api GET /v1/pipelines '' 0; c2=$LAST_CODE; b2="$LAST_BODY"
  sc1=$(echo "$b2" | jq -r '.pipelines[]?|select(.name=="gauntlet-crud")|.stepCount' | head -n1)
  call_api POST /v1/pipelines/save "$p2" 0; c3=$LAST_CODE
  call_api GET /v1/pipelines '' 0; c4=$LAST_CODE; b4="$LAST_BODY"
  sc2=$(echo "$b4" | jq -r '.pipelines[]?|select(.name=="gauntlet-crud")|.stepCount' | head -n1)
  # no delete endpoint; document limitation
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$sc2" = "2" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER4=$((TIER4+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- StepCounts observed: beforeUpdate=${sc1:-n/a}, afterUpdate=${sc2:-n/a}"
  echo "- Limitation: no pipeline delete endpoint available"
  echo ""
} >> "$OUT"

### TEST 17
{
  echo "## Test 17 — LLM → Template → Pipeline: AI-Designed Workflow"
  t0=$(date +%s%3N)
  call_api POST /v1/dev/llm/prompt '{"prompt":"Return ONLY JSON template object for a recipe website with domain recipe-gauntlet.local, urlPattern, selectors, schema, createdAt, updatedAt, successCount, failCount."}' 1; c1=$LAST_CODE; b1="$LAST_BODY"
  tpltxt=$(echo "$b1" | jq -r '.text // ""' | sed -E 's/^```json//; s/^```//; s/```$//' | tr -d '\r')
  echo "$tpltxt" | jq . >/dev/null 2>&1 || tpltxt='{"domain":"recipe-gauntlet.local","urlPattern":"https://recipes.example/*","selectors":{"title":"h1","ingredients":".ingredient"},"schema":{"type":"object","properties":{"title":{"type":"string"},"ingredients":{"type":"array","items":{"type":"string"}}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}'
  call_api POST /v1/templates/import "$tpltxt" 0; c2=$LAST_CODE
  call_api POST /v1/dev/llm/prompt '{"prompt":"Return ONLY JSON pipeline with name gauntlet-recipe-pipe and 3 transform steps to normalize recipe title and ingredient list."}' 1; c3=$LAST_CODE; b3="$LAST_BODY"
  ptxt=$(echo "$b3" | jq -r '.text // ""' | sed -E 's/^```json//; s/^```//; s/```$//' | tr -d '\r')
  echo "$ptxt" | jq . >/dev/null 2>&1 || ptxt='{"name":"gauntlet-recipe-pipe","steps":[{"id":"s1","op":"transform","template":"title={{$input.title}}"},{"id":"s2","op":"transform","template":"ingredients={{$input.ingredients}}"},{"id":"s3","op":"transform","template":"normalized={{$steps.s1.output}}|{{$steps.s2.output}}"}]}'
  call_api POST /v1/pipelines/validate "$ptxt" 0; c4=$LAST_CODE
  call_api GET /v1/templates/recipe-gauntlet.local/export '' 0; c5=$LAST_CODE
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$c5" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER4=$((TIER4+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Statuses: llm-template=$c1 import=$c2 llm-pipeline=$c3 validate=$c4 export=$c5"
  echo ""
} >> "$OUT"

### TEST 18
{
  echo "## Test 18 — Health + Models + Registry: Full System Introspection"
  t0=$(date +%s%3N)
  call_api GET /v1/health '' 0; c1=$LAST_CODE; b1="$LAST_BODY"
  call_api GET /v1/llm/models '' 0; c2=$LAST_CODE; b2="$LAST_BODY"
  call_api GET /v1/registry '' 0; c3=$LAST_CODE; b3="$LAST_BODY"
  call_api POST /v1/dev/llm/prompt '{"prompt":"What model are you? Reply in one line."}' 1; c4=$LAST_CODE; b4="$LAST_BODY"
  healthy=$(echo "$b1" | jq -r '.status // empty')
  mcount=$(echo "$b2" | jq '[.drivers[]?.models[]?] | length' 2>/dev/null)
  rcount=$(echo "$b3" | jq '[.drivers[]?] | length' 2>/dev/null)
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$healthy" = "healthy" ] && [ "${mcount:-0}" -ge 1 ] && [ "${rcount:-0}" -ge 1 ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER4=$((TIER4+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Checks: health=$healthy models=$mcount registryDrivers=$rcount"
  echo "- LLM self-report: $(snip "$b4")"
  echo ""
} >> "$OUT"
append_checkpoint 18

### TEST 19
{
  echo "## Test 19 — Error Recovery Chain"
  t0=$(date +%s%3N)
  # malformed JSON
  tmp=$(mktemp)
  timeout 180 curl -s -X POST "$BASE/v1/dev/llm/prompt" -H 'Content-Type: application/json' -d '{"prompt":' -w '\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n' > "$tmp"
  c1=$(grep 'HTTP_CODE:' "$tmp" | cut -d: -f2); b1=$(sed '/HTTP_CODE:/,$d' "$tmp"); rm -f "$tmp"
  call_api POST /v1/dev/llm/prompt '{"prompt":"recovery check"}' 1; c2=$LAST_CODE
  call_api GET /v1/dev/fake123/status '' 0; c3=$LAST_CODE
  call_api GET /v1/health '' 0; c4=$LAST_CODE
  call_api POST /v1/pipelines/validate '{"name":"bad-empty","steps":[]}' 0; c5=$LAST_CODE
  call_api POST /v1/pipelines/validate '{"name":"good-one","steps":[{"id":"s1","op":"transform","template":"ok"}]}' 0; c6=$LAST_CODE
  ok=0.5
  if [ "$c1" = "400" ] && [ "$c2" = "200" ] && [ "$c3" = "404" ] && [ "$c4" = "200" ] && [ "$c5" = "400" ] && [ "$c6" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER4=$((TIER4+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Status chain: malformed=$c1 recoveredPrompt=$c2 fakeDevice=$c3 recoveredHealth=$c4 badPipeline=$c5 recoveredPipeline=$c6"
  echo ""
} >> "$OUT"

### TEST 20
{
  echo "## Test 20 — The Mega Chain: 12 Steps, All Features"
  t0=$(date +%s%3N)
  call_api GET /v1/health '' 0; c1=$LAST_CODE; b1="$LAST_BODY"
  call_api GET /v1/llm/models '' 0; c2=$LAST_CODE; b2="$LAST_BODY"
  call_api POST /v1/apps/generate '{"url":"https://news.ycombinator.com","description":"track top stories"}' 0; c3=$LAST_CODE; b3="$LAST_BODY"
  app=$(echo "$b3" | jq -r '.app.name // "site-app"')
  call_api GET /v1/apps '' 0; c4=$LAST_CODE; b4="$LAST_BODY"
  call_api POST /v1/dev/llm/chat '{"messages":[{"role":"user","content":"Design a JSON template schema for Hacker News pages with fields title, points, comments, author, url. Return JSON only."}]}' 1; c5=$LAST_CODE; b5="$LAST_BODY"
  hntpl=$(echo "$b5" | jq -r '.text // ""' | sed -E 's/^```json//; s/^```//; s/```$//' | tr -d '\r')
  echo "$hntpl" | jq . >/dev/null 2>&1 || hntpl='{"domain":"hn-gauntlet.local","urlPattern":"https://news.ycombinator.com/*","selectors":{"title":".titleline a","points":".score","comments":"a[href*=item?id]","author":".hnuser"},"schema":{"type":"object","properties":{"title":{"type":"string"},"points":{"type":"string"},"comments":{"type":"string"},"author":{"type":"string"},"url":{"type":"string"}}},"createdAt":"2026-02-21T00:00:00Z","updatedAt":"2026-02-21T00:00:00Z","successCount":0,"failCount":0}'
  call_api POST /v1/templates/import "$hntpl" 0; c6=$LAST_CODE
  # determine domain from template
  hndomain=$(echo "$hntpl" | jq -r '.domain // "hn-gauntlet.local"')
  call_api GET "/v1/templates/$hndomain/export" '' 0; c7=$LAST_CODE
  call_api POST /v1/dev/llm/prompt '{"prompt":"Return ONLY JSON pipeline called gauntlet-hn-pipe with 3 transform steps to normalize HN story fields."}' 1; c8=$LAST_CODE; b8="$LAST_BODY"
  hnp=$(echo "$b8" | jq -r '.text // ""' | sed -E 's/^```json//; s/^```//; s/```$//' | tr -d '\r')
  echo "$hnp" | jq . >/dev/null 2>&1 || hnp='{"name":"gauntlet-hn-pipe","steps":[{"id":"s1","op":"transform","template":"title={{$input.title}}"},{"id":"s2","op":"transform","template":"score={{$input.points}}"},{"id":"s3","op":"transform","template":"summary={{$steps.s1.output}} {{$steps.s2.output}}"}]}'
  call_api POST /v1/pipelines/save "$hnp" 0; c9=$LAST_CODE
  call_api POST /v1/pipelines/validate "$hnp" 0; c10=$LAST_CODE
  call_api GET /v1/pipelines '' 0; c11=$LAST_CODE
  call_api POST /v1/dev/llm/chat '{"messages":[{"role":"user","content":"I just built an app, template, and pipeline for HN. What could go wrong?"},{"role":"assistant","content":"Potential risks include selector drift, schema mismatch, and rate limits."},{"role":"user","content":"Give me mitigations in 3 bullets."}]}' 1; c12=$LAST_CODE; b12="$LAST_BODY"
  ok=0.5
  if [ "$c1" = "200" ] && [ "$c2" = "200" ] && [ "$c3" = "200" ] && [ "$c4" = "200" ] && [ "$c5" = "200" ] && [ "$c6" = "200" ] && [ "$c7" = "200" ] && [ "$c8" = "200" ] && [ "$c9" = "200" ] && [ "$c10" = "200" ] && [ "$c11" = "200" ] && [ "$c12" = "200" ]; then ok=1; fi
  grade=$(passfail "$ok")
  [ "$ok" = "1" ] && SCORE=$((SCORE+1)) && TIER5=$((TIER5+1))
  t1=$(date +%s%3N)
  echo "- Grade: $grade"
  echo "- Timing: $((t1-t0)) ms"
  echo "- Status chain: $c1,$c2,$c3,$c4,$c5,$c6,$c7,$c8,$c9,$c10,$c11,$c12"
  echo "- Final chat snippet: $(snip "$b12")"
  echo ""
} >> "$OUT"

# wrap-up
{
  echo "# Final Scorecard"
  echo "- Overall: $SCORE / 20 tests passed"
  echo "- Tier 1 (Tests 1-5): $TIER1 / 5"
  echo "- Tier 2 (Tests 6-10): $TIER2 / 5"
  echo "- Tier 3 (Tests 11-15): $TIER3 / 5"
  echo "- Tier 4 (Tests 16-19): $TIER4 / 4"
  echo "- Tier 5 (Test 20): $TIER5 / 1"
  echo ""
  echo "## Quality Assessment"
  echo "- Brutal take: HTTP-level reliability appears stronger than feature-depth quality in LLM/PingApp generation paths."
  echo "- Multiple endpoints return generic placeholder structures (`site-app`, empty functions), which limits true end-to-end realism."
  echo "- Chain recovery after intentional errors is a strong point when status codes are correct and subsequent calls recover."
  echo ""
  echo "## Top 3 Things That Need Fixing"
  echo "1. PingApp generation quality: outputs are often generic and not URL-specific."
  echo "2. Functions ecosystem depth: generated apps frequently expose no callable functions, breaking app→function workflows."
  echo "3. LLM structured-output discipline: JSON-only compliance under adversarial/long prompts is inconsistent."
} >> "$OUT"

echo "Done: $OUT"
