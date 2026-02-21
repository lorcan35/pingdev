# Model Shootout — Nemotron-3-Nano-30B (Optimized Prompts)
**Date:** 2026-02-21
**Build:** post-prompt-optimization (response_format, think-strip, DOM cap)

| # | Test | Result | Time | Tokens (in/out) | JSON Valid? | Notes |
|---|------|--------|------|------------------|-------------|-------|
| 1 | Schema Discovery | PASS | 4.5s | 149/300 | YES | Returned schema object; includes column selectors. |
| 2 | Smart Extract | PASS | 4.3s | 160/288 | YES | 2 product records extracted. |
| 3 | Template Learning | PASS | 3.1s | 132/199 | YES | Template shape preserved. |
| 4 | Self-Heal Stats | PASS | 0.0s | n/a | YES | Endpoint reachable; heal stats returned. |
| 5 | NL Query | PASS | 10.9s | 119/748 | YES | Workflow JSON emitted with actionable steps. |
| 6 | PingApp Generator | PASS | 28.0s | 109/1927 | YES | Includes triggers and workflow steps. |
| 7 | Multi-turn Chat | PASS | 19.9s | 36/256 + 277/1093 | YES | Turn-2 produced JSON schema grounded in turn-1 fields. |
| 8 | Large DOM Stress | PASS | 14.2s | 1272/913 | YES | HTML size ~3487 chars; extracted 8/8 products. |
