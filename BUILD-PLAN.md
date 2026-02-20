# PingOS v0.2 — Build Plan

## TEAM ASSIGNMENTS

### Teammate 1: MCP Server (`packages/mcp-server`)
Build a full MCP server using `@modelcontextprotocol/sdk` (TypeScript SDK from npm).

**Tools to expose (MCP tools):**
- `pingos_devices` — list connected browser tabs
- `pingos_recon` — get page structure for a tab
- `pingos_observe` — human-readable actions available
- `pingos_extract` — extract structured data with schema
- `pingos_act` — execute instruction (click, type, navigate)
- `pingos_click` — click an element
- `pingos_type` — type text into element
- `pingos_read` — read element text
- `pingos_press` — press keyboard key
- `pingos_scroll` — scroll page
- `pingos_screenshot` — take screenshot
- `pingos_eval` — evaluate JavaScript
- `pingos_query` — natural language query (uses LLM to generate selector, then extract)
- `pingos_apps` — list available PingApps
- `pingos_app_run` — run a PingApp endpoint

**Resources to expose (MCP resources):**
- `pingos://devices` — live tab list
- `pingos://tab/{id}/dom` — page DOM snapshot
- `pingos://apps` — available PingApps

**Transport:** stdio (primary) + SSE HTTP (secondary, for web clients)

**Config:** Add MCP server entry point at `packages/mcp-server/src/index.ts`, register in monorepo workspace.

**Key:** The MCP server wraps our existing REST API — it's a thin adapter layer, NOT a rewrite. Import from `@pingdev/std` or just HTTP call `localhost:3500`.

**Install:** `npm install @modelcontextprotocol/sdk`

---

### Teammate 2: LLM Provider Drivers
Add 3 new LLM drivers to `packages/std/src/drivers/`:

**1. Anthropic Direct (`anthropic.ts` — UPDATE existing stub)**
- Auth: `x-api-key: <key>` header
- Endpoint: `https://api.anthropic.com/v1/messages`
- Models: claude-opus-4-6, claude-sonnet-4-6, etc.
- Config: `apiKeyEnv: 'ANTHROPIC_API_KEY'`
- Support `anthropic-version: 2023-06-01` header
- Handle streaming and non-streaming responses

**2. LM Studio (`lmstudio.ts` — NEW)**
- Auth: None required (local)
- Endpoint: `http://localhost:1234/v1/chat/completions` (OpenAI-compatible)
- Auto-discover models via `GET /v1/models`
- Config: `{ type: 'lmstudio', endpoint: 'http://localhost:1234' }`
- Fallback gracefully if LM Studio not running

**3. OpenAI Direct (`openai.ts` — NEW)**
- Auth: `Authorization: Bearer <key>` header
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Models: gpt-4o, gpt-4o-mini, o1, o3, etc. (NOT codex — API not available yet)
- Config: `apiKeyEnv: 'OPENAI_API_KEY'`

**All drivers must:**
- Implement the existing `Driver` interface from `types.ts`
- Register via `registry.register()` in `gateway.ts`
- Have auto-discovery (list models on connect)
- Appear in `GET /v1/llm/models` response
- Handle errors gracefully (connection refused, auth failed, rate limited)

**Update `config.ts`** to add `llmProviders.anthropic`, `llmProviders.openai`, `llmProviders.lmstudio` config sections.

---

### Teammate 3: Natural Language Query Engine + Novel Features
This is what makes us STAND OUT. Build features NO competitor has:

**Feature 1: Natural Language Query (`/v1/dev/:device/query`)**
- POST body: `{ "question": "what is the price of this product?" }`
- Flow: question → LLM generates CSS selector → extract from DOM → return structured answer
- Uses any configured LLM provider
- Cache generated selectors for repeated queries
- Example: `curl -X POST localhost:3500/v1/dev/tab1/query -d '{"question": "find all product prices"}'`

**Feature 2: Live Data Streams (`/v1/dev/:device/watch`)**
- SSE endpoint: client subscribes, gets real-time updates when page data changes
- POST body: `{ "schema": {"price": ".price-tag"}, "interval": 5000 }`
- Returns SSE stream: `data: {"price": "$29.99", "timestamp": 1234567890}`
- Uses MutationObserver in content.ts + polling fallback
- Add `case 'watch'` to content.ts message handler
- No competitor has real-time SSE from live browser tabs

**Feature 3: Differential Extraction (`/v1/dev/:device/diff`)**
- POST body: `{ "schema": {"title": "h1", "price": ".price"} }`
- Returns: `{ "changes": [{"field": "price", "old": "$39.99", "new": "$29.99"}], "unchanged": ["title"] }`
- Stores previous extraction result per tab+schema combo
- Perfect for monitoring/alerting use cases

**Feature 4: Schema Auto-Discovery (`/v1/dev/:device/discover`)**
- GET endpoint, no body needed
- LLM analyzes the page DOM and returns optimal extraction schemas
- Returns: `{ "schemas": [{"name": "product", "fields": {"title": "h1.title", "price": ".price-tag"}}, ...] }`
- "What CAN I extract from this page?" — answered automatically

**Feature 5: PingApp Generator (`/v1/apps/generate`)**
- POST body: `{ "url": "https://bestbuy.com", "description": "track product prices and availability" }`
- Uses recon + LLM to generate a full PingApp (manifest.json, workflows, selectors)
- Outputs to `projects/pingapps/<name>/`
- No competitor can auto-generate site-specific modules

**All new endpoints** must be added to:
1. `packages/std/src/gateway.ts` (routes)
2. `packages/chrome-extension/src/content.ts` (handlers for watch/diff)
3. `packages/python-sdk/pingos/browser.py` (Tab methods)
4. `packages/cli/src/index.ts` (CLI commands where relevant)

---

### Teammate 4: Integration + Tests + Docs
After teammates 1-3 finish their pieces:

1. **Wire MCP server** into the monorepo build (`pnpm build` must build it)
2. **Add MCP to CLI**: `pingdev mcp` starts the MCP server
3. **Update Python SDK** with new methods: `tab.query()`, `tab.watch()`, `tab.diff()`, `tab.discover()`
4. **Write tests** for all new features
5. **Update docs**: 
   - `docs/MCP.md` — MCP server setup, configuration, usage with Claude/Cursor
   - `docs/API.md` — append new endpoints
   - `docs/DRIVERS.md` — update with new LLM providers
   - `docs/NOVEL-FEATURES.md` — showcase unique features
6. **Update README.md** with new feature highlights
7. **Run full E2E test battery** to ensure nothing broke

---

## DEPENDENCIES
- Teammate 2 should finish first (LLM drivers needed by teammates 1 and 3)
- Teammate 3 depends on LLM drivers for query/discover/generate features
- Teammate 4 waits for all others, then integrates and tests
- Teammate 1 (MCP) can work in parallel with teammate 2

## KEY FILES TO READ FIRST
- `packages/std/src/gateway.ts` — main server, all routes
- `packages/std/src/types.ts` — Driver interface, types
- `packages/std/src/drivers/openrouter.ts` — reference driver implementation
- `packages/std/src/registry.ts` — driver registration
- `packages/std/src/config.ts` — configuration schema
- `packages/std/src/self-heal.ts` — LLM integration pattern
- `packages/chrome-extension/src/content.ts` — content script handlers
- `packages/python-sdk/pingos/browser.py` — Python Tab class
