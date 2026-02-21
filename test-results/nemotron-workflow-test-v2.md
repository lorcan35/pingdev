# Nemotron-3-Nano-30B — Complex Workflow Tests (v2 — Corrected)
**Date:** 2026-02-21 01:04 PM Dubai
**Model:** nvidia/nemotron-3-nano (30B, 24.52GB, 32K ctx)
**Gateway:** localhost:3500 (env driver URL fix applied)

## Results Summary
| # | Test | Result | Time | Tokens | Notes |
|---|------|--------|------|--------|-------|
| 1 | Schema Discovery | PASS | 9.0s | 130/605 | valid JSON schema mapping |
| 2 | Smart Extract | PASS | 3.5s | 143/224 | valid 2-item product array |
| 3 | Template Learning | PASS | 2.6s | 135/167 | template-aligned JSON object |
| 4 | Self-Heal Stats | PASS | 0.0s | n/a | ok:true present |
| 5 | NL Query (Complex Workflow) | PASS | 13.6s | 124/915 | valid workflow JSON |
| 6 | PingApp Generator | PASS | 18.6s | 104/1240 | valid PingApp definition |
| 7 | Multi-turn Chat | PASS | 16.7s | 36/221 + 227/897 | coherent multi-turn + valid JSON in turn 2 |
| 8 | Stress Test: Large DOM | PASS | 18.3s | 1077/1189 | valid 8-item array, no timeout |

## Detailed Results
### Test 1: Schema Discovery
**Response (after stripping <think>):** {
  "schema": {
    "Name": "table tr:nth-child(n+2) td:nth-child(1)",
    "Price": "table tr:nth-child(n+2) td:nth-child(2)",
    "Rating": "table tr:nth-child(n+2) td:nth-child(3)"
  }
}
**Raw token usage:** 130 / 605
**Verdict:** PASS

### Test 2: Smart Extract
**Response (after stripping <think>):** [
  {
    "name": "MacBook Pro 16",
    "price": "$2,499",
    "description": "M4 Max chip, 48GB RAM"
  },
  {
    "name": "ThinkPad X1",
    "price": "$1,899",
    "description": "Intel Core Ultra, 32GB RAM"
  }
]
**Raw token usage:** 143 / 224
**Verdict:** PASS

### Test 3: Template Learning
**Response (after stripping <think>):** {"title":"Staff Engineer","company":"Apple","salary":"$220,000"}
**Raw token usage:** 135 / 167
**Verdict:** PASS

### Test 4: Self-Heal Stats
**Response (after stripping <think>):** {"ok":true,"enabled":true,"stats":{"attempts":0,"successes":0,"cacheHits":0,"cacheHitSuccesses":0,"llmAttempts":0,"llmSuccesses":0,"successRate":0,"cacheHitRate":0,"cacheHitSuccessRate":0,"llmSuccessRate":0}}
**Raw token usage:** n/a
**Verdict:** PASS

### Test 5: NL Query (Complex Workflow)
**Response (after stripping <think>):** {
  "name": "TopGainersWorkflow",
  "description": "Fetch the top 5 cryptocurrencies with positive 24h change sorted by market cap descending.",
  "steps": [
    {
      "action": "navigate",
      "params": {
        "url": "https://example.com/cryptocurrency-prices"
      }
    },
    {
      "action": "extract_table",
      "params": {
        "selector": "table#prices"
      }
    },
    {
      "action": "filter_rows",
      "params": {
        "column": "24h Change",
        "operator": ">...
**Raw token usage:** 124 / 915
**Verdict:** PASS

### Test 6: PingApp Generator
**Response (after stripping <think>):** {
  "name": "Price Tracker",
  "description": "Monitors price changes of a product from a given URL and alerts when the price changes.",
  "steps": [
    {
      "action": "input",
      "params": {
        "field": "product_url",
        "type": "string"
      }
    },
    {
      "action": "navigate",
      "params": {
        "url": "{{product_url}}"
      }
    },
    {
      "action": "extract",
      "params": {
        "target": "product_name",
        "selector": "h1.product-title"
     ...
**Raw token usage:** 104 / 1240
**Verdict:** PASS

### Test 7: Multi-turn Chat
**Response (after stripping <think>):** {
  "restaurantName": "h1[data-test='restaurant-name']",
  "restaurantId": "a[data-test='restaurant-link']",
  "reviewerId": "a.reviewer-name",
  "reviewDate": "time[data-test='review-date']",
  "overallRating": "div.rating",
  "reviewText": "div.review-content p",
  "ratingBreakdown": "div.review-attributes",
  "reviewHelpfulness": "span.helpful-count",
  "reviewerLocation": "span.reviewer-location",
  "reviewerProfileInfo": "div.user-profile-stats",
  "reviewSentiment": "div.review-sentiment"
...
**Raw token usage:** 36 / 221; 227 / 897
**Verdict:** PASS

### Test 8: Stress Test: Large DOM
**Response (after stripping <think>):** [
  {
    "name": "Product 1 Ultra Edition",
    "price": "$136.99",
    "rating": 3.9,
    "reviews": 137,
    "image": "https://img.shop.test/p1.jpg"
  },
  {
    "name": "Product 2 Ultra Edition",
    "price": "$173.99",
    "rating": 4.2,
    "reviews": 257,
    "image": "https://img.shop.test/p2.jpg"
  },
  {
    "name": "Product 3 Ultra Edition",
    "price": "$210.99",
    "rating": 4.5,
    "reviews": 377,
    "image": "https://img.shop.test/p3.jpg"
  },
  {
    "name": "Product 4 Ultra ...
**Raw token usage:** 1077 / 1189
**Verdict:** PASS

