# Changelog

All notable changes to PingOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-03-23

### Added

- **MCP Server** (`packages/mcp-server`) — 15 tools and 3 resources for AI assistant integration (Claude Desktop, Cursor); supports stdio and SSE transport modes
- **Smart Extract (Levels 1–10)** — 10-level extraction pipeline with progressive fallback: basic CSS (L1), zero-config auto-extract (L2), semantic/LLM (L3), JSON-LD/Schema.org (L4), multi-page pagination (L5), nested/recursive (L6), type-aware parsing (L7), Shadow DOM pierce (L8), visual/screenshot extraction (L9), template learning (L10)
- **Act Engine** — natural language browser control; parses compound instructions into typed steps with fuzzy element matching, ordinal selectors, and CDP trusted events
- **Natural Language Query** (`POST /v1/dev/:device/query`) — ask questions about a live page in plain English; LLM generates CSS selectors, results are cached by question hash
- **Live Data Streams / Watch** (`POST /v1/dev/:device/watch`, managed watch lifecycle via `WatchManager`) — SSE-based real-time change monitoring with MutationObserver detection and polling fallback
- **Differential Extraction** (`POST /v1/dev/:device/diff`) — field-level change detection between successive extractions with baseline snapshot tracking
- **Schema Auto-Discovery** (`GET /v1/dev/:device/discover`) — heuristic page classification (product, search, article, feed, table, form, chat) with auto-generated extraction schemas; no LLM required, runs in under 100ms
- **PingApp Generator** (`POST /v1/apps/generate`) — LLM-powered PingApp scaffolding from URL and description, with optional live DOM context for higher accuracy
- **Cross-Tab Pipelines** (`POST /v1/pipelines/run`, `/validate`, `/save`, `/pipe`) — chain operations across multiple browser tabs with variable interpolation and pipe shorthand syntax
- **Tab-as-a-Function** (`/v1/functions/*`) — expose PingApp actions as callable functions with batch execution support
- **Recordings system** (`/v1/record/*`, `/v1/recordings/*`) — record browser interactions, replay them, and generate PingApps from recordings
- **Template Learning** (`/v1/templates/*`) — persistent per-domain extraction templates with hit counts, success rates, import/export, and automatic fallback selector promotion
- **CDP Fallback** — automatic Chrome DevTools Protocol fallback when extension content script communication fails (CSP restrictions, bfcache eviction, disconnected port)
- **Self-Heal system** (`/v1/heal/*`) — LLM-powered automatic CSS selector repair on element-not-found errors, with caching and statistics tracking
- **PingApps: AliExpress** — search, product detail, cart management, orders, wishlist, and recon endpoints
- **PingApps: Amazon** — search, product detail, cart, orders, deals, and recon endpoints
- **PingApps: Claude** — chat, conversations, model switching, projects, artifacts, upload, and search endpoints
- **Local Mode** — fully local LLM/vision inference via LM Studio or Ollama; per-feature model overrides and timeout configuration
- **Dashboard** (`packages/dashboard`) — web UI for gateway management, device inspection, and interactive extraction testing
- **Visual Extract engine** — screenshot-first extraction via vision model with text fallback
- **Paginate Extract engine** — iterative extract+paginate with deduplication and content-script reconnect handling
- **Additional device operations**: `scroll`, `navigate`, `press`, `dblclick`, `select`, `screenshot`, `waitFor`, `getUrl`, `clean`, `record_api_action`
- **Expanded CLI commands**: `query`, `watch`, `diff`, `discover`, `record`, `functions`, `call`, `pipe`, `templates`, `fill`, `wait`, `table`, `dialog`, `paginate`, `select-option`, `hover`, `assert`, `network`, `storage`, `capture`, `upload`, `download`, `annotate`, `act`, `serve`, `heal`, `doctor`, `up`, `down`
- **DGX Spark documentation** — setup guide for NVIDIA DGX Spark with 128 GB unified memory

### Changed
- CLI command name standardized to `pingdev` across all documentation (the `pingos` alias still works)
- Package manager standardized to npm in documentation

## [0.2.0] — 2026-02-17

### Added
- `observe` op in chrome extension — answers "What can I do on this page?" with human-readable action list
- `observe` CLI command: `pingdev observe [DEVICE]` with colored output
- `read` CLI command: `pingdev read SELECTOR [DEVICE]`
- Python SDK: `Tab.observe()`, `Tab.wait()`, `Browser.find()` methods
- Python SDK: `Tab.__repr__` for nicer debugging output
- Python SDK: full README with API reference

### Fixed
- CLI `devices` command now shows cleaner table (ID, title, domain)
- CLI colored output (cyan headers, green success, yellow warnings)
- Python SDK `Tab.read()` handles both string and list responses

## [0.1.1] - 2026-02-15

Phase 2: **Chrome Extension Auth Bridge** — control real authenticated Chrome tabs via PingOS.

### Added

