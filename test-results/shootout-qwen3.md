# PingOS 3-Model Shootout — Round 2 (Qwen3-32B, optimized prompts)
Generated: 2026-02-21T13:28:44.967392
Gateway: http://localhost:3500  | LM Studio model expected: qwen/qwen3-32b

## Batch 1 (Tests 1–3)

## 1. Schema Discovery
- Result: **PARTIAL**
- Time: 41.34s
- Model: `qwen3-32b`
- Tokens: prompt=136 completion=377
- JSON valid (raw `text` parse): **NO**
- Notes: Contains schema map
- Output sample: `{"schema":{"Name":"td:nth-child(1)","Price":"td:nth-child(2)","Rating":"td:nth-child(3)"}}`

## 2. Smart Extract
- Result: **PARTIAL**
- Time: 112.74s
- Model: `qwen3-32b`
- Tokens: prompt=145 completion=545
- JSON valid (raw `text` parse): **NO**
- Notes: Extracted 2 items
- Output sample: `[   {     "name": "MacBook Pro 16",     "price": "$2,499",     "description": "M4 Max chip, 48GB RAM"   },   {     "name": "ThinkPad X1",     "price": "$1,899",     "description": "Intel Core Ultra, 32GB RAM"   } ]`

## 3. Template Learning
- Result: **FAIL**
- Time: 120.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: Output JSON parse failed: Expecting value: line 1 column 1 (char 0)

## Batch 2 (Tests 4–6)

## 4. Self-Heal Stats
- Result: **PARTIAL**
- Time: 0.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: Keys: ok, enabled, stats

## 5. NL Query
- Result: **FAIL**
- Time: 120.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: Output JSON parse failed: Expecting value: line 1 column 1 (char 0)

## 6. PingApp Generator
- Result: **FAIL**
- Time: 120.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: Output JSON parse failed: Expecting value: line 1 column 1 (char 0)

> Note: Initial runner hung on Test 6; process was terminated and remaining tests were re-run in a fresh batch script.

## Batch 2R (Tests 4–6 rerun)

## 4. Self-Heal Stats
- Result: **PARTIAL**
- Time: 0.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: Raw text includes extra wrapper (e.g., <think>/markdown)
- Output sample: ``

## 5. NL Query
- Result: **FAIL**
- Time: 120.01s
- Model: `None`
- Tokens: prompt=None completion=None
- JSON valid (raw `text` parse): **NO**
- Notes: —
- Output sample: ``

## 6. PingApp Generator
- Result: **FAIL**
- Time: 104.93s
- Model: `qwen3-32b`
- Tokens: prompt=96 completion=562
- JSON valid (raw `text` parse): **NO**
- Notes: —
- Output sample: `{"name":"Price Tracker","description":"Monitors product price changes on e-commerce websites","steps":[{"action":"TakeInput","params":{"url":"string"}},{"action":"NavigateToUrl","params":{"target":"{{input.url}}"}},{"action":"ExtractData","params":{"selectors":{"product_name":".product-name","price":".price"}}},{"action":"StoreDataWithTimestamp","params":{"fields":["product_name","price"]},{"action":"CheckForPriceChange","params":{}}],"triggers":[{"type":"webhook","config":{"url":"/api/price-ale`

## Batch 3 (Tests 7–8)

## 7. Multi-turn Chat
- Result: **FAIL**
- Time: 240.02s
- Model: `None`
- Tokens: prompt=0 completion=0
- JSON valid (raw `text` parse): **NO**
- Notes: call1 assistant text stripped from <think> before call2; parse fail: Expecting value: line 1 column 1 (char 0)
- Output sample: ``

## 8. Large DOM Stress
- Result: **PARTIAL**
- Time: 76.19s
- Model: `qwen3-32b`
- Tokens: prompt=1133 completion=694
- JSON valid (raw `text` parse): **NO**
- Notes: prompt_html_chars=3937; extracted_count=8; Raw text includes extra wrapper (e.g., <think>/markdown)
- Output sample: `[{"name":"Product 1 Ultra Edition","price":"$111.99","rating":"4.2","reviews":"137 reviews","image":"https://img.example.com/p1.jpg"},{"name":"Product 2 Ultra Edition","price":"$222.99","rating":"4.4","reviews":"274 reviews","image":"https://img.example.com/p2.jpg"},{"name":"Product 3 Ultra Edition","price":"$333.99","rating":"4.6","reviews":"411 reviews","image":"https://img.example.com/p3.jpg"},{"name":"Product 4 Ultra Edition","price":"$444.99","rating":"4.8","reviews":"548 reviews","image":"`

## Final Scored Results (latest run per test)

| Test | Result | Time (s) | Tokens (p/c) | JSON valid (`text` via jq) | Notes |
|---|---|---:|---:|---|---|
| 1. Schema Discovery | PARTIAL | 41.34 | 136 / 377 | NO | Correct schema after stripping `<think>` |
| 2. Smart Extract | PARTIAL | 112.74 | 145 / 545 | NO | Correct 2 records after stripping `<think>` |
| 3. Template Learning | FAIL | 120.01 | - / - | NO | Timed out / empty envelope |
| 4. Self-Heal Stats | PARTIAL | 0.01 | - / - | NO | Endpoint healthy JSON envelope, no `text` field |
| 5. NL Query | FAIL | 120.01 | - / - | NO | Timed out / empty envelope |
| 6. PingApp Generator | FAIL | 104.93 | 96 / 562 | NO | Returned malformed JSON structure |
| 7. Multi-turn Chat | FAIL | 240.02 | 0 / 0 | NO | Call1+Call2 stalled/empty; call1 text stripping attempted |
| 8. Large DOM Stress | PARTIAL | 76.19 | 1133 / 694 | NO | Extracted 8/8 correctly after stripping `<think>` |

### Aggregate
- PASS: **0**
- PARTIAL: **4**
- FAIL: **4**
- Model observed in successful LLM responses: `qwen3-32b`

### Key Findings
- Gateway is routing to `qwen3-32b` when responding.
- Raw `text` often includes reasoning/wrapper content, so strict `jq` parse on raw `text` fails frequently.
- Optimized prompts improved extraction quality on Tests 1, 2, and 8 (content correct after cleanup), but strict JSON compliance is still unreliable.
- Stability/timeouts remain on more complex generation/chat tasks (Tests 3, 5, 7).
