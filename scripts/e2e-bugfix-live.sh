#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3500}"
RESULTS_DIR="${RESULTS_DIR:-$HOME/projects/pingdev/test-results}"
RESULTS_FILE="${RESULTS_FILE:-$RESULTS_DIR/e2e-bugfix-results.md}"
MARKER="__HTTP_STATUS__"

mkdir -p "$RESULTS_DIR"
: > "$RESULTS_FILE"

overall_failures=0
device_id=""
recording_id=""

append() {
  printf "%s\n" "$1" >> "$RESULTS_FILE"
}

append_block() {
  local title="$1"
  local code="$2"
  local body="$3"
  append "#### $title"
  append "HTTP $code"
  append '```json'
  if [ -n "$body" ]; then
    printf "%s\n" "$body" >> "$RESULTS_FILE"
  fi
  append '```'
}

api_call() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local resp

  if [ -n "$data" ]; then
    resp=$(curl -sS -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' \
      -d "$data" \
      -w "$MARKER%{http_code}")
  else
    resp=$(curl -sS -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' \
      -w "$MARKER%{http_code}")
  fi

  API_CODE="${resp##*$MARKER}"
  API_BODY="${resp%$MARKER*}"
}

extract_recordings_array() {
  local body="$1"
  jq -c '(
    .result.recordings //
    .recordings //
    (if (.result | type) == "array" then .result else empty end) //
    (if (type) == "array" then . else empty end) //
    []
  )' <<<"$body"
}

get_first_level_array_lengths() {
  local body="$1"
  jq -c '(
    .result.data // .data // .result // .
  ) as $root |
  if ($root | type) == "array" then
    [($root | length)]
  elif ($root | type) == "object" then
    [ $root[]? | select(type == "array") | length ]
  else
    []
  end' <<<"$body"
}

append "# PingOS Live E2E Bugfix Results"
append ""
append "- Base URL: \`$BASE_URL\`"
append "- Run time (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
append ""

# Discover device ID
api_call GET "/v1/devices"
append "## Device Discovery"
append_block "GET /v1/devices" "$API_CODE" "$API_BODY"
device_id=$(jq -r '.result.extension.clients[0].tabs[0].deviceId // .extension.clients[0].tabs[0].deviceId // empty' <<<"$API_BODY")
if [ -z "$device_id" ] || [ "$device_id" = "null" ]; then
  append "- Status: FAIL"
  append "- Reason: Could not resolve device ID at extension.clients[0].tabs[0].deviceId"
  echo "Failed to find device ID. See $RESULTS_FILE"
  echo "DONE"
  exit 1
fi
append "- Status: PASS"
append "- Device ID: \\`$device_id\\`"
append ""

# Test 1
append "## Test 1: Recorder captures API-driven actions (Bug #1)"
pass=true

api_call POST "/v1/record/start" "{\"device\":\"$device_id\",\"name\":\"e2e-test-1\"}"
append_block "POST /v1/record/start" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

api_call POST "/v1/dev/$device_id/navigate" '{"url":"https://news.ycombinator.com"}'
append_block "POST /v1/dev/<deviceId>/navigate" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false
sleep 2

api_call POST "/v1/dev/$device_id/extract" '{"query":"top 3 stories"}'
append_block "POST /v1/dev/<deviceId>/extract" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

api_call POST "/v1/record/export" "{\"device\":\"$device_id\"}"
append_block "POST /v1/record/export" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

actions_len=$(jq -r '[.result.actions[]?] | length' <<<"$API_BODY")
has_navigate=$(jq -r '[.result.actions[]? | (.type // .op // .actionType // .name // "") | ascii_downcase] | any(. == "navigate")' <<<"$API_BODY")
has_extract=$(jq -r '[.result.actions[]? | (.type // .op // .actionType // .name // "") | ascii_downcase] | any(. == "extract")' <<<"$API_BODY")

