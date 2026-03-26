import type { ActionHandler } from '@pingdev/core';
import { Errors } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Type a prompt and submit it to Gemini. Uses Ctrl+Enter or the Run button to submit. */
export const sendMessage: ActionHandler = async (ctx) => {
  // Focus and fill the chat input
  const input = await ctx.resolveSelector(selectors['chat-input'], 10_000);
  if (!input) throw Errors.selectorNotFound('chat-input', 'IDLE');

  await input.click({ force: true });
  await input.fill(ctx.jobRequest.prompt);

  // Submit via Run button or Ctrl+Enter
  try {
    const submitBtn = await ctx.resolveSelector(selectors['submit-button'], 2000);
    if (submitBtn) {
      await submitBtn.click();
      ctx.log.info('Message sent (Run button)');
      return;
    }
  } catch {
    // Fall through to keyboard
  }

  await ctx.page.keyboard.press('Control+Enter');
  ctx.log.info('Message sent (Ctrl+Enter)');
};
