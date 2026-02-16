// Content script - Bridge executor + interaction recorder

import type { BridgeCommand, BridgeResponse, RecordedAction } from './types';
import { humanClick, humanType, withJitter } from './stealth';
import { fullCleanup, injectAdBlockCSS, removeAdElements, detectClutter } from './adblock';

// ============================================================================
// Part A: Bridge Executor
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    return true; // Keep channel open for async response
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
        response = await handleClick(command.selector, command.stealth);
        break;
      case 'type':
        response = await handleType(command.selector, command.text, command.stealth);
        break;
      case 'read':
        response = await handleRead(command.selector);
        break;
      case 'extract':
        response = await handleExtract(command.schema);
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
  // text= prefix: search interactive elements by text content
  if (selector.startsWith('text=')) {
    const text = selector.slice(5);
    // Search broadly: interactive elements first, then all elements
    const interactive = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [onclick], input, select, textarea, [contenteditable], label, summary, details, [tabindex]'
    );
    for (const el of Array.from(interactive)) {
      if (el.textContent?.trim().includes(text)) return el;
    }
    // Fallback: any element containing the text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (el.textContent?.trim().includes(text) && el.children.length === 0) return el;
    }
    return null;
  }

  // role= prefix: find by ARIA role
  if (selector.startsWith('role=')) {
    const parts = selector.slice(5);
    const [role, ...rest] = parts.split(':');
    const filter = rest.join(':');
    const candidates = document.querySelectorAll(`[role="${role}"]`);

    // nth= modifier
    if (filter.startsWith('nth=')) {
      const n = parseInt(filter.slice(4), 10);
      return candidates[n - 1] ?? null;
    }

    if (!filter) return candidates[0] ?? null;
    for (const el of Array.from(candidates)) {
      const label = el.getAttribute('aria-label') || el.textContent?.trim() || '';
      if (label.includes(filter)) return el;
    }
    return null;
  }

  // aria= prefix: find by aria-label
  if (selector.startsWith('aria=')) {
    const label = selector.slice(5);
    return document.querySelector(`[aria-label="${label}"]`) ??
      document.querySelector(`[aria-label*="${label}"]`) ??
      null;
  }

  // cell= prefix: find spreadsheet/table cell by coordinates (e.g. cell=A1 or cell=R1C1)
  if (selector.startsWith('cell=')) {
    const ref = selector.slice(5).toUpperCase();
    // Try aria-label match first (Google Sheets uses this)
    const byLabel = document.querySelector(`[aria-label*="${ref}"]`);
    if (byLabel) return byLabel;
    // Try data-cell attribute
    const byData = document.querySelector(`[data-cell="${ref}"]`);
    if (byData) return byData;
    // Try td with matching id
    const byId = document.querySelector(`td[id*="${ref}"], th[id*="${ref}"]`);
    if (byId) return byId;
    return null;
  }

  // Default: CSS selector
  return document.querySelector(selector);
}

