# pingos-anthropic-proxy

A local Node.js proxy that sits between OpenClaw and Anthropic's API.

It uses two request paths:
- Path A: For simple message requests (no `tools`), it calls the real `claude` CLI (`claude --print --output-format stream-json`) and converts output to Anthropic-style responses.
- Path B: For tool-using requests (`tools` array present), it forwards directly to Anthropic with Claude Code-style headers, timing jitter, and sliding-window burst smoothing.

## Why this exists

This proxy makes OpenClaw traffic look like Claude Code CLI traffic while preserving tool-call compatibility.

## Configuration

Edit `config.json` as needed:
- `port`: listen port (default `8765`)
- `anthropic_base_url`: upstream Anthropic URL
- `cc_headers`: Claude Code fingerprint headers
- `jitter_min_ms` / `jitter_max_ms`: random forwarding delay
- `max_requests_per_2s`: sliding-window burst threshold
- `cli_path`: path to `claude` binary

## OpenClaw setup

Point OpenClaw to this proxy by changing base URL:
- `ANTHROPIC_BASE_URL=http://localhost:8765`

## Run

```bash
node src/server.js
```

Or use scripts:

```bash
npm start
npm run dev
npm run build
```

## Health and stats

```bash
curl http://localhost:8765/health
curl http://localhost:8765/stats
```

## systemd service install

```bash
sudo cp pingos-anthropic-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pingos-anthropic-proxy
sudo systemctl status pingos-anthropic-proxy
```

## Endpoint

- `POST /v1/messages`: main proxy endpoint

## Quick test

```bash
node src/server.js &
curl http://localhost:8765/health
```
