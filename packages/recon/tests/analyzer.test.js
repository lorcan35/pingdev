"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const llm_client_js_1 = require("../src/analyzer/llm-client.js");
const prompts_js_1 = require("../src/analyzer/prompts.js");
const doc_scraper_js_1 = require("../src/analyzer/doc-scraper.js");
const analyzer_js_1 = require("../src/analyzer/analyzer.js");
// ─── Mock Data ───────────────────────────────────────────────────
function mockSnapshot(overrides) {
    return {
        url: 'https://gemini.google.com',
        title: 'Gemini',
        timestamp: new Date().toISOString(),
        elements: [
            {
                id: 'el-1',
                name: 'chat-input',
                type: 'textarea',
                role: 'textbox',
                label: 'Enter a prompt here',
                placeholder: 'Enter a prompt here',
                states: ['visible'],
                cssSelectors: ['.ql-editor[contenteditable="true"]', 'div[role="textbox"]'],
                xpathSelectors: ['//div[@role="textbox"]'],
                ariaSelectors: ['[role="textbox"][aria-label="Enter a prompt here"]'],
                interactiveConfidence: 0.95,
                regionName: 'main',
            },
            {
                id: 'el-2',
                name: 'submit-button',
                type: 'button',
                role: 'button',
                label: 'Send message',
                states: ['visible'],
                cssSelectors: ['button[aria-label="Send message"]', '.send-button'],
                xpathSelectors: ['//button[@aria-label="Send message"]'],
                ariaSelectors: ['[role="button"][aria-label="Send message"]'],
                interactiveConfidence: 0.98,
                regionName: 'main',
            },
            {
                id: 'el-3',
                name: 'new-chat-button',
                type: 'button',
                role: 'button',
                label: 'New chat',
                states: ['visible'],
                cssSelectors: ['button[aria-label="New chat"]'],
                xpathSelectors: ['//button[@aria-label="New chat"]'],
                ariaSelectors: ['[role="button"][aria-label="New chat"]'],
                interactiveConfidence: 0.90,
                regionName: 'header',
            },
        ],
        regions: [
            { name: 'header', role: 'header', bounds: { x: 0, y: 0, width: 1200, height: 64 }, elementIds: ['el-3'] },
            { name: 'main', role: 'main', bounds: { x: 0, y: 64, width: 1200, height: 700 }, elementIds: ['el-1', 'el-2'] },
        ],
        dynamicAreas: [
            {
                name: 'response-container',
                selector: '.response-container',
                contentType: 'response-output',
                mutationHints: ['childList', 'characterData'],
            },
        ],
        ariaTree: [{ role: 'document', name: 'Gemini', children: [] }],
        screenshots: [],
        visibleText: ['Gemini', 'Enter a prompt here', 'New chat'],
        links: [
            { text: 'Help', href: 'https://support.google.com/gemini', isInternal: false },
            { text: 'FAQ', href: '/faq', isInternal: true },
            { text: 'Terms', href: '/terms', isInternal: true },
        ],
        meta: { description: 'Google Gemini AI assistant' },
        ...overrides,
    };
}
const mockLLMResponse = {
    purpose: 'AI chat assistant powered by Google Gemini',
    category: 'chat',
    actions: [
        {
            name: 'sendMessage',
            description: 'Send a message to Gemini',
            inputSelector: '.ql-editor[contenteditable="true"]',
            submitTrigger: 'button[aria-label="Send message"]',
            outputSelector: '.response-container',
            completionSignal: 'Hash stability of .response-container',
            isPrimary: true,
        },
        {
            name: 'newChat',
            description: 'Start a new chat conversation',
            inputSelector: null,
            submitTrigger: 'button[aria-label="New chat"]',
            outputSelector: null,
            completionSignal: 'URL change or page reload',
            isPrimary: false,
        },
    ],
    states: [
        { name: 'idle', detectionMethod: 'No loading indicators visible', indicatorSelector: null, transitions: ['generating'] },
        { name: 'generating', detectionMethod: 'Loading spinner visible', indicatorSelector: '.loading-spinner', transitions: ['done', 'error'] },
        { name: 'done', detectionMethod: 'Response complete, no spinner', indicatorSelector: null, transitions: ['idle'] },
        { name: 'error', detectionMethod: 'Error message visible', indicatorSelector: '.error-message', transitions: ['idle'] },
    ],
    features: [
        { name: 'imageGeneration', description: 'Generate images from text prompts', activationMethod: 'Include image request in prompt' },
    ],
    completion: {
        method: 'hash_stability',
        pollMs: 500,
        stableCount: 3,
        maxWaitMs: 60000,
    },
    selectors: {
        chatInput: { tiers: ['[role="textbox"][aria-label="Enter a prompt here"]', '.ql-editor[contenteditable="true"]'] },
        submitButton: { tiers: ['button[aria-label="Send message"]', '.send-button'] },
        responseArea: { tiers: ['.response-container'] },
    },
};
function mockFetchForLLM(response) {
    return vitest_1.vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
        }),
        text: async () => JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
        }),
    });
}
// ─── Tests ───────────────────────────────────────────────────────
(0, vitest_1.describe)('LLMClient', () => {
    let originalFetch;
    (0, vitest_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
    });
    (0, vitest_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
    });
    (0, vitest_1.it)('should send a chat request and return content', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
            }),
        });
        const client = new llm_client_js_1.LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
        const result = await client.chat([{ role: 'user', content: 'Hi' }]);
        (0, vitest_1.expect)(result).toBe('Hello world');
        (0, vitest_1.expect)(globalThis.fetch).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('should parse JSON response in chatJSON mode', async () => {
        globalThis.fetch = mockFetchForLLM({ foo: 'bar', count: 42 });
        const client = new llm_client_js_1.LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
        const result = await client.chatJSON([
            { role: 'user', content: 'Give me JSON' },
        ]);
        (0, vitest_1.expect)(result).toEqual({ foo: 'bar', count: 42 });
        // Verify response_format was set
        const fetchCall = vitest_1.vi.mocked(globalThis.fetch).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        (0, vitest_1.expect)(body.response_format).toEqual({ type: 'json_object' });
    });
    (0, vitest_1.it)('should throw on HTTP error', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        });
        const client = new llm_client_js_1.LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
        await (0, vitest_1.expect)(client.chat([{ role: 'user', content: 'Hi' }]))
            .rejects.toThrow('LLM request failed (HTTP 500)');
    });
    (0, vitest_1.it)('should throw on network error', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const client = new llm_client_js_1.LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
        await (0, vitest_1.expect)(client.chat([{ role: 'user', content: 'Hi' }]))
            .rejects.toThrow('LLM request failed (network)');
    });
    (0, vitest_1.it)('should use default options from env/config', () => {
        const client = new llm_client_js_1.LLMClient();
        // Just verify construction doesn't throw
        (0, vitest_1.expect)(client).toBeInstanceOf(llm_client_js_1.LLMClient);
    });
});
(0, vitest_1.describe)('buildAnalysisPrompt', () => {
    (0, vitest_1.it)('should produce system + user messages', () => {
        const snapshot = mockSnapshot();
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot);
        (0, vitest_1.expect)(messages).toHaveLength(2);
        (0, vitest_1.expect)(messages[0].role).toBe('system');
        (0, vitest_1.expect)(messages[1].role).toBe('user');
    });
    (0, vitest_1.it)('should include site URL and title in user message', () => {
        const snapshot = mockSnapshot();
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot);
        const userMsg = messages[1].content;
        (0, vitest_1.expect)(userMsg).toContain('https://gemini.google.com');
        (0, vitest_1.expect)(userMsg).toContain('Gemini');
    });
    (0, vitest_1.it)('should include interactive elements', () => {
        const snapshot = mockSnapshot();
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot);
        const userMsg = messages[1].content;
        (0, vitest_1.expect)(userMsg).toContain('chat-input');
        (0, vitest_1.expect)(userMsg).toContain('submit-button');
        (0, vitest_1.expect)(userMsg).toContain('new-chat-button');
    });
    (0, vitest_1.it)('should include regions and dynamic areas', () => {
        const snapshot = mockSnapshot();
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot);
        const userMsg = messages[1].content;
        (0, vitest_1.expect)(userMsg).toContain('header');
        (0, vitest_1.expect)(userMsg).toContain('main');
        (0, vitest_1.expect)(userMsg).toContain('response-container');
    });
    (0, vitest_1.it)('should include doc summary when provided', () => {
        const snapshot = mockSnapshot();
        const docs = {
            apiDocs: ['API endpoint: POST /v1/chat'],
            helpPages: ['Getting started with Gemini'],
            constraints: ['Rate limit: 60 requests/min'],
            scrapedUrls: ['https://support.google.com/gemini'],
        };
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot, docs);
        const userMsg = messages[1].content;
        (0, vitest_1.expect)(userMsg).toContain('API endpoint');
        (0, vitest_1.expect)(userMsg).toContain('Rate limit');
    });
    (0, vitest_1.it)('should instruct LLM to respond in JSON format', () => {
        const snapshot = mockSnapshot();
        const messages = (0, prompts_js_1.buildAnalysisPrompt)(snapshot);
        const systemMsg = messages[0].content;
        (0, vitest_1.expect)(systemMsg).toContain('JSON');
        (0, vitest_1.expect)(systemMsg).toContain('actions');
        (0, vitest_1.expect)(systemMsg).toContain('states');
        (0, vitest_1.expect)(systemMsg).toContain('selectors');
    });
});
(0, vitest_1.describe)('DocScraper', () => {
    let originalFetch;
    (0, vitest_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
    });
    (0, vitest_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
    });
    (0, vitest_1.it)('should filter doc-like links from a list', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            text: async () => '<html><body><p>Help content here</p></body></html>',
        });
        const scraper = new doc_scraper_js_1.DocScraper();
        const result = await scraper.scrape('https://example.com', [
            { text: 'Help', href: '/help' },
            { text: 'Login', href: '/login' },
            { text: 'API Docs', href: '/docs/api' },
            { text: 'Home', href: '/' },
            { text: 'FAQ', href: '/faq' },
        ]);
        // Should have fetched the 3 doc links (help, docs, faq) but not login or home
        (0, vitest_1.expect)(result.scrapedUrls.length).toBeGreaterThanOrEqual(2);
        (0, vitest_1.expect)(result.scrapedUrls.some(u => u.includes('/help'))).toBe(true);
    });
    (0, vitest_1.it)('should categorize scraped content', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockImplementation(async (url) => ({
            ok: true,
            text: async () => `<html><body><p>Content for ${url}</p></body></html>`,
        }));
        const scraper = new doc_scraper_js_1.DocScraper();
        const result = await scraper.scrape('https://example.com', [
            { text: 'API Reference', href: '/api/reference' },
            { text: 'Help Center', href: '/help' },
        ]);
        (0, vitest_1.expect)(result.apiDocs.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(result.helpPages.length).toBeGreaterThanOrEqual(1);
    });
    (0, vitest_1.it)('should handle fetch failures gracefully', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockRejectedValue(new Error('Network error'));
        const scraper = new doc_scraper_js_1.DocScraper();
        const result = await scraper.scrape('https://example.com', [
            { text: 'Help', href: '/help' },
        ]);
        (0, vitest_1.expect)(result.scrapedUrls).toEqual([]);
        (0, vitest_1.expect)(result.apiDocs).toEqual([]);
        (0, vitest_1.expect)(result.helpPages).toEqual([]);
    });
    (0, vitest_1.it)('should return empty result for no doc links', async () => {
        const scraper = new doc_scraper_js_1.DocScraper();
        const result = await scraper.scrape('https://example.com', [
            { text: 'Login', href: '/login' },
            { text: 'Settings', href: '/settings' },
        ]);
        (0, vitest_1.expect)(result.scrapedUrls).toEqual([]);
    });
});
(0, vitest_1.describe)('SiteAnalyzer', () => {
    let originalFetch;
    (0, vitest_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
    });
    (0, vitest_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
    });
    (0, vitest_1.it)('should analyze a snapshot and return a SiteDefinitionResult', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const snapshot = mockSnapshot();
        const result = await analyzer.analyze(snapshot);
        (0, vitest_1.expect)(result.name).toBe('gemini');
        (0, vitest_1.expect)(result.url).toBe('https://gemini.google.com');
        (0, vitest_1.expect)(result.purpose).toContain('AI chat');
        (0, vitest_1.expect)(result.category).toBe('chat');
    });
    (0, vitest_1.it)('should include actions from LLM response', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        (0, vitest_1.expect)(result.actions).toHaveLength(2);
        (0, vitest_1.expect)(result.actions[0].name).toBe('sendMessage');
        (0, vitest_1.expect)(result.actions[0].isPrimary).toBe(true);
        (0, vitest_1.expect)(result.actions[1].name).toBe('newChat');
    });
    (0, vitest_1.it)('should include states from LLM response', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        (0, vitest_1.expect)(result.states.length).toBeGreaterThanOrEqual(3);
        (0, vitest_1.expect)(result.states.map(s => s.name)).toContain('idle');
        (0, vitest_1.expect)(result.states.map(s => s.name)).toContain('generating');
        (0, vitest_1.expect)(result.states.map(s => s.name)).toContain('done');
    });
    (0, vitest_1.it)('should build selectors from LLM + snapshot', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        // LLM-provided selectors
        (0, vitest_1.expect)(result.selectors.chatInput).toBeDefined();
        (0, vitest_1.expect)(result.selectors.chatInput.tiers.length).toBeGreaterThan(0);
        // Snapshot-supplemented selectors (elements not already covered by LLM)
        (0, vitest_1.expect)(result.selectors['new-chat-button']).toBeDefined();
    });
    (0, vitest_1.it)('should build completion config with clamped values', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        (0, vitest_1.expect)(result.completion.method).toBe('hash_stability');
        (0, vitest_1.expect)(result.completion.pollMs).toBeGreaterThanOrEqual(100);
        (0, vitest_1.expect)(result.completion.pollMs).toBeLessThanOrEqual(2000);
    });
    (0, vitest_1.it)('should build state transitions map', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        (0, vitest_1.expect)(result.stateTransitions).toBeDefined();
        (0, vitest_1.expect)(result.stateTransitions.idle).toContain('generating');
    });
    (0, vitest_1.it)('should provide default states when LLM omits them', async () => {
        const noStatesResponse = { ...mockLLMResponse, states: undefined };
        globalThis.fetch = mockFetchForLLM(noStatesResponse);
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot());
        (0, vitest_1.expect)(result.states.length).toBeGreaterThanOrEqual(3);
        (0, vitest_1.expect)(result.states.map(s => s.name)).toContain('idle');
    });
    (0, vitest_1.it)('should include docs summary when docs provided', async () => {
        globalThis.fetch = mockFetchForLLM(mockLLMResponse);
        const docs = {
            apiDocs: ['POST /v1/chat endpoint'],
            helpPages: ['Getting started guide'],
            constraints: ['Rate limit: 60/min'],
            scrapedUrls: ['https://support.google.com/gemini'],
        };
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        const result = await analyzer.analyze(mockSnapshot(), docs);
        (0, vitest_1.expect)(result.docsSummary).toBeDefined();
        (0, vitest_1.expect)(result.docsSummary).toContain('API docs');
    });
    (0, vitest_1.it)('should throw when LLM call fails', async () => {
        globalThis.fetch = vitest_1.vi.fn().mockRejectedValue(new Error('Connection refused'));
        const analyzer = new analyzer_js_1.SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
        await (0, vitest_1.expect)(analyzer.analyze(mockSnapshot()))
            .rejects.toThrow('LLM analysis failed');
    });
});
//# sourceMappingURL=analyzer.test.js.map