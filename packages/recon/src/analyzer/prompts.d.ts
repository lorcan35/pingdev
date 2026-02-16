/** LLM prompt templates for site analysis. */
import type { SiteSnapshot, DocScrapeResult } from '../types.js';
import type { ChatMessage } from './llm-client.js';
/** Build the analysis prompt messages from a snapshot and optional docs. */
export declare function buildAnalysisPrompt(snapshot: SiteSnapshot, docs?: DocScrapeResult): ChatMessage[];
//# sourceMappingURL=prompts.d.ts.map