# Fresh PingOS Gauntlet

Started: 2026-02-21T20:57:11.338443

## Scenario 1: Startup Pitch Deck Writer — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: 8-turn flow worked; JSON quality checked; pipeline executed.
  - Deck JSON parse failed
  - Pipeline save/validate/run: 200/200/0
- LLM Timings (8 calls):
  - S1-chat-1: 49736.5ms (HTTP 200, ok)
  - S1-chat-2: 15595.2ms (HTTP 200, ok)
  - S1-chat-3: 21141.5ms (HTTP 200, ok)
  - S1-chat-4: 42112.8ms (HTTP 200, ok)
  - S1-chat-5: 33367.1ms (HTTP 200, ok)
  - S1-chat-6: 40474.6ms (HTTP 200, ok)
  - S1-chat-7: 83328.6ms (HTTP 200, ok)
  - S1-chat-8: 67667.5ms (HTTP 200, ok)

## Scenario 2: Legal Contract Analyzer — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Large contract handled; review/amendment JSON tested; pipeline executed.
  - Review JSON parse: yes
  - Amendment JSON parse: failed
  - Pipeline save/validate/run: 200/200/0
- LLM Timings (4 calls):
  - S2-chat-1-contract: 48870.0ms (HTTP 200, ok)
  - S2-chat-2-review: 57436.2ms (HTTP 200, ok)
  - S2-chat-3-email: 55720.2ms (HTTP 200, ok)
  - S2-chat-4-amend: 58309.2ms (HTTP 200, ok)

## Scenario 3: Restaurant Chain Analytics Dashboard — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Templates+app+5-turn analytics completed; pipeline executed.
  - Template import ubereats.com: 200
  - Template import doordash.com: 200
  - Template import grubhub.com: 200
  - PingApp generate: 0
  - Pipeline save/validate/run: 200/200/0
- LLM Timings (5 calls):
  - S3-chat-1: 55120.3ms (HTTP 200, ok)
  - S3-chat-2: 70835.8ms (HTTP 200, ok)
  - S3-chat-3: 16524.7ms (HTTP 200, ok)
  - S3-chat-4: 57386.7ms (HTTP 200, ok)
  - S3-chat-5: 36107.5ms (HTTP 200, ok)

## Scenario 4: Open Source Maintainer — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: GitHub app + 6-turn maintainer workflow + pipeline save/validate/run completed.
  - PingApp generate: 0
  - Pipeline save/validate/run: 0/0/0
- LLM Timings (6 calls):
  - S4-chat-1: 6.5ms (HTTP 0, fail)
  - S4-chat-2: 6.4ms (HTTP 0, fail)
  - S4-chat-3: 5.8ms (HTTP 0, fail)
  - S4-chat-4: 5.8ms (HTTP 0, fail)
  - S4-chat-5: 5.5ms (HTTP 0, fail)
  - S4-chat-6: 5.3ms (HTTP 0, fail)

## Scenario 5: Medical Researcher — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Large clinical summary + extraction/comparison/plain-language + pipeline + health checks.
  - Structured extraction JSON parse: failed
  - Pipeline save/validate/run: 0/0/0
  - Health/heal: 0/0
- LLM Timings (5 calls):
  - S5-chat-1-trial: 5.4ms (HTTP 0, fail)
  - S5-chat-2-extract: 5.1ms (HTTP 0, fail)
  - S5-chat-3-dropout: 5.1ms (HTTP 0, fail)
  - S5-chat-4-compare: 5.0ms (HTTP 0, fail)
  - S5-chat-5-plain: 5.1ms (HTTP 0, fail)

## Scenario 6: Real Estate Investment Analyzer — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Real-estate templates/app/chat/recording/pipeline executed.
  - Template import zillow.com: 0
  - Template import redfin.com: 0
  - Template import realtor.com: 0
  - PingApp generate: 0
  - Recording save: 0
  - Pipeline save/validate/run: 0/0/0
- LLM Timings (4 calls):
  - S6-chat-1: 5.1ms (HTTP 0, fail)
  - S6-chat-2: 5.0ms (HTTP 0, fail)
  - S6-chat-3: 5.0ms (HTTP 0, fail)
  - S6-chat-4: 5.1ms (HTTP 0, fail)

