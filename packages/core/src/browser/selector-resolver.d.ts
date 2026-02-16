import type { Page, Locator } from 'playwright';
import type { SelectorDef } from '../types.js';
export declare function resolveSelector(page: Page, selectorDef: SelectorDef, timeoutMs?: number): Promise<Locator | null>;
export declare function resolveSelectorOrThrow(page: Page, selectorDef: SelectorDef, timeoutMs?: number): Promise<Locator>;
//# sourceMappingURL=selector-resolver.d.ts.map