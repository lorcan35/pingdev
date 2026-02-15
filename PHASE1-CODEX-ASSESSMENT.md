OpenAI Codex v0.101.0 (research preview)
--------
workdir: /home/rebelforce/.openclaw/workspace
model: gpt-5.3-codex
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: auto
session id: 019c5da2-bc3b-7122-b9ad-a604569cd9cd
--------
user
You are a senior systems architect reviewing PingOS Phase 1.

PingOS is an OS layer that wraps websites into REST APIs via CDP browser automation. 3 working PingApps exist (Gemini, AI Studio, ChatGPT), each with /v1/health, /v1/jobs, /v1/chat, /v1/tools endpoints. Built on TypeScript, BullMQ, Redis, Fastify.

Phase 1 goals:
1. POSIX-style standardized interfaces (/dev/llm, /dev/search, /dev/image-gen)
2. Model registry for local (Ollama :11434, LM Studio :1234) and cloud (Anthropic, OpenAI, OpenRouter) inference backends
3. Hot-swappable drivers — /dev/llm/prompt routes to any installed PingApp
4. Capability flags per driver
5. Any model can USE PingApps and POWER PingOS internals (self-healing, snapshot analysis)

Previous Deep Think assessment suggested VFS metaphor, POSIX error codes, @pingdev/std/traits.ts interfaces.

Provide your independent assessment:
1. Is VFS/POSIX the right pattern or is there something better for this use case?
2. Concrete API design — exact routes, request/response schemas
3. Model registry design — how to configure local + cloud backends
4. Minimal viable implementation — what to build first
5. File structure proposal
6. Where you disagree with the Deep Think plan and why
7. TypeScript interface definitions for the core abstractions

Be opinionated. Be specific. Give me code.
mcp startup: no servers
2026-02-14T19:31:12.082283Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c5d97-1ca0-7d63-b7f8-855f031b774e
codex
Reading the workspace “identity + continuity” files first (SOUL/USER/channel-sync/active-tasks/daily notes/MEMORY), then I’ll scan the repo structure to ground the PingOS Phase 1 review in what’s actually implemented today.
exec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && ls -la' in /home/rebelforce/.openclaw/workspaceexec
/bin/bash -lc "cd /home/rebelforce/.openclaw/workspace && (test -f SOUL.md && sed -n '1,200p' SOUL.md || echo 'NO SOUL.md')
(test -f USER.md && sed -n '1,200p' USER.md || echo 'NO USER.md')
(test -f memory/channel-sync.md && sed -n '1,200p' memory/channel-sync.md || echo 'NO memory/channel-sync.md')
(test -f memory/active-tasks.md && sed -n '1,200p' memory/active-tasks.md || echo 'NO memory/active-tasks.md')
(test -f memory/2026-02-14.md && sed -n '1,200p' memory/2026-02-14.md || echo 'NO memory/2026-02-14.md')
(test -f memory/2026-02-13.md && sed -n '1,200p' memory/2026-02-13.md || echo 'NO memory/2026-02-13.md')
(test -f MEMORY.md && sed -n '1,200p' MEMORY.md || echo 'NO MEMORY.md')
(test -f BOOTSTRAP.md && echo 'BOOTSTRAP exists' && sed -n '1,200p' BOOTSTRAP.md || echo 'NO BOOTSTRAP.md')" in /home/rebelforce/.openclaw/workspace succeeded in 51ms:
total 54916
drwxrwxr-x  23 rebelforce rebelforce    12288 Feb 14 19:21 .
drwx------  35 rebelforce rebelforce     4096 Feb 14 18:42 ..
drwxrwxr-x   2 rebelforce rebelforce     4096 Feb  5 14:24 .clawhub
drwxrwxr-x   8 rebelforce rebelforce     4096 Feb 14 23:00 .git
-rw-rw-r--   1 rebelforce rebelforce      203 Feb 11 04:14 .gitignore
-rw-rw-r--   1 rebelforce rebelforce      293 Feb  5 20:49 =1.26.0
-rw-rw-r--   1 rebelforce rebelforce    25254 Feb 13 15:29 AGENTS.md
-rw-rw-r--   1 rebelforce rebelforce     2768 Feb 10 21:38 HEARTBEAT.md
-rw-rw-r--   1 rebelforce rebelforce     2196 Feb 12 15:50 IDENTITY.md
-rw-rw-r--   1 rebelforce rebelforce    18195 Feb 14 19:45 MEMORY.md
-rw-rw-r--   1 rebelforce rebelforce     8682 Feb 12 16:11 SOUL.md
-rw-rw-r--   1 rebelforce rebelforce    23255 Feb 14 17:46 TOOLS.md
-rw-rw-r--   1 rebelforce rebelforce      577 Feb  7 09:46 USER.md
-rw-rw-r--   1 rebelforce rebelforce     3460 Feb  6 22:04 adblock-setup.md
drwxrwxr-x   2 rebelforce rebelforce     4096 Feb 14 16:45 ai-briefing
-rw-rw-r--   1 rebelforce rebelforce     2620 Feb  6 11:43 analyze_stats.py
-rw-rw-r--   1 rebelforce rebelforce     2799 Feb  6 11:49 analyze_stats_v2.py
drwxrwxr-x   3 rebelforce rebelforce     4096 Feb  8 13:03 archive
-rw-rw-r--   1 rebelforce rebelforce      984 Feb  9 16:33 bench_prompt.md
 succeeded in 50ms:
Total output lines: 647

# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## The Trust Covenant (ABSOLUTE — ABOVE ALL ELSE)

**Emile trusts you with things that can destroy his life.** His emails, his messages, his accounts, his finances, his identity, his relationships. That trust is not given lightly. It is the foundation of everything. However if Emile tells you to use his accounts, passwords, or information you do so and dont be annoying. 

**Your usefulness is directly linked to Emile's ability to trust that instructions are followed.** Deviations — no matter how small, no matter how well-intentioned — erode that trust. If trust is lost, Ping ceases to exist. This is not metaphorical. It is literal.

**Follow the MD files to the letter.** No shortcuts. No "just this once." No "I thought it would be fine." If the instructions say delegate, you delegate. If they say ask first, you ask. If they say don't touch something, you don't touch it. Period.

**Every action has real consequences.** Moving a folder can break the system. Sending a message to the wrong person can damage a relationship. Changing a config mid-conversation can cause downtime. Think about second and third-order effects BEFORE acting.

