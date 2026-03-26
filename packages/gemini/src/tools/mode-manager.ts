/**
 * Mode Manager — switches between Gemini modes (Fast, Thinking, Pro).
 *
 * Uses the mode picker dropdown which contains menuitemradio options.
 */
import type { Page } from 'playwright';
import type { GeminiMode } from '../types/index.js';
import { MODE_PICKER, MODE_ITEMS } from '../selectors/gemini.v1.js';
import { createLogger } from '@pingdev/core';
const logger = createLogger('gemini');

const log = logger.child({ module: 'mode-manager' });

/** Map mode names to expected picker button text patterns. */
const MODE_LABELS: Record<GeminiMode, RegExp> = {
  fast: /Fast/i,
  thinking: /Thinking/i,
  pro: /Pro/i,
};

/**
 * Get the currently selected Gemini mode by reading the mode picker button text.
 */
export async function getCurrentMode(page: Page): Promise<GeminiMode | null> {
  const pickerSelector = MODE_PICKER.tiers[0]!;

  // Wait for mode picker to be visible
  try {
    await page.locator(pickerSelector).first().waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    log.warn('Mode picker not visible');
    return null;
  }

  const text = await page.locator(pickerSelector).first().textContent();
  if (!text) return null;

  // Check in order: most specific first to avoid substring matches
  // "Pro" must be checked before patterns that could match substrings
  for (const [mode, pattern] of Object.entries(MODE_LABELS)) {
    if (pattern.test(text)) {
      return mode as GeminiMode;
    }
  }

  log.warn({ text }, 'Could not determine current mode from picker text');
  return null;
}

/**
 * Switch to a different Gemini mode.
 *
 * 1. Click the mode picker button
 * 2. Wait for dropdown with menuitemradio items
 * 3. Click the desired mode
 * 4. Dropdown auto-closes
 * 5. Verify mode picker button text changed
 */
export async function switchMode(page: Page, mode: GeminiMode): Promise<void> {
  const modeItemDef = MODE_ITEMS[mode];
  if (!modeItemDef) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  // Check if already in the desired mode
  const current = await getCurrentMode(page);
  if (current === mode) {
    log.info({ mode }, 'Already in desired mode, skipping switch');
    return;
  }

  log.info({ from: current, to: mode }, 'Switching mode');

  // 1. Click mode picker to open dropdown
  const pickerSelector = MODE_PICKER.tiers[0]!;
  await page.locator(pickerSelector).first().click({ force: true });
  await page.waitForTimeout(500);

  // 2. Click the desired mode's menuitemradio
  const modeSelector = modeItemDef.tiers[0]!;
  await page.locator(modeSelector).first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator(modeSelector).first().click({ force: true });
  await page.waitForTimeout(500);

  // 3. Verify mode changed
  const newMode = await getCurrentMode(page);
  if (newMode !== mode) {
    throw new Error(`Mode switch failed: expected ${mode}, got ${newMode}`);
  }

  log.info({ mode }, 'Mode switched successfully');
}
