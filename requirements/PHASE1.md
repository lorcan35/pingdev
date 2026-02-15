# Phase 1 Requirements — POSIX Device Layer

## What Phase 1 Delivers

A unified HTTP gateway that routes requests across browser-backed PingApps, local models, and cloud APIs using capability-based routing. The gateway is a **thin routing layer on top of the existing PingApp infrastructure** — not a rewrite.

Phase 1 establishes the `@pingdev/std` package as the standard library for PingOS: types, error model, driver adapters, capability registry, routing strategies, and HTTP gateway.

---

## Architecture Decisions

These binding decisions were made after synthesizing three independent architecture assessments (Gemini, Claude, Codex) and prevent scope creep:

### 1. Gateway runs as a separate process

**Decision**: The gateway runs on port 3500 as its own Node.js process. PingApps remain independently runnable on their own ports (3456, 3457, 3458).

**Rationale**: This preserves the existing PingApp architecture completely. PingApps can be accessed directly (bypassing the gateway) or through the gateway. The gateway can run without any PingApps (API-only mode). No changes needed to `@pingdev/core`.

### 2. Capabilities are static, declared at registration

**Decision**: Driver capabilities are declared in config at registration time, not probed at runtime.

**Rationale**: Runtime capability probing is slow (requires an API call per driver), expensive (costs tokens for API backends), and unreliable (can fail due to network issues). Static declaration is simpler, faster, and sufficient for Phase 1. Dynamic capability discovery can be added later.

### 3. PingApp adapter uses existing `/v1/chat` endpoint

**Decision**: The `PingAppAdapter` calls the existing PingApp `/v1/chat` endpoint synchronously. No new endpoints added to PingApps.

**Rationale**: The existing PingApp HTTP contract is well-tested and stable. Adding a new protocol or modifying `@pingdev/core` would create unnecessary risk. The adapter translates between the gateway's `DeviceRequest`/`DeviceResponse` format and the PingApp's existing request/response format.

### 4. Dual-error design (errno + domain code)

**Decision**: Every error has both a POSIX errno (e.g., `ENOENT`) for machine routing and a domain code (e.g., `ping.router.no_driver`) for human debugging. Named constructors with sensible defaults.

**Rationale**: Synthesized from three assessments — Gemini rejected POSIX errors (too unfamiliar), Claude embraced them (clean API), Codex proposed both. The dual approach gives automated systems machine-parseable error categories for retry logic, while developers and logs get readable domain codes for root cause analysis.

### 5. Session affinity is a first-class request field

**Decision**: The `DeviceRequest` includes an `affinity` field with `key` and `sticky` properties. The registry tracks affinity mappings to ensure the same driver handles related requests.

**Rationale**: Browser-backed PingApps are stateful — they hold login sessions, tab context, conversation history. Routing a follow-up request to a different PingApp instance would lose all state. Codex was the only assessment to make this a first-class concern; the others handled it implicitly.

### 6. OpenAI-compatible adapter consolidation

**Decision**: One `OpenAICompatAdapter` class covers Ollama, LM Studio, OpenRouter, and any other OpenAI-format API. Only Anthropic (different API format) needs a separate adapter.

**Rationale**: Codex's key insight — these providers all speak the same protocol. Building 5 separate adapters would be 5x the code for identical behavior. The single adapter handles auth (optional), streaming (SSE), model listing, and token usage tracking.

### 7. Config location: `~/.pingos/config.json`

**Decision**: System-level config at `~/.pingos/config.json`, JSON format, with a built-in `DEFAULT_CONFIG` fallback.

**Rationale**: System-level config fits the "OS daemon" metaphor. JSON is dependency-free in Node.js (no YAML parser needed). The config loader merges user config with defaults, so only overrides need to be specified.

### 8. Versioned API routes

**Decision**: All routes use the `/v1/` prefix: `/v1/dev/llm/prompt`, `/v1/dev/llm/chat`, `/v1/registry`, `/v1/health`.

**Rationale**: API versioning is a hygiene investment that costs nothing now and prevents breaking changes later. Codex recommended this; Claude's original design used unversioned paths.

### 9. `@pingdev/core` is unchanged

**Decision**: No modifications to the existing PingApp engine. The gateway communicates with PingApps exclusively over HTTP.

