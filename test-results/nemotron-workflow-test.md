# Nemotron-3-Nano-30B — Complex Workflow Tests
**Date:** 2026-02-21 03:10 AM Dubai
**Model:** nvidia/nemotron-3-nano (30B, 24.52GB, 32K ctx)
**Gateway:** localhost:3500

## Results Summary
| # | Test | Result | Time | Notes |
|---|------|--------|------|-------|
| 1 | Schema Discovery | ❌ FAIL | 0.02s | Did not return valid JSON schema response. |
| 2 | Smart Extract | ❌ FAIL | 0.01s | No valid JSON extraction array. |
| 3 | Template Learning | ❌ FAIL | 0.01s | No valid JSON template extraction. |
| 4 | Self-Heal Stats | ✅ PASS | 0.01s | Heal stats JSON present. |
| 5 | NL Query (Complex) | ❌ FAIL | 0.03s | Chat endpoint failed for complex workflow query. |
| 6 | PingApp Generator | ❌ FAIL | 0.01s | PingApp generation failed or non-JSON response. |
| 7 | Multi-turn Chat | ❌ FAIL | 0.01s | Multi-turn chat failed on one or both calls. |
| 8 | Stress Test: Large DOM | ❌ FAIL | 0.01s | Large DOM test failed or timed out. |

## Detailed Results
### Test 1: Schema Discovery
**Request:**
```
POST /v1/dev/llm/prompt
{"messages": [{"role": "user", "content": "Given this HTML snippet: <table><tr><th>Name</th><th>Price</th><th>Rating</th></tr><tr><td>Widget A</td><td>$19.99</td><td>4.5</td></tr><tr><td>Widget B</td><td>$29.99</td><td>3.8</td></tr></table>\n\nReturn a JSON object with a 'schema' key mapping field names to CSS selectors."}]}
```
**HTTP:** 400  
**Time:** 0.02s
**Response (exact, truncated if huge):**
```
{"errno":"ENOSYS","code":"ping.gateway.bad_request","message":"Missing required field: prompt","retryable":false}
```
**Notes:** JSON parse mode: direct
**Verdict:** ❌ FAIL — Did not return valid JSON schema response.

### Test 2: Smart Extract
**Request:**
```
POST /v1/dev/llm/prompt
{"messages": [{"role": "user", "content": "Extract structured data from this HTML: <div class='product'><h2>MacBook Pro 16</h2><span class='price'>$2,499</span><p class='desc'>M4 Max chip, 48GB RAM</p></div><div class='product'><h2>ThinkPad X1</h2><span class='price'>$1,899</span><p class='desc'>Intel Core Ultra, 32GB RAM</p></div>\n\nReturn JSON array of objects with name, price, description fields."}]}
```
**HTTP:** 400  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
{"errno":"ENOSYS","code":"ping.gateway.bad_request","message":"Missing required field: prompt","retryable":false}
```
**Notes:** JSON parse mode: direct
**Verdict:** ❌ FAIL — No valid JSON extraction array.

### Test 3: Template Learning
**Request:**
```
POST /v1/dev/llm/prompt
{"messages": [{"role": "user", "content": "I have these example extractions from a job board:\nExample 1: {\"title\":\"Senior Dev\",\"company\":\"Google\",\"salary\":\"$180k\"}\nExample 2: {\"title\":\"ML Engineer\",\"company\":\"Meta\",\"salary\":\"$200k\"}\n\nNow extract from this HTML: <div class='job'><h3>Staff Engineer</h3><span class='co'>Apple</span><span class='pay'>$220,000</span></div>\n\nReturn the same JSON format."}]}
```
**HTTP:** 400  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
{"errno":"ENOSYS","code":"ping.gateway.bad_request","message":"Missing required field: prompt","retryable":false}
```
**Notes:** JSON parse mode: direct
**Verdict:** ❌ FAIL — No valid JSON template extraction.

