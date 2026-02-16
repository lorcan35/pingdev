// @pingdev/std — Gateway logging helpers
// Centralized, ultra-defensive logging. This gateway has been observed to exit
// silently in some failure modes (e.g. unhandled EventEmitter 'error' events).

import { appendFileSync } from 'node:fs';

export const GATEWAY_LOG_PATH = process.env.PINGOS_GATEWAY_LOG ?? '/tmp/pingos-gateway.log';
export const CRASH_LOG_PATH = process.env.PINGOS_CRASH_LOG ?? '/tmp/pingos-crash.log';

function now() {
  return new Date().toISOString();
}

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(err as any),
    };
  }
  return { value: err };
}

function appendLine(path: string, line: string) {
  try {
    appendFileSync(path, line);
  } catch {
    // never throw from logging
  }
}

export function logGateway(message: string, extra?: unknown) {
  const suffix = extra === undefined ? '' : ` ${safeStringify(extra)}`;
  appendLine(GATEWAY_LOG_PATH, `${now()} ${message}${suffix}\n`);
}

export function logCrash(message: string, extra?: unknown) {
  const suffix = extra === undefined ? '' : ` ${safeStringify(extra)}`;
  appendLine(CRASH_LOG_PATH, `${now()} ${message}${suffix}\n`);
  // Also mirror crash lines into the main gateway log for correlation.
  appendLine(GATEWAY_LOG_PATH, `${now()} [CRASH] ${message}${suffix}\n`);
}
