/**
 * Canvas — tool-specific module.
 *
 * Handles Canvas (code/writing): type request → send → detect split pane → extract code.
 * Expects the tool to already be activated by the caller.
 */
import type { Page } from 'playwright';
import { createLogger, resolveSelector } from '@pingdev/core';
import { CHAT_INPUT, STOP_BUTTON, GOOD_RESPONSE } from '../selectors/gemini.v1.js';
const logger = createLogger('gemini');

const log = logger.child({ module: 'canvas' });

export interface CanvasResult {
  /** Chat response text (from the left pane). */
  text: string;
  /** Code/text content from the Canvas editor. */
  canvasContent: string;
  /** Title of the canvas artifact. */
  canvasTitle: string;
  /** Whether the canvas panel appeared. */
  hasCanvas: boolean;
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
 * Execute a Canvas prompt against the Gemini UI.
 *
 * Precondition: Canvas tool must already be activated.
 *
 * @param page - Playwright page connected via CDP
 * @param prompt - Code/writing request prompt
 * @param timeoutMs - Max wait for canvas generation (default 90s)
 */
export async function executeCanvas(
  page: Page,
  prompt: string,
  timeoutMs: number = 90_000,
): Promise<CanvasResult> {
  log.info({ promptLength: prompt.length, timeoutMs }, 'Starting canvas generation');

  // 1. Type prompt into the chat input
  const input = await resolveSelector(page, CHAT_INPUT, 10_000);
  if (!input) throw new Error('Chat input not found for canvas generation');
  await input.click({ force: true });
  await input.fill(prompt);

  // 2. Press Enter to send
  await page.keyboard.press('Enter');
  log.info('Canvas prompt submitted');

  // 3. Wait for generation to START — Stop button must appear first
  const startTime = Date.now();
  const stopSelector = STOP_BUTTON.tiers[0]!;
  const goodSelector = GOOD_RESPONSE.tiers[0]!;
  const editorSelector = 'role=textbox[name="Code Editor"]';
  const closePanelSelector = 'role=button[name="Close panel"]';

  let generationStarted = false;
  for (let i = 0; i < 15; i++) {
    if (await waitVisible(page, stopSelector, 2000)) {
      generationStarted = true;
      log.info('Canvas generation started (Stop button appeared)');
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!generationStarted) {
    log.warn('Stop button never appeared — generation may not have started');
  }

  // 4. Poll until canvas panel appears AND response completes
  let canvasFound = false;

  while (Date.now() - startTime < timeoutMs) {
    const isGenerating = await waitVisible(page, stopSelector, 2000);
    const hasEditor = await waitVisible(page, editorSelector, 2000);
    const hasClosePanel = await waitVisible(page, closePanelSelector, 1000);
    const isDone = await waitVisible(page, goodSelector, 1000);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log.info({
      elapsed,
      generating: isGenerating,
      codeEditor: hasEditor,
      closePanel: hasClosePanel,
      done: isDone,
    }, 'Canvas poll');

    if (hasEditor || hasClosePanel) {
      canvasFound = true;
    }

    // Canvas is ready when we have the editor AND generation is done
    if (canvasFound && generationStarted && !isGenerating && isDone) {
      log.info({ elapsed }, 'Canvas generation complete');
      break;
    }

    await page.waitForTimeout(2000);
  }

  if (Date.now() - startTime >= timeoutMs) {
    log.warn('Canvas generation timed out');
  }

  // 5. Wait for rendering to settle
  await page.waitForTimeout(3000);

  // 6. Extract canvas content from Monaco editor view lines
  //    The Code Editor is a Monaco editor — the <textarea> is always empty.
  //    Actual code is rendered in .view-line elements within the editor container.
  let canvasContent = '';
  const hasEditor = await waitVisible(page, editorSelector, 5000);
  if (hasEditor) {
    canvasFound = true;
    try {
      canvasContent = await page.evaluate(() => {
        const viewLines = document.querySelectorAll('.view-line');
        if (viewLines.length > 0) {
          return Array.from(viewLines).map(l => l.textContent || '').join('\n');
        }
        // Fallback: lines-content container
        const linesContent = document.querySelector('.lines-content');
        return linesContent?.textContent?.trim() ?? '';
      });
    } catch {
      log.warn('Failed to extract canvas content from Monaco editor');
    }
  }

  log.info({ canvasContentLength: canvasContent.length }, 'Canvas content extracted');

  // 7. Extract canvas title from heading level 2 in canvas panel
  let canvasTitle = '';
  try {
    const headings = await page.locator('role=heading[level="2"]').allTextContents();
    // Pick the last non-empty heading (canvas title is usually the rightmost panel heading)
    for (let i = headings.length - 1; i >= 0; i--) {
      const h = headings[i]!.trim();
      if (h && h !== 'Chats') {
        canvasTitle = h;
        break;
      }
    }
  } catch {
    log.warn('Failed to extract canvas title');
  }

  // 8. Extract chat response text from left pane
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
    log.warn('Failed to extract canvas response text');
  }

  const result: CanvasResult = {
    text,
    canvasContent,
    canvasTitle,
    hasCanvas: canvasFound,
  };

  log.info({
    hasCanvas: canvasFound,
    titleLength: canvasTitle.length,
    contentLength: canvasContent.length,
    textLength: text.length,
  }, 'Canvas generation result');

  return result;
}
