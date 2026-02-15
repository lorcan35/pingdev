# PingOS Phase 1 — POSIX Layer Implementation Assessment

**Author:** Claude Opus 4.6 (dashboard agent)
**Date:** 2026-02-14
**Status:** Deep code analysis + architecture proposal

---

## 1. Executive Summary

Phase 1 builds the **standardized abstraction layer** — the contract between consumers (AI models, scripts, agents) and providers (PingApps like Gemini, AI Studio, ChatGPT, plus future API-native backends like Ollama, OpenRouter, Anthropic).

After reading every source file in the current system, my assessment is:

- **@pingdev/core is well-architected.** The SiteDefinition/ActionHandler pattern is clean and extensible. The worker pipeline (queue → browser → state machine → extract → return) is solid.
- **The POSIX layer is a routing + capability layer ON TOP of existing PingApps**, not a rewrite. Existing PingApps continue to run as-is. The new `@pingdev/std` package maps virtual device paths to running PingApp instances.
- **Model registry is the key new primitive.** Currently each PingApp IS its own process (port 3456, 3457, 3458). The registry tracks what's available, what capabilities each backend supports, and routes `/dev/llm/prompt` to the right one.
- **API-native backends (Ollama, OpenAI, etc.) bypass the browser entirely.** They need a lightweight adapter that speaks the same interface as PingApps but calls REST APIs directly instead of driving CDP.

---

## 2. Current Architecture — What Exists

### 2.1 Package Structure

```
~/projects/pingdev/
├── packages/
│   ├── core/           # @pingdev/core — the engine
│   │   └── src/
│   │       ├── app.ts           # createShimApp() — Fastify + BullMQ + Worker
│   │       ├── types.ts         # SiteDefinition, ActionContext, JobRequest, etc.
│   │       ├── site.ts          # defineSite() — validates & defaults
│   │       ├── config.ts        # resolveConfig() — merges defaults
│   │       ├── api/routes.ts    # HTTP endpoints (/v1/jobs, /v1/chat, /v1/health, etc.)
│   │       ├── api/schemas.ts   # Zod/JSON schemas
│   │       ├── browser/adapter.ts    # CDP connection via Playwright
│   │       ├── worker/index.ts       # BullMQ worker — the main execution pipeline
│   │       ├── state-machine/        # UIStateMachine
│   │       ├── runtime/              # Self-healing (SelectorRegistry, RuntimeHealer)
│   │       ├── scoring/              # Action/selector quality scoring
│   │       └── validator/            # PingApp validation
│   ├── dashboard/      # React dashboard (Vite, port 3400)
│   ├── recon/          # Reconnaissance engine (snapshot → analyze → generate)
│   └── cli/            # CLI tooling

~/projects/gemini-ui-shim/    # Gemini PingApp (port 3456)
│   └── src/
│       ├── index.ts               # createShimApp(geminiSite, { port: 3456 })
│       ├── site-definition.ts     # Full SiteDefinition with all action handlers
│       ├── selectors/gemini.v1.ts # Tiered selectors
│       └── tools/                 # Tool-specific modules (deep-research, images, etc.)

~/projects/pingapps/aistudio/  # AI Studio PingApp (port 3457)
~/projects/pingapps/chatgpt/   # ChatGPT PingApp (port 3458) — stub, actions not implemented
```

### 2.2 The Core Execution Pipeline

```
HTTP Request → Fastify → BullMQ Queue → Worker
                                           ↓
                                    findOrCreatePage()
                                    preflight()
                                    newConversation() or navigateToConversation()
                                    switchMode() / activateTool()
                                    typePrompt()
                                    submit()
                                    pollForResponse()  ← hash_stability loop
                                    extractResponse()
                                    extractThinking()
                                           ↓
                                    EnhancedJobResult → SSE stream + REST response
```

### 2.3 Key Interfaces (from `types.ts`)

**SiteDefinition** — the core contract every PingApp implements:
- `name`, `url` — identity
- `selectors` — `Record<string, SelectorDef>` with tiered fallbacks
- `states` — `StateMachineConfig` (transitions graph)
- `actions` — object with required handlers (`findOrCreatePage`, `typePrompt`, `submit`, `isGenerating`, `isResponseComplete`, `extractResponse`) plus optional ones (`activateTool`, `switchMode`, `extractThinking`, etc.)
- `completion` — `CompletionConfig` (hash_stability / selector_presence / network_idle)
- Infrastructure configs (browser, queue, rateLimit, retry, etc.)

**ActionContext** — passed to every action handler:
- `page: Page` (Playwright)
- `selectors: Record<string, SelectorDef>`
- `resolveSelector()` — tiered selector resolution
- `log: pino.Logger`
- `jobRequest: JobRequest`

**JobRequest** — what consumers send:
- `prompt: string`
- `tool?: string`, `mode?: string`
- `conversation_id?: string`
- `timeout_ms?: number`, `priority?: Priority`
- `idempotency_key?: string`

### 2.4 What Each PingApp Declares

