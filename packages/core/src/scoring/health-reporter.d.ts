/** Generate health reports for PingApp selector quality. */
import type { SelectorDef } from '../types.js';
import type { AppHealthReport, ValidationReport } from './types.js';
/** Generate a full health report for a PingApp. */
export declare function generateHealthReport(appName: string, url: string, selectors: Record<string, SelectorDef>, validationReport?: ValidationReport): AppHealthReport;
//# sourceMappingURL=health-reporter.d.ts.map