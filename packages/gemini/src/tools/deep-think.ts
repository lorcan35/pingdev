/**
 * Deep Think — extended deliberation with thinking panel.
 *
 * Flow: activate → type question → send → long poll → extract answer + thinking metadata.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { STOP_BUTTON, GOOD_RESPONSE, CHAT_INPUT } from '../selectors/gemini.v1.js';
const logger = createLogger('gemini');

const log = logger.child({ module: 'deep-think' });

export interface DeepThinkResult {
  text: string;
  hasThinkingPanel: boolean;
  generationCardSeen: boolean;
}

/**
 * Execute a Deep Think flow on an already-activated Deep Think tool.
 *
 * @param page - Playwright page with Deep Think active
 * @param prompt - Complex question to ask
 * @param timeoutMs - Max wait for response (default 300s — Deep Think is slow)
 */
export async function executeDeepThink(
  page: Page,
  prompt: string,
  timeoutMs: number = 300_000,
): Promise<DeepThinkResult> {
  const result: DeepThinkResult = {
    text: '',
    hasThinkingPanel: false,
    generationCardSeen: false,
  };

  const deadline = Date.now() + timeoutMs;

  // 1. Type question and send
  log.info({ promptLen: prompt.length }, 'Typing Deep Think question');
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) throw new Error('Chat input not found for Deep Think');
  await input.click({ force: true });
  await input.fill(prompt);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  log.info('Deep Think question submitted');

  // 2. Wait for initial generation indicator
  await page.waitForTimeout(3000);

  // 3. Check for "Generating your response" card
  const genCardVisible = await page.evaluate(() => {
    return document.body?.innerText?.includes('Generating your response') ?? false;
  }).catch(() => false);
  if (genCardVisible) {
    result.generationCardSeen = true;
    log.info('"Generating your response" card detected');
  }

  // 4. Long poll until completion: "Good response" present, "Stop response" absent
  log.info('Polling for Deep Think response (may take minutes)...');
  while (Date.now() < deadline) {
    // Periodically check for generation card if we haven't seen it yet
    if (!result.generationCardSeen) {
      const genCard = await page.evaluate(() => {
        return document.body?.innerText?.includes('Generating your response') ?? false;
      }).catch(() => false);
      if (genCard) {
        result.generationCardSeen = true;
        log.info('"Generating your response" card detected (late)');
      }
    }

    const stopBtn = await resolveSelector(page, STOP_BUTTON, 1000);
    const goodBtn = await resolveSelector(page, GOOD_RESPONSE, 1000);

    if (!stopBtn && goodBtn) {
      log.info('Deep Think response complete');
      break;
    }

    await page.waitForTimeout(3000);
  }

  if (Date.now() >= deadline) {
    log.warn('Deep Think timed out');
  }

  // Wait for final render
  await page.waitForTimeout(2000);

  // 5. Extract answer text
  result.text = await page.evaluate(() => {
    const containers = document.querySelectorAll('.model-response-text');
    if (containers.length > 0) {
      const last = containers[containers.length - 1]!;
      return last.textContent?.trim() ?? '';
    }
    return '';
  });

  // 6. Check for "Show thinking" panel
  //    The thinking toggle is a button/status with "Show thinking" text,
  //    or expand_more/expand_less icon near the response
  result.hasThinkingPanel = await page.evaluate(() => {
    // Check for status element
    const statusEls = Array.from(document.querySelectorAll('[role="status"]'));
    for (const el of statusEls) {
      if (el.textContent?.includes('Show thinking')) return true;
    }
    // Check for any element with "Show thinking" text near response
    const allText = document.body?.innerText ?? '';
    return allText.includes('Show thinking');
  });

  log.info({
    textLen: result.text.length,
    hasThinkingPanel: result.hasThinkingPanel,
    generationCardSeen: result.generationCardSeen,
  }, 'Deep Think extraction done');

  return result;
}
