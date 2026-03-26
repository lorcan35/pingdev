/**
 * A8: Thinking Extraction Quality
 *
 * Tests thinking content extraction in 3 scenarios:
 * (a) Deep Think tool
 * (b) Thinking mode (no tool)
 * (c) Deep Research plan extraction
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const CDP_URL = 'http://127.0.0.1:18800';
const GEMINI_URL = 'https://gemini.google.com/u/1/app';
const TIMEOUT = 600_000;
const RESULTS_FILE = 'docs/ASSUMPTION_TESTS.md';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Find the chat input with multiple fallback selectors */
async function findInput(page: any): Promise<any> {
  const selectors = [
    'role=textbox[name="Enter a prompt for Gemini"]',
    'role=textbox[name=/Ask Gemini/i]',
    'role=textbox[name=/Ask a complex question/i]',
    'role=textbox[name=/What do you want to research/i]',
    '.ql-editor[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      const vis = await loc.isVisible({ timeout: 3000 });
      if (vis) return loc;
    } catch {}
  }
  throw new Error('Chat input not found');
}

/** Extract thinking/reasoning content from the page using multiple strategies */
async function extractThinkingContent(page: any): Promise<string> {
  return page.evaluate(() => {
    const results: string[] = [];

    // Strategy 1: "Show thinking" / "Hide thinking" / "Thought for" buttons
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const btn of allButtons) {
      const text = btn.textContent?.trim() ?? '';
      if (text.includes('Show thinking') || text.includes('Hide thinking') || text.includes('Thought for')) {
        results.push(`[Button found: "${text}"]`);

        // Try clicking to expand if "Show thinking"
        if (text.includes('Show thinking') || text.includes('Thought for')) {
          try { btn.click(); } catch {}
        }

        // Walk up to find the thinking container
        let el: HTMLElement | null = btn;
        for (let i = 0; i < 10; i++) {
          el = el?.parentElement ?? null;
          if (!el) break;
          const cls = el.className?.toString() ?? '';
          if (cls.includes('thinking') || cls.includes('reasoning') || cls.includes('thought')) {
            const clone = el.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('button').forEach(b => b.remove());
            const content = clone.textContent?.trim() ?? '';
            if (content.length > 0) results.push(content);
            break;
          }
        }

        // Also check next sibling / parent's other children
        const parent = btn.parentElement;
        if (parent) {
          for (const child of Array.from(parent.children)) {
            if (child !== btn && child.textContent) {
              const ct = child.textContent.trim();
              if (ct.length > 10 && ct !== text) results.push(ct.slice(0, 500));
            }
          }
        }
      }
    }

    // Strategy 2: Elements with thinking-related class names
    const thinkingSelectors = [
      '[class*="thinking"]', '[class*="reasoning"]', '[class*="thought"]',
      '[data-thinking]', '[data-reasoning]', 'details', 'summary',
    ];
    for (const sel of thinkingSelectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        const text = el.textContent?.trim() ?? '';
        if (text.length > 10) results.push(`[${sel}]: ${text.slice(0, 500)}`);
      });
    }

    // Strategy 3: Look for collapsible/expandable sections
    const expandables = document.querySelectorAll('[aria-expanded], [role="group"], details');
    expandables.forEach(el => {
      const text = el.textContent?.trim() ?? '';
      if ((text.includes('think') || text.includes('reason') || text.includes('step')) && text.length > 20) {
        results.push(`[expandable]: ${text.slice(0, 500)}`);
      }
    });

    // Strategy 4: Check response area for thinking patterns
    const responses = document.querySelectorAll('.model-response-text');
    if (responses.length > 0) {
      const last = responses[responses.length - 1]!;
      // Look for thinking sections within the response
      const sections = last.querySelectorAll('div, section, p');
      for (const sec of sections) {
        const t = sec.textContent?.trim() ?? '';
        if (t.length > 20 && (t.includes('think') || t.includes('reason') || t.includes('Let me') || t.includes('Step '))) {
          results.push(`[response-section]: ${t.slice(0, 300)}`);
          break;
        }
      }
    }

    return results.join('\n---\n');
  });
}

