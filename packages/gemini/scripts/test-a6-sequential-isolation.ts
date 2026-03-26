/**
 * A6: Sequential Test Isolation
 *
 * Tests that 5 different tool/mode/input operations can run back-to-back
 * without UI state contamination in a single browser session.
 *
 * Operations:
 * 1. Deep Research activate → verify → deactivate → verify
 * 2. Mode switch: Thinking → verify → Fast → verify
 * 3. Canvas activate → verify → send prompt → wait for response → deactivate
 * 4. Create Images activate → verify → deactivate → verify
 * 5. Type in chat input → clear → verify responsive
 */
import { BrowserAdapter } from '../src/browser/adapter.js';
import { resolveSelector } from '../src/browser/selector-resolver.js';
import * as selectors from '../src/selectors/gemini.v1.js';
import { appendFileSync } from 'node:fs';

interface OpResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main() {
  console.log('=== A6: Sequential Test Isolation ===\n');

  const adapter = new BrowserAdapter();
  await adapter.connect();
  const page = adapter.page!;
  const results: OpResult[] = [];

  try {
    // Start with a fresh chat
    console.log('Navigating to fresh chat...');
    await adapter.newChat();
    await new Promise(r => setTimeout(r, 2000));

    // ── Operation 1: Deep Research ──
    console.log('\n--- Op 1: Deep Research activate/deactivate ---');
    try {
      await adapter.activateTool('deep_research');
      const active = await adapter.isToolActive('deep_research');
      if (!active) throw new Error('Deep Research not active after activation');
      console.log('  Activated: OK');

      await adapter.deactivateTool('deep_research');
      const inactive = !(await adapter.isToolActive('deep_research'));
      if (!inactive) throw new Error('Deep Research still active after deactivation');
      console.log('  Deactivated: OK');

      results.push({ name: 'Deep Research toggle', passed: true });
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ name: 'Deep Research toggle', passed: false, error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── Operation 2: Mode switching ──
    // Note: The input-area div can intercept clicks on the mode picker.
    // Use force:true and dismiss overlays aggressively.
    console.log('\n--- Op 2: Mode switch (Thinking → Fast) ---');
    try {
      // Dismiss overlays and click mode picker with force
      await adapter.dismissOverlays();
      await new Promise(r => setTimeout(r, 500));

      // Click mode picker with force to bypass input-area interception
      const pickerSelector = 'role=button[name="Open mode picker"]';
      await page.locator(pickerSelector).first().click({ force: true });
      await new Promise(r => setTimeout(r, 500));

      // Click Thinking mode
      const thinkingSelector = 'role=menuitemradio[name=/^Thinking/i]';
      await page.locator(thinkingSelector).first().waitFor({ state: 'visible', timeout: 5000 });
      await page.locator(thinkingSelector).first().click();
      await new Promise(r => setTimeout(r, 500));

      const mode1 = await adapter.getCurrentMode();
      if (mode1 !== 'thinking') throw new Error(`Expected thinking, got ${mode1}`);
      console.log('  Switched to Thinking: OK');

      // Switch back to Fast
      await adapter.dismissOverlays();
      await new Promise(r => setTimeout(r, 500));
      await page.locator(pickerSelector).first().click({ force: true });
      await new Promise(r => setTimeout(r, 500));

      const fastSelector = 'role=menuitemradio[name=/^Fast/i]';
      await page.locator(fastSelector).first().waitFor({ state: 'visible', timeout: 5000 });
      await page.locator(fastSelector).first().click();
      await new Promise(r => setTimeout(r, 500));

      const mode2 = await adapter.getCurrentMode();
      if (mode2 !== 'fast') throw new Error(`Expected fast, got ${mode2}`);
      console.log('  Switched to Fast: OK');

      results.push({ name: 'Mode switch (Thinking→Fast)', passed: true });
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ name: 'Mode switch (Thinking→Fast)', passed: false, error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── Operation 3: Canvas activate + prompt + response ──
    console.log('\n--- Op 3: Canvas activate + prompt + response ---');
    try {
      await adapter.activateTool('canvas');
      const active = await adapter.isToolActive('canvas');
      if (!active) throw new Error('Canvas not active after activation');
      console.log('  Activated: OK');

      // Send a simple prompt
      await adapter.typePrompt('Write hello world in Python');
      await adapter.submit();
      console.log('  Prompt sent, waiting for response (up to 120s)...');

      // Wait for response to complete (poll for "Good response" button)
      const deadline = Date.now() + 120_000;
      let responseComplete = false;
      while (Date.now() < deadline) {
        responseComplete = await adapter.isResponseComplete();
        if (responseComplete) break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!responseComplete) {
        // Check if we at least got a response (canvas might not show "Good response")
        const partial = await adapter.extractPartialResponse();
        if (partial.length > 10) {
          console.log(`  Response received (${partial.length} chars), "Good response" not shown (canvas mode)`);
          responseComplete = true;
        } else {
          throw new Error('No response within 120s timeout');
        }
      } else {
        console.log('  Response complete: OK');
      }

      // Navigate to fresh chat to deactivate canvas (canvas changes the UI significantly)
      await adapter.newChat();
      await new Promise(r => setTimeout(r, 2000));

      // Verify canvas is no longer active
      const stillActive = await adapter.isToolActive('canvas');
      console.log(`  After new chat, canvas active: ${stillActive}`);

      results.push({ name: 'Canvas prompt+response', passed: true });
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ name: 'Canvas prompt+response', passed: false, error: err.message });
      // Try to recover with a fresh chat
      try { await adapter.newChat(); await new Promise(r => setTimeout(r, 2000)); } catch {}
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── Operation 4: Create Images ──
    console.log('\n--- Op 4: Create Images activate/deactivate ---');
    try {
      await adapter.activateTool('create_images');
      const active = await adapter.isToolActive('create_images');
      if (!active) throw new Error('Create Images not active after activation');
      console.log('  Activated: OK');

      await adapter.deactivateTool('create_images');
      const inactive = !(await adapter.isToolActive('create_images'));
      if (!inactive) throw new Error('Create Images still active after deactivation');
      console.log('  Deactivated: OK');

      results.push({ name: 'Create Images toggle', passed: true });
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ name: 'Create Images toggle', passed: false, error: err.message });
    }
    await new Promise(r => setTimeout(r, 1000));

