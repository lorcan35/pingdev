/**
 * A4: Canvas Follow-up Editing
 *
 * Tests whether sending a follow-up message updates the canvas content.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const CDP_URL = 'http://127.0.0.1:18800';
const GEMINI_URL = 'https://gemini.google.com/u/1/app';
const TIMEOUT = 600_000;
const RESULTS_FILE = 'docs/ASSUMPTION_TESTS.md';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Type text and submit in Gemini input — handles contenteditable issues */
async function typeAndSubmit(page: any, text: string): Promise<boolean> {
  // First, dismiss overlays
  await page.keyboard.press('Escape');
  await sleep(500);

  // Check contenteditable state
  const ceState = await page.evaluate(() => {
    const ed = document.querySelector('.ql-editor');
    return ed?.getAttribute('contenteditable');
  });
  console.log(`  contenteditable: ${ceState}`);

  if (ceState === 'true') {
    // Normal flow: find input, fill, submit
    const inputSelectors = [
      'role=textbox[name=/Let.*write or build together/i]',
      'role=textbox[name="Enter a prompt for Gemini"]',
      'role=textbox[name=/Ask Gemini/i]',
      '.ql-editor[contenteditable="true"]',
    ];
    for (const sel of inputSelectors) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.isVisible({ timeout: 3000 })) {
          await loc.click({ force: true });
          await loc.fill(text);
          await sleep(500);
          await page.keyboard.press('Enter');
          return true;
        }
      } catch {}
    }
  }

  // Force-enable approach
  console.log('  Using force-enable approach');
  await page.locator('.ql-editor').first().click({ force: true });
  await sleep(300);
  await page.evaluate(() => {
    const container = document.querySelector('.ql-container');
    if (container) container.classList.remove('ql-disabled');
    const ed = document.querySelector('.ql-editor') as HTMLElement;
    if (ed) {
      ed.setAttribute('contenteditable', 'true');
      ed.focus();
    }
  });
  await sleep(300);
  await page.keyboard.type(text, { delay: 15 });
  await sleep(500);
  await page.keyboard.press('Enter');
  return true;
}

/** Wait for response to complete */
async function waitForResponse(page: any, timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const isDone = await page.locator('role=button[name="Good response"]').first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    const isGen = await page.locator('role=button[name="Stop response"]').first()
      .isVisible({ timeout: 1000 }).catch(() => false);

    if (isDone && !isGen) return true;

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 20 === 0) console.log(`  Waiting... ${elapsed}s, gen=${isGen}, done=${isDone}`);
    await sleep(3000);
  }
  return false;
}

/** Extract code from Monaco editor or code blocks */
async function extractCode(page: any): Promise<string> {
  return page.evaluate(() => {
    // Strategy 1: Monaco .view-line elements
    const viewLines = document.querySelectorAll('.view-line');
    if (viewLines.length > 0) {
      return Array.from(viewLines).map(el => el.textContent ?? '').join('\n');
    }

    // Strategy 2: Code blocks in response
    const codeBlocks = document.querySelectorAll('pre code, code');
    if (codeBlocks.length > 0) {
      return codeBlocks[codeBlocks.length - 1]!.textContent?.trim() ?? '';
    }

    // Strategy 3: Monaco-related elements
    const monacoEls = document.querySelectorAll('[class*="monaco"], [class*="editor-container"]');
    for (const el of monacoEls) {
      const text = el.textContent?.trim() ?? '';
      if (text.length > 10) return text;
    }

    return '';
  });
}

