#!/usr/bin/env node
"use strict";
// @pingdev/mcp-server — MCP server entry point
// Exposes the PingOS gateway as MCP tools and resources for Claude Desktop, Cursor, etc.
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const tools_js_1 = require("./tools.js");
const resources_js_1 = require("./resources.js");
async function startStdio() {
    const server = new mcp_js_1.McpServer({ name: 'pingos', version: '0.2.0' }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    (0, tools_js_1.registerTools)(server);
    (0, resources_js_1.registerResources)(server);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
async function startSSE(port) {
    // Dynamic import to avoid pulling in http when running in stdio mode
    const http = await import('node:http');
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    const server = new mcp_js_1.McpServer({ name: 'pingos', version: '0.2.0' }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    (0, tools_js_1.registerTools)(server);
    (0, resources_js_1.registerResources)(server);
    let transport = null;
    const httpServer = http.createServer(async (req, res) => {
        // CORS headers for web clients
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new URL(req.url || '/', `http://localhost:${port}`);
        if (url.pathname === '/sse' && req.method === 'GET') {
            // SSE connection endpoint
            transport = new SSEServerTransport('/messages', res);
            await server.connect(transport);
            return;
        }
        if (url.pathname === '/messages' && req.method === 'POST') {
            if (!transport) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No SSE connection established. GET /sse first.' }));
                return;
            }
            try {
                await transport.handlePostMessage(req, res);
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `MCP message handling failed: ${String(err)}` }));
            }
            return;
        }
        // Health check
        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', transport: 'sse', port }));
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use GET /sse for SSE or POST /messages for messages.' }));
    });
    httpServer.listen(port, () => {
        // Write to stderr so it doesn't interfere with stdio if used as subprocess
        process.stderr.write(`[pingos-mcp] SSE server listening on http://localhost:${port}\n`);
        process.stderr.write(`[pingos-mcp] SSE endpoint: GET http://localhost:${port}/sse\n`);
        process.stderr.write(`[pingos-mcp] Messages endpoint: POST http://localhost:${port}/messages\n`);
    });
}
// --- CLI argument parsing ---
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 3600;
if (useSSE) {
    startSSE(port).catch((err) => {
        process.stderr.write(`[pingos-mcp] SSE startup failed: ${err}\n`);
        process.exit(1);
    });
}
else {
    startStdio().catch((err) => {
        process.stderr.write(`[pingos-mcp] stdio startup failed: ${err}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map