### Test 4: Self-Heal Stats
**Request:**
```
GET /v1/heal/stats
```
**HTTP:** 200  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
{"ok":true,"enabled":true,"stats":{"attempts":0,"successes":0,"cacheHits":0,"cacheHitSuccesses":0,"llmAttempts":0,"llmSuccesses":0,"successRate":0,"cacheHitRate":0,"cacheHitSuccessRate":0,"llmSuccessRate":0}}
```
**Notes:** JSON parse mode: direct
**Verdict:** ✅ PASS — Heal stats JSON present.

### Test 5: NL Query (Complex)
**Request:**
```
POST /v1/dev/llm/chat
{"messages": [{"role": "user", "content": "I have a webpage with a table of cryptocurrency prices. The columns are: Name, Symbol, Price, 24h Change, Market Cap. Write me a PingOS workflow that: 1) Navigates to the page, 2) Extracts all rows, 3) Filters to only coins with positive 24h change, 4) Sorts by market cap descending, 5) Returns top 5. Think step by step and return the workflow as JSON."}]}
```
**HTTP:** 502  
**Time:** 0.03s
**Response (exact, truncated if huge):**
```
{"errno":"EIO","code":"ping.driver.io_error","message":"Driver openai-compat-env encountered an I/O error","retryable":true,"details":"Cannot read properties of undefined (reading '0')"}
```
**Notes:** JSON parse mode: direct
**Verdict:** ❌ FAIL — Chat endpoint failed for complex workflow query.

### Test 6: PingApp Generator
**Request:**
```
POST /v1/dev/llm/prompt
{"messages": [{"role": "user", "content": "Generate a PingApp definition for a 'Price Tracker' app that: 1) Takes a product URL as input, 2) Navigates to the URL, 3) Extracts the product name and price, 4) Stores the price with timestamp, 5) Compares with previous price and alerts if changed. Return valid JSON with: name, description, steps (array of {action, params}), and triggers."}]}
```
**HTTP:** 400  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
{"errno":"ENOSYS","code":"ping.gateway.bad_request","message":"Missing required field: prompt","retryable":false}
```
**Notes:** JSON parse mode: direct
**Verdict:** ❌ FAIL — PingApp generation failed or non-JSON response.

### Test 7: Multi-turn Chat
**Request:**
```
POST /v1/dev/llm/chat (x2)
{"turn1": {"messages": [{"role": "user", "content": "I want to scrape restaurant reviews from a food delivery site. What data fields should I extract?"}]}, "turn2": {"messages": [{"role": "user", "content": "I want to scrape restaurant reviews from a food delivery site. What data fields should I extract?"}, {"role": "assistant", "content": "{\"errno\":\"EIO\",\"code\":\"ping.driver.io_error\",\"message\":\"Driver openai-compat-env encountered an I/O error\",\"retryable\":true,\"details\":\"Cannot read properties of undefined (reading '0')\"}"}, {"role": "user", "content": "Good. Now write me a JSON schema for that with CSS selector hints for Talabat.com specifically."}]}}
```
**HTTP:** 502  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
Turn1 (0.01s): {"errno":"EIO","code":"ping.driver.io_error","message":"Driver openai-compat-env encountered an I/O error","retryable":true,"details":"Cannot read properties of undefined (reading '0')"}

Turn2 (0.01s): {"errno":"EIO","code":"ping.driver.io_error","message":"Driver openai-compat-env encountered an I/O error","retryable":true,"details":"Cannot read properties of undefined (reading '0')"}
```
**Notes:** Turn2 JSON parse mode: direct; turn1 HTTP=502, turn2 HTTP=502
**Verdict:** ❌ FAIL — Multi-turn chat failed on one or both calls.

### Test 8: Stress Test: Large DOM
**Request:**
```
POST /v1/dev/llm/prompt
{"messages": [{"role": "user", "content": "Extract structured data from this DOM HTML and return JSON array with fields: name, price, rating, reviews_count, image_url.\n\nHTML:\n<div class='page'><header><nav><a>Home</a><a>Deals</a><a>Laptops</a></nav><form><input placeholder='Search products'/></form></header><section class='filters'><label>Price</label><label>Rating</label><label>Brand</label></section><main id='catalog'><section class='grid'><article class='product-card' data-sku='SKU-1001'><img class='thumb' src='https://cdn.example.com/p/1.jpg' alt='Product 1'/><h2 class='name'>Product 1 Pro Max</h2><div class='meta'><span class='price'>$112.99</span><span class='rating'>3.8</span><span class='reviews'>157 reviews</span></div><p class='blurb'>Feature-rich device with generation 1 chipset and improved battery life.</p></article><article class='product-card' data-sku='SKU-1002'><img c... [truncated]
```
**HTTP:** 400  
**Time:** 0.01s
**Response (exact, truncated if huge):**
```
{"errno":"ENOSYS","code":"ping.gateway.bad_request","message":"Missing required field: prompt","retryable":false}
```
**Notes:** Prompt length: 4437 chars; JSON parse mode: direct
**Verdict:** ❌ FAIL — Large DOM test failed or timed out.
