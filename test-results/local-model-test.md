# PingOS Local Model Test Report (Qwen3-32B via LM Studio)

- Date: 2026-02-21 (Asia/Dubai)
- Target repo: `~/projects/pingdev`
- Gateway: `http://localhost:3500`
- Local LLM endpoint: `http://localhost:1234/v1`
- Model target: `qwen/qwen3-32b`

## Progress Log (Incremental)

### 1) LLM Layer Discovery (in progress)
- Reviewed `packages/std/src/llm.ts`.
  - `getLLMConfig()` already supports env vars:
    - `PINGOS_LLM_BASE_URL`
    - `PINGOS_LLM_API_KEY`
    - `PINGOS_LLM_MODEL`
  - Falls back to `DEFAULT_SELF_HEAL_CONFIG.llm`.
  - `callLLM()` posts to `${baseUrl}/chat/completions` (OpenAI-compatible).
  - `callLLMVision()` currently defaults model to `anthropic/claude-sonnet-4` when no model override is passed.
- Reviewed `packages/std/src/config.ts`.
  - Config includes `selfHeal.llm` and optional top-level `llm` provider config.
  - Loader merges `selfHeal.llm` with defaults.
- Searched cross-usage and found `packages/std/src/main.ts` also handles env-based fallback drivers.

Pending next: inspect `main.ts` gateway initialization and apply minimal config changes if needed.

### 2) Gateway LLM Initialization + Build
- Reviewed `packages/std/src/main.ts`:
  - Gateway loads config via `loadConfig()`.
  - Registers adapters for OpenRouter/Anthropic/OpenAI/Ollama/LM Studio.
  - `callFeatureLLM()` in `gateway.ts` tries registry LLM driver first, then falls back to direct `callLLM()` from `llm.ts`.
  - Direct `callLLM()` uses env vars (`PINGOS_LLM_BASE_URL`, `PINGOS_LLM_MODEL`, optional `PINGOS_LLM_API_KEY`).
- Feature routing findings:
  - `/v1/dev/:device/query`, `/v1/apps/generate` use `callFeatureLLM()` (registry first, direct fallback).
  - `/v1/dev/:device/suggest` uses direct LLM helper (`llmSuggest` -> `callLLM`).
  - `/v1/dev/:device/extract/semantic` uses direct LLM helper (`directLLM`) to generate selectors.
  - `/v1/dev/:device/extract/learn` itself uses extension extraction/template learning (not direct LLM in this route).
- Build status:
  - Ran `pnpm build` at repo root.
  - ✅ Build succeeded for all packages.

Next step: restart gateway with env vars forcing local OpenAI-compatible endpoint/model, then run endpoint tests.

### 3) Gateway Restart + Local Model Wiring
- Restarted tmux gateway session `pingos-gw` with env overrides:
  - `PINGOS_LLM_BASE_URL=http://localhost:1234/v1`
  - `PINGOS_LLM_MODEL=qwen/qwen3-32b`
  - `PINGOS_LLM_API_KEY=local`
- Verified gateway health: ✅ `/v1/health` returned healthy.
- Verified registry contains local OpenAI-compatible driver:
  - `id: openai-compat-env`
  - `endpoint: http://localhost:1234/v1`
  - `model: qwen/qwen3-32b`
- Device inventory available from `/v1/devices` (Chrome extension attached).
- Selected test device: `chrome-726392682` (Hacker News tab).

Next: run all requested AI feature endpoint tests and record pass/fail, latency, output quality.

### 4) First Test Run (before code adjustment)
Using device `chrome-726392682`.

Raw latency results:
- query: HTTP 200, 9.119s
- discover: HTTP 200, 0.010s
- extract: HTTP 200, 0.012s
- learn: HTTP 200, 0.015s
- heal_stats: HTTP 200, 0.001s
- pingapp_generate: HTTP 200, 16.765s
- suggest: HTTP 500, 15.005s
- visual_semantic: HTTP 500, 15.012s

Key finding:
- `query` and `pingapp_generate` responses reported `model: anthropic/claude-sonnet-4` (NOT local Qwen), meaning registry routing still preferred cloud drivers over local.
- `suggest` and `extract/semantic` did hit direct LLM path but timed out at 15s (`LLM request timeout after 15000ms`).

Conclusion from first pass:
- Local model wiring is partially active (direct LLM path reachable) but not fully enforced for all AI features.
- Need a minimal code/env adjustment so:
  1) registry-routed features prefer local OpenAI-compat driver,
  2) direct LLM timeout is configurable (LM Studio local model needs >15s for some prompts).

### 5) Minimal Code Adjustments to Fully Prefer Local Model
Implemented minimal, env-driven changes:

1. **`packages/std/src/llm.ts`**
   - Added env override for timeout:
     - `PINGOS_LLM_TIMEOUT_MS`
   - Keeps existing env-first behavior for base URL/model.

2. **`packages/std/src/main.ts`**
   - Updated OpenAI-compat env registration condition:
     - Before: required both `PINGOS_LLM_BASE_URL` and `PINGOS_LLM_API_KEY`
     - Now: requires only `PINGOS_LLM_BASE_URL` (API key optional, better for local LM Studio)
   - Added env-driven priority override:
     - `PINGOS_LLM_PRIORITY` (defaults to `1` if not set) so local driver can be preferred over cloud drivers.

