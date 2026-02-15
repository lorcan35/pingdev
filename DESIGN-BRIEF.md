# PingOS Dashboard — Design Brief

## What is PingOS?
A local-first OS layer that wraps ANY website into a programmatic REST API. An AI agent or human gets unified control over web services through composable PingApps.

## Current Stack
- **@pingdev/core** — Base types, selectors, action handlers
- **@pingdev/cli** — CLI for snapshot, generate, recon
- **@pingdev/recon** — Snapshot engine + generator
- **@pingdev/dashboard** — Current React + Vite frontend (BASIC — needs redesign)

## Working PingApps
1. **Gemini** (gemini.google.com) — 6 tools, 19/19 tests, Deep Research/Think/Videos/Images/Canvas/Learning
2. **AI Studio** (aistudio.google.com) — 21 models, 10 actions, 13 features, app builder, deployment
3. **ChatGPT** (chatgpt.com) — Started, basic chat flow

## Current Dashboard Features (Basic)
- App registry table with health dots
- Queue stats (waiting/active/completed)
- App detail drill-down
- Recon page for analyzing new sites
- Logs page
- "Add App" form

## Design Vision
This should feel like a **mission control / OS dashboard** — not a boring admin panel. Think:
- **macOS Launchpad meets Vercel Dashboard meets Raycast**
- Real-time status of all PingApps
- Live activity feed showing what each app is doing RIGHT NOW
- Visual state machine — see the idle→typing→generating→done flow animate
- One-click to trigger any action on any PingApp
- Recon mode: paste a URL, watch it get analyzed and turned into a PingApp live
- Dark theme, hacker aesthetic, but clean and modern
- Status: green pulses, amber warnings, red alerts
- Queue visualization — see jobs flowing through the pipeline
- Per-app dashboards with tool-specific controls (e.g., Gemini's Deep Think button, AI Studio's model switcher)

## Tech Stack
- React 19 + Vite
- react-router-dom v7
- TypeScript
- No component library currently — design from scratch or pick one (shadcn/ui, Radix, etc.)

## Key API Endpoints (per PingApp)
- GET /v1/health — {status, queue: {waiting, active, completed}}
- POST /v1/jobs — Submit a job
- GET /v1/jobs/:id — Poll job status
- GET /v1/jobs/:id/status — Real-time status with substates
- POST /v1/chat — Sync convenience endpoint

## Files to Reference
- Dashboard source: packages/dashboard/src/
- Core types: packages/core/src/types.ts
- Gemini shim: ~/projects/gemini-ui-shim/src/
- AI Studio: ~/projects/pingapps/aistudio/src/
- AI Studio E2E tests: ~/projects/pingapps/aistudio/ASSUMPTION-TESTS.md
- AI Studio app flows: ~/projects/pingapps/aistudio/APP-BUILDING-TESTS.md

## Deliverables
1. Complete redesigned dashboard with new component library
2. App cards with live health + queue visualization
3. Per-app detail pages with action controls
4. Live activity/event feed
5. Recon wizard (paste URL → snapshot → analyze → generate → deploy)
6. Visual state machine animations
7. Responsive, dark-mode-first design
