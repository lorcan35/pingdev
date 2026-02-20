// @pingdev/mcp-server — MCP resource definitions wrapping the PingOS gateway API
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

const GATEWAY_URL = process.env.PINGOS_GATEWAY_URL || 'http://localhost:3500';

async function gw(path: string): Promise<unknown> {
  const res = await fetch(`${GATEWAY_URL}${path}`);
  return res.json();
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
      const data = await fetch(`${GATEWAY_URL}/v1/dev/${id}/recon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then((r) => r.json());
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
}
