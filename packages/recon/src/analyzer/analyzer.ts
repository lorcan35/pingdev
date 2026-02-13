/** Main site analyzer — orchestrates LLM analysis of a site snapshot. */

import type { SelectorDef } from '@pingdev/core';
import type {
  SiteSnapshot,
  DocScrapeResult,
  SiteDefinitionResult,
  InferredAction,
  InferredState,
  InferredFeature,
} from '../types.js';
import { LLMClient } from './llm-client.js';
import { buildAnalysisPrompt } from './prompts.js';

/** Raw shape returned by the LLM (before we normalize it). */
interface LLMAnalysisResponse {
  purpose?: string;
  category?: string;
  actions?: Array<{
    name?: string;
    description?: string;
    inputSelector?: string | null;
    submitTrigger?: string | null;
    outputSelector?: string | null;
    completionSignal?: string | null;
    isPrimary?: boolean;
  }>;
  states?: Array<{
    name?: string;
    detectionMethod?: string;
    indicatorSelector?: string | null;
    transitions?: string[];
  }>;
  features?: Array<{
    name?: string;
    description?: string;
    activationMethod?: string | null;
  }>;
  completion?: {
    method?: string;
    pollMs?: number;
    stableCount?: number;
    maxWaitMs?: number;
  };
  selectors?: Record<string, { tiers?: string[] }>;
}

export class SiteAnalyzer {
  private llm: LLMClient;

  constructor(options?: { llmEndpoint?: string; llmModel?: string }) {
    this.llm = new LLMClient({
      endpoint: options?.llmEndpoint,
      model: options?.llmModel,
    });
  }

  /** Analyze a site snapshot and return a structured SiteDefinitionResult. */
  async analyze(
    snapshot: SiteSnapshot,
    docs?: DocScrapeResult,
  ): Promise<SiteDefinitionResult> {
    const messages = buildAnalysisPrompt(snapshot, docs);

    let raw: LLMAnalysisResponse;
    try {
      raw = await this.llm.chatJSON<LLMAnalysisResponse>(messages, {
        temperature: 0.2,
        maxTokens: 8192,
      });
    } catch (err) {
      throw new Error(`LLM analysis failed: ${(err as Error).message}`);
    }

    return this.mapToResult(snapshot, raw, docs);
  }

  /** Map raw LLM output into a validated SiteDefinitionResult. */
  private mapToResult(
    snapshot: SiteSnapshot,
    raw: LLMAnalysisResponse,
    docs?: DocScrapeResult,
  ): SiteDefinitionResult {
    const siteName = this.deriveSiteName(snapshot.url);

    const selectors = this.buildSelectors(raw.selectors, snapshot);
    const actions = this.buildActions(raw.actions);
    const states = this.buildStates(raw.states);
    const features = this.buildFeatures(raw.features);
    const completion = this.buildCompletion(raw.completion);
    const stateTransitions = this.buildStateTransitions(states);

    return {
      name: siteName,
      url: snapshot.url,
      purpose: raw.purpose ?? `Web application at ${snapshot.url}`,
      category: raw.category ?? 'other',
      selectors,
      actions,
      states,
      features,
      completion,
      stateTransitions,
      docsSummary: docs
        ? this.buildDocsSummary(docs)
        : undefined,
    };
  }

