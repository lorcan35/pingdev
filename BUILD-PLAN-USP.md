# PingOS USP Features — Build Plan (Easiest → Most Complex)

## Order: 1→5 (build sequentially, each builds on the last)

---

### Feature 1: Zero-Shot Site Adaptation (EASIEST)
**What:** Land on ANY unknown website, auto-generate extraction schemas in <100ms using pure heuristics. No LLM call needed.

**Implementation:**

**1a. Content script: `handleDiscover()` in `content.ts`**
Add a new `case 'discover'` handler that:
- Scans DOM for common page patterns using heuristics:
  - **Product page:** Look for price patterns (`$`, `€`, `£` + numbers), product titles (h1, [itemprop="name"]), images (main product img), ratings (stars, review count)
  - **Search/listing page:** Look for repeated sibling elements with similar structure (cards, rows, items), pagination
  - **Article/blog:** Look for article tags, byline, date, reading time, content body
  - **Feed/social:** Look for repeated posts with author, timestamp, engagement counts
  - **Table/data:** Look for `<table>`, `<thead>`, structured grid data
  - **Form page:** Look for form elements, inputs, submit buttons
- Use Open Graph / Schema.org / JSON-LD metadata if available
- Use aria-labels and semantic HTML5 elements
- Return: `{ "pageType": "product", "confidence": 0.92, "schemas": [{ "name": "product", "fields": { "title": "h1.product-title", "price": ".price-value", ... }}]}`
- Speed target: <100ms, zero network calls

**1b. Gateway endpoint: `GET /v1/dev/:device/discover`**
In `gateway.ts`, add route that calls `callDevice(device, { op: 'discover' })` and returns the schemas.

**1c. Python SDK:** Add `tab.discover()` method to `browser.py`
**1d. CLI:** Add `pingdev discover <tab>` command
**1e. Tests:** Test against known pages (Amazon, HN, Reddit, Wikipedia, etc.)

---

### Feature 2: Tab-as-a-Function (EASY-MEDIUM)
**What:** Each browser tab becomes a callable function. Clean, typed interface.

**Implementation:**

**2a. Gateway: `/v1/functions` namespace**
New routes in `gateway.ts`:
```
GET  /v1/functions                    → list all callable tab-functions
GET  /v1/functions/:app               → describe a function (params, returns)
POST /v1/functions/:app/call          → call a function
POST /v1/functions/:app/batch         → call multiple functions in sequence
```

**2b. Function Registry** — new file `packages/std/src/function-registry.ts`
- Auto-registers PingApps as callable functions
- Each PingApp endpoint becomes a named function: `gmail.send_email`, `amazon.search`, `sheets.update_cell`
- Generic tabs get generic functions: `tab.extract`, `tab.click`, `tab.type`, `tab.read`
- Function signature includes: name, description, params schema, return schema
- Functions are typed: input validation, output formatting

**2c. Python SDK:** `pingos.call("gmail", "send_email", {to: "x", body: "y"})` syntax
Add `Browser.call()` and `Browser.functions()` methods

**2d. CLI:** `pingdev call gmail.send_email --to=x --body=y`
**2e. Tests:** Call PingApp functions, verify results

---

### Feature 3: Real-Time Page Subscriptions via SSE (MEDIUM)
**What:** Subscribe to page elements, get push updates when they change.

**Implementation:**

**3a. Content script: `handleWatch()` and `handleUnwatch()` in `content.ts`**
- `watch` command: Takes `{ selector, interval?, fields? }`
- Uses `MutationObserver` on the target element(s) for instant detection
- Falls back to polling at configurable interval (default 5000ms)
- Each watch gets a `watchId` for management
- Detects changes by comparing current vs previous extraction
- Sends change events back via the extension bridge
- `unwatch` command: Stops a specific watch by ID

**3b. Background script updates in `background.ts`**
- Maintain active watches per tab
- Forward change events from content script to gateway via WebSocket
- Handle tab close → auto-cleanup watches

**3c. Gateway: SSE endpoint `GET /v1/dev/:device/watch`**
In `gateway.ts`:
```
POST /v1/dev/:device/watch    → start watching, returns { watchId, stream: "/v1/watches/:watchId/events" }
GET  /v1/watches/:watchId/events → SSE stream of changes
DELETE /v1/watches/:watchId   → stop watching
GET  /v1/watches              → list all active watches
```
SSE format:
```
data: {"watchId": "w1", "timestamp": 1234, "changes": [{"field": "price", "old": "$39.99", "new": "$29.99"}], "snapshot": {...}}
```

**3d. Python SDK:** `watch = tab.watch(".price", interval=5000)` → async iterator
**3e. CLI:** `pingdev watch <tab> --selector ".price" --interval 5000`
**3f. Tests:** Watch a page, trigger change via act, verify SSE event received

---

### Feature 4: Cross-Tab Data Pipes (COMPLEX)
**What:** Unix pipe-style data flow between tabs. Declarative multi-tab workflows.

**Implementation:**

**4a. Pipeline Engine** — new file `packages/std/src/pipeline-engine.ts`
Pipeline definition format:
```json
{
  "name": "price-compare",
  "steps": [
    { "id": "s1", "tab": "amazon", "op": "extract", "schema": {"price": ".price"}, "output": "amazon_price" },
    { "id": "s2", "tab": "ebay", "op": "extract", "schema": {"price": ".price"}, "output": "ebay_price" },
    { "id": "s3", "op": "transform", "input": ["amazon_price", "ebay_price"], "template": "Amazon: {{amazon_price.price}}, eBay: {{ebay_price.price}}" },
    { "id": "s4", "tab": "slack", "op": "type", "selector": "#msg", "text": "{{s3.result}}" }
  ],
  "parallel": ["s1", "s2"]
}
```

