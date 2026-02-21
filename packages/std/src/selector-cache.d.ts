export interface SelectorCacheEntry {
    repairedSelector: string;
    url: string;
    confidence: number;
    timestamp: number;
    hitCount: number;
}
export interface SelectorCacheFile {
    [originalSelector: string]: SelectorCacheEntry;
}
export interface SelectorCacheOptions {
    path?: string;
    /** Entry TTL in ms (default: 7 days). */
    ttlMs?: number;
    /** Debounce for disk flush (default: 250ms). */
    flushDebounceMs?: number;
}
export declare class SelectorCache {
    private filePath;
    private ttlMs;
    private flushDebounceMs;
    private loaded;
    private cache;
    private flushTimer;
    private dirty;
    constructor(opts?: SelectorCacheOptions);
    load(): Promise<void>;
    /** For debugging. Returns the in-memory cache. */
    getAll(): SelectorCacheFile;
    lookup(selector: string, url: string): string | null;
    store(original: string, repaired: string, url: string, confidence: number): void;
    private pruneExpired;
    private markDirty;
    private flushToDisk;
}
//# sourceMappingURL=selector-cache.d.ts.map