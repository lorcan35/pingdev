# PingOS — Google Sheets Readiness: Agent Team Task Brief

## Goal
Add missing ops and harden existing capabilities so PingOS can fully automate Google Sheets.

## Context
- Monorepo at `/home/rebelforce/projects/pingdev` with packages: `chrome-extension`, `cli`, `core`, `dashboard`, `recon`, `std`
- Chrome extension lives at `packages/chrome-extension/src/content.ts` (main command handler)
- Stealth module at `packages/chrome-extension/src/stealth.ts`
- Gateway at `packages/std/src/gateway.ts`
- Protocol types at `packages/chrome-extension/src/types.ts` and `packages/chrome-extension/src/protocol.ts`
- Extension is built with plain tsc, output to `packages/chrome-extension/dist/`
- Gateway runs via `node packages/std/dist/main.js`

## Google Sheets Challenges
- The cell grid is rendered on a `<canvas>` element — CSS selectors can't target individual cells
- Sheets has an accessibility overlay with `[role="gridcell"]` elements that map to visible cells
- The formula bar IS standard DOM (`#t-formula-bar-input` or similar)
- Menus use `[role="menuitem"]`, `[role="option"]`, `[role="menu"]`
- Toolbar buttons use `[role="button"]` with `aria-label`
- Cell editing is triggered by double-click or typing directly
- Navigation is keyboard-heavy: Tab, Enter, arrow keys, Ctrl+C/V, Ctrl+Z
- Right-click context menus are custom DOM, not native

## Tasks (4 teammates needed)

### 1. **KeyMaster** — Build `press` op
**File:** `packages/chrome-extension/src/content.ts`
Add a new `case 'press'` handler that:
- Accepts `{ key: string, modifiers?: string[] }` — e.g. `{ key: "Enter" }`, `{ key: "c", modifiers: ["Control"] }`
- Dispatches proper `keydown` → `keypress` (if printable) → `keyup` sequence
- Supports modifier combos: Ctrl, Shift, Alt, Meta
- Supports special keys: Enter, Tab, Escape, ArrowUp/Down/Left/Right, Backspace, Delete, Home, End, PageUp, PageDown, F1-F12
- Dispatches on `document.activeElement` by default, or on a provided `selector` target
- Add corresponding route in gateway (`/v1/dev/:device/press`)
- The gateway route handler is generic — look at how `click`, `type` etc are handled in `gateway.ts` — they all go through the same `POST /v1/dev/:device/:op` handler, so just make sure the extension handles the `press` case

### 2. **DoubleAgent** — Build `dblclick`, `select`, `scroll` ops
**File:** `packages/chrome-extension/src/content.ts` + `stealth.ts`

**dblclick op:**
- New `case 'dblclick'` — accepts `{ selector: string, stealth?: boolean }`
- Standard: dispatch `dblclick` MouseEvent
- Stealth: use humanClick twice with short delay (150-300ms), or dispatch full mousedown→mouseup→click→mousedown→mouseup→click→dblclick sequence
- Important for: entering cell edit mode in Sheets

**select op (drag-select):**
- New `case 'select'` — accepts `{ from: string, to: string }` (two selectors) OR `{ selector: string, startOffset?: number, endOffset?: number }` for text selection
- For element range: mousedown on `from` → mousemove to `to` → mouseup on `to`
- For text selection: use Selection API (`window.getSelection()`)
- Use stealth mouse movement (bezier curves from stealth.ts) when `stealth: true`

**scroll op:**
- New `case 'scroll'` — accepts `{ direction: 'up'|'down'|'left'|'right', amount?: number, selector?: string, stealth?: boolean }`
- Default: scroll the page/viewport
- With `selector`: scroll within that container element
- Stealth: use `humanScroll` from stealth.ts
- Also support `{ to: 'top'|'bottom' }` for quick jumps

### 3. **Recon+ Engineer** — Harden `findElement` + `recon` for canvas/aria apps
**Files:** `packages/chrome-extension/src/content.ts`