**Rationale**: `@pingdev/core` is battle-tested with 19/19 tests passing on the Gemini shim. Modifying it risks breaking the existing pipeline for zero benefit. The HTTP interface provides clean separation.

---

## Success Criteria

Phase 1 is DONE when all 10 criteria are met:

| # | Criterion | Status | Verification |
|---|-----------|--------|-------------|
| 1 | `POST /v1/dev/llm/prompt` routes to Gemini and returns a text response | **PASS** | Integration test: sends "Say hello", verifies `text` field in response |
| 2 | `POST /v1/dev/llm/chat` supports multi-turn with messages array | **PASS** | Integration test: sends "What is 2+2?" with prompt, verifies response |
| 3 | `GET /v1/registry` shows registered drivers with capabilities | **PASS** | Integration test: verifies Gemini appears with correct capabilities |
| 4 | `GET /v1/health` returns `{ status: "healthy" }` | **PASS** | Integration test: verifies 200 with status field |
| 5 | Requesting unsupported capability returns `{ errno: "ENOENT", code: "ping.router.no_driver" }` | **PASS** | Integration test: requests `snapshotting: true`, verifies 404 with ENOENT |
| 6 | Missing prompt returns 400 with PingError | **PASS** | Integration test: sends empty body, verifies 400 with errno |
| 7 | OpenAI-compatible adapter covers Ollama/LM Studio/OpenRouter | **BUILT** | Code review: single adapter with auth, streaming, model listing |
| 8 | Anthropic adapter supports thinking chain extraction | **BUILT** | Code review: extracts thinking blocks from Anthropic SSE stream |
| 9 | Session affinity routes same key to same driver | **BUILT** | Code review: registry tracks affinity map, resolves sticky routes |
| 10 | All existing PingApp endpoints continue working unchanged | **PASS** | PingApp /v1/health returns healthy, /v1/chat returns responses |

**Integration test results**: 6/6 tests passing against live Gemini PingApp on `:3456`.

---

## What Was Built

### `@pingdev/std` — The Standard Library

| Module | Lines | Description |
|--------|-------|-------------|
| `types.ts` | 176 | Core type system: `Driver`, `DeviceRequest`, `DeviceResponse`, `DriverCapabilities`, `PingError`, `ContentPart`, `Message`, `StreamChunk`, `ModelInfo`, `DriverRegistration`, `DriverHealth` |
| `errors.ts` | 150 | 10 POSIX errno constructors (`ENOENT`, `EBUSY`, `ETIMEDOUT`, `EAGAIN`, `EACCES`, `ENOSYS`, `ENODEV`, `EOPNOTSUPP`, `EIO`, `ECANCELED`) + `mapErrnoToHttp()` |
| `registry.ts` | 157 | `ModelRegistry` class: registration, unregistration, capability matching, health monitoring (periodic polling), session affinity, routing strategy dispatch |
| `gateway.ts` | ~120 | Fastify server with 4 routes, request validation, PingError-to-HTTP error mapping |
| `config.ts` | 116 | `PingOSConfig` type, `DEFAULT_CONFIG` with 3 PingApps, `loadConfig()` file loader with fallback |
| `drivers/pingapp-adapter.ts` | 200 | Wraps running PingApps via `/v1/chat` and `/v1/health`. Translates between gateway and PingApp protocols |
| `drivers/openai-compat.ts` | 433 | OpenAI-compatible adapter: sync, streaming (SSE), model listing, multi-modal message conversion, token usage |
| `drivers/anthropic.ts` | 504 | Anthropic adapter: sync, streaming with thinking block extraction, system message handling, content block tracking |
| `routing/strategies.ts` | 106 | 4 strategy implementations: `best`, `fastest`, `cheapest`, `round-robin` |
| `__tests__/gateway.test.ts` | 161 | 6 integration tests against live Gemini PingApp |

### Total: ~2,100 lines of TypeScript across 10 source modules + tests

---

## What Was Reused (Unchanged)

A key Phase 1 principle is that existing, working code remains untouched. The gateway wraps existing PingApps via HTTP — it doesn't modify them.

