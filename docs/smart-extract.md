# Smart Extract — Levels 1-10

PingOS Smart Extract is a 10-level extraction pipeline that progressively applies more advanced strategies to pull structured data from any web page. Each level builds on the previous ones, with automatic fallback.

---

## Quick Reference

| Level | Name | Strategy | Requires LLM | Speed |
|-------|------|----------|:---:|-------|
| L1 | Basic CSS | `querySelector` with selector strings | No | <50ms |
| L2 | Zero-Config | Auto-detect page type, generate schema | No | <100ms |
| L3 | Semantic | LLM generates CSS selectors from NL query | Yes | 1-3s |
| L4 | JSON-LD / Schema.org | Parse structured data from `<script>` tags | No | <10ms |
| L5 | Multi-Page | Paginate + extract across pages | No | 5-60s |
| L6 | Nested/Recursive | Hierarchical container-based extraction | No | <200ms |
| L7 | Type-Aware | Auto-parse values into typed objects | No | <100ms |
| L8 | Shadow DOM Pierce | Traverse Shadow DOM trees with `>>>` combinator | No | <100ms |
| L9 | Visual Extract | Screenshot + vision model extraction | Yes | 3-10s |
| L10 | Template Learning | Learn and reuse extraction patterns per domain | No | <50ms |

---

## L1: Basic CSS Extraction

The foundation. Pass CSS selectors, get text content back.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "price": ".product-price span", "links": "a.nav-link@href"}}'
```

**How it works:**
1. For each key in `schema`, run `querySelectorAll(selector)` on the page
2. Single match: return text content as string
3. Multiple matches: return array of text content
4. `selector@attr` syntax extracts an attribute instead of text

**Fallback heuristics:** When a CSS selector returns nothing, Smart Extract uses keyword-based fallback:
- `title/heading` keys trigger heading extraction (H1-H3, aria-heading)
- `price/cost` keys trigger price regex + class-based detection
- `score/vote/rating` keys trigger rating element detection
- `author/creator` keys trigger byline/channel detection
- `view/watch/play` keys trigger view count extraction

---

## L2: Zero-Config Auto-Extract

Send an empty body. PingOS detects the page type and applies sensible defaults.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract -d '{}'
```

**Page type detection** analyzes JSON-LD, OpenGraph, URL patterns, and DOM structure to classify pages as: `product`, `search`, `article`, `feed`, `table`, `form`, `chat`, or `unknown`.

**Default schemas per page type:**

| Page Type | Fields Extracted |
|-----------|-----------------|
| `product` | title, price, description, image, rating, availability |
| `article` | title, author, date, content |
| `search` | results, titles, links |
| `feed` | posts, titles, authors |
| `table` | headers, rows, cells |
| `form` | inputs, labels, buttons |
| `chat` | messages, input |

**Data source priority:**
1. Structured data (JSON-LD, OpenGraph, microdata) — instant, no DOM walking
2. CSS selector extraction on the detected schema

**Response includes confidence scoring:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "title": "MacBook Pro 16\"",
      "price": "$2,499.00",
      "_meta": {
        "strategy": "structured+css",
        "confidence": 0.82,
        "pageType": "product",
        "auto": true,
        "duration_ms": 87
      }
    }
  }
}
```

---

## L3: Semantic Extraction

LLM-driven selector generation from natural language descriptions.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "all product names and their prices", "limit": 20}'
```

**How it works:**
1. Takes a page snapshot (DOM elements, ARIA structure)
2. Sends snapshot + NL query to an LLM
3. LLM generates CSS selectors as `{"field": "selector"}` JSON
4. Caches selectors for 30 minutes per domain+query
5. Executes extraction with generated selectors
6. Falls back to content script NL extraction if LLM selectors yield empty results

**Endpoint:** `POST /v1/dev/:device/extract/semantic`

| Param | Type | Description |
|-------|------|-------------|
| `query` | `string` | Natural language description of what to extract |
| `limit` | `number?` | Max items to return |

---

## L4: JSON-LD / Schema.org

