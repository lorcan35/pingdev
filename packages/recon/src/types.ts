/** Types for the PingDev reconnaissance engine. */

import type { SelectorDef, CompletionConfig, StateMachineConfig } from '@pingdev/core';

// ─── Snapshot Types ───────────────────────────────────────────────

/** A region of the page (header, sidebar, main, footer, etc.). */
export interface PageRegion {
  /** Region identifier. */
  name: string;
  /** Role of the region (header, nav, main, footer, complementary, form, dialog). */
  role: string;
  /** Bounding box on page. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Elements within this region. */
  elementIds: string[];
}

/** A single interactive element discovered on the page. */
export interface SnapshotElement {
  /** Unique ID within the snapshot. */
  id: string;
  /** Human-readable name (e.g., 'chat-input', 'submit-button'). */
  name: string;
  /** Element type: input, button, link, textarea, select, checkbox, radio, etc. */
  type: string;
  /** ARIA role if present. */
  role?: string;
  /** ARIA label or visible label. */
  label?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Tooltip / title attribute. */
  tooltip?: string;
  /** Current value (for inputs). */
  value?: string;
  /** Current state: visible, hidden, disabled, checked, expanded, etc. */
  states: string[];
  /** CSS selectors (tiered, most specific first). */
  cssSelectors: string[];
  /** XPath selectors. */
  xpathSelectors: string[];
  /** ARIA-based selectors. */
  ariaSelectors: string[];
  /** All visible text content. */
  textContent?: string;
  /** Bounding box on page. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** Region this element belongs to. */
  regionName?: string;
  /** Confidence score that this element is interactive (0-1). */
  interactiveConfidence: number;
}

/** A dynamic content area where content changes (chat output, loading areas). */
export interface DynamicArea {
  /** Descriptive name. */
  name: string;
  /** CSS selector for the container. */
  selector: string;
  /** What type of dynamic content: response-output, loading-indicator, notification, live-update. */
  contentType: string;
  /** Observed mutation patterns. */
  mutationHints: string[];
}

/** Screenshot captured during snapshot. */
export interface ScreenshotData {
  /** Label: 'full-page', or region name. */
  label: string;
  /** Base64 PNG data. */
  base64: string;
  /** Dimensions. */
  width: number;
  height: number;
}

/** ARIA tree node from accessibility snapshot. */
export interface AriaNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  level?: number;
  pressed?: boolean | 'mixed';
  selected?: boolean;
  children?: AriaNode[];
}

/** Complete snapshot of a website. */
export interface SiteSnapshot {
  /** URL that was snapshotted. */
  url: string;
  /** Page title. */
  title: string;
  /** Timestamp of snapshot. */
  timestamp: string;
  /** All discovered interactive elements. */
  elements: SnapshotElement[];
  /** Page regions. */
  regions: PageRegion[];
  /** Dynamic content areas. */
  dynamicAreas: DynamicArea[];
  /** Accessibility tree. */
  ariaTree: AriaNode[];
  /** Screenshots. */
  screenshots: ScreenshotData[];
  /** All visible text on the page. */
  visibleText: string[];
  /** All links found. */
  links: { text: string; href: string; isInternal: boolean }[];
  /** Page metadata. */
  meta: {
    description?: string;
    viewport?: string;
    charset?: string;
    ogTitle?: string;
    ogDescription?: string;
  };
}

// ─── Legacy Compatibility ─────────────────────────────────────────

/** Result of analyzing a website's UI (legacy, use SiteSnapshot instead). */
export interface UIMapResult {
  elements: DiscoveredElement[];
  pageStructure: PageStructure;
}

/** A discovered interactive UI element (legacy). */
export interface DiscoveredElement {
  name: string;
  type: string;
  selector: SelectorDef;
  confidence: number;
}

/** Page structure analysis (legacy). */
export interface PageStructure {
  contentAreas: string[];
  navigation: string[];
  forms: string[];
}

// ─── Analyzer Types ───────────────────────────────────────────────

/** Result of scraping a site's documentation. */
export interface DocScrapeResult {
  /** API documentation found. */
  apiDocs: string[];
  /** Help pages / FAQs. */
  helpPages: string[];
  /** Terms of service / rate limits mentioned. */
  constraints: string[];
  /** Raw URLs that were scraped. */
  scrapedUrls: string[];
}

