/**
 * Unit tests for the retry wrapper with exponential backoff.
 */
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@pingdev/core';

describe('withRetry', () => {
  it('should return the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, backoffMs: [10], maxJitterMs: 0, label: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const retryableError = { code: 'UI_SELECTOR_NOT_FOUND', message: 'not found', retryable: true };
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { maxRetries: 3, backoffMs: [10, 10, 10], maxJitterMs: 0, label: 'test' });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on non-retryable errors', async () => {
    const nonRetryableError = { code: 'AUTH_REQUIRED', message: 'login needed', retryable: false };
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(withRetry(fn, { maxRetries: 3, backoffMs: [10], maxJitterMs: 0, label: 'test' }))
      .rejects.toEqual(nonRetryableError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on plain Error objects (no retryable field)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('plain error'));

    await expect(withRetry(fn, { maxRetries: 3, backoffMs: [10], maxJitterMs: 0, label: 'test' }))
      .rejects.toThrow('plain error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after exhausting all retries', async () => {
    const retryableError = { code: 'EXTRACTION_FAILED', message: 'extraction failed', retryable: true };
    const fn = vi.fn().mockRejectedValue(retryableError);

    await expect(withRetry(fn, { maxRetries: 2, backoffMs: [10, 10], maxJitterMs: 0, label: 'test' }))
      .rejects.toEqual(retryableError);
    // 1 initial + 2 retries = 3 total attempts
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use the configured backoff schedule', async () => {
    const retryableError = { code: 'BROWSER_UNAVAILABLE', message: 'unavailable', retryable: true };
    const timestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      throw retryableError;
    });

    await expect(withRetry(fn, {
      maxRetries: 2,
      backoffMs: [50, 100],
      maxJitterMs: 0,
      label: 'test',
    })).rejects.toEqual(retryableError);

    expect(timestamps).toHaveLength(3);
    // First retry should wait ~50ms
    const delay1 = timestamps[1]! - timestamps[0]!;
    expect(delay1).toBeGreaterThanOrEqual(40); // allow 10ms tolerance
    expect(delay1).toBeLessThan(200);
    // Second retry should wait ~100ms
    const delay2 = timestamps[2]! - timestamps[1]!;
    expect(delay2).toBeGreaterThanOrEqual(80);
    expect(delay2).toBeLessThan(300);
  });

  it('should add jitter when maxJitterMs > 0', async () => {
    const retryableError = { code: 'BROWSER_UNAVAILABLE', message: 'unavailable', retryable: true };
    const timestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      throw retryableError;
    });

    await expect(withRetry(fn, {
      maxRetries: 1,
      backoffMs: [50],
      maxJitterMs: 100,
      label: 'test',
    })).rejects.toEqual(retryableError);

    expect(timestamps).toHaveLength(2);
    const delay = timestamps[1]! - timestamps[0]!;
    // With 50ms base + 0-100ms jitter, delay should be 50-160ms (with tolerance)
    expect(delay).toBeGreaterThanOrEqual(40);
    expect(delay).toBeLessThan(250);
  });

  it('should use the last backoff value when attempts exceed schedule length', async () => {
    const retryableError = { code: 'BROWSER_UNAVAILABLE', message: 'unavailable', retryable: true };
    const timestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      throw retryableError;
    });

    await expect(withRetry(fn, {
      maxRetries: 3,
      backoffMs: [50],  // Only one entry — should reuse for all retries
      maxJitterMs: 0,
      label: 'test',
    })).rejects.toEqual(retryableError);

    expect(timestamps).toHaveLength(4);
    // All delays should be ~50ms
    for (let i = 1; i < timestamps.length; i++) {
      const delay = timestamps[i]! - timestamps[i - 1]!;
      expect(delay).toBeGreaterThanOrEqual(40);
      expect(delay).toBeLessThan(200);
    }
  });

  it('should use default config values when no options provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle async functions that resolve after retries', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw { code: 'GENERATION_TIMEOUT', message: 'timeout', retryable: true };
      }
      return { data: 'success', attempt: callCount };
    });

    const result = await withRetry(fn, { maxRetries: 3, backoffMs: [10, 10, 10], maxJitterMs: 0, label: 'test' });
    expect(result).toEqual({ data: 'success', attempt: 3 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
