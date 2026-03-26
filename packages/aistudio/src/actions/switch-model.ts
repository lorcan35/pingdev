import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Change the active model by clicking the model selector card in the run settings panel. */
export const switchModel: ActionHandler = async (ctx) => {
  const modelPicker = await ctx.resolveSelector(selectors['model-picker'], 5000);
  if (!modelPicker) {
    ctx.log.warn('Model picker not found');
    return;
  }

  await modelPicker.click();
  ctx.log.info('Model picker opened');

  // If a specific model name is provided via metadata, try to select it
  const targetModel = ctx.jobRequest.metadata?.['model'] as string | undefined;
  if (targetModel) {
    await new Promise(r => setTimeout(r, 500));
    const option = ctx.page.locator(`[role="option"]`, { hasText: new RegExp(targetModel, 'i') }).first();
    try {
      await option.click({ timeout: 3000 });
      ctx.log.info({ model: targetModel }, 'Model selected');
    } catch {
      ctx.log.warn({ model: targetModel }, 'Could not find model option');
    }
  }
};
