# PingOS Gemini

A local HTTP API server that automates the Gemini web UI (gemini.google.com) via browser automation (Playwright CDP). It exposes a REST API so other tools/agents can use Gemini's ULTRA-tier features programmatically.

## Features

### Phase 1 — Core
- **REST API** — Fastify HTTP server on port 3456
- **Async jobs** — Submit prompts via `POST /v1/jobs`, poll with `GET /v1/jobs/:id`
- **Sync convenience** — `POST /v1/chat` blocks until response is ready
- **Health checks** — `GET /v1/health` reports browser, queue, and worker status
- **Browser automation** — Connects to existing Chromium via CDP (port 18800)
- **Tiered selectors** — ARIA role+name (Tier 1) → data-test-id (Tier 2) → CSS fallback (Tier 3)
- **State machine** — Tracks UI state: IDLE → TYPING → GENERATING → DONE/FAILED
- **Response polling** — Hash-based stability detection (not fixed delays)
- **Artifact logging** — Per-job: request.json, timeline.jsonl, response.md
- **Job queue** — BullMQ (Redis-backed) with single-concurrency per tab

### Phase 2 — Tools Support
- **Tool activation/deactivation** — Generic system: open Tools menu → toggle → verify chip
- **Deep Research** — Multi-phase: plan generation → "Start research" → result extraction
- **Create Videos (Veo 3.1)** — Long-poll video generation (240s default timeout)
- **Create Images** — Image generation with download/share/copy detection
- **Canvas** — Code/writing with Monaco editor extraction from `.view-line` elements
- **Guided Learning** — Structured educational responses with images and follow-ups
- **Deep Think** — Extended thinking with thinking panel extraction
- **Mode switching** — Fast / Thinking / Pro modes via mode picker

### Observability & Rate Limiting
- **Real-time status** — `GET /v1/jobs/:id/status` with substates, elapsed time, partial response
- **Thinking extraction** — `GET /v1/jobs/:id/thinking` for reasoning/thinking content
- **Enhanced metadata** — Every response includes timing, state_history, tool_used, mode
- **Rate limiting** — 6 req/min max, 3-5s minimum delay between requests
- **Queue depth limit** — Rejects new jobs when queue exceeds 10 pending
- **Human-like pacing** — Single concurrency, no parallel prompts

## Prerequisites

- **Node.js** 24+
- **Redis** — `sudo apt install redis-server && sudo systemctl start redis-server`
- **Chromium** — Running with CDP enabled on port 18800
- **Gemini** — Logged in at `https://gemini.google.com/u/1/app` (ULTRA account)
- **Display** — `DISPLAY=:1` (real X11 display)

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Start the server + worker
DISPLAY=:1 npm run dev
```

The server starts on `http://localhost:3456`.

## API Reference

### POST /v1/chat (Sync)

Send a prompt and wait for the response.

```bash
curl -X POST http://localhost:3456/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What is the capital of France?"}'
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "done",
  "response": "The capital of France is Paris.",
  "artifact_path": "artifacts/uuid",
  "timing": {
    "queued_at": "2026-02-13T12:00:00.000Z",
    "started_at": "2026-02-13T12:00:00.100Z",
    "first_token_at": "2026-02-13T12:00:02.000Z",
    "completed_at": "2026-02-13T12:00:05.000Z",
    "total_ms": 4900
  },
  "state_history": [
    { "from": "IDLE", "to": "TYPING", "trigger": "type-prompt", "timestamp": "..." },
    { "from": "TYPING", "to": "GENERATING", "trigger": "submit", "timestamp": "..." },
    { "from": "GENERATING", "to": "DONE", "trigger": "response-stable", "timestamp": "..." }
  ],
  "tool_used": null,
  "mode": null
}
```

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The prompt to send to Gemini |
| `tool` | string | No | `deep_research`, `create_videos`, `create_images`, `canvas`, `guided_learning`, `deep_think` |
| `mode` | string | No | `fast`, `thinking`, `pro` |
| `timeout_ms` | number | No | Max wait time (default: 120000) |
| `idempotency_key` | string | No | Dedup key (uses UUID if not set) |
| `priority` | string | No | `realtime` / `normal` / `bulk` |

### POST /v1/jobs (Async)

Submit a prompt without waiting.

```bash
curl -X POST http://localhost:3456/v1/jobs \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Explain quantum computing", "tool": "deep_research"}'
```

