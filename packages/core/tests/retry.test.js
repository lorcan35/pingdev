"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const retry_js_1 = require("../src/worker/retry.js");
(0, vitest_1.describe)('withRetry', () => {
    (0, vitest_1.it)('returns on first success', async () => {
        const fn = vitest_1.vi.fn().mockResolvedValue('ok');
        const result = await (0, retry_js_1.withRetry)(fn, { maxRetries: 3, backoffMs: [10] });
        (0, vitest_1.expect)(result).toBe('ok');
        (0, vitest_1.expect)(fn).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('retries on retryable errors', async () => {
        const fn = vitest_1.vi.fn()
            .mockRejectedValueOnce({ retryable: true, message: 'fail' })
            .mockResolvedValue('ok');
        const result = await (0, retry_js_1.withRetry)(fn, { maxRetries: 3, backoffMs: [10], maxJitterMs: 0 });
        (0, vitest_1.expect)(result).toBe('ok');
        (0, vitest_1.expect)(fn).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)('throws immediately on non-retryable errors', async () => {
        const fn = vitest_1.vi.fn().mockRejectedValue({ retryable: false, message: 'fatal' });
        await (0, vitest_1.expect)((0, retry_js_1.withRetry)(fn, { maxRetries: 3, backoffMs: [10] })).rejects.toMatchObject({
            retryable: false,
        });
        (0, vitest_1.expect)(fn).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)('exhausts retries and throws', async () => {
        const fn = vitest_1.vi.fn().mockRejectedValue({ retryable: true, message: 'fail' });
        await (0, vitest_1.expect)((0, retry_js_1.withRetry)(fn, { maxRetries: 2, backoffMs: [10], maxJitterMs: 0 })).rejects.toMatchObject({
            retryable: true,
        });
        (0, vitest_1.expect)(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
});
//# sourceMappingURL=retry.test.js.map