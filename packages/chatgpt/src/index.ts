/**
 * ChatGPT Site Definition — defines chatgpt.com as a PingApp using @pingdev/core.
 *
 * All ChatGPT-specific UI automation logic lives here as action handlers.
 * Generic infrastructure (queue, API, state machine, etc.) comes from @pingdev/core.
 */
import { defineSite, createShimApp, Errors, type ActionContext, type SiteDefinition } from '@pingdev/core';
import { selectors } from './selectors.js';
import { stateConfig } from './states.js';

const CHATGPT_URL = 'https://chatgpt.com';

/**
 * Dismiss any popups, modals, or overlays that might intercept clicks.
 * ChatGPT shows cookie banners, upgrade prompts, and limit warnings.
 */
async function dismissOverlays(ctx: ActionContext): Promise<void> {
  try {
    // Press Escape to close any open dropdown/modal
    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));

    // Dismiss cookie consent banners
    const cookieBtn = ctx.page.locator('button:has-text("Okay"), button:has-text("Accept"), button:has-text("Got it"), button:has-text("Dismiss")').first();
    const hasCookie = await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasCookie) {
      ctx.log.info('Dismissing cookie/notice banner');
      await cookieBtn.click({ force: true });
      await new Promise(r => setTimeout(r, 300));
    }

    // Dismiss upgrade modals
    const closeModal = ctx.page.locator('[role="dialog"] button[aria-label="Close"]').first();
    const hasModal = await closeModal.isVisible({ timeout: 500 }).catch(() => false);
    if (hasModal) {
      ctx.log.info('Dismissing modal dialog');
      await closeModal.click({ force: true });
      await new Promise(r => setTimeout(r, 300));
    }

    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));
  } catch {
    // Overlay dismissal is best-effort
  }
}

