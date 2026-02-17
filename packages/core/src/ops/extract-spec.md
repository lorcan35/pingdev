# extract() Op Specification

## Overview
The `extract` op reads cell values from a spreadsheet range and returns structured
data. It uses the name-box + formula-bar pattern: navigate to each cell via
`#t-name-box`, read the value from `#t-formula-bar-input`. Works for canvas-based
apps (Google Sheets) that lack ARIA gridcell elements.

## Wire Format

### Request — Range-based extraction
```json
{
  "type": "extract",
  "range": "A1:B5",
  "format": "array"
}
```

### Response — Array format
```json
{
  "success": true,
  "data": {
    "range": "A1:B5",
    "values": [
      ["Name", "Score"],
      ["Alice", "95"],
      ["Bob", "87"],
      ["Carol", "92"],
      ["Dave", "78"]
    ]
  }
}
```

### Response — Object format (default)
```json
{
  "success": true,
  "data": {
    "range": "A1:B5",
    "cells": {
      "A1": "Name",
      "B1": "Score",
      "A2": "Alice",
      "B2": "95",
      "A3": "Bob",
      "B3": "87",
      "A4": "Carol",
      "B4": "92",
      "A5": "Dave",
      "B5": "78"
    },
    "count": 10
  }
}
```

### Response — CSV format
```json
{
  "success": true,
  "data": {
    "range": "A1:B5",
    "csv": "\"Name\",\"Score\"\n\"Alice\",\"95\"\n\"Bob\",\"87\"\n\"Carol\",\"92\"\n\"Dave\",\"78\""
  }
}
```

## Supported Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `range` | string | — | Cell range in A1 notation, e.g. `"A1:B5"`, `"C3:F10"` |
| `format` | string | `"object"` | Output format: `"array"`, `"object"`, or `"csv"` |
| `schema` | object | — | Legacy: `{ key: cssSelector }` → `{ key: textContent }` |

## Extraction Strategy

### Range-based (primary)
1. Parse range into start/end cell references
2. Convert column letters to numbers (A=1, Z=26, AA=27, etc.)
3. For each cell in row-major order:
   a. Navigate to cell via `navigateToCell(ref)` — types ref into `#t-name-box`, presses Enter
   b. Wait 150ms for formula bar to update
   c. Read value from `readFormulaBar()` — reads `#t-formula-bar-input` textContent
4. Assemble into requested output format

### Schema-based (legacy)
For non-spreadsheet pages, use `schema: { key: "css-selector" }` to extract text
from arbitrary DOM elements.

## Implementation Details

### Cell Reference Parsing
- Column: `A`→1, `Z`→26, `AA`→27, `AZ`→52, etc.
- Row: 1-based integer
- Range: `startRef:endRef` → min/max row and column

### Key Elements Used
- `#t-name-box` — cell navigator input (type cell ref + Enter)
- `#t-formula-bar-input` — formula bar (read textContent or value)
- `canvas` — grid surface (clicked to exit edit mode before navigation)

### Timing
Each cell read takes ~450ms (navigate 300ms + read 150ms). A 5×5 range (25 cells)
takes ~11s. For large ranges, consider reading a subset or using the `read`
op with `cell=A1:B5` which has the same behavior.

### Error Handling
- Invalid range format: `{ success: false, error: "Invalid range: ..." }`
- Name-box not found: cells return empty strings (no hard failure)
- Formula bar unreadable: cell value defaults to `""`

## Limitations
- Sequential reads only (one cell at a time via name-box)
- Large ranges (>100 cells) may be slow (~45s+)
- Reads displayed values, not raw formulas (formula bar shows the formula for formula cells)
- Single-sheet context (doesn't switch between sheet tabs)
