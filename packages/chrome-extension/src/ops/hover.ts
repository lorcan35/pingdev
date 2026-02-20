// hover — Trigger Hover States
import type { BridgeResponse } from '../types';
import { findElement, isVisible, sleep } from './helpers';

interface HoverCommand {
  selector: string;
  duration_ms?: number;
}

export async function handleHover(command: HoverCommand): Promise<BridgeResponse> {
  const { selector, duration_ms = 500 } = command;
  if (!selector) return { success: false, error: 'Missing selector' };

  const el = findElement(selector);
  if (!el) return { success: false, error: `Element not found: ${selector}` };

  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Dispatch mouseenter + mouseover
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: x, clientY: y }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));

  // Hold for duration
  await sleep(duration_ms);

  // Capture any new content that appeared (tooltips, menus, previews)
  const newContent = captureNewContent(el);

  return {
    success: true,
    data: {
      hovered: true,
      selector,
      duration_ms,
      ...(newContent ? { newContent } : {}),
    },
  };
}

function captureNewContent(hoverTarget: Element): Record<string, string> | null {
  // Look for tooltips
  const tooltipSelectors = [
    '[role="tooltip"]', '[class*="tooltip"]', '[class*="popover"]',
    '[class*="preview"]', '[data-tippy-root]',
  ];

  for (const sel of tooltipSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) {
        return { type: 'tooltip', text: el.textContent?.trim() || '' };
      }
    }
  }

  // Look for dropdown menus that appeared
  const menuSelectors = [
    '[role="menu"]', '[class*="dropdown-menu"]', '[class*="submenu"]',
  ];
  for (const sel of menuSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      if (isVisible(el)) {
        const items = Array.from(el.querySelectorAll('[role="menuitem"], li, a'))
          .map(item => item.textContent?.trim() || '')
          .filter(Boolean);
        return { type: 'menu', items: items.join(', ') };
      }
    }
  }

  return null;
}
