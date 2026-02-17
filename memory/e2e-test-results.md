# PingOS E2E Test Results

## Run 1 — Initial Run
**Date:** 2026-02-17
**Gateway:** http://localhost:3500
**Device:** chrome-2114771802

### Result: FAIL (script exited after test 1)

**Root Causes Identified:**
1. Test script bug: `set -euo pipefail` + `((FAIL_COUNT++))` causes early exit (bash arithmetic returning 0 = falsy)
2. Test script bug: Uses `.data` in jq queries but gateway returns `.result` (background.ts maps `data` → `result`)
3. Test script bug: Expects `automationStrategy = aria-overlay` but Sheets has no ARIA gridcells → strategy is `name-box-formula-bar`
4. content.ts gap: `cell=A1` selectors fail when no ARIA gridcells exist — needs name-box + formula-bar fallback

### Response Format
Gateway chain: content.ts `{success, data}` → background.ts `{ok, result}` → gateway HTTP `{ok: true, result}`

### Recon Data Highlights
- `canvasApp: true`
- `automationStrategy: "name-box-formula-bar"`
- `accessibilityOverlay.gridcells: 0` (no ARIA grid)
- `keyElements.cellNavigator: {selector: "#t-name-box", value: "A1"}`
- `keyElements.formulaBar: {selector: "[role="textbox"]", contentEditable: true}`

---

## Run 4 — All Tests Pass
**Date:** 2026-02-17

### Result: 22 passed, 0 failed

### Fixes Applied

#### Test Script Fixes (`tests/sheets-e2e.sh`):
1. `set -euo pipefail` → `set -uo pipefail` (removed `-e`)
2. `((COUNT++))` → `COUNT=$((COUNT + 1))` (avoid falsy 0 exit)
3. `.data` → `.result` in jq queries to match gateway response format
4. Test 1 recon: Changed from `grep` on full JSON to structured jq check (`canvasApp == true or canvasAppType contains "sheet"`)
5. Test 14: Accept both `name-box-formula-bar` and `aria-overlay` as valid strategies

#### content.ts Fixes (`packages/chrome-extension/src/content.ts`):
1. **`navigateToCell(ref)`** — New helper that types cell ref into `#t-name-box` and presses Enter
2. **`readFormulaBar()`** — New helper that reads `#t-formula-bar-input` or `[role="textbox"]`
3. **`readCellViaFormulaBar(ref)`** — New helper combining navigation + formula bar read
4. **`handleClick cell=X`** — Falls back to `navigateToCell()` when ARIA element not found
5. **`handleDblClick cell=X`** — Falls back to navigate + F2 (enter edit mode)
6. **`handleRead cell=X`** — Falls back to `readCellViaFormulaBar()` for single cell
7. **`readCellRange()`** — Made async, added name-box+formula-bar fallback loop for ranges

### Full Test Output
```
PASS: recon — Sheets detected
PASS: click cell A1
PASS: press Enter
PASS: press Tab
PASS: type in formula bar
PASS: press Enter to commit
PASS: dblclick cell A1
PASS: press Ctrl+A
PASS: press Ctrl+C
PASS: read formula bar
PASS: eval formula bar content
PASS: scroll down
PASS: scroll up
PASS: click Format menu
PASS: press Escape
PASS: recon canvasApp detected
PASS: automation strategy = name-box-formula-bar
PASS: read cell=A1 via prefix selector
PASS: read cell range A1:C3
PASS: canvas coordinate click (100,100)
PASS: press ArrowRight (canvas navigation)
PASS: press ArrowDown (canvas navigation)
=== 22 passed, 0 failed ===
```

---

## Run 5 — Phase 2 (act) + Phase 3 (extract)
**Date:** 2026-02-17

### Phase 1 Regression: 22/22 PASS (no regressions)

### Phase 2: act() — 9/10 PASS

| Test | Result | Notes |
|------|--------|-------|
| act: navigate to C3 | PASS | `go to C3` → navigate step |
| act: navigate to A1 | PASS | `select cell A1` → navigate step |
| act: clear cell A1 | PASS | navigate + press Delete |
| act: copy cell A1 | PASS | navigate + Ctrl+C |
| act: paste into B1 | PASS | navigate + Ctrl+V |
| act: press Escape | PASS | standalone key press |
| act: press Ctrl+Z | PASS | undo with modifiers |
| act: click Format menu | PASS | role=menuitem selector |
| act: click Data menu | PASS | menu interaction |
| act: type in cell A1 | FAIL | CDP debugger detach/reattach timing — **fix deployed, needs extension reload** |

**Type fix details:**
The navigate step uses one CDP session (attach→commands→detach). The type step opens a second CDP session immediately after. Chrome's debugger detach is not instant, causing the second attach to fail.

