import type { Page } from 'playwright';
import type { SelectorDef } from '../types.js';
import type { ActionValidationResult, ValidationReport, ValidatorOptions } from './types.js';
/**
 * Validates a PingApp's actions against a live site via CDP.
 * Connects to the browser, navigates to the site, and tests each core action.
 */
export declare class ActionValidator {
    private selectors;
    private siteUrl;
    private options;
    private log;
    constructor(selectors: Record<string, SelectorDef>, siteUrl: string, options?: ValidatorOptions);
    /** Run full validation and return a report. */
    validate(): Promise<ValidationReport>;
    /** Validate that a single selector resolves on the current page. */
    validateSelector(page: Page, selectorDef: SelectorDef): Promise<ActionValidationResult>;
    /** Run a single validation step with timing and error capture. */
    private runStep;
    /** Build the final ValidationReport. */
    private buildReport;
}
//# sourceMappingURL=validator.d.ts.map