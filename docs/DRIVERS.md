# PingOS Drivers

This document catalogs every driver adapter in PingOS, including capability matrices, configuration examples, known limitations, and health check behavior.

---

## Table of Contents

- [Overview](#overview)
- [Capability Matrix](#capability-matrix)
- [Chrome Extension Driver (Authenticated Tabs)](#chrome-extension-driver-authenticated-tabs)
- [PingApp Drivers](#pingapp-drivers)
  - [Gemini](#gemini)
  - [AI Studio](#ai-studio)
  - [ChatGPT](#chatgpt)
- [API Drivers](#api-drivers)
  - [OpenAI-Compatible](#openai-compatible-adapter)
  - [Anthropic](#anthropic-adapter)
- [Adding a New Driver](#adding-a-new-driver)

---

## Overview

PingOS has two execution families:

1. **Registry-backed drivers** (first-class `Driver` implementations)
2. **Extension-backed devices** (authenticated Chrome tabs exposed as `chrome-{tabId}`)

Registry-backed drivers have three types, each with a dedicated adapter class:

| Adapter Class | Backend Type | Protocol | Auth | Use for |
|---------------|-------------|----------|------|---------|
| `PingAppAdapter` | `pingapp` | PingApp HTTP API (`/v1/chat`, `/v1/health`) | None (browser session) | Browser-automated website shims |
| `OpenAICompatAdapter` | `api` / `local` | OpenAI Chat Completions API (`/v1/chat/completions`) | Bearer token (optional) | Ollama, LM Studio, OpenRouter, OpenAI, Groq, Together, Mistral, vLLM |
| `AnthropicAdapter` | `api` | Anthropic Messages API (`/v1/messages`) | `x-api-key` header | Anthropic Claude models |

In addition, PingOS includes a **Chrome Extension Auth Bridge** (gateway-side class: `ExtensionBridge`) which is not a `Driver` in the registry, but exposes *shared Chrome tabs* as runtime devices:

| Component | Device IDs | Transport | Auth | Use for |
|-----------|-----------|-----------|------|---------|
| `ExtensionBridge` + Chrome MV3 extension | `chrome-{tabId}` | WebSocket `/ext` + content script | Your real Chrome session | Automating authenticated sites in a real user tab |

---

## Capability Matrix

Full capability comparison across all current drivers:

| Capability | Gemini (PingApp) | AI Studio (PingApp) | ChatGPT (PingApp) | Ollama (API) | OpenAI (API) | Anthropic (API) |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| `llm` | Yes | Yes | Yes | Yes | Yes | Yes |
| `streaming` | Yes | Yes | Yes | Yes | Yes | Yes |
| `vision` | Yes | Yes | Yes | Model-dependent | GPT-4o/4V | Yes |
| `toolCalling` | Yes | Yes | Yes | Model-dependent | Yes | Yes |
| `imageGen` | Yes | No | Yes | No | DALL-E (separate) | No |
| `search` | Yes | No | Yes | No | No | No |
| `deepResearch` | Yes | No | Yes | No | No | No |
| `thinking` | Yes | Yes | Yes | DeepSeek/Qwen | o1/o3 | Claude 3.5+ |

> Note: extension-backed tab devices are *operation* based (read/click/type/extract/eval) rather than capability routed LLM backends, so they are not included in the capability matrix.

### Operational characteristics

| Characteristic | PingApp Drivers | API Drivers |
|---------------|:---:|:---:|
| Concurrency | 1 (single browser tab) | High (parallel requests) |
| Typical latency | 5-120 seconds | 0.5-30 seconds |
| Session affinity | Required | Not needed |
| Cost | Free (your browser session) | Per-token pricing |
| Failure modes | Browser crash, selector not found, login expired | Connection refused, auth error, rate limit |
| Health check | `GET /v1/health` on PingApp | `GET /v1/models` on API |

---

## PingApp Drivers

---

## Chrome Extension Driver (Authenticated Tabs)

The Chrome extension bridge turns any *user-controlled*, *logged-in* Chrome tab into a PingOS device.

### How tabs become devices

1. Start the gateway (port `3500`).
2. Load the extension from `packages/chrome-extension/dist/` in `chrome://extensions`.
3. Open the extension popup and **share** a tab.
4. The shared tab becomes addressable as:

- `chrome-{tabId}` (example: `chrome-2114771645`)

The gateway maintains an ownership map of `deviceId → clientId` based on the extension's `hello` and `share_update` WebSocket messages.

### Operations

Once a tab is shared, you can call:

- `POST /v1/dev/chrome-{tabId}/read`
- `POST /v1/dev/chrome-{tabId}/click`
- `POST /v1/dev/chrome-{tabId}/type`
- `POST /v1/dev/chrome-{tabId}/extract`
- `POST /v1/dev/chrome-{tabId}/eval`

See [`docs/API.md`](API.md) for request/response schemas and working curl examples.

### Passive driver generator (recorder → `defineSite()`)

The extension includes a passive recorder in the content script:

- Records user interactions (clicks, typing, navigation)
- Generates a starter `defineSite()` / selector map based on what you did

This is intended as a fast path from **"manual exploration"** → **"compiled PingApp"**:

1. Record a happy-path interaction in a real authenticated tab
2. Export the generated `defineSite()` scaffold
3. Feed it into the PingApp generator / recon pipeline as a starting point

### PingApp drivers (CDP) vs Extension driver (real browser)

| Aspect | PingApp Drivers | Extension-backed Tabs |
|-------|------------------|------------------------|
| Browser context | Managed CDP/Playwright session | Your actual Chrome tab |
| Auth | Often requires scripted login or persisted cookies | Uses existing user auth (MFA/SSO already solved) |
| API surface | High-level `llm/chat` (site-specific) | Low-level DOM ops (`read/click/type/extract/eval`) |
| Determinism | High (compiled selectors + state machines) | Medium (DOM automation in a live tab) |
| Best for | Productionized deterministic shims | Bootstrapping, auth-heavy sites, debugging |
| Scaling | Limited by PingApp concurrency (usually 1/tab) | Limited by number of user tabs shared |

### Gemini

The most complete PingApp, wrapping Google's Gemini AI (gemini.google.com).

| Field | Value |
|-------|-------|
| **Driver ID** | `gemini` |
| **Status** | Active — production-ready |
| **Endpoint** | `http://localhost:3456` |
| **Website** | gemini.google.com |
| **Priority** | 1 (highest) |
| **Tests** | 19/19 passing |

#### Tools

| Tool | Description | Activation |
|------|-------------|------------|
| Chat | Standard conversational chat | Default |
| Deep Think | Extended reasoning with visible thinking chain | Tool selector |
| Deep Research | Multi-step autonomous web research | Tool selector |
| Image Generation | Create images from text descriptions | Tool selector |
| Canvas | Collaborative document editing | Tool selector |
| Learning | Interactive learning mode | Tool selector |

#### Configuration example

```typescript
import { PingAppAdapter } from '@pingdev/std';

const gemini = new PingAppAdapter({
  id: 'gemini',
  name: 'Gemini PingApp',
  endpoint: 'http://localhost:3456',
  capabilities: {
    llm: true, streaming: true, vision: true, toolCalling: true,
    imageGen: true, search: true, deepResearch: true, thinking: true,
  },
  priority: 1,
});
```

Or in `~/.pingos/config.json`:

```json
{
  "id": "gemini",
  "type": "pingapp",
  "endpoint": "http://localhost:3456",
  "priority": 1,
  "capabilities": {
    "llm": true, "streaming": true, "vision": true, "toolCalling": true,
    "imageGen": true, "search": true, "deepResearch": true, "thinking": true
  }
}
```

#### Health check behavior

The adapter calls `GET http://localhost:3456/v1/health` with a 5-second timeout. The PingApp returns:

```json
{
  "status": "healthy",
  "browser": { "connected": true, "page_loaded": true },
  "queue": { "waiting": 0, "active": 0, "completed": 42, "failed": 1 },
  "worker": { "running": true }
}
```

Status mapping: `healthy` → `online`, `degraded` → `degraded`, `unhealthy` → `offline`.

#### Known limitations

- **Single concurrency**: Only one request can be processed at a time. Concurrent requests queue in BullMQ.
- **Login required**: You must be logged into Google in the Chrome session. If the session expires, the PingApp returns errors until you re-authenticate.
- **Streaming via PingApp**: The PingApp streams internally (hash stability detection on the response container), but the gateway currently receives the final response synchronously. SSE streaming passthrough is planned for Phase 2.
- **Deep Research timeout**: Deep Research can take 2-5 minutes. Set `timeout_ms: 300000` or higher.
- **Rate limiting**: Google may rate-limit heavy usage. The PingApp detects this and returns `EAGAIN`.

---

### AI Studio

Wraps Google AI Studio (aistudio.google.com), providing access to 21 Gemini models, prompt design tools, and app deployment.

| Field | Value |
|-------|-------|
| **Driver ID** | `ai-studio` |
| **Status** | Active |
| **Endpoint** | `http://localhost:3457` |
| **Website** | aistudio.google.com |
| **Priority** | 2 |

#### Capabilities

10 actions, 13 features, app builder, deployment to Google Cloud. Access to:
- Gemini 2.5 Pro and Flash
- LearnLM
- Gemma models
- Embedding models

#### Configuration example

```typescript
const aiStudio = new PingAppAdapter({
  id: 'ai-studio',
  name: 'AI Studio PingApp',
  endpoint: 'http://localhost:3457',
  capabilities: {
    llm: true, streaming: true, vision: true, toolCalling: true,
    imageGen: false, search: false, deepResearch: false, thinking: true,
  },
  priority: 2,
});
```

#### Known limitations

- **No image generation**: AI Studio doesn't expose image generation through its web UI
- **Model switching**: Switching between models mid-conversation requires UI interaction. Use the `model` field or `tool` to specify which model context to use
- **Session state**: AI Studio maintains conversation state in the browser. The `conversation_id` field is used to track which prompt belongs to which session

---

### ChatGPT

Wraps OpenAI's ChatGPT web interface (chatgpt.com).

| Field | Value |
|-------|-------|
| **Driver ID** | `chatgpt` |
| **Status** | In Progress |
| **Endpoint** | `http://localhost:3458` |
| **Website** | chatgpt.com |
| **Priority** | 3 |

#### Configuration example

```typescript
const chatgpt = new PingAppAdapter({
  id: 'chatgpt',
  name: 'ChatGPT PingApp',
  endpoint: 'http://localhost:3458',
  capabilities: {
    llm: true, streaming: true, vision: true, toolCalling: true,
    imageGen: true, search: true, deepResearch: true, thinking: true,
  },
  priority: 3,
});
```

#### Known limitations

- **In development**: Basic chat flow works, but some tools (Canvas, voice, advanced data analysis) are not yet implemented
- **Cloudflare challenges**: ChatGPT occasionally presents Cloudflare verification challenges. The PingApp needs the user to solve them in the browser session
- **Rate limiting**: OpenAI enforces usage limits on free accounts. Plus or Team accounts have higher limits

---

## API Drivers

### OpenAI-Compatible Adapter

A single adapter that works with any API following the OpenAI Chat Completions format. This covers a wide range of providers with one adapter class.

| Field | Value |
|-------|-------|
| **Adapter Class** | `OpenAICompatAdapter` |
| **Backend Type** | `api` |
| **Protocol** | OpenAI `/v1/chat/completions` |
| **Auth** | Bearer token (optional for local providers) |

#### Supported providers

| Provider | Endpoint | API Key needed | Notes |
|----------|----------|:-:|-------|
| **Ollama** | `http://localhost:11434` | No | Local. Append `/v1` to the base URL for OpenAI-compat mode |
| **LM Studio** | `http://localhost:1234` | No | Local. OpenAI-compatible by default |
| **OpenRouter** | `https://openrouter.ai/api` | Yes | Cloud. Routes to 100+ models from various providers |
| **OpenAI** | `https://api.openai.com` | Yes | Cloud. Direct OpenAI API access |
| **Together** | `https://api.together.xyz` | Yes | Cloud. Open-source model hosting |
| **Groq** | `https://api.groq.com/openai` | Yes | Cloud. Fast inference on custom hardware |
| **Mistral** | `https://api.mistral.ai` | Yes | Cloud. Mistral models |
| **vLLM** | `http://localhost:8000` | No | Local. High-throughput inference server |

#### Configuration examples

**Ollama (local, no API key):**

```typescript
import { OpenAICompatAdapter } from '@pingdev/std';

const ollama = new OpenAICompatAdapter({
  id: 'ollama-llama3',
  name: 'Ollama Llama 3 8B',
  endpoint: 'http://localhost:11434',
  model: 'llama3:8b',
  capabilities: {
    llm: true, streaming: true, vision: false, toolCalling: false,
    imageGen: false, search: false, deepResearch: false, thinking: false,
  },
  priority: 20,
});
```

**OpenRouter (cloud, API key required):**

```typescript
const openrouter = new OpenAICompatAdapter({
  id: 'openrouter-claude',
  name: 'Claude via OpenRouter',
  endpoint: 'https://openrouter.ai/api',
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'anthropic/claude-sonnet-4-5',
  capabilities: {
    llm: true, streaming: true, vision: true, toolCalling: true,
    imageGen: false, search: false, deepResearch: false, thinking: true,
  },
  priority: 15,
});
```

**Config file format:**

```json
{
  "id": "ollama-llama3",
  "type": "openai_compat",
  "endpoint": "http://localhost:11434",
  "model": "llama3:8b",
  "priority": 20
}
```

#### Features

| Feature | Supported |
|---------|:-:|
| Sync `execute()` | Yes |
| `stream()` (SSE) | Yes |
| `listModels()` | Yes (`GET /v1/models`) |
| Token usage tracking | Yes (from API response) |
| Multi-modal messages | Yes (ContentPart[] with text + image_url) |
| Tool calling passthrough | Depends on model |

#### Health check behavior

The adapter calls `GET {endpoint}/v1/models` with a 5-second timeout:
- `200` → `online`
- `401` or `403` → `offline` (auth failure)
- Other errors → `degraded`
- Connection refused → `offline`

#### Known limitations

- **Model-specific capabilities**: The adapter doesn't probe model capabilities at runtime. You must correctly set the capabilities flags at registration time based on the model you're using (e.g., `llama3:8b` doesn't support vision, but `llava` does).
- **Streaming format**: Expects standard SSE with `data: {...}\n\n` format and `data: [DONE]` terminator. Some providers have slight variations.
- **Rate limiting**: The adapter doesn't currently handle `429` responses with retry-after headers automatically. It throws `EIO` for all non-auth errors.

---

### Anthropic Adapter

Direct Anthropic API adapter with first-class support for thinking/reasoning chains.

| Field | Value |
|-------|-------|
| **Adapter Class** | `AnthropicAdapter` |
| **Backend Type** | `api` |
| **Protocol** | Anthropic Messages API (`/v1/messages`) |
| **Auth** | `x-api-key` header |
| **API Version** | `2023-06-01` |

#### Configuration example

```typescript
import { AnthropicAdapter } from '@pingdev/std';

const claude = new AnthropicAdapter({
  id: 'claude-sonnet',
  name: 'Claude Sonnet 4.5',
  endpoint: 'https://api.anthropic.com',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-5-20250929',
  capabilities: {
    llm: true, streaming: true, vision: true, toolCalling: true,
    imageGen: false, search: false, deepResearch: false, thinking: true,
  },
  priority: 5,
});
```

**Config file format:**

```json
{
  "id": "claude-sonnet",
  "type": "anthropic",
  "endpoint": "https://api.anthropic.com",
  "apiKeyEnv": "ANTHROPIC_API_KEY",
  "model": "claude-sonnet-4-5-20250929",
  "priority": 5
}
```

#### Features

| Feature | Supported |
|---------|:-:|
| Sync `execute()` | Yes |
| `stream()` (SSE) | Yes |
| Thinking chain extraction | Yes (extracted from `thinking` content blocks) |
| System messages | Yes (mapped to Anthropic's top-level `system` field) |
| Multi-modal messages | Partial (text + image URLs sent as text description) |
| Token usage tracking | Yes (input_tokens + output_tokens) |
| Tool calling | Supported in API, passthrough not yet implemented |

#### Health check behavior

Anthropic doesn't have a dedicated health endpoint. The adapter sends a minimal messages request (`prompt: "ping", max_tokens: 1`) with a 5-second timeout:
- `200` or `400` (bad request but API is reachable) → `online`
- `401` or `403` → `offline` (auth failure)
- Other errors → `degraded`
- Connection refused → `offline`

**Note**: This health check costs a tiny number of tokens (~10 input, 1 output). At 30-second intervals, this amounts to about $0.01/day on Sonnet pricing.

#### Known limitations

- **Image handling**: Anthropic expects base64-encoded images in a specific format. The adapter currently converts image URLs to text placeholders (`[Image: url]`). Full base64 image support is planned.
- **Max tokens**: Default max output tokens is 4096. Override by setting model parameters (not yet exposed in `DeviceRequest`).
- **Tool calling**: The Anthropic API supports tool calling, but the adapter doesn't yet translate PingOS tool calls to Anthropic's format. Tool calling works through the PingApp drivers instead.
- **Streaming format**: Anthropic uses a unique SSE event format (`message_start`, `content_block_delta`, `message_delta`, `message_stop`). The adapter normalizes this to PingOS `StreamChunk` format.

---

## Adding a New Driver

See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step instructions on:

1. **API backends**: Determine if your provider uses OpenAI-compatible format (no code needed) or needs a custom adapter
2. **PingApps**: Use the recon pipeline to snapshot, analyze, and generate a new browser shim
