# LLM Drivers

PingOS supports 4 LLM providers with automatic registration. All are used for Smart Extract L3 (semantic), L9 (visual), natural language query, self-heal, and PingApp generation.

> For full configuration, capability matrices, and adapter details, see [DRIVERS.md](DRIVERS.md).

---

## Provider Overview

| Provider | Type | Endpoint | Auto-registered | API Key Env |
|----------|------|----------|:-:|-------------|
| **OpenRouter** | Cloud (100+ models) | `https://openrouter.ai/api` | When `OPENROUTER_API_KEY` is set | `OPENROUTER_API_KEY` |
| **Anthropic** | Cloud (Claude models) | `https://api.anthropic.com` | When `ANTHROPIC_API_KEY` is set | `ANTHROPIC_API_KEY` |
| **OpenAI** | Cloud (GPT/o-series) | `https://api.openai.com` | When `OPENAI_API_KEY` is set | `OPENAI_API_KEY` |
| **LM Studio** | Local | `http://localhost:1234` | Always (gracefully offline) | None |

---

## Setup

Set environment variables for cloud providers:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...   # Recommended: access to 100+ models
export ANTHROPIC_API_KEY=sk-ant-...       # For Claude models directly
export OPENAI_API_KEY=sk-...              # For GPT/o-series models
```

LM Studio is always registered and works when the app is running on `localhost:1234`.

Drivers are auto-registered on gateway startup. Verify:

```bash
curl -s http://localhost:3500/v1/registry | jq '.drivers[] | {id, type}'
```

---

## Routing

The gateway routes LLM requests based on capability requirements:

```bash
# Send to best available model
curl -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Summarize this page"}'

# Require vision capability
curl -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Describe this image", "require": {"vision": true}}'

# Target specific driver
curl -X POST http://localhost:3500/v1/dev/llm/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "driver": "openrouter"}'

# Multi-turn chat
curl -X POST http://localhost:3500/v1/dev/llm/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is PingOS?"},
      {"role": "assistant", "content": "PingOS is a browser automation OS."},
      {"role": "user", "content": "How does it work?"}
    ]
  }'
```

---

## List Available Models

```bash
curl -s http://localhost:3500/v1/llm/models | jq '.drivers[] | {driver, count: (.models | length)}'
```

---

## OpenRouter

Routes to 100+ models from Anthropic, OpenAI, Google, Meta, Mistral, and more through a single API key.

**Adapter:** `OpenRouterAdapter` (extends `OpenAICompatAdapter`)

**Capabilities:** LLM, streaming, vision (model-dependent), tool calling (model-dependent), thinking (model-dependent)

**Default model:** `anthropic/claude-sonnet-4-5`

Used internally for Smart Extract L9 (visual extraction via `anthropic/claude-sonnet-4`).

---

## Anthropic

Direct Anthropic Messages API with first-class support for thinking/reasoning chains.

**Adapter:** `AnthropicAdapter`

**Protocol:** Anthropic Messages API (`/v1/messages`) with `x-api-key` header

**Capabilities:** LLM, streaming, vision, tool calling, thinking

**Default model:** `claude-sonnet-4-5-20250929`

**Health check:** Sends minimal `"ping"` message (costs ~$0.01/day at 30s intervals).

---

## OpenAI

Direct OpenAI API access with streaming support.

**Adapter:** `OpenAIAdapter`

**Capabilities:** LLM, streaming, vision (GPT-4o/4V), tool calling, thinking (o1/o3)

**Default model:** `gpt-4o`

**Model listing:** Filters for `gpt-*`, `o1`, `o3` models. Falls back to static list on API error.

---

## LM Studio

Local inference via LM Studio's OpenAI-compatible API. Zero configuration, gracefully offline.

**Adapter:** `LMStudioAdapter`

**Endpoint:** `http://localhost:1234`

**Capabilities:** LLM, streaming

**Model:** Uses whatever model is loaded in LM Studio (`default`)

When LM Studio isn't running, the driver reports `offline` status — no crashes, no errors.

---

## Priority & Resolution

Drivers are resolved by priority (lower = preferred):

| Priority | Driver |
|----------|--------|
| 5 | OpenRouter, Anthropic, OpenAI |
| 10 | LM Studio |
| 20 | Ollama |

When multiple drivers match the requested capabilities, the lowest-priority (most preferred) driver is chosen. Override with the `driver` field in requests.
