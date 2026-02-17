# Battle Test Fixes — Systemic Engine Reliability

All 4 fixes target `packages/chrome-extension/src/content.ts` (the content script engine).
These are ENGINE-level fixes, not per-site selector patches.

## Fix 1: Smart Extract Fallback

**Problem:** When CSS selectors return nothing (wrong selector, site redesign, dynamic classes),
`handleExtract` silently returns empty strings. YouTube trending titles, Amazon product names,
etc. all fail because their selectors are fragile.

**Solution:** `smartExtractFallback(selector, key)` — when querySelector returns null, infer
data type from the selector/key name and use semantic extraction:

- `title`/`heading` keywords → scan h1-h6, repeated heading containers, `[role="heading"]`, `a[title]`
- `price`/`cost` → regex for currency patterns (`$XX.XX`, `€`, `£`, `¥`) + `[class*="price"]`, `[itemprop="price"]`
- `score`/`vote` → `[class*="score"]`, `[data-score]`, shadow DOM piercing
- `channel`/`author` → `[class*="author"]`, `[class*="channel"]`, `[rel="author"]`
- `view`/`watch` → `[class*="view"]`, `[aria-label*="view"]`

**Files:** `content.ts:smartExtractFallback()` (lines ~490-530 of new code)

## Fix 2: Shadow DOM Piercing

**Problem:** Reddit, YouTube, and modern web components use Shadow DOM. Standard
`document.querySelector()` cannot reach elements inside shadow roots, causing
`findElement()`, `handleRead()`, and `handleExtract()` to return empty results.

**Solution:** Two new helpers:
- `deepQuerySelectorAll(root, selector)` — traverses all shadow roots recursively
- `deepQuerySelector(root, selector)` — returns first match from any shadow root

Applied as fallback in:
- `findElement()` — CSS selector default path now falls back to shadow DOM
- `handleRead()` — `querySelectorAll` fallback to shadow DOM
- `handleExtract()` — schema extraction falls back to shadow DOM
- `findElement()` role= and aria= prefixes — shadow DOM search when normal query empty

**Files:** `content.ts:deepQuerySelectorAll()`, `deepQuerySelector()` + integration in 4 call sites

## Fix 3: Aria-Label Sanitization

**Problem:** Amazon and eBay product pages have aria-labels with special characters
(quotes, backslashes, unicode, 500+ char labels). These break:
1. CSS attribute selectors: `[aria-label="some "quoted" text"]` → syntax error → crash
2. Regex matching: `new RegExp(\`\\b${unsanitized}\\b\`)` → regex syntax error
3. Fuzzy matching: unicode whitespace chars cause false negatives

**Solution:** Three sanitization functions:
- `sanitizeAriaLabel(label)` — truncate to 200 chars, normalize unicode whitespace, collapse spaces
- `escapeCSSAttrValue(str)` — escape `"` and `\` for safe use in `[attr="value"]` selectors
- `escapeRegexChars(str)` — escape `.*+?^${}()|[]\` for safe use in `new RegExp()`

Applied in ALL places where aria-labels are used to build selectors:
- `scanPageActions()` — 2 locations
- `handleRecon()` — 4 locations (actions scan, input surfaces, toolbar state, menus)
- `handleObserve()` — 1 location
- `findElement()` role= and cell= paths — regex usage
- `bestSelector()` / `keSel()` helpers — 2 locations

**Files:** `content.ts:sanitizeAriaLabel()`, `escapeCSSAttrValue()`, `escapeRegexChars()` + 9 call sites

## Fix 4: Natural Language Extract Mode

**Problem:** Extract requires knowing exact CSS selectors for each site. This means every
site needs custom selector research. When selectors break, extraction fails completely.

**Solution:** New mode where schema values are plain English descriptions:
```json
{
  "schema": {
    "titles": "the video titles on this page",
    "channels": "the channel names",
    "prices": "product prices"
  }
}
```

When `isNaturalLanguageQuery(value)` detects a natural language description (contains
articles/prepositions, descriptive keywords, or multiple words), it routes to
`extractByNaturalLanguage(description)` which matches keyword patterns:

| Keyword | Extraction Strategy |
|---------|-------------------|
| title/headline/heading | h1-h6, repeated containers, `[role="heading"]`, `a[title]` |
| price/cost/amount | Currency regex + `[class*="price"]`, `[itemprop="price"]` |
| score/vote/rating | `[class*="score"]`, `[data-score]`, shadow DOM |
| comment/review | `[class*="comment"]`, `[class*="reply"]` |
| date/time/ago | `<time>`, `[datetime]`, date regex patterns |
| name/author/channel | `[class*="author"]`, `[class*="channel"]`, `[rel="author"]` |
| link/url | All `a[href]` values |
| image/photo | `img[src]`, background-image URLs |
| view/watch/play | `[class*="view"]`, `[aria-label*="view"]` |
| description/summary | `[class*="description"]`, `[class*="snippet"]` |

Core helper: `findRepeatedContainers()` — detects feed/list layout by finding parent elements
with 3+ same-tag children (the universal pattern for any content list page).

**Files:** `content.ts:isNaturalLanguageQuery()`, `extractByNaturalLanguage()`, 10+ extraction
functions, `findRepeatedContainers()`

## Build & Type Check

```
$ npx tsc --noEmit  → PASS (0 errors)
$ npm run build     → PASS (content.js 58.0kb)
```

## Test Commands

```bash
# YouTube trending — NL extract (was FAIL, now uses semantic extraction)
curl -s -X POST http://localhost:3500/v1/dev/DEVICE/extract \
  -H "Content-Type: application/json" \
  -d '{"schema":{"titles":"the video titles on this page","channels":"the channel names"}}'

# Reddit — shadow DOM piercing for scores (was PARTIAL)
curl -s -X POST http://localhost:3500/v1/dev/DEVICE/extract \
  -H "Content-Type: application/json" \
  -d '{"schema":{"titles":"the post titles","scores":"the upvote counts"}}'

# Amazon — aria crash fixed (was FAIL)
curl -s -X POST http://localhost:3500/v1/dev/DEVICE/act \
  -H "Content-Type: application/json" \
  -d '{"instruction":"click the search button"}'
```

## Summary

| Fix | Problem | Root Cause | Solution |
|-----|---------|-----------|----------|
| 1 | Extract returns empty | Brittle CSS selectors | Semantic fallback by data type |
| 2 | Shadow DOM invisible | querySelector doesn't pierce | Recursive shadowRoot traversal |
| 3 | Amazon/eBay crash | Special chars in aria-labels | Sanitize + escape for CSS/regex |
| 4 | Needs per-site selectors | Engine requires CSS knowledge | Natural language descriptions |
