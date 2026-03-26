/**
 * Integration test: Idempotency — submit same request twice with same key,
 * verify second returns cached result.
 *
 * Requires live browser + Redis.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { registerRoutes } from '../../src/api/routes.js';
import { createWorker, disconnectBrowser } from '../../src/worker/index.js';
import { closeIdempotency } from '../../src/api/idempotency.js';
import { config } from '../../src/config.js';
import type { Worker } from 'bullmq';
import type { JobRequest, EnhancedJobResult } from '../../src/types/index.js';

let app: FastifyInstance;
let worker: Worker<JobRequest, EnhancedJobResult>;

describe('Idempotency Integration', () => {
  beforeAll(async () => {
    // Drain stale jobs from previous test runs
    const cleanupQ = new Queue(config.queue.name, {
      connection: { host: config.redis.host, port: config.redis.port },
    });
    await cleanupQ.drain();
    await cleanupQ.close();

    app = Fastify({ logger: false });
    await registerRoutes(app);
    worker = createWorker();
    await app.listen({ host: '127.0.0.1', port: 3459 });
  }, 30_000);

  afterAll(async () => {
    try { await worker.close(); } catch { /* ignore */ }
    try { await disconnectBrowser(); } catch { /* ignore */ }
    try { await closeIdempotency(); } catch { /* ignore */ }
    try { await app.close(); } catch { /* ignore */ }
  }, 30_000);

  it('should return cached result for duplicate sync request', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    const idempotencyKey = 'idemp-test-' + Date.now();
    const testStr = 'IDEMP_TEST_' + Date.now();

    // First request — should process normally
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: `Reply with exactly this text and nothing else: ${testStr}`,
        idempotency_key: idempotencyKey,
        timeout_ms: 90_000,
      },
    });

    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe('done');
    expect(body1.response).toContain(testStr);

    // Second request — same key + same prompt → should return cached
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: `Reply with exactly this text and nothing else: ${testStr}`,
        idempotency_key: idempotencyKey,
        timeout_ms: 10_000,
      },
    });

    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe('done');
    expect(body2.response).toContain(testStr);
    expect(body2.cached).toBe(true);
    expect(body2.job_id).toBe(body1.job_id);
  }, 120_000);

  it('should return cached result for duplicate async request', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    const idempotencyKey = 'idemp-async-' + Date.now();
    const testStr = 'IDEMP_ASYNC_' + Date.now();

    // First request — enqueue
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        prompt: `Reply with exactly this text and nothing else: ${testStr}`,
        idempotency_key: idempotencyKey,
      },
    });

    expect(res1.statusCode).toBe(202);
    const body1 = JSON.parse(res1.body);
    const jobId = body1.job_id;

    // Wait for job to complete
    let completed = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await app.inject({
        method: 'GET',
        url: `/v1/jobs/${jobId}`,
      });
      const statusBody = JSON.parse(statusRes.body);
      if (statusBody.status === 'done' || statusBody.status === 'failed') {
        completed = true;
        expect(statusBody.status).toBe('done');
        break;
      }
    }
    expect(completed).toBe(true);

    // Second request — same key + same prompt → should return cached
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        prompt: `Reply with exactly this text and nothing else: ${testStr}`,
        idempotency_key: idempotencyKey,
      },
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.cached).toBe(true);
    expect(body2.job_id).toBe(jobId);
    expect(body2.status).toBe('done');
  }, 180_000);
});
