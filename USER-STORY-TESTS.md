# PingOS User Story Test Suite — Real-World Workflows

## Setup
1. Build: `pnpm build`
2. Start gateway: `cd packages/std && node dist/main.js &`
3. Launch Chromium with extension + 5 tabs (HN, Amazon, Wikipedia, Reddit, GitHub)
4. Get device IDs from `GET localhost:3500/v1/devices`

---

## STORY 1: "I want to monitor product prices and get alerts"
**Persona:** Bargain hunter tracking deals across sites

### Test 1.1: Extract product info from Amazon (zero-config)
POST /v1/dev/{amzn}/extract with empty body {}
EXPECT: returns product titles, prices, ratings automatically

### Test 1.2: Extract with type-aware currency parsing
POST /v1/dev/{amzn}/extract with schema {"price": {"selector": ".a-price .a-offscreen", "type": "currency"}}
EXPECT: structured {value: number, currency: "USD", raw: "$X.XX"}

### Test 1.3: Watch for price changes
POST /v1/dev/{amzn}/watch with {"selector": ".a-price", "interval": 3000}
Then act: change something on page or wait
GET /v1/watches to verify watch is active
EXPECT: watch registered, SSE stream available

### Test 1.4: Pipeline — extract price then transform
POST /v1/pipelines/run with steps: extract price from Amazon → transform "Price is {{price}}"
EXPECT: transform interpolates the actual price value

### Test 1.5: Learn template from Amazon product
POST /v1/dev/{amzn}/extract/learn
GET /v1/templates
EXPECT: amazon template saved with domain, selectors, schema

### Test 1.6: COMBO — Dialog dismiss + Zero-config + Type-aware + Pipeline
1. dialog dismiss (clear popups)
2. extract zero-config
3. extract with currency type
4. pipeline: extract → transform summary
EXPECT: clean flow end-to-end, meaningful output at each step

---

## STORY 2: "I want to research a topic across multiple sources"
**Persona:** Researcher gathering info from Wikipedia, HN, Reddit

### Test 2.1: Semantic extract from Wikipedia
POST /v1/dev/{wiki}/extract with {"query": "summarize the main concepts in the first section"}
EXPECT: meaningful paragraph text from article intro

### Test 2.2: JSON-LD structured data from Wikipedia
POST /v1/dev/{wiki}/extract with {"strategy": "structured"}
EXPECT: title, description, datePublished, mainEntity from JSON-LD

### Test 2.3: Extract + navigate to related article
POST /v1/dev/{wiki}/extract schema for links → navigate to first link
EXPECT: navigate succeeds, new page loads

### Test 2.4: Cross-tab research pipeline
POST /v1/pipelines/run with steps:
  step1: extract headline from HN
  step2: extract intro from Wikipedia
  step3: transform "HN says: {{step1.titles[0]}}. Wiki says: {{step2.summary}}"
EXPECT: data flows between tabs, transform combines them

### Test 2.5: Table extraction from Wikipedia
POST /v1/dev/{wiki}/table
EXPECT: infobox or data table with headers and rows, structured properly

### Test 2.6: COMBO — Discover + Semantic + Table + Capture
1. discover (analyze page type)
2. semantic extract ("key dates and events")
3. table extract (get data tables)
4. capture DOM snapshot
EXPECT: full intelligence gathering from one page

---

## STORY 3: "I want to fill out forms and automate signups"
**Persona:** User automating repetitive form filling

### Test 3.1: Fill Wikipedia search form
POST /v1/dev/{wiki}/fill with {"fields": {"search": "quantum computing"}}
EXPECT: search field filled, returns success with selector used

### Test 3.2: Fill + Wait for results
1. fill search field
2. act: press Enter
3. wait for visible ".mw-search-results" or new h1
EXPECT: form submitted, results page loaded

### Test 3.3: Fill + Assert verification
1. fill a field
2. assert field has the value we set
EXPECT: assertion passes confirming fill worked

### Test 3.4: Fill multiple fields at once
POST /v1/dev/{wiki}/fill with {"fields": {"search": "test query"}}
Then on a page with multiple inputs, fill all at once
EXPECT: multiple fields filled in one call

### Test 3.5: Select dropdown (if available)
Navigate to a page with dropdowns, use select to pick option
EXPECT: option selected, verification via assert

### Test 3.6: COMBO — Navigate + Fill + Wait + Assert + Extract
1. navigate to Wikipedia search page
2. fill search field with "neural networks"
3. wait for page load
4. assert h1 exists
5. extract article intro
EXPECT: full form automation flow end-to-end

