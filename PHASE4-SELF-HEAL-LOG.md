# Phase 4 — JIT Self-Healing (Chrome Extension gateway)

## 2026-02-15

### Progress log
- Read project context (CLAUDE.md) and key modules: `packages/std/src/gateway.ts`, `packages/std/src/ext-bridge.ts`, `packages/chrome-extension/src/content.ts`.
- Identified current behavior:
  - Gateway `/v1/dev/:device/:op` forwards to `ExtensionBridge.callDevice()` and returns `{ ok: true, result }`.
  - Extension errors for missing selectors are surfaced as `PingError` with `errno=EIO` and message like `Element not found: ...` or `Timeout waiting for selector: ...`.
  - Content script supports `eval`, `getUrl`, and other ops needed for self-heal.
- Found config loader (`packages/std/src/config.ts`) currently lacks `selfHeal` fields; will extend with defaults.
- Vitest runs tests from `src/__tests__/**/*.test.ts` only.

### Next steps
- Implement `packages/std/src/self-heal.ts` (LLM-backed selector repair, DOM snapshot via extension `eval`).
- Implement `packages/std/src/selector-cache.ts` (disk-persisted cache in `~/.pingos/selector-cache.json`).
- Integrate into `gateway.ts` with retry logic + `_healed` metadata and add `/v1/heal/cache` + `/v1/heal/stats` endpoints.

### Update
- Added new modules:
  - `packages/std/src/selector-cache.ts` + `packages/std/src/selector-cache.js` (in-memory cache with debounced disk persistence; TTL default 7 days).
  - `packages/std/src/self-heal.ts` + `packages/std/src/self-heal.js` (captures DOM excerpt via extension `eval`, prompts an LLM endpoint, parses JSON response).
- Extended config loader:
  - `packages/std/src/config.ts` + `packages/std/src/config.js` now include `selfHeal` config merged with defaults (`DEFAULT_SELF_HEAL_CONFIG`).

### Integration work
- Integrated self-heal middleware into gateway:
  - `packages/std/src/gateway.ts` + `packages/std/src/gateway.js`
    - Loads config via `loadConfig()` and initializes `SelectorCache`.
    - Configures `self-heal` module with the live `ExtensionBridge`.
    - On selector-related `EIO` errors (element not found / waitFor timeout), tries:
      1) cached repaired selector
      2) LLM-generated selector (requires confidence >= `selfHeal.minConfidence`)
    - Returns `_healed` metadata when a repair succeeds.
    - Adds debug endpoints: `GET /v1/heal/cache` and `GET /v1/heal/stats`.
- Updated barrel exports:
  - `packages/std/src/index.ts` + `packages/std/src/index.js` now export `SelectorCache` and self-heal helpers.

### Test/CI notes
- `npx vitest run` initially failed because port `:3500` was already in use by an existing process. Freed the port and removed missing `sourceMappingURL` comments from new JS modules to avoid Vite sourcemap read errors.

### Final polish
- `/v1/heal/stats` now also returns derived rates (`successRate`, `cacheHitRate`, `cacheHitSuccessRate`, `llmSuccessRate`).
