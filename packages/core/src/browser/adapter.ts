import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowserConfig } from '../types.js';
import { logger } from '../logger.js';
import { Errors } from '../errors/index.js';

const log = logger.child({ module: 'browser-adapter' });

/** Default browser configuration. */
const DEFAULTS: BrowserConfig = {
  cdpUrl: 'http://127.0.0.1:9222',
  connectTimeoutMs: 15_000,
  navigationTimeoutMs: 30_000,
};

export class BrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;
  private config: BrowserConfig;

  constructor(config?: Partial<BrowserConfig>) {
    this.config = { ...DEFAULTS, ...config };
  }

  get page(): Page | null {
    return this._page;
  }

  /** Connect to an existing Chromium instance via CDP. */
  async connect(): Promise<void> {
    log.info({ cdpUrl: this.config.cdpUrl }, 'Connecting to Chromium via CDP');

    try {
      this.browser = await chromium.connectOverCDP(this.config.cdpUrl, {
        timeout: this.config.connectTimeoutMs,
      });
    } catch (err) {
      throw Object.assign(Errors.browserUnavailable(String(err)), { cause: err });
    }

    const contexts = this.browser.contexts();
    if (contexts.length === 0) {
      throw Errors.browserUnavailable('No browser contexts found');
    }
    this.context = contexts[0]!;

    // Use the first page or create one
    const pages = this.context.pages();
    this._page = pages.length > 0 ? pages[0]! : await this.context.newPage();

    log.info('Browser adapter connected successfully');
  }

  /** Set the active page (used by site-specific findOrCreatePage actions). */
  setPage(page: Page): void {
    this._page = page;
  }

  /** Get all pages in the browser context. */
  getPages(): Page[] {
    return this.context?.pages() ?? [];
  }

  /** Create a new page in the browser context. */
  async newPage(): Promise<Page> {
    if (!this.context) throw Errors.browserUnavailable('No browser context');
    return this.context.newPage();
  }

  /** Navigate the current page to a URL. */
  async navigateTo(url: string): Promise<void> {
    if (!this._page) throw Errors.browserUnavailable('No page');
    await this._page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.navigationTimeoutMs,
    });
  }

  /** Check if the browser is connected. */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
  }

  /** Get the current page URL. */
  getCurrentUrl(): string {
    if (!this._page) throw Errors.browserUnavailable('No page');
    return this._page.url();
  }

  /** Disconnect from the browser (does NOT close the browser). */
  async disconnect(): Promise<void> {
    if (this.browser) {
      this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this._page = null;
      log.info('Disconnected from browser');
    }
  }
}
