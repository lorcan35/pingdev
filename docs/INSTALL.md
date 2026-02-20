# Installation Guide

Get PingOS running from scratch. By the end you'll have the gateway serving HTTP on port 3500 and a shared browser tab responding to API calls.

---

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | Runtime for gateway and build tools |
| **npm** | 10+ | Package manager (bundled with Node) |
| **Chrome / Chromium** | Latest | Browser controlled via the MV3 extension |

Optional (only needed for PingApps with BullMQ job queues):

| Dependency | Version | Purpose |
|---|---|---|
| **Redis** | 7.0+ | Job queue backend for PingApp browser automation |

---

## 1. Clone and Build

```bash
git clone <repo-url> pingos
cd pingos
npm install
npm run build
```

This installs dependencies and compiles TypeScript across all workspace packages (`core`, `std`, `cli`, `recon`, `chrome-extension`, `dashboard`).

Verify the build:

```bash
npm run lint
# Should complete with no errors
```

---

## 2. Load the Chrome Extension

The extension is the bridge between the gateway and your browser tabs.

1. Build the extension (if not already built in step 1):

   ```bash
   cd packages/chrome-extension
   npm run build
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked**

5. Select the `packages/chrome-extension/dist/` directory

You should see "PingOS" appear in your extensions list with a green status indicator.

---

## 3. Start the Gateway

```bash
npx tsx packages/std/src/main.ts
```

You should see:

```
PingOS Gateway running on http://[::]:3500
```

The gateway listens on all interfaces (IPv4 and IPv6) by default. To customize:

```bash
# Custom port
PING_GATEWAY_PORT=4000 npx tsx packages/std/src/main.ts

# Custom host
PING_GATEWAY_HOST=127.0.0.1 npx tsx packages/std/src/main.ts
```

---

## 4. Verify

```bash
curl http://localhost:3500/v1/health
```

Expected response:

```json
{"status":"healthy","timestamp":"2026-02-18T12:00:00.000Z"}
```

Check that the extension bridge is ready:

```bash
curl http://localhost:3500/v1/devices
```

If the extension is connected, you'll see a `clients` array with your extension instance.

---

## 5. Share Browser Tabs

Open any website in Chrome (e.g., amazon.com), then:

1. Click the **PingOS extension icon** in the Chrome toolbar
2. Toggle **Share** on the tab you want to control
3. Note the device ID shown (e.g., `chrome-2114771645`)

The tab is now accessible via the gateway API.

---

## 6. First Test

Replace `{tabId}` with your actual device ID from step 5:

```bash
# Run reconnaissance on a shared tab
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/recon

# Read an element's text
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/read \
  -H "Content-Type: application/json" \
  -d '{"selector": "h1"}'

# Click a button
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "button.submit"}'
```

---

## 7. Using PingApps

With a website tab shared, the built-in PingApps are ready to use. Open an Amazon tab, share it, then:

```bash
# Search Amazon
curl -s -X POST http://localhost:3500/v1/app/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"query": "usb-c hub"}' | jq '.products[:3]'
```

List all available PingApps:

```bash
curl http://localhost:3500/v1/apps | jq '.apps[].name'
# "aliexpress"
# "amazon"
# "claude"
```

---

## Redis Setup (for PingApps with BullMQ)

Only needed if you're running standalone PingApps (compiled browser automation shims that use BullMQ job queues). The gateway itself does not require Redis.

```bash
# Linux
sudo apt install redis-server
sudo systemctl start redis-server

# macOS
brew install redis
brew services start redis

# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
# PONG
```

Configure a custom Redis URL:

```bash
export REDIS_URL=redis://127.0.0.1:6379
```

---

## DGX Spark Setup

PingOS is featured in **NVIDIA's DGX Spark developer guide**. The DGX Spark's 128 GB unified memory makes it ideal for running the full PingOS stack locally:

- **PingOS gateway** on port 3500
- **Ollama** with large models (Llama 3 70B, Mixtral) on port 11434
- **Multiple PingApp instances** with persistent Chrome sessions
- **Chrome** with multiple shared tabs

### Quick setup on DGX Spark

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3:70b

# Install PingOS
git clone <repo-url> pingos && cd pingos
npm install && npm run build

# Start everything
npx tsx packages/std/src/main.ts &
```

