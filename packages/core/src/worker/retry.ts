import { logger } from '../logger.js';

const log = logger.child({ module: 'retry' });

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number[];
  maxJitterMs?: number;
  label?: string;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF = [1000, 3000, 7000];

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
  const backoffMs = opts.backoffMs ?? [...DEFAULT_BACKOFF];
  const maxJitterMs = opts.maxJitterMs ?? 500;
  const label = opts.label ?? 'operation';

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
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

      log.warn(
        { label, attempt: attempt + 1, maxRetries, delayMs: delay, error: String(err) },
        `Retrying ${label} (attempt ${attempt + 1}/${maxRetries})`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'retryable' in err &&
    (err as { retryable: unknown }).retryable === true
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