**Harden findElement:**
- Currently only supports CSS selectors and `text=` prefix
- Add `role=` prefix: `role=menuitem:Copy` → finds `[role="menuitem"]` containing text "Copy"
- Add `aria=` prefix: `aria=Bold` → finds `[aria-label="Bold"]`
- Add `cell=` prefix for spreadsheet grids: `cell=A1` → finds the accessibility overlay element for cell A1 (look for `[role="gridcell"]` with appropriate aria attributes, or use Sheets' naming convention)
- Expand `text=` to also search `[role="menuitem"], [role="option"], [role="tab"], [role="treeitem"], span, div, label, td, th` — not just buttons/links
- Add `nth=` modifier: `role=menuitem:nth=2` → second matching menuitem

**Harden recon:**
- Detect canvas-based apps: if a `<canvas>` element covers >50% of viewport, flag it as `canvasApp: true`
- When canvas detected, scan for accessibility overlay elements: `[role="grid"], [role="gridcell"], [role="row"], [role="columnheader"]`
- Add ARIA landmark scanning: `[role="toolbar"], [role="menubar"], [role="tablist"], [role="dialog"]`
- Report the grid dimensions if found (rows × cols from aria attributes)
- Add `menus` array to recon output: scan `[role="menubar"] > [role="menuitem"]` for top-level menu items

### 4. **TestPilot** — Build test script + Google Sheets PingApp skeleton
**Files:** New files

**Test script** at `tests/sheets-e2e.sh`:
- A bash script that runs against a live Google Sheets tab via curl to the PingOS gateway
- Tests in order:
  1. `recon` — verify Sheets structure is detected (canvas, toolbar, grid, formula bar)
  2. `click` on cell A1 (via `cell=A1` or aria selector)
  3. `press` Enter to confirm, `press` Tab to move
  4. `type` "Hello PingOS" in formula bar
  5. `press` Enter to commit
  6. `dblclick` on cell A1 to edit
  7. `press` with Ctrl+A (select all), Ctrl+C (copy)
  8. `read` the formula bar content
  9. `eval` to extract cell values from the accessibility layer
  10. `scroll` down, then back up
  11. `click` on a menu item (e.g., Format menu)
  12. `press` Escape to close menu
- Each test should print PASS/FAIL with the response

**PingApp skeleton** at `projects/pingapps/sheets/`:
- Create the directory structure: `package.json`, `tsconfig.json`, `src/index.ts`, `src/selectors.ts`
- Define selectors for: formula bar, cell grid, toolbar buttons (Bold, Italic, etc.), menu bar items, sheet tabs
- Define actions: `selectCell(ref)`, `typeInCell(ref, value)`, `readCell(ref)`, `formatBold()`, `insertRow()`, `navigate(sheetName)`
- This is the Phase 5 output — what the auto-generator SHOULD produce. We're building the gold standard manually first.

## Build & Test Instructions
- Build extension: `cd packages/chrome-extension && npm run build` (or `npx tsc`)
- Build gateway: `cd packages/std && npm run build`
- After building extension, the dist files need to be reloaded in Chrome (go to chrome://extensions, click reload on PingOS)
- Gateway is running in tmux `pingos-gw` — restart with: `tmux send-keys -t pingos-gw C-c && sleep 1 && tmux send-keys -t pingos-gw 'OPENROUTER_API_KEY=sk-or-v1-... node packages/std/dist/main.js' Enter`
- Test with: `curl -s -X POST http://localhost:3500/v1/dev/chrome-TABID/press -H 'Content-Type: application/json' -d '{"key":"Enter"}'`

## Rules
- Write findings and code incrementally. Don't wait until the end.
- Stay lean on reads — use targeted line ranges, not full file cats.
- Test each piece compiles before moving on: `npx tsc --noEmit`
- Don't modify package.json dependencies unless absolutely necessary.
- Keep the extension bundle small — no external dependencies in chrome-extension package.