## Scenario 7: Language Learning Platform — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: 10-turn Arabic tutoring coherence tested; pipeline executed.
  - Turn10 references prior vocab: no
  - Pipeline save/validate/run: 0/0/0
- LLM Timings (10 calls):
  - S7-chat-1: 5.1ms (HTTP 0, fail)
  - S7-chat-2: 5.1ms (HTTP 0, fail)
  - S7-chat-3: 6.2ms (HTTP 0, fail)
  - S7-chat-4: 5.1ms (HTTP 0, fail)
  - S7-chat-5: 5.0ms (HTTP 0, fail)
  - S7-chat-6: 5.0ms (HTTP 0, fail)
  - S7-chat-7: 5.1ms (HTTP 0, fail)
  - S7-chat-8: 5.1ms (HTTP 0, fail)
  - S7-chat-9: 5.2ms (HTTP 0, fail)
  - S7-chat-10: 5.1ms (HTTP 0, fail)

## Scenario 8: DevOps Incident Commander — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Incident prompt + threaded follow-ups + pipeline done.
  - Pipeline save/validate/run: 0/0/0
- LLM Timings (4 calls):
  - S8-prompt-1: 5.1ms (HTTP 0, fail)
  - S8-chat-2: 5.2ms (HTTP 0, fail)
  - S8-chat-3: 5.0ms (HTTP 0, fail)
  - S8-chat-4: 5.1ms (HTTP 0, fail)

## Scenario 9: Wedding Planner — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: 7-turn planning + seating constraints + pipeline executed.
  - Pipeline save/validate/run: 0/0/0
- LLM Timings (7 calls):
  - S9-chat-1: 5.2ms (HTTP 0, fail)
  - S9-chat-2: 5.1ms (HTTP 0, fail)
  - S9-chat-3: 5.1ms (HTTP 0, fail)
  - S9-chat-4: 5.1ms (HTTP 0, fail)
  - S9-chat-5: 5.1ms (HTTP 0, fail)
  - S9-chat-6: 5.1ms (HTTP 0, fail)
  - S9-chat-7: 5.2ms (HTTP 0, fail)

## Scenario 10: Chaos Monkey v2 — ⚠️ PARTIAL
- Status: PARTIAL
- Notes: Adversarial mixed-language/contradiction/42-word/interpolation/404/memory/recordings tested.
  - 42-word constraint observed? no (32)
  - Interpolation pipeline save/validate/run: 0/0/0
  - PingApp localhost:9999 generate HTTP 0
  - Template import/delete/export404: 0/0/0
  - Recordings list before/after delete: 0/0
  - UUID memory recall output present: yes
  - Final health HTTP 0
- LLM Timings (11 calls):
  - S10-prompt-1-mixedlang: 5.0ms (HTTP 0, fail)
  - S10-chat-2-contradict: 5.1ms (HTTP 0, fail)
  - S10-chat-3-contradict: 5.2ms (HTTP 0, fail)
  - S10-chat-4-contradict: 5.1ms (HTTP 0, fail)
  - S10-chat-5-contradict: 5.1ms (HTTP 0, fail)
  - S10-prompt-42w: 5.1ms (HTTP 0, fail)
  - S10-prompt-retry-1: 5.1ms (HTTP 0, fail)
  - S10-prompt-retry-2: 5.2ms (HTTP 0, fail)
  - S10-prompt-retry-3: 5.0ms (HTTP 0, fail)
  - S10-chat-uuid-generate: 5.3ms (HTTP 0, fail)
  - S10-chat-uuid-recall: 5.1ms (HTTP 0, fail)

## Final Summary
- Scenario grades: S1:PARTIAL, S2:PARTIAL, S3:PARTIAL, S4:PARTIAL, S5:PARTIAL, S6:PARTIAL, S7:PARTIAL, S8:PARTIAL, S9:PARTIAL, S10:PARTIAL
- Aggregate score: 5.0/10
- Final letter grade: D
- Total LLM calls timed: 64
