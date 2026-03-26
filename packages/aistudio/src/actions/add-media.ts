import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Open the media insertion menu to attach images, videos, audio, or files. */
export const addMedia: ActionHandler = async (ctx) => {
  const mediaBtn = await ctx.resolveSelector(selectors['add-media'], 5000);
  if (!mediaBtn) {
    ctx.log.warn('Add media button not found');
    return;
  }

  await mediaBtn.click();
  ctx.log.info('Media insertion menu opened');
};
