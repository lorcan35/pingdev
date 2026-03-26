/**
 * A5: Selector Stability Test
 *
 * Validates that core selectors reliably resolve across 3 navigation cycles.
 * Navigates: about:blank → gemini.google.com/u/1/app × 3 iterations
 * Checks: CHAT_INPUT, TOOLS_BUTTON, MODE_PICKER, NEW_CHAT
 */
import { BrowserAdapter } from '../src/browser/adapter.js';
import { resolveSelector } from '../src/browser/selector-resolver.js';
import * as selectors from '../src/selectors/gemini.v1.js';
import { appendFileSync } from 'node:fs';

const ITERATIONS = 3;
const GEMINI_URL = 'https://gemini.google.com/u/1/app';

const SELECTORS_TO_TEST = [
  { name: 'CHAT_INPUT', def: selectors.CHAT_INPUT },
  { name: 'TOOLS_BUTTON', def: selectors.TOOLS_BUTTON },
  { name: 'MODE_PICKER', def: selectors.MODE_PICKER },
  { name: 'NEW_CHAT', def: selectors.NEW_CHAT },
];

interface CheckResult {
  iteration: number;
  selector: string;
  resolved: boolean;
}

async function main() {
  console.log('=== A5: Selector Stability Test ===\n');

  const adapter = new BrowserAdapter();
  await adapter.connect();
  const page = adapter.page!;

  const results: CheckResult[] = [];
  const evidence: string[] = [];

  try {
    for (let iter = 1; iter <= ITERATIONS; iter++) {
      console.log(`--- Iteration ${iter}/${ITERATIONS} ---`);

      // a. Navigate to about:blank
      console.log('  Navigating to about:blank...');
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10_000 });

      // b. Wait 2 seconds
      await new Promise(r => setTimeout(r, 2000));

      // c. Navigate back to Gemini
      console.log(`  Navigating to ${GEMINI_URL}...`);
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // d. Wait for page load (3 seconds)
      await new Promise(r => setTimeout(r, 3000));

      // e. Try to resolve each selector
      const iterResults: string[] = [];
      for (const { name, def } of SELECTORS_TO_TEST) {
        const locator = await resolveSelector(page, def, 10_000);
        const resolved = locator !== null;
        results.push({ iteration: iter, selector: name, resolved });
        const status = resolved ? 'OK' : 'FAIL';
        console.log(`  ${name}: ${status}`);
        iterResults.push(`${name}=${resolved ? 'OK' : 'FAIL'}`);
      }
      evidence.push(`Iteration ${iter}: ${iterResults.join(', ')}`);
    }

    // Determine PASS/FAIL
    const totalChecks = results.length;
    const passedChecks = results.filter(r => r.resolved).length;
    const allPassed = passedChecks === totalChecks;

    console.log(`\n${passedChecks}/${totalChecks} checks passed`);
    console.log(`Verdict: ${allPassed ? 'PASS' : 'FAIL'}`);

    // Write to ASSUMPTION_TESTS.md
    const resultBlock = `## A5: Selector Stability — ${allPassed ? 'PASS' : 'FAIL'}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

**Summary:** ${passedChecks}/${totalChecks} selector resolutions successful across ${ITERATIONS} navigation cycles.
Selectors tested: ${SELECTORS_TO_TEST.map(s => s.name).join(', ')}

---

`;
    appendFileSync('docs/ASSUMPTION_TESTS.md', resultBlock);
    console.log('\nResult appended to docs/ASSUMPTION_TESTS.md');

    return { passed: allPassed, passedChecks, totalChecks };
  } finally {
    await adapter.disconnect();
    console.log('Browser disconnected');
  }
}

main().then(result => {
  console.log('\nDone:', result);
  process.exit(result?.passed ? 0 : 1);
}).catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
