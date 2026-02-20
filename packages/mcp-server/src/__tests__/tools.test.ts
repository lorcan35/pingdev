// @pingdev/mcp-server — Unit tests for MCP tool registration and gateway helper
// Tests: registerTools registers all 15 tools, gw() makes correct fetch calls, tool handlers

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerTools } from '../tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// Mock McpServer — captures server.tool() registrations
// ---------------------------------------------------------------------------

function createMockServer() {
  const tools: RegisteredTool[] = [];

  const server = {
    tool: vi.fn((name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler) => {
      tools.push({ name, description, schema, handler });
    }),
  };

  return { server, tools };
}

// ---------------------------------------------------------------------------
// Mock fetch helper — returns a configurable JSON response
// ---------------------------------------------------------------------------

function mockFetch(responseBody: unknown = { ok: true }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fn = vi.fn(async (_url: string, _opts: RequestInit) => ({
    json: async () => responseBody,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Expected tool names (all 15)
// ---------------------------------------------------------------------------

const EXPECTED_TOOL_NAMES = [
  'pingos_devices',
  'pingos_recon',
  'pingos_observe',
  'pingos_extract',
  'pingos_act',
  'pingos_click',
  'pingos_type',
  'pingos_read',
  'pingos_press',
  'pingos_scroll',
  'pingos_screenshot',
  'pingos_eval',
  'pingos_query',
  'pingos_apps',
  'pingos_app_run',
] as const;

// ============================================================================
// registerTools — registration
// ============================================================================

describe('registerTools', () => {
  let tools: RegisteredTool[];

  beforeEach(() => {
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);
    tools = mock.tools;
  });

  it('registers exactly 15 tools', () => {
    expect(tools).toHaveLength(15);
  });

  it('calls server.tool() 15 times', () => {
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);
    expect(mock.server.tool).toHaveBeenCalledTimes(15);
  });

  it('registers all expected tool names', () => {
    const registeredNames = tools.map((t) => t.name);
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(registeredNames).toContain(expected);
    }
  });

  it('registered names match expected names exactly (no extras)', () => {
    const registeredNames = new Set(tools.map((t) => t.name));
    const expectedNames = new Set(EXPECTED_TOOL_NAMES);
    expect(registeredNames).toEqual(expectedNames);
  });

  it('every tool has a non-empty description', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('every tool has a handler function', () => {
    for (const tool of tools) {
      expect(typeof tool.handler).toBe('function');
    }
  });
});

// ============================================================================
// gw() helper — verifies correct fetch calls through tool handlers
// ============================================================================

describe('gw() helper via tool handlers', () => {
  let tools: RegisteredTool[];
  let fetchMock: ReturnType<typeof mockFetch>;

  function findTool(name: string): RegisteredTool {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    fetchMock = mockFetch({ status: 'ok', data: 'test' });
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);
    tools = mock.tools;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- GET endpoints (no body) ----

  it('pingos_devices calls GET /v1/devices', async () => {
    await findTool('pingos_devices').handler({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/devices');
    expect(opts.method).toBe('GET');
    expect(opts.body).toBeUndefined();
  });

  it('pingos_apps calls GET /v1/apps', async () => {
    await findTool('pingos_apps').handler({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/apps');
    expect(opts.method).toBe('GET');
  });

  // ---- POST endpoints with device ID ----

  it('pingos_recon calls POST /v1/dev/{device}/recon', async () => {
    await findTool('pingos_recon').handler({ device: 'tab-42' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-42/recon');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({});
  });

  it('pingos_observe calls POST /v1/dev/{device}/observe', async () => {
    await findTool('pingos_observe').handler({ device: 'tab-7' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-7/observe');
    expect(opts.method).toBe('POST');
  });

  it('pingos_extract calls POST /v1/dev/{device}/extract with query and schema', async () => {
    await findTool('pingos_extract').handler({
      device: 'tab-1',
      query: 'get the price',
      schema: { type: 'object' },
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/extract');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      query: 'get the price',
      schema: { type: 'object' },
    });
  });

  it('pingos_act calls POST /v1/dev/{device}/act with instruction', async () => {
    await findTool('pingos_act').handler({
      device: 'tab-1',
      instruction: 'click the login button',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/act');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ instruction: 'click the login button' });
  });

  it('pingos_click calls POST /v1/dev/{device}/click with selector', async () => {
    await findTool('pingos_click').handler({
      device: 'tab-1',
      selector: '#submit-btn',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/click');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ selector: '#submit-btn' });
  });

  it('pingos_type calls POST /v1/dev/{device}/type with text and optional selector', async () => {
    await findTool('pingos_type').handler({
      device: 'tab-1',
      text: 'hello world',
      selector: '#input-field',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/type');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ text: 'hello world', selector: '#input-field' });
  });

  it('pingos_type works without optional selector', async () => {
    await findTool('pingos_type').handler({
      device: 'tab-1',
      text: 'typed text',
    });

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.text).toBe('typed text');
    expect(body.selector).toBeUndefined();
  });

  it('pingos_read calls POST /v1/dev/{device}/read with selector', async () => {
    await findTool('pingos_read').handler({
      device: 'tab-1',
      selector: '.result-text',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/read');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ selector: '.result-text' });
  });

  it('pingos_press calls POST /v1/dev/{device}/press with key', async () => {
    await findTool('pingos_press').handler({
      device: 'tab-1',
      key: 'Enter',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/press');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ key: 'Enter' });
  });

  it('pingos_scroll calls POST /v1/dev/{device}/scroll with direction and amount', async () => {
    await findTool('pingos_scroll').handler({
      device: 'tab-1',
      direction: 'down',
      amount: 500,
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/scroll');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ direction: 'down', amount: 500 });
  });

  it('pingos_eval calls POST /v1/dev/{device}/eval with expression', async () => {
    await findTool('pingos_eval').handler({
      device: 'tab-1',
      expression: 'document.title',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/eval');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ expression: 'document.title' });
  });

  it('pingos_query calls POST /v1/dev/{device}/suggest with question', async () => {
    await findTool('pingos_query').handler({
      device: 'tab-1',
      question: 'What is on this page?',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/dev/tab-1/suggest');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ question: 'What is on this page?' });
  });

  // ---- pingos_app_run — dynamic path and method ----

  it('pingos_app_run with endpoint and body calls POST /v1/app/{app}/{endpoint}', async () => {
    await findTool('pingos_app_run').handler({
      app: 'aliexpress',
      endpoint: 'search',
      body: { query: 'laptop' },
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/app/aliexpress/search');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ query: 'laptop' });
  });

  it('pingos_app_run without endpoint calls /v1/app/{app}', async () => {
    await findTool('pingos_app_run').handler({
      app: 'amazon',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/app/amazon');
    expect(opts.method).toBe('GET');
  });

  it('pingos_app_run with body but no endpoint calls POST /v1/app/{app}', async () => {
    await findTool('pingos_app_run').handler({
      app: 'claude',
      body: { prompt: 'hello' },
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1/app/claude');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ prompt: 'hello' });
  });

  // ---- fetch always sends Content-Type: application/json ----

  it('all fetch calls include Content-Type: application/json header', async () => {
    await findTool('pingos_devices').handler({});
    await findTool('pingos_act').handler({ device: 'x', instruction: 'do thing' });

    for (const call of fetchMock.mock.calls) {
      const opts = call[1] as RequestInit;
      expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    }
  });
});

// ============================================================================
// textResult — response formatting
// ============================================================================

describe('textResult formatting', () => {
  let tools: RegisteredTool[];
  let fetchMock: ReturnType<typeof mockFetch>;

  function findTool(name: string): RegisteredTool {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);
    tools = mock.tools;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns content array with a single text entry', async () => {
    fetchMock = mockFetch({ devices: ['tab-1', 'tab-2'] });

    const result = await findTool('pingos_devices').handler({}) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('JSON-stringifies the gateway response with 2-space indentation', async () => {
    const payload = { devices: ['tab-1', 'tab-2'], count: 2 };
    fetchMock = mockFetch(payload);

    const result = await findTool('pingos_devices').handler({}) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toBe(JSON.stringify(payload, null, 2));
  });

  it('handles null gateway response', async () => {
    fetchMock = mockFetch(null);

    const result = await findTool('pingos_apps').handler({}) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toBe('null');
  });

  it('handles complex nested response', async () => {
    const payload = {
      elements: [
        { id: 1, selector: '#btn', type: 'button' },
        { id: 2, selector: 'input.search', type: 'input' },
      ],
      metadata: { url: 'https://example.com', timestamp: 1234567890 },
    };
    fetchMock = mockFetch(payload);

    const result = await findTool('pingos_observe').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; text: string }>;
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(payload);
  });
});

// ============================================================================
// pingos_screenshot — image content handling
// ============================================================================

describe('pingos_screenshot', () => {
  let tools: RegisteredTool[];

  function findTool(name: string): RegisteredTool {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);
    tools = mock.tools;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns image content when response contains base64 data', async () => {
    const longBase64 = 'iVBORw0KGgoAAAANS' + 'A'.repeat(200);
    mockFetch({ result: { data: longBase64, mimeType: 'image/png' } });

    const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; data?: string; mimeType?: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].data).toBe(longBase64);
    expect(result.content[0].mimeType).toBe('image/png');
  });

  it('returns image content when data is at top level (no result wrapper)', async () => {
    const longBase64 = 'iVBORw0KGgoAAAANS' + 'B'.repeat(200);
    mockFetch({ data: longBase64, mimeType: 'image/jpeg' });

    const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; data?: string; mimeType?: string }>;
    };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].data).toBe(longBase64);
    expect(result.content[0].mimeType).toBe('image/jpeg');
  });

  it('defaults mimeType to image/png when not provided', async () => {
    const longBase64 = 'iVBORw0KGgoAAAANS' + 'C'.repeat(200);
    mockFetch({ data: longBase64 });

    const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; data?: string; mimeType?: string }>;
    };

    expect(result.content[0].mimeType).toBe('image/png');
  });

  it('falls back to textResult when data is short (not a real image)', async () => {
    mockFetch({ data: 'short', mimeType: 'image/png' });

    const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; text?: string }>;
    };

    expect(result.content[0].type).toBe('text');
  });

  it('falls back to textResult when no data field present', async () => {
    mockFetch({ error: 'no screenshot available' });

    const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' }) as {
      content: Array<{ type: string; text?: string }>;
    };

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('no screenshot available');
  });
});

// ============================================================================
// PINGOS_GATEWAY_URL environment variable
// ============================================================================

describe('PINGOS_GATEWAY_URL environment variable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to http://localhost:3500 when env var is not set', async () => {
    const fetchFn = mockFetch({ ok: true });
    const mock = createMockServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(mock.server as any);

    const devicesTool = mock.tools.find((t) => t.name === 'pingos_devices')!;
    await devicesTool.handler({});

    const [url] = fetchFn.mock.calls[0];
    expect(url).toMatch(/^http:\/\/localhost:3500\//);
  });
});
