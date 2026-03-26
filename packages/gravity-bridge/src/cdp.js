/**
 * cdp.js — CDP connector module for GravityBridge
 *
 * Connects to the Antigravity IDE Electron app via Chrome DevTools Protocol
 * using puppeteer-core. All functions are named exports operating on a
 * module-level `page` reference.
 */

import puppeteer from 'puppeteer-core';

// ── Constants ────────────────────────────────────────────────────────────────

const BROWSER_URL = 'http://127.0.0.1:9222';
const TARGET_TITLE_MATCH = 'Antigravity';

const CHAT_INPUT_SEL = 'div.cursor-text[contenteditable]';
const RESPONSE_CONTAINER_CLASS = 'text-ide-message-block-bot-color';
const MODEL_DROPDOWN_BG_CLASS = 'bg-ide-chat-background';

const MODEL_MAP = {
  'claude-opus':      'Claude Opus',
  'claude-sonnet':    'Claude Sonnet',
  'gemini-pro-high':  'Gemini 3.1 Pro (High)',
  'gemini-pro-low':   'Gemini 3.1 Pro (Low)',
  'gemini-flash':     'Gemini 3 Flash',
  'gpt-oss':          'GPT-OSS',
};

// ── Module state ─────────────────────────────────────────────────────────────

let browser = null;
let page = null;          // default editor page (backward compat)
let managerPage = null;   // the Manager page (title === 'Antigravity', innerWidth 800)
let reconnecting = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log('[cdp]', ...args);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fuzzy-match a model name against a candidate string.
 * Returns true if every word in `needle` appears somewhere in `haystack`
 * (case-insensitive).
 */
function fuzzyMatch(needle, haystack) {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  // Direct substring
  if (h.includes(n)) return true;
  // Every word in needle present in haystack
  const words = n.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every(w => h.includes(w));
}

// ── Connection ───────────────────────────────────────────────────────────────

/**
 * Connect to the Antigravity IDE via CDP.
 * Finds the page whose title contains "Antigravity" and stores it.
 * Sets up auto-reconnection on disconnect.
 */
export async function connect() {
  try {
    log(`Connecting to browser at ${BROWSER_URL}...`);

    browser = await puppeteer.connect({
      browserURL: BROWSER_URL,
      defaultViewport: null,
    });

    log('Connected to browser, searching for Antigravity page...');

    const pages = await browser.pages();
    log(`Found ${pages.length} page(s)`);

    for (const p of pages) {
      try {
        const title = await p.title();
        if (!title || !title.includes(TARGET_TITLE_MATCH)) continue;

        if (title === 'Antigravity') {
          // The main Manager page (innerWidth 800, not the 0x0 ghost)
          try {
            const w = await p.evaluate(() => window.innerWidth);
            if (w > 0) {
              managerPage = p;
              log(`Attached to Manager page: "${title}" (width=${w})`);
              // Also use as default page if no editor found yet
              if (!page) page = p;
            }
          } catch {}
        } else if (title.includes('Scratchpad')) {
          page = p;
          log(`Attached to Editor page: "${title}"`);
        } else if (!page) {
          // Fallback: any Antigravity page
          page = p;
          log(`Attached to page: "${title}"`);
        }
      } catch (err) {
        // Skip pages that throw (e.g. devtools, extensions)
      }
    }

    if (!page) {
      const titles = [];
      for (const p of pages) {
        try { titles.push(await p.title()); } catch { titles.push('(inaccessible)'); }
      }
      throw new Error(
        `No page with title containing "${TARGET_TITLE_MATCH}" found. ` +
        `Available titles: ${titles.join(', ')}`
      );
    }

    // Auto-reconnect on disconnect
    browser.on('disconnected', () => {
      log('Browser disconnected');
      page = null;
      browser = null;
      _scheduleReconnect();
    });

    return page;
  } catch (err) {
    log('Connection failed:', err.message);
    throw err;
  }
}

/**
 * Schedule an automatic reconnection attempt with exponential backoff.
 */
async function _scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;

  const maxAttempts = 10;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`Reconnection attempt ${attempt}/${maxAttempts} in ${delay}ms...`);
    await sleep(delay);

    try {
      await connect();
      log('Reconnected successfully');
      reconnecting = false;
      return;
    } catch (err) {
      log(`Reconnection attempt ${attempt} failed: ${err.message}`);
      delay = Math.min(delay * 2, 15000);
    }
  }

  reconnecting = false;
  log('All reconnection attempts exhausted. Call connect() manually.');
}

