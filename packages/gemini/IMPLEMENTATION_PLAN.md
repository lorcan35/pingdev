# Gemini UI API Shim — Implementation Plan (Long-Horizon, Practical)

## 0) Outcome and Operating Assumptions

**Goal:** expose API-like behavior over the Gemini web UI through robust browser automation.

**Assumptions:**
- Account `emilesawayame@gmail.com` is already logged in.
- Primary runtime should use **attached Chrome relay** mode (existing logged-in tab/profile) when available.
- Managed browser mode is fallback only (may fail in headful/display-constrained environments).

**Non-goals (v1):** bypassing login/captcha/security challenges; broad multi-account orchestration.

---

## 1) Recon Summary (What to build around)

1. OpenClaw browser automation patterns are Playwright/CDP-style and support `snapshot -> act` loops.
2. Runtime reliability risk exists: browser control service can be unavailable (e.g., display/CDP issues).
3. Gemini UI selectors are mutable; unofficial selector sets exist (`aria-label`, `data-test-id`, class hooks), but should be fallback-tier only.
4. Policy/compliance risk is real: Google flags safety-circumvention behavior; repeated violations may restrict usage.

---

## 2) Recommended Automation Approach

## 2.1 Mode Strategy (required)
- **Mode A (primary):** OpenClaw Browser profile `chrome` (attached tab relay).
  - Best for preserving login/session trust signals.
  - Needs human attach action when tab is disconnected.
- **Mode B (fallback):** OpenClaw managed profile `openclaw` or direct Playwright/CDP worker.
  - Use only if environment supports browser control reliably.

## 2.2 Control Loop Pattern
- Use deterministic loop:
  1. `snapshot(refs="aria")`
  2. resolve element by selector registry + role labels
  3. `act(click/type/press)`
  4. resnapshot and state-evaluate
- Do **not** rely on blind sleeps except bounded polling windows.

## 2.3 Why not pure coordinate automation
- Pixel/desktop-click automations are fragile under layout/zoom/theme changes.
- ARIA/semantic refs + fallback tiers are materially more stable.

---

## 3) Session/Auth Handling

## 3.1 Session Policy
- Never automate credential entry in normal flow.
- Treat auth as precondition: worker checks for “chat-ready” state before dequeuing jobs.

## 3.2 Startup preflight (hard gate)
1. Browser mode available? (`chrome` relay attached OR managed browser healthy)
2. Gemini tab reachable?
3. Logged-in/chat-ready state detected?
4. Input + send controls detectable?

If any fail: system enters `DEGRADED` and returns retryable infra errors.

## 3.3 Auth drift handling
- Signals: login wall, consent interstitial, account switch UI, captcha/trust prompt.
- Action: transition to `NEEDS_HUMAN`, pause account queue, emit actionable alert.

---

## 4) Concrete Selector Strategy (Tiered + versioned)

Store selectors in a versioned registry (`selectors/gemini.v*.yaml`), with priority tiers:

### Tier 1 (preferred)
- ARIA role/name refs from snapshots (`refs="aria"`)
- semantic controls (textbox/send/new chat/menu)

### Tier 2 (stable attributes)
- `data-test-id` based selectors when present

### Tier 3 (soft fallbacks)
- resilient partial-ARIA/class selectors observed in practice, e.g.:
  - input: `[aria-label="Enter a prompt here"]`
  - send: `[aria-label="Send message"]`
  - new chat: `button[aria-label*='New chat']`
  - response body: `.model-response-text`
  - conversation nodes: `[data-test-id="conversation"]`

### Tier 4 (last resort)
- relative anchors near confirmed landmarks + bounded fuzzy matching.

**Rule:** each action has at least 2 independent selector paths before declaring `FAILED`.

---

## 5) UI State Machine (Required)

States: `IDLE`, `TYPING`, `GENERATING`, `DONE`, `FAILED`, `NEEDS_HUMAN`

## 5.1 State definitions
- **IDLE:** input available, send action available, no active generation indicator.
- **TYPING:** prompt being inserted/edited; send not yet fired.
- **GENERATING:** generation active (stop action visible and/or response stream mutating).
- **DONE:** response stabilized; generation controls settled.
- **FAILED:** timeout, UI error banner, selector failure after retry budget.
- **NEEDS_HUMAN:** captcha/login/consent/challenge/relay-detached.

## 5.2 Transition triggers (practical)
- `IDLE -> TYPING`: input focus + content diff detected.
- `TYPING -> GENERATING`: send click accepted or Enter submit confirmed.
- `GENERATING -> DONE`: response hash stable for N polls (e.g., 2-3) and stop control gone.
- `GENERATING -> FAILED`: max generation timeout exceeded.
- `ANY -> NEEDS_HUMAN`: auth/challenge/interstitial pattern detected.
- `FAILED -> IDLE`: successful recovery step (refresh/new chat/retry) and input restored.

---

## 6) Response Extraction Reliability

