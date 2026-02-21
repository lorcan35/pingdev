# PingOS Real-World Gauntlet v2

Started: 2026-02-21T19:41:10+04:00
Target: - `http://localhost:3500`
- LLM timeout: 180s
- Non-LLM timeout: 30s

## Scenario 1: The Competitive Intel Analyst

### Call Log
- `apps/generate` → HTTP 200 | 24.787936s | OK
- `apps/generate` → HTTP 200 | 30.277157s | OK
- `apps/generate` → HTTP 200 | 26.550626s | OK
- `templates/import` → HTTP 200 | 0.000935s | OK
- `templates/import` → HTTP 200 | 0.000860s | OK
- `templates/import` → HTTP 200 | 0.000569s | OK
- `pipelines/save` → HTTP 200 | 0.000295s | OK
- `pipelines/run` → HTTP 200 | 23.069041s | OK
- `llm/chat` → HTTP 200 | 15.938132s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

## Scenario 2: The E-Commerce Price Tracker

### Call Log
- `templates/import` → HTTP 200 | 0.000828s | OK
- `templates/import` → HTTP 200 | 0.001088s | OK
- `apps/generate` → HTTP 200 | 21.627668s | OK
- `recordings/save` → HTTP 200 | 0.000924s | OK
- `pipelines/validate` → HTTP 200 | 0.000643s | OK
- `pipelines/run` → HTTP 200 | 37.379121s | OK
- `llm/chat` → HTTP 200 | 30.643449s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

---
Checkpoint persisted after Scenario 2 at 2026-02-21T19:44:40+04:00
---

## Scenario 3: The Content Marketing Machine

### Call Log
- `llm/chat` → HTTP 200 | 14.551717s | OK
- `llm/chat` → HTTP 200 | 9.434931s | OK
- `llm/chat` → HTTP 200 | 21.566468s | OK
- `llm/chat` → HTTP 200 | 8.465708s | OK
- `llm/chat` → HTTP 200 | 28.480565s | OK
- `llm/chat` → HTTP 200 | 12.056558s | OK
- `llm/chat` → HTTP 200 | 13.600615s | OK
- `pipelines/save` → HTTP 200 | 0.001018s | OK
- `pipelines/run` → HTTP  | s | ERR | snippet: ` `

### Grades
- Functional: PARTIAL
- Quality: PARTIAL
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ⚠️ PARTIAL

## Scenario 4: The Security Researcher

### Call Log
- `apps/generate` → HTTP 200 | 39.057525s | OK
- `templates/import` → HTTP 200 | 0.001022s | OK
- `llm/chat` → HTTP 200 | 21.466250s | OK
- `llm/chat` → HTTP 200 | 23.652002s | OK
- `pipelines/validate` → HTTP 200 | 0.000719s | OK
- `pipelines/run` → HTTP 200 | 73.733859s | OK
- `heal/cache` → HTTP 200 | 0.000492s | OK
- `heal/stats` → HTTP 200 | 0.000412s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

---
Checkpoint persisted after Scenario 4 at 2026-02-21T19:52:06+04:00
---

## Scenario 5: The Data Pipeline Builder

### Call Log
- `pipelines/save` → HTTP 200 | 0.000482s | OK
- `pipelines/save` → HTTP 200 | 0.000387s | OK
- `pipelines/save` → HTTP 200 | 0.000891s | OK
- `pipelines/save` → HTTP 200 | 0.000308s | OK
- `pipelines/save` → HTTP 200 | 0.000847s | OK
- `pipelines/list` → HTTP 200 | 0.000559s | OK
- `pipelines/validate` → HTTP 200 | 0.000699s | OK
- `pipelines/validate` → HTTP 200 | 0.000719s | OK
- `pipelines/validate` → HTTP 200 | 0.000593s | OK
- `pipelines/validate` → HTTP 200 | 0.000811s | OK
- `pipelines/validate` → HTTP 200 | 0.000584s | OK
- `pipelines/run` → HTTP 200 | 87.501320s | OK
- `pipelines/run` → HTTP 200 | 15.812955s | OK
- `pipelines/run` → HTTP 200 | 107.809152s | OK
- `llm/chat` → HTTP 200 | 56.479673s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

## Scenario 6: The Recruiter's Toolkit

