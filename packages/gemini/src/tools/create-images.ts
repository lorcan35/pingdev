/**
 * Create Images — tool-specific module.
 *
 * Handles image generation: type prompt → send → poll → detect image controls.
 * Expects the tool to already be activated by the caller.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { CHAT_INPUT, STOP_BUTTON, GOOD_RESPONSE } from '../selectors/gemini.v1.js';
const logger = createLogger('gemini');

const log = logger.child({ module: 'create-images' });

export interface ImageResult {
  /** Response text from Gemini (may be empty for pure image responses). */
  text: string;
  /** Whether an image was generated (download button or image button found). */
  hasImage: boolean;
  /** List of image button labels found. */
  imageButtons: string[];
}

/**
 * Wait for a locator to become visible, returning true/false.
 */
async function waitVisible(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an image generation prompt against the Gemini UI.
 *
 * Precondition: Create Images tool must already be activated.
 *
 * @param page - Playwright page connected via CDP
 * @param prompt - Image description prompt
 * @param timeoutMs - Max wait for image generation (default 90s)
 */
export async function executeImageGeneration(
  page: Page,
  prompt: string,
  timeoutMs: number = 90_000,
): Promise<ImageResult> {
  log.info({ promptLength: prompt.length, timeoutMs }, 'Starting image generation');

  // 1. Type prompt into the chat input
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) throw new Error('Chat input not found for image generation');
  await input.click({ force: true });
  await input.fill(prompt);

  // 2. Press Enter to send
  await page.keyboard.press('Enter');
  log.info('Image prompt submitted');

  // 3. Wait for generation to START — Stop button must appear first
  const startTime = Date.now();
  const stopSelector = STOP_BUTTON.tiers[0]!;
  const goodSelector = GOOD_RESPONSE.tiers[0]!;

  let generationStarted = false;
  for (let i = 0; i < 15; i++) {
    if (await waitVisible(page, stopSelector, 2000)) {
      generationStarted = true;
      log.info('Image generation started (Stop button appeared)');
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!generationStarted) {
    log.warn('Stop button never appeared — generation may not have started');
  }

  // 4. Poll until Stop disappears AND Good response appears
  while (Date.now() - startTime < timeoutMs) {
    const isGenerating = await waitVisible(page, stopSelector, 1500);
    const isDone = await waitVisible(page, goodSelector, 1500);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log.info({ elapsed, generating: isGenerating, done: isDone }, 'Image poll');

    if (generationStarted && !isGenerating && isDone) {
      log.info({ elapsed }, 'Image generation complete');
      break;
    }

    await page.waitForTimeout(2000);
  }

  if (Date.now() - startTime >= timeoutMs) {
    log.warn('Image generation timed out');
  }

  // 5. Wait for rendering to settle after generation completes
  await page.waitForTimeout(3000);

  // 6. Detect image presence using waitFor (not resolveSelector)
  const imageButtons: string[] = [];
  const downloadSelector = 'role=button[name="Download full size image"]';
  const shareImageSelector = 'role=button[name="Share image"]';
  const copyImageSelector = 'role=button[name="Copy image"]';

  const hasDownload = await waitVisible(page, downloadSelector, 5000);
  const hasShare = await waitVisible(page, shareImageSelector, 2000);
  const hasCopy = await waitVisible(page, copyImageSelector, 2000);

  const hasImage = hasDownload || hasShare || hasCopy;

  if (hasDownload) imageButtons.push('Download full size image');
  if (hasShare) imageButtons.push('Share image');
  if (hasCopy) imageButtons.push('Copy image');

  log.info({ hasDownload, hasShare, hasCopy }, 'Image detection results');

  // 7. Extract response text (may be empty for pure image responses)
  let text = '';
  try {
    text = await page.evaluate(() => {
      const containers = document.querySelectorAll('.model-response-text');
      if (containers.length > 0) {
        return containers[containers.length - 1]!.textContent?.trim() ?? '';
      }
      return '';
    });
  } catch {
    log.warn('Failed to extract image response text');
  }

  const result: ImageResult = {
    text,
    hasImage,
    imageButtons,
  };

  log.info({ hasImage, imageButtonCount: imageButtons.length, textLength: text.length }, 'Image generation result');
  return result;
}
