# Changelog

All notable changes to PingOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-02-15

Phase 1: POSIX Device Layer — initial release of `@pingdev/std`, the standard library for PingOS.

### Added

#### Core Types (`packages/std/src/types.ts`)
- `Driver` interface — unified contract for all backends (PingApp, API, local)
- `DeviceRequest` / `DeviceResponse` — standard request/response envelopes with routing fields (`driver`, `require`, `strategy`, `affinity`, `tool`)
- `DriverCapabilities` — 8 boolean capability flags (`llm`, `streaming`, `vision`, `toolCalling`, `imageGen`, `search`, `deepResearch`, `thinking`) + 4 optional operational fields
- `PingError` — dual-error type with POSIX errno + domain code + retryable flag
- `ContentPart` union type — multi-modal message format (text, image_url, tool_call, tool_result)
- `Message`, `StreamChunk`, `ModelInfo`, `DriverRegistration`, `DriverHealth`, `TokenUsage`, `Artifact` types

#### Error Model (`packages/std/src/errors.ts`)
- 10 named POSIX errno constructors: `ENOENT`, `EACCES`, `EBUSY`, `ETIMEDOUT`, `EAGAIN`, `ENOSYS`, `ENODEV`, `EOPNOTSUPP`, `EIO`, `ECANCELED`
- `mapErrnoToHttp()` — maps each errno to the correct HTTP status code
- Each constructor sets appropriate defaults (`retryable`, `retryAfterMs`, domain `code`)

#### Model Registry (`packages/std/src/registry.ts`)
- `ModelRegistry` class with driver registration, unregistration, and listing
- Capability-based filtering (`findByCapability`)
- Request routing with `resolve()` — filters by capabilities, health, affinity, then applies strategy
- Session affinity tracking (sticky routing for browser-backed PingApps)
- Periodic health monitoring (`startHealthChecks` / `stopHealthChecks`) with configurable interval

#### Gateway Server (`packages/std/src/gateway.ts`)
- Fastify HTTP server with `createGateway()` factory function
- `POST /v1/dev/llm/prompt` — single prompt routing with capability matching
- `POST /v1/dev/llm/chat` — multi-turn chat with messages array
- `GET /v1/registry` — list all registered drivers with capabilities
- `GET /v1/health` — gateway health check
- PingError-aware error handler mapping errno to HTTP status codes

#### Driver Adapters (`packages/std/src/drivers/`)
- `PingAppAdapter` — wraps running PingApps via their `/v1/chat` and `/v1/health` HTTP endpoints
- `OpenAICompatAdapter` — single adapter for all OpenAI-format APIs (Ollama, LM Studio, OpenRouter, OpenAI, Groq, Together, Mistral, vLLM). Supports sync, streaming (SSE), model listing, and token usage
- `AnthropicAdapter` — Anthropic Messages API adapter with thinking chain extraction, system message handling, and streaming with content block tracking

#### Routing Strategies (`packages/std/src/routing/`)
- `best` — lowest priority among online drivers, fallback to cheapest
- `fastest` — lowest latency from health check data
- `cheapest` — lowest priority number
- `round-robin` — rotating counter across candidates

#### Configuration (`packages/std/src/config.ts`)
- `PingOSConfig` / `DriverConfig` types
- `DEFAULT_CONFIG` with 3 pre-registered PingApps (Gemini :3456, AI Studio :3457, ChatGPT :3458)
- `loadConfig()` — reads `~/.pingos/config.json` with fallback to defaults

#### Integration Tests (`packages/std/src/__tests__/gateway.test.ts`)
- 6 tests passing end-to-end against live Gemini PingApp on port 3456
- Tests: health check, registry listing, prompt routing, chat routing, missing prompt validation, unsupported capability error

#### Project Infrastructure
- README with architecture diagram, getting started guide, API reference, concepts, troubleshooting
- Full documentation: Architecture, API Reference, Drivers, Contributing, Phase 1 Requirements
- `.editorconfig`, updated `.gitignore`, conventional commit convention
- Vitest test configuration with 120s timeout for live PingApp tests
