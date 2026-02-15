// @pingdev/std — Gateway server
// Fastify-based HTTP gateway that routes requests through the ModelRegistry

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ModelRegistry } from './registry.js';
import { mapErrnoToHttp } from './errors.js';
import type { DeviceRequest, DeviceResponse, PingError } from './types.js';

// ---------------------------------------------------------------------------
// Request / Reply schemas
// ---------------------------------------------------------------------------

interface PromptBody {
  prompt: string;
  driver?: string;
  require?: DeviceRequest['require'];
  strategy?: DeviceRequest['strategy'];
  timeout_ms?: number;
  conversation_id?: string;
  tool?: string;
}

interface ChatBody extends PromptBody {
  messages?: DeviceRequest['messages'];
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface GatewayOptions {
  port?: number;
  host?: string;
  registry: ModelRegistry;
}

export async function createGateway(opts: GatewayOptions): Promise<FastifyInstance> {
  const { registry, port = 3500, host = '0.0.0.0' } = opts;

  const app = Fastify({ logger: false });

  // ---- Health ----
  app.get('/v1/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // ---- Registry listing ----
  app.get('/v1/registry', async () => {
    return { drivers: registry.listAll() };
  });

  // ---- POST /v1/dev/llm/prompt ----
  app.post<{ Body: PromptBody }>('/v1/dev/llm/prompt', async (request, reply) => {
    const body = request.body as PromptBody;
    if (!body || !body.prompt) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt',
        retryable: false,
      });
    }

    const deviceReq: DeviceRequest = {
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
      const result: DeviceResponse = await driver.execute(deviceReq);
      return result;
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  // ---- POST /v1/dev/llm/chat ----
  app.post<{ Body: ChatBody }>('/v1/dev/llm/chat', async (request, reply) => {
    const body = request.body as ChatBody;
    if (!body || (!body.prompt && !body.messages?.length)) {
      return reply.status(400).send({
        errno: 'ENOSYS',
        code: 'ping.gateway.bad_request',
        message: 'Missing required field: prompt or messages',
        retryable: false,
      });
    }

    const deviceReq: DeviceRequest = {
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
      const result: DeviceResponse = await driver.execute(deviceReq);
      return result;
    } catch (err) {
      return sendPingError(reply, err);
    }
  });

  await app.listen({ port, host });
  return app;
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function isPingError(err: unknown): err is PingError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'errno' in err &&
    'code' in err &&
    'retryable' in err
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendPingError(reply: any, err: unknown) {
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
