/**
 * A1: Deep Think E2E Assumption Test
 *
 * Tests: Deep Think activation → math question → correct answer + thinking panel
 * Retries up to 3 times if Deep Think is rate-limited.
 */
import { BrowserAdapter } from '../src/browser/adapter.js';
import { executeDeepThink } from '../src/tools/deep-think.js';
import { appendFileSync } from 'node:fs';

const TIMEOUT = 600_000; // 10 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 30_000; // 30s between retries

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const adapter = new BrowserAdapter();
  let verdict = 'FAIL';
  let responseText = '';
  let thinkingText = '';
  let error = '';

  try {
    console.log('[A1] Connecting to browser...');
    await adapter.connect();
    const pf = await adapter.preflight();
    console.log('[A1] Preflight:', JSON.stringify(pf));

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`\n[A1] Attempt ${attempt}/${MAX_RETRIES}`);

      // Navigate to fresh chat
      console.log('[A1] Starting new chat...');
      await adapter.newChat();

      // Activate Deep Think tool
      console.log('[A1] Activating Deep Think...');
      await adapter.activateTool('deep_think');
      console.log('[A1] Deep Think activated');

      // Execute Deep Think with math question
      const prompt = 'What is 127 * 191?';
      console.log(`[A1] Sending prompt: "${prompt}"`);
      const result = await executeDeepThink(adapter.page!, prompt, TIMEOUT);

      responseText = result.text;
      console.log(`[A1] Response length: ${responseText.length}`);
      console.log(`[A1] Has thinking panel: ${result.hasThinkingPanel}`);
      console.log(`[A1] Response preview: "${responseText.slice(0, 300)}"`);

      // Check if rate-limited
      if (responseText.includes('try again') || responseText.includes('Deep Think right now') || responseText.length === 0) {
        console.log(`[A1] Rate-limited or empty response. Waiting ${RETRY_DELAY / 1000}s before retry...`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY);
          continue;
        }
        break;
      }

      // Extract thinking content
      console.log('[A1] Extracting thinking content...');
      thinkingText = await adapter.extractThinking();
      console.log(`[A1] Thinking length: ${thinkingText.length}`);
      if (thinkingText) {
        console.log(`[A1] Thinking preview: "${thinkingText.slice(0, 300)}"`);
      }

      // Check for correct answer
      const hasAnswer = responseText.includes('24257') || responseText.includes('24,257');
      console.log(`[A1] Contains 24257: ${hasAnswer}`);

      if (hasAnswer && responseText.length > 0) {
        verdict = 'PASS';
      }
      break; // Got a real response, no more retries
    }
  } catch (err: any) {
    error = err.message ?? String(err);
    console.error(`[A1] ERROR: ${error}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }

  // Write result to docs/ASSUMPTION_TESTS.md
  const hasAnswer = responseText.includes('24257') || responseText.includes('24,257');
  const report = `
## A1: Deep Think E2E — ${verdict}

**Evidence:**
- Response length: ${responseText.length} chars
- Thinking length: ${thinkingText.length} chars
- Contains correct answer (24257): ${hasAnswer ? 'yes' : 'no'}
- Response preview: "${responseText.slice(0, 200).replace(/"/g, '\\"')}${responseText.length > 200 ? '...' : ''}"
- Thinking preview: "${thinkingText.slice(0, 200).replace(/"/g, '\\"')}${thinkingText.length > 200 ? '...' : ''}"
${error ? `- Error: ${error}` : ''}
`;

  appendFileSync('docs/ASSUMPTION_TESTS.md', report);
  console.log(`\n[A1] Result: ${verdict}`);
  console.log('[A1] Written to docs/ASSUMPTION_TESTS.md');

  process.exit(verdict === 'PASS' ? 0 : 1);
}

main();
