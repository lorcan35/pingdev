/** Score individual selectors and SelectorDefs by tier and fragility. */
import type { SelectorDef } from '../types.js';
import type { SelectorScore } from './types.js';
/** Score a single selector string and classify its tier. */
export declare function scoreSelectorTier(selector: string): SelectorScore;
/** Score all tiers of a SelectorDef, returning scores sorted by confidence (highest first). */
export declare function scoreSelectorDef(selectorDef: SelectorDef): SelectorScore[];
//# sourceMappingURL=selector-scorer.d.ts.map