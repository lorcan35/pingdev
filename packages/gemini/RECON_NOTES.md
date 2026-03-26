# Gemini UI API Shim — Recon Notes (Incremental)

## 2026-02-12T15:xx+04:00 — Kickoff + preflight checks

### Mandatory preflight completed
- Read `STANDARDS.md` before work.
- Searched existing notes in:
  - `/home/rebelforce/.openclaw/workspace/memory`
  - `/home/rebelforce/.openclaw/workspace-worker/memory`
  - `/home/rebelforce/.openclaw/skills` (no local files listed)
  - `/home/rebelforce/bin`

### Existing artifacts found relevant to this task
- `memory/provisioner-research.md` includes browser automation comparisons and Playwright notes.
- `memory/2026-02-06.md` documents a successful pattern for scraping dynamic Google account pages by extracting embedded data rather than relying on virtualized DOM.
- `~/bin/browser-stealth/*` exists as optional hardening tooling, but for this task primary plan will prioritize stability/compliance over stealth behavior.

### Early recon implications
- Browser automation should not rely only on rendered text nodes (virtualized UIs can hide non-visible messages).
- We should design extraction with layered fallbacks:
  1) accessibility/role selectors,
  2) stable landmark containers,
  3) network-observed completion signals,
  4) persisted snapshots for replay/debug.
- Need API shim that is asynchronous-first (job queue) with sync convenience endpoint that internally waits on async job completion.

## 2026-02-12T15:xx+04:00 — Existing evidence + runtime tooling probe

### Relevant historical evidence from local memory
- `provisioner-research.md` confirms OpenClaw Browser is Playwright-based and suitable for DOM snapshot/click/type/navigate loops.
- Existing notes emphasize dynamic SPA behavior and the need for robust DOM traversal/extraction.
- `2026-02-06.md` provides a practical precedent: on Google UIs with virtualization, extraction from embedded page data was required because visible DOM only contained a subset.

### Runtime probe result
- `browser status` returned browser tooling available but not running.
- Attempt to start browser control (`browser.start` with `profile=openclaw`) failed with timeout: browser control service not reachable; likely requires gateway/browser service restart.

### Immediate design implication
- Architecture must tolerate temporary browser-control unavailability (health checks + circuit breaker + queue pause mode).
- Include an operational preflight in worker startup:
  1) browser service health check,
  2) page accessibility check,
  3) authenticated-session check,
  4) then accept jobs.

## 2026-02-12T15:xx+04:00 — Browser control runtime diagnosis

### What was verified
- `openclaw gateway status`: gateway is healthy and listening on `127.0.0.1:18789`.
- `openclaw-browser.service`: currently inactive; previous launch log shows Chromium CDP came up briefly, then failed due to `Could not open X display`.

### Practical impact on architecture
- Browser worker cannot assume local headed display is always available.
- Automation runtime must support **two execution modes**:
  1) **Primary:** attached Chrome relay mode (user’s logged-in Chrome tab, via OpenClaw browser profile `chrome`) for stable authenticated sessions.
  2) **Fallback:** managed browser profile (OpenClaw/Playwright) for environments where display/CDP is available.
- Add environment gate in startup checks:
  - `BROWSER_MODE=relay|managed`
  - reject/queue jobs with actionable error when no browser mode is available.

### Reliability note
- Because managed browser can be unavailable for infrastructure reasons (display, CDP, service), API shim should expose this as retryable infra error (`BROWSER_UNAVAILABLE`) and keep idempotent jobs pending rather than failing terminally.

## 2026-02-12T15:xx+04:00 — Public Gemini UI selector reconnaissance

### Source used
- Public userscript ecosystem (`GeminiPilot` / GreasyFork script) was inspected for practical selectors currently used by power users.

### Useful selector candidates observed (must be validated at runtime)
- Prompt input: `[aria-label="Enter a prompt here"]`, `.text-input-field`
- Send button: `[aria-label="Send message"]`
- New chat: `button[aria-label*='New chat']`
- Conversations: `[data-test-id="conversation"]`, `.selected[data-test-id="conversation"]`
- Response text container: `.model-response-text`
- Regenerate drafts: `[data-test-id="generate-more-drafts-button"]`
- Sidebar toggles: `[aria-label*="Hide side panel"]`, `[aria-label*="Show side panel"]`
- Menu/model controls: `[data-test-id="menu-toggle-button"]`, `[data-test-id="bard-mode-menu-button"]`

### Reliability caveat
- These selectors are unofficial and can drift; they are best treated as **tier-2 fallback selectors** behind primary role/ARIA-driven discovery.

### State-machine hint from observed shortcuts/features
- Presence of “stop/start generation” action and draft controls implies detectable runtime phases suitable for explicit state modeling:
  - `IDLE` (input ready)
  - `TYPING` (prompt being set)
  - `GENERATING` (send disabled/stop shown/streaming text changing)
  - `DONE` (final response stable + controls available)
  - `FAILED` (error toast/banner or timeout)
  - `NEEDS_HUMAN` (captcha/login/consent/interstitial)

## 2026-02-12T15:xx+04:00 — Compliance and policy-source reconnaissance

### Findings
- Targeted search identified relevant policy surfaces:
  - Gemini API terms page (`ai.google.dev/gemini-api/terms`) for automation/agentic service expectations.
  - Gemini Apps prohibited-use policy (`support.google.com/gemini/...`) for misuse boundaries.
- Direct fetch attempt for `https://gemini.google.com/terms` returned 404; terms URL appears to live under support/legal surfaces rather than this path.

### Practical compliance implication for implementation
- The shim should include explicit policy guardrails regardless of final legal URL mapping:
  - block clearly abusive categories,
  - preserve human confirmation checkpoints,
  - avoid automated bypass for challenge/consent flows,
  - maintain auditable logs of prompts/actions.

## 2026-02-12T15:xx+04:00 — Policy text capture (actionable constraints)

### Captured policy signal (support.google.com)
- From Google’s Generative AI Prohibited Use Policy page:
  - enforcement uses automated systems + human review,
  - attempts to circumvent safety protections are treated as misuse,
  - repeated violations may restrict product/account access.

### Design constraints derived
- Do not design/ship anti-safety-bypass behavior.
- Add hard stop routes to `NEEDS_HUMAN` on challenge pages and unusual trust checks.
- Restrict shim input classes with policy guardrails + moderation hook before dispatch.
- Keep a compliance event log (`policy_check_passed`, `policy_check_blocked`, `human_override_requested`).
