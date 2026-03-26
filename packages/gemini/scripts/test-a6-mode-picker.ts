/**
 * A6 Test — Verify mode picker force:true clicks work.
 * Connects to CDP, navigates to fresh chat, switches Fast → Thinking.
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
  await page.waitForTimeout(2000);

  // Dismiss overlays
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const pickerSelector = 'role=button[name="Open mode picker"]';

  // Read current mode
  const initialText = await page.locator(pickerSelector).first().textContent();
  console.log(`Current mode picker text: "${initialText}"`);

  // Switch to Fast
  console.log('Switching to Fast...');
  await page.locator(pickerSelector).first().click({ force: true });
  await page.waitForTimeout(500);
  const fastItem = page.locator('role=menuitemradio[name=/^Fast/i]').first();
  await fastItem.waitFor({ state: 'visible', timeout: 5000 });
  await fastItem.click({ force: true });
  await page.waitForTimeout(1000);

  const afterFast = await page.locator(pickerSelector).first().textContent();
  console.log(`After Fast switch: "${afterFast}"`);
  if (!afterFast?.toLowerCase().includes('fast')) {
    throw new Error(`Expected "Fast" in picker text, got: "${afterFast}"`);
  }
  console.log('Fast switch OK');

  // Switch to Thinking
  console.log('Switching to Thinking...');
  await page.locator(pickerSelector).first().click({ force: true });
  await page.waitForTimeout(500);
  const thinkItem = page.locator('role=menuitemradio[name=/^Thinking/i]').first();
  await thinkItem.waitFor({ state: 'visible', timeout: 5000 });
  await thinkItem.click({ force: true });
  await page.waitForTimeout(1000);

  const afterThinking = await page.locator(pickerSelector).first().textContent();
  console.log(`After Thinking switch: "${afterThinking}"`);
  if (!afterThinking?.toLowerCase().includes('thinking')) {
    throw new Error(`Expected "Thinking" in picker text, got: "${afterThinking}"`);
  }
  console.log('Thinking switch OK');

  console.log('\nA6 TEST PASSED: force:true mode picker clicks work correctly');
  await browser.close();
}

main().catch(err => {
  console.error('A6 TEST FAILED:', err);
  process.exit(1);
});
