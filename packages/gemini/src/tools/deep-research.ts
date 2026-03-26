/**
 * Deep Research — multi-phase research flow.
 *
 * Flow: activate → type query → send → wait for plan → click "Start research" → wait for results.
 * Handles plan gate, research failure, and long polling.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { STOP_BUTTON, GOOD_RESPONSE, CHAT_INPUT, TOOL_DESELECT_CHIPS } from '../selectors/gemini.v1.js';
const logger = createLogger('gemini');

const log = logger.child({ module: 'deep-research' });

export interface DeepResearchResult {
  text: string;
  planDetected: boolean;
  researchStarted: boolean;
  researchFailed: boolean;
}

const PLAN_BUTTON = 'role=button[name="Start research"]';
const FAIL_TEXT = 'Research unsuccessful';

/** Check if Deep Research is still active (chip present). */
async function isDeepResearchActive(page: Page): Promise<boolean> {
  try {
    const chip = TOOL_DESELECT_CHIPS['deep_research']!;
    return await page.locator(chip.tiers[0]!).first().isVisible();
  } catch {
    return false;
  }
}

/** Check if the page is still on Gemini. */
async function isOnGemini(page: Page): Promise<boolean> {
  try {
    return page.url().includes('gemini.google.com');
  } catch {
    return false;
  }
}

/**
 * Execute a Deep Research flow on an already-activated Deep Research tool.
 *
 * @param page - Playwright page with Deep Research active
 * @param prompt - Research query to send
 * @param timeoutMs - Max wait for entire flow (default 300s)
 */
export async function executeDeepResearch(
  page: Page,
  prompt: string,
  timeoutMs: number = 300_000,
): Promise<DeepResearchResult> {
  const result: DeepResearchResult = {
    text: '',
    planDetected: false,
    researchStarted: false,
    researchFailed: false,
  };

  const deadline = Date.now() + timeoutMs;

  // 1. Type research query and send
  log.info({ promptLen: prompt.length }, 'Typing Deep Research query');
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) throw new Error('Chat input not found for Deep Research');
  await input.click({ force: true });
  await input.fill(prompt);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  log.info('Deep Research query submitted');

  // 2. Wait for plan generation phase
  log.info('Waiting for research plan...');

  let planFound = false;
  while (Date.now() < deadline) {
    // Verify page is still on Gemini and still in DR context
    if (!(await isOnGemini(page))) {
      throw new Error('Page navigated away from Gemini during Deep Research');
    }

    // Check for plan card ("Start research" button)
    const startBtn = await page.locator(PLAN_BUTTON).first().isVisible().catch(() => false);
    if (startBtn) {
      result.planDetected = true;
      planFound = true;
      log.info('Research plan card detected');
      break;
    }

    // Check for failure
    const failVisible = await page.evaluate((failText) => {
      return document.body?.innerText?.includes(failText) ?? false;
    }, FAIL_TEXT).catch(() => false);
    if (failVisible) {
      result.researchFailed = true;
      log.warn('Deep Research failed: "Research unsuccessful" detected');
      result.text = await extractResponseText(page);
      return result;
    }

    // Check for "Stop response" — if present, still generating (normal)
    const stopBtn = await resolveSelector(page, STOP_BUTTON, 500);
    if (stopBtn) {
      // Still generating — check if response might have completed directly
      // (skip direct-completion check while stop button is visible)
      await page.waitForTimeout(2000);
      continue;
    }

    // Stop button gone — check if response completed without plan phase
    const goodResponse = await resolveSelector(page, GOOD_RESPONSE, 1000);
    if (goodResponse) {
      // Verify there's actual response text (not just a leftover button)
      const text = await extractResponseText(page);
      if (text.length > 0) {
        log.info('Response completed without plan phase (direct response)');
        result.text = text;
        return result;
      }
    }

    await page.waitForTimeout(2000);
  }

  if (!planFound && !result.researchFailed) {
    throw new Error('Timeout waiting for Deep Research plan');
  }

  // 3. Click "Start research" to proceed
  if (result.planDetected) {
    log.info('Clicking "Start research"');
    await page.locator(PLAN_BUTTON).first().click();
    result.researchStarted = true;
    await page.waitForTimeout(2000);
  }

  // 4. Long poll until research completes
  log.info('Waiting for research results...');
  while (Date.now() < deadline) {
    // Verify page is still on Gemini
    if (!(await isOnGemini(page))) {
      throw new Error('Page navigated away from Gemini during Deep Research execution');
    }

    // Check for failure
    const failVisible = await page.evaluate((failText) => {
      return document.body?.innerText?.includes(failText) ?? false;
    }, FAIL_TEXT).catch(() => false);
    if (failVisible) {
      result.researchFailed = true;
      log.warn('Deep Research failed during execution');
      result.text = await extractResponseText(page);
      return result;
    }

    // Check for completion: "Good response" present, "Stop response" absent
    const stopBtn = await resolveSelector(page, STOP_BUTTON, 1000);
    const goodBtn = await resolveSelector(page, GOOD_RESPONSE, 1000);

    if (!stopBtn && goodBtn) {
      // Verify there's actual text
      await page.waitForTimeout(2000);
      const text = await extractResponseText(page);
      if (text.length > 0) {
        log.info('Deep Research completed — extracting results');
        result.text = text;
        return result;
      }
    }

    await page.waitForTimeout(3000);
  }

  // Timeout — extract whatever we have
  log.warn('Deep Research timed out — extracting partial results');
  result.text = await extractResponseText(page);
  return result;
}

/** Extract the latest response text from the page.
 *  Prefers the largest [class*="markdown"] container (which holds the full
 *  Deep Research report, 25K+ chars) over .model-response-text (which may
 *  only contain the short notification text).
 */
async function extractResponseText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Strategy 1: Find the LARGEST [class*="markdown"] container
    const markdownEls = Array.from(document.querySelectorAll('[class*="markdown"]'));
    if (markdownEls.length > 0) {
      let largest = markdownEls[0]!;
      let maxLen = largest.textContent?.length ?? 0;
      for (const el of markdownEls) {
        const len = el.textContent?.length ?? 0;
        if (len > maxLen) {
          largest = el;
          maxLen = len;
        }
      }
      if (maxLen > 0) {
        return largest.textContent?.trim() ?? '';
      }
    }

    // Fallback: .model-response-text
    const containers = document.querySelectorAll('.model-response-text');
    if (containers.length > 0) {
      const last = containers[containers.length - 1]!;
      return last.textContent?.trim() ?? '';
    }
    return '';
  }).catch(() => '');
}
