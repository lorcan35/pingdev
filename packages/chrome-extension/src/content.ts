// Content script - Bridge executor + interaction recorder

import type { BridgeCommand, BridgeResponse, RecordedAction, WorkflowStep, WorkflowExport } from './types';
import { humanClick, humanType, withJitter } from './stealth';
import { fullCleanup, injectAdBlockCSS, removeAdElements, detectClutter } from './adblock';

// ============================================================================
// Part A: Bridge Executor
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Recording commands — handle before generic bridge_command
  if (message.type === 'bridge_command' && message.command?.type === 'record_start') {
    startRecording();
    sendResponse({ success: true, data: { recording: true } });
    return true;
  }

  if (message.type === 'bridge_command' && message.command?.type === 'record_stop') {
    stopRecording();
    sendResponse({ success: true, data: { recording: false, stepCount: recordedActions.length } });
    return true;
  }

  if (message.type === 'bridge_command' && message.command?.type === 'record_export') {
    const name = message.command?.name || 'recording';
    const exported = exportRecording(name);
    sendResponse({ success: true, data: exported });
    return true;
  }

  if (message.type === 'bridge_command' && message.command?.type === 'record_status') {
    sendResponse({ success: true, data: { recording: recordingEnabled, stepCount: recordedActions.length } });
    return true;
  }

  // Generic bridge commands
  if (message.type === 'bridge_command') {
    handleBridgeCommand(message.command)
      .then((response) => {
        sendResponse(response);
      })
      .catch((err) => {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    return true;
  }

  if (message.type === 'get_recorded_actions') {
    getRecordedActions().then((actions) => {
      sendResponse(actions);
    });
    return true;
  }

  if (message.type === 'clear_recorded_actions') {
    clearRecordedActions().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

async function handleBridgeCommand(command: BridgeCommand): Promise<BridgeResponse> {
  try {
    let response: BridgeResponse;

    switch (command.type) {
      case 'click':
        response = await handleClick(command.selector, command.stealth, command.x, command.y);
        break;
      case 'type':
        response = await handleType(command.selector, command.text, command.stealth);
        break;
      case 'read':
        response = await handleRead(command.selector);
        break;
      case 'extract':
        response = await handleExtract(command);
        break;
      case 'act':
        response = await handleAct(command.instruction);
        break;
      case 'eval': {
        // CANONICAL field name is `expression`; keep `code` as a fallback alias.
        const code = command.expression || command.code;
        if (!code) response = { success: false, error: 'No code/expression provided' };
        else response = await handleEval(code);
        break;
      }
      case 'waitFor':
        response = await handleWaitFor(command.selector, command.timeoutMs);
        break;
      case 'navigate':
        response = await handleNavigate(command.url);
        break;
      case 'getUrl':
        response = { success: true, data: window.location.href };
        break;
      case 'recon':
        response = await handleRecon(command.classify);
        break;
      case 'observe':
        response = await handleObserve();
        break;
      case 'clean': {
        // Ad-block / clutter removal
        const mode = command.mode || 'full'; // 'css' | 'remove' | 'detect' | 'full'
        if (mode === 'css') {
          injectAdBlockCSS();
          response = { success: true, data: { mode: 'css', injected: true } };
        } else if (mode === 'remove') {
          const result = removeAdElements();
          response = { success: true, data: { mode: 'remove', ...result } };
        } else if (mode === 'detect') {
          const clutter = detectClutter();
          response = { success: true, data: { mode: 'detect', clutter } };
        } else {
          const result = fullCleanup();
          response = { success: true, data: { mode: 'full', ...result } };
        }
        break;
      }
      case 'press':
        response = await handlePress(command.key, command.modifiers, command.selector, command.stealth);
        break;
      case 'dblclick':
        response = await handleDblClick(command.selector, command.stealth);
        break;
      case 'select':
        response = await handleSelect(command);
        break;
      case 'scroll':
        response = await handleScroll(command);
        break;
      case 'screenshot':
        response = { success: false, error: 'Screenshot not implemented in content script' };
        break;
      default:
        response = { success: false, error: 'Unknown command type' };
        break;
    }

    if (command.stealth) await withJitter(async () => {});
    return response;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function findElement(selector: string): Element | null {
  if (!selector || typeof selector !== 'string') return null;
  // text= prefix: search interactive elements by text content
  if (selector.startsWith('text=')) {
    const text = selector.slice(5);
    const lowerText = text.toLowerCase();
    // Search broadly: interactive elements first, then all elements
    const interactive = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [onclick], input, select, textarea, [contenteditable], label, summary, details, [tabindex]'
    );
    // Pass 1: exact text match (trimmed) — most specific
    for (const el of Array.from(interactive)) {
      const elText = el.textContent?.trim() || '';
      if (elText.toLowerCase() === lowerText) return el;
    }
    // Pass 2: element whose DIRECT text (not children) matches
    for (const el of Array.from(interactive)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const elText = el.textContent?.trim() || '';
      if (elText.toLowerCase().includes(lowerText) && elText.length < lowerText.length * 3) return el;
    }
    // Pass 3: aria-label match
    for (const el of Array.from(interactive)) {
      const label = el.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes(lowerText)) return el;
    }
    // Pass 4: broader includes, prefer shortest match (most specific element)
    let bestEl: Element | null = null;
    let bestLen = Infinity;
    for (const el of Array.from(interactive)) {
      const elText = el.textContent?.trim() || '';
      if (elText.toLowerCase().includes(lowerText) && elText.length < bestLen) {
        bestEl = el;
        bestLen = elText.length;
      }
    }
    if (bestEl) return bestEl;
    // Pass 5: leaf elements (no children) containing the text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (el.textContent?.trim().toLowerCase().includes(lowerText) && el.children.length === 0) return el;
    }
    return null;
  }

  // role= prefix: find by ARIA role
  if (selector.startsWith('role=')) {
    const parts = selector.slice(5);
    const [role, ...rest] = parts.split(':');
    const filter = rest.join(':');
    // Fix 2: Shadow DOM piercing for role selectors
    const candidates = document.querySelectorAll(`[role="${role}"]`);
    let allCandidates = Array.from(candidates);
    if (allCandidates.length === 0) {
      allCandidates = deepQuerySelectorAll(document, `[role="${role}"]`);
    }

    // nth= modifier
    if (filter.startsWith('nth=')) {
      const n = parseInt(filter.slice(4), 10);
      return allCandidates[n - 1] ?? null;
    }

    if (!filter) return allCandidates[0] ?? null;
    for (const el of allCandidates) {
      // Fix 3: Sanitize aria-label before matching
      const rawLabel = el.getAttribute('aria-label') || el.textContent?.trim() || '';
      const label = sanitizeAriaLabel(rawLabel);
      if (label.includes(filter)) return el;
    }
    return null;
  }

  // aria= prefix: find by aria-label
  if (selector.startsWith('aria=')) {
    const label = selector.slice(5);
    const escaped = escapeCSSAttrValue(label);
    let result = document.querySelector(`[aria-label="${escaped}"]`) ??
      document.querySelector(`[aria-label*="${escaped}"]`) ??
      null;
    // Fix 2: Shadow DOM fallback
    if (!result) {
      result = deepQuerySelector(document, `[aria-label="${escaped}"]`) ??
        deepQuerySelector(document, `[aria-label*="${escaped}"]`) ??
        null;
    }
    return result;
  }

  // cell= prefix: find spreadsheet/table cell by coordinates (e.g. cell=A1 or cell=R1C1)
  if (selector.startsWith('cell=')) {
    const ref = selector.slice(5).toUpperCase();
    const escaped = escapeCSSAttrValue(ref);
    // Try exact aria-label match first (Google Sheets uses labels like "A1" or "Cell A1")
    const byExact = document.querySelector(`[aria-label="${escaped}"]`);
    if (byExact) return byExact;
    // Try contains match but verify it's the right cell (avoid A1 matching A10)
    const candidates = document.querySelectorAll(`[aria-label*="${escaped}"]`);
    for (const el of Array.from(candidates)) {
      const rawLabel = el.getAttribute('aria-label') || '';
      // Fix 3: Escape regex chars in ref before using in RegExp
      const escapedRef = escapeRegexChars(ref);
      // Match if label equals ref, or ref appears as a whole token (followed by non-alphanumeric or end)
      if (rawLabel === ref || new RegExp(`\\b${escapedRef}\\b`, 'i').test(rawLabel)) return el;
    }
    // Try data-cell attribute
    const byData = document.querySelector(`[data-cell="${escaped}"]`);
    if (byData) return byData;
    // Try td with matching id
    const byId = document.querySelector(`td[id*="${escaped}"], th[id*="${escaped}"]`);
    if (byId) return byId;
    // Note: caller should use navigateToCell() as fallback for canvas apps
    return null;
  }

  // Default: CSS selector
  // Fix 2: Try normal querySelector first, then shadow DOM piercing
  try {
    const result = document.querySelector(selector);
    if (result) return result;
  } catch { /* invalid selector syntax */ }
  return deepQuerySelector(document, selector);
}

async function handleClick(selector: string, stealth?: boolean, x?: number, y?: number): Promise<BridgeResponse> {
  if (!selector || typeof selector !== 'string') return { success: false, error: 'Invalid selector: must be a string' };
  const element = findElement(selector);

  // Name-box fallback for cell= selectors in canvas apps (no ARIA gridcells)
  if (!element && selector.startsWith('cell=')) {
    const ref = selector.slice(5);
    const ok = await navigateToCell(ref);
    if (ok) return { success: true, data: { navigatedTo: ref.toUpperCase() } };
    return { success: false, error: `Cell not found and name-box fallback failed: ${selector}` };
  }

  if (!element) return { success: false, error: `Element not found: ${selector}` };

  try {
    (element as HTMLElement | undefined)?.scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch {
    // ignore
  }

  // Coordinate-based click: dispatch mouse events at specific x,y offset within the element.
  // Critical for canvas apps (Sheets, Figma, Excalidraw, Maps) where CSS selectors can't
  // target individual drawn elements.
  if (x !== undefined && y !== undefined) {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + x;
    const clientY = rect.top + y;
    const eventOpts: MouseEventInit = {
      bubbles: true, cancelable: true, button: 0,
      clientX, clientY,
      screenX: clientX, screenY: clientY,
    };

    if (stealth) {
      // Full human-like sequence with jitter
      const jx = (Math.random() - 0.5) * 2;
      const jy = (Math.random() - 0.5) * 2;
      eventOpts.clientX! += jx;
      eventOpts.clientY! += jy;
      element.dispatchEvent(new MouseEvent('mousemove', eventOpts));
      await sleep(30 + Math.random() * 50);
    }

    element.dispatchEvent(new MouseEvent('mousedown', { ...eventOpts, detail: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, detail: 1 }));
    element.dispatchEvent(new MouseEvent('click', { ...eventOpts, detail: 1 }));
    return { success: true, data: { clickedAt: { x: clientX, y: clientY } } };
  }

  if (stealth) {
    await humanClick(element);
    return { success: true };
  }

  if (element instanceof HTMLElement) {
    element.click();
    return { success: true };
  }

  return { success: false, error: 'Element is not clickable' };
}

async function handleType(selector: string, text: string, stealth?: boolean): Promise<BridgeResponse> {
  // If no selector provided, type into the currently focused/active element
  let element: Element | null = null;
  if (!selector || typeof selector !== 'string') {
    element = document.activeElement;
    if (!element || element === document.body) {
      return { success: false, error: 'No selector provided and no element is focused' };
    }
  } else {
    element = findElement(selector);
  }
  if (!element) return { success: false, error: `Element not found: ${selector}` };

  const editable = resolveEditableElement(element);
  if (!editable) {
    return { success: false, error: 'Element is not editable (input/textarea/contenteditable)' };
  }

  try {
    if (stealth) await humanType(editable, text);
    else await typeInto(editable, text);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Type failed' };
  }
}

async function handleRead(selector: string): Promise<BridgeResponse> {
  if (!selector || typeof selector !== 'string') return { success: false, error: 'Invalid selector: must be a string' };
  // Cell range reading: cell=A1:B5 → read a grid block from ARIA overlay
  const rangeMatch = selector.match(/^cell=([A-Za-z]+\d+):([A-Za-z]+\d+)$/);
  if (rangeMatch) {
    return await readCellRange(rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase());
  }

  // Prefix selectors (text=, role=, aria=, cell=) route through findElement
  if (/^(text=|role=|aria=|cell=)/.test(selector)) {
    const el = findElement(selector);
    if (!el && selector.startsWith('cell=')) {
      // Fallback: read single cell via name-box + formula-bar
      const ref = selector.slice(5);
      const value = await readCellViaFormulaBar(ref);
      return { success: true, data: { cell: ref.toUpperCase(), value } };
    }
    if (!el) return { success: false, error: `Element not found: ${selector}` };
    return { success: true, data: readText(el) };
  }

  // Standard CSS selectors can match multiple elements
  let nodes = Array.from(document.querySelectorAll(selector));
  // Fix 2: Shadow DOM fallback for read
  if (nodes.length === 0) {
    nodes = deepQuerySelectorAll(document, selector);
  }
  if (nodes.length === 0) return { success: false, error: `Element not found: ${selector}` };

  const texts = nodes.map((el) => readText(el));
  if (texts.length === 1) return { success: true, data: texts[0] };
  return { success: true, data: texts };
}

/**
 * Read a rectangular range of cell values from ARIA grid overlay.
 * Parses cell references like A1:B5 and extracts text from gridcell elements.
 */
async function readCellRange(startRef: string, endRef: string): Promise<BridgeResponse> {
  // Parse column letters and row numbers
  const parseRef = (ref: string) => {
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const col = match[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0);
    return { col, row: parseInt(match[2], 10) };
  };

  const start = parseRef(startRef);
  const end = parseRef(endRef);
  if (!start || !end) return { success: false, error: `Invalid cell range: ${startRef}:${endRef}` };

  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  // Collect cell values by scanning gridcell elements
  const grid: Record<string, string> = {};
  const cells = document.querySelectorAll('[role="gridcell"]');
  for (const cell of Array.from(cells)) {
    const label = cell.getAttribute('aria-label') || '';
    // Try to extract cell ref from aria-label (e.g., "A1", "Cell A1, value 42")
    const refMatch = label.match(/\b([A-Z]+)(\d+)\b/);
    if (!refMatch) continue;
    const cellCol = refMatch[1].split('').reduce((acc: number, c: string) => acc * 26 + c.charCodeAt(0) - 64, 0);
    const cellRow = parseInt(refMatch[2], 10);
    if (cellRow >= minRow && cellRow <= maxRow && cellCol >= minCol && cellCol <= maxCol) {
      const ref = refMatch[1] + refMatch[2];
      grid[ref] = cell.textContent?.trim() || '';
    }
  }

  // Also try reading from accessible name/value pairs
  if (Object.keys(grid).length === 0) {
    // Fallback: try row/column index-based approach
    const rows = document.querySelectorAll('[role="row"]');
    for (let r = minRow; r <= maxRow && r <= rows.length; r++) {
      const row = rows[r - 1]; // 1-based to 0-based
      if (!row) continue;
      const rowCells = row.querySelectorAll('[role="gridcell"]');
      for (let c = minCol; c <= maxCol && c <= rowCells.length; c++) {
        const cell = rowCells[c - 1];
        if (!cell) continue;
        // Convert 1-based column number to letter(s): 1→A, 26→Z, 27→AA
        let colStr = '';
        let cn = c;
        while (cn > 0) { colStr = String.fromCharCode(64 + ((cn - 1) % 26) + 1) + colStr; cn = Math.floor((cn - 1) / 26); }
        grid[`${colStr}${r}`] = cell.textContent?.trim() || '';
      }
    }
  }

  // Name-box + formula-bar fallback for canvas apps without ARIA gridcells
  if (Object.keys(grid).length === 0) {
    const nameBox = document.querySelector('#t-name-box') as HTMLInputElement | null;
    if (nameBox) {
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          let colStr = '';
          let cn = c;
          while (cn > 0) { colStr = String.fromCharCode(64 + ((cn - 1) % 26) + 1) + colStr; cn = Math.floor((cn - 1) / 26); }
          const cellRef = `${colStr}${r}`;
          const value = await readCellViaFormulaBar(cellRef);
          grid[cellRef] = value;
        }
      }
    }
  }

  return {
    success: true,
    data: {
      range: `${startRef}:${endRef}`,
      cells: grid,
      count: Object.keys(grid).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Fix 2: Shadow DOM Piercing — traverse shadow roots for selector matching
// ---------------------------------------------------------------------------

function deepQuerySelectorAll(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = [];
  try {
    results.push(...Array.from(root.querySelectorAll(selector)));
  } catch { /* invalid selector */ }

  // Traverse shadow roots
  const traverse = (node: Document | Element | ShadowRoot) => {
    const children = node instanceof Document ? Array.from(node.querySelectorAll('*')) : Array.from(node.querySelectorAll('*'));
    for (const child of children) {
      if (child.shadowRoot) {
        try {
          results.push(...Array.from(child.shadowRoot.querySelectorAll(selector)));
        } catch { /* invalid selector */ }
        traverse(child.shadowRoot);
      }
    }
  };
  traverse(root);
  return results;
}

function deepQuerySelector(root: Document | Element | ShadowRoot, selector: string): Element | null {
  try {
    const result = root.querySelector(selector);
    if (result) return result;
  } catch { /* invalid selector */ }

  // Traverse shadow roots
  const traverse = (node: Document | Element | ShadowRoot): Element | null => {
    const children = Array.from(node.querySelectorAll('*'));
    for (const child of children) {
      if (child.shadowRoot) {
        try {
          const found = child.shadowRoot.querySelector(selector);
          if (found) return found;
        } catch { /* invalid selector */ }
        const deeper = traverse(child.shadowRoot);
        if (deeper) return deeper;
      }
    }
    return null;
  };
  return traverse(root);
}

// ---------------------------------------------------------------------------
// Fix 3: Aria-Label Sanitization — escape special chars for regex/CSS safety
// ---------------------------------------------------------------------------

function sanitizeAriaLabel(label: string): string {
  if (!label) return '';
  // Truncate absurdly long labels (some Amazon/eBay product labels are 500+ chars)
  let safe = label.substring(0, 200);
  // Normalize unicode whitespace
  safe = safe.replace(/[\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, ' ');
  // Collapse multiple spaces
  safe = safe.replace(/\s+/g, ' ').trim();
  return safe;
}

function escapeRegexChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCSSAttrValue(str: string): string {
  // Escape chars that break CSS attribute selectors: " \ and control chars
  return str.replace(/["\\]/g, '\\$&').replace(/[\x00-\x1f\x7f]/g, '');
}

// ---------------------------------------------------------------------------
// Fix 4: Natural Language Extract — heuristic content extraction by description
// ---------------------------------------------------------------------------

function isNaturalLanguageQuery(value: string): boolean {
  if (!value || value.length < 3) return false;
  // If it looks like a CSS selector (starts with ., #, [, or contains tag-like patterns), it's not NL
  if (/^[.#\[]/.test(value)) return false;
  if (/^[a-z]+[.#\[][a-z]/i.test(value)) return false;
  // If it contains CSS combinator patterns, it's not NL
  if (/[>+~]/.test(value) && !/\s[>+~]\s/.test(value)) return false;
  // If it's a simple tag name, not NL
  if (/^(div|span|p|a|h[1-6]|ul|ol|li|table|tr|td|th|img|input|button|form|section|article|nav|header|footer|main|aside)$/i.test(value)) return false;
  // Contains spaces or articles/prepositions = likely natural language
  if (/\b(the|a|an|of|on|in|for|from|this|that|all|each|every)\b/i.test(value)) return true;
  // Contains descriptive words (including plurals)
  if (/\b(titles?|names?|prices?|headlines?|comments?|reviews?|dates?|times?|authors?|scores?|counts?|texts?|contents?|descriptions?|links?|urls?|images?|videos?|posts?|articles?|items?|products?|results?|channels?|views?)\b/i.test(value)) return true;
  // Multiple words = likely natural language
  if (value.split(/\s+/).length >= 2) return true;
  return false;
}

interface NLExtractResult {
  items: string[];
  method: string;
}

function extractByNaturalLanguage(description: string): NLExtractResult {
  const lower = description.toLowerCase();

  // Title/headline patterns (handle plurals: titles, headlines, headings)
  if (/\b(titles?|headlines?|headings?)\b/.test(lower)) {
    return extractTitles();
  }

  // Price/cost patterns
  if (/\b(prices?|costs?|amounts?|fees?)\b/.test(lower)) {
    return extractPrices();
  }

  // Score/vote/upvote/rating patterns
  if (/\b(scores?|votes?|upvotes?|downvotes?|ratings?|points?|karma)\b/.test(lower)) {
    return extractScores();
  }

  // Comment/review/feedback patterns
  if (/\b(comments?|reviews?|feedback|replies|reply|responses?)\b/.test(lower)) {
    return extractTextBlocks('comment');
  }

  // Date/time patterns
  if (/\b(dates?|times?|when|posted|published|created|updated|ago)\b/.test(lower)) {
    return extractDates();
  }

  // Name/author/user/channel patterns
  if (/\b(names?|authors?|users?|channels?|creators?|by|posters?|usernames?|handles?)\b/.test(lower)) {
    return extractNames();
  }

  // Link/URL patterns
  if (/\b(links?|urls?|hrefs?)\b/.test(lower)) {
    return extractLinks();
  }

  // Image patterns
  if (/\b(images?|imgs?|photos?|pictures?|thumbnails?|avatars?)\b/.test(lower)) {
    return extractImages();
  }

  // View/watch/play count patterns
  if (/\b(views?|watch|play|listen|stream|view.?count)\b/.test(lower)) {
    return extractViewCounts();
  }

  // Description/summary/excerpt/snippet patterns
  if (/\b(descriptions?|summar(y|ies)|excerpts?|snippets?|previews?|subtitles?|sub.?titles?|taglines?)\b/.test(lower)) {
    return extractDescriptions();
  }

  // Generic: try to find repeated patterns that match the description
  return extractGeneric(description);
}

function extractTitles(): NLExtractResult {
  const titles: string[] = [];

  // Strategy 1: h1-h3 headings
  const headings = document.querySelectorAll('h1, h2, h3');
  for (const h of Array.from(headings)) {
    const text = h.textContent?.trim();
    if (text && text.length > 3 && text.length < 300) titles.push(text);
  }

  // Strategy 2: links inside repeated containers (common in feeds/lists)
  if (titles.length < 3) {
    const repeated = findRepeatedContainers();
    for (const container of repeated) {
      const link = container.querySelector('a[href]');
      const heading = container.querySelector('h1, h2, h3, h4, [role="heading"]');
      const el = heading || link;
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 3 && text.length < 300 && !titles.includes(text)) {
          titles.push(text);
        }
      }
    }
  }

  // Strategy 3: aria heading roles
  if (titles.length < 3) {
    const ariaHeadings = document.querySelectorAll('[role="heading"]');
    for (const h of Array.from(ariaHeadings)) {
      const text = h.textContent?.trim();
      if (text && text.length > 3 && !titles.includes(text)) titles.push(text);
    }
  }

  // Strategy 4: links with title attributes
  if (titles.length < 3) {
    const titledLinks = document.querySelectorAll('a[title]');
    for (const a of Array.from(titledLinks)) {
      const text = a.getAttribute('title')?.trim();
      if (text && text.length > 3 && !titles.includes(text)) titles.push(text);
    }
  }

  return { items: titles.slice(0, 50), method: 'headings+repeated-containers' };
}

function extractPrices(): NLExtractResult {
  const prices: string[] = [];
  const priceRegex = /(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP)\s*[\d,]+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP)/;

  // Walk all text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() || '';
    const match = text.match(priceRegex);
    if (match && match[0]) {
      prices.push(match[0]);
    }
  }

  // Also check elements with price-related classes/attributes
  const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"], [data-price], [itemprop="price"]');
  for (const el of Array.from(priceEls)) {
    const text = el.textContent?.trim();
    if (text && text.length < 30 && !prices.includes(text)) {
      prices.push(text);
    }
  }

  return { items: [...new Set(prices)].slice(0, 50), method: 'price-regex+price-classes' };
}

function extractScores(): NLExtractResult {
  const scores: string[] = [];

  // Elements with score/vote related attributes
  const scoreEls = document.querySelectorAll(
    '[class*="score"], [class*="vote"], [class*="karma"], [class*="rating"], [class*="points"], ' +
    '[data-score], [data-vote-count], [aria-label*="vote"], [aria-label*="point"]'
  );
  for (const el of Array.from(scoreEls)) {
    const text = el.textContent?.trim();
    if (text && text.length < 20) scores.push(text);
  }

  // Shadow DOM fallback for sites like Reddit
  if (scores.length === 0) {
    const shadowScores = deepQuerySelectorAll(document, '[class*="score"], [class*="vote"], [data-score]');
    for (const el of shadowScores) {
      const text = el.textContent?.trim();
      if (text && text.length < 20) scores.push(text);
    }
  }

  return { items: scores.slice(0, 50), method: 'score-classes+shadow-dom' };
}

function extractTextBlocks(type: string): NLExtractResult {
  const blocks: string[] = [];
  const selectors = type === 'comment'
    ? '[class*="comment"], [class*="Comment"], [data-type="comment"], [class*="reply"], [class*="post-body"]'
    : 'p, [class*="text"], [class*="body"], [class*="content"]';

  const els = document.querySelectorAll(selectors);
  for (const el of Array.from(els)) {
    const text = el.textContent?.trim();
    if (text && text.length > 10 && text.length < 2000) blocks.push(text);
  }

  return { items: blocks.slice(0, 30), method: `${type}-selectors` };
}

function extractDates(): NLExtractResult {
  const dates: string[] = [];

  // time elements
  const timeEls = document.querySelectorAll('time, [datetime], [class*="date"], [class*="time"], [class*="ago"]');
  for (const el of Array.from(timeEls)) {
    const datetime = el.getAttribute('datetime');
    const text = datetime || el.textContent?.trim();
    if (text && text.length < 60) dates.push(text);
  }

  // Text with date-like patterns
  if (dates.length === 0) {
    const dateRegex = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim() || '';
      const matches = text.match(dateRegex);
      if (matches) dates.push(...matches);
    }
  }

  return { items: [...new Set(dates)].slice(0, 50), method: 'time-elements+date-regex' };
}

function extractNames(): NLExtractResult {
  const names: string[] = [];

  // Channel/author/user elements
  const nameEls = document.querySelectorAll(
    '[class*="author"], [class*="channel"], [class*="user"], [class*="creator"], [class*="byline"], ' +
    '[class*="Author"], [class*="Channel"], [class*="User"], [itemprop="author"], [rel="author"]'
  );
  for (const el of Array.from(nameEls)) {
    const text = el.textContent?.trim();
    if (text && text.length > 1 && text.length < 100 && !names.includes(text)) names.push(text);
  }

  // Links inside repeated containers that look like usernames (short text)
  if (names.length === 0) {
    const repeated = findRepeatedContainers();
    for (const container of repeated) {
      const links = container.querySelectorAll('a[href]');
      for (const link of Array.from(links)) {
        const text = link.textContent?.trim();
        // Heuristic: names/usernames are short and don't contain price/date patterns
        if (text && text.length > 1 && text.length < 50 && !/[\$\d{4}]/.test(text)) {
          // Skip if it looks like a title (too long)
          if (text.split(' ').length <= 4 && !names.includes(text)) {
            names.push(text);
            break; // one name per container
          }
        }
      }
    }
  }

  return { items: names.slice(0, 50), method: 'name-classes+repeated-containers' };
}

function extractLinks(): NLExtractResult {
  const links: string[] = [];
  const allLinks = document.querySelectorAll('a[href]');
  for (const a of Array.from(allLinks)) {
    const href = (a as HTMLAnchorElement).href;
    if (href && !href.startsWith('javascript') && href !== '#') {
      links.push(href);
    }
  }
  return { items: [...new Set(links)].slice(0, 50), method: 'anchor-hrefs' };
}

function extractImages(): NLExtractResult {
  const images: string[] = [];
  const imgs = document.querySelectorAll('img[src], [style*="background-image"]');
  for (const img of Array.from(imgs)) {
    if (img instanceof HTMLImageElement) {
      if (img.src && img.naturalWidth > 50) images.push(img.src);
    } else {
      const style = (img as HTMLElement).style.backgroundImage;
      const urlMatch = style?.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) images.push(urlMatch[1]);
    }
  }
  return { items: images.slice(0, 50), method: 'img-elements' };
}

function extractViewCounts(): NLExtractResult {
  const counts: string[] = [];

  // Elements with view/watch count indicators
  const viewEls = document.querySelectorAll(
    '[class*="view"], [class*="watch"], [class*="play-count"], [class*="views"], ' +
    '[aria-label*="view"], [aria-label*="watch"]'
  );
  for (const el of Array.from(viewEls)) {
    const text = el.textContent?.trim();
    if (text && text.length < 30 && /\d/.test(text)) counts.push(text);
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && /\d/.test(ariaLabel) && /view|watch|play/i.test(ariaLabel)) {
      counts.push(ariaLabel);
    }
  }

  return { items: [...new Set(counts)].slice(0, 50), method: 'view-count-classes' };
}

function extractDescriptions(): NLExtractResult {
  const descriptions: string[] = [];
  const repeated = findRepeatedContainers();
  for (const container of repeated) {
    // Look for paragraphs, spans, or description-like elements
    const desc = container.querySelector(
      'p, [class*="description"], [class*="snippet"], [class*="summary"], [class*="preview"], ' +
      '[class*="subtitle"], [class*="meta"]'
    );
    if (desc) {
      const text = desc.textContent?.trim();
      if (text && text.length > 10 && text.length < 500) descriptions.push(text);
    }
  }
  return { items: descriptions.slice(0, 50), method: 'description-selectors' };
}

function extractGeneric(description: string): NLExtractResult {
  const items: string[] = [];
  // Try to find elements whose text content relates to the description
  const repeated = findRepeatedContainers();
  for (const container of repeated) {
    const text = container.textContent?.trim();
    if (text && text.length > 3 && text.length < 500) items.push(text);
  }
  if (items.length === 0) {
    // Fallback: all visible text from main content area
    const main = document.querySelector('main, [role="main"], #content, .content, article');
    if (main) {
      const paragraphs = main.querySelectorAll('p, li, h1, h2, h3, h4, span');
      for (const p of Array.from(paragraphs)) {
        const text = p.textContent?.trim();
        if (text && text.length > 5) items.push(text);
      }
    }
  }
  return { items: items.slice(0, 50), method: 'generic-repeated-containers' };
}

/**
 * Find repeated sibling containers — the core pattern for feed/list pages.
 * Looks for parent elements with many same-tag children (ul>li, div>div, etc.)
 */
function findRepeatedContainers(): Element[] {
  const candidates: Element[] = [];
  // Look for common list/feed patterns
  const listParents = document.querySelectorAll('ul, ol, [role="list"], [role="feed"], section, main, [role="main"]');
  for (const parent of Array.from(listParents)) {
    const children = Array.from(parent.children);
    if (children.length < 2) continue;

    // Count tag frequency among children
    const tagCounts = new Map<string, number>();
    for (const child of children) {
      const tag = child.tagName;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    // If a tag appears 3+ times, those children are our repeated containers
    for (const [tag, count] of tagCounts) {
      if (count >= 3) {
        candidates.push(...children.filter(c => c.tagName === tag));
      }
    }
    if (candidates.length >= 3) break;
  }

  // Fallback: find divs with many same-class siblings
  if (candidates.length < 3) {
    const allDivs = document.querySelectorAll('div[class]');
    const classCounts = new Map<string, Element[]>();
    for (const div of Array.from(allDivs)) {
      const cls = div.className;
      if (!cls || typeof cls !== 'string') continue;
      const key = cls.split(' ').sort().join(' ');
      const list = classCounts.get(key) || [];
      list.push(div);
      classCounts.set(key, list);
    }
    // Pick the largest group of same-class divs
    let bestGroup: Element[] = [];
    for (const [, group] of classCounts) {
      if (group.length > bestGroup.length && group.length >= 3) {
        bestGroup = group;
      }
    }
    if (bestGroup.length >= 3) candidates.push(...bestGroup);
  }

  return candidates.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Fix 1: Smart Extract Fallback — semantic extraction when CSS selectors fail
// ---------------------------------------------------------------------------

function smartExtractFallback(selector: string, key: string): string {
  // Try to infer what kind of data was expected based on the selector and key
  const lower = (selector + ' ' + key).toLowerCase();

  // Title-like selectors
  if (/title|heading|h[1-6]|headline/i.test(lower)) {
    const result = extractTitles();
    return result.items.join('\n');
  }

  // Price-like selectors
  if (/price|cost|amount/i.test(lower)) {
    const result = extractPrices();
    return result.items.join('\n');
  }

  // Score-like selectors
  if (/score|vote|rating|point/i.test(lower)) {
    const result = extractScores();
    return result.items.join('\n');
  }

  // Channel/author
  if (/channel|author|user|creator/i.test(lower)) {
    const result = extractNames();
    return result.items.join('\n');
  }

  // Views
  if (/view|watch|play/i.test(lower)) {
    const result = extractViewCounts();
    return result.items.join('\n');
  }

  return '';
}

async function handleExtract(command: {
  range?: string;
  format?: 'array' | 'object' | 'csv';
  schema?: Record<string, string>;
}): Promise<BridgeResponse> {
  const { range, format = 'object', schema } = command;

  // New range-based extraction: "A1:B5" → read cells via name-box + formula-bar
  if (range) {
    const rangeMatch = range.match(/^([A-Za-z]+\d+):([A-Za-z]+\d+)$/);
    if (!rangeMatch) return { success: false, error: `Invalid range: ${range}` };
    const startRef = rangeMatch[1].toUpperCase();
    const endRef = rangeMatch[2].toUpperCase();
    const parseRef = (ref: string) => {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) return null;
      const col = m[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0);
      return { col, row: parseInt(m[2], 10), colStr: m[1] };
    };

    const start = parseRef(startRef);
    const end = parseRef(endRef);
    if (!start || !end) return { success: false, error: `Invalid cell refs: ${range}` };

    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);

    const colToStr = (c: number): string => {
      let s = '';
      let n = c;
      while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };

    // Read all cells via name-box + formula-bar
    const grid: Record<string, string> = {};
    const rows: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const ref = `${colToStr(c)}${r}`;
        const value = await readCellViaFormulaBar(ref);
        grid[ref] = value;
        row.push(value);
      }
      rows.push(row);
    }

    if (format === 'array') {
      return { success: true, data: { range, values: rows } };
    } else if (format === 'csv') {
      const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
      return { success: true, data: { range, csv } };
    } else {
      return { success: true, data: { range, cells: grid, count: Object.keys(grid).length } };
    }
  }

  // Schema-based extraction: { key: selector_or_description } → { key: text }
  const result: Record<string, string | string[]> = {};
  const meta: Record<string, string> = {};
  const entries =
    schema && typeof schema === 'object'
      ? Object.entries(schema as Record<string, string>)
      : ([] as Array<[string, string]>);

  for (const [key, selectorOrDesc] of entries) {
    if (!selectorOrDesc) {
      result[key] = '';
      continue;
    }

    // Fix 4: Natural Language Extract Mode
    if (isNaturalLanguageQuery(selectorOrDesc)) {
      const nlResult = extractByNaturalLanguage(selectorOrDesc);
      result[key] = nlResult.items;
      meta[key] = `nl:${nlResult.method}`;
      continue;
    }

    // Standard CSS selector path
    // Try normal querySelector first
    let element: Element | null = null;
    try {
      element = document.querySelector(selectorOrDesc);
    } catch { /* invalid CSS selector syntax */ }

    // Fix 2: Shadow DOM fallback
    if (!element) {
      element = deepQuerySelector(document, selectorOrDesc);
      if (element) meta[key] = 'shadow-dom';
    }

    if (element) {
      result[key] = readText(element);
    } else {
      // Fix 1: Smart Extract Fallback — try semantic extraction
      const fallbackText = smartExtractFallback(selectorOrDesc, key);
      if (fallbackText) {
        result[key] = fallbackText;
        meta[key] = 'smart-fallback';
      } else {
        result[key] = '';
        meta[key] = 'not-found';
      }
    }
  }

  // Include extraction metadata (method used for each key) alongside results
  const responseData = Object.keys(meta).length > 0 ? { result, _meta: meta } : result;
  return { success: true, data: responseData };
}

// ---------------------------------------------------------------------------
// Act handler — instruction execution for spreadsheets and generic pages
// ---------------------------------------------------------------------------

// Fuzzy match: score how well `query` matches `candidate` (both lowercased).
// Returns 0 for no match, higher is better.
function fuzzyMatchScore(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  // Exact match
  if (q === c) return 1000;
  // Full substring match (query in candidate)
  if (c.includes(q)) return 500 + q.length;
  // Full substring match (candidate in query)
  if (q.includes(c)) return 400 + c.length;
  // Word overlap scoring
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  const cWords = c.split(/\s+/).filter(w => w.length > 1);
  let overlap = 0;
  for (const qw of qWords) {
    for (const cw of cWords) {
      if (cw === qw) overlap += 10;
      else if (cw.includes(qw) || qw.includes(cw)) overlap += 5;
    }
  }
  return overlap;
}

// Lightweight inline recon: scan visible interactive elements and inputs.
// Returns the same shape as handleRecon's actions[] and inputs[].
function scanPageActions(): Array<{ selector: string; label: string; purpose: string; tag: string }> {
  const results: Array<{ selector: string; label: string; purpose: string; tag: string }> = [];
  const selectors = [
    'button:not([disabled])',
    '[role="button"]',
    'a[href]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="searchbox"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="link"]',
  ];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top >= window.innerHeight || rect.bottom <= 0) return;

      const rawLabel =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        (el.textContent?.trim() || '').substring(0, 60);
      // Fix 3: Sanitize aria-labels to prevent regex/CSS crashes
      const label = sanitizeAriaLabel(rawLabel);
      if (!label) return;

      let bestSel = '';
      if (el.id && !/^[a-z]{1,2}-[0-9a-f]{4,}/i.test(el.id)) bestSel = '#' + el.id;
      else if (el.getAttribute('data-testid')) bestSel = `[data-testid="${el.getAttribute('data-testid')}"]`;
      else if (el.getAttribute('aria-label')) bestSel = `${el.tagName.toLowerCase()}[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(el.getAttribute('aria-label') || ''))}"]`;
      else if (el.getAttribute('name')) bestSel = `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
      else if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('javascript') && href.length < 150)
          bestSel = `a[href="${href.replace(/"/g, '\\"')}"]`;
        else bestSel = `text=${label.substring(0, 40)}`;
      }
      else bestSel = el.tagName.toLowerCase();

      const l = label.toLowerCase();
      let purpose = 'action';
      if (l.includes('search')) purpose = 'search';
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).contentEditable === 'true')
        purpose = 'input';

      results.push({ selector: bestSel, label: label.substring(0, 60), purpose, tag: el.tagName.toLowerCase() });
    });
  }
  return results.slice(0, 150);
}

