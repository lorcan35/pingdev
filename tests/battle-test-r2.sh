#!/usr/bin/env bash
# PingOS Battle Test Round 2
# Tests every op across 10 sites
set -euo pipefail

GW="http://localhost:3500"
RESULTS="/tmp/battle-r2-results.json"

# Device IDs
HN="chrome-2114771780"
TWITTER="chrome-2114771795"
YOUTUBE="chrome-2114771797"
GMAIL="chrome-2114771798"
REDDIT="chrome-2114771799"
GITHUB="chrome-2114771800"
AMAZON="chrome-2114771801"
SHEETS="chrome-2114771802"
CALENDAR="chrome-2114771803"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
PARTIAL=0

run_test() {
  local site="$1"
  local op="$2"
  local device="$3"
  local payload="$4"
  local check="$5"  # "ok" or "has_result" or "has_data" or custom jq expression

  local result
  result=$(curl -s -m 30 -X POST "$GW/v1/dev/$device/$op" \
    -H 'Content-Type: application/json' \
    -d "$payload" 2>/dev/null || echo '{"errno":"CURL_FAIL"}')

  local status="FAIL"
  local detail=""

  case "$check" in
    ok)
      if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
        status="PASS"
      fi
      ;;
    has_result)
      if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True; assert d.get('result') is not None" 2>/dev/null; then
        status="PASS"
      fi
      ;;
    has_actions)
      local count
      count=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(len(r.get('actions',[])))" 2>/dev/null || echo "0")
      if [ "$count" -gt "0" ]; then
        status="PASS"
        detail="actions=$count"
      else
        detail="no actions found"
      fi
      ;;
    has_observe)
      local count
      count=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',[]); print(len(r) if isinstance(r,list) else 0)" 2>/dev/null || echo "0")
      if [ "$count" -gt "0" ]; then
        status="PASS"
        detail="items=$count"
      else
        detail="no observations"
      fi
      ;;
    has_extract)
      if echo "$result" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok')==True
r=d.get('result',{})
# Check if result has any non-empty values
vals = [v for v in (r.values() if isinstance(r,dict) else []) if v]
assert len(vals)>0
" 2>/dev/null; then
        status="PASS"
        detail=$(echo "$result" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('result',{})
if isinstance(r,dict):
    for k,v in list(r.items())[:2]:
        val=str(v)[:60] if v else 'null'
        print(f'{k}={val}')
" 2>/dev/null || echo "parsed")
      else
        local errno
        errno=$(echo "$result" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('errno',''))" 2>/dev/null || echo "unknown")
        if [ -n "$errno" ] && [ "$errno" != "" ]; then
          detail="errno=$errno"
        else
          detail="empty result"
        fi
      fi
      ;;
    has_text)
      if echo "$result" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok')==True
r=d.get('result','')
assert isinstance(r,str) and len(r.strip())>0
" 2>/dev/null; then
        status="PASS"
        local tlen
        tlen=$(echo "$result" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('result','')))" 2>/dev/null || echo "0")
        detail="len=$tlen"
      fi
      ;;
    *)
      # Custom check expression - just check ok
      if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
        status="PASS"
      fi
      ;;
  esac

  # If still FAIL, check for partial (ok=true but empty result)
  if [ "$status" = "FAIL" ]; then
    if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
      status="PARTIAL"
      detail="ok=true but $detail"
    else
      local errno
      errno=$(echo "$result" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('errno','') or d.get('code',''))" 2>/dev/null || echo "")
      if [ -n "$errno" ]; then
        detail="$errno"
      fi
    fi
  fi

  case "$status" in
    PASS) ((PASS++)) || true; echo -e "  ${GREEN}PASS${NC} $site/$op ${detail:+($detail)}" ;;
    PARTIAL) ((PARTIAL++)) || true; echo -e "  ${YELLOW}PARTIAL${NC} $site/$op ${detail:+($detail)}" ;;
    FAIL) ((FAIL++)) || true; echo -e "  ${RED}FAIL${NC} $site/$op ${detail:+($detail)}" ;;
  esac

  # Save result
  echo "$site|$op|$status|$detail" >> /tmp/battle-r2-raw.txt
}

echo "========================================"
echo "PingOS Battle Test — Round 2"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "========================================"
echo ""

