# Creating PingApps — End-to-End Tutorial

A PingApp is a "device driver" for a website. It wraps a live browser tab into structured API endpoints so callers use named actions like `POST /v1/app/mysite/search` instead of raw CSS selectors.

There are three paths to create a PingApp:

| Path | When to use | Effort |
|------|-------------|--------|
| **Manual (code)** | Full control, complex sites | High |
| **Recording** | Record a workflow in the browser, auto-generate | Medium |
| **LLM generation** | Describe what you want, let the LLM build it | Low |

---

## Path 1: Manual (Code)

This is the approach used for the built-in AliExpress, Amazon, and Claude apps.

**Source**: `packages/std/src/app-routes.ts`

### Step 1: Define a device finder

Every PingApp needs a function that locates its target browser tab by domain:

```typescript
function findMyAppDevice(gateway: string): Promise<string | null> {
  return findDeviceByDomain(gateway, 'myapp.com');
}
```

This scans `GET /v1/devices` and returns the first device whose URL contains the given domain string.

### Step 2: Write extractors

Extractors are self-contained IIFE strings that run in the page's JavaScript context via `deviceOp('eval', ...)`. They cannot import anything — pure vanilla DOM APIs only.

```typescript
const EXTRACTORS = {
  myAppSearch: `(() => {
    const items = [];
    document.querySelectorAll('.result-card').forEach(card => {
      const title = card.querySelector('h3')?.textContent?.trim() || '';
      const price = card.querySelector('.price')?.textContent?.trim() || '';
      const url = card.querySelector('a')?.href || '';
      if (title) items.push({ title, price, url });
    });
    return items.slice(0, 20);
  })()`,
};
```

**Rules for extractors**:
- Must be a single IIFE string (no imports, no external dependencies).
- Use vanilla DOM APIs only (`querySelector`, `querySelectorAll`, `textContent`).
- Limit results (typically 20 items max).
- Truncate long strings to prevent bloated responses.
- Handle missing elements gracefully with `?.` and `|| ''`.

### Step 3: Register routes

Inside `registerAppRoutes()` in `packages/std/src/app-routes.ts`:

```typescript
// POST /v1/app/myapp/search { query }
app.post('/v1/app/myapp/search', async (req, reply) => {
  const { query } = req.body as any;
  if (!query) return reply.code(400).send({ ok: false, error: 'query required' });

  const deviceId = await findMyAppDevice(gatewayUrl);
  if (!deviceId) return reply.code(404).send({ ok: false, error: 'No MyApp tab open' });

  const encoded = encodeURIComponent(query);
  await deviceOp(gatewayUrl, deviceId, 'eval', {
    expression: `window.location.href = "https://myapp.com/search?q=${encoded}"`
  });
  await delay(5000);

  const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
    expression: EXTRACTORS.myAppSearch
  });

  return { ok: true, action: 'search', query, results: result?.result || [], deviceId };
});
```

### Step 4: Register in the app list

Add your app to the `GET /v1/apps` response so it appears in discovery:

```typescript
{
  name: 'myapp',
  displayName: 'MyApp',
  version: '0.1.0',
  actions: [
    'POST /v1/app/myapp/search { query }',
  ],
}
```

### Step 5: Handle site-specific quirks

Common patterns from the existing PingApps:

| Pattern | Example |
|---------|---------|
| **Locale/cookie setup** | AliExpress sets USD locale cookies before navigation |
| **Domain auto-detection** | Amazon reads the current tab URL to preserve regional domains (`.ae`, `.co.uk`) |
| **Skip clean on data pages** | Amazon skips `fullCleanup()` on search results — it removes price/rating elements |
| **Fallback interactions** | Claude tries the send button first, falls back to dispatching an Enter keypress |
| **Stealth mode** | Claude uses `stealth: true` on type/click for human-like jitter |
| **Wait for page load** | Use `waitForPageLoad()` with a selector + fallback delay |

---

## Path 2: Recording

Record a browser workflow, then auto-generate a PingApp definition from the recording.

### Step 1: Start recording

```bash
curl -X POST http://localhost:3500/v1/record/start \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123"}'
```

Or via the Python SDK:

```python
from pingos import Browser

b = Browser()
tab = b.find('amazon')
tab.record_start()
```

### Step 2: Interact with the page

Perform the actions you want to automate — search, click, fill forms, extract data. The extension records all browser actions (clicks, keystrokes, navigations) and gateway-initiated API actions.

### Step 3: Stop and export

```bash
curl -X POST http://localhost:3500/v1/record/stop \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123"}'

curl -X POST http://localhost:3500/v1/record/export \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123"}'
```

### Step 4: Generate the PingApp

```bash
curl -X POST http://localhost:3500/v1/recordings/generate \
  -H "Content-Type: application/json" \
  -d '{"recording": {...exported recording...}, "name": "my-shopping-app"}'
```

The generator produces:

