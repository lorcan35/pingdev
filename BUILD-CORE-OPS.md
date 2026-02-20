# PingOS Core Operations Expansion — Build Plan

## Goal: Add 15 new core operations. Build in impact order.

### PHASE 1 — Must-Haves (build first)

#### 1. `fill` — Smart Form Filling
**content.ts handler:** `case 'fill':`
- Accept `{ fields: { "label_or_selector": "value", ... } }`
- Auto-detect form on page, find all inputs/selects/checkboxes/radios/textareas
- Match fields by: label text, placeholder, name attribute, id, aria-label
- Handle input types: text, email, password, number, tel, date, datetime-local, url
- Handle selects: open dropdown, find option by text or value, select it
- Handle checkboxes/radios: check/uncheck by label matching
- Handle React/Material UI selects (click to open, find option in listbox role)
- Return: `{ filled: [{field, value, selector, success}], skipped: [] }`

**Gateway:** `POST /v1/dev/:device/fill` with body `{ fields: {...} }`

#### 2. `wait` — Smart Conditional Waits
**content.ts handler:** `case 'wait':`
- Accept `{ condition, selector?, text?, timeout? }`
- Conditions:
  - `"visible"` — wait for selector to appear in DOM and be visible
  - `"hidden"` — wait for selector to disappear
  - `"text"` — wait for selector to contain specific text
  - `"textChange"` — wait for text content to change from current value
  - `"networkIdle"` — wait for no pending XHR/fetch for 2s
  - `"domStable"` — wait for no DOM mutations for 1s
  - `"exists"` — wait for selector to exist in DOM (even if hidden)
- Use MutationObserver + polling hybrid
- Configurable timeout (default 10s, max 30s)
- Return: `{ waited: true, duration_ms, condition_met: true/false }`

**Gateway:** `POST /v1/dev/:device/wait`

#### 3. `table` — Smart Table Extraction  
**content.ts handler:** `case 'table':`
- Accept `{ selector?, index? }` (optional — auto-detect if not given)
- Auto-detect tables: `<table>`, `[role="grid"]`, `[role="table"]`, repeated row patterns in divs
- Extract headers from `<thead>`, `<th>`, first row, or aria-labels
- Extract all rows as objects keyed by header name
- Handle: colspan, rowspan, nested tables (extract as sub-arrays)
- Handle div-based grids: detect repeated children with same class/structure
- Handle pagination indicator (detect "page 1 of N" or next buttons)
- Return: `{ tables: [{ headers: [...], rows: [{...}], rowCount, pagination: {hasNext, indicator} }] }`

**Gateway:** `POST /v1/dev/:device/table`

#### 4. `dialog` — Dialog/Modal Handler
**content.ts handler:** `case 'dialog':`
- Accept `{ action: "dismiss"|"accept"|"detect"|"interact", text? }`
- `detect`: Find all visible modals/dialogs/overlays:
  - `[role="dialog"]`, `[role="alertdialog"]`, `.modal`, `[class*="modal"]`
  - Cookie banners: `[class*="cookie"]`, `[class*="consent"]`, `[id*="cookie"]`
  - GDPR: `[class*="gdpr"]`, `[class*="privacy"]`
  - Paywalls: `[class*="paywall"]`, `[class*="subscribe"]`
  - Generic overlays: elements with `position:fixed` + high z-index covering viewport
- `dismiss`: Click X button, "Reject", "No Thanks", "Close", overlay background
- `accept`: Click "Accept", "OK", "I Agree", "Allow", "Got it"
- `interact`: Custom — click element matching `text` parameter within the dialog
- Return: `{ found: [{type, selector, text}], action_taken, success }`

**Gateway:** `POST /v1/dev/:device/dialog`

#### 5. `paginate` — Auto-Pagination
**content.ts handler:** `case 'paginate':`
- Accept `{ action: "detect"|"next"|"prev"|"goto", page? }`
- `detect`: Find pagination controls:
  - `[rel="next"]`, `.pagination`, `[class*="pager"]`
  - "Next" / ">" / "»" / "Load more" buttons
  - Infinite scroll detection (scroll sentinel, intersection observer trigger)
  - Page indicators: "Page 1 of 10", "1 2 3 ... 10"
- `next`: Click next page button/link, wait for content to load
- `prev`: Click previous page button/link
- `goto`: Navigate to specific page number
- Return: `{ currentPage, totalPages?, hasNext, hasPrev, paginationType: "links"|"buttons"|"infinite_scroll"|"load_more" }`

