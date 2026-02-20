// dialog — Dialog/Modal Handler
import type { BridgeResponse } from '../types';
import { isVisible, sleep } from './helpers';

type DialogAction = 'dismiss' | 'accept' | 'detect' | 'interact';

interface DialogCommand {
  action: DialogAction;
  text?: string;
}

interface DetectedDialog {
  type: string;
  selector: string;
  text: string;
}

const DIALOG_SELECTORS = [
  '[role="dialog"]', '[role="alertdialog"]',
  '.modal', '[class*="modal"]',
  'dialog[open]',
];

const COOKIE_SELECTORS = [
  '[class*="cookie"]', '[class*="consent"]', '[id*="cookie"]', '[id*="consent"]',
  '[class*="gdpr"]', '[class*="privacy"]',
];

const PAYWALL_SELECTORS = [
  '[class*="paywall"]', '[class*="subscribe"]',
];

const DISMISS_TEXTS = [
  'reject', 'no thanks', 'close', 'dismiss', 'decline', 'not now',
  'maybe later', 'no, thanks', 'reject all', 'deny',
];

const ACCEPT_TEXTS = [
  'accept', 'ok', 'okay', 'i agree', 'allow', 'got it', 'agree',
  'accept all', 'allow all', 'continue', 'yes',
];

export async function handleDialog(command: DialogCommand): Promise<BridgeResponse> {
  const { action, text } = command;
  if (!action) return { success: false, error: 'Missing action' };

  switch (action) {
    case 'detect':
      return detectDialogs();
    case 'dismiss':
      return dismissDialog();
    case 'accept':
      return acceptDialog();
    case 'interact':
      if (!text) return { success: false, error: 'text required for interact action' };
      return interactDialog(text);
    default:
      return { success: false, error: `Unknown dialog action: ${action}` };
  }
}

function detectDialogs(): BridgeResponse {
  const found: DetectedDialog[] = [];

  // Check standard dialogs
  for (const sel of DIALOG_SELECTORS) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) {
        found.push({
          type: 'dialog',
          selector: describeSelector(el, sel),
          text: truncate(el.textContent?.trim() || '', 200),
        });
      }
    }
  }

  // Check cookie/consent banners
  for (const sel of COOKIE_SELECTORS) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) {
        found.push({
          type: 'cookie_banner',
          selector: describeSelector(el, sel),
          text: truncate(el.textContent?.trim() || '', 200),
        });
      }
    }
  }

  // Check paywalls
  for (const sel of PAYWALL_SELECTORS) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) {
        found.push({
          type: 'paywall',
          selector: describeSelector(el, sel),
          text: truncate(el.textContent?.trim() || '', 200),
        });
      }
    }
  }

  // Check for generic overlays (position:fixed, high z-index, covering viewport)
  const allEls = document.querySelectorAll('*');
  for (const el of Array.from(allEls)) {
    if (!isVisible(el)) continue;
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'absolute') continue;
    const zIndex = parseInt(style.zIndex || '0', 10);
    if (zIndex < 100) continue;
    const rect = el.getBoundingClientRect();
    const viewportCoverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
    if (viewportCoverage > 0.3) {
      // Check it's not already detected
      const alreadyFound = found.some(f => el.matches(f.selector) || el.closest(f.selector));
      if (!alreadyFound) {
        found.push({
          type: 'overlay',
          selector: describeSelector(el, ''),
          text: truncate(el.textContent?.trim() || '', 200),
        });
      }
    }
  }

  return { success: true, data: { found, action_taken: 'detect', success: found.length > 0 } };
}

async function dismissDialog(): Promise<BridgeResponse> {
  const dialog = findActiveDialog();
  if (!dialog) return { success: true, data: { found: [], action_taken: 'dismiss', success: false } };

  // Try dismiss buttons
  const dismissBtn = findButtonByTexts(dialog, DISMISS_TEXTS) || findCloseButton(dialog);
  if (dismissBtn) {
    (dismissBtn as HTMLElement).click();
    await sleep(200);
    return {
      success: true,
      data: {
        found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
        action_taken: 'dismiss',
        success: true,
      },
    };
  }

  // Try clicking overlay backdrop
  const backdrop = findBackdrop();
  if (backdrop) {
    (backdrop as HTMLElement).click();
    await sleep(200);
    return {
      success: true,
      data: {
        found: [{ type: 'dialog', selector: '', text: '' }],
        action_taken: 'dismiss',
        success: true,
      },
    };
  }

  // Try Escape key
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(200);

  return {
    success: true,
    data: {
      found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
      action_taken: 'dismiss',
      success: true,
    },
  };
}

