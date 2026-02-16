/**
 * Dynamic content detection — identifies page areas that change over time.
 */
import type { Page } from 'playwright';
import type { DynamicArea } from '../types.js';
/** Detect dynamic content areas using MutationObserver and known patterns. */
export declare function detectDynamicAreas(page: Page, observeDurationMs?: number): Promise<DynamicArea[]>;
//# sourceMappingURL=dynamic.d.ts.map