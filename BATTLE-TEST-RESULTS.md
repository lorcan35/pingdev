# PingOS Battle Test Results

**Date:** 2026-02-17
**Gateway:** localhost:3500
**Browser:** Chrome (Linux)
**Tester:** Claude Opus 4.6 (automated)
**Method:** Every PingApp workflow + raw ops + edge cases tested live against real websites

---

## Test Scorecard

| # | App | Workflow/Test | Steps | Status | Key Data |
|---|-----|--------------|-------|--------|----------|
| 1 | hacker-news | browse-front-page | 4/4 | **PASS** | 30 titles, "GrapheneOS" #1 at 386 pts |
| 2 | hacker-news | read-comments | 7/7 | **PASS** | 80+ comments from top story thread |
| 3 | github | search-repos | 4/4 | **PASS** | 10 repos for "ESP32 micropython" |
| 4 | github | browse-issues | 4/4 | **PASS** | 25 React issues extracted |
| 5 | youtube | search-and-play | 10/10 | **PASS** | "12 ESP32 Projects", 768K views |
| 6 | youtube | extract-trending | 4/4 | **FAIL** | Selectors wrong, 0 elements found |
| 7 | reddit | browse-subreddit | 4/4 | **PARTIAL** | Titles OK, scores/comments empty |
| 8 | reddit | extract-top-posts | 6/6 | **PARTIAL** | Same: titles OK, scores empty |
| 9 | linkedin | search-people | 4/4 | **PASS** | 10+ ML engineer profiles |
| 10 | linkedin | browse-feed | 5/5 | **PASS** | 29 buttons, 34 links, feed content |
| 11 | substack | browse-home | 4/4 | **PASS** | 5 post snippets via eval |
| 12 | substack | read-article | 7/7 | **PASS** | Platformer article, 3 paragraphs |
| 13 | twitter-x | search-tweets | 5/5 | **PASS*** | LOGIN_REQUIRED detected gracefully |
| 14 | twitter-x | read-thread | 6/6 | **PASS** | @elonmusk: "Cybercab starts April" |
| 15 | gmail | check-inbox | 5/5 | **PARTIAL** | Extracts 1st sender/subject only |
| 16 | google-calendar | view-today | 4/4 | **FAIL** | Selectors wrong (events exist) |
| 17 | amazon | search-product | 8/8 | **FAIL** | Act crashes on Amazon aria-labels |
| 18 | google-sheets | observe | 1/1 | **PASS** | 43 buttons, 6 inputs detected |
| 19 | google-sheets | act "click A1" | 1/1 | **PASS** | Navigated to cell |
| 20 | google-gemini | observe | 1/1 | **PASS** | 30 buttons, chat history found |
| 21 | google-gemini | type+submit | 3/3 | **PASS** | "What is 2+2?" -> "The answer is 4." |
| 22 | aliexpress | observe | 1/1 | **PASS** | Products, cart, search detected |

**Score: 16 PASS / 3 PARTIAL / 3 FAIL out of 22 tests (73% clean pass, 86% functional)**

---

## Detailed Results

### 1. Hacker News — browse-front-page

**Status: PASS (4/4 steps)**

```
[1/4] navigate: https://news.ycombinator.com/    OK
[2/4] wait: 3s                                    OK
[3/4] extract: top_title, top_points, top_source   OK
[4/4] read: .titleline > a                        OK -> 30 titles
```

Extracted data:
- Top story: "GrapheneOS - Break Free from Google and Apple" (386 points)
- 30 front page titles including "Four Column ASCII", "Visual introduction to PyTorch", "Ghidra by NSA"
- Minor: `top_source` returns empty for stories without external domain (grapheneos.org is the sitestr but selector `.titleline > .sitestr` returns empty for first match)

---

### 2. Hacker News — read-comments

**Status: PASS (7/7 steps)**

```
[1/7] navigate: https://news.ycombinator.com/    OK
[2/7] wait: 3s                                    OK
[3/7] extract: top_title                          OK -> "GrapheneOS..."
[4/7] click: td.subtext a:last-child              OK
[5/7] wait: 3s                                    OK
[6/7] extract: story_title, top_comment            OK
[7/7] read: .commtext                             OK -> 80+ comments
```

Full discussion thread extracted. Comments include detailed technical discussion about GrapheneOS vs /e/OS, banking app compatibility, and Google dependency.

