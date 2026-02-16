"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeHealer = void 0;
const selector_resolver_js_1 = require("../browser/selector-resolver.js");
const logger_js_1 = require("../logger.js");
const healing_log_js_1 = require("./healing-log.js");
const log = (0, logger_js_1.createLogger)('runtime-healer');
class RuntimeHealer {
    registry;
    config;
    healingLog;
    constructor(registry, config) {
        this.registry = registry;
        this.config = config;
        this.healingLog = new healing_log_js_1.HealingLog(config.healingLogPath);
    }
    /**
     * Resolve a selector with automatic healing on failure.
     * Falls back to LLM-based repair if self-healing is enabled.
     */
    async resolveWithHealing(page, selectorDef, timeout) {
        // First try normal resolution
        const locator = await (0, selector_resolver_js_1.resolveSelector)(page, selectorDef, timeout);
        if (locator) {
            return locator;
        }
        // If self-healing is disabled, return null
        if (!this.config.enableSelfHealing) {
            return null;
        }
        log.info({ name: selectorDef.name }, 'Selector failed — attempting self-healing');
        const maxAttempts = this.config.maxHealAttempts;
        let lastError = `All ${selectorDef.tiers.length} tiers failed to match`;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            log.info({ name: selectorDef.name, attempt, maxAttempts }, 'Healing attempt');
            try {
                // a) Capture ARIA snapshot of current page
                const ariaTree = await this.captureAriaSnapshot(page);
                // b) Build prompt for the LLM
                const prompt = this.buildHealingPrompt(selectorDef, lastError, ariaTree);
                // c) Call LLM
                const llmResponse = await this.callLLM(prompt);
                // d) Parse response for new tiers
                const newTiers = this.parseNewTiers(llmResponse);
                if (newTiers.length === 0) {
                    log.warn({ attempt }, 'LLM returned no valid tiers');
                    continue;
                }
                const oldTiers = [...selectorDef.tiers];
                // e) Hot-patch the registry
                this.registry.hotPatch(selectorDef.name, newTiers);
                // f) Log to healing log
                const entry = {
                    timestamp: new Date().toISOString(),
                    selectorName: selectorDef.name,
                    oldTiers,
                    newTiers,
                    error: lastError,
                    fixed: false,
                    source: 'runtime',
                };
                // g) Retry resolve with new selector
                const patchedDef = this.registry.getSelector(selectorDef.name);
                if (patchedDef) {
                    const healed = await (0, selector_resolver_js_1.resolveSelector)(page, patchedDef, timeout);
                    if (healed) {
                        entry.fixed = true;
                        this.healingLog.append(entry);
                        log.info({ name: selectorDef.name, attempt }, 'Self-healing succeeded');
                        return healed;
                    }
                }
                this.healingLog.append(entry);
                lastError = `Healing attempt ${attempt} produced tiers that did not match`;
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                log.warn({ name: selectorDef.name, attempt, error: lastError }, 'Healing attempt failed');
            }
        }
        log.error({ name: selectorDef.name, maxAttempts }, 'Self-healing exhausted all attempts');
        return null;
    }
    /** Capture the ARIA snapshot of the page. */
    async captureAriaSnapshot(page) {
        try {
            // Playwright 1.49+ ariaSnapshot on locator
            const snapshot = await page.locator('body').ariaSnapshot();
            return snapshot;
        }
        catch {
            // Fallback: get inner text of the body
            try {
                const bodyText = await page.locator('body').innerText({ timeout: 5000 });
                return bodyText.slice(0, 8000);
            }
            catch {
                return '<unable to capture page content>';
            }
        }
    }
    /** Build the healing prompt for the LLM. */
    buildHealingPrompt(selectorDef, error, ariaTree) {
        return JSON.stringify([
            {
                role: 'system',
                content: `You are a Playwright selector repair tool. A selector failed to find a matching element on a live page.
Examine the ARIA tree and suggest new CSS/ARIA/role selectors that match the intended element.
Respond with JSON only: { "tiers": ["selector1", "selector2", ...], "reasoning": "brief explanation" }`,
            },
            {
                role: 'user',
                content: `Selector "${selectorDef.name}" with tiers ${JSON.stringify(selectorDef.tiers)} failed.

Error: ${error}

Page ARIA tree:
${ariaTree.slice(0, 6000)}

Suggest new CSS/ARIA selectors that will match the intended element.`,
            },
        ]);
    }
    /** Call the LLM endpoint to get healing suggestions. */
    async callLLM(prompt) {
        const { LLMClient } = require('@pingdev/recon');
        const client = new LLMClient({
            endpoint: this.config.llmEndpoint,
            model: this.config.llmModel,
        });
        const messages = JSON.parse(prompt);
        return client.chat(messages);
    }
    /** Parse the LLM response to extract new tiers. */
    parseNewTiers(response) {
        try {
            // Strip thinking tags and markdown fences
            let cleaned = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            // Try direct parse
            let parsed;
            try {
                parsed = JSON.parse(cleaned);
            }
            catch {
                // Try extracting JSON from markdown fences
                const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (fenceMatch) {
                    parsed = JSON.parse(fenceMatch[1].trim());
                }
                else {
                    const objMatch = cleaned.match(/(\{[\s\S]*\})/);
                    if (objMatch) {
                        parsed = JSON.parse(objMatch[1].trim());
                    }
                    else {
                        return [];
                    }
                }
            }
            if (Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
                return parsed.tiers.filter((t) => typeof t === 'string' && t.length > 0);
            }
            return [];
        }
        catch {
            log.warn('Failed to parse LLM healing response');
            return [];
        }
    }
}
exports.RuntimeHealer = RuntimeHealer;
//# sourceMappingURL=runtime-healer.js.map