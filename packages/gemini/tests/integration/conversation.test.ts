/**
 * Integration test: Conversation continuity — send a message, get conversation_id,
 * send follow-up with that conversation_id, verify Gemini remembers context.
 *
 * Requires live browser + Redis.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { registerRoutes } from '../../src/api/routes.js';
import { createWorker, disconnectBrowser } from '../../src/worker/index.js';
import { closeConversationStore } from '../../src/worker/conversation-store.js';
import { closeIdempotency } from '../../src/api/idempotency.js';
import { config } from '../../src/config.js';
import type { Worker } from 'bullmq';
import type { JobRequest, EnhancedJobResult } from '../../src/types/index.js';

let app: FastifyInstance;
let worker: Worker<JobRequest, EnhancedJobResult>;

describe('Conversation Continuity', () => {
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
    await app.listen({ host: '127.0.0.1', port: 3460 });
  }, 30_000);

  afterAll(async () => {
    try { await worker.close(); } catch { /* ignore */ }
    try { await disconnectBrowser(); } catch { /* ignore */ }
    try { await closeConversationStore(); } catch { /* ignore */ }
    try { await closeIdempotency(); } catch { /* ignore */ }
    try { await app.close(); } catch { /* ignore */ }
  }, 30_000);

  it('should return a conversation_id from first message', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: 'Reply with exactly this text and nothing else: CONVO_FIRST',
        timeout_ms: 90_000,
      },
    });

    const body = JSON.parse(res.body);
    expect(body.status).toBe('done');
    expect(body.response).toContain('CONVO_FIRST');
    expect(body.conversation_id).toBeTruthy();
    expect(typeof body.conversation_id).toBe('string');
  }, 120_000);

  it('should continue conversation with conversation_id', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    // Step 1: Send first message defining a value
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: 'Remember this: the secret number is 42. Reply with "Understood, secret number is 42"',
        timeout_ms: 90_000,
      },
    });

    const body1 = JSON.parse(res1.body);
    expect(body1.status).toBe('done');
    expect(body1.conversation_id).toBeTruthy();
    expect(body1.response).toContain('42');

    const conversationId = body1.conversation_id;

    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    // Step 2: Follow-up in same conversation, asking about the value
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        prompt: 'What is the secret number I just told you? Reply with just the number.',
        conversation_id: conversationId,
        timeout_ms: 90_000,
      },
    });

    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe('done');
    // Gemini should remember the context from the first message
    expect(body2.response).toContain('42');
    expect(body2.conversation_id).toBe(conversationId);
  }, 240_000);

  it('should include conversation_id in async job results', async () => {
    // Wait for rate limiter cooldown
    await new Promise(r => setTimeout(r, 4000));

    // Submit async job
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        prompt: 'Reply with exactly this text and nothing else: CONVO_ASYNC',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    const jobId = body.job_id;

    // Wait for job to complete
    let resultBody: Record<string, unknown> | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await app.inject({
        method: 'GET',
        url: `/v1/jobs/${jobId}`,
      });
      const statusBody = JSON.parse(statusRes.body);
      if (statusBody.status === 'done' || statusBody.status === 'failed') {
        resultBody = statusBody;
        break;
      }
    }

    expect(resultBody).not.toBeNull();
    expect(resultBody!.status).toBe('done');
    expect(resultBody!.conversation_id).toBeTruthy();
  }, 180_000);
});
