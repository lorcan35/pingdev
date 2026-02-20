# PingOS MCP Server

The PingOS MCP server exposes the PingOS gateway as MCP tools and resources, enabling AI assistants like Claude Desktop, Cursor, and other MCP-compatible clients to control browsers, extract data, and run PingApps through natural language.

## What is MCP

The Model Context Protocol (MCP) is an open standard that allows AI assistants to discover and use external tools and resources. Instead of hardcoding integrations, an MCP server advertises its capabilities (tools, resources, prompts) and clients connect over stdio or SSE transport. This lets any MCP-compatible AI assistant interact with PingOS without custom code.

## Installation and Setup

### Build from source

From the repository root:

```bash
npm run build
```

This compiles all packages including the MCP server. The compiled entry point is:

```
packages/mcp-server/dist/index.js
```

### Run directly

```bash
node packages/mcp-server/dist/index.js
```

This starts the server in stdio mode (the default), suitable for Claude Desktop and Cursor.

### Run via CLI

```bash
pingdev mcp
```

### Prerequisites

The PingOS gateway must be running for the MCP server to function. By default, it connects to `http://localhost:3500`. Start the gateway first:

```bash
pingdev start
```

## Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

Replace `/path/to/pingdev` with the absolute path to your cloned repository.

After saving, restart Claude Desktop. You should see the PingOS tools available in the tools menu.

## Usage with Cursor

Open Cursor's MCP settings (Settings > MCP) and add a new server:

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

The configuration format is the same as Claude Desktop.

## Available Tools

The MCP server exposes 15 tools that map to PingOS gateway endpoints:

| Tool | Description | Parameters |
|------|-------------|------------|
| `pingos_devices` | List connected browser tabs (devices) managed by PingOS | none |
| `pingos_recon` | Get page structure / DOM snapshot from a device | `device` |
| `pingos_observe` | List available actions / interactive elements on a page | `device` |
| `pingos_extract` | Extract structured data from a device page | `device`, `query?`, `schema?` |
| `pingos_act` | Execute a natural language instruction on a device | `device`, `instruction` |
| `pingos_click` | Click an element by CSS selector | `device`, `selector` |
| `pingos_type` | Type text into an element | `device`, `text`, `selector?` |
| `pingos_read` | Read the text content of an element | `device`, `selector` |
| `pingos_press` | Press a keyboard key (e.g. Enter, Tab, Escape) | `device`, `key` |
| `pingos_scroll` | Scroll the page in a given direction | `device`, `direction?`, `amount?` |
| `pingos_screenshot` | Take a screenshot (returns base64 PNG or image content) | `device` |
| `pingos_eval` | Evaluate a JavaScript expression in the page context | `device`, `expression` |
| `pingos_query` | Ask a natural language question about a page | `device`, `question` |
| `pingos_apps` | List available PingApps | none |
| `pingos_app_run` | Run a PingApp action | `app`, `endpoint?`, `body?` |

Parameters marked with `?` are optional.

### Parameter Details

- **device** -- The device ID (tab ID) returned by `pingos_devices`. This identifies which browser tab to target.
- **selector** -- A CSS selector string (e.g. `#search-input`, `button[type="submit"]`).
- **direction** -- One of `up`, `down`, `left`, `right`. Defaults to `down` if omitted.
- **amount** -- Scroll amount in pixels.
- **query** -- A natural language description of what data to extract.
- **schema** -- A JSON Schema object describing the expected extraction result shape.
- **instruction** -- A natural language instruction like "click the login button" or "fill in the search box with laptops".
- **question** -- A natural language question about the page content.
- **app** -- The PingApp name (e.g. `aliexpress`, `amazon`, `claude`).
- **endpoint** -- The PingApp action endpoint (e.g. `search`, `product`, `cart`).
- **body** -- A JSON object to send as the request body to the PingApp endpoint.

## Available Resources

The MCP server exposes 3 resources that clients can read:

| URI | Description |
|-----|-------------|
| `pingos://devices` | Live list of connected browser tabs |
| `pingos://tab/{id}/dom` | Page DOM snapshot for a specific tab (via recon) |
| `pingos://apps` | List of available PingApps |

Resources return JSON and can be used by MCP clients that support the resource protocol. For example, a client can read `pingos://devices` to get the current tab list without invoking a tool.

## SSE Mode

For web-based MCP clients or scenarios where stdio transport is not suitable, the server supports Server-Sent Events (SSE) mode:

```bash
node packages/mcp-server/dist/index.js --sse --port 3600
```

Or via the CLI:

```bash
pingdev mcp --sse --port 3600
```

The default port is `3600` if `--port` is omitted.

### SSE Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sse` | Establish SSE connection (must be called first) |
| POST | `/messages` | Send MCP messages over the established SSE connection |
| GET | `/health` | Health check, returns `{"status":"ok","transport":"sse","port":3600}` |

SSE mode includes CORS headers (`Access-Control-Allow-Origin: *`) so web clients can connect directly.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PINGOS_GATEWAY_URL` | URL of the PingOS gateway | `http://localhost:3500` |

## Example Tool Calls

The following examples show the MCP tool call format and typical responses.

### List connected devices

**Request:**

```json
{
  "tool": "pingos_devices",
  "arguments": {}
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "[\n  {\n    \"id\": \"ABC123\",\n    \"url\": \"https://www.google.com\",\n    \"title\": \"Google\"\n  },\n  {\n    \"id\": \"DEF456\",\n    \"url\": \"https://chatgpt.com\",\n    \"title\": \"ChatGPT\"\n  }\n]"
    }
  ]
}
```

### Execute a natural language instruction

**Request:**

```json
{
  "tool": "pingos_act",
  "arguments": {
    "device": "ABC123",
    "instruction": "Type 'weather in Tokyo' into the search box and press Enter"
  }
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"result\": {\n    \"action\": \"type + press\",\n    \"selector\": \"textarea[name='q']\",\n    \"status\": \"completed\"\n  }\n}"
    }
  ]
}
```

### Run a PingApp action

**Request:**

```json
{
  "tool": "pingos_app_run",
  "arguments": {
    "app": "aliexpress",
    "endpoint": "search",
    "body": {
      "query": "wireless earbuds"
    }
  }
}
```

**Response:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"result\": {\n    \"items\": [\n      {\n        \"title\": \"Wireless Earbuds Bluetooth 5.3\",\n        \"price\": \"$12.99\",\n        \"rating\": 4.8\n      }\n    ]\n  }\n}"
    }
  ]
}
```
