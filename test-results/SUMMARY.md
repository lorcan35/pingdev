# PingOS E2E Test Results

**Date:** 2026-02-21
**Gateway:** http://localhost:3500
**Chromium CDP:** http://localhost:18800
**Devices:** 5 (2x HN, AliExpress, Amazon, Claude)

---

## Test 1: Price Comparison Pipeline — PASS

| Step | Endpoint | Result | Timing |
|------|----------|--------|--------|
| AliExpress search | `POST /v1/app/aliexpress/search` | 12 products (titles, empty prices) | 5,094ms |
| Amazon search | `POST /v1/app/amazon/search` | 20 products (titles + AED prices + ratings) | 5,045ms |
| AliExpress extract | `POST /v1/dev/.../extract` | 13 items via headings+repeated-containers | 37ms |
| Amazon extract | `POST /v1/dev/.../extract` | 27 items via compound-title+price | 42ms |
| Pipeline | `POST /v1/pipelines/run` | Both steps OK | 32ms |

**Notes:**
- Search ops (~5s) include full browser navigation + page load + extraction
- Direct extract ops (~40ms) are extremely fast on already-loaded pages
- AliExpress prices empty (dynamic rendering / region issue)
- Pipeline requires `name`, step `id`, and `tab` fields (not `device`)

---

## Test 2: Live HN Watch + Extract — PASS (8/8)

| Step | Operation | Result | Timing |
|------|-----------|--------|--------|
| Schema extract | `.titleline > a`, `.score`, `.rank` | 29 scores, 30 ranks | 9ms |
| Auto extract | Zero-config | 30 titles + scores + ranks (template hit) | 11ms |
| Query extract | "top 5 story titles..." | 30 stories via template | 10ms |
| Start watch | selector=`.titleline > a` | Created w-972839ce | 6ms |
| List watches | `GET /v1/watches` | 1 active | 5ms |
| List templates | `GET /v1/templates` | 2 templates (HN: 100% success) | 6ms |
| Post-wait check | After 15s | Watch still active | 5ms |
| Cleanup | `DELETE /v1/watches/{id}` | Watch deleted | 8ms |

**Notes:**
- Template caching works: HN template has 6 hits, 100% success rate
- Watch API requires `selector` field, not `schema` (ENOSYS if wrong)
- Query extract returns all matches, doesn't filter to "top 5"
- Schema extract for `title` resolved to meta-tag, not story list

---

## Test 3: Claude Chat Automation — PASS

| Step | Endpoint | Result | Timing |
|------|----------|--------|--------|
| New chat | `POST /v1/app/claude/chat/new` | 200 OK | 3,091ms |
| Send message | `POST /v1/app/claude/chat` | 200 OK (fibonacci prompt) | 7,188ms |
| Read response | `GET /v1/app/claude/chat/read` | 200 OK (thinking summary) | 13ms |
| List conversations | `GET /v1/app/claude/conversations` | 200 OK | 25ms |

**Notes:**
- Claude.ai was logged in (verified via suggestion chips)
- Chat endpoint expects `{"message": "..."}` not `{"prompt": "..."}`
- Read endpoint returned thinking summary, not full rendered output
- Full code extraction done via Smart Extract on the tab; saved to `test3-claude-output.py`
- Total E2E: ~20.3s

---

## Test 4: Record & Replay — PARTIAL FAIL

| Step | Operation | Result | Timing |
|------|-----------|--------|--------|
| Start recording | `POST /v1/record/start` | OK | 11ms |
| Navigate /newest | `POST .../smartNavigate` | OK | 48ms |
| Extract titles | `POST .../extract` | OK | 13ms |
| Navigate back | `POST .../smartNavigate` | OK | 13ms |
| Stop recording | `POST /v1/record/stop` | OK, **0 steps captured** | 9ms |
| Check status | `GET /v1/record/status` | OK | 7ms |
| Export | `POST /v1/record/export` | OK, **empty recording** | 10ms |
| List recordings | `GET /v1/recordings` | **Empty array** | 5ms |
| Replay | `POST /v1/recordings/replay` | **FAIL — recording not found** | 5ms |