// ── Input ────────────────────────────────────────────────────────────────────

/**
 * Clear the chat input and type new text using keyboard simulation.
 * Uses page.keyboard.type() which triggers React state properly.
 */
export async function typePrompt(text) {
  if (!page) throw new Error('Not connected — call connect() first');

  try {
    log('Typing prompt...');

    // Focus the contenteditable input
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) ||
        [...document.querySelectorAll('div[contenteditable]')].find(e => e.className.includes('cursor-text'));
      if (!el) throw new Error('Chat input not found');
      el.focus();
      // Select all existing text so typing replaces it
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel2 = window.getSelection();
      sel2.removeAllRanges();
      sel2.addRange(range);
    }, CHAT_INPUT_SEL);

    await sleep(100);

    // Clear any existing text
    await page.keyboard.press('Backspace');
    await sleep(50);

    // Type using real keyboard events
    await page.keyboard.type(text, { delay: 20 });

    await sleep(100);
    log('Prompt typed');
  } catch (err) {
    log('typePrompt failed:', err.message);
    throw err;
  }
}

/**
 * Append text to the chat input without clearing existing content.
 * Used after file references have been typed.
 */
export async function appendText(text) {
  if (!page) throw new Error('Not connected — call connect() first');
  if (!text) return;

  log('Appending text to input...');
  await page.keyboard.type(text, { delay: 20 });
  await sleep(100);
  log('Text appended');
}

// ── Send ─────────────────────────────────────────────────────────────────────

/**
 * Send the prompt by pressing Enter.
 */
export async function sendPrompt() {
  if (!page) throw new Error('Not connected — call connect() first');

  try {
    log('Pressing Enter to send...');
    await page.keyboard.press('Enter');
    await sleep(200);
    log('Prompt sent');
  } catch (err) {
    log('sendPrompt failed:', err.message);
    throw err;
  }
}

// ── Response ─────────────────────────────────────────────────────────────────

/**
 * Wait for the assistant's response to complete.
 *
 * Polls the response area for the LAST assistant message block. Waits
 * until its text content stabilises (stops changing for ~2 seconds).
 *
 * @param {number} timeout — max wait time in ms (default 120 000)
 * @returns {string} the final response text
 */
export async function waitForResponse(timeout = 120000, userPrompt = '') {
  if (!page) throw new Error('Not connected — call connect() first');

  log('Waiting for response...');

  // Wait a moment for the response to start appearing
  await sleep(2000);

  const startTime = Date.now();
  let lastText = '';
  let stableSince = 0;
  const STABLE_DURATION = 3000; // consider done after 3s of no changes
  const POLL_INTERVAL = 500;

  // UI chrome strings to filter out when extracting response text
  const UI_CHROME = ['Ask anything', 'Planning', 'Send', 'AI may make', 'Antigravity',
    'Add context', 'Media', 'Mentions', 'Workflows', 'Claude', 'Gemini', 'GPT', 'Model',
    'Conversation mode', 'Settings', 'Customization', 'MCP Servers', 'Export', 'Copy',
    'Fast', 'Agent can plan', 'Agent will execute', 'Record voice memo',
    'Thought for', 'New'];

  while (Date.now() - startTime < timeout) {
    try {
      const currentText = await page.evaluate((uiChrome, userPrompt) => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return '';

        // Walk all text nodes in the panel
        const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null);
        const texts = [];
        let node;
        while (node = walker.nextNode()) {
          const t = node.textContent.trim();
          if (t.length > 3 && !uiChrome.some(x => t.startsWith(x)) &&
              !t.startsWith('/*') && !t.startsWith('div:has') &&
              !t.startsWith('border-') && !t.startsWith('@media')) {
            texts.push(t);
          }
        }

        // Filter out CSS artifacts, user's own prompt, and short fragments
        const filtered = texts.filter(t => 
          t.length > 3 && 
          !t.includes('border-style') && 
          !t.includes('prefers-color-scheme') &&
          !t.includes('Simple request') &&
          t !== 'Agent' &&
          t !== userPrompt
        );

        // Return the last substantial text block (usually the AI response)
        // Skip over very short texts like "Copy" that are buttons
        const substantial = filtered.filter(t => t.length > 2);
        return substantial.length > 0 ? substantial[substantial.length - 1] : '';
      }, UI_CHROME, userPrompt);

      if (currentText && currentText !== lastText) {
        // Content changed — reset stability timer
        lastText = currentText;
        stableSince = Date.now();
      } else if (currentText && stableSince > 0) {
        // Content unchanged — check if stable long enough
        if (Date.now() - stableSince >= STABLE_DURATION) {
          log(`Response stabilised (${lastText.length} chars)`);
          return lastText;
        }
      } else if (!currentText && !stableSince) {
        // Nothing yet — keep waiting
      }
    } catch (err) {
      log('Poll error:', err.message);
    }

    await sleep(POLL_INTERVAL);
  }

  log(`Response timed out after ${timeout}ms (last: ${lastText.length} chars)`);
  return lastText;
}

