"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../src/errors/index.js");
(0, vitest_1.describe)('Errors', () => {
    (0, vitest_1.it)('creates error with default retryable=false', () => {
        const err = (0, index_js_1.createError)('UNKNOWN', 'test');
        (0, vitest_1.expect)(err.code).toBe('UNKNOWN');
        (0, vitest_1.expect)(err.retryable).toBe(false);
    });
    (0, vitest_1.it)('creates error with retryable=true', () => {
        const err = (0, index_js_1.createError)('BROWSER_UNAVAILABLE', 'test', { retryable: true });
        (0, vitest_1.expect)(err.retryable).toBe(true);
    });
    (0, vitest_1.it)('browserUnavailable is retryable', () => {
        const err = index_js_1.Errors.browserUnavailable('test detail');
        (0, vitest_1.expect)(err.code).toBe('BROWSER_UNAVAILABLE');
        (0, vitest_1.expect)(err.retryable).toBe(true);
        (0, vitest_1.expect)(err.message).toContain('test detail');
    });
    (0, vitest_1.it)('authRequired is not retryable', () => {
        const err = index_js_1.Errors.authRequired();
        (0, vitest_1.expect)(err.code).toBe('AUTH_REQUIRED');
        (0, vitest_1.expect)(err.retryable).toBe(false);
    });
    (0, vitest_1.it)('generationTimeout includes elapsed time', () => {
        const err = index_js_1.Errors.generationTimeout(5000);
        (0, vitest_1.expect)(err.message).toContain('5000');
        (0, vitest_1.expect)(err.retryable).toBe(true);
    });
    (0, vitest_1.it)('selectorNotFound includes selector name', () => {
        const err = index_js_1.Errors.selectorNotFound('chat-input', 'IDLE');
        (0, vitest_1.expect)(err.message).toContain('chat-input');
        (0, vitest_1.expect)(err.state).toBe('IDLE');
    });
});
//# sourceMappingURL=errors.test.js.map