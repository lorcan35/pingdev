import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/worker/retry.js';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, backoffMs: [10] });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ retryable: true, message: 'fail' })
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, backoffMs: [10], maxJitterMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue({ retryable: false, message: 'fatal' });
    await expect(withRetry(fn, { maxRetries: 3, backoffMs: [10] })).rejects.toMatchObject({
      retryable: false,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws', async () => {
    const fn = vi.fn().mockRejectedValue({ retryable: true, message: 'fail' });
    await expect(withRetry(fn, { maxRetries: 2, backoffMs: [10], maxJitterMs: 0 })).rejects.toMatchObject({
      retryable: true,
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
