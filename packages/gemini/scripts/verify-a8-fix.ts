/**
 * Verify A8 fix — extractThinking() using [class*="thought"] + "Show thinking" button click.
 * Quick test: Deep Think tool → math question → verify thinking extraction.
 */
import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:18800';
const GEMINI_URL = 'https://gemini.google.com/u/1/app';

async function main() {
  console.log('Connecting to CDP...');
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15_000 });
  const context = browser.contexts()[0]!;
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('gemini.google.com')) ?? pages[0]!;

  console.log('Navigating to fresh Gemini chat...');
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Activate Deep Think tool
  console.log('Activating Deep Think...');
  await page.locator('role=button[name="Tools"]').first().click();
  await page.waitForTimeout(500);
  const deepThinkItem = page.locator('role=menuitemcheckbox[name="Deep Think"]').first();
  await deepThinkItem.waitFor({ state: 'visible', timeout: 5000 });
  await deepThinkItem.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Verify chip
  const chipVisible = await page.locator('role=button[name="Deselect Deep Think"]').first()
    .isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`Deep Think chip visible: ${chipVisible}`);

  // Send prompt
  console.log('Sending math prompt...');
  const input = page.locator('role=textbox[name=/Ask Gemini|Enter a prompt/i]').first();
  await input.click({ force: true });
  await input.fill('What is 127 * 191?');
  await page.keyboard.press('Enter');
  console.log('Waiting for response...');

  // Wait for completion
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const isDone = await page.locator('role=button[name="Good response"]').first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (isDone) { console.log('Response complete!'); break; }
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 10 === 0) console.log(`  Waiting... ${elapsed}s`);
    await page.waitForTimeout(2000);
  }

  // --- Test the extractThinking logic ---

  // Step 1: Click "Show thinking" button (Playwright locator, outside evaluate)
  console.log('\nStep 1: Clicking "Show thinking" button...');
  try {
    const showBtn = page.locator('button', { hasText: /Show thinking/i }).first();
    await showBtn.click({ timeout: 3000 });
    console.log('  Clicked "Show thinking" button');
    await page.waitForTimeout(500);
  } catch {
    console.log('  No "Show thinking" button (may already be expanded)');
  }

  // Also try "Thought for" button variant
  try {
    const thoughtBtn = page.locator('button', { hasText: /Thought for/i }).first();
    const vis = await thoughtBtn.isVisible({ timeout: 1000 });
    if (vis) {
      await thoughtBtn.click();
      console.log('  Clicked "Thought for..." button');
      await page.waitForTimeout(500);
    }
  } catch { /* ok */ }

  // Step 2: Extract text from [class*="thought"] elements
  console.log('Step 2: Extracting from [class*="thought"] elements...');
  const thoughtText = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="thought"]');
    if (els.length > 0) {
      return Array.from(els)
        .map(el => el.textContent?.trim() ?? '')
        .filter(t => t.length > 0)
        .join('\n');
    }
    return '';
  });

  const thoughtCount = await page.evaluate(() => document.querySelectorAll('[class*="thought"]').length);
  console.log(`  Found ${thoughtCount} [class*="thought"] elements`);
  console.log(`  Extracted text length: ${thoughtText.length}`);

  if (thoughtText.length > 0) {
    console.log(`  First 300 chars: ${thoughtText.slice(0, 300)}`);
    console.log('\nA8 VERIFY PASSED: thinking extraction via [class*="thought"] works');
  } else {
    console.log('\nWARNING: No text from [class*="thought"]. Checking page state...');
    // Debug: list all thinking-related elements
    const debug = await page.evaluate(() => {
      const info: string[] = [];
      const btns = Array.from(document.querySelectorAll('button'));
      for (const b of btns) {
        const t = b.textContent?.trim() ?? '';
        if (t.toLowerCase().includes('think') || t.toLowerCase().includes('thought')) {
          info.push(`button: "${t}"`);
        }
      }
      // Check any thought-like classes
      for (const sel of ['[class*="thought"]', '[class*="thinking"]', '[class*="reasoning"]']) {
        const els = document.querySelectorAll(sel);
        info.push(`${sel}: ${els.length} elements`);
      }
      return info.join('\n');
    });
    console.log(debug);
    throw new Error('A8 VERIFY FAILED: no thinking text extracted');
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
