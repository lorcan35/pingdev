// paginate — Auto-Pagination
import type { BridgeResponse } from '../types';
import { findElement, isVisible, sleep } from './helpers';

type PaginateAction = 'detect' | 'next' | 'prev' | 'goto';
type PaginationType = 'links' | 'buttons' | 'infinite_scroll' | 'load_more';

interface PaginateCommand {
  action: PaginateAction;
  page?: number;
}

interface PaginationInfo {
  currentPage?: number;
  totalPages?: number;
  hasNext: boolean;
  hasPrev: boolean;
  paginationType: PaginationType;
  nextUrl?: string;  // href of next link, if available
}

export async function handlePaginate(command: PaginateCommand): Promise<BridgeResponse> {
  const action = command.action || 'detect';

  switch (action) {
    case 'detect':
      return detectPagination();
    case 'next':
      return goNext();
    case 'prev':
      return goPrev();
    case 'goto':
      if (command.page == null) return { success: false, error: 'page required for goto action' };
      return goToPage(command.page);
    default:
      return { success: false, error: `Unknown paginate action: ${action}` };
  }
}

function detectPagination(): BridgeResponse {
  const info = findPaginationInfo();
  if (!info) {
    return { success: true, data: { found: false, message: 'No pagination detected' } };
  }
  return { success: true, data: { found: true, ...info } };
}

async function goNext(): Promise<BridgeResponse> {
  const nextBtn = findNextButton();
  if (!nextBtn) {
    // Try infinite scroll
    const isInfinite = detectInfiniteScroll();
    if (isInfinite) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(1500);
      const info = findPaginationInfo();
      return { success: true, data: { action: 'next', scrolled: true, ...info } };
    }

    // Try load more
    const loadMore = findLoadMoreButton();
    if (loadMore) {
      (loadMore as HTMLElement).click();
      await sleep(1500);
      const info = findPaginationInfo();
      return { success: true, data: { action: 'next', clicked: 'load_more', ...info } };
    }

    return { success: false, error: 'No next page control found' };
  }

  (nextBtn as HTMLElement).click();
  await sleep(1000);
  const info = findPaginationInfo();
  return { success: true, data: { action: 'next', ...info } };
}

async function goPrev(): Promise<BridgeResponse> {
  const prevBtn = findPrevButton();
  if (!prevBtn) return { success: false, error: 'No previous page control found' };

  (prevBtn as HTMLElement).click();
  await sleep(1000);
  const info = findPaginationInfo();
  return { success: true, data: { action: 'prev', ...info } };
}

async function goToPage(page: number): Promise<BridgeResponse> {
  // Find page number link/button
  const paginationContainer = findPaginationContainer();
  if (!paginationContainer) return { success: false, error: 'No pagination found' };

  const links = paginationContainer.querySelectorAll('a, button');
  for (const link of Array.from(links)) {
    const text = link.textContent?.trim() || '';
    if (text === String(page)) {
      (link as HTMLElement).click();
      await sleep(1000);
      const info = findPaginationInfo();
      return { success: true, data: { action: 'goto', page, ...info } };
    }
  }

  return { success: false, error: `Page ${page} link not found` };
}

function findPaginationInfo(): PaginationInfo | null {
  // Try standard pagination containers
  const container = findPaginationContainer();
  if (!container) {
    if (detectInfiniteScroll()) {
      return {
        hasNext: true,
        hasPrev: false,
        paginationType: 'infinite_scroll',
      };
    }
    const loadMore = findLoadMoreButton();
    if (loadMore) {
      return {
        hasNext: true,
        hasPrev: false,
        paginationType: 'load_more',
      };
    }
    // Fallback: standalone next/more links (e.g., HN's "More" link)
    const standalone = findStandaloneNextLink();
    if (standalone) {
      let nextUrl: string | undefined;
      if (standalone.tagName === 'A') {
        const href = (standalone as HTMLAnchorElement).href;
        if (href && !href.startsWith('javascript:')) nextUrl = href;
      }
      return {
        hasNext: true,
        hasPrev: false,
        paginationType: 'links',
        nextUrl,
      };
    }
    return null;
  }

  const nextBtn = findNextButton();
  const prevBtn = findPrevButton();
  const hasNext = nextBtn != null && !(nextBtn as HTMLButtonElement).disabled;
  const hasPrev = prevBtn != null && !(prevBtn as HTMLButtonElement).disabled;

  // Try to extract page numbers
  const pageInfo = extractPageNumbers(container);
  const isLinks = container.querySelectorAll('a').length > 0;

  // Extract next URL from link href if available
  let nextUrl: string | undefined;
  if (nextBtn && nextBtn.tagName === 'A') {
    const href = (nextBtn as HTMLAnchorElement).href;
    if (href && !href.startsWith('javascript:')) nextUrl = href;
  }

  return {
    currentPage: pageInfo.current,
    totalPages: pageInfo.total,
    hasNext,
    hasPrev,
    paginationType: isLinks ? 'links' : 'buttons',
    nextUrl,
  };
}