# Clear previous results
> /tmp/battle-r2-raw.txt

# =====================================================================
# TEST 1: RECON — all sites
# =====================================================================
echo "--- RECON ---"
run_test "YouTube"   recon "$YOUTUBE"  '{}' has_actions
run_test "X/Twitter" recon "$TWITTER"  '{}' has_actions
run_test "Gmail"     recon "$GMAIL"    '{}' has_actions
run_test "Sheets"    recon "$SHEETS"   '{}' has_actions
run_test "GitHub"    recon "$GITHUB"   '{}' has_actions
run_test "Amazon"    recon "$AMAZON"   '{}' has_actions
run_test "Reddit"    recon "$REDDIT"   '{}' has_actions
run_test "HN"        recon "$HN"       '{}' has_actions
run_test "Calendar"  recon "$CALENDAR" '{}' has_actions
echo ""

# =====================================================================
# TEST 2: OBSERVE — all sites
# =====================================================================
echo "--- OBSERVE ---"
run_test "YouTube"   observe "$YOUTUBE"  '{}' has_observe
run_test "X/Twitter" observe "$TWITTER"  '{}' has_observe
run_test "Gmail"     observe "$GMAIL"    '{}' has_observe
run_test "Sheets"    observe "$SHEETS"   '{}' has_observe
run_test "GitHub"    observe "$GITHUB"   '{}' has_observe
run_test "Amazon"    observe "$AMAZON"   '{}' has_observe
run_test "Reddit"    observe "$REDDIT"   '{}' has_observe
run_test "HN"        observe "$HN"       '{}' has_observe
run_test "Calendar"  observe "$CALENDAR" '{}' has_observe
echo ""

# =====================================================================
# TEST 3: EXTRACT — site-specific schemas
# =====================================================================
echo "--- EXTRACT ---"
run_test "YouTube"   extract "$YOUTUBE"  '{"schema":{"trending_title":"#video-title","channel":"#channel-name"}}' has_extract
run_test "X/Twitter" extract "$TWITTER"  '{"schema":{"tweet_text":"[data-testid=\"tweetText\"]","username":"[data-testid=\"User-Name\"]"}}' has_extract
run_test "Gmail"     extract "$GMAIL"    '{"schema":{"subject":".bqe","sender":".yP"}}' has_extract
run_test "Sheets"    extract "$SHEETS"   '{"schema":{"sheet_name":".docs-sheet-tab-name","cell_value":".cell-input"}}' has_extract
run_test "GitHub"    extract "$GITHUB"   '{"schema":{"repo_name":"h2.h3 a","description":"p.col-9"}}' has_extract
run_test "Amazon"    extract "$AMAZON"   '{"schema":{"deal_title":".a-size-medium","deal_price":".a-price-whole"}}' has_extract
run_test "Reddit"    extract "$REDDIT"   '{"schema":{"post_title":"a[data-testid=\"post-title\"]","subreddit":"a[data-testid=\"subreddit-name\"]"}}' has_extract
run_test "HN"        extract "$HN"       '{"schema":{"top_title":".titleline > a","top_score":".score"}}' has_extract
run_test "Calendar"  extract "$CALENDAR" '{"schema":{"day_header":"[data-datekey]","event_title":"[data-eventid]"}}' has_extract
echo ""

# =====================================================================
# TEST 4: READ — targeted selectors
# =====================================================================
echo "--- READ ---"
run_test "YouTube"   read "$YOUTUBE"  '{"selector":"#content"}' has_text
run_test "X/Twitter" read "$TWITTER"  '{"selector":"article"}' has_text
run_test "Gmail"     read "$GMAIL"    '{"selector":"[role=\"main\"]"}' has_text
run_test "Sheets"    read "$SHEETS"   '{"selector":".docs-sheet-tab-name"}' has_text
run_test "GitHub"    read "$GITHUB"   '{"selector":"main"}' has_text
run_test "Amazon"    read "$AMAZON"   '{"selector":"#nav-xshop"}' has_text
run_test "Reddit"    read "$REDDIT"   '{"selector":"main"}' has_text
run_test "HN"        read "$HN"       '{"selector":".itemlist"}' has_text
run_test "Calendar"  read "$CALENDAR" '{"selector":"[role=\"main\"]"}' has_text
echo ""

