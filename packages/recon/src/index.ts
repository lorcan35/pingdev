/**
 * @pingdev/recon — Reconnaissance engine for PingDev.
 *
 * Analyzes any website and generates a complete PingApp config.
 * Pipeline: snapshot → analyze → generate
 */

// ─── Pipeline ─────────────────────────────────────────────────────
export { runRecon } from './pipeline.js';

// ─── Snapshot Engine ──────────────────────────────────────────────
export { SnapshotEngine, type SnapshotOptions } from './snapshot/index.js';
export { discoverElements } from './snapshot/elements.js';
export { discoverRegions } from './snapshot/regions.js';
export { detectDynamicAreas } from './snapshot/dynamic.js';
export { captureAriaTree } from './snapshot/aria.js';
export { captureScreenshots } from './snapshot/screenshots.js';

// ─── Analyzer ─────────────────────────────────────────────────────
export { SiteAnalyzer } from './analyzer/analyzer.js';
export { LLMClient, type LLMClientOptions, type ChatMessage } from './analyzer/llm-client.js';
export { DocScraper } from './analyzer/doc-scraper.js';
export { buildAnalysisPrompt } from './analyzer/prompts.js';

// ─── Generator ────────────────────────────────────────────────────
export { PingAppGenerator } from './generator/generator.js';
export { SelfTester, type SelfTestResult } from './generator/self-test.js';

// ─── Healer ──────────────────────────────────────────────────────
export { Healer, buildHealingPrompt, readSelectorsFile, writeSelectorsFile, applyPatches } from './healer/index.js';
export type { HealingPatch, HealingAttempt, HealingReport, HealingResult, HealerOptions } from './healer/index.js';

// ─── Types ────────────────────────────────────────────────────────
export type {
  // Snapshot types
  SiteSnapshot,
  SnapshotElement,
  PageRegion,
  DynamicArea,
  ScreenshotData,
  AriaNode,
  // Analyzer types
  DocScrapeResult,
  SiteDefinitionResult,
  InferredAction,
  InferredState,
  InferredFeature,
  // Generator types
  GeneratorConfig,
  GeneratorResult,
  // Pipeline types
  ReconOptions,
  ReconResult,
  // Legacy types
  UIMapResult,
  DiscoveredElement,
  PageStructure,
  SiteBlueprint,
} from './types.js';
