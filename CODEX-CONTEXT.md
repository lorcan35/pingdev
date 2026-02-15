# PingOS Dashboard — Full Context for Codex

## What You're Building
A mission-control dashboard for PingOS — an OS layer that wraps websites into REST APIs.
Think: Vercel Dashboard meets Raycast meets a hacker terminal. Dark, clean, alive.

## The Codebase You Own
All files in `packages/dashboard/src/`:

### Current Files (to be redesigned):
- `App.tsx` — Router with TopBar (has SVG logo, nav links: Apps, Recon, Logs)
- `pages/Home.tsx` — App registry table with health dots, queue stats, add/remove apps
- `pages/AppDetail.tsx` — Per-app detail page (drills in by port)
- `pages/Recon.tsx` — Site analysis page
- `pages/Logs.tsx` — Activity logs
- `hooks/useHealth.ts` — Health polling hook (useMultiHealth)
- `hooks/useSSE.ts` — Server-sent events hook
- `lib/api.ts` — API client (loadApps, addApp, removeApp, PingAppConfig type)
- `index.css` — Current styles (basic dark theme with green accents)
- `main.tsx` — React entry point

### Core Types (READ ONLY — don't modify):
`packages/core/src/types.ts`:
- SelectorDef: {name, tiers: string[]}
- ActionHandler, ActionContext
- SiteDefinitionResult: {name, url, purpose, category, selectors, actions, states, features, completion}

## Backend APIs (per PingApp)
Each PingApp runs on its own port and exposes:

```
GET  /v1/health          → {status: "healthy"|"degraded"|"offline", browser: {connected, page_loaded}, queue: {waiting, active, completed, failed}, worker: {running}}
POST /v1/jobs             → {job_id, status: "queued", created_at}
GET  /v1/jobs/:id         → {job_id, status, prompt, response?, created_at, completed_at?}
GET  /v1/jobs/:id/status  → {status, substate, elapsed_ms, tool_used, partial_response?}
GET  /v1/jobs/:id/thinking → {thinking_content} (for deep think jobs)
POST /v1/chat             → Sync endpoint (blocks until response)
GET  /v1/tools            → {tools: [{name, description}]}
```

## Registered PingApps
| Name | Port | URL | Tools |
|------|------|-----|-------|
| Gemini | 3456 | gemini.google.com | deep_research, deep_think, create_videos, create_images, canvas, guided_learning |
| AI Studio | 3457 | aistudio.google.com | 21 models, prompt builder, code gen, app deployment |
| ChatGPT | 3458 | chatgpt.com | chat, code interpreter, DALL-E, browsing |

## Dashboard Port
The dashboard itself runs on port 3400.
Vite proxy forwards `/api/:port/*` to `http://localhost:{port}/*`

## Design Vision
- Dark theme (#0a0a0a bg, green/cyan accents #00ff88 / #00d4ff)
- App cards with LIVE health pulse animations (green glow = healthy)
- Queue flow visualization (waiting → active → completed, animated)
- State machine animation per app (idle → typing → generating → done)
- Command bar (Cmd+K) for quick actions across all apps
- Recon Wizard: paste URL → watch snapshot progress → review definition → generate
- Activity Feed: SSE-powered real-time event stream
- Toast notifications for job completions/failures
- Responsive: collapsible sidebar on mobile

## What's Already Running
Claude Code (separate agent) already wired up the backend:
- Gemini on :3456 ✅ healthy
- AI Studio on :3457 ✅ healthy  
- ChatGPT on :3458 (may need fixing)
- Dashboard on :3400 ✅ serving

## Tech Stack
- React 19 + Vite
- react-router-dom v7
- TypeScript
- Add: shadcn/ui, Tailwind CSS, Lucide icons, framer-motion