async function acceptDialog(): Promise<BridgeResponse> {
  const dialog = findActiveDialog();
  if (!dialog) return { success: true, data: { found: [], action_taken: 'accept', success: false } };

  const acceptBtn = findButtonByTexts(dialog, ACCEPT_TEXTS);
  if (acceptBtn) {
    (acceptBtn as HTMLElement).click();
    await sleep(200);
    return {
      success: true,
      data: {
        found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
        action_taken: 'accept',
        success: true,
      },
    };
  }

  return {
    success: true,
    data: {
      found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
      action_taken: 'accept',
      success: false,
    },
  };
}

async function interactDialog(text: string): Promise<BridgeResponse> {
  const dialog = findActiveDialog();
  if (!dialog) return { success: true, data: { found: [], action_taken: 'interact', success: false } };

  const lowerText = text.toLowerCase();
  const buttons = dialog.querySelectorAll('button, a, [role="button"], input[type="submit"]');
  for (const btn of Array.from(buttons)) {
    const btnText = btn.textContent?.trim().toLowerCase() || '';
    if (btnText.includes(lowerText)) {
      (btn as HTMLElement).click();
      await sleep(200);
      return {
        success: true,
        data: {
          found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
          action_taken: 'interact',
          success: true,
        },
      };
    }
  }

  return {
    success: true,
    data: {
      found: [{ type: 'dialog', selector: '', text: truncate(dialog.textContent?.trim() || '', 100) }],
      action_taken: 'interact',
      success: false,
    },
  };
}

function findActiveDialog(): Element | null {
  // Check all dialog selectors
  const allSelectors = [...DIALOG_SELECTORS, ...COOKIE_SELECTORS, ...PAYWALL_SELECTORS];
  for (const sel of allSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) return el;
    }
  }

  // Check for fixed overlays
  const allEls = document.querySelectorAll('*');
  for (const el of Array.from(allEls)) {
    if (!isVisible(el)) continue;
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed') continue;
    const zIndex = parseInt(style.zIndex || '0', 10);
    if (zIndex < 100) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 100) return el;
  }

  return null;
}

function findButtonByTexts(container: Element, texts: string[]): Element | null {
  const buttons = container.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]');
  for (const btn of Array.from(buttons)) {
    if (!isVisible(btn)) continue;
    const btnText = (btn.textContent?.trim() || btn.getAttribute('value') || '').toLowerCase();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    for (const text of texts) {
      if (btnText === text || btnText.includes(text) || ariaLabel.includes(text)) return btn;
    }
  }
  return null;
}

function findCloseButton(container: Element): Element | null {
  // Look for X / close buttons
  const closeSelectors = [
    '[aria-label="Close"]', '[aria-label="close"]',
    '[class*="close"]', 'button.close',
    '[data-dismiss="modal"]', '[data-bs-dismiss="modal"]',
  ];
  for (const sel of closeSelectors) {
    const el = container.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
  // Look for button with × or X text
  const buttons = container.querySelectorAll('button, [role="button"]');
  for (const btn of Array.from(buttons)) {
    const text = btn.textContent?.trim() || '';
    if (text === '×' || text === 'X' || text === '✕' || text === '✖') return btn;
  }
  return null;
}

function findBackdrop(): Element | null {
  const selectors = [
    '[class*="backdrop"]', '[class*="overlay"]',
    '.modal-backdrop', '[class*="mask"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
  return null;
}

function describeSelector(el: Element, fallback: string): string {
  if (el.id) return `#${el.id}`;
  const role = el.getAttribute('role');
  if (role) return `[role="${role}"]`;
  return fallback || el.tagName.toLowerCase();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