### Call Log
- `templates/import` → HTTP 200 | 0.000864s | OK
- `templates/import` → HTTP 200 | 0.000934s | OK
- `apps/generate` → HTTP 200 | 17.897345s | OK
- `llm/chat` → HTTP 200 | 56.476315s | OK
- `llm/chat` → HTTP 200 | 26.263346s | OK
- `llm/chat` → HTTP 200 | 23.070344s | OK
- `llm/chat` → HTTP 200 | 21.433935s | OK
- `llm/chat` → HTTP 200 | 21.816181s | OK
- `pipelines/save` → HTTP 200 | 0.000773s | OK
- `pipelines/run` → HTTP 200 | 68.083379s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

---
Checkpoint persisted after Scenario 6 at 2026-02-21T20:00:30+04:00
---

## Scenario 7: The Stress Monster

### Call Log
- `llm/prompt(concurrent-2)` → HTTP 200 | 6.330725s | OK
- `llm/prompt(concurrent-7)` → HTTP 200 | 13.058301s | OK
- `llm/prompt(concurrent-1)` → HTTP 200 | 23.147961s | OK
- `llm/prompt(concurrent-13)` → HTTP 200 | 35.764393s | OK
- `llm/prompt(concurrent-11)` → HTTP 200 | 44.834714s | OK
- `llm/prompt(concurrent-4)` → HTTP 200 | 53.281161s | OK
- `llm/prompt(concurrent-9)` → HTTP 200 | 61.302629s | OK
- `llm/prompt(concurrent-8)` → HTTP 200 | 69.541389s | OK
- `llm/prompt(concurrent-6)` → HTTP 200 | 80.887945s | OK
- `llm/prompt(concurrent-5)` → HTTP 200 | 87.634210s | OK
- `llm/prompt(concurrent-12)` → HTTP 200 | 98.194058s | OK
- `llm/prompt(concurrent-3)` → HTTP 200 | 104.905141s | OK
- `llm/prompt(concurrent-14)` → HTTP 200 | 111.276632s | OK
- `llm/prompt(concurrent-10)` → HTTP 200 | 119.029810s | OK
- `llm/prompt(concurrent-15)` → HTTP 200 | 126.818313s | OK
- `llm/chat` → HTTP 200 | 6.395438s | OK
- `llm/chat` → HTTP 200 | 5.841662s | OK
- `llm/chat` → HTTP 200 | 8.198628s | OK
- `llm/chat` → HTTP 200 | 8.536401s | OK
- `llm/chat` → HTTP 200 | 10.540097s | OK
- `pipelines/validate(concurrent-1)` → HTTP 200 | 0.000737s | OK
- `pipelines/validate(concurrent-2)` → HTTP 200 | 0.000439s | OK
- `pipelines/validate(concurrent-3)` → HTTP 200 | 0.000363s | OK
- `pipelines/validate(concurrent-4)` → HTTP 200 | 0.000345s | OK
- `pipelines/validate(concurrent-5)` → HTTP 200 | 0.000358s | OK
- `pipelines/validate(concurrent-6)` → HTTP 200 | 0.000753s | OK
- `pipelines/validate(concurrent-7)` → HTTP 200 | 0.000296s | OK
- `pipelines/validate(concurrent-8)` → HTTP 200 | 0.000275s | OK
- `pipelines/validate(concurrent-9)` → HTTP 200 | 0.000636s | OK
- `pipelines/validate(concurrent-10)` → HTTP 200 | 0.000386s | OK
- `templates/import(concurrent-1)` → HTTP 200 | 0.000461s | OK
- `templates/import(concurrent-2)` → HTTP 200 | 0.000430s | OK
- `templates/import(concurrent-3)` → HTTP 200 | 0.000245s | OK
- `templates/import(concurrent-4)` → HTTP 200 | 0.000302s | OK
- `templates/import(concurrent-5)` → HTTP 200 | 0.001086s | OK
- `health` → HTTP 200 | 0.000565s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

## Scenario 8: The Research Assistant

### Call Log
- `llm/chat` → HTTP 200 | 18.642002s | OK
- `llm/chat` → HTTP 200 | 17.084855s | OK
- `pipelines/save` → HTTP 200 | 0.000996s | OK
- `pipelines/run` → HTTP 200 | 63.741995s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

---
Checkpoint persisted after Scenario 8 at 2026-02-21T20:04:56+04:00
---

## Scenario 9: The Full Stack

