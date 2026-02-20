// navigate — Intelligent Navigation
import type { BridgeResponse } from '../types';
import { findElement, isVisible, sleep } from './helpers';

interface NavigateCommand {
  to: string;
}

interface NavStep {
  clicked: string;
  url: string;
}

export async function handleSmartNavigate(command: NavigateCommand): Promise<BridgeResponse> {
  const { to } = command;
  if (!to) return { success: false, error: 'Missing "to" parameter' };

  // Direct URL navigation
  if (to.startsWith('http://') || to.startsWith('https://') || to.startsWith('/')) {
    const url = to.startsWith('/') ? window.location.origin + to : to;
    window.location.href = url;
    return {
      success: true,
      data: { navigated: true, url, steps: [{ clicked: 'direct', url }] },
    };
  }

  // Keyword-based navigation: find link/button matching the keyword
  const steps: NavStep[] = [];
  const link = findNavLink(to);

  if (link) {
    const href = link.getAttribute('href') || '';
    (link as HTMLElement).click();
    await sleep(500);
    steps.push({ clicked: link.textContent?.trim() || to, url: href || window.location.href });
    return {
      success: true,
      data: { navigated: true, url: window.location.href, steps },
    };
  }

  // Try multi-step: look in menus/navs first
  const menuLink = await tryMenuNavigation(to);
  if (menuLink) {
    return {
      success: true,
      data: { navigated: true, url: window.location.href, steps: menuLink },
    };
  }

  return {
    success: false,
    error: `Could not find navigation to "${to}"`,
  };
}

function findNavLink(keyword: string): Element | null {
  const lower = keyword.toLowerCase();

  // Search in nav elements first
  const navs = document.querySelectorAll('nav, [role="navigation"], header');
  for (const nav of Array.from(navs)) {
    const links = nav.querySelectorAll('a, button, [role="link"], [role="button"]');
    for (const link of Array.from(links)) {
      if (!isVisible(link)) continue;
      const text = link.textContent?.trim().toLowerCase() || '';
      const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
      const href = (link.getAttribute('href') || '').toLowerCase();
      if (text === lower || ariaLabel === lower || text.includes(lower) || href.includes(lower)) {
        return link;
      }
    }
  }

  // Search breadcrumbs
  const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, [aria-label*="breadcrumb"] a');
  for (const bc of Array.from(breadcrumbs)) {
    if (bc.textContent?.trim().toLowerCase().includes(lower)) return bc;
  }

  // Search all links/buttons on page
  const allLinks = document.querySelectorAll('a, button, [role="link"]');
  let bestMatch: Element | null = null;
  let bestLen = Infinity;
  for (const link of Array.from(allLinks)) {
    if (!isVisible(link)) continue;
    const text = link.textContent?.trim().toLowerCase() || '';
    const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
    if ((text === lower || ariaLabel === lower) && text.length < bestLen) {
      bestMatch = link;
      bestLen = text.length;
    }
  }
  if (bestMatch) return bestMatch;

  // Partial match
  for (const link of Array.from(allLinks)) {
    if (!isVisible(link)) continue;
    const text = link.textContent?.trim().toLowerCase() || '';
    if (text.includes(lower) && text.length < lower.length * 4) return link;
  }

  return null;
}

async function tryMenuNavigation(keyword: string): Promise<NavStep[] | null> {
  const lower = keyword.toLowerCase();

  // Look for menu items that might contain submenus
  const menuTriggers = document.querySelectorAll(
    '[aria-haspopup="true"], [class*="dropdown-toggle"], [class*="menu-trigger"]'
  );

  for (const trigger of Array.from(menuTriggers)) {
    if (!isVisible(trigger)) continue;
    const triggerText = trigger.textContent?.trim() || '';

    // Check if trigger text is related to the keyword (settings -> profile, account -> settings, etc.)
    const relatedKeywords: Record<string, string[]> = {
      settings: ['account', 'profile', 'preferences', 'config'],
      profile: ['account', 'settings', 'user', 'my'],
      account: ['settings', 'profile', 'user', 'billing'],
      checkout: ['cart', 'bag', 'basket', 'order'],
    };

    const related = relatedKeywords[lower] || [];
    const isRelated = triggerText.toLowerCase().includes(lower) ||
      related.some(r => triggerText.toLowerCase().includes(r));

    if (!isRelated) continue;

    // Open the menu
    (trigger as HTMLElement).click();
    await sleep(300);

    // Find the target inside the opened menu
    const link = findNavLink(keyword);
    if (link) {
      const href = link.getAttribute('href') || '';
      (link as HTMLElement).click();
      await sleep(500);
      return [
        { clicked: triggerText, url: window.location.href },
        { clicked: link.textContent?.trim() || keyword, url: href || window.location.href },
      ];
    }

    // Close the menu if we didn't find anything
    document.body.click();
    await sleep(200);
  }

  return null;
}
