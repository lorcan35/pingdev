"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSelector = resolveSelector;
exports.resolveSelectorOrThrow = resolveSelectorOrThrow;
const logger_js_1 = require("../logger.js");
const log = logger_js_1.logger.child({ module: 'selector-resolver' });
async function resolveSelector(page, selectorDef, timeoutMs = 5000) {
    const perTierTimeout = Math.max(1000, Math.floor(timeoutMs / selectorDef.tiers.length));
    for (let i = 0; i < selectorDef.tiers.length; i++) {
        const selector = selectorDef.tiers[i];
        try {
            const locator = page.locator(selector).first();
            const visible = await locator.isVisible({ timeout: perTierTimeout });
            if (visible) {
                log.debug({ name: selectorDef.name, tier: i + 1, selector }, 'Selector resolved');
                return locator;
            }
        }
        catch {
            // Tier didn't match — try next
        }
    }
    log.warn({ name: selectorDef.name, tiers: selectorDef.tiers.length }, 'No selector tier matched');
    return null;
}
async function resolveSelectorOrThrow(page, selectorDef, timeoutMs = 5000) {
    const result = await resolveSelector(page, selectorDef, timeoutMs);
    if (!result) {
        throw new Error(`Selector not found: ${selectorDef.name} (tried ${selectorDef.tiers.length} tiers)`);
    }
    return result;
}
//# sourceMappingURL=selector-resolver.js.map