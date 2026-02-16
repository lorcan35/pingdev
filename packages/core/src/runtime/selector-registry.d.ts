import { EventEmitter } from 'node:events';
import type { SelectorDef } from '../types.js';
export declare class SelectorRegistry extends EventEmitter {
    private selectors;
    private version;
    private lastUpdated;
    constructor(initial: Record<string, SelectorDef>);
    /** Update a selector's tiers in-memory and increment the version. */
    hotPatch(name: string, newTiers: string[]): void;
    /** Get a single selector by name. */
    getSelector(name: string): SelectorDef | undefined;
    /** Get all selectors. */
    getAllSelectors(): Record<string, SelectorDef>;
    /** Get the current version number. */
    getVersion(): number;
    /** Serialize to JSON-safe object. */
    toJSON(): {
        selectors: Record<string, SelectorDef>;
        version: number;
        lastUpdated: string;
    };
}
//# sourceMappingURL=selector-registry.d.ts.map