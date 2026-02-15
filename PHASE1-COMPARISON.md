# PingOS Phase 1 — Three-Assessment Comparison Brief

**Date:** 2026-02-15
**For:** Emile (decision document)
**Sources:** Claude Opus 4.6, OpenAI Codex (GPT-5.3), Gemini
**Status:** DRAFT — being built incrementally

---

## Summary Table

| Aspect | Claude Code | Codex | Gemini |
|--------|------------|-------|--------|
| **Architecture approach** | POSIX layer ON TOP of existing PingApps; `@pingdev/std` as routing + capability layer; PingApps unchanged | POSIX as UX contract + capability router; typed operation bus (`device + op + envelope`); uniform envelope across all devices | "Microkernel for the Web" — POSIX for naming only, NOT for protocol; Capabilities-based Driver Model with Job Bus |
| **Key interfaces proposed** | `Driver` interface with `execute()`, `stream()`, `health()`, `listModels()`; `DriverRegistration`, `DriverCapabilities` (13 boolean flags), `DeviceRequest`/`DeviceResponse` | `Envelope<T>` wrapper with `mode`/`target`/`affinity`/`trace`; `LlmChatInput`/`LlmOutput` aligned to OpenAI message format; `PingError` with POSIX errno | `ILLMDriver` with `chat()` + `abort()`; `ISearchDriver` with `search()`; `IDriverManifest`; `RegistryEntry`; OpenAI ChatCompletion alignment |
| **Model registry design** | `ModelRegistry` class — in-memory Map + health heartbeat loop; static config file (`registry.yaml`) + runtime registration | `RegistryStore` in Redis (hash-based); `models.yaml` for static config; drivers auto-register on boot; tag-based model metadata | Hybrid: static config (`/etc/pingos/models.json`) + runtime Redis discovery; PingApps self-register on boot |
| **File/package structure** | `@pingdev/std` (types+registry+routes), `@pingdev/drivers` (API adapters), existing `@pingdev/core` unchanged | `src/std/` (envelope, llm, errors), `src/registry/`, `src/router/`, `src/drivers/`, `src/gateway/` — single-package with internal modules | `packages/std/` (traits), `packages/kernel/` (gateway+registry+VFS routing), `packages/drivers/` (gemini, ollama, etc.), `packages/dashboard/` |
| **API routes** | `POST /v1/dev/llm/prompt`, `GET /v1/dev/llm`, `GET /v1/registry/drivers`, `POST /v1/dev/search/query`, `POST /v1/dev/image-gen/generate` | `POST /v1/dev/llm/chat`, `POST /v1/dev/llm/prompt`, `GET /v1/dev`, `GET /v1/drivers`, `GET /v1/models`, `POST /v1/jobs`, SSE events | `POST /dev/llm/chat/completions`, `GET /sys/drivers`, `POST /sys/mount`, `GET /sys/jobs/:id` |
| **What to reuse vs rewrite** | Reuse ALL existing PingApps + core as-is; new packages only; PingApp adapter wraps existing HTTP API | Reuse existing PingApps as "CDP drivers"; new gateway + registry; core worker pipeline stays | Reuse existing PingApps; refactor Gemini to implement `ILLMDriver`; new Kernel package |
| **Estimated effort** | ~2-3 weeks implied (phased: types → registry → gateway → drivers) | Explicit phases: P0 (types+registry+1 driver, ~days), P1 (router+gateway), P2 (full device coverage) | "Immediate action" list — 4 steps; feels like ~1-2 weeks for MVP |
| **Unique insights** | 13 granular capability flags; routing strategies (fastest/cheapest/best/round-robin); conversation_id threading; artifact support | `affinity` concept for session stickiness (CDP login cookies); `trace` for observability; POSIX errno codes; structured output format; comprehensive BullMQ envelope | "Don't build the full VFS yet"; POSIX errors are "aesthetic engineering" — use HTTP status codes + RFC 7807; Promise-Job pattern for sync/async; warns against over-abstraction |

---

## Where They Agree
*(being populated — reading remaining sections)*

## Where They Disagree
*(being populated — reading remaining sections)*

## Recommended Path Forward
*(being populated — reading remaining sections)*
