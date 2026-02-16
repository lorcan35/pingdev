# PingOS Hello World

A minimal self-contained example that starts the PingOS gateway with a mock "echo" driver. No external dependencies required — no Redis, no Chrome, no API keys, no running PingApps.

## Prerequisites

- Node.js 20+
- npm dependencies installed (`npm install` from repo root)

## Run

```bash
# From the repo root:
npx tsx examples/hello-world/start.ts
```

You should see:

```
PingOS Gateway running on http://localhost:3500
```

## Test

In another terminal:

```bash
# Health check
curl -s http://localhost:3500/v1/health | jq .
# {"status":"healthy","timestamp":"..."}

# List registered drivers
curl -s http://localhost:3500/v1/registry | jq .
# {"drivers":[{"id":"echo","name":"Echo Driver","type":"local",...}]}

# Send a prompt
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello world"}' | jq .
# {"text":"Hello from PingOS! You said: \"Hello world\"","driver":"echo","model":"echo-v1","durationMs":1}

# Test error handling — request a capability the echo driver doesn't have
curl -s http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","require":{"vision":true}}' | jq .
# {"errno":"ENOENT","code":"ping.router.no_driver","message":"No driver available for test","retryable":false}
```

## What this demonstrates

1. **Driver interface** — The echo driver implements the `Driver` interface with `health()` and `execute()` methods
2. **ModelRegistry** — The driver is registered with capabilities, and the gateway routes to it
3. **Capability routing** — Requesting a capability the driver doesn't have returns a proper `PingError`
4. **Gateway routes** — All 4 gateway endpoints work: `/v1/health`, `/v1/registry`, `/v1/dev/llm/prompt`, `/v1/dev/llm/chat`

## Next steps

- Replace the echo driver with a real backend (see [docs/DRIVERS.md](../../docs/DRIVERS.md))
- Add an Ollama local model: `OpenAICompatAdapter` with endpoint `http://localhost:11434`
- Connect a PingApp (browser-automated website shim) for capabilities like web search, image gen, deep research
