/**
 * Fastify API Routes for PingDev.
 *
 * Endpoints:
 * - POST /v1/jobs — submit a prompt (async, returns job_id)
 * - GET /v1/jobs/:id — get job status/result (with enhanced metadata)
 * - GET /v1/jobs/:id/status — real-time detailed status
 * - GET /v1/jobs/:id/thinking — extract thinking/reasoning content
 * - GET /v1/jobs/:id/stream — SSE stream of job events
 * - POST /v1/chat — sync convenience (blocks until done)
 * - GET /v1/health — system health check
 */
import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import type { SiteDefinition, JobRequest, EnhancedJobResult, RedisConfig, ShimAppOptions } from '../types.js';
import { RateLimiter } from './rate-limiter.js';
import { IdempotencyStore } from './idempotency.js';
export declare function registerRoutes(app: FastifyInstance, site: SiteDefinition, options: {
    queue: Queue<JobRequest, EnhancedJobResult>;
    rateLimiter: RateLimiter;
    idempotencyStore: IdempotencyStore;
    redisConfig: RedisConfig;
    appOptions: ShimAppOptions;
}): Promise<void>;
//# sourceMappingURL=routes.d.ts.map