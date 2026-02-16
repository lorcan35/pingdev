/**
 * Region grouping — assigns elements to page regions (header, nav, main, footer, etc.).
 */
import type { Page } from 'playwright';
import type { PageRegion, SnapshotElement } from '../types.js';
/** Discover page regions and assign elements to them. */
export declare function discoverRegions(page: Page, elements: SnapshotElement[]): Promise<PageRegion[]>;
//# sourceMappingURL=regions.d.ts.map