interface ActStep {
  op: string;
  ref?: string;
  text?: string;
  key?: string;
  modifiers?: string[];
  selector?: string;
  target?: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

function parseActInstruction(instruction: string): ActStep[] {
  const steps: ActStep[] = [];
  const instr = instruction.trim();

  // Extract cell references
  const cellRefPattern = /\b([A-Z]{1,3}\d{1,7})\b/gi;

  // Extract quoted text
  const quotedPattern = /["']([^"']+)["']/;
  const quotedMatch = instr.match(quotedPattern);

  // Normalize instruction
  const lower = instr.toLowerCase();

  // Pattern: "clear cell X" / "delete X"
  if (/\b(clear|delete)\b/.test(lower)) {
    const refs = instr.match(cellRefPattern);
    if (refs && refs.length > 0) {
      steps.push({ op: 'navigate', ref: refs[0].toUpperCase(), status: 'pending' });
      steps.push({ op: 'press', key: 'Delete', status: 'pending' });
    }
    return steps;
  }

  // Pattern: "copy cell X" / "copy X"
  if (/\bcopy\b/.test(lower) && !/paste/.test(lower)) {
    const refs = instr.match(cellRefPattern);
    if (refs && refs.length > 0) {
      steps.push({ op: 'navigate', ref: refs[0].toUpperCase(), status: 'pending' });
      steps.push({ op: 'press', key: 'c', modifiers: ['ctrl'], status: 'pending' });
    }
    return steps;
  }

  // Pattern: "paste into X" / "paste X"
  if (/\bpaste\b/.test(lower)) {
    const refs = instr.match(cellRefPattern);
    if (refs && refs.length > 0) {
      steps.push({ op: 'navigate', ref: refs[0].toUpperCase(), status: 'pending' });
      steps.push({ op: 'press', key: 'v', modifiers: ['ctrl'], status: 'pending' });
    }
    return steps;
  }

  // Pattern: "press Ctrl+C" / "press Enter" / "press Tab"
  const pressMatch = lower.match(/\bpress\s+((?:(?:ctrl|shift|alt|meta|cmd)\+)*\w+)\b/i);
  if (pressMatch && !cellRefPattern.test(instr)) {
    const parts = pressMatch[1].split('+');
    const key = parts.pop()!;
    const modifiers = parts.length > 0 ? parts.map(m => m.toLowerCase()) : undefined;
    // Capitalize first letter for named keys
    const normalizedKey = key.length > 1 ? key.charAt(0).toUpperCase() + key.slice(1) : key;
    steps.push({ op: 'press', key: normalizedKey, modifiers, status: 'pending' });
    return steps;
  }

  // Pattern: "click/open X menu" / "click on Format menu"
  const menuMatch = instr.match(/\b(?:click|open)\s+(?:on\s+)?(?:the\s+)?(\w+)\s+menu\b/i);
  if (menuMatch) {
    steps.push({ op: 'click', selector: `role=menuitem:${menuMatch[1]}`, status: 'pending' });
    return steps;
  }

  // Pattern: combined "click/go/select/navigate cell X and/then type Y"
  const refs = instr.match(cellRefPattern);
  const typeMatch = instr.match(/\b(?:type|enter|input|write)\s+(?:(?:the\s+)?(?:value|text|formula)\s+)?(.+?)(?:\s+(?:in|into|to|at)\s+(?:cell\s+)?[A-Z]{1,3}\d{1,7})?$/i);
  let textToType: string | null = null;

  if (typeMatch) {
    let raw = typeMatch[1].trim();
    // Remove trailing "in X" if cell ref is at end
    raw = raw.replace(/\s+(?:in|into|to|at)\s+(?:cell\s+)?[A-Z]{1,3}\d{1,7}\s*$/i, '').trim();
    // Remove surrounding quotes
    raw = raw.replace(/^["']|["']$/g, '');
    textToType = raw;
  }

  // If quoted text found but typeMatch missed it, use quoted text
  if (!textToType && quotedMatch) {
    textToType = quotedMatch[1];
  }

  // Navigate to cell if a reference was found
  if (refs && refs.length > 0) {
    // If there are multiple refs and we're typing, navigate to the last one mentioned
    // "type Hello in B2" → B2 is the target
    const targetRef = refs[refs.length > 1 && textToType ? refs.length - 1 : 0].toUpperCase();
    steps.push({ op: 'navigate', ref: targetRef, status: 'pending' });
  }

  // Type text if found
  if (textToType) {
    steps.push({ op: 'type', text: textToType, target: 'formulaBar', status: 'pending' });
    steps.push({ op: 'press', key: 'Enter', status: 'pending' });
  }

  // If no steps were generated, try simple click/navigate
  if (steps.length === 0 && refs && refs.length > 0) {
    steps.push({ op: 'navigate', ref: refs[0].toUpperCase(), status: 'pending' });
  }

  // -----------------------------------------------------------------------
  // Generic fallback: works on ANY page, not just Sheets
  // -----------------------------------------------------------------------
  if (steps.length === 0) {
    const actions = scanPageActions();

    // Pattern: "type X in Y" / "type X into Y" / "enter X in Y"
    const typeInMatch = instr.match(/\b(?:type|enter|input|write)\s+(?:["']([^"']+)["']|(\S+))\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
    if (typeInMatch) {
      const textVal = typeInMatch[1] || typeInMatch[2];
      const targetDesc = typeInMatch[3].trim();
      // Find best matching input
      const inputs = actions.filter(a => a.purpose === 'input' || a.purpose === 'search');
      let bestMatch: typeof actions[0] | null = null;
      let bestScore = 0;
      for (const inp of inputs) {
        const score = fuzzyMatchScore(targetDesc, inp.label);
        if (score > bestScore) { bestScore = score; bestMatch = inp; }
      }
      if (bestMatch && bestScore >= 10) {
        steps.push({ op: 'click-selector', selector: bestMatch.selector, status: 'pending' });
        steps.push({ op: 'type', text: textVal, status: 'pending' });
      } else {
        // Fallback: try text= selector
        steps.push({ op: 'click-selector', selector: `text=${targetDesc}`, status: 'pending' });
        steps.push({ op: 'type', text: textVal, status: 'pending' });
      }
      return steps;
    }

    // Pattern: "type X" with no target — type into currently focused element
    const typeOnlyMatch = instr.match(/\b(?:type|enter|input|write)\s+(?:["']([^"']+)["']|(.+))$/i);
    if (typeOnlyMatch) {
      const textVal = typeOnlyMatch[1] || typeOnlyMatch[2].trim();
      steps.push({ op: 'type', text: textVal, status: 'pending' });
      return steps;
    }

    // Pattern: "click X" / "press X" / "tap X" / "select X" / "open X"
    const clickMatch = instr.match(/\b(?:click|press|tap|select|open|hit)\s+(?:on\s+)?(?:the\s+)?(.+)$/i);
    if (clickMatch) {
      const targetDesc = clickMatch[1].trim().replace(/\s+button$/i, '');
      let bestMatch: typeof actions[0] | null = null;
      let bestScore = 0;
      for (const act of actions) {
        const score = fuzzyMatchScore(targetDesc, act.label);
        if (score > bestScore) { bestScore = score; bestMatch = act; }
      }
      if (bestMatch && bestScore >= 10) {
        steps.push({ op: 'click-selector', selector: bestMatch.selector, status: 'pending' });
      } else {
        // Last resort: find by visible text content (works for links, tabs, etc.)
        steps.push({ op: 'click-selector', selector: `text=${targetDesc}`, status: 'pending' });
      }
      return steps;
    }

    // Truly unparseable
    steps.push({ op: 'unknown', status: 'failed', error: `Could not parse instruction: ${instruction}` });
  }

  return steps;
}

async function executeActStep(step: ActStep): Promise<void> {
  switch (step.op) {
    case 'navigate': {
      if (!step.ref) { step.status = 'failed'; step.error = 'No cell ref'; return; }
      const ok = await navigateToCell(step.ref);
      step.status = ok ? 'done' : 'failed';
      if (!ok) step.error = 'Name box not found';
      break;
    }
    case 'type': {
      if (!step.text) { step.status = 'failed'; step.error = 'No text'; return; }
      // Use CDP insertText to type into whatever is focused (usually the formula bar or cell editor)
      // Retry once after a pause — CDP debugger may still be detaching from the previous step
      let typed = await cdpKeys([
        { action: 'insertText', text: step.text },
      ]);
      if (!typed) {
        await sleep(300);
        typed = await cdpKeys([
          { action: 'insertText', text: step.text },
        ]);
      }
      step.status = typed ? 'done' : 'failed';
      if (!typed) step.error = 'CDP type failed';
      break;
    }
    case 'press': {
      if (!step.key) { step.status = 'failed'; step.error = 'No key'; return; }
      // Use CDP for trusted key events (canvas apps require isTrusted: true)
      const mods = step.modifiers || [];
      const modBits = (mods.includes('alt') ? 1 : 0) | (mods.includes('ctrl') ? 2 : 0) |
        (mods.includes('meta') || mods.includes('cmd') ? 4 : 0) | (mods.includes('shift') ? 8 : 0);
      const pressed = await cdpKeys([
        { action: 'keyDown', key: step.key, modifiers: modBits || undefined },
        { action: 'keyUp', key: step.key, modifiers: modBits || undefined },
      ]);
      if (pressed) {
        step.status = 'done';
      } else {
        // Fallback to synthetic events
        const res = await handlePress(step.key, step.modifiers);
        step.status = res.success ? 'done' : 'failed';
        if (!res.success) step.error = res.error;
      }
      break;
    }
    case 'click': {
      if (!step.selector) { step.status = 'failed'; step.error = 'No selector'; return; }
      const res = await handleClick(step.selector);
      step.status = res.success ? 'done' : 'failed';
      if (!res.success) step.error = res.error;
      break;
    }
    case 'click-selector': {
      if (!step.selector) { step.status = 'failed'; step.error = 'No selector'; return; }
      const el = findElement(step.selector);
      if (!el) { step.status = 'failed'; step.error = `Element not found: ${step.selector}`; return; }
      const clickRes = await handleClick(step.selector);
      step.status = clickRes.success ? 'done' : 'failed';
      if (!clickRes.success) step.error = clickRes.error;
      break;
    }
    default:
      step.status = 'failed';
      step.error = `Unknown step op: ${step.op}`;
  }
}

async function handleAct(instruction: string): Promise<BridgeResponse> {
  if (!instruction || !instruction.trim()) {
    return { success: false, error: 'No instruction provided' };
  }

  const steps = parseActInstruction(instruction);

  // Optimization: detect navigate+type+enter pattern and batch into a single CDP session
  // to avoid debugger detach/reattach timing issues
  if (steps.length >= 2 && steps[0].op === 'navigate' && steps[1].op === 'type' && steps[0].ref && steps[1].text) {
    const ref = steps[0].ref;
    const text = steps[1].text;
    const hasEnter = steps.length >= 3 && steps[2].op === 'press' && steps[2].key === 'Enter';

    const nameBox = document.querySelector('#t-name-box') as HTMLInputElement | null;
    if (nameBox) {
      const nbRect = nameBox.getBoundingClientRect();
      const nbX = Math.round(nbRect.left + nbRect.width / 2);
      const nbY = Math.round(nbRect.top + nbRect.height / 2);

      // Click canvas first to ensure grid focus
      const canvas = document.querySelector('canvas') as HTMLElement | null;
      const cdpSteps: Array<{ action: string; text?: string; key?: string; modifiers?: number; x?: number; y?: number }> = [];

      if (canvas) {
        const cvRect = canvas.getBoundingClientRect();
        cdpSteps.push({ action: 'mouseClick', x: Math.round(cvRect.left + 50), y: Math.round(cvRect.top + 50) });
        cdpSteps.push({ action: 'pause' });
      }

      // Click name-box, select all, type ref, Enter to navigate
      cdpSteps.push({ action: 'mouseClick', x: nbX, y: nbY });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'keyDown', key: 'a', modifiers: 2 });
      cdpSteps.push({ action: 'keyUp', key: 'a', modifiers: 2 });
      cdpSteps.push({ action: 'insertText', text: ref.toUpperCase() });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'keyDown', key: 'Enter' });
      cdpSteps.push({ action: 'keyUp', key: 'Enter' });
      // Wait for navigation to settle
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'pause' });
      cdpSteps.push({ action: 'pause' }); // ~300ms total pause

