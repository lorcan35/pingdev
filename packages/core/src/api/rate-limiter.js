"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'rate-limiter' });
class RateLimiter {
    timestamps = [];
    config;
    constructor(config) {
        this.config = config;
    }
    check() {
        const now = Date.now();
        const windowMs = 60_000;
        const { maxPerMinute, minDelayMs } = this.config;
        while (this.timestamps.length > 0 && this.timestamps[0] < now - windowMs) {
            this.timestamps.shift();
        }
        if (this.timestamps.length >= maxPerMinute) {
            const oldestInWindow = this.timestamps[0];
            const retryAfterMs = oldestInWindow + windowMs - now;
            log.warn({ count: this.timestamps.length, maxPerMinute, retryAfterMs }, 'Rate limit exceeded');
            return { blocked: true, retryAfterMs };
        }
        if (this.timestamps.length > 0) {
            const lastRequest = this.timestamps[this.timestamps.length - 1];
            const elapsed = now - lastRequest;
            if (elapsed < minDelayMs) {
                const retryAfterMs = minDelayMs - elapsed;
                log.warn({ elapsed, minDelayMs, retryAfterMs }, 'Too fast — minimum delay not met');
                return { blocked: true, retryAfterMs };
            }
        }
        return null;
    }
    record() {
        this.timestamps.push(Date.now());
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rate-limiter.js.map