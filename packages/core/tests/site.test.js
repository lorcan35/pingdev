"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const site_js_1 = require("../src/site.js");
const mockAction = async (_ctx) => { };
const minimalSite = {
    name: 'test-site',
    url: 'https://example.com',
    selectors: {},
    states: {
        transitions: { IDLE: ['TYPING'], TYPING: ['DONE'], DONE: ['IDLE'] },
    },
    actions: {
        findOrCreatePage: mockAction,
        typePrompt: mockAction,
        submit: mockAction,
        isGenerating: mockAction,
        isResponseComplete: mockAction,
        extractResponse: mockAction,
    },
    completion: {
        method: 'hash_stability',
        pollMs: 1000,
        stableCount: 3,
        maxWaitMs: 60_000,
    },
};
(0, vitest_1.describe)('defineSite', () => {
    (0, vitest_1.it)('returns site definition with provided config', () => {
        const site = (0, site_js_1.defineSite)(minimalSite);
        (0, vitest_1.expect)(site.name).toBe('test-site');
        (0, vitest_1.expect)(site.url).toBe('https://example.com');
    });
    (0, vitest_1.it)('throws if name is missing', () => {
        (0, vitest_1.expect)(() => (0, site_js_1.defineSite)({ ...minimalSite, name: '' })).toThrow('Site name is required');
    });
    (0, vitest_1.it)('throws if url is missing', () => {
        (0, vitest_1.expect)(() => (0, site_js_1.defineSite)({ ...minimalSite, url: '' })).toThrow('Site URL is required');
    });
    (0, vitest_1.it)('throws if required actions are missing', () => {
        const site = { ...minimalSite, actions: { ...minimalSite.actions, typePrompt: undefined } };
        (0, vitest_1.expect)(() => (0, site_js_1.defineSite)(site)).toThrow('actions.typePrompt is required');
    });
    (0, vitest_1.it)('applies default completion config when not provided', () => {
        const siteWithoutCompletion = { ...minimalSite, completion: undefined };
        const site = (0, site_js_1.defineSite)(siteWithoutCompletion);
        (0, vitest_1.expect)(site.completion).toBeDefined();
        (0, vitest_1.expect)(site.completion.method).toBe('hash_stability');
        (0, vitest_1.expect)(site.completion.stableCount).toBe(3);
    });
    (0, vitest_1.it)('applies default state machine config when not provided', () => {
        const siteWithoutStates = { ...minimalSite, states: undefined };
        const site = (0, site_js_1.defineSite)(siteWithoutStates);
        (0, vitest_1.expect)(site.states).toBeDefined();
        (0, vitest_1.expect)(site.states.transitions['IDLE']).toContain('TYPING');
    });
});
//# sourceMappingURL=site.test.js.map