      // Type the value (starts cell editing automatically)
      cdpSteps.push({ action: 'insertText', text });

      // Press Enter to commit if needed
      if (hasEnter) {
        cdpSteps.push({ action: 'pause' });
        cdpSteps.push({ action: 'keyDown', key: 'Enter' });
        cdpSteps.push({ action: 'keyUp', key: 'Enter' });
      }

      const ok = await cdpKeys(cdpSteps);
      if (ok) {
        await sleep(300); // Wait for Sheets to commit
        steps[0].status = 'done';
        steps[1].status = 'done';
        if (hasEnter) steps[2].status = 'done';
        const completed = hasEnter ? 3 : 2;
        return {
          success: true,
          data: { instruction, steps, stepsCompleted: completed, stepsTotal: steps.length },
        };
      }
      // Fall through to sequential execution if batched CDP fails
    }
  }

  // Sequential execution for non-batchable steps
  let completed = 0;
  for (const step of steps) {
    if (step.status === 'failed') break;
    if ((step.status as string) === 'done') { completed++; continue; } // already handled by batch
    await executeActStep(step);
    if (step.status === 'done') completed++;
    else break;
    // Delay between steps for UI to settle and CDP debugger to fully detach
    await sleep(250);
  }

  const allDone = completed === steps.length;
  return {
    success: allDone,
    data: {
      instruction,
      steps,
      stepsCompleted: completed,
      stepsTotal: steps.length,
    },
    error: allDone ? undefined : steps.find(s => s.status === 'failed')?.error,
  };
}