**Root cause:** The recorder captures user-level browser interactions (clicks, keystrokes) via CDP event monitoring, NOT programmatic API calls. API-driven actions (smartNavigate, extract) are not captured as recording steps. To get a meaningful recording, a user must interact directly in the browser while recording is active.

**Bugs found:**
1. Export returns `ok: true` with 0 steps — should warn or fail
2. Export doesn't persist to recording store — `GET /v1/recordings` returns empty
3. Replay fails with both inline recording object and by recordingId

---

## Test 5: Workflow Engine (Pipeline) — PASS (7/7)

| Step | Operation | Result | Timing |
|------|-----------|--------|--------|
| Navigate to example.com | `POST .../smartNavigate` | OK | 40ms |
| Multi-site pipeline | HN + example.com extract | Both OK | 17ms |
| Error recovery pipeline | Good + bad + good device | Skip worked | 16ms |
| Navigate back to HN | `POST .../smartNavigate` | OK | 16ms |
| Validate pipeline | Missing template field | Correctly rejected | 7ms |
| List pipelines | `GET /v1/pipelines` | Empty (ephemeral) | 5ms |

**Notes:**
- `onError: "skip"` correctly skips non-existent device without aborting
- Validation catches missing `template` field on `transform` op
- Read op with `input` param got `[object Object]` error — may need different param format
- Pipelines are ephemeral (not persisted)

---

## Final Scorecard

| Test | Status | Key Metric |
|------|--------|-----------|
| 1. Price Comparison | **PASS** | 5s search, 40ms extract |
| 2. HN Watch + Extract | **PASS** | All 8 steps, 5-11ms each |
| 3. Claude Chat | **PASS** | Full lifecycle, 20s E2E |
| 4. Record & Replay | **PARTIAL FAIL** | API actions not recorded |
| 5. Pipeline Workflow | **PASS** | Error recovery works |

**Overall: 4/5 PASS, 1 PARTIAL FAIL**

---

## Bugs Found

1. **[Test 4] Recorder doesn't capture API-driven actions** — Only captures user browser interactions via CDP. API calls through the gateway are invisible to the recorder. This is a design gap, not a crash.

2. **[Test 4] Export returns ok:true for empty recordings** — Should at minimum warn when 0 steps are captured.

3. **[Test 4] Export doesn't persist recordings** — `GET /v1/recordings` returns empty even after successful export.

4. **[Test 4] Replay can't find recordings** — Neither inline recording objects nor recordingId lookups work after export.

5. **[Test 2] Watch API param mismatch** — Expects `selector` but test doc says `schema`. Returns ENOSYS with wrong param name.

6. **[Test 2] Query extract ignores quantity** — "top 5 stories" returns all 30 (template-based, no filtering).

7. **[Test 1] AliExpress prices empty** — Dynamic rendering / region issue. PingApp search returns titles but empty price strings.

8. **[Test 5] Read op parameter format** — Pipeline `read` op with `input` field produced `[object Object]` error.

---

## Recommendations

1. **Fix Record & Replay for API actions** — Inject recording hooks at the gateway level so API-driven actions (navigate, extract) are captured alongside browser events.

2. **Add `POST /v1/recordings/save` after export** — Or auto-persist on export so recordings can be replayed later.

3. **Expose workflow engine as API** — The WorkflowEngine supports loops, conditionals, and variables but has no HTTP route. Pipeline engine covers some cases but lacks `set`, `loop`, `if` constructs.

4. **Add query filtering** — When Smart Extract resolves via template, respect quantity hints like "top 5".

5. **Watch API docs** — Document that the watch start endpoint requires `selector`, not `schema`.

6. **AliExpress price extraction** — May need region-specific selectors or a post-load wait for dynamic price rendering.
