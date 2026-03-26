import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Open the Get Code panel showing API code for the current prompt/settings. */
export const getCode: ActionHandler = async (ctx) => {
  const codeBtn = await ctx.resolveSelector(selectors['get-code'], 5000);
  if (!codeBtn) {
    ctx.log.warn('Get Code button not found');
    return;
  }

  await codeBtn.click();
  ctx.log.info('Get Code panel opened');
};