async function handleEval(code: string): Promise<BridgeResponse> {
  // CSP blocks eval() in content scripts. Inject a <script> into the page
  // context and relay the result back via window.postMessage (shared between
  // page world and content script world).
  return new Promise((resolve) => {
    const nonce = `__pingos_eval_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'pingos_eval_result' || e.data?.nonce !== nonce) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      const data = e.data;
      if (data.error) {
        resolve({ success: false, error: data.error });
      } else {
        resolve({ success: true, data: data.result });
      }
    };
    window.addEventListener('message', handler);

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        var nonce = ${JSON.stringify(nonce)};
        try {
          var __r = (function(){ return (${code}); })();
          var finish = function(val) {
            try { val = JSON.parse(JSON.stringify(val)); } catch(e) { val = String(val); }
            window.postMessage({type:'pingos_eval_result', nonce:nonce, result:val}, '*');
          };
          if (__r && typeof __r === 'object' && typeof __r.then === 'function') {
            __r.then(finish).catch(function(e) {
              window.postMessage({type:'pingos_eval_result', nonce:nonce, error:String(e)}, '*');
            });
          } else {
            finish(__r);
          }
        } catch(e) {
          window.postMessage({type:'pingos_eval_result', nonce:nonce, error:String(e)}, '*');
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: 'Eval timed out (5s)' });
    }, 5000);
  });
}

async function handleWaitFor(selector: string, timeoutMs?: number): Promise<BridgeResponse> {
  const timeout = timeoutMs ?? 10_000;
  const started = Date.now();

  while (Date.now() - started < timeout) {
    if (findElement(selector)) return { success: true, data: true };
    await sleep(100);
  }

  return { success: false, error: `Timeout waiting for selector: ${selector}` };
}

async function handleObserve(): Promise<BridgeResponse> {
  const actions: string[] = [];
  const forms: { name: string; fields: string[] }[] = [];
  const navigation: string[] = [];

  let buttonCount = 0;
  let inputCount = 0;
  let linkCount = 0;

  // Scan visible interactive elements
  const selectors = [
    'button:not([disabled])',
    '[role="button"]',
    'a[href]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
  ];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top >= window.innerHeight || rect.bottom <= 0) return;

      const tag = el.tagName.toLowerCase();
      // Fix 3: Sanitize aria-labels in observe output
      const label = sanitizeAriaLabel(
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.textContent?.trim() || '').substring(0, 60)
      );
      const placeholder = el.getAttribute('placeholder') || '';

      if (tag === 'a') {
        const href = (el as HTMLAnchorElement).href || '';
        const text = label || href;
        linkCount++;
        if (text) actions.push(`Click '${text.substring(0, 50)}' link${href ? ' → ' + href : ''}`);
      } else if (tag === 'button' || el.getAttribute('role') === 'button') {
        buttonCount++;
        if (label) actions.push(`Click '${label.substring(0, 50)}' button`);
      } else if (tag === 'input' || tag === 'textarea' || (el as HTMLElement).contentEditable === 'true') {
        inputCount++;
        const inputType = (el as HTMLInputElement).type || tag;
        const desc = label || placeholder;
        if (desc) actions.push(`Type into ${inputType} (${desc.substring(0, 50)})`);
        else actions.push(`Type into ${inputType}`);
      } else if (tag === 'select') {
        inputCount++;
        actions.push(`Select from '${label || 'dropdown'}'`);
      }
    });
  }

  // Navigation links from nav elements
  const nav = document.querySelector('nav,[role="navigation"]');
  if (nav) {
    Array.from(nav.querySelectorAll('a[href]'))
      .slice(0, 30)
      .forEach((a) => {
        const text = (a.textContent?.trim() || '').substring(0, 40);
        const href = (a as HTMLAnchorElement).href;
        if (text) navigation.push(`${text} → ${href}`);
      });
  }

  // Forms
  document.querySelectorAll('form').forEach((form) => {
    const action = form.getAttribute('action') || '';
    const name = action || `form-${forms.length + 1}`;
    const fields: string[] = [];
    form.querySelectorAll('input:not([type="hidden"]),textarea,select').forEach((f) => {
      const fLabel =
        f.getAttribute('aria-label') ||
        f.getAttribute('placeholder') ||
        (f as HTMLInputElement).name ||
        f.tagName.toLowerCase();
      const fType = (f as HTMLInputElement).type || f.tagName.toLowerCase();
      fields.push(`${fLabel} (${fType})`);
    });
    forms.push({ name, fields });
  });

  // Cap actions to avoid huge payloads
  const cappedActions = actions.slice(0, 100);

  const summary = `${document.title || location.hostname} with ${inputCount} input${inputCount !== 1 ? 's' : ''}, ${buttonCount} button${buttonCount !== 1 ? 's' : ''}, and ${linkCount} link${linkCount !== 1 ? 's' : ''}`;

  return {
    success: true,
    data: {
      actions: cappedActions,
      forms,
      navigation,
      summary,
    },
  };
}

async function handleRecon(classify?: boolean): Promise<BridgeResponse> {
  // Reserved for future semantic labeling; currently unused.
  void classify;

  const recon: any = {
    url: location.href,
    title: document.title,
    meta: {
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
    },
    structure: {
      hasHeader: !!document.querySelector('header, [role="banner"]'),
      hasNav: !!document.querySelector('nav, [role="navigation"]'),
      hasMain: !!document.querySelector('main, [role="main"]'),
      hasSidebar: !!document.querySelector('aside'),
      hasFooter: !!document.querySelector('footer'),
      hasModal: !!document.querySelector('[role="dialog"], [class*="modal"]'),
    },
    actions: [] as any[],
    forms: [] as any[],
    navigation: [] as any[],
    landmarks: {
      h1: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent?.trim() || ''),
      h2: Array.from(document.querySelectorAll('h2')).slice(0, 10).map((h) => h.textContent?.trim() || ''),
    },
    stats: {
      links: document.querySelectorAll('a[href]').length,
      buttons: document.querySelectorAll('button,[role="button"]').length,
      inputs: document.querySelectorAll('input,textarea,select,[contenteditable="true"]').length,
      images: document.querySelectorAll('img').length,
      forms: document.querySelectorAll('form').length,
    },
  };

  // Scan interactive elements
  const selectors = [
    'button:not([disabled])',
    '[role="button"]',
    'a[href]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
  ];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const visible = rect.top < window.innerHeight && rect.bottom > 0;
      if (!visible) return;

      const rawLabel =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        (el.textContent?.trim() || '').substring(0, 50);
      // Fix 3: Sanitize aria-labels
      const label = sanitizeAriaLabel(rawLabel);
      if (!label) return;

      // Build stable selector
      let bestSel = '';
      if (el.id && !/^[a-z]{1,2}-[0-9a-f]{4,}/i.test(el.id)) bestSel = '#' + el.id;
      else if (el.getAttribute('data-testid')) bestSel = `[data-testid="${el.getAttribute('data-testid')}"]`;
      else if (el.getAttribute('aria-label')) bestSel = `${el.tagName.toLowerCase()}[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(el.getAttribute('aria-label') || ''))}"]`;
      else if (el.getAttribute('name')) bestSel = `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
      else if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        if (href && href !== '#' && !href.startsWith('javascript') && href.length < 150)
          bestSel = `a[href="${href.replace(/"/g, '\\"')}"]`;
        else bestSel = `text=${label.substring(0, 40)}`;
      }
      else bestSel = el.tagName.toLowerCase(); // fallback

      // Infer purpose
      const l = label.toLowerCase();
      let purpose = 'action';
      if (l.includes('search')) purpose = 'search';
      else if (l.includes('cart') || l.includes('add to') || l.includes('buy')) purpose = 'add-to-cart';
      else if (l.includes('sign in') || l.includes('log in') || l.includes('login')) purpose = 'login';
      else if (l.includes('submit') || l.includes('send')) purpose = 'submit';
      else if (l.includes('close') || l.includes('dismiss')) purpose = 'close';
      else if (l.includes('next') || l.includes('continue')) purpose = 'next';
      else if (l.includes('menu')) purpose = 'menu';
      else if (el.tagName === 'A') purpose = 'navigate';
      else if (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        (el as HTMLElement).contentEditable === 'true'
      )
        purpose = 'input';

      recon.actions.push({
        type: el.tagName.toLowerCase() === 'a' ? 'link' : el.tagName.toLowerCase(),
        selector: bestSel,
        label: label.substring(0, 60),
        purpose,
        enabled: !(el as any).disabled,
      });
    });
  }
  recon.actions = recon.actions.slice(0, 100);

  // Forms
  document.querySelectorAll('form').forEach((form) => {
    const fields = Array.from(form.querySelectorAll('input,textarea,select')).map((f) => ({
      name: (f as any).name || '',
      type: (f as any).type || f.tagName.toLowerCase(),
      label: f.getAttribute('aria-label') || f.getAttribute('placeholder') || '',
      required: (f as any).required || false,
    }));
    recon.forms.push({ action: form.getAttribute('action') || '', method: form.method || 'GET', fields });
  });

  // Nav links
  const nav = document.querySelector('nav,[role="navigation"]');
  if (nav) {
    recon.navigation = Array.from(nav.querySelectorAll('a[href]'))
      .slice(0, 20)
      .map((a) => ({
        text: (a.textContent?.trim() || '').substring(0, 40),
        href: (a as HTMLAnchorElement).href,
      }));
  }

  // Input surface discovery — find ALL editable elements including contentEditable
  recon.inputs = [] as any[];
  const inputSurfaces = document.querySelectorAll(
    'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"], [role="searchbox"]'
  );
  for (const el of Array.from(inputSurfaces)) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    let bestSel = '';
    if ((el as HTMLElement).id) bestSel = '#' + (el as HTMLElement).id;
    else if (el.getAttribute('aria-label')) bestSel = `${el.tagName.toLowerCase()}[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(el.getAttribute('aria-label') || ''))}"]`;
    else if ((el as HTMLInputElement).name) bestSel = `${el.tagName.toLowerCase()}[name="${(el as HTMLInputElement).name}"]`;
    else if (el.getAttribute('role')) bestSel = `[role="${el.getAttribute('role')}"]`;
    else bestSel = el.tagName.toLowerCase();

    recon.inputs.push({
      selector: bestSel,
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || undefined,
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      value: ((el as HTMLInputElement).value || el.textContent?.trim() || '').substring(0, 100),
      contentEditable: (el as HTMLElement).contentEditable === 'true' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '',
    });
  }

  // Canvas app detection
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const vpArea = window.innerWidth * window.innerHeight;
  const bigCanvas = vpArea > 0
    ? canvases.find((c) => {
        const r = c.getBoundingClientRect();
        return (r.width * r.height) / vpArea > 0.5;
      })
    : undefined;
  recon.canvasApp = !!bigCanvas;

  if (recon.canvasApp) {
    // Canvas element info
    const cvs = bigCanvas as HTMLCanvasElement;
    recon.canvas = {
      width: cvs.width,
      height: cvs.height,
      cssWidth: cvs.getBoundingClientRect().width,
      cssHeight: cvs.getBoundingClientRect().height,
      id: cvs.id || undefined,
      classes: cvs.className || undefined,
    };

    // Accessibility overlay scan
    recon.accessibilityOverlay = {
      grids: document.querySelectorAll('[role="grid"]').length,
      gridcells: document.querySelectorAll('[role="gridcell"]').length,
      rows: document.querySelectorAll('[role="row"]').length,
      columnHeaders: document.querySelectorAll('[role="columnheader"]').length,
      hasOverlay: document.querySelectorAll('[role="grid"], [role="gridcell"], [role="treegrid"]').length > 0,
    };

    // Grid dimensions
    const grid = document.querySelector('[role="grid"]');
    if (grid) {
      const gridRows = grid.querySelectorAll('[role="row"]');
      const firstRowCells = gridRows[0]?.querySelectorAll('[role="gridcell"], [role="columnheader"]');
      recon.gridDimensions = {
        rows: gridRows.length,
        cols: firstRowCells?.length ?? 0,
      };
    }

    // Cell value sampling — read up to 5 rows of gridcell content for automation feasibility
    const sampleCells: Array<{ ref: string; value: string }> = [];
    const gridcells = document.querySelectorAll('[role="gridcell"]');
    let sampled = 0;
    for (const cell of Array.from(gridcells)) {
      if (sampled >= 25) break; // 5 rows × 5 cols max
      const label = cell.getAttribute('aria-label') || '';
      const value = cell.textContent?.trim() || '';
      const refMatch = label.match(/\b([A-Z]+\d+)\b/);
      sampleCells.push({
        ref: refMatch ? refMatch[1] : `cell-${sampled}`,
        value: value.substring(0, 100),
      });
      sampled++;
    }
    if (sampleCells.length > 0) recon.cellSample = sampleCells;

    // ── Generic canvas input surface discovery ──
    // Find inputs and editables positioned above/near the canvas — app-agnostic.
    // Any canvas app (Sheets, Figma, Excalidraw, Maps…) may have navigation
    // inputs and editing bars above its main canvas.
    const cvsBounds = cvs.getBoundingClientRect();
    const isAboveCanvas = (el: Element, margin = 150): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 10 && r.height > 0 && r.bottom <= cvsBounds.top + margin;
    };
    const bestSelector = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const al = el.getAttribute('aria-label');
      if (al) return `${el.tagName.toLowerCase()}[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(al))}"]`;
      const name = (el as HTMLInputElement).name;
      if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
      const role = el.getAttribute('role');
      if (role) return `[role="${role}"]`;
      return el.tagName.toLowerCase();
    };

    // Navigator inputs: any visible text input / combobox above the canvas
    const navigatorInputs = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), [role="combobox"]'
    )).filter(el => isAboveCanvas(el)) as HTMLInputElement[];
    // Prefer inputs with cell reference pattern (A1, B2, AA100), then fallback to any short value
    const cellRefPattern = /^[A-Z]{1,3}[0-9]+$/;
    const refInput = navigatorInputs.find(el => {
      const val = (el.value || '').trim();
      return cellRefPattern.test(val);
    }) || navigatorInputs.find(el => {
      const val = (el.value || '').trim();
      return val.length > 0 && val.length < 50;
    }) || null;

    // Editable bars: any contenteditable / textbox above the canvas
    const editableBars = Array.from(document.querySelectorAll(
      '[contenteditable="true"], [contenteditable=""], [role="textbox"]'
    )).filter(el => isAboveCanvas(el)) as HTMLElement[];
    const editBar = editableBars[0] || null;

    // Selection state — generic active selection detection
    const selectedElements = document.querySelectorAll(
      '[aria-selected="true"], [aria-current="true"]'
    );
    recon.selection = {
      activeRef: refInput?.value?.trim() || undefined,
      refInputSelector: refInput ? bestSelector(refInput) : undefined,
      editBarValue: (editBar?.textContent?.trim() || '').substring(0, 200),
      editBarSelector: editBar ? bestSelector(editBar) : undefined,
      selectedElements: selectedElements.length > 0 ? Array.from(selectedElements).slice(0, 10).map((el) => {
        const label = el.getAttribute('aria-label') || '';
        const refMatch = label.match(/\b([A-Z]+\d+)\b/);
        return {
          ref: refMatch ? refMatch[1] : undefined,
          selector: bestSelector(el),
          label: label.substring(0, 60),
          value: (el.textContent?.trim() || '').substring(0, 100),
        };
      }) : [],
    };

    // Canvas app type — URL + title heuristic (kept for backward compat)
    const url = location.href.toLowerCase();
    const title = document.title.toLowerCase();
    let appType: string = 'unknown';
    if (url.includes('docs.google.com/spreadsheets') || title.includes('google sheets')) {
      appType = 'google-sheets';
    } else if (url.includes('docs.google.com/document')) {
      appType = 'google-docs';
    } else if (url.includes('docs.google.com/presentation')) {
      appType = 'google-slides';
    } else if (url.includes('figma.com')) {
      appType = 'figma';
    } else if (url.includes('excalidraw')) {
      appType = 'excalidraw';
    } else if (url.includes('google.com/maps') || url.includes('maps.google')) {
      appType = 'google-maps';
    } else if (url.includes('miro.com')) {
      appType = 'miro';
    } else if (url.includes('canva.com')) {
      appType = 'canva';
    } else if (document.querySelector('[data-app-name]')) {
      appType = document.querySelector('[data-app-name]')?.getAttribute('data-app-name') || 'unknown';
    }
    recon.canvasAppType = appType;

    // Zoom level detection
    const zoomEl = document.querySelector('input[aria-label*="zoom" i], input[aria-label*="Zoom" i], [aria-label*="zoom" i], [class*="zoom-level"], [class*="zoomLevel"], [data-zoom]');
    if (zoomEl) {
      const zoomText = (zoomEl as HTMLInputElement).value || zoomEl.textContent?.trim() || zoomEl.getAttribute('aria-valuenow') || zoomEl.getAttribute('data-zoom') || '';
      const zoomMatch = zoomText.match(/(\d+)\s*%?/);
      recon.zoomLevel = zoomMatch ? parseInt(zoomMatch[1], 10) : zoomText.substring(0, 20);
    }

    // Automation strategy — derived from what elements exist, not which app
    const hasGrid = recon.accessibilityOverlay.hasOverlay;
    const hasSufficientCells = recon.accessibilityOverlay.gridcells > 0;
    const hasToolbar = document.querySelectorAll('[role="toolbar"]').length > 0;
    const hasNavigatorInput = navigatorInputs.length > 0;
    const hasEditableBar = editableBars.length > 0;

    if (hasGrid && hasSufficientCells) {
      recon.automationStrategy = 'aria-overlay';
      recon.needsVision = false;
    } else if (hasNavigatorInput && hasEditableBar) {
      recon.automationStrategy = 'name-box-formula-bar';
      recon.needsVision = false;
    } else if (hasToolbar) {
      recon.automationStrategy = 'toolbar-only';
      recon.needsVision = true;
    } else {
      recon.automationStrategy = 'vision-required';
      recon.needsVision = true;
    }
  }

  // Key elements — structured discovery of critical interaction points
  const canvasBounds = bigCanvas ? bigCanvas.getBoundingClientRect() : null;
  const keSel = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const al = el.getAttribute('aria-label');
    if (al) return `${el.tagName.toLowerCase()}[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(al))}"]`;
    const name = (el as HTMLInputElement).name;
    if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
    const role = el.getAttribute('role');
    if (role) return `[role="${role}"]`;
    return el.tagName.toLowerCase();
  };
  const kePosition = (el: Element): string => {
    if (!canvasBounds) return 'page';
    const r = el.getBoundingClientRect();
    if (r.bottom <= canvasBounds.top + 10) return 'above-canvas';
    if (r.top >= canvasBounds.bottom - 10) return 'below-canvas';
    if (r.right <= canvasBounds.left + 10) return 'left-of-canvas';
    if (r.left >= canvasBounds.right - 10) return 'right-of-canvas';
    return 'over-canvas';
  };

  // Build structured keyElements object using values from recon.selection (which has refInput and editBar data)
  recon.keyElements = {} as any;
  
  // cellNavigator = from recon.selection.refInputSelector
  if (recon.selection?.refInputSelector && recon.selection?.activeRef) {
    recon.keyElements.cellNavigator = {
      selector: recon.selection.refInputSelector,
      value: recon.selection.activeRef,
    };
  }
  
  // formulaBar = from recon.selection.editBarSelector
  if (recon.selection?.editBarSelector && recon.selection?.editBarValue !== undefined) {
    recon.keyElements.formulaBar = {
      selector: recon.selection.editBarSelector,
      contentEditable: true,
    };
  }
  
  // grid = main canvas or grid surface
  const mainSurface = bigCanvas || document.querySelector('[role="grid"]');
  if (mainSurface) {
    recon.keyElements.grid = {
      selector: mainSurface.id ? `#${mainSurface.id}` : mainSurface.tagName.toLowerCase(),
      tag: mainSurface.tagName.toLowerCase(),
    };
  }
  
  // addRows = input for adding rows (if exists)
  const addRowsInput = document.querySelector('input[aria-label*="rows"]') as HTMLInputElement;
  if (addRowsInput) {
    recon.keyElements.addRows = {
      selector: keSel(addRowsInput),
      value: addRowsInput.value,
    };
  }

  // Also collect ALL input surfaces as a flat array for reference
  const allKeInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"], [role="searchbox"]'
  );
  recon.inputs = [];
  for (const el of Array.from(allKeInputs)) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.top > window.innerHeight || rect.bottom < 0) continue;
    recon.inputs.push({
      selector: keSel(el),
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || undefined,
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      value: ((el as HTMLInputElement).value || el.textContent?.trim() || '').substring(0, 100),
      contentEditable: (el as HTMLElement).isContentEditable || undefined,
      position: kePosition(el),
    });
  }

  // Toolbar state — report state of toggle-able buttons (bold, italic, etc.)
  const toolbarButtons = document.querySelectorAll('[role="toolbar"] [role="button"][aria-pressed], [role="toolbar"] [role="button"][aria-checked]');
  recon.toolbarState = Array.from(toolbarButtons).slice(0, 30).map((btn) => {
    const label = btn.getAttribute('aria-label') || btn.textContent?.trim() || '';
    return {
      label: label.substring(0, 40),
      pressed: btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('aria-checked') === 'true',
      selector: btn.id ? `#${btn.id}` : `[aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(btn.getAttribute('aria-label') || ''))}"]`,
    };
  });

  // ARIA landmarks
  recon.ariaLandmarks = {
    toolbars: Array.from(document.querySelectorAll('[role="toolbar"]')).map((el) => ({
      label: el.getAttribute('aria-label') || '',
      buttons: el.querySelectorAll('[role="button"], button').length,
    })),
    menubars: Array.from(document.querySelectorAll('[role="menubar"]')).map((el) => ({
      label: el.getAttribute('aria-label') || '',
      items: el.querySelectorAll('[role="menuitem"]').length,
    })),
    tablists: Array.from(document.querySelectorAll('[role="tablist"]')).map((el) => ({
      label: el.getAttribute('aria-label') || '',
      tabs: el.querySelectorAll('[role="tab"]').length,
    })),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  };

  // Menus
  recon.menus = Array.from(document.querySelectorAll('[role="menubar"] > [role="menuitem"], [role="menubar"] [role="menuitem"]'))
    .slice(0, 30)
    .map((el) => ({
      label: (el.getAttribute('aria-label') || el.textContent?.trim() || '').substring(0, 40),
      selector: el.id ? `#${el.id}` : `[role="menuitem"][aria-label="${escapeCSSAttrValue(sanitizeAriaLabel(el.getAttribute('aria-label') || ''))}"]`,
    }));

  // App fingerprint — URL patterns + DOM signatures (generic, always runs)
  const fpUrl = location.href.toLowerCase();
  let fpApp: string | null = null;
  let fpConfidence: 'high' | 'medium' | 'low' = 'low';
  // Tier 1: URL pattern detection (high confidence)
  const urlPatterns: Array<[RegExp, string]> = [
    [/docs\.google\.com\/spreadsheets/, 'google-sheets'],
    [/docs\.google\.com\/document/, 'google-docs'],
    [/docs\.google\.com\/presentation/, 'google-slides'],
    [/figma\.com/, 'figma'],
    [/excalidraw/, 'excalidraw'],
    [/google\.com\/maps|maps\.google/, 'google-maps'],
    [/miro\.com/, 'miro'],
    [/canva\.com/, 'canva'],
    [/lucid(?:chart|spark)\.com/, 'lucidchart'],
    [/draw\.io|diagrams\.net/, 'drawio'],
    [/notion\.so/, 'notion'],
    [/airtable\.com/, 'airtable'],
    [/codepen\.io/, 'codepen'],
    [/codesandbox\.io/, 'codesandbox'],
  ];
  for (const [pattern, app] of urlPatterns) {
    if (pattern.test(fpUrl)) { fpApp = app; fpConfidence = 'high'; break; }
  }
  // Tier 2: DOM signature detection (medium confidence)
  if (!fpApp) {
    const appNameAttr = document.querySelector('[data-app-name]')?.getAttribute('data-app-name');
    const generator = document.querySelector('meta[name="generator"]')?.getAttribute('content');
    const appName = document.querySelector('meta[name="application-name"]')?.getAttribute('content');
    if (appNameAttr) { fpApp = appNameAttr.toLowerCase(); fpConfidence = 'medium'; }
    else if (generator) { fpApp = generator.toLowerCase(); fpConfidence = 'medium'; }
    else if (appName) { fpApp = appName.toLowerCase(); fpConfidence = 'medium'; }
  }
  // Tier 3: Canvas heuristic classification (low confidence)
  if (!fpApp && recon.canvasApp) {
    const hasGridOverlay = recon.accessibilityOverlay?.hasOverlay;
    const hasToolbars = (recon.ariaLandmarks?.toolbars?.length || 0) > 0;
    if (hasGridOverlay) { fpApp = 'unknown-spreadsheet'; fpConfidence = 'low'; }
    else if (hasToolbars) { fpApp = 'unknown-drawing'; fpConfidence = 'low'; }
    else { fpApp = 'unknown-canvas'; fpConfidence = 'low'; }
  }
  recon.appFingerprint = fpApp ? { app: fpApp, confidence: fpConfidence } : null;

  // Selection state — generic detection from all available indicators
  let selRef: string | null = null;
  let selSource: string | null = null;
  let selSelector: string | null = null;
  // Source 1: Navigator input above canvas (cell ref, address bar, object name)
  if (recon.selection?.activeRef) {
    selRef = recon.selection.activeRef;
    selSource = 'ref-input';
    selSelector = recon.selection.refInputSelector || null;
  }
  // Source 2: ARIA selected/current elements
  if (!selRef) {
    const ariaSel = document.querySelector('[aria-selected="true"], [aria-current="true"]');
    if (ariaSel) {
      const label = ariaSel.getAttribute('aria-label') || '';
      const refMatch = label.match(/\b([A-Z]+\d+)\b/);
      selRef = refMatch ? refMatch[1] : (label || ariaSel.textContent?.trim() || '').substring(0, 40) || null;
      selSource = ariaSel.hasAttribute('aria-selected') ? 'aria-selected' : 'aria-current';
    }
  }
  // Source 3: Focused editable element
  if (!selRef && document.activeElement && document.activeElement !== document.body) {
    const active = document.activeElement;
    const val = ((active as HTMLInputElement).value || active.textContent?.trim() || '').substring(0, 40);
    if (val) {
      selRef = val;
      selSource = 'active-element';
    }
  }
  recon.selectionState = selRef ? { activeCell: selRef, source: selSource, selector: selSelector } : null;

  // Cell samples — read content from the best available source (generic)
  const cellSamples: Array<{ cell: string; value: string }> = [];
  if (selRef) {
    // Primary: edit bar / formula bar / property panel content
    const barValue = recon.selection?.editBarValue || '';
    cellSamples.push({ cell: selRef, value: barValue });
  }
  // Also include any ARIA gridcell samples if available
  if (recon.cellSample) {
    for (const s of recon.cellSample as Array<{ ref: string; value: string }>) {
      if (!cellSamples.find((x) => x.cell === s.ref)) {
        cellSamples.push({ cell: s.ref, value: s.value });
      }
    }
  }
  recon.cellSamples = cellSamples.length > 0 ? cellSamples : null;

  return { success: true, data: recon };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send trusted keyboard events via CDP through the background script.
 * Returns true on success. Falls back to synthetic events if CDP unavailable.
 */