[ "${actions_len:-0}" -ge 2 ] || pass=false
[ "$has_navigate" = "true" ] || pass=false
[ "$has_extract" = "true" ] || pass=false

if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: actions_len=$actions_len, has_navigate=$has_navigate, has_extract=$has_extract"
append ""

# Test 2
append "## Test 2: Export warns on empty recordings (Bug #2)"
pass=true

api_call POST "/v1/record/start" "{\"device\":\"$device_id\",\"name\":\"e2e-empty\"}"
append_block "POST /v1/record/start" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

api_call POST "/v1/record/export" "{\"device\":\"$device_id\"}"
append_block "POST /v1/record/export" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

action_count=$(jq -r '.result.actionCount // -1' <<<"$API_BODY")
warning=$(jq -r '.result.warning // ""' <<<"$API_BODY")
warning_lc=$(printf "%s" "$warning" | tr '[:upper:]' '[:lower:]')

[ "$action_count" = "0" ] || pass=false
if [[ "$warning_lc" != *"empty"* && "$warning_lc" != *"no actions"* ]]; then
  pass=false
fi

if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: actionCount=$action_count, warning=$warning"
append ""

# Test 3
append "## Test 3: Export persists recordings (Bug #3)"
pass=true

api_call GET "/v1/recordings"
append_block "GET /v1/recordings" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

recordings_json=$(extract_recordings_array "$API_BODY")
recordings_len=$(jq -r 'length' <<<"$recordings_json")
has_nonzero=$(jq -r 'map((.actionCount // ((.actions // []) | length) // 0)) | any(. > 0)' <<<"$recordings_json")

[ "${recordings_len:-0}" -gt 0 ] || pass=false
[ "$has_nonzero" = "true" ] || pass=false

if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: recordings_len=$recordings_len, has_actionCount_gt_0=$has_nonzero"
append ""

