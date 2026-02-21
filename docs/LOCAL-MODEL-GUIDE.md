# PingOS Local Model Guide (LM Studio / OpenAI-Compatible)

## Core setup

```bash
export PINGOS_LOCAL_MODE=true
export PINGOS_LLM_BASE_URL=http://localhost:1234
export PINGOS_LLM_MODEL=nemotron-3-nano-30b
```

> Important: set `PINGOS_LLM_BASE_URL` **without** trailing `/v1` in your env docs/ops examples.

### Why the `/v1` detail matters
`packages/std/src/local-mode.ts` normalizes base URLs:
- if URL already ends with `/v1`, it keeps it
- otherwise it appends `/v1`

And LLM callers then append `/chat/completions`.
So these both resolve correctly to one `/v1`:
- `http://localhost:1234` -> `http://localhost:1234/v1/chat/completions`
- `http://localhost:1234/v1` -> `http://localhost:1234/v1/chat/completions`

Operationally, keep env as `http://localhost:1234` to avoid confusion and accidental double-appending in other tooling.

Also note the OpenAI-compatible driver (`packages/std/src/drivers/openai-compat.ts`) always calls:
- `${endpoint}/v1/models`
- `${endpoint}/v1/chat/completions`

So endpoint should be host root (preferred) or a base already normalized by `local-mode.ts`.

## Environment variables (audited)

### Global
- `PINGOS_LOCAL_MODE` (bool)
- `PINGOS_LLM_BASE_URL`
- `PINGOS_LLM_MODEL`
- `PINGOS_LLM_API_KEY` (default `local`)
- `PINGOS_LLM_TIMEOUT_MS`
- `PINGOS_LOCAL_DOM_LIMIT`
- `PINGOS_LOCAL_JSON_MODE` (bool)

### Feature timeouts
- `PINGOS_LLM_QUERY_TIMEOUT_MS`
- `PINGOS_LLM_HEAL_TIMEOUT_MS`
- `PINGOS_LLM_GENERATE_TIMEOUT_MS`
- `PINGOS_LLM_SUGGEST_TIMEOUT_MS`
- `PINGOS_LLM_EXTRACT_TIMEOUT_MS`
- `PINGOS_LLM_DISCOVER_TIMEOUT_MS`
- `PINGOS_LLM_VISUAL_TIMEOUT_MS`

### Per-feature model routing
- `PINGOS_LLM_EXTRACT_MODEL`
- `PINGOS_LLM_HEAL_MODEL`
- `PINGOS_LLM_GENERATE_MODEL`
- `PINGOS_VISION_MODEL` / `PINGOS_LLM_VISUAL_MODEL`

## Local vs cloud behavior
- Local mode avoids forcing OpenAI `response_format=json_object` (many local servers reject it).
- JSON is enforced by prompt instructions + repair (`repairLLMJson`).
- Gateway features using LLM in local mode:
  - suggest/query/extract-semantic/self-heal/app-generate/visual-extract
- Known practical requirement: pipeline `llm-prompt` style flows still need active tab/device context when route logic uses DOM.

## Reliability notes (from source + task constraints)
- **Nemotron-3-Nano-30B (LM Studio) is the recommended local model** for PingOS flows.
- **Qwen3 family is less reliable** for strict selector JSON / structured extraction in this stack.
- PingApp generation (`/v1/apps/generate`) can still be intermittent with local models.
- Fallback logic exists (JSON repair + second-pass fixer prompt), but not guaranteed.

## Known limitations / workarounds
- If model emits `<think>` blocks, PingOS strips them in both text and vision paths.
- If `extract/semantic` selector JSON parses but data is empty, gateway auto-falls back to NL extraction strategy.
- For local vision extraction, ensure server supports image input in OpenAI-compatible chat format.

> Pending final pass: tested local curl examples + exact model compatibility matrix from runtime verification.
