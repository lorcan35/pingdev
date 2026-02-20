# PingOS Operations Reference

> **Base URL:** `http://localhost:3500`
> **Device endpoint pattern:** `POST /v1/dev/:device/:op`
>
> All 32 operations are called via the generic device route. Replace `:device` with your device ID (e.g., `chrome-2114771645`) and `:op` with the operation name.

---

## Table of Contents

- [Data Extraction](#data-extraction): extract, read, table, discover, query, diff
- [Interaction](#interaction): click, type, press, fill, select, hover, scroll, navigate
- [Waiting & Assertions](#waiting--assertions): wait, assert
- [Page Intelligence](#page-intelligence): recon, observe, screenshot, capture, annotate
- [Pagination & Streaming](#pagination--streaming): paginate, watch
- [Dialogs & Forms](#dialogs--forms): dialog
- [Browser State](#browser-state): eval, network, storage, upload, download
- [Recording & Replay](#recording--replay): record, replay
- [Meta Operations](#meta-operations): act

---

## Data Extraction

### extract

Pull structured data from any page using CSS selectors, natural language, or auto-detection.

```bash
# Schema-based extraction
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "price": ".price"}}'

# Natural language query
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"query": "all product titles", "limit": 10}'

# Zero-config (auto-detect page type)
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" -d '{}'

# Multi-page extraction (L5)
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"titles": "h2 a"}, "paginate": true, "maxPages": 5}'

# Visual extraction (L9)
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "page title"}, "strategy": "visual"}'
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `schema` | `Record<string, string>` | Key-value map of field names to CSS selectors or NL descriptions |
| `query` | `string` | Natural language extraction query |
| `limit` | `number` | Max items to return (NL mode) |
| `range` | `string` | Cell range for Google Sheets (e.g., `A1:B5`) |
| `format` | `"array" \| "object" \| "csv"` | Output format for range extraction |
| `paginate` | `boolean` | Enable multi-page extraction (L5) |
| `maxPages` | `number` | Max pages to extract (default: 10) |
| `delay` | `number` | Delay between pages in ms (default: 1000) |
| `strategy` | `"visual"` | Use screenshot-based visual extraction (L9) |
| `fallback` | `"visual"` | Fall back to visual if DOM extract returns empty |

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": { "title": "Product Name", "price": "$29.99" },
    "_meta": { "strategy": "css", "duration_ms": 145 }
  }
}
```

---

### read

Read text content from a specific element.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/read \
  -H "Content-Type: application/json" \
  -d '{"selector": "h1.page-title"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string` | CSS selector of the element to read |

**Response:** `{ "ok": true, "result": { "data": "Page Title Text" } }`

---

### table

Extract structured data from HTML tables, ARIA grids, and div-based grids.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/table \
  -H "Content-Type: application/json" -d '{}'

# Target specific table
curl -X POST http://localhost:3500/v1/dev/chrome-123/table \
  -H "Content-Type: application/json" \
  -d '{"selector": "#data-table"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string?` | CSS selector of specific table (auto-detects if omitted) |
| `index` | `number?` | Table index if multiple detected |

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "tables": [{
        "headers": ["Name", "Price", "Stock"],
        "rows": [{"Name": "Widget A", "Price": "$9.99", "Stock": "In Stock"}],
        "rowCount": 1,
        "pagination": { "hasNext": true }
      }]
    }
  }
}
```

---

### discover

Zero-shot site analysis. Classifies page type and generates extraction schemas without LLM.

```bash
curl http://localhost:3500/v1/dev/chrome-123/discover
# Also works as POST:
curl -X POST http://localhost:3500/v1/dev/chrome-123/discover -d '{}'
```

No parameters required.

**Response:**

```json
{
  "ok": true,
  "result": {
    "pageType": "search",
    "confidence": 0.85,
    "title": "Search Results",
    "url": "https://example.com/search",
    "schemas": [{"name": "results", "fields": {"title": "h2 a", "link": "h2 a@href"}}]
  }
}
```

---

### query

Natural language query — ask a question about the page, LLM finds the selector.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the current price?"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `question` | `string` | **Required.** Natural language question about the page |

**Response:**

```json
{
  "answer": "$29.99",
  "selector": ".product-price span",
  "cached": false,
  "model": "openrouter"
}
```

---

### diff

Track field-level changes between successive extractions.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/diff \
  -H "Content-Type: application/json" \
  -d '{"schema": {"price": ".price", "stock": ".stock-status"}}'
```

| Param | Type | Description |
|-------|------|-------------|
| `schema` | `Record<string, string>` | **Required.** Fields to track |

**Response (first call):**

```json
{
  "changes": [],
  "unchanged": ["price", "stock"],
  "snapshot": {"price": "$29.99", "stock": "In Stock"},
  "isFirstExtraction": true
}
```

**Response (subsequent call):**

```json
{
  "changes": [{"field": "price", "old": "$29.99", "new": "$24.99"}],
  "unchanged": ["stock"],
  "snapshot": {"price": "$24.99", "stock": "In Stock"},
  "isFirstExtraction": false
}
```

---

## Interaction

### click

Click an element on the page.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "button.submit", "stealth": true}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string` | CSS selector of element to click |
| `stealth` | `boolean?` | Use human-like click simulation (default: false) |

---

### type

Type text into an input element.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/type \
  -H "Content-Type: application/json" \
  -d '{"selector": "#search-input", "text": "hello world", "stealth": true}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string` | CSS selector of input element |
| `text` | `string` | Text to type |
| `stealth` | `boolean?` | Use human-like typing with delays (default: false) |

---

### press

Send a keyboard key press.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/press \
  -H "Content-Type: application/json" \
  -d '{"key": "Enter"}'

# With modifiers
curl -X POST http://localhost:3500/v1/dev/chrome-123/press \
  -H "Content-Type: application/json" \
  -d '{"key": "a", "modifiers": ["ctrlKey"], "selector": "#editor"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `key` | `string` | Key name (e.g., `Enter`, `Tab`, `Escape`, `a`) |
| `modifiers` | `string[]?` | Modifier keys: `ctrlKey`, `shiftKey`, `altKey`, `metaKey` |
| `selector` | `string?` | Target element (defaults to active element) |
| `stealth` | `boolean?` | Human-like key press timing |

---

### fill

Smart form filling — auto-detects fields by labels, placeholders, names, and IDs.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/fill \
  -H "Content-Type: application/json" \
  -d '{"fields": {"username": "john", "password": "secret", "remember": "true"}}'
```

| Param | Type | Description |
|-------|------|-------------|
| `fields` | `Record<string, string>` | **Required.** Field identifiers mapped to values |

Field matching strategy (in order): CSS selector, label text, placeholder, name attribute, ID, aria-label. Handles inputs, textareas, selects, checkboxes, radio buttons, contenteditable, and custom dropdowns.

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "filled": [
        {"field": "username", "value": "john", "selector": "#username", "success": true},
        {"field": "password", "value": "secret", "selector": "#password", "success": true}
      ],
      "skipped": []
    }
  }
}
```

---

### select

Select text on the page — either a range between elements or all text within an element.

```bash
# Select all text in an element
curl -X POST http://localhost:3500/v1/dev/chrome-123/select \
  -H "Content-Type: application/json" \
  -d '{"selector": "#article-body"}'

# Select range between elements
curl -X POST http://localhost:3500/v1/dev/chrome-123/select \
  -H "Content-Type: application/json" \
  -d '{"from": "#para-1", "to": "#para-3"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string?` | Select all text in this element |
| `from` | `string?` | Start element for range selection |
| `to` | `string?` | End element for range selection |
| `startOffset` | `number?` | Character offset in start element |
| `endOffset` | `number?` | Character offset in end element |

---

### hover

Trigger hover state on an element — reveals tooltips, menus, and previews.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/hover \
  -H "Content-Type: application/json" \
  -d '{"selector": ".product-card", "duration_ms": 1000}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string` | **Required.** Element to hover |
| `duration_ms` | `number?` | Hover duration in ms (default: 500) |

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "hovered": true,
      "selector": ".product-card",
      "duration_ms": 1000,
      "newContent": {"type": "tooltip", "text": "Click to view details"}
    }
  }
}
```

---

### scroll

Scroll the page or a specific element.

```bash
# Scroll down by 500px
curl -X POST http://localhost:3500/v1/dev/chrome-123/scroll \
  -H "Content-Type: application/json" \
  -d '{"deltaY": 500}'

# Scroll element into view
curl -X POST http://localhost:3500/v1/dev/chrome-123/scroll \
  -H "Content-Type: application/json" \
  -d '{"selector": "#footer"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string?` | Scroll this element into view |
| `deltaY` | `number?` | Scroll by Y pixels (positive = down) |
| `behavior` | `"auto" \| "smooth"?` | Scroll behavior |
| `stealth` | `boolean?` | Human-like scroll simulation |

---

### navigate

Navigate to a URL, path, or find and click a link by keyword.

```bash
# Direct URL
curl -X POST http://localhost:3500/v1/dev/chrome-123/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page"}'

# Smart navigate by keyword
curl -X POST http://localhost:3500/v1/dev/chrome-123/navigate \
  -H "Content-Type: application/json" \
  -d '{"to": "Settings"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `url` | `string?` | Direct URL to navigate to |
| `to` | `string?` | Keyword to find and click (searches nav, links, buttons) |

**Response:** `{ "ok": true, "result": { "data": { "navigated": true, "url": "...", "steps": [...] } } }`

---

## Waiting & Assertions

### wait

Wait for a condition to be met before proceeding.

```bash
# Wait for element to appear
curl -X POST http://localhost:3500/v1/dev/chrome-123/wait \
  -H "Content-Type: application/json" \
  -d '{"condition": "visible", "selector": ".results"}'

# Wait for network idle
curl -X POST http://localhost:3500/v1/dev/chrome-123/wait \
  -H "Content-Type: application/json" \
  -d '{"condition": "networkIdle"}'

# Wait for DOM stability
curl -X POST http://localhost:3500/v1/dev/chrome-123/wait \
  -H "Content-Type: application/json" \
  -d '{"condition": "domStable", "timeout": 5000}'
```

| Param | Type | Description |
|-------|------|-------------|
| `condition` | `string` | **Required.** One of: `visible`, `hidden`, `text`, `textChange`, `networkIdle`, `domStable`, `exists` |
| `selector` | `string?` | Target element (required for visible/hidden/text/exists) |
| `text` | `string?` | Text to wait for (condition: `text`) |
| `timeout` | `number?` | Max wait in ms (default: 10000, max: 30000) |

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": { "waited": true, "duration_ms": 2345, "condition_met": true }
  }
}
```

---

### assert

Run verification assertions against the DOM.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/assert \
  -H "Content-Type: application/json" \
  -d '{
    "assertions": [
      {"type": "exists", "selector": "#login-form"},
      {"type": "text", "selector": "h1", "expected": "Welcome"},
      {"type": "visible", "selector": ".success-message"},
      {"type": "count", "selector": ".item", "expected": "5"}
    ]
  }'
```

| Param | Type | Description |
|-------|------|-------------|
| `assertions` | `array` | **Required.** Array of assertion objects |

**Assertion types:** `exists`, `notExists`, `visible`, `hidden`, `text`, `textContains`, `value`, `class`, `attribute`, `count`

Each assertion takes: `type`, `selector`, `expected?`, `attribute?`

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "passed": true,
      "results": [
        {"assertion": {"type": "exists", "selector": "#login-form"}, "passed": true, "actual": "exists"}
      ]
    }
  }
}
```

---

## Page Intelligence

### recon

Full-page reconnaissance — discovers interactive elements, forms, navigation, and page structure.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/recon -d '{}'
```

No parameters required.

**Response:**

```json
{
  "ok": true,
  "result": {
    "url": "https://example.com",
    "title": "Example",
    "structure": {"hasHeader": true, "hasNav": true, "hasMain": true},
    "actions": [{"type": "button", "selector": "button.submit", "label": "Submit"}],
    "forms": [{"action": "/search", "method": "GET", "inputs": [...]}]
  }
}
```

---

### observe

Scan the page for available interactive elements and possible actions.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/observe -d '{}'
```

No parameters required. Returns counts and descriptions of buttons, inputs, links, forms, and navigation elements.

---

### screenshot

Capture a screenshot of the current viewport.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/screenshot -d '{}'
```

**Response:** `{ "ok": true, "result": { "data": { "screenshot": "<base64-png>" } } }`

---

### capture

Rich page capture in various formats.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/capture \
  -H "Content-Type: application/json" \
  -d '{"format": "dom"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `format` | `string` | **Required.** One of: `dom`, `pdf`, `mhtml`, `har` |

**Response (dom):**

```json
{
  "ok": true,
  "result": {
    "data": {
      "format": "dom",
      "content": "<!DOCTYPE html>...",
      "url": "https://example.com",
      "title": "Page Title",
      "size": 45230,
      "timestamp": 1708387200000
    }
  }
}
```

> Note: `pdf`, `mhtml`, and `har` formats require CDP access via the extension background script.

---

### annotate

Add visual annotations (boxes, highlights, arrows) to page elements.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/annotate \
  -H "Content-Type: application/json" \
  -d '{
    "annotations": [
      {"selector": "#submit-btn", "label": "Click here", "style": "box", "color": "red"},
      {"selector": ".price", "style": "highlight"}
    ]
  }'
```

| Param | Type | Description |
|-------|------|-------------|
| `annotations` | `array` | **Required.** Array of annotation objects |

Each annotation: `selector` (required), `label?`, `color?`, `style?` (`box` | `highlight` | `arrow`)

**Response:** `{ "ok": true, "result": { "data": { "annotated": true, "count": 2 } } }`

---

## Pagination & Streaming

### paginate

Detect and navigate pagination controls.

```bash
# Detect pagination
curl -X POST http://localhost:3500/v1/dev/chrome-123/paginate \
  -H "Content-Type: application/json" \
  -d '{"action": "detect"}'

# Go to next page
curl -X POST http://localhost:3500/v1/dev/chrome-123/paginate \
  -H "Content-Type: application/json" \
  -d '{"action": "next"}'

# Jump to page 5
curl -X POST http://localhost:3500/v1/dev/chrome-123/paginate \
  -H "Content-Type: application/json" \
  -d '{"action": "goto", "page": 5}'
```

| Param | Type | Description |
|-------|------|-------------|
| `action` | `string` | **Required.** One of: `detect`, `next`, `prev`, `goto` |
| `page` | `number?` | Target page number (for `goto`) |

Detects links, buttons, infinite scroll, and "load more" patterns.

**Response (detect):**

```json
{
  "ok": true,
  "result": {
    "data": {
      "found": true,
      "currentPage": 1,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false,
      "paginationType": "links",
      "nextUrl": "https://example.com/page/2"
    }
  }
}
```

---

### watch

Start a live SSE stream of page data changes.

```bash
# Simple watch (SSE stream)
curl -N -X POST http://localhost:3500/v1/dev/chrome-123/watch \
  -H "Content-Type: application/json" \
  -d '{"schema": {"price": ".price", "stock": ".stock"}, "interval": 3000}'
```

| Param | Type | Description |
|-------|------|-------------|
| `schema` | `Record<string, string>` | **Required.** Fields to monitor |
| `interval` | `number?` | Poll interval in ms (default: 5000, min: 1000) |

Returns an SSE stream. Data events are emitted only when values change.

**Managed watches** (with watchId for later control):

```bash
# Start managed watch
curl -X POST http://localhost:3500/v1/dev/chrome-123/watch/start \
  -H "Content-Type: application/json" \
  -d '{"selector": ".price", "fields": {"price": ".amount"}, "interval": 5000}'

# Stream events
curl -N http://localhost:3500/v1/watches/{watchId}/events

# Stop watch
curl -X DELETE http://localhost:3500/v1/watches/{watchId}

# List active watches
curl http://localhost:3500/v1/watches
```

---

## Dialogs & Forms

### dialog

Detect and interact with modals, popups, cookie banners, and overlays.

```bash
# Detect dialogs
curl -X POST http://localhost:3500/v1/dev/chrome-123/dialog \
  -H "Content-Type: application/json" \
  -d '{"action": "detect"}'

# Dismiss (close/escape)
curl -X POST http://localhost:3500/v1/dev/chrome-123/dialog \
  -H "Content-Type: application/json" \
  -d '{"action": "dismiss"}'

# Accept cookie banner
curl -X POST http://localhost:3500/v1/dev/chrome-123/dialog \
  -H "Content-Type: application/json" \
  -d '{"action": "accept"}'

# Click custom button
curl -X POST http://localhost:3500/v1/dev/chrome-123/dialog \
  -H "Content-Type: application/json" \
  -d '{"action": "interact", "text": "Maybe Later"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `action` | `string` | **Required.** One of: `detect`, `dismiss`, `accept`, `interact` |
| `text` | `string?` | Button text to click (for `interact`) |

Detects: `[role="dialog"]`, `.modal`, cookie banners, paywalls, fixed overlays.

**Response:**

```json
{
  "ok": true,
  "result": {
    "data": {
      "found": [{"type": "modal", "selector": "[role='dialog']", "text": "Accept cookies?"}],
      "action_taken": "dismiss",
      "success": true
    }
  }
}
```

---

## Browser State

### eval

Execute JavaScript in the page context.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/eval \
  -H "Content-Type: application/json" \
  -d '{"expression": "document.title"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `expression` | `string` | **Required.** JavaScript expression to evaluate |
| `code` | `string?` | Legacy alias for `expression` |

**Response:** `{ "ok": true, "result": { "data": "Page Title" } }`

---

### network

Capture and inspect network requests.

```bash
# Start capturing
curl -X POST http://localhost:3500/v1/dev/chrome-123/network \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "filter": {"url": "api.example.com", "method": "POST"}}'

# List captured requests
curl -X POST http://localhost:3500/v1/dev/chrome-123/network \
  -H "Content-Type: application/json" \
  -d '{"action": "list"}'

# Stop capturing
curl -X POST http://localhost:3500/v1/dev/chrome-123/network \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `action` | `string` | **Required.** One of: `start`, `stop`, `list` |
| `filter.url` | `string?` | URL substring filter |
| `filter.method` | `string?` | HTTP method filter (GET, POST, etc.) |

Instruments `fetch` and `XMLHttpRequest` to capture requests.

**Response (list):**

```json
{
  "ok": true,
  "result": {
    "data": {
      "requests": [
        {"url": "https://api.example.com/data", "method": "POST", "status": 200, "timestamp": 1708387200000}
      ],
      "requestCount": 1
    }
  }
}
```

---

### storage

Read and write browser storage (localStorage, sessionStorage, cookies).

```bash
# Get a value
curl -X POST http://localhost:3500/v1/dev/chrome-123/storage \
  -H "Content-Type: application/json" \
  -d '{"action": "get", "store": "local", "key": "authToken"}'

# List all cookies
curl -X POST http://localhost:3500/v1/dev/chrome-123/storage \
  -H "Content-Type: application/json" \
  -d '{"action": "list", "store": "cookies"}'

# Set a value
curl -X POST http://localhost:3500/v1/dev/chrome-123/storage \
  -H "Content-Type: application/json" \
  -d '{"action": "set", "store": "session", "key": "theme", "value": "dark"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `action` | `string` | **Required.** One of: `get`, `set`, `delete`, `list` |
| `store` | `string` | **Required.** One of: `local`, `session`, `cookies` |
| `key` | `string?` | Storage key (required for get/set/delete) |
| `value` | `string?` | Value to set (required for set) |

---

### upload

Trigger file upload on a file input element.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/upload \
  -H "Content-Type: application/json" \
  -d '{"selector": "input[type=file]", "filePath": "/path/to/file.pdf"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `selector` | `string` | CSS selector of file input |
| `filePath` | `string` | Path to file on disk |

> Note: Full file upload requires CDP access (`DOM.setFileInputFiles`). The content script returns a CDP hint.

---

### download

Trigger file downloads.

```bash
# Download by URL
curl -X POST http://localhost:3500/v1/dev/chrome-123/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/report.pdf"}'

# Click a download button
curl -X POST http://localhost:3500/v1/dev/chrome-123/download \
  -H "Content-Type: application/json" \
  -d '{"selector": "a.download-link"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `url` | `string?` | Direct download URL |
| `selector` | `string?` | Element to click for download |
| `savePath` | `string?` | Suggested save path |

**Response:** `{ "ok": true, "result": { "data": { "downloaded": true, "fileName": "report.pdf" } } }`

---

## Recording & Replay

### record

Record browser interactions for later replay. Uses separate endpoints:

```bash
# Start recording
curl -X POST http://localhost:3500/v1/record/start \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123"}'

# Check recording status
curl "http://localhost:3500/v1/record/status?device=chrome-123"

# Stop recording
curl -X POST http://localhost:3500/v1/record/stop \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123"}'

# Export recording
curl -X POST http://localhost:3500/v1/record/export \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123", "name": "my-workflow"}'
```

---

### replay

Replay a recorded workflow on a device.

```bash
# Replay inline recording
curl -X POST http://localhost:3500/v1/recordings/replay \
  -H "Content-Type: application/json" \
  -d '{
    "device": "chrome-123",
    "recording": {"id": "rec-1", "actions": [...]},
    "speed": 1.5
  }'

# Replay saved recording
curl -X POST http://localhost:3500/v1/record/replay \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123", "recordingId": "my-workflow"}'
```

| Param | Type | Description |
|-------|------|-------------|
| `device` | `string` | **Required.** Target device ID |
| `recording` | `object?` | Inline recording object |
| `recordingId` | `string?` | ID of a saved recording |
| `speed` | `number?` | Playback speed multiplier |
| `timeout` | `number?` | Max replay time in ms |

Additional recording endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/recordings/save` | POST | Save a recording (body: `{id, actions}`) |
| `/v1/recordings` | GET | List saved recordings |
| `/v1/recordings/:id` | DELETE | Delete a recording |
| `/v1/recordings/generate` | POST | Generate PingApp from recording |

---

## Meta Operations

### act

High-level compound action — combines multiple low-level operations.

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-123/act \
  -H "Content-Type: application/json" \
  -d '{"action": "search", "query": "mechanical keyboard"}'
```

The act engine interprets high-level intents and executes the appropriate sequence of click, type, press, and wait operations.

---

## Error Codes

All errors follow the PingOS error format:

```json
{
  "errno": "ENODEV",
  "code": "ping.gateway.device_not_found",
  "message": "Device chrome-999 not found",
  "retryable": false
}
```

| errno | HTTP | Meaning |
|-------|------|---------|
| `ENODEV` | 404 | Device not found |
| `EIO` | 502 | I/O error (extension communication failed) |
| `ENOSYS` | 400 | Bad request / missing params |
| `EACCES` | 403 | Auth error |
| `EAGAIN` | 429 | Rate limited, retry later |
| `ENOENT` | 404 | Resource not found |
