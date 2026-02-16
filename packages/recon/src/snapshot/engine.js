"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnapshotEngine = void 0;
/**
 * SnapshotEngine — orchestrates a full site snapshot.
 */
const core_1 = require("@pingdev/core");
const elements_js_1 = require("./elements.js");
const regions_js_1 = require("./regions.js");
const dynamic_js_1 = require("./dynamic.js");
const aria_js_1 = require("./aria.js");
const screenshots_js_1 = require("./screenshots.js");
class SnapshotEngine {
    browser = null;
    options;
    constructor(options) {
        this.options = {
            cdpUrl: options?.cdpUrl ?? 'http://127.0.0.1:9222',
            screenshots: options?.screenshots ?? true,
            timeoutMs: options?.timeoutMs ?? 30_000,
            captureAriaTree: options?.captureAriaTree ?? true,
        };
    }
    /** Take a full snapshot of a URL. */
    async snapshot(url) {
        // Connect or reuse existing connection
        if (!this.browser || !this.browser.isConnected()) {
            this.browser = new core_1.BrowserAdapter({ cdpUrl: this.options.cdpUrl });
            await this.browser.connect();
        }
        const page = this.browser.page;
        // Navigate
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: this.options.timeoutMs,
        });
        // 1. Discover elements
        const elements = await (0, elements_js_1.discoverElements)(page);
        // 2. Discover regions and assign elements
        const regions = await (0, regions_js_1.discoverRegions)(page, elements);
        // 3. Detect dynamic areas
        const dynamicAreas = await (0, dynamic_js_1.detectDynamicAreas)(page);
        // 4. Capture ARIA tree
        const ariaTree = this.options.captureAriaTree
            ? await (0, aria_js_1.captureAriaTree)(page)
            : [];
        // 5. Capture screenshots
        const screenshots = this.options.screenshots
            ? await (0, screenshots_js_1.captureScreenshots)(page, regions)
            : [];
        // 6. Extract visible text
        const visibleText = await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                    const el = node.parentElement;
                    if (!el)
                        return NodeFilter.FILTER_REJECT;
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    const text = (node.textContent ?? '').trim();
                    return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                },
            });
            const texts = [];
            while (walker.nextNode()) {
                const text = (walker.currentNode.textContent ?? '').trim();
                if (text)
                    texts.push(text);
            }
            return texts;
        });
        // 7. Extract links
        const links = await page.evaluate(() => {
            const origin = window.location.origin;
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                text: (a.textContent ?? '').trim(),
                href: a.href,
                isInternal: a.href.startsWith(origin),
            }));
        });
        // 8. Extract meta
        const meta = await page.evaluate(() => {
            const getMeta = (name) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
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
    async close() {
        if (this.browser) {
            await this.browser.disconnect();
            this.browser = null;
        }
    }
}
exports.SnapshotEngine = SnapshotEngine;
//# sourceMappingURL=engine.js.map