async function main() {
  console.log('[A8] Starting Thinking Extraction Quality test...');

  const evidence: string[] = [];
  let scenarioResults: { name: string; extracted: boolean; content: string }[] = [];

  // ─── Scenario A: Deep Think ─────────────────────────────────────
  console.log('\n[A8-a] === Scenario A: Deep Think ===');
  {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
    const context = browser.contexts()[0]!;
    const page = context.pages().find(p => p.url().includes('gemini.google.com')) ?? context.pages()[0]!;
    let extracted = false;
    let content = '';

    try {
      // Fresh chat
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      await page.keyboard.press('Escape');
      await sleep(500);

      // Activate Deep Think
      console.log('[A8-a] Activating Deep Think...');
      const toolsBtn = page.locator('role=button[name="Tools"]').first();
      await toolsBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await toolsBtn.click();
      await sleep(500);

      const menuItem = page.locator('role=menuitemcheckbox[name="Deep Think"]').first();
      await menuItem.waitFor({ state: 'visible', timeout: 5000 });
      await menuItem.click();
      await sleep(300);
      await page.keyboard.press('Escape');
      await sleep(500);

      const chipVisible = await page.locator('role=button[name="Deselect Deep Think"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      evidence.push(`(a) Deep Think activated: ${chipVisible}`);

      // Send prompt
      const input = await findInput(page);
      await input.click({ force: true });
      await input.fill('What is 15 factorial?');
      await sleep(500);
      await page.keyboard.press('Enter');
      console.log('[A8-a] Prompt sent, waiting for response...');

      // Wait for completion
      const start = Date.now();
      while (Date.now() - start < TIMEOUT) {
        const isDone = await page.locator('role=button[name="Good response"]').first()
          .isVisible({ timeout: 1000 }).catch(() => false);
        const isGen = await page.locator('role=button[name="Stop response"]').first()
          .isVisible({ timeout: 1000 }).catch(() => false);

        if (isDone && !isGen) {
          console.log('[A8-a] Response complete');
          break;
        }

        // Try extracting thinking while generating
        const partial = await extractThinkingContent(page);
        if (partial.length > 0 && !content) {
          console.log(`[A8-a] Thinking content detected (${partial.length} chars)`);
        }
        content = partial || content;

        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 20 === 0) console.log(`[A8-a] Waiting... ${elapsed}s`);
        await sleep(3000);
      }

      // Final extraction after response complete
      await sleep(2000);
      content = await extractThinkingContent(page);
      extracted = content.length > 0;
      console.log(`[A8-a] Thinking extracted: ${extracted} (${content.length} chars)`);
      if (content) console.log(`[A8-a] Preview: ${content.slice(0, 200)}`);

      evidence.push(`(a) Deep Think thinking extracted: ${extracted} (${content.length} chars)`);
      if (content) evidence.push(`(a) Preview: ${content.slice(0, 150).replace(/\n/g, '\\n')}...`);

      // Deactivate
      try {
        const deselectBtn = page.locator('role=button[name="Deselect Deep Think"]').first();
        if (await deselectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deselectBtn.click();
          await sleep(500);
        }
      } catch {}

    } catch (err) {
      console.error('[A8-a] Error:', err);
      evidence.push(`(a) Error: ${String(err)}`);
    } finally {
      browser.close().catch(() => {});
    }

    scenarioResults.push({ name: 'Deep Think', extracted, content: content.slice(0, 500) });
  }

  await sleep(3000);

  // ─── Scenario B: Thinking Mode ──────────────────────────────────
  console.log('\n[A8-b] === Scenario B: Thinking Mode ===');
  {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
    const context = browser.contexts()[0]!;
    const page = context.pages().find(p => p.url().includes('gemini.google.com')) ?? context.pages()[0]!;
    let extracted = false;
    let content = '';

    try {
      // Fresh chat
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      await page.keyboard.press('Escape');
      await sleep(500);

      // Switch to Thinking mode
      console.log('[A8-b] Switching to Thinking mode...');
      const picker = page.locator('role=button[name="Open mode picker"]').first();
      await picker.waitFor({ state: 'visible', timeout: 10_000 });
      await picker.click();
      await sleep(500);

      const thinkingItem = page.locator('role=menuitemradio[name=/^Thinking/i]').first();
      await thinkingItem.waitFor({ state: 'visible', timeout: 5000 });
      await thinkingItem.click();
      await sleep(500);

      // Verify mode
      const pickerText = await picker.textContent();
      evidence.push(`(b) Mode picker text: "${pickerText?.trim()}"`);

      // Send prompt
      const input = await findInput(page);
      await input.click({ force: true });
      await input.fill('Explain step by step how to solve 3x + 7 = 22');
      await sleep(500);
      await page.keyboard.press('Enter');
      console.log('[A8-b] Prompt sent, waiting for response...');

      // Wait for completion
      const start = Date.now();
      while (Date.now() - start < TIMEOUT) {
        const isDone = await page.locator('role=button[name="Good response"]').first()
          .isVisible({ timeout: 1000 }).catch(() => false);
        const isGen = await page.locator('role=button[name="Stop response"]').first()
          .isVisible({ timeout: 1000 }).catch(() => false);

        if (isDone && !isGen) {
          console.log('[A8-b] Response complete');
          break;
        }

        const partial = await extractThinkingContent(page);
        if (partial.length > 0 && !content) {
          console.log(`[A8-b] Thinking content detected (${partial.length} chars)`);
        }
        content = partial || content;

        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 20 === 0) console.log(`[A8-b] Waiting... ${elapsed}s`);
        await sleep(3000);
      }

      await sleep(2000);
      content = await extractThinkingContent(page);
      extracted = content.length > 0;
      console.log(`[A8-b] Thinking extracted: ${extracted} (${content.length} chars)`);
      if (content) console.log(`[A8-b] Preview: ${content.slice(0, 200)}`);

      evidence.push(`(b) Thinking mode thinking extracted: ${extracted} (${content.length} chars)`);
      if (content) evidence.push(`(b) Preview: ${content.slice(0, 150).replace(/\n/g, '\\n')}...`);

    } catch (err) {
      console.error('[A8-b] Error:', err);
      evidence.push(`(b) Error: ${String(err)}`);
    } finally {
      browser.close().catch(() => {});
    }

    scenarioResults.push({ name: 'Thinking Mode', extracted, content: content.slice(0, 500) });
  }

  await sleep(3000);

  // ─── Scenario C: Deep Research (plan extraction) ────────────────
  console.log('\n[A8-c] === Scenario C: Deep Research Plan ===');
  {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
    const context = browser.contexts()[0]!;
    const page = context.pages().find(p => p.url().includes('gemini.google.com')) ?? context.pages()[0]!;
    let extracted = false;
    let content = '';

    try {
      // Fresh chat
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      await page.keyboard.press('Escape');
      await sleep(500);

      // Activate Deep Research
      console.log('[A8-c] Activating Deep Research...');
      const toolsBtn = page.locator('role=button[name="Tools"]').first();
      await toolsBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await toolsBtn.click();
      await sleep(500);

      const menuItem = page.locator('role=menuitemcheckbox[name="Deep Research"]').first();
      await menuItem.waitFor({ state: 'visible', timeout: 5000 });
      await menuItem.click();
      await sleep(300);
      await page.keyboard.press('Escape');
      await sleep(500);

      const chipVisible = await page.locator('role=button[name="Deselect Deep Research"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      evidence.push(`(c) Deep Research activated: ${chipVisible}`);

      // Send prompt
      const input = await findInput(page);
      await input.click({ force: true });
      await input.fill('Latest AI safety research 2025');
      await sleep(500);
      await page.keyboard.press('Enter');
      console.log('[A8-c] Prompt sent, waiting for plan phase...');

      // Wait for plan text to appear (before "Start research" button)
      const start = Date.now();
      let planFound = false;

      while (Date.now() - start < TIMEOUT) {
        // Look for the research plan / reasoning content
        const planText = await page.evaluate(() => {
          const results: string[] = [];

          // Look for plan-related content in the response area
          const responseContainers = document.querySelectorAll('.model-response-text');
          for (const container of responseContainers) {
            const text = container.textContent?.trim() ?? '';
            if (text.length > 20) {
              results.push(text.slice(0, 1000));
            }
          }

          // Look for any elements mentioning "plan", "research", "step"
          const allEls = document.querySelectorAll('[class*="plan"], [class*="research"], [class*="step"]');
          for (const el of allEls) {
            const t = el.textContent?.trim() ?? '';
            if (t.length > 20) results.push(t.slice(0, 500));
          }

          // Look for progress/status text
          const progressEls = document.querySelectorAll('[class*="progress"], [class*="status"]');
          for (const el of progressEls) {
            const t = el.textContent?.trim() ?? '';
            if (t.length > 5) results.push(`[progress]: ${t}`);
          }

          // Look for a "Start" button (indicates plan phase)
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const btn of buttons) {
            const t = btn.textContent?.trim() ?? '';
            if (t.includes('Start') || t.includes('research') || t.includes('Begin')) {
              results.push(`[button]: "${t}"`);
            }
          }

          return results.join('\n---\n');
        }).catch(() => '');

        if (planText.length > 50) {
          console.log(`[A8-c] Plan/reasoning content found (${planText.length} chars)`);
          content = planText;
          planFound = true;
          extracted = true;
          break;
        }

        // Also try the thinking extraction
        const thinking = await extractThinkingContent(page);
        if (thinking.length > 20) {
          content = thinking;
          extracted = true;
          console.log(`[A8-c] Thinking content found (${thinking.length} chars)`);
          planFound = true;
          break;
        }

        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 15 === 0) console.log(`[A8-c] Waiting for plan... ${elapsed}s`);

        // Don't wait too long — plan usually appears within 30-60s
        if (elapsed > 120 && !planFound) {
          console.log('[A8-c] No plan text after 120s, giving up');
          break;
        }

        await sleep(3000);
      }

      evidence.push(`(c) Deep Research plan extracted: ${extracted} (${content.length} chars)`);
      if (content) evidence.push(`(c) Preview: ${content.slice(0, 150).replace(/\n/g, '\\n')}...`);

      // Deactivate tool / navigate away to stop research
      try {
        await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await sleep(2000);
      } catch {}

    } catch (err) {
      console.error('[A8-c] Error:', err);
      evidence.push(`(c) Error: ${String(err)}`);
    } finally {
      browser.close().catch(() => {});
    }

    scenarioResults.push({ name: 'Deep Research', extracted, content: content.slice(0, 500) });
  }

  // ─── Aggregate Results ──────────────────────────────────────────
  const passCount = scenarioResults.filter(s => s.extracted).length;
  const verdict = passCount >= 2 ? 'PASS' : 'FAIL';

  console.log(`\n[A8] Results: ${passCount}/3 scenarios extracted thinking content`);
  for (const s of scenarioResults) {
    console.log(`  ${s.name}: ${s.extracted ? 'PASS' : 'FAIL'} (${s.content.length} chars)`);
  }

  // Append results
  const result = `
## A8: Thinking Extraction Quality — ${verdict}

**Date:** ${new Date().toISOString()}

**Scenarios:**
${scenarioResults.map(s => `- **${s.name}**: ${s.extracted ? 'PASS' : 'FAIL'} (${s.content.length} chars extracted)`).join('\n')}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

**Verdict:** ${passCount}/3 scenarios had non-empty thinking/reasoning text (need >= 2 for PASS)

---

`;
  appendFileSync(RESULTS_FILE, result);
  console.log(`[A8] Result: ${verdict}`);
  console.log(`[A8] Written to ${RESULTS_FILE}`);
}

main().catch(err => {
  console.error('[A8] Fatal:', err);
  const result = `
## A8: Thinking Extraction Quality — FAIL

**Date:** ${new Date().toISOString()}

**Evidence:**
- Fatal error: ${String(err)}

---

`;
  appendFileSync(RESULTS_FILE, result);
  process.exit(1);
});
