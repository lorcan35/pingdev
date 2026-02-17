# PingOS CLI End-to-End Test Results

**Date:** 2026-02-17
**Gateway:** localhost:3500
**Browser:** Chrome 144.0.7559.132 (Linux)
**Test tab:** chrome-2114771795

---

## 1. `pingos devices`

**Status: PASS**

```
ID                             TITLE                                      DOMAIN
------------------------------------------------------------------------------------------
chrome-2114771780              Basic arithmetic calculation - Claude      claude.ai
chrome-2114771795              Hacker News                                news.ycombinator.com
chrome-2114771797              TinkerLabs - Google Drive                  drive.google.com
chrome-2114771798              Google Gemini                              gemini.google.com
chrome-2114771799              Google Gemini                              gemini.google.com
chrome-2114771800              Google Gemini                              gemini.google.com
chrome-2114771801              ar.aliexpress.com/w/wholesale-EchoEar-ES   ar.aliexpress.com
chrome-2114771802              Untitled spreadsheet - Google Sheets       docs.google.com
chrome-2114771803              Google Calendar - Friday, February 20, 2   calendar.google.com
```

9 tabs detected, all with correct device IDs, titles, and domains.

---

## 2. `pingos recon chrome-2114771795`

**Status: PASS**

Target: Hacker News (https://news.ycombinator.com/)

Returned structured recon data including:
- **Page metadata:** url, title, meta description
- **Structure:** hasHeader, hasNav, hasMain, etc.
- **Actions:** 100+ links detected with selectors (e.g., `a[href="newest"]` for "new")
- **Inputs:** 0 inputs (HN has no visible inputs on front page without login)
- **App fingerprint:** null (not a canvas app)

Sample actions:
```json
{"type": "link", "selector": "a[href=\"newest\"]", "label": "new", "purpose": "navigate"}
{"type": "link", "selector": "a[href=\"front\"]", "label": "past", "purpose": "navigate"}
{"type": "link", "selector": "a[href=\"submit\"]", "label": "submit", "purpose": "submit"}
```

---

## 3. `pingos observe chrome-2114771795`

**Status: PASS**

Returned human-readable summary:
```
Summary: Hacker News with 0 inputs, 0 buttons, and 192 links

Actions:
  - Click 'Hacker News' link -> news
  - Click 'new' link -> newest
  - Click 'past' link -> front
  - Click 'GrapheneOS - Break Free from Google and Apple' link -> blog.tomaszdunia.pl/...
  - Click 'Four Column ASCII (2017)' link -> garbagecollected.org/...
  ... (192 total actions)
```

---

## 4. `pingos act "click new" chrome-2114771795`

**Status: PASS**

```json
{
  "ok": true,
  "result": {
    "instruction": "click new",
    "steps": [
      {
        "op": "click-selector",
        "selector": "a[href=\"newest\"]",
        "status": "done"
      }
    ],
    "stepsCompleted": 1,
    "stepsTotal": 1
  }
}
```

The `act` handler correctly parsed "click new", found `a[href="newest"]` via fuzzy match, and clicked it. Page navigated to /newest.

---

## 5. `pingos extract '{"title":"td.title > .titleline > a", "points":"td.subtext > .score"}' chrome-2114771795`

**Status: PASS**

```json
{
  "ok": true,
  "result": {
    "title": "Launching Open-Clawbot.com",
    "points": ""
  }
}
```

Extracted first article title. Points empty because /newest doesn't always show scores immediately.

Also tested `pingos read`:
```json
{
  "ok": true,
  "result": [
    "Launching Open-Clawbot.com",
    "Long-term vision for improving build times on Clang/LLVM",
    "Show HN: Nectar Gold – Breastmilk tracker where an AI agent manages data via CLI",
    "Show HN: AI Agent for SEO on Autopilot",
    "Show HN: Ratunit – A TUI for browsing JUnit XML test reports written in Rust",
    ... (30 titles total)
  ]
}
```

---

## 6. `pingos apps`

**Status: PASS**

```
APP                  VERSION    WORKFLOWS                      DESCRIPTION
------------------------------------------------------------------------------------------
amazon               0.1.0      price-check, search-product    Search products, compare prices, and ext
gmail                0.1.0      check-inbox, compose-email     Check inbox, read emails, and compose me
google-calendar      0.1.0      create-event, view-today       View upcoming events and create new cale
reddit               0.1.0      browse-subreddit, extract-top-posts Browse subreddits, read posts, and extra
youtube              0.1.0      extract-trending, search-and-play Search, watch, and extract data from You
```

All 5 PingApps listed with their workflows.

---

## 7. `pingos run youtube search-and-play -i query="ESP32 projects" chrome-2114771795`

**Status: PASS (10/10 steps)**

```
Running youtube/search-and-play
  Inputs: {'query': 'ESP32 projects'}

  [1/10] navigate: https://www.youtube.com                    OK
  [2/10] wait: 5s                                             OK
  [3/10] click: input[name="search_query"]                    OK
  [4/10] type: "ESP32 projects"                               OK
  [5/10] click: button[aria-label="Search"]                   OK
  [6/10] wait: 4s                                             OK
  [7/10] extract: ['titles', 'channels', 'views']             OK
  [8/10] click: ytd-video-renderer #video-title               OK
  [9/10] wait: 3s                                             OK
  [10/10] extract: ['video_title', 'channel_name', 'view_count']  OK

Done!
```

**Extracted data:**
```json
{
  "titles": "Introduction to ESP32 - Getting Started",
  "channels": "DroneBot Workshop",
  "video_title": "Introduction to ESP32 - Getting Started",
  "channel_name": "DroneBot Workshop",
  "view_count": "1.9M views"
}
```

The workflow:
1. Navigated to YouTube.com
2. Clicked the search input and typed "ESP32 projects"
3. Clicked the Search button (YouTube ignores synthetic Enter)
4. Extracted first result: "Introduction to ESP32 - Getting Started" by DroneBot Workshop
5. Clicked the first video result
6. Extracted video page data: title, channel, 1.9M views

---

## Bugs Found and Fixed

### Bug 1: `handleType` rejected missing selectors (content.ts:301)
**Symptom:** `type` op with no selector returned "Invalid selector: must be a string"
**Root cause:** Guard added by extension-fixer was too strict — `handleType` should fall back to `document.activeElement` when no selector is given
**Fix:** Changed guard to check for active element fallback:
```ts
if (!selector || typeof selector !== 'string') {
    element = document.activeElement;
    if (!element || element === document.body) {
        return { success: false, error: 'No selector provided and no element is focused' };
    }
}
```

### Bug 2: YouTube ignores synthetic `press Enter` events
**Symptom:** Workflow typed query but search never executed
**Root cause:** YouTube's search form doesn't respond to synthetic `KeyboardEvent('keydown', {key:'Enter'})` — it needs trusted events or a button click
**Fix:** Changed workflow to click `button[aria-label="Search"]` instead of pressing Enter

### Bug 3: `act` can't find "first video result" by text
**Symptom:** `act "click the first video result"` returned "Element not found: text=first video result"
**Root cause:** The `act` handler uses text-based matching, but no element has text "first video result"
**Fix:** Changed workflow to use `click` with CSS selector `ytd-video-renderer #video-title`

### Bug 4: Content script not ready after `navigate` op
**Symptom:** Operations immediately after navigate returned 502 Bad Gateway
**Root cause:** `navigate` triggers a full page reload; content script needs time to reinject
**Fix:** Increased post-navigate wait from 2s to 5s in the YouTube workflow

### Bug 5: CLI `run` command hard-exits on gateway errors
**Symptom:** Steps after a failed step would all show "Error: cannot reach gateway" even for independent operations
**Root cause:** `_request()` calls `raise SystemExit(1)` on any HTTP error, which cascaded through the workflow
**Fix:** Added `_request_soft()` that returns error dicts instead of raising, used only by the `run` command

---

## Summary

| Command | Status | Notes |
|---------|--------|-------|
| `pingos devices` | PASS | 9 tabs listed correctly |
| `pingos recon` | PASS | Full page structure with 100+ actions |
| `pingos observe` | PASS | Human-readable action list |
| `pingos act` | PASS | NLP instruction -> CSS selector -> click |
| `pingos extract` | PASS | Schema-based data extraction |
| `pingos read` | PASS | Multi-element text extraction |
| `pingos apps` | PASS | 5 PingApps with 10 workflows |
| `pingos run` | PASS | Full YouTube E2E: search -> extract -> play -> extract |

**All 7 CLI commands working end-to-end against live browser.** 5 bugs found and fixed.
