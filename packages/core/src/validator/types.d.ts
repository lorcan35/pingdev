import type { SelectorDef, StateMachineConfig } from '../types.js';
/** Result of validating a single action. */
export interface ActionValidationResult {
    actionName: string;
    passed: boolean;
    error?: string;
    timing_ms: number;
    extractedContent?: string;
    screenshotBase64?: string;
}
/** Full validation report for a PingApp. */
export interface ValidationReport {
    appName: string;
    url: string;
    timestamp: string;
    results: ActionValidationResult[];
    overallPassed: boolean;
    duration_ms: number;
}
/** Options for the ActionValidator. */
export interface ValidatorOptions {
    /** CDP endpoint URL. Default: http://127.0.0.1:18800 */
    cdpUrl?: string;
    /** Per-action timeout in ms. Default: 15000 */
    timeout?: number;
    /** Capture screenshots on failure. Default: true */
    screenshot?: boolean;
}
/** Parsed PingApp configuration loaded from disk. */
export interface PingAppConfig {
    name: string;
    url: string;
    selectors: Record<string, SelectorDef>;
    states: StateMachineConfig;
}
//# sourceMappingURL=types.d.ts.map