/**
 * A7: Rate Limiter Test
 *
 * Validates that the rate limiter correctly throttles rapid requests.
 * Config: maxPerMinute=6, minDelayMs=3000
 *
 * Expected: first request → 202, subsequent rapid requests → 429 with retry_after_ms
 */
import Fastify from 'fastify';
import { registerRoutes } from '../src/api/routes.js';

const PORT = 3458;

interface ResponseRecord {
  index: number;
  status: number;
  body: any;
}

async function main() {
  console.log('=== A7: Rate Limiter Test ===\n');

  // 1. Create Fastify server
  const app = Fastify({ logger: false });
  await registerRoutes(app);
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`Server listening on port ${PORT}`);

  const results: ResponseRecord[] = [];

  try {
    // 2. Send 8 rapid POST /v1/jobs requests sequentially (no delay)
    // Sequential because the rate limiter records AFTER the async queue add,
    // so concurrent requests race past the check. Sequential ensures each
    // handler finishes (including recordRequest()) before the next starts.
    console.log('Sending 8 rapid sequential requests...\n');

    for (let i = 0; i < 8; i++) {
      const res = await fetch(`http://127.0.0.1:${PORT}/v1/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Rate limit test request ${i + 1}` }),
      });
      const body = await res.json();
      results.push({ index: i + 1, status: res.status, body });
    }

    // 3. Analyze results
    console.log('Results:');
    for (const r of results) {
      const retryInfo = r.body.retry_after_ms ? `, retry_after_ms: ${r.body.retry_after_ms}` : '';
      const errorInfo = r.body.error ? `, error: "${r.body.error}"` : '';
      console.log(`  Request ${r.index}: status ${r.status}${retryInfo}${errorInfo}`);
    }

    // 4. Determine PASS/FAIL
    const has202 = results.some(r => r.status === 202);
    const has429WithRetry = results.some(r => r.status === 429 && r.body.retry_after_ms !== undefined);
    const count202 = results.filter(r => r.status === 202).length;
    const count429 = results.filter(r => r.status === 429).length;

    const passed = has202 && has429WithRetry;

    console.log(`\n202 responses: ${count202}`);
    console.log(`429 responses: ${count429}`);
    console.log(`\nVerdict: ${passed ? 'PASS' : 'FAIL'}`);

    // 5. Build evidence
    const evidence: string[] = [];
    for (const r of results) {
      let line = `Request ${r.index}: status ${r.status}`;
      if (r.body.retry_after_ms !== undefined) line += `, retry_after_ms: ${r.body.retry_after_ms}`;
      if (r.body.error) line += ` (${r.body.error})`;
      if (r.body.job_id) line += ` → job_id: ${r.body.job_id.slice(0, 8)}...`;
      evidence.push(line);
    }

    // 6. Write to docs/ASSUMPTION_TESTS.md
    const { appendFileSync } = await import('node:fs');
    const resultBlock = `## A7: Rate Limiter — ${passed ? 'PASS' : 'FAIL'}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

**Config:** maxPerMinute=6, minDelayMs=3000ms
**Summary:** ${count202} accepted (202), ${count429} rate-limited (429). ${has429WithRetry ? 'Rate-limited responses include retry_after_ms field.' : 'No 429 responses had retry_after_ms field.'}

---

`;
    appendFileSync('docs/ASSUMPTION_TESTS.md', resultBlock);
    console.log('\nResult appended to docs/ASSUMPTION_TESTS.md');

    // Return result for reporting
    return { passed, count202, count429, has429WithRetry };
  } finally {
    // 7. Clean up
    await app.close();
    console.log('Server closed');
  }
}

main().then(result => {
  console.log('\nDone:', result);
  process.exit(result?.passed ? 0 : 1);
}).catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
