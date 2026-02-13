import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/api/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limits', () => {
    const limiter = new RateLimiter({ maxPerMinute: 10, minDelayMs: 0, maxQueueDepth: 10 });
    expect(limiter.check()).toBeNull();
  });

  it('blocks when max per minute exceeded', () => {
    const limiter = new RateLimiter({ maxPerMinute: 2, minDelayMs: 0, maxQueueDepth: 10 });
    limiter.record();
    limiter.record();
    const result = limiter.check();
    expect(result).not.toBeNull();
    expect(result!.blocked).toBe(true);
  });

  it('blocks when requests too fast', () => {
    const limiter = new RateLimiter({ maxPerMinute: 100, minDelayMs: 5000, maxQueueDepth: 10 });
    limiter.record();
    const result = limiter.check();
    expect(result).not.toBeNull();
    expect(result!.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows requests after delay passes', () => {
    const limiter = new RateLimiter({ maxPerMinute: 100, minDelayMs: 1000, maxQueueDepth: 10 });
    limiter.record();
    vi.advanceTimersByTime(1500);
    expect(limiter.check()).toBeNull();
  });

  it('prunes old timestamps from sliding window', () => {
    const limiter = new RateLimiter({ maxPerMinute: 2, minDelayMs: 0, maxQueueDepth: 10 });
    limiter.record();
    limiter.record();
    // Advance past 1 minute window
    vi.advanceTimersByTime(61_000);
    expect(limiter.check()).toBeNull();
  });
});
