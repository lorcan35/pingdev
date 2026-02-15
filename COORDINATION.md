# PingDev — Active Work Coordination
> This file is the SINGLE SOURCE OF TRUTH for who's working on what.
> READ THIS BEFORE TOUCHING ANY FILE.

## Active Workers

### Claude Code (tmux: claude-main)
**Owner of:** Everything EXCEPT `packages/dashboard/src/`
- packages/core/
- packages/cli/
- packages/recon/
- ~/projects/gemini-ui-shim/
- ~/projects/pingapps/aistudio/
- ~/projects/pingapps/chatgpt/
- PHASE2-ROADMAP.md
- Infrastructure: ports, health endpoints, process management

**Current tasks:**
- @infra: Wiring Gemini :3456, AI Studio :3457, ChatGPT :3458
- @dashboard: ONLY verifying apps appear (DO NOT modify dashboard source)
- @phase2: Writing PHASE2-ROADMAP.md

### Codex CLI (tmux: codex-design)
**Owner of:** `packages/dashboard/src/` (EXCLUSIVE)
- All .tsx, .ts, .css files in packages/dashboard/src/
- packages/dashboard/package.json (for adding deps)
- packages/dashboard/tailwind.config.*
- packages/dashboard/postcss.config.*
- packages/dashboard/components.json (shadcn)

**Current tasks:**
- Full UI/UX redesign of the dashboard
- Installing shadcn/ui, Tailwind, framer-motion
- Building: App cards, Recon wizard, Activity feed, State machine viz

## Shared Read-Only (both can READ, neither should MODIFY without checking)
- packages/core/src/types.ts — Core types
- DESIGN-BRIEF.md — Design requirements
- COORDINATION.md — This file

## Communication Protocol
- Claude Code writes API contracts to `packages/dashboard/API-CONTRACTS.md`
- Codex reads API contracts to know what endpoints exist
- If either needs to cross the boundary, write a note to `COORDINATION-NOTES.md`

## Port Assignments (LOCKED)
| App | Port |
|-----|------|
| Gemini Shim | 3456 |
| AI Studio | 3457 |
| ChatGPT | 3458 |
| Dashboard | 3400 |
