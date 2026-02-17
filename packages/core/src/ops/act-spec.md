# act() Op Specification

## Overview
The `act` op takes a plain-English instruction and executes it deterministically
against the current page using recon keyElements (cellNavigator, formulaBar, grid).
No LLM is needed at runtime — the instruction is parsed into a step plan using
pattern matching against known Sheets operations.

## Wire Format

### Request
```json
{
  "type": "act",
  "instruction": "click cell B2 and type Hello"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "instruction": "click cell B2 and type Hello",
    "steps": [
      { "op": "navigate", "ref": "B2", "status": "done" },
      { "op": "type", "text": "Hello", "target": "formulaBar", "status": "done" },
      { "op": "press", "key": "Enter", "status": "done" }
    ],
    "stepsCompleted": 3,
    "stepsTotal": 3
  }
}
```

## Supported Instruction Patterns

### Cell Navigation
- `"go to A1"` / `"navigate to A1"` / `"select cell A1"`
- Parsed → `[{ op: "navigate", ref: "A1" }]`
- Executes: type ref into name-box (#t-name-box), press Enter

### Cell Click
- `"click cell B2"` / `"click on B2"`
- Parsed → `[{ op: "navigate", ref: "B2" }]`
- Same as navigation (canvas apps can't CSS-click individual cells)

### Type into Cell
- `"type Hello in B2"` / `"enter Hello World in cell A1"`
- Parsed → `[{ op: "navigate", ref: "B2" }, { op: "type", text: "Hello", target: "formulaBar" }, { op: "press", key: "Enter" }]`
- Navigates to cell, types text into formula bar, presses Enter to commit

### Combined Operations
- `"click cell B2 and type Hello"` / `"select A1 then type =SUM(B1:B10)"`
- Parsed → navigate + type + commit steps

### Key Presses
- `"press Enter"` / `"press Tab"` / `"press Escape"`
- `"press Ctrl+C"` / `"press Ctrl+V"` / `"press Ctrl+Z"`
- Parsed → `[{ op: "press", key: "Enter", modifiers?: ["ctrl"] }]`

### Menu Operations
- `"click Format menu"` / `"open the Data menu"`
- Parsed → `[{ op: "click", selector: "role=menuitem:Format" }]`

### Formula Entry
- `"enter formula =SUM(A1:A10) in B1"`
- Parsed → navigate to B1, type formula in formula bar, press Enter

### Clear Cell
- `"clear cell A1"` / `"delete content of B2"`
- Parsed → navigate to cell, press Delete key

### Copy/Paste
- `"copy cell A1"` → navigate + Ctrl+C
- `"paste into B1"` → navigate + Ctrl+V

## Implementation Details

### Step Planning (deterministic, no LLM)
The instruction parser uses regex patterns to extract:
1. **Cell references**: `/\b([A-Z]{1,3}\d{1,7})\b/`
2. **Text to type**: text after "type", "enter", "input", quoted strings
3. **Key names**: Enter, Tab, Escape, Delete, arrow keys
4. **Modifiers**: Ctrl, Shift, Alt, Meta
5. **Menu labels**: text after "menu", "click on ... menu"

### Step Execution
Each step maps directly to existing content.ts handlers:
- `navigate` → `navigateToCell(ref)`
- `type` → focus formula bar + `typeInto(bar, text)`
- `press` → `handlePress(key, modifiers)`
- `click` → `handleClick(selector)`
- `clear` → navigate + press Delete

### Error Handling
- If name-box not found: `{ success: false, error: "Name box not found — not a spreadsheet?" }`
- If step fails: returns partial result with failed step marked
- Each step has a 5s timeout

### Key Elements Used
- `#t-name-box` — cell navigator (type cell ref + Enter to navigate)
- `#t-formula-bar-input` or `[role="textbox"]` — formula bar (type cell content)
- `canvas` — main grid surface
- `role=menuitem:X` — menu items

## Limitations
- Single-sheet context only (doesn't switch tabs)
- No drag-and-drop or resize operations
- No formatting commands (bold, color) — use click on toolbar buttons directly
- Multi-cell selection (A1:B5) not yet supported as a single action
