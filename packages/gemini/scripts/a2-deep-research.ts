/**
 * A2: Deep Research Full Completion Assumption Test
 *
 * Deep Research runs asynchronously in Gemini:
 * 1. Send query → plan appears → click "Start research"
 * 2. Brief acknowledgment ("I'm on it...")
 * 3. Research runs in background with progress updates
 * 4. Final response with sources appears (can take 5+ minutes)
 *
 * Detection: poll response text length until it's substantial (>500 chars)
 * and stable for 15 seconds.
 */
import { BrowserAdapter } from '../src/browser/adapter.js';
import { resolveSelector } from '../src/browser/selector-resolver.js';
import { STOP_BUTTON, GOOD_RESPONSE, CHAT_INPUT } from '../src/selectors/gemini.v1.js';
import { appendFileSync } from 'node:fs';

const TIMEOUT = 600_000; // 10 minutes
const MIN_WAIT_AFTER_START = 60_000; // Wait at least 60s after clicking Start
const PLAN_BUTTON = 'role=button[name="Start research"]';
const FAIL_TEXT = 'Research unsuccessful';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function extractText(page: any): Promise<string> {
  return page.evaluate(() => {
    const containers = document.querySelectorAll('.model-response-text');
    if (containers.length > 0) {
      const last = containers[containers.length - 1]!;
      return last.textContent?.trim() ?? '';
    }
    return '';
  }).catch(() => '');
}

