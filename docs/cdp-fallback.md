# CDP Fallback

When the Chrome extension content script can't communicate with a page (CSP restrictions, page crash, bfcache eviction, or disconnected port), PingOS falls back to Chrome DevTools Protocol (CDP) to execute operations directly.

**Source:** `packages/std/src/cdp-fallback.ts`

---

## How It Works

```
Client → Gateway → Extension Bridge → Content Script (fails with EIO)
                  ↓
                  CDP Fallback → Chrome DevTools Protocol → Page
```

1. A device operation fails with an `EIO` error (I/O error, "Receiving end does not exist", "Could not establish connection")
2. Gateway resolves the device's URL from shared tabs
3. Finds a matching CDP target via `http://localhost:18800/json/list`
4. Connects to the target's WebSocket debugger URL
5. Executes `Runtime.evaluate` with an IIFE expression
6. Returns the result with `_cdpFallback: true` metadata

---

## Configuration

CDP fallback requires Chrome to be running with remote debugging enabled:

```bash
# Launch Chrome with remote debugging
google-chrome --remote-debugging-port=18800
```

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_PORT` | `18800` | Chrome DevTools Protocol port |
| `CDP_HOST` | `localhost` | CDP host address |

---

## Supported Operations

Not all operations can run via CDP. Only operations that can be expressed as a single `Runtime.evaluate` call are supported:

| Operation | CDP Support | Notes |
|-----------|:-:|-------|
| `extract` | Yes | Zero-config extraction (title, description, heading, main text) |
| `extract` (structured) | Yes | JSON-LD, OpenGraph, meta tags |
| `extract` (semantic) | Yes | Text content from major containers |
| `discover` | Yes | Page type classification, form/table/input counts |
| `table` | Yes | HTML table extraction with headers and rows |
| `assert` | Yes | DOM assertions (exists, visible) |
| `recon` | Yes | Links, buttons, forms, page structure |
| Others | No | Returns null, original error propagates |

---

## CDP Extract

Two strategies for extraction via CDP:

### Zero-Config (default)

Extracts basic page metadata:

```json
{
  "data": {
    "title": "Page Title",
    "description": "Meta description",
    "canonical": "https://example.com/page",
    "heading": "Main Heading",
    "mainText": "First 2000 chars of main content..."
  },
  "_meta": { "strategy": "cdp-fallback", "confidence": 0.4 }
}
```

### Structured

When `strategy: "structured"` is passed, extracts richer metadata:

```json
{
  "data": {
    "title": "Page Title",
    "description": "...",
    "canonical": "...",
    "ogTitle": "OpenGraph Title",
    "ogDescription": "...",
    "ogImage": "...",
    "jsonLd": [{"@type": "Product", "name": "..."}]
  },
  "_meta": { "strategy": "cdp-structured", "confidence": 0.5 }
}
```

---

## CDP Discover

Returns page classification and element counts:

```json
{
  "pageType": "form",
  "confidence": 0.5,
  "title": "Contact Us",
  "url": "https://example.com/contact",
  "schemas": [],
  "metadata": { "forms": 1, "tables": 0, "inputs": 5, "links": 12 },
  "_meta": { "strategy": "cdp-fallback" }
}
```

---

## CDP Table

Extracts HTML tables (up to 5 tables, 50 rows each). Falls back to list-based tables (`<ul>`, `<ol>`) if no `<table>` elements found.

```json
{
  "tables": [{
    "headers": ["Name", "Price"],
    "rows": [{"Name": "Item 1", "Price": "$9.99"}],
    "rowCount": 1
  }],
  "_meta": { "strategy": "cdp-fallback" }
}
```

---

## CDP Recon

Discovers page structure, links, buttons, and forms:

```json
{
  "url": "https://example.com",
  "title": "Example",
  "structure": {
    "hasHeader": true, "hasNav": true, "hasMain": true,
    "hasSidebar": false, "hasFooter": true, "hasModal": false
  },
  "actions": [
    {"type": "link", "selector": "a", "label": "Home", "purpose": "navigate", "enabled": true}
  ],
  "forms": [
    {"action": "/search", "method": "GET", "inputs": [{"type": "input", "name": "q"}]}
  ],
  "_meta": { "strategy": "cdp-fallback" }
}
```

---

## CDP Assert

Runs DOM assertions. Currently supports `exists` and `visible` assertion types.

```json
{
  "passed": true,
  "results": [
    {"assertion": {"type": "exists", "selector": "#login"}, "passed": true, "actual": "exists"}
  ]
}
```

---

## Error Handling

- If no CDP target is found for the device URL, fallback returns `null` and the original error propagates
- CDP WebSocket connections have a 15-second timeout
- `Runtime.evaluate` calls have a 10-second timeout
- Target matching tries exact URL first, then prefix match (ignoring query params and hash)

---

## When Does CDP Fallback Trigger?

The gateway detects these error patterns and triggers CDP fallback:

- `errno: 'EIO'` (PingOS error format)
- `"I/O error"` or `"EIO"` in error message
- `"Receiving end does not exist"` (Chrome extension port disconnected)
- `"Could not establish connection"` (content script not loaded)

Common scenarios:
- **CSP-restricted pages** that block the content script
- **Page navigation** that destroys the content script port (bfcache)
- **Extension reload** while a page is open
- **Crashed tabs** that lost their content script
