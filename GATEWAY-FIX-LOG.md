# PingOS Gateway Fix Log

## 2026-02-15

- Read gateway + extension bridge code.
- Reproduced gateway running via `/tmp/start-gateway.mjs`.
- HTTP health works on both `127.0.0.1` and `localhost`.
- WebSocket tests:
  - `ws://127.0.0.1:3500/ext` ✅
  - `ws://localhost:3500/ext` ✅ (python resolves to IPv4)
  - `ws://[::1]:3500/ext` ❌ Connection refused

**Likely root cause:** Chrome may resolve `localhost` to IPv6 `::1` and the gateway is binding to IPv4-only (`127.0.0.1` or `0.0.0.0`), causing `ws://localhost:3500/ext` to fail with `ECONNREFUSED`.

Next: update gateway default host to `::` (dual-stack) and add `src/main.ts` entrypoint that listens on port 3500.

- Implemented fix: `createGateway()` now defaults `host` to `::` (dual-stack) instead of `0.0.0.0`.
- Added new entrypoint: `packages/std/src/main.ts` (env-configurable `PING_GATEWAY_HOST`/`PING_GATEWAY_PORT`).
- Compiled successfully: `cd packages/std && npx tsc`.

### Verification

- Started gateway from new entrypoint: `node packages/std/dist/main.js`
  - Startup log: `PingOS Gateway running on http://[::]:3500`
- HTTP: `curl http://localhost:3500/v1/health` → **200 OK**
- WebSocket:
  - `ws://127.0.0.1:3500/ext` ✅
  - `ws://localhost:3500/ext` ✅
  - `ws://[::1]:3500/ext` ✅ (fix confirmed)

### Chrome extension reconnect

- Found extension service worker target via `http://127.0.0.1:9222/json`.
- `Runtime.evaluate` could not access minified `f()` (background script appears to run as an ES module, so top-level bindings are not on `globalThis`).
- Triggered reconnect by evaluating `chrome.runtime.reload()` via CDP instead.

Gateway left running in background (OpenClaw session: `tide-basil`).
