# TASK: Build Gemini UI API Shim

## What This Is
A local HTTP API server that automates the Gemini web UI (gemini.google.com) via browser automation (Playwright CDP). It exposes a REST API so other tools/agents can use Gemini's ULTRA-tier features (Deep Research, Create Videos, Create Images, Canvas, Guided Learning, Deep Think) programmatically — without relying on the rate-limited free API.

## Why
- Gemini API key is FREE tier (quota exhausted, returns 429)
- OAuth connects to Gemini ULTRA subscription (emilesawayame@gmail.com)
- ULTRA has features not available via API: Deep Research, Veo 3.1 video gen, Canvas, Guided Learning, Deep Think
- Need programmatic access to ALL these features

## Architecture Overview
```
Client → HTTP API (Fastify) → Job Queue (BullMQ/Redis) → Worker → Playwright CDP → Chromium → Gemini UI
```

## Critical Infrastructure (ALREADY RUNNING)
- **Chromium**: Real snap Chromium with CDP on `ws://127.0.0.1:18800` (NOT Playwright's bundled Chromium)
- **Google Account**: emilesawayame@gmail.com already logged in (ULTRA tier)
- **Gemini URL**: https://gemini.google.com/u/1/app (the /u/1/ is important — that's the ULTRA account)
- **Display**: DISPLAY=:1 (real X11 display, not headless)
- **Redis**: Install if not present (`sudo apt install redis-server`)
- sudo password: Jx3dzz8t

## Reference Documents (READ THESE FIRST)
1. `docs/IMPLEMENTATION_PLAN.md` — Full 22-section implementation plan with API contract, state machine, error taxonomy, phased rollout
2. `docs/ELEMENT_REGISTRY.md` — Complete UI element mapping for ALL tools, modes, and controls (mapped on ULTRA account)
3. `docs/RECON_NOTES.md` — Recon findings: selectors, compliance constraints, browser runtime info

## Phase 1: POC (Build This First)

### 1.1 Project Setup
- Node.js + TypeScript + Fastify
- Playwright (connect to existing CDP, NOT launch new browser)
- BullMQ + Redis for job queue
- Pino for structured logging
- **Test**: `npm run build` succeeds, `npm run dev` starts server on port 3456

### 1.2 Browser Adapter (connect to existing Chromium)
- Connect via CDP: `playwright.chromium.connectOverCDP('http://127.0.0.1:18800')`
- Find or create Gemini tab (navigate to https://gemini.google.com/u/1/app)
- **Preflight checks**: browser connected? Gemini loaded? Logged in? Input visible?
- **Test**: Run preflight → all checks pass → log "Gemini ready"

### 1.3 Selector Registry (versioned, tiered)
- Create `src/selectors/gemini.v1.ts` based on ELEMENT_REGISTRY.md
- Tier 1: ARIA role+name (from snapshots) — e.g., `textbox[name="Enter a prompt for Gemini"]` or `textbox[name="Ask Gemini 3"]`
- Tier 2: data-test-id selectors
- Tier 3: CSS class fallbacks
- Each action has 2+ independent selector paths
- **Test**: Connect to Gemini, resolve each critical selector (input, send, new chat, tools button) → all found

### 1.4 State Machine
- States: IDLE, TYPING, GENERATING, DONE, FAILED, NEEDS_HUMAN
- Transitions based on observable UI signals (see IMPLEMENTATION_PLAN.md §5)
- **Test**: Navigate to Gemini → state = IDLE. Type text → state detectable. Send → GENERATING detected. Response complete → DONE detected.

### 1.5 Core Chat Flow (the vertical slice)
- New chat → type prompt → send → wait for response → extract response text
- Response extraction: poll every 500-1000ms, hash response text, mark DONE when stable for 2-3 polls
- **Test**: Send "Reply with exactly: HELLO_WORLD_TEST" → extract response → verify contains "HELLO_WORLD_TEST"

### 1.6 API Endpoints
- `POST /v1/jobs` — submit prompt, returns job_id
- `GET /v1/jobs/:id` — get status/result
- `POST /v1/chat` — sync convenience (blocks until done)
- `GET /v1/health` — browser + queue + worker status
- **Test**: curl POST /v1/chat with test prompt → get response text back

### 1.7 Artifact Logging
- Per-job: request.json, timeline.jsonl (state transitions), response.md, errors.json
- Store in `./artifacts/{job_id}/`
- **Test**: After a chat, verify artifact directory created with all files

## Phase 2: Tools Support

### 2.1 Tool Activation/Deactivation
- Generic pattern: Open Tools menu → click toggle → verify chip appears → close menu
- Detection: Look for `button "Deselect [ToolName]"` near input
- Deactivation: Click the deselect chip
- **Test each tool**: Activate → verify chip → deactivate → verify chip gone

### 2.2 Deep Research Flow
- Enable → type research query → send → wait for plan → click "Start research" → wait for results
- Failure detection: "Research unsuccessful" panel
- **Test**: Enable Deep Research, send "What are the latest developments in quantum computing 2026?" → detect plan → start → get results (or handle failure gracefully)

### 2.3 Create Videos (Veo 3.1)
- Enable → type video description → send → long poll (2-3 min) → extract video
- Completion: detect `button "Play video"` or `button "Download video"`
- **Test**: Enable video creation, send "A cat playing with yarn in a sunlit room" → detect generation → wait for completion

### 2.4 Create Images
- Enable → type description → send → detect image
- Completion: detect `button "Image of"` or `button "Download full size image"`
- **Test**: Enable image creation, send "A serene mountain landscape at sunset" → detect image → extract

### 2.5 Canvas
- Enable → type code/writing request → send → detect split pane
- Extract from `textbox "Code Editor"` in canvas panel
- **Test**: Enable Canvas, send "Write a Python fibonacci calculator" → detect canvas panel → extract code

### 2.6 Guided Learning
- Enable → type topic → send → extract structured response with images
- **Test**: Enable Guided Learning, send "Explain photosynthesis" → get structured educational response

### 2.7 Deep Think
- Enable → type complex question → send → long poll → extract with thinking
- **Test**: Enable Deep Think, send "What is 127 * 191?" → get answer with optional thinking panel

### 2.8 Mode Switching
- Click mode picker → select mode → verify
- Modes: Fast, Thinking, Pro
- **Test**: Switch to each mode → verify picker label changes

## Phase 3: Hardening

### 3.1 Retry/Backoff
- Action-level retries (selector miss, click fail): 3 attempts with 1s/3s/7s backoff
- Job-level retries: 2 attempts
- Idempotency keys for deduplication

### 3.2 Error Handling
- Full error taxonomy from IMPLEMENTATION_PLAN.md §15
- Each error: code, retryable flag, evidence artifacts
- NEEDS_HUMAN escalation for auth/captcha/consent

### 3.3 Canary/Health Checks
- Periodic "canary" prompt to verify system working
- Quarantine mode: halt new jobs if failure rate too high

### 3.4 Documentation
- Full API docs (OpenAPI/Swagger)
- README with setup, usage, architecture
- Runbooks for common issues

## Testing Strategy
- **Unit tests**: State machine transitions, selector resolution, response parsing
- **Integration tests**: Full flow against live Gemini (use deterministic prompts like "Reply exactly: TEST_STRING_123")
- **Each phase must have passing tests before moving to next**

## Tech Stack
- Runtime: Node.js 24+ (already installed)
- Language: TypeScript (strict mode)
- HTTP: Fastify
- Queue: BullMQ (Redis-backed)
- Browser: Playwright (CDP connection to existing Chromium on port 18800)
- Logging: Pino
- Testing: Vitest
- Docs: TypeDoc + OpenAPI

## File Structure
```
gemini-ui-shim/
├── src/
│   ├── api/              # Fastify routes
│   ├── worker/           # Queue consumer + browser automation
│   ├── browser/          # CDP connection, preflight, page interactions
│   ├── selectors/        # Versioned selector registry
│   ├── state-machine/    # UI state machine
│   ├── tools/            # Per-tool flows (deep-research, video, image, canvas, etc.)
│   ├── artifacts/        # Job artifact persistence
│   ├── errors/           # Error taxonomy + handlers
│   ├── types/            # Shared TypeScript types
│   └── index.ts          # Entry point
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ELEMENT_REGISTRY.md
│   └── RECON_NOTES.md
├── artifacts/            # Runtime artifact storage (gitignored)
├── config/
│   └── default.ts        # Configuration
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## IMPORTANT RULES
1. **Test at each step** — don't build everything then test. Build one piece, test it against the live Gemini UI, verify it works, then move on.
2. **Use the EXISTING Chromium** — connect via CDP to port 18800. Do NOT launch a new browser.
3. **Gemini URL is /u/1/app** — the /u/1/ path selects the ULTRA account (emilesawayame@gmail.com)
4. **Write docs as you go** — every module gets JSDoc, every flow gets a doc.
5. **Incremental commits** — commit after each working piece.
6. **If a selector doesn't work, try alternatives** — the element registry has multiple selector strategies. ARIA labels can change between page loads; use role+name patterns, not exact refs.
7. **Response polling, not sleep** — check for response completion by hashing visible text, not by waiting fixed durations.
8. **Handle the "send" button carefully** — it's a text node, not a proper button. Use Enter key to submit instead.
9. **Start with Phase 1 only** — get the basic chat flow working and tested before touching tools.
10. **Use Agent Teams** — spawn sub-agents for parallel work where it makes sense (e.g., one agent on selectors, one on state machine, one on API routes).

## CRITICAL: Rate Limiting & ToS Compliance (NON-NEGOTIABLE)

This system must behave like a human user, NOT like an automated bot:

1. **On-demand only** — requests are triggered by a human/agent, never auto-scheduled or batched
2. **Single concurrency** — ONE request at a time, no parallel prompts to the same account
3. **Human-like pacing** — minimum 3-5 second delay between consecutive requests
4. **No canary/health check prompts** — don't send test prompts to Gemini periodically. Health checks only verify browser/page state, never send actual messages
5. **No retry storms** — max 2 retries per job, with exponential backoff (5s, 15s)
6. **No prompt replay** — failed jobs don't auto-retry by default, user must explicitly re-submit
7. **Rate limiter built-in** — enforce max requests per minute (e.g., 6/min) at the API layer
8. **Queue depth limit** — reject new jobs if queue exceeds 10 pending items
9. **No scraping/bulk extraction** — this is for interactive use, not data harvesting
10. **Respect Google's ToS** — no captcha bypass, no stealth techniques, no evasion

## UX Priority: Smooth Tool Interface

The API should feel like calling any other LLM API. Callers (agents, scripts, apps) should NOT need to think about rate limits or browser state:

1. **Transparent queueing** — if a request comes in while another is running, it queues silently and waits its turn. No errors, just slightly longer wait time.
2. **Simple interface** — `POST /v1/chat {"prompt": "do something", "tool": "deep_research"}` → response. That's it.
3. **Tool parameter** — optional `tool` field: "deep_research", "create_video", "create_image", "canvas", "guided_learning", "deep_think". Default: no tool (normal chat).
4. **Mode parameter** — optional `mode` field: "fast", "thinking", "pro". Default: current mode.
5. **OpenAI-compatible wrapper** (Phase 3) — `POST /v1/chat/completions` that mimics the OpenAI format so existing tools/libraries just work.
6. **Graceful degradation** — if browser is down, return clear error with retry-after header, don't crash.
7. **Timeout handling** — long tools (Deep Research, Deep Think, Video) can take minutes. Default timeout = 5min, configurable per-request.
8. **Clean JSON responses** — always return structured JSON with status, response text, metadata (tool used, mode, timing).

## CRITICAL: State Observability & Thinking Process (Emile's Request)

The shim must expose EXACTLY what's happening at every moment:

1. **GET /v1/jobs/:id/status** — Real-time detailed status:
   - Current UI state (IDLE, TYPING, GENERATING, DONE, FAILED, NEEDS_HUMAN)
   - Substates: "generating_plan", "researching", "generating_video", "generating_image", "thinking"
   - Elapsed time in current state
   - Thinking content (if available — extract from "Show thinking" panel)
   - Generation progress text (e.g., "Generating your video... 2-3 mins", "Generating research plan")
   - Partial response text (what's been generated so far during streaming)

2. **GET /v1/jobs/:id/thinking** — Extract thinking/reasoning:
   - Deep Think: full thinking panel content
   - Deep Research: research plan + progress
   - Thinking mode: chain-of-thought reasoning
   - Show thinking toggle state (expanded/collapsed)

3. **SSE /v1/jobs/:id/stream** (Phase 3) — Server-Sent Events for real-time updates:
   - State changes pushed as they happen
   - Partial response text as it streams
   - Thinking content as it appears
   - Completion event with full response

4. **Response metadata** — Every response includes:
   - `thinking`: extracted thinking/reasoning text (if any)
   - `timing`: { queued_at, started_at, first_token_at, completed_at, total_ms }
   - `state_history`: array of state transitions with timestamps
   - `tool_used`: which tool was active
   - `mode`: which mode was active
   - `artifacts`: paths to screenshots/snapshots taken during execution