/** An action inferred by the LLM analyzer. */
export interface InferredAction {
  /** Action name (e.g., 'sendMessage', 'newChat', 'uploadFile'). */
  name: string;
  /** Human description of the action. */
  description: string;
  /** CSS selector for the input element. */
  inputSelector?: string;
  /** CSS selector or method for the submit trigger. */
  submitTrigger?: string;
  /** CSS selector where output appears. */
  outputSelector?: string;
  /** How to detect this action completed. */
  completionSignal?: string;
  /** Is this a required/primary action? */
  isPrimary: boolean;
}

/** A state inferred by the LLM analyzer. */
export interface InferredState {
  /** State name (e.g., 'idle', 'loading', 'generating', 'done', 'error'). */
  name: string;
  /** How to detect this state. */
  detectionMethod: string;
  /** CSS selector that indicates this state. */
  indicatorSelector?: string;
  /** Valid transitions from this state. */
  transitions: string[];
}

/** A tool/mode/feature detected on the site. */
export interface InferredFeature {
  /** Feature name. */
  name: string;
  /** Feature description. */
  description: string;
  /** How to activate it. */
  activationMethod?: string;
}

/** Full site definition produced by the analyzer. */
export interface SiteDefinitionResult {
  /** Site name (derived from URL). */
  name: string;
  /** Base URL. */
  url: string;
  /** What the site does. */
  purpose: string;
  /** Site category (chat, search, code, image-gen, etc.). */
  category: string;
  /** Discovered selectors mapped to SelectorDef format. */
  selectors: Record<string, SelectorDef>;
  /** Inferred actions. */
  actions: InferredAction[];
  /** Inferred states. */
  states: InferredState[];
  /** Inferred features / tools / modes. */
  features: InferredFeature[];
  /** Completion detection config. */
  completion: {
    method: 'hash_stability' | 'selector_presence' | 'network_idle';
    pollMs: number;
    stableCount: number;
    maxWaitMs: number;
  };
  /** State machine transitions. */
  stateTransitions: Record<string, string[]>;
  /** Scraped docs summary. */
  docsSummary?: string;
}

/** Blueprint for generating a PingApp (legacy compat). */
export interface SiteBlueprint {
  name: string;
  url: string;
  selectors: Record<string, SelectorDef>;
  states: Record<string, string[]>;
  actions: Record<string, string>;
  completion: {
    method: 'hash_stability' | 'selector_presence' | 'network_idle';
    pollMs: number;
    stableCount: number;
  };
}

// ─── Generator Types ──────────────────────────────────────────────

/** Configuration for what the generator should produce. */
export interface GeneratorConfig {
  /** Output directory for the generated PingApp. */
  outputDir: string;
  /** Site definition from the analyzer. */
  siteDefinition: SiteDefinitionResult;
  /** Whether to run self-test after generation. */
  selfTest: boolean;
  /** Max retries for self-test fix loop. */
  maxRetries: number;
}

/** Result of the code generation step. */
export interface GeneratorResult {
  /** Output directory where the PingApp was generated. */
  outputDir: string;
  /** Files that were generated. */
  generatedFiles: string[];
  /** Whether the generated code compiles. */
  compiles: boolean;
  /** Build errors (if any). */
  buildErrors: string[];
  /** Number of fix attempts made. */
  fixAttempts: number;
}

// ─── Pipeline Types ───────────────────────────────────────────────

/** Options for the full recon pipeline. */
export interface ReconOptions {
  /** URL to analyze. */
  url: string;
  /** Stop after snapshot. */
  snapshotOnly?: boolean;
  /** Stop after analysis (no code gen). */
  analyzeOnly?: boolean;
  /** Show what would be generated without writing files. */
  dryRun?: boolean;
  /** Output directory override. */
  outputDir?: string;
  /** LLM endpoint URL. */
  llmEndpoint?: string;
  /** LLM model name. */
  llmModel?: string;
  /** Run self-test after generation. */
  selfTest?: boolean;
}

/** Result of the full recon pipeline. */
export interface ReconResult {
  /** The site snapshot. */
  snapshot: SiteSnapshot;
  /** The site analysis (if run). */
  analysis?: SiteDefinitionResult;
  /** The generated code result (if run). */
  generation?: GeneratorResult;
  /** Overall status. */
  status: 'snapshot-only' | 'analyzed' | 'generated' | 'verified' | 'generated-with-issues';
  /** Duration in milliseconds. */
  durationMs: number;
}