// ── Model selection ──────────────────────────────────────────────────────────

/**
 * Resolve an API-friendly model name to the dropdown label text.
 * First checks MODEL_MAP for an exact key, then falls back to fuzzy
 * matching against the map values and known model strings.
 */
export function resolveModel(name) {
  if (!name) return null;

  // Exact key match
  if (MODEL_MAP[name]) return MODEL_MAP[name];

  // Exact value match (caller already passed the display name)
  const values = Object.values(MODEL_MAP);
  const exactValue = values.find(v => v.toLowerCase() === name.toLowerCase());
  if (exactValue) return exactValue;

  // Fuzzy match against map values
  const fuzzyValue = values.find(v => fuzzyMatch(name, v));
  if (fuzzyValue) return fuzzyValue;

  // Fuzzy match against map keys
  const fuzzyKey = Object.keys(MODEL_MAP).find(k => fuzzyMatch(name, k));
  if (fuzzyKey) return MODEL_MAP[fuzzyKey];

  log(`resolveModel: no match for "${name}", using as-is`);
  return name;
}

/**
 * Read the currently selected model name from the dropdown trigger area.
 */
export async function getSelectedModel() {
  if (!page) throw new Error('Not connected — call connect() first');

  try {
    const model = await page.evaluate((bgClass) => {
      // The model dropdown container has the bg-ide-chat-background class
      const containers = document.querySelectorAll(`.${bgClass}`);
      for (const container of containers) {
        // Look for text that looks like a model name
        const text = container.innerText?.trim();
        if (text && (
          text.includes('Claude') ||
          text.includes('Gemini') ||
          text.includes('GPT') ||
          text.includes('Opus') ||
          text.includes('Sonnet') ||
          text.includes('Flash')
        )) {
          // Return the first line (the model name, not sub-options)
          return text.split('\n')[0].trim();
        }
      }
      return null;
    }, MODEL_DROPDOWN_BG_CLASS);

    return model;
  } catch (err) {
    log('getSelectedModel failed:', err.message);
    return null;
  }
}

/**
 * Select a model from the dropdown by name.
 *
 * Opens the dropdown trigger, finds the option matching `name` (via
 * fuzzy matching through resolveModel), clicks it, and waits for the
 * dropdown to close.
 *
 * @param {string} name — API model name or display label
 */
export async function selectModel(name) {
  if (!page) throw new Error('Not connected — call connect() first');

  const target = resolveModel(name);
  log(`Selecting model: "${name}" → resolved to "${target}"`);

  try {
    // Step 1: Click the dropdown trigger to open it
    await page.evaluate((bgClass) => {
      const containers = document.querySelectorAll(`.${bgClass}`);
      for (const container of containers) {
        const text = container.innerText?.trim();
        if (text && (
          text.includes('Claude') ||
          text.includes('Gemini') ||
          text.includes('GPT') ||
          text.includes('Opus') ||
          text.includes('Sonnet') ||
          text.includes('Flash')
        )) {
          // Click the container or its clickable child
          const clickable = container.querySelector('[role="button"], button') || container;
          clickable.click();
          return;
        }
      }
      throw new Error('Model dropdown trigger not found');
    }, MODEL_DROPDOWN_BG_CLASS);

    await sleep(300);

    // Step 2: Find and click the matching option in the open dropdown
    const selected = await page.evaluate((targetLabel) => {
      // Look through all visible clickable elements for the model name
      const candidates = document.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="listbox"] > *, ' +
        '[class*="dropdown"] li, [class*="popover"] [class*="cursor-pointer"]'
      );

      // Helper: check if text fuzzy-matches
      function matches(text, label) {
        if (!text) return false;
        const t = text.toLowerCase();
        const l = label.toLowerCase();
        if (t.includes(l)) return true;
        const words = l.split(/\s+/).filter(Boolean);
        return words.length > 0 && words.every(w => t.includes(w));
      }

      // First pass: all candidate role-based elements
      for (const el of candidates) {
        const text = el.innerText?.trim();
        if (matches(text, targetLabel)) {
          el.click();
          return text;
        }
      }

      // Second pass: scoped to panel and dropdown overlays only
      const panel = document.querySelector('.antigravity-agent-side-panel');
      const popover = document.querySelector('[class*="popover"], [class*="dropdown"]');
      const scopes = [popover, panel].filter(Boolean);
      let best = null;
      let bestLen = Infinity;
      for (const scope of scopes) {
        const items = scope.querySelectorAll('div, span, li, button, a');
        for (const el of items) {
          if (el.children.length > 3) continue;
          const text = el.innerText?.trim();
          if (matches(text, targetLabel) && text.length < bestLen) {
            best = el;
            bestLen = text.length;
          }
        }
      }
      if (best) {
        best.click();
        return best.innerText?.trim();
      }

      return null;
    }, target);

    if (!selected) {
      throw new Error(`Model option matching "${target}" not found in dropdown`);
    }

    await sleep(200);

    // Step 3: Wait for dropdown to close (check that the overlay/popover disappears)
    let retries = 10;
    while (retries-- > 0) {
      const stillOpen = await page.evaluate(() => {
        const overlays = document.querySelectorAll(
          '[role="listbox"], [role="menu"], [class*="popover"]:not([style*="display: none"])'
        );
        return overlays.length > 0;
      });
      if (!stillOpen) break;
      await sleep(100);
    }

    log(`Model selected: "${selected}"`);
  } catch (err) {
    log('selectModel failed:', err.message);
    throw err;
  }
}