The 128 GB unified memory means you can run models that would require multiple GPUs on other hardware — all alongside PingOS and Chrome without swapping.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PING_GATEWAY_PORT` | `3500` | Gateway HTTP port |
| `PING_GATEWAY_HOST` | `::` | Gateway bind address |
| `PINGDEV_CDP_URL` | `http://127.0.0.1:9222` | Chrome DevTools Protocol URL (for standalone PingApps) |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection (for BullMQ PingApps) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (for Claude driver) |
| `OPENAI_API_KEY` | — | OpenAI API key (for GPT driver) |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `PINGDEV_LLM_URL` | Auto-detected | LLM endpoint for recon pipeline |
| `PINGDEV_LLM_MODEL` | Auto-detected | Model for recon pipeline |

---

## Troubleshooting

### Extension not connecting

**Symptom**: `curl http://localhost:3500/v1/devices` returns empty clients.

**Fix**:
1. Make sure the gateway is running first — the extension connects on load
2. Check the extension is loaded: go to `chrome://extensions/` and verify PingOS is enabled
3. Click the extension icon and check the popup for connection status
4. Try reloading the extension: click the refresh icon on `chrome://extensions/` or:
   ```bash
   curl -X POST http://localhost:3500/v1/extension/reload
   ```

### CORS issues

**Symptom**: Browser console shows CORS errors when calling the gateway from a web page.

**Fix**: The gateway does not add CORS headers by default. If calling from a browser context, use a proxy or run requests from the server side. For development, you can use a browser extension to disable CORS.

### Tab not found (ENODEV)

**Symptom**: API returns `{"errno":"ENODEV","code":"ping.gateway.device_not_found"}`.

**Fix**:
1. Verify the tab is shared: click the extension icon and check the toggle
2. Check the device ID: `curl http://localhost:3500/v1/devices | jq '.extension.devices[].deviceId'`
3. The tab may have navigated or been closed — share it again

### BFCache disconnects

**Symptom**: Tab stops responding after navigating back/forward.

**Fix**: Chrome's back-forward cache can suspend the content script. Navigate to a fresh URL or reload the tab, then re-share it via the extension popup.

### Port 3500 already in use

**Symptom**: `EADDRINUSE: address already in use :::3500`.

**Fix**:

```bash
# Find and kill the process
lsof -ti:3500 | xargs kill -9

# Or use a different port
PING_GATEWAY_PORT=3501 npx tsx packages/std/src/main.ts
```

### TypeScript build errors

```bash
# Clean build
npm run clean
npm run build

# If tsbuildinfo files are stale
rm -f packages/*/tsconfig.tsbuildinfo
npm run build
```

### Element not found (EIO)

**Symptom**: Device operations return `{"errno":"EIO","message":"Element not found: ..."}`.

**Fix**:
1. The page may not have loaded yet — add a delay or wait for the element
2. The selector may be wrong — use `recon` to discover available selectors:
   ```bash
   curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/recon
   ```
3. If self-heal is enabled, the gateway will automatically attempt to fix broken selectors using an LLM

---

## 8. MCP Server (AI Assistant Integration)

PingOS includes an MCP server that lets AI assistants (Claude Desktop, Cursor) control browsers directly through 15 tools and 3 resources.

### Setup for Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pingos": {
      "command": "node",
      "args": ["/path/to/pingdev/packages/mcp-server/dist/index.js"],
      "env": {
        "PINGOS_GATEWAY_URL": "http://localhost:3500"
      }
    }
  }
}
```

The gateway must be running first. See [docs/MCP.md](MCP.md) for full configuration including SSE mode and Cursor setup.

---

## Next Steps

- [API Reference](API.md) — Full endpoint documentation
- [Architecture](ARCHITECTURE.md) — How the pieces fit together
- [PingApps Guide](PINGAPPS.md) — Building compiled website drivers
- [Extract Engine](EXTRACT-ENGINE.md) — Pulling structured data from pages
- [Act Engine](ACT-ENGINE.md) — Stealth interaction with web elements
- [MCP Server](MCP.md) — AI assistant integration via Model Context Protocol
