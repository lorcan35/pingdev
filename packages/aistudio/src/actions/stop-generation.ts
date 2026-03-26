import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Stop the current response generation. */
export const stopGeneration: ActionHandler = async (ctx) => {
  const stopBtn = await ctx.resolveSelector(selectors['stop-button'], 3000);
  if (!stopBtn) {
    ctx.log.info('Stop button not found — generation may have already completed');
    return;
  }

  await stopBtn.click();
  ctx.log.info('Generation stopped');
};
