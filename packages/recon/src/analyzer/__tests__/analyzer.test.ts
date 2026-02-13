import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SiteSnapshot, DocScrapeResult } from '../../types.js';

// Mock snapshot of a Gemini-like site
const mockSnapshot: SiteSnapshot = {
  url: 'https://gemini.google.com/app',
  title: 'Gemini',
  timestamp: '2025-01-01T00:00:00.000Z',
  elements: [
    {
      id: 'el-0',
      name: 'chat-input',
      type: 'contenteditable',
      role: 'textbox',
      label: 'Enter a prompt here',
      placeholder: 'Enter a prompt here',
      states: ['visible', 'editable'],
      cssSelectors: ['.ql-editor', '[contenteditable="true"]'],
      xpathSelectors: ['//*[@contenteditable="true"]'],
      ariaSelectors: ['textbox[name="Enter a prompt here"]'],
      bounds: { x: 300, y: 600, width: 700, height: 48 },
      regionName: 'main',
      interactiveConfidence: 1.0,
    },
    {
      id: 'el-1',
      name: 'send-message',
      type: 'button',
      role: 'button',
      label: 'Send message',
      states: ['visible'],
      cssSelectors: ['button[aria-label="Send message"]', '.send-button'],
      xpathSelectors: ['//button[@aria-label="Send message"]'],
      ariaSelectors: ['button[name="Send message"]'],
      bounds: { x: 1010, y: 600, width: 48, height: 48 },
      regionName: 'main',
      interactiveConfidence: 1.0,
    },
    {
      id: 'el-2',
      name: 'new-chat',
      type: 'button',
      role: 'button',
      label: 'New chat',
      states: ['visible'],
      cssSelectors: ['button[aria-label="New chat"]'],
      xpathSelectors: ['//button[@aria-label="New chat"]'],
      ariaSelectors: ['button[name="New chat"]'],
      bounds: { x: 20, y: 20, width: 120, height: 40 },
      regionName: 'nav',
      interactiveConfidence: 1.0,
    },
  ],
  regions: [
    { name: 'nav', role: 'nav', bounds: { x: 0, y: 0, width: 250, height: 720 }, elementIds: ['el-2'] },
    { name: 'main', role: 'main', bounds: { x: 250, y: 0, width: 1030, height: 720 }, elementIds: ['el-0', 'el-1'] },
  ],
  dynamicAreas: [
    { name: 'response-area', selector: '.response-container', contentType: 'response-output', mutationHints: ['childList', 'characterData'] },
    { name: 'loading-indicator', selector: '.loading-spinner', contentType: 'loading-indicator', mutationHints: [] },
  ],
  ariaTree: [
    { role: 'navigation', name: 'Chat history' },
    { role: 'main', children: [{ role: 'textbox', name: 'Enter a prompt here' }] },
  ],
  screenshots: [],
  visibleText: ['Gemini', 'Enter a prompt here', 'New chat', 'Recent conversations'],
  links: [
    { text: 'Help', href: 'https://support.google.com/gemini', isInternal: false },
    { text: 'FAQ', href: 'https://gemini.google.com/faq', isInternal: true },
  ],
  meta: {
    description: 'Chat to supercharge your ideas',
    ogTitle: 'Gemini',
  },
};

describe('LLMClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should parse a chat completion response', async () => {
    const { LLMClient } = await import('../llm-client.js');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
      }),
    }) as unknown as typeof fetch;

    const client = new LLMClient({ endpoint: 'http://localhost:1234/v1/chat/completions' });
    const result = await client.chat([{ role: 'user', content: 'Hi' }]);
    expect(result).toBe('Hello world');
  });

  it('should parse JSON mode responses', async () => {
    const { LLMClient } = await import('../llm-client.js');

    const testData = { purpose: 'AI chat', category: 'chat' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(testData) }, finish_reason: 'stop' }],
      }),
    }) as unknown as typeof fetch;

    const client = new LLMClient();
    const result = await client.chatJSON<typeof testData>([{ role: 'user', content: 'Analyze' }]);
    expect(result.purpose).toBe('AI chat');
    expect(result.category).toBe('chat');
  });

  it('should handle JSON wrapped in markdown fences', async () => {
    const { LLMClient } = await import('../llm-client.js');

    const testData = { purpose: 'test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: '```json\n{"purpose":"test"}\n```' }, finish_reason: 'stop' }],
      }),
    }) as unknown as typeof fetch;

    const client = new LLMClient();
    const result = await client.chatJSON<typeof testData>([{ role: 'user', content: 'Test' }]);
    expect(result.purpose).toBe('test');
  });

  it('should throw on HTTP error', async () => {
    const { LLMClient } = await import('../llm-client.js');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }) as unknown as typeof fetch;

    const client = new LLMClient();
    await expect(client.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow('LLM request failed (HTTP 500)');
  });
});

