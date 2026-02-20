# PingOS API Reference

> **Base URL:** `http://localhost:3500`
> All request/response bodies are JSON. All endpoints use the `/v1/` version prefix.
> Source: `packages/std/src/gateway.ts`, `packages/std/src/app-routes.ts`

---

## Table of Contents

1. [System](#1-system)
   - [GET /v1/health](#get-v1health)
   - [GET /v1/registry](#get-v1registry)
   - [GET /v1/devices](#get-v1devices)
   - [GET /v1/dev/:device/status](#get-v1devdevicestatus)
   - [POST /v1/extension/reload](#post-v1extensionreload)
   - [GET /v1/apps](#get-v1apps)
2. [Device Operations](#2-device-operations)
   - [POST /v1/dev/:device/:op](#post-v1devdeviceop)
   - [recon](#op-recon) | [observe](#op-observe) | [read](#op-read) | [extract](#op-extract) | [act](#op-act) | [click](#op-click) | [type](#op-type) | [scroll](#op-scroll) | [navigate](#op-navigate) | [press](#op-press) | [dblclick](#op-dblclick) | [select](#op-select) | [eval](#op-eval) | [waitFor](#op-waitfor) | [getUrl](#op-geturl) | [clean](#op-clean) | [screenshot](#op-screenshot) | [record_api_action](#op-record_api_action)
3. [LLM Routing](#3-llm-routing)
   - [POST /v1/dev/llm/prompt](#post-v1devllmprompt)
   - [POST /v1/dev/llm/chat](#post-v1devllmchat)
   - [POST /v1/dev/:device/suggest](#post-v1devdevicesuggest)
4. [Recorder](#4-recorder)
   - [POST /v1/record/start](#post-v1recordstart)
   - [POST /v1/record/stop](#post-v1recordstop)
   - [POST /v1/record/export](#post-v1recordexport)
   - [GET /v1/record/status](#get-v1recordstatus)
5. [Self-Heal](#5-self-heal)
   - [GET /v1/heal/cache](#get-v1healcache)
   - [GET /v1/heal/stats](#get-v1healstats)
6. [PingApps: Amazon](#6-pingapps-amazon)
7. [PingApps: AliExpress](#7-pingapps-aliexpress)
8. [PingApps: Claude](#8-pingapps-claude)
9. [Novel Features](#9-novel-features)
   - [POST /v1/dev/:device/query](#post-v1devdevicequery)
   - [POST /v1/dev/:device/watch](#post-v1devdevicewatch)
   - [POST /v1/dev/:device/diff](#post-v1devdevicediff)
   - [GET /v1/dev/:device/discover](#get-v1devdevicediscover)
   - [POST /v1/apps/generate](#post-v1appsgenerate)
   - [GET /v1/llm/models](#get-v1llmmodels)
10. [Tab-as-a-Function](#10-tab-as-a-function)
    - [GET /v1/functions](#get-v1functions)
    - [GET /v1/functions/:app](#get-v1functionsapp)
    - [POST /v1/functions/:app/call](#post-v1functionsappcall)
    - [POST /v1/functions/:app/batch](#post-v1functionsappbatch)
11. [WebSocket Protocol](#11-websocket-protocol)
12. [Error Reference](#12-error-reference)

---

## 1. System

### GET /v1/health

Gateway health check. Returns 200 if the gateway process is running.

```bash
curl -s http://localhost:3500/v1/health | jq .
```

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-18T12:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"healthy"` | Always `"healthy"` if the process is up |
| `timestamp` | `string` | ISO 8601 timestamp |

> Source: `gateway.ts:135`

---

### GET /v1/registry

List all registered LLM drivers with capabilities, backend type, endpoint, and priority.

```bash
curl -s http://localhost:3500/v1/registry | jq .
```

**Response (200):**

```json
{
  "drivers": [
    {
      "id": "gemini",
      "name": "Gemini PingApp",
      "type": "pingapp",
      "capabilities": {
        "llm": true,
        "streaming": true,
        "vision": true,
        "toolCalling": true,
        "imageGen": true,
        "search": true,
        "deepResearch": true,
        "thinking": true
      },
      "endpoint": "http://localhost:3456",
      "priority": 1
    }
  ]
}
```

**TypeScript interfaces:**

```typescript
interface DriverRegistration {
  id: string;
  name: string;
  type: 'pingapp' | 'api' | 'local';
  capabilities: DriverCapabilities;
  endpoint: string;
  priority: number;         // lower = preferred
  tools?: string[];
  modes?: string[];
  model?: ModelInfo;
}

interface DriverCapabilities {
  llm: boolean;
  streaming: boolean;
  vision: boolean;
  toolCalling: boolean;
  imageGen: boolean;
  search: boolean;
  deepResearch: boolean;
  thinking: boolean;
  snapshotting?: boolean;
  sessionAffinity?: boolean;
  maxContextTokens?: number;
  concurrency?: number;
}
```

**Filtering examples:**

```bash
# List driver IDs and types
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | {id, type}'

# Find drivers with thinking capability
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | select(.capabilities.thinking) | .id'
```

> Source: `gateway.ts:140`, `types.ts:50-60`

---

### GET /v1/devices

List all devices connected via the Chrome extension bridge. Each shared browser tab becomes a device with ID `chrome-{tabId}`.

```bash
curl -s http://localhost:3500/v1/devices | jq .
```

**Response (200):**

```json
{
  "extension": {
    "clients": [
      {
        "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "tabs": [
          {
            "deviceId": "chrome-2114771645",
            "tabId": 2114771645,
            "url": "https://www.amazon.ae/",
            "title": "Amazon.ae"
          },
          {
            "deviceId": "chrome-2114771700",
            "tabId": 2114771700,
            "url": "https://claude.ai/new",
            "title": "Claude"
          }
        ]
      }
    ],
    "devices": [
      {
        "deviceId": "chrome-2114771645",
        "tabId": 2114771645,
        "url": "https://www.amazon.ae/",
        "title": "Amazon.ae",
        "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `extension.clients` | `array` | Connected extension instances, each with its tabs |
| `extension.devices` | `array` | Flattened list of all shared tabs across all clients |

> Source: `gateway.ts:179`

---

### GET /v1/dev/:device/status

Check the connection status of a specific device.

```bash
curl -s http://localhost:3500/v1/dev/chrome-2114771645/status | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "device": "chrome-2114771645",
  "status": {
    "owned": true,
    "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Error (404) — device not found:**

```json
{
  "errno": "ENODEV",
  "code": "ping.gateway.device_not_found",
  "message": "Device chrome-999 not found",
  "retryable": false
}
```

> Source: `gateway.ts:193`

---

### POST /v1/extension/reload

Send a reload signal to the first connected Chrome extension client. Useful for development.

```bash
curl -s -X POST http://localhost:3500/v1/extension/reload | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "message": "Reload signal sent"
}
```

**Error (503) — no extension connected:**

```json
{
  "ok": false,
  "error": "No extension client connected"
}
```

> Source: `gateway.ts:167`

---

### GET /v1/apps

List all registered PingApp modules and their available actions.

```bash
curl -s http://localhost:3500/v1/apps | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "apps": [
    {
      "name": "aliexpress",
      "displayName": "AliExpress",
      "version": "0.1.0",
      "actions": [
        "POST /v1/app/aliexpress/search { query }",
        "POST /v1/app/aliexpress/product { id }",
        "..."
      ]
    },
    {
      "name": "amazon",
      "displayName": "Amazon UAE",
      "version": "0.1.0",
      "actions": ["..."]
    },
    {
      "name": "claude",
      "displayName": "Claude.ai",
      "version": "0.1.0",
      "actions": ["..."]
    }
  ]
}
```

> Source: `app-routes.ts:753`

---

## 2. Device Operations

### POST /v1/dev/:device/:op

The gateway's unified "device file" interface. Routes requests to browser tabs via the Chrome extension bridge.

**Execution path:**

```
HTTP POST /v1/dev/chrome-{tabId}/{op}
  → gateway
  → WebSocket /ext
  → extension background.ts
  → content script (content.ts)
  → DOM
```

**Common behavior:**

- If the extension bridge **owns** the device, the command is forwarded over WebSocket with a 20-second timeout.
- If the device is not found, returns `404 ENODEV`.
- If the content script fails, returns `502 EIO`.
- **Self-healing**: When `selfHeal` is enabled and a selector-based op (`read`, `click`, `type`, `waitFor`) returns "element not found", the gateway automatically retries with a cached or LLM-suggested replacement selector. Healed responses include a `_healed` metadata object.

**Base request pattern:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-{tabId}/{op} \
  -H 'Content-Type: application/json' \
  -d '{ ... }' | jq .
```

**Base response:**

```json
{ "ok": true, "result": "..." }
```

**Self-healed response:**

```json
{
  "ok": true,
  "result": "...",
  "_healed": {
    "from": "original-selector",
    "to": "new-selector",
    "cached": false,
    "confidence": 0.85,
    "reasoning": "The ID changed from #old to #new"
  }
}
```

> Source: `gateway.ts:296`, `background.ts:326`

---

Below are all 18 device operations. Each is invoked as `POST /v1/dev/:device/{op}`.

### op: `recon`

Run reconnaissance on the current page. Returns interactive elements, page structure, and ARIA tree information.

**Request:**

```typescript
{ classify?: boolean; stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/recon \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response:**

```json
{
  "ok": true,
  "result": {
    "elements": [...],
    "regions": [...],
    "dynamicAreas": [...],
    "ariaTree": [...]
  }
}
```

> Source: `chrome-extension/src/types.ts:13`

---

### op: `observe`

Observe the current page state. Returns a snapshot of visible content and dynamic areas.

**Request:**

```typescript
{ stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/observe \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

---

### op: `read`

Read `textContent` from elements matching a CSS selector.

**Request:**

```typescript
{ selector: string; limit?: number; stealth?: boolean }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | Yes | CSS selector to match |
| `limit` | `number` | No | Max number of characters to return |
| `stealth` | `boolean` | No | Use stealth interaction mode |

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/read \
  -H 'Content-Type: application/json' \
  -d '{"selector": "h1"}' | jq .
```

**Response:**

```json
{ "ok": true, "result": "Example Domain" }
```

> Supports self-healing when the selector fails.

---

### op: `extract`

Extract structured data from the page using CSS selectors or natural-language queries.

**Request:**

```typescript
{
  range?: string;                          // CSS selector scope
  format?: 'array' | 'object' | 'csv';    // Output format
  schema?: Record<string, string>;         // Field → selector map
  query?: string;                          // Natural language extraction query
  limit?: number;                          // Max items
  stealth?: boolean;
}
```

**Example — schema-based extraction:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "schema": {"title": "h1", "price": ".price", "rating": ".stars"},
    "format": "object"
  }' | jq .
```

**Example — query-based extraction:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "all product names and prices in the table",
    "format": "array",
    "limit": 10
  }' | jq .
```

---

### op: `act`

Execute a natural-language instruction on the page. The engine interprets the instruction and performs the corresponding DOM actions (click, type, scroll, etc.).

**Request:**

```typescript
{ instruction: string; stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/act \
  -H 'Content-Type: application/json' \
  -d '{"instruction": "click the Sign In button"}' | jq .
```

---

### op: `click`

Click an element by CSS selector, text content, or CDP coordinates.

**Request:**

```typescript
{
  selector?: string;       // CSS selector
  text?: string;           // Match by visible text (e.g., "text=Add to cart")
  x?: number;              // Viewport X coordinate (CDP click)
  y?: number;              // Viewport Y coordinate (CDP click)
  stealth?: boolean;
}
```

**Example — CSS selector:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H 'Content-Type: application/json' \
  -d '{"selector": "#submit-button"}' | jq .
```

**Example — text match:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H 'Content-Type: application/json' \
  -d '{"text": "Add to cart"}' | jq .
```

**Example — CDP coordinate click (trusted events for canvas apps):**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H 'Content-Type: application/json' \
  -d '{"x": 400, "y": 300, "cdp": true}' | jq .
```

> CDP clicks use `Input.dispatchMouseEvent` via Chrome DevTools Protocol for trusted events. Supports self-healing when the selector fails.

> Source: `background.ts:439`

---

### op: `type`

Type text into an input element matching a selector.

**Request:**

```typescript
{
  selector: string;
  text: string;
  stealth?: boolean;
  clear?: boolean;        // Clear existing content first
  cdp?: boolean;          // Use CDP Input.insertText for trusted events
}
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/type \
  -H 'Content-Type: application/json' \
  -d '{"selector": "input[name=\"q\"]", "text": "pingos", "clear": true}' | jq .
```

> When `cdp: true`, uses `Input.insertText` via Chrome DevTools Protocol to produce trusted keyboard events that canvas apps (e.g., Google Sheets) require.

> Source: `background.ts:529`

---

### op: `scroll`

Scroll the page or a specific element.

**Request:**

```typescript
{
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;           // Scroll amount in pixels
  selector?: string;         // Element to scroll (defaults to page)
  to?: 'top' | 'bottom';    // Scroll to absolute position
  stealth?: boolean;
}
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/scroll \
  -H 'Content-Type: application/json' \
  -d '{"direction": "down", "amount": 500}' | jq .
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/scroll \
  -H 'Content-Type: application/json' \
  -d '{"to": "bottom"}' | jq .
```

---

### op: `navigate`

Navigate the tab to a new URL. Uses `chrome.tabs.update()` internally, which works even when the content script is stale.

**Request:**

```typescript
{ url: string; stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}' | jq .
```

**Behavior:** Waits for page load to complete (up to 15s), then re-injects the content script.

> Source: `background.ts:352`

---

### op: `press`

Press a keyboard key, optionally with modifier keys.

**Request:**

```typescript
{
  key: string;                // Key name: "Enter", "Tab", "a", "Escape", etc.
  modifiers?: string[];       // ["ctrl"], ["shift"], ["alt"], ["meta"/"cmd"]
  selector?: string;          // Focus element first
  cdp?: boolean;              // Use CDP for trusted events
  stealth?: boolean;
}
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/press \
  -H 'Content-Type: application/json' \
  -d '{"key": "Enter"}' | jq .
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/press \
  -H 'Content-Type: application/json' \
  -d '{"key": "a", "modifiers": ["ctrl"], "cdp": true}' | jq .
```

> CDP press dispatches `keyDown` → `char` (for printable keys) → `keyUp` via `Input.dispatchKeyEvent`.

> Source: `background.ts:469`

---

### op: `dblclick`

Double-click an element matching a CSS selector.

**Request:**

```typescript
{ selector: string; stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/dblclick \
  -H 'Content-Type: application/json' \
  -d '{"selector": ".editable-cell"}' | jq .
```

---

### op: `select`

Select text within the page or a specific element.

**Request:**

```typescript
{
  from?: string;            // Start selector
  to?: string;              // End selector
  selector?: string;        // Element to select within
  startOffset?: number;     // Text offset start
  endOffset?: number;       // Text offset end
  stealth?: boolean;
}
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/select \
  -H 'Content-Type: application/json' \
  -d '{"selector": "p.content", "startOffset": 0, "endOffset": 50}' | jq .
```

---

### op: `eval`

Evaluate JavaScript in the page context via Chrome DevTools Protocol (`Runtime.evaluate`). Bypasses CSP restrictions.

**Request:**

```typescript
{
  expression?: string;     // JS expression (canonical field name)
  code?: string;           // Alias for expression (backwards-compatible)
  stealth?: boolean;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `expression` | `string` | Yes* | JavaScript expression to evaluate. *Either `expression` or `code` is required |
| `code` | `string` | No | Backwards-compatible alias for `expression` |

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/eval \
  -H 'Content-Type: application/json' \
  -d '{"expression": "document.title"}' | jq .
```

**Response:**

```json
{ "ok": true, "result": "Example Domain" }
```

**Example — extract data with an IIFE:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/eval \
  -H 'Content-Type: application/json' \
  -d '{"expression": "(() => { return Array.from(document.querySelectorAll(\"h2\")).map(h => h.textContent) })()"}' | jq .
```

**Behavior:** Attaches the Chrome debugger (`chrome.debugger.attach`), evaluates via `Runtime.evaluate` with `returnByValue: true` and `awaitPromise: true`, then detaches. Promises are automatically awaited.

> Source: `background.ts:389`

---

### op: `waitFor`

Wait for an element matching a CSS selector to appear in the DOM.

**Request:**

```typescript
{ selector: string; timeoutMs?: number; stealth?: boolean }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `selector` | `string` | Yes | — | CSS selector to wait for |
| `timeoutMs` | `number` | No | 5000 | Max wait time in ms |

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/waitFor \
  -H 'Content-Type: application/json' \
  -d '{"selector": ".results-loaded", "timeoutMs": 10000}' | jq .
```

> Supports self-healing when the selector fails.

---

### op: `getUrl`

Get the current URL of the tab.

**Request:**

```typescript
{ stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/getUrl \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response:**

```json
{ "ok": true, "result": "https://example.com/page" }
```

---

### op: `clean`

Remove ads, overlays, popups, and other noise from the page.

**Request:**

```typescript
{ mode?: 'css' | 'remove' | 'detect' | 'full'; stealth?: boolean }
```

| Mode | Description |
|------|-------------|
| `css` | Hide elements with CSS (`display: none`) |
| `remove` | Remove elements from DOM entirely |
| `detect` | Detect and report noise elements without removing |
| `full` | Aggressive cleanup: CSS hide + DOM remove + overlay dismissal |

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/clean \
  -H 'Content-Type: application/json' \
  -d '{"mode": "full"}' | jq .
```

---

### op: `screenshot`

Capture a screenshot of the current tab.

**Request:**

```typescript
{ stealth?: boolean }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/screenshot \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

---

### op: `record_api_action`

Record a user action for workflow recording. Typically called internally by the recording system.

**Request:**

```typescript
{
  action: {
    type: string;            // "click", "type", "navigate", etc.
    selector?: string;
    text?: string;
    key?: string;
    url?: string;
    timestamp: number;
    source: string;          // "api" or "user"
  };
  stealth?: boolean;
}
```

> Source: `chrome-extension/src/types.ts:22`, `background.ts:301`

---

## 3. LLM Routing

### POST /v1/dev/llm/prompt

Send a prompt to the best available LLM driver. The gateway resolves the target driver based on capability requirements, routing strategy, and driver health.

**Request:**

```typescript
interface PromptBody {
  prompt: string;                          // Required
  driver?: string;                         // Target specific driver by ID
  require?: Partial<DriverCapabilities>;   // Filter by capabilities
  strategy?: RoutingStrategy;              // 'best' | 'fastest' | 'cheapest' | 'round-robin'
  timeout_ms?: number;                     // Default: 120000
  conversation_id?: string;               // Continue conversation (PingApp drivers)
  tool?: string;                           // Activate tool (e.g., 'deep-research')
}
```

**Example — basic prompt:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Explain quantum entanglement in one paragraph"}' | jq .
```

**Response (200):**

```json
{
  "text": "Quantum entanglement is a phenomenon where particles become interconnected...",
  "driver": "gemini",
  "durationMs": 15432
}
```

**Example — capability-based routing:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Think step by step: derivative of x^3 * sin(x)?", "require": {"thinking": true}}' | jq .
```

**Example — specific driver:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Hello", "driver": "gemini"}' | jq .
```

**Example — PingApp tool activation:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Research quantum computing 2026", "driver": "gemini", "tool": "deep-research", "timeout_ms": 300000}' | jq .
```

**Response interface:**

```typescript
interface DeviceResponse {
  text: string;
  driver: string;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  thinking?: string;
  artifacts?: Array<{ type: 'image' | 'code' | 'file' | 'json'; data: string; mimeType?: string; filename?: string }>;
  conversation_id?: string;
  durationMs?: number;
}
```

**Errors:**

| Scenario | HTTP | errno | code |
|----------|------|-------|------|
| Missing `prompt` | 400 | `ENOSYS` | `ping.gateway.bad_request` |
| No matching driver | 404 | `ENOENT` | `ping.router.no_driver` |
| Driver busy | 409 | `EBUSY` | `ping.driver.concurrency_exceeded` |
| Timeout | 503 | `ETIMEDOUT` | `ping.driver.timeout` |
| I/O error | 502 | `EIO` | `ping.driver.io_error` |

> Source: `gateway.ts:232`

---

### POST /v1/dev/llm/chat

Multi-turn chat with message history. Accepts all `prompt` fields plus a `messages` array.

**Request:**

```typescript
interface ChatBody extends PromptBody {
  messages?: Message[];    // Full conversation history
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string; detail?: 'low' | 'high' }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_result'; toolCallId: string; content: unknown };
```

**Example — multi-turn:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Now explain it to a 5-year-old",
    "messages": [
      {"role": "system", "content": "You are a helpful physics tutor."},
      {"role": "user", "content": "What is gravity?"},
      {"role": "assistant", "content": "Gravity is the force that pulls objects toward each other..."},
      {"role": "user", "content": "Now explain it to a 5-year-old"}
    ]
  }' | jq .
```

**Example — vision (multimodal):**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": [
      {"type": "text", "text": "What do you see in this image?"},
      {"type": "image_url", "url": "https://example.com/photo.jpg", "detail": "high"}
    ]}],
    "require": {"vision": true}
  }' | jq .
```

**Validation:** At least one of `prompt` or `messages` must be provided, otherwise returns 400.

> Source: `gateway.ts:263`

---

### POST /v1/dev/:device/suggest

Get an LLM-powered contextual suggestion for a device interaction.

**Request:**

```typescript
{ context?: string; question: string }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | `string` | Yes | What you need help with |
| `context` | `string` | No | Current page context for the LLM |

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/suggest \
  -H 'Content-Type: application/json' \
  -d '{"question": "How do I add this item to cart?", "context": "Amazon product page with Add to Cart button"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "suggestion": "Click the 'Add to Cart' button using selector #add-to-cart-button",
  "confidence": 0.9
}
```

**Errors:**

| Scenario | HTTP | errno | code |
|----------|------|-------|------|
| Missing `question` | 400 | `ENOSYS` | `ping.gateway.bad_request` |

> Source: `gateway.ts:208`, `llm.ts:104`

---

## 4. Recorder

The recorder captures user and API interactions on a shared tab to build replayable workflows.

### POST /v1/record/start

Start recording on a device.

**Request:**

```typescript
{ device: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/record/start \
  -H 'Content-Type: application/json' \
  -d '{"device": "chrome-123"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "result": { "recording": true } }
```

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Missing `device` | 400 | `ENOSYS` |
| Device not found | 404 | `ENODEV` |

> Source: `gateway.ts:439`

---

### POST /v1/record/stop

Stop recording on a device.

**Request:**

```typescript
{ device: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/record/stop \
  -H 'Content-Type: application/json' \
  -d '{"device": "chrome-123"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "result": { "recording": false, "actions": 12 } }
```

> Source: `gateway.ts:470`

---

### POST /v1/record/export

Export the recorded workflow as a PingOS workflow definition.

**Request:**

```typescript
{ device: string; name?: string }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `device` | `string` | Yes | — | Device ID |
| `name` | `string` | No | `"recording"` | Workflow name |

```bash
curl -s -X POST http://localhost:3500/v1/record/export \
  -H 'Content-Type: application/json' \
  -d '{"device": "chrome-123", "name": "checkout-flow"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "result": {
    "name": "checkout-flow",
    "steps": [
      { "op": "navigate", "url": "https://example.com/cart" },
      { "op": "click", "selector": "#checkout-btn" },
      { "op": "type", "selector": "#email", "text": "user@example.com" }
    ],
    "inputs": {},
    "outputs": {}
  }
}
```

> Source: `gateway.ts:501`

---

### GET /v1/record/status

Get the current recording status for a device.

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `device` | `string` | Yes | Device ID |

```bash
curl -s "http://localhost:3500/v1/record/status?device=chrome-123" | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "result": {
    "recording": true,
    "actions": 5,
    "startedAt": 1708272000000
  }
}
```

> Source: `gateway.ts:532`

---

## 5. Self-Heal

The self-heal system automatically repairs broken CSS selectors at runtime using a cache + LLM fallback strategy.

### GET /v1/heal/cache

Dump the current selector healing cache.

```bash
curl -s http://localhost:3500/v1/heal/cache | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "cache": {
    "#old-selector||https://example.com": {
      "replacement": "#new-selector",
      "confidence": 0.92,
      "hits": 5
    }
  }
}
```

> Source: `gateway.ts:145`

---

### GET /v1/heal/stats

Get self-heal performance statistics.

```bash
curl -s http://localhost:3500/v1/heal/stats | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "enabled": true,
  "stats": {
    "attempts": 42,
    "successes": 35,
    "cacheHits": 20,
    "cacheHitSuccesses": 18,
    "llmAttempts": 22,
    "llmSuccesses": 17,
    "successRate": 0.833,
    "cacheHitRate": 0.476,
    "cacheHitSuccessRate": 0.9,
    "llmSuccessRate": 0.773
  }
}
```

| Stat | Description |
|------|-------------|
| `attempts` | Total heal attempts |
| `successes` | Successful heals (cache + LLM) |
| `cacheHits` | Times a cached replacement was tried |
| `cacheHitSuccesses` | Cache replacements that worked |
| `llmAttempts` | Times the LLM was consulted |
| `llmSuccesses` | LLM suggestions that worked |
| `successRate` | `successes / attempts` |
| `cacheHitRate` | `cacheHits / attempts` |
| `cacheHitSuccessRate` | `cacheHitSuccesses / cacheHits` |
| `llmSuccessRate` | `llmSuccesses / llmAttempts` |

> Source: `gateway.ts:149`

---

## 6. PingApps: Amazon

High-level Amazon actions. Requires an Amazon tab open and shared in the Chrome extension.

All Amazon PingApp routes auto-detect the Amazon domain from the current tab URL (amazon.com, amazon.ae, etc.).

### POST /v1/app/amazon/search

Search for products on Amazon.

**Request:**

```typescript
{ query: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/amazon/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "wireless headphones"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "search",
  "query": "wireless headphones",
  "products": [
    {
      "asin": "B09WX4GJ1S",
      "title": "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
      "price": "AED 1,299.00",
      "rating": "4.6 out of 5 stars",
      "reviews": "12,345 ratings",
      "img": "https://m.media-amazon.com/images/...",
      "prime": true,
      "url": "https://www.amazon.ae/dp/B09WX4GJ1S"
    }
  ],
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:421`

---

### POST /v1/app/amazon/product

Get details for a specific product by ASIN.

**Request:**

```typescript
{ asin: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/amazon/product \
  -H 'Content-Type: application/json' \
  -d '{"asin": "B09WX4GJ1S"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "product",
  "product": {
    "title": "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    "price": "AED 1,299.00",
    "rating": "4.6 out of 5 stars",
    "reviews": "12,345 ratings",
    "seller": "Amazon.ae",
    "availability": "In Stock",
    "prime": true,
    "images": ["https://..."],
    "features": ["Industry-leading noise cancellation", "..."],
    "asin": "B09WX4GJ1S",
    "url": "https://www.amazon.ae/dp/B09WX4GJ1S"
  },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:443`

---

### POST /v1/app/amazon/cart/add

Add the currently viewed product to cart. Must be on a product detail page.

**Request:** _(empty body)_

```bash
curl -s -X POST http://localhost:3500/v1/app/amazon/cart/add \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "addToCart", "deviceId": "chrome-123" }
```

**Behavior:** Clicks the `#add-to-cart-button` element.

> Source: `app-routes.ts:458`

---

### GET /v1/app/amazon/cart

View the current shopping cart.

```bash
curl -s http://localhost:3500/v1/app/amazon/cart | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "cart",
  "content": "Shopping Cart\n1 item...",
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:467`

---

### GET /v1/app/amazon/orders

View order history.

```bash
curl -s http://localhost:3500/v1/app/amazon/orders | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "orders",
  "content": "Your Orders\nOrder #123-456...",
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:477`

---

### GET /v1/app/amazon/deals

View current deals page.

```bash
curl -s http://localhost:3500/v1/app/amazon/deals | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "deals",
  "content": "Today's Deals\n...",
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:487`

---

### POST /v1/app/amazon/clean

Remove ads and visual noise from the current Amazon page.

```bash
curl -s -X POST http://localhost:3500/v1/app/amazon/clean \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "clean", "result": {}, "deviceId": "chrome-123" }
```

> Source: `app-routes.ts:498`

---

### GET /v1/app/amazon/recon

Run reconnaissance on the current Amazon page.

```bash
curl -s http://localhost:3500/v1/app/amazon/recon | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "recon",
  "recon": { "elements": [...], "regions": [...] },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:506`

---

**Common Amazon errors:**

| Scenario | HTTP | Response |
|----------|------|----------|
| Missing required field | 400 | `{ "ok": false, "error": "query required" }` |
| No Amazon tab open | 404 | `{ "ok": false, "error": "No Amazon tab open" }` |

---

## 7. PingApps: AliExpress

High-level AliExpress actions. Requires an AliExpress tab open and shared.

Locale is automatically set to `en_US` / `USD` before each operation.

### POST /v1/app/aliexpress/search

Search for products on AliExpress.

**Request:**

```typescript
{ query: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/aliexpress/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "bluetooth earbuds"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "search",
  "query": "bluetooth earbuds",
  "products": [
    {
      "id": "1005006789012345",
      "title": "Wireless Bluetooth 5.3 Earbuds...",
      "price": "$12.99",
      "rating": "4.8",
      "sold": "5000+ sold",
      "img": "https://ae01.alicdn.com/...",
      "url": "https://www.aliexpress.com/item/1005006789012345.html"
    }
  ],
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:274`

---

### POST /v1/app/aliexpress/product

Get details for a specific product by ID.

**Request:**

```typescript
{ id: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/aliexpress/product \
  -H 'Content-Type: application/json' \
  -d '{"id": "1005006789012345"}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "product",
  "product": {
    "title": "Wireless Bluetooth 5.3 Earbuds",
    "price": "$12.99",
    "originalPrice": "$25.99",
    "rating": "4.8",
    "reviews": "2,345 reviews",
    "store": "TechStore Official",
    "shipping": "Free shipping",
    "sold": "5000+ sold",
    "variants": [
      { "name": "Color", "options": ["Black", "White", "Blue"] }
    ],
    "url": "https://www.aliexpress.com/item/1005006789012345.html",
    "id": "1005006789012345"
  },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:296`

---

### POST /v1/app/aliexpress/cart/add

Add the currently viewed product to cart. Must be on a product detail page.

**Request:** _(empty body)_

```bash
curl -s -X POST http://localhost:3500/v1/app/aliexpress/cart/add \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "addToCart", "deviceId": "chrome-123" }
```

**Behavior:** Clicks the "Add to cart" button by text match.

> Source: `app-routes.ts:313`

---

### POST /v1/app/aliexpress/cart/remove

Remove an item from the cart by its index position.

**Request:**

```typescript
{ index?: number }   // default: 0 (first item)
```

```bash
curl -s -X POST http://localhost:3500/v1/app/aliexpress/cart/remove \
  -H 'Content-Type: application/json' \
  -d '{"index": 0}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "removeFromCart", "index": 0, "deviceId": "chrome-123" }
```

**Behavior:** Navigates to the cart page, finds the nth remove/delete button, and clicks it.

> Source: `app-routes.ts:324`

---

### GET /v1/app/aliexpress/cart

View the current shopping cart with item details.

```bash
curl -s http://localhost:3500/v1/app/aliexpress/cart | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "cart",
  "cart": {
    "items": [
      {
        "title": "Wireless Bluetooth 5.3 Earbuds",
        "price": "$12.99",
        "quantity": "1",
        "store": "TechStore Official"
      }
    ],
    "count": 1,
    "total": "$12.99"
  },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:342`

---

### GET /v1/app/aliexpress/orders

View order history.

```bash
curl -s http://localhost:3500/v1/app/aliexpress/orders | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "orders",
  "orders": {
    "orders": [
      {
        "orderId": "8012345678901234",
        "date": "Jan 15, 2026",
        "total": "$25.98",
        "status": "Completed"
      }
    ],
    "count": 1
  },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:354`

---

### GET /v1/app/aliexpress/orders/:orderId

View details for a specific order.

**Path parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `orderId` | `string` | AliExpress order ID |

```bash
curl -s http://localhost:3500/v1/app/aliexpress/orders/8012345678901234 | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "trackOrder",
  "orderId": "8012345678901234",
  "details": "Order ID: 8012345678901234\nStatus: Shipped...",
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:366`

---

### GET /v1/app/aliexpress/wishlist

View the wishlist.

```bash
curl -s http://localhost:3500/v1/app/aliexpress/wishlist | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "wishlist",
  "content": "My Wishlist\n...",
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:379`

---

### POST /v1/app/aliexpress/clean

Remove ads and visual noise from the current AliExpress page.

```bash
curl -s -X POST http://localhost:3500/v1/app/aliexpress/clean \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "clean", "result": {}, "deviceId": "chrome-123" }
```

> Source: `app-routes.ts:391`

---

### GET /v1/app/aliexpress/recon

Run reconnaissance on the current AliExpress page.

```bash
curl -s http://localhost:3500/v1/app/aliexpress/recon | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "recon",
  "recon": { "elements": [...], "regions": [...] },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:400`

---

**Common AliExpress errors:**

| Scenario | HTTP | Response |
|----------|------|----------|
| Missing required field | 400 | `{ "ok": false, "error": "query required" }` |
| No AliExpress tab open | 404 | `{ "ok": false, "error": "No AliExpress tab open" }` |

---

## 8. PingApps: Claude

High-level Claude.ai actions. Requires a Claude.ai tab open and shared.

### POST /v1/app/claude/chat

Send a message in the current Claude conversation.

**Request:**

```typescript
{ message: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the capital of France?"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "chat", "sent": "What is the capital of France?" }
```

**Behavior:** Types the message into `[data-testid="chat-input"]`, then clicks `button[aria-label="Send message"]`. Falls back to dispatching an Enter keydown event if the button click fails.

> Source: `app-routes.ts:519`

---

### POST /v1/app/claude/chat/new

Start a new conversation on Claude.ai.

**Request:** _(empty body)_

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/chat/new \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "newChat" }
```

> Source: `app-routes.ts:555`

---

### GET /v1/app/claude/chat/read

Read the latest assistant response from the current conversation.

```bash
curl -s http://localhost:3500/v1/app/claude/chat/read | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "read",
  "response": "The capital of France is Paris. It is the largest city in France and serves as..."
}
```

> Returns up to 5,000 characters of the last message.

> Source: `app-routes.ts:565`

---

### GET /v1/app/claude/conversations

List recent conversations from the sidebar.

```bash
curl -s http://localhost:3500/v1/app/claude/conversations | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "conversations": [
    {
      "title": "Quantum Computing Discussion",
      "url": "https://claude.ai/chat/abc123",
      "id": "abc123"
    }
  ]
}
```

> Returns up to 20 conversations, filtered to exclude navigation items.

> Source: `app-routes.ts:581`

---

### POST /v1/app/claude/conversation

Navigate to a specific conversation by ID.

**Request:**

```typescript
{ id: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/conversation \
  -H 'Content-Type: application/json' \
  -d '{"id": "abc123"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "openConversation", "id": "abc123" }
```

> Source: `app-routes.ts:590`

---

### GET /v1/app/claude/model

Get the currently selected model.

```bash
curl -s http://localhost:3500/v1/app/claude/model | jq .
```

**Response (200):**

```json
{ "ok": true, "model": "Claude 4.5 Sonnet" }
```

> Source: `app-routes.ts:603`

---

### POST /v1/app/claude/model

Switch the active model.

**Request:**

```typescript
{ model: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/model \
  -H 'Content-Type: application/json' \
  -d '{"model": "opus"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "setModel", "model": "opus" }
```

**Behavior:** Opens the model selector dropdown, searches for a matching option by text, and clicks it.

> Source: `app-routes.ts:612`

---

### GET /v1/app/claude/projects

List projects from the Claude.ai sidebar.

```bash
curl -s http://localhost:3500/v1/app/claude/projects | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "projects": [
    {
      "title": "My Research Project",
      "url": "https://claude.ai/project/proj_abc123",
      "id": "proj_abc123"
    }
  ]
}
```

> Returns up to 30 projects.

> Source: `app-routes.ts:638`

---

### POST /v1/app/claude/project

Navigate to a specific project.

**Request:**

```typescript
{ id: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/project \
  -H 'Content-Type: application/json' \
  -d '{"id": "proj_abc123"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "openProject", "id": "proj_abc123" }
```

> Source: `app-routes.ts:651`

---

### GET /v1/app/claude/artifacts

List artifacts from the Claude.ai artifacts page.

```bash
curl -s http://localhost:3500/v1/app/claude/artifacts | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "artifacts": [
    {
      "title": "React Component",
      "url": "https://claude.ai/artifacts/art_xyz789",
      "id": "art_xyz789"
    }
  ]
}
```

> Returns up to 30 artifacts.

> Source: `app-routes.ts:664`

---

### POST /v1/app/claude/upload

Upload a file to the current Claude conversation.

**Request:**

```typescript
{ filePath: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/upload \
  -H 'Content-Type: application/json' \
  -d '{"filePath": "/path/to/document.pdf"}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "upload", "filePath": "/path/to/document.pdf" }
```

**Behavior:** Targets `[data-testid="file-upload"]` input element.

> Source: `app-routes.ts:677`

---

### GET /v1/app/claude/search

Search conversations on Claude.ai.

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | Yes | Search term |

```bash
curl -s "http://localhost:3500/v1/app/claude/search?query=quantum" | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "search",
  "query": "quantum",
  "results": [
    {
      "title": "Quantum Computing Discussion",
      "url": "https://claude.ai/chat/abc123",
      "id": "abc123"
    }
  ]
}
```

> Returns up to 30 matching conversations.

> Source: `app-routes.ts:704`

---

### POST /v1/app/claude/clean

Clean the current Claude.ai page (minimal mode — less aggressive than full).

```bash
curl -s -X POST http://localhost:3500/v1/app/claude/clean \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Response (200):**

```json
{ "ok": true, "action": "clean", "result": {} }
```

> Source: `app-routes.ts:735`

---

### GET /v1/app/claude/recon

Run reconnaissance on the current Claude.ai page.

```bash
curl -s http://localhost:3500/v1/app/claude/recon | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "action": "recon",
  "recon": { "elements": [...], "regions": [...] },
  "deviceId": "chrome-123"
}
```

> Source: `app-routes.ts:744`

---

**Common Claude errors:**

| Scenario | HTTP | Response |
|----------|------|----------|
| Missing required field | 400 | `{ "ok": false, "error": "message required" }` |
| No Claude tab open | 404 | `{ "ok": false, "error": "No Claude tab open" }` |

---

## 9. Novel Features

### POST /v1/dev/:device/query

Natural language query about a page. Uses an LLM to identify the right CSS selector, then reads the element.

**Request:**

```typescript
{ question: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/query \
  -H 'Content-Type: application/json' \
  -d '{"question": "What is the current price?"}' | jq .
```

**Response (200):**

```json
{
  "answer": "$49.99",
  "selector": "span.price-value",
  "cached": false,
  "model": "openrouter"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `answer` | `string` | Extracted text from the matched element |
| `selector` | `string` | CSS selector the LLM chose |
| `cached` | `boolean` | Whether the selector was served from cache |
| `model` | `string` | LLM driver used (absent when cached) |

Results are cached by question hash — repeat queries skip the LLM call.

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Missing `question` | 400 | `ENOSYS` |
| Device not found | 404 | `ENODEV` |
| DOM unavailable | 502 | `EIO` |
| LLM parse error | 502 | `EIO` |

---

### POST /v1/dev/:device/watch

Subscribe to live data changes via Server-Sent Events. Polls the page at a configurable interval and emits events only when data changes.

**Request:**

```typescript
{ schema: Record<string, string>; interval?: number }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `schema` | `object` | Yes | — | Map of field names to CSS selectors |
| `interval` | `number` | No | 5000 | Polling interval in ms (min 1000) |

```bash
curl -s -N -X POST http://localhost:3500/v1/dev/chrome-123/watch \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"price": ".price-tag", "title": "h1"}, "interval": 3000}'
```

**Response (SSE stream):**

```
data: {"price":"$49.99","title":"Wireless Headphones","timestamp":1708272000000}

data: {"price":"$39.99","title":"Wireless Headphones","timestamp":1708272003000}
```

The connection stays open. Only changed data is emitted. Close the connection to stop.

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Missing `schema` | 400 | `ENOSYS` |
| Device not found | 404 | `ENODEV` |

---

### POST /v1/dev/:device/diff

Differential extraction — extract data and compare with the previous extraction.

**Request:**

```typescript
{ schema: Record<string, string> }
```

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-123/diff \
  -H 'Content-Type: application/json' \
  -d '{"schema": {"price": ".price-tag", "stock": ".availability"}}' | jq .
```

**Response (200) — first call (baseline):**

```json
{
  "changes": [],
  "unchanged": ["price", "stock"],
  "snapshot": { "price": "$49.99", "stock": "In Stock" },
  "previousSnapshot": null,
  "isFirstExtraction": true
}
```

**Response (200) — subsequent call with changes:**

```json
{
  "changes": [
    { "field": "price", "old": "$49.99", "new": "$39.99" }
  ],
  "unchanged": ["stock"],
  "snapshot": { "price": "$39.99", "stock": "In Stock" },
  "previousSnapshot": { "price": "$49.99", "stock": "In Stock" },
  "isFirstExtraction": false
}
```

State is tracked per device + schema combination.

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Missing `schema` | 400 | `ENOSYS` |
| Device not found | 404 | `ENODEV` |

---

### GET /v1/dev/:device/discover

Zero-shot site adaptation. Classifies the page type and generates extraction schemas using heuristics (no LLM needed, <100ms).

```bash
curl -s http://localhost:3500/v1/dev/chrome-123/discover | jq .
```

**Response (200):**

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

Supported page types: `product`, `search`, `article`, `feed`, `table`, `form`, `chat`, `unknown`.

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Device not found | 404 | `ENODEV` |

---

### POST /v1/apps/generate

Generate a PingApp definition from a URL and description. Uses LLM + optional live DOM.

**Request:**

```typescript
{ url: string; description: string }
```

```bash
curl -s -X POST http://localhost:3500/v1/apps/generate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://news.ycombinator.com", "description": "Hacker News front page"}' | jq .
```

**Response (200):**

```json
{
  "app": {
    "name": "hackernews",
    "url": "https://news.ycombinator.com",
    "description": "Hacker News front page reader",
    "selectors": {
      "title": { "tiers": [".titleline > a", ".storylink"] }
    },
    "actions": [...],
    "schemas": [...]
  },
  "model": "openrouter"
}
```

If a browser tab is open for the target URL, the live DOM is included for better results.

**Errors:**

| Scenario | HTTP | errno |
|----------|------|-------|
| Missing `url` or `description` | 400 | `ENOSYS` |
| LLM parse error | 502 | `EIO` |

---

### GET /v1/llm/models

List models from all registered LLM drivers.

```bash
curl -s http://localhost:3500/v1/llm/models | jq .
```

**Response (200):**

```json
{
  "drivers": [
    {
      "driver": "openrouter",
      "models": [
        { "id": "anthropic/claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "provider": "anthropic" },
        { "id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google" }
      ]
    },
    {
      "driver": "lmstudio",
      "models": [
        { "id": "llama-3-8b", "name": "llama-3-8b", "provider": "lmstudio" }
      ]
    }
  ]
}
```

---

## 10. Tab-as-a-Function

The functions namespace exposes connected browser tabs as callable functions with typed parameters.

### GET /v1/functions

List all callable functions across all connected tabs.

```bash
curl -s http://localhost:3500/v1/functions | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "functions": [
    {
      "name": "amazon.extract",
      "description": "Extract structured data from the page using a CSS-selector schema",
      "params": [
        { "name": "schema", "type": "object", "required": true, "description": "Map of field names to CSS selectors" }
      ],
      "returns": "object — extracted data matching the schema",
      "tab": "chrome-123"
    },
    {
      "name": "amazon.click",
      "description": "Click an element on the page",
      "params": [
        { "name": "selector", "type": "string", "required": true }
      ]
    }
  ]
}
```

### GET /v1/functions/:app

List functions for a specific app/tab.

```bash
curl -s http://localhost:3500/v1/functions/amazon | jq .
```

### POST /v1/functions/:app/call

Call a single function.

**Request:**

```typescript
{ function: string; params?: Record<string, unknown> }
```

```bash
curl -s -X POST http://localhost:3500/v1/functions/amazon/call \
  -H 'Content-Type: application/json' \
  -d '{"function": "amazon.extract", "params": {"schema": {"title": "h1", "price": ".price"}}}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "result": { "title": "Wireless Headphones", "price": "$49.99" }
}
```

### POST /v1/functions/:app/batch

Execute multiple function calls in sequence.

**Request:**

```typescript
{ calls: Array<{ function: string; params?: Record<string, unknown> }> }
```

```bash
curl -s -X POST http://localhost:3500/v1/functions/amazon/batch \
  -H 'Content-Type: application/json' \
  -d '{"calls": [
    {"function": "amazon.read", "params": {"selector": "h1"}},
    {"function": "amazon.click", "params": {"selector": ".add-to-cart"}}
  ]}' | jq .
```

**Response (200):**

```json
{
  "ok": true,
  "results": ["Wireless Headphones", {"clicked": true}]
}
```

---

## 11. WebSocket Protocol

The gateway exposes a WebSocket endpoint at `ws://localhost:3500/ext` for the Chrome extension bridge.

### Connection

```
ws://localhost:3500/ext
```

The extension connects on startup and reconnects with exponential backoff (1s base, 30s max).

### Extension → Gateway Messages

#### `hello`

Sent immediately after WebSocket connection opens. Announces the client and its shared tabs.

```json
{
  "type": "hello",
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "version": "0.1.0",
  "tabs": [
    {
      "deviceId": "chrome-123",
      "tabId": 123,
      "url": "https://example.com",
      "title": "Example"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | UUID generated per extension instance |
| `version` | `string` | Extension version |
| `tabs` | `ExtSharedTab[]` | Currently shared tabs |

The `hello` message is re-sent whenever the shared tab list changes (tab created, URL updated, tab closed, manual share/unshare). This serves as both initial announcement and incremental update.

> Source: `background.ts:663`

---

#### `ping`

Heartbeat message sent every 30 seconds.

```json
{ "type": "ping", "t": 1708272000000 }
```

If no `pong` is received within 90 seconds, the extension closes and reconnects.

> Source: `background.ts:272`

---

#### `device_response`

Response to a `device_request` from the gateway.

```json
{
  "type": "device_response",
  "id": "request-uuid",
  "ok": true,
  "result": "Example Domain"
}
```

```json
{
  "type": "device_response",
  "id": "request-uuid",
  "ok": false,
  "error": "Element not found: #nonexistent"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Matches `requestId` from the `device_request` |
| `ok` | `boolean` | Whether the command succeeded |
| `result` | `any` | Command result data (when `ok: true`) |
| `error` | `string` | Error message (when `ok: false`) |

> Source: `background.ts:641`

---

### Gateway → Extension Messages

#### `device_request`

Execute a command on a specific browser tab.

```json
{
  "type": "device_request",
  "requestId": "request-uuid",
  "device": "chrome-123",
  "command": {
    "type": "read",
    "selector": "h1"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | `string` | Unique ID for correlating with `device_response` |
| `device` | `string` | Target device ID (`chrome-{tabId}`) |
| `command` | `BridgeCommand` | The operation to execute (see [Device Operations](#2-device-operations)) |

> Source: `background.ts:216`

---

#### `pong`

Reply to a `ping` heartbeat.

```json
{ "type": "pong" }
```

---

#### `reload_extension`

Signal the extension to reload itself.

```json
{ "type": "reload_extension" }
```

Triggered by `POST /v1/extension/reload`. The extension calls `chrome.runtime.reload()` upon receipt.

> Source: `background.ts:210`

---

### Command Routing in the Extension

When the extension receives a `device_request`, it routes based on `command.type`:

| Command Type | Handler | Notes |
|-------------|---------|-------|
| `navigate` | `chrome.tabs.update()` | Bypasses content script, waits for load, re-injects |
| `eval` | `chrome.debugger` CDP `Runtime.evaluate` | Bypasses CSP, returns by value, awaits promises |
| `click` (with `cdp: true`) | `chrome.debugger` CDP `Input.dispatchMouseEvent` | Trusted mouse events for canvas apps |
| `press` (with `cdp: true`) | `chrome.debugger` CDP `Input.dispatchKeyEvent` | Trusted keyboard events |
| `type` (with `cdp: true`) | `chrome.debugger` CDP `Input.insertText` | Trusted text insertion |
| All others | `chrome.tabs.sendMessage()` → content script | Standard DOM operations with auto-retry on channel errors |

> Source: `background.ts:326-605`

---

### Tab Sharing Model

By default, **all HTTP/HTTPS tabs are automatically shared** as devices. The extension:

1. Auto-shares new tabs on `chrome.tabs.onCreated`
2. Updates device info on `chrome.tabs.onUpdated` (URL/title changes)
3. Removes devices on `chrome.tabs.onRemoved`
4. Users can manually unshare tabs via the popup (stored in `manualUnsharedTabs`)
5. Manually sharing a tab clears any previous unshare override

> Source: `background.ts:852-904`

---

## 12. Error Reference

All errors follow the `PingError` schema:

```typescript
interface PingError {
  errno: PingErrno;          // POSIX-style error number
  code: string;              // Domain-specific error code
  message: string;           // Human-readable description
  retryable: boolean;        // Whether client should retry
  retryAfterMs?: number;     // Suggested retry delay (ms)
  details?: unknown;         // Additional context
}
```

### errno → HTTP Status Mapping

| errno | HTTP | Description | Retryable | When it occurs |
|-------|------|-------------|-----------|----------------|
| `ENOENT` | 404 | No driver found | No | No driver matches required capabilities or specified driver ID doesn't exist |
| `ENODEV` | 404 | Device not found | No | Requested device not found (tab not shared or extension disconnected) |
| `EACCES` | 403 | Auth required | No | API driver rejected request due to invalid/missing API key |
| `EBUSY` | 409 | Resource busy | **Yes** | PingApp already processing another request (single concurrency) |
| `ETIMEDOUT` | 503 | Timeout | **Yes** | Request exceeded `timeout_ms` waiting for response |
| `EAGAIN` | 429 | Rate limited | **Yes** | Driver rate limited; check `retryAfterMs` |
| `ENOSYS` | 422 | Not implemented | No | Capability or operation not implemented by driver |
| `EOPNOTSUPP` | 422 | Op not supported | No | Specific operation not supported by this driver type |
| `EIO` | 502 | I/O error | **Yes** | Backend error, connection failure, or unexpected response |
| `ECANCELED` | 499 | Canceled | No | Request canceled by caller |

> Source: `errors.ts:10`

---

### Domain Code Reference

| Code | errno | Constructor | Description |
|------|-------|-------------|-------------|
| `ping.router.no_driver` | `ENOENT` | `ENOENT(device)` | No driver in registry matches required capabilities |
| `ping.registry.device_not_found` | `ENODEV` | `ENODEV(device)` | Requested device not found in registry |
| `ping.driver.auth_required` | `EACCES` | `EACCES(driver, reason)` | Driver requires authentication credentials |
| `ping.driver.concurrency_exceeded` | `EBUSY` | `EBUSY(driver)` | PingApp busy (single-concurrency browser driver). Returns `retryAfterMs: 5000` |
| `ping.driver.timeout` | `ETIMEDOUT` | `ETIMEDOUT(driver, ms)` | Request timed out |
| `ping.driver.rate_limited` | `EAGAIN` | `EAGAIN(driver, retryAfterMs)` | Rate limited. Returns `retryAfterMs` |
| `ping.driver.not_implemented` | `ENOSYS` | `ENOSYS(driver, capability)` | Requested capability not implemented |
| `ping.driver.op_not_supported` | `EOPNOTSUPP` | `EOPNOTSUPP(driver, op)` | Operation not supported |
| `ping.driver.io_error` | `EIO` | `EIO(driver, details?)` | I/O error (connection, unexpected response) |
| `ping.driver.canceled` | `ECANCELED` | `ECANCELED(driver)` | Request canceled |
| `ping.gateway.bad_request` | `ENOSYS` | _(inline)_ | Missing required fields in request body |
| `ping.gateway.internal` | `EIO` | _(inline)_ | Unexpected internal gateway error |
| `ping.gateway.device_not_found` | `ENODEV` | _(inline)_ | Device not found via extension bridge |

> Source: `errors.ts:32-149`, `gateway.ts:670`

---

### Error Examples

**Missing required field:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

```json
{
  "errno": "ENOSYS",
  "code": "ping.gateway.bad_request",
  "message": "Missing required field: prompt",
  "retryable": false
}
```

**Device not found:**

```bash
curl -s -X POST http://localhost:3500/v1/dev/chrome-999/read \
  -H 'Content-Type: application/json' \
  -d '{"selector": "h1"}' | jq .
```

```json
{
  "errno": "ENODEV",
  "code": "ping.gateway.device_not_found",
  "message": "Device chrome-999 not found",
  "retryable": false
}
```

**Driver busy:**

```json
{
  "errno": "EBUSY",
  "code": "ping.driver.concurrency_exceeded",
  "message": "Driver gemini is busy (single concurrency)",
  "retryable": true,
  "retryAfterMs": 5000
}
```

**Timeout:**

```json
{
  "errno": "ETIMEDOUT",
  "code": "ping.driver.timeout",
  "message": "Driver gemini timed out after 120000ms",
  "retryable": true
}
```

**Rate limited:**

```json
{
  "errno": "EAGAIN",
  "code": "ping.driver.rate_limited",
  "message": "Driver gemini rate limited",
  "retryable": true,
  "retryAfterMs": 10000
}
```
