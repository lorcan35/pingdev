# PingOS Smart Extract Upgrade — Build Plan (Level 2 → Level 10)

## Goal: Transform extract from "give me CSS selectors" to "give me data, figure it out yourself"

---

### Level 2: Zero-Config Extract
**What:** Empty body extract returns best-guess structured data.

**content.ts changes to `case 'extract':`**
- If body is empty or `{}`, trigger auto-extract:
  1. Check for JSON-LD first (Level 4 — build together)
  2. Check for OpenGraph meta tags
  3. Run discover engine to detect page type
  4. Apply default schema for that page type
  5. Return extracted data with `_auto: true` flag and `_confidence` score
- Keep existing schema-based extract as-is when schema is provided

**Gateway:** Same `POST /v1/dev/:device/extract` — just handles empty body now.

---

### Level 3: Semantic Extract  
**What:** Natural language extraction requests.

**New handler in content.ts or extend extract:**
- Accept `{ query: "all product prices on this page" }` or `{ extract: "the author name and date" }`
- Route to LLM (already have llm.ts + drivers):
  1. Send page DOM summary (truncated) + user query to LLM
  2. LLM returns CSS selectors + field names
  3. Execute those selectors against the page
  4. Return structured data with selectors used (for caching/reuse)
- Cache selector mappings: same query on same domain reuses selectors without LLM call
- LLM fallback: if selectors return empty, retry with broader context

**Gateway:** `POST /v1/dev/:device/extract` with `{ query: "..." }` triggers semantic mode.
Also: `POST /v1/dev/:device/extract/semantic` as explicit endpoint.

---

### Level 4: JSON-LD / Schema.org / OpenGraph Priority
**What:** Before touching DOM, grab structured data the site already provides.

**New file: `packages/chrome-extension/src/structured-data.ts`**
- `extractJsonLd()`: Find all `<script type="application/ld+json">`, parse, merge
- `extractOpenGraph()`: All `<meta property="og:*">` tags
- `extractMicrodata()`: Elements with `[itemscope][itemtype]` → walk `[itemprop]` children
- `extractTwitterCards()`: `<meta name="twitter:*">` tags
- `extractMetaTags()`: title, description, canonical, author, date meta tags
- Merge all into unified object with source annotations: `{ title: "...", _source: "json-ld" }`

**Integration into extract handler:**
- Check structured data FIRST (0ms, no DOM walking needed)
- If structured data covers requested fields → return immediately
- Only walk DOM for fields NOT found in structured data
- Return `_sources: { title: "json-ld", price: "css-selector", rating: "microdata" }`

---

### Level 5: Multi-Page Extract (Paginate + Extract)
**What:** Extract across all pages automatically.

**New file: `packages/std/src/paginate-extract.ts`**
- Accept: `{ schema, paginate: true, maxPages?: 10, delay?: 1000 }`
- Flow:
  1. Extract from current page using schema
  2. Call paginate.detect on the tab to find pagination
  3. If hasNext: call paginate.next, wait for load, extract again
  4. Accumulate results array
  5. Repeat until maxPages or no more pages
  6. Return: `{ pages: N, totalItems: N, data: [...all items...] }`
- Support infinite scroll: scroll down, wait for new content, extract delta
- Deduplication: track seen items by content hash, skip duplicates

**Gateway:** `POST /v1/dev/:device/extract` with `paginate: true` in body.

---

### Level 6: Nested/Recursive Extract
**What:** Extract hierarchical data — parent → children → grandchildren.

**Extend extract handler in content.ts:**
- New schema syntax for nesting:
```json
{
  "products[]": {
    "_container": ".product-card",
    "title": "h2",
    "price": ".price",
    "reviews[]": {
      "_container": ".review",
      "author": ".reviewer-name",
      "rating": ".stars@data-rating",
      "text": ".review-body"
    }
  }
}
```
- `[]` suffix = array (find all matching containers)
- `_container` = parent selector to scope children
- Recursion depth limit: 5 levels
- Each level scopes selectors to its container element
- Return preserves tree structure

---

### Level 7: Type-Aware Extract
**What:** Auto-parse extracted values into proper types.

**New file: `packages/chrome-extension/src/type-parser.ts`**
- Type hints in schema: `{ "price": { "selector": ".price", "type": "currency" } }`
- OR auto-detect from content patterns (no hint needed):
  - **currency**: `$29.99` → `{ value: 29.99, currency: "USD", raw: "$29.99" }`
  - **date**: `Feb 20, 2026` → `{ iso: "2026-02-20", raw: "Feb 20, 2026" }`
  - **rating**: `4.5 out of 5` / `★★★★☆` → `{ value: 4.5, max: 5, raw: "..." }`
  - **number**: `1,234` → `1234`
  - **percentage**: `45%` → `0.45`
  - **phone**: `+1 (555) 123-4567` → `{ e164: "+15551234567", raw: "..." }`
  - **email**: detect email patterns → validated email string
  - **url**: relative → absolute URL resolution
  - **boolean**: "Yes"/"No", "In Stock"/"Out of Stock" → true/false
  - **list**: `"Red, Blue, Green"` → `["Red", "Blue", "Green"]`
- Auto-detect mode (default): try all parsers, use the one with highest confidence
- Explicit mode: `"type": "currency"` forces specific parser

---

### Level 8: Shadow DOM Pierce
**What:** Extract through web component shadow roots.

