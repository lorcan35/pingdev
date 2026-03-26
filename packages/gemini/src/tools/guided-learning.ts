/**
 * Guided Learning — structured educational response extraction.
 *
 * Flow: activate → type topic → send → poll until done → extract text + images + follow-ups.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { STOP_BUTTON, GOOD_RESPONSE, CHAT_INPUT } from '../selectors/gemini.v1.js';

const logger = createLogger('gemini');
const log = logger.child({ module: 'guided-learning' });

export interface GuidedLearningResult {
  text: string;
  images: string[];
  hasFollowUpOptions: boolean;
}

/**
 * Execute a Guided Learning flow on an already-activated Guided Learning tool.
 *
 * @param page - Playwright page with Guided Learning active
 * @param prompt - Learning topic to explore
 * @param timeoutMs - Max wait for response (default 120s)
 */
export async function executeGuidedLearning(
  page: Page,
  prompt: string,
  timeoutMs: number = 120_000,
): Promise<GuidedLearningResult> {
  const deadline = Date.now() + timeoutMs;

  // 1. Type learning topic and send
  log.info({ promptLen: prompt.length }, 'Typing Guided Learning topic');
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) throw new Error('Chat input not found for Guided Learning');
  await input.click({ force: true });
  await input.fill(prompt);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  log.info('Guided Learning query submitted');

  // 2. Wait for initial generation (Stop button appears)
  await page.waitForTimeout(3000);

  // 3. Poll until response completes: "Good response" present, "Stop response" absent
  log.info('Polling for Guided Learning response...');
  while (Date.now() < deadline) {
    const stopBtn = await resolveSelector(page, STOP_BUTTON, 1000);
    const goodBtn = await resolveSelector(page, GOOD_RESPONSE, 1000);

    if (!stopBtn && goodBtn) {
      log.info('Guided Learning response complete');
      break;
    }

    await page.waitForTimeout(2000);
  }

  if (Date.now() >= deadline) {
    log.warn('Guided Learning timed out');
  }

  // Wait for final render
  await page.waitForTimeout(2000);

  // 4. Extract full text
  const text = await page.evaluate(() => {
    const containers = document.querySelectorAll('.model-response-text');
    if (containers.length > 0) {
      const last = containers[containers.length - 1]!;
      return last.textContent?.trim() ?? '';
    }
    return '';
  });

  // 5. Extract image descriptions from "Image of ..." buttons
  const images = await page.evaluate(() => {
    const imageButtons = document.querySelectorAll('button[aria-label^="Image of"]');
    const descriptions: string[] = [];
    imageButtons.forEach((btn) => {
      const label = btn.getAttribute('aria-label') ?? '';
      if (label.startsWith('Image of')) {
        descriptions.push(label);
      }
    });
    // Also try buttons whose text starts with "Image of"
    if (descriptions.length === 0) {
      document.querySelectorAll('button').forEach((btn) => {
        const text = btn.textContent?.trim() ?? '';
        if (text.startsWith('Image of')) {
          descriptions.push(text);
        }
      });
    }
    return descriptions;
  });

  // 6. Check for follow-up learning path options
  //    Guided Learning typically ends with numbered options like:
  //    "1. The Solar Panels: Explore how..."
  //    "2. The Sugar Factory: Dive into..."
  const hasFollowUpOptions = await page.evaluate(() => {
    const containers = document.querySelectorAll('.model-response-text');
    if (containers.length === 0) return false;
    const last = containers[containers.length - 1]!;
    const text = last.textContent ?? '';
    // Check for numbered learning path options or exploration prompts
    const hasNumberedPaths = /\d+\.\s+\*?\*?[A-Z]/.test(text);
    const hasExplorePrompt = /where would you like|which.*explore|what.*next/i.test(text);
    return hasNumberedPaths || hasExplorePrompt;
  });

  log.info({ textLen: text.length, imageCount: images.length, hasFollowUpOptions }, 'Guided Learning extraction done');

  return { text, images, hasFollowUpOptions };
}
