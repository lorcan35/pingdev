/**
 * Integration test: Full API endpoint testing.
 *
 * Tests all endpoints against the live Gemini UI.
 * Requires the API server to be running on port 3456.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { registerRoutes } from '../../src/api/routes.js';
import { createWorker, disconnectBrowser } from '../../src/worker/index.js';
import { config } from '../../src/config.js';
import type { Worker } from 'bullmq';
import type { JobRequest, EnhancedJobResult } from '../../src/types/index.js';
import { existsSync } from 'node:fs';

let app: FastifyInstance;
let worker: Worker<JobRequest, EnhancedJobResult>;

describe('API Endpoints', () => {
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
    await app.listen({ host: '127.0.0.1', port: 3457 });
  }, 30_000);

  afterAll(async () => {
    try { await worker.close(); } catch { /* ignore */ }
    try { await disconnectBrowser(); } catch { /* ignore */ }
    try { await app.close(); } catch { /* ignore */ }
  }, 30_000);

  it('GET /v1/health should return health status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('browser');
    expect(body).toHaveProperty('queue');
    expect(body).toHaveProperty('worker');
    expect(body).toHaveProperty('timestamp');
    expect(body.browser).toHaveProperty('connected');
  });

  it('POST /v1/jobs should accept a prompt and return job_id', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { prompt: 'Reply with exactly: TEST_ASYNC_001' },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('job_id');
    expect(body.status).toBe('queued');
  });

  it('POST /v1/jobs should reject empty prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { prompt: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /v1/jobs/:id should return 404 for non-existent job', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/jobs/non-existent-id',
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /v1/chat should complete a sync round-trip', async () => {
    // Wait for rate limiter cooldown (3s min delay between requests)
    await new Promise(r => setTimeout(r, 4000));

    const TEST_STR = 'SYNC_TEST_' + Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: `Reply with exactly this text and nothing else: ${TEST_STR}`,
        timeout_ms: 60_000,
      },
    });

    const body = JSON.parse(res.body);
    expect(body.status).toBe('done');
    expect(body.response).toContain(TEST_STR);
    expect(body).toHaveProperty('artifact_path');

    // Should include enhanced metadata
    expect(body).toHaveProperty('timing');
    expect(body).toHaveProperty('state_history');

    // Verify artifacts were created
    if (body.artifact_path) {
      expect(existsSync(body.artifact_path)).toBe(true);
    }
  }, 90_000);
});