---

## STORY 4: "I want to scrape paginated data at scale"
**Persona:** Data analyst collecting listings from multi-page results

### Test 4.1: Detect pagination on HN
POST /v1/dev/{hn}/paginate with {"action": "detect"}
EXPECT: hasNext: true, paginationType identified, "More" link found

### Test 4.2: Navigate to next page
POST /v1/dev/{hn}/paginate with {"action": "next"}
EXPECT: page navigates, new content loads

### Test 4.3: Multi-page extract (2 pages)
POST /v1/dev/{hn}/extract with {"schema": {"titles": ".titleline a"}, "paginate": true, "maxPages": 2}
EXPECT: >30 titles (more than one page worth)

### Test 4.4: Nested extract across items
POST /v1/dev/{hn}/extract with nested schema: stories[] → title + rank + link + score
EXPECT: array of structured story objects with all fields

### Test 4.5: Paginate + Nested + Type-aware combined
Extract stories with type: number for scores, paginate across 2 pages
EXPECT: scores as actual numbers, >30 items, clean nested structure

### Test 4.6: COMBO — Discover + Paginate detect + Multi-page nested extract + Template learn
1. discover (identify page as news/listing)
2. paginate detect
3. multi-page nested extract with types
4. learn template for this site
5. verify template saved
EXPECT: full scraping pipeline from discovery to saved template

---

## STORY 5: "I want to test and verify web page states"
**Persona:** QA engineer running assertions and capturing evidence

### Test 5.1: Assert element exists
POST /v1/dev/{hn}/assert with {"assertions": [{"type": "exists", "selector": ".titleline"}]}
EXPECT: passed: true

### Test 5.2: Assert text contains
POST /v1/dev/{wiki}/assert with {"assertions": [{"type": "textContains", "selector": "h1", "expected": "intelligence"}]}
EXPECT: passed: true with actual text shown

### Test 5.3: Assert multiple conditions at once
POST /v1/dev/{hn}/assert with 5 assertions: exists, visible, textContains, count > 0, attribute check
EXPECT: results array with pass/fail for each

### Test 5.4: Capture DOM snapshot for evidence
POST /v1/dev/{wiki}/capture with {"format": "dom"}
EXPECT: full HTML returned, >10KB

### Test 5.5: Annotate elements visually
POST /v1/dev/{hn}/annotate with multiple annotations: highlight titles, box around scores, arrow to "More" link
EXPECT: annotated: true, multiple elements marked

### Test 5.6: COMBO — Assert + Capture + Annotate + Storage check
1. assert page is in expected state (h1 exists, specific text present)
2. capture DOM snapshot
3. annotate key elements
4. storage list (check what site stores locally)
EXPECT: full QA evidence gathering workflow

---

## STORY 6: "I want to interact with pages intelligently"
**Persona:** Power user doing complex page interactions

### Test 6.1: Hover to reveal hidden content
POST /v1/dev/{hn}/hover with {"selector": ".titleline a"}
EXPECT: hovered: true, duration reported

### Test 6.2: Navigate to specific URL
POST /v1/dev/{wiki}/navigate with {"to": "https://en.wikipedia.org/wiki/Machine_learning"}
EXPECT: navigated: true, page loads successfully

### Test 6.3: Wait for DOM stability after action
1. act: click a link
2. wait: condition "domStable"
EXPECT: wait completes when page settles

### Test 6.4: Network capture during interactions
1. network start
2. act: click something
3. wait: networkIdle
4. network stop + list
EXPECT: captured requests with URLs, methods, statuses

### Test 6.5: Dialog detect + dismiss flow
POST /v1/dev/{amzn}/dialog detect → if found, dismiss
EXPECT: detects and handles any popups/modals

### Test 6.6: COMBO — Navigate + Wait + Hover + Network + Extract + Assert
1. navigate to new page
2. wait for visible h1
3. hover over interactive element
4. network capture during hover
5. extract page content
6. assert extracted data is non-empty
EXPECT: complex interaction chain works end-to-end

---

## STORY 7: "I want to record my actions and replay them"
**Persona:** Automation builder creating reusable workflows

### Test 7.1: Start recording
POST /v1/record/start with device ID
EXPECT: recording started confirmation

### Test 7.2: Record actions during recording
While recording: act click, act type, navigate
POST /v1/record/stop
EXPECT: recorded steps captured