- **Chrome MV3 extension** (`packages/chrome-extension`)
  - WebSocket client connecting to `ws://localhost:3500/ext`
  - Tab sharing UX: shared tabs become devices named `chrome-{tabId}`
  - Content-script executor supporting: `read`, `click`, `type`, `extract`, `eval` (plus internal navigate/screenshot helpers)
  - Passive recorder to export starter `defineSite()` scaffolds from real user interactions

- **Gateway-side ExtensionBridge** (`packages/std/src/ext-bridge.ts`)
  - Accepts WebSocket upgrades at `/ext`
  - Tracks connected extension clients + shared tab ownership
  - Forwards device operations to the owning extension and awaits `device_response`

- **Generic device operation route** (`packages/std/src/gateway.ts`)
  - `POST /v1/dev/:device/:op` now forwards to extension-owned devices first
  - `llm/prompt` + `llm/chat` remain available as built-in device handlers

## [0.1.0] - 2026-02-15

Phase 1: POSIX Device Layer — initial release of `@pingdev/std`, the standard library for PingOS.

### Added

#### Core Types (`packages/std/src/types.ts`)
- `Driver` interface — unified contract for all backends (PingApp, API, local)
- `DeviceRequest` / `DeviceResponse` — standard request/response envelopes with routing fields (`driver`, `require`, `strategy`, `affinity`, `tool`)
- `DriverCapabilities` — 8 boolean capability flags (`llm`, `streaming`, `vision`, `toolCalling`, `imageGen`, `search`, `deepResearch`, `thinking`) + 4 optional operational fields
- `PingError` — dual-error type with POSIX errno + domain code + retryable flag
- `ContentPart` union type — multi-modal message format (text, image_url, tool_call, tool_result)
- `Message`, `StreamChunk`, `ModelInfo`, `DriverRegistration`, `DriverHealth`, `TokenUsage`, `Artifact` types

#### Error Model (`packages/std/src/errors.ts`)
- 10 named POSIX errno constructors: `ENOENT`, `EACCES`, `EBUSY`, `ETIMEDOUT`, `EAGAIN`, `ENOSYS`, `ENODEV`, `EOPNOTSUPP`, `EIO`, `ECANCELED`
- `mapErrnoToHttp()` — maps each errno to the correct HTTP status code
- Each constructor sets appropriate defaults (`retryable`, `retryAfterMs`, domain `code`)

#### Model Registry (`packages/std/src/registry.ts`)
- `ModelRegistry` class with driver registration, unregistration, and listing
- Capability-based filtering (`findByCapability`)
- Request routing with `resolve()` — filters by capabilities, health, affinity, then applies strategy
- Session affinity tracking (sticky routing for browser-backed PingApps)
- Periodic health monitoring (`startHealthChecks` / `stopHealthChecks`) with configurable interval

#### Gateway Server (`packages/std/src/gateway.ts`)
- Fastify HTTP server with `createGateway()` factory function
- `POST /v1/dev/llm/prompt` — single prompt routing with capability matching
- `POST /v1/dev/llm/chat` — multi-turn chat with messages array
- `GET /v1/registry` — list all registered drivers with capabilities
- `GET /v1/health` — gateway health check
- PingError-aware error handler mapping errno to HTTP status codes

#### Driver Adapters (`packages/std/src/drivers/`)
- `PingAppAdapter` — wraps running PingApps via their `/v1/chat` and `/v1/health` HTTP endpoints
- `OpenAICompatAdapter` — single adapter for all OpenAI-format APIs (Ollama, LM Studio, OpenRouter, OpenAI, Groq, Together, Mistral, vLLM). Supports sync, streaming (SSE), model listing, and token usage
- `AnthropicAdapter` — Anthropic Messages API adapter with thinking chain extraction, system message handling, and streaming with content block tracking

#### Routing Strategies (`packages/std/src/routing/`)
- `best` — lowest priority among online drivers, fallback to cheapest
- `fastest` — lowest latency from health check data
- `cheapest` — lowest priority number
- `round-robin` — rotating counter across candidates

#### Configuration (`packages/std/src/config.ts`)
- `PingOSConfig` / `DriverConfig` types
- `DEFAULT_CONFIG` with 3 pre-registered PingApps (Gemini :3456, AI Studio :3457, ChatGPT :3458)
- `loadConfig()` — reads `~/.pingos/config.json` with fallback to defaults

#### Integration Tests (`packages/std/src/__tests__/gateway.test.ts`)
- 6 tests passing end-to-end against live Gemini PingApp on port 3456
- Tests: health check, registry listing, prompt routing, chat routing, missing prompt validation, unsupported capability error

#### Project Infrastructure
- README with architecture diagram, getting started guide, API reference, concepts, troubleshooting
- Full documentation: Architecture, API Reference, Drivers, Contributing, Phase 1 Requirements
- `.editorconfig`, updated `.gitignore`, conventional commit convention
- Vitest test configuration with 120s timeout for live PingApp tests
