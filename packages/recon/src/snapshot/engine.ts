/**
 * SnapshotEngine — orchestrates a full site snapshot.
 */
import { BrowserAdapter } from '@pingdev/core';
import type { SiteSnapshot } from '../types.js';
import { discoverElements } from './elements.js';
import { discoverRegions } from './regions.js';
import { detectDynamicAreas } from './dynamic.js';
import { captureAriaTree } from './aria.js';
import { captureScreenshots } from './screenshots.js';

export interface SnapshotOptions {
  /** CDP URL override. */
  cdpUrl?: string;
  /** Whether to capture screenshots. Default: true. */
  screenshots?: boolean;
  /** Timeout for page load in ms. Default: 30000. */
  timeoutMs?: number;
  /** Whether to capture ARIA tree. Default: true. */
  captureAriaTree?: boolean;
}

export class SnapshotEngine {
  private browser: BrowserAdapter | null = null;
  private options: Required<SnapshotOptions>;

  constructor(options?: SnapshotOptions) {
    this.options = {
      cdpUrl: options?.cdpUrl ?? 'http://127.0.0.1:9222',
      screenshots: options?.screenshots ?? true,
      timeoutMs: options?.timeoutMs ?? 30_000,
      captureAriaTree: options?.captureAriaTree ?? true,
    };
  }

  /** Take a full snapshot of a URL. */
  async snapshot(url: string): Promise<SiteSnapshot> {
    // Connect or reuse existing connection
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = new BrowserAdapter({ cdpUrl: this.options.cdpUrl });
      await this.browser.connect();
    }

    const page = this.browser.page!;

    // Navigate
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.options.timeoutMs,
    });

    // 1. Discover elements
    const elements = await discoverElements(page);

    // 2. Discover regions and assign elements
    const regions = await discoverRegions(page, elements);

    // 3. Detect dynamic areas
    const dynamicAreas = await detectDynamicAreas(page);

    // 4. Capture ARIA tree
    const ariaTree = this.options.captureAriaTree
      ? await captureAriaTree(page)
      : [];

    // 5. Capture screenshots
    const screenshots = this.options.screenshots
      ? await captureScreenshots(page, regions)
      : [];

    // 6. Extract visible text
    const visibleText: string[] = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node: Node) => {
            const el = node.parentElement;
            if (!el) return NodeFilter.FILTER_REJECT;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
            const text = (node.textContent ?? '').trim();
            return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        },
      );
      const texts: string[] = [];
      while (walker.nextNode()) {
        const text = (walker.currentNode.textContent ?? '').trim();
        if (text) texts.push(text);
      }
      return texts;
    });

    // 7. Extract links
    const links = await page.evaluate(() => {
      const origin = window.location.origin;
      return Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: (a.textContent ?? '').trim(),
        href: (a as HTMLAnchorElement).href,
        isInternal: (a as HTMLAnchorElement).href.startsWith(origin),
      }));
    });

    // 8. Extract meta
    const meta = await page.evaluate(() => {
      const getMeta = (name: string) =>
        document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
          ?.getAttribute('content') ?? undefined;
      return {
        description: getMeta('description'),
        viewport: getMeta('viewport'),
        charset: document.characterSet,
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
      };
    });

    const title = await page.title();

    return {
      url,
      title,
      timestamp: new Date().toISOString(),
      elements,
      regions,
      dynamicAreas,
      ariaTree,
      screenshots,
      visibleText,
      links,
      meta,
    };
  }

  /** Disconnect from browser. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
    }
  }
}