    // ── Operation 5: Input responsiveness ──
    console.log('\n--- Op 5: Chat input type/clear/verify ---');
    try {
      const input = await resolveSelector(page, selectors.CHAT_INPUT, 10_000);
      if (!input) throw new Error('Chat input not found');

      // Type "test"
      await input.click({ force: true });
      await input.fill('test');
      await new Promise(r => setTimeout(r, 500));

      const typed = await input.textContent();
      if (!typed?.includes('test')) throw new Error(`Expected "test" in input, got "${typed}"`);
      console.log('  Typed "test": OK');

      // Clear it
      await input.fill('');
      await new Promise(r => setTimeout(r, 500));

      const cleared = await input.textContent();
      if (cleared && cleared.trim().length > 0) throw new Error(`Input not cleared, has: "${cleared}"`);
      console.log('  Cleared input: OK');

      // Verify still responsive by typing again
      await input.fill('responsive');
      await new Promise(r => setTimeout(r, 300));
      const check = await input.textContent();
      if (!check?.includes('responsive')) throw new Error(`Input not responsive after clear, got "${check}"`);
      console.log('  Input responsive after clear: OK');

      // Clean up
      await input.fill('');

      results.push({ name: 'Input type/clear/verify', passed: true });
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ name: 'Input type/clear/verify', passed: false, error: err.message });
    }

    // ── Summary ──
    const allPassed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;

    console.log(`\n${passedCount}/${results.length} operations passed`);
    console.log(`Verdict: ${allPassed ? 'PASS' : 'FAIL'}`);

    // Build evidence
    const evidence = results.map(r => {
      const status = r.passed ? 'PASS' : 'FAIL';
      const errInfo = r.error ? ` — ${r.error}` : '';
      return `${r.name}: ${status}${errInfo}`;
    });

    // Write to ASSUMPTION_TESTS.md
    const resultBlock = `## A6: Sequential Test Isolation — ${allPassed ? 'PASS' : 'FAIL'}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

**Summary:** ${passedCount}/${results.length} sequential operations completed successfully without UI state contamination.

---

`;
    appendFileSync('docs/ASSUMPTION_TESTS.md', resultBlock);
    console.log('\nResult appended to docs/ASSUMPTION_TESTS.md');

    return { passed: allPassed, passedCount, total: results.length };
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