## 6.1 Multi-layer extraction
1. Primary: extract from latest assistant response container.
2. Secondary: collect all visible response blocks + concatenate by message order.
3. Tertiary: capture structured fallback artifact (DOM fragment + screenshot + trace).

## 6.2 Streaming completion detection
- Poll every 500–1000 ms.
- Compute normalized text hash of latest response.
- Mark `DONE` only after stable hash window and no active generation control.

## 6.3 Artifact bundle per run
- `request.json`
- `timeline.jsonl` (state transitions + actions)
- `response.txt` / `response.md`
- `final_snapshot.json`
- `final_screenshot.png`
- `errors.json` (if any)

---

## 7) Anti-breakage Strategy for UI Changes

1. **Selector registry versioning** + hotfix file.
2. **Canary workflow** every X minutes: send tiny prompt and verify parseability.
3. **Contract tests** for critical actions (new chat, type, send, extract).
4. **Automatic fallback ladder** across selector tiers.
5. **Quarantine mode:** if failure rate crosses threshold, halt new jobs and request human review.

---

## 8) Observability / Logging

Use structured logs (JSON):
- `job_id`, `account_id`, `mode`, `state`, `selector_used`, `attempt`, `latency_ms`, `token_estimate`, `error_code`.

Metrics:
- success rate, p95 latency, retries/job, NEEDS_HUMAN rate, selector fallback rate, queue age.

Tracing:
- span-like stages: `preflight`, `open_chat`, `type_prompt`, `send`, `wait_generation`, `extract`, `persist`.

---

## 9) Queueing / Concurrency / Throughput

## 9.1 Queue model
- Use async job queue (Redis-backed recommended).
- One **active generation per account/tab** to avoid UI collisions.

## 9.2 Concurrency policy
- Per-account concurrency: 1 (strict)
- Horizontal scale: multiple workers only if each has isolated browser/account context.

## 9.3 Priorities
- Priority lanes: `realtime`, `normal`, `bulk`.
- SLA guard: reject or defer when queue age exceeds threshold.

---

## 10) Failure Recovery

Recoverable failures:
- transient selector miss
- temporary browser disconnect
- navigation hiccup
- response extraction mismatch

Recovery playbook:
1. retry action locally (small retry budget),
2. refresh tab and restore conversation context,
3. open new chat and replay prompt (idempotent jobs only),
4. escalate to `NEEDS_HUMAN`.

Use exponential backoff + jitter; cap retries by job class.

---

## 11) Constraints & Risk Boundaries

1. No automation to bypass captcha/security/consent systems.
2. No stealth/evasion strategy as product default.
3. Keep moderation/policy pre-check before submitting prompts from untrusted upstream clients.
4. Add explicit “human approval required” for high-risk categories.
5. Retain auditable records for dispute/debug/compliance review.

---

## 12) Human-in-the-Loop Fallback Points

Trigger HITL when:
- Chrome relay tab not attached,
- login challenge/captcha appears,
- suspicious account warning/interstitial detected,
- repeated selector failures after canary fallback.

HITL event payload should include:
- screenshot, last snapshot refs, current URL/title, blocker reason, recommended next click.

---

## 13) API Shim Contract (Sync + Async)

## 13.1 Endpoints
- `POST /v1/chat` (sync convenience)
- `POST /v1/jobs` (async submit)
- `GET /v1/jobs/{id}` (status/result)
- `POST /v1/jobs/{id}/cancel`
- `GET /v1/health` (mode + queue + browser status)

## 13.2 Request (core)
```json
{
  "idempotency_key": "uuid-or-client-key",
  "prompt": "...",
  "conversation_id": "optional",
  "timeout_ms": 120000,
  "priority": "normal",
  "metadata": {"client": "..."}
}
```

## 13.3 Async response
```json
{
  "job_id": "job_...",
  "status": "queued",
  "created_at": "..."
}
```

## 13.4 Sync response
- Blocks until `DONE|FAILED|NEEDS_HUMAN|timeout`.
- Returns same shape as final job result.

---

## 14) Job Lifecycle + Status Model

`QUEUED -> PRECHECK -> RUNNING -> (DONE | FAILED | NEEDS_HUMAN | CANCELED)`

`RUNNING` substates map to UI machine: `IDLE/TYPING/GENERATING/...`

Persist transition timestamps for SLA and debugging.

---

## 15) Error Taxonomy (Implementation-ready)

- `BROWSER_UNAVAILABLE` (infra)
- `RELAY_NOT_ATTACHED` (hitl)
- `AUTH_REQUIRED` (hitl)
- `CAPTCHA_REQUIRED` (hitl)
- `UI_SELECTOR_NOT_FOUND` (retryable -> maybe failed)
- `GENERATION_TIMEOUT` (retryable)
- `EXTRACTION_FAILED` (retryable)
- `POLICY_BLOCKED` (terminal)
- `RATE_LIMITED` (retryable/backoff)
- `UNKNOWN` (terminal after budget)

