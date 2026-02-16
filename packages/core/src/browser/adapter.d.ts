import { type Page } from 'playwright';
import type { BrowserConfig } from '../types.js';
export declare class BrowserAdapter {
    private browser;
    private context;
    private _page;
    private config;
    constructor(config?: Partial<BrowserConfig>);
    get page(): Page | null;
    /** Connect to an existing Chromium instance via CDP. */
    connect(): Promise<void>;
    /** Set the active page (used by site-specific findOrCreatePage actions). */
    setPage(page: Page): void;
    /** Get all pages in the browser context. */
    getPages(): Page[];
    /** Create a new page in the browser context. */
    newPage(): Promise<Page>;
    /** Navigate the current page to a URL. */
    navigateTo(url: string): Promise<void>;
    /** Check if the browser is connected. */
    isConnected(): boolean;
    /** Get the current page URL. */
    getCurrentUrl(): string;
    /** Disconnect from the browser (does NOT close the browser). */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=adapter.d.ts.map