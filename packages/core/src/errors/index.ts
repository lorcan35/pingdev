import type { ErrorCode, ShimError, UIState } from '../types.js';

export function createError(
  code: ErrorCode,
  message: string,
  opts: { retryable?: boolean; state?: UIState; evidence?: string[]; recommendedAction?: string } = {}
): ShimError {
  return {
    code,
    message,
    retryable: opts.retryable ?? false,
    state: opts.state,
    evidence: opts.evidence,
    recommendedAction: opts.recommendedAction,
  };
}

/** Generic error presets. */
export const Errors = {
  browserUnavailable: (detail?: string) =>
    createError('BROWSER_UNAVAILABLE', detail ?? 'Cannot connect to browser via CDP', {
      retryable: true,
      recommendedAction: 'Check that Chromium is running with CDP enabled',
    }),

  authRequired: (detail?: string) =>
    createError('AUTH_REQUIRED', detail ?? 'Authentication required', {
      retryable: false,
      recommendedAction: 'Log in to the target site manually',
    }),

  selectorNotFound: (selector: string, state?: UIState) =>
    createError('UI_SELECTOR_NOT_FOUND', `Selector not found: ${selector}`, {
      retryable: true,
      state,
      recommendedAction: 'Selector may have changed — check element registry',
    }),

  generationTimeout: (elapsedMs: number) =>
    createError('GENERATION_TIMEOUT', `Generation timed out after ${elapsedMs}ms`, {
      retryable: true,
      recommendedAction: 'Increase timeout or retry',
    }),

  extractionFailed: (detail?: string) =>
    createError('EXTRACTION_FAILED', detail ?? 'Failed to extract response text', {
      retryable: true,
      recommendedAction: 'Response container may have changed — check selectors',
    }),

  needsHuman: (reason: string) =>
    createError('CAPTCHA_REQUIRED', reason, {
      retryable: false,
      recommendedAction: 'Human intervention required',
    }),

  unknown: (detail?: string) =>
    createError('UNKNOWN', detail ?? 'Unknown error', {
      retryable: false,
    }),
} as const;
