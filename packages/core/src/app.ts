import Fastify from 'fastify';
import { Queue } from 'bullmq';
import type { SiteDefinition, ShimAppOptions, JobRequest, EnhancedJobResult } from './types.js';
import { resolveConfig } from './config.js';
import { createLogger } from './logger.js';
import { RateLimiter } from './api/rate-limiter.js';
import { IdempotencyStore } from './api/idempotency.js';
import { ConversationStore } from './worker/conversation-store.js';
import { registerSwagger } from './api/swagger.js';
import { registerRoutes } from './api/routes.js';
import { createWorker } from './worker/index.js';

export interface ShimApp {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createShimApp(site: SiteDefinition, options: ShimAppOptions = {}): ShimApp {
  const config = resolveConfig(site);
  const port = options.port ?? 3456;
  const host = options.host ?? '0.0.0.0';
  const log = createLogger(site.name, options.logLevel);

  const redisConfig = { ...config.redis, ...options.redis };

  // Create infrastructure — config is fully resolved, so all fields are present
  const rateLimiter = new RateLimiter(config.rateLimit);
  const idempotencyStore = new IdempotencyStore(redisConfig, config.idempotency);
  const conversationStore = new ConversationStore(redisConfig, config.conversation);

  const queue = new Queue(config.queue.name, {
    connection: { host: redisConfig.host, port: redisConfig.port },
  });

  let worker: ReturnType<typeof createWorker> | null = null;

  return {
    async start() {
      log.info(`Starting PingDev — ${site.name}`);

      const app = Fastify({ logger: false });

      await registerSwagger(app, site, port);
      await registerRoutes(app, site, {
        queue: queue as Queue<JobRequest, EnhancedJobResult>,
        rateLimiter,
        idempotencyStore,
        redisConfig,
        appOptions: options,
      });

      worker = createWorker(site, {
        redisConfig,
        queueConfig: config.queue,
        retryConfig: config.retry,
        conversationStore,
        idempotencyStore,
        artifactsDir: config.artifactsDir,
      });

      await app.listen({ host, port });
      log.info({ host, port }, 'HTTP server listening');

      const shutdown = async (signal: string) => {
        log.info({ signal }, 'Shutting down...');
        if (worker) await worker.close();
        await conversationStore.close();
        await idempotencyStore.close();
        await queue.close();
        await app.close();
        log.info('Shutdown complete');
        process.exit(0);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    },

    async stop() {
      if (worker) await worker.close();
      await conversationStore.close();
      await idempotencyStore.close();
      await queue.close();
    },
  };
}
