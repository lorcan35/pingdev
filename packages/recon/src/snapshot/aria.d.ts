/**
 * ARIA tree capture — builds an accessibility tree using CDP protocol.
 */
import type { Page } from 'playwright';
import type { AriaNode } from '../types.js';
/** Capture the accessibility tree of the page via CDP. */
export declare function captureAriaTree(page: Page): Promise<AriaNode[]>;
//# sourceMappingURL=aria.d.ts.map