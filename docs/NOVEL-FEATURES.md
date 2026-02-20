# Novel Features

PingOS v0.2 introduces six capabilities that go beyond basic browser automation. Each feature is accessible via the REST API, the `pingdev` CLI, and the Python SDK.

---

## Natural Language Query

Ask a question about a live page in plain English. PingOS sends the page DOM to an LLM, which generates a CSS selector targeting the answer. The element is read and returned.

Results are cached by a hash of the question string. Repeat queries skip the LLM entirely and resolve from the in-memory cache.

**Endpoint**

```
POST /v1/dev/:device/query
```

**Request body**

```json
{
  "question": "What is the current price?"
}
```

**How it works**

1. The gateway retrieves a cleaned DOM excerpt from the device (scripts, styles, SVGs stripped; capped at 15,000 characters).
2. The DOM and question are sent to an LLM with the prompt: *"Given a web page DOM and a user question, provide the best CSS selector to extract the answer."*
3. The LLM returns `{"selector": "...", "reasoning": "..."}`.
4. The gateway reads the element using that selector via the extension bridge.
5. The question hash and selector are stored in a `Map` so the next identical question resolves instantly.

**Response**

```json
{
  "answer": "$29.99",
  "selector": "span.a-price .a-offscreen",
  "cached": false,
  "model": "openai"
}
```

On a cached hit, `cached` is `true` and no LLM call is made.

**CLI**

```bash
pingdev query <device> "What is the product title?"
```

**Python**

```python
from pingos import Browser

browser = Browser()
tab = browser.tab("device-abc123")
result = tab.query("What is the product title?")
print(result["answer"])
```

**curl example**

```bash
curl -X POST http://localhost:3500/v1/dev/tab-1/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the current price?"}'
```

---

## Live Data Streams (Watch)

Subscribe to real-time changes on page elements. The gateway polls the device at a configurable interval and pushes updates over Server-Sent Events (SSE). Only changed data is emitted -- if nothing changed since the last poll, no event is sent.

**Endpoint**

```
POST /v1/dev/:device/watch
```

**Request body**

```json
{
  "schema": {
    "price": ".price-tag",
    "title": "h1"
  },
  "interval": 5000
}
```

- `schema` -- a mapping of field names to CSS selectors.
- `interval` -- polling interval in milliseconds (minimum 1000, default 5000).

**Response**

The response is an SSE stream (`Content-Type: text/event-stream`). Each event is a JSON line:

```
data: {"price": "$29.99", "title": "Wireless Headphones", "timestamp": 1708444800000}
```

Subsequent events are only emitted when the extracted data differs from the previous snapshot.

There is also a managed watch system with explicit lifecycle control:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/dev/:device/watch/start` | Start a watch, returns `watchId` and SSE stream URL |
| GET | `/v1/watches/:watchId/events` | Connect to the SSE event stream |
| DELETE | `/v1/watches/:watchId` | Stop a watch |
| GET | `/v1/watches` | List all active watches |

The managed `WatchManager` uses `MutationObserver`-based detection in the content script with polling fallback, computes field-level diffs, and auto-stops watches when the last SSE listener disconnects.

**CLI**

```bash
pingdev watch <device> --schema '{"price": ".price-tag"}' --interval 5000
```

The CLI reads the SSE stream and prints each data event to stdout. Press Ctrl+C to stop.

**Python**

```python
tab = browser.tab("device-abc123")
for event in tab.watch(".stock-price", fields={"price": ".value", "change": ".delta"}):
    print(event["changes"])