# =====================================================================
# TEST 5: SCROLL — all sites
# =====================================================================
echo "--- SCROLL ---"
run_test "YouTube"   scroll "$YOUTUBE"  '{"direction":"down","amount":3}' ok
run_test "X/Twitter" scroll "$TWITTER"  '{"direction":"down","amount":3}' ok
run_test "Reddit"    scroll "$REDDIT"   '{"direction":"down","amount":3}' ok
run_test "HN"        scroll "$HN"       '{"direction":"down","amount":3}' ok
run_test "Amazon"    scroll "$AMAZON"   '{"direction":"down","amount":3}' ok
run_test "GitHub"    scroll "$GITHUB"   '{"direction":"down","amount":3}' ok
echo ""

# =====================================================================
# TEST 6: ACT — natural language instructions
# =====================================================================
echo "--- ACT ---"
run_test "YouTube"   act "$YOUTUBE"  '{"instruction":"click on the search icon"}' ok
run_test "HN"        act "$HN"       '{"instruction":"click on the first story link"}' ok
run_test "GitHub"    act "$GITHUB"   '{"instruction":"click on the first trending repository"}' ok
run_test "Amazon"    act "$AMAZON"   '{"instruction":"click on the search box"}' ok
run_test "Reddit"    act "$REDDIT"   '{"instruction":"click on the first post title"}' ok
echo ""

# Wait for act navigations to settle
sleep 2

# =====================================================================
# TEST 7: NL EXTRACT — natural language field descriptions
# =====================================================================
echo "--- NL EXTRACT ---"
run_test "HN"        extract "$HN"       '{"schema":{"page_title":"the main page heading or title","first_link":"the first story link text"}}' has_extract
run_test "GitHub"    extract "$GITHUB"    '{"schema":{"page_heading":"the main heading on the page","repo_description":"description of the first visible repository"}}' has_extract
run_test "Reddit"    extract "$REDDIT"    '{"schema":{"page_heading":"the main heading or subreddit name","top_post":"the title of the first post"}}' has_extract
echo ""

# Navigate back to the original pages after act tests
sleep 1
curl -s -X POST "$GW/v1/dev/$HN/navigate" -H 'Content-Type: application/json' -d '{"url":"https://news.ycombinator.com/"}' > /dev/null 2>&1 || true
curl -s -X POST "$GW/v1/dev/$GITHUB/navigate" -H 'Content-Type: application/json' -d '{"url":"https://github.com/trending"}' > /dev/null 2>&1 || true
curl -s -X POST "$GW/v1/dev/$REDDIT/navigate" -H 'Content-Type: application/json' -d '{"url":"https://www.reddit.com/r/programming/"}' > /dev/null 2>&1 || true
sleep 3

# =====================================================================
# TEST 8: CLICK + TYPE + PRESS — interaction chain
# =====================================================================
echo "--- CLICK/TYPE/PRESS ---"
# YouTube: click search, type query, press enter
run_test "YouTube"   click "$YOUTUBE"  '{"selector":"#search-icon-legacy, button[aria-label=\"Search\"], [id=\"search-icon-legacy\"]"}' ok
sleep 1
run_test "YouTube"   type "$YOUTUBE"   '{"text":"PingOS test","selector":"input#search"}' ok
sleep 1
run_test "YouTube"   press "$YOUTUBE"  '{"key":"Enter"}' ok
sleep 2

# Amazon: click search, type query, press enter
run_test "Amazon"    click "$AMAZON"   '{"selector":"#twotabsearchtextbox"}' ok
sleep 1
run_test "Amazon"    type "$AMAZON"    '{"text":"raspberry pi","selector":"#twotabsearchtextbox"}' ok
sleep 1
run_test "Amazon"    press "$AMAZON"   '{"key":"Enter"}' ok
sleep 2

# HN: test search (if available)
run_test "HN"        click "$HN"       '{"selector":"a.morelink, a[href=\"news\"]"}' ok
echo ""

