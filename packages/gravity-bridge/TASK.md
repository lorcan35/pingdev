# GravityBridge — Antigravity IDE CDP Automation

## Goal
Build a Node.js service that connects to Antigravity IDE (VS Code fork) via Chrome DevTools Protocol (CDP) and exposes an OpenAI-compatible REST API. This lets OpenClaw and other tools use the IDE's built-in models (Claude Opus, Sonnet, Gemini 3.1 Pro, GPT-OSS) through the legitimate GUI — zero ban risk.

## Architecture
```
Client (OpenClaw/curl) → REST API (localhost:3456) → CDP → Antigravity Agent Panel
                                                          ↓
                                                   Response extracted
                                                          ↓
                                                   Streamed back to client
```

## CDP Details
- Antigravity is an Electron app (VS Code fork) running on Display :1
- CDP port: 9222 (read from ~/.config/Antigravity/DevToolsActivePort)
- The Agent panel is in the right sidebar — it has:
  - A text input: "Ask anything, @ to mention, / for work..."
  - A model selector dropdown (currently shows "Claude Op..." = Claude Opus)
  - A send button
  - Response area where the AI replies stream in

## What To Build

### Phase 1: CDP Connector (`src/cdp.js`)
- Connect to ws://127.0.0.1:9222 via puppeteer-core
- Find the main Antigravity webview/window target
- Helper functions:
  - `typePrompt(text)` — type into the Agent panel input
  - `sendPrompt()` — click send or press Enter
  - `waitForResponse()` — wait for and extract the full response
  - `getSelectedModel()` — read current model from dropdown
  - `selectModel(name)` — switch model via the dropdown
  - `isReady()` — check if Agent panel is visible and authenticated

### Phase 2: REST API (`src/api.js`)
- Express/Fastify server on port 3456
- OpenAI-compatible endpoints:
  - `POST /v1/chat/completions` — main endpoint
    - Accept messages array, model name
    - Map model names: "claude-opus" → select Opus in dropdown, etc.
    - Support `stream: true` (SSE) and `stream: false`
  - `GET /v1/models` — list available models from the dropdown
  - `GET /health` — connection status

### Phase 3: Streaming
- Use MutationObserver via CDP to watch the response area
- Stream tokens back as SSE `data: {...}` chunks
- Detect completion (response stops growing)

## Available Models (from the IDE dropdown)
- Claude Opus 4.6 (thinking)
- Claude Sonnet 4.6 (thinking)  
- Gemini 3.1 Pro (high/low)
- Gemini 3 Flash
- GPT-OSS-120b

## Tech Stack
- Node.js (ES modules)
- puppeteer-core (CDP, no bundled browser)
- Express or Fastify
- No external dependencies beyond that

## Key Considerations
- Antigravity uses VS Code's webview architecture — the Agent panel is likely in an iframe or webview
- Need to find the correct CDP target (there may be multiple)
- The response area likely uses a chat-style container with individual message divs
- Must handle thinking/reasoning output separately from final response
- Rate limiting: don't send faster than a human would type

## File Structure
```
gravity-bridge/
├── package.json
├── src/
│   ├── index.js        # Entry point
│   ├── cdp.js          # CDP connection & Agent panel interaction
│   ├── api.js          # REST API server
│   └── stream.js       # Response streaming logic
├── TASK.md             # This file
└── README.md
```

## Success Criteria
1. Can send a prompt and get a response via curl
2. Model switching works
3. Streaming works
4. Can be added to OpenClaw as a provider
