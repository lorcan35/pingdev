/** Healer — auto-fix broken selectors using LLM + live ARIA snapshots. */
import type { HealerOptions, HealingResult } from './types.js';
interface FailedAction {
    actionName: string;
    error: string;
    selectorName: string;
}
export declare class Healer {
    private appDir;
    private cdpUrl;
    private maxRetries;
    private llm;
    constructor(appDir: string, options?: HealerOptions);
    /**
     * Heal failed actions by capturing ARIA snapshots, asking the LLM
     * for corrected selectors, patching the file, and validating.
     */
    heal(failedActions: FailedAction[]): Promise<HealingResult>;
    /** Attempt to heal a single failed action with retries. */
    private healAction;
    /** Single healing attempt: snapshot → LLM → patch → validate. */
    private attemptHeal;
}
export {};
//# sourceMappingURL=healer.d.ts.map