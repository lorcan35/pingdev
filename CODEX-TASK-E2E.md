# Codex Task: PingOS E2E Tests → act() → extract()

## Context
PingOS Phase 4 (canvas app support) is complete. Recon now works for Google Sheets:
- selectionState correctly identifies cell refs (A1, B2, etc.)
- keyElements is structured object with cellNavigator, formulaBar, grid, addRows
- automationStrategy: "name-box-formula-bar" (no vision needed)

## Mission (3 Phases)

### Phase 1: Run E2E Test Suite
- Location: `tests/sheets-e2e.sh`
- Goal: Verify all 12+ tests pass against live Google Sheets tab
- Device: `chrome-2114771802` (gateway port 3500)
- If tests fail: debug and fix the failing ops
- **Write results to:** `memory/e2e-test-results.md` incrementally

### Phase 2: Build `act()` Op
- Goal: Natural language → LLM plans steps using recon data
- Example: `act("Select cell B2 and type Hello")` → plans: find cell, click, type
- Use recon.keyElements.cellNavigator + formulaBar for Sheets
- **Write spec to:** `packages/core/src/ops/act-spec.md`
- **Write implementation to:** `packages/chrome-extension/src/content.ts` (handleAct function)

### Phase 3: Build `extract()` Op
- Goal: Schema-driven data extraction
- Example: `extract({schema: {cell: "A1:B5", format: "array"}})` → returns [["AA","BB"],...]
- Use recon.cellSamples + ARIA grid scanning
- **Write spec to:** `packages/core/src/ops/extract-spec.md`
- **Write implementation to:** `packages/chrome-extension/src/content.ts` (handleExtract function)

## Long-Horizon Rules (MANDATORY)
1. **Write findings incrementally** — Append to output files every 3-5 tool calls. Do NOT wait until the end.
2. **If you hit an error or context grows large** — IMMEDIATELY write what you have to disk before anything else.
3. **Stay lean on context** — Use `head -N`, `grep`, targeted reads. Don't `cat` entire large files.
4. **Write checkpoints** — After each phase, write to `pingos-phase-checkpoint.json`: `{"completed":"phase1","next":"phase2","output":"path/to/file"}`
5. **Test each phase** before moving to the next.

## Starting Point
- Repo: `/home/rebelforce/projects/pingdev`
- Gateway: `http://localhost:3500`
- Test tab: `https://docs.google.com/spreadsheets/d/1HoYMpEHBYQeCqZPI5fZkyIijJbY3KJYbdor5Jd7J0oY/edit`
- Recon test: `curl -X POST http://localhost:3500/v1/dev/chrome-2114771802/recon -H 'Content-Type: application/json' -d '{"classify":true}'`

## Support Available
- Ping (main agent) can help with:
  - Browser automation (reload extension, navigate tabs)
  - Desktop control (xdotool, wmctrl for UI clicks)
  - File operations if you get stuck
  - Just ask in the tmux session or via sessions_send

## First Step
Read `tests/sheets-e2e.sh` to understand the test structure, then run it and capture results to `memory/e2e-test-results.md`.