### Test 7.3: Export recorded session
POST /v1/record/export
EXPECT: JSON with recorded steps, timestamps, selectors

### Test 7.4: Replay recorded session
POST /v1/record/replay
EXPECT: no crash, steps replayed (even if partial)

### Test 7.5: Generate PingApp from recording
POST /v1/recordings/generate
EXPECT: PingApp JSON/code generated from recorded actions

### Test 7.6: COMBO — Record + Multi-step workflow + Stop + Export + Replay
1. start recording
2. fill form + navigate + extract
3. stop recording
4. export (verify steps)
5. replay
EXPECT: full record-replay lifecycle

---

## STORY 8: "I want AI to understand and query web pages"
**Persona:** Developer using LLM integration

### Test 8.1: Discover page type
POST /v1/dev/{hn}/discover
EXPECT: page type identified, available actions listed, elements found

### Test 8.2: LLM query about page content
POST /v1/dev/{wiki}/query with {"question": "What is artificial intelligence?"}
EXPECT: LLM-generated answer based on page content

### Test 8.3: Semantic extract with natural language
POST /v1/dev/{hn}/extract with {"query": "the top 3 stories with the most points"}
EXPECT: structured data matching the query intent

### Test 8.4: Act with natural language instruction
POST /v1/dev/{wiki}/act with {"instruction": "click the link to Machine Learning"}
EXPECT: correct link identified and clicked

### Test 8.5: Zero-config + Discover combo
1. discover page
2. extract with empty body
EXPECT: discover informs what to extract, zero-config returns it

### Test 8.6: COMBO — Discover + Semantic extract + Query + Act + Wait + Assert
1. discover page type
2. semantic extract key info
3. query: ask a question about the page
4. act: click to navigate somewhere
5. wait: for new page
6. assert: verify new page loaded
EXPECT: full AI-driven browsing session

---

## STORY 9: "I want to use PingOS as an MCP server for my AI tools"
**Persona:** AI developer integrating PingOS with Claude/ChatGPT

### Test 9.1: MCP handshake
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}' | node packages/mcp-server/dist/index.js
EXPECT: valid JSON-RPC response with server capabilities

### Test 9.2: List MCP tools
EXPECT: 15+ tools listed (devices, extract, act, observe, screenshot, etc.)

### Test 9.3: Call MCP extract tool
Send tools/call with pingos_extract, target a tab
EXPECT: extracted data returned via JSON-RPC

### Test 9.4: Call MCP act tool
Send tools/call with pingos_act, instruction to click something
EXPECT: action performed, result returned

### Test 9.5: Call MCP screenshot tool
EXPECT: base64 screenshot returned

### Test 9.6: COMBO — MCP devices → extract → act → screenshot
Full MCP workflow: list tabs → extract from one → click something → screenshot result
EXPECT: complete MCP-driven automation chain

---

## STORY 10: "I want to use the function registry to call tab actions"
**Persona:** Developer building on top of PingOS API

### Test 10.1: List all functions
GET /v1/functions
EXPECT: functions from all registered tabs + PingApp actions

### Test 10.2: Call a generic function
POST /v1/functions/{tab}/call with extract action
EXPECT: function executed, data returned

### Test 10.3: Recon a page via function
POST /v1/functions/{tab}/call with recon action
EXPECT: page analysis returned

### Test 10.4: Check devices endpoint
GET /v1/devices
EXPECT: all tabs listed with IDs, URLs, titles

### Test 10.5: Call PingApp-defined function
GET /v1/apps, then call an app-specific function
EXPECT: PingApp action executed

### Test 10.6: COMBO — Functions + Devices + Apps + Extract + Act
1. list devices
2. list functions
3. list apps
4. call extract function
5. call act function
6. verify results
EXPECT: full API surface works together

---

## Scoring Rules
- Each test is PASS, PARTIAL, FAIL, or SKIP
- SKIP = site limitation (login wall, no element available) — doesn't count against score
- PARTIAL = endpoint works but output quality is incomplete
- For combos: ALL steps must pass for PASS, >50% for PARTIAL, <50% for FAIL
- **Target: >90% effective pass rate**

## Output
Write results INCREMENTALLY to /tmp/pingos-userstory-tests.md every story (every ~6 tests).
Include actual response snippets for interesting results.
Final scorecard at the end.

## After Testing
If pass rate < 90%: identify bugs, fix them, rebuild, retest failed stories only.
If pass rate >= 90%: commit fixes and write final report.
Fix-test loop until >90%.
