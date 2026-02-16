/** Documentation scraper — finds and fetches doc pages from a site. */
import type { DocScrapeResult } from '../types.js';
export declare class DocScraper {
    /** Scrape documentation for a site based on discovered links. */
    scrape(url: string, links: Array<{
        text: string;
        href: string;
    }>): Promise<DocScrapeResult>;
    /** Filter links to find documentation-related ones. */
    private filterDocLinks;
    /** Resolve a potentially relative URL against a base. */
    private resolveUrl;
    /** Fetch a page and extract text content. */
    private fetchPage;
    /** Strip HTML tags and normalize whitespace. */
    private stripHtml;
    /** Categorize scraped text into API docs, help pages, or constraints. */
    private categorize;
}
//# sourceMappingURL=doc-scraper.d.ts.map