/**
 * Open the model dropdown, scrape all visible option texts, close the
 * dropdown, and return the list.
 *
 * @returns {string[]} array of model display names
 */
export async function getAvailableModels() {
  if (!page) throw new Error('Not connected — call connect() first');

  try {
    // Open the dropdown
    await page.evaluate((bgClass) => {
      const containers = document.querySelectorAll(`.${bgClass}`);
      for (const container of containers) {
        const text = container.innerText?.trim();
        if (text && (
          text.includes('Claude') ||
          text.includes('Gemini') ||
          text.includes('GPT') ||
          text.includes('Opus') ||
          text.includes('Sonnet') ||
          text.includes('Flash')
        )) {
          const clickable = container.querySelector('[role="button"], button') || container;
          clickable.click();
          return;
        }
      }
      throw new Error('Model dropdown trigger not found');
    }, MODEL_DROPDOWN_BG_CLASS);

    await sleep(400);

    // Scrape option texts
    const models = await page.evaluate(() => {
      const results = new Set();

      // Look for option/menuitem elements
      const candidates = document.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="listbox"] > *'
      );
      for (const el of candidates) {
        const text = el.innerText?.trim();
        if (text && (
          text.includes('Claude') ||
          text.includes('Gemini') ||
          text.includes('GPT') ||
          text.includes('Flash')
        )) {
          results.add(text.split('\n')[0].trim());
        }
      }

      // Fallback: scan for popover/dropdown content
      if (results.size === 0) {
        const dropdowns = document.querySelectorAll(
          '[class*="popover"], [class*="dropdown"], [class*="listbox"]'
        );
        for (const dd of dropdowns) {
          const items = dd.querySelectorAll('[class*="cursor-pointer"], li, [role="button"]');
          for (const item of items) {
            const text = item.innerText?.trim();
            if (text && text.length > 2 && text.length < 60) {
              results.add(text.split('\n')[0].trim());
            }
          }
        }
      }

      return Array.from(results);
    });

    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape');
    await sleep(100);

    log(`Available models: ${models.join(', ')}`);
    return models;
  } catch (err) {
    log('getAvailableModels failed:', err.message);
    // Try to close any open dropdown
    try { await page.keyboard.press('Escape'); } catch {}
    throw err;
  }
}

// ── Mode switching ──────────────────────────────────────────────────────────

/**
 * Switch between Planning and Fast mode by clicking the corresponding button.
 * @param {'planning'|'fast'} mode
 */
