/**
 * Gemini Site Definition — defines Gemini as a PingApp using @pingdev/core.
 *
 * All Gemini-specific UI automation logic lives here as action handlers.
 * Generic infrastructure (queue, API, state machine, etc.) comes from @pingdev/core.
 */
import { defineSite, Errors, type ActionContext, type SiteDefinition } from '@pingdev/core';
import * as selectors from './selectors/gemini.v1.js';
import * as toolManager from './tools/tool-manager.js';
import * as modeManager from './tools/mode-manager.js';
import type { GeminiTool, GeminiMode } from './types/index.js';

const GEMINI_URL = 'https://gemini.google.com/u/1/app';

/**
 * Dismiss any CDK overlay backdrops or modals that might intercept clicks.
 * Gemini uses Angular Material overlays which can block the input area.
 */
async function dismissOverlays(ctx: ActionContext): Promise<void> {
  try {
    // Press Escape to close any open menus/modals/overlays
    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));

    // Check for and click any overlay backdrops
    const hasOverlay = await ctx.page.locator('.cdk-overlay-backdrop-showing')
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (hasOverlay) {
      ctx.log.info('Dismissing CDK overlay backdrop');
      await ctx.page.locator('.cdk-overlay-backdrop-showing').click({ force: true });
      await new Promise(r => setTimeout(r, 300));
    }

    // Press Escape again as fallback
    await ctx.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));
  } catch {
    // Overlay dismissal is best-effort
  }
}

