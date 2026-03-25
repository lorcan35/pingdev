# The `~/.pingos/` Directory

PingOS stores all persistent state in `~/.pingos/`. The directory is created automatically by `pingos up` if it does not exist.

The base path can be overridden with the `PINGOS_STORE_DIR` environment variable.

## File Reference

```
~/.pingos/
  config.json            # Main configuration file
  selector-cache.json    # Self-heal selector repair cache
  credentials.json       # Per-app authentication credentials
  gateway.pid            # PID of the running gateway process
  templates/             # Learned extraction templates per domain
    amazon.com.json
    aliexpress.com.json
    ...
  chrome-profile/        # Chrome user data directory for managed browser
```

### `config.json`

**Source**: `packages/std/src/config.ts`

The main PingOS configuration file. Loaded by `loadConfig()` at gateway startup, with missing fields falling back to built-in defaults.

```json
{
  "gatewayPort": 3500,
  "defaultStrategy": "best",
  "healthIntervalMs": 30000,
  "drivers": [
    {
      "id": "gemini",
      "type": "pingapp",
      "endpoint": "http://localhost:3456",
      "priority": 1,
      "capabilities": {
        "llm": true,
        "streaming": true,
        "vision": true,
        "toolCalling": true,
        "imageGen": true,
        "search": true,
        "deepResearch": true,
        "thinking": true
      }
    }
  ],
  "selfHeal": {
    "enabled": true,
    "llm": {
      "model": "auto"
    }
  },
  "llm": {
    "openrouter": {
      "apiKey": "sk-or-...",
      "defaultModel": "anthropic/claude-3.5-sonnet"
    }
  },
  "localMode": {
    "enabled": false,
    "llmBaseUrl": "http://localhost:1234/v1",
    "llmModel": "",
    "llmApiKey": "local",
    "domLimit": 5000,
    "jsonMode": true,
    "timeouts": {
      "query": 60000,
      "heal": 30000,
      "generate": 120000,
      "extract": 60000,
      "discover": 45000,
      "visual": 90000,
      "default": 60000
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gatewayPort` | number | `3500` | Port the gateway listens on |
| `defaultStrategy` | string | `"best"` | Driver routing strategy |
| `healthIntervalMs` | number | `30000` | Health check polling interval (ms) |
| `drivers` | array | 3 default apps | Registered driver/PingApp definitions |
| `selfHeal` | object | enabled | Self-heal engine configuration |
| `llm` | object | — | LLM provider API keys and models |
| `localMode` | object | disabled | Local LLM configuration (Ollama, LM Studio) |

### `selector-cache.json`

**Source**: `packages/std/src/selector-cache.ts`

Caches successful selector repairs from the self-heal engine. When a CSS selector breaks (site redesign, A/B test), the heal engine finds a replacement and stores it here for fast retries.

```json
{
  ".old-price-selector": {
    "repairedSelector": ".new-price-selector",
    "url": "https://www.amazon.com",
    "confidence": 0.85,
    "timestamp": 1711234567890,
    "hitCount": 12
  }
}
```

| Field | Description |
|-------|-------------|
| `repairedSelector` | The working replacement selector |
| `url` | URL origin pattern for scoping (e.g., `https://www.amazon.com`) |
| `confidence` | Repair confidence score (0-1) |
| `timestamp` | When the repair was last recorded |
| `hitCount` | Number of times this cached repair has been used |

Entries expire after **7 days** (configurable via `ttlMs`). The cache is flushed to disk with a 250ms debounce after writes.

### `credentials.json`

**Source**: `packages/python-sdk/pingos/auth.py`

Stores per-app authentication credentials used by PingApp workflow auth flows.

```json
{
  "aliexpress": {
    "EMAIL": "user@example.com",
    "PASSWORD": "..."
  },
  "youtube": {
    "EMAIL": "user@example.com"
  }
}
```

Credentials are loaded by `load_credentials(app_name)`. Environment variables take precedence — for example, `ALIEXPRESS_EMAIL` overrides the file-based value.

### `gateway.pid`

**Source**: `packages/cli/src/index.ts`

Contains the process ID of the running gateway. Written by `pingos up`, read by `pingos down` and `pingos status` to find and manage the gateway process.

```
12345
```

### `templates/`

**Source**: `packages/std/src/template-learner.ts`

Stores learned extraction templates, one JSON file per domain. Templates are created automatically when the extract engine successfully extracts data from a page, and are reused on subsequent visits to the same domain.

```
~/.pingos/templates/amazon.com.json
~/.pingos/templates/aliexpress.com.json
```

Each template file contains:

```json
{
  "domain": "amazon.com",
  "urlPattern": "https://www\\.amazon\\.com/.*",
  "pageType": "product",
  "selectors": {
    "title": "#productTitle",
    "price": ".a-price .a-offscreen"
  },
  "alternatives": {
    "title": ["h1#title", "[data-testid='product-title']"],
    "price": [".price-large", "#priceblock_ourprice"]
  },
  "schema": {
    "title": "Product title",
    "price": "Current price"
  },
  "hitCount": 47,
  "successCount": 45,
  "failCount": 2,
  "createdAt": 1711234567890,
  "updatedAt": 1711245678901
}
```

The template engine tries primary selectors first, falls back to alternatives on failure, and promotes working alternatives to primary position.

### `chrome-profile/`

**Source**: `packages/cli/src/index.ts`

Chrome user data directory used by `pingos up` when launching a managed Chrome instance. This preserves cookies, login sessions, and extension state across gateway restarts.

## Gateway Log

The gateway log file defaults to `/tmp/pingos-gateway.log` (not inside `~/.pingos/`). Override with `PINGOS_GATEWAY_LOG` environment variable.

**Source**: `packages/std/src/gw-log.ts`

All bridge events, device requests/responses, and errors are logged here in JSON-line format. Useful for debugging extension connectivity and request timing.
