/**
 * Screenshot capture — takes full-page and region screenshots.
 */
import type { Page } from 'playwright';
import type { PageRegion, ScreenshotData } from '../types.js';

/** Capture full-page screenshot and per-region screenshots. */
export async function captureScreenshots(
  page: Page,
  regions: PageRegion[],
): Promise<ScreenshotData[]> {
  const screenshots: ScreenshotData[] = [];

  // Full page screenshot
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const fullBuf = await page.screenshot({ fullPage: true, type: 'png' });
  screenshots.push({
    label: 'full-page',
    base64: fullBuf.toString('base64'),
    width: viewport.width,
    height: viewport.height,
  });

  // Per-region screenshots
  for (const region of regions) {
    const { bounds } = region;
    if (bounds.width <= 0 || bounds.height <= 0) continue;

    try {
      const buf = await page.screenshot({
        type: 'png',
        clip: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      });
      screenshots.push({
        label: region.name,
        base64: buf.toString('base64'),
        width: bounds.width,
        height: bounds.height,
      });
    } catch {
      // Region may be off-screen or have invalid bounds; skip
    }
  }

  return screenshots;
}
