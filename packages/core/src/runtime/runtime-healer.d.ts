import type { Page, Locator } from 'playwright';
import type { SelectorDef } from '../types.js';
import { SelectorRegistry } from './selector-registry.js';
import type { RuntimeConfig } from './types.js';
export declare class RuntimeHealer {
    private registry;
    private config;
    private healingLog;
    constructor(registry: SelectorRegistry, config: RuntimeConfig);
    /**
     * Resolve a selector with automatic healing on failure.
     * Falls back to LLM-based repair if self-healing is enabled.
     */
    resolveWithHealing(page: Page, selectorDef: SelectorDef, timeout?: number): Promise<Locator | null>;
    /** Capture the ARIA snapshot of the page. */
    private captureAriaSnapshot;
    /** Build the healing prompt for the LLM. */
    private buildHealingPrompt;
    /** Call the LLM endpoint to get healing suggestions. */
    private callLLM;
    /** Parse the LLM response to extract new tiers. */
    private parseNewTiers;
}
//# sourceMappingURL=runtime-healer.d.ts.map