**Fix applied in content.ts:** Batched CDP optimization — when act() detects a navigate+type+enter pattern, it executes the entire sequence in a **single CDP session** (one attach/detach). This avoids the timing issue entirely.

**Fix committed in dist/ but requires Chrome extension reload + tab refresh.**

### Phase 3: extract() — 5/5 PASS

| Test | Result | Notes |
|------|--------|-------|
| extract A1:A1 object | PASS | Single cell, object format |
| extract A1:B2 array | PASS | 2x2 range, array format |
| extract A1:C3 csv | PASS | 3x3 range, CSV format |
| extract A1:A3 object (default) | PASS | Default object format |
| extract schema-based | PASS | Legacy `{key: selector}` mode |

### Supported act() Instruction Patterns
- `"go to A1"` / `"select cell A1"` / `"navigate to A1"` → navigate
- `"clear cell A1"` / `"delete A1"` → navigate + Delete
- `"copy cell A1"` → navigate + Ctrl+C
- `"paste into B1"` → navigate + Ctrl+V
- `"press Enter"` / `"press Ctrl+Z"` / `"press Escape"` → key press
- `"click Format menu"` / `"open Data menu"` → menu click
- `"type Hello in A1"` → navigate + type + Enter (**needs extension reload**)

### extract() Formats
- `format: "array"` → `{values: [["a","b"],["c","d"]]}`
- `format: "object"` (default) → `{cells: {"A1":"a","B1":"b"}, count: N}`
- `format: "csv"` → `{csv: "\"a\",\"b\"\n\"c\",\"d\""}`
- `schema: {"key":"selector"}` → legacy DOM text extraction

### Architecture
- **act()**: `parseActInstruction()` → regex pattern matching → `ActStep[]` → `executeActStep()` per step
- **extract()**: range parsing → row-major loop → `navigateToCell()` + `readFormulaBar()` per cell
- Both wired in content.ts switch statement and types.ts BridgeCommand union
- Specs: `packages/core/src/ops/act-spec.md` and `extract-spec.md`

---

## Run 6 — Generic act() fallback (any page)
**Date:** 2026-02-17
**Target:** Amazon.ae (ESP32 search results page)
**Device:** chrome-2114771795

### Result: 2/2 PASS

### Changes Made
Added generic fallback to `parseActInstruction()` so `act()` works on **any** page, not just Google Sheets.

#### New code in `content.ts`:
1. **`fuzzyMatchScore(query, candidate)`** — Scores how well a query matches a candidate label. Returns 0 for no match, higher is better. Scoring: exact=1000, full substring=500+len, contained=400+len, word overlap=10 per exact word, 5 per partial.
2. **`scanPageActions()`** — Lightweight inline recon that scans visible interactive elements (buttons, links, inputs, roles). Returns `{selector, label, purpose, tag}[]`. Same logic as `handleRecon.actions[]` but callable synchronously inside `parseActInstruction`.
3. **Generic fallback in `parseActInstruction()`** — When no Sheets pattern matches:
   - `"click X"` / `"press X"` / `"tap X"` / `"select X"` / `"open X"` → scans page actions, fuzzy-matches label, returns `click-selector` step
   - `"type X in Y"` → scans inputs, fuzzy-matches target, returns `click-selector` + `type` steps
   - `"type X"` (no target) → types into currently focused element
4. **`click-selector` step type in `executeActStep()`** — Finds element via `findElement()` (supports CSS, `text=`, `aria=`, `role=` prefixes), then delegates to `handleClick()`.

### Test Results

| Test | Instruction | Result | Matched Selector |
|------|-------------|--------|------------------|
| 1. Click search box | `"click the search box"` | **PASS** | `#twotabsearchtextbox` |
| 2. Click Account & Lists | `"click Account and Lists"` | **PASS** | `button[aria-label="Expand Account and Lists"]` |

### How It Works
```
act("click the search box")
  → parseActInstruction()
  → no Sheets patterns match
  → generic fallback: clickMatch captures "search box"
  → scanPageActions() finds 150 visible elements
  → fuzzyMatchScore("search box", "Search Amazon.ae") = high score
  → returns [{op: "click-selector", selector: "#twotabsearchtextbox"}]
  → executeActStep() → findElement("#twotabsearchtextbox") → handleClick()
```

### Supported Generic Patterns (NEW)
- `"click the search box"` → fuzzy match against page actions
- `"click Account and Lists"` → fuzzy match by aria-label
- `"type hello in search box"` → find input by label, click, then type
- `"type hello"` → type into currently focused element
- Falls back to `text=` selector when no fuzzy match found
