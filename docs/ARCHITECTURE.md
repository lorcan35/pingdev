# PingOS Architecture (Source-Audited)

> Audit basis: `packages/std/src/*`, `packages/core/*`, `packages/cli/*`, extension sources.
> Status: incrementally updated during full code audit.

## Package overview
- `packages/std`: Fastify gateway, extension bridge, route surface, feature engines (pipeline, template, visual, paginate, watch, recording/replay, app routes).
- `packages/core`: shared domain types/interfaces for drivers, requests/responses, config/runtime primitives.
- `packages/cli`: service lifecycle and UX commands (`init`, `up`, `down`, `status`, `doctor`, `demo`, `app`).
- `packages/chrome-extension`: browser-side ops implementation exposed to gateway via websocket bridge.
- `packages/dashboard`: web UI (management/inspection).
- `packages/mcp-server`: MCP-facing wrapper around PingOS APIs.
- `packages/python-sdk`: Python client wrapper for gateway endpoints.
- `packages/recon`: recon/snapshot tooling and generators.

## High-level data flow
1. Chrome extension connects to gateway (ExtensionBridge websocket upgrade).
2. Gateway maps tabs -> `deviceId` and exposes `/v1/dev/:device/:op`.
3. Route handlers may execute direct extension ops or feature engines.
4. LLM-dependent routes call either:
   - Driver registry (OpenAI-compatible driver), or
   - direct `llm.ts` call path (local/cloud, feature-routed).
5. Response is normalized to JSON (or SSE for watch streams).

## Pipeline engine
Source: `packages/std/src/pipeline-engine.ts`

### Step format
```ts
{ id, tab?, op, schema?, selector?, text?, template?, output?, onError? }
```

### Validation rules
- Pipeline requires `name` and non-empty `steps`.
- Each step requires unique `id` and required `op`.
- Tab is required for ops: `extract`, `click`, `type`, `read`, `navigate`.
- `transform` op requires `template`.
- `parallel` ids must exist in `steps`.

### Execution model
- Parallel steps (`pipeline.parallel`) run first with `Promise.allSettled`.
- Sequential steps then execute; `onError` controls skip/abort behavior.
- Variables:
  - each step stores output as `step.output || step.id`
  - object outputs are spread to top-level variables (excluding `_`-prefixed keys).
- Template interpolation via `resolveTemplate('{{var}}')`.

### Pipe shorthand
`PipelineEngine.parsePipeShorthand("extract:amazon:.price | transform:'Deal {{value}}'")`
translates to typed `PipelineDef` with generated step ids.

### Read fallback behavior
- `read` first calls extension op.
- On CSS-selector read errors, engine falls back to gateway HTTP `/v1/dev/:device/read`.

## Template engine
Source: `packages/std/src/template-learner.ts`

- Persistent store: `~/.pingos/templates/<domain>.json`.
- Template shape includes:
  - `domain`, `urlPattern`, `pageType`
  - `selectors` (primary CSS selectors)
  - `alternatives` (per-field fallback selectors)
  - `schema` (human schema text used during learning)
  - usage counters (`hitCount/successCount/failCount`).

### Learning flow
1. `learnTemplate()` obtains URL (`getUrl` -> shared tab fallback -> `eval window.location.href`).
2. Runs `discover` for page type.
3. Pulls `selectors_used` from extraction metadata when available.
4. Persists only if domain is known.

### Apply flow
1. Try primary selectors via `extract`.
2. If empty/failing, iterate `alternatives` and promote working selectors.
3. Retry full extraction.
4. Final fallback: schema-based extraction with namespacing to avoid HTML tag collisions (`title`, `meta`, etc.).

## Self-heal internals
Source: `packages/std/src/self-heal.ts`

- Triggered by gateway on selector-based op failures (`read/click/type/waitFor`).
- DOM capture path:
  - page clone -> remove noisy tags/attrs/hash classes -> compact -> truncate.
- Prompt path:
  - local/cloud prompt templates (`local-prompts`).
  - registry driver preferred when available; direct OpenAI-compatible fallback otherwise.
- Parse path: `repairLLMJson` expecting `{ selector, confidence, reasoning? }`.
- Cache interaction:
  - gateway tracks selector cache + hit stats.
  - cache is populated opportunistically on successful healing.

### Important disconnect
- `/v1/heal/stats` exposes gateway runtime counters.
- template counters and selector-cache persistence are separate concerns; they are not a single unified healing telemetry stream.

## PingApp generation
Sources: `pingapp-generator.ts`, recording routes in `gateway.ts`

1. Recording export merges:
   - extension-captured browser actions
   - gateway-captured API actions (navigate/extract/etc.)
2. `PingAppGenerator.generate(recording)` emits:
   - `manifest`
   - `workflow`
   - `selectors`
   - `test`
3. `serialize()` writes flat file map for scaffolding.
4. LLM generator (`generatePingAppViaLLM`) builds app JSON from URL+description+DOM context, with JSON-fix second pass.

## Discover / Visual / Paginate engines
- `discover-engine.ts`: pure heuristic classification (no LLM) for page type + starter schemas.
- `visual-extract.ts`: screenshot-first extraction via vision model; text fallback when no screenshot/vision model.
- `paginate-extract.ts`: iterative extract+paginate with dedupe, content-script reconnect handling, and local schema synthesis from query.

## `packages/core` highlights
- `src/types.ts`: shared job/state/config/action types.
- `src/api/routes.ts`: generic job/chat/sse API server routes for shim apps.
- `src/api/schemas.ts`: JSON-schema builders from `SiteDefinition`.
- `src/runtime/*`: selector registry, healing logs, runtime healer, test generator.
- `src/validator/*`: PingApp loader + validator pipeline.
- `src/scoring/*`: selector/action confidence and health reporting.

## CLI command surface (`packages/cli/src/index.ts`)
- Lifecycle: `pingos up|down|status|doctor|demo`
- App bootstrap: `pingos init`, `pingos app list|install`
- Device ops wrappers: `click|type|read|extract|fill|wait|table|dialog|paginate|select-option|navigate|hover|assert|network|storage|capture|upload|download|annotate|scroll|press|dblclick|select|clean|recon|observe|eval`
- Higher-level: `query`, `watch`, `diff`, `discover`, `record`, `functions`, `call`, `pipe`, `templates`

## Chrome extension operation registry
From `packages/chrome-extension/src/content.ts` and `src/ops/*`:
- Core: `click`, `type`, `read`, `extract`, `act`, `eval`, `waitFor`, `navigate`, `getUrl`, `recon`, `observe`, `clean`, `press`, `dblclick`, `select`, `scroll`, `discover`, `screenshot`, `watch`
- Extended ops:
  - `fill`, `wait`, `table`, `dialog`, `paginate`, `selectOption` (`select-option` API alias), `smartNavigate`, `hover`, `assert`, `network`, `storage`, `capture`, `upload`, `download`, `annotate`

## Notes
- Self-heal cache is populated during failed selector retries (runtime), not by a dedicated POST API.
- Pipeline `llm-prompt` style use cases still require active tab/device context when DOM is required for prompt construction.