| File | Content |
|------|---------|
| `manifest.json` | Site metadata: name, URL, version |
| `workflows/{name}.json` | Ordered steps with op, selector, description |
| `selectors.json` | Selector entries with fallbacks and confidence scores |
| `tests/test_{name}.json` | Smoke test replaying the first 5 actions |

Selector confidence scoring:

| Selector pattern | Confidence |
|-----------------|------------|
| `#id` or `[id=...]` | 0.90 |
| `[data-testid=...]` | 0.85 |
| `[aria-label=...]` | 0.80 |
| `[name=...]` | 0.75 |
| Other CSS selectors | 0.50 |

### Step 5: Replay to verify

```bash
curl -X POST http://localhost:3500/v1/recordings/replay \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-123", "recording": {...}, "speed": 1.0}'
```

---

## Path 3: LLM Generation

Describe the site and what you want, and let the LLM generate the PingApp definition.

```bash
curl -X POST http://localhost:3500/v1/pingapps/generate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://news.ycombinator.com",
    "description": "Extract top stories with title, link, points, and comment count"
  }'
```

The `generatePingAppViaLLM` function:
1. Captures DOM context from the live page.
2. Sends the URL, description, and DOM context to the LLM.
3. Parses the LLM response into a PingApp JSON structure.
4. Runs a JSON-fix second pass if the initial parse fails.

This path requires an active LLM provider (OpenRouter, local model, etc.) configured in `~/.pingos/config.json`.

---

## The `site.json` Format

PingApps in the `projects/pingapps/` directory use a declarative `site.json` format. Here is the AliExpress example (`projects/pingapps/aliexpress/site.json`):

```json
{
  "name": "aliexpress",
  "displayName": "AliExpress",
  "version": "0.1.0",
  "description": "AliExpress shopping automation — search, browse, cart, orders, wishlist",
  "baseUrl": "https://www.aliexpress.com",
  "auth": {
    "method": "google-oauth",
    "account": "user@example.com",
    "loginUrl": "https://login.aliexpress.com/",
    "captcha": "slider",
    "checkSelector": "[class*=account], [class*=user-name]"
  },
  "locale": {
    "cookies": {
      "aep_usuc_f": "site=glo&c_tp=USD&region=AE&b_locale=en_US",
      "intl_locale": "en_US"
    }
  },
  "actions": {
    "search": {
      "description": "Search for products",
      "params": { "query": "string" },
      "steps": [
        { "op": "navigate", "url": "https://www.aliexpress.com/w/wholesale-{query}.html" },
        { "op": "clean", "mode": "full" },
        { "op": "extract", "name": "products" }
      ]
    },
    "product": {
      "description": "Get product details by URL or ID",
      "params": { "id": "string" },
      "url": "https://www.aliexpress.com/item/{id}.html"
    },
    "addToCart": {
      "description": "Add current product to cart",
      "selector": "text=Add to cart",
      "stealth": true
    },
    "viewCart": {
      "description": "View shopping cart",
      "url": "https://www.aliexpress.com/p/shoppingcart/index.html"
    }
  }
}
```

### `site.json` fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique app identifier (lowercase, no spaces) |
| `displayName` | no | Human-readable name |
| `version` | yes | Semantic version |
| `description` | no | Short description |
| `baseUrl` | yes | Default URL of the site |
| `auth` | no | Authentication configuration (method, loginUrl, checkSelector) |
| `locale` | no | Cookies or headers to set before navigation |
| `actions` | yes | Map of action name to action definition |

### Action definition fields

| Field | Description |
|-------|-------------|
| `description` | Human-readable action description |
| `params` | Map of parameter names to types (`string`, `number`) |
| `url` | URL template with `{param}` placeholders — navigates before executing |
| `steps` | Array of step objects (`{ op, ... }`) for multi-step actions |
| `selector` | CSS selector for single-click actions |
| `stealth` | Use human-like interaction timing |

---

## Running PingApp Workflows (Python SDK)

The Python SDK can load and execute `site.json` workflows:

```python
from pingos import Browser
from pingos.apps import run_workflow

b = Browser()
tab = b.find('aliexpress')

result = run_workflow(
    tab,
    app_name='aliexpress',
    workflow_name='search',
    inputs={'query': 'ESP32 development board'},
    output='results.json',
)

print(result['variables'])
```

Workflows support:
- **Conditional branching**: `if` / `then` / `else` with template conditions
- **Loops**: `loop` over lists with `as` variable binding
- **Error recovery**: `retry` (with exponential backoff), `skip` (with default value), `fallback` (run alternative steps), `abort`
- **Multi-tab**: Define `tabs` in the workflow to operate across multiple browser tabs
- **Template variables**: `{{query}}`, `{{results[0].title}}`, `{{items.length}}`
- **Persistence**: Save results to JSON, CSV, SQLite, or webhooks

See [PINGAPPS.md](PINGAPPS.md) for the full API reference of built-in PingApp endpoints.
