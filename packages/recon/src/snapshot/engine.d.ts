import type { SiteSnapshot } from '../types.js';
export interface SnapshotOptions {
    /** CDP URL override. */
    cdpUrl?: string;
    /** Whether to capture screenshots. Default: true. */
    screenshots?: boolean;
    /** Timeout for page load in ms. Default: 30000. */
    timeoutMs?: number;
    /** Whether to capture ARIA tree. Default: true. */
    captureAriaTree?: boolean;
}
export declare class SnapshotEngine {
    private browser;
    private options;
    constructor(options?: SnapshotOptions);
    /** Take a full snapshot of a URL. */
    snapshot(url: string): Promise<SiteSnapshot>;
    /** Disconnect from browser. */
    close(): Promise<void>;
}
//# sourceMappingURL=engine.d.ts.map