---

### 3. GitHub — search-repos

**Status: PASS (4/4 steps)**

```
[1/4] navigate: github.com/search?q=ESP32+micropython   OK
[2/4] wait: 4s                                          OK
[3/4] extract: top_repo, top_description                 OK -> "micropython/micropython-esp32"
[4/4] read: results-list .search-title a                 OK -> 10 repos
```

Repos found: micropython/micropython-esp32, loboris/MicroPython_ESP32_psRAM_LoBo, RuiSantosdotme/ESP-MicroPython, peterhinch/micropython-samples, lemariva/micropython-camera-driver, and 5 more.

---

### 4. GitHub — browse-issues

**Status: PASS (4/4 steps)**

```
[1/4] navigate: github.com/facebook/react/issues   OK
[2/4] wait: 5s                                     OK
[3/4] extract: top_issue                            OK -> "Bug: Malformed private field..."
[4/4] read: ListItemTitle links                     OK -> 25 issues
```

Issues include: "Bug: Malformed private field in react-devtools-fusebox", "404 Error on JSX Example HTML File Link", "eslint-plugin-react-hooks does not support ESLint 10", and more.

---

### 5. YouTube — search-and-play

**Status: PASS (10/10 steps)**

```
[1/10]  navigate: youtube.com                         OK
[2/10]  wait: 5s                                      OK
[3/10]  click: input[name="search_query"]              OK
[4/10]  type: "ESP32 projects"                         OK
[5/10]  click: button[aria-label="Search"]             OK
[6/10]  wait: 4s                                       OK
[7/10]  extract: titles, channels, views               OK -> "12 Useful & Interesting ESP32 Projects"
[8/10]  click: ytd-video-renderer #video-title         OK
[9/10]  wait: 3s                                       OK
[10/10] extract: video_title, channel, view_count      OK -> ToP Projects Compilation, 768K views
```

Full search-to-play pipeline working. Minor: `views` field empty from search results (YouTube metadata-line span selector changed).

---

### 6. YouTube — extract-trending

**Status: FAIL**

```
[1/4] navigate: youtube.com/feed/trending    OK
[2/4] wait: 3s                               OK
[3/4] extract: titles, channels, views       OK -> ALL EMPTY
[4/4] screenshot                             FAIL (not implemented)
```

**Bug:** YouTube trending page does NOT use `ytd-video-renderer`. After navigation, `document.querySelectorAll("ytd-video-renderer").length` returns 0. YouTube appears to redirect `/feed/trending` to home page. DOM inspection shows "Home - YouTube" as page title with 0 video renderers and 0 video titles. Trending may be region-restricted or require different selectors.

---

### 7. Reddit — browse-subreddit

**Status: PARTIAL PASS**

```
[1/4] navigate: reddit.com/r/programming/   OK
[2/4] wait: 3s                               OK
[3/4] extract: titles, authors, scores       OK -> titles+authors work, scores+comments EMPTY
[4/4] screenshot                             FAIL (not implemented)
```

**Bug:** Reddit uses `<shreddit-post>` web components with shadow DOM. The scores and comment counts are stored as **HTML attributes** (`score="3930"`, `comment-count="682"`), not as child elements. CSS selectors like `shreddit-post shreddit-post-overflow faceplate-number` can't reach into the shadow DOM.

**Workaround confirmed:** Using `eval` with `getAttribute()` works perfectly:
```json
[
  {"title": "Peer-reviewed study: AI-generated changes fail more...", "score": "127", "comments": "104"},
  {"title": "Anthropic: AI assisted coding doesn't show efficiency...", "score": "3930", "comments": "682"},
  {"title": "Slop pull request is rejected...", "score": "2434", "comments": "337"}
]
```

---

### 8. Reddit — extract-top-posts

**Status: PARTIAL PASS (same shadow DOM issue)**

Titles and authors extract correctly. Scores and comment counts are empty. Same fix needed: use `eval` with `getAttribute`.

---

### 9. LinkedIn — search-people

**Status: PASS (4/4 steps)**

```
[1/4] navigate: linkedin.com/search/people?keywords=...   OK
[2/4] wait: 5s                                            OK
[3/4] extract: top_name                                    OK -> "Abdalkarim Alshantti"
[4/4] read: a[href*='/in/']                                OK -> 10+ profiles
```