| PingApp | Port | Tools | Modes | Substates | Status |
|---------|------|-------|-------|-----------|--------|
| Gemini | 3456 | deep_research, create_videos, create_images, canvas, guided_learning, deep_think | fast, thinking, pro | generating_plan, researching, generating_video, generating_image, thinking, generating_code | Fully implemented |
| AI Studio | 3457 | (none declared) | (none declared) | (none declared) | Fully implemented |
| ChatGPT | 3458 | (none declared) | (none declared) | (none declared) | Stub — all actions log warnings |

### 2.5 Observations on Current Code

1. **No shared abstraction between PingApps.** Each app is a standalone process with its own `createShimApp()` call. They all speak the same HTTP API (`/v1/jobs`, `/v1/chat`, `/v1/health`) but there's no registry, no routing, no capability negotiation.

2. **Tool/mode handling is app-specific.** Gemini has `tool-manager.ts` and `mode-manager.ts` that drive Angular Material menus. These are UI-specific — a POSIX tool abstraction needs to map at a higher level.

3. **All three PingApps share the same CDP endpoint** (`http://127.0.0.1:18800`). They each claim tabs within the same Chromium instance.

4. **The worker is single-concurrency per app.** Each PingApp runs one job at a time via its BullMQ worker. This is correct for browser-based backends (one tab = one conversation).

5. **No mechanism for API-native backends.** The entire pipeline assumes CDP browser automation. Calling Ollama or OpenAI would need a completely different worker path that skips browser, state machine, and selector resolution.

---

## 3. What Needs to Change

### 3.1 New Package: `@pingdev/std` (the POSIX Layer)

This is the centerpiece of Phase 1. It provides:
- **Virtual device paths** (`/dev/llm`, `/dev/search`, `/dev/image-gen`, etc.)
- **Model registry** (tracks installed backends + capabilities)
- **Routing logic** (resolves `/dev/llm/prompt` → best available backend)
- **Capability flags** (declares what each backend supports)
- **Unified HTTP gateway** (single Fastify server that proxies to registered backends)

### 3.2 New Package: `@pingdev/drivers` (API-native Backend Adapters)

Lightweight adapters that implement the same interface as PingApps but call REST APIs directly:
- `ollama-driver` — talks to `http://localhost:11434`
- `openai-driver` — calls OpenAI API
- `anthropic-driver` — calls Anthropic API
- `openrouter-driver` — calls OpenRouter API
- `lmstudio-driver` — talks to `http://localhost:1234`

These do NOT use `@pingdev/core`'s browser pipeline. They implement a shared `Driver` interface directly.

### 3.3 Changes to `@pingdev/core`

**Minimal.** The core stays as-is for browser-based PingApps. Changes:
- Add `capabilities` field to `SiteDefinition` (or derive from existing `tools`/`modes`)
- Export a `DriverAdapter` class that wraps existing `createShimApp` to speak the new standard interface
- Add optional CORS headers via `@fastify/cors` (or keep using Vite proxy for dashboard)

### 3.4 Changes to Existing PingApps

**None required immediately.** They continue running on their ports. The `@pingdev/std` gateway discovers them via the registry and proxies requests.

### 3.5 Changes to Dashboard

- Add registry management UI (view installed backends, toggle active/inactive)
- Show capabilities per backend
- Support the new POSIX routes for testing

---

## 4. Detailed Architecture

### 4.1 The Driver Interface — The Core Contract

