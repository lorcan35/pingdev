# PingOS Battle Test Round 6 — THE MEGA TEST

## What Changed Since R5
- 15 NEW core operations: fill, wait, table, dialog, paginate, select, navigate, hover, assert, network, storage, capture, upload, download, annotate
- Smart Extract Level 2-10: zero-config, semantic, JSON-LD/Schema.org, multi-page, nested/recursive, type-aware, shadow DOM pierce, visual extract, template learning
- Bug fixes from R5: pipeline unwrapping, discover handler, replay crash, function registry
- UX: pingos up/down/status/doctor, extension auto-reconnect + badge

## Test Setup
1. Start gateway: `cd packages/std && node dist/main.js`
2. Launch Playwright Chromium with extension loaded (5 tabs: HN, Amazon, Wikipedia, Reddit, GitHub)
3. Get device IDs from `GET /v1/devices`

## BATTERY A: New Core Operations (15 tests)

### A1: fill — Smart Form Fill
```bash
# Wikipedia search form
curl -s -X POST localhost:3500/v1/dev/{wiki}/fill \
  -H 'Content-Type: application/json' \
  -d '{"fields": {"search": "artificial intelligence"}}'
# PASS if: returns filled array with search field, success: true
```

### A2: wait — Conditional Wait  
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/wait \
  -H 'Content-Type: application/json' \
  -d '{"condition": "visible", "selector": ".titleline"}'
# PASS if: waited: true, condition_met: true, duration_ms < 1000
```

### A3: wait — Network Idle
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/wait \
  -H 'Content-Type: application/json' \
  -d '{"condition": "networkIdle", "timeout": 5000}'
# PASS if: waited: true, condition_met: true
```

### A4: table — Extract HTML Table
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/table \
  -H 'Content-Type: application/json' -d '{}'
# PASS if: returns tables array with headers and rows
```

### A5: dialog — Detect Modals/Banners
```bash
curl -s -X POST localhost:3500/v1/dev/{amzn}/dialog \
  -H 'Content-Type: application/json' \
  -d '{"action": "detect"}'
# PASS if: returns found array (even if empty — no crash)
```

### A6: dialog — Dismiss Cookie Banner
```bash
curl -s -X POST localhost:3500/v1/dev/{amzn}/dialog \
  -H 'Content-Type: application/json' \
  -d '{"action": "dismiss"}'
# PASS if: success: true (even if no dialog found)
```

### A7: paginate — Detect Pagination
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/paginate \
  -H 'Content-Type: application/json' \
  -d '{"action": "detect"}'
# PASS if: returns paginationType, hasNext: true
```

### A8: select — Native Select
```bash
# Find any select element on a page with dropdowns
curl -s -X POST localhost:3500/v1/dev/{wiki}/select \
  -H 'Content-Type: application/json' \
  -d '{"selector": "select", "text": "English"}'
# PASS if: no crash, returns result (even if no select found)
```

### A9: navigate — Go To URL
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/navigate \
  -H 'Content-Type: application/json' \
  -d '{"to": "https://news.ycombinator.com/newest"}'
# PASS if: navigated: true, url contains "newest"
```

### A10: hover — Trigger Hover
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/hover \
  -H 'Content-Type: application/json' \
  -d '{"selector": ".titleline a"}'
# PASS if: hovered: true
```

### A11: assert — Verify Conditions
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/assert \
  -H 'Content-Type: application/json' \
  -d '{"assertions": [{"type": "exists", "selector": "h1"}, {"type": "textContains", "selector": "h1", "expected": "intelligence"}]}'
# PASS if: passed: true, results array with both passing
```

### A12: network — Start Capture
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/network \
  -H 'Content-Type: application/json' \
  -d '{"action": "start"}'
# PASS if: returns success or started status
```

### A13: storage — Read localStorage
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/storage \
  -H 'Content-Type: application/json' \
  -d '{"action": "list", "store": "local"}'
# PASS if: returns object (even empty) without crash
```

### A14: capture — DOM Snapshot
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/capture \
  -H 'Content-Type: application/json' \
  -d '{"format": "dom"}'
# PASS if: returns HTML string
```

### A15: annotate — Visual Box
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/annotate \
  -H 'Content-Type: application/json' \
  -d '{"annotations": [{"selector": ".titleline", "label": "titles", "style": "box", "color": "red"}]}'
# PASS if: annotated: true
```

## BATTERY B: Smart Extract Upgrades (12 tests)

### B1: Zero-Config Extract (Level 2)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' -d '{}'
# PASS if: returns data with auto-detected fields, _meta.strategy != "css" or _meta.auto: true
```

### B2: Zero-Config on Product Page
```bash
curl -s -X POST localhost:3500/v1/dev/{amzn}/extract \
  -H 'Content-Type: application/json' -d '{}'
# PASS if: returns product-related data (title, price, or similar)
```

### B3: Semantic Extract (Level 3)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"query": "the top 5 story titles and their scores"}'
# PASS if: returns array/object with title+score data
```

### B4: Semantic Extract on Wikipedia
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/extract \
  -H 'Content-Type: application/json' \
  -d '{"query": "the first paragraph summary of this article"}'
# PASS if: returns text content from the article intro
```

### B5: JSON-LD Extract (Level 4)
```bash
curl -s -X POST localhost:3500/v1/dev/{wiki}/extract \
  -H 'Content-Type: application/json' \
  -d '{"strategy": "structured"}'
# PASS if: returns data from JSON-LD/OG/meta tags, _meta.sources shows non-css source
```

