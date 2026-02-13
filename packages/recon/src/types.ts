/** Types for the PingDev reconnaissance engine. */

import type { SelectorDef } from '@pingdev/core';

/** Result of analyzing a website's UI. */
export interface UIMapResult {
  /** Discovered interactive elements with tiered selectors. */
  elements: DiscoveredElement[];
  /** Page structure and navigation patterns. */
  pageStructure: PageStructure;
}

/** A discovered interactive UI element. */
export interface DiscoveredElement {
  /** Human-readable name (e.g., 'chat-input', 'submit-button'). */
  name: string;
  /** Element type (input, button, link, etc.). */
  type: string;
  /** Generated tiered selector definition. */
  selector: SelectorDef;
  /** Confidence score (0-1). */
  confidence: number;
}

/** Page structure analysis. */
export interface PageStructure {
  /** Main content areas. */
  contentAreas: string[];
  /** Navigation elements. */
  navigation: string[];
  /** Form elements. */
  forms: string[];
}

/** Result of scraping a site's documentation. */
export interface DocScrapeResult {
  /** API documentation found. */
  apiDocs: string[];
  /** Help pages / FAQs. */
  helpPages: string[];
  /** Terms of service / rate limits mentioned. */
  constraints: string[];
}

/** Blueprint for generating a PingApp from recon results. */
export interface SiteBlueprint {
  /** Site name (derived from URL). */
  name: string;
  /** Base URL. */
  url: string;
  /** Discovered selectors. */
  selectors: Record<string, SelectorDef>;
  /** Inferred state machine config. */
  states: Record<string, string[]>;
  /** Inferred action flows. */
  actions: Record<string, string>;
  /** Completion detection strategy. */
  completion: {
    method: 'hash_stability' | 'selector_presence' | 'network_idle';
    pollMs: number;
    stableCount: number;
  };
}
