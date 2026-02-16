import type { SiteDefinition, BrowserConfig, RedisConfig, QueueConfig, RateLimitConfig, RetryConfig, IdempotencyConfig, ConversationConfig } from './types.js';
/** Fully resolved configuration with no optional fields for infrastructure. */
export interface ResolvedConfig extends SiteDefinition {
    browser: BrowserConfig;
    redis: RedisConfig;
    queue: QueueConfig;
    rateLimit: RateLimitConfig;
    retry: RetryConfig;
    idempotency: IdempotencyConfig;
    conversation: ConversationConfig;
    artifactsDir: string;
}
/** Merge site config with defaults, returning a fully-resolved config. */
export declare function resolveConfig(site: SiteDefinition): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map