Rebuild status after changes: ✅ successful.

Next: restart gateway with `PINGOS_LLM_TIMEOUT_MS` and rerun all tests.

### 6) Post-change Verification (local routing enforced)
- Verified `/v1/registry` now shows only local-capable drivers and `openai-compat-env` with priority `1`.
- Quick local API sanity check to LM Studio directly:
  - `GET /v1/models` shows `qwen/qwen3-32b`.
  - `POST /v1/chat/completions` returns in ~1.10s for a tiny prompt.
- First query after reroute to local model timed out at 45s (`LLM request timeout after 45000ms`) due larger gateway prompt size.
- Increased `PINGOS_LLM_TIMEOUT_MS` to `180000` for full feature retest.

## Final Test Matrix (Local Qwen3-32B)

> Note: results come from two local-model runs:
> - **Run A (device connected):** proved local model usage for device-backed LLM routes; some timeouts.
> - **Run B (after additional restart):** extension devices did not reconnect (ENODEV for device-backed routes), but non-device LLM routes still tested.

| Feature | Endpoint | Result | Latency | Quality / Notes |
|---|---|---|---:|---|
| 1) Natural Language Query | `POST /v1/dev/{device}/query` | ❌ Fail (local) | ~45.0s | Timed out (`LLM request timeout after 45000ms`) when using local Qwen with large DOM prompt. Gateway log confirms model `qwen/qwen3-32b`. |
| 2) Schema Auto-Discovery | `POST /v1/dev/{device}/discover` | ✅ Pass | ~0.010s | Returned valid structure (`pageType: table`, title/url/schema). Primarily extension-side discovery (not strongly LLM-bound). |
| 3) Smart Extract | `POST /v1/dev/{device}/extract` | ✅ Pass | ~0.012s | Returned accurate top titles/scores/ranks on HN. Strategy indicated `template` hit; extraction quality good. |
| 4) Template Learning | `POST /v1/dev/{device}/extract/learn` | ✅ Pass | ~0.015s | Learned domain template for `news.ycombinator.com`; selectors and sample data looked correct. |
| 5) Self-Healing Stats | `GET /v1/heal/stats` | ✅ Pass | ~0.001s | Endpoint healthy; counters all zero in this run (no heal attempts triggered). |
| 6) PingApp Generator | `POST /v1/apps/generate` | ❌ Fail (local) | ~54.16s | Local run ended with `ping.gateway.llm_parse_error` (Qwen output not valid JSON schema for app). Earlier cloud-routed run succeeded, so regression is local-model output formatting reliability. |
| 7) Suggest | `POST /v1/dev/{device}/suggest` | ⚠️ Partial Pass | ~32.68s | Returned 200, but response included long `<think>` reasoning text and truncated advice; confidence defaulted 0.5. First local attempt at 15s timeout failed; with higher timeout it returns but quality is weak. |
| 8) Visual Extract | `POST /v1/dev/{device}/extract/semantic` | ❌ Fail (local) | ~15.01s | Timed out in connected-device run (`LLM request timeout after 15000ms`). Uses direct LLM for selector generation; local model too slow / not producing parseable output in default timeout window. |

## Verification Evidence that Local Model Was Used
- `/v1/registry` showed `openai-compat-env` with:
  - endpoint `http://localhost:1234/v1`
  - model `qwen/qwen3-32b`
  - priority `1`
- `/tmp/pingos-gateway.log` contains:
  - `[llm] callLLM {"model":"qwen/qwen3-32b", ...}` on query/suggest/generate requests.

## Issues Found
1. **Local model latency for large prompts** causes query/semantic timeouts.
2. **Output format mismatch** (non-JSON / reasoning-heavy output) breaks strict JSON parser paths (notably PingApp generator).
3. **Extension reconnection fragility after gateway restart**: devices disappeared (`ENODEV`) and did not auto-reconnect in later run.

## Practical Recommendations
1. Keep env config for local model:
   - `PINGOS_LLM_BASE_URL=http://localhost:1234/v1`
   - `PINGOS_LLM_MODEL=qwen/qwen3-32b`
   - `PINGOS_LLM_TIMEOUT_MS=120000` or higher for DOM-heavy prompts
   - `PINGOS_LLM_PRIORITY=1`
2. Add stronger JSON coercion/repair for model outputs before parser failure (for generate/suggest/semantic).
3. For Qwen models that emit reasoning traces, add prompt constraints or post-processing to strip `<think>` blocks.
4. Improve extension bridge reconnect behavior after gateway restarts.

## Files/Code Changed
- `packages/std/src/llm.ts`
  - Added env-driven timeout override: `PINGOS_LLM_TIMEOUT_MS`.
- `packages/std/src/main.ts`
  - OpenAI-compat env driver now registers when `PINGOS_LLM_BASE_URL` exists (API key optional).
  - Added env-driven priority override: `PINGOS_LLM_PRIORITY` (default `1`).

