import type { RateLimitConfig } from '../types.js';
export declare class RateLimiter {
    private timestamps;
    private config;
    constructor(config: RateLimitConfig);
    check(): {
        blocked: true;
        retryAfterMs: number;
    } | null;
    record(): void;
}
//# sourceMappingURL=rate-limiter.d.ts.map