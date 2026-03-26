import type { ActionHandler } from '@pingdev/core';
import { selectors } from '../selectors.js';

/** Start a new chat conversation. Navigate to /prompts/new_chat or click the New chat button. */
export const newConversation: ActionHandler = async (ctx) => {
  try {
    const newChatBtn = await ctx.resolveSelector(selectors['new-chat'], 3000);
    if (newChatBtn) {
      await newChatBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      ctx.log.info('New conversation started (button)');
      return;
    }
  } catch {
    // Fall through to navigation
  }

  await ctx.page.goto('https://aistudio.google.com/prompts/new_chat', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  ctx.log.info('New conversation started (navigation)');
};
