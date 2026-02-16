import type { SiteDefinition, ShimAppOptions } from './types.js';
export interface ShimApp {
    start(): Promise<void>;
    stop(): Promise<void>;
}
export declare function createShimApp(site: SiteDefinition, options?: ShimAppOptions): ShimApp;
//# sourceMappingURL=app.d.ts.map