Zero-DOM-walking extraction from standardized metadata. This runs automatically as part of L2 zero-config extraction.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" -d '{}'
```

**Supported formats (in priority order):**

1. **JSON-LD** — `<script type="application/ld+json">` — highest priority, richest data
2. **Microdata** — `itemscope` / `itemprop` attributes
3. **OpenGraph** — `<meta property="og:*">` tags
4. **Twitter Cards** — `<meta name="twitter:*">` tags
5. **Meta tags** — title, description, canonical, author, keywords

**Example:** On a product page with JSON-LD, L4 extracts name, price, description, brand, image, rating, and availability without touching the visible DOM.

Confidence: `min(1.0, fieldCount / 10)` — more fields = higher confidence.

---

## L5: Multi-Page Extraction

Automatically paginate and extract data across multiple pages.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {"titles": "h2 a", "scores": ".score"},
    "paginate": true,
    "maxPages": 5,
    "delay": 1500
  }'
```

**How it works:**
1. Extract data from the current page
2. Detect pagination (links, buttons, infinite scroll, "load more")
3. If next page exists: navigate, wait for content script reconnection, extract again
4. Deduplicate results across pages using content hashing
5. Repeat until `maxPages` reached or no more pages

**Navigation strategy:**
- Prefers URL-based navigation (`navigate` op) for reliability
- Falls back to click-based pagination when no URL available
- Handles page load disruptions (bfcache/EIO errors) with retry + backoff

| Param | Type | Description |
|-------|------|-------------|
| `paginate` | `true` | Enable multi-page extraction |
| `maxPages` | `number` | Max pages (default: 10) |
| `delay` | `number` | Delay between pages in ms (default: 1000) |

**Response:**

```json
{
  "ok": true,
  "result": {
    "pages": 3,
    "totalItems": 90,
    "data": [{"titles": "Post 1", "scores": "42"}, ...],
    "hasMore": true,
    "duration_ms": 12450
  }
}
```

---

## L6: Nested/Recursive Extraction

Extract hierarchical data from container-based layouts (product grids, comment threads, nested menus).

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "_container": ".product-card",
      "title": "h2",
      "price": ".price",
      "reviews": {
        "_container": ".review",
        "author": ".reviewer-name",
        "rating": ".stars",
        "text": ".review-text"
      }
    }
  }'
```

**Special schema features:**
- `_container`: CSS selector for repeated parent elements (required for nesting)
- `key[]` suffix: force array extraction for multi-match selectors
- `selector@attr`: extract attribute instead of text content
- Nesting up to 5 levels deep

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": [{
      "title": "Widget A",
      "price": "$9.99",
      "reviews": [
        {"author": "Alice", "rating": "5/5", "text": "Great product!"}
      ]
    }]
  }
}
```

---

## L7: Type-Aware Extraction

Auto-detect and convert extracted values into semantic types (currency, date, rating, etc.).

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "price": {"selector": ".price", "type": "currency"},
      "rating": {"selector": ".rating", "type": "rating"},
      "date": {"selector": "time[datetime]", "type": "date"},
      "in_stock": {"selector": ".availability", "type": "boolean"}
    }
  }'
```

**Supported types:**

| Type | Input Examples | Output |
|------|---------------|--------|
| `currency` | `$29.99`, `EUR 100`, `AED 349` | `{ value: 29.99, currency: "USD" }` |
| `rating` | `4.5/5`, `4.5 stars`, `★★★★☆` | `{ value: 4.5, max: 5 }` |
| `date` | `2024-02-20`, `Feb 20`, `2 days ago` | `{ iso: "2024-02-20", raw: "..." }` |
| `percentage` | `45%`, `45.5%` | `0.45` |
| `number` | `1,234`, `1.5M`, `2B` | `1234`, `1500000` |
| `boolean` | `yes`, `in stock`, `active` | `true` / `false` |
| `email` | `user@example.com` | `"user@example.com"` |
| `phone` | `+1 (555) 123-4567` | `{ e164: "+15551234567" }` |
| `url` | `/path`, `https://...` | Absolute URL |
| `list` | `red, blue, green` | `["red", "blue", "green"]` |

**Auto-detection:** If no `type` hint is provided, `autoParseValue()` detects the type from the raw text.

**Validation:** Warns about anomalies like negative prices, ratings exceeding max, or empty required fields.

---

## L8: Shadow DOM Piercing