Features:
- Steps can run in parallel when no dependencies
- Variable interpolation between steps: `{{step_id.field}}`
- Transform steps (no tab needed) — string templates, conditionals, maps
- Error handling per step with `onError: "skip" | "abort" | "retry"`
- Pipe operator shorthand: `extract:amazon:.price | transform:"Deal: {{value}}" | type:slack:#msg`

**4b. Gateway routes:**
```
POST /v1/pipelines/run       → execute a pipeline definition
POST /v1/pipelines/validate  → validate a pipeline definition
GET  /v1/pipelines            → list saved pipelines
POST /v1/pipelines/save      → save a named pipeline
```

**4c. Python SDK:**
```python
pipeline = pingos.Pipeline()
pipeline.extract("amazon", {"price": ".price"}, output="price")
pipeline.transform("Deal alert: {price}", output="msg")
pipeline.type("slack", "#channel", "{msg}")
result = pipeline.run()
```

**4d. CLI:** `pingdev pipe 'extract:amazon:.price | type:slack:#deals'`
**4e. Tests:** Multi-step pipeline across 2+ tabs, verify data flows correctly

---

### Feature 5: Record → Replay → PingApp (MOST COMPLEX)
**What:** Record manual browser actions, generate replayable workflow + PingApp.

**Implementation:**

**5a. Content script: Recording engine in `content.ts`**
New handlers: `handleStartRecording()`, `handleStopRecording()`
- When recording starts, attach event listeners for:
  - `click` — capture target element (generate robust selector), coordinates
  - `input`/`change` — capture typed text, selected values
  - `submit` — capture form submissions
  - `keydown` — capture keyboard shortcuts (Enter, Tab, Escape, etc.)
  - URL changes (navigation)
  - Scroll events (debounced)
- For each captured event, generate multiple selector strategies:
  - CSS selector (id, class, attributes)
  - Aria label
  - Text content
  - XPath
  - Nth-child positional
- Store as ordered action sequence with timestamps

**5b. Background script: Recording coordinator in `background.ts`**
- Track recording state per tab
- Handle cross-tab recordings (record across multiple tabs)
- Forward recorded actions to gateway in real-time

**5c. Replay Engine** — new file `packages/std/src/replay-engine.ts`
- Takes recorded action sequence, replays it via callDevice
- Selector resilience: try primary selector, fall back to alternatives
- Variable extraction: detect repeated patterns, parameterize them
- Timing: replay with configurable speed (instant, real-time, custom delays)

**5d. PingApp Generator** — new file `packages/std/src/pingapp-generator.ts`
- Takes a recording and generates:
  - `manifest.json` with site metadata
  - `workflows/*.json` with the recorded workflow
  - `selectors.json` with all captured selectors
  - `tests/test_*.py` with basic replay test
- Uses LLM (optional) to name fields, generate descriptions, improve selectors

**5e. Gateway routes:**
```
POST   /v1/recordings/start       → start recording on a tab (or all tabs)
POST   /v1/recordings/stop        → stop recording, return recorded actions
POST   /v1/recordings/replay      → replay a recording
POST   /v1/recordings/generate    → generate PingApp from recording
GET    /v1/recordings             → list saved recordings
DELETE /v1/recordings/:id         → delete a recording
```

**5f. Python SDK:**
```python
recording = tab.start_recording()
# ... user does manual actions ...
actions = tab.stop_recording()
app = recording.generate_pingapp("my-site")
recording.replay(speed=2.0)
```

**5g. CLI:**
```
pingdev record start [tab]
pingdev record stop
pingdev record replay <id>
pingdev record generate <id> --name my-app
```

**5h. Tests:** Record a simple flow (navigate, click, type, extract), replay it, verify same results

---

## KEY FILES REFERENCE
- `packages/chrome-extension/src/content.ts` — add handlers for discover, watch, unwatch, startRecording, stopRecording
- `packages/chrome-extension/src/background.ts` — recording state, watch forwarding
- `packages/std/src/gateway.ts` — all new REST endpoints
- `packages/std/src/function-registry.ts` — NEW: tab-as-a-function
- `packages/std/src/pipeline-engine.ts` — NEW: cross-tab pipes
- `packages/std/src/replay-engine.ts` — NEW: record/replay
- `packages/std/src/pingapp-generator.ts` — NEW: auto PingApp generation
- `packages/python-sdk/pingos/browser.py` — Tab methods for all features
- `packages/cli/src/index.ts` — CLI commands for all features
- `packages/std/src/types.ts` — type definitions

## BUILD ORDER (STRICT)
1. Zero-Shot → 2. Tab-as-a-Function → 3. Real-Time Watch → 4. Cross-Tab Pipes → 5. Record/Replay

Each feature must compile and have tests before starting the next.

## IMPORTANT — Long-horizon rules:
- Write code incrementally. Commit or save after each feature.
- If you hit an error or feel context growing large, IMMEDIATELY write what you have to disk.
- Stay lean: use head/grep/targeted reads, don't cat entire large files.
- Test each feature against the running gateway (localhost:3500) if possible.
- Run `pnpm build` after each feature to verify compilation.
