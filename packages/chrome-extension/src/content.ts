// Content script - Bridge executor + interaction recorder

import type { BridgeCommand, BridgeResponse, RecordedAction, WorkflowStep, WorkflowExport } from './types';
import { humanClick, humanType, withJitter } from './stealth';
import { fullCleanup, injectAdBlockCSS, removeAdElements, detectClutter } from './adblock';
import { extractStructuredData } from './structured-data';
import { autoParseValue, parseExtractResult, validateExtractResult } from './type-parser';
import type { ParsedType } from './type-parser';
import {
  handleFill, handleWait, handleTable, handleDialog, handlePaginate, handleSelectOption,
  handleSmartNavigate, handleHover, handleAssert, handleNetwork, handleStorage,
  handleCapture, handleUpload, handleDownload, handleAnnotate,
} from './ops';

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
      case 'click': {
        // Support text-based targeting: {"text": "Submit"} → selector "text=Submit"
        const clickSelector = command.selector || (command.text ? `text=${command.text}` : '');
        response = await handleClick(clickSelector, command.stealth, command.x, command.y);
        break;
      }
      case 'type':
        response = await handleType(command.selector, command.text, command.stealth);
        break;
      case 'read':
        response = await handleRead(command.selector, command.limit);
        break;
      case 'extract':
        response = await handleExtract(command);
        break;
      case 'act': {
        // CANONICAL field name is `instruction`; accept `action` as a fallback alias.
        const instruction = command.instruction || command.action;
        if (!instruction) response = { success: false, error: 'No instruction/action provided' };
        else response = await handleAct(instruction);
        break;
      }
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
        response = await handleNavigate(command.url || command.to);
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
      case 'record_api_action': {
        // Record an API-driven action into the recorder if recording is active
        if (recordingEnabled && command.action) {
          const action: RecordedAction = {
            type: command.action.type || 'unknown',
            selector: command.action.selector || '',
            value: command.action.text || command.action.key || command.action.url || '',
            timestamp: command.action.timestamp || Date.now(),
            url: location.href,
          };
          recordedActions.push(action);
          saveRecordedActions(recordedActions);
        }
        response = { success: true, data: { recorded: recordingEnabled } };
        break;
      }
      case 'discover': {
        // Collect DOM snapshot for gateway-side discover engine
        response = { success: true, data: collectDomSnapshot() };
        break;
      }
      case 'screenshot':
        response = { success: false, error: 'Screenshot not implemented in content script' };
        break;
      case 'watch': {
        const watchSchema = (command as any).schema as Record<string, string> | undefined;
        if (!watchSchema || typeof watchSchema !== 'object') {
          response = { success: false, error: 'Missing schema for watch' };
        } else {
          const watchData: Record<string, string> = {};
          for (const [key, sel] of Object.entries(watchSchema)) {
            const el = document.querySelector(sel);
            watchData[key] = el ? (el.textContent?.trim() ?? '') : '';
          }
          response = { success: true, data: watchData };
        }
        break;
      }
      // Phase 1 core ops
      case 'fill':
        response = await handleFill(command as any);
        break;
      case 'wait':
        response = await handleWait(command as any);
        break;
      case 'table':
        response = await handleTable(command as any);
        break;
      case 'dialog':
        response = await handleDialog(command as any);
        break;
      case 'paginate':
        response = await handlePaginate(command as any);
        break;
      case 'selectOption':
        response = await handleSelectOption(command as any);
        break;
      // Phase 2 core ops
      case 'smartNavigate':
        response = await handleSmartNavigate(command as any);
        break;
      case 'hover':
        response = await handleHover(command as any);
        break;
      case 'assert':
        response = await handleAssert(command as any);
        break;
      case 'network':
        response = await handleNetwork(command as any);
        break;
      case 'storage':
        response = await handleStorage(command as any);
        break;
      case 'capture':
        response = await handleCapture(command as any);
        break;
      case 'upload':
        response = await handleUpload(command as any);
        break;
      case 'download':
        response = await handleDownload(command as any);
        break;
      case 'annotate':
        response = await handleAnnotate(command as any);
        break;
      default:
        response = { success: false, error: 'Unknown command type' };
        break;
    }

    if (command.stealth) await withJitter(async () => {});

    // Auto-record successful API-driven actions when recording is active
    if (recordingEnabled && response.success) {
      const recordableOps = ['click', 'type', 'press', 'navigate', 'scroll', 'select', 'dblclick', 'act'];
      if (recordableOps.includes(command.type)) {
        const action: RecordedAction = {
          type: command.type,
          selector: (command as any).selector || '',
          value: (command as any).text || (command as any).key || (command as any).url || (command as any).instruction || '',
          timestamp: Date.now(),
          url: location.href,
        };
        recordedActions.push(action);
        saveRecordedActions(recordedActions);
      }
    }

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

