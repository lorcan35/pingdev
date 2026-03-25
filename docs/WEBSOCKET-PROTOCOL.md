# WebSocket Protocol — Extension to Gateway

> **Sources**: `packages/std/src/ext-bridge.ts` (gateway side), `packages/chrome-extension/src/background.ts` (extension side)

The Chrome extension connects to the PingOS gateway over a WebSocket to share browser tabs and execute device operations. This document specifies the protocol.

## Connection

### Endpoint

```
ws://localhost:3500/ext
```

The gateway's `ExtensionBridge` class listens for HTTP upgrade requests on the `/ext` path and promotes them to WebSocket connections via the `ws` library (`noServer` mode).

### Client Identity

Each extension instance generates a persistent `CLIENT_ID` via `crypto.randomUUID()` at service worker startup. This ID is sent in every `hello` and `share_update` message.

## Connection Flow

```
Extension                          Gateway
   |                                  |
   |--- WS connect ws://...:3500/ext ->|
   |                                  |  (upgrade accepted)
   |<-------- connection open --------|
   |                                  |
   |--- hello { clientId, tabs } ---->|  (gateway registers client + devices)
   |                                  |
   |--- ping { t } -------->         |  (every 30s)
   |<-------- pong { t } ------------|
   |                                  |
   |<-- device_request { device, command, requestId } --|
   |--- device_response { id, ok, result/error } ----->|
   |                                  |
   |--- share_update { tabs } ------->|  (on tab open/close/navigate)
   |                                  |
```

## Message Types

### `hello` (extension -> gateway)

Sent immediately after WebSocket open. Declares the extension client and its currently shared tabs.

```json
{
  "type": "hello",
  "clientId": "a1b2c3d4-...",
  "version": "0.1.0",
  "tabs": [
    {
      "deviceId": "chrome-123",
      "tabId": 123,
      "url": "https://amazon.com/...",
      "title": "Amazon.com"
    }
  ]
}
```

The gateway:
1. Stores the WebSocket mapped to `clientId`.
2. Records `lastSeen` timestamp.
3. Updates the device ownership map (`deviceId` -> `clientId`).

### `share_update` (extension -> gateway)

Sent whenever the set of shared tabs changes (tab created, closed, navigated, or manually toggled). Same shape as `hello.tabs`.

```json
{
  "type": "share_update",
  "clientId": "a1b2c3d4-...",
  "tabs": [...]
}
```

The gateway clears all previous device ownership for this client and rebuilds from the new tab list.

### `device_request` (gateway -> extension)

Sent when the gateway needs to execute an operation on a browser tab. This is triggered by HTTP calls to `/v1/dev/:device/:op`.

```json
{
  "type": "device_request",
  "requestId": "uuid-...",
  "device": "chrome-123",
  "command": {
    "type": "extract",
    "schema": { "title": "h1" }
  }
}
```

The `command` object always has a `type` field matching the operation name (`click`, `type`, `read`, `extract`, `eval`, `navigate`, `screenshot`, etc.).

### `device_response` (extension -> gateway)

Echoes back the `requestId` as `id` and reports success or failure.

```json
{
  "type": "device_response",
  "id": "uuid-...",
  "ok": true,
  "result": { "title": "Product Name" }
}
```

On failure:

```json
{
  "type": "device_response",
  "id": "uuid-...",
  "ok": false,
  "error": "Content script not responding after retry"
}
```

### `ping` / `pong` (bidirectional heartbeat)

The extension sends `ping` every 30 seconds. The gateway responds with `pong`, echoing the timestamp.

```json
{ "type": "ping", "t": 1711234567890 }
{ "type": "pong", "t": 1711234567890 }
```

### `reload_extension` (gateway -> extension)

Special command that triggers `chrome.runtime.reload()` on the extension. Used for remote hot-reload during development.

```json
{ "type": "reload_extension" }
```

### Recording commands (gateway -> extension)

The gateway can send recording control commands:

| Type | Purpose |
|------|---------|
| `record_start` | Start recording user interactions on a tab |
| `record_stop` | Stop recording |
| `record_export` | Export the recorded workflow |
| `record_status` | Query recording state |

These include `device` and `requestId` fields and are forwarded to the content script as `bridge_command` messages.

## Tab Sharing

### Default behavior

The extension **auto-shares all HTTP/HTTPS tabs** by default. Only `chrome://`, `chrome-extension://`, and other non-web URLs are excluded.

### Manual override

Users can manually unshare a tab via the popup UI. Manually unshared tabs are tracked in `chrome.storage.local` under `manualUnsharedTabs` and remain unshared until the user explicitly re-shares them.

### Device ID format

```
chrome-{tabId}
```

For example, Chrome tab ID `12345` becomes device `chrome-12345`.

### Sync triggers

The extension sends a `hello` (which doubles as a share update) on:
- Tab created
- Tab URL or title changed
- Tab closed (removed from shared list)
- Page load completed
- WebSocket reconnected

Updates are debounced by 200ms to avoid flooding the gateway.

## Reconnection

### Backoff strategy

The extension uses exponential backoff for reconnection:

```
delay = min(30_000, 1_000 * 2^attempt)
```

| Attempt | Delay |
|---------|-------|
| 0 | 1s |
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |
| 4 | 16s |
| 5+ | 30s (max) |

The attempt counter resets to 0 on successful connection.

### Reconnect triggers

- WebSocket `close` event
- WebSocket `error` event (forces close, then reconnects via `onclose`)
- Heartbeat stale detection (no pong received in 90 seconds)

### Content script re-injection

On reconnect, the extension re-injects `content.js` into all shared tabs via `chrome.scripting.executeScript`. This handles cases where the content script was orphaned during a gateway restart.

## Heartbeat

- **Interval**: 30 seconds
- **Stale threshold**: 90 seconds since last pong
- **Action on stale**: Force-close WebSocket, triggering reconnect flow

## Request Timeout

The gateway enforces a per-request timeout (default 20 seconds) on `device_request` calls. If the extension does not respond within the timeout:
1. The pending promise is rejected with `ETIMEDOUT`.
2. The `requestId` is removed from the pending map.

## Command Dispatch in the Extension

The extension handles `device_request` differently based on the command type:

| Command | Dispatch method |
|---------|----------------|
| `navigate` | `chrome.tabs.update(tabId, { url })` — bypasses content script entirely |
| `screenshot` | CDP `Page.captureScreenshot` via `chrome.debugger` |
| `eval` | CDP `Runtime.evaluate` via `chrome.debugger` — bypasses CSP |
| `click` (with `cdp: true`) | CDP `Input.dispatchMouseEvent` |
| `type` (with `cdp: true`) | CDP `Input.insertText` |
| `press` (with `cdp: true`) | CDP `Input.dispatchKeyEvent` (keyDown + char + keyUp) |
| All others | `chrome.tabs.sendMessage` to content script with retry on channel errors |

### Content script retry

If the initial message to the content script fails (channel closed, no connection, orphaned script), the extension:
1. Re-injects `content.js` into the tab.
2. Waits 500ms.
3. Retries the message once.

## Anti-Fingerprint

Before injecting the content script, the extension injects anti-fingerprint overrides into the `MAIN` world:
- `navigator.webdriver` returns `false`
- `navigator.plugins` returns a realistic plugin list

## Badge

The extension badge reflects the current state:
- **Green badge with tab count**: Connected, N tabs shared.
- **Red `!` badge**: Disconnected from gateway.