export async function selectMode(mode) {
  if (!page) throw new Error('Not connected — call connect() first');

  const normalized = mode.toLowerCase().trim();
  if (normalized !== 'planning' && normalized !== 'fast') {
    throw new Error(`Invalid mode "${mode}" — must be "planning" or "fast"`);
  }

  const buttonLabel = normalized === 'planning' ? 'Planning' : 'Fast';
  log(`Switching mode to: ${buttonLabel}`);

  try {
    const clicked = await page.evaluate((label) => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return false;

      // Find buttons/clickable elements containing the mode text
      const candidates = panel.querySelectorAll('button, [role="button"], div[class*="cursor-pointer"], span');
      for (const el of candidates) {
        const text = el.textContent?.trim();
        if (text === label || text === label.toLowerCase()) {
          el.click();
          return true;
        }
      }

      // Fallback: walk all elements for exact text match
      const all = panel.querySelectorAll('*');
      for (const el of all) {
        // Only leaf-ish elements
        if (el.children.length > 2) continue;
        const text = el.textContent?.trim();
        if (text === label) {
          el.click();
          return true;
        }
      }

      return false;
    }, buttonLabel);

    if (!clicked) {
      throw new Error(`Mode button "${buttonLabel}" not found in panel`);
    }

    await sleep(200);
    log(`Mode switched to: ${buttonLabel}`);
  } catch (err) {
    log('selectMode failed:', err.message);
    throw err;
  }
}

// ── Auto-approve ────────────────────────────────────────────────────────────

/**
 * Inject a MutationObserver that auto-clicks Accept/Run buttons when they
 * appear in the agent panel.
 * Returns a cleanup function to remove the observer.
 */
export async function setupAutoApprove() {
  if (!page) throw new Error('Not connected — call connect() first');

  log('Setting up auto-approve observer');

  await page.evaluate(() => {
    // Prevent double-setup
    if (window.__gbAutoApproveObserver) {
      window.__gbAutoApproveObserver.disconnect();
    }

    const APPROVE_LABELS = ['Accept', 'Run', 'Allow', 'Approve', 'Yes', 'Continue'];

    function scrollPanelToBottom() {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return;
      const scrollables = panel.querySelectorAll('div');
      for (const el of scrollables) {
        if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100) {
          el.scrollTop = el.scrollHeight;
        }
      }
    }

    function tryClickApproveButtons() {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return;

      // Scroll to bottom first so off-screen buttons become visible
      scrollPanelToBottom();

      const buttons = panel.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (!text) continue;
        if (APPROVE_LABELS.some(label => text === label || text.startsWith(label))) {
          // Don't click disabled buttons
          if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
          // Verify button is visible (has dimensions)
          const rect = btn.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          console.log('[auto-approve] Clicking:', text);
          btn.click();
        }
      }
    }

    const observer = new MutationObserver(() => {
      tryClickApproveButtons();
    });

    const target = document.querySelector('.antigravity-agent-side-panel') || document.body;
    observer.observe(target, { childList: true, subtree: true });

    // Also check immediately
    tryClickApproveButtons();

    window.__gbAutoApproveObserver = observer;
  });

  log('Auto-approve observer active');
}

/**
 * Remove the auto-approve MutationObserver.
 */
export async function stopAutoApprove() {
  if (!page) return;

  try {
    await page.evaluate(() => {
      if (window.__gbAutoApproveObserver) {
        window.__gbAutoApproveObserver.disconnect();
        window.__gbAutoApproveObserver = null;
        console.log('[auto-approve] Observer removed');
      }
    });
    log('Auto-approve observer removed');
  } catch (err) {
    log('stopAutoApprove failed:', err.message);
  }
}

// ── Thinking extraction ─────────────────────────────────────────────────────

/**
 * Expand any collapsed "Thought for Xs" blocks in the last response and
 * extract their content.
 *
 * @returns {string|null} the thinking content, or null if none found
 */
export async function extractThinking() {
  if (!page) throw new Error('Not connected — call connect() first');

  try {
    const thinking = await page.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return null;

      // Find "Thought for Xs" elements
      const allElements = panel.querySelectorAll('*');
      let thinkingEl = null;

      for (const el of allElements) {
        const text = el.textContent?.trim();
        if (text && /^Thought for\s+\d+s?$/i.test(text) && el.children.length <= 2) {
          thinkingEl = el;
        }
      }

      if (!thinkingEl) return null;

      // Click to expand if collapsed
      const clickTarget = thinkingEl.closest('[role="button"]') ||
                          thinkingEl.closest('button') ||
                          thinkingEl.closest('details summary') ||
                          thinkingEl;
      clickTarget.click();

      // Wait briefly then extract (the content should expand)
      return new Promise(resolve => {
        setTimeout(() => {
          // Look for the expanded content — usually a sibling or child element
          // that appears after clicking
          const parent = thinkingEl.parentElement?.parentElement || thinkingEl.parentElement;
          if (!parent) { resolve(null); return; }

          // Find the content area that was revealed
          const allText = parent.innerText || '';
          // Remove the "Thought for Xs" prefix
          const cleaned = allText.replace(/^Thought for\s+\d+s?\s*/i, '').trim();

          // Collapse it back
          clickTarget.click();

          resolve(cleaned || null);
        }, 500);
      });
    });

    if (thinking) {
      log(`Extracted thinking: ${thinking.length} chars`);
    }
    return thinking;
  } catch (err) {
    log('extractThinking failed:', err.message);
    return null;
  }
}