async function cdpKeys(steps: Array<{ action: string; text?: string; key?: string; modifiers?: number; x?: number; y?: number }>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'cdp_keys', steps }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[cdpKeys] runtime error:', chrome.runtime.lastError.message);
          resolve(false);
        } else if (!response?.success) {
          console.warn('[cdpKeys] failed:', response?.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (e) {
      console.warn('[cdpKeys] exception:', e);
      resolve(false);
    }
  });
}

/**
 * Navigate to a cell using the name-box (#t-name-box) — works for canvas-based
 * spreadsheets that don't expose ARIA gridcell elements.
 * Uses CDP trusted keyboard events to type the ref and press Enter.
 * Sends Escape first to exit any active edit mode.
 */
async function navigateToCell(ref: string): Promise<boolean> {
  const nameBox = document.querySelector('#t-name-box') as HTMLInputElement | null;
  if (!nameBox) return false;

  // Get viewport coordinates for CDP mouse events
  const nbRect = nameBox.getBoundingClientRect();
  const nbX = Math.round(nbRect.left + nbRect.width / 2);
  const nbY = Math.round(nbRect.top + nbRect.height / 2);

  // Step 1: Click on the canvas to ensure grid has focus (exits any name-box/edit state)
  const canvas = document.querySelector('canvas') as HTMLElement | null;
  if (canvas) {
    const cvRect = canvas.getBoundingClientRect();
    await cdpKeys([
      { action: 'mouseClick', x: Math.round(cvRect.left + 50), y: Math.round(cvRect.top + 50) },
    ]);
    await sleep(150);
  }

  // Step 2: Click name-box, select all, type cell ref, press Enter
  const ok = await cdpKeys([
    { action: 'mouseClick', x: nbX, y: nbY },
    { action: 'pause' },
    { action: 'keyDown', key: 'a', modifiers: 2 /* ctrl */ },
    { action: 'keyUp', key: 'a', modifiers: 2 },
    { action: 'insertText', text: ref.toUpperCase() },
    { action: 'pause' },
    { action: 'keyDown', key: 'Enter' },
    { action: 'keyUp', key: 'Enter' },
  ]);

  if (ok) {
    // Wait for Sheets to navigate and update the formula bar
    await sleep(300);
    return true;
  }

  // Fallback: synthetic events (won't work for Sheets but keeps non-canvas apps working)
  setNativeValue(nameBox, ref.toUpperCase());
  nameBox.dispatchEvent(new Event('input', { bubbles: true }));
  nameBox.dispatchEvent(new Event('change', { bubbles: true }));
  const enterOpts: KeyboardEventInit = {
    key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
  };
  nameBox.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
  nameBox.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
  await sleep(150);
  return true;
}

