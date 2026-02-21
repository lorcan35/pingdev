/**
 * Zero-Shot Site Adaptation — Heuristic page-type detection and schema generation.
 *
 * Runs entirely in the gateway by analyzing DOM data returned from the extension's
 * content script. No LLM calls needed — pure heuristic pattern matching in <100ms.
 *
 * The content script sends back a lightweight DOM snapshot (via the "discover" op)
 * containing: visible text, tag structure, meta tags, JSON-LD, and interactive elements.
 * This module classifies the page type and generates extraction schemas.
 */
import type { DiscoverResult } from './types.js';
interface DomSnapshot {
    url?: string;
    title?: string;
    meta?: Record<string, string>;
    jsonLd?: Record<string, unknown>[];
    elements?: DomElement[];
    tables?: TableInfo[];
    forms?: FormInfo[];
    repeatedGroups?: RepeatedGroup[];
}
/** Build a compact, local-model-friendly summary of discovered elements for selector synthesis. */
export declare function buildDiscoverSummaryForLLM(snapshot: Record<string, unknown>, elementLimit?: number, maxChars?: number): string;
interface DomElement {
    tag: string;
    id?: string;
    classes?: string[];
    text?: string;
    ariaLabel?: string;
    attributes?: Record<string, string>;
    selector?: string;
}
interface TableInfo {
    selector: string;
    headers: string[];
    rowCount: number;
}
interface FormInfo {
    selector: string;
    action?: string;
    method?: string;
    inputs: Array<{
        name: string;
        type: string;
        selector: string;
        label?: string;
    }>;
}
interface RepeatedGroup {
    containerSelector: string;
    itemSelector: string;
    count: number;
    sampleFields?: Record<string, string>;
}
/**
 * Analyze a DOM snapshot and return the best page type + extraction schemas.
 * Runs all classifiers and picks the highest-confidence match.
 */
export declare function discoverPage(snapshot: DomSnapshot): DiscoverResult;
export {};
//# sourceMappingURL=discover-engine.d.ts.map