// ── File References (@mentions) ──────────────────────────────────────────────

/**
 * Type an @ file reference into the chat input.
 * Triggers the autocomplete dropdown and selects the first match.
 */
export async function typeFileReference(filename) {
  if (!page) throw new Error('Not connected — call connect() first');

  log(`Typing file reference: @${filename}`);

  // Ensure input is focused
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) ||
      [...document.querySelectorAll('div[contenteditable]')].find(e => e.className.includes('cursor-text'));
    if (el) el.focus();
  }, CHAT_INPUT_SEL);
  await sleep(100);

  // Type @ to trigger autocomplete
  await page.keyboard.type('@', { delay: 30 });
  await sleep(300); // wait for dropdown

  // Type filename to filter
  await page.keyboard.type(filename, { delay: 20 });
  await sleep(500); // wait for filter

  // Select first match
  await page.keyboard.press('Enter');
  await sleep(200);

  // Space after mention
  await page.keyboard.type(' ', { delay: 20 });

  log(`File reference @${filename} typed`);
}

// ── Session/Conversation Management ─────────────────────────────────────────

/**
 * Start a new conversation by clicking the "+" / "New Chat" button
 * in the agent panel header.
 */
export async function newConversation() {
  if (!page) throw new Error('Not connected — call connect() first');

  log('Starting new conversation...');

  const clicked = await page.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return false;

    // Find the new conversation button by its tooltip or plus icon SVG
    const buttons = panel.querySelectorAll('button, [role="button"], a');
    for (const btn of buttons) {
      // Check for tooltip ID containing "new-conversation"
      const tooltip = btn.getAttribute('data-tooltip-id') || '';
      const closest = btn.closest('[data-tooltip-id]');
      const parentTooltip = closest?.getAttribute('data-tooltip-id') || '';
      if (tooltip.includes('new-conversation') || parentTooltip.includes('new-conversation')) {
        btn.click();
        return true;
      }
      // Fallback: check for plus icon SVG path (M12 4.5v15m7.5-7.5h-15)
      const path = btn.querySelector('svg path')?.getAttribute('d') || '';
      if (path.includes('M12 4.5v15') || path.includes('M12 5v14')) {
        btn.click();
        return true;
      }
    }

    // Fallback: look for any element with + text near the top of the panel
    const allEls = panel.querySelectorAll('*');
    for (const el of allEls) {
      if (el.children.length > 2) continue;
      const text = el.textContent?.trim();
      const rect = el.getBoundingClientRect();
      // Only look near the top (header area)
      if (rect.top < 200 && (text === '+' || text === 'New' || text === 'New Chat')) {
        el.click();
        return true;
      }
    }

    return false;
  });

  if (!clicked) {
    // Fallback: try keyboard shortcut Ctrl+L
    log('New chat button not found, trying Ctrl+L shortcut');
    await page.keyboard.down('Control');
    await page.keyboard.press('l');
    await page.keyboard.up('Control');
  }

  await sleep(500);
  log('New conversation started');
}

/**
 * Get current conversation status — message count and estimated tokens.
 */
export async function getConversationStatus() {
  if (!page) throw new Error('Not connected — call connect() first');

  return await page.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { messages: 0, characters: 0, estimatedTokens: 0 };

    // Count user and assistant message blocks
    const allText = panel.innerText || '';
    const lines = allText.split('\n').filter(l => l.trim().length > 0);
    return {
      messages: lines.length,
      characters: allText.length,
      estimatedTokens: Math.round(allText.length / 4),
    };
  });
}

// ── Readiness ────────────────────────────────────────────────────────────────

/**
 * Check whether the page is connected and the chat input is visible.
 *
 * @returns {boolean}
 */
export async function isReady() {
  if (!page) return false;

  try {
    const ready = await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (!input) return false;
      // Check visibility: element has non-zero dimensions
      const rect = input.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, CHAT_INPUT_SEL);
    return ready;
  } catch (err) {
    log('isReady check failed:', err.message);
    return false;
  }
}

// ── Accessors ────────────────────────────────────────────────────────────────

