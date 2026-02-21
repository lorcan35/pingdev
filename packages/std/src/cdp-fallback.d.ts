export interface CDPFallbackResult {
    ok: boolean;
    result: unknown;
    _cdpFallback: boolean;
}
/**
 * Attempt to execute an operation via CDP when the content script fails.
 * Returns null if CDP fallback is not possible.
 */
export declare function cdpFallback(deviceUrl: string | undefined, op: string, payload: Record<string, unknown> | undefined): Promise<CDPFallbackResult | null>;
//# sourceMappingURL=cdp-fallback.d.ts.map