import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Set the thinking level (Low/Medium/High) via the thinking level combobox. */
export const setThinkingLevel: ActionHandler = async (ctx) => {
  const combobox = await ctx.resolveSelector(selectors['thinking-level'], 5000);
  if (!combobox) {
    ctx.log.warn('Thinking level combobox not found');
    return;
  }

  await combobox.click();
  await new Promise(r => setTimeout(r, 300));

  const level = ctx.jobRequest.metadata?.['thinkingLevel'] as string | undefined;
  if (level) {
    const option = ctx.page.locator(`[role="option"]`, { hasText: new RegExp(level, 'i') }).first();
    try {
      await option.click({ timeout: 3000 });
      ctx.log.info({ level }, 'Thinking level set');
    } catch {
      ctx.log.warn({ level }, 'Could not find thinking level option');
    }
  } else {
    ctx.log.info('Thinking level combobox opened');
  }
};