# Keep recording id for Test 4
recording_id=$(jq -r '
  (
    .result.recordings //
    .recordings //
    (if (.result | type) == "array" then .result else empty end) //
    (if (type) == "array" then . else empty end) //
    []
  )
  | (map(select((.name // "") == "e2e-test-1")) | last // empty) as $named
  | if $named != null and $named != empty then
      ($named.id // $named.recordingId // empty)
    else
      (map(select((.actionCount // ((.actions // []) | length) // 0) > 0)) | last | (.id // .recordingId // empty))
    end
' <<<"$API_BODY")

# Test 4
append "## Test 4: Replay by ID (Bug #4)"
pass=true

if [ -z "$recording_id" ] || [ "$recording_id" = "null" ]; then
  pass=false
  append "- Status: FAIL"
  append "- Reason: Could not find recording ID for replay"
  overall_failures=$((overall_failures + 1))
else
  api_call POST "/v1/record/replay" "{\"device\":\"$device_id\",\"recordingId\":\"$recording_id\"}"
  append_block "POST /v1/record/replay" "$API_CODE" "$API_BODY"

  ok_field=$(jq -r '.ok // false' <<<"$API_BODY")
  replay_count=$(jq -r '.result.actionsReplayed // .result.replayed // .result.count // .result.actionCount // (.result.actions // [] | length) // 0' <<<"$API_BODY")

  [ "$API_CODE" = "200" ] || pass=false
  [ "$ok_field" = "true" ] || pass=false
  [ "${replay_count:-0}" -gt 0 ] || pass=false

  if [ "$pass" = true ]; then
    append "- Status: PASS"
  else
    append "- Status: FAIL"
    overall_failures=$((overall_failures + 1))
  fi
  append "- Checks: recordingId=$recording_id, ok=$ok_field, replayCount=$replay_count"
fi
append ""
sleep 2

# Test 5
append "## Test 5: Query count limiting (Bug #6)"
pass=true

api_call POST "/v1/dev/$device_id/extract" '{"query":"top 3 story titles"}'
append_block "POST /v1/dev/<deviceId>/extract (top 3 story titles)" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

lengths_3=$(get_first_level_array_lengths "$API_BODY")
all_3=$(jq -r 'length > 0 and all(.[]; . == 3)' <<<"$lengths_3")
[ "$all_3" = "true" ] || pass=false

api_call POST "/v1/dev/$device_id/extract" '{"query":"first 7 stories"}'
append_block "POST /v1/dev/<deviceId>/extract (first 7 stories)" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

lengths_7=$(get_first_level_array_lengths "$API_BODY")
all_7=$(jq -r 'length > 0 and all(.[]; . == 7)' <<<"$lengths_7")
[ "$all_7" = "true" ] || pass=false

if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: lengths_for_3=$lengths_3, lengths_for_7=$lengths_7"
append ""

# Test 6
append "## Test 6: Pipeline read param normalization (Bug #8)"
pass=true

api_call POST "/v1/pipelines/run" "{\"name\":\"read-test\",\"steps\":[{\"id\":\"s1\",\"op\":\"read\",\"tab\":\"$device_id\",\"selector\":\"h1\"}]}"
append_block "POST /v1/pipelines/run (selector format)" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

ok_1=$(jq -r '.ok // false' <<<"$API_BODY")
step_ok_1=$(jq -r '[(.result.steps // .steps // [])[]? | (.status // "")] | any(. == "ok")' <<<"$API_BODY")
[ "$ok_1" = "true" ] || pass=false
[ "$step_ok_1" = "true" ] || pass=false

api_call POST "/v1/pipelines/run" "{\"name\":\"read-test-2\",\"steps\":[{\"id\":\"s1\",\"op\":\"read\",\"tab\":\"$device_id\",\"text\":\"h1\"}]}"
append_block "POST /v1/pipelines/run (value/text format)" "$API_CODE" "$API_BODY"
[ "$API_CODE" = "200" ] || pass=false

ok_2=$(jq -r '.ok // false' <<<"$API_BODY")
[ "$ok_2" = "true" ] || pass=false

if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: selector_ok=$ok_1, selector_step_ok=$step_ok_1, text_ok=$ok_2"
append ""

# Test 7
append "## Test 7: Watch endpoint clarification (Bug #5)"
pass=true

watch_headers=$(mktemp)
watch_body=$(mktemp)
set +e
curl -sS -X POST "$BASE_URL/v1/dev/$device_id/watch" \
  -H 'Content-Type: application/json' \
  -d '{"schema":{"title":".title"}}' \
  -D "$watch_headers" \
  -o "$watch_body" \
  --max-time 6
watch_exit=$?
set -e

watch_status=$(awk 'toupper($1) ~ /^HTTP\// {code=$2} END{print code+0}' "$watch_headers")
watch_raw_headers=$(cat "$watch_headers")
watch_raw_body=$(cat "$watch_body")

append "#### POST /v1/dev/<deviceId>/watch"
append "curl_exit=$watch_exit, HTTP $watch_status"
append '```text'
printf "%s\n" "$watch_raw_headers" >> "$RESULTS_FILE"
printf "\n" >> "$RESULTS_FILE"
printf "%s\n" "$watch_raw_body" >> "$RESULTS_FILE"
append '```'

if [ "$watch_status" -eq 400 ] || [ "$watch_status" -eq 0 ]; then
  pass=false
fi
if [ "$pass" = true ]; then
  append "- Status: PASS"
else
  append "- Status: FAIL"
  overall_failures=$((overall_failures + 1))
fi
append "- Checks: watch_http_status=$watch_status, curl_exit=$watch_exit"
append ""

rm -f "$watch_headers" "$watch_body"

append "## Summary"
if [ "$overall_failures" -eq 0 ]; then
  append "- Overall: PASS"
else
  append "- Overall: FAIL ($overall_failures test(s) failed)"
fi

if [ "$overall_failures" -eq 0 ]; then
  echo "All tests passed. Results written to $RESULTS_FILE"
else
  echo "Completed with failures ($overall_failures). Results written to $RESULTS_FILE"
fi

echo "DONE"
