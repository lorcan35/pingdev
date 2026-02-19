// @pingdev/std — Gateway server
// Fastify-based HTTP gateway that routes requests through the ModelRegistry

import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { ModelRegistry } from './registry.js';
import { mapErrnoToHttp } from './errors.js';
import { ExtensionBridge } from './ext-bridge.js';
import { logGateway, serializeError } from './gw-log.js';
import { loadConfig } from './config.js';
import { SelectorCache } from './selector-cache.js';
import { attemptHeal, configureSelfHeal } from './self-heal.js';

export async function createGateway(opts) {
  // Default to IPv6 any-address so `localhost` (which often resolves to ::1 in Chrome)
  // can connect. On Linux this is typically dual-stack and will also accept IPv4.
  const { registry, port = 3500, host = '::' } = opts;
  const extBridge = opts.extBridge ?? new ExtensionBridge();

  // Load config for optional gateway middleware (e.g., self-healing).
  const cfg = await loadConfig();
  const selfHealCfg = cfg.selfHeal;

  const selectorCache = new SelectorCache();
  await selectorCache.load();
  configureSelfHeal({ extBridge, config: selfHealCfg });

  const healStats = {
    attempts: 0,
    successes: 0,
    cacheHits: 0,
    cacheHitSuccesses: 0,
    llmAttempts: 0,
    llmSuccesses: 0,
  };

  const app = Fastify({ logger: false });

  // Global Fastify-level logging + timing
  app.addHook('onRequest', async (request) => {
    request._startAt = process.hrtime.bigint();
    logGateway('[http] request', {
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    const startAt = request._startAt;
    const durationMs = startAt ? Number(process.hrtime.bigint() - startAt) / 1e6 : undefined;
    logGateway('[http] response', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
    });
  });

  app.addHook('onError', async (request, _reply, error) => {
    logGateway('[http] onError', {
      method: request.method,
      url: request.url,
      error: serializeError(error),
    });
  });

  // ---- Health ----
  app.get('/v1/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // ---- Registry listing ----
  app.get('/v1/registry', async () => {
    return { drivers: registry.listAll() };
  });

  // ---- Self-heal debug endpoints ----
  app.get('/v1/heal/cache', async () => {
    return { ok: true, cache: selectorCache.getAll() };
  });

  app.get('/v1/heal/stats', async () => {
    const attempts = healStats.attempts || 0;
    const cacheHits = healStats.cacheHits || 0;
    const llmAttempts = healStats.llmAttempts || 0;
    return {
      ok: true,
      enabled: selfHealCfg.enabled,
      stats: {
        ...healStats,
        successRate: attempts ? healStats.successes / attempts : 0,
        cacheHitRate: attempts ? cacheHits / attempts : 0,
        cacheHitSuccessRate: cacheHits ? healStats.cacheHitSuccesses / cacheHits : 0,
        llmSuccessRate: llmAttempts ? healStats.llmSuccesses / llmAttempts : 0,
      },
    };
  });

  // ---- Connected devices (extension bridge) ----
  app.get('/v1/devices', async () => {
    const clients = extBridge.listSharedTabs();
    const devices = clients.flatMap(({ clientId, tabs }) =>
      (tabs ?? []).map((t) => ({ ...t, clientId })),
    );
    return { extension: { clients, devices } };
  });

  // ---- Device status ----
  app.get('/v1/dev/:device/status', async (request, reply) => {
    const { device } = request.params;
    const status = extBridge.getDeviceStatus(device);
    if (!status.owned) {
      return reply.status(404).send({
        errno: 'ENODEV',
        code: 'ping.gateway.device_not_found',
        message: `Device ${device} not found`,
        retryable: false,
      });
    }
    return { ok: true, device, status };
  });

  // ---- POST /v1/dev/llm/prompt ----
  app.post('/v1/dev/llm/prompt', async (request, reply) => {
    const body = request.body;
    if (!body || !body.prompt) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt',
        retryable: false,
      });
    }

    const deviceReq = {
      prompt: body.prompt,
      driver: body.driver,
      require: body.require,
      strategy: body.strategy,
      timeout_ms: body.timeout_ms,
      conversation_id: body.conversation_id,
      tool: body.tool,
    };

    try {
      const driver = registry.resolve(deviceReq);
      const result = await driver.execute(deviceReq);
      return result;
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/llm/chat ----
  app.post('/v1/dev/llm/chat', async (request, reply) => {
    const body = request.body;
    if (!body || (!body.prompt && !body.messages?.length)) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt or messages',
        retryable: false,
      });
    }

    const deviceReq = {
      prompt: body.prompt ?? '',
      messages: body.messages,
      driver: body.driver,
      require: body.require,
      strategy: body.strategy,
      timeout_ms: body.timeout_ms,
      conversation_id: body.conversation_id,
      tool: body.tool,
    };

    try {
      const driver = registry.resolve(deviceReq);
      const result = await driver.execute(deviceReq);
      return result;
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/:device/:op — Generic device operation route ----
  // Forwards to extension if it owns the device; otherwise falls back to driver registry.
  app.post('/v1/dev/:device/:op', async (request, reply) => {
    const { device, op } = request.params;
    const payload = request.body;

    // 1. Check if extension owns this device
    if (extBridge.ownsDevice(device)) {
      const payloadObj = payload && typeof payload === 'object' ? payload : undefined;
      const selector = typeof payloadObj?.selector === 'string' ? String(payloadObj.selector) : '';

      try {
        const result = await extBridge.callDevice({
          deviceId: device,
          op,
          payload,
          timeoutMs: 20_000,
        });
        return { ok: true, result };
      } catch (err) {
        if (
          selfHealCfg.enabled &&
          selector &&
          isElementNotFoundError(err) &&
          (op === 'read' || op === 'click' || op === 'type' || op === 'waitFor')
        ) {
          healStats.attempts++;

          const deviceUrl = getDeviceUrlFromShares(extBridge, device);

          // 1) Cache retry (fast path)
          const cached = selectorCache.lookup(selector, deviceUrl ?? '');
          if (cached) {
            healStats.cacheHits++;
            try {
              const retryResult = await extBridge.callDevice({
                deviceId: device,
                op,
                payload: { ...payloadObj, selector: cached },
                timeoutMs: 20_000,
              });
              healStats.successes++;
              healStats.cacheHitSuccesses++;
              return { ok: true, result: retryResult, _healed: { from: selector, to: cached, cached: true } };
            } catch {
              // continue to LLM path
            }
          }

          // 2) LLM retry
          healStats.llmAttempts++;
          const errorMsg = isPingError(err) ? err.message : err instanceof Error ? err.message : String(err);
          const healResult = await attemptHeal({
            deviceId: device,
            op,
            selector,
            error: errorMsg,
          });

          if (healResult && healResult.confidence >= selfHealCfg.minConfidence) {
            try {
              const retryResult = await extBridge.callDevice({
                deviceId: device,
                op,
                payload: { ...payloadObj, selector: healResult.newSelector },
                timeoutMs: 20_000,
              });
              healStats.successes++;
              healStats.llmSuccesses++;
              selectorCache.store(selector, healResult.newSelector, deviceUrl ?? '', healResult.confidence);
              return {
                ok: true,
                result: retryResult,
                _healed: {
                  from: selector,
                  to: healResult.newSelector,
                  cached: false,
                  confidence: healResult.confidence,
                  reasoning: healResult.reasoning,
                },
              };
            } catch {
              // fall through to original error
            }
          }
        }
        return sendPingError(reply, err);
      }
    }

    // 2. Fall back to driver registry for known device types (e.g., "llm")
    if (device === 'llm' && (op === 'prompt' || op === 'chat')) {
      const body = payload;
      if (!body || (!body.prompt && !body.messages?.length)) {
        return reply.status(400).send({
          errno: 'ENOSYS',
          code: 'ping.gateway.bad_request',
          message: 'Missing required field: prompt or messages',
          retryable: false,
        });
      }

      const deviceReq = {
        prompt: body.prompt ?? '',
        messages: body.messages,
        driver: body.driver,
        require: body.require,
        strategy: body.strategy,
        timeout_ms: body.timeout_ms,
        conversation_id: body.conversation_id,
        tool: body.tool,
      };

      try {
        const driver = registry.resolve(deviceReq);
        const result = await driver.execute(deviceReq);
        return result;
      } catch (err) {
        return sendPingError(reply, err);
      }
    }

    // 3. Unknown device
    return reply.status(404).send({
      errno: 'ENODEV',
      code: 'ping.gateway.device_not_found',
      message: `Device ${device} not found`,
      retryable: false,
    });
  });

  // ---- WebSocket upgrade handler ----
  logGateway('[gw] starting ExtensionBridge');
  extBridge.start();

  // IMPORTANT: unhandled 'error' events can crash Node.
  app.server.on('error', (err) => {
    logGateway('[http] server error', serializeError(err));
  });

  app.server.on('upgrade', (req, socket, head) => {
    try {
      const handled = extBridge.handleUpgrade(req, socket, head);
      if (!handled) {
        logGateway('[ext] upgrade not handled', { url: req.url });
        socket.destroy();
      }
    } catch (err) {
      logGateway('[ext] upgrade handler threw', serializeError(err));
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
  });

  logGateway('[gw] listening', { host, port });
  await app.listen({ port, host });
  return app;
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function isPingError(err) {
  return err !== null && typeof err === 'object' && 'errno' in err && 'code' in err && 'retryable' in err;
}

function isElementNotFoundError(err) {
  if (!isPingError(err)) return false;
  if (err.errno !== 'EIO') return false;
  const msg = (err.message ?? '').toLowerCase();
  const details = (typeof err.details === 'string' ? err.details : '').toLowerCase();
  const text = msg + ' ' + details;
  return (
    text.includes('element not found:') ||
    text.includes('element not found') ||
    text.includes('timeout waiting for selector:') ||
    text.includes('no node found for selector')
  );
}

function getDeviceUrlFromShares(extBridge, deviceId) {
  try {
    for (const { tabs } of extBridge.listSharedTabs()) {
      for (const t of tabs ?? []) {
        if (t.deviceId === deviceId) return t.url;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function sendPingError(reply, err) {
  if (isPingError(err)) {
    const httpStatus = mapErrnoToHttp(err.errno);
    return reply.status(httpStatus).send(err);
  }
  return reply.status(500).send({
    errno: 'EIO',
    code: 'ping.gateway.internal',
    message: err instanceof Error ? err.message : 'Internal server error',
    retryable: false,
  });
}

// ---------------------------------------------------------------------------
// Standalone startup (optional)
// ---------------------------------------------------------------------------

// If this file is executed directly (node gateway.js), start a minimal gateway.
// NOTE: packages/std/src/main.ts remains the preferred entrypoint.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number.parseInt(process.env.PING_GATEWAY_PORT ?? process.env.PORT ?? '3500', 10);
  const host = process.env.PING_GATEWAY_HOST ?? '::';
  const registry = new ModelRegistry();
  const extBridge = new ExtensionBridge();

  // eslint-disable-next-line no-console
  console.log(`[PingOS] Starting gateway (standalone) on ${host}:${port}`);

  const app = await createGateway({ registry, port, host, extBridge });

  async function shutdown(signal) {
    try {
      // eslint-disable-next-line no-console
      console.log(`Received ${signal}. Shutting down...`);
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
}