async function main() {
  console.log('[A4] Starting Canvas Follow-up Editing test...');

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
  const ctx = browser.contexts()[0]!;
  const page = ctx.pages().find(p => p.url().includes('gemini.google.com')) ?? ctx.pages()[0]!;

  const evidence: string[] = [];
  let verdict = 'FAIL';

  try {
    // Step 1: Fresh chat
    console.log('[A4] Navigating to fresh chat...');
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(4000);
    await page.keyboard.press('Escape');
    await sleep(500);

    // Step 2: Activate Canvas tool
    console.log('[A4] Activating Canvas tool...');
    await page.locator('role=button[name="Tools"]').first().click();
    await sleep(500);
    await page.locator('role=menuitemcheckbox[name="Canvas"]').first().click();
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(1000);

    const chipVisible = await page.locator('role=button[name="Deselect Canvas"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[A4] Canvas activated: ${chipVisible}`);
    evidence.push(`Tool activation: ${chipVisible ? 'confirmed' : 'failed'}`);

    // Step 3: Send initial prompt
    console.log('[A4] Sending first prompt: "Write a Python hello world"');
    await typeAndSubmit(page, 'Write a Python hello world');
    await sleep(2000);

    // Check if generation started
    const genStarted = await page.locator('role=button[name="Stop response"]').first()
      .isVisible({ timeout: 10_000 }).catch(() => false);
    console.log(`[A4] Generation started: ${genStarted}`);
    evidence.push(`First prompt generation started: ${genStarted}`);

    // Step 4: Wait for canvas to appear + response to complete
    console.log('[A4] Waiting for canvas and response...');
    const canvasStart = Date.now();
    let canvasAppeared = false;
    let responseComplete = false;

    while (Date.now() - canvasStart < TIMEOUT) {
      // Check for Monaco editor
      const viewLineCount = await page.evaluate(() =>
        document.querySelectorAll('.view-line').length
      ).catch(() => 0);

      const isDone = await page.locator('role=button[name="Good response"]').first()
        .isVisible({ timeout: 1000 }).catch(() => false);
      const isGen = await page.locator('role=button[name="Stop response"]').first()
        .isVisible({ timeout: 1000 }).catch(() => false);

      if (viewLineCount > 0 && !canvasAppeared) {
        console.log(`[A4] Canvas appeared! ${viewLineCount} view-line elements`);
        canvasAppeared = true;
      }

      if (isDone && !isGen) {
        console.log('[A4] First response complete');
        responseComplete = true;
        break;
      }

      const elapsed = Math.round((Date.now() - canvasStart) / 1000);
      if (elapsed % 15 === 0) {
        console.log(`[A4] ${elapsed}s: gen=${isGen}, done=${isDone}, viewLines=${viewLineCount}`);
      }
      await sleep(3000);
    }

    evidence.push(`Canvas appeared: ${canvasAppeared} (${Math.round((Date.now() - canvasStart) / 1000)}s)`);
    evidence.push(`First response complete: ${responseComplete}`);

    // Step 5: Extract initial code
    await sleep(3000);
    const code1 = await extractCode(page);
    console.log(`[A4] Initial code (${code1.length} chars):`);
    console.log(code1.slice(0, 300));
    evidence.push(`Initial code: ${code1.length} chars`);
    if (code1) evidence.push(`Code1 preview: ${code1.slice(0, 100).replace(/\n/g, '\\n')}`);

    // Take screenshot of initial state
    try { await page.screenshot({ path: 'docs/a4-canvas-initial.png' }); } catch {}

    // Step 6: Send follow-up
    console.log('[A4] Sending follow-up: "Add a function that takes a name parameter and prints a greeting"');
    await sleep(2000);
    await typeAndSubmit(page, 'Add a function that takes a name parameter and prints a greeting');
    await sleep(2000);

    // Step 7: Wait for update
    console.log('[A4] Waiting for canvas update...');
    const updateComplete = await waitForResponse(page, TIMEOUT);
    evidence.push(`Follow-up response complete: ${updateComplete}`);

    // Step 8: Extract updated code
    await sleep(3000);
    const code2 = await extractCode(page);
    console.log(`[A4] Updated code (${code2.length} chars):`);
    console.log(code2.slice(0, 300));
    evidence.push(`Updated code: ${code2.length} chars`);
    if (code2) evidence.push(`Code2 preview: ${code2.slice(0, 100).replace(/\n/g, '\\n')}`);

    // Take screenshot of updated state
    try { await page.screenshot({ path: 'docs/a4-canvas-updated.png' }); } catch {}

    // Step 9: Compare
    const codesDiffer = code1 !== code2 && code2.length > 0;
    evidence.push(`Codes differ: ${codesDiffer}`);
    evidence.push(`Code1 length: ${code1.length}, Code2 length: ${code2.length}`);

    if (codesDiffer) {
      verdict = 'PASS';
    } else if (code1.length === 0 && code2.length === 0) {
      evidence.push('Both codes empty — Monaco editor may not have rendered');
      // Check if there's code in the response text instead
      const respCode = await page.evaluate(() => {
        const resp = document.querySelectorAll('.model-response-text');
        return resp.length > 0 ? resp[resp.length - 1]!.textContent?.trim()?.slice(0, 300) ?? '' : '';
      });
      if (respCode) evidence.push(`Response text: ${respCode.slice(0, 200)}`);
    }

    // Deactivate
    try {
      const d = page.locator('role=button[name="Deselect Canvas"]').first();
      if (await d.isVisible({ timeout: 2000 }).catch(() => false)) {
        await d.click();
        await sleep(500);
      }
    } catch {}

  } catch (err) {
    console.error('[A4] Error:', err);
    evidence.push(`Error: ${String(err)}`);
  } finally {
    browser.close().catch(() => {});
  }

  const result = `
## A4: Canvas Follow-up Editing — ${verdict}

**Date:** ${new Date().toISOString()}

**Evidence:**
${evidence.map(e => `- ${e}`).join('\n')}

---

`;
  appendFileSync(RESULTS_FILE, result);
  console.log(`\n[A4] VERDICT: ${verdict}`);
}

main().catch(err => {
  console.error('[A4] Fatal:', err);
  appendFileSync(RESULTS_FILE, `\n## A4: Canvas Follow-up Editing — FAIL\n\n**Date:** ${new Date().toISOString()}\n\n**Evidence:**\n- Fatal error: ${String(err)}\n\n---\n\n`);
  process.exit(1);
});
