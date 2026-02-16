"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionValidator = void 0;
const adapter_js_1 = require("../browser/adapter.js");
const selector_resolver_js_1 = require("../browser/selector-resolver.js");
const logger_js_1 = require("../logger.js");
const DEFAULTS = {
    cdpUrl: process.env.PINGDEV_CDP_URL ?? 'http://127.0.0.1:9222',
    timeout: 15_000,
    screenshot: true,
};
/**
 * Validates a PingApp's actions against a live site via CDP.
 * Connects to the browser, navigates to the site, and tests each core action.
 */
class ActionValidator {
    selectors;
    siteUrl;
    options;
    log;
    constructor(selectors, siteUrl, options) {
        this.selectors = selectors;
        this.siteUrl = siteUrl;
        this.options = { ...DEFAULTS, ...options };
        this.log = (0, logger_js_1.createLogger)('action-validator');
    }
    /** Run full validation and return a report. */
    async validate() {
        const startTime = Date.now();
        const results = [];
        const adapter = new adapter_js_1.BrowserAdapter({
            cdpUrl: this.options.cdpUrl,
            connectTimeoutMs: this.options.timeout,
            navigationTimeoutMs: this.options.timeout,
        });
        try {
            // Step 1: Connect to the browser
            results.push(await this.runStep('connect', async () => {
                await adapter.connect();
            }));
            const page = adapter.page;
            if (!page) {
                results.push({
                    actionName: 'findOrCreatePage',
                    passed: false,
                    error: 'No page available after connect',
                    timing_ms: 0,
                });
                return this.buildReport(results, startTime);
            }
            // Step 2: findOrCreatePage — navigate to site
            results.push(await this.runStep('findOrCreatePage', async () => {
                await adapter.navigateTo(this.siteUrl);
                await page.waitForLoadState('domcontentloaded', { timeout: this.options.timeout });
            }, page));
            // Step 3: typePrompt — find input and type test text
            results.push(await this.runStep('typePrompt', async () => {
                const inputSelector = this.selectors['promptInput'] ?? this.selectors['prompt-textarea'];
                if (!inputSelector) {
                    throw new Error('No promptInput or prompt-textarea selector defined');
                }
                const locator = await (0, selector_resolver_js_1.resolveSelector)(page, inputSelector, this.options.timeout);
                if (!locator) {
                    throw new Error(`Selector not found: ${inputSelector.name}`);
                }
                // Verify element is interactable by checking visibility
                await locator.waitFor({ state: 'visible', timeout: 5000 });
            }, page));
            // Step 4: submit — check submit button/trigger exists
            results.push(await this.runStep('submit', async () => {
                // Try common submit selector patterns
                const submitSelectors = ['submitButton', 'submit', 'send-button'];
                let found = false;
                for (const sName of submitSelectors) {
                    const sel = this.selectors[sName];
                    if (sel) {
                        const locator = await (0, selector_resolver_js_1.resolveSelector)(page, sel, 5000);
                        if (locator) {
                            found = true;
                            break;
                        }
                    }
                }
                // Fallback: check if there's a keyboard submit path (Enter key on input)
                if (!found) {
                    const inputSel = this.selectors['promptInput'] ?? this.selectors['prompt-textarea'];
                    if (inputSel) {
                        const inputLocator = await (0, selector_resolver_js_1.resolveSelector)(page, inputSel, 5000);
                        if (inputLocator) {
                            found = true; // Input exists — Enter key can submit
                            return 'submit-via-enter-key';
                        }
                    }
                }
                if (!found) {
                    throw new Error('No submit mechanism found');
                }
            }, page));
            // Step 5: isGenerating — check loading indicator selector exists
            results.push(await this.runStep('isGenerating', async () => {
                const loadingSel = this.selectors['loadingSpinner'] ?? this.selectors['loading-indicator'];
                if (!loadingSel) {
                    this.log.warn('No loading indicator selector defined — skipping live check');
                    return 'no-loading-selector-defined';
                }
                // Just verify the selector definition is valid (element may not be visible unless generating)
                return `loading selector defined: ${loadingSel.name} (${loadingSel.tiers.length} tiers)`;
            }, page));
            // Step 6: extractResponse — check response container selector resolves
            results.push(await this.runStep('extractResponse', async () => {
                const responseSel = this.selectors['messageOutput'] ?? this.selectors['response-container'];
                if (!responseSel) {
                    throw new Error('No messageOutput or response-container selector defined');
                }
                const locator = await (0, selector_resolver_js_1.resolveSelector)(page, responseSel, this.options.timeout);
                if (locator) {
                    const text = await locator.textContent({ timeout: 5000 }).catch(() => null);
                    return text ?? undefined;
                }
                // Selector not currently visible is OK — it appears after generation
                return `response selector defined: ${responseSel.name} (${responseSel.tiers.length} tiers)`;
            }, page));
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error({ error }, 'Validation encountered a fatal error');
        }
        finally {
            await adapter.disconnect();
        }
        return this.buildReport(results, startTime);
    }
    /** Validate that a single selector resolves on the current page. */
    async validateSelector(page, selectorDef) {
        return this.runStep(`selector:${selectorDef.name}`, async () => {
            const locator = await (0, selector_resolver_js_1.resolveSelector)(page, selectorDef, this.options.timeout);
            if (!locator) {
                throw new Error(`Selector not found: ${selectorDef.name}`);
            }
            return `resolved with ${selectorDef.tiers.length} tiers`;
        }, page);
    }
    /** Run a single validation step with timing and error capture. */
    async runStep(actionName, fn, page) {
        const start = Date.now();
        try {
            const result = await fn();
            const timing_ms = Date.now() - start;
            this.log.info({ actionName, timing_ms }, 'Step passed');
            return {
                actionName,
                passed: true,
                timing_ms,
                extractedContent: typeof result === 'string' ? result : undefined,
            };
        }
        catch (err) {
            const timing_ms = Date.now() - start;
            const error = err instanceof Error ? err.message : String(err);
            this.log.warn({ actionName, timing_ms, error }, 'Step failed');
            let screenshotBase64;
            if (this.options.screenshot && page) {
                try {
                    const buf = await page.screenshot({ type: 'png', timeout: 5000 });
                    screenshotBase64 = buf.toString('base64');
                }
                catch {
                    this.log.debug({ actionName }, 'Screenshot capture failed');
                }
            }
            return { actionName, passed: false, error, timing_ms, screenshotBase64 };
        }
    }
    /** Build the final ValidationReport. */
    buildReport(results, startTime) {
        return {
            appName: 'unknown',
            url: this.siteUrl,
            timestamp: new Date().toISOString(),
            results,
            overallPassed: results.every((r) => r.passed),
            duration_ms: Date.now() - startTime,
        };
    }
}
exports.ActionValidator = ActionValidator;
//# sourceMappingURL=validator.js.map