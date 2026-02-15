# PingDev Phase 2 Roadmap

**Date**: 2026-02-15
**Current State**: 3 PingApps live (Gemini :3456, AI Studio :3457, ChatGPT :3458), dashboard on :3400, recon pipeline operational

---

## Timeline Overview

| Phase | Timeframe | Focus |
|-------|-----------|-------|
| **2a** | Weeks 1-4 | Unified API Gateway + Auth + 3 new PingApps |
| **2b** | Weeks 5-12 | Event system + AI orchestration + Self-healing |
| **2c** | Weeks 13-24 | Marketplace + Mobile + Monetization |

---

## 1. New PingApp Targets

### Tier 1 — High Value, High Feasibility (Phase 2a)

| Site | Key Actions | Complexity | Why |
|------|------------|------------|-----|
| **Claude.ai** | sendMessage, switchModel, uploadFile, useArtifacts, extractCode | Medium | Direct competitor analysis; same CDP pattern as Gemini/ChatGPT |
| **Perplexity** | search, followUp, citeSources, exportReport | Low | Simple search UI, clean DOM, high-value research tool |
| **GitHub (Issues/PRs)** | createIssue, commentPR, reviewCode, mergeApprove, triggerAction | Medium | Developer workflow automation; pairs with code generation PingApps |

### Tier 2 — High Value, Medium Feasibility (Phase 2a-2b)

| Site | Key Actions | Complexity | Why |
|------|------------|------------|-----|
| **YouTube Studio** | uploadVideo, editMetadata, schedulePublish, readAnalytics, respondComments | High | Creator economy; complex Angular UI like AI Studio |
| **Twitter/X** | postTweet, scheduleTweet, replyThread, readAnalytics, manageDMs | Medium | Social media automation; auth complexity (OAuth + 2FA) |
| **LinkedIn** | postUpdate, publishArticle, sendMessage, manageConnections | Medium | Professional networking; high enterprise value |
| **Notion** | createPage, updateDatabase, queryBlocks, shareDocument | Medium | Knowledge management; well-structured DOM |
| **Vercel** | deployProject, readLogs, rollback, manageDomains, readAnalytics | Medium | DevOps automation; clean React UI |
| **Stripe Dashboard** | createPaymentLink, readTransactions, issueRefund, readAnalytics | High | FinTech; sensitive data handling required |

### Tier 3 — Experimental (Phase 2c)

| Site | Key Actions | Complexity | Why |
|------|------------|------------|-----|
| **AWS Console** | launchEC2, readCloudWatch, manageLambda, readBilling | Very High | Massive UI surface; high enterprise value but enormous selector space |
| **Figma** | exportAssets, readComponents, commentDesign | High | Canvas-based; non-standard DOM |
| **Shopify** | listProducts, updateInventory, readOrders, manageDiscounts | Medium | E-commerce automation |
| **Discord** | sendMessage, manageChannels, moderateUsers, deployBot | Medium | Community management |
| **Instagram** | postPhoto, scheduleStory, readAnalytics, respondDMs | High | Mobile-first; heavy anti-automation |

### Estimated PingApp generation time with recon pipeline
- Simple sites (clean DOM, few actions): **2-4 hours** (recon + generate + test)
- Medium sites (dynamic UI, overlays): **1-2 days** (recon + generate + manual tuning + E2E tests)
- Complex sites (SPAs, auth walls, anti-bot): **3-5 days** (multiple recon passes + custom action handlers)

---

## 2. Unified API Gateway

A single REST API on port **3500** that routes to all PingApps.

### Architecture

```
Client → Gateway (:3500) → Router → PingApp (:3456-345X)
                          ↓
                    Service Registry
                    Rate Limiter
                    Auth Layer
                    Event Bus
```

### API Design

```
POST   /v1/ping                    # Universal prompt endpoint
GET    /v1/ping/:jobId             # Poll any job by ID
GET    /v1/ping/:jobId/stream      # SSE stream any job
GET    /v1/apps                    # List registered PingApps
GET    /v1/apps/:name/health       # Health check for specific app
POST   /v1/batch                   # Submit to multiple PingApps at once
DELETE /v1/ping/:jobId             # Cancel a job
```

### Universal Prompt Body

```jsonc
{
  "site": "gemini",              // required — routes to correct PingApp
  "prompt": "Explain quantum computing",
  "priority": "normal",          // realtime | normal | bulk
  "tool": "deep_research",       // site-specific tool
  "mode": "thinking",            // site-specific mode
  "conversation_id": "abc123",   // continue existing conversation
  "timeout_ms": 120000,
  "callback_url": "https://...", // webhook on completion
  "metadata": { "user": "..." }
}
```

