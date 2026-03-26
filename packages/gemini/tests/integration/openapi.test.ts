/**
 * Integration test: OpenAPI / Swagger docs at GET /docs.
 *
 * Verifies the Swagger UI is served and the OpenAPI spec contains all endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSwagger } from '../../src/api/swagger.js';
import { registerRoutes } from '../../src/api/routes.js';

let app: FastifyInstance;

describe('OpenAPI / Swagger Docs', () => {
  beforeAll(async () => {
    app = Fastify({ logger: false });
    await registerSwagger(app);
    await registerRoutes(app);
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    try { await app.close(); } catch { /* ignore */ }
  }, 10_000);

  it('GET /docs should return 200 with HTML', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('swagger-ui');
  });

  it('OpenAPI JSON spec should contain all endpoints', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);

    const spec = JSON.parse(res.body);

    // Basic metadata
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('PingOS Gemini API');
    expect(spec.info.version).toBe('1.0.0');

    // All expected paths
    const paths = Object.keys(spec.paths);
    expect(paths).toContain('/v1/jobs');
    expect(paths).toContain('/v1/jobs/{id}');
    expect(paths).toContain('/v1/jobs/{id}/status');
    expect(paths).toContain('/v1/jobs/{id}/thinking');
    expect(paths).toContain('/v1/jobs/{id}/stream');
    expect(paths).toContain('/v1/chat');
    expect(paths).toContain('/v1/health');

    // HTTP methods
    expect(spec.paths['/v1/jobs']).toHaveProperty('post');
    expect(spec.paths['/v1/jobs/{id}']).toHaveProperty('get');
    expect(spec.paths['/v1/jobs/{id}/status']).toHaveProperty('get');
    expect(spec.paths['/v1/jobs/{id}/thinking']).toHaveProperty('get');
    expect(spec.paths['/v1/jobs/{id}/stream']).toHaveProperty('get');
    expect(spec.paths['/v1/chat']).toHaveProperty('post');
    expect(spec.paths['/v1/health']).toHaveProperty('get');
  });

  it('POST /v1/jobs schema should document tool and mode enums', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = JSON.parse(res.body);

    const postJobs = spec.paths['/v1/jobs'].post;
    const bodyContent = postJobs.requestBody?.content?.['application/json']?.schema;
    expect(bodyContent).toBeDefined();

    // The schema should reference tool and mode enums
    const toolProp = bodyContent.properties?.tool;
    expect(toolProp?.enum ?? toolProp?.anyOf?.[0]?.enum).toEqual(
      expect.arrayContaining(['deep_research', 'create_videos', 'create_images', 'canvas', 'guided_learning', 'deep_think'])
    );

    const modeProp = bodyContent.properties?.mode;
    expect(modeProp?.enum ?? modeProp?.anyOf?.[0]?.enum).toEqual(
      expect.arrayContaining(['fast', 'thinking', 'pro'])
    );
  });

  it('Spec should document error codes', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = JSON.parse(res.body);

    // Check that the GET /v1/jobs/{id} response schema references error codes
    const getJob = spec.paths['/v1/jobs/{id}'].get;
    const resp200 = getJob.responses?.['200']?.content?.['application/json']?.schema;
    expect(resp200).toBeDefined();

    // The error property should have a code enum containing our error codes
    const errorProp = resp200.properties?.error;
    expect(errorProp).toBeDefined();
    const codeProp = errorProp.properties?.code;
    expect(codeProp?.enum).toEqual(
      expect.arrayContaining(['BROWSER_UNAVAILABLE', 'AUTH_REQUIRED', 'GENERATION_TIMEOUT', 'RATE_LIMITED'])
    );
  });

  it('Spec should document idempotency_key field', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = JSON.parse(res.body);

    const postJobs = spec.paths['/v1/jobs'].post;
    const bodyContent = postJobs.requestBody?.content?.['application/json']?.schema;
    expect(bodyContent.properties).toHaveProperty('idempotency_key');
  });

  it('Spec should document conversation_id field', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = JSON.parse(res.body);

    const postJobs = spec.paths['/v1/jobs'].post;
    const bodyContent = postJobs.requestBody?.content?.['application/json']?.schema;
    expect(bodyContent.properties).toHaveProperty('conversation_id');
  });

  it('Tags should be present', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const spec = JSON.parse(res.body);

    const tagNames = spec.tags?.map((t: { name: string }) => t.name) ?? [];
    expect(tagNames).toContain('Jobs');
    expect(tagNames).toContain('Chat');
    expect(tagNames).toContain('System');
  });
});
