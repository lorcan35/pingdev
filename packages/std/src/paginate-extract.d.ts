import type { ExtensionBridge } from './ext-bridge.js';
export interface PaginateExtractOptions {
    deviceId: string;
    schema?: Record<string, string>;
    query?: string;
    paginate: boolean;
    maxPages?: number;
    delay?: number;
}
export interface PaginateExtractResult {
    pages: number;
    totalItems: number;
    data: unknown[];
    hasMore: boolean;
    duration_ms: number;
}
/**
 * Extract data across multiple pages by combining extract + paginate operations.
 *
 * Flow:
 * 1. Extract from current page
 * 2. Detect pagination
 * 3. If hasNext: navigate to next page, wait, extract again
 * 4. Accumulate and deduplicate results
 * 5. Repeat until maxPages or no more pages
 */
export declare function paginateExtract(extBridge: ExtensionBridge, opts: PaginateExtractOptions): Promise<PaginateExtractResult>;
//# sourceMappingURL=paginate-extract.d.ts.map