async function handleRead(selector: string, limit?: number): Promise<BridgeResponse> {
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

  // Enforce limit parameter
  if (limit && limit > 0 && nodes.length > limit) {
    nodes = nodes.slice(0, limit);
  }

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
// Level 8: Shadow DOM Piercing — traverse shadow roots with >>> combinator
// ---------------------------------------------------------------------------

// Cache for discovered shadow roots to avoid repeated traversal
const shadowRootCache = new WeakMap<Element, ShadowRoot>();

/**
 * Get shadow root for an element, checking cache first.
 * Handles both open and (where possible) closed shadow roots.
 */
function getShadowRoot(el: Element): ShadowRoot | null {
  if (shadowRootCache.has(el)) return shadowRootCache.get(el)!;
  // Check open shadow root
  if (el.shadowRoot) {
    shadowRootCache.set(el, el.shadowRoot);
    return el.shadowRoot;
  }
  // Try chrome.dom API for closed shadow roots (available in extensions)
  try {
    const shadow = (chrome as any)?.dom?.openOrClosedShadowRoot?.(el);
    if (shadow) {
      shadowRootCache.set(el, shadow);
      return shadow;
    }
  } catch { /* not available */ }
  // Don't cache null — shadow root may be attached later
  return null;
}

/**
 * Parse a selector for >>> piercing combinator or ::shadow syntax.
 * "host-element >>> inner-selector" → ["host-element", "inner-selector"]
 * "host-element::shadow inner-selector" → ["host-element", "inner-selector"]
 */
function parsePiercingSelector(selector: string): string[] | null {
  // >>> combinator
  if (selector.includes('>>>')) {
    return selector.split('>>>').map(s => s.trim()).filter(s => s.length > 0);
  }
  // ::shadow syntax
  if (selector.includes('::shadow')) {
    return selector.split('::shadow').map(s => s.trim()).filter(s => s.length > 0);
  }
  return null;
}

/**
 * Execute a piercing selector: "host >>> child" finds host, enters its shadow DOM,
 * then queries for child within it.
 */
function piercingQuerySelectorAll(root: Document | Element | ShadowRoot, parts: string[]): Element[] {
  if (parts.length === 0) return [];
  if (parts.length === 1) {
    try { return Array.from(root.querySelectorAll(parts[0])); }
    catch { return []; }
  }

  // Find host elements matching the first part
  let hosts: Element[];
  try { hosts = Array.from(root.querySelectorAll(parts[0])); }
  catch { return []; }

  // If no direct matches, try deep search for the host
  if (hosts.length === 0) {
    hosts = deepQuerySelectorAllBasic(root, parts[0]);
  }

  const results: Element[] = [];
  const remainingParts = parts.slice(1);

  for (const host of hosts) {
    const shadow = getShadowRoot(host);
    if (shadow) {
      if (remainingParts.length === 1) {
        try {
          results.push(...Array.from(shadow.querySelectorAll(remainingParts[0])));
        } catch { /* invalid selector */ }
      } else {
        // Recursive piercing for multi-level: a >>> b >>> c
        results.push(...piercingQuerySelectorAll(shadow, remainingParts));
      }
    }
  }

  return results;
}

/** Basic deep query without piercing support (used internally). */
function deepQuerySelectorAllBasic(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = [];
  try {
    results.push(...Array.from(root.querySelectorAll(selector)));
  } catch { /* invalid selector */ }

  const traverse = (node: Document | Element | ShadowRoot) => {
    const children = Array.from(node.querySelectorAll('*'));
    for (const child of children) {
      const shadow = getShadowRoot(child);
      if (shadow) {
        try {
          results.push(...Array.from(shadow.querySelectorAll(selector)));
        } catch { /* invalid selector */ }
        traverse(shadow);
      }
    }
  };
  traverse(root);
  return results;
}

function deepQuerySelectorAll(root: Document | Element | ShadowRoot, selector: string): Element[] {
  // Level 8: Check for >>> piercing combinator or ::shadow syntax
  const parts = parsePiercingSelector(selector);
  if (parts) {
    return piercingQuerySelectorAll(root, parts);
  }

  // Standard deep query — traverse all shadow roots
  return deepQuerySelectorAllBasic(root, selector);
}

function deepQuerySelector(root: Document | Element | ShadowRoot, selector: string): Element | null {
  // Level 8: Check for >>> piercing combinator
  const parts = parsePiercingSelector(selector);
  if (parts) {
    const results = piercingQuerySelectorAll(root, parts);
    return results[0] || null;
  }

  // Standard path
  try {
    const result = root.querySelector(selector);
    if (result) return result;
  } catch { /* invalid selector */ }

  // Traverse shadow roots
  const traverse = (node: Document | Element | ShadowRoot): Element | null => {
    const children = Array.from(node.querySelectorAll('*'));
    for (const child of children) {
      const shadow = getShadowRoot(child);
      if (shadow) {
        try {
          const found = shadow.querySelector(selector);
          if (found) return found;
        } catch { /* invalid selector */ }
        const deeper = traverse(shadow);
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

/**
 * Detect canvas-based apps (Google Sheets, Figma, etc.) where DOM text extraction fails.
 */
function isCanvasApp(): boolean {
  // Google Sheets detection: name-box + formula-bar presence is definitive
  if (document.querySelector('#t-name-box') || document.querySelector('[aria-label="Name Box"]')) {
    return true;
  }
  // Formula bar is another strong Sheets/canvas-app indicator
  if (document.querySelector('#t-formula-bar-input') || document.querySelector('[aria-label="Formula input"]')) {
    return true;
  }
  // URL-based detection for known canvas apps
  if (location.hostname.includes('docs.google.com') && location.pathname.includes('/spreadsheets/')) {
    return true;
  }
  // Known canvas-based design/whiteboard tools
  const canvasAppHosts = ['figma.com', 'excalidraw.com', 'miro.com', 'lucid.app', 'draw.io', 'canva.com'];
  if (canvasAppHosts.some(h => location.hostname.includes(h))) {
    return true;
  }
  // Exclude known video/media sites — they use <canvas> for video rendering, NOT as a spreadsheet/design canvas
  const videoHosts = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv', 'netflix.com', 'hulu.com', 'disneyplus.com'];
  if (videoHosts.some(h => location.hostname.includes(h))) {
    return false;
  }
  // Generic canvas detection: only if a large canvas is present AND no standard DOM content exists
  // A page with normal text content, links, buttons is NOT a canvas app even if it has a large canvas
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const viewportArea = window.innerWidth * window.innerHeight;
  const canvasArea = rect.width * rect.height;
  if (canvasArea <= viewportArea * 0.3) return false;
  // Large canvas exists — but only classify as canvas app if the page lacks substantial DOM content
  // (real canvas apps like Sheets/Figma render everything on canvas, so DOM has minimal text)
  const textContent = document.body?.innerText?.trim() || '';
  const hasSubstantialText = textContent.length > 2000;
  const hasArticleContent = !!document.querySelector('article, [role="article"], [role="feed"], [role="grid"]');
  if (hasSubstantialText || hasArticleContent) return false;
  return true;
}

/**
 * Detect Google Calendar pages.
 */
function isCalendarApp(): boolean {
  return !!(
    document.querySelector('[data-eventid]') ||
    document.querySelector('[data-eventchip]') ||
    (location.hostname.includes('calendar.google') || document.title.toLowerCase().includes('google calendar'))
  );
}

/**
 * Extract data from canvas apps (Google Sheets) using formula bar, name box, and sheet tabs.
 */
function extractCanvasAppData(description: string): NLExtractResult {
  const items: string[] = [];

  // 1. Formula bar value — what's currently in the selected cell
  const formulaBar = document.querySelector('#t-formula-bar-input, [aria-label="Formula input"]') as HTMLElement | null;
  if (formulaBar) {
    const text = formulaBar.textContent?.trim() || (formulaBar as HTMLInputElement).value?.trim() || '';
    if (text) items.push(`Formula bar: ${text}`);
  }

  // 2. Name box — current cell reference
  const nameBox = document.querySelector('#t-name-box') as HTMLInputElement | null;
  if (nameBox) {
    const ref = nameBox.value?.trim() || '';
    if (ref) items.push(`Current cell: ${ref}`);
  }

  // 3. Sheet tab names
  const sheetTabs = document.querySelectorAll('.docs-sheet-tab .docs-sheet-tab-name, [role="tab"]');
  for (const tab of Array.from(sheetTabs)) {
    const text = tab.textContent?.trim();
    if (text) items.push(`Sheet: ${text}`);
  }

  // 4. ARIA gridcell values — some cells may expose values via accessibility
  const gridCells = document.querySelectorAll('[role="gridcell"]');
  for (const cell of Array.from(gridCells).slice(0, 50)) {
    const label = cell.getAttribute('aria-label') || '';
    const text = cell.textContent?.trim() || '';
    if (label || text) items.push(label || text);
  }

  // 5. Toolbar/header info (sheet title, menu items)
  const sheetTitle = document.querySelector('#doc-title, [class*="docs-title"]');
  if (sheetTitle) {
    const text = sheetTitle.textContent?.trim();
    if (text) items.push(`Document: ${text}`);
  }

  return { items, method: 'canvas-app-formula-bar' };
}

/**
 * Extract events from Google Calendar using data-eventid and aria-labels.
 */
function extractCalendarEvents(): NLExtractResult {
  const events: string[] = [];

  // 1. Elements with data-eventid attribute
  const eventEls = document.querySelectorAll('[data-eventid]');
  for (const el of Array.from(eventEls)) {
    const label = el.getAttribute('aria-label') || el.textContent?.trim() || '';
    if (label && !events.includes(label)) events.push(label);
  }

  // 2. Event chips with aria-labels
  const eventChips = document.querySelectorAll('[data-eventchip], [class*="event"], [class*="Event"]');
  for (const chip of Array.from(eventChips)) {
    const label = chip.getAttribute('aria-label') || chip.textContent?.trim() || '';
    if (label && label.length > 2 && !events.includes(label)) events.push(label);
  }

  // 3. All-day events section
  const allDayEls = document.querySelectorAll('[data-datekey], [class*="allday"], [class*="all-day"]');
  for (const el of Array.from(allDayEls)) {
    const label = el.getAttribute('aria-label') || el.textContent?.trim() || '';
    if (label && label.length > 2 && !events.includes(label)) events.push(label);
  }

  // 4. Heading with event count info
  const headings = document.querySelectorAll('h1, h2');
  for (const h of Array.from(headings)) {
    const text = h.textContent?.trim() || '';
    if (text && /event|appointment/i.test(text) && !events.includes(text)) events.push(text);
  }

  // 5. Grid cells with event content
  const gridCells = document.querySelectorAll('[role="gridcell"]');
  for (const cell of Array.from(gridCells)) {
    const label = cell.getAttribute('aria-label') || '';
    if (label && /event|appointment|meeting/i.test(label) && !events.includes(label)) events.push(label);
    // Check child elements
    const inner = cell.querySelectorAll('[data-eventid], span, div');
    for (const child of Array.from(inner)) {
      const childLabel = child.getAttribute('aria-label') || child.textContent?.trim() || '';
      if (childLabel && childLabel.length > 2 && !events.includes(childLabel)) events.push(childLabel);
    }
  }

  // Deduplicate: normalize text and remove shorter substrings that are part of longer entries
  const unique: string[] = [];
  const normalized = events.map(e => e.replace(/\s+/g, ' ').trim());
  for (const event of normalized) {
    // Skip if this event text is a substring of an already-added event
    if (unique.some(u => u.includes(event))) continue;
    // Remove previously added events that are substrings of this one
    for (let i = unique.length - 1; i >= 0; i--) {
      if (event.includes(unique[i])) unique.splice(i, 1);
    }
    unique.push(event);
  }

  return { items: unique.slice(0, 50), method: 'calendar-events' };
}

/**
 * Extract emails from Gmail — returns sender + subject lines from the inbox grid.
 */
function extractGmailEmails(description: string): NLExtractResult {
  const items: string[] = [];

  // Strategy 1: Email rows in the grid — each <tr> is an email
  const grid = document.querySelector('[role="main"] [role="grid"]') || document.querySelector('[role="grid"]');
  if (grid) {
    const rows = grid.querySelectorAll('tr');
    for (const row of Array.from(rows)) {
      // Gmail email rows have sender info and subject
      const senderEl = row.querySelector('.yW span[email], .yW span, td.xY a span');
      const subjectEl = row.querySelector('.y6 span, .bog span, td.xY span[data-thread-id]');
      const snippetEl = row.querySelector('.y2, .xT .y2');
      const sender = senderEl?.textContent?.trim() || '';
      const subject = subjectEl?.textContent?.trim() || '';
      const snippet = snippetEl?.textContent?.trim() || '';
      if (sender || subject) {
        const parts = [sender, subject, snippet].filter(Boolean);
        items.push(parts.join(' — '));
      }
    }
  }

  // Strategy 2: Fallback — scan for elements with email-like structure
  if (items.length === 0) {
    const mainEl = document.querySelector('[role="main"]');
    if (mainEl) {
      // Try tr elements directly within main
      const allRows = mainEl.querySelectorAll('tr');
      for (const row of Array.from(allRows)) {
        const text = row.textContent?.trim() || '';
        // Skip very short rows (tab labels like "Primary") or very long ones (body text)
        if (text.length > 15 && text.length < 500) {
          // Collapse whitespace
          const cleaned = text.replace(/\s+/g, ' ').substring(0, 200);
          items.push(cleaned);
        }
      }
    }
  }

  // Strategy 3: [role="row"] elements — Gmail renders emails as table rows with role="row"
  if (items.length === 0) {
    const rows = document.querySelectorAll('[role="row"]');
    for (const row of Array.from(rows)) {
      // Skip category tabs (Primary, Social, etc.) — they have very short text
      const text = row.textContent?.trim().replace(/\s+/g, ' ') || '';
      if (text.length > 20 && text.length < 500) {
        // Extract structured data: look for sender, subject, date within row
        const senderEl = row.querySelector('span[email], .yW span, td span[data-hovercard-id]');
        const sender = senderEl?.textContent?.trim() || '';
        // Subject is usually in a <span> inside a link or specific class
        const subjectEl = row.querySelector('.y6 span, .bog span, span[data-thread-id] span');
        const subject = subjectEl?.textContent?.trim() || '';
        if (sender && subject) {
          items.push(`${sender} — ${subject}`);
        } else if (text.length > 30) {
          // Fallback: use full row text but clean it up
          const cleaned = text.substring(0, 200);
          items.push(cleaned);
        }
      }
    }
  }

  // Strategy 4: tr elements within main content area
  if (items.length === 0) {
    const mainEl = document.querySelector('[role="main"]');
    if (mainEl) {
      const allRows = mainEl.querySelectorAll('tr');
      for (const row of Array.from(allRows)) {
        const text = row.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (text.length > 30 && text.length < 500) {
          items.push(text.substring(0, 200));
        }
      }
    }
  }

  return { items: items.slice(0, 50), method: 'gmail-email-rows' };
}

/**
 * Extract post titles from Reddit using shreddit-post custom elements and other selectors.
 * Works across different subreddit layouts (old/new/redesign).
 */
function extractRedditPosts(description: string): NLExtractResult {
  const items: string[] = [];

  // Strategy 1: shreddit-post custom elements — each has title as attribute or in shadow DOM
  const shredditPosts = document.querySelectorAll('shreddit-post');
  for (const post of Array.from(shredditPosts)) {
    // shreddit-post often has post-title, content-href, or aria-label attributes
    const title = post.getAttribute('post-title') || post.getAttribute('aria-label') || '';
    if (title && title.length > 3 && !items.includes(title)) {
      items.push(title);
      continue;
    }
    // Try shadow DOM: look for title link inside
    if (post.shadowRoot) {
      const titleEl = post.shadowRoot.querySelector('a[slot="title"], [slot="title"], a[href*="/comments/"]');
      const text = titleEl?.textContent?.trim() || '';
      if (text && text.length > 3 && !items.includes(text)) items.push(text);
    }
    // Try slotted elements
    const slottedTitle = post.querySelector('a[slot="title"], [slot="title"]');
    if (slottedTitle) {
      const text = slottedTitle.textContent?.trim() || '';
      if (text && text.length > 3 && !items.includes(text)) items.push(text);
    }
  }

  // Strategy 2: Deep shadow DOM piercing for shreddit-post titles
  if (items.length === 0) {
    const shadowTitles = deepQuerySelectorAll(document, 'a[slot="title"], [slot="title"]');
    for (const el of shadowTitles) {
      const text = el.textContent?.trim() || '';
      if (text && text.length > 3 && text.length < 300 && !items.includes(text)) items.push(text);
    }
  }

  // Strategy 3: Post title links with Reddit-specific IDs/selectors
  if (items.length === 0) {
    const titleSelectors = [
      'a[id^="post-title"]',             // new Reddit
      'a[data-click-id="body"]',         // redesign
      'a[href*="/comments/"] h3',        // title inside link
      '.Post a h3',                      // old redesign
      'article a h3',                    // article-based layout
      '[data-testid="post-title"]',      // test IDs
    ];
    for (const sel of titleSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of Array.from(els)) {
        const text = el.textContent?.trim() || '';
        if (text && text.length > 3 && text.length < 300 && !items.includes(text)) items.push(text);
      }
      if (items.length >= 3) break;
    }
  }

  // Strategy 4: Links to /comments/ paths (Reddit post URLs always contain /comments/)
  if (items.length === 0) {
    const commentLinks = document.querySelectorAll('a[href*="/comments/"]');
    for (const link of Array.from(commentLinks)) {
      const text = link.textContent?.trim() || '';
      // Filter out short links (like "N comments") and nav elements
      if (text && text.length > 10 && text.length < 300 &&
          !text.toLowerCase().includes('comment') &&
          !link.closest('nav, aside, [role="navigation"]') &&
          !items.includes(text)) {
        items.push(text);
      }
    }
  }

  return { items: items.slice(0, 50), method: 'reddit-shreddit-posts' };
}

// ---------------------------------------------------------------------------
// Compound query extraction: when a query asks for multiple field types
// (e.g. "list stories with titles, points, and authors"), extract all fields
// per repeated container instead of dispatching to a single-field extractor.
// ---------------------------------------------------------------------------

function detectCompoundFields(lower: string): string[] {
  const fieldPatterns: [string, RegExp][] = [
    ['title', /\b(titles?|headlines?|headings?|subjects?)\b/],
    ['price', /\b(prices?|costs?|amounts?|fees?)\b/],
    ['score', /\b(scores?|votes?|upvotes?|downvotes?|ratings?|points?|karma)\b/],
    ['author', /\b(authors?|creators?|posters?|usernames?|senders?|channels?)\b/],
    ['date', /\b(dates?|timestamps?|posted|published)\b/],
    ['views', /\b(views?|view\s*counts?)\b/],
    ['link', /\b(links?|urls?)\b/],
    ['description', /\b(descriptions?|summar(?:y|ies)|excerpts?|snippets?)\b/],
  ];

  // "names" is ambiguous: "product names" = titles, "channel names" = authors.
  // Only add it to title if no author field already matched.
  const matched: string[] = [];
  for (const [name, pattern] of fieldPatterns) {
    if (pattern.test(lower)) matched.push(name);
  }

  // Add "names" to the title field only if it appears AND author wasn't already matched
  if (/\bnames?\b/.test(lower) && !matched.includes('author') && !matched.includes('title')) {
    matched.push('title');
  }

  // Adjacency check: "channel names" is a single concept (author), not compound.
  // If a matched author word is immediately adjacent to a matched title word, it's not compound.
  if (matched.includes('title') && matched.includes('author')) {
    // Check if title and author matches overlap (e.g., "channel names" → both match)
    const titleWords = lower.match(/\b(titles?|headlines?|headings?|subjects?|names?)\b/g) || [];
    const authorWords = lower.match(/\b(authors?|creators?|posters?|usernames?|senders?|channels?)\b/g) || [];
    for (const tw of titleWords) {
      for (const aw of authorWords) {
        // If they're adjacent (e.g., "channel names", "author name"), it's one concept
        if (lower.includes(`${aw} ${tw}`) || lower.includes(`${tw} ${aw}`)) {
          // Treat as author only (the modifier + "names" = author field)
          matched.splice(matched.indexOf('title'), 1);
        }
      }
    }
  }

  return matched;
}

function extractFieldFromContainer(container: Element, field: string): string {
  // For HN table layout: <tr class="athing"> has the title, and the NEXT sibling
  // <tr> has score, author, date in a <td class="subtext">
  const metaRow = container.tagName === 'TR' ? container.nextElementSibling : null;
  const searchIn = metaRow ? [container, metaRow] : [container];

  switch (field) {
    case 'title': {
      for (const el of searchIn) {
        // Amazon: h2 often contains the product title in a span
        const heading = el.querySelector(
          'h1, h2, h3, h4, .titleline > a, .storylink, a.storylink, ' +
          'a#video-title, #video-title, .a-text-normal'
        );
        if (heading) return heading.textContent?.trim() || '';
      }
      const link = container.querySelector('a[href]');
      if (link) return link.textContent?.trim() || '';
      return '';
    }
    case 'price': {
      const priceRegex = /(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP|AED|SAR|INR)\s*[\d,]+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP|AED|SAR|INR)/;
      for (const el of searchIn) {
        const priceEl = el.querySelector('[class*="price"], [class*="Price"], [data-price], [itemprop="price"]');
        if (priceEl) return priceEl.textContent?.trim() || '';
        const text = el.textContent || '';
        const match = text.match(priceRegex);
        if (match) return match[0];
      }
      return '';
    }
    case 'score': {
      for (const el of searchIn) {
        const scoreEl = el.querySelector('.score, [class*="score"], [class*="vote"], [class*="point"]');
        if (scoreEl) return scoreEl.textContent?.trim() || '';
      }
      for (const el of searchIn) {
        const text = el.textContent || '';
        const match = text.match(/\b(\d+)\s*(points?|votes?|upvotes?|score)/i);
        if (match) return match[0];
      }
      return '';
    }
    case 'author': {
      for (const el of searchIn) {
        const authorEl = el.querySelector(
          '[class*="author"], [class*="user"], .hnuser, a[href*="user"], [rel="author"], ' +
          '#channel-name, ytd-channel-name, a[href*="/@"]'
        );
        if (authorEl) return authorEl.textContent?.trim() || '';
      }
      return '';
    }
    case 'date': {
      for (const el of searchIn) {
        const dateEl = el.querySelector('time, [datetime], [class*="date"], [class*="time"], .age, [class*="ago"]');
        if (dateEl) return dateEl.getAttribute('title') || dateEl.textContent?.trim() || '';
      }
      return '';
    }
    case 'views': {
      for (const el of searchIn) {
        const viewEl = el.querySelector('[class*="view"], [aria-label*="view"], #metadata-line');
        if (viewEl) {
          const label = viewEl.getAttribute('aria-label');
          if (label && /\d/.test(label) && /view/i.test(label)) return label;
          const text = viewEl.textContent?.trim();
          if (text && /\d/.test(text)) return text;
        }
      }
      for (const el of searchIn) {
        const text = el.textContent || '';
        const match = text.match(/[\d,.]+[KMB]?\s*views?/i);
        if (match) return match[0];
      }
      return '';
    }
    case 'link': {
      const link = container.querySelector('a[href]') as HTMLAnchorElement;
      return link ? link.href : '';
    }
    case 'description': {
      for (const el of searchIn) {
        const descEl = el.querySelector('p, [class*="description"], [class*="summary"], [class*="snippet"], [class*="preview"]');
        if (descEl) return descEl.textContent?.trim().slice(0, 200) || '';
      }
      return '';
    }
    default:
      return '';
  }
}

function extractCompound(description: string, fields: string[]): NLExtractResult {
  const containers = findRepeatedContainers();
  if (containers.length === 0) {
    return { items: [], method: 'compound-no-containers' };
  }

  // For HN table layout, filter to only the main item rows (athing)
  // since metadata rows are accessed via nextElementSibling in extractFieldFromContainer
  const isTableLayout = containers[0]?.tagName === 'TR';
  const filteredContainers = isTableLayout
    ? containers.filter(c => c.classList.contains('athing') || c.querySelector('.titleline, .storylink'))
    : containers;

  const items: string[] = [];
  for (const container of filteredContainers) {
    const parts: string[] = [];
    for (const field of fields) {
      const value = extractFieldFromContainer(container, field);
      if (value) parts.push(value);
    }
    if (parts.length > 0) {
      items.push(parts.join(' | '));
    }
  }

  return { items: items.slice(0, 50), method: `compound-${fields.join('+')}` };
}

function extractByNaturalLanguage(description: string): NLExtractResult {
  const lower = description.toLowerCase();

  // Canvas app detection: Google Sheets has no DOM text, use formula bar + name box
  if (isCanvasApp()) {
    return extractCanvasAppData(description);
  }

  // Calendar event detection: Google Calendar uses custom [data-eventid] elements
  if (isCalendarApp() && /\b(events?|appointments?|meetings?|schedule|calendar)\b/.test(lower)) {
    return extractCalendarEvents();
  }

  // Gmail extraction: return email subjects/senders instead of tab labels
  if (location.hostname === 'mail.google.com') {
    return extractGmailEmails(description);
  }

  // Compound query detection: if 2+ field types are mentioned, extract all fields
  // per repeated container instead of dispatching to a single-field extractor.
  // Runs BEFORE site-specific extractors so compound queries on Reddit/etc. work.
  const compoundFields = detectCompoundFields(lower);
  if (compoundFields.length >= 2) {
    const compoundResult = extractCompound(description, compoundFields);
    if (compoundResult.items.length > 0) return compoundResult;
    // Fall through to single-field extraction if compound fails
  }

  // Reddit extraction: use shreddit-post elements directly to avoid UI chrome
  if (location.hostname.includes('reddit.com')) {
    const redditResult = extractRedditPosts(description);
    if (redditResult.items.length > 0) return redditResult;
    // Fall through to generic extraction if Reddit-specific fails
  }

  // Author/user/channel patterns — check BEFORE titles because "channel names" means authors
  if (/\b(authors?|users?|channels?|creators?|posters?|usernames?|handles?)\b/.test(lower)) {
    return extractNames();
  }

  // Title/headline/name patterns (handle plurals: titles, headlines, headings, names)
  // "names" routes here because "list product names", "list repo names" means item titles
  // But "channel names", "user names" already handled above by author pattern
  if (/\b(titles?|headlines?|headings?|names?|subjects?)\b/.test(lower)) {
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

  // HN-specific: use .titleline > a which reliably selects story titles
  if (location.hostname === 'news.ycombinator.com' || location.hostname === 'hn.algolia.com') {
    const hnTitles = document.querySelectorAll('.titleline > a, a.storylink');
    for (const el of Array.from(hnTitles)) {
      const text = el.textContent?.trim();
      if (text && text.length > 3) titles.push(text);
    }
    if (titles.length > 0) return { items: titles.slice(0, 50), method: 'hn-titleline' };
  }

  // GitHub-specific: trending repos, explore page, search results
  if (location.hostname === 'github.com') {
    // Trending repos: h2 > a with repo paths
    const repoLinks = document.querySelectorAll(
      'article h2 a, h3 a[href*="/"], .Box-row h3 a, [data-hpc] h3 a, ' +
      'a[data-hovercard-type="repository"], .repo-list h3 a'
    );
    for (const el of Array.from(repoLinks)) {
      const text = el.textContent?.trim().replace(/\s+/g, ' ');
      if (text && text.length > 1 && text.length < 200 && !titles.includes(text)) {
        titles.push(text);
      }
    }
    if (titles.length > 0) return { items: titles.slice(0, 50), method: 'github-repo-links' };
  }

  // Amazon-specific: use product title elements directly
  if (location.hostname.includes('amazon.')) {
    const productTitles = document.querySelectorAll(
      '[data-component-type="s-search-result"] h2 a span, ' +
      '[data-component-type="s-search-result"] h2, ' +
      '.s-result-item h2 a span, .a-link-normal .a-text-normal, ' +
      '[data-asin] h2 a span, [data-asin] h2'
    );
    for (const el of Array.from(productTitles)) {
      const text = el.textContent?.trim();
      if (text && text.length > 10 && text.length < 500 && !titles.includes(text)) {
        titles.push(text);
      }
    }
    if (titles.length > 0) return { items: titles.slice(0, 50), method: 'amazon-product-titles' };
  }

  // Scope to main content area to avoid sidebar/nav headings
  const mainContent = getMainContentArea();
  const searchRoot = mainContent || document;

  // Strategy 1: h1-h3 headings within main content area
  const headings = searchRoot.querySelectorAll('h1, h2, h3');
  for (const h of Array.from(headings)) {
    // Skip headings inside nav/aside/sidebar
    if (h.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
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

  // Strategy 3: aria heading roles within content area
  if (titles.length < 3) {
    const ariaHeadings = searchRoot.querySelectorAll('[role="heading"]');
    for (const h of Array.from(ariaHeadings)) {
      if (h.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
      const text = h.textContent?.trim();
      if (text && text.length > 3 && !titles.includes(text)) titles.push(text);
    }
  }

  // Strategy 4: links with title attributes within content area
  if (titles.length < 3) {
    const titledLinks = searchRoot.querySelectorAll('a[title]');
    for (const a of Array.from(titledLinks)) {
      if (a.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
      const text = a.getAttribute('title')?.trim();
      if (text && text.length > 3 && !titles.includes(text)) titles.push(text);
    }
  }

  // Strategy 5: Shadow DOM titles (Reddit shreddit-post, etc.)
  if (titles.length < 3) {
    const shadowTitles = deepQuerySelectorAll(document, 'a[slot="title"], [slot="title"], shreddit-post a[href*="/comments/"]');
    for (const el of shadowTitles) {
      const text = el.textContent?.trim();
      if (text && text.length > 3 && text.length < 300 && !titles.includes(text)) titles.push(text);
    }
  }

  return { items: titles.slice(0, 50), method: 'headings+repeated-containers' };
}

function extractPrices(): NLExtractResult {
  const prices: string[] = [];
  const priceRegex = /(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP|AED|SAR|INR)\s*[\d,]+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:[\$\u00A3\u20AC\u00A5]|USD|EUR|GBP|AED|SAR|INR)/;

  // Scope to main content area
  const mainContent = getMainContentArea();
  const walkRoot = mainContent || document.body;

  // Walk text nodes within content area
  const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT);
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

  // Scope to main content area to avoid sidebar
  const mainContent = getMainContentArea();
  const searchRoot = mainContent || document;

  const els = searchRoot.querySelectorAll(selectors);
  for (const el of Array.from(els)) {
    // Skip nav/sidebar elements
    if (el.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
    const text = el.textContent?.trim();
    if (text && text.length > 10 && text.length < 2000) blocks.push(text);
  }

  // Shadow DOM fallback for sites like Reddit
  if (blocks.length === 0) {
    const shadowBlocks = deepQuerySelectorAll(document, selectors);
    for (const el of shadowBlocks) {
      const text = el.textContent?.trim();
      if (text && text.length > 10 && text.length < 2000) blocks.push(text);
    }
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

  // YouTube-specific: use ytd channel name elements
  if (location.hostname.includes('youtube.com')) {
    const ytChannels = document.querySelectorAll(
      'ytd-channel-name a, #channel-name a, #text.ytd-channel-name, ' +
      'a[href*="/@"], #owner-name a, .ytd-channel-name'
    );
    for (const el of Array.from(ytChannels)) {
      const text = el.textContent?.trim();
      if (text && text.length > 1 && text.length < 100 && !names.includes(text)) {
        names.push(text);
      }
    }
    if (names.length > 0) return { items: names.slice(0, 50), method: 'youtube-channel-names' };
  }

  // Scope to main content area
  const mainContent = getMainContentArea();
  const searchRoot = mainContent || document;

  // Channel/author/user elements
  const nameEls = searchRoot.querySelectorAll(
    '[class*="author"], [class*="channel"], [class*="user"], [class*="creator"], [class*="byline"], ' +
    '[class*="Author"], [class*="Channel"], [class*="User"], [itemprop="author"], [rel="author"]'
  );
  for (const el of Array.from(nameEls)) {
    if (el.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
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

  // Wikipedia-specific: extract lead paragraph(s) from article body
  if (location.hostname.includes('wikipedia.org')) {
    const wikiSelectors = [
      '#mw-content-text .mw-parser-output > p:not(.mw-empty-elt)',
      '.mw-body-content .mw-parser-output > p:not(.mw-empty-elt)',
      '#bodyContent p',
    ];
    for (const sel of wikiSelectors) {
      const paras = document.querySelectorAll(sel);
      for (const p of Array.from(paras)) {
        const text = p.textContent?.trim();
        // Skip very short (probably just brackets/citations) or empty paragraphs
        if (text && text.length > 50) {
          descriptions.push(text);
          if (descriptions.length >= 3) break; // first few paragraphs
        }
      }
      if (descriptions.length > 0) break;
    }
    if (descriptions.length > 0) {
      return { items: descriptions, method: 'wikipedia-article-body' };
    }
  }

  // Article-specific: try main content paragraphs
  const mainContent = document.querySelector('main, article, [role="main"], #content, .content, .post-body, .article-body');
  if (mainContent) {
    const paras = mainContent.querySelectorAll('p');
    for (const p of Array.from(paras)) {
      // Skip nav/sidebar elements
      if (p.closest('nav, aside, footer, [role="navigation"], [role="complementary"]')) continue;
      const text = p.textContent?.trim();
      if (text && text.length > 50 && text.length < 2000) {
        descriptions.push(text);
        if (descriptions.length >= 5) break;
      }
    }
    if (descriptions.length > 0) {
      return { items: descriptions, method: 'article-paragraphs' };
    }
  }

  // Repeated container fallback
  const repeated = findRepeatedContainers();
  for (const container of repeated) {
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
    const main = getMainContentArea() || document.querySelector('main, [role="main"], #content, .content, article');
    if (main) {
      const paragraphs = main.querySelectorAll('p, li, h1, h2, h3, h4, span');
      for (const p of Array.from(paragraphs)) {
        // Skip nav/sidebar elements
        if (p.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
        const text = p.textContent?.trim();
        if (text && text.length > 5) items.push(text);
      }
    }
  }
  return { items: items.slice(0, 50), method: 'generic-repeated-containers' };
}

/**
 * Locate the main content area of the page (not sidebar/nav).
 * Returns the best content root or null if none found.
 */
function getMainContentArea(): Element | null {
  // Gmail: scope to email grid/table to avoid tab bar (Primary/Social/etc.)
  if (location.hostname === 'mail.google.com') {
    // The email list is a table with role="grid" inside [role="main"]
    const gmailSelectors = [
      '[role="main"] [role="grid"]',     // email list grid
      '[role="main"] table.F',           // alternative email table
      'div.AO [role="grid"]',            // nested grid
      'div.AO',                          // email content pane
    ];
    for (const sel of gmailSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 50) return el;
        }
      } catch { /* invalid selector */ }
    }
  }

  // Reddit: find the feed container, trying multiple selectors across old/new Reddit
  if (location.hostname.includes('reddit.com')) {
    const redditSelectors = [
      'shreddit-feed',                   // new Reddit custom element
      '[data-testid="posts-list"]',      // post list container
      'main [slot="content"]',           // slotted content
      '[data-testid="post-container"]',  // individual post containers' parent
      '.ListingLayout-outerContainer',   // old Reddit listing
      'main',                            // generic main
    ];
    for (const sel of redditSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 50) return el;
        }
      } catch { /* invalid selector */ }
    }
    // Shadow DOM fallback: look for shreddit-feed in shadow roots
    const shadowFeed = deepQuerySelector(document, 'shreddit-feed');
    if (shadowFeed) return shadowFeed;
  }

  // Try site-specific content area selectors first
  const siteSpecific = [
    // GitHub
    '[data-hpc]', 'turbo-frame#repo-content-turbo-frame', '#repo-content-pjax-container',
    // Calendar
    '[data-view-heading]', '[role="grid"]',
    // Generic landmarks
    'main', '[role="main"]', '#content', '#main-content', '.main-content',
    'article', '[class*="main-content"]', '[class*="MainContent"]',
    '[id*="content"]:not(nav):not(aside):not(header):not(footer)',
  ];
  for (const sel of siteSpecific) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Ensure it has substantial size (not a hidden element)
        if (rect.width > 100 && rect.height > 100) return el;
      }
    } catch { /* invalid selector */ }
  }
  // Shadow DOM fallback for Reddit's shreddit-post elements
  const shadowMain = deepQuerySelector(document, 'main, [role="main"]');
  if (shadowMain) return shadowMain;
  return null;
}

/**
 * Find repeated sibling containers — the core pattern for feed/list pages.
 * Looks for parent elements with many same-tag children (ul>li, div>div, etc.)
 * Scopes to main content area first to avoid grabbing sidebar/nav elements.
 */
function findRepeatedContainers(): Element[] {
  const candidates: Element[] = [];

  // Scope to main content area to avoid sidebar/nav bias
  const mainContent = getMainContentArea();
  const searchRoot = mainContent || document;

  // Look for common list/feed patterns within the content area
  // Include table/tbody for sites like Hacker News that use table-based layouts
  const listParents = searchRoot.querySelectorAll('ul, ol, table, tbody, [role="list"], [role="feed"], section, main, [role="main"]');
  // Also include the search root itself if it matches
  const roots = mainContent
    ? [mainContent, ...Array.from(listParents)]
    : Array.from(listParents);

  // Collect ALL candidate groups from all parents and pick the LARGEST one.
  // Previously broke on the first parent with 3+ children, which often matched
  // nav elements instead of the main content list (e.g., HN nav table vs story tbody).
  let bestGroup: Element[] = [];
  for (const parent of roots) {
    const children = Array.from(parent.children);
    if (children.length < 2) continue;

    // Count tag frequency among children
    const tagCounts = new Map<string, number>();
    for (const child of children) {
      const tag = child.tagName;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    // If a tag appears 3+ times, those children are candidate containers
    for (const [tag, count] of tagCounts) {
      if (count >= 3) {
        const group = children.filter(c => c.tagName === tag);
        if (group.length > bestGroup.length) {
          bestGroup = group;
        }
      }
    }
  }
  if (bestGroup.length >= 3) {
    candidates.push(...bestGroup);
  }

  // Site-specific overrides: these produce better results than generic repeated containers
  // YouTube custom element: ytd-rich-item-renderer, ytd-video-renderer
  if (location.hostname.includes('youtube.com')) {
    const ytRenderers = document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
      'ytd-grid-video-renderer, ytd-playlist-video-renderer'
    );
    if (ytRenderers.length >= 3) {
      return Array.from(ytRenderers).slice(0, 50);
    }
  }

  // Amazon product grid: prefer [data-asin] product cards over generic divs
  if (location.hostname.includes('amazon.')) {
    const amazonProducts = document.querySelectorAll(
      '[data-component-type="s-search-result"], .s-result-item[data-asin], ' +
      '.zg-item-immersion, [data-asin]:not(#nav-search-submit-button):not([data-asin=""])'
    );
    if (amazonProducts.length >= 3) {
      return Array.from(amazonProducts).slice(0, 50);
    }
  }

  // Generic YouTube fallback (in case hostname check missed)
  if (candidates.length < 3) {
    const ytRenderers = document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ' +
      'ytd-grid-video-renderer, ytd-playlist-video-renderer'
    );
    if (ytRenderers.length >= 3) {
      candidates.push(...Array.from(ytRenderers));
      return candidates.slice(0, 50);
    }
  }

  // Amazon fallback
  if (candidates.length < 3) {
    const amazonProducts = document.querySelectorAll(
      '[data-component-type="s-search-result"], .zg-item-immersion, ' +
      '.a-carousel-card, [data-asin], .s-result-item[data-asin]'
    );
    if (amazonProducts.length >= 3) {
      candidates.push(...Array.from(amazonProducts));
      return candidates.slice(0, 50);
    }
  }

  // Shadow DOM fallback: check for shadow-hosted repeated elements (Reddit shreddit-post)
  if (candidates.length < 3) {
    const shadowRepeated = deepQuerySelectorAll(document, 'shreddit-post, [data-testid="post-container"]');
    if (shadowRepeated.length >= 3) {
      candidates.push(...shadowRepeated);
      return candidates.slice(0, 50);
    }
  }

  // Fallback: find divs with many same-class siblings WITHIN the content area
  if (candidates.length < 3) {
    const allDivs = (searchRoot as Element).querySelectorAll?.('div[class]') ?? document.querySelectorAll('div[class]');
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

// ---------------------------------------------------------------------------
// Level 2: Auto-extract helpers — page type detection + default schemas
// ---------------------------------------------------------------------------

type AutoPageType = 'product' | 'search' | 'article' | 'feed' | 'table' | 'form' | 'chat' | 'unknown';

function detectPageTypeFromSnapshot(snapshot: Record<string, unknown>): AutoPageType {
  const url = (snapshot.url as string || '').toLowerCase();
  const title = (snapshot.title as string || '').toLowerCase();
  const jsonLd = (snapshot.jsonLd as Record<string, unknown>[]) || [];
  const meta = (snapshot.meta as Record<string, string>) || {};
  const tables = (snapshot.tables as unknown[]) || [];
  const forms = (snapshot.forms as unknown[]) || [];

  // JSON-LD type detection
  for (const item of jsonLd) {
    const type = ((item['@type'] as string) || '').toLowerCase();
    if (/product/.test(type)) return 'product';
    if (/article|newsarticle|blogposting/.test(type)) return 'article';
    if (/searchresults/.test(type)) return 'search';
  }

  // OG type
  const ogType = (meta['og:type'] || '').toLowerCase();
  if (ogType === 'product') return 'product';
  if (/article/.test(ogType)) return 'article';

  // URL hints
  if (/\/product|\/item|\/dp\/|\/gp\//.test(url)) return 'product';
  if (/search|query|results|\?q=|\?s=/.test(url)) return 'search';
  if (/\/article|\/post|\/blog|\/news|\/story/.test(url)) return 'article';
  if (/chat|gemini|claude|chatgpt/.test(url)) return 'chat';
  if (/feed|timeline/.test(url)) return 'feed';

  // DOM structure hints
  if (tables.length > 0) return 'table';
  if (forms.length > 0) return 'form';

  // Check for repeated groups (feed/search indicators)
  const elements = (snapshot.elements as Array<Record<string, unknown>>) || [];
  const articleCount = elements.filter(e => e.tag === 'article').length;
  if (articleCount >= 3) return 'feed';

  return 'unknown';
}

function getDefaultSchemaForPageType(pageType: AutoPageType, snapshot: Record<string, unknown>): Record<string, string> | null {
  switch (pageType) {
    case 'product':
      return {
        title: 'h1, [data-testid="title"], .product-title, .product-name',
        price: '[data-testid="price"], .price, .product-price, [itemprop="price"], .a-price .a-offscreen',
        description: '[data-testid="description"], .product-description, [itemprop="description"], #productDescription',
        image: 'img[data-testid="product-image"], .product-image img, [itemprop="image"]',
        rating: '[data-testid="rating"], .rating, [itemprop="ratingValue"], .a-icon-alt',
        availability: '[data-testid="availability"], .availability, [itemprop="availability"], #availability',
      };
    case 'article':
      return {
        title: 'h1, article h1, .article-title, .post-title',
        author: '[rel="author"], .author, .byline, [itemprop="author"], .post-author',
        date: 'time, [itemprop="datePublished"], .date, .post-date, .article-date',
        content: 'article, .article-body, .post-content, .entry-content, [itemprop="articleBody"]',
      };
    case 'search':
      return {
        results: '.search-result, .g, .result, [data-testid="result"]',
        titles: '.search-result h2, .search-result h3, .g h3, .result-title',
        links: '.search-result a, .g a, .result a',
      };
    case 'feed':
      return {
        posts: 'article, .post, .feed-item, [role="article"]',
        titles: 'article h2, article h3, .post-title, .feed-title',
        authors: '.author, .username, [rel="author"]',
      };
    case 'table': {
      const tables = (snapshot.tables as Array<Record<string, unknown>>) || [];
      if (tables.length > 0 && tables[0].selector) {
        const sel = tables[0].selector as string;
        return {
          headers: `${sel} th`,
          rows: `${sel} tr`,
          cells: `${sel} td`,
        };
      }
      return { headers: 'table th', rows: 'table tr', cells: 'table td' };
    }
    case 'chat':
      return {
        messages: '.message, [data-testid="message"], [role="presentation"]',
        input: 'textarea, [contenteditable="true"], [role="textbox"]',
      };
    case 'form': {
      const forms = (snapshot.forms as Array<Record<string, unknown>>) || [];
      if (forms.length > 0) {
        return {
          inputs: 'form input, form textarea, form select',
          labels: 'form label',
          buttons: 'form button, form [type="submit"]',
        };
      }
      return null;
    }
    default:
      return {
        title: 'h1',
        headings: 'h2, h3',
        links: 'a[href]',
        images: 'img[src]',
      };
  }
}

function calculateAutoConfidence(
  structured: { fieldCount: number; confidence: number },
  autoData: Record<string, unknown>,
  pageType: AutoPageType,
): number {
  let confidence = 0;

  // Structured data contributes significantly
  if (structured.fieldCount > 5) confidence += 0.4;
  else if (structured.fieldCount > 0) confidence += 0.2;

  // Extracted fields count
  const dataKeys = Object.keys(autoData).filter(k => !k.startsWith('_'));
  if (dataKeys.length > 5) confidence += 0.3;
  else if (dataKeys.length > 2) confidence += 0.2;
  else if (dataKeys.length > 0) confidence += 0.1;

  // Known page type is a good signal
  if (pageType !== 'unknown') confidence += 0.2;

  // Non-empty values boost confidence
  const nonEmpty = dataKeys.filter(k => {
    const v = autoData[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== '' && v !== null && v !== undefined;
  });
  if (nonEmpty.length === dataKeys.length && dataKeys.length > 0) confidence += 0.1;

  return Math.min(1.0, confidence);
}

// ---------------------------------------------------------------------------
// Level 6: Nested/Recursive Extract — hierarchical data extraction
// ---------------------------------------------------------------------------

const MAX_NESTING_DEPTH = 5;

function extractNested(
  schema: Record<string, unknown>,
  scope: Document | Element,
  depth: number,
): unknown {
  if (depth >= MAX_NESTING_DEPTH) return null;

  const container = schema._container as string | undefined;
  const isArray = false; // determined by caller via key[]

  if (container) {
    // Find all matching containers
    let containers: Element[];
    try {
      containers = Array.from(scope.querySelectorAll(container));
    } catch {
      containers = deepQuerySelectorAll(scope, container);
    }

    const items: Record<string, unknown>[] = [];
    for (const containerEl of containers) {
      const item: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema)) {
        if (key === '_container') continue;

        const isArrayKey = key.endsWith('[]');
        const cleanKey = isArrayKey ? key.slice(0, -2) : key;

        if (typeof value === 'object' && value !== null) {
          // Recurse for nested objects
          item[cleanKey] = extractNested(value as Record<string, unknown>, containerEl, depth + 1);
        } else if (typeof value === 'string') {
          // Extract from within the container scope
          const selectorParts = value.split('@');
          const sel = selectorParts[0];
          const attr = selectorParts[1]; // optional attribute extraction

          try {
            const els = Array.from(containerEl.querySelectorAll(sel));
            if (els.length === 0) {
              // Shadow DOM fallback
              const shadowEls = deepQuerySelectorAll(containerEl, sel);
              if (shadowEls.length > 0) {
                if (isArrayKey || shadowEls.length > 1) {
                  item[cleanKey] = shadowEls.map(el => attr ? (el.getAttribute(attr) || '') : readText(el));
                } else {
                  item[cleanKey] = attr ? (shadowEls[0].getAttribute(attr) || '') : readText(shadowEls[0]);
                }
              } else {
                item[cleanKey] = isArrayKey ? [] : '';
              }
            } else if (isArrayKey || els.length > 1) {
              item[cleanKey] = els.map(el => attr ? (el.getAttribute(attr) || '') : readText(el)).filter(t => t !== '');
            } else {
              item[cleanKey] = attr ? (els[0].getAttribute(attr) || '') : readText(els[0]);
            }
          } catch {
            item[cleanKey] = isArrayKey ? [] : '';
          }
        }
      }
      items.push(item);
    }
    return items;
  }

  // No container — just extract fields from the scope directly
  const item: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    const isArrayKey = key.endsWith('[]');
    const cleanKey = isArrayKey ? key.slice(0, -2) : key;

    if (typeof value === 'object' && value !== null) {
      item[cleanKey] = extractNested(value as Record<string, unknown>, scope, depth + 1);
    } else if (typeof value === 'string') {
      const selectorParts = value.split('@');
      const sel = selectorParts[0];
      const attr = selectorParts[1];

      try {
        const els = Array.from(scope.querySelectorAll(sel));
        if (isArrayKey || els.length > 1) {
          item[cleanKey] = els.map(el => attr ? (el.getAttribute(attr) || '') : readText(el)).filter(t => t !== '');
        } else if (els.length === 1) {
          item[cleanKey] = attr ? (els[0].getAttribute(attr) || '') : readText(els[0]);
        } else {
          item[cleanKey] = isArrayKey ? [] : '';
        }
      } catch {
        item[cleanKey] = isArrayKey ? [] : '';
      }
    }
  }
  return item;
}

async function handleExtract(command: {
  range?: string;
  format?: 'array' | 'object' | 'csv';
  schema?: Record<string, string | Record<string, unknown>>;
  query?: string;
  limit?: number;
  strategy?: string;
  paginate?: boolean;
  maxPages?: number;
  delay?: number;
  fallback?: string;
}): Promise<BridgeResponse> {
  const { range, format = 'object', schema, query, limit } = command;

  // Natural language query mode: { query: "top post titles", limit: 5 }
  if (query && typeof query === 'string') {
    const nlResult = extractByNaturalLanguage(query);
    const items = limit && limit > 0 ? nlResult.items.slice(0, limit) : nlResult.items;
    return { success: true, data: { query, items, method: nlResult.method, count: items.length } };
  }

  // ---------------------------------------------------------------------------
  // Level 2: Zero-Config Auto-Extract — empty body triggers smart extraction
  // ---------------------------------------------------------------------------
  const schemaIsEmpty = !schema || (typeof schema === 'object' && Object.keys(schema).length === 0);
  if (schemaIsEmpty && !range && !query) {
    const startMs = Date.now();

    // 1. Check for structured data first (JSON-LD, OG, microdata — 0ms DOM walking)
    const structured = extractStructuredData();

    // 2. Run discover to detect page type
    const snapshot = collectDomSnapshot();
    const pageType = detectPageTypeFromSnapshot(snapshot);

    // 3. Apply default schema for the detected page type
    const defaultSchema = getDefaultSchemaForPageType(pageType, snapshot);
    const autoData: Record<string, unknown> = {};
    const autoSources: Record<string, string> = {};

    // Start with structured data
    if (structured.fieldCount > 0) {
      for (const [key, value] of Object.entries(structured.data)) {
        if (key.startsWith('_')) continue; // skip internal keys
        autoData[key] = value;
        autoSources[key] = structured.sources[key] || 'structured';
      }
    }

    // Fill remaining fields from DOM-based default schema
    if (defaultSchema) {
      for (const [key, selector] of Object.entries(defaultSchema)) {
        if (autoData[key]) continue; // already have from structured data
        try {
          const els = document.querySelectorAll(selector);
          if (els.length > 1) {
            autoData[key] = Array.from(els).map(el => readText(el)).filter(t => t.length > 0);
          } else if (els.length === 1) {
            autoData[key] = readText(els[0]);
          }
          if (autoData[key]) autoSources[key] = 'css';
        } catch { /* invalid selector */ }
      }
    }

    const durationMs = Date.now() - startMs;
    const confidence = calculateAutoConfidence(structured, autoData, pageType);

    return {
      success: true,
      data: {
        data: autoData,
        _meta: {
          strategy: structured.fieldCount > 0 ? 'structured+css' : 'css',
          confidence,
          sources: autoSources,
          duration_ms: durationMs,
          auto: true,
          pageType,
        },
      },
    };
  }

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
  const startMs = Date.now();
  const result: Record<string, unknown> = {};
  const meta: Record<string, string> = {};
  const selectorsUsed: Record<string, string> = {};

  // Level 4: Check structured data first (0ms, no DOM walking)
  const structured = extractStructuredData();

  const entries =
    schema && typeof schema === 'object'
      ? Object.entries(schema as Record<string, string | Record<string, unknown>>)
      : ([] as Array<[string, string | Record<string, unknown>]>);

  for (let [key, selectorOrDesc] of entries) {
    // Level 7: Type-hint objects — { selector: ".price", type: "currency" }
    if (typeof selectorOrDesc === 'object' && selectorOrDesc !== null) {
      const sObj = selectorOrDesc as Record<string, unknown>;
      if (typeof sObj.selector === 'string' && sObj.type) {
        // This is a type-hint, not a nested schema — extract the selector
        selectorOrDesc = sObj.selector;
        // typeHints are collected later for type parsing
      } else {
        // Level 6: Nested extraction — handle object schemas with _container
        result[key] = extractNested(sObj, document, 0);
        meta[key] = 'nested';
        continue;
      }
    }

    if (!selectorOrDesc) {
      result[key] = '';
      continue;
    }

    // Level 4: Check structured data for this field first
    if (structured.fieldCount > 0 && structured.data[key] !== undefined) {
      const val = structured.data[key];
      if (val !== null && val !== undefined && val !== '') {
        result[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
        meta[key] = structured.sources[key] || 'structured';
        continue;
      }
    }

    // Fix 4: Natural Language Extract Mode
    if (isNaturalLanguageQuery(selectorOrDesc as string)) {
      const nlResult = extractByNaturalLanguage(selectorOrDesc as string);
      result[key] = nlResult.items;
      meta[key] = `nl:${nlResult.method}`;
      continue;
    }

    // Standard CSS selector path
    // Try querySelectorAll first — return array if multiple matches
    let elements: Element[] = [];
    try {
      elements = Array.from(document.querySelectorAll(selectorOrDesc as string));
    } catch { /* invalid CSS selector syntax */ }

    // Shadow DOM fallback with >>> piercing combinator support (Level 8)
    if (elements.length === 0) {
      elements = deepQuerySelectorAll(document, selectorOrDesc as string);
      if (elements.length > 0) meta[key] = 'shadow-dom';
    }

    if (elements.length > 1) {
      // Multiple matches: return array of all texts
      result[key] = elements.map(el => readText(el)).filter(t => t.length > 0);
      meta[key] = meta[key] || `${elements.length}-matches`;
      selectorsUsed[key] = selectorOrDesc as string;
    } else if (elements.length === 1) {
      result[key] = readText(elements[0]);
      selectorsUsed[key] = selectorOrDesc as string;
    } else {
      // Fix 1: Smart Extract Fallback — try semantic extraction
      const fallbackText = smartExtractFallback(selectorOrDesc as string, key);
      if (fallbackText) {
        result[key] = fallbackText;
        meta[key] = 'smart-fallback';
      } else {
        result[key] = '';
        meta[key] = 'not-found';
      }
    }
  }

  const durationMs = Date.now() - startMs;

  // Level 7: Type-Aware Parsing — auto-detect and parse value types
  const typeHints: Record<string, ParsedType> = {};
  for (const [key, selectorOrDesc] of entries) {
    if (typeof selectorOrDesc === 'object' && selectorOrDesc !== null) {
      const sObj = selectorOrDesc as Record<string, unknown>;
      if (sObj.type && typeof sObj.type === 'string') {
        typeHints[key] = sObj.type as ParsedType;
      }
    }
  }

  const parsed = parseExtractResult(result, Object.keys(typeHints).length > 0 ? typeHints : undefined);
  const warnings = validateExtractResult(result, parsed);

  // Build typed result — replace raw values with parsed ones
  const typedResult: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (parsed[key] && parsed[key].type !== 'string') {
      typedResult[key] = parsed[key].value;
    } else {
      typedResult[key] = value;
    }
  }

  // Include extraction metadata alongside results
  const responseData: Record<string, unknown> = Object.keys(meta).length > 0
    ? {
        result: typedResult,
        _meta: {
          ...meta,
          strategy: 'css',
          duration_ms: durationMs,
          selectors_used: selectorsUsed,
          auto: false,
          ...(warnings.length > 0 ? { _warnings: warnings } : {}),
        },
      }
    : typedResult;
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

// Known key names that should never be interpreted as text to type
const KNOWN_KEYS = new Set([
  'tab', 'enter', 'return', 'escape', 'esc', 'backspace', 'delete', 'del',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'up', 'down', 'left', 'right',
  'space', 'home', 'end', 'pageup', 'pagedown',
  'insert', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
]);

// Map common key name aliases to canonical CDP key names
const KEY_ALIASES: Record<string, string> = {
  tab: 'Tab', enter: 'Enter', return: 'Enter', escape: 'Escape', esc: 'Escape',
  backspace: 'Backspace', delete: 'Delete', del: 'Delete', space: ' ',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert',
  f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
  f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
};

/**
 * Normalize a key name: strip articles ("the"), suffixes ("key"), and map aliases.
 * "the Tab key" → "Tab", "Enter" → "Enter", "escape" → "Escape"
 */
function normalizeKeyName(raw: string): string {
  // Strip articles and "key" suffix: "the Tab key" → "Tab"
  let cleaned = raw.trim()
    .replace(/^(?:the\s+)/i, '')
    .replace(/\s+key$/i, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  // Capitalize first letter for single-word named keys
  if (cleaned.length > 1) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned;
}

function parseActInstruction(instruction: string): ActStep[] {
  // Split compound instructions: "X then Y", "X and then Y", "X; Y", "X, Y", "X and press/click/scroll Y"
  const compoundSplit = instruction.trim().split(/\s+and\s+then\s+|\s+then\s+|\s+and\s+(?=(?:press|click|tap|scroll|select|open|type|enter|hit)\s)/i)
    .map(s => s.trim()).filter(s => s.length > 0);
  // Also split on semicolons and commas followed by action verbs
  const finalParts: string[] = [];
  for (const part of compoundSplit) {
    const semiSplit = part.split(/\s*;\s*/).map(s => s.trim()).filter(s => s.length > 0);
    for (const sub of semiSplit) {
      // Split on commas followed by an action verb (e.g. ", type", ", press", ", click")
      finalParts.push(...sub.split(/\s*,\s+(?=(?:press|click|tap|scroll|select|open|type|enter|hit)\s)/i)
        .map(s => s.trim()).filter(s => s.length > 0));
    }
  }
  if (finalParts.length > 1) {
    const allSteps: ActStep[] = [];
    for (const subInstr of finalParts) {
      const trimmed = subInstr.trim();
      if (!trimmed) continue;
      allSteps.push(...parseSingleActInstruction(trimmed));
    }
    return allSteps;
  }
  return parseSingleActInstruction(instruction.trim());
}

function parseSingleActInstruction(instruction: string): ActStep[] {
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

  // Pattern: "press Ctrl+C" / "press Enter" / "press the Tab key"
  const pressMatch = instr.match(/\bpress\s+((?:(?:ctrl|shift|alt|meta|cmd)\+)*(?:the\s+)?[\w]+(?:\s+key)?)\b/i);
  if (pressMatch && !cellRefPattern.test(instr)) {
    const rawKey = pressMatch[1];
    // Handle modifier+key combos: "Ctrl+C", "Shift+Tab"
    const parts = rawKey.split('+');
    const keyPart = parts.pop()!;
    const modifiers = parts.length > 0 ? parts.map(m => m.toLowerCase().replace(/^the\s+/i, '')) : undefined;
    const normalizedKey = normalizeKeyName(keyPart);
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
  // Only applies to Sheets/canvas pages with cell refs — skip on generic pages
  const refs = instr.match(cellRefPattern);
  let textToType: string | null = null;

  if (refs && refs.length > 0) {
    const typeMatch = instr.match(/\b(?:type|enter|input|write)\s+(?:(?:the\s+)?(?:value|text|formula)\s+)?(.+?)(?:\s+(?:in|into|to|at)\s+(?:cell\s+)?[A-Z]{1,3}\d{1,7})?$/i);

    if (typeMatch) {
      let raw = typeMatch[1].trim();
      // Remove trailing "in X" if cell ref is at end
      raw = raw.replace(/\s+(?:in|into|to|at)\s+(?:cell\s+)?[A-Z]{1,3}\d{1,7}\s*$/i, '').trim();
      // Remove surrounding quotes
      raw = raw.replace(/^["']|["']$/g, '');
      textToType = raw;
    }

    // Prefer quoted text if available — typeMatch regex can corrupt text with trailing punctuation
    if (quotedMatch) {
      textToType = quotedMatch[1];
    }

    // Navigate to cell if a reference was found
    // If there are multiple refs and we're typing, navigate to the last one mentioned
    // "type Hello in B2" → B2 is the target
    const targetRef = refs[refs.length > 1 && textToType ? refs.length - 1 : 0].toUpperCase();
    steps.push({ op: 'navigate', ref: targetRef, status: 'pending' });

    // Type text if found
    if (textToType) {
      steps.push({ op: 'type', text: textToType, target: 'formulaBar', status: 'pending' });
      steps.push({ op: 'press', key: 'Enter', status: 'pending' });
    }
  }

  // -----------------------------------------------------------------------
  // Generic fallback: works on ANY page, not just Sheets
  // -----------------------------------------------------------------------
  if (steps.length === 0) {
    // Pattern: "scroll down" / "scroll up" / "scroll to top" / "scroll to bottom"
    const scrollMatch = instr.match(/\bscroll\s+(down|up|left|right|to\s+(?:the\s+)?(?:top|bottom))\b/i);
    if (scrollMatch) {
      const scrollArg = scrollMatch[1].toLowerCase();
      if (scrollArg.includes('top')) {
        steps.push({ op: 'scroll', text: 'top', status: 'pending' } as ActStep);
      } else if (scrollArg.includes('bottom')) {
        steps.push({ op: 'scroll', text: 'bottom', status: 'pending' } as ActStep);
      } else {
        steps.push({ op: 'scroll', text: scrollArg, status: 'pending' } as ActStep);
      }
      return steps;
    }

    const actions = scanPageActions();

    // Pattern: "type X into Y" / "type X in Y" / "enter X in Y" (multi-word text support)
    const typeInMatch = instr.match(/\b(?:type|enter|input|write)\s+(?:["']([^"']+)["']|(.+?))\s+(?:in|into)\s+(?:the\s+)?(.+)$/i);
    if (typeInMatch) {
      const textVal = (typeInMatch[1] || typeInMatch[2]).trim();
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

    // Pattern: "click the first/second/third/1st/2nd/3rd/Nth [noun]" — ordinal resolution
    const ordinalMatch = instr.match(/\b(?:click|press|tap|select|open|hit)\s+(?:on\s+)?(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|\d+(?:st|nd|rd|th))\s+(.+)$/i);
    if (ordinalMatch) {
      const ordinalStr = ordinalMatch[1].toLowerCase();
      const nounDesc = ordinalMatch[2].trim().replace(/\s+(?:button|link)$/i, '');
      const ordinalMap: Record<string, number> = {
        first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2,
        fourth: 3, '4th': 3, fifth: 4, '5th': 4,
      };
      let idx = ordinalMap[ordinalStr];
      if (idx === undefined) {
        // Parse numeric ordinals like "6th", "10th"
        const numMatch = ordinalStr.match(/^(\d+)/);
        idx = numMatch ? parseInt(numMatch[1], 10) - 1 : 0;
      }
      // Find all elements matching the noun in main content area
      const mainContent = getMainContentArea();
      const searchRoot = mainContent || document.body;
      const nounLower = nounDesc.toLowerCase();
      const matchingEls: Element[] = [];
      // Known noun-to-selector mappings for common content types
      const nounSelectors: Record<string, string[]> = {
        video: ['a#video-title', 'h3 a', 'a[href*="watch"]', 'a[href*="video"]', '[data-testid="video-title"]'],
        product: ['[data-component-type="s-search-result"] h2 a', '.s-result-item h2 a', 'h2 a[href*="/dp/"]', '[data-testid="product-title"]', 'h2 a', 'h3 a'],
        post: ['a[slot="title"]', 'a[href*="/comments/"]', '[data-testid="post-title"]', 'a[id^="post-title"]', 'article a h3', 'article a h2', '.Post a h3'],
        link: ['a[href]'],
        result: ['h3 a', '.result a', '[data-testid="result"] a', 'h2 a'],
        item: ['li a', '.item a', 'article a'],
        email: ['tr[role="row"] td a', 'tr td .y6 span', 'tr[jscontroller]', '[role="row"]'],
        story: ['.titleline > a', 'a.storylink', '.athing .title a', 'a[href*="story"]', 'article a h2', 'h3 a'],
        repo: ['a[href*="github.com/"]', 'h3 a', '[data-hovercard-type="repository"] a'],
        button: ['button', '[role="button"]'],
      };
      // Try noun-specific selectors first (check if any key appears in the noun description)
      let specificSels: string[] = nounSelectors[nounLower] || [];
      if (specificSels.length === 0) {
        for (const [key, sels] of Object.entries(nounSelectors)) {
          if (nounLower.includes(key)) { specificSels = sels; break; }
        }
      }
      for (const sel of specificSels) {
        try {
          const els = searchRoot.querySelectorAll(sel);
          for (const el of Array.from(els)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * 3) {
              matchingEls.push(el);
            }
          }
          // Also try shadow DOM for EACH selector (not just when nothing found)
          if (matchingEls.length <= idx) {
            const shadowEls = deepQuerySelectorAll(document, sel);
            for (const el of shadowEls) {
              if (matchingEls.includes(el)) continue; // skip duplicates
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) matchingEls.push(el);
            }
          }
          if (matchingEls.length > idx) break;
        } catch { /* invalid selector */ }
      }
      // Fallback: search by text content / aria-label matching the noun
      if (matchingEls.length <= idx) {
        const allInteractive = searchRoot.querySelectorAll('a[href], button, [role="button"], [role="link"], h2 a, h3 a');
        for (const el of Array.from(allInteractive)) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const text = (el.textContent?.trim() || '').toLowerCase();
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          const role = (el.getAttribute('role') || '').toLowerCase();
          if (text.includes(nounLower) || label.includes(nounLower) || role.includes(nounLower)) {
            if (!matchingEls.includes(el)) matchingEls.push(el);
          }
        }
      }
      if (matchingEls.length > idx) {
        const targetEl = matchingEls[idx] as HTMLElement;
        // Build a selector for this specific element
        let targetSel = '';
        if (targetEl.id && !/^[a-z]{1,2}-[0-9a-f]{4,}/i.test(targetEl.id)) {
          targetSel = '#' + targetEl.id;
        } else if (targetEl.getAttribute('data-testid')) {
          targetSel = `[data-testid="${targetEl.getAttribute('data-testid')}"]`;
        } else {
          // Use text= selector with the element's own text
          const elText = (targetEl.textContent?.trim() || '').substring(0, 60);
          targetSel = elText ? `text=${elText}` : targetEl.tagName.toLowerCase();
        }
        steps.push({ op: 'click-selector', selector: targetSel, status: 'pending' });
      } else {
        steps.push({ op: 'click-selector', selector: `text=${nounDesc}`, status: 'pending',
          error: `Only found ${matchingEls.length} ${nounDesc} elements, wanted index ${idx}` } as ActStep);
      }
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
      // Handle special key sequences: \t → Tab, \n → Enter
      // Split text on these and send key events between segments
      const hasSpecialKeys = step.text.includes('\t') || step.text.includes('\n');
      let typed = false;
      if (hasSpecialKeys) {
        // Build a CDP step sequence: insertText for text segments, keyDown/keyUp for Tab/Enter
        const cdpSteps: Array<{ action: string; text?: string; key?: string }> = [];
        const chars = [...step.text];
        let buf = '';
        for (const ch of chars) {
          if (ch === '\t' || ch === '\n') {
            if (buf) { cdpSteps.push({ action: 'insertText', text: buf }); buf = ''; }
            const key = ch === '\t' ? 'Tab' : 'Enter';
            cdpSteps.push({ action: 'keyDown', key });
            cdpSteps.push({ action: 'keyUp', key });
          } else {
            buf += ch;
          }
        }
        if (buf) cdpSteps.push({ action: 'insertText', text: buf });
        typed = await cdpKeys(cdpSteps);
      } else {
        // Try CDP insertText first (needed for canvas/Sheets apps)
        typed = await cdpKeys([
          { action: 'insertText', text: step.text },
        ]);
        if (!typed) {
          await sleep(300);
          typed = await cdpKeys([
            { action: 'insertText', text: step.text },
          ]);
        }
      }
      // Fallback to handleType for regular pages where CDP isn't available
      if (!typed) {
        let activeEl = document.activeElement;

        // Helper: find a visible editable element (input/textarea/contenteditable)
        const findEditableInput = (): HTMLElement | null => {
          // 1. Check inside the currently focused element (e.g. YouTube search wrapper)
          if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
            const child = (activeEl as HTMLElement).querySelector?.(
              'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]'
            );
            if (child) return child as HTMLElement;
            // Also check shadow DOM of the focused element
            if ((activeEl as any).shadowRoot) {
              const shadowChild = (activeEl as any).shadowRoot.querySelector(
                'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]'
              );
              if (shadowChild) return shadowChild as HTMLElement;
            }
          }
          // 2. Search the whole page including shadow DOM
          const candidates = Array.from(document.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"]'
          ));
          const shadowCandidates = deepQuerySelectorAll(document, 'input:not([type="hidden"]):not([disabled])');
          const allCandidates = [...candidates, ...shadowCandidates];
          return (allCandidates.find(el => {
            const rect = (el as HTMLElement).getBoundingClientRect?.();
            return rect && rect.width > 0 && rect.height > 0;
          }) as HTMLElement) || null;
        };

        // If nothing focused or focused element is not editable, find an editable input
        if (!activeEl || activeEl === document.body || activeEl === document.documentElement) {
          const editable = findEditableInput();
          if (editable) {
            editable.focus();
            editable.click();
            await sleep(100);
            activeEl = document.activeElement;
          }
        }

        // Try typing into the active element
        let typeRes = await handleType('', step.text);
        if (!typeRes.success && typeRes.error?.includes('not editable')) {
          // Active element isn't editable — find an editable child/nearby input
          const editable = findEditableInput();
          if (editable) {
            editable.focus();
            editable.click();
            await sleep(100);
            typeRes = await handleType('', step.text);
          }
        }

        if (typeRes.success) {
          step.status = 'done';
        } else if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
          step.status = 'failed';
          step.error = typeRes.error || 'Type fallback failed';
        } else {
          step.status = 'failed';
          step.error = 'CDP type failed and no focused element for fallback';
        }
      } else {
        step.status = 'done';
      }
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
    case 'scroll': {
      const dir = step.text || 'down';
      let scrollRes: BridgeResponse;
      if (dir === 'top' || dir === 'bottom') {
        scrollRes = await handleScroll({ to: dir as 'top' | 'bottom' });
      } else {
        scrollRes = await handleScroll({ direction: dir as 'up' | 'down' | 'left' | 'right' });
      }
      step.status = scrollRes.success ? 'done' : 'failed';
      if (!scrollRes.success) step.error = scrollRes.error;
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
        // Don't return early — fall through to sequential execution
        // so remaining steps (e.g., "then press Tab then type Y") also run
      }
      // Fall through to sequential execution for remaining steps
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
// Discover — DOM Snapshot for gateway-side classification
// ============================================================================

function collectDomSnapshot(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    url: location.href,
    title: document.title,
  };

  // Meta tags (OG, description, etc.)
  const meta: Record<string, string> = {};
  document.querySelectorAll('meta[property], meta[name]').forEach((el) => {
    const key = el.getAttribute('property') || el.getAttribute('name') || '';
    const val = el.getAttribute('content') || '';
    if (key && val) meta[key] = val;
  });
  snapshot.meta = meta;

  // JSON-LD structured data
  const jsonLd: Record<string, unknown>[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      const parsed = JSON.parse(el.textContent || '');
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else jsonLd.push(parsed);
    } catch { /* skip malformed JSON-LD */ }
  });
  snapshot.jsonLd = jsonLd;

  // Sample interactive + structural elements (max 200)
  const elements: Array<Record<string, unknown>> = [];
  const selectors = 'h1, h2, h3, a, button, input, textarea, select, img, article, [role], [itemprop], [aria-label], [data-testid]';
  const els = document.querySelectorAll(selectors);
  for (let i = 0; i < Math.min(els.length, 200); i++) {
    const el = els[i];
    const entry: Record<string, unknown> = {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 100),
    };
    if (el.id) entry.id = el.id;
    const classList = Array.from(el.classList);
    if (classList.length) entry.classes = classList;
    if (el.getAttribute('aria-label')) entry.ariaLabel = el.getAttribute('aria-label');
    // Build a simple CSS selector
    if (el.id) {
      entry.selector = `#${el.id}`;
    } else if (el.getAttribute('data-testid')) {
      entry.selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
    } else if (el.getAttribute('aria-label')) {
      entry.selector = `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`;
    } else if (classList.length) {
      entry.selector = `${el.tagName.toLowerCase()}.${classList[0]}`;
    }
    // Collect relevant attributes
    const attrs: Record<string, string> = {};
    for (const attr of ['type', 'name', 'href', 'src', 'role', 'itemprop', 'contenteditable']) {
      const v = el.getAttribute(attr);
      if (v) attrs[attr] = v;
    }
    if (Object.keys(attrs).length) entry.attributes = attrs;
    elements.push(entry);
  }
  snapshot.elements = elements;

  // Detect tables
  const tables: Array<Record<string, unknown>> = [];
  document.querySelectorAll('table').forEach((table, idx) => {
    const headers = Array.from(table.querySelectorAll('th')).map((th) => (th.textContent || '').trim());
    const rowCount = table.querySelectorAll('tr').length;
    if (rowCount > 1) {
      tables.push({
        selector: table.id ? `#${table.id}` : `table:nth-of-type(${idx + 1})`,
        headers,
        rowCount,
      });
    }
  });
  snapshot.tables = tables;

  // Detect forms
  const forms: Array<Record<string, unknown>> = [];
  document.querySelectorAll('form').forEach((form, idx) => {
    const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map((inp) => {
      const label = inp.getAttribute('aria-label') || inp.getAttribute('placeholder') || '';
      return {
        name: inp.getAttribute('name') || '',
        type: inp.getAttribute('type') || inp.tagName.toLowerCase(),
        selector: inp.id ? `#${inp.id}` : `form:nth-of-type(${idx + 1}) ${inp.tagName.toLowerCase()}[name="${inp.getAttribute('name')}"]`,
        label,
      };
    });
    forms.push({
      selector: form.id ? `#${form.id}` : `form:nth-of-type(${idx + 1})`,
      action: form.getAttribute('action') || '',
      method: form.getAttribute('method') || 'GET',
      inputs,
    });
  });
  snapshot.forms = forms;

  // Detect repeated groups (lists of similar items)
  const repeatedGroups: Array<Record<string, unknown>> = [];
  const listContainers = document.querySelectorAll('ul, ol, [role="list"], [role="feed"]');
  listContainers.forEach((container) => {
    const items = container.children;
    if (items.length >= 3) {
      const containerSel = container.id ? `#${container.id}` : smartSelector(container);
      const itemTag = items[0]?.tagName?.toLowerCase() || 'li';
      repeatedGroups.push({
        containerSelector: containerSel,
        itemSelector: `${containerSel} > ${itemTag}`,
        count: items.length,
      });
    }
  });
  snapshot.repeatedGroups = repeatedGroups;

  return snapshot;
}

// ============================================================================
// Part B: Workflow Recorder
// ============================================================================

let recordingEnabled = false;
const recordedActions: RecordedAction[] = [];
let typeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTypeSelector = '';

// Load recording state on content script init (persists across navigations)
(async () => {
  try {
    const state = await chrome.storage.local.get(['recordingEnabled', 'recordedActions']);
    if (state.recordingEnabled) {
      recordingEnabled = true;
      if (Array.isArray(state.recordedActions)) {
        recordedActions.push(...state.recordedActions);
      }
      console.log('[Recorder] Resumed recording from storage —', recordedActions.length, 'steps so far');
    }
  } catch {
    // ignore — storage may not be available
  }
})();

async function getRecordedActions(): Promise<RecordedAction[]> {
  const result = await chrome.storage.local.get('recordedActions');
  return result.recordedActions || [];
}

async function saveRecordedActions(actions: RecordedAction[]) {
  await chrome.storage.local.set({ recordedActions: actions });
}

async function clearRecordedActions() {
  await chrome.storage.local.set({ recordedActions: [], recordingEnabled: false });
}

function startRecording() {
  recordedActions.length = 0;
  recordingEnabled = true;
  chrome.storage.local.set({ recordingEnabled: true, recordedActions: [] }).catch(() => {});
  console.log('[Recorder] Recording started');
}

function stopRecording() {
  recordingEnabled = false;
  chrome.storage.local.set({ recordingEnabled: false }).catch(() => {});
  console.log('[Recorder] Recording stopped —', recordedActions.length, 'steps');
}

function exportRecording(name: string): WorkflowExport {
  // Deduplicate: when an API-driven act/click executes, the DOM event listener
  // also captures the resulting clicks. Remove DOM-captured clicks that fall
  // within 2s of an API-driven action on the same page.
  const deduped: RecordedAction[] = [];
  for (let i = 0; i < recordedActions.length; i++) {
    const a = recordedActions[i];
    // Keep API-driven actions (act, extract, navigate, etc.) always
    if (a.type === 'act' || a.type === 'extract' || a.type === 'navigate') {
      deduped.push(a);
      continue;
    }
    // For DOM-captured clicks, check if an API-driven action exists nearby
    if (a.type === 'click') {
      const hasNearbyApiAction = recordedActions.some((other) =>
        (other.type === 'act' || other.type === 'navigate') &&
        Math.abs(other.timestamp - a.timestamp) < 2000
      );
      if (hasNearbyApiAction) continue; // skip this duplicate click
    }
    deduped.push(a);
  }

  const steps: WorkflowStep[] = deduped.map((a) => {
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
