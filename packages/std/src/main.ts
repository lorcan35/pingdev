// @pingdev/std — Gateway entrypoint
// Starts the HTTP + WebSocket gateway on port 3500 (defaults to dual-stack host ::).

import { createGateway } from './gateway.js';
import { ModelRegistry } from './registry.js';
import { ExtensionBridge } from './ext-bridge.js';
import { logCrash, logGateway, serializeError } from './gw-log.js';

// ---------------------------------------------------------------------------
// Crash / rejection logging
// ---------------------------------------------------------------------------

// IMPORTANT: Node 24 can terminate on unhandled promise rejections.
// Install global handlers early to capture details.
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', serializeError(err));
  // Also surface in stdout/stderr when running in foreground.
  // eslint-disable-next-line no-console
  console.error('[PingOS] uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', serializeError(reason));
  // eslint-disable-next-line no-console
  console.error('[PingOS] unhandledRejection', reason);
});

const port = Number.parseInt(process.env.PING_GATEWAY_PORT ?? process.env.PORT ?? '3500', 10);
const host = process.env.PING_GATEWAY_HOST ?? '::';

const registry = new ModelRegistry();
const extBridge = new ExtensionBridge();

logGateway('[main] starting', { host, port, pid: process.pid });

const app = await createGateway({ registry, port, host, extBridge });

const displayHost = host.includes(':') ? `[${host}]` : host;
console.log(`PingOS Gateway running on http://${displayHost}:${port}`);
logGateway('[main] started', { host, port });

async function shutdown(signal: string) {
  try {
    console.log(`Received ${signal}. Shutting down...`);
    logGateway('[main] shutdown', { signal });
    extBridge.stop();
    await app.close();
  } catch {
    // ignore
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