```typescript
// @pingdev/std/src/types.ts

/** Capability flags — what a driver can do. */
export interface DriverCapabilities {
  /** Natural language prompt → text response. */
  llm: boolean;
  /** Vision / image understanding. */
  vision: boolean;
  /** Tool/function calling. */
  toolCalling: boolean;
  /** Streaming partial responses. */
  streaming: boolean;
  /** Image generation. */
  imageGen: boolean;
  /** Video generation. */
  videoGen: boolean;
  /** Web search / retrieval. */
  search: boolean;
  /** Code execution / interpretation. */
  codeExecution: boolean;
  /** Deep research (multi-step research flow). */
  deepResearch: boolean;
  /** Thinking/reasoning chain extraction. */
  thinking: boolean;
  /** Multi-turn conversation support. */
  conversation: boolean;
  /** File/document upload. */
  fileUpload: boolean;
}

/** Backend type — how the driver connects to the model. */
export type BackendType = 'pingapp' | 'api' | 'local';

/** Driver health status. */
export interface DriverHealth {
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  latencyMs?: number;
  lastChecked: string;
  details?: Record<string, unknown>;
}

/** Model info for API-native backends. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

/** A registered driver instance. */
export interface DriverRegistration {
  /** Unique driver ID (e.g., 'gemini', 'ollama-llama3', 'openai-gpt4'). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Backend type. */
  type: BackendType;
  /** What this driver can do. */
  capabilities: DriverCapabilities;
  /** Health status (updated by heartbeat). */
  health: DriverHealth;
  /** Connection info. */
  endpoint: {
    /** For PingApps: http://localhost:PORT. For APIs: base URL. */
    url: string;
    /** Port (for PingApps). */
    port?: number;
  };
  /** Model info (for API-native backends). */
  model?: ModelInfo;
  /** Priority for routing (lower = preferred). */
  priority: number;
  /** Available tools/modes (for PingApps). */
  tools?: string[];
  modes?: string[];
}

/** Standard prompt request (POSIX write). */
export interface DeviceRequest {
  /** The prompt text. */
  prompt: string;
  /** Target driver ID (optional — if omitted, routes to best available). */
  driver?: string;
  /** Required capabilities for routing. */
  require?: Partial<DriverCapabilities>;
  /** Preferred driver selection strategy. */
  strategy?: 'fastest' | 'cheapest' | 'best' | 'round-robin';
  /** Tool to activate (PingApp-specific). */
  tool?: string;
  /** Mode to switch (PingApp-specific). */
  mode?: string;
  /** Conversation ID for multi-turn. */
  conversation_id?: string;
  /** Timeout in ms. */
  timeout_ms?: number;
  /** Streaming mode. */
  stream?: boolean;
  /** Model override (for API backends with multiple models). */
  model?: string;
}

/** Standard response (POSIX read). */
export interface DeviceResponse {
  /** Response text. */
  response: string;
  /** Which driver handled this request. */
  driver_id: string;
  /** Which model was used (if applicable). */
  model?: string;
  /** Job ID (for PingApp backends). */
  job_id?: string;
  /** Thinking/reasoning chain. */
  thinking?: string;
  /** Timing metadata. */
  timing?: {
    queued_ms?: number;
    processing_ms: number;
    total_ms: number;
    first_token_ms?: number;
  };
  /** Token usage (for API backends). */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Conversation ID for follow-ups. */
  conversation_id?: string;
  /** Artifacts (images, files, etc.). */
  artifacts?: Array<{
    type: string;
    path?: string;
    url?: string;
    data?: string;
  }>;
}

/** The standard interface that all drivers implement. */
export interface Driver {
  /** Driver registration info. */
  readonly registration: DriverRegistration;
  /** Check health. */
  health(): Promise<DriverHealth>;
  /** Execute a prompt (POSIX write → read). */
  execute(request: DeviceRequest): Promise<DeviceResponse>;
  /** Execute with streaming (returns AsyncIterable of partial responses). */
  stream?(request: DeviceRequest): AsyncIterable<Partial<DeviceResponse> & { type: 'partial' | 'thinking' | 'complete' }>;
  /** List available models (for multi-model backends). */
  listModels?(): Promise<ModelInfo[]>;
}
```

### 4.2 The Model Registry

```typescript
// @pingdev/std/src/registry.ts

import type { DriverRegistration, DriverCapabilities, DriverHealth, Driver } from './types.js';

export class ModelRegistry {
  private drivers = new Map<string, Driver>();
  private healthInterval: NodeJS.Timeout | null = null;

  /** Register a driver. */
  register(driver: Driver): void {
    this.drivers.set(driver.registration.id, driver);
  }

  /** Unregister a driver. */
  unregister(id: string): void {
    this.drivers.delete(id);
  }

  /** Get all registered drivers. */
  list(): DriverRegistration[] {
    return Array.from(this.drivers.values()).map(d => d.registration);
  }

  /** Get a specific driver. */
  get(id: string): Driver | undefined {
    return this.drivers.get(id);
  }

  /** Find drivers matching required capabilities. */
  findByCapabilities(required: Partial<DriverCapabilities>): Driver[] {
    return Array.from(this.drivers.values()).filter(driver => {
      const caps = driver.registration.capabilities;
      for (const [key, value] of Object.entries(required)) {
        if (value && !caps[key as keyof DriverCapabilities]) return false;
      }
      return true;
    });
  }

  /** Route to best driver for given requirements. */
  resolve(
    required: Partial<DriverCapabilities>,
    strategy: 'fastest' | 'cheapest' | 'best' | 'round-robin' = 'best',
  ): Driver | null {
    const candidates = this.findByCapabilities(required)
      .filter(d => d.registration.health.status !== 'offline');

    if (candidates.length === 0) return null;

    switch (strategy) {
      case 'fastest':
        return candidates.sort((a, b) =>
          (a.registration.health.latencyMs ?? Infinity) -
          (b.registration.health.latencyMs ?? Infinity)
        )[0]!;
      case 'cheapest':
        return candidates.sort((a, b) =>
          (a.registration.model?.costPer1kInput ?? Infinity) -
          (b.registration.model?.costPer1kInput ?? Infinity)
        )[0]!;
      case 'best':
      default:
        return candidates.sort((a, b) =>
          a.registration.priority - b.registration.priority
        )[0]!;
    }
  }

  /** Start periodic health checks. */
  startHealthMonitor(intervalMs: number = 30_000): void {
    this.healthInterval = setInterval(async () => {
      for (const driver of this.drivers.values()) {
        try {
          const health = await driver.health();
          driver.registration.health = health;
        } catch {
          driver.registration.health = {
            status: 'offline',
            lastChecked: new Date().toISOString(),
          };
        }
      }
    }, intervalMs);
  }

  /** Stop health monitoring. */
  stopHealthMonitor(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}
```

### 4.3 The PingApp Driver Adapter

