# PingOS Quick Start

Get from zero to extracting data in 5 minutes.

---

## Prerequisites

| Requirement | Version |
|---|---|
| **Node.js** | 20+ |
| **npm** | 10+ (bundled with Node) |
| **Google Chrome** | Latest |

---

## 1. Install & Build

```bash
git clone <repo-url> pingos
cd pingos
npm install
npm run build
```

---

## 2. Start PingOS

```bash
npx pingos up
```

This does three things automatically:
1. Starts the gateway on `http://localhost:3500`
2. Launches Chrome with the PingOS extension loaded
3. Waits for the extension to connect

You'll see:

```
[up] Starting gateway...
[up] Gateway started (PID 12345)
[up] Launching Chrome: google-chrome
[up] Waiting for extension to connect...
[up] Connected! 1 tab(s) available

PingOS is running!
  Gateway: http://localhost:3500
  Dashboard: http://localhost:3500
```

> **Tip:** Use `npx pingos up --daemon` to run the gateway in the background.

---

## 3. Share a Tab

1. Open any website in Chrome (e.g., `https://news.ycombinator.com`)
2. Click the **PingOS extension icon** in the Chrome toolbar
3. Toggle **Share** on the tab

The tab is now a "device" — accessible via the REST API.

---

## 4. Extract Data

Find your device ID:

```bash
curl http://localhost:3500/v1/devices | jq '.devices[0].id'
# "chrome-2114771645"
```

Extract structured data with natural language:

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/extract \
  -H "Content-Type: application/json" \
  -d '{"query": "extract all headlines"}'
```

Or run the interactive demo:

```bash
npx pingos demo
```

This picks a connected tab and runs an extract automatically.

---

## 5. Verify Everything Works

```bash
npx pingos doctor
```

Doctor checks Node.js, Chrome, the gateway, extension connection, and more. All green means you're good to go.

Check running status anytime:

```bash
npx pingos status
```

---

## 6. Try More Operations

**Read an element:**

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/read \
  -H "Content-Type: application/json" \
  -d '{"selector": "h1"}'
```

**Click a button:**

```bash
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "button.submit"}'
```

**Use a PingApp (Amazon):**

Open an Amazon tab, share it, then:

```bash
curl -s -X POST http://localhost:3500/v1/app/amazon/search \
  -H "Content-Type: application/json" \
  -d '{"query": "mechanical keyboard"}' | jq '.products[:2]'
```

---

## 7. Shut Down

```bash
npx pingos down
```

---

## What's Next

| Path | Description |
|---|---|
| [Entry Points](ENTRY-POINTS.md) | Find the right path for your use case |
| [API Reference](API.md) | Full HTTP API with schemas and examples |
| [Operations Reference](operations.md) | All 32 device operations with curl examples |
| [Smart Extract](smart-extract.md) | 10-level extraction pipeline |
| [PingApps Guide](PINGAPPS.md) | Build compiled website drivers |
| [MCP Server](MCP.md) | AI assistant integration (Claude Desktop, Cursor) |
| [Architecture](ARCHITECTURE.md) | How the pieces fit together |

---

## Troubleshooting

**Gateway won't start?** Run `npx pingos doctor` to diagnose.

**Extension not connecting?** Make sure the gateway is running first, then reload the extension.

**Port 3500 in use?** Run `npx pingos down` or `lsof -ti:3500 | xargs kill -9`.

See [INSTALL.md](INSTALL.md) for the full installation guide with environment variables and advanced configuration.