Extract data from Web Components with closed or open Shadow DOM.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "my-component >>> h2", "content": "my-component >>> .body"}}'
```

**Piercing combinator `>>>`:**

```
host-element >>> child-selector
host-element >>> nested-host >>> deep-child
```

**Shadow root access strategy:**
1. Open shadow roots via `element.shadowRoot`
2. Closed shadow roots via `chrome.dom.openOrClosedShadowRoot()` (Chrome extension API)
3. Declarative Shadow DOM via `<template shadowrootmode>`
4. Falls back to light DOM if shadow is inaccessible

**Multi-level piercing:** Supports chained `>>>` for deeply nested Web Components:

```
outer-component >>> inner-component >>> .target-element
```

Shadow root lookups are cached (WeakMap) to avoid repeated traversal.

**Use cases:** Material Design components, Shoelace, Polymer, custom elements, Reddit's `shreddit-post`, any site using Web Components.

---

## L9: Visual Extract

Screenshot-based extraction using a vision model. Useful for canvas/SVG content, image-heavy pages, or when DOM extraction fails.

```bash
# Explicit visual strategy
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "page title", "price": "product price"}, "strategy": "visual"}'

# Auto-fallback to visual when DOM extract returns empty
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"data": "chart values"}, "fallback": "visual"}'
```

**How it works:**
1. Take a screenshot of the viewport (cached for 5s per device)
2. Build an extraction prompt from the schema/query
3. Send screenshot + prompt to a vision-capable LLM (Claude Sonnet 4 via OpenRouter)
4. Parse JSON response from LLM
5. Return extracted data with confidence score

**Retry logic:** Up to 2 retries with 1s delay, 15s timeout per attempt.

**Text fallback:** If screenshot capture fails, falls back to extracting page text via `document.body.innerText` and uses a text-only LLM.

| Param | Type | Description |
|-------|------|-------------|
| `strategy` | `"visual"` | Force visual extraction |
| `fallback` | `"visual"` | Fall back to visual if DOM extract returns empty |

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {"title": "Dashboard", "price": "$1,234"},
    "_meta": {
      "strategy": "visual",
      "confidence": 0.8,
      "duration_ms": 4500,
      "model": "anthropic/claude-sonnet-4"
    }
  }
}
```

---

## L10: Template Learning

Learn extraction patterns from successful extractions and auto-apply them on future visits.

### Learn a template

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract/learn \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "price": ".price", "rating": ".stars"}}'
```

This extracts data using the schema, then saves the working selectors as a template for the current domain.

### Auto-apply

Templates are applied **automatically** on subsequent extracts to the same domain when no schema is provided:

```bash
# This auto-applies the learned template for amazon.ae
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract -d '{}'
```

The response includes `_meta.template_hit: true` when a template was used.

### Template self-healing

When primary selectors break, templates try:
1. Alternative selectors (stored during learning)
2. Schema-based re-extraction (using field descriptions)
3. Updates the template with working selectors

### Template management

```bash
# List templates
curl http://localhost:3500/v1/templates

# Get template for domain
curl http://localhost:3500/v1/templates/www.amazon.ae

# Delete template
curl -X DELETE http://localhost:3500/v1/templates/www.amazon.ae

# Export template
curl http://localhost:3500/v1/templates/www.amazon.ae/export

# Import template
curl -X POST http://localhost:3500/v1/templates/import \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "urlPattern": "...", "selectors": {...}, "schema": {...}}'
```

Templates are stored in `~/.pingos/templates/{domain}.json` and include hit counts, success rates, and fallback selectors.

---

## Extraction Pipeline Order

When you call `POST /v1/dev/:device/extract`, the pipeline runs in this order:

1. **L10 Template check** — If a template matches the URL and no schema was provided, apply it
2. **L5 Multi-page check** — If `paginate: true`, run multi-page extraction
3. **L9 Visual check** — If `strategy: "visual"`, run screenshot extraction
4. **Content script extraction:**
   - L4 structured data scan (JSON-LD, microdata, OpenGraph)
   - L1 CSS selector extraction (or L6 nested if `_container` present)
   - L8 Shadow DOM fallback if selectors fail
   - L7 type parsing on results
   - L2 zero-config if no schema provided
5. **L9 Visual fallback** — If `fallback: "visual"` and results are empty
6. **CDP fallback** — If content script is unreachable (EIO error)
