import type { Page, Locator } from 'playwright';
import type { SelectorDef } from '../types.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'selector-resolver' });

export async function resolveSelector(
  page: Page,
  selectorDef: SelectorDef,
  timeoutMs: number = 5000
): Promise<Locator | null> {
  const perTierTimeout = Math.max(1000, Math.floor(timeoutMs / selectorDef.tiers.length));

  for (let i = 0; i < selectorDef.tiers.length; i++) {
    const selector = selectorDef.tiers[i]!;
    try {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible({ timeout: perTierTimeout });
      if (visible) {
        log.debug({ name: selectorDef.name, tier: i + 1, selector }, 'Selector resolved');
        return locator;
      }
    } catch {
      // Tier didn't match — try next
    }
  }

  log.warn({ name: selectorDef.name, tiers: selectorDef.tiers.length }, 'No selector tier matched');
  return null;
}

export async function resolveSelectorOrThrow(
  page: Page,
  selectorDef: SelectorDef,
  timeoutMs: number = 5000
): Promise<Locator> {
  const result = await resolveSelector(page, selectorDef, timeoutMs);
  if (!result) {
    throw new Error(`Selector not found: ${selectorDef.name} (tried ${selectorDef.tiers.length} tiers)`);
  }
  return result;
}
