# PingOS Gateway crash fix — progress log

## 2026-02-15

- Read gateway sources:
  - `packages/std/src/gateway.ts`
  - `packages/std/src/ext-bridge.ts`
  - `packages/std/src/main.ts`
- Suspect the “silent exit after extension hello” is caused by an unhandled `EventEmitter` `'error'` event (common with `ws` / sockets on Node 24: unhandled errors can terminate the process).
- Added a centralized defensive logger at `packages/std/src/gw-log.ts`:
  - Writes all gateway logs to `/tmp/pingos-gateway.log`
  - Writes crash logs to `/tmp/pingos-crash.log` (and mirrors to gateway log)

### Update

- Wired logging + defensive error handling into:
  - `packages/std/src/main.ts`: `process.on('uncaughtException')` + `process.on('unhandledRejection')` → `/tmp/pingos-crash.log`
  - `packages/std/src/gateway.ts`: logs all HTTP requests/errors + server error + websocket upgrade flow → `/tmp/pingos-gateway.log`
  - `packages/std/src/ext-bridge.ts`: adds `wss.on('error')`, `ws.on('error')`, `socket.on('error')`; logs `hello`, `share_update`, and `device_response` handling; wraps upgrade + message handler in try/catch with logging.

### Root cause found

- The gateway’s `ExtDeviceRequest` protocol **did not match** the shipped extension’s `background.js` protocol.
  - Extension expects `device_request` as `{ device, command, requestId }`.
  - Gateway was sending `{ deviceId, op, payload, id }`.
  - Result: the extension ignored/mishandled requests and the gateway timed out.

### Fix

- Updated `packages/std/src/ext-bridge.ts` `device_request` format to match the extension:
  - Send `{ requestId, device: deviceId, command: { type: op, ...payload } }`.
  - Keep response handling via `{ type:'device_response', id: requestId, ok, result, error }`.
- Updated `packages/std/src/__tests__/ext-bridge.test.ts` to compile with the new protocol.

### E2E validation

- Shared Example Domain tab via CDP by writing `chrome.storage.local.sharedTabs` and reloading the extension.
- First request failed with: `"Could not establish connection. Receiving end does not exist."` (content script not injected after extension reload).
- Reloaded the tab (`chrome.tabs.reload(TAB_ID)`) so the manifest content script re-injects.
- ✅ Successful end-to-end curl:

```bash
curl -sS -X POST http://localhost:3500/v1/dev/chrome-2114771645/read \
  -H 'content-type: application/json' \
  -d '{"selector":"h1"}'
# -> {"ok":true,"result":"Example Domain"}
```
