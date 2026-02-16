"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAdapter = void 0;
const playwright_1 = require("playwright");
const logger_js_1 = require("../logger.js");
const index_js_1 = require("../errors/index.js");
const log = logger_js_1.logger.child({ module: 'browser-adapter' });
/** Default browser configuration. */
const DEFAULTS = {
    cdpUrl: 'http://127.0.0.1:9222',
    connectTimeoutMs: 15_000,
    navigationTimeoutMs: 30_000,
};
class BrowserAdapter {
    browser = null;
    context = null;
    _page = null;
    config;
    constructor(config) {
        this.config = { ...DEFAULTS, ...config };
    }
    get page() {
        return this._page;
    }
    /** Connect to an existing Chromium instance via CDP. */
    async connect() {
        log.info({ cdpUrl: this.config.cdpUrl }, 'Connecting to Chromium via CDP');
        try {
            this.browser = await playwright_1.chromium.connectOverCDP(this.config.cdpUrl, {
                timeout: this.config.connectTimeoutMs,
            });
        }
        catch (err) {
            throw Object.assign(index_js_1.Errors.browserUnavailable(String(err)), { cause: err });
        }
        const contexts = this.browser.contexts();
        if (contexts.length === 0) {
            throw index_js_1.Errors.browserUnavailable('No browser contexts found');
        }
        this.context = contexts[0];
        // Use the first page or create one
        const pages = this.context.pages();
        this._page = pages.length > 0 ? pages[0] : await this.context.newPage();
        log.info('Browser adapter connected successfully');
    }
    /** Set the active page (used by site-specific findOrCreatePage actions). */
    setPage(page) {
        this._page = page;
    }
    /** Get all pages in the browser context. */
    getPages() {
        return this.context?.pages() ?? [];
    }
    /** Create a new page in the browser context. */
    async newPage() {
        if (!this.context)
            throw index_js_1.Errors.browserUnavailable('No browser context');
        return this.context.newPage();
    }
    /** Navigate the current page to a URL. */
    async navigateTo(url) {
        if (!this._page)
            throw index_js_1.Errors.browserUnavailable('No page');
        await this._page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.navigationTimeoutMs,
        });
    }
    /** Check if the browser is connected. */
    isConnected() {
        return this.browser?.isConnected() ?? false;
    }
    /** Get the current page URL. */
    getCurrentUrl() {
        if (!this._page)
            throw index_js_1.Errors.browserUnavailable('No page');
        return this._page.url();
    }
    /** Disconnect from the browser (does NOT close the browser). */
    async disconnect() {
        if (this.browser) {
            this.browser.close().catch(() => { });
            this.browser = null;
            this.context = null;
            this._page = null;
            log.info('Disconnected from browser');
        }
    }
}
exports.BrowserAdapter = BrowserAdapter;
//# sourceMappingURL=adapter.js.map