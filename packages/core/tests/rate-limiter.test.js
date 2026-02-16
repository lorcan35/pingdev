"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rate_limiter_js_1 = require("../src/api/rate-limiter.js");
(0, vitest_1.describe)('RateLimiter', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('allows requests within limits', () => {
        const limiter = new rate_limiter_js_1.RateLimiter({ maxPerMinute: 10, minDelayMs: 0, maxQueueDepth: 10 });
        (0, vitest_1.expect)(limiter.check()).toBeNull();
    });
    (0, vitest_1.it)('blocks when max per minute exceeded', () => {
        const limiter = new rate_limiter_js_1.RateLimiter({ maxPerMinute: 2, minDelayMs: 0, maxQueueDepth: 10 });
        limiter.record();
        limiter.record();
        const result = limiter.check();
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.blocked).toBe(true);
    });
    (0, vitest_1.it)('blocks when requests too fast', () => {
        const limiter = new rate_limiter_js_1.RateLimiter({ maxPerMinute: 100, minDelayMs: 5000, maxQueueDepth: 10 });
        limiter.record();
        const result = limiter.check();
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.retryAfterMs).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('allows requests after delay passes', () => {
        const limiter = new rate_limiter_js_1.RateLimiter({ maxPerMinute: 100, minDelayMs: 1000, maxQueueDepth: 10 });
        limiter.record();
        vitest_1.vi.advanceTimersByTime(1500);
        (0, vitest_1.expect)(limiter.check()).toBeNull();
    });
    (0, vitest_1.it)('prunes old timestamps from sliding window', () => {
        const limiter = new rate_limiter_js_1.RateLimiter({ maxPerMinute: 2, minDelayMs: 0, maxQueueDepth: 10 });
        limiter.record();
        limiter.record();
        // Advance past 1 minute window
        vitest_1.vi.advanceTimersByTime(61_000);
        (0, vitest_1.expect)(limiter.check()).toBeNull();
    });
});
//# sourceMappingURL=rate-limiter.test.js.map