/**
 * Return the current Puppeteer Page reference.
 *
 * @returns {import('puppeteer-core').Page|null}
 */
export function getPage() {
  return page;
}

// ── Multi-Page Management ────────────────────────────────────────────────────

/**
 * Get the Manager page (title === 'Antigravity', the one with innerWidth 800).
 */
export function getManagerPage() {
  return managerPage;
}

/**
 * Get all browser pages matching Antigravity targets.
 * Returns an array of { page, title } objects.
 */
export async function getAllAntigravityPages() {
  if (!browser) return [];
  const pages = await browser.pages();
  const results = [];
  for (const p of pages) {
    try {
      const title = await p.title();
      if (title && title.includes('Antigravity')) {
        results.push({ page: p, title });
      }
    } catch {}
  }
  return results;
}

/**
 * Get a specific page by target identifier:
 *   "editor"       → Scratchpad page
 *   "manager"      → Manager page (title === 'Antigravity')
 *   "agent:<name>" → Agent session page (title === '<name> - Antigravity')
 *   undefined      → default editor page (backward compat)
 */
export async function getPageByTarget(target) {
  if (!target || target === 'editor') return page;
  if (target === 'manager') return managerPage;

  if (target.startsWith('agent:')) {
    const agentName = target.slice(6);
    return await findAgentPage(agentName);
  }

  return page;
}

/**
 * Find an agent's CDP page by name.
 * Agent pages have titles like "<name> - Antigravity".
 */
export async function findAgentPage(agentName) {
  if (!browser) return null;
  const pages = await browser.pages();
  for (const p of pages) {
    try {
      const title = await p.title();
      if (title && title.startsWith(agentName + ' - Antigravity')) {
        return p;
      }
    } catch {}
  }
  return null;
}

/**
 * List all active agent sessions from CDP page targets.
 * Agent pages have titles matching "<name> - Antigravity".
 * Excludes: 'Antigravity', 'Antigravity - Scratchpad', 'Manager', 'Launchpad'.
 */
export async function listAgents() {
  if (!browser) return [];
  const pages = await browser.pages();
  const agents = [];
  const excluded = ['Antigravity', 'Manager', 'Launchpad'];

  for (const p of pages) {
    try {
      const title = await p.title();
      if (!title || !title.includes('Antigravity')) continue;
      if (excluded.includes(title)) continue;
      if (title.includes('Scratchpad')) continue;

      // Pattern: "<name> - Antigravity" or "<name> - Antigravity - <convo>●"
      const match = title.match(/^(.+?)\s*-\s*Antigravity(?:\s*-\s*(.+?)●?)?$/);
      if (match) {
        const id = match[1];
        agents.push({ id, title, page: p, conversation: match[2] || null });
      }
    } catch {}
  }
  return agents;
}

/**
 * Type a message into a specific page's contenteditable input and send it.
 * Brings the page to front, focuses the input, types, and presses Enter.
 */
