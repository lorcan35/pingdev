/** Documentation scraper — finds and fetches doc pages from a site. */

import type { DocScrapeResult } from '../types.js';

const DOC_URL_PATTERNS = [
  /\/help/i, /\/docs/i, /\/faq/i, /\/changelog/i,
  /\/api/i, /\/guide/i, /\/about/i, /\/support/i,
  /\/tutorial/i, /\/reference/i,
];

const DOC_TEXT_PATTERNS = [
  /help/i, /documentation/i, /faq/i, /guide/i,
  /about/i, /api/i, /support/i, /tutorial/i,
  /getting started/i, /reference/i,
];

const MAX_DOC_PAGES = 5;
const FETCH_TIMEOUT_MS = 10_000;

export class DocScraper {
  /** Scrape documentation for a site based on discovered links. */
  async scrape(
    url: string,
    links: Array<{ text: string; href: string }>,
  ): Promise<DocScrapeResult> {
    const result: DocScrapeResult = {
      apiDocs: [],
      helpPages: [],
      constraints: [],
      scrapedUrls: [],
    };

    const docLinks = this.filterDocLinks(url, links);
    const toFetch = docLinks.slice(0, MAX_DOC_PAGES);

    const fetched = await Promise.allSettled(
      toFetch.map((link) => this.fetchPage(link.href)),
    );

    for (let i = 0; i < fetched.length; i++) {
      const settled = fetched[i];
      if (settled.status !== 'fulfilled' || !settled.value) continue;

      const href = toFetch[i].href;
      const text = settled.value;
      result.scrapedUrls.push(href);

      this.categorize(href, text, result);
    }

    return result;
  }

  /** Filter links to find documentation-related ones. */
  private filterDocLinks(
    baseUrl: string,
    links: Array<{ text: string; href: string }>,
  ): Array<{ text: string; href: string }> {
    const seen = new Set<string>();
    const docLinks: Array<{ text: string; href: string }> = [];

    for (const link of links) {
      const href = this.resolveUrl(baseUrl, link.href);
      if (!href || seen.has(href)) continue;

      const isDocUrl = DOC_URL_PATTERNS.some((p) => p.test(href));
      const isDocText = DOC_TEXT_PATTERNS.some((p) => p.test(link.text));

      if (isDocUrl || isDocText) {
        seen.add(href);
        docLinks.push({ text: link.text, href });
      }
    }

    return docLinks;
  }

  /** Resolve a potentially relative URL against a base. */
  private resolveUrl(base: string, href: string): string | null {
    try {
      return new URL(href, base).href;
    } catch {
      return null;
    }
  }

  /** Fetch a page and extract text content. */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PingDev-Recon/0.1' },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const html = await response.text();
      return this.stripHtml(html);
    } catch {
      return null;
    }
  }

  /** Strip HTML tags and normalize whitespace. */
  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  }

  /** Categorize scraped text into API docs, help pages, or constraints. */
  private categorize(url: string, text: string, result: DocScrapeResult): void {
    const lower = url.toLowerCase();

    if (/\/api|\/reference|\/endpoint/i.test(lower)) {
      result.apiDocs.push(text);
    } else if (/\/help|\/faq|\/guide|\/tutorial|\/support|\/getting-started/i.test(lower)) {
      result.helpPages.push(text);
    } else if (/\/terms|\/tos|\/policy|\/limits|\/pricing/i.test(lower)) {
      result.constraints.push(text);
    } else {
      // Default to help pages
      result.helpPages.push(text);
    }
  }
}