**Extend extract/querySelectorAll in content.ts:**
- New recursive `deepQuerySelector(root, selector)`:
  1. Try normal querySelector on root
  2. If not found, iterate all elements in root
  3. For each element with `.shadowRoot`, recurse into it
  4. Support `>>>` piercing combinator: `shreddit-post >>> h2`
  5. Support `::shadow` alternative syntax
- Apply to ALL operations (extract, click, type, read, etc.)
- Cache shadow root references for performance
- Handle open AND closed shadow roots (try `.shadowRoot` then `chrome.dom.getOpenShadowRoot`)

---

### Level 9: Visual Extract
**What:** When DOM fails, use screenshots + vision model.

**New file: `packages/std/src/visual-extract.ts`**
- Triggered when:
  - DOM extract returns empty AND `fallback: "visual"` is set
  - OR explicitly: `{ strategy: "visual" }`
  - OR page has canvas/SVG-rendered content
- Flow:
  1. Take screenshot of the element or viewport
  2. Send to vision model (MiniCPM-o local or cloud API)
  3. Prompt: "Extract structured data from this screenshot: {schema description}"
  4. Parse LLM response into structured JSON
  5. Return with `_strategy: "visual"` marker
- Useful for: Google Sheets cells, charts/graphs, canvas apps, image-based content
- Optional: OCR preprocessing for text-heavy screenshots (Tesseract/Whisper)

**Gateway:** `POST /v1/dev/:device/extract` with `strategy: "visual"` or auto-fallback.

---

### Level 10: Template Learning
**What:** Extract once, generate reusable template forever.

**New file: `packages/std/src/template-learner.ts`**
- Flow:
  1. User extracts from a page successfully (any method)
  2. POST `/v1/dev/:device/extract/learn` — saves extraction as template:
     - Domain + URL pattern (regex)
     - Selectors used + alternatives
     - Schema shape
     - Sample data for validation
     - Page type from discover
  3. Templates stored in `~/.pingos/templates/{domain}.json`
  4. On future extracts: if URL matches a template, auto-apply it
  5. Self-healing: if template selectors fail, try alternatives, then LLM regen
  6. Template sharing: export/import templates

**Gateway:**
```
POST   /v1/dev/:device/extract/learn     → learn template from current page
GET    /v1/templates                       → list saved templates
GET    /v1/templates/:domain               → get template for domain
DELETE /v1/templates/:domain               → delete template
POST   /v1/templates/import                → import template JSON
GET    /v1/templates/:domain/export        → export template JSON
```

**Integration with extract:**
- Before any extraction, check template store for URL match
- If template exists AND selectors work → instant extraction (no LLM, no heuristics)
- If template selectors fail → self-heal, update template, proceed
- Track template hit rate and success rate

---

## Confidence & Validation (applies to ALL levels)
**Every extraction returns:**
```json
{
  "data": { ... },
  "_meta": {
    "strategy": "css|json-ld|semantic|visual|template",
    "confidence": 0.95,
    "sources": { "title": "json-ld", "price": "css" },
    "duration_ms": 12,
    "selectors_used": { "title": "h1", "price": ".price" },
    "template_hit": true,
    "auto": false
  }
}
```

## Validation layer:
- Non-empty check: extracted value shouldn't be empty string
- Type validation: if type declared, value must parse
- Schema validation: all requested fields present
- Anomaly detection: if price is > $1M or < $0, flag as suspicious
- Return `_warnings: ["price looks unusually high"]` when detected

---

## KEY FILES
1. `packages/chrome-extension/src/content.ts` — extend extract handler, add shadow DOM piercing
2. `packages/chrome-extension/src/structured-data.ts` — NEW: JSON-LD/OG/microdata extraction
3. `packages/chrome-extension/src/type-parser.ts` — NEW: type-aware parsing
4. `packages/std/src/paginate-extract.ts` — NEW: multi-page extraction
5. `packages/std/src/visual-extract.ts` — NEW: screenshot-based extraction
6. `packages/std/src/template-learner.ts` — NEW: template learning + storage
7. `packages/std/src/gateway.ts` — new routes for templates, semantic extract
8. `packages/python-sdk/pingos/browser.py` — Tab.extract() upgrades, Tab.learn_template()
9. `packages/cli/src/index.ts` — `pingdev extract --auto`, `pingdev templates`
10. Tests for each level

## BUILD ORDER (strict)
Level 4 (JSON-LD) → Level 2 (Zero-Config) → Level 3 (Semantic) → Level 6 (Nested) → Level 7 (Type-Aware) → Level 8 (Shadow DOM) → Level 5 (Multi-Page) → Level 9 (Visual) → Level 10 (Template Learning)

JSON-LD first because Zero-Config depends on it. Nested + Type-Aware before Multi-Page because pagination needs nested extraction. Visual and Template last as they're most complex.

## IMPORTANT — Rules:
- Write code incrementally. Run pnpm build after every 2 levels.
- Run vitest after each level.
- Test against live pages through the gateway when possible.
- Git commit after Levels 2-4: "feat: smart extract levels 2-4 (zero-config, semantic, JSON-LD)"
- Git commit after Levels 5-8: "feat: smart extract levels 5-8 (multi-page, nested, typed, shadow DOM)"
- Git commit after Levels 9-10: "feat: smart extract levels 9-10 (visual, template learning)"
