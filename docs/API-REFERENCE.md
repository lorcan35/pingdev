# PingOS API Reference (Source-Audited)

Base URL: `http://localhost:3500`

This doc is generated from:
- `packages/std/src/gateway.ts`
- `packages/std/src/app-routes.ts`
- `packages/std/src/pipeline-engine.ts`
- related engines (`watch-manager`, `visual-extract`, `paginate-extract`, `template-learner`)

## Legend
- **Ext**: requires connected Chrome extension + shared tab device
- **LLM**: uses model routing (local supported unless noted)

---

## 1) Core / Health / Registry

### `GET /v1/health`
- Ext: No, LLM: No
- Response: `{ status: "healthy", timestamp: string }`

### `GET /v1/registry`
- Ext: No, LLM: No
- Response: `{ drivers: DriverRegistration[] }`

### `GET /v1/heal/cache`
- Ext: No, LLM: No
- Response: `{ ok: true, cache: Record<string, unknown> }`

### `GET /v1/heal/stats`
- Ext: No, LLM: No
- Response: `{ ok, enabled, stats }`
- `stats`: attempts/successes/cacheHits/cacheHitSuccesses/llmAttempts/llmSuccesses + derived rates

### `POST /v1/extension/reload`
- Ext: Yes
- Success: `{ ok: true, message: "Reload signal sent" }`
- Error `503`: extension not connected

### `GET /v1/devices`
- Ext: Yes
- Response:
```json
{ "extension": { "clients": [], "devices": [] } }
```

### `GET /v1/dev/:device/status`
- Ext: Yes
- Success: `{ ok: true, device, status }`
- Error `404 ping.gateway.device_not_found`

---

## 2) Discovery / LLM Routing

### `GET /v1/dev/:device/discover`
### `POST /v1/dev/:device/discover`
- Ext: Yes
- Response: `{ ok: true, result: DiscoverSnapshot }`

### `POST /v1/dev/:device/suggest`
- Ext: usually yes (device context), LLM: Yes
- Body:
```json
{ "question": "required", "context": "optional" }
```
- Error `400` if question missing
- Response: `{ ok: true, suggestion, confidence }`

### `POST /v1/dev/llm/prompt`
- Ext: No, LLM: Yes
- Body fields:
`prompt(required), driver?, require?, strategy?, timeout_ms?, conversation_id?, tool?, model?`
- Response: `DeviceResponse`

### `POST /v1/dev/llm/chat`
- Ext: No, LLM: Yes
- Body fields:
`prompt? | messages[] (one required), driver?, require?, strategy?, timeout_ms?, conversation_id?, tool?, model?`
- Error `400` if neither prompt nor messages provided

### `GET /v1/llm/models`
- Ext: No, LLM: Yes
- Response: `{ drivers: [{ driver, models[] }] }`

---

## 3) Query / Watch / Diff / App Generate

### `POST /v1/dev/:device/query`
- Ext: Yes, LLM: Yes
- Body: `{ "question": "required" }`
- Responses:
  - Cache hit: `{ answer, selector, cached: true }`
  - Fresh: `{ answer, selector, cached: false, model }`
- Errors:
  - `400` missing question
  - `404` device not found
  - `502 ping.gateway.dom_unavailable`
  - `502 ping.gateway.llm_parse_error`

### `POST /v1/dev/:device/watch`
- Ext: Yes
- Body: `{ schema: Record<string,string>, interval?: number }`
- Returns SSE stream (`text/event-stream`) with snapshots

### `POST /v1/dev/:device/diff`
- Ext: Yes
- Body: `{ schema: Record<string,string> }`
- Response includes `changes[]`, `snapshot`, `previousSnapshot`, `isFirstExtraction`

### `POST /v1/apps/generate`
- Ext: No, LLM: Yes
- Body: `{ url: string, description: string }`
- Response: `{ app, model }`
- Errors: `400` missing fields, `502 ping.gateway.llm_parse_error`

---

## 4) Function Namespace

### `GET /v1/functions`
- `{ ok: true, functions: FunctionDef[] }`

### `GET /v1/functions/:app`
- `{ ok: true, app, functions }`
- `404 ping.functions.app_not_found`

### `POST /v1/functions/:app/call`
- Body: `{ function: string, params?: object }`
- Response: `{ ok: true, result }`

### `POST /v1/functions/:app/batch`
- Body: `{ calls: [{ function, params? }] }`
- Response: `{ ok: true, results }`

---

## 5) Managed Watches

### `POST /v1/dev/:device/watch/start`
- Ext: Yes
- Body: `{ selector: string, fields?: Record<string,string>, interval?: number }`
- Response: `{ ok: true, watchId, stream }`

### `GET /v1/watches/:watchId/events`
- SSE stream of `WatchEvent`
- `404 ping.watch.not_found`

### `DELETE /v1/watches/:watchId`
- Response `{ ok: true, watchId }`

### `GET /v1/watches`
- Response `{ ok: true, watches: [...] }`

---

## 6) Pipelines

### `POST /v1/pipelines/run`
- Body: `PipelineDef`
- Errors:
  - `400 ping.pipeline.bad_request` missing body/steps
  - `400 ping.pipeline.invalid` validation failed
- Response `{ ok: true, result: PipelineResult }`

### `POST /v1/pipelines/validate`
- Body: `PipelineDef`
- Response `{ ok: boolean, errors: string[] }`

### `GET /v1/pipelines`
- Response `{ ok: true, pipelines: [{ name, stepCount }] }`

### `POST /v1/pipelines/save`
- Body: `PipelineDef` with `name`
- Response `{ ok: true, name }`

### `POST /v1/pipelines/pipe`
- Body: `{ pipe: string }`
- Parses shorthand and executes