/**
 * Read the current cell value from the formula bar (#t-formula-bar-input).
 * Uses CDP eval for a fresh read to avoid stale DOM references.
 */
async function readFormulaBar(): Promise<string> {
  // Try reading via CDP eval for a fresh value (avoids stale content script DOM)
  return new Promise((resolve) => {
    try {
      // Read from the formula bar input element
      const bar = document.querySelector('#t-formula-bar-input') as HTMLElement | null;
      if (bar) {
        if (bar instanceof HTMLInputElement || bar instanceof HTMLTextAreaElement) {
          resolve(bar.value);
        } else {
          resolve(bar.textContent?.trim() ?? '');
        }
      } else {
        resolve('');
      }
    } catch {
      resolve('');
    }
  });
}

/**
 * Read a single cell's value using the name-box + formula-bar pattern.
 * Navigates to the cell, waits for the formula bar to update, then reads.
 */
async function readCellViaFormulaBar(ref: string): Promise<string> {
  const ok = await navigateToCell(ref);
  if (!ok) return '';
  // Extra wait to ensure formula bar has updated
  await sleep(150);
  return readFormulaBar();
}

function normalizeText(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function findClickableByText(queryText: string): Element | null {
  const q = normalizeText(queryText);
  if (!q) return null;

  const candidates = Array.from(
    document.querySelectorAll(
      'button, a, [role="button"], input[type="button"], input[type="submit"], [aria-label], [title]',
    ),
  );

  let best: { el: Element; score: number } | null = null;
  const limit = 1500;

  for (let i = 0; i < candidates.length && i < limit; i++) {
    const el = candidates[i];
    if (!isVisible(el)) continue;

    let text = '';
    if (el instanceof HTMLInputElement) {
      text = el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    } else {
      text = (el as HTMLElement).innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    }

    const t = normalizeText(text);
    if (!t) continue;

    let score = 0;
    if (t === q) score = 3;
    else if (t.includes(q)) score = 2;
    else continue;

    // Slightly prefer native clickables.
    const tag = (el as HTMLElement).tagName?.toLowerCase();
    if (tag === 'button' || tag === 'a') score += 0.25;

    if (!best || score > best.score) best = { el, score };
    if (best && best.score >= 3.2) break; // good enough
  }

  return best?.el ?? null;
}

function resolveClickTarget(selector: string): Element | null {
  const raw = String(selector ?? '').trim();
  if (!raw) return null;

  // Explicit text selector: text=Add to Cart
  if (raw.startsWith('text=')) {
    return findClickableByText(raw.slice('text='.length));
  }

  // 1) Try as CSS selector
  try {
    const byCss = document.querySelector(raw);
    if (byCss) return byCss;
  } catch {
    // ignore selector syntax errors and fall through to text match
  }

  // 2) Fallback: treat selector as text
  return findClickableByText(raw);
}

function resolveEditableElement(root: Element): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) return root;
  if (root instanceof HTMLElement && root.isContentEditable) return root;

  // Common editor wrappers (CodeMirror/ProseMirror/etc): selector may target container.
  const child = root.querySelector('input, textarea, [contenteditable="true"], [contenteditable=""]');
  if (child instanceof HTMLInputElement || child instanceof HTMLTextAreaElement) return child;
  if (child instanceof HTMLElement) return child;
  return null;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = desc?.set;
  if (setter) setter.call(el, value);
  else (el as any).value = value;
}

