"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const loader_js_1 = require("../src/validator/loader.js");
const validator_js_1 = require("../src/validator/validator.js");
const CHATGPT_APP_DIR = process.env['HOME'] + '/projects/pingapps/chatgpt';
(0, vitest_1.describe)('PingAppLoader', () => {
    (0, vitest_1.it)('loads the ChatGPT PingApp selectors', () => {
        const loader = new loader_js_1.PingAppLoader(CHATGPT_APP_DIR);
        const selectors = loader.parseSelectors();
        (0, vitest_1.expect)(Object.keys(selectors).length).toBeGreaterThan(0);
        (0, vitest_1.expect)(selectors['promptInput']).toBeDefined();
        (0, vitest_1.expect)(selectors['promptInput'].name).toBe('promptInput');
        (0, vitest_1.expect)(selectors['promptInput'].tiers.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(selectors['outputContainer']).toBeDefined();
    });
    (0, vitest_1.it)('loads the ChatGPT PingApp state config', () => {
        const loader = new loader_js_1.PingAppLoader(CHATGPT_APP_DIR);
        const states = loader.parseStates();
        (0, vitest_1.expect)(states.initialState).toBe('IDLE');
        (0, vitest_1.expect)(states.transitions).toBeDefined();
        (0, vitest_1.expect)(Object.keys(states.transitions).length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('loads site name and URL from index.ts', () => {
        const loader = new loader_js_1.PingAppLoader(CHATGPT_APP_DIR);
        const { name, url } = loader.parseSiteInfo();
        (0, vitest_1.expect)(name).toBe('chatgpt');
        (0, vitest_1.expect)(url).toBe('https://chatgpt.com');
    });
    (0, vitest_1.it)('load() returns a full PingAppConfig', () => {
        const loader = new loader_js_1.PingAppLoader(CHATGPT_APP_DIR);
        const config = loader.load();
        (0, vitest_1.expect)(config.name).toBe('chatgpt');
        (0, vitest_1.expect)(config.url).toBe('https://chatgpt.com');
        (0, vitest_1.expect)(Object.keys(config.selectors).length).toBeGreaterThan(5);
        (0, vitest_1.expect)(config.states.transitions).toBeDefined();
    });
    (0, vitest_1.it)('throws on invalid app directory', () => {
        const loader = new loader_js_1.PingAppLoader('/nonexistent/path');
        (0, vitest_1.expect)(() => loader.load()).toThrow('Cannot read PingApp file');
    });
});
(0, vitest_1.describe)('ValidationReport', () => {
    (0, vitest_1.it)('creates a valid report structure', () => {
        const results = [
            { actionName: 'connect', passed: true, timing_ms: 100 },
            { actionName: 'findOrCreatePage', passed: true, timing_ms: 200 },
            { actionName: 'typePrompt', passed: false, error: 'Selector not found', timing_ms: 5000 },
        ];
        const report = {
            appName: 'chatgpt',
            url: 'https://chatgpt.com',
            timestamp: new Date().toISOString(),
            results,
            overallPassed: results.every((r) => r.passed),
            duration_ms: 5300,
        };
        (0, vitest_1.expect)(report.overallPassed).toBe(false);
        (0, vitest_1.expect)(report.results).toHaveLength(3);
        (0, vitest_1.expect)(report.results[2].error).toBe('Selector not found');
    });
    (0, vitest_1.it)('overallPassed is true when all pass', () => {
        const results = [
            { actionName: 'connect', passed: true, timing_ms: 50 },
            { actionName: 'findOrCreatePage', passed: true, timing_ms: 120 },
        ];
        const report = {
            appName: 'test-app',
            url: 'https://example.com',
            timestamp: new Date().toISOString(),
            results,
            overallPassed: results.every((r) => r.passed),
            duration_ms: 170,
        };
        (0, vitest_1.expect)(report.overallPassed).toBe(true);
    });
});
(0, vitest_1.describe)('ActionValidator', () => {
    (0, vitest_1.it)('constructs with default options', () => {
        const validator = new validator_js_1.ActionValidator({ input: { name: 'input', tiers: ['#input'] } }, 'https://example.com');
        (0, vitest_1.expect)(validator).toBeDefined();
    });
    (0, vitest_1.it)('constructs with custom options', () => {
        const validator = new validator_js_1.ActionValidator({ input: { name: 'input', tiers: ['#input'] } }, 'https://example.com', { cdpUrl: 'http://127.0.0.1:9333', timeout: 30000, screenshot: false });
        (0, vitest_1.expect)(validator).toBeDefined();
    });
    (0, vitest_1.it)('validateSelector returns failure for mock page with no elements', async () => {
        const mockPage = {
            locator: vitest_1.vi.fn().mockReturnValue({
                first: vitest_1.vi.fn().mockReturnValue({
                    isVisible: vitest_1.vi.fn().mockRejectedValue(new Error('not found')),
                }),
            }),
            screenshot: vitest_1.vi.fn().mockResolvedValue(Buffer.from('fake')),
        };
        const validator = new validator_js_1.ActionValidator({}, 'https://example.com', { screenshot: false, timeout: 1000 });
        const result = await validator.validateSelector(mockPage, { name: 'testSelector', tiers: ['#nonexistent'] });
        (0, vitest_1.expect)(result.actionName).toBe('selector:testSelector');
        (0, vitest_1.expect)(result.passed).toBe(false);
        (0, vitest_1.expect)(result.error).toContain('Selector not found');
    });
    (0, vitest_1.it)('validateSelector returns success for mock page with visible element', async () => {
        const mockLocator = {
            first: vitest_1.vi.fn().mockReturnValue({
                isVisible: vitest_1.vi.fn().mockResolvedValue(true),
            }),
        };
        const mockPage = {
            locator: vitest_1.vi.fn().mockReturnValue(mockLocator),
        };
        const validator = new validator_js_1.ActionValidator({}, 'https://example.com', { screenshot: false, timeout: 2000 });
        const result = await validator.validateSelector(mockPage, { name: 'visibleEl', tiers: ['#exists'] });
        (0, vitest_1.expect)(result.actionName).toBe('selector:visibleEl');
        (0, vitest_1.expect)(result.passed).toBe(true);
        (0, vitest_1.expect)(result.timing_ms).toBeGreaterThanOrEqual(0);
    });
});
//# sourceMappingURL=validator.test.js.map