### Service Registry

PingApps self-register on startup via heartbeat:
```jsonc
// POST /v1/register (internal)
{
  "name": "gemini",
  "port": 3456,
  "capabilities": ["chat", "deep_research", "image_gen", "code"],
  "models": ["gemini-3-pro", "gemini-3-flash"],
  "status": "healthy"
}
```

Registry stores in Redis with TTL. If a PingApp stops heartbeating, it's marked degraded.

### Rate Limiting

Per-user, per-site limits stored in Redis:
```
rate:user123:gemini → 6/min (sliding window)
rate:user123:chatgpt → 3/min
rate:global:gemini → 60/min
```

Returns `429 Too Many Requests` with `Retry-After` header.

---

## 3. Auth Management

### Cookie Vault

Encrypted storage for browser session cookies per site per account:

```
~/.pingdev/auth/
├── gemini/
│   ├── account-1.enc          # Encrypted cookie jar
│   └── account-2.enc
├── chatgpt/
│   └── account-1.enc
└── aistudio/
    └── account-1.enc
```

Encryption: AES-256-GCM with a master key derived from user passphrase (PBKDF2).

### Session Lifecycle

```
FRESH → ACTIVE → EXPIRING → EXPIRED → RE_AUTH
         ↑                      |
         └──────────────────────┘
              (auto-refresh)
```

- **Health probe**: Each PingApp's `preflight` action checks if the session is valid
- **Auto-refresh**: If cookies expire, trigger a re-auth flow (navigate to login, apply saved credentials)
- **Multi-account**: Round-robin across accounts to distribute rate limits

### Multi-Account Pool

```jsonc
{
  "gemini": {
    "accounts": [
      { "email": "user1@gmail.com", "cookieFile": "account-1.enc", "tier": "ultra" },
      { "email": "user2@gmail.com", "cookieFile": "account-2.enc", "tier": "free" }
    ],
    "strategy": "round-robin"   // round-robin | least-loaded | priority
  }
}
```

The gateway assigns jobs to accounts based on strategy. Ultra-tier accounts get priority for expensive operations (Deep Research, image gen).

---

## 4. Event System

### Unified Event Bus

Built on Redis Streams for durability and fan-out:

```
Stream: pingdev:events
  → { id, type, site, jobId, timestamp, data }
```

### Event Types

| Event | Trigger | Data |
|-------|---------|------|
| `job.created` | New job submitted | `{jobId, site, prompt}` |
| `job.started` | Worker picks up job | `{jobId, site}` |
| `job.progress` | Partial response | `{jobId, site, partialText, state}` |
| `job.completed` | Response extracted | `{jobId, site, response, timing}` |
| `job.failed` | Error occurred | `{jobId, site, error}` |
| `health.degraded` | PingApp health drops | `{site, reason}` |
| `health.recovered` | PingApp recovers | `{site}` |
| `selector.broken` | Selector starts failing | `{site, selector, failRate}` |
| `auth.expired` | Session expired | `{site, account}` |

### Webhook Registration

```jsonc
// POST /v1/webhooks
{
  "url": "https://myserver.com/hook",
  "events": ["job.completed", "job.failed"],
  "filter": { "site": "gemini" },      // optional: filter by site
  "secret": "whsec_..."                 // HMAC signature for verification
}
```

### Cross-PingApp Chains

```jsonc
// POST /v1/chains
{
  "name": "research-and-summarize",
  "steps": [
    { "site": "gemini", "prompt": "Research {{topic}} using Deep Research", "tool": "deep_research" },
    { "site": "chatgpt", "prompt": "Summarize this research:\n{{step1.response}}", "dependsOn": "step1" }
  ]
}
```

The event bus triggers each step when its dependencies complete. Failed steps can have fallback routes.

---

## 5. AI Orchestration (OpenClaw Integration)

### Built-in Workflow Templates

**Research Mode** — Fan-out the same prompt to multiple AI sites, compare results:
```bash
openclaw skill pingdev:research "What causes aurora borealis?"
# → Sends to Gemini + ChatGPT + Perplexity in parallel
# → Returns comparison table with citations
```

**Publish Pipeline** — Content creation to multi-platform posting:
```bash
openclaw skill pingdev:publish \
  --draft-with gemini \
  --edit-with chatgpt \
  --post-to "twitter,linkedin" \
  --prompt "Write about the future of browser automation"
```

**Code Review** — GitHub PR analysis through AI:
```bash
openclaw skill pingdev:review --repo owner/repo --pr 123
# → Fetches diff via GitHub PingApp
# → Sends to Gemini for analysis
# → Posts review comments back to GitHub
```

