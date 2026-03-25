# Dashboard

> **Package**: `packages/dashboard` (React + Vite)
> **Port**: `3400` (default, configured in `vite.config.ts`)

The PingOS Dashboard is a local web UI for observing and controlling the gateway and connected PingApps in real time. It proxies gateway API calls through Vite's dev server at `/gw` to `localhost:3500`.

## Starting the Dashboard

```bash
cd packages/dashboard
pnpm dev
```

Open `http://localhost:3400` in your browser.

## Layout

The dashboard uses a shell layout with a fixed sidebar and a top header:

- **Sidebar**: PingOS logo, navigation links (Apps, Recon, Logs), and a keyboard shortcut hint.
- **Header**: Title bar with the CommandBar trigger button.
- **Main content**: Routed pages.

## Pages

### Home (`/`)

The home page is the primary operational view. It renders these sections top-to-bottom:

| Section | Component | What it shows |
|---------|-----------|---------------|
| **System Health** | `SystemHealth` | Gateway online/offline status (pulsing dot), shared tab count. Polls `/v1/health` and `/v1/devices` every 5 seconds. |
| **Getting Started** | `GettingStarted` | Three-step onboarding guide: install extension, share a tab, try an extract. |
| **Try Extract** | `TryExtract` | Interactive extraction form — pick a device from the dropdown, type a natural-language query, and hit Extract. Results render as formatted JSON. |
| **PingApps** | `AppCard` grid | Cards for each registered PingApp showing name, port, and health status. Double-click a card to open the detail page. |
| **Activity Feed** | `ActivityFeed` | Live timeline of health changes, queue events, and registry actions. Shows up to 8 items in compact mode. |
| **Quick Add** | Inline buttons | One-click registration for Gemini (3456), AI Studio (3457), ChatGPT (3458). |

### App Detail (`/app/:port`)

Deep-dive view for a single PingApp. Shows health polling results, queue flow visualization (waiting/active/done/failed segments), and job inspection tools.

### Recon (`/recon`)

Wizard-style page for turning a URL into a PingApp definition. The pipeline has five stages:

1. **URL** — Enter the target URL.
2. **SNAPSHOT** — Capture DOM + screenshot.
3. **ANALYZE** — Infer selectors and actions.
4. **GENERATE** — Emit a SiteDefinition.
5. **DEPLOY** — Register on a new port.

The generated definition preview shows a stub `defineSite(...)` template.

### Logs (`/logs`)

Job inspection page. Select a PingApp from the dropdown, paste a job UUID, and look up its full timeline:

- **Summary**: Job ID, status, prompt, tool used, mode, artifacts, errors.
- **Timeline**: State transitions with timestamps (e.g., IDLE -> TYPING -> GENERATING -> DONE).
- **Timing**: Queued, started, first token, completed, and total duration.
- **Response**: Full response text with optional thinking/reasoning toggle.

## Key Components

### SystemHealth

Polls the gateway every 5 seconds and renders:
- A pulsing green dot when the gateway is online, red when offline.
- A count of shared browser tabs from `/v1/devices`.

### AppViz

Visualization primitives for health and queue state:

- `HealthPulse` — Animated dot with glow effect. States: `healthy`, `degraded`, `unhealthy`, `offline`, `loading`.
- `QueueFlow` — Segmented progress bar showing waiting/active/done/failed proportions.
- `StateStrip` — Compact text display of waiting and active counts.

### Activity

Context provider + feed component that tracks real-time events:
- Health status changes per app.
- Queue state transitions (worker engaged, queue building).
- Registry events (app registered, app removed).

Events are stored in-memory (last 120 items) and rendered as a timestamped feed with color-coded severity levels: `info`, `good`, `warn`, `bad`.

### TryExtract

Interactive extraction tool with three inputs:
1. **Device dropdown** — Auto-populated from `/v1/devices`.
2. **Query field** — Natural language, e.g., "Extract all product titles and prices".
3. **Extract button** — Calls `POST /gw/v1/dev/:deviceId/extract` with the query.

Results display as syntax-highlighted JSON. Errors show in a red banner.

### CommandBar

Fuzzy command palette triggered by `Ctrl+K` (or `Cmd+K` on macOS). Commands include:
- **Navigation**: Go to Apps, Recon, Logs.
- **Per-app**: Open app detail, copy app URL, remove app.

Uses a custom fuzzy scorer that rewards ordered character matches and penalizes gaps.

## Hooks

| Hook | Purpose |
|------|---------|
| `useApps()` | CRUD for the registered app list (persisted to localStorage). |
| `useHealth(port)` | Polls a single PingApp's `/health` endpoint. |
| `useMultiHealth(ports)` | Polls multiple PingApps in parallel on a configurable interval. |
| `useSSE(url)` | Connects to an SSE endpoint and yields events. |

## Gateway Proxy

The Vite dev server proxies `/gw/*` requests to `http://localhost:3500/*`, so the dashboard does not need CORS configuration. All gateway API calls in the dashboard use the `/gw` prefix.