async function typeInto(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    // Replace full value (consistent with prior behavior).
    setNativeValue(el, text);

    // Dispatch a real-ish InputEvent so React-controlled inputs update.
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: 'insertReplacementText',
        }),
      );
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // ContentEditable path — works for Google Sheets formula bar, ProseMirror, etc.
  // Canvas apps like Sheets check isTrusted on keyboard events, so we bypass
  // keyboard simulation entirely and manipulate the DOM directly.
  el.focus();

  // Select all existing content first
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  // Strategy 1: execCommand insertText (creates an undoable action, works in most editors)
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch {
    inserted = false;
  }

  // Strategy 2: Direct DOM manipulation (for apps that block execCommand)
  if (!inserted) {
    // Clear existing content
    while (el.firstChild) el.removeChild(el.firstChild);
    // Insert text node
    el.appendChild(document.createTextNode(text));
    // Move cursor to end
    const endRange = document.createRange();
    endRange.selectNodeContents(el);
    endRange.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(endRange);
  }

  // Dispatch input events that apps listen for
  try {
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertReplacementText',
    }));
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Also dispatch beforeinput for apps that use it (Google Sheets)
  try {
    el.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertReplacementText',
    }));
  } catch { /* ignore */ }
}

function readText(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return (el.value ?? '').toString();
  return el.textContent?.trim() ?? '';
}

function toJsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const walk = (v: any, depth: number): any => {
    if (depth <= 0) return '[MaxDepth]';
    if (v === null) return null;

    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (t === 'bigint') return v.toString();
    if (t === 'undefined') return null;
    if (t === 'function') return '[Function]';
    if (t === 'symbol') return v.toString();

    if (v instanceof Date) return v.toISOString();
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
    if (v instanceof HTMLElement) {
      return {
        __type: 'HTMLElement',
        tagName: v.tagName,
        id: v.id,
        className: v.className,
      };
    }
    if (v instanceof Map) return { __type: 'Map', entries: Array.from(v.entries()).map(([k, val]) => [walk(k, depth - 1), walk(val, depth - 1)]) };
    if (v instanceof Set) return { __type: 'Set', values: Array.from(v.values()).map((x) => walk(x, depth - 1)) };

    if (Array.isArray(v)) return v.map((x) => walk(x, depth - 1));

    if (t === 'object') {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = walk(val, depth - 1);
      }
      return out;
    }

    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  };

  return walk(value, 6);
}

async function handleNavigate(url: string): Promise<BridgeResponse> {
  window.location.href = url;
  return { success: true };
}

// ---------------------------------------------------------------------------
// Press handler — dispatches keydown → keypress (printable) → keyup
// ---------------------------------------------------------------------------

/** Map friendly key names to KeyboardEvent.code values. */
function keyToCode(key: string): string {
  // Single lowercase letter
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  // Single digit
  if (/^[0-9]$/.test(key)) return `Digit${key}`;

  const map: Record<string, string> = {
    Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Space: 'Space',
    Backspace: 'Backspace', Delete: 'Delete',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert',
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
    // Punctuation / symbols
    '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight',
    '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma',
    '.': 'Period', '/': 'Slash', '`': 'Backquote',
    ' ': 'Space',
  };
  return map[key] ?? key;
}

