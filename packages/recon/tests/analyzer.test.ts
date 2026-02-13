import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient } from '../src/analyzer/llm-client.js';
import { buildAnalysisPrompt } from '../src/analyzer/prompts.js';
import { DocScraper } from '../src/analyzer/doc-scraper.js';
import { SiteAnalyzer } from '../src/analyzer/analyzer.js';
import type { SiteSnapshot, DocScrapeResult, SiteDefinitionResult } from '../src/types.js';

// ─── Mock Data ───────────────────────────────────────────────────

function mockSnapshot(overrides?: Partial<SiteSnapshot>): SiteSnapshot {
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

const mockLLMResponse: Record<string, unknown> = {
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

function mockFetchForLLM(response: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
    }),
    text: async () => JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
    }),
  }) as unknown as typeof globalThis.fetch;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('LLMClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should send a chat request and return content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const client = new LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
    const result = await client.chat([{ role: 'user', content: 'Hi' }]);

    expect(result).toBe('Hello world');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('should parse JSON response in chatJSON mode', async () => {
    globalThis.fetch = mockFetchForLLM({ foo: 'bar', count: 42 });

    const client = new LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
    const result = await client.chatJSON<{ foo: string; count: number }>([
      { role: 'user', content: 'Give me JSON' },
    ]);

    expect(result).toEqual({ foo: 'bar', count: 42 });

    // Verify response_format was set
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('should throw on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }) as unknown as typeof globalThis.fetch;

    const client = new LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
    await expect(client.chat([{ role: 'user', content: 'Hi' }]))
      .rejects.toThrow('LLM request failed (HTTP 500)');
  });

  it('should throw on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof globalThis.fetch;

    const client = new LLMClient({ endpoint: 'http://test:1234/v1/chat/completions' });
    await expect(client.chat([{ role: 'user', content: 'Hi' }]))
      .rejects.toThrow('LLM request failed (network)');
  });

  it('should use default options from env/config', () => {
    const client = new LLMClient();
    // Just verify construction doesn't throw
    expect(client).toBeInstanceOf(LLMClient);
  });
});

describe('buildAnalysisPrompt', () => {
  it('should produce system + user messages', () => {
    const snapshot = mockSnapshot();
    const messages = buildAnalysisPrompt(snapshot);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('should include site URL and title in user message', () => {
    const snapshot = mockSnapshot();
    const messages = buildAnalysisPrompt(snapshot);
    const userMsg = messages[1].content;

    expect(userMsg).toContain('https://gemini.google.com');
    expect(userMsg).toContain('Gemini');
  });

  it('should include interactive elements', () => {
    const snapshot = mockSnapshot();
    const messages = buildAnalysisPrompt(snapshot);
    const userMsg = messages[1].content;

    expect(userMsg).toContain('chat-input');
    expect(userMsg).toContain('submit-button');
    expect(userMsg).toContain('new-chat-button');
  });

  it('should include regions and dynamic areas', () => {
    const snapshot = mockSnapshot();
    const messages = buildAnalysisPrompt(snapshot);
    const userMsg = messages[1].content;

    expect(userMsg).toContain('header');
    expect(userMsg).toContain('main');
    expect(userMsg).toContain('response-container');
  });

  it('should include doc summary when provided', () => {
    const snapshot = mockSnapshot();
    const docs: DocScrapeResult = {
      apiDocs: ['API endpoint: POST /v1/chat'],
      helpPages: ['Getting started with Gemini'],
      constraints: ['Rate limit: 60 requests/min'],
      scrapedUrls: ['https://support.google.com/gemini'],
    };
    const messages = buildAnalysisPrompt(snapshot, docs);
    const userMsg = messages[1].content;

    expect(userMsg).toContain('API endpoint');
    expect(userMsg).toContain('Rate limit');
  });

  it('should instruct LLM to respond in JSON format', () => {
    const snapshot = mockSnapshot();
    const messages = buildAnalysisPrompt(snapshot);
    const systemMsg = messages[0].content;

    expect(systemMsg).toContain('JSON');
    expect(systemMsg).toContain('actions');
    expect(systemMsg).toContain('states');
    expect(systemMsg).toContain('selectors');
  });
});

describe('DocScraper', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should filter doc-like links from a list', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body><p>Help content here</p></body></html>',
    }) as unknown as typeof globalThis.fetch;

    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'Help', href: '/help' },
      { text: 'Login', href: '/login' },
      { text: 'API Docs', href: '/docs/api' },
      { text: 'Home', href: '/' },
      { text: 'FAQ', href: '/faq' },
    ]);

    // Should have fetched the 3 doc links (help, docs, faq) but not login or home
    expect(result.scrapedUrls.length).toBeGreaterThanOrEqual(2);
    expect(result.scrapedUrls.some(u => u.includes('/help'))).toBe(true);
  });

  it('should categorize scraped content', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () => `<html><body><p>Content for ${url}</p></body></html>`,
    })) as unknown as typeof globalThis.fetch;

    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'API Reference', href: '/api/reference' },
      { text: 'Help Center', href: '/help' },
    ]);

    expect(result.apiDocs.length).toBeGreaterThanOrEqual(1);
    expect(result.helpPages.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle fetch failures gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof globalThis.fetch;

    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'Help', href: '/help' },
    ]);

    expect(result.scrapedUrls).toEqual([]);
    expect(result.apiDocs).toEqual([]);
    expect(result.helpPages).toEqual([]);
  });

  it('should return empty result for no doc links', async () => {
    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'Login', href: '/login' },
      { text: 'Settings', href: '/settings' },
    ]);

    expect(result.scrapedUrls).toEqual([]);
  });
});