Wraps an existing PingApp (running on its own port) into the Driver interface:

```typescript
// @pingdev/std/src/drivers/pingapp-adapter.ts

import type { Driver, DriverRegistration, DriverHealth, DeviceRequest, DeviceResponse, DriverCapabilities } from '../types.js';

export class PingAppDriver implements Driver {
  readonly registration: DriverRegistration;
  private baseUrl: string;

  constructor(config: {
    id: string;
    name: string;
    port: number;
    capabilities: DriverCapabilities;
    priority?: number;
    tools?: string[];
    modes?: string[];
  }) {
    this.baseUrl = `http://localhost:${config.port}`;
    this.registration = {
      id: config.id,
      name: config.name,
      type: 'pingapp',
      capabilities: config.capabilities,
      health: { status: 'unknown', lastChecked: new Date().toISOString() },
      endpoint: { url: this.baseUrl, port: config.port },
      priority: config.priority ?? 50,
      tools: config.tools,
      modes: config.modes,
    };
  }

  async health(): Promise<DriverHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/health`);
      const data = await res.json();
      return {
        status: data.status === 'healthy' ? 'online' : data.status === 'degraded' ? 'degraded' : 'offline',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        details: data,
      };
    } catch {
      return { status: 'offline', lastChecked: new Date().toISOString() };
    }
  }

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    const start = Date.now();

    // Use /v1/chat for synchronous, /v1/jobs for async
    const res = await fetch(`${this.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        tool: request.tool,
        mode: request.mode,
        conversation_id: request.conversation_id,
        timeout_ms: request.timeout_ms,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `PingApp request failed: ${res.status}`);
    }

    const data = await res.json();
    const totalMs = Date.now() - start;

    return {
      response: data.response ?? '',
      driver_id: this.registration.id,
      job_id: data.job_id,
      thinking: data.thinking,
      timing: {
        processing_ms: data.timing?.total_ms ?? totalMs,
        total_ms: totalMs,
        first_token_ms: data.timing?.first_token_at
          ? new Date(data.timing.first_token_at).getTime() - start
          : undefined,
      },
      conversation_id: data.conversation_id,
    };
  }

  // stream() can wrap /v1/jobs/:id/stream SSE endpoint
}
```

### 4.4 API-Native Driver Example (Ollama)

```typescript
// @pingdev/drivers/src/ollama.ts

import type { Driver, DriverHealth, DeviceRequest, DeviceResponse, ModelInfo } from '@pingdev/std';

export class OllamaDriver implements Driver {
  readonly registration;
  private baseUrl: string;