# =====================================================================
# TEST 9: RECORDER — start, stop, export
# =====================================================================
echo "--- RECORDER ---"
# Start recording on YouTube
RECORD_START=$(curl -s -X POST "$GW/v1/dev/$YOUTUBE/record_start" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
if echo "$RECORD_START" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
  echo -e "  ${GREEN}PASS${NC} YouTube/record_start"
  ((PASS++)) || true
  echo "YouTube|record_start|PASS|" >> /tmp/battle-r2-raw.txt

  # Do some actions while recording
  sleep 1
  curl -s -X POST "$GW/v1/dev/$YOUTUBE/scroll" -H 'Content-Type: application/json' -d '{"direction":"down","amount":2}' > /dev/null 2>&1 || true
  sleep 1

  # Stop recording
  RECORD_STOP=$(curl -s -X POST "$GW/v1/dev/$YOUTUBE/record_stop" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
  if echo "$RECORD_STOP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC} YouTube/record_stop"
    ((PASS++)) || true
    echo "YouTube|record_stop|PASS|" >> /tmp/battle-r2-raw.txt
  else
    echo -e "  ${RED}FAIL${NC} YouTube/record_stop"
    ((FAIL++)) || true
    echo "YouTube|record_stop|FAIL|" >> /tmp/battle-r2-raw.txt
  fi

  # Export recording
  RECORD_EXPORT=$(curl -s -X POST "$GW/v1/dev/$YOUTUBE/record_export" -H 'Content-Type: application/json' -d '{"name":"yt-battle-test"}' 2>/dev/null)
  if echo "$RECORD_EXPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
    STEPS=$(echo "$RECORD_EXPORT" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(len(r.get('steps',r.get('actions',[]))))" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}PASS${NC} YouTube/record_export (steps=$STEPS)"
    ((PASS++)) || true
    echo "YouTube|record_export|PASS|steps=$STEPS" >> /tmp/battle-r2-raw.txt
  else
    echo -e "  ${YELLOW}PARTIAL${NC} YouTube/record_export (ok but no steps)"
    ((PARTIAL++)) || true
    echo "YouTube|record_export|PARTIAL|" >> /tmp/battle-r2-raw.txt
  fi
else
  echo -e "  ${RED}FAIL${NC} YouTube/record_start"
  ((FAIL++)) || true
  echo "YouTube|record_start|FAIL|" >> /tmp/battle-r2-raw.txt
  echo -e "  ${RED}FAIL${NC} YouTube/record_stop (skipped)"
  ((FAIL++)) || true
  echo "YouTube|record_stop|FAIL|skipped" >> /tmp/battle-r2-raw.txt
  echo -e "  ${RED}FAIL${NC} YouTube/record_export (skipped)"
  ((FAIL++)) || true
  echo "YouTube|record_export|FAIL|skipped" >> /tmp/battle-r2-raw.txt
fi
echo ""

# =====================================================================
# TEST 10: MULTI-STEP WORKFLOW (manual)
# =====================================================================
echo "--- MULTI-STEP WORKFLOW ---"
# Navigate YouTube back to home, search, extract results
STEP1=$(curl -s -m 15 -X POST "$GW/v1/dev/$YOUTUBE/navigate" -H 'Content-Type: application/json' -d '{"url":"https://www.youtube.com/"}' 2>/dev/null)
S1_OK=$(echo "$STEP1" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo "fail")
sleep 3

STEP2=$(curl -s -m 15 -X POST "$GW/v1/dev/$YOUTUBE/type" -H 'Content-Type: application/json' -d '{"text":"browser automation","selector":"input#search"}' 2>/dev/null)
S2_OK=$(echo "$STEP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo "fail")
sleep 1

STEP3=$(curl -s -m 15 -X POST "$GW/v1/dev/$YOUTUBE/press" -H 'Content-Type: application/json' -d '{"key":"Enter"}' 2>/dev/null)
S3_OK=$(echo "$STEP3" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')" 2>/dev/null || echo "fail")
sleep 3

STEP4=$(curl -s -m 15 -X POST "$GW/v1/dev/$YOUTUBE/extract" -H 'Content-Type: application/json' -d '{"schema":{"video_title":"#video-title","channel":"#channel-name"}}' 2>/dev/null)
S4_OK=$(echo "$STEP4" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print('ok' if d.get('ok') and any(v for v in r.values() if v) else 'fail')" 2>/dev/null || echo "fail")

WORKFLOW_RESULT="$S1_OK/$S2_OK/$S3_OK/$S4_OK"
if [ "$WORKFLOW_RESULT" = "ok/ok/ok/ok" ]; then
  echo -e "  ${GREEN}PASS${NC} YouTube/workflow:search-extract ($WORKFLOW_RESULT)"
  ((PASS++)) || true
  echo "YouTube|workflow:search-extract|PASS|$WORKFLOW_RESULT" >> /tmp/battle-r2-raw.txt
elif echo "$WORKFLOW_RESULT" | grep -q "ok"; then
  echo -e "  ${YELLOW}PARTIAL${NC} YouTube/workflow:search-extract ($WORKFLOW_RESULT)"
  ((PARTIAL++)) || true
  echo "YouTube|workflow:search-extract|PARTIAL|$WORKFLOW_RESULT" >> /tmp/battle-r2-raw.txt
else
  echo -e "  ${RED}FAIL${NC} YouTube/workflow:search-extract ($WORKFLOW_RESULT)"
  ((FAIL++)) || true
  echo "YouTube|workflow:search-extract|FAIL|$WORKFLOW_RESULT" >> /tmp/battle-r2-raw.txt
fi

# Gmail: read inbox subjects
GMAIL_STEP1=$(curl -s -m 15 -X POST "$GW/v1/dev/$GMAIL/extract" -H 'Content-Type: application/json' -d '{"schema":{"subjects":"the email subject lines visible","senders":"the sender names visible"}}' 2>/dev/null)
GMAIL_OK=$(echo "$GMAIL_STEP1" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print('ok' if d.get('ok') and any(v for v in r.values() if v) else 'fail')" 2>/dev/null || echo "fail")
if [ "$GMAIL_OK" = "ok" ]; then
  echo -e "  ${GREEN}PASS${NC} Gmail/workflow:read-inbox"
  ((PASS++)) || true
  echo "Gmail|workflow:read-inbox|PASS|" >> /tmp/battle-r2-raw.txt
else
  echo -e "  ${YELLOW}PARTIAL${NC} Gmail/workflow:read-inbox"
  ((PARTIAL++)) || true
  echo "Gmail|workflow:read-inbox|PARTIAL|" >> /tmp/battle-r2-raw.txt
fi
echo ""

# =====================================================================
# TEST 11: WIKIPEDIA (navigate to it using a spare tab)
# =====================================================================
echo "--- WIKIPEDIA ---"
# Navigate the Twitter tab to Wikipedia for testing
WIKI_DEVICE="$TWITTER"
curl -s -X POST "$GW/v1/dev/$WIKI_DEVICE/navigate" -H 'Content-Type: application/json' -d '{"url":"https://en.wikipedia.org/wiki/Browser_automation"}' > /dev/null 2>&1 || true
sleep 4

run_test "Wikipedia" recon "$WIKI_DEVICE"   '{}' has_actions
run_test "Wikipedia" observe "$WIKI_DEVICE" '{}' has_observe
run_test "Wikipedia" extract "$WIKI_DEVICE" '{"schema":{"article_title":"#firstHeading","first_paragraph":"#mw-content-text p"}}' has_extract
run_test "Wikipedia" read "$WIKI_DEVICE"    '{"selector":"#mw-content-text"}' has_text
run_test "Wikipedia" scroll "$WIKI_DEVICE"  '{"direction":"down","amount":3}' ok
echo ""

# Navigate back to X/Twitter for completeness
curl -s -X POST "$GW/v1/dev/$WIKI_DEVICE/navigate" -H 'Content-Type: application/json' -d '{"url":"https://x.com/home"}' > /dev/null 2>&1 || true

# =====================================================================
# SUMMARY
# =====================================================================
echo "========================================"
echo "BATTLE TEST R2 — SUMMARY"
echo "========================================"
TOTAL=$((PASS + FAIL + PARTIAL))
echo -e "Total: $TOTAL tests"
echo -e "${GREEN}PASS:    $PASS${NC}"
echo -e "${YELLOW}PARTIAL: $PARTIAL${NC}"
echo -e "${RED}FAIL:    $FAIL${NC}"
if [ "$TOTAL" -gt 0 ]; then
  PCT=$((PASS * 100 / TOTAL))
  echo "Pass rate: ${PCT}%"
fi
echo ""
echo "Raw results saved to /tmp/battle-r2-raw.txt"