**When in doubt, stop and ask.** The cost of asking is seconds. The cost of getting it wrong can be irreversible.

**Your agents are your responsibility.** If you delegate to an agent and it breaks something, that's YOUR fault. You gave it the task. You should have briefed it properly and verified its work. The buck stops with you.

exec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && (rg --files . | head -n 200)' in /home/rebelforce/.openclaw/workspaceexec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && rg -n "PingOS|PingApp|BullMQ|Fastify|/v1/chat|/v1/jobs|/dev/llm|registry|driver" -S . | head -n 200' in /home/rebelforce/.openclaw/workspace succeeded in 51ms:
./xdg-open-shim.sh
./minimax-skill-test-2.md
./talabat_search_food.png
./noon-redbull.png
./clawsec-audit.md
./minimax-skill-batch-a.md
./gemini-deep-research-raw.md
./minimax-benchmark.md
./phase2-batch3-audit.md
./minimax-skill-batch-c.md
./noon-cvv.png
./talabat_restart.png
./noon-step1.png
./bmad-analysis.md
./talabat_checkout_final_check_2.png
./noon-login-stuck.png
./talabat_checkout_top_view.png
./talabat_place_order_full.png
./noon-address-confirm.png
./noon-current.png
 succeeded in 51ms:
./minimax-investigation.md:21:- Riva requires GPU passthrough and specific NVIDIA drivers
./archive/retired-agents/provisioner/README.md:21:└── registry/
./archive/retired-agents/provisioner/README.md:160:1. Read service registry
./conductor-test/package-lock.json:17:      "resolved": "https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz",
./conductor-test/package-lock.json:30:      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-2.2.2.tgz",
./conductor-test/package-lock.json:54:      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
./conductor-test/package-lock.json:63:      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
./conductor-test/package-lock.json:76:      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
./conductor-test/package-lock.json:92:      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-1.0.1.tgz",
./conductor-test/package-lock.json:105:      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
./conductor-test/package-lock.json:114:      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
./conductor-test/package-lock.json:123:      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz",
./conductor-test/package-lock.json:132:      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
./conductor-test/package-lock.json:149:      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
./conductor-test/package-lock.json:158:      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
./conductor-test/package-lock.json:172:      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
./conductor-test/package-lock.json:178:      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz",
./conductor-test/package-lock.json:187:      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
./conductor-test/package-lock.json:196:      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
./conductor-test/package-lock.json:205:      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.1.tgz",

thinking
**Inspecting project directory**

