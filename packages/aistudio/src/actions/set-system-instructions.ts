import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Open system instructions panel to set system prompt for the model. */
export const setSystemInstructions: ActionHandler = async (ctx) => {
  const sysBtn = await ctx.resolveSelector(selectors['system-instructions'], 5000);
  if (!sysBtn) {
    ctx.log.warn('System instructions button not found');
    return;
  }

  await sysBtn.click();
  await new Promise(r => setTimeout(r, 500));

  // If instructions text is provided via metadata, fill it in
  const instructions = ctx.jobRequest.metadata?.['systemInstructions'] as string | undefined;
  if (instructions) {
    const textarea = ctx.page.locator('textarea').first();
    try {
      await textarea.fill(instructions, { timeout: 3000 });
      ctx.log.info('System instructions set');
    } catch {
      ctx.log.warn('Could not fill system instructions textarea');
    }
  } else {
    ctx.log.info('System instructions panel opened');
  }
};