**Response (202):**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "created_at": "2026-02-13T..."
}
```

**Rate limit response (429):**
```json
{
  "error": "Rate limit exceeded",
  "retry_after_ms": 2500,
  "retry_after": 3
}
```

### GET /v1/jobs/:id

Check job status and get results with enhanced metadata.

```bash
curl http://localhost:3456/v1/jobs/{job_id}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "done",
  "prompt": "...",
  "response": "...",
  "artifact_path": "artifacts/uuid",
  "thinking": "Let me think about this step by step...",
  "timing": { "queued_at": "...", "started_at": "...", "completed_at": "...", "total_ms": 5000 },
  "state_history": [...],
  "tool_used": "deep_research",
  "mode": "thinking"
}
```

Status values: `queued`, `running`, `done`, `failed`

### GET /v1/jobs/:id/status

Real-time detailed status for a job.

```bash
curl http://localhost:3456/v1/jobs/{job_id}/status
```

**Response:**
```json
{
  "job_id": "uuid",
  "bull_state": "active",
  "ui_state": "GENERATING",
  "substate": "researching",
  "elapsed_in_state_ms": 15000,
  "thinking": "Analyzing sources...",
  "progress_text": "Generating research plan",
  "partial_response": "Based on my research...",
  "timing": { "queued_at": "...", "started_at": "...", "first_token_at": "..." },
  "state_history": [...],
  "tool_used": "deep_research",
  "mode": "thinking"
}
```

### GET /v1/jobs/:id/thinking

Extract thinking/reasoning content for a job.

```bash
curl http://localhost:3456/v1/jobs/{job_id}/thinking
```

**Response:**
```json
{
  "job_id": "uuid",
  "thinking": "Let me break this down step by step...",
  "tool_used": "deep_think",
  "mode": "thinking"
}
```

### GET /v1/health

System health check.

```bash
curl http://localhost:3456/v1/health
```

**Response:**
```json
{
  "status": "healthy",
  "browser": {
    "connected": true,
    "gemini_loaded": true,
    "logged_in": true,
    "input_visible": true
  },
  "queue": {
    "waiting": 0,
    "active": 0,
    "completed": 5,
    "failed": 0
  },
  "worker": {
    "running": false
  },
  "timestamp": "2026-02-13T..."
}
```

## Architecture

```
Client → HTTP API (Fastify:3456) → Job Queue (BullMQ/Redis) → Worker → Playwright CDP → Chromium:18800 → Gemini UI
```

### Key Components

| Component | File | Description |
|-----------|------|-------------|
| Entry point | `src/index.ts` | Starts Fastify server + BullMQ worker |
| API routes | `src/api/routes.ts` | HTTP endpoint handlers |
| Rate limiter | `src/api/rate-limiter.ts` | Request rate limiting (6/min, 3s delay) |
| Worker | `src/worker/index.ts` | Job processor: chat flow automation |
| Job state store | `src/worker/job-state-store.ts` | In-memory live state for observability |
| Browser adapter | `src/browser/adapter.ts` | CDP connection, navigation, typing, extraction |
| Selector resolver | `src/browser/selector-resolver.ts` | Tiered selector resolution |
| Selector registry | `src/selectors/gemini.v1.ts` | All Gemini UI selectors (versioned) |
| Tool manager | `src/tools/tool-manager.ts` | Generic tool activation/deactivation |
| Mode manager | `src/tools/mode-manager.ts` | Mode switching (Fast/Thinking/Pro) |
| Tool modules | `src/tools/*.ts` | Per-tool flows (deep research, video, etc.) |
| State machine | `src/state-machine/index.ts` | UI state tracking |
| Artifacts | `src/artifacts/index.ts` | Per-job file persistence |
| Errors | `src/errors/index.ts` | Error taxonomy |
| Types | `src/types/index.ts` | Shared TypeScript types |
| Config | `src/config.ts` | Server, browser, queue, polling, rate limit settings |

### Chat Flow

1. **New chat** — Navigate to `gemini.google.com/u/1/app`
2. **Dismiss overlays** — Press Escape, click CDK backdrops
3. **Activate tool/mode** — If requested, toggle via Tools menu or mode picker
4. **Type prompt** — Find input via tiered selectors, click + fill
5. **Submit** — Press Enter (send "button" is a text node, not a real button)
6. **Poll for response** — Check generating/complete state every 750ms; update live state store
7. **Stability check** — Hash response text, wait for 3 consecutive matching hashes
8. **Extract** — Get text, thinking content, and progress from response containers
9. **Deactivate tool** — If one was activated, click deselect chip
10. **Persist** — Save request, timeline, and response to artifacts directory

### Tool Flows

| Tool | Timeout | Key Detection |
|------|---------|---------------|
| Deep Research | 300s | "Start research" button → research complete |
| Create Videos (Veo 3.1) | 240s | Play/Download/Share video buttons |
| Create Images | 90s | Download/Share/Copy image buttons |
| Canvas | 90s | Code Editor textbox, Close panel button |
| Guided Learning | 90s | Response text, image buttons, follow-ups |
| Deep Think | 300s | Thinking panel, "Thought for X seconds" |

## Testing

```bash
# Unit tests (state machine, rate limiter, job state store)
npx vitest run tests/unit/

# Integration tests (requires live Gemini browser)
DISPLAY=:1 npx vitest run tests/integration/

# All tests
DISPLAY=:1 npm test
```

### Test Files

| File | Tests | Description |
|------|-------|-------------|
| `tests/unit/state-machine.test.ts` | 7 | State transitions and timeline |
| `tests/unit/rate-limiter.test.ts` | 2 | Rate limit enforcement |
| `tests/unit/job-state-store.test.ts` | 11 | Live state tracking |
| `tests/integration/preflight.test.ts` | 6 | CDP connection, selectors |
| `tests/integration/chat-flow.test.ts` | 1 | Full round-trip chat |
| `tests/integration/api.test.ts` | 5 | All API endpoints |
| `tests/integration/tools-activation.test.ts` | 17 | Tool toggle + mode switch |
| `tests/integration/tools-media.test.ts` | 3 | Videos, images, canvas |
| `tests/integration/tools-research.test.ts` | 3 | Deep research, learning, think |
| `tests/integration/observability.test.ts` | 6 | Status, thinking, rate limits |

## Configuration

Edit `src/config.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `server.port` | 3456 | HTTP server port |
| `browser.cdpUrl` | `http://127.0.0.1:18800` | CDP endpoint |
| `browser.geminiUrl` | `https://gemini.google.com/u/1/app` | Gemini URL |
| `polling.intervalMs` | 750 | Response poll interval |
| `polling.stableCount` | 3 | Polls before marking done |
| `polling.maxWaitMs` | 120000 | Max generation timeout |
| `rateLimit.maxPerMinute` | 6 | Max requests per minute |
| `rateLimit.minDelayMs` | 3000 | Min delay between requests |
| `rateLimit.maxQueueDepth` | 10 | Max pending queue depth |

## Error Codes

| Code | Retryable | Description |
|------|-----------|-------------|
| `BROWSER_UNAVAILABLE` | Yes | Cannot connect to Chromium via CDP |
| `AUTH_REQUIRED` | No | Not logged in to Gemini |
| `UI_SELECTOR_NOT_FOUND` | Yes | DOM selector not found |
| `GENERATION_TIMEOUT` | Yes | Response didn't complete in time |
| `EXTRACTION_FAILED` | Yes | Could not extract response text |
| `RATE_LIMITED` | Yes | Too many requests |
| `CAPTCHA_REQUIRED` | No | Human intervention needed |
| `UNKNOWN` | No | Unexpected error |

## Project Structure

```
gemini-ui-shim/
├── src/
│   ├── api/
│   │   ├── routes.ts              # HTTP endpoints
│   │   └── rate-limiter.ts        # Rate limiting
│   ├── browser/
│   │   ├── adapter.ts             # CDP browser automation
│   │   └── selector-resolver.ts   # Tiered selector resolution
│   ├── selectors/
│   │   └── gemini.v1.ts           # UI selector registry
│   ├── tools/
│   │   ├── tool-manager.ts        # Generic tool activation
│   │   ├── mode-manager.ts        # Mode switching
│   │   ├── deep-research.ts       # Deep Research flow
│   │   ├── create-videos.ts       # Video generation (Veo 3.1)
│   │   ├── create-images.ts       # Image generation
│   │   ├── canvas.ts              # Canvas (code/writing)
│   │   ├── guided-learning.ts     # Guided Learning
│   │   ├── deep-think.ts          # Deep Think
│   │   └── index.ts               # Barrel export
│   ├── worker/
│   │   ├── index.ts               # Job processor
│   │   └── job-state-store.ts     # In-memory live state
│   ├── state-machine/index.ts     # UI state tracking
│   ├── artifacts/index.ts         # File persistence
│   ├── errors/index.ts            # Error taxonomy
│   ├── types/index.ts             # TypeScript types
│   ├── config.ts                  # Configuration
│   ├── logger.ts                  # Pino logger
│   └── index.ts                   # Entry point
├── tests/
│   ├── unit/                      # Unit tests
│   └── integration/               # Live Gemini integration tests
├── artifacts/                     # Runtime job artifacts
└── docs/                          # Design documents
```