### B6: Nested Extract (Level 6)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"stories[]": {"_container": ".athing", "title": ".titleline a", "rank": ".rank", "link": ".titleline a@href"}}}'
# PASS if: returns stories array with nested objects containing title, rank, link
```

### B7: Type-Aware Extract (Level 7)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"score": {"selector": ".score", "type": "number"}, "age": {"selector": ".age a", "type": "date"}}}'
# PASS if: score is parsed as number (not string), date is parsed
```

### B8: Type-Aware Currency
```bash
curl -s -X POST localhost:3500/v1/dev/{amzn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"price": {"selector": ".a-price .a-offscreen", "type": "currency"}}}'
# PASS if: returns {value: number, currency: "USD", raw: "$..."} or similar structured price
```

### B9: Shadow DOM Pierce (Level 8)
```bash
curl -s -X POST localhost:3500/v1/dev/{reddit}/extract \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"posts": "shreddit-post >>> h2"}, "pierce": true}'
# PASS if: returns post titles from shadow DOM (even partial)
```

### B10: Multi-Page Extract (Level 5)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"titles": ".titleline a"}, "paginate": true, "maxPages": 2}'
# PASS if: returns more titles than single page (>30), or pagination metadata
```

### B11: Template Learn (Level 10)
```bash
# First learn
curl -s -X POST localhost:3500/v1/dev/{hn}/extract/learn \
  -H 'Content-Type: application/json' -d '{}'
# Then list templates
curl -s localhost:3500/v1/templates
# PASS if: template saved for HN domain, listed in templates
```

### B12: Template Apply
```bash
# Navigate to HN new page, apply learned template
curl -s -X POST localhost:3500/v1/dev/{hn}/extract \
  -H 'Content-Type: application/json' \
  -d '{"template": "news.ycombinator.com"}'
# PASS if: extraction works using saved template selectors
```

## BATTERY C: Combo Workflows (8 tests)

### C1: Fill + Wait + Assert (Form Workflow)
1. fill: Wikipedia search field with "machine learning"
2. wait: for results page to load (selector: ".mw-search-results" or "h1")
3. assert: verify page title contains search term
PASS if all 3 steps succeed

### C2: Dialog + Extract + Table (Data Workflow)
1. dialog: dismiss any Amazon popups
2. extract: zero-config from Amazon
3. table: extract any tables on the page
PASS if dialog doesn't crash AND extract returns data

### C3: Paginate + Multi-Page Extract (Scraping Workflow)
1. paginate: detect on HN
2. extract: with paginate:true, maxPages:2
PASS if detect finds pagination AND multi-page returns >30 items

### C4: Navigate + Wait + Semantic Extract (Research Workflow)
1. navigate: Wikipedia to "https://en.wikipedia.org/wiki/Large_language_model"
2. wait: visible, selector "h1"
3. extract: semantic — "the key applications listed in this article"
PASS if all 3 succeed and extract returns meaningful content

### C5: Hover + Network + Extract (Interactive Workflow)
1. network: start capture on HN
2. hover: over first story link
3. network: stop, list captured requests
4. extract: the hovered story title
PASS if network captures requests AND extract works

### C6: Fill + Select + Assert (Form Interaction)
1. fill: a form field on any page
2. select: a dropdown if found
3. assert: field has value
PASS if fill works and assert verifies

### C7: Discover + Zero-Config + Template Learn (Intelligence Workflow)
1. discover: analyze HN page
2. extract: zero-config (empty body)
3. extract/learn: save template
4. templates: verify saved
PASS if all 4 steps return data

### C8: Storage + Capture + Annotate (Debug Workflow)
1. storage: list localStorage for HN
2. capture: DOM snapshot
3. annotate: highlight the title elements
PASS if all return data without crashing

## BATTERY D: R5 Regression (5 tests — verify old bugs are fixed)

### D1: Pipeline Extract Unwrapping (was P0)
```bash
curl -s -X POST localhost:3500/v1/pipelines/run \
  -H 'Content-Type: application/json' \
  -d '{"steps": [{"device": "{hn}", "op": "extract", "schema": {"titles": ".titleline a"}}, {"op": "transform", "template": "Found {{titles.length}} titles"}]}'
# PASS if: transform interpolates correctly (not "undefined" or empty)
```

### D2: Discover in Extension (was P1)
```bash
curl -s -X POST localhost:3500/v1/dev/{hn}/discover \
  -H 'Content-Type: application/json' -d '{}'
# PASS if: returns page type and actions (not "Unknown command type")
```

### D3: Function Registry with PingApp Actions (was P2)
```bash
curl -s localhost:3500/v1/functions | jq '.functions | length'
# PASS if: returns functions including PingApp-defined actions (not just generic ops)
```

### D4: Record + Replay (was P1 crash)
```bash
curl -s -X POST localhost:3500/v1/record/start -d '{}'
curl -s -X POST localhost:3500/v1/dev/{hn}/act -H 'Content-Type: application/json' -d '{"instruction": "click the first story link"}'
curl -s -X POST localhost:3500/v1/record/stop -d '{}'
curl -s -X POST localhost:3500/v1/record/replay -d '{}'
# PASS if: no crash on replay (even if replay is partial)
```

### D5: MCP Server (regression check)
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5 node packages/mcp-server/dist/index.js 2>/dev/null
# PASS if: returns tool list
```

## Scoring
- Battery A: 15 tests (new ops)
- Battery B: 12 tests (smart extract)
- Battery C: 8 tests (combo workflows, ~25 steps)
- Battery D: 5 tests (regression)
- **TOTAL: 40 tests**

## Output
Write results incrementally to `/tmp/pingos-battletest-r6.md` every 5 tests.
At end, write final scorecard with pass/fail/skip per test.