**Gateway:** `POST /v1/dev/:device/paginate`

#### 6. `select` — Handle Complex Dropdowns
**content.ts handler:** `case 'select':`
- Accept `{ selector, value?, text?, search? }`
- Handle native `<select>`: set value directly
- Handle React Select / Material UI / Custom dropdowns:
  1. Click the trigger/input to open
  2. Wait for listbox/options to appear
  3. If `search`: type into the search input
  4. Find option by text match or value match
  5. Click the option
  6. Verify selection applied
- Handle multi-select: `{ selector, values: ["a", "b"] }`
- Return: `{ selected: "value", display: "Display Text", success }`

**Gateway:** `POST /v1/dev/:device/select`

### PHASE 2 — Power Ops (build after Phase 1)

#### 7. `navigate` — Intelligent Navigation
- Accept `{ to: "checkout"|"settings"|"profile"|url }`
- If URL: direct navigation
- If keyword: analyze page links, breadcrumbs, menus to find path
- Multi-step: follow navigation chain if needed
- Return: `{ navigated: true, url, steps: [{clicked, url}] }`

#### 8. `hover` — Trigger Hover States
- Accept `{ selector, duration_ms? }`
- Move mouse to element center, hold for duration
- Capture any new content that appears (tooltips, menus, previews)
- Return: `{ hovered: true, newContent?: {...} }`

#### 9. `assert` — Verification/Testing
- Accept `{ assertions: [{type, selector, expected}] }`
- Types: exists, notExists, visible, hidden, text, textContains, value, class, attribute, count
- Return: `{ passed: true/false, results: [{assertion, passed, actual, expected}] }`

#### 10. `network` — Intercept Network Calls
- Accept `{ action: "start"|"stop"|"list", filter?: {url?, method?} }`
- Capture all XHR/fetch requests and responses
- Filter by URL pattern or method
- Return captured requests with status, headers, body (truncated)

#### 11. `storage` — Browser Storage Access
- Accept `{ action: "get"|"set"|"delete"|"list", store: "local"|"session"|"cookies", key?, value? }`
- Read/write localStorage, sessionStorage, cookies
- Return current values

#### 12. `capture` — Rich Page Capture
- Accept `{ format: "pdf"|"mhtml"|"har"|"dom" }`
- PDF: use Chrome's built-in print to PDF
- MHTML: full page archive
- DOM: serialized HTML snapshot
- HAR: captured network log

#### 13. `upload` — File Upload
- Accept `{ selector, filePath }`
- Set file input value via Chrome DevTools protocol
- Trigger change event
- Return: `{ uploaded: true, fileName }`

#### 14. `download` — Manage Downloads
- Accept `{ url?, selector?, savePath? }`  
- Trigger download and track completion
- Return: `{ downloaded: true, path, size }`

#### 15. `annotate` — Visual Annotations
- Accept `{ annotations: [{selector, label?, color?, style: "box"|"highlight"|"arrow"}] }`
- Overlay visual annotations on the page
- Take screenshot showing annotations
- Return: `{ annotated: true, screenshot_base64 }`

---

## KEY FILES TO MODIFY
1. `packages/chrome-extension/src/content.ts` — add all case handlers
2. `packages/chrome-extension/src/types.ts` — add BridgeCommand types
3. `packages/std/src/gateway.ts` — add all REST routes
4. `packages/std/src/types.ts` — add operation types
5. `packages/python-sdk/pingos/browser.py` — add Tab methods for each op
6. `packages/cli/src/index.ts` — add CLI commands for key ops
7. Tests for each operation

## BUILD ORDER
Phase 1: fill → wait → table → dialog → paginate → select (build + test each before next)
Phase 2: navigate → hover → assert → network → storage → capture → upload → download → annotate

## IMPORTANT — Rules:
- Write code incrementally. Run pnpm build after every 2-3 ops.
- Run vitest after each phase.
- If content.ts gets too large, extract handler functions into separate files and import them.
- Stay lean: targeted reads/edits, don't load entire files unnecessarily.
- Git commit after Phase 1: "feat: 6 new core operations (fill, wait, table, dialog, paginate, select)"
- Git commit after Phase 2: "feat: 9 more core operations (navigate, hover, assert, network, storage, capture, upload, download, annotate)"