async function main() {
  const adapter = new BrowserAdapter();
  let verdict = 'FAIL';
  let responseText = '';
  let error = '';
  let planDetected = false;
  let researchStarted = false;
  let researchFailed = false;

  try {
    console.log('[A2] Connecting to browser...');
    await adapter.connect();
    const page = adapter.page!;
    const pf = await adapter.preflight();
    console.log('[A2] Preflight:', JSON.stringify(pf));

    const deadline = Date.now() + TIMEOUT;

    // Navigate to fresh chat
    console.log('[A2] Starting new chat...');
    await adapter.newChat();

    // Activate Deep Research tool
    console.log('[A2] Activating Deep Research...');
    await adapter.activateTool('deep_research');
    console.log('[A2] Deep Research activated');

    // Type and send query
    const prompt = 'What are the latest breakthroughs in quantum computing in 2025?';
    console.log(`[A2] Sending prompt: "${prompt}"`);
    const input = await resolveSelector(page, CHAT_INPUT, 10_000);
    if (!input) throw new Error('Chat input not found');
    await input.click({ force: true });
    await input.fill(prompt);
    await sleep(300);
    await page.keyboard.press('Enter');
    console.log('[A2] Query submitted, waiting for plan...');

    // Phase 1: Wait for "Start research" button (plan phase)
    while (Date.now() < deadline) {
      const startBtn = await page.locator(PLAN_BUTTON).first().isVisible().catch(() => false);
      if (startBtn) {
        planDetected = true;
        console.log('[A2] Plan detected!');
        break;
      }

      // Check for failure
      const failVisible = await page.evaluate((ft: string) => {
        return document.body?.innerText?.includes(ft) ?? false;
      }, FAIL_TEXT).catch(() => false);
      if (failVisible) {
        researchFailed = true;
        console.log('[A2] Research failed during plan phase');
        break;
      }

      await sleep(2000);
    }

    if (researchFailed) {
      responseText = await extractText(page);
    } else if (!planDetected) {
      throw new Error('Timeout waiting for research plan');
    } else {
      // Click "Start research"
      console.log('[A2] Clicking "Start research"...');
      await page.locator(PLAN_BUTTON).first().click();
      researchStarted = true;
      const startTime = Date.now();
      console.log('[A2] Research started. Waiting for completion (5+ minutes expected)...');

      // Phase 2: Wait for research to complete
      // Strategy: poll response text length until it's >500 chars AND stable for 15s
      // Also enforce minimum wait of 60s after clicking Start
      let lastTextLen = 0;
      let stableCount = 0;
      const STABLE_THRESHOLD = 5; // 5 checks * 3s = 15 seconds of stability
      let lastLogTime = Date.now();

      while (Date.now() < deadline) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Check for failure
        const failVisible = await page.evaluate((ft: string) => {
          return document.body?.innerText?.includes(ft) ?? false;
        }, FAIL_TEXT).catch(() => false);
        if (failVisible) {
          researchFailed = true;
          console.log(`[A2] Research failed at ${elapsed}s`);
          break;
        }

        // Extract current response text
        const currentText = await extractText(page);
        const currentLen = currentText.length;

        // Log progress every 30 seconds
        if (Date.now() - lastLogTime > 30_000) {
          console.log(`[A2] ${elapsed}s elapsed, response: ${currentLen} chars`);
          if (currentLen > 0) {
            console.log(`[A2] Preview: "${currentText.slice(0, 150)}..."`);
          }
          lastLogTime = Date.now();
        }

        // Check for stability (response not growing)
        if (currentLen === lastTextLen && currentLen > 0) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        lastTextLen = currentLen;

        // Completion conditions:
        // 1. Minimum wait enforced
        // 2. Response is substantial (>500 chars)
        // 3. Response text has been stable for 15 seconds
        // 4. No stop button visible
        const minWaitPassed = (Date.now() - startTime) >= MIN_WAIT_AFTER_START;
        const isSubstantial = currentLen > 500;
        const isStable = stableCount >= STABLE_THRESHOLD;

        if (minWaitPassed && isSubstantial && isStable) {
          // Final check: no stop button
          const stopBtn = await resolveSelector(page, STOP_BUTTON, 2000);
          if (!stopBtn) {
            console.log(`[A2] Research complete! ${elapsed}s, ${currentLen} chars, stable for ${stableCount * 3}s`);
            break;
          }
        }

        // Also check for "Good response" button as a completion signal
        // But ONLY after minimum wait and substantial response
        if (minWaitPassed && isSubstantial) {
          const goodBtn = await resolveSelector(page, GOOD_RESPONSE, 1000);
          const stopBtn = await resolveSelector(page, STOP_BUTTON, 1000);
          if (goodBtn && !stopBtn) {
            console.log(`[A2] Good response button detected at ${elapsed}s with ${currentLen} chars — complete!`);
            break;
          }
        }

        await sleep(3000);
      }

      // Final extraction with extra wait for rendering
      await sleep(3000);
      responseText = await extractText(page);
    }

    console.log(`\n[A2] === RESULTS ===`);
    console.log(`[A2] Response length: ${responseText.length}`);
    console.log(`[A2] Plan detected: ${planDetected}`);
    console.log(`[A2] Research started: ${researchStarted}`);
    console.log(`[A2] Research failed: ${researchFailed}`);
    console.log(`[A2] Response preview: "${responseText.slice(0, 400)}"`);

    // Check: substantial response (>500 chars) and not failed
    const isPlanOnly = responseText.includes("Here's my plan") && responseText.length < 2000;
    if (responseText.length > 500 && !researchFailed && !isPlanOnly) {
      verdict = 'PASS';
    }
  } catch (err: any) {
    error = err.message ?? String(err);
    console.error(`[A2] ERROR: ${error}`);
  } finally {
    await adapter.disconnect().catch(() => {});
  }

  // Write result to docs/ASSUMPTION_TESTS.md
  const report = `
## A2: Deep Research Full Completion — ${verdict}

**Evidence:**
- Response length: ${responseText.length} chars
- Plan detected: ${planDetected ? 'yes' : 'no'}
- Research started (clicked Start): ${researchStarted ? 'yes' : 'no'}
- Research failed: ${researchFailed ? 'yes' : 'no'}
- Substantial (>500 chars): ${responseText.length > 500 ? 'yes' : 'no'}
- Response preview: "${responseText.slice(0, 200).replace(/"/g, '\\"')}${responseText.length > 200 ? '...' : ''}"
${error ? `- Error: ${error}` : ''}
`;

  appendFileSync('docs/ASSUMPTION_TESTS.md', report);
  console.log(`\n[A2] Result: ${verdict}`);
  console.log('[A2] Written to docs/ASSUMPTION_TESTS.md');

  process.exit(verdict === 'PASS' ? 0 : 1);
}

main();
