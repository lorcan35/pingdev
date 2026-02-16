import type { ErrorCode, ShimError, UIState } from '../types.js';
export declare function createError(code: ErrorCode, message: string, opts?: {
    retryable?: boolean;
    state?: UIState;
    evidence?: string[];
    recommendedAction?: string;
}): ShimError;
/** Generic error presets. */
export declare const Errors: {
    readonly browserUnavailable: (detail?: string) => ShimError;
    readonly authRequired: (detail?: string) => ShimError;
    readonly selectorNotFound: (selector: string, state?: UIState) => ShimError;
    readonly generationTimeout: (elapsedMs: number) => ShimError;
    readonly extractionFailed: (detail?: string) => ShimError;
    readonly needsHuman: (reason: string) => ShimError;
    readonly unknown: (detail?: string) => ShimError;
};
//# sourceMappingURL=index.d.ts.map