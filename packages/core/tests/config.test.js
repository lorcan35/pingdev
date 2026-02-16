"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const config_js_1 = require("../src/config.js");
const mockAction = async (_ctx) => { };
const minimalSite = {
    name: 'test',
    url: 'https://example.com',
    selectors: {},
    states: { transitions: {} },
    actions: {
        findOrCreatePage: mockAction,
        typePrompt: mockAction,
        submit: mockAction,
        isGenerating: mockAction,
        isResponseComplete: mockAction,
        extractResponse: mockAction,
    },
    completion: { method: 'hash_stability', pollMs: 1000, stableCount: 3, maxWaitMs: 60_000 },
};
(0, vitest_1.describe)('resolveConfig', () => {
    (0, vitest_1.it)('applies default browser config', () => {
        const config = (0, config_js_1.resolveConfig)(minimalSite);
        (0, vitest_1.expect)(config.browser.cdpUrl).toBe('http://127.0.0.1:9222');
        (0, vitest_1.expect)(config.browser.connectTimeoutMs).toBe(15_000);
    });
    (0, vitest_1.it)('applies default redis config', () => {
        const config = (0, config_js_1.resolveConfig)(minimalSite);
        (0, vitest_1.expect)(config.redis.host).toBe('127.0.0.1');
        (0, vitest_1.expect)(config.redis.port).toBe(6379);
    });
    (0, vitest_1.it)('uses site name in queue name', () => {
        const config = (0, config_js_1.resolveConfig)(minimalSite);
        (0, vitest_1.expect)(config.queue.name).toBe('test-jobs');
    });
    (0, vitest_1.it)('uses site name in key prefixes', () => {
        const config = (0, config_js_1.resolveConfig)(minimalSite);
        (0, vitest_1.expect)(config.idempotency.keyPrefix).toBe('test-idemp');
        (0, vitest_1.expect)(config.conversation.keyPrefix).toBe('test-convo');
    });
    (0, vitest_1.it)('allows overriding defaults', () => {
        const config = (0, config_js_1.resolveConfig)({
            ...minimalSite,
            redis: { host: 'redis.local', port: 6380 },
            rateLimit: { maxPerMinute: 20, minDelayMs: 1000, maxQueueDepth: 50 },
        });
        (0, vitest_1.expect)(config.redis.host).toBe('redis.local');
        (0, vitest_1.expect)(config.redis.port).toBe(6380);
        (0, vitest_1.expect)(config.rateLimit.maxPerMinute).toBe(20);
    });
    (0, vitest_1.it)('defaults artifactsDir to ./artifacts', () => {
        const config = (0, config_js_1.resolveConfig)(minimalSite);
        (0, vitest_1.expect)(config.artifactsDir).toBe('./artifacts');
    });
});
//# sourceMappingURL=config.test.js.map