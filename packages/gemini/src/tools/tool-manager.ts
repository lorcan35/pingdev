/**
 * Tool Manager — generic tool activation/deactivation for Gemini UI.
 *
 * Handles toggling tools via the Tools menu and detecting active state
 * via deselect chips that appear near the input when a tool is active.
 */
import type { Page } from 'playwright';
import type { GeminiTool } from '../types/index.js';
import { TOOLS_BUTTON, TOOL_MENU_ITEMS, TOOL_DESELECT_CHIPS } from '../selectors/gemini.v1.js';
import { createLogger } from '@pingdev/core';
const logger = createLogger('gemini');

const log = logger.child({ module: 'tool-manager' });

/**
 * Wait for a selector (first tier) to become visible, with a real timeout.
 * Unlike resolveSelector's isVisible (which returns instantly), this uses waitFor.
 */
async function waitForSelector(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a tool is currently active by looking for its deselect chip.
 */
export async function isToolActive(page: Page, toolName: GeminiTool): Promise<boolean> {
  const chipDef = TOOL_DESELECT_CHIPS[toolName];
  if (!chipDef) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Quick check — chip either exists or doesn't
  try {
    const visible = await page.locator(chipDef.tiers[0]!).first().isVisible();
    return visible;
  } catch {
    return false;
  }
}

/**
 * Activate a tool via the Tools menu.
 *
 * 1. Opens the Tools menu
 * 2. Clicks the tool's menuitemcheckbox
 * 3. Closes the menu (Escape)
 * 4. Verifies the deselect chip appeared
 */
export async function activateTool(page: Page, toolName: GeminiTool): Promise<void> {
  const menuItemDef = TOOL_MENU_ITEMS[toolName];
  const chipDef = TOOL_DESELECT_CHIPS[toolName];
  if (!menuItemDef || !chipDef) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Check if already active
  if (await isToolActive(page, toolName)) {
    log.info({ tool: toolName }, 'Tool already active, skipping activation');
    return;
  }

  log.info({ tool: toolName }, 'Activating tool');

  // 1. Open Tools menu — wait for button to be visible first
  const toolsSelector = TOOLS_BUTTON.tiers[0]!;
  await waitForSelector(page, toolsSelector, 10_000);
  await page.locator(toolsSelector).first().click();
  await page.waitForTimeout(500);

  // 2. Click the tool's toggle — wait for menu item to appear
  const menuSelector = menuItemDef.tiers[0]!;
  await waitForSelector(page, menuSelector, 5000);
  await page.locator(menuSelector).first().click();
  await page.waitForTimeout(300);

  // 3. Close menu by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 4. Verify the deselect chip appeared
  const chipSelector = chipDef.tiers[0]!;
  const chipFound = await waitForSelector(page, chipSelector, 5000);
  if (!chipFound) {
    throw new Error(`Tool activation failed: deselect chip not found for ${toolName}`);
  }

  log.info({ tool: toolName }, 'Tool activated successfully');
}

/**
 * Deactivate a tool by clicking its deselect chip.
 *
 * 1. Find the deselect chip
 * 2. Click it
 * 3. Verify chip is gone
 */
export async function deactivateTool(page: Page, toolName: GeminiTool): Promise<void> {
  const chipDef = TOOL_DESELECT_CHIPS[toolName];
  if (!chipDef) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Check if already inactive
  if (!(await isToolActive(page, toolName))) {
    log.info({ tool: toolName }, 'Tool already inactive, skipping deactivation');
    return;
  }

  log.info({ tool: toolName }, 'Deactivating tool');

  // 1. Click the deselect chip
  const chipSelector = chipDef.tiers[0]!;
  await page.locator(chipSelector).first().click();
  await page.waitForTimeout(500);

  // 2. Verify chip is gone
  const stillActive = await isToolActive(page, toolName);
  if (stillActive) {
    throw new Error(`Tool deactivation failed: deselect chip still present for ${toolName}`);
  }

  log.info({ tool: toolName }, 'Tool deactivated successfully');
}
