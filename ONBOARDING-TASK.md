Create an agent team with 4 teammates for improving PingOS onboarding:

## Context
PingOS is a web-to-API compiler. It turns websites into REST APIs using a Chrome extension bridge + gateway server. The repo is at ~/projects/pingdev with packages: chrome-extension, cli, core, dashboard, mcp-server, python-sdk, recon, std.

Current onboarding is: clone → npm install → build → manually load extension → manually start gateway → curl. Too many steps before seeing value.

## Teammates

### 1. CLI-Polish (cli-polish)
**Task:** Make the CLI the single entry point for PingOS. In `packages/cli/src/index.ts`:
- `pingos up [--daemon]` — build if needed, start gateway, print status with URL
- `pingos down` — stop the gateway
- `pingos status` — show gateway status, connected tabs, available PingApps
- `pingos doctor` — check Node version, Chrome installed, extension loaded, gateway reachable, Redis optional
- `pingos demo` — after gateway is up, run a demo extract against a well-known public page (e.g. Hacker News front page) and pretty-print the JSON result
- Make sure the CLI is properly wired in package.json bin field so `npx pingos` works
- **Dependencies:** None

### 2. Dashboard-DX (dashboard-dx)  
**Task:** Make the dashboard (`packages/dashboard`) the default "welcome" experience:
- When gateway starts, auto-open `http://localhost:3500` in the browser
- Dashboard landing page should show: connected tabs (live), a "Try Extract" input box (paste URL + natural language query → get JSON), system health status
- Add a "Getting Started" panel with 3 steps: 1) Install extension 2) Share a tab 3) Try an extract
- Use the existing React + Vite setup in the dashboard package
- **Blocked by:** Nothing (can work in parallel)

### 3. Quick-Start-Docs (docs-writer)
**Task:** Rewrite onboarding documentation:
- Create `docs/QUICKSTART.md` — 5-minute guide, one command to value
- Update `README.md` Quick Start section to point to the new flow: `npx pingos up` → open dashboard → share tab → extract data
- Add a "PingOS in 60 seconds" section at the top of README with the simplest possible path
- Create `docs/ENTRY-POINTS.md` — different paths for CLI devs, Python devs, MCP/AI devs, no-code users
- Reference the existing GIFs in docs/assets/
- **Blocked by:** #1 (CLI-Polish) for accurate CLI commands

### 4. Init-Flow (init-flow)
**Task:** Build `pingos init` interactive scaffolding:
- `pingos init` — interactive wizard: asks what sites you want to automate, generates a starter PingApp config
- `pingos init <url>` — non-interactive: runs recon on URL, generates PingApp scaffold
- `pingos app list` — list available pre-built PingApps (aliexpress, amazon, claude)
- `pingos app install <name>` — copy a pre-built PingApp into the user's project
- Wire into the existing CLI in packages/cli
- For pre-built apps, reference the existing app-routes.ts patterns
- **Blocked by:** #1 (CLI-Polish) for CLI architecture

## Rules
- Write findings/progress incrementally. Don't wait until the end.
- Test each piece: `pnpm build` must pass after changes.
- Stay lean on context — use targeted reads, don't cat entire large files.
- When all teammates finish: run `pnpm build`, verify no errors, git commit with message "feat: revamp onboarding — one-command start, dashboard DX, init wizard, quickstart docs", write summary to /tmp/onboarding-summary.md.
