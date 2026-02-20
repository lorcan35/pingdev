// Shared helpers for ops handlers
// Re-exports findElement and sleep so ops can import from here

import type { BridgeResponse } from '../types';

export type { BridgeResponse };

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findElement(selector: string): Element | null {
  if (!selector || typeof selector !== 'string') return null;

  // text= prefix: search interactive elements by text content
  if (selector.startsWith('text=')) {
    const text = selector.slice(5);
    const lowerText = text.toLowerCase();
    const interactive = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [onclick], input, select, textarea, [contenteditable], label, summary, details, [tabindex]'
    );
    for (const el of Array.from(interactive)) {
      const elText = el.textContent?.trim() || '';
      if (elText.toLowerCase() === lowerText) return el;
    }
    for (const el of Array.from(interactive)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const elText = el.textContent?.trim() || '';
      if (elText.toLowerCase().includes(lowerText) && elText.length < lowerText.length * 3) return el;
    }
    for (const el of Array.from(interactive)) {
      const label = el.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes(lowerText)) return el;
    }
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
    return null;
  }

  // Default: CSS selector
  try {
    return document.querySelector(selector);
  } catch { return null; }
}

/** Check if an element is visible (has dimensions and not display:none/visibility:hidden) */
export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/** Find elements matching a selector that are visible */
export function findVisibleElements(selector: string): Element[] {
  const els = document.querySelectorAll(selector);
  return Array.from(els).filter(isVisible);
}

/** Dispatch native-like input events on an element */
export function dispatchInputEvents(el: Element, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    nativeInputValueSetter.call(el, value);
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
