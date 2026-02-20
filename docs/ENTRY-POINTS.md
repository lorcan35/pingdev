# PingOS Entry Points

Different paths for different developers. Pick the one that fits your workflow.

---

## CLI Developers

Start PingOS and interact via curl.

```bash
npx pingos up                    # start gateway + Chrome
npx pingos status                # check what's connected
npx pingos demo                  # run a quick extract demo

curl http://localhost:3500/v1/devices | jq '.devices[].id'
curl -X POST http://localhost:3500/v1/dev/chrome-{tabId}/extract \
  -H "Content-Type: application/json" \
  -d '{"query": "extract all headlines"}'
```

See: [Quick Start](QUICKSTART.md) | [API Reference](API.md) | [Operations](operations.md)

---

## Python Developers

Install the Python SDK and control browser tabs from Python.

```bash
pip install -e packages/python-sdk
```

```python
from pingos import Browser

browser = Browser()              # connects to localhost:3500
tab = browser.find('amazon')     # find tab by title/URL
data = tab.extract({"query": "product prices"})
print(data)

tab.click('#search-btn')         # click elements
tab.type('hello', selector='input')  # type text
print(tab.read('h1'))            # read element text
```

See: [Python SDK README](../packages/python-sdk/README.md)

---

## AI / MCP Developers

Connect PingOS to Claude Desktop, Cursor, or any MCP-compatible AI assistant.

```bash
pingdev mcp              # stdio mode (Claude Desktop)
pingdev mcp --sse        # SSE mode (web clients)
```

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pingos": {
      "command": "node",
      "args": ["<path-to-pingdev>/packages/mcp-server/dist/index.js"],
      "env": { "PINGOS_GATEWAY_URL": "http://localhost:3500" }
    }
  }
}
```

15 tools and 3 resources — your AI assistant can extract data, click buttons, fill forms, and run PingApps through natural language.

See: [MCP Server Guide](MCP.md)

---

## No-Code Users

Open the dashboard in your browser — no terminal required.

```
http://localhost:3500
```

The dashboard shows:
- Connected browser tabs
- Gateway health and status
- Try Extract — test extractions from the UI
- Active watches and recordings

Start the gateway first (`npx pingos up`), then open the dashboard URL.

---

## PingApp Developers

Build compiled website drivers that turn any site into a typed REST API.

```bash
# Record interactions, then generate a PingApp
curl -X POST http://localhost:3500/v1/record/start \
  -H "Content-Type: application/json" \
  -d '{"device": "chrome-{tabId}"}'

# ... interact with the website ...

curl -X POST http://localhost:3500/v1/record/stop
curl -X POST http://localhost:3500/v1/recordings/generate \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'
```

Or use the recon pipeline:

```bash
pingdev recon https://example.com
```

See: [PingApps Guide](PINGAPPS.md) | [Recon Pipeline](../CLAUDE.md)