export async function typeAndSendOnPage(targetPage, text) {
  if (!targetPage) throw new Error('Target page not available');

  log(`Typing on page and sending...`);

  await targetPage.bringToFront();
  await sleep(300);

  // Focus the contenteditable input
  await targetPage.evaluate(() => {
    const el = document.querySelector('div[contenteditable][class*="max-h"]') ||
      document.querySelector('div.cursor-text[contenteditable]') ||
      [...document.querySelectorAll('div[contenteditable]')].find(e => e.className.includes('cursor-text'));
    if (!el) throw new Error('Chat input not found');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  await sleep(100);
  await targetPage.keyboard.press('Backspace');
  await sleep(50);
  await targetPage.keyboard.type(text, { delay: 20 });
  await sleep(100);
  await targetPage.keyboard.press('Enter');
  await sleep(200);

  log('Message typed and sent on target page');
}

/**
 * Extract the latest response text from a specific page.
 * Uses the same text-node-walking approach as waitForResponse().
 */
export async function extractResponseFromPage(targetPage) {
  if (!targetPage) throw new Error('Target page not available');

  const UI_CHROME = ['Ask anything', 'Planning', 'Send', 'AI may make', 'Antigravity',
    'Add context', 'Media', 'Mentions', 'Workflows', 'Claude', 'Gemini', 'GPT', 'Model',
    'Conversation mode', 'Settings', 'Customization', 'MCP Servers', 'Export', 'Copy',
    'Fast', 'Agent can plan', 'Agent will execute', 'Record voice memo',
    'Thought for', 'New', 'Start new conversation', 'Chat History', 'Workspaces',
    'Playground', 'Knowledge', 'Browser'];

  const result = await targetPage.evaluate((uiChrome) => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { content: '', thinking: null };

    // Get the page title to filter it out from results
    const pageTitle = document.title || '';
    const agentName = pageTitle.replace(/\s*-\s*Antigravity$/, '');

    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null);
    const texts = [];
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 3 && !uiChrome.some(x => t.startsWith(x)) &&
          !t.startsWith('/*') && !t.startsWith('div:has') &&
          !t.startsWith('border-') && !t.startsWith('@media')) {
        texts.push(t);
      }
    }

    const filtered = texts.filter(t =>
      t.length > 3 &&
      !t.includes('border-style') &&
      !t.includes('prefers-color-scheme') &&
      !t.includes('Simple request') &&
      t !== 'Agent' &&
      t !== agentName &&
      t !== 'AI may make mistakes. Double-check all generated code.' &&
      t !== 'Switch to Agent Manager' &&
      t !== 'Code with Agent'
    );

    const substantial = filtered.filter(t => t.length > 10);
    const content = substantial.length > 0 ? substantial[substantial.length - 1] : '';

    // Try to find thinking content
    let thinking = null;
    const allEls = panel.querySelectorAll('*');
    for (const el of allEls) {
      const text = el.textContent?.trim();
      if (text && /^Thought for\s+\d+s?$/i.test(text) && el.children.length <= 2) {
        const parent = el.parentElement?.parentElement || el.parentElement;
        if (parent) {
          const allText = parent.innerText || '';
          thinking = allText.replace(/^Thought for\s+\d+s?\s*/i, '').trim() || null;
        }
      }
    }

    return { content, thinking };
  }, UI_CHROME);

  return result;
}

/**
 * Detect the status of an agent page:
 *   - "thinking": model is actively generating
 *   - "waiting_approval": an approve/accept button is visible
 *   - "idle": input is visible and ready
 *   - "active": page exists but state unclear
 */
export async function getAgentStatus(targetPage) {
  if (!targetPage) return 'not_found';

  try {
    return await targetPage.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return 'active';

      // Check for approval buttons
      const buttons = panel.querySelectorAll('button, [role="button"]');
      const approveLabels = ['Accept', 'Run', 'Allow', 'Approve', 'Continue'];
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (text && approveLabels.some(l => text === l || text.startsWith(l))) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && !btn.disabled) {
            return 'waiting_approval';
          }
        }
      }

      // Check for active thinking indicator (not "Thought for Xs" which is historical)
      const allText = panel.innerText || '';
      if (allText.includes('Thinking...') || allText.includes('Generating...')) {
        return 'thinking';
      }

      // Check for stop button (indicates active generation)
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (text === 'Stop' || text === 'Cancel') {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return 'thinking';
        }
      }

      // Check if input is available (idle)
      const input = document.querySelector('div[contenteditable][class*="max-h"]') ||
        document.querySelector('div.cursor-text[contenteditable]');
      if (input) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return 'idle';
      }

      return 'active';
    });
  } catch {
    return 'active';
  }
}

/**
 * Click "Start new conversation" in the Manager page sidebar.
 */
export async function clickStartNewConversation() {
  if (!managerPage) throw new Error('Manager page not connected');

  log('Clicking "Start new conversation" in Manager...');
  await managerPage.bringToFront();
  await sleep(300);

  const clicked = await managerPage.evaluate(() => {
    // Primary: find by tooltip ID
    const byTooltip = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
    if (byTooltip) {
      byTooltip.click();
      return true;
    }

    // Fallback: look for text
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const text = el.textContent?.trim();
      if (text && text.includes('Start new conversation') && el.children.length <= 3) {
        const clickable = el.closest('.cursor-pointer') ||
          el.closest('[role="button"]') ||
          el.closest('button') ||
          el;
        clickable.click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error('"Start new conversation" button not found in Manager');
  }

  await sleep(500);
  log('"Start new conversation" clicked');
}

/**
 * Wait for a new agent page to appear in the browser targets.
 * Returns { id, title, page } of the newly spawned agent.
 */
export async function waitForNewAgentPage(existingIds, timeout = 30000) {
  log('Waiting for new agent page to appear...');
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const agents = await listAgents();
    const newAgent = agents.find(a => !existingIds.includes(a.id));
    if (newAgent) {
      log(`New agent page found: "${newAgent.title}"`);
      return newAgent;
    }
    await sleep(1000);
  }

  throw new Error(`No new agent page appeared within ${timeout}ms`);
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { MODEL_MAP };
