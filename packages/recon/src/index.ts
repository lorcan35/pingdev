/**
 * @pingdev/recon — Reconnaissance engine for PingDev.
 *
 * Phase 2+ will implement:
 * - UIMapper: Crawl a site, discover interactive elements, generate selectors
 * - DocScraper: Find and parse site documentation
 * - LLMAnalyzer: Use LLM to infer actions, states, and flows
 *
 * For now, this is a scaffold with interfaces defined.
 */

export type { UIMapResult, DiscoveredElement, PageStructure, DocScrapeResult, SiteBlueprint } from './types.js';

/** UI Mapper — discovers interactive elements on a page. */
export interface UIMapper {
  map(url: string): Promise<import('./types.js').UIMapResult>;
}

/** Documentation Scraper — finds and parses site docs. */
export interface DocScraper {
  scrape(url: string): Promise<import('./types.js').DocScrapeResult>;
}

/** LLM Analyzer — uses AI to infer site behavior. */
export interface LLMAnalyzer {
  analyze(
    uiMap: import('./types.js').UIMapResult,
    docs: import('./types.js').DocScrapeResult,
  ): Promise<import('./types.js').SiteBlueprint>;
}
