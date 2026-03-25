# PingOS Local Mode

Run PingOS with fully local LLM/vision inference (no cloud provider calls for AI features).

## Quick Start

```bash
PINGOS_LOCAL_MODE=true \
PINGOS_LLM_BASE_URL=http://localhost:1234/v1 \
PINGOS_LLM_MODEL=nvidia/nemotron-3-nano \
PINGOS_LLM_API_KEY=local \
pingdev up
```

## Setup

1. Install a local model server:
- LM Studio (`http://localhost:1234/v1` OpenAI-compatible API)
- Ollama (optional alternative, OpenAI-compatible proxy required)

2. Download a model suitable for structured JSON output.

## Recommended Models

| Model | Best Use | Notes |
|---|---|---|
| Nemotron-3-Nano-30B-A3B | Tool calling + strict JSON | Best default for PingOS local mode |
| GLM-4.7-Flash | Agentic and coding-heavy flows | Fast, strong multi-step behavior |
| Qwen3-32B | General-purpose local tasks | Good balance of quality/speed |
| Qwen3-Coder-30B | CSS selector and code synthesis | Strong for extraction schema generation |

## Environment Variables

Core local mode:
- `PINGOS_LOCAL_MODE` (default: `false`)
- `PINGOS_LLM_BASE_URL` (default: `http://localhost:1234/v1`)
- `PINGOS_LLM_MODEL` (default: auto-detect from `/v1/models`)
- `PINGOS_LLM_API_KEY` (default: `local`)
- `PINGOS_VISION_BASE_URL` (default: same as `PINGOS_LLM_BASE_URL`)
- `PINGOS_VISION_MODEL` (default: same as `PINGOS_LLM_MODEL`)
- `PINGOS_LOCAL_DOM_LIMIT` (default: `5000`)
- `PINGOS_LOCAL_JSON_MODE` (default: `true`)

Per-feature timeouts (ms):
- `PINGOS_LLM_TIMEOUT_MS` (default: `60000`)
- `PINGOS_LLM_QUERY_TIMEOUT_MS` (default: `60000`)
- `PINGOS_LLM_HEAL_TIMEOUT_MS` (default: `30000`)
- `PINGOS_LLM_GENERATE_TIMEOUT_MS` (default: `120000`)
- `PINGOS_LLM_SUGGEST_TIMEOUT_MS` (default: `60000`)
- `PINGOS_LLM_EXTRACT_TIMEOUT_MS` (default: `60000`)
- `PINGOS_LLM_DISCOVER_TIMEOUT_MS` (default: `45000`)
- `PINGOS_LLM_VISUAL_TIMEOUT_MS` (default: `90000`)

Per-feature model overrides:
- `PINGOS_LLM_EXTRACT_MODEL`
- `PINGOS_LLM_HEAL_MODEL`
- `PINGOS_LLM_GENERATE_MODEL`
- `PINGOS_VISION_MODEL`

## Local Gateway Run Command

```bash
cd ~/projects/pingdev/packages/std
PINGOS_LOCAL_MODE=true \
PINGOS_LLM_BASE_URL=http://localhost:1234/v1 \
PINGOS_LLM_MODEL=nvidia/nemotron-3-nano \
PINGOS_LLM_API_KEY=local \
node dist/main.js
```

If Chromium extension does not reconnect:

```bash
DISPLAY=:1 chromium-browser --remote-debugging-port=18801 \
  --load-extension=$HOME/projects/pingdev/packages/chrome-extension/dist \
  --user-data-dir=$HOME/.config/chromium-pingos \
  --no-first-run --no-default-browser-check \
  "https://news.ycombinator.com" &
```

## Troubleshooting

- Timeout errors:
  - Increase feature-specific timeout (for example `PINGOS_LLM_GENERATE_TIMEOUT_MS=180000`).
  - Reduce `PINGOS_LOCAL_DOM_LIMIT` to reduce prompt size.

- JSON parse errors:
  - Keep `PINGOS_LOCAL_JSON_MODE=true`.
  - Prefer Nemotron or GLM models for strict schema output.

- Vision extraction fallback:
  - Set `PINGOS_VISION_MODEL` to a vision-capable local model.
  - If unavailable, PingOS falls back to text extraction with warning metadata.

## Performance Tips

- Context length:
  - Keep DOM context small (`PINGOS_LOCAL_DOM_LIMIT` between 3000-8000).

- GPU offload:
  - Increase GPU layers in LM Studio/Ollama for lower latency.

- Quantization:
  - Lower-bit quantization improves speed but can hurt selector precision/JSON fidelity.

- Feature tuning:
  - Use heavier models for `generate` and `extract`; lighter models for `suggest`/`heal`.