---

## 7) Generic Device Operation Route

### `POST /v1/dev/:device/:op`
- Ext: Yes for browser devices
- Special interception behavior:
  - `extract` + template auto-apply
  - `extract` + `paginate:true` -> multi-page engine
  - `extract` + `strategy:"visual"` -> visual engine
  - `extract` + `fallback:"visual"` -> visual fallback on empty data
  - selector self-heal on element-not-found for `read/click/type/waitFor`
  - CDP fallback on extension I/O disconnect errors
- For `device=llm` with `op=prompt|chat` it routes via driver registry

---

## 8) Semantic Extract + Templates

### `POST /v1/dev/:device/extract/semantic`
- Ext: Yes, LLM: Yes
- Body: `{ query: string, limit?: number }`
- Response: `{ ok, result, _selectors?, _strategy?, _cached? }`

### `POST /v1/dev/:device/extract/learn`
- Body: `{ schema: Record<string,string> }`
- Response: `{ ok: true, template }`

### `GET /v1/templates`
- `{ ok: true, templates: [{ domain, urlPattern?, hitCount?, successRate }] }`

### `GET /v1/templates/:domain`
- `{ ok: true, template }` or 404

### `DELETE /v1/templates/:domain`
- `{ ok: true, deleted: true }` or 404

### `POST /v1/templates/import`
- Body must contain `domain` (required)
- `{ ok: true, imported: true }`

### `GET /v1/templates/:domain/export`
- Returns template JSON directly

---

## 9) Recording / Replay / Generator

### `POST /v1/record/start`
### `POST /v1/record/stop`
- Body: `{ device: string }`

### `POST /v1/record/export`
- Body: `{ device: string, name?: string }`
- Merges extension actions + gateway API actions

### `GET /v1/record/status?device=...`

### `POST /v1/record/replay`
### `POST /v1/recordings/replay`
- Body:
```json
{
  "device": "required",
  "recording": { "id": "...", "actions": [] },
  "recordingId": "optional",
  "speed": 1,
  "timeout": 30000
}
```

### `POST /v1/recordings/generate`
- Body: `{ recording?: Recording, recordingId?: string, name?: string }`
- Response: `{ ok, app, files }`

### `POST /v1/recordings/save`
- Body: `Recording`

### `GET /v1/recordings`
### `DELETE /v1/recordings/:id`

---

## 10) PingApp Routes (`/v1/app/*`)

All app routes require a matching open/shared tab domain.

### AliExpress
- `POST /v1/app/aliexpress/search` body `{ query }`
- `POST /v1/app/aliexpress/product` body `{ id }`
- `POST /v1/app/aliexpress/cart/add`
- `POST /v1/app/aliexpress/cart/remove` body `{ index? }`
- `GET /v1/app/aliexpress/cart`
- `GET /v1/app/aliexpress/orders`
- `GET /v1/app/aliexpress/orders/:orderId`
- `GET /v1/app/aliexpress/wishlist`
- `POST /v1/app/aliexpress/clean`
- `GET /v1/app/aliexpress/recon`

### Amazon
- `POST /v1/app/amazon/search` body `{ query }`
- `POST /v1/app/amazon/product` body `{ asin }`
- `POST /v1/app/amazon/cart/add`
- `GET /v1/app/amazon/cart`
- `GET /v1/app/amazon/orders`
- `GET /v1/app/amazon/deals`
- `POST /v1/app/amazon/clean`
- `GET /v1/app/amazon/recon`

### Claude
- `POST /v1/app/claude/chat` body `{ message }`
- `POST /v1/app/claude/chat/new`
- `GET /v1/app/claude/chat/read`
- `GET /v1/app/claude/conversations`
- `POST /v1/app/claude/conversation` body `{ id }`
- `GET /v1/app/claude/model`
- `POST /v1/app/claude/model` body `{ model }`
- `GET /v1/app/claude/projects`
- `POST /v1/app/claude/project` body `{ id }`
- `GET /v1/app/claude/artifacts`
- `POST /v1/app/claude/upload` body `{ filePath }`
- `GET /v1/app/claude/search?query=...`
- `POST /v1/app/claude/clean`
- `GET /v1/app/claude/recon`

### App index
- `GET /v1/apps`

---

## 11) Verified curl commands (executed on localhost)

```bash
curl -s http://localhost:3500/v1/health
curl -s http://localhost:3500/v1/registry
curl -s http://localhost:3500/v1/functions
curl -s -H 'Content-Type: application/json' \
  -d '{"name":"smoke","steps":[{"id":"t1","op":"transform","template":"ok"}]}' \
  http://localhost:3500/v1/pipelines/validate
curl -s http://localhost:3500/v1/templates
curl -s http://localhost:3500/v1/apps
curl -s http://localhost:3500/v1/llm/models
curl -s -H 'Content-Type: application/json' \
  -d '{"domain":"docs.audit.local","urlPattern":"^https?://docs.audit.local","selectors":{"title":"h1"},"schema":{"title":"h1"},"createdAt":0,"updatedAt":0,"hitCount":0,"successCount":0,"failCount":0}' \
  http://localhost:3500/v1/templates/import
```

---

## Common error codes
- `ping.gateway.bad_request` (400)
- `ping.gateway.device_not_found` (404)
- `ping.gateway.dom_unavailable` (502)
- `ping.gateway.llm_parse_error` (502)
- `ping.pipeline.bad_request` / `ping.pipeline.invalid` (400)
- `ping.watch.bad_request` / `ping.watch.not_found`
- `ping.template.bad_request` / `ping.template.not_found`
- `ping.recordings.bad_request` / `ping.recordings.not_found`
- `ping.functions.app_not_found`
