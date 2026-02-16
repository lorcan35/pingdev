export interface RetryOptions {
    maxRetries?: number;
    backoffMs?: number[];
    maxJitterMs?: number;
    label?: string;
}
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
//# sourceMappingURL=retry.d.ts.map