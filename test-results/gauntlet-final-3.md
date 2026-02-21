# Gauntlet Final 3 — Retest Results
**Date:** 2026-02-21 21:44 GMT+4

---

## Test 3 — Generate PingApp → List Apps → Get Functions → Function Call

| Step | Endpoint | Status | Notes |
|------|----------|--------|-------|
| 1. Generate App | POST /v1/apps/generate | ✅ 200 | App created: `news-app` with 6 functions |
| 2. List Apps | GET /v1/apps | ✅ 200 | Route `/v1/dev/apps` = 404, but `/v1/apps` = 200. Apps listed: aliexpress, amazon, claude |
| 3. Get Functions | GET /v1/dev/functions/news-app | ✅ 200 | 6 functions returned: navigate, extract, screenshot, open_homepage, view_newest, upvote_current_story |
| 4. Function Call | POST /v1/dev/functions/call | ✅ 200 | Called `news-app.navigate` with url param. Required both `app` and `function` fields. |

**Grade: ✅ PASS** — All 4 steps returned 200 (step 2 needed `/v1/apps` not `/v1/dev/apps`)

---

## Test 7 — Token Bomb + Structured Output

| Step | Result | Notes |
|------|--------|-------|
| 1. POST /v1/dev/llm/prompt | ✅ 200 | Response received in 9.5s, model: nvidia-nemotron-3-nano |
| 2. Parse JSON | ✅ Valid JSON | `{"entities":[{"name":"...","type":"...","relevance":1}]}` |
| 3. Validation | ❌ FAIL | Only 1 entity (need 5), values are placeholders ("...") not real entities |

**Raw response.text:** `{"entities":[{"name":"...","type":"...","relevance":1}]}`

**Grade: ❌ FAIL** — Valid JSON but only 1 entity with placeholder values. Model (nemotron-3-nano) echoed the template format instead of extracting real entities.

---

## Test 15 — Chat Context Window: 30-Turn Conversation + Recall

| Step | Result | Notes |
|------|--------|-------|
| 1. Seed token msg | ✅ 200 | conversation_id: `bbbff956-8ce3-462a-8023-d7f482d1ff51`, model responded "OK" |
| 2. 28 filler turns | ✅ All 200 | Turns 2-29 sent successfully (batched: 1-12, 13-20, 21-28) |
| 3. Final recall | ✅ 200 | 25,252 prompt tokens, 101s duration |
| 4. Token check | ✅ Found | Response: "The seed token you initially asked me to remember was: **QUANTUM‑7749**" |

**Grade: ✅ PASS** — Token QUANTUM-7749 successfully recalled after 30 turns (25K+ context tokens).

---

## Summary

| Test | Grade | Notes |
|------|-------|-------|
| Test 3 — App Generate/List/Functions/Call | ✅ PASS | All endpoints 200 |
| Test 7 — Token Bomb + Structured Output | ❌ FAIL | Model returned template placeholders, not real entities |
| Test 15 — Chat 30-Turn Recall | ✅ PASS | Token recalled after 30 turns |

**2/3 PASS, 1/3 FAIL**