| Component | Package | Status | Notes |
|-----------|---------|--------|-------|
| Browser automation engine | `@pingdev/core` | 100% reused | CDP connection, page management, state machine, response extraction |
| BullMQ job pipeline | `@pingdev/core` | 100% reused | Queue → Worker → Browser flow unchanged |
| SSE streaming (PingApp internal) | `@pingdev/core` | 100% reused | Hash stability detection, partial response extraction |
| Gemini PingApp | `gemini-ui-shim` | 100% reused | 6 tools, 19/19 tests, all endpoints unchanged |
| AI Studio PingApp | `pingapps/aistudio` | 100% reused | 10 actions, 13 features, 21 models |
| ChatGPT PingApp | `pingapps/chatgpt` | 100% reused | Basic chat flow |
| Recon snapshot engine | `@pingdev/recon` | 100% reused | SnapshotEngine, element capture, ARIA tree |
| PingApp code generator | `@pingdev/recon` | 100% reused | PingAppGenerator, SelfTester |
| Dashboard | `@pingdev/dash` | 100% reused | React UI (will be extended in Phase 2) |
| CLI tools | `@pingdev/cli` | 100% reused | Snapshot, generate, recon commands |

---

## Build Order (Completed)

| Sprint | Days | Deliverable | Status |
|--------|------|-------------|--------|
| 1 — Foundation | 1-2 | `types.ts`, `errors.ts`, `registry.ts`, `drivers/pingapp-adapter.ts` | Done |
| 2 — Gateway | 3-4 | `gateway.ts`, `config.ts`, `routing/strategies.ts`, integration tests | Done |
| 3 — API Backends | 5-6 | `drivers/openai-compat.ts`, `drivers/anthropic.ts` | Done |
| 4 — Dashboard + CLI | 7-8 | Registry UI, capability matrix, CLI commands | Phase 2 |
| 5 — Polish | 9-10 | Streaming normalization, `tools:run` bridge, end-to-end docs | Partial (docs done, streaming deferred) |

---

## What Was Deferred to Phase 2+

| Feature | Why deferred | Phase |
|---------|-------------|-------|
| **SSE streaming passthrough** | Gateway currently returns complete responses synchronously. Streaming from PingApps requires normalizing three different SSE formats (PingApp, OpenAI, Anthropic). | 2 |
| **`/v1/dev/llm/tools:run` bridge** | Lets any model use PingApps as tools. Requires tool-calling protocol design across drivers. | 2 |
| **Dashboard registry view** | React UI showing all drivers, health, capabilities. Requires frontend work. | 2 |
| **CLI commands** | `pingos start`, `pingos drivers list`, `pingos health`. Requires CLI framework. | 2 |
| **Runtime capability discovery** | Probe drivers for capabilities at startup instead of static config. Complex, risks startup latency. | 3 |
| **Policy-based routing** | Conditional routing with `when` clauses (e.g., "if tools required, prefer Gemini"). More expressive than priority numbers. | 3 |
| **Auto-healing on driver failure** | Detect browser crashes, attempt CDP restarts, snapshot artifacts for forensics. | 3 |
| **YAML config format** | More expressive than JSON for routing policies. Adds a dependency. | 3 |
| **Multi-model API backends** | An Ollama driver exposing multiple models (llama3, deepseek, qwen) and routing to specific models within a driver. | 2 |

### Deferred decisions — rationale

**SSE streaming passthrough**: The three backend types emit different SSE formats. PingApps use a custom format (`/v1/jobs/:id/stream`), OpenAI uses `data: {choices: [{delta: {content}}]}`, and Anthropic uses `content_block_delta` events. Normalizing these into a single gateway SSE stream is significant work (buffering, backpressure, error mid-stream) and not required for Phase 1's core value proposition of unified routing.

**Policy-based routing**: Codex proposed `when` clauses in routing policies (e.g., "if request requires tools, prefer Gemini over Ollama"). The current priority-number system is simpler and covers Phase 1 use cases. Policy routing adds a mini-DSL that needs parsing, validation, and documentation — better deferred until real-world routing needs emerge.

**Auto-healing**: Gemini proposed a HealthCheck daemon that detects PingApp browser crashes and attempts CDP restarts. This is valuable for production reliability but adds operational complexity. Phase 1 focuses on detecting failures (health checks) and reporting them (`PingError`), not automatically recovering from them.