Each error includes: `code`, `retryable`, `state`, `evidence_artifact_ids`, `recommended_action`.

---

## 16) Retries, Backoff, Idempotency

- Idempotency table keyed by `(idempotency_key, normalized_prompt_hash, conversation_scope)`.
- Replayed request returns existing terminal result if present.
- Backoff schedule (example): 1s, 3s, 7s (+ jitter), max 3 action retries / 2 job retries.
- Never replay non-idempotent side actions without explicit opt-in.

---

## 17) Artifact Persistence

Storage (minimum):
- PostgreSQL: jobs/state/errors/indexes
- Redis: queue + short-lived locks
- S3-compatible blob store (or filesystem in POC): screenshots/snapshots/timelines

Retention:
- Raw artifacts 7–14 days (configurable)
- Redacted metadata longer for analytics.

---

## 18) Long-Horizon Agent Design

## 18.1 Planner/Executor split
- **Planner:** decomposes user objective into bounded steps/prompts, estimates cost/time, sets stop conditions.
- **Executor:** runs one step through Gemini UI shim and reports artifacts.

## 18.2 Chunking strategy
- Break tasks into prompt chunks with explicit expected output schema.
- Persist each chunk result and derive next chunk from durable state, not ephemeral memory.

## 18.3 Checkpoint/resume
- Checkpoint after each chunk:
  - current plan index,
  - completed chunk IDs,
  - partial synthesized output,
  - budget spent/time elapsed.
- Resume by rehydrating checkpoint + revalidating browser preflight.

## 18.4 Guardrails / budget / time controls
- `max_steps`, `max_runtime_ms`, `max_retries`, `max_cost_estimate`.
- Hard stop with partial-output return when any budget breaches.

---

## 19) Minimal Tech Stack (Recommended)

- **Runtime:** Node.js + TypeScript
- **Web/API:** Fastify (or Express)
- **Queue:** BullMQ (Redis)
- **DB:** PostgreSQL + Prisma/Drizzle
- **Browser control:** OpenClaw Browser tool integration first; optional Playwright worker abstraction
- **Observability:** Pino logs + Prometheus metrics + optional OpenTelemetry traces
- **Storage:** local FS (POC) -> S3-compatible blobs (MVP+)

---

## 20) Suggested Repo Structure

```text
gemini-ui-api-shim/
  apps/
    api/                     # HTTP endpoints
    worker/                  # queue consumer + browser runner
  packages/
    core/                    # types, errors, state machines
    browser-adapter/         # OpenClaw + optional Playwright adapters
    selector-registry/       # versioned selectors and evaluators
    planner/                 # long-horizon planner logic
    artifacts/               # persistence + redaction
    observability/           # logging/metrics/tracing helpers
  config/
    selectors/
      gemini.v1.yaml
    policies/
      guardrails.yaml
  scripts/
    canary.ts
    smoke.ts
  docs/
    runbooks/
      hitl.md
      incident-ui-breakage.md
```

---

## 21) Phased Rollout with Acceptance Criteria

## Day 1 — POC
Deliver:
- single worker, async queue, one account, one tab
- `POST /v1/jobs`, `GET /v1/jobs/{id}`
- prompt -> response text roundtrip with artifacts

Acceptance:
- 20/20 simple prompts succeed
- median latency measured
- failures produce actionable artifacts

## Week 1 — MVP
Deliver:
- sync endpoint, idempotency keys, retry/backoff, selector tiers
- full state machine + `NEEDS_HUMAN` flow
- basic dashboard metrics and canary checks

Acceptance:
- >=95% success on stable prompt suite
- zero silent failures
- queue resumes after worker restart without job loss

## Week 2+ — Hardening
Deliver:
- contract tests against UI changes
- quarantine mode, better policy filters, improved extraction robustness
- planner/executor long-horizon orchestration

Acceptance:
- p95 latency and error budgets met for 7 consecutive days
- UI drift incidents recoverable via selector hotfix without code redeploy
- checkpoint/resume verified on forced restarts

---

## 22) Top Recommendations (Priority Order)

1. Build **async-first shim** with strict artifact logging before adding sync sugar.
2. Implement **startup preflight + degraded mode** to handle browser/runtime availability issues.
3. Ship **state machine + selector tiers** early; this is the core reliability lever.
4. Add **HITL workflow** for relay-detach/auth/captcha from day 1 (don’t treat as edge cases).
5. Introduce **canary + quarantine** before broad rollout.

## Next Implementation Step (immediate)

Implement a thin vertical slice in this order:
1. `POST /v1/jobs` + Redis queue + worker skeleton,
2. browser preflight (`mode`, `tab`, `auth`, `input/send detectable`),
3. single prompt execution path with state transitions + artifacts,
4. `GET /v1/jobs/{id}` returning status/result/error taxonomy.

Once this slice is stable, add retries/idempotency and then planner/executor long-horizon orchestration.
