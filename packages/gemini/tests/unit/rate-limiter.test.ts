/**
 * Unit tests for rate limiter.
 */
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '@pingdev/core';

describe('Rate Limiter', () => {
  it('should allow the first request', () => {
    const limiter = new RateLimiter({ maxPerMinute: 6, minDelayMs: 3000, maxQueueDepth: 10 });
    const result = limiter.check();
    expect(result).toBeNull();
  });

  it('should enforce minimum delay between requests', () => {
    const limiter = new RateLimiter({ maxPerMinute: 6, minDelayMs: 3000, maxQueueDepth: 10 });
    limiter.record();
    // Immediately check again — should be blocked by min delay
    const result = limiter.check();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.blocked).toBe(true);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });
});
