/**
 * @pingdev/recon — Reconnaissance engine for PingDev.
 *
 * Analyzes any website and generates a complete PingApp config.
 * Pipeline: snapshot → analyze → generate
 */
export { runRecon } from './pipeline.js';
export { SnapshotEngine, type SnapshotOptions } from './snapshot/index.js';
export { discoverElements } from './snapshot/elements.js';
export { discoverRegions } from './snapshot/regions.js';
export { detectDynamicAreas } from './snapshot/dynamic.js';
export { captureAriaTree } from './snapshot/aria.js';
export { captureScreenshots } from './snapshot/screenshots.js';
export { SiteAnalyzer } from './analyzer/analyzer.js';
export { LLMClient, type LLMClientOptions, type ChatMessage } from './analyzer/llm-client.js';
export { DocScraper } from './analyzer/doc-scraper.js';
export { buildAnalysisPrompt } from './analyzer/prompts.js';
export { PingAppGenerator } from './generator/generator.js';
export { SelfTester, type SelfTestResult } from './generator/self-test.js';
export { Healer, buildHealingPrompt, readSelectorsFile, writeSelectorsFile, applyPatches } from './healer/index.js';
export type { HealingPatch, HealingAttempt, HealingReport, HealingResult, HealerOptions } from './healer/index.js';
export type { SiteSnapshot, SnapshotElement, PageRegion, DynamicArea, ScreenshotData, AriaNode, DocScrapeResult, SiteDefinitionResult, InferredAction, InferredState, InferredFeature, GeneratorConfig, GeneratorResult, ReconOptions, ReconResult, UIMapResult, DiscoveredElement, PageStructure, SiteBlueprint, } from './types.js';
//# sourceMappingURL=index.d.ts.map