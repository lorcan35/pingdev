import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Adjust the temperature slider/input in the run settings panel. */
export const setTemperature: ActionHandler = async (ctx) => {
  const value = ctx.jobRequest.metadata?.['temperature'] as string | number | undefined;
  if (value === undefined) {
    ctx.log.warn('No temperature value in metadata');
    return;
  }

  // Try the number input first (more reliable)
  const tempInput = await ctx.resolveSelector(selectors['temperature-input'], 5000);
  if (tempInput) {
    await tempInput.click({ clickCount: 3 }); // Select all
    await tempInput.fill(String(value));
    await ctx.page.keyboard.press('Enter');
    ctx.log.info({ temperature: value }, 'Temperature set via input');
    return;
  }

  ctx.log.warn('Temperature input not found');
};