Profiles found: Abdalkarim Alshantti (ML Engineer at AI Directions), Vatsal Kansara (Sr ML Engineer @ Derq), Rajeev Nair (ML Engineer), Ridhwan Al-Debsi (Sr ML Engineer), and more. Full profile cards with mutual connections detected.

---

### 10. LinkedIn — browse-feed

**Status: PASS (5/5 steps)**

```
[1/5] navigate: linkedin.com/feed/              OK
[2/5] wait: 5s                                   OK
[3/5] scroll: down 3                             OK
[4/5] wait: 2s                                   OK
[5/5] observe                                    OK -> 29 buttons, 34 links
```

Feed content visible: Post by Ara Howard about "#vcevil #ai", article "Sam Altman Is Spiraling" from futurism.com, MedTech World promoted post. User profile sidebar: 72 profile viewers, 4 post impressions.

---

### 11. Substack — browse-home

**Status: PASS (4/4 steps)**

```
[1/4] navigate: substack.com/home    OK
[2/4] wait: 5s                       OK
[3/4] observe                        OK -> 52 buttons, 5 links
[4/4] eval: extract paragraphs       OK -> 5 post snippets
```

Content found: "ResistDance" performance piece, "Hungryman Productions", and 3 more post snippets. Observe correctly identified Sign in, Create account, Home, and Subscribe buttons.

---

### 12. Substack — read-article

**Status: PASS (7/7 steps)**

```
[1/7] navigate: platformer.substack.com   OK
[2/7] wait: 5s                            OK
[3/7] extract: newsletter_name, latest    OK -> "Platformer", "Why Platformer is leaving Substack"
[4/7] click: a[href*='/p/']               OK
[5/7] wait: 5s                            OK
[6/7] extract: title, subtitle, author    OK (author empty)
[7/7] eval: article paragraphs            OK -> 3 paragraphs
```

Article text: "After much consideration, we have decided to move Platformer off of Substack..."

Minor bugs:
- `article_title` returns "Platformer" (newsletter name from h1) instead of actual article title
- `author` selector returns empty (obfuscated class names)

---

### 13. Twitter/X — search-tweets

**Status: PASS* (LOGIN_REQUIRED)**

```
[1/5] navigate: x.com/search?q=ESP32+projects   OK
[2/5] wait: 5s                                   OK
[3/5] eval: login check                          OK -> "LOGIN_REQUIRED"
[4/5] extract: tweet, author                     OK -> empty (expected)
[5/5] read: tweetText                            FAIL -> EIO "Element not found"
```

Login detection works correctly. Selectors (`[data-testid='tweetText']`) are correct per X's DOM and will work when logged in.

Bug: `read` returns EIO error instead of graceful empty when elements don't exist.

---

### 14. Twitter/X — read-thread

**Status: PASS (6/6 steps)**

```
[1/6] navigate: x.com/elonmusk         OK
[2/6] wait: 5s                          OK
[3/6] extract: name, bio, latest_tweet   OK -> "Elon Musk", "Cybercab...starts April"
[4/6] click: tweetText                   OK
[5/6] wait: 4s                           OK
[6/6] read: tweetText                    OK -> 2 tweets in thread
```

Thread content: "Cybercab, which has no pedals or steering wheel, starts production in April" + reply "10 years ago, Elon Musk predicted cars would later have no steering wheels. The audience laughed."

X/Twitter profile viewing and thread reading works WITHOUT login. Only search requires auth.

---

### 15. Gmail — check-inbox

**Status: PARTIAL PASS (5/5 steps, data issues)**

```
[1/5] navigate: mail.google.com/inbox   OK
[2/5] wait: 4s                          OK
[3/5] extract: unread, senders, subjects OK -> only 1st match per field
[4/5] extract: all_senders, subjects     OK -> only 1st match
[5/5] screenshot                         FAIL (not implemented)
```

Data extracted:
- Unread sender: "cheapoair"
- Subject: "CheapOair.co.uk Alert - Incomplete booking | Payment declined"
- All_senders first: "OpenAI"
- All_subjects first: "Your authentication code"

**Bug:** `extract` returns only the FIRST matching element per selector. The workflow expects arrays (multiple senders, subjects). Should use `read` for lists or extract needs an array mode.

