/**
 * Create Videos (Veo 3.1) — tool-specific module.
 *
 * Handles video generation: type prompt → send → long poll (2-3 min) → detect completion.
 * Expects the tool to already be activated by the caller.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { CHAT_INPUT, STOP_BUTTON, GOOD_RESPONSE } from '../selectors/gemini.v1.js';
const logger = createLogger('gemini');

const log = logger.child({ module: 'create-videos' });

export interface VideoResult {
  /** Response text from Gemini (e.g. "Your video is ready!"). */
  text: string;
  /** Whether a video was generated (Play/Download video button found). */
  hasVideo: boolean;
  /** Whether the video finished generating. */
  videoReady: boolean;
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
 * Type a prompt into the Create Videos input and submit it.
 *
 * When Create Videos is active the chat input is replaced by a Quill rich-text
 * editor that starts disabled (`.ql-disabled`, `contenteditable="false"`).
 * The proven approach is:
 *
 *  (a) Click the "Create video" zero-state card — this enables the Quill editor
 *      through Angular's normal activation flow.
 *  (b) Use Playwright's fill() on the now-enabled `.ql-editor` — this triggers
 *      proper Angular form state updates, enabling the send button.
 *  (c) Press Enter to submit.
 *
 * Fallback: if no zero-state card exists (e.g. on an existing conversation),
 * use the Quill API to enable the editor, then fill() + Enter.
 *
 * Returns true if the prompt was submitted (Enter sent).
 */
async function typeIntoVideoInput(page: Page, prompt: string): Promise<boolean> {
  const hasQuill = await page.locator('.ql-container').first().isVisible().catch(() => false);

  if (hasQuill) {
    // ── (a) Click "Create video" zero-state card to enable the editor ───
    const cardClicked = await page.locator('button[aria-label*="Create video"]')
      .first().click({ timeout: 3000 }).then(() => true).catch(() => false);

    if (cardClicked) {
      log.info('Clicked "Create video" zero-state card to enable editor');
      await page.waitForTimeout(1000);
    } else {
      // No card — enable via Quill API as fallback
      log.info('No zero-state card, enabling Quill via API');
      await page.evaluate(() => {
        const qlContainer = document.querySelector('.ql-container') as any;
        const quill = qlContainer?.__quill;
        if (quill) {
          quill.enable();
          quill.focus();
        }
        const editor = document.querySelector('.ql-editor');
        if (editor) editor.setAttribute('contenteditable', 'true');
      });
      await page.waitForTimeout(500);
    }

    // ── (b) fill() the editor — triggers proper Angular form state ──────
    const editor = page.locator('.ql-editor').first();
    try {
      await editor.fill(prompt);
      log.info('Filled Quill editor via Playwright fill()');
    } catch {
      // fill() may fail if editor still not editable — fall back to Quill API
      log.info('fill() failed, falling back to Quill insertText');
      await page.evaluate((text) => {
        const qlContainer = document.querySelector('.ql-container') as any;
        const quill = qlContainer?.__quill;
        if (quill) {
          quill.enable();
          quill.deleteText(0, quill.getLength());
          quill.insertText(0, text, 'user');
        }
      }, prompt);
    }
    await page.waitForTimeout(300);

    // ── (c) Submit with Enter ───────────────────────────────────────────
    await page.keyboard.press('Enter');

    // Verify submission started
    const stopAppeared = await waitVisible(page, STOP_BUTTON.tiers[0]!, 5000);
    if (stopAppeared) {
      log.info('Video prompt submitted via Enter key');
      return true;
    }

    // Enter didn't work — try clicking the send button
    log.info('Enter did not trigger generation, trying send button');
    const sendClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null;
      if (!btn || btn.getAttribute('aria-disabled') === 'true') return false;
      btn.click();
      return true;
    }).catch(() => false);

    if (sendClicked) {
      log.info('Clicked enabled send button');
      return true;
    }

    // Last resort: force the send button
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null;
      if (btn) {
        btn.removeAttribute('aria-disabled');
        btn.disabled = false;
        btn.style.pointerEvents = 'auto';
        btn.click();
      }
    }).catch(() => {});
    return true;
  }

  // ── Fallback: standard CHAT_INPUT fill ────────────────────────────────
  log.info('No Quill editor, falling back to standard CHAT_INPUT fill');
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) return false;
  await input.click({ force: true });
  await input.fill(prompt);
  await page.keyboard.press('Enter');
  return true;
}

