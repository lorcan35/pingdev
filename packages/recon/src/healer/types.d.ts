/** Types for the self-healing module. */
export interface HealingPatch {
    selectorName: string;
    oldTiers: string[];
    newTiers: string[];
    reason: string;
}
export interface HealingAttempt {
    attemptNumber: number;
    patches: HealingPatch[];
    validationPassed: boolean;
    error?: string;
}
export interface HealingReport {
    actionName: string;
    attempts: HealingAttempt[];
    fixed: boolean;
    finalPatches: HealingPatch[];
}
export interface HealingResult {
    appDir: string;
    reports: HealingReport[];
    totalFixed: number;
    totalFailed: number;
    duration_ms: number;
}
export interface HealerOptions {
    cdpUrl?: string;
    maxRetries?: number;
    llmEndpoint?: string;
    llmModel?: string;
}
//# sourceMappingURL=types.d.ts.map