### Call Log
- `/v1/health` → HTTP 200 | 0.000559s | OK
- `/v1/llm/models` → HTTP 200 | 0.141895s | OK
- `/v1/registry` → HTTP 200 | 0.000395s | OK
- `templates/import` → HTTP 200 | 0.000822s | OK
- `templates/import` → HTTP 200 | 0.000823s | OK
- `templates/import` → HTTP 200 | 0.001129s | OK
- `apps/generate` → HTTP 200 | 12.633005s | OK
- `apps/generate` → HTTP 200 | 16.754009s | OK
- `recordings/save` → HTTP 200 | 0.000541s | OK
- `/v1/recordings` → HTTP 200 | 0.000717s | OK
- `/v1/templates` → HTTP 200 | 0.001564s | OK
- `/v1/apps` → HTTP 200 | 0.000682s | OK
- `/v1/pipelines` → HTTP 200 | 0.000451s | OK
- `/v1/functions` → HTTP 200 | 0.000403s | OK
- `pipelines/save` → HTTP 200 | 0.000416s | OK
- `pipelines/validate` → HTTP 200 | 0.000564s | OK
- `pipelines/run` → HTTP 200 | 58.618392s | OK
- `llm/chat` → HTTP 200 | 31.666606s | OK
- `llm/chat` → HTTP 200 | 15.900705s | OK
- `llm/chat` → HTTP 200 | 29.249638s | OK
- `/v1/heal/cache` → HTTP 200 | 0.000645s | OK
- `/v1/heal/stats` → HTTP 200 | 0.000628s | OK
- `templates/export` → HTTP 200 | 0.000702s | OK
- `templates/delete` → HTTP 200 | 0.000698s | OK
- `templates/list` → HTTP 200 | 0.000765s | OK
- `recordings/delete` → HTTP 200 | 0.000287s | OK
- `recordings/list` → HTTP 200 | 0.000321s | OK
- `health-final` → HTTP 200 | 0.000284s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

## Scenario 10: The Adversarial User

### Call Log
- `llm/prompt dot` → HTTP 200 | 1.616672s | OK
- `llm/prompt 10kA` → HTTP 200 | 4.662475s | OK
- `llm/chat` → HTTP 200 | 20.582040s | OK
- `llm/chat` → HTTP 200 | 28.306670s | OK
- `llm/chat` → HTTP 200 | 42.248003s | OK
- `apps/generate nonsense` → HTTP 200 | 62.227823s | OK
- `templates/import emoji` → HTTP 200 | 0.000808s | OK
- `pipelines/save 20-step` → HTTP 200 | 0.000392s | OK
- `pipelines/run bad-ref` → HTTP 200 | 0.000494s | OK
- `concurrent-mixed-1` → HTTP 200 | 0.000697s | OK
- `concurrent-mixed-3` → HTTP 200 | 0.000361s | OK
- `concurrent-mixed-2` → HTTP 400 | 0.000333s | ERR
- `speedrun` → HTTP 200 | 0.000731s | OK
- `speedrun` → HTTP 200 | 0.001416s | OK
- `speedrun` → HTTP 200 | 0.000325s | OK
- `speedrun` → HTTP 200 | 0.000298s | OK
- `speedrun` → HTTP 200 | 0.000630s | OK
- `speedrun` → HTTP 200 | 0.000536s | OK
- `speedrun` → HTTP 200 | 0.000568s | OK
- `speedrun` → HTTP 200 | 0.135201s | OK
- `speedrun` → HTTP 200 | 0.000500s | OK
- `speedrun` → HTTP 200 | 0.000452s | OK
- `llm/prompt request-count` → HTTP 200 | 2.271582s | OK

### Grades
- Functional: PASS
- Quality: PASS
- Speed: PASS
- Context: PASS
- Robustness: PASS
- Final: ✅ PASS

---
Checkpoint persisted after Scenario 10 at 2026-02-21T20:10:24+04:00
---

## Overall Summary
- Scenario 1: ✅ PASS
- Scenario 2: ✅ PASS
- Scenario 3: ⚠️ PARTIAL
- Scenario 4: ✅ PASS
- Scenario 5: ✅ PASS
- Scenario 6: ✅ PASS
- Scenario 7: ✅ PASS
- Scenario 8: ✅ PASS
- Scenario 9: ✅ PASS
- Scenario 10: ✅ PASS

**Overall Letter Grade: A**

Completed at: 2026-02-21T20:10:24+04:00
