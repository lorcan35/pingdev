// @pingdev/mcp-server — MCP resource definitions wrapping the PingOS gateway API
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

const GATEWAY_URL = process.env.PINGOS_GATEWAY_URL || 'http://localhost:3500';

async function gw(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: true, status: res.status, message: text || `Gateway returned ${res.status}` };
    }
    return await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort')) {
      return { error: true, message: `Gateway request timed out after 10s: GET ${path}` };
    }
    return { error: true, message: `Gateway request failed: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

export function registerResources(server: McpServer): void {
  // 1. pingos://devices — Live tab list
  server.resource(
    'devices',
    'pingos://devices',
    { description: 'List of connected browser tabs (devices) managed by PingOS', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pingos://devices',
        mimeType: 'application/json',
        text: JSON.stringify(await gw('/v1/devices'), null, 2),
      }],
    }),
  );

  // 2. pingos://tab/{id}/dom — Page DOM snapshot (via recon)
  server.resource(
    'tab-dom',
    new ResourceTemplate('pingos://tab/{id}/dom', { list: undefined }),
    { description: 'Page DOM snapshot for a specific device/tab', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = variables.id as string;
      let data: unknown;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/dev/${id}/recon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          data = { error: true, status: res.status, message: text || `Gateway returned ${res.status}` };
        } else {
          data = await res.json();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        data = { error: true, message: msg.includes('abort') ? `Gateway request timed out after 10s` : `Gateway request failed: ${msg}` };
      } finally {
        clearTimeout(timeout);
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        }],
      };
    },
  );

  // 3. pingos://apps — Available PingApps
  server.resource(
    'apps',
    'pingos://apps',
    { description: 'List of available PingApps (high-level website drivers)', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pingos://apps',
        mimeType: 'application/json',
        text: JSON.stringify(await gw('/v1/apps'), null, 2),
      }],
    }),
  );

  // 4. pingos://templates — Learned extraction templates
  server.resource(
    'templates',
    'pingos://templates',
    { description: 'Learned extraction templates by domain', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pingos://templates',
        mimeType: 'application/json',
        text: JSON.stringify(await gw('/v1/templates'), null, 2),
      }],
    }),
  );

  // 5. pingos://llm/models — LLM models exposed by the gateway registry
  server.resource(
    'llm-models',
    'pingos://llm/models',
    { description: 'Available LLM models from registered drivers', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pingos://llm/models',
        mimeType: 'application/json',
        text: JSON.stringify(await gw('/v1/llm/models'), null, 2),
      }],
    }),
  );
}
