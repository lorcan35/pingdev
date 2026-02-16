# PingOS Extension + Gateway v2 hardening log

## 2026-02-15

### Initial file review (calls 1-5)
- `chrome-extension/src/content.ts`: bridge executor exists; needs upgrades per spec:
  - `type` only supports input/textarea via `.value`; must support contenteditable / ProseMirror / CodeMirror / React-controlled inputs via focus + InputEvent/KeyboardEvent.
  - `read` uses `querySelector` (single); must return array if multiple match.
  - `extract` assumes `schema` is object; will throw if `schema` is null/undefined (matches reported crash).
  - missing `waitFor` op.
  - `eval` currently returns `data: result`, but may need safe serialization for structured-clone to background.
- `chrome-extension/src/background.ts`: basic WS client; missing:
  - auto-inject content script into shared tabs on startup
  - reconnect w/ exponential backoff + heartbeat
  - re-inject on tab navigation (`tabs.onUpdated`)
  - robust connection state reporting
- `chrome-extension/src/types.ts`: missing `waitFor` in `BridgeCommand`; `DeviceRequest` shape includes unused `operation` (mismatch vs gateway).
- `std/src/ext-bridge.ts`: gateway-side bridge; protocol looks consistent with background (`device_response` uses `id`). Need add devices/status endpoints and request timing.

Reviewed remaining required files:
- `std/src/gateway.ts`: currently has POST /v1/dev/:device/:op route + extBridge WS upgrade; missing GET endpoints, graceful shutdown, request timing.
- `GATEWAY-CRASH-FIX.md`: confirms prior protocol mismatch fixed in `ext-bridge.ts`; also highlights need for content script reinjection after extension reload.
- `chrome-extension/public/popup.html` + `src/popup.ts`: basic dark UI + per-tab share toggle; needs connection status dot (green/yellow/red), share all/unshare all buttons, and shared tab listing should show device IDs (already does).

### Implemented changes (calls 13-22)
- `chrome-extension/src/types.ts`:
  - Added `waitFor` op to `BridgeCommand`.
  - Added richer `ConnectionStatus` with `state` and reconnect metadata.
  - Fixed `DeviceRequest` type shape (removed stray `operation`).
- `chrome-extension/src/content.ts`:
  - Added `waitFor` op (100ms polling, default 10s timeout).
  - `read` now uses `querySelectorAll` and returns array when multiple elements match.
  - `extract` now tolerates null/undefined schema; avoids Object.entries crash.
  - `type` now supports input/textarea + contenteditable (ProseMirror/CodeMirror/React) via focus + native value setter + InputEvent and execCommand fallback.
  - `eval` now returns JSON-safe serialized result (`toJsonSafe`) to avoid WS/JSON issues.
- `chrome-extension/src/background.ts`:
  - Auto-inject content script into shared tabs on startup/share and on tab navigation.
  - Reconnect w/ exponential backoff (3s, 6s, 12s… max 30s).
  - Heartbeat ping every 30s; closes stale connections (expects pong from gateway).
  - Connection state (`connected|connecting|disconnected`) exposed via `get_connection_status`.
- `chrome-extension/public/popup.html` + `src/popup.ts`:
  - Added green/yellow/red status dot classes.
  - Added Share All / Unshare All buttons.
- `std/src/ext-bridge.ts`:
  - Added ping/pong handling for heartbeat.
  - Added per-request timing log on `device_response`.
  - Added `getDeviceStatus()` for gateway status endpoint.
- `std/src/gateway.ts`:
  - Added request timing logs via Fastify `onResponse`.
  - Added `GET /v1/devices` and `GET /v1/dev/:device/status`.
  - Added optional standalone auto-start when run directly + SIGINT/SIGTERM shutdown.

### Build/test validation + follow-up fixes
- `npm run build` (chrome-extension): ✅ succeeded (esbuild warning about eval only).
- `npx tsc` (std): ✅ succeeded.
- `npx vitest run` (std): initially failed due to:
  - Runtime using committed `src/*.js` files (tests import `../gateway.js` / `../ext-bridge.js`). Those were out of sync with the updated TS sources, causing protocol mismatch.
  - Local gateway already listening on :3500 (EADDRINUSE) — killed the stray process.
  - `gateway.test.ts` depended on a live PingApp at :3456; added a small in-test mock server fallback.

Applied fixes:
- Updated `packages/std/src/ext-bridge.js` and `packages/std/src/gateway.js` to match the hardened protocol/features.
- Updated `packages/std/src/__tests__/gateway.test.ts` to spin up a minimal mock PingApp on :3456 if not already running.

Final status:
- ✅ `npm run build` (extension) passes
- ✅ `npx tsc` (std) passes
- ✅ `npx vitest run` (std) passes (54/54)