```

The Python SDK calls `/v1/dev/:device/watch/start`, then opens the returned SSE stream URL and yields parsed events. Call `tab.unwatch(watch_id)` to stop.

**Use cases**

- Price monitoring on e-commerce sites
- Stock ticker feeds
- Dashboard metric tracking
- Live sports score updates

---

## Differential Extraction (Diff)

Extract structured data from a page and compare it to the previous extraction. The first call captures a baseline snapshot. Subsequent calls return a list of field-level changes.

**Endpoint**

```
POST /v1/dev/:device/diff
```

**Request body**

```json
{
  "schema": {
    "price": ".price-tag",
    "stock": ".stock-status"
  }
}
```

**How it works**

1. The gateway extracts data from the device using the provided schema (field name to CSS selector).
2. A storage key is computed from the device ID and a hash of the schema.
3. If no previous snapshot exists for that key, the current snapshot becomes the baseline.
4. On subsequent calls, each field is compared to the previous snapshot. Changed fields are returned in the `changes` array.
5. The current snapshot replaces the previous one in storage.

**Response (first call)**

```json
{
  "changes": [],
  "unchanged": ["price", "stock"],
  "snapshot": {
    "price": "$29.99",
    "stock": "In Stock"
  },
  "previousSnapshot": null,
  "isFirstExtraction": true
}
```

**Response (subsequent call with changes)**

```json
{
  "changes": [
    {
      "field": "price",
      "old": "$29.99",
      "new": "$24.99"
    }
  ],
  "unchanged": ["stock"],
  "snapshot": {
    "price": "$24.99",
    "stock": "In Stock"
  },
  "previousSnapshot": {
    "price": "$29.99",
    "stock": "In Stock"
  },
  "isFirstExtraction": false
}
```

**CLI**

```bash
pingdev diff <device> --schema '{"price": ".price-tag"}'
```

Run it twice to see changes:

```
$ pingdev diff tab-1 --schema '{"price": ".price-tag"}'
[diff] First extraction -- baseline captured.
Snapshot: { "price": "$29.99" }

$ pingdev diff tab-1 --schema '{"price": ".price-tag"}'
[diff] 1 change(s) detected:
  price: "$29.99" -> "$24.99"
```

**Python**

```python
tab = browser.tab("device-abc123")

# First call captures baseline
result = tab.diff({"price": ".price-tag", "stock": ".stock-status"})
print(result["isFirstExtraction"])  # True

# Later call returns changes
result = tab.diff({"price": ".price-tag", "stock": ".stock-status"})
for change in result["changes"]:
    print(f'{change["field"]}: {change["old"]} -> {change["new"]}')
```

**Use cases**

- Change monitoring (detect when a price drops)
- A/B test detection (compare page variants)
- Content update tracking (detect new articles or edits)

---

## Schema Auto-Discovery (Discover)

Automatically classify a page and generate extraction schemas without any LLM calls. The discover engine uses pure heuristic pattern matching that runs in under 100ms.

**Endpoint**

```
GET /v1/dev/:device/discover
```

No request body required.

**How it works**

The engine runs seven classifiers in parallel against a DOM snapshot returned by the extension's content script. Each classifier scores the page based on:

| Page Type | Signals |
|-----------|---------|
| `product` | JSON-LD `@type: Product`, price patterns (`$`, `EUR`, etc.), `og:type`, `itemprop="name"`, rating elements, product images |
| `search` | URL query parameters (`q=`, `search=`), repeated element groups (3+ items), search input fields, pagination controls |
| `article` | JSON-LD `Article`/`NewsArticle`/`BlogPosting`, `og:type: article`, `<article>` tags, author/byline elements, published dates |
| `feed` | 5+ repeated element groups, social URL patterns (`/feed`, `/timeline`), known social site names, "load more" buttons |
| `table` | `<table>` elements with 2+ rows and headers |
| `form` | `<form>` elements with input fields |
| `chat` | Textarea/contenteditable inputs, send buttons, message-like repeated groups, chat-related URL patterns |

The classifier with the highest confidence score wins. Schemas are generated with CSS selectors for each detected field.

**Response**

```json
{
  "ok": true,
  "result": {
    "pageType": "product",
    "confidence": 0.85,
    "title": "Wireless Headphones",
    "url": "https://www.amazon.com/dp/B09XXXYYY",
    "schemas": [
      {
        "name": "product",
        "fields": {
          "title": { "selector": "h1.product-title" },
          "price": { "selector": "span.price-value" },
          "rating": { "selector": "span.rating" },
          "image": { "selector": "#main-product-img", "attribute": "src" }
        }
      }
    ],
    "metadata": {
      "og:type": "product",
      "og:title": "Wireless Headphones"
    }
  }
}
```

**CLI**

```bash
pingdev discover <device>
```

Human-readable output:

```
Page type: product (confidence: 0.85)
Title: Wireless Headphones

Schema: product
  title: h1.product-title
  price: span.price-value
  rating: span.rating
  image: #main-product-img