/**
 * Execute a video generation prompt against the Gemini UI.
 *
 * Precondition: Create Videos tool must already be activated.
 *
 * @param page - Playwright page connected via CDP
 * @param prompt - Video description prompt
 * @param timeoutMs - Max wait for video generation (default 240s for Veo 3.1)
 */
export async function executeVideoGeneration(
  page: Page,
  prompt: string,
  timeoutMs: number = 240_000,
): Promise<VideoResult> {
  log.info({ promptLength: prompt.length, timeoutMs }, 'Starting video generation');

  // 1. Type prompt — Create Videos uses a Quill editor that may be disabled
  //    (ql-disabled class, contenteditable="false"), so standard fill won't work.
  const submitted = await typeIntoVideoInput(page, prompt);
  if (!submitted) throw new Error('Failed to type and submit video prompt');
  log.info('Video prompt submitted');

  // 3. Wait for generation to START — Stop button must appear first
  const startTime = Date.now();
  const stopSelector = STOP_BUTTON.tiers[0]!;
  const goodSelector = GOOD_RESPONSE.tiers[0]!;

  let generationStarted = false;
  for (let i = 0; i < 20; i++) {
    if (await waitVisible(page, stopSelector, 2000)) {
      generationStarted = true;
      log.info('Video generation started (Stop button appeared)');
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!generationStarted) {
    log.warn('Stop button never appeared — generation may not have started');
  }

  // 4. Long poll — wait for Stop button to disappear + Good response to appear
  while (Date.now() - startTime < timeoutMs) {
    const isGenerating = await waitVisible(page, stopSelector, 2000);
    const isDone = await waitVisible(page, goodSelector, 2000);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log.info({ elapsed, generating: isGenerating, done: isDone }, 'Video poll');

    if (generationStarted && !isGenerating && isDone) {
      log.info({ elapsed }, 'Video generation complete');
      break;
    }

    await page.waitForTimeout(5000); // Poll every 5s for long generation
  }

  if (Date.now() - startTime >= timeoutMs) {
    log.warn('Video generation timed out');
  }

  // 5. Wait for rendering to settle
  await page.waitForTimeout(3000);

  // 6. Detect video presence using waitFor
  const playSelector = 'role=button[name="Play video"]';
  const downloadSelector = 'role=button[name="Download video"]';
  const shareSelector = 'role=button[name="Share video"]';

  const hasPlay = await waitVisible(page, playSelector, 5000);
  const hasDownload = await waitVisible(page, downloadSelector, 3000);
  const hasShare = await waitVisible(page, shareSelector, 2000);

  const hasVideo = hasPlay || hasDownload || hasShare;

  log.info({ hasPlay, hasDownload, hasShare }, 'Video detection results');

  // 7. Extract response text
  let text = '';
  try {
    text = await page.evaluate(() => {
      // Try .model-response-text first
      const containers = document.querySelectorAll('.model-response-text');
      if (containers.length > 0) {
        const t = containers[containers.length - 1]!.textContent?.trim() ?? '';
        if (t.length > 0) return t;
      }
      // Fallback: largest [class*="markdown"] container
      const markdownEls = Array.from(document.querySelectorAll('[class*="markdown"]'));
      if (markdownEls.length > 0) {
        let largest = markdownEls[0]!;
        let maxLen = largest.textContent?.length ?? 0;
        for (const el of markdownEls) {
          const len = el.textContent?.length ?? 0;
          if (len > maxLen) { largest = el; maxLen = len; }
        }
        if (maxLen > 0) return largest.textContent?.trim() ?? '';
      }
      return '';
    });
  } catch {
    log.warn('Failed to extract video response text');
  }

  const result: VideoResult = {
    text,
    hasVideo,
    videoReady: hasVideo,
  };

  log.info({ hasVideo, textLength: text.length }, 'Video generation result');
  return result;
}
