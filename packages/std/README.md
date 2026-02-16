# @pingdev/std

PingOS Standard Library — the POSIX-style device layer.

This package provides:

- **Gateway** (`createGateway`) — Fastify HTTP server exposing `/v1/*`
- **ModelRegistry** — capability-based driver routing + health tracking
- **Driver adapters** — PingApps (browser shims), OpenAI-compatible APIs, Anthropic
- **Chrome Extension Auth Bridge** (`ExtensionBridge`) — turns authenticated Chrome tabs into devices (`chrome-{tabId}`)

> Repo context: this package is consumed by the PingOS monorepo gateway and by any external apps that want to embed a PingOS gateway.

---

## Install

Within the monorepo:

```bash
npm install
npm run build -w @pingdev/std
```

---

## Quick start: Gateway + registry-backed drivers

```ts
import {
  createGateway,
  ModelRegistry,
  PingAppAdapter,
  OpenAICompatAdapter,
  AnthropicAdapter,
} from '@pingdev/std';

const registry = new ModelRegistry('best');

registry.register(
  new PingAppAdapter({
    id: 'gemini',
    name: 'Gemini PingApp',
    endpoint: 'http://localhost:3456',
    priority: 1,
    capabilities: {
      llm: true,
      streaming: true,
      vision: true,
      toolCalling: true,
      imageGen: true,
      search: true,
      deepResearch: true,
      thinking: true,
    },
  }),
);

await createGateway({ port: 3500, registry });
console.log('PingOS gateway listening on http://localhost:3500');
```

The gateway binds to `host = '::'` by default (dual-stack) so Chrome can connect via `ws://localhost` (often IPv6).

---

## Chrome Extension Auth Bridge (authenticated tabs)

PingOS supports a second execution path for **real authenticated browser tabs**.

### What it does

- A Chrome MV3 extension connects to the gateway at `ws://localhost:3500/ext`.
- The user shares tabs in the extension popup.
- Each shared tab becomes a device named `chrome-{tabId}`.
- HTTP calls to `POST /v1/dev/chrome-{tabId}/{op}` are forwarded over `/ext` to the extension, which executes them via a content script.

This is ideal for:

- auth-heavy sites (SSO/MFA)
- anti-bot-protected pages
- debugging selectors in a real tab
- recording a workflow to bootstrap a compiled PingApp

### Enabling

`createGateway()` starts an `ExtensionBridge` by default — you do not need to register anything.

To provide your own instance:

```ts
import { createGateway, ExtensionBridge } from '@pingdev/std';

const extBridge = new ExtensionBridge();
await createGateway({ port: 3500, registry, extBridge });
```

### HTTP routes

The gateway exposes a generic device operation route:

- `POST /v1/dev/:device/:op`

Routing rules:

1. If `device` is currently owned by the extension bridge, the call is forwarded to the extension.
2. Otherwise, the gateway falls back to built-in device handlers (currently only `llm/prompt` and `llm/chat`).

For shared tabs:

- `POST /v1/dev/chrome-{tabId}/read` — `{ selector }` → `{ ok: true, result: string }`
- `POST /v1/dev/chrome-{tabId}/click` — `{ selector }`
- `POST /v1/dev/chrome-{tabId}/type` — `{ selector, text }`
- `POST /v1/dev/chrome-{tabId}/extract` — `{ schema: { field: selector } }`
- `POST /v1/dev/chrome-{tabId}/eval` — `{ code }`

See the repository-level docs:

- `docs/API.md` — full schemas + working curl examples
- `packages/chrome-extension/README.md` — extension build/install/usage

### WebSocket protocol (`/ext`)

**Extension → Gateway**

- `hello` (on connect)
- `share_update` (when shared tabs change)
- `device_response` (response to a forwarded command)

**Gateway → Extension**

- `device_request` (execute a command on a shared tab)

Example shapes:

```json
{
  "type": "hello",
  "clientId": "uuid",
  "version": "0.1.0",
  "tabs": [
    { "deviceId": "chrome-123", "tabId": 123, "url": "https://example.com", "title": "Example" }
  ]
}
```

```json
{
  "type": "device_request",
  "requestId": "request-uuid",
  "device": "chrome-123",
  "command": { "type": "read", "selector": "h1" }
}
```

```json
{
  "type": "device_response",
  "id": "request-uuid",
  "ok": true,
  "result": "Example Domain"
}
```

---

## Exports (high level)

- Gateway: `createGateway`
- Registry: `ModelRegistry`
- Adapters: `PingAppAdapter`, `OpenAICompatAdapter`, `AnthropicAdapter`
- Extension bridge: `ExtensionBridge`
- Types: `DeviceRequest`, `DeviceResponse`, `Driver`, `DriverRegistration`, `DriverCapabilities`, `PingError`, …

---

## Development notes

- The gateway’s WebSocket upgrade handler is attached directly to `app.server.on('upgrade', ...)`.
- The extension bridge maintains a `deviceId → clientId` ownership map based on `hello` / `share_update`.
- Calls forwarded to the extension use an internal request/response correlation ID with timeouts (default ~20s).