```

For raw JSON, add the `--json` flag:

```bash
pingdev discover <device> --json
```

**Python**

```python
tab = browser.tab("device-abc123")
result = tab.discover()
print(result["pageType"])    # "product"
print(result["confidence"])  # 0.85
print(result["schemas"])     # [{name: "product", fields: {...}}]
```

---

## PingApp Generator

Generate a complete PingApp definition from a URL and description. The generator uses an LLM to produce selectors, actions, and schemas. If the target site is already open in a connected browser tab, the live DOM is included for higher accuracy.

**Endpoint**

```
POST /v1/apps/generate
```

**Request body**

```json
{
  "url": "https://example.com",
  "description": "E-commerce product page"
}
```

**How it works**

1. The gateway checks if any connected browser tab matches the target URL's hostname.
2. If a match is found, a cleaned DOM excerpt (up to 10,000 characters) is included in the LLM prompt.
3. If no live tab is available, the LLM generates based on common patterns for the described site type.
4. The LLM returns a PingApp definition with selectors (tiered primary + fallback), actions (input/submit/output mappings), and extraction schemas.

**Response**

```json
{
  "app": {
    "name": "example-shop",
    "url": "https://example.com",
    "description": "E-commerce product page with search and cart",
    "selectors": {
      "searchInput": {
        "tiers": ["input#search-bar", "input[name='q']"]
      },
      "addToCart": {
        "tiers": ["button#add-to-cart", "button.add-cart-btn"]
      }
    },
    "actions": [
      {
        "name": "search",
        "description": "Search for products",
        "inputSelector": "input#search-bar",
        "submitTrigger": "button.search-submit",
        "outputSelector": "div.search-results"
      }
    ],
    "schemas": [
      {
        "name": "product",
        "fields": {
          "title": "h1.product-title",
          "price": "span.price",
          "description": "div.product-desc"
        }
      }
    ]
  },
  "model": "openai"
}
```

**Use case**

Instant PingApp scaffolding for new websites. Feed the output into the PingApp runtime or use it as a starting point for manual refinement.

**curl example**

```bash
curl -X POST http://localhost:3500/v1/apps/generate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com", "description": "Tech news aggregator with upvoting and comments"}'
```

---

## Cross-Tab Pipelines

Chain operations across multiple browser tabs with variable interpolation. Extract from one tab, transform the data, and push it to another — all in a single API call.

**Endpoint**

```
POST /v1/pipelines/run
```

**Request body**

```json
{
  "name": "price-compare",
  "steps": [
    {"id": "amazon", "op": "extract", "tab": "chrome-111", "schema": {"price": ".a-price .a-offscreen"}},
    {"id": "ali", "op": "extract", "tab": "chrome-222", "schema": {"price": ".product-price-value"}},
    {"id": "report", "op": "transform", "template": "Amazon: {{amazon.price}} | AliExpress: {{ali.price}}"}
  ]
}
```

**How it works**

1. Steps execute sequentially (or in parallel via the `parallel` field).
2. Each step's result is stored in a variables map keyed by `step.id`.
3. Subsequent steps can reference earlier results using `{{stepId.field}}` interpolation in `template`, `selector`, `value`, or `expression` fields.
4. Extract results are automatically unwrapped from `{data: {result: {...}}}` to the inner result.
5. The `transform` op is a pure template operation — no device call needed.

**Response**

```json
{
  "ok": true,
  "result": {
    "name": "price-compare",
    "status": "completed",
    "steps": [
      {"id": "amazon", "status": "ok", "result": {"price": "$29.99"}, "durationMs": 1200},
      {"id": "ali", "status": "ok", "result": {"price": "$15.99"}, "durationMs": 1100},
      {"id": "report", "status": "ok", "result": "Amazon: $29.99 | AliExpress: $15.99", "durationMs": 1}
    ],
    "variables": {"amazon": {"price": "$29.99"}, "ali": {"price": "$15.99"}, "report": "Amazon: $29.99 | AliExpress: $15.99"},
    "totalDurationMs": 2301
  }
}
```

**Pipe shorthand**

For quick pipelines, use the pipe syntax:

```bash
curl -X POST http://localhost:3500/v1/pipelines/pipe \
  -H "Content-Type: application/json" \
  -d '{"pipe": "chrome-111:extract({\"title\":\"h1\"}) | transform(Title: {{step_0.title}})"}'
```

**Additional endpoints**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/pipelines/validate` | Validate without executing |
| GET | `/v1/pipelines` | List saved pipelines |
| POST | `/v1/pipelines/save` | Save a named pipeline |

See [API.md — Pipelines](API.md#12-pipelines) for full documentation.