/** Returns true for keys that should emit a keypress event. */
function isPrintableKey(key: string): boolean {
  // Non-printable keys that must NOT fire keypress
  const nonPrintable = new Set([
    'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Insert',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
    'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Control', 'Shift', 'Alt', 'Meta',
    'CapsLock', 'NumLock', 'ScrollLock',
  ]);
  return !nonPrintable.has(key);
}

async function handlePress(
  key: string,
  modifiers?: string[],
  selector?: string,
  stealth?: boolean,
): Promise<BridgeResponse> {
  // Resolve target element
  let target: Element | null = null;
  if (selector && typeof selector === 'string') {
    target = findElement(selector);
    if (!target) return { success: false, error: `Element not found: ${selector}` };
  } else {
    target = document.activeElement;
  }
  if (!target) return { success: false, error: 'No active element to send key events to' };

  const mods = new Set((modifiers ?? []).map((m) => m.toLowerCase()));
  const ctrlKey = mods.has('ctrl') || mods.has('control');
  const shiftKey = mods.has('shift');
  const altKey = mods.has('alt');
  const metaKey = mods.has('meta') || mods.has('cmd') || mods.has('command');

  const code = keyToCode(key);
  const eventInit: KeyboardEventInit = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ctrlKey,
    shiftKey,
    altKey,
    metaKey,
  };

  const jitterDelay = () => stealth ? sleep(20 + Math.random() * 60) : Promise.resolve();

  // Focus the element if it's focusable
  if (target instanceof HTMLElement) target.focus();

  // keydown
  target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
  await jitterDelay();

  // keypress (only for printable characters, and not when Ctrl/Meta are held)
  if (isPrintableKey(key) && !ctrlKey && !metaKey) {
    target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    await jitterDelay();
  }

  // keyup
  target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

  return { success: true };
}

// ---------------------------------------------------------------------------
// DblClick handler
// ---------------------------------------------------------------------------
async function handleDblClick(selector: string, stealth?: boolean): Promise<BridgeResponse> {
  if (!selector || typeof selector !== 'string') return { success: false, error: 'Invalid selector: must be a string' };
  const element = findElement(selector);

  // Name-box fallback for cell= selectors: navigate then press F2 to enter edit mode
  if (!element && selector.startsWith('cell=')) {
    const ref = selector.slice(5);
    const ok = await navigateToCell(ref);
    if (!ok) return { success: false, error: `Cell not found and name-box fallback failed: ${selector}` };
    // Press F2 to enter cell edit mode (equivalent to double-clicking)
    const active = document.activeElement;
    if (active) {
      const f2Opts: KeyboardEventInit = {
        key: 'F2', code: 'F2', bubbles: true, cancelable: true,
      };
      active.dispatchEvent(new KeyboardEvent('keydown', f2Opts));
      active.dispatchEvent(new KeyboardEvent('keyup', f2Opts));
    }
    return { success: true, data: { navigatedTo: ref.toUpperCase(), editMode: true } };
  }

  if (!element) return { success: false, error: `Element not found: ${selector}` };

  try {
    (element as HTMLElement | undefined)?.scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch { /* ignore */ }

  if (stealth) {
    // Human-like double click: two clicks with short delay
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 4;
    const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4;
    const baseOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };

    element.dispatchEvent(new MouseEvent('mousedown', { ...baseOpts, detail: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...baseOpts, detail: 1 }));
    element.dispatchEvent(new MouseEvent('click', { ...baseOpts, detail: 1 }));
    await sleep(60 + Math.random() * 80);
    element.dispatchEvent(new MouseEvent('mousedown', { ...baseOpts, detail: 2 }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...baseOpts, detail: 2 }));
    element.dispatchEvent(new MouseEvent('click', { ...baseOpts, detail: 2 }));
    element.dispatchEvent(new MouseEvent('dblclick', { ...baseOpts, detail: 2 }));
  } else {
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 });
    element.dispatchEvent(event);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Select handler — text selection or range-based selection
// ---------------------------------------------------------------------------
async function handleSelect(command: {
  from?: string; to?: string; selector?: string;
  startOffset?: number; endOffset?: number; stealth?: boolean;
}): Promise<BridgeResponse> {
  const { from, to, selector, startOffset, endOffset, stealth } = command;

  // Range selection: from element to element
  if (from && to) {
    const startEl = findElement(from);
    const endEl = findElement(to);
    if (!startEl) return { success: false, error: `Start element not found: ${from}` };
    if (!endEl) return { success: false, error: `End element not found: ${to}` };

    const range = document.createRange();
    const startNode = startEl.firstChild || startEl;
    range.setStart(startNode, startOffset ?? 0);
    const endNode = endEl.firstChild || endEl;
    // For text nodes, max offset is text length; for elements, max offset is childNodes.length
    const defaultEndOffset = endNode.nodeType === Node.TEXT_NODE
      ? (endNode.textContent?.length ?? 0)
      : endNode.childNodes.length;
    range.setEnd(endNode, endOffset ?? defaultEndOffset);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return { success: true };
  }

  // Single element full-select
  if (selector) {
    const el = findElement(selector);
    if (!el) return { success: false, error: `Element not found: ${selector}` };

    // If it's an input/textarea, use select()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      el.select();
      if (stealth) await sleep(30 + Math.random() * 50);
      return { success: true };
    }

    // Otherwise select all text content
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return { success: true };
  }

  // Select all
  document.execCommand('selectAll');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Scroll handler — directional or to-edge scrolling
// ---------------------------------------------------------------------------
async function handleScroll(command: {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number; selector?: string;
  to?: 'top' | 'bottom'; stealth?: boolean;
}): Promise<BridgeResponse> {
  const { direction = 'down', amount = 300, selector, to: scrollTo, stealth } = command;
  const target = selector ? findElement(selector) : document.scrollingElement || document.documentElement;
  if (!target) return { success: false, error: `Scroll target not found: ${selector}` };

  const el = target as HTMLElement;

  // Scroll to edge
  if (scrollTo) {
    const top = scrollTo === 'top' ? 0 : el.scrollHeight;
    if (stealth) {
      // Smooth scroll in increments for stealth
      const currentTop = el.scrollTop;
      const diff = top - currentTop;
      const steps = Math.min(Math.abs(Math.ceil(diff / 200)), 20);
      for (let i = 1; i <= steps; i++) {
        el.scrollTop = currentTop + (diff / steps) * i;
        await sleep(30 + Math.random() * 40);
      }
    } else {
      el.scrollTo({ top, behavior: 'smooth' });
    }
    return { success: true };
  }

  // Directional scroll
  const scrollOpts: Record<string, [number, number]> = {
    down: [0, amount],
    up: [0, -amount],
    right: [amount, 0],
    left: [-amount, 0],
  };
  const [dx, dy] = scrollOpts[direction] || [0, amount];

  if (stealth) {
    // Scroll in small increments
    const steps = Math.max(3, Math.ceil(Math.abs(dy || dx) / 80));
    for (let i = 0; i < steps; i++) {
      el.scrollBy(dx / steps, dy / steps);
      await sleep(20 + Math.random() * 30);
    }
  } else {
    el.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
  }

  return { success: true };
}

// ============================================================================
// Part B: Workflow Recorder
// ============================================================================

let recordingEnabled = false;
const recordedActions: RecordedAction[] = [];
let typeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTypeSelector = '';

async function getRecordedActions(): Promise<RecordedAction[]> {
  const result = await chrome.storage.local.get('recordedActions');
  return result.recordedActions || [];
}

async function saveRecordedActions(actions: RecordedAction[]) {
  await chrome.storage.local.set({ recordedActions: actions });
}

async function clearRecordedActions() {
  await chrome.storage.local.set({ recordedActions: [] });
}

function startRecording() {
  recordedActions.length = 0;
  recordingEnabled = true;
  console.log('[Recorder] Recording started');
}

function stopRecording() {
  recordingEnabled = false;
  console.log('[Recorder] Recording stopped —', recordedActions.length, 'steps');
}

function exportRecording(name: string): WorkflowExport {
  const steps: WorkflowStep[] = recordedActions.map((a) => {
    const step: WorkflowStep = { op: a.type };
    if (a.selector) step.selector = a.selector;
    if (a.text) step.text = a.text;
    if (a.url) step.url = a.url;
    if (a.key) step.key = a.key;
    if (a.value) step.value = a.value;
    return step;
  });

  return {
    name,
    steps,
    inputs: {},
    outputs: {},
  };
}

function smartSelector(element: Element): string {
  // Priority: aria-label > id > data-testid > name > stable CSS > generic fallback

  // 1. aria-label (most readable and stable)
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const tag = element.tagName.toLowerCase();
    const sel = `${tag}[aria-label="${ariaLabel}"]`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // 2. ID
  if (element.id) {
    // Skip hash-like IDs
    if (!/^[a-z]{1,3}-[a-zA-Z0-9]{6,}$/.test(element.id) && !/^:/.test(element.id)) {
      return `#${element.id}`;
    }
  }

  // 3. data-testid
  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  // 4. name attribute (for inputs)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    if (element.name) {
      const tag = element.tagName.toLowerCase();
      return `${tag}[name="${element.name}"]`;
    }
  }

  // 5. role + accessible text
  const role = element.getAttribute('role');
  if (role) {
    const text = element.textContent?.trim().slice(0, 40);
    if (text) {
      const sel = `[role="${role}"]`;
      const matches = document.querySelectorAll(sel);
      if (matches.length === 1) return sel;
    }
  }

  // 6. Unique class combo (skip hash-like classes)
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter((c) => {
      if (!c.trim()) return false;
      if (/^css-/i.test(c)) return false;
      if (/^sc-/i.test(c)) return false;
      if (/^[a-z]{1,3}-[a-zA-Z0-9]{4,}$/.test(c)) return false;
      if (/^[a-z]{3,5}-[0-9a-f]{5,}$/i.test(c)) return false;
      return true;
    });
    if (classes.length > 0) {
      const selector = `.${classes.join('.')}`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // 7. Fallback: tag with nth-of-type
  const tag = element.tagName.toLowerCase();
  const siblings = Array.from(element.parentElement?.children || []);
  const sameTagSiblings = siblings.filter((s) => s.tagName === element.tagName);
  const index = sameTagSiblings.indexOf(element) + 1;
  return `${tag}:nth-of-type(${index})`;
}

// Record click events
document.addEventListener('click', (event) => {
  if (!recordingEnabled) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const selector = smartSelector(target);
  const action: RecordedAction = {
    type: 'click',
    selector,
    timestamp: Date.now(),
  };

  recordedActions.push(action);
  saveRecordedActions(recordedActions);
  console.log('[Recorder] Click:', selector);
}, true);

// Record input events (debounced — only save final value per field)
document.addEventListener('input', (event) => {
  if (!recordingEnabled) return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

  const selector = smartSelector(target);

  // Debounce: if still typing in the same field, update last entry
  if (lastTypeSelector === selector && recordedActions.length > 0) {
    const last = recordedActions[recordedActions.length - 1];
    if (last.type === 'type' && last.selector === selector) {
      last.text = target.value;
      last.timestamp = Date.now();
      if (typeDebounceTimer) clearTimeout(typeDebounceTimer);
      typeDebounceTimer = setTimeout(() => {
        saveRecordedActions(recordedActions);
      }, 500);
      return;
    }
  }

  lastTypeSelector = selector;
  const action: RecordedAction = {
    type: 'type',
    selector,
    text: target.value,
    timestamp: Date.now(),
  };

  recordedActions.push(action);
  if (typeDebounceTimer) clearTimeout(typeDebounceTimer);
  typeDebounceTimer = setTimeout(() => {
    saveRecordedActions(recordedActions);
  }, 500);
  console.log('[Recorder] Type:', selector);
}, true);

// Record select/change events
document.addEventListener('change', (event) => {
  if (!recordingEnabled) return;

  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;

  const selector = smartSelector(target);
  const action: RecordedAction = {
    type: 'select',
    selector,
    value: target.value,
    timestamp: Date.now(),
  };

  recordedActions.push(action);
  saveRecordedActions(recordedActions);
  console.log('[Recorder] Select:', selector, target.value);
}, true);

// Record key presses (Enter, Escape, Tab — important for form submission)
document.addEventListener('keydown', (event) => {
  if (!recordingEnabled) return;

  const key = event.key;
  if (!['Enter', 'Escape', 'Tab'].includes(key)) return;

  const target = event.target;
  const selector = target instanceof Element ? smartSelector(target) : undefined;

  const action: RecordedAction = {
    type: 'press',
    key,
    selector,
    timestamp: Date.now(),
  };

  recordedActions.push(action);
  saveRecordedActions(recordedActions);
  console.log('[Recorder] Press:', key, selector);
}, true);

// Don't enable recording by default — wait for explicit start
console.log('[Content] Bridge executor and recorder loaded — v3-workflow-recorder');
(window as any).__PINGOS_CONTENT_VERSION = 'v3-workflow-recorder';