  private deriveSiteName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      // Remove www. prefix and TLD
      return hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'unknown-site';
    }
  }

  private buildSelectors(
    raw: Record<string, { tiers?: string[] }> | undefined,
    snapshot: SiteSnapshot,
  ): Record<string, SelectorDef> {
    const selectors: Record<string, SelectorDef> = {};

    // Use LLM-provided selectors
    if (raw) {
      for (const [name, def] of Object.entries(raw)) {
        if (def.tiers && Array.isArray(def.tiers) && def.tiers.length > 0) {
          selectors[name] = { name, tiers: def.tiers };
        }
      }
    }

    // Add selectors from snapshot elements if not already covered
    for (const el of snapshot.elements) {
      if (selectors[el.name]) continue;

      const tiers: string[] = [];
      if (el.ariaSelectors.length) tiers.push(el.ariaSelectors[0]);
      if (el.cssSelectors.length) tiers.push(el.cssSelectors[0]);
      if (el.xpathSelectors.length) tiers.push(el.xpathSelectors[0]);

      if (tiers.length > 0 && el.interactiveConfidence > 0.5) {
        selectors[el.name] = { name: el.name, tiers };
      }
    }

    return selectors;
  }

  private buildActions(
    raw: LLMAnalysisResponse['actions'],
  ): InferredAction[] {
    if (!raw || !Array.isArray(raw)) return [];

    return raw
      .filter((a) => a.name)
      .map((a) => ({
        name: a.name!,
        description: a.description ?? '',
        inputSelector: a.inputSelector ?? undefined,
        submitTrigger: a.submitTrigger ?? undefined,
        outputSelector: a.outputSelector ?? undefined,
        completionSignal: a.completionSignal ?? undefined,
        isPrimary: a.isPrimary ?? false,
      }));
  }

  private buildStates(
    raw: LLMAnalysisResponse['states'],
  ): InferredState[] {
    if (!raw || !Array.isArray(raw)) {
      // Return minimal defaults
      return [
        { name: 'idle', detectionMethod: 'default', transitions: ['loading'] },
        { name: 'loading', detectionMethod: 'default', indicatorSelector: undefined, transitions: ['done', 'error'] },
        { name: 'done', detectionMethod: 'default', indicatorSelector: undefined, transitions: ['idle'] },
        { name: 'error', detectionMethod: 'default', indicatorSelector: undefined, transitions: ['idle'] },
      ];
    }

    return raw
      .filter((s) => s.name)
      .map((s) => ({
        name: s.name!,
        detectionMethod: s.detectionMethod ?? 'unknown',
        indicatorSelector: s.indicatorSelector ?? undefined,
        transitions: s.transitions ?? [],
      }));
  }

  private buildFeatures(
    raw: LLMAnalysisResponse['features'],
  ): InferredFeature[] {
    if (!raw || !Array.isArray(raw)) return [];

    return raw
      .filter((f) => f.name)
      .map((f) => ({
        name: f.name!,
        description: f.description ?? '',
        activationMethod: f.activationMethod ?? undefined,
      }));
  }

  private buildCompletion(
    raw: LLMAnalysisResponse['completion'],
  ): SiteDefinitionResult['completion'] {
    const validMethods = ['hash_stability', 'selector_presence', 'network_idle'] as const;
    const method = validMethods.includes(raw?.method as typeof validMethods[number])
      ? (raw!.method as typeof validMethods[number])
      : 'hash_stability';

    return {
      method,
      pollMs: clamp(raw?.pollMs ?? 500, 100, 2000),
      stableCount: clamp(raw?.stableCount ?? 3, 1, 10),
      maxWaitMs: clamp(raw?.maxWaitMs ?? 60_000, 5_000, 300_000),
    };
  }

  private buildStateTransitions(
    states: InferredState[],
  ): Record<string, string[]> {
    const transitions: Record<string, string[]> = {};
    for (const state of states) {
      transitions[state.name] = state.transitions;
    }
    return transitions;
  }

  private buildDocsSummary(docs: DocScrapeResult): string {
    const parts: string[] = [];
    if (docs.apiDocs.length > 0) {
      parts.push(`API docs: ${docs.apiDocs.length} pages found`);
    }
    if (docs.helpPages.length > 0) {
      parts.push(`Help pages: ${docs.helpPages.length} pages found`);
    }
    if (docs.constraints.length > 0) {
      parts.push(`Constraints: ${docs.constraints.join('; ').slice(0, 200)}`);
    }
    return parts.join('. ') || 'No documentation found';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
