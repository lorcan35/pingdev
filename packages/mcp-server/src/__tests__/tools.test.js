"use strict";
// @pingdev/mcp-server — Unit tests for MCP tool registration and gateway helper
// Tests: registerTools registers all tools, gw() makes correct fetch calls, tool handlers
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tools_js_1 = require("../tools.js");
// ---------------------------------------------------------------------------
// Mock McpServer — captures server.tool() registrations
// ---------------------------------------------------------------------------
function createMockServer() {
    const tools = [];
    const server = {
        tool: vitest_1.vi.fn((name, description, schema, handler) => {
            tools.push({ name, description, schema, handler });
        }),
    };
    return { server, tools };
}
// ---------------------------------------------------------------------------
// Mock fetch helper — returns a configurable JSON response
// ---------------------------------------------------------------------------
function mockFetch(responseBody = { ok: true }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fn = vitest_1.vi.fn(async (_url, _opts) => ({
        json: async () => responseBody,
    }));
    vitest_1.vi.stubGlobal('fetch', fn);
    return fn;
}
// ---------------------------------------------------------------------------
// Expected tool names
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
    'pingos_extract_semantic',
    'pingos_watch_start',
    'pingos_templates',
    'pingos_api',
];
// ============================================================================
// registerTools — registration
// ============================================================================
(0, vitest_1.describe)('registerTools', () => {
    let tools;
    (0, vitest_1.beforeEach)(() => {
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        tools = mock.tools;
    });
    (0, vitest_1.it)('registers all expected tools', () => {
        (0, vitest_1.expect)(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
    });
    (0, vitest_1.it)('calls server.tool() once per expected tool', () => {
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        (0, vitest_1.expect)(mock.server.tool).toHaveBeenCalledTimes(EXPECTED_TOOL_NAMES.length);
    });
    (0, vitest_1.it)('registers all expected tool names', () => {
        const registeredNames = tools.map((t) => t.name);
        for (const expected of EXPECTED_TOOL_NAMES) {
            (0, vitest_1.expect)(registeredNames).toContain(expected);
        }
    });
    (0, vitest_1.it)('registered names match expected names exactly (no extras)', () => {
        const registeredNames = new Set(tools.map((t) => t.name));
        const expectedNames = new Set(EXPECTED_TOOL_NAMES);
        (0, vitest_1.expect)(registeredNames).toEqual(expectedNames);
    });
    (0, vitest_1.it)('every tool has a non-empty description', () => {
        for (const tool of tools) {
            (0, vitest_1.expect)(tool.description.length).toBeGreaterThan(0);
        }
    });
    (0, vitest_1.it)('every tool has a handler function', () => {
        for (const tool of tools) {
            (0, vitest_1.expect)(typeof tool.handler).toBe('function');
        }
    });
});
// ============================================================================
// gw() helper — verifies correct fetch calls through tool handlers
// ============================================================================
(0, vitest_1.describe)('gw() helper via tool handlers', () => {
    let tools;
    let fetchMock;
    function findTool(name) {
        const tool = tools.find((t) => t.name === name);
        if (!tool)
            throw new Error(`Tool "${name}" not found`);
        return tool;
    }
    (0, vitest_1.beforeEach)(() => {
        fetchMock = mockFetch({ status: 'ok', data: 'test' });
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        tools = mock.tools;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    // ---- GET endpoints (no body) ----
    (0, vitest_1.it)('pingos_devices calls GET /v1/devices', async () => {
        await findTool('pingos_devices').handler({});
        (0, vitest_1.expect)(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/devices');
        (0, vitest_1.expect)(opts.method).toBe('GET');
        (0, vitest_1.expect)(opts.body).toBeUndefined();
    });
    (0, vitest_1.it)('pingos_apps calls GET /v1/apps', async () => {
        await findTool('pingos_apps').handler({});
        (0, vitest_1.expect)(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/apps');
        (0, vitest_1.expect)(opts.method).toBe('GET');
    });
    // ---- POST endpoints with device ID ----
    (0, vitest_1.it)('pingos_recon calls POST /v1/dev/{device}/recon', async () => {
        await findTool('pingos_recon').handler({ device: 'tab-42' });
        (0, vitest_1.expect)(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-42/recon');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({});
    });
    (0, vitest_1.it)('pingos_observe calls POST /v1/dev/{device}/observe', async () => {
        await findTool('pingos_observe').handler({ device: 'tab-7' });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-7/observe');
        (0, vitest_1.expect)(opts.method).toBe('POST');
    });
    (0, vitest_1.it)('pingos_extract calls POST /v1/dev/{device}/extract with query and schema', async () => {
        await findTool('pingos_extract').handler({
            device: 'tab-1',
            query: 'get the price',
            schema: { type: 'object' },
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/extract');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({
            query: 'get the price',
            schema: { type: 'object' },
        });
    });
    (0, vitest_1.it)('pingos_act calls POST /v1/dev/{device}/act with instruction', async () => {
        await findTool('pingos_act').handler({
            device: 'tab-1',
            instruction: 'click the login button',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/act');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ instruction: 'click the login button' });
    });
    (0, vitest_1.it)('pingos_click calls POST /v1/dev/{device}/click with selector', async () => {
        await findTool('pingos_click').handler({
            device: 'tab-1',
            selector: '#submit-btn',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/click');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ selector: '#submit-btn' });
    });
    (0, vitest_1.it)('pingos_type calls POST /v1/dev/{device}/type with text and optional selector', async () => {
        await findTool('pingos_type').handler({
            device: 'tab-1',
            text: 'hello world',
            selector: '#input-field',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/type');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ text: 'hello world', selector: '#input-field' });
    });
    (0, vitest_1.it)('pingos_type works without optional selector', async () => {
        await findTool('pingos_type').handler({
            device: 'tab-1',
            text: 'typed text',
        });
        const [, opts] = fetchMock.mock.calls[0];
        const body = JSON.parse(opts.body);
        (0, vitest_1.expect)(body.text).toBe('typed text');
        (0, vitest_1.expect)(body.selector).toBeUndefined();
    });
    (0, vitest_1.it)('pingos_read calls POST /v1/dev/{device}/read with selector', async () => {
        await findTool('pingos_read').handler({
            device: 'tab-1',
            selector: '.result-text',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/read');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ selector: '.result-text' });
    });
    (0, vitest_1.it)('pingos_press calls POST /v1/dev/{device}/press with key', async () => {
        await findTool('pingos_press').handler({
            device: 'tab-1',
            key: 'Enter',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/press');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ key: 'Enter' });
    });
    (0, vitest_1.it)('pingos_scroll calls POST /v1/dev/{device}/scroll with direction and amount', async () => {
        await findTool('pingos_scroll').handler({
            device: 'tab-1',
            direction: 'down',
            amount: 500,
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/scroll');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ direction: 'down', amount: 500 });
    });
    (0, vitest_1.it)('pingos_eval calls POST /v1/dev/{device}/eval with expression', async () => {
        await findTool('pingos_eval').handler({
            device: 'tab-1',
            expression: 'document.title',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/eval');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ expression: 'document.title' });
    });
    (0, vitest_1.it)('pingos_query calls POST /v1/dev/{device}/query with question', async () => {
        await findTool('pingos_query').handler({
            device: 'tab-1',
            question: 'What is on this page?',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/dev/tab-1/query');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ question: 'What is on this page?' });
    });
    // ---- pingos_app_run — dynamic path and method ----
    (0, vitest_1.it)('pingos_app_run with endpoint and body calls POST /v1/app/{app}/{endpoint}', async () => {
        await findTool('pingos_app_run').handler({
            app: 'aliexpress',
            endpoint: 'search',
            body: { query: 'laptop' },
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/app/aliexpress/search');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ query: 'laptop' });
    });
    (0, vitest_1.it)('pingos_app_run without endpoint calls /v1/app/{app}', async () => {
        await findTool('pingos_app_run').handler({
            app: 'amazon',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/app/amazon');
        (0, vitest_1.expect)(opts.method).toBe('GET');
    });
    (0, vitest_1.it)('pingos_app_run with body but no endpoint calls POST /v1/app/{app}', async () => {
        await findTool('pingos_app_run').handler({
            app: 'claude',
            body: { prompt: 'hello' },
        });
        const [url, opts] = fetchMock.mock.calls[0];
        (0, vitest_1.expect)(url).toBe('http://localhost:3500/v1/app/claude');
        (0, vitest_1.expect)(opts.method).toBe('POST');
        (0, vitest_1.expect)(JSON.parse(opts.body)).toEqual({ prompt: 'hello' });
    });
    // ---- fetch always sends Content-Type: application/json ----
    (0, vitest_1.it)('all fetch calls include Content-Type: application/json header', async () => {
        await findTool('pingos_devices').handler({});
        await findTool('pingos_act').handler({ device: 'x', instruction: 'do thing' });
        for (const call of fetchMock.mock.calls) {
            const opts = call[1];
            (0, vitest_1.expect)(opts.headers['Content-Type']).toBe('application/json');
        }
    });
});
// ============================================================================
// textResult — response formatting
// ============================================================================
(0, vitest_1.describe)('textResult formatting', () => {
    let tools;
    let fetchMock;
    function findTool(name) {
        const tool = tools.find((t) => t.name === name);
        if (!tool)
            throw new Error(`Tool "${name}" not found`);
        return tool;
    }
    (0, vitest_1.beforeEach)(() => {
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        tools = mock.tools;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)('returns content array with a single text entry', async () => {
        fetchMock = mockFetch({ devices: ['tab-1', 'tab-2'] });
        const result = await findTool('pingos_devices').handler({});
        (0, vitest_1.expect)(result.content).toHaveLength(1);
        (0, vitest_1.expect)(result.content[0].type).toBe('text');
    });
    (0, vitest_1.it)('JSON-stringifies the gateway response with 2-space indentation', async () => {
        const payload = { devices: ['tab-1', 'tab-2'], count: 2 };
        fetchMock = mockFetch(payload);
        const result = await findTool('pingos_devices').handler({});
        (0, vitest_1.expect)(result.content[0].text).toBe(JSON.stringify(payload, null, 2));
    });
    (0, vitest_1.it)('handles null gateway response', async () => {
        fetchMock = mockFetch(null);
        const result = await findTool('pingos_apps').handler({});
        (0, vitest_1.expect)(result.content[0].text).toBe('null');
    });
    (0, vitest_1.it)('handles complex nested response', async () => {
        const payload = {
            elements: [
                { id: 1, selector: '#btn', type: 'button' },
                { id: 2, selector: 'input.search', type: 'input' },
            ],
            metadata: { url: 'https://example.com', timestamp: 1234567890 },
        };
        fetchMock = mockFetch(payload);
        const result = await findTool('pingos_observe').handler({ device: 'tab-1' });
        const parsed = JSON.parse(result.content[0].text);
        (0, vitest_1.expect)(parsed).toEqual(payload);
    });
});
// ============================================================================
// pingos_screenshot — image content handling
// ============================================================================
(0, vitest_1.describe)('pingos_screenshot', () => {
    let tools;
    function findTool(name) {
        const tool = tools.find((t) => t.name === name);
        if (!tool)
            throw new Error(`Tool "${name}" not found`);
        return tool;
    }
    (0, vitest_1.beforeEach)(() => {
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        tools = mock.tools;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)('returns image content when response contains base64 data', async () => {
        const longBase64 = 'iVBORw0KGgoAAAANS' + 'A'.repeat(200);
        mockFetch({ result: { data: longBase64, mimeType: 'image/png' } });
        const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' });
        (0, vitest_1.expect)(result.content).toHaveLength(1);
        (0, vitest_1.expect)(result.content[0].type).toBe('image');
        (0, vitest_1.expect)(result.content[0].data).toBe(longBase64);
        (0, vitest_1.expect)(result.content[0].mimeType).toBe('image/png');
    });
    (0, vitest_1.it)('returns image content when data is at top level (no result wrapper)', async () => {
        const longBase64 = 'iVBORw0KGgoAAAANS' + 'B'.repeat(200);
        mockFetch({ data: longBase64, mimeType: 'image/jpeg' });
        const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' });
        (0, vitest_1.expect)(result.content).toHaveLength(1);
        (0, vitest_1.expect)(result.content[0].type).toBe('image');
        (0, vitest_1.expect)(result.content[0].data).toBe(longBase64);
        (0, vitest_1.expect)(result.content[0].mimeType).toBe('image/jpeg');
    });
    (0, vitest_1.it)('defaults mimeType to image/png when not provided', async () => {
        const longBase64 = 'iVBORw0KGgoAAAANS' + 'C'.repeat(200);
        mockFetch({ data: longBase64 });
        const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' });
        (0, vitest_1.expect)(result.content[0].mimeType).toBe('image/png');
    });
    (0, vitest_1.it)('falls back to textResult when data is short (not a real image)', async () => {
        mockFetch({ data: 'short', mimeType: 'image/png' });
        const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' });
        (0, vitest_1.expect)(result.content[0].type).toBe('text');
    });
    (0, vitest_1.it)('falls back to textResult when no data field present', async () => {
        mockFetch({ error: 'no screenshot available' });
        const result = await findTool('pingos_screenshot').handler({ device: 'tab-1' });
        (0, vitest_1.expect)(result.content[0].type).toBe('text');
        (0, vitest_1.expect)(result.content[0].text).toContain('no screenshot available');
    });
});
// ============================================================================
// PINGOS_GATEWAY_URL environment variable
// ============================================================================
(0, vitest_1.describe)('PINGOS_GATEWAY_URL environment variable', () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllGlobals();
    });
    (0, vitest_1.it)('defaults to http://localhost:3500 when env var is not set', async () => {
        const fetchFn = mockFetch({ ok: true });
        const mock = createMockServer();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, tools_js_1.registerTools)(mock.server);
        const devicesTool = mock.tools.find((t) => t.name === 'pingos_devices');
        await devicesTool.handler({});
        const [url] = fetchFn.mock.calls[0];
        (0, vitest_1.expect)(url).toMatch(/^http:\/\/localhost:3500\//);
    });
});
//# sourceMappingURL=tools.test.js.map