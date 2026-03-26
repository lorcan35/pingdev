# GravityBridge v2 Upgrade Task

## Current State
- Basic API works: type prompt → send → extract response ✅
- OpenAI-compatible endpoint at localhost:3456 ✅
- Keyboard typing + Enter to send (React-compatible) ✅
- Response extraction via text node walking ✅

## What Needs Adding

### 1. Thinking Token Capture
- The "Thought for Xs" blocks contain a collapsible section with the full reasoning
- Click/expand the "Thought for Xs" element to reveal thinking content
- Return thinking in the response as a separate field (like Anthropic's `thinking` blocks)
- Response format should include: `{ content: "answer", thinking: "reasoning..." }`

### 2. Auto-Approve
- When Antigravity wants to edit files or run terminal commands, it shows approval buttons
- Look for "Accept" / "Reject" / "Run" buttons that appear in the Agent panel
- Auto-click "Accept" or "Run" when they appear
- Add a MutationObserver that watches for approval prompts and clicks them
- Make this configurable (auto-approve on/off via API parameter)

### 3. Quota Tracking
- Watch for rate limit messages in the UI (e.g., "Rate limit reached", "Try again in X")
- Extract and return quota/rate limit info in the response
- Add a GET /v1/quota endpoint that returns current status

### 4. Mode Switching
- Two modes: "Planning" and "Fast" (buttons visible in panel)
- Add a `mode` parameter to the completions API
- Click the appropriate mode button before sending prompt
- Planning = deep reasoning, Fast = direct execution

### 5. Model Selection (Already Partially Working)
- Models visible in dropdown: Claude Opus 4.6, Sonnet 4.6, Gemini 3.1 Pro (High/Low), Gemini 3 Flash, GPT-OSS 120B
- Fix GET /v1/models to return the actual models from the DOM
- Model switching via the `model` parameter in completions

### 6. Session/Conversation Management
- Add POST /v1/conversations/new — start a fresh conversation (click new chat)
- Add GET /v1/conversations/current — return current conversation context
- Track conversation turns

### 7. Better Response Extraction
- Current method: walk all text nodes, filter UI chrome
- Improve: use MutationObserver to watch for NEW elements appearing after send
- Capture streaming tokens as they appear (real-time SSE)
- Handle multi-block responses (code blocks, markdown, etc.)

### 8. Error Handling
- Detect error messages from Antigravity ("Something went wrong", etc.)
- Return proper error responses instead of hanging
- Handle connection drops and reconnect

## Technical Notes
- CDP endpoint: ws://127.0.0.1:9222
- Antigravity must be launched with: `--remote-debugging-port=9222`
- Agent panel container: `.antigravity-agent-side-panel`
- Chat input: `div[contenteditable]` with class containing `cursor-text`
- Send: keyboard Enter key
- All input via `page.keyboard.type()` (React requires real keyboard events)

### 9. Human-Like Behavior (WITHOUT slowing down)
- Variable typing speed: `page.keyboard.type(text, { delay: random(15-45) })` — not constant 20ms
- Occasional tiny pauses between words (50-150ms randomly, not every word)
- Click the input field before typing (humans click then type)
- Small random delay before pressing Enter (100-300ms) — humans don't instant-send
- Move mouse to input area before typing (one CDP Input.dispatchMouseEvent)
- Move mouse to general response area after sending
- **DO NOT:** add long waits, fake scrolling, or anything that actually slows throughput
- The goal: look organic to telemetry, not simulate a grandma typing

## Priority Order
1. Better response extraction + streaming (fixes the core product)
2. Thinking token capture (high value)
3. Model selection fix (already partial)
4. Mode switching (easy)
5. Auto-approve (medium complexity)
6. Session management (nice to have)
7. Quota tracking (nice to have)
8. Error handling (ongoing)