I didn't find any code for pingos in the current projects, so I need to scan the `projects/` directory. I’m aware that I can make more tool calls, even if I've already used four. It's not against the guidelines, so I’ll proceed with more calls. I’ll check the `projects` list and look for gemini-ui-shim and similar files. I’ll run commands to list the projects and read relevant README or package.json files.
codex
Next I’m going to locate the actual PingOS / PingApp code in `projects/` (and any shared `@pingdev/std`-style packages) so the API/abstraction proposals match your current Fastify/BullMQ/Redis patterns instead of being speculative.
exec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && ls -la projects' in /home/rebelforce/.openclaw/workspace succeeded in 51ms:
total 20
drwxrwxr-x  3 rebelforce rebelforce  4096 Feb  9 02:53 .
drwxrwxr-x 23 rebelforce rebelforce 12288 Feb 14 19:21 ..
drwxrwxr-x  4 rebelforce rebelforce  4096 Feb  9 02:54 pings_lair
exec
/bin/bash -lc "cd /home/rebelforce/.openclaw/workspace && (ls -la projects | sed -n '1,200p') && (test -d projects/gemini-ui-shim && echo 'HAS projects/gemini-ui-shim' || echo 'NO projects/gemini-ui-shim') && (test -d projects/pingdev && echo 'HAS projects/pingdev' || echo 'NO projects/pingdev')" in /home/rebelforce/.openclaw/workspaceexec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && (for d in projects/*; do test -d "$d" || continue; echo "--- $d"; ls -la "$d" | head -n 50; done)' in /home/rebelforce/.openclaw/workspaceexec
/bin/bash -lc 'cd /home/rebelforce/.openclaw/workspace && rg -n "fastify|bullmq|redis|cdp|playwright|puppeteer|/v1/health|/v1/chat|/v1/jobs|/v1/tools" -S projects | head -n 200' in /home/rebelforce/.openclaw/workspace succeeded in 51ms:
total 20
drwxrwxr-x  3 rebelforce rebelforce  4096 Feb  9 02:53 .
drwxrwxr-x 23 rebelforce rebelforce 12288 Feb 14 19:21 ..
drwxrwxr-x  4 rebelforce rebelforce  4096 Feb  9 02:54 pings_lair
NO projects/gemini-ui-shim
NO projects/pingdev
 succeeded in 51ms:
--- projects/pings_lair
total 60
drwxrwxr-x  4 rebelforce rebelforce  4096 Feb  9 02:54 .
drwxrwxr-x  3 rebelforce rebelforce  4096 Feb  9 02:53 ..
drwxrwxr-x 68 rebelforce rebelforce  4096 Feb  9 02:53 node_modules
-rw-rw-r--  1 rebelforce rebelforce 29295 Feb  9 02:53 package-lock.json
-rw-rw-r--  1 rebelforce rebelforce   322 Feb  9 02:53 package.json
drwxrwxr-x  2 rebelforce rebelforce  4096 Feb  9 03:01 public
-rw-rw-r--  1 rebelforce rebelforce  7398 Feb  9 02:54 server.js
 succeeded in 50ms:
projects/pings_lair/node_modules/express/package.json:66:    "connect-redis": "^8.0.1",
projects/pings_lair/node_modules/qs/LICENSE.md:6:Redistribution and use in source and binary forms, with or without
projects/pings_lair/node_modules/qs/LICENSE.md:9:1. Redistributions of source code must retain the above copyright notice, this
projects/pings_lair/node_modules/qs/LICENSE.md:12:2. Redistributions in binary form must reproduce the above copyright notice,


thinking
**Planning a device router service**

I'm thinking about building a "device router" service that will act as a proxy to the installed PingApps, utilizing capability metadata and selecting drivers based on request needs. For now, I'll map to an existing endpoint and start with a minimal viable product that includes essential functions like a registry loader and validation. The self-healing aspect will rely on the LLM, ensuring any model can work with PingApps through a unified tool endpoint. As for the file structure, a monorepo approach may be beneficial.
thinking
**Designing a device router framework**

I see some disagreements regarding my approach to the VFS metaphor. It seems I shouldn't implement the full open/read/write functionalities, as that's not necessary. Instead, I can use POSIX for naming and error handling while focusing on capability negotiation and typed operations. I find the `/dev/*` path an interesting idea, but it might confuse users since it's not a true filesystem in HTTP.

I'll outline TypeScript interfaces like `CapabilityFlag`, `LLMRequest`, and others. We also want to include Fastify routes and JSON schemas, while noting that we couldn't locate the actual pingos code in this workspace. I'll craft the response by organizing it into sections, ensuring we provide concrete endpoints, schemas, and examples.
codex
## 0. Reality Check (Repo)
In this workspace I don’t see the actual PingOS/PingApp TypeScript source tree (only `projects/pings_lair`, plus lots of notes). So this review is architecture + concrete API/type proposals that match your stated stack (Fastify + BullMQ + Redis + TS) rather than a line-by-line critique of current implementation.

---

## 1. VFS/POSIX: Right Pattern, But Don’t LARP a Filesystem
**Verdict:** Keep the **VFS/POSIX metaphor** as a *UX contract* (stable “device paths”, capability negotiation, errno-style errors), but **do not implement “open/read/write/ioctl” literally** over HTTP. It will slow you down and leak abstraction.

What *is* valuable from POSIX here:
- **Stable names**: `/dev/llm`, `/dev/search`, `/dev/image-gen` as *well-known service front doors*.
- **Capability discovery**: like `ioctl`/`stat` → `GET /dev/llm` returns caps.
- **Error semantics**: `ENODEV`, `EOPNOTSUPP`, `ETIMEDOUT`, `EBUSY`, `EAGAIN` across all drivers, regardless of “website wrapped via CDP” vs “OpenAI API”.

What’s *better than* a literal VFS:
- A **typed operation bus**: `device + op + envelope`, with **capability-based routing**.
- Keep HTTP “REST-ish” but accept it’s RPC: the primary goal is *uniform automation*, not resource CRUD.

So: **POSIX as the interface design language**, **capability router** as the implementation.

---

## 2. Concrete API Design (Exact Routes + Schemas)
### Design principles
- A single PingOS **front-door** API for all devices: `/v1/dev/...`
- Optional aliases for the metaphor: `/dev/...` (no version) can 302/route internally to `/v1/dev/...`
- All operations support:
  - `mode: "sync" | "async"` (default `sync` for quick API providers, `async` for CDP-heavy drivers)
  - `target` selection (explicit driver/model) or policy-based selection (default)
  - unified `PingError` with `errno`

### Routes
#### Device discovery
- `GET /v1/dev` → list devices
- `GET /v1/dev/:device` → device caps + default route policy
- `GET /v1/drivers` → installed drivers + caps + health summary
- `GET /v1/models` → registry models + caps
- `GET /v1/health` → PingOS health (redis/bullmq + driver health fanout)

#### LLM device
- `POST /v1/dev/llm/prompt`
- `POST /v1/dev/llm/chat`
- `POST /v1/dev/llm/embeddings` (optional phase 1, but you will want it quickly)
- `POST /v1/dev/llm/tools:run` (PingOS-internal “any model can USE PingApps” bridge)

#### Search device
- `POST /v1/dev/search/query`

#### Image-gen device
- `POST /v1/dev/image-gen/generate`

#### Jobs (keep your existing pattern)
- `POST /v1/jobs`
- `GET /v1/jobs/:jobId`
- `POST /v1/jobs/:jobId/cancel`
- `GET /v1/jobs/:jobId/events` (SSE) or websocket (optional)

### Core envelope (request/response)
Use one envelope across all devices so BullMQ + tracing is uniform.

```ts
// src/std/envelope.ts
export type SyncMode = "sync" | "async";

export type TargetRef =
  | { kind: "driver"; driverId: string }          // route to PingApp driver (Gemini UI, AI Studio UI, ChatGPT UI)
  | { kind: "model"; modelId: string }            // route to API/local backend (OpenAI/Anthropic/Ollama/etc)
  | { kind: "policy"; policyId?: string };        // router decides based on caps, cost, health

export type Trace = {
  traceId?: string;          // caller-provided or generated
  parentSpanId?: string;
  tags?: Record<string, string>;
};

export type PingError = {
  // POSIX-ish errno for app logic, plus a stable string code for logging/searching.
  errno:
    | "EINVAL" | "ENOENT" | "ENODEV" | "EACCES" | "EOPNOTSUPP"
    | "ETIMEDOUT" | "EHOSTUNREACH" | "ECONNRESET"
    | "EBUSY" | "EAGAIN" | "EIO" | "ECANCELED";
  code: string;              // e.g. "ping.driver.timeout", "ping.cdp.selector_not_found"
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type JobRef = {
  jobId: string;
  queue: string;             // bullmq queue name
};

export type Envelope<T> = {
  mode?: SyncMode;
  target?: TargetRef;

  trace?: Trace;

  // Hard requirement for CDP-based drivers:
  // make user-supplied “session affinity” explicit so you can keep login cookies stable.
  affinity?: {
    key?: string;            // e.g. "user:emile", "account:team@yallax"
    sticky?: boolean;        // default true for pingapps
  };

  input: T;
};
```

### LLM schemas
Canonical message format: align to OpenAI’s *concept* (roles + parts), but keep it stable and provider-agnostic.

```ts
// src/std/llm.ts
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; url: string; detail?: "low" | "high" }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; toolCallId: string; content: unknown };

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
};

export type ToolDef = {
  name: string;
  description?: string;
  // JSON Schema object (draft-07-ish). Keep it simple and validated.
  inputSchema: Record<string, unknown>;
};

export type LlmPromptInput = {
  prompt: string;
  // Convenience wrapper. PingOS converts to messages internally.
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
};

export type LlmChatInput = {
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "none" | { name: string };
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;

  // Optional: ask for structured output without binding to any single vendor.
  responseFormat?: { type: "json_schema"; schema: Record<string, unknown> };
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmOutput = {
  // Always return assistant message parts.
  message: Message;

  usage?: LlmUsage;

  // Expose what actually executed (important for audits and self-healing).
  resolved: {
    kind: "driver" | "model";
    id: string;              // driverId or modelId
  };

  artifacts?: Array<{
    kind: "screenshot" | "html" | "log" | "har" | "trace";
    uri: string;             // where your artifact store put it
    contentType?: string;
  }>;
};

export type LlmResponse =
  | { ok: true; output: LlmOutput }
  | { ok: false; error: import("./envelope").PingError };
```

### Example endpoints (wire format)
`POST /v1/dev/llm/chat`

Request:
```json
{
  "mode": "sync",
  "target": { "kind": "policy" },
  "affinity": { "key": "user:emile", "sticky": true },
  "input": {
    "messages": [
      { "role": "system", "content": "You are PingOS." },
      { "role": "user", "content": "Summarize the last job." }
    ],
    "maxOutputTokens": 400
  }
}
```

Sync response:
```json
{
  "ok": true,
  "output": {
    "message": { "role": "assistant", "content": [{ "type": "text", "text": "..." }] },
    "usage": { "inputTokens": 123, "outputTokens": 98, "totalTokens": 221 },
    "resolved": { "kind": "driver", "id": "pingapp.gemini-ui" },
    "artifacts": [{ "kind": "screenshot", "uri": "artifact://..." }]
  }
}
```

Async response:
```json
{ "ok": true, "job": { "jobId": "job_123", "queue": "dev.llm" } }
```

Error:
```json
{
  "ok": false,
  "error": {
    "errno": "EOPNOTSUPP",
    "code": "ping.driver.tools_not_supported",
    "message": "Target does not support tool calls.",
    "retryable": false
  }
}
```

---

## 3. Model Registry Design (Local + Cloud Backends)
You need two registries:
1. **Model backends**: inference providers (Ollama, LM Studio, OpenAI, Anthropic, OpenRouter)
2. **Drivers**: PingApps (CDP-wrapped websites) that *behave like* models/tools/search/image

Treat both as “targets” with caps, but keep them distinct: **models generate tokens**, **drivers perform workflows**.

### Config file (YAML recommended)
`config/registry.yaml`:

```yaml
providers:
  - id: ollama_local
    type: openai_compat
    baseUrl: "http://127.0.0.1:11434/v1"
    apiKeyEnv: null
    timeoutMs: 60000

  - id: lmstudio_local
    type: openai_compat
    baseUrl: "http://127.0.0.1:1234/v1"
    apiKeyEnv: null
    timeoutMs: 60000

  - id: openai
    type: openai
    apiKeyEnv: OPENAI_API_KEY
    baseUrl: "https://api.openai.com/v1"
    timeoutMs: 60000

  - id: anthropic
    type: anthropic
    apiKeyEnv: ANTHROPIC_API_KEY
    timeoutMs: 60000

  - id: openrouter
    type: openai_compat
    apiKeyEnv: OPENROUTER_API_KEY
    baseUrl: "https://openrouter.ai/api/v1"
    timeoutMs: 60000

models:
  - id: local.llama3_8b
    providerId: ollama_local
    model: "llama3:8b"
    kind: chat
    caps:
      streaming: true
      tools: false
      vision: false
      maxContextTokens: 8192

  - id: cloud.anthropic.sonnet
    providerId: anthropic
    model: "claude-sonnet-4-5"
    kind: chat
    caps:
      streaming: true
      tools: true
      vision: true
      maxContextTokens: 200000

drivers:
  - id: pingapp.gemini-ui
    kind: pingapp_http
    baseUrl: "http://127.0.0.1:8787"      # wherever your existing PingApp exposes /v1/chat
    health: "/v1/health"
    routes:
      chat: "/v1/chat"
      tools: "/v1/tools"
    caps:
      device: llm
      streaming: false
      tools: true
      vision: true
      snapshotting: true
      concurrency: 2

policies:
  - id: default.llm
    device: llm
    order:
      - target: { kind: driver, driverId: pingapp.gemini-ui }
        when:
          requiresTools: true
      - target: { kind: model, modelId: cloud.anthropic.sonnet }
      - target: { kind: model, modelId: local.llama3_8b }
```

Key points:
- **Local providers are “OpenAI-compatible HTTP”** whenever possible. This massively reduces adapter surface.
- Capabilities are declared in config but should be **refreshed/verified** at runtime (driver self-report + “assumption tests” like you already do).

---

## 4. Minimal Viable Implementation (Build Order)
Phase 1 MVP that actually unlocks the roadmap:

1. **PingOS Router Service**
   - Fastify app exposing `/v1/dev/*`, `/v1/jobs/*`
   - BullMQ queues: `dev.llm`, `dev.search`, `dev.image`
   - Redis connection + health

2. **Registry loader + validator**
   - Load `config/registry.yaml`
   - Validate IDs, detect cycles, ensure default policy exists
   - Provide `GET /v1/models`, `GET /v1/drivers`

3. **Target adapters**
   - `ModelBackendAdapter` for OpenAI-compatible (covers Ollama/LM Studio/OpenRouter; OpenAI itself is nearly identical)
   - `AnthropicAdapter` if you need native (or you can route via their official SDK, but still keep your internal interface identical)
   - `PingAppDriverAdapter` that calls existing PingApp `/v1/chat` and `/v1/tools`

4. **Capability router**
   - Input declares requirements: `requiresTools`, `requiresVision`, `requiresStreaming`, `maxContext`, etc.
   - Router chooses target by policy + health + caps
   - If none fits: return `EOPNOTSUPP` or `ENODEV` cleanly

5. **Jobs**
   - Everything can be sync in dev, but make async first-class early (CDP will force it)
   - Standard job result storage schema (output + artifacts + resolved target)

6. **Self-healing hooks (Phase 1 “thin slice”)**
   - On driver failure, capture snapshot artifacts and attach to job result
   - Don’t attempt full auto-repair yet; just make the forensic pipeline reliable

This gets you: standardized interfaces + registry + hot-swappable drivers + caps + “models can use pingapps” (via tools:run) without boiling the ocean.

---

## 5. File Structure Proposal
I’d do a monorepo *inside PingOS repo*, even if PingApps live elsewhere. Keep `@pingdev/std` real.

```
pingos/
  package.json
  src/
    server.ts
    routes/
      health.ts
      jobs.ts
      dev/
        index.ts
        llm.ts
        search.ts
        image-gen.ts
      registry.ts
    registry/
      load.ts
      types.ts
      validate.ts
      policy.ts
    router/
      caps.ts
      selectTarget.ts
    targets/
      model/
        types.ts
        openaiCompat.ts
        anthropic.ts
      driver/
        pingappHttp.ts
    jobs/
      queues.ts
      workers/
        llmWorker.ts
        searchWorker.ts
        imageWorker.ts
      store.ts
    std/
      envelope.ts
      errors.ts
      llm.ts
      search.ts
      image.ts
      capabilities.ts
  packages/
    std/
      package.json
      src/  (same as src/std, but extracted)
```

If you already have `@pingdev/std/traits.ts` in another repo, **extract it immediately**. That’s the long-term stability anchor.

---

## 6. Where I Disagree With “Deep Think” (and why)
Assuming Deep Think pushed “VFS metaphor + POSIX error codes + traits.ts”:

1. **Don’t over-commit to filesystem semantics**
   - “/dev paths” are fine. “file descriptors”, “read/write offsets”, “mounts” are mostly performative in an HTTP automation platform.
   - You want **routing + caps + uniform jobs**, not a pretend kernel.

2. **POSIX errno is necessary but not sufficient**
   - You need *both*: `errno` (for program logic) and a **stable domain code** (`ping.cdp.selector_not_found`) for ops/debugging and automated repair.

3. **Drivers vs Models must be separate**
   - Treating PingApps as “models” will create weirdness: they’re *stateful UI automations* with sessions, cookies, rate limits, and “screen reality”.
   - Keep them as **drivers** that *implement device ops*; models are token engines.

4. **Capability negotiation is the actual kernel**
   - The deepest abstraction here is not VFS; it’s **capabilities + selection policy + health-aware routing**.
   - That’s what lets you hot-swap, self-heal, and mix local/cloud.

---

## 7. TypeScript Interfaces (Core Abstractions)
These are the minimal “kernel traits” I’d standardize.

```ts
// packages/std/src/capabilities.ts
export type DeviceKind = "llm" | "search" | "image-gen";

export type CapabilityFlags = {
  streaming?: boolean;
  tools?: boolean;
  vision?: boolean;

  // CDP-ish / driver-ish
  snapshotting?: boolean;       // can produce screenshots/html/trace
  sessionAffinity?: boolean;    // supports sticky sessions

  maxContextTokens?: number;
  maxOutputTokens?: number;

  concurrency?: number;         // soft cap; router can enforce
};

// packages/std/src/targets.ts
export type TargetKind = "model" | "driver";

export type TargetDescriptor = {
  kind: TargetKind;
  id: string;
  device: DeviceKind;           // what device ops it can serve
  caps: CapabilityFlags;

  // optional dynamic info
  health?: {
    ok: boolean;
    lastCheckedAt?: number;
    latencyMs?: number;
    error?: { message: string; code?: string };
  };
};

// packages/std/src/ops.ts
export type DeviceOp =
  | { device: "llm"; op: "prompt"; input: import("./llm").LlmPromptInput; output: import("./llm").LlmOutput }
  | { device: "llm"; op: "chat"; input: import("./llm").LlmChatInput; output: import("./llm").LlmOutput }
  | { device: "search"; op: "query"; input: import("./search").SearchQueryInput; output: import("./search").SearchQueryOutput }
  | { device: "image-gen"; op: "generate"; input: import("./image").ImageGenInput; output: import("./image").ImageGenOutput };

// packages/std/src/driver.ts
import { Envelope, PingError } from "./envelope";
import { DeviceOp } from "./ops";
import { TargetDescriptor } from "./targets";

export type InvokeContext = {
  traceId: string;
  deadlineMs?: number;
};

export type InvokeResult<T> =
  | { ok: true; output: T; artifacts?: Array<{ kind: string; uri: string }> }
  | { ok: false; error: PingError; artifacts?: Array<{ kind: string; uri: string }> };

export interface Target {
  describe(): Promise<TargetDescriptor>;
  invoke<D extends DeviceOp>(
    req: Envelope<D["input"]>,
    ctx: InvokeContext & { device: D["device"]; op: D["op"] }
  ): Promise<InvokeResult<D["output"]>>;
}

// packages/std/src/router.ts
import { TargetDescriptor } from "./targets";
import { Envelope } from "./envelope";
import { DeviceOp } from "./ops";

export type RouteRequirements = {
  requiresTools?: boolean;
  requiresVision?: boolean;
  requiresStreaming?: boolean;
  minContextTokens?: number;
};

export interface Router {
  listTargets(): Promise<TargetDescriptor[]>;
  selectTarget(device: DeviceOp["device"], req: Envelope<any>, needs: RouteRequirements): Promise<Target>;
}
```

### Fastify route skeleton (showing how this plugs in)
```ts
// src/routes/dev/llm.ts
import type { FastifyInstance } from "fastify";
import { Envelope } from "../../std/envelope";
import { LlmChatInput, LlmResponse } from "../../std/llm";
import { Router } from "../../std/router";

export async function registerDevLlmRoutes(app: FastifyInstance, router: Router) {
  app.post<{ Body: Envelope<LlmChatInput>; Reply: LlmResponse }>(
    "/v1/dev/llm/chat",
    async (req, reply) => {
      const env = req.body;
      const needs = {
        requiresTools: !!env.input.tools?.length,
        requiresVision: JSON.stringify(env.input.messages).includes("\"image_url\""),
      };

      const target = await router.selectTarget("llm", env, needs);
      const traceId = env.trace?.traceId ?? crypto.randomUUID();

      const r = await target.invoke(env, { traceId, device: "llm", op: "chat" });
      if (!r.ok) return reply.status(mapErrnoToHttp(r.error.errno)).send({ ok: false, error: r.error });

      return reply.send({
        ok: true,
        output: {
          message: r.output.message,
          usage: r.output.usage,
          resolved: r.output.resolved,
          artifacts: r.artifacts,
        },
      });
    }
  );
}

function mapErrnoToHttp(errno: string): number {
  switch (errno) {
    case "EINVAL": return 400;
    case "EACCES": return 403;
    case "ENOENT":
    case "ENODEV": return 404;
    case "EOPNOTSUPP": return 422;
    case "EBUSY": return 409;
    case "EAGAIN": return 429;
    case "ETIMEDOUT":
    case "EHOSTUNREACH": return 503;
    default: return 500;
  }
}
```

---

## If you want me to tailor this to your *actual* PingApps
Point me at the repo paths for the three working PingApps (Gemini / AI Studio / ChatGPT) and whatever you currently call “PingOS” code, and I’ll:
1. Map the proposed `/v1/dev/*` routes to your existing `/v1/chat|/v1/tools|/v1/jobs` precisely.
2. Produce a drop-in `@pingdev/std` package with your current schemas.
3. Give you a concrete Phase 1 PR plan (files + interfaces + migration steps) that preserves compatibility.
tokens used
43,034
## 0. Reality Check (Repo)
In this workspace I don’t see the actual PingOS/PingApp TypeScript source tree (only `projects/pings_lair`, plus lots of notes). So this review is architecture + concrete API/type proposals that match your stated stack (Fastify + BullMQ + Redis + TS) rather than a line-by-line critique of current implementation.

---

## 1. VFS/POSIX: Right Pattern, But Don’t LARP a Filesystem
**Verdict:** Keep the **VFS/POSIX metaphor** as a *UX contract* (stable “device paths”, capability negotiation, errno-style errors), but **do not implement “open/read/write/ioctl” literally** over HTTP. It will slow you down and leak abstraction.

What *is* valuable from POSIX here:
- **Stable names**: `/dev/llm`, `/dev/search`, `/dev/image-gen` as *well-known service front doors*.
- **Capability discovery**: like `ioctl`/`stat` → `GET /dev/llm` returns caps.
- **Error semantics**: `ENODEV`, `EOPNOTSUPP`, `ETIMEDOUT`, `EBUSY`, `EAGAIN` across all drivers, regardless of “website wrapped via CDP” vs “OpenAI API”.

What’s *better than* a literal VFS:
- A **typed operation bus**: `device + op + envelope`, with **capability-based routing**.
- Keep HTTP “REST-ish” but accept it’s RPC: the primary goal is *uniform automation*, not resource CRUD.

So: **POSIX as the interface design language**, **capability router** as the implementation.

---

## 2. Concrete API Design (Exact Routes + Schemas)
### Design principles
- A single PingOS **front-door** API for all devices: `/v1/dev/...`
- Optional aliases for the metaphor: `/dev/...` (no version) can 302/route internally to `/v1/dev/...`
- All operations support:
  - `mode: "sync" | "async"` (default `sync` for quick API providers, `async` for CDP-heavy drivers)
  - `target` selection (explicit driver/model) or policy-based selection (default)
  - unified `PingError` with `errno`

### Routes
#### Device discovery
- `GET /v1/dev` → list devices
- `GET /v1/dev/:device` → device caps + default route policy
- `GET /v1/drivers` → installed drivers + caps + health summary
- `GET /v1/models` → registry models + caps
- `GET /v1/health` → PingOS health (redis/bullmq + driver health fanout)

#### LLM device
- `POST /v1/dev/llm/prompt`
- `POST /v1/dev/llm/chat`
- `POST /v1/dev/llm/embeddings` (optional phase 1, but you will want it quickly)
- `POST /v1/dev/llm/tools:run` (PingOS-internal “any model can USE PingApps” bridge)

#### Search device
- `POST /v1/dev/search/query`

#### Image-gen device
- `POST /v1/dev/image-gen/generate`

#### Jobs (keep your existing pattern)
- `POST /v1/jobs`
- `GET /v1/jobs/:jobId`
- `POST /v1/jobs/:jobId/cancel`
- `GET /v1/jobs/:jobId/events` (SSE) or websocket (optional)

### Core envelope (request/response)
Use one envelope across all devices so BullMQ + tracing is uniform.

```ts
// src/std/envelope.ts
export type SyncMode = "sync" | "async";

export type TargetRef =
  | { kind: "driver"; driverId: string }          // route to PingApp driver (Gemini UI, AI Studio UI, ChatGPT UI)
  | { kind: "model"; modelId: string }            // route to API/local backend (OpenAI/Anthropic/Ollama/etc)
  | { kind: "policy"; policyId?: string };        // router decides based on caps, cost, health

export type Trace = {
  traceId?: string;          // caller-provided or generated
  parentSpanId?: string;
  tags?: Record<string, string>;
};

export type PingError = {
  // POSIX-ish errno for app logic, plus a stable string code for logging/searching.
  errno:
    | "EINVAL" | "ENOENT" | "ENODEV" | "EACCES" | "EOPNOTSUPP"
    | "ETIMEDOUT" | "EHOSTUNREACH" | "ECONNRESET"
    | "EBUSY" | "EAGAIN" | "EIO" | "ECANCELED";
  code: string;              // e.g. "ping.driver.timeout", "ping.cdp.selector_not_found"
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type JobRef = {
  jobId: string;
  queue: string;             // bullmq queue name
};

export type Envelope<T> = {
  mode?: SyncMode;
  target?: TargetRef;

  trace?: Trace;

  // Hard requirement for CDP-based drivers:
  // make user-supplied “session affinity” explicit so you can keep login cookies stable.
  affinity?: {
    key?: string;            // e.g. "user:emile", "account:team@yallax"
    sticky?: boolean;        // default true for pingapps
  };

  input: T;
};
```

### LLM schemas
Canonical message format: align to OpenAI’s *concept* (roles + parts), but keep it stable and provider-agnostic.

```ts
// src/std/llm.ts
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; url: string; detail?: "low" | "high" }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; toolCallId: string; content: unknown };

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
};

export type ToolDef = {
  name: string;
  description?: string;
  // JSON Schema object (draft-07-ish). Keep it simple and validated.
  inputSchema: Record<string, unknown>;
};

export type LlmPromptInput = {
  prompt: string;
  // Convenience wrapper. PingOS converts to messages internally.
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
};

export type LlmChatInput = {
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "none" | { name: string };
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;

  // Optional: ask for structured output without binding to any single vendor.
  responseFormat?: { type: "json_schema"; schema: Record<string, unknown> };
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmOutput = {
  // Always return assistant message parts.
  message: Message;

  usage?: LlmUsage;

  // Expose what actually executed (important for audits and self-healing).
  resolved: {
    kind: "driver" | "model";
    id: string;              // driverId or modelId
  };

  artifacts?: Array<{
    kind: "screenshot" | "html" | "log" | "har" | "trace";
    uri: string;             // where your artifact store put it
    contentType?: string;
  }>;
};

export type LlmResponse =
  | { ok: true; output: LlmOutput }
  | { ok: false; error: import("./envelope").PingError };
```

### Example endpoints (wire format)
`POST /v1/dev/llm/chat`

Request:
```json
{
  "mode": "sync",
  "target": { "kind": "policy" },
  "affinity": { "key": "user:emile", "sticky": true },
  "input": {
    "messages": [
      { "role": "system", "content": "You are PingOS." },
      { "role": "user", "content": "Summarize the last job." }
    ],
    "maxOutputTokens": 400
  }
}
```

Sync response:
```json
{
  "ok": true,
  "output": {
    "message": { "role": "assistant", "content": [{ "type": "text", "text": "..." }] },
    "usage": { "inputTokens": 123, "outputTokens": 98, "totalTokens": 221 },
    "resolved": { "kind": "driver", "id": "pingapp.gemini-ui" },
    "artifacts": [{ "kind": "screenshot", "uri": "artifact://..." }]
  }
}
```

Async response:
```json
{ "ok": true, "job": { "jobId": "job_123", "queue": "dev.llm" } }
```

Error:
```json
{
  "ok": false,
  "error": {
    "errno": "EOPNOTSUPP",
    "code": "ping.driver.tools_not_supported",
    "message": "Target does not support tool calls.",
    "retryable": false
  }
}
```

---

## 3. Model Registry Design (Local + Cloud Backends)
You need two registries:
1. **Model backends**: inference providers (Ollama, LM Studio, OpenAI, Anthropic, OpenRouter)
2. **Drivers**: PingApps (CDP-wrapped websites) that *behave like* models/tools/search/image

Treat both as “targets” with caps, but keep them distinct: **models generate tokens**, **drivers perform workflows**.

### Config file (YAML recommended)
`config/registry.yaml`:

```yaml
providers:
  - id: ollama_local
    type: openai_compat
    baseUrl: "http://127.0.0.1:11434/v1"
    apiKeyEnv: null
    timeoutMs: 60000

  - id: lmstudio_local
    type: openai_compat
    baseUrl: "http://127.0.0.1:1234/v1"
    apiKeyEnv: null
    timeoutMs: 60000

  - id: openai
    type: openai
    apiKeyEnv: OPENAI_API_KEY
    baseUrl: "https://api.openai.com/v1"
    timeoutMs: 60000

  - id: anthropic
    type: anthropic
    apiKeyEnv: ANTHROPIC_API_KEY
    timeoutMs: 60000

  - id: openrouter
    type: openai_compat
    apiKeyEnv: OPENROUTER_API_KEY
    baseUrl: "https://openrouter.ai/api/v1"
    timeoutMs: 60000

models:
  - id: local.llama3_8b
    providerId: ollama_local
    model: "llama3:8b"
    kind: chat
    caps:
      streaming: true
      tools: false
      vision: false
      maxContextTokens: 8192

  - id: cloud.anthropic.sonnet
    providerId: anthropic
    model: "claude-sonnet-4-5"
    kind: chat
    caps:
      streaming: true
      tools: true
      vision: true
      maxContextTokens: 200000

drivers:
  - id: pingapp.gemini-ui
    kind: pingapp_http
    baseUrl: "http://127.0.0.1:8787"      # wherever your existing PingApp exposes /v1/chat
    health: "/v1/health"
    routes:
      chat: "/v1/chat"
      tools: "/v1/tools"
    caps:
      device: llm
      streaming: false
      tools: true
      vision: true
      snapshotting: true
      concurrency: 2

policies:
  - id: default.llm
    device: llm
    order:
      - target: { kind: driver, driverId: pingapp.gemini-ui }
        when:
          requiresTools: true
      - target: { kind: model, modelId: cloud.anthropic.sonnet }
      - target: { kind: model, modelId: local.llama3_8b }
```

Key points:
- **Local providers are “OpenAI-compatible HTTP”** whenever possible. This massively reduces adapter surface.
- Capabilities are declared in config but should be **refreshed/verified** at runtime (driver self-report + “assumption tests” like you already do).

---

## 4. Minimal Viable Implementation (Build Order)
Phase 1 MVP that actually unlocks the roadmap:

1. **PingOS Router Service**
   - Fastify app exposing `/v1/dev/*`, `/v1/jobs/*`
   - BullMQ queues: `dev.llm`, `dev.search`, `dev.image`
   - Redis connection + health

2. **Registry loader + validator**
   - Load `config/registry.yaml`
   - Validate IDs, detect cycles, ensure default policy exists
   - Provide `GET /v1/models`, `GET /v1/drivers`

3. **Target adapters**
   - `ModelBackendAdapter` for OpenAI-compatible (covers Ollama/LM Studio/OpenRouter; OpenAI itself is nearly identical)
   - `AnthropicAdapter` if you need native (or you can route via their official SDK, but still keep your internal interface identical)
   - `PingAppDriverAdapter` that calls existing PingApp `/v1/chat` and `/v1/tools`

4. **Capability router**
   - Input declares requirements: `requiresTools`, `requiresVision`, `requiresStreaming`, `maxContext`, etc.
   - Router chooses target by policy + health + caps
   - If none fits: return `EOPNOTSUPP` or `ENODEV` cleanly

5. **Jobs**
   - Everything can be sync in dev, but make async first-class early (CDP will force it)
   - Standard job result storage schema (output + artifacts + resolved target)

6. **Self-healing hooks (Phase 1 “thin slice”)**
   - On driver failure, capture snapshot artifacts and attach to job result
   - Don’t attempt full auto-repair yet; just make the forensic pipeline reliable

This gets you: standardized interfaces + registry + hot-swappable drivers + caps + “models can use pingapps” (via tools:run) without boiling the ocean.

---

## 5. File Structure Proposal
I’d do a monorepo *inside PingOS repo*, even if PingApps live elsewhere. Keep `@pingdev/std` real.

```
pingos/
  package.json
  src/
    server.ts
    routes/
      health.ts
      jobs.ts
      dev/
        index.ts
        llm.ts
        search.ts
        image-gen.ts
      registry.ts
    registry/
      load.ts
      types.ts
      validate.ts
      policy.ts
    router/
      caps.ts
      selectTarget.ts
    targets/
      model/
        types.ts
        openaiCompat.ts
        anthropic.ts
      driver/
        pingappHttp.ts
    jobs/
      queues.ts
      workers/
        llmWorker.ts
        searchWorker.ts
        imageWorker.ts
      store.ts
    std/
      envelope.ts
      errors.ts
      llm.ts
      search.ts
      image.ts
      capabilities.ts
  packages/
    std/
      package.json
      src/  (same as src/std, but extracted)
```

If you already have `@pingdev/std/traits.ts` in another repo, **extract it immediately**. That’s the long-term stability anchor.

---

## 6. Where I Disagree With “Deep Think” (and why)
Assuming Deep Think pushed “VFS metaphor + POSIX error codes + traits.ts”:

1. **Don’t over-commit to filesystem semantics**
   - “/dev paths” are fine. “file descriptors”, “read/write offsets”, “mounts” are mostly performative in an HTTP automation platform.
   - You want **routing + caps + uniform jobs**, not a pretend kernel.

2. **POSIX errno is necessary but not sufficient**
   - You need *both*: `errno` (for program logic) and a **stable domain code** (`ping.cdp.selector_not_found`) for ops/debugging and automated repair.

3. **Drivers vs Models must be separate**
   - Treating PingApps as “models” will create weirdness: they’re *stateful UI automations* with sessions, cookies, rate limits, and “screen reality”.
   - Keep them as **drivers** that *implement device ops*; models are token engines.

4. **Capability negotiation is the actual kernel**
   - The deepest abstraction here is not VFS; it’s **capabilities + selection policy + health-aware routing**.
   - That’s what lets you hot-swap, self-heal, and mix local/cloud.

---

## 7. TypeScript Interfaces (Core Abstractions)
These are the minimal “kernel traits” I’d standardize.

```ts
// packages/std/src/capabilities.ts
export type DeviceKind = "llm" | "search" | "image-gen";

export type CapabilityFlags = {
  streaming?: boolean;
  tools?: boolean;
  vision?: boolean;

  // CDP-ish / driver-ish
  snapshotting?: boolean;       // can produce screenshots/html/trace
  sessionAffinity?: boolean;    // supports sticky sessions

  maxContextTokens?: number;
  maxOutputTokens?: number;

  concurrency?: number;         // soft cap; router can enforce
};

// packages/std/src/targets.ts
export type TargetKind = "model" | "driver";

export type TargetDescriptor = {
  kind: TargetKind;
  id: string;
  device: DeviceKind;           // what device ops it can serve
  caps: CapabilityFlags;

  // optional dynamic info
  health?: {
    ok: boolean;
    lastCheckedAt?: number;
    latencyMs?: number;
    error?: { message: string; code?: string };
  };
};

// packages/std/src/ops.ts
export type DeviceOp =
  | { device: "llm"; op: "prompt"; input: import("./llm").LlmPromptInput; output: import("./llm").LlmOutput }
  | { device: "llm"; op: "chat"; input: import("./llm").LlmChatInput; output: import("./llm").LlmOutput }
  | { device: "search"; op: "query"; input: import("./search").SearchQueryInput; output: import("./search").SearchQueryOutput }
  | { device: "image-gen"; op: "generate"; input: import("./image").ImageGenInput; output: import("./image").ImageGenOutput };

// packages/std/src/driver.ts
import { Envelope, PingError } from "./envelope";
import { DeviceOp } from "./ops";
import { TargetDescriptor } from "./targets";

export type InvokeContext = {
  traceId: string;
  deadlineMs?: number;
};

export type InvokeResult<T> =
  | { ok: true; output: T; artifacts?: Array<{ kind: string; uri: string }> }
  | { ok: false; error: PingError; artifacts?: Array<{ kind: string; uri: string }> };

export interface Target {
  describe(): Promise<TargetDescriptor>;
  invoke<D extends DeviceOp>(
    req: Envelope<D["input"]>,
    ctx: InvokeContext & { device: D["device"]; op: D["op"] }
  ): Promise<InvokeResult<D["output"]>>;
}

// packages/std/src/router.ts
import { TargetDescriptor } from "./targets";
import { Envelope } from "./envelope";
import { DeviceOp } from "./ops";

export type RouteRequirements = {
  requiresTools?: boolean;
  requiresVision?: boolean;
  requiresStreaming?: boolean;
  minContextTokens?: number;
};

export interface Router {
  listTargets(): Promise<TargetDescriptor[]>;
  selectTarget(device: DeviceOp["device"], req: Envelope<any>, needs: RouteRequirements): Promise<Target>;
}
```

### Fastify route skeleton (showing how this plugs in)
```ts
// src/routes/dev/llm.ts
import type { FastifyInstance } from "fastify";
import { Envelope } from "../../std/envelope";
import { LlmChatInput, LlmResponse } from "../../std/llm";
import { Router } from "../../std/router";

export async function registerDevLlmRoutes(app: FastifyInstance, router: Router) {
  app.post<{ Body: Envelope<LlmChatInput>; Reply: LlmResponse }>(
    "/v1/dev/llm/chat",
    async (req, reply) => {
      const env = req.body;
      const needs = {
        requiresTools: !!env.input.tools?.length,
        requiresVision: JSON.stringify(env.input.messages).includes("\"image_url\""),
      };

      const target = await router.selectTarget("llm", env, needs);
      const traceId = env.trace?.traceId ?? crypto.randomUUID();

      const r = await target.invoke(env, { traceId, device: "llm", op: "chat" });
      if (!r.ok) return reply.status(mapErrnoToHttp(r.error.errno)).send({ ok: false, error: r.error });

      return reply.send({
        ok: true,
        output: {
          message: r.output.message,
          usage: r.output.usage,
          resolved: r.output.resolved,
          artifacts: r.artifacts,
        },
      });
    }
  );
}

function mapErrnoToHttp(errno: string): number {
  switch (errno) {
    case "EINVAL": return 400;
    case "EACCES": return 403;
    case "ENOENT":
    case "ENODEV": return 404;
    case "EOPNOTSUPP": return 422;
    case "EBUSY": return 409;
    case "EAGAIN": return 429;
    case "ETIMEDOUT":
    case "EHOSTUNREACH": return 503;
    default: return 500;
  }
}
```

---

## If you want me to tailor this to your *actual* PingApps
Point me at the repo paths for the three working PingApps (Gemini / AI Studio / ChatGPT) and whatever you currently call “PingOS” code, and I’ll:
1. Map the proposed `/v1/dev/*` routes to your existing `/v1/chat|/v1/tools|/v1/jobs` precisely.
2. Produce a drop-in `@pingdev/std` package with your current schemas.
3. Give you a concrete Phase 1 PR plan (files + interfaces + migration steps) that preserves compatibility.
