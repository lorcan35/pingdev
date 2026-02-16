/**
 * Screenshot capture — takes full-page and region screenshots.
 */
import type { Page } from 'playwright';
import type { PageRegion, ScreenshotData } from '../types.js';
/** Capture full-page screenshot and per-region screenshots. */
export declare function captureScreenshots(page: Page, regions: PageRegion[]): Promise<ScreenshotData[]>;
//# sourceMappingURL=screenshots.d.ts.map