"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineSite = defineSite;
/** Define a site for PingDev. Validates required fields and applies defaults. */
function defineSite(config) {
    if (!config.name)
        throw new Error('Site name is required');
    if (!config.url)
        throw new Error('Site URL is required');
    if (!config.actions.typePrompt)
        throw new Error('actions.typePrompt is required');
    if (!config.actions.submit)
        throw new Error('actions.submit is required');
    if (!config.actions.extractResponse)
        throw new Error('actions.extractResponse is required');
    if (!config.actions.findOrCreatePage)
        throw new Error('actions.findOrCreatePage is required');
    if (!config.actions.isGenerating)
        throw new Error('actions.isGenerating is required');
    if (!config.actions.isResponseComplete)
        throw new Error('actions.isResponseComplete is required');
    return {
        ...config,
        completion: config.completion ?? {
            method: 'hash_stability',
            pollMs: 750,
            stableCount: 3,
            maxWaitMs: 120_000,
        },
        states: config.states ?? {
            transitions: {
                IDLE: ['TYPING', 'NEEDS_HUMAN'],
                TYPING: ['GENERATING', 'IDLE', 'FAILED', 'NEEDS_HUMAN'],
                GENERATING: ['DONE', 'FAILED', 'NEEDS_HUMAN'],
                DONE: ['IDLE'],
                FAILED: ['IDLE'],
                NEEDS_HUMAN: ['IDLE'],
            },
        },
    };
}
//# sourceMappingURL=site.js.map