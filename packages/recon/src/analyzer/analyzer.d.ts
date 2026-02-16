/** Main site analyzer — orchestrates LLM analysis of a site snapshot. */
import type { SiteSnapshot, DocScrapeResult, SiteDefinitionResult } from '../types.js';
export declare class SiteAnalyzer {
    private llm;
    constructor(options?: {
        llmEndpoint?: string;
        llmModel?: string;
    });
    /** Analyze a site snapshot and return a structured SiteDefinitionResult. */
    analyze(snapshot: SiteSnapshot, docs?: DocScrapeResult): Promise<SiteDefinitionResult>;
    /** Map raw LLM output into a validated SiteDefinitionResult. */
    private mapToResult;
    private deriveSiteName;
    private buildSelectors;
    private buildActions;
    private buildStates;
    private buildFeatures;
    private buildCompletion;
    private buildStateTransitions;
    private buildDocsSummary;
}
//# sourceMappingURL=analyzer.d.ts.map