**Monitor & Alert** — Continuous monitoring with AI triage:
```bash
openclaw skill pingdev:monitor \
  --site vercel \
  --check "deployment status" \
  --alert-if "any deployment failed" \
  --notify slack
```

### Conditional Routing

```jsonc
{
  "name": "smart-route",
  "rules": [
    { "if": "prompt.length > 5000", "use": "gemini", "tool": "deep_research" },
    { "if": "prompt.contains('code')", "use": "chatgpt", "mode": "gpt-4" },
    { "if": "gemini.error", "fallback": "chatgpt" },
    { "default": "gemini" }
  ]
}
```

---

## 6. Marketplace

### PingApp Definition Registry (like ClawHub for site shims)

```
pingdev.registry/
├── definitions/
│   ├── gemini@1.2.0.json        # SiteDefinitionResult
│   ├── chatgpt@2.0.1.json
│   ├── youtube-studio@0.1.0.json
│   └── ...
├── selectors/
│   ├── gemini-selectors@1.2.0.json
│   └── ...
└── tests/
    ├── gemini-e2e@1.2.0.json    # E2E test results
    └── ...
```

### Submission Pipeline

```
Author submits definition
  → Automated recon validation (selectors exist on live site)
  → Security scan (no exfiltration, no credential access)
  → E2E test run (send prompt, verify response)
  → Community review (upvotes, comments)
  → Publish to registry
```

### Versioning Strategy

- **Patch** (1.0.x): Selector updates (site changed CSS classes)
- **Minor** (1.x.0): New actions/features added
- **Major** (x.0.0): Breaking changes to action interface

### Auto-Update Detection

Weekly cron job:
1. Snapshot each registered site
2. Diff selectors against current definition
3. If >20% of selectors changed → flag for update
4. If <20% → auto-patch with new selectors
5. Notify definition author

### Revenue Model

- Free: Use community definitions
- Pro ($29/mo): Priority updates, private definitions, SLA
- Enterprise: Custom definitions, dedicated support

---

## 7. Self-Healing System

### Architecture

```
Scheduler (cron) → Health Prober → Selector Validator
                                        ↓
                                  Healing Engine
                                        ↓
                                  Recon Pipeline (re-snapshot)
                                        ↓
                                  Diff Engine (compare old vs new)
                                        ↓
                                  Auto-Patcher (update selectors)
                                        ↓
                                  Test Runner (verify fix)
                                        ↓
                                  Deploy (hot-swap definition)
```

### Selector Health Scoring

Each selector gets a rolling confidence score:

```jsonc
{
  "chat-input": {
    "tiers": [
      { "selector": "textarea[aria-label='Enter a prompt']", "score": 0.98, "lastSuccess": "2026-02-15" },
      { "selector": ".ql-editor", "score": 0.45, "lastSuccess": "2026-01-20" }
    ],
    "overallHealth": 0.98
  }
}
```

- Score > 0.8 → Healthy (green)
- Score 0.5-0.8 → Degraded (yellow) — try alternatives more aggressively
- Score < 0.5 → Broken (red) — trigger healing run

### Healing Run

When a selector drops below threshold:
1. Re-snapshot the site via recon pipeline
2. Find the element that matches the semantic intent (e.g., "chat input")
3. Extract new CSS/ARIA selectors from the snapshot
4. Validate the new selectors work (click, type, verify)
5. Update the SiteDefinition with new tiers
6. Run E2E test suite
7. If tests pass → hot-swap the definition (zero downtime)
8. If tests fail → alert the operator, keep old definition

### Semantic Selector Matching

When `#chat-input-v2` replaces `#chat-input`:
- Match by ARIA role + approximate label (`role=textbox, label~="prompt"`)
- Match by position (same region, same bounding box area)
- Match by behavior (accepts text input, same tab order)
- Match by context (near submit button, near response area)

---

## 8. Mobile Companion

### Tech Stack
- **React Native** (Expo) for iOS + Android
- **PWA fallback** for quick access without install

### Features

| Screen | Purpose |
|--------|---------|
| **Home** | All PingApps with health status, last activity |
| **Quick Prompt** | Send a prompt to any PingApp from mobile |
| **Job Feed** | Real-time feed of all jobs across all PingApps (SSE) |
| **Notifications** | Push alerts for job completion, errors, health changes |
| **Health Dashboard** | Charts — response times, success rates, queue depth |

### Push Notifications