  constructor(config: {
    model: string;
    baseUrl?: string;
    priority?: number;
  }) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.registration = {
      id: `ollama-${config.model}`,
      name: `Ollama ${config.model}`,
      type: 'api' as const,
      capabilities: {
        llm: true,
        vision: config.model.includes('llava') || config.model.includes('vision'),
        toolCalling: false,
        streaming: true,
        imageGen: false,
        videoGen: false,
        search: false,
        codeExecution: false,
        deepResearch: false,
        thinking: config.model.includes('deepseek') || config.model.includes('qwen'),
        conversation: true,
        fileUpload: false,
      },
      health: { status: 'unknown', lastChecked: new Date().toISOString() },
      endpoint: { url: this.baseUrl },
      model: { id: config.model, name: config.model, provider: 'ollama' },
      priority: config.priority ?? 100,
    };
  }

  async health(): Promise<DriverHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`${res.status}`);
      return {
        status: 'online',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    } catch {
      return { status: 'offline', lastChecked: new Date().toISOString() };
    }
  }

  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    const start = Date.now();
    const model = request.model ?? this.registration.model!.id;

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`Ollama request failed: ${res.status}`);
    const data = await res.json();

    return {
      response: data.message?.content ?? '',
      driver_id: this.registration.id,
      model,
      timing: {
        processing_ms: data.total_duration ? data.total_duration / 1e6 : Date.now() - start,
        total_ms: Date.now() - start,
      },
      usage: data.prompt_eval_count ? {
        prompt_tokens: data.prompt_eval_count,
        completion_tokens: data.eval_count ?? 0,
        total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      } : undefined,
    };
  }

  async *stream(request: DeviceRequest) {
    const model = request.model ?? this.registration.model!.id;
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        stream: true,
      }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(Boolean)) {
        const data = JSON.parse(line);
        accumulated += data.message?.content ?? '';

        if (data.done) {
          yield { type: 'complete' as const, response: accumulated, driver_id: this.registration.id };
        } else {
          yield { type: 'partial' as const, response: accumulated, driver_id: this.registration.id };
        }
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`);
    const data = await res.json();
    return (data.models ?? []).map((m: any) => ({
      id: m.name,
      name: m.name,
      provider: 'ollama',
    }));
  }
}
```

### 4.5 The Gateway Server (POSIX Routes)

```typescript
// @pingdev/std/src/gateway.ts

import Fastify from 'fastify';
import type { ModelRegistry } from './registry.js';
import type { DeviceRequest, DeviceResponse, DriverCapabilities } from './types.js';

/** Virtual device path → required capabilities mapping. */
const DEVICE_MAP: Record<string, Partial<DriverCapabilities>> = {
  '/dev/llm':        { llm: true },
  '/dev/search':     { search: true },
  '/dev/image-gen':  { imageGen: true },
  '/dev/video-gen':  { videoGen: true },
  '/dev/code':       { codeExecution: true },
  '/dev/research':   { deepResearch: true },
  '/dev/vision':     { vision: true },
};

export function createGateway(registry: ModelRegistry, port: number = 3500) {
  const app = Fastify({ logger: false });

  // ── Registry endpoints ────────────────────────────

  /** GET /v1/registry — list all registered drivers. */
  app.get('/v1/registry', async () => registry.list());

  /** GET /v1/registry/:id — get specific driver info. */
  app.get<{ Params: { id: string } }>('/v1/registry/:id', async (req, reply) => {
    const driver = registry.get(req.params.id);
    if (!driver) return reply.status(404).send({ error: 'Driver not found' });
    return driver.registration;
  });

  /** GET /v1/registry/:id/health — check driver health. */
  app.get<{ Params: { id: string } }>('/v1/registry/:id/health', async (req, reply) => {
    const driver = registry.get(req.params.id);
    if (!driver) return reply.status(404).send({ error: 'Driver not found' });
    return driver.health();
  });

  /** GET /v1/capabilities — aggregate capabilities across all drivers. */
  app.get('/v1/capabilities', async () => {
    const all = registry.list();
    const aggregate: Record<string, string[]> = {};
    for (const driver of all) {
      for (const [cap, enabled] of Object.entries(driver.capabilities)) {
        if (enabled) {
          if (!aggregate[cap]) aggregate[cap] = [];
          aggregate[cap]!.push(driver.id);
        }
      }
    }
    return aggregate;
  });

  // ── POSIX device endpoints ────────────────────────

  /** POST /dev/:device/prompt — universal prompt endpoint. */
  app.post<{ Params: { device: string }; Body: DeviceRequest }>(
    '/dev/:device/prompt',
    async (req, reply) => {
      const devicePath = `/dev/${req.params.device}`;
      const requiredCaps = DEVICE_MAP[devicePath];

      if (!requiredCaps) {
        return reply.status(404).send({
          error: `Unknown device: ${devicePath}`,
          available: Object.keys(DEVICE_MAP),
        });
      }

      // Merge explicit requirements from request body
      const mergedCaps = { ...requiredCaps, ...req.body.require };

      // If caller specified a driver, use it directly
      if (req.body.driver) {
        const driver = registry.get(req.body.driver);
        if (!driver) {
          return reply.status(404).send({ error: `Driver not found: ${req.body.driver}` });
        }
        return driver.execute(req.body);
      }

      // Route to best available driver
      const driver = registry.resolve(mergedCaps, req.body.strategy);
      if (!driver) {
        return reply.status(503).send({
          error: 'No driver available',
          required_capabilities: mergedCaps,
          registered_drivers: registry.list().map(d => ({
            id: d.id,
            health: d.health.status,
            capabilities: d.capabilities,
          })),
        });
      }

      try {
        const response = await driver.execute(req.body);
        return response;
      } catch (err) {
        return reply.status(502).send({
          error: `Driver ${driver.registration.id} failed: ${String(err)}`,
          driver_id: driver.registration.id,
        });
      }
    },
  );

  /** POST /dev/:device/stream — streaming variant. */
  app.post<{ Params: { device: string }; Body: DeviceRequest }>(
    '/dev/:device/stream',
    async (req, reply) => {
      const devicePath = `/dev/${req.params.device}`;
      const requiredCaps = { ...DEVICE_MAP[devicePath], streaming: true, ...req.body.require };

      const driver = req.body.driver
        ? registry.get(req.body.driver)
        : registry.resolve(requiredCaps, req.body.strategy);

      if (!driver) {
        return reply.status(503).send({ error: 'No streaming driver available' });
      }

      if (!driver.stream) {
        return reply.status(501).send({
          error: `Driver ${driver.registration.id} does not support streaming`,
        });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      for await (const chunk of driver.stream(req.body)) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.end();
    },
  );

  // ── Health ────────────────────────────────────────

  /** GET /v1/health — gateway health (aggregate of all drivers). */
  app.get('/v1/health', async () => {
    const drivers = registry.list();
    const online = drivers.filter(d => d.health.status === 'online').length;
    return {
      status: online > 0 ? 'healthy' : drivers.length > 0 ? 'degraded' : 'unhealthy',
      drivers: { total: drivers.length, online, offline: drivers.length - online },
      devices: Object.keys(DEVICE_MAP),
      timestamp: new Date().toISOString(),
    };
  });

  return {
    async start() {
      registry.startHealthMonitor();
      await app.listen({ host: '0.0.0.0', port });
    },
    async stop() {
      registry.stopHealthMonitor();
      await app.close();
    },
  };
}
```

### 4.6 Configuration & Bootstrap

```typescript
// @pingdev/std/src/config.ts

import type { DriverRegistration } from './types.js';

/** Config file structure: ~/.pingos/config.json */
export interface PingOSConfig {
  /** Gateway port (default 3500). */
  gatewayPort: number;
  /** Registered drivers. */
  drivers: DriverConfig[];
  /** Default routing strategy. */
  defaultStrategy: 'fastest' | 'cheapest' | 'best' | 'round-robin';
  /** Health check interval in ms. */
  healthIntervalMs: number;
}

export interface DriverConfig {
  /** Driver ID. */
  id: string;
  /** Driver type. */
  type: 'pingapp' | 'ollama' | 'openai' | 'anthropic' | 'openrouter' | 'lmstudio';
  /** Connection details. */
  endpoint: string;
  /** Model name (for API backends). */
  model?: string;
  /** API key env var (e.g., 'OPENAI_API_KEY'). */
  apiKeyEnv?: string;
  /** Priority (lower = preferred). */
  priority?: number;
  /** Override capability flags. */
  capabilities?: Partial<DriverRegistration['capabilities']>;
  /** Whether this driver is enabled. */
  enabled?: boolean;
}

export const DEFAULT_CONFIG: PingOSConfig = {
  gatewayPort: 3500,
  defaultStrategy: 'best',
  healthIntervalMs: 30_000,
  drivers: [
    // Auto-detect local PingApps
    { id: 'gemini', type: 'pingapp', endpoint: 'http://localhost:3456', priority: 10 },
    { id: 'aistudio', type: 'pingapp', endpoint: 'http://localhost:3457', priority: 20 },
    { id: 'chatgpt', type: 'pingapp', endpoint: 'http://localhost:3458', priority: 30 },
  ],
};
```

---

## 5. Proposed File Structure

```
~/projects/pingdev/
├── packages/
│   ├── core/               # @pingdev/core — UNCHANGED (browser PingApp engine)
│   ├── std/                 # @pingdev/std — NEW (POSIX layer + gateway)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # Public API exports
│   │       ├── types.ts              # Driver, DriverCapabilities, DeviceRequest, etc.
│   │       ├── registry.ts           # ModelRegistry class
│   │       ├── gateway.ts            # Fastify gateway with POSIX routes
│   │       ├── config.ts             # PingOSConfig, DEFAULT_CONFIG
│   │       ├── errors.ts             # POSIX-style error codes (ENOENT, EACCES, EBUSY)
│   │       ├── drivers/
│   │       │   ├── pingapp-adapter.ts    # Wraps running PingApps into Driver interface
│   │       │   ├── ollama.ts             # Ollama API driver
│   │       │   ├── openai.ts            # OpenAI-compatible API driver
│   │       │   ├── anthropic.ts          # Anthropic API driver
│   │       │   ├── openrouter.ts         # OpenRouter API driver
│   │       │   ├── lmstudio.ts           # LM Studio driver (OpenAI-compatible)
│   │       │   └── index.ts             # Driver factory (config → Driver instance)
│   │       ├── routing/
│   │       │   ├── resolver.ts           # Capability-based routing logic
│   │       │   └── strategies.ts         # fastest, cheapest, best, round-robin
│   │       └── cli/
│   │           └── pingos.ts            # CLI entry: pingos start, pingos drivers, etc.
│   ├── dashboard/          # Updated to show registry + POSIX devices
│   ├── recon/              # UNCHANGED
│   └── cli/                # UNCHANGED
```

---

## 6. POSIX Error Mapping

```typescript
// @pingdev/std/src/errors.ts

/** POSIX-style error codes for PingOS. */
export const PosixErrors = {
  /** Driver not found (no backend registered for this capability). */
  ENOENT: (device: string) => ({
    code: 'ENOENT',
    message: `No driver available for ${device}`,
    posixAnalog: 'No such file or directory',
  }),

  /** Authentication required (PingApp session expired, API key missing). */
  EACCES: (driver: string, reason: string) => ({
    code: 'EACCES',
    message: `Access denied on ${driver}: ${reason}`,
    posixAnalog: 'Permission denied',
  }),

  /** Resource busy (PingApp tab locked, single-concurrency). */
  EBUSY: (driver: string) => ({
    code: 'EBUSY',
    message: `${driver} is busy (single concurrency)`,
    posixAnalog: 'Device or resource busy',
    retryable: true,
  }),

  /** Timeout (generation or API call exceeded deadline). */
  ETIMEDOUT: (driver: string, ms: number) => ({
    code: 'ETIMEDOUT',
    message: `${driver} timed out after ${ms}ms`,
    posixAnalog: 'Connection timed out',
    retryable: true,
  }),

  /** Connection refused (driver endpoint unreachable). */
  ECONNREFUSED: (endpoint: string) => ({
    code: 'ECONNREFUSED',
    message: `Cannot connect to ${endpoint}`,
    posixAnalog: 'Connection refused',
  }),

  /** Rate limited. */
  EAGAIN: (driver: string, retryAfterMs: number) => ({
    code: 'EAGAIN',
    message: `${driver} rate limited, retry after ${retryAfterMs}ms`,
    posixAnalog: 'Resource temporarily unavailable',
    retryable: true,
    retryAfterMs,
  }),

  /** Not implemented (driver doesn't support this capability). */
  ENOSYS: (driver: string, capability: string) => ({
    code: 'ENOSYS',
    message: `${driver} does not support ${capability}`,
    posixAnalog: 'Function not implemented',
  }),
} as const;
```

---

## 7. API Routes Summary

### Gateway routes (port 3500)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/dev/llm/prompt` | Send prompt to best LLM backend |
| POST | `/dev/llm/stream` | Stream from best LLM backend |
| POST | `/dev/search/prompt` | Search via best search backend |
| POST | `/dev/image-gen/prompt` | Generate image |
| POST | `/dev/video-gen/prompt` | Generate video |
| POST | `/dev/code/prompt` | Code execution |
| POST | `/dev/research/prompt` | Deep research |
| POST | `/dev/vision/prompt` | Vision/image understanding |
| GET | `/v1/registry` | List all registered drivers |
| GET | `/v1/registry/:id` | Get driver details |
| GET | `/v1/registry/:id/health` | Check driver health |
| GET | `/v1/capabilities` | Aggregate capability matrix |
| GET | `/v1/health` | Gateway health |

### Existing PingApp routes (unchanged, per-port)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/jobs` | Async job submission |
| GET | `/v1/jobs/:id` | Job status/result |
| GET | `/v1/jobs/:id/status` | Live detailed status |
| GET | `/v1/jobs/:id/stream` | SSE event stream |
| POST | `/v1/chat` | Sync convenience |
| GET | `/v1/health` | Health check |

---

## 8. What Can Be Reused (Verbatim)

| Component | Reuse Status |
|-----------|-------------|
| `@pingdev/core` entire package | **100% reused** — no changes needed for Phase 1 |
| Gemini SiteDefinition + tools | **100% reused** — runs as-is behind the gateway |
| AI Studio SiteDefinition | **100% reused** |
| ChatGPT SiteDefinition | **100% reused** (stub) |
| Dashboard React app | **~90% reused** — add registry view, keep all existing |
| BullMQ queue infrastructure | **100% reused** — per PingApp, gateway doesn't touch it |
| SSE streaming | **100% reused** for PingApp backends |
| Recon engine | **100% reused** — unrelated to POSIX layer |
| Error taxonomy (`ErrorCode`) | **Extended** — add POSIX codes alongside existing |
| Health checking | **Reused** — gateway aggregates individual health checks |

---

## 9. What Must Be Built New

| Component | Effort | Priority |
|-----------|--------|----------|
| `@pingdev/std/types.ts` — Driver interface, DriverCapabilities, DeviceRequest/Response | 2h | P0 |
| `@pingdev/std/registry.ts` — ModelRegistry with health monitoring | 3h | P0 |
| `@pingdev/std/gateway.ts` — Fastify server with POSIX routes | 4h | P0 |
| `@pingdev/std/drivers/pingapp-adapter.ts` — wrap existing PingApps | 2h | P0 |
| `@pingdev/std/drivers/ollama.ts` — Ollama REST driver | 2h | P1 |
| `@pingdev/std/drivers/openai.ts` — OpenAI-compatible driver | 2h | P1 |
| `@pingdev/std/errors.ts` — POSIX error codes | 1h | P0 |
| `@pingdev/std/config.ts` — config loading/saving | 1h | P0 |
| `@pingdev/std/routing/resolver.ts` — capability-based routing | 2h | P0 |
| `@pingdev/std/drivers/anthropic.ts` — Anthropic driver | 2h | P2 |
| `@pingdev/std/drivers/openrouter.ts` — OpenRouter driver | 1h | P2 |
| Dashboard registry UI | 4h | P1 |
| CLI commands (`pingos start`, `pingos drivers ls`) | 3h | P1 |

**Total estimated: ~29 hours of implementation.**

---

## 10. Build Order

### Sprint 1 (Foundation) — Days 1-2
1. Create `@pingdev/std` package scaffolding
2. Implement `types.ts` (all interfaces)
3. Implement `errors.ts` (POSIX error codes)
4. Implement `registry.ts` (ModelRegistry)
5. Implement `drivers/pingapp-adapter.ts` (wrap existing PingApps)

### Sprint 2 (Gateway) — Days 3-4
6. Implement `gateway.ts` (Fastify server with POSIX routes)
7. Implement `config.ts` (configuration loading)
8. Implement `routing/resolver.ts` + `routing/strategies.ts`
9. Wire up: config → registry → gateway → pingapp-adapters
10. Test: `POST /dev/llm/prompt` → routes to Gemini → returns response

### Sprint 3 (API Backends) — Days 5-6
11. Implement `drivers/ollama.ts` with streaming
12. Implement `drivers/openai.ts` (covers OpenAI, LM Studio, OpenRouter with config)
13. Test: `POST /dev/llm/prompt` with Ollama backend
14. Test: capability routing (request vision → picks driver that supports it)

### Sprint 4 (Dashboard + CLI) — Days 7-8
15. Add `/v1/registry` view to dashboard
16. Add capability matrix visualization
17. Implement basic CLI (`pingos start`, `pingos drivers list`, `pingos drivers add`)
18. Integration test: all 3 PingApps + Ollama visible in dashboard

### Sprint 5 (Polish + Streaming) — Days 9-10
19. Implement `/dev/:device/stream` SSE endpoint
20. Anthropic driver
21. End-to-end test: agent sends prompt → gateway routes → gets streaming response
22. Documentation

---

## 11. Critical Design Decisions

### 11.1 Gateway as a SEPARATE process (port 3500)

**Decision:** The POSIX gateway runs on its own port, separate from individual PingApps.

**Rationale:** PingApps MUST remain independently runnable. An agent that knows it wants Gemini can still call `http://localhost:3456/v1/chat` directly. The gateway is an optional routing layer for agents that want abstraction.

### 11.2 Capability flags are STATIC, not auto-detected

**Decision:** Capabilities are declared in the driver config, not discovered at runtime.

**Rationale:** Auto-detection requires probing each backend with test prompts, which is slow, expensive, and unreliable. A human (or the recon engine) declares what each backend supports.

### 11.3 PingApp adapter uses /v1/chat, not /v1/jobs

**Decision:** The PingApp adapter calls the synchronous `/v1/chat` endpoint by default.

**Rationale:** The POSIX interface is request→response. The async `/v1/jobs` path exists for long-running flows (Deep Research) but most prompts should use the synchronous path. The adapter can optionally use `/v1/jobs` + polling for tools that need it.

### 11.4 No changes to SiteDefinition for Phase 1

**Decision:** We do NOT add a `capabilities` field to `SiteDefinition` in Phase 1.

**Rationale:** Capabilities are a POSIX-layer concern, not a core concern. The PingApp adapter in `@pingdev/std` derives capabilities from the PingApp's `tools` and `modes` arrays. This keeps core stable and backwards-compatible.

### 11.5 Config lives at `~/.pingos/config.json`

**Decision:** System-level config, not per-project.

**Rationale:** PingOS is a system daemon, not a project dependency. Like `/etc` config in POSIX systems.

---

## 12. Example Usage

### An AI agent calls PingOS

```bash
# Ask the best available LLM
curl -X POST http://localhost:3500/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Explain quantum computing in simple terms"}'

# Response:
{
  "response": "Quantum computing uses...",
  "driver_id": "gemini",
  "timing": { "processing_ms": 8420, "total_ms": 8500 }
}
```

```bash
# Require vision capability
curl -X POST http://localhost:3500/dev/vision/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Describe this image", "require": {"vision": true}}'

# Routes to a driver with vision=true
```

```bash
# Target a specific driver
curl -X POST http://localhost:3500/dev/llm/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Hello", "driver": "ollama-llama3"}'
```

```bash
# Deep research via POSIX
curl -X POST http://localhost:3500/dev/research/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "State of quantum computing 2026", "tool": "deep_research", "timeout_ms": 300000}'

# Routes to Gemini (only backend with deepResearch=true)
```

```bash
# List what's available
curl http://localhost:3500/v1/capabilities

{
  "llm": ["gemini", "aistudio", "chatgpt", "ollama-llama3", "openai-gpt4o"],
  "vision": ["gemini", "openai-gpt4o"],
  "imageGen": ["gemini"],
  "search": [],
  "deepResearch": ["gemini"],
  "thinking": ["gemini", "ollama-deepseek-r1"]
}
```

---

## 13. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| PingApp latency (5-30s per prompt) makes gateway feel slow | Medium | Document that PingApps are inherently slower than APIs; suggest API backends for latency-sensitive work |
| Config file management complexity | Low | Start with simple JSON; can migrate to YAML/TOML later |
| Streaming differences between PingApp SSE and API streaming | Medium | Normalize to common SSE format in gateway |
| Driver health flapping | Low | Use exponential backoff for health checks; require N consecutive failures before marking offline |
| Scope creep into Phase 2 (JIT healing, package manager) | High | **Hard boundary:** Phase 1 delivers gateway + registry + 3 PingApp adapters + 2 API drivers. Nothing else. |

---

## 14. Success Criteria

Phase 1 is DONE when:

1. `curl POST /dev/llm/prompt` with a prompt routes to Gemini and returns a response
2. `curl GET /v1/registry` shows all 3 PingApps + at least 1 API backend
3. `curl GET /v1/capabilities` shows correct capability matrix
4. Adding an Ollama model to config → it appears in registry → `/dev/llm/prompt` can route to it
5. Dashboard shows the model registry with health status for all backends
6. Requesting a capability no driver supports returns `ENOENT` with helpful error
7. Requesting a busy PingApp returns `EBUSY`
8. All existing PingApp endpoints (`/v1/jobs`, `/v1/chat`, etc.) continue working unchanged

---

*This assessment was produced by deep analysis of every source file in the PingDev monorepo, including @pingdev/core (35 files), the Gemini PingApp (12 files), AI Studio PingApp (5 files), ChatGPT PingApp (6 files), the dashboard (10 files), and the recon engine types. All proposed interfaces are designed to compose with the existing SiteDefinition/ActionHandler architecture without requiring changes to running PingApps.*