describe('SiteAnalyzer', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should analyze a snapshot and return a SiteDefinitionResult', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const snapshot = mockSnapshot();
    const result = await analyzer.analyze(snapshot);

    expect(result.name).toBe('gemini');
    expect(result.url).toBe('https://gemini.google.com');
    expect(result.purpose).toContain('AI chat');
    expect(result.category).toBe('chat');
  });

  it('should include actions from LLM response', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].name).toBe('sendMessage');
    expect(result.actions[0].isPrimary).toBe(true);
    expect(result.actions[1].name).toBe('newChat');
  });

  it('should include states from LLM response', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    expect(result.states.length).toBeGreaterThanOrEqual(3);
    expect(result.states.map(s => s.name)).toContain('idle');
    expect(result.states.map(s => s.name)).toContain('generating');
    expect(result.states.map(s => s.name)).toContain('done');
  });

  it('should build selectors from LLM + snapshot', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    // LLM-provided selectors
    expect(result.selectors.chatInput).toBeDefined();
    expect(result.selectors.chatInput.tiers.length).toBeGreaterThan(0);

    // Snapshot-supplemented selectors (elements not already covered by LLM)
    expect(result.selectors['new-chat-button']).toBeDefined();
  });

  it('should build completion config with clamped values', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    expect(result.completion.method).toBe('hash_stability');
    expect(result.completion.pollMs).toBeGreaterThanOrEqual(100);
    expect(result.completion.pollMs).toBeLessThanOrEqual(2000);
  });

  it('should build state transitions map', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    expect(result.stateTransitions).toBeDefined();
    expect(result.stateTransitions.idle).toContain('generating');
  });

  it('should provide default states when LLM omits them', async () => {
    const noStatesResponse = { ...mockLLMResponse, states: undefined };
    globalThis.fetch = mockFetchForLLM(noStatesResponse);

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot());

    expect(result.states.length).toBeGreaterThanOrEqual(3);
    expect(result.states.map(s => s.name)).toContain('idle');
  });

  it('should include docs summary when docs provided', async () => {
    globalThis.fetch = mockFetchForLLM(mockLLMResponse);

    const docs: DocScrapeResult = {
      apiDocs: ['POST /v1/chat endpoint'],
      helpPages: ['Getting started guide'],
      constraints: ['Rate limit: 60/min'],
      scrapedUrls: ['https://support.google.com/gemini'],
    };

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot(), docs);

    expect(result.docsSummary).toBeDefined();
    expect(result.docsSummary).toContain('API docs');
  });

  it('should throw when LLM call fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof globalThis.fetch;

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://test:1234/v1/chat/completions' });
    await expect(analyzer.analyze(mockSnapshot()))
      .rejects.toThrow('LLM analysis failed');
  });
});
