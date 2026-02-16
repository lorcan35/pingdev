"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConfig = resolveConfig;
/** Merge site config with defaults, returning a fully-resolved config. */
function resolveConfig(site) {
    return {
        ...site,
        browser: {
            cdpUrl: 'http://127.0.0.1:9222',
            connectTimeoutMs: 15_000,
            navigationTimeoutMs: 30_000,
            ...site.browser,
        },
        redis: {
            host: '127.0.0.1',
            port: 6379,
            ...site.redis,
        },
        queue: {
            name: `${site.name}-jobs`,
            concurrency: 1,
            defaultTimeoutMs: 120_000,
            ...site.queue,
        },
        rateLimit: {
            maxPerMinute: 6,
            minDelayMs: 3000,
            maxQueueDepth: 10,
            ...site.rateLimit,
        },
        retry: {
            actionRetries: 3,
            actionBackoffMs: [1000, 3000, 7000],
            jobRetries: 2,
            ...site.retry,
        },
        idempotency: {
            ttlMs: 3_600_000,
            keyPrefix: `${site.name}-idemp`,
            ...site.idempotency,
        },
        conversation: {
            ttlMs: 1_800_000,
            keyPrefix: `${site.name}-convo`,
            ...site.conversation,
        },
        artifactsDir: site.artifactsDir ?? './artifacts',
    };
}
//# sourceMappingURL=config.js.map