async function handleClick(selector: string, stealth?: boolean): Promise<BridgeResponse> {
  const element = findElement(selector);
  if (!element) return { success: false, error: `Element not found: ${selector}` };

  try {
    (element as HTMLElement | undefined)?.scrollIntoView?.({ block: 'center', inline: 'center' });
  } catch {
    // ignore
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
  const element = findElement(selector);
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
  if (selector.startsWith('text=')) {
    const el = findElement(selector);
    if (!el) return { success: false, error: `Element not found: ${selector}` };
    return { success: true, data: readText(el) };
  }

  const nodes = Array.from(document.querySelectorAll(selector));
  if (nodes.length === 0) return { success: false, error: `Element not found: ${selector}` };

  const texts = nodes.map((el) => readText(el));
  if (texts.length === 1) return { success: true, data: texts[0] };
  return { success: true, data: texts };
}

async function handleExtract(schema: Record<string, string>): Promise<BridgeResponse> {
  const result: Record<string, string> = {};

  const entries =
    schema && typeof schema === 'object'
      ? Object.entries(schema as Record<string, string>)
      : ([] as Array<[string, string]>);

  for (const [key, selector] of entries) {
    if (!selector) {
      result[key] = '';
      continue;
    }
    const element = document.querySelector(selector);
    result[key] = element ? readText(element) : '';
  }
  
  return { success: true, data: result };
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

      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        (el.textContent?.trim() || '').substring(0, 50);
      if (!label) return;

      // Build stable selector
      let bestSel = '';
      if (el.id && !/^[a-z]{1,2}-[0-9a-f]{4,}/i.test(el.id)) bestSel = '#' + el.id;
      else if (el.getAttribute('data-testid')) bestSel = `[data-testid="${el.getAttribute('data-testid')}"]`;
      else if (el.getAttribute('aria-label')) bestSel = `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`;
      else if (el.getAttribute('name')) bestSel = `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
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

  // Canvas app detection
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const vpArea = window.innerWidth * window.innerHeight;
  const bigCanvas = canvases.find((c) => {
    const r = c.getBoundingClientRect();
    return (r.width * r.height) / vpArea > 0.5;
  });
  recon.canvasApp = !!bigCanvas;

  if (recon.canvasApp) {
    recon.accessibilityOverlay = {
      grids: document.querySelectorAll('[role="grid"]').length,
      gridcells: document.querySelectorAll('[role="gridcell"]').length,
      rows: document.querySelectorAll('[role="row"]').length,
      columnHeaders: document.querySelectorAll('[role="columnheader"]').length,
    };
    // Grid dimensions
    const grid = document.querySelector('[role="grid"]');
    if (grid) {
      recon.gridDimensions = {
        rows: grid.querySelectorAll('[role="row"]').length,
        cols: grid.querySelectorAll('[role="row"]:first-of-type [role="gridcell"], [role="columnheader"]').length,
      };
    }
  }

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
      selector: el.id ? `#${el.id}` : `[role="menuitem"][aria-label="${el.getAttribute('aria-label') || ''}"]`,
    }));

  return { success: true, data: recon };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Contenteditable path (ProseMirror/CodeMirror/etc)
  el.focus();

  // Select all contents then insert text to mimic replacement.
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  // Try execCommand first (widely supported in editors).
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }

  if (!ok) {
    // Fallback: set textContent and dispatch input.
    el.textContent = text;
  }

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
  if (selector) {
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
  const element = findElement(selector);
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
    range.setStart(startEl.firstChild || startEl, startOffset ?? 0);
    range.setEnd(endEl.firstChild || endEl, endOffset ?? (endEl.textContent?.length ?? 0));

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
// Part B: Passive Recorder
// ============================================================================

let recordingEnabled = false;
const recordedActions: RecordedAction[] = [];

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

function generateSelector(element: Element): string {
  // Priority: id > name > unique class > tag with index
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element instanceof HTMLInputElement && element.name) {
    return `input[name="${element.name}"]`;
  }
  
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      const selector = `.${classes.join('.')}`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }
  
  // Fallback: tag with nth-of-type
  const tag = element.tagName.toLowerCase();
  const siblings = Array.from(element.parentElement?.children || []);
  const sameTagSiblings = siblings.filter(s => s.tagName === element.tagName);
  const index = sameTagSiblings.indexOf(element) + 1;
  
  return `${tag}:nth-of-type(${index})`;
}

// Record click events
document.addEventListener('click', (event) => {
  if (!recordingEnabled) return;
  
  const target = event.target;
  if (!(target instanceof Element)) return;
  
  const selector = generateSelector(target);
  const action: RecordedAction = {
    type: 'click',
    selector,
    timestamp: Date.now(),
  };
  
  recordedActions.push(action);
  saveRecordedActions(recordedActions);
  console.log('[Recorder] Click:', selector);
}, true);

// Record input events
document.addEventListener('input', (event) => {
  if (!recordingEnabled) return;
  
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  
  const selector = generateSelector(target);
  const action: RecordedAction = {
    type: 'type',
    selector,
    text: target.value,
    timestamp: Date.now(),
  };
  
  recordedActions.push(action);
  saveRecordedActions(recordedActions);
  console.log('[Recorder] Type:', selector, target.value);
}, true);

// Enable recording by default
recordingEnabled = true;
console.log('[Content] Bridge executor and recorder loaded');