describe('buildAnalysisPrompt', () => {
  it('should build a structured prompt from a snapshot', async () => {
    const { buildAnalysisPrompt } = await import('../prompts.js');

    const messages = buildAnalysisPrompt(mockSnapshot);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('JSON');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('gemini.google.com');
    expect(messages[1].content).toContain('chat-input');
    expect(messages[1].content).toContain('send-message');
    expect(messages[1].content).toContain('response-area');
  });

  it('should include documentation when provided', async () => {
    const { buildAnalysisPrompt } = await import('../prompts.js');

    const docs: DocScrapeResult = {
      apiDocs: ['API endpoint: POST /v1/generate'],
      helpPages: ['Gemini is an AI assistant.'],
      constraints: ['Rate limit: 60 requests per minute'],
      scrapedUrls: ['https://gemini.google.com/faq'],
    };

    const messages = buildAnalysisPrompt(mockSnapshot, docs);
    expect(messages[1].content).toContain('Documentation Summary');
    expect(messages[1].content).toContain('Rate limit');
  });
});

describe('DocScraper', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should filter doc-like links from the list', async () => {
    const { DocScraper } = await import('../doc-scraper.js');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>Help content here</body></html>'),
    }) as unknown as typeof fetch;

    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'Help', href: 'https://example.com/help' },
      { text: 'Home', href: 'https://example.com/' },
      { text: 'API Docs', href: 'https://example.com/api/docs' },
      { text: 'Contact', href: 'https://example.com/contact' },
    ]);

    expect(result.scrapedUrls.length).toBeGreaterThanOrEqual(1);
    expect(result.scrapedUrls).toContain('https://example.com/help');
  });

  it('should categorize docs by URL pattern', async () => {
    const { DocScraper } = await import('../doc-scraper.js');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>Content</body></html>'),
    }) as unknown as typeof fetch;

    const scraper = new DocScraper();
    const result = await scraper.scrape('https://example.com', [
      { text: 'API Reference', href: 'https://example.com/api/reference' },
      { text: 'FAQ', href: 'https://example.com/faq' },
    ]);

    expect(result.apiDocs.length + result.helpPages.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SiteAnalyzer', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should analyze a snapshot and return a SiteDefinitionResult', async () => {
    const { SiteAnalyzer } = await import('../analyzer.js');

    // Mock LLM response
    const llmResponse = {
      purpose: 'AI chat assistant by Google',
      category: 'chat',
      actions: [
        {
          name: 'sendMessage',
          description: 'Send a chat message',
          inputSelector: 'chat-input',
          submitTrigger: 'send-message',
          outputSelector: 'response-area',
          completionSignal: 'response text stops changing',
          isPrimary: true,
        },
        {
          name: 'newChat',
          description: 'Start a new conversation',
          inputSelector: null,
          submitTrigger: null,
          outputSelector: null,
          completionSignal: null,
          isPrimary: false,
        },
      ],
      states: [
        { name: 'idle', detectionMethod: 'no loading indicator visible', transitions: ['typing'] },
        { name: 'typing', detectionMethod: 'input has content', transitions: ['generating', 'idle'] },
        { name: 'generating', detectionMethod: 'loading spinner visible', indicatorSelector: '.loading-spinner', transitions: ['done', 'error'] },
        { name: 'done', detectionMethod: 'response is complete and stable', transitions: ['idle'] },
        { name: 'error', detectionMethod: 'error message displayed', transitions: ['idle'] },
      ],
      features: [
        { name: 'image-upload', description: 'Upload images for analysis', activationMethod: 'click upload button' },
      ],
      completion: { method: 'hash_stability', pollMs: 500, stableCount: 3, maxWaitMs: 60000 },
      selectors: {
        'chat-input': { tiers: ['.ql-editor', '[contenteditable="true"]'] },
        'send-button': { tiers: ['button[aria-label="Send message"]', '.send-button'] },
        'response-area': { tiers: ['.response-container', '.model-response'] },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(llmResponse) }, finish_reason: 'stop' }],
      }),
    }) as unknown as typeof fetch;

    const analyzer = new SiteAnalyzer({ llmEndpoint: 'http://localhost:1234/v1/chat/completions' });
    const result = await analyzer.analyze(mockSnapshot);

    expect(result.name).toBe('gemini');
    expect(result.purpose).toBe('AI chat assistant by Google');
    expect(result.category).toBe('chat');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].name).toBe('sendMessage');
    expect(result.actions[0].isPrimary).toBe(true);
    expect(result.states).toHaveLength(5);
    expect(result.features).toHaveLength(1);
    expect(result.selectors['chat-input']).toBeDefined();
    expect(result.selectors['chat-input'].tiers).toContain('.ql-editor');
    expect(result.completion.method).toBe('hash_stability');
    expect(result.stateTransitions['idle']).toEqual(['typing']);
  });
});
