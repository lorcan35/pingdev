import type { RateLimitConfig } from '../types.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'rate-limiter' });

export class RateLimiter {
  private timestamps: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  check(): { blocked: true; retryAfterMs: number } | null {
    const now = Date.now();
    const windowMs = 60_000;
    const { maxPerMinute, minDelayMs } = this.config;

    while (this.timestamps.length > 0 && this.timestamps[0]! < now - windowMs) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= maxPerMinute) {
      const oldestInWindow = this.timestamps[0]!;
      const retryAfterMs = oldestInWindow + windowMs - now;
      log.warn({ count: this.timestamps.length, maxPerMinute, retryAfterMs }, 'Rate limit exceeded');
      return { blocked: true, retryAfterMs };
    }

    if (this.timestamps.length > 0) {
      const lastRequest = this.timestamps[this.timestamps.length - 1]!;
      const elapsed = now - lastRequest;
      if (elapsed < minDelayMs) {
        const retryAfterMs = minDelayMs - elapsed;
        log.warn({ elapsed, minDelayMs, retryAfterMs }, 'Too fast — minimum delay not met');
        return { blocked: true, retryAfterMs };
      }
    }

    return null;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }
}