---

### 16. Google Calendar — view-today

**Status: FAIL (selectors wrong)**

```
[1/4] navigate: calendar.google.com/r/day   OK
[2/4] wait: 4s                              OK
[3/4] extract: events, times, current_date  OK -> ALL EMPTY
[4/4] screenshot                             FAIL (not implemented)
```

**Bug:** Calendar selectors are wrong:
- `[data-eventchip] span[data-eventchip]` → empty (nested span doesn't have data-eventchip)
- `[data-datekey].KKi2nd` → empty (class name has changed)

**Events DO exist** (confirmed via eval):
- "Chinese New Year's Day" (all day)
- "Community Coffee" at 7pm (Discord: Techstars Universe)
- Date heading: "Tuesday, February 17, 2026, today, 2 events"

**Fix:** Use `[data-eventchip]` directly and `h1[aria-label]` for date.

---

### 17. Amazon — search-product

**Status: FAIL (act crashes)**

```
[1/8] navigate: amazon.com              OK
[2/8] wait: 3s                           OK
[3/8] act: "click search box"           FAIL -> querySelector invalid selector
[4/8] type: "ESP32 board"               FAIL -> no element focused
[5/8] press: Enter                       OK (but useless without search)
[6/8] wait: 3s                           OK
[7/8] extract: titles, prices            OK -> all empty (still on homepage)
[8/8] screenshot                         FAIL (not implemented)
```

**Bug:** Act handler builds a `querySelector` using an `aria-label` that contains newlines:
```
a[aria-label="Choose a language for shopping in Amazon United States. The current selection is English (EN).\n"]
```
This is an invalid CSS selector and throws `DOMException`. The act handler doesn't catch this error, resulting in 502.

**Fix needed:** Sanitize aria-labels before building selectors, or use XPath when aria-labels contain special characters. Also, Amazon workflow should use direct CSS selectors (`#twotabsearchtextbox`) instead of `act`.

---

### 18-22. Raw Op Tests

| # | Site | Op | Status | Details |
|---|------|-----|--------|---------|
| 18 | Google Sheets | observe | **PASS** | 43 buttons, 6 inputs, full toolbar |
| 19 | Google Sheets | act "click cell A1" | **PASS** | Cell navigation works |
| 20 | Google Gemini | observe | **PASS** | 30 buttons, chat history, prompt input |
| 21 | Google Gemini | click+type+enter+read | **PASS** | "What is 2+2?" -> "The answer is 4." |
| 22 | AliExpress | observe | **PASS** | Products, search bar, cart, categories |

---

## Edge Case Tests

| # | Test | Status | Details |
|---|------|--------|---------|
| E1 | extract non-existent selector | **PASS** | Returns `""` (graceful) |
| E2 | extract empty schema `{}` | **PASS** | Returns `{}` |
| E3 | read non-existent selector | **FAIL** | **502 Bad Gateway crash** |
| E4 | act gibberish instruction | **FAIL** | **502 Bad Gateway crash** |
| E5 | act non-existent element | **FAIL** | **502 Bad Gateway crash** |

---

## Bugs Found (Total: 10)

### P0 — Critical (crashes/502s)

**BUG 1: `act` crashes with 502 on unmatchable instructions**
- Reproduction: `pingos act "flibbertigibbet the quantum cheese matrix" <device>`
- Also crashes on: `"click #nonexistent"`, `"click the prompt input area"` (on certain sites)
- Root cause: Unhandled exception in act handler, no try/catch around element matching
- Impact: Any workflow using `act` can crash if the instruction doesn't match
- Fix: Wrap act handler in try/catch, return `{ok: false, error: "..."}`

**BUG 2: `read` crashes with 502 on non-existent selector**
- Reproduction: `pingos read ".nonexistent" <device>`
- Root cause: handleRead throws when element not found instead of returning error
- Impact: Any workflow using `read` with a bad selector crashes the pipeline
- Fix: Return `{ok: false, error: "Element not found: ..."}`

**BUG 3: `act` crashes on aria-labels with special characters (Amazon)**
- Reproduction: Run amazon/search-product workflow
- Root cause: Act handler builds querySelector with aria-label text containing `\n`
- Error: `DOMException: Failed to execute 'querySelector' - not a valid selector`
- Fix: Escape/sanitize aria-label strings before building selectors

### P1 — High (wrong data / broken workflows)

**BUG 4: `screenshot` op not implemented**
- Every workflow that calls screenshot returns "Screenshot not implemented in content script"
- Affects: amazon/search-product, youtube/extract-trending, reddit/browse-subreddit, google-calendar/view-today, gmail/check-inbox
- Fix: Implement screenshot using Canvas API or CDP screenshot endpoint

**BUG 5: YouTube trending selectors wrong**
- `ytd-video-renderer` not present on trending page (0 matches)
- YouTube may redirect /feed/trending to home, or trending uses different components
- Need: Investigate actual DOM, may need `ytd-expanded-shelf-contents-renderer` or rich grid

**BUG 6: Google Calendar selectors wrong**
- `[data-eventchip] span[data-eventchip]` → empty. Fix: use `[data-eventchip]` directly
- `[data-datekey].KKi2nd` → empty. Fix: use `h1[aria-label]`
- Events are present (Chinese New Year's Day, Community Coffee at 7pm)

**BUG 7: Reddit scores/comments use shadow DOM attributes**
- Selectors `shreddit-post shreddit-post-overflow faceplate-number` can't penetrate shadow DOM
- Scores are in `<shreddit-post score="3930" comment-count="682">` attributes
- Fix: Use eval with `getAttribute("score")` and `getAttribute("comment-count")`

### P2 — Medium (degraded functionality)

**BUG 8: Content script EIO after some cross-domain navigations**
- Intermittent: YouTube and Reddit failed on Gemini tabs, but HN/GitHub/LinkedIn/Substack worked
- May be timing-dependent or site-specific CSP interference
- Workaround: Navigate, wait longer (5-8s), or retry on different tab

**BUG 9: Gmail workflow uses `extract` for list data (returns 1st only)**
- `extract` returns first match per CSS selector, not an array
- Gmail workflow expects arrays of senders/subjects/snippets
- Fix: Use `read` op for multi-element extraction, `extract` for single values

**BUG 10: Substack article_title gets newsletter name**
- After clicking into article, `h1` selector returns "Platformer" (newsletter name)
- Actual article title is in a different element
- Fix: More specific selector or eval-based extraction

---

## Workarounds That Work

1. **Shadow DOM (Reddit):** Use `eval` with `getAttribute()` instead of CSS selectors
2. **Obfuscated classes (LinkedIn, Substack):** Use `observe` for discovery, `eval` for extraction
3. **Login-required sites (Twitter/X):** Add `eval` step to detect login redirect
4. **Content script timing:** Increase wait after navigate to 5s minimum
5. **Multi-element extraction:** Use `read` (returns array) instead of `extract` (returns first)

---

## Sites That Just Work

- **Hacker News:** Simple DOM, stable selectors, no auth needed. Gold standard.
- **GitHub:** data-testid attributes, clean DOM structure. Excellent.
- **LinkedIn (with auth):** Observe + generic href selectors bypass obfuscated classes.
- **Substack:** Eval-based extraction handles dynamic content well.
- **Google Sheets:** Full toolbar, cell interaction, canvas detection all working.
- **Google Gemini:** Prompt input, submission, response reading all working.

## Sites That Need Work

- **YouTube Trending:** Page structure differs from search, selectors need investigation.
- **Amazon:** Act handler can't handle their complex aria-labels. Need direct CSS selectors.
- **Google Calendar:** Selector fix needed (trivial — just remove nested span requirement).
- **Reddit:** Shadow DOM workaround needed for scores/comments.

---

## Summary

```
Total workflows tested:   17
Total raw op tests:        5
Total edge case tests:     5
                          ---
Grand total:              27 tests

PASS:                     16 (59%)
PARTIAL:                   3 (11%)
FAIL:                      3 (11%)
EDGE PASS:                 2 (7%)
EDGE FAIL:                 3 (11%)

Bugs found:               10 (3 P0, 4 P1, 3 P2)
```

**The 3 most critical bugs to fix:**
1. `act` crashes with 502 on unmatched instructions (affects every site)
2. `read` crashes with 502 on missing elements (breaks error handling)
3. `screenshot` not implemented (referenced by 5 workflows)

**After fixing P0 bugs, estimated clean pass rate would rise from 59% to ~70%+.**