function findPaginationContainer(): Element | null {
  const selectors = [
    'nav[aria-label*="page" i]', 'nav[aria-label*="pagination" i]',
    '[class*="pagination"]', '[class*="pager"]',
    '[role="navigation"][aria-label*="page" i]',
    'ul.pagination', '.paging',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
  return null;
}

/**
 * Fallback: find standalone next/more links anywhere on the page.
 * Catches simple pagination like HN's "More" link.
 */
function findStandaloneNextLink(): Element | null {
  const allLinks = document.querySelectorAll('a, button, [role="button"]');
  for (const el of Array.from(allLinks)) {
    if (!isVisible(el)) continue;
    const text = (el.textContent?.trim() || '').toLowerCase();
    const href = (el.getAttribute('href') || '').toLowerCase();
    // Match text patterns: "more", "next", "older", "newer", "next page", "show more"
    if (/^(more|next|older|newer|next\s*page|show\s*more|load\s*more)$/i.test(text)) return el;
    // Match href patterns: ?p=2, page=2, /page/2, ?start=, &after=
    if (/[?&](p|page|start|after|offset)=/.test(href) || /\/page\/\d+/.test(href)) return el;
  }
  return null;
}

function findNextButton(): Element | null {
  // By rel attribute
  const byRel = document.querySelector('[rel="next"]');
  if (byRel && isVisible(byRel)) return byRel;

  // By aria-label
  const byAria = document.querySelector('[aria-label*="next" i], [aria-label*="Next"]');
  if (byAria && isVisible(byAria)) return byAria;

  // By text content within pagination container
  const container = findPaginationContainer();
  if (container) {
    const elements = container.querySelectorAll('a, button');
    for (const el of Array.from(elements)) {
      const text = el.textContent?.trim() || '';
      if (/^(next|›|»|>|→)$/i.test(text)) return el;
    }
  }

  // Fallback: standalone next/more links anywhere on the page
  return findStandaloneNextLink();
}

function findPrevButton(): Element | null {
  const byRel = document.querySelector('[rel="prev"]');
  if (byRel && isVisible(byRel)) return byRel;

  const byAria = document.querySelector('[aria-label*="prev" i], [aria-label*="Previous" i]');
  if (byAria && isVisible(byAria)) return byAria;

  const container = findPaginationContainer();
  if (container) {
    const elements = container.querySelectorAll('a, button');
    for (const el of Array.from(elements)) {
      const text = el.textContent?.trim() || '';
      if (/^(prev|previous|‹|«|<|←)$/i.test(text)) return el;
    }
  }

  return null;
}

function findLoadMoreButton(): Element | null {
  const buttons = document.querySelectorAll('button, a, [role="button"]');
  for (const btn of Array.from(buttons)) {
    if (!isVisible(btn)) continue;
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (text.includes('load more') || text.includes('show more') || text.includes('see more')) {
      return btn;
    }
  }
  return null;
}

function detectInfiniteScroll(): boolean {
  // Check for sentinel elements commonly used with intersection observer
  const sentinels = document.querySelectorAll(
    '[class*="sentinel"], [class*="infinite"], [class*="loader"], [class*="spinner"]'
  );
  for (const s of Array.from(sentinels)) {
    const rect = s.getBoundingClientRect();
    if (rect.top > window.innerHeight && rect.top < document.body.scrollHeight) return true;
  }

  // Check if scrollable and more content below
  const scrollable = document.documentElement.scrollHeight > window.innerHeight * 1.5;
  const nearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200;
  return scrollable && !nearBottom;
}

function extractPageNumbers(container: Element): { current?: number; total?: number } {
  const text = container.textContent || '';

  // "Page 1 of 10"
  const pageOfMatch = text.match(/page\s+(\d+)\s+of\s+(\d+)/i);
  if (pageOfMatch) {
    return { current: parseInt(pageOfMatch[1], 10), total: parseInt(pageOfMatch[2], 10) };
  }

  // "1-10 of 100" style
  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/i);
  if (rangeMatch) {
    const perPage = parseInt(rangeMatch[2], 10) - parseInt(rangeMatch[1], 10) + 1;
    const total = parseInt(rangeMatch[3], 10);
    const currentPage = Math.ceil(parseInt(rangeMatch[1], 10) / perPage);
    return { current: currentPage, total: Math.ceil(total / perPage) };
  }

  // Find active/current page number from links
  const active = container.querySelector('.active, [aria-current="page"], [class*="current"]');
  if (active) {
    const num = parseInt(active.textContent?.trim() || '', 10);
    if (!isNaN(num)) {
      // Find max page number
      const links = container.querySelectorAll('a, button');
      let maxPage = num;
      for (const link of Array.from(links)) {
        const linkNum = parseInt(link.textContent?.trim() || '', 10);
        if (!isNaN(linkNum) && linkNum > maxPage) maxPage = linkNum;
      }
      return { current: num, total: maxPage > num ? maxPage : undefined };
    }
  }

  return {};
}
