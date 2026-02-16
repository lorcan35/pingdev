"use strict";
/** Main site analyzer — orchestrates LLM analysis of a site snapshot. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteAnalyzer = void 0;
const llm_client_js_1 = require("./llm-client.js");
const prompts_js_1 = require("./prompts.js");
class SiteAnalyzer {
    llm;
    constructor(options) {
        this.llm = new llm_client_js_1.LLMClient({
            endpoint: options?.llmEndpoint,
            model: options?.llmModel,
        });
    }
    /** Analyze a site snapshot and return a structured SiteDefinitionResult. */
    async analyze(snapshot, docs) {
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot, docs);
        let raw;
        try {
            raw = await this.llm.chatJSON(messages, {
                temperature: 0.2,
                maxTokens: 8192,
            });
        }
        catch (err) {
            throw new Error(`LLM analysis failed: ${err.message}`);
        }
        return this.mapToResult(snapshot, raw, docs);
    }
    /** Map raw LLM output into a validated SiteDefinitionResult. */
    mapToResult(snapshot, raw, docs) {
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
    deriveSiteName(url) {
        try {
            const hostname = new URL(url).hostname;
            // Remove www. prefix and TLD
            return hostname.replace(/^www\./, '').split('.')[0];
        }
        catch {
            return 'unknown-site';
        }
    }
    buildSelectors(raw, snapshot) {
        const selectors = {};
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
            if (selectors[el.name])
                continue;
            const tiers = [];
            if (el.ariaSelectors.length)
                tiers.push(el.ariaSelectors[0]);
            if (el.cssSelectors.length)
                tiers.push(el.cssSelectors[0]);
            if (el.xpathSelectors.length)
                tiers.push(el.xpathSelectors[0]);
            if (tiers.length > 0 && el.interactiveConfidence > 0.5) {
                selectors[el.name] = { name: el.name, tiers };
            }
        }
        return selectors;
    }
    buildActions(raw) {
        if (!raw || !Array.isArray(raw))
            return [];
        return raw
            .filter((a) => a.name)
            .map((a) => ({
            name: a.name,
            description: a.description ?? '',
            inputSelector: a.inputSelector ?? undefined,
            submitTrigger: a.submitTrigger ?? undefined,
            outputSelector: a.outputSelector ?? undefined,
            completionSignal: a.completionSignal ?? undefined,
            isPrimary: a.isPrimary ?? false,
        }));
    }
    buildStates(raw) {
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
            name: s.name,
            detectionMethod: s.detectionMethod ?? 'unknown',
            indicatorSelector: s.indicatorSelector ?? undefined,
            transitions: s.transitions ?? [],
        }));
    }
    buildFeatures(raw) {
        if (!raw || !Array.isArray(raw))
            return [];
        return raw
            .filter((f) => f.name)
            .map((f) => ({
            name: f.name,
            description: f.description ?? '',
            activationMethod: f.activationMethod ?? undefined,
        }));
    }
    buildCompletion(raw) {
        const validMethods = ['hash_stability', 'selector_presence', 'network_idle'];
        const method = validMethods.includes(raw?.method)
            ? raw.method
            : 'hash_stability';
        return {
            method,
            pollMs: clamp(raw?.pollMs ?? 500, 100, 2000),
            stableCount: clamp(raw?.stableCount ?? 3, 1, 10),
            maxWaitMs: clamp(raw?.maxWaitMs ?? 60_000, 5_000, 300_000),
        };
    }
    buildStateTransitions(states) {
        const transitions = {};
        for (const state of states) {
            transitions[state.name] = state.transitions;
        }
        return transitions;
    }
    buildDocsSummary(docs) {
        const parts = [];
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
exports.SiteAnalyzer = SiteAnalyzer;
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=analyzer.js.map