```jsonc
{
  "title": "Gemini Deep Research Complete",
  "body": "Your research on 'quantum computing' is ready (45s)",
  "data": { "jobId": "abc123", "site": "gemini" },
  "action": "VIEW_RESULT"
}
```

Via Firebase Cloud Messaging (FCM) for Android, APNs for iOS.

### iOS Shortcuts / Android Intents

```
"Hey Siri, ping Gemini with 'summarize my emails'"
→ iOS Shortcut → POST /v1/ping { site: "gemini", prompt: "..." }
→ Push notification with result
```

---

## 9. Monetization

### Product Tiers

| Tier | Price | Includes |
|------|-------|---------|
| **Free** | $0 | 3 PingApps, 100 jobs/day, community definitions, 1 account per site |
| **Pro** | $29/mo | Unlimited PingApps, 5000 jobs/day, priority healing, 5 accounts per site, webhooks, chains |
| **Team** | $99/mo | Everything in Pro + 10 seats, shared dashboard, audit logs, SSO |
| **Enterprise** | Custom | Dedicated infrastructure, custom PingApps, SLA, on-prem option |

### Revenue Streams

1. **SaaS Subscriptions** — hosted PingApps-as-a-service (primary)
2. **Marketplace Revenue Share** — 20% cut on paid community definitions
3. **API Gateway Metering** — per-request pricing for high-volume users ($0.001/request after tier limit)
4. **Enterprise Licensing** — white-label for agencies managing client AI accounts
5. **Managed Recon** — "we'll build a PingApp for your site" professional service ($5K-25K)
6. **Browser Pool** — managed CDP browser fleet for users who don't want to run their own ($49/mo per browser)

### GTM Strategy

1. **Open-source core** — @pingdev/core + recon pipeline + 3 reference PingApps (Gemini, AI Studio, ChatGPT)
2. **Dev community** — GitHub stars, Discord, blog posts about browser automation
3. **Marketplace launch** — incentivize community PingApp contributions
4. **Enterprise pilot** — partner with 3-5 companies doing AI automation at scale
5. **Cloud offering** — "PingDev Cloud" with managed browsers, zero-config deployment

---

## 10. Technical Debt & Infrastructure

### Immediate (Phase 2a)

- [ ] **Browser pool**: Multiple CDP instances for concurrent PingApps (currently all share port 18800)
- [ ] **Persistent job storage**: Move from Redis-only to PostgreSQL for job history + Redis for active queue
- [ ] **Proper logging**: Structured JSON logs with request IDs, ship to Loki/ELK
- [ ] **CI/CD**: GitHub Actions for PingApp testing — run E2E tests on every selector change

### Medium-term (Phase 2b)

- [ ] **Kubernetes**: Helm chart for deploying PingApps + gateway + dashboard
- [ ] **Browser orchestration**: Playwright grid or Browserless.io integration for scaling browsers
- [ ] **OpenTelemetry**: Distributed tracing from gateway → PingApp → browser → response
- [ ] **Grafana dashboards**: Response latency p50/p95/p99, error rates, queue depth, selector health

### Long-term (Phase 2c)

- [ ] **Multi-region**: Deploy PingApps close to target sites (US for ChatGPT, EU for Mistral)
- [ ] **Edge caching**: Cache responses for identical prompts (with TTL)
- [ ] **Plugin system**: Allow PingApps to register custom middleware (auth, transform, cache)
- [ ] **Automated PingApp generation**: "Give me a URL" → recon → generate → test → deploy, fully automated

---

## Success Metrics

| Metric | Phase 2a Target | Phase 2c Target |
|--------|----------------|----------------|
| Active PingApps | 6 | 20+ |
| Jobs/day | 500 | 50,000 |
| Selector health (avg) | >90% | >95% |
| Self-heal success rate | — | >80% |
| Marketplace definitions | — | 50+ |
| Paying users | 0 (open source) | 100+ |
| API gateway uptime | 99% | 99.9% |

---

## What's Already Built (Phase 1 Assets)

| Asset | Status | Reusable? |
|-------|--------|-----------|
| @pingdev/core (types, API, queue, state machine, browser, worker) | Production | 100% |
| Recon pipeline (snapshot → analyze → generate) | Working | 100% |
| Gemini PingApp (full actions, 7/8 E2E tests) | Production | Reference impl |
| AI Studio PingApp (full actions, 10/11 E2E tests) | Production | Reference impl |
| ChatGPT PingApp (generated, stub actions) | Needs work | 70% |
| Dashboard (React, health, jobs, streaming) | Production | 90% |
| AI Studio product map (693 lines, all selectors) | Documentation | Planning asset |
| E2E test methodology | Proven | Template for all PingApps |
