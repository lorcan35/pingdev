"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Errors = void 0;
exports.createError = createError;
function createError(code, message, opts = {}) {
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
exports.Errors = {
    browserUnavailable: (detail) => createError('BROWSER_UNAVAILABLE', detail ?? 'Cannot connect to browser via CDP', {
        retryable: true,
        recommendedAction: 'Check that Chromium is running with CDP enabled',
    }),
    authRequired: (detail) => createError('AUTH_REQUIRED', detail ?? 'Authentication required', {
        retryable: false,
        recommendedAction: 'Log in to the target site manually',
    }),
    selectorNotFound: (selector, state) => createError('UI_SELECTOR_NOT_FOUND', `Selector not found: ${selector}`, {
        retryable: true,
        state,
        recommendedAction: 'Selector may have changed — check element registry',
    }),
    generationTimeout: (elapsedMs) => createError('GENERATION_TIMEOUT', `Generation timed out after ${elapsedMs}ms`, {
        retryable: true,
        recommendedAction: 'Increase timeout or retry',
    }),
    extractionFailed: (detail) => createError('EXTRACTION_FAILED', detail ?? 'Failed to extract response text', {
        retryable: true,
        recommendedAction: 'Response container may have changed — check selectors',
    }),
    needsHuman: (reason) => createError('CAPTCHA_REQUIRED', reason, {
        retryable: false,
        recommendedAction: 'Human intervention required',
    }),
    unknown: (detail) => createError('UNKNOWN', detail ?? 'Unknown error', {
        retryable: false,
    }),
};
//# sourceMappingURL=index.js.map