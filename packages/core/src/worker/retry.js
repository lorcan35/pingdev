"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'retry' });
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF = [1000, 3000, 7000];
async function withRetry(fn, opts = {}) {
    const maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
    const backoffMs = opts.backoffMs ?? [...DEFAULT_BACKOFF];
    const maxJitterMs = opts.maxJitterMs ?? 500;
    const label = opts.label ?? 'operation';
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (!isRetryable(err)) {
                log.warn({ label, attempt, error: String(err) }, 'Non-retryable error, failing immediately');
                throw err;
            }
            if (attempt >= maxRetries) {
                log.error({ label, attempt, error: String(err) }, 'All retry attempts exhausted');
                break;
            }
            const baseDelay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 1000;
            const jitter = Math.floor(Math.random() * maxJitterMs);
            const delay = baseDelay + jitter;
            log.warn({ label, attempt: attempt + 1, maxRetries, delayMs: delay, error: String(err) }, `Retrying ${label} (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delay);
        }
    }
    throw lastError;
}
function isRetryable(err) {
    return (typeof err === 'object' &&
        err !== null &&
        'retryable' in err &&
        err.retryable === true);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map