# PingOS Chrome Extension Bridge

Chrome MV3 extension that bridges browser tabs to the PingOS gateway, enabling remote browser automation via the PingDev API.

## Features

- **Tab Sharing**: Share any tab with the PingOS gateway as a controllable device (`chrome-{tabId}`)
- **Bridge Executor**: Execute commands from gateway (click, type, read, extract, eval, navigate)
- **Passive Recorder**: Records user interactions and exports them as PingApp `defineSite()` definitions
- **WebSocket Client**: Connects to `ws://localhost:3500/ext` and maintains persistent connection
- **Dark UI**: Popup interface to manage shared tabs and connection status

## Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────┐
│ Chrome Extension│◄─────────────────────────►│   Gateway    │
│  (this package) │     /ext endpoint          │  :3500/ext   │
└─────────────────┘                            └──────────────┘
        │                                              │
        │ chrome.tabs.sendMessage                     │ HTTP
        ▼                                              ▼
┌─────────────────┐                         /v1/dev/:device/:op
│  Content Script │                            (forwarded to
│   (bridge exec) │                             extension if
└─────────────────┘                             device owned)
```

## Protocol

### WebSocket Messages (Extension → Gateway)

**Hello** (on connect):
```json
{
  "type": "hello",
  "clientId": "uuid",
  "version": "0.1.0",
  "tabs": [
    { "deviceId": "chrome-123", "tabId": 123, "url": "...", "title": "..." }
  ]
}
```

**Share Update** (when tabs change):
```json
{
  "type": "share_update",
  "clientId": "uuid",
  "tabs": [ ... ]
}
```

**Device Response** (command result):
```json
{
  "type": "device_response",
  "id": "request-uuid",
  "ok": true,
  "result": { ... }
}
```

### WebSocket Messages (Gateway → Extension)

**Device Request** (execute command):
```json
{
  "type": "device_request",
  "id": "request-uuid",
  "deviceId": "chrome-123",
  "op": "click",
  "payload": { "selector": "#button" }
}
```

## Build

```bash
npm install
npm run build     # Build to dist/
npm run watch     # Watch mode
npm run pack      # Create extension.zip
```

## Install

1. Build the extension: `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `packages/chrome-extension/dist/`

## Usage

1. Start PingOS gateway: `npm run dev` (in root)
2. Open extension popup (click toolbar icon)
3. Toggle tabs you want to share
4. Shared tabs become devices: `chrome-{tabId}`

### HTTP API Example

```bash
# Click a button in shared tab 123
curl -X POST http://localhost:3500/v1/dev/chrome-123/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#submit-btn"}'

# Type text
curl -X POST http://localhost:3500/v1/dev/chrome-123/type \
  -d '{"selector": "input[name=\"q\"]", "text": "search query"}'

# Read text
curl -X POST http://localhost:3500/v1/dev/chrome-123/read \
  -d '{"selector": ".result-text"}'

# Extract structured data
curl -X POST http://localhost:3500/v1/dev/chrome-123/extract \
  -d '{"schema": {"title": "h1", "price": ".price"}}'
```

## Tests

```bash
npm test
```

## Files

- `public/manifest.json` — MV3 manifest
- `src/types.ts` — Shared TypeScript types
- `src/background.ts` — Service worker (WebSocket client + tab manager)
- `src/content.ts` — Content script (bridge executor + recorder)
- `src/popup.ts` — Popup UI logic
- `public/popup.html` — Popup UI layout
- `build.mjs` — esbuild bundler
- `__tests__/` — Vitest tests

## Integration with PingDev

This extension integrates with `@pingdev/std/ext-bridge.ts` on the gateway side. The gateway:

1. Accepts WebSocket connections at `/ext`
2. Tracks shared tabs and device ownership
3. Routes `/v1/dev/:device/:op` HTTP calls to the owning extension
4. Falls back to driver registry if device not owned by extension

## Recording Interactions

The content script passively records:
- Click events (with generated selectors)
- Input events (with values)
- Navigation events

Export via popup → "Export Recorded Actions" → generates `defineSite()` PingApp code → copies to clipboard.

## Troubleshooting

### Extension shows "Disconnected"

Checklist:

1. Gateway is running and reachable:

```bash
curl -s http://localhost:3500/v1/health | jq .status
```

2. WebSocket endpoint is correct:

- Default: `ws://localhost:3500/ext`

If you're running the gateway on a different host/port, update `GATEWAY_URL` in `src/background.ts` and rebuild.

3. Localhost resolution:

- Chrome frequently resolves `localhost` to IPv6 (`::1`). The gateway defaults to binding on `::` (dual-stack) so this should work.

### API returns `ENODEV` / "Device chrome-123 not found"

This means the gateway does not currently consider the tab device "owned" by any extension client.

Checklist:

- The tab is **shared** in the extension popup
- You are using the exact device ID shown in the popup (`chrome-{tabId}`)
- The extension is connected (it must send `hello` / `share_update`)

### Commands fail with "Could not establish connection" / content script errors

The content script cannot run on certain pages:

- `chrome://` URLs
- Chrome Web Store pages
- Some restricted internal browser pages

Try on a normal `https://` page.

### Rebuilding doesn't change behavior

After `npm run build`, you must reload the extension:

1. Open `chrome://extensions/`
2. Click the **Reload** icon on the PingOS extension
3. Refresh the target page/tab

## License

MIT