const site: SiteDefinition = defineSite({
  name: 'chatgpt',
  url: CHATGPT_URL,

  selectors,
  states: stateConfig,

  actions: {
    /**
     * Find or create a ChatGPT tab.
     * Searches existing pages for chatgpt.com, navigates if needed.
     */
    findOrCreatePage: async (ctx) => {
      const pages = ctx.page.context().pages();

      for (const page of pages) {
        const url = page.url();
        if (url.includes('chatgpt.com')) {
          if (page === ctx.page) {
            ctx.log.info({ url }, 'Found existing ChatGPT tab');
            return;
          }
          ctx.log.info('Found ChatGPT on different tab, navigating current page');
          break;
        }
      }

      ctx.log.info('Navigating to ChatGPT');
      await ctx.page.goto(CHATGPT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    },

    /**
     * Run preflight checks to ensure ChatGPT is ready for automation.
     */
    preflight: async (ctx) => {
      const url = ctx.page.url();
      if (!url.includes('chatgpt.com')) {
        throw Errors.browserUnavailable('Not on ChatGPT: ' + url);
      }

      // Check: Logged in — look for profile button or chat input
      let loggedIn = false;
      try {
        const profileBtn = await ctx.resolveSelector(selectors['profile-menu'], 3000);
        if (profileBtn) loggedIn = true;
      } catch {
        // Fallback: if we can see the chat input, we're likely logged in
        try {
          const input = await ctx.resolveSelector(selectors['chat-input'], 3000);
          if (input) loggedIn = true;
        } catch {
          // not logged in
        }
      }

      if (!loggedIn) {
        // Check for login button to confirm we're not logged in
        try {
          const loginBtn = await ctx.resolveSelector(selectors['login-button'], 2000);
          if (loginBtn) throw Errors.authRequired();
        } catch (e) {
          if (e && typeof e === 'object' && 'code' in e && (e as any).code === 'AUTH_REQUIRED') throw e;
        }
      }

      // Check: Chat input visible
      const input = await ctx.resolveSelector(selectors['chat-input'], 5000);
      if (!input) {
        ctx.log.warn('Preflight: chat input not visible');
      }

      ctx.log.info('Preflight checks passed');
    },

    /**
     * Type a prompt into the ChatGPT input field.
     * ChatGPT uses a contenteditable div (not a textarea), so we use
     * a combination of click + fill/type strategies.
     */
    typePrompt: async (ctx) => {
      await dismissOverlays(ctx);

      const input = await ctx.resolveSelector(selectors['chat-input'], 10_000);
      if (!input) throw Errors.selectorNotFound(selectors['chat-input'].name, 'IDLE');

      // Click to focus
      await input.click({ force: true });
      await new Promise(r => setTimeout(r, 200));

      // Clear existing content
      await ctx.page.keyboard.press('Control+a');
      await ctx.page.keyboard.press('Backspace');
      await new Promise(r => setTimeout(r, 100));

      // ChatGPT's #prompt-textarea is a contenteditable div with a ProseMirror-like editor.
      // Use page.evaluate to set content directly, then fall back to typing.
      const typed = await ctx.page.evaluate((text: string) => {
        const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
        if (!el) return false;
        // Try setting via innerText (works for contenteditable)
        el.focus();
        el.innerText = text;
        // Dispatch input event to trigger React state update
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, ctx.jobRequest.prompt);

      if (!typed) {
        // Fallback: type character by character
        await input.pressSequentially(ctx.jobRequest.prompt, { delay: 10 });
      }

      // Verify text was entered
      await new Promise(r => setTimeout(r, 200));
      ctx.log.info({ promptLength: ctx.jobRequest.prompt.length }, 'Prompt typed');
    },

    /**
     * Submit the current prompt.
     * ChatGPT uses the send button or Enter key.
     */
    submit: async (ctx) => {
      // Try clicking the send button first
      try {
        const sendBtn = await ctx.resolveSelector(selectors['send-button'], 2000);
        if (sendBtn) {
          const isEnabled = await sendBtn.isEnabled();
          if (isEnabled) {
            await sendBtn.click();
            ctx.log.info('Prompt submitted (send button click)');
            return;
          }
        }
      } catch {
        // Fall through to keyboard shortcut
      }

      // Fallback: press Enter
      const input = await ctx.resolveSelector(selectors['chat-input'], 2000);
      if (input) {
        await input.press('Enter');
        ctx.log.info('Prompt submitted (Enter key)');
        return;
      }

      // Last resort: dispatch Enter event
      await ctx.page.keyboard.press('Enter');
      ctx.log.info('Prompt submitted (keyboard Enter)');
    },

    /**
     * Check if ChatGPT is currently generating a response.
     * Looks for the stop button or streaming indicators.
     */
    isGenerating: async (ctx) => {
      try {
        const stop = await ctx.resolveSelector(selectors['stop-button'], 1000);
        return stop !== null;
      } catch {
        return false;
      }
    },

    /**
     * Check if the response is complete.
     * Stop button gone + response container has content.
     */
    isResponseComplete: async (ctx) => {
      try {
        // If stop button is still visible, not complete
        const stop = await ctx.resolveSelector(selectors['stop-button'], 500);
        if (stop) return false;
      } catch {
        // Stop button not found — good, generation may be done
      }

      // Check if response container has content
      try {
        const hasContent = await ctx.page.evaluate(() => {
          const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1]!;
            return (last.textContent?.trim().length ?? 0) > 0;
          }
          // Fallback: check for markdown containers inside agent turns
          const turns = document.querySelectorAll('div.agent-turn, div[class*="markdown"]');
          if (turns.length > 0) {
            const last = turns[turns.length - 1]!;
            return (last.textContent?.trim().length ?? 0) > 0;
          }
          return false;
        });
        return hasContent;
      } catch {
        return false;
      }
    },

    /**
     * Extract the latest response text from ChatGPT.
     * Strategy: prefer [data-message-author-role="assistant"], fallback to markdown containers.
     */
    extractResponse: async (ctx) => {
      const text = await ctx.page.evaluate(() => {
        // 1. Primary: last assistant message
        const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (assistantMsgs.length > 0) {
          const last = assistantMsgs[assistantMsgs.length - 1]!;
          const markdown = last.querySelector('.markdown, [class*="markdown"]');
          if (markdown) return markdown.textContent?.trim() ?? '';
          return last.textContent?.trim() ?? '';
        }

        // 2. Fallback: agent-turn divs
        const turns = document.querySelectorAll('div.agent-turn');
        if (turns.length > 0) {
          const last = turns[turns.length - 1]!;
          const markdown = last.querySelector('.markdown, [class*="markdown"]');
          if (markdown) return markdown.textContent?.trim() ?? '';
          return last.textContent?.trim() ?? '';
        }

        // 3. Fallback: any markdown content
        const markdownEls = Array.from(document.querySelectorAll('[class*="markdown"]'));
        if (markdownEls.length > 0) {
          let largest = markdownEls[0]!;
          let maxLen = largest.textContent?.length ?? 0;
          for (const el of markdownEls) {
            const len = el.textContent?.length ?? 0;
            if (len > maxLen) { largest = el; maxLen = len; }
          }
          return largest.textContent?.trim() ?? '';
        }

        // 4. Fallback: message-content class
        const msgContent = document.querySelectorAll('.message-content');
        if (msgContent.length > 0) {
          return msgContent[msgContent.length - 1]!.textContent?.trim() ?? '';
        }

        return '';
      });

      if (!text) {
        throw Errors.extractionFailed('No response text found');
      }

      return text;
    },

    /**
     * Extract partial response text (for streaming/progress updates).
     * Same as extractResponse but doesn't throw on empty.
     */
    extractPartialResponse: async (ctx) => {
      try {
        return await ctx.page.evaluate(() => {
          const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1]!;
            const markdown = last.querySelector('.markdown, [class*="markdown"]');
            return (markdown ?? last).textContent?.trim() ?? '';
          }
          const turns = document.querySelectorAll('div.agent-turn');
          if (turns.length > 0) {
            return turns[turns.length - 1]!.textContent?.trim() ?? '';
          }
          return '';
        });
      } catch {
        return '';
      }
    },

    /**
     * Extract thinking/reasoning content from ChatGPT (o1/o3 models).
     */
    extractThinking: async (ctx) => {
      try {
        // Try to expand thinking/reasoning section if collapsed
        try {
          const expandBtn = ctx.page.locator('button:has-text("Show thinking"), details summary').first();
          const visible = await expandBtn.isVisible({ timeout: 1000 }).catch(() => false);
          if (visible) {
            await expandBtn.click({ timeout: 2000 });
            await ctx.page.waitForTimeout(500);
          }
        } catch {
          // Button may not exist
        }

        const thinkingText = await ctx.page.evaluate(() => {
          // Check for reasoning/thinking containers
          const patterns = [
            '[data-testid="reasoning-content"]',
            '[class*="reasoning"]',
            '[class*="thinking-content"]',
            '[class*="thought"]',
            'details[class*="thought"]',
          ];
          for (const sel of patterns) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              return Array.from(els)
                .map(el => el.textContent?.trim() ?? '')
                .filter(t => t.length > 0)
                .join('\n');
            }
          }
          return '';
        });

        return thinkingText;
      } catch {
        return '';
      }
    },

    /**
     * Extract visible progress/status text from the UI.
     */
    extractProgressText: async (ctx) => {
      try {
        return await ctx.page.evaluate(() => {
          const patterns = [
            '[class*="progress"]',
            '[class*="status"]',
            '[class*="thinking"]',
            '[aria-label*="Thinking"]',
            '#live-region-assertive',
          ];
          for (const selector of patterns) {
            const els = Array.from(document.querySelectorAll(selector));
            for (const el of els) {
              const text = el.textContent?.trim() ?? '';
              if (text.length > 0 && text.length < 200) return text;
            }
          }
          return '';
        });
      } catch {
        return '';
      }
    },

    /**
     * Dismiss overlays/modals.
     */
    dismissOverlays: async (ctx) => {
      await dismissOverlays(ctx);
    },

    /**
     * Navigate to a fresh chat (new conversation).
     */
    newConversation: async (ctx) => {
      ctx.log.info('Starting new chat');

      // Try the New Chat button/link first
      try {
        const newChatBtn = await ctx.resolveSelector(selectors['new-chat'], 3000);
        if (newChatBtn) {
          await newChatBtn.click();
          await new Promise(r => setTimeout(r, 1500));
          await ctx.resolveSelector(selectors['chat-input'], 10_000);
          ctx.log.info('New chat ready (button click)');
          return;
        }
      } catch {
        // Fall through to navigation
      }

      // Fallback: navigate directly
      await ctx.page.goto(CHATGPT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await dismissOverlays(ctx);
      await ctx.resolveSelector(selectors['chat-input'], 10_000);
      ctx.log.info('New chat ready (navigation)');
    },

    /**
     * Navigate to an existing conversation URL.
     */
    navigateToConversation: async (ctx, url) => {
      ctx.log.info({ url }, 'Navigating to existing conversation');
      await ctx.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await dismissOverlays(ctx);
      await ctx.resolveSelector(selectors['chat-input'], 10_000);
      ctx.log.info('Conversation loaded');
    },

    /**
     * Get the current page URL (for storing conversation mappings).
     */
    getCurrentUrl: async (ctx) => {
      return ctx.page.url();
    },
  },

  completion: {
    method: 'hash_stability',
    pollMs: 750,
    stableCount: 3,
    maxWaitMs: 120_000,
  },

  browser: {
    cdpUrl: 'http://127.0.0.1:18800',
    connectTimeoutMs: 15_000,
    navigationTimeoutMs: 30_000,
  },

  queue: {
    name: 'chatgpt-jobs',
    concurrency: 1,
    defaultTimeoutMs: 120_000,
  },

  rateLimit: {
    maxPerMinute: 6,
    minDelayMs: 3000,
    maxQueueDepth: 10,
  },
});

export { site as chatgptSite };

const app = createShimApp(site, { port: 3458 });
app.start().then(() => console.log('ChatGPT PingApp running on port 3458'));
