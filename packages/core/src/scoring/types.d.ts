/** Confidence scoring types for PingApp health evaluation. */
export type SelectorTier = 'aria' | 'data-testid' | 'semantic-id' | 'css-class' | 'xpath' | 'positional';
export interface SelectorScore {
    name: string;
    tier: SelectorTier;
    confidence: number;
    reason: string;
}
export interface ActionScore {
    actionName: string;
    selectorScores: SelectorScore[];
    testPassRate: number;
    avgTiming_ms: number;
    timingConsistency: number;
    overallScore: number;
}
export interface AppHealthReport {
    appName: string;
    url: string;
    timestamp: string;
    actionScores: ActionScore[];
    overallScore: number;
    warnings: string[];
    recommendations: string[];
}
/** Validation result for a single action (from test runs). */
export interface ValidationResult {
    actionName: string;
    passed: number;
    failed: number;
    timings_ms: number[];
}
/** Validation report aggregating all action results. */
export interface ValidationReport {
    results: ValidationResult[];
}
//# sourceMappingURL=types.d.ts.map