"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTools = registerTools;
// @pingdev/mcp-server — MCP tool definitions wrapping the PingOS gateway API
const zod_1 = require("zod");
const GATEWAY_URL = process.env.PINGOS_GATEWAY_URL || 'http://localhost:3500';
async function gw(path, method = 'GET', body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined)
        opts.body = JSON.stringify(body);
    const res = await fetch(`${GATEWAY_URL}${path}`, opts);
    return res.json();
}
function textResult(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function registerTools(server) {
    // 1. pingos_devices — List connected browser tabs
    server.tool('pingos_devices', 'List connected browser tabs (devices) managed by PingOS', {}, async () => textResult(await gw('/v1/devices')));
    // 2. pingos_recon — Get page structure
    server.tool('pingos_recon', 'Get page structure / DOM snapshot from a device', { device: zod_1.z.string().describe('Device ID (tab ID)') }, async ({ device }) => textResult(await gw(`/v1/dev/${device}/recon`, 'POST', {})));
    // 3. pingos_observe — List available actions
    server.tool('pingos_observe', 'List available actions / interactive elements on a device page', { device: zod_1.z.string().describe('Device ID') }, async ({ device }) => textResult(await gw(`/v1/dev/${device}/observe`, 'POST', {})));
    // 4. pingos_extract — Extract structured data
    server.tool('pingos_extract', 'Extract structured data from a device page', {
        device: zod_1.z.string().describe('Device ID'),
        query: zod_1.z.string().optional().describe('Natural language query describing what to extract'),
        schema: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().describe('JSON Schema for the extraction result'),
    }, async ({ device, query, schema }) => textResult(await gw(`/v1/dev/${device}/extract`, 'POST', { query, schema })));
    // 5. pingos_act — Execute instruction
    server.tool('pingos_act', 'Execute a natural language instruction on a device (e.g. "click the login button")', {
        device: zod_1.z.string().describe('Device ID'),
        instruction: zod_1.z.string().describe('Natural language instruction to execute'),
    }, async ({ device, instruction }) => textResult(await gw(`/v1/dev/${device}/act`, 'POST', { instruction })));
    // 6. pingos_click — Click element
    server.tool('pingos_click', 'Click an element on a device page by CSS selector', {
        device: zod_1.z.string().describe('Device ID'),
        selector: zod_1.z.string().describe('CSS selector of the element to click'),
    }, async ({ device, selector }) => textResult(await gw(`/v1/dev/${device}/click`, 'POST', { selector })));
    // 7. pingos_type — Type text
    server.tool('pingos_type', 'Type text into an element on a device page', {
        device: zod_1.z.string().describe('Device ID'),
        text: zod_1.z.string().describe('Text to type'),
        selector: zod_1.z.string().optional().describe('CSS selector of the input element (optional — uses focused element if omitted)'),
    }, async ({ device, text, selector }) => textResult(await gw(`/v1/dev/${device}/type`, 'POST', { text, selector })));
    // 8. pingos_read — Read element text
    server.tool('pingos_read', 'Read the text content of an element on a device page', {
        device: zod_1.z.string().describe('Device ID'),
        selector: zod_1.z.string().describe('CSS selector of the element to read'),
    }, async ({ device, selector }) => textResult(await gw(`/v1/dev/${device}/read`, 'POST', { selector })));
    // 9. pingos_press — Press keyboard key
    server.tool('pingos_press', 'Press a keyboard key on a device (e.g. "Enter", "Tab", "Escape")', {
        device: zod_1.z.string().describe('Device ID'),
        key: zod_1.z.string().describe('Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown")'),
    }, async ({ device, key }) => textResult(await gw(`/v1/dev/${device}/press`, 'POST', { key })));
    // 10. pingos_scroll — Scroll page
    server.tool('pingos_scroll', 'Scroll the page on a device', {
        device: zod_1.z.string().describe('Device ID'),
        direction: zod_1.z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction (default: down)'),
        amount: zod_1.z.number().optional().describe('Scroll amount in pixels'),
    }, async ({ device, direction, amount }) => textResult(await gw(`/v1/dev/${device}/scroll`, 'POST', { direction, amount })));
    // 11. pingos_screenshot — Take screenshot
    server.tool('pingos_screenshot', 'Take a screenshot of a device page (returns base64 PNG)', { device: zod_1.z.string().describe('Device ID') }, async ({ device }) => {
        const result = await gw(`/v1/dev/${device}/screenshot`, 'POST', {});
        // If result contains a base64 image, return it as an image content
        const inner = (result?.result ?? result);
        if (typeof inner?.data === 'string' && inner.data.length > 100) {
            return {
                content: [{
                        type: 'image',
                        data: inner.data,
                        mimeType: inner.mimeType || 'image/png',
                    }],
            };
        }
        return textResult(result);
    });
    // 12. pingos_eval — Evaluate JavaScript
    server.tool('pingos_eval', 'Evaluate a JavaScript expression in the context of a device page', {
        device: zod_1.z.string().describe('Device ID'),
        expression: zod_1.z.string().describe('JavaScript expression to evaluate'),
    }, async ({ device, expression }) => textResult(await gw(`/v1/dev/${device}/eval`, 'POST', { expression })));
    // 13. pingos_query — Natural language query
    server.tool('pingos_query', 'Ask a natural-language question about the current page and get an answer + selector metadata', {
        device: zod_1.z.string().describe('Device ID'),
        question: zod_1.z.string().describe('Natural language question about the page'),
    }, async ({ device, question }) => textResult(await gw(`/v1/dev/${device}/query`, 'POST', { question })));
    // 14. pingos_apps — List PingApps
    server.tool('pingos_apps', 'List available PingApps (high-level website drivers like AliExpress, Amazon, Claude)', {}, async () => textResult(await gw('/v1/apps')));
    // 15. pingos_app_run — Run PingApp endpoint
    server.tool('pingos_app_run', 'Run a PingApp action (e.g. app="aliexpress", endpoint="search", body={query:"laptop"})', {
        app: zod_1.z.string().describe('App name (e.g. "aliexpress", "amazon", "claude")'),
        endpoint: zod_1.z.string().optional().describe('Action endpoint (e.g. "search", "product", "cart")'),
        body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().describe('Request body as JSON object'),
    }, async ({ app, endpoint, body }) => {
        const path = endpoint ? `/v1/app/${app}/${endpoint}` : `/v1/app/${app}`;
        const method = body ? 'POST' : 'GET';
        return textResult(await gw(path, method, body));
    });
    // 16. pingos_extract_semantic — LLM selector synthesis + extraction in one call
    server.tool('pingos_extract_semantic', 'Extract data using semantic query (LLM builds selectors, then extraction runs)', {
        device: zod_1.z.string().describe('Device ID'),
        query: zod_1.z.string().describe('What to extract in natural language'),
        limit: zod_1.z.number().optional().describe('Optional result item limit'),
    }, async ({ device, query, limit }) => textResult(await gw(`/v1/dev/${device}/extract/semantic`, 'POST', { query, limit })));
    // 17. pingos_watch_start — Start server-side watch stream descriptor
    server.tool('pingos_watch_start', 'Start change watching for a schema and return watch metadata (watchId, stream URL)', {
        device: zod_1.z.string().describe('Device ID'),
        schema: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).describe('Field-to-selector schema'),
        interval_ms: zod_1.z.number().optional().describe('Polling interval in milliseconds'),
        threshold: zod_1.z.number().optional().describe('Optional diff threshold'),
        max_events: zod_1.z.number().optional().describe('Optional max event count'),
    }, async ({ device, schema, interval_ms, threshold, max_events }) => textResult(await gw(`/v1/dev/${device}/watch/start`, 'POST', { schema, interval_ms, threshold, max_events })));
    // 18. pingos_templates — List learned extraction templates
    server.tool('pingos_templates', 'List learned extraction templates currently stored by PingOS', {}, async () => textResult(await gw('/v1/templates')));
    // 19. pingos_api — Generic gateway call for full surface coverage
    server.tool('pingos_api', 'Call any PingOS gateway endpoint directly. Use when a specialized tool is not available.', {
        path: zod_1.z.string().describe('Gateway path, e.g. /v1/recordings or /v1/functions'),
        method: zod_1.z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default GET)'),
        body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().describe('Optional JSON body for non-GET requests'),
    }, async ({ path, method, body }) => textResult(await gw(path, method || 'GET', body)));
}
//# sourceMappingURL=tools.js.map