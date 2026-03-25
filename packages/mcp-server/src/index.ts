#!/usr/bin/env node
// @pingdev/mcp-server — MCP server entry point
// Exposes the PingOS gateway as MCP tools and resources for Claude Desktop, Cursor, etc.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

async function startStdio(): Promise<void> {
  const server = new McpServer(
    { name: 'pingos', version: '0.2.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  registerTools(server);
  registerResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startSSE(port: number): Promise<void> {
  // Dynamic import to avoid pulling in http when running in stdio mode
  const http = await import('node:http');
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');

  // Map of sessionId -> { server, transport } to support multiple concurrent SSE clients
  const sessions = new Map<string, {
    server: McpServer;
    transport: InstanceType<typeof SSEServerTransport>;
  }>();

  function createServer(): McpServer {
    const server = new McpServer(
      { name: 'pingos', version: '0.2.0' },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );
    registerTools(server);
    registerResources(server);
    return server;
  }

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
      // Create a new MCP server + transport per SSE client
      const transport = new SSEServerTransport('/messages', res);
      const server = createServer();
      const sessionId = transport.sessionId;
      sessions.set(sessionId, { server, transport });

      // Clean up session when the client disconnects
      res.on('close', () => {
        sessions.delete(sessionId);
        process.stderr.write(`[pingos-mcp] SSE client disconnected: ${sessionId}\n`);
      });

      await server.connect(transport);
      process.stderr.write(`[pingos-mcp] SSE client connected: ${sessionId} (${sessions.size} active)\n`);
      return;
    }

    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing sessionId. GET /sse first to establish a session.' }));
        return;
      }
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.handlePostMessage(req, res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `MCP message handling failed: ${String(err)}` }));
      }
      return;
    }

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'sse', port, activeSessions: sessions.size }));
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
} else {
  startStdio().catch((err) => {
    process.stderr.write(`[pingos-mcp] stdio startup failed: ${err}\n`);
    process.exit(1);
  });
}