export const geminiSite: SiteDefinition = defineSite({
  name: 'gemini',
  url: GEMINI_URL,

  selectors: {
    'chat-input': selectors.CHAT_INPUT,
    'new-chat': selectors.NEW_CHAT,
    'tools-button': selectors.TOOLS_BUTTON,
    'mode-picker': selectors.MODE_PICKER,
    'main-menu': selectors.MAIN_MENU,
    'account-button': selectors.ACCOUNT_BUTTON,
    'stop-button': selectors.STOP_BUTTON,
    'good-response': selectors.GOOD_RESPONSE,
    'response-container': selectors.RESPONSE_CONTAINER,
  },

  states: {
    transitions: {
      IDLE: ['TYPING', 'NEEDS_HUMAN'],
      TYPING: ['GENERATING', 'IDLE', 'FAILED', 'NEEDS_HUMAN'],
      GENERATING: ['DONE', 'FAILED', 'NEEDS_HUMAN'],
      DONE: ['IDLE'],
      FAILED: ['IDLE'],
      NEEDS_HUMAN: ['IDLE'],
    },
  },

  actions: {
    /**
     * Find or create a Gemini tab.
     * Searches existing pages for gemini.google.com, navigates if needed.
     */
    findOrCreatePage: async (ctx) => {
      const pages = ctx.page.context().pages();

      // Look for an existing Gemini tab
      for (const page of pages) {
        const url = page.url();
        if (url.includes('gemini.google.com')) {
          if (page === ctx.page) {
            // Current page is on Gemini — ensure ULTRA account path
            if (!url.includes('/u/1/')) {
              ctx.log.info('Navigating to ULTRA account path /u/1/app');
              await ctx.page.goto(GEMINI_URL, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
              });
            } else {
              ctx.log.info({ url }, 'Found existing Gemini tab');
            }
            return;
          }
          // Found Gemini on a different tab — navigate current page to Gemini instead
          ctx.log.info('Found Gemini on different tab, navigating current page');
          break;
        }
      }

      // Navigate current page to Gemini
      ctx.log.info('Navigating to Gemini');
      await ctx.page.goto(GEMINI_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    },

    /**
     * Run preflight checks to ensure Gemini is ready for automation.
     */
    preflight: async (ctx) => {
      // Check: Gemini page loaded
      const url = ctx.page.url();
      if (!url.includes('gemini.google.com')) {
        throw Errors.browserUnavailable('Not on Gemini: ' + url);
      }

      // Check: Logged in (detect Google Account element)
      let loggedIn = false;
      try {
        const acctEl = await ctx.page.locator('[aria-label*="Google Account"]')
          .first().isVisible({ timeout: 5000 });
        if (acctEl) loggedIn = true;
      } catch {
        // Fallback: if URL contains /u/1/ we're on the ULTRA account
        if (url.includes('/u/1/')) loggedIn = true;
      }
      if (!loggedIn) {
        throw Errors.authRequired();
      }

      // Check: Chat input visible
      const input = await ctx.resolveSelector(selectors.CHAT_INPUT, 5000);
      if (!input) {
        ctx.log.warn('Preflight: chat input not visible');
      }

      ctx.log.info('Preflight checks passed');
    },

    /**
     * Type a prompt into the Gemini input field.
     */
    typePrompt: async (ctx) => {
      // Dismiss any overlays that might intercept
      await dismissOverlays(ctx);

      const input = await ctx.resolveSelector(selectors.CHAT_INPUT, 10_000);
      if (!input) throw Errors.selectorNotFound(selectors.CHAT_INPUT.name, 'IDLE');

      // Click to focus (with force to bypass any remaining overlays), then type
      await input.click({ force: true });
      await input.fill(ctx.jobRequest.prompt);
      ctx.log.info({ promptLength: ctx.jobRequest.prompt.length }, 'Prompt typed');
    },

    /**
     * Submit the current prompt by pressing Enter.
     */
    submit: async (ctx) => {
      await ctx.page.keyboard.press('Enter');
      ctx.log.info('Prompt submitted (Enter key)');
    },

    /**
     * Check if Gemini is currently generating a response.
     * Looks for the "Stop response" button.
     */
    isGenerating: async (ctx) => {
      try {
        const stop = await ctx.resolveSelector(selectors.STOP_BUTTON, 1000);
        return stop !== null;
      } catch {
        return false;
      }
    },

    /**
     * Check if the response is complete.
     * Looks for "Good response" button (feedback controls).
     */
    isResponseComplete: async (ctx) => {
      try {
        const good = await ctx.resolveSelector(selectors.GOOD_RESPONSE, 1000);
        return good !== null;
      } catch {
        return false;
      }
    },

    /**
     * Extract the latest response text from Gemini.
     * Strategy: prefer .model-response-text, use largest [class*="markdown"]
     * for Deep Research reports (25K+ chars), fallback to other containers.
     */
    extractResponse: async (ctx) => {
      const text = await ctx.page.evaluate(() => {
        // 1. Standard: .model-response-text
        const containers = document.querySelectorAll('.model-response-text');
        let modelText = '';
        if (containers.length > 0) {
          const last = containers[containers.length - 1]!;
          modelText = last.textContent?.trim() ?? '';
        }

        // 2. Deep Research: largest [class*="markdown"] container
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

        // Prefer markdown only when it's substantially larger (Deep Research)
        if (markdownText.length > 500 && markdownText.length > modelText.length * 2) {
          return markdownText;
        }
        if (modelText.length > 0) return modelText;
        if (markdownText.length > 0) return markdownText;

        // Fallback: [data-content-feature] elements
        const allMessages = document.querySelectorAll('[data-content-feature]');
        if (allMessages.length > 0) {
          const last = allMessages[allMessages.length - 1]!;
          return last.textContent?.trim() ?? '';
        }

        // Last resort: main content area
        const main = document.querySelector('main') ?? document.querySelector('[role="main"]');
        return main?.textContent?.trim() ?? '';
      });

      if (!text) {
        throw Errors.extractionFailed('No response text found');
      }

      return text;
    },

    /**
     * Extract partial response text (for streaming/progress updates).
     * Similar to extractResponse but doesn't throw on empty.
     */
    extractPartialResponse: async (ctx) => {
      try {
        return await ctx.page.evaluate(() => {
          const containers = document.querySelectorAll('.model-response-text');
          if (containers.length > 0) {
            return containers[containers.length - 1]!.textContent?.trim() ?? '';
          }
          return '';
        });
      } catch {
        return '';
      }
    },

    /**
     * Extract thinking/reasoning content from the "Show thinking" panel.
     * Works for Deep Think, Thinking mode, and Deep Research plans.
     */
    extractThinking: async (ctx) => {
      try {
        // Step 1: Click "Show thinking" button via Playwright locator
        try {
          const showBtn = ctx.page.locator('button', { hasText: /Show thinking/i }).first();
          await showBtn.click({ timeout: 3000 });
          await ctx.page.waitForTimeout(500);
        } catch {
          // Button may not exist or thinking already expanded
        }

        // Step 2: Extract text from [class*="thought"] elements
        const thoughtText = await ctx.page.evaluate(() => {
          const els = document.querySelectorAll('[class*="thought"]');
          if (els.length > 0) {
            return Array.from(els)
              .map(el => el.textContent?.trim() ?? '')
              .filter(t => t.length > 0)
              .join('\n');
          }
          return '';
        });

        if (thoughtText) return thoughtText;

        // Fallback strategies
        return await ctx.page.evaluate(() => {
          // Fallback 1: thinking-related classes/attributes
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

          // Fallback 2: details/summary elements in response
          const allText = document.querySelectorAll('.model-response-text');
          if (allText.length > 0) {
            const lastResponse = allText[allText.length - 1]!;
            const sections = lastResponse.querySelectorAll('details, summary');
            if (sections.length > 0) {
              return Array.from(sections)
                .map(s => s.textContent?.trim() ?? '')
                .join('\n');
            }
          }

          return '';
        });
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
     * Activate a Gemini tool via the Tools menu.
     */
    activateTool: async (ctx) => {
      if (ctx.jobRequest.tool) {
        await dismissOverlays(ctx);
        await toolManager.activateTool(ctx.page, ctx.jobRequest.tool as GeminiTool);
      }
    },

    /**
     * Deactivate a Gemini tool by clicking its deselect chip.
     */
    deactivateTool: async (ctx) => {
      if (ctx.jobRequest.tool) {
        await toolManager.deactivateTool(ctx.page, ctx.jobRequest.tool as GeminiTool);
      }
    },

    /**
     * Switch the Gemini mode (Fast, Thinking, Pro).
     */
    switchMode: async (ctx) => {
      if (ctx.jobRequest.mode) {
        await dismissOverlays(ctx);
        await modeManager.switchMode(ctx.page, ctx.jobRequest.mode as GeminiMode);
      }
    },

    /**
     * Navigate to a fresh chat (new conversation).
     */
    newConversation: async (ctx) => {
      ctx.log.info('Starting new chat');
      await ctx.page.goto(GEMINI_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Dismiss any overlays
      await dismissOverlays(ctx);

      // Wait for input to appear
      await ctx.resolveSelector(selectors.CHAT_INPUT, 10_000);
      ctx.log.info('New chat ready');
    },

    /**
     * Navigate to an existing conversation URL (for conversation continuity).
     */
    navigateToConversation: async (ctx, url) => {
      ctx.log.info({ url }, 'Navigating to existing conversation');
      await ctx.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      await dismissOverlays(ctx);
      await ctx.resolveSelector(selectors.CHAT_INPUT, 10_000);
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
    name: 'gemini-jobs',
    concurrency: 1,
    defaultTimeoutMs: 120_000,
  },

  rateLimit: {
    maxPerMinute: 6,
    minDelayMs: 3000,
    maxQueueDepth: 10,
  },

  tools: ['deep_research', 'create_videos', 'create_images', 'canvas', 'guided_learning', 'deep_think'],
  modes: ['fast', 'thinking', 'pro'],
  substates: ['generating_plan', 'researching', 'generating_video', 'generating_image', 'thinking', 'generating_code'],
});
