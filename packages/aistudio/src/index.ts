/**
 * AI Studio Site Definition — defines Google AI Studio as a PingApp using @pingdev/core.
 *
 * All AI Studio-specific UI automation logic lives here as action handlers.
 * Generic infrastructure (queue, API, state machine, etc.) comes from @pingdev/core.
 */
import { defineSite, createShimApp, Errors, type ActionContext, type SiteDefinition } from '@pingdev/core';
import { selectors } from './selectors.js';
import { stateConfig } from './states.js';

const AISTUDIO_URL = 'https://aistudio.google.com/prompts/new_chat';

/**
 * Dismiss any CDK overlay backdrops or modals that might intercept clicks.
 * AI Studio uses Angular Material overlays which can block the input area.
 */
async function dismissOverlays(ctx: ActionContext): Promise<void> {
  try {
    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));

    const hasOverlay = await ctx.page.locator('.cdk-overlay-backdrop-showing')
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (hasOverlay) {
      ctx.log.info('Dismissing CDK overlay backdrop');
      await ctx.page.locator('.cdk-overlay-backdrop-showing').click({ force: true });
      await new Promise(r => setTimeout(r, 300));
    }

    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));
  } catch {
    // Overlay dismissal is best-effort
  }
}

const site: SiteDefinition = defineSite({
  name: 'aistudio',
  url: AISTUDIO_URL,

  selectors,
  states: stateConfig,

  actions: {
    /**
     * Find or create an AI Studio tab.
     * Searches existing pages for aistudio.google.com, navigates if needed.
     */
    findOrCreatePage: async (ctx) => {
      const pages = ctx.page.context().pages();

      for (const page of pages) {
        const url = page.url();
        if (url.includes('aistudio.google.com')) {
          if (page === ctx.page) {
            ctx.log.info({ url }, 'Found existing AI Studio tab');
            return;
          }
          ctx.log.info('Found AI Studio on different tab, navigating current page');
          break;
        }
      }

      ctx.log.info('Navigating to AI Studio');
      await ctx.page.goto(AISTUDIO_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    },

    /**
     * Run preflight checks to ensure AI Studio is ready for automation.
     */
    preflight: async (ctx) => {
      const url = ctx.page.url();
      if (!url.includes('aistudio.google.com')) {
        throw Errors.browserUnavailable('Not on AI Studio: ' + url);
      }

      // Check: Logged in (detect Google Account element)
      let loggedIn = false;
      try {
        const acctEl = await ctx.page.locator('[aria-label*="Google Account"]')
          .first().isVisible({ timeout: 5000 });
        if (acctEl) loggedIn = true;
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
        throw Errors.authRequired();
      }

      // Check: Chat input visible
      const input = await ctx.resolveSelector(selectors['chat-input'], 5000);
      if (!input) {
        ctx.log.warn('Preflight: chat input not visible');
      }

      ctx.log.info('Preflight checks passed');
    },

    /**
     * Type a prompt into the AI Studio input field.
     */
    typePrompt: async (ctx) => {
      await dismissOverlays(ctx);

      const input = await ctx.resolveSelector(selectors['chat-input'], 10_000);
      if (!input) throw Errors.selectorNotFound(selectors['chat-input'].name, 'IDLE');

      await input.click({ force: true });
      await input.fill(ctx.jobRequest.prompt);
      ctx.log.info({ promptLength: ctx.jobRequest.prompt.length }, 'Prompt typed');
    },

    /**
     * Submit the current prompt.
     * AI Studio uses Ctrl+Enter or the Run button to submit.
     */
    submit: async (ctx) => {
      // Try clicking the submit/Run button first
      try {
        const submitBtn = await ctx.resolveSelector(selectors['submit-button'], 2000);
        if (submitBtn) {
          await submitBtn.click();
          ctx.log.info('Prompt submitted (Run button click)');
          return;
        }
      } catch {
        // Fall through to keyboard shortcut
      }

      // Fallback: use Ctrl+Enter keyboard shortcut
      await ctx.page.keyboard.press('Control+Enter');
      ctx.log.info('Prompt submitted (Ctrl+Enter)');
    },

    /**
     * Check if AI Studio is currently generating a response.
     * Looks for the "Stop response" button.
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
          const containers = document.querySelectorAll('.model-response-text');
          if (containers.length > 0) {
            const last = containers[containers.length - 1]!;
            return (last.textContent?.trim().length ?? 0) > 0;
          }
          // Fallback: check for markdown containers
          const markdown = document.querySelectorAll('[class*="markdown"]');
          if (markdown.length > 0) {
            const last = markdown[markdown.length - 1]!;
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
     * Extract the latest response text from AI Studio.
     * Strategy: prefer .model-response-text, fallback to [class*="markdown"].
     */
    extractResponse: async (ctx) => {
      const text = await ctx.page.evaluate(() => {
        // 1. Standard: .model-response-text (last one = latest response)
        const containers = document.querySelectorAll('.model-response-text');
        let modelText = '';
        if (containers.length > 0) {
          const last = containers[containers.length - 1]!;
          modelText = last.textContent?.trim() ?? '';
        }

        // 2. Fallback: largest [class*="markdown"] container
        const markdownEls = Array.from(document.querySelectorAll('[class*="markdown"]'));
        let markdownText = '';
        if (markdownEls.length > 0) {
          let largest = markdownEls[0]!;
          let maxLen = largest.textContent?.length ?? 0;
          for (const el of markdownEls) {
            const len = el.textContent?.length ?? 0;
            if (len > maxLen) {
              largest = el;
              maxLen = len;
            }
          }
          markdownText = largest.textContent?.trim() ?? '';
        }

        // Prefer markdown only when substantially larger (Deep Research reports)
        if (markdownText.length > 500 && markdownText.length > modelText.length * 2) {
          return markdownText;
        }
        if (modelText.length > 0) return modelText;
        if (markdownText.length > 0) return markdownText;

        // 3. Fallback: .response-container
        const respContainer = document.querySelector('.response-container');
        if (respContainer) {
          return respContainer.textContent?.trim() ?? '';
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
          const containers = document.querySelectorAll('.model-response-text');
          if (containers.length > 0) {
            return containers[containers.length - 1]!.textContent?.trim() ?? '';
          }
          const markdown = document.querySelectorAll('[class*="markdown"]');
          if (markdown.length > 0) {
            return markdown[markdown.length - 1]!.textContent?.trim() ?? '';
          }
          return '';
        });
      } catch {
        return '';
      }
    },

    /**
     * Extract thinking/reasoning content from AI Studio.
     * Looks for thinking-related elements in the response.
     */
    extractThinking: async (ctx) => {
      try {
        // Try to expand "Show thinking" if it exists
        try {
          const showBtn = ctx.page.locator('button', { hasText: /Show thinking/i }).first();
          await showBtn.click({ timeout: 3000 });
          await ctx.page.waitForTimeout(500);
        } catch {
          // Button may not exist or thinking already expanded
        }

        // Extract text from thought-related elements
        const thoughtText = await ctx.page.evaluate(() => {
          const els = document.querySelectorAll('[class*="thought"]');
          if (els.length > 0) {
            return Array.from(els)
              .map(el => el.textContent?.trim() ?? '')
              .filter(t => t.length > 0)
              .join('\n');
          }

          // Fallback: thinking-related classes/attributes
          const thinkingEls = document.querySelectorAll(
            '[class*="thinking-content"], [class*="reasoning-content"], ' +
            '[data-thinking-content], [class*="thought-process"]'
          );
          if (thinkingEls.length > 0) {
            return Array.from(thinkingEls)
              .map(el => el.textContent?.trim() ?? '')
              .filter(t => t.length > 0)
              .join('\n');
          }

          return '';
        });

        return thoughtText;
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
            '[class*="generating"]',
            '[aria-label*="Generating"]',
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
     * Dismiss CDK overlay backdrops or modals.
     */
    dismissOverlays: async (ctx) => {
      await dismissOverlays(ctx);
    },

    /**
     * Navigate to a fresh chat (new conversation).
     */
    newConversation: async (ctx) => {
      ctx.log.info('Starting new chat');

      // Try the New Chat button first
      try {
        const newChatBtn = await ctx.resolveSelector(selectors['new-chat'], 3000);
        if (newChatBtn) {
          await newChatBtn.click();
          await new Promise(r => setTimeout(r, 1000));
          await ctx.resolveSelector(selectors['chat-input'], 10_000);
          ctx.log.info('New chat ready (button click)');
          return;
        }
      } catch {
        // Fall through to navigation
      }

      // Fallback: navigate directly
      await ctx.page.goto(AISTUDIO_URL, {
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
    pollMs: 1000,
    stableCount: 3,
    maxWaitMs: 120_000,
  },

  browser: {
    cdpUrl: 'http://127.0.0.1:18800',
    connectTimeoutMs: 15_000,
    navigationTimeoutMs: 30_000,
  },

  queue: {
    name: 'aistudio-jobs',
    concurrency: 1,
    defaultTimeoutMs: 120_000,
  },

  rateLimit: {
    maxPerMinute: 6,
    minDelayMs: 3000,
    maxQueueDepth: 10,
  },
});

export { site as aistudioSite };

const app = createShimApp(site, { port: 3457 });
app.start().then(() => console.log('AI Studio PingApp running on port 3457'));
