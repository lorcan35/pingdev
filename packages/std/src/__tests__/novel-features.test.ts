// @pingdev/std — Novel features integration tests
// Tests request validation (400) and device-not-found (404) for:
//   POST /v1/dev/:device/query
//   POST /v1/dev/:device/watch
//   POST /v1/dev/:device/diff
//   GET  /v1/dev/:device/discover
//   POST /v1/apps/generate
//
// Uses Fastify inject() for fast, network-free assertions.
// Imports from dist/ to pick up the latest compiled gateway
// (the src/*.js files may be stale when gateway.ts has been updated).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ModelRegistry } from '../registry.js';
import { createGateway } from '../gateway.js';
import type { Driver, DeviceRequest, DeviceResponse, DriverHealth } from '../types.js';

// ---------------------------------------------------------------------------
// Mock driver — satisfies the Driver interface for gateway startup
// ---------------------------------------------------------------------------

const mockDriver: Driver = {
  registration: {
    id: 'mock-llm',
    name: 'Mock LLM',
    type: 'api',
    capabilities: {
      llm: true,
      streaming: false,
      vision: false,
      toolCalling: false,
      imageGen: false,
      search: false,
      deepResearch: false,
      thinking: false,
    },
    endpoint: 'http://localhost:0',
    priority: 1,
  },
  async health(): Promise<DriverHealth> {
    return { status: 'online', lastCheck: Date.now() };
  },
  async execute(request: DeviceRequest): Promise<DeviceResponse> {
    return { text: `mock:${request.prompt}`, driver: 'mock-llm' };
  },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const UNKNOWN_DEVICE = 'tab-nonexistent-999';

describe('Novel feature endpoints — validation & device-not-found', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const registry = new ModelRegistry('best');
    registry.register(mockDriver);
    app = await createGateway({ port: 0, registry });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /v1/dev/:device/query — Natural language query
  // -------------------------------------------------------------------------

  describe('POST /v1/dev/:device/query', () => {
    it('returns 400 when question is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/query`,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
      expect(body.message).toContain('question');
      expect(body.retryable).toBe(false);
    });

    it('returns 400 when question is empty string', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/query`,
        payload: { question: '' },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
    });

    it('returns 404 when device does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/query`,
        payload: { question: 'What is the price?' },
      });

      expect(res.statusCode).toBe(404);
      const body: Any = res.json();
      expect(body.errno).toBe('ENODEV');
      expect(body.code).toBe('ping.gateway.device_not_found');
      expect(body.message).toContain(UNKNOWN_DEVICE);
      expect(body.retryable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/dev/:device/watch — Live data stream (SSE)
  // -------------------------------------------------------------------------

  describe('POST /v1/dev/:device/watch', () => {
    it('returns 400 when schema is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/watch`,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
      expect(body.message).toContain('schema');
      expect(body.retryable).toBe(false);
    });

    it('returns 400 when schema is not an object', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/watch`,
        payload: { schema: 'not-an-object' },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
    });

    it('returns 404 when device does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/watch`,
        payload: { schema: { price: '.price', title: '.title' } },
      });

      expect(res.statusCode).toBe(404);
      const body: Any = res.json();
      expect(body.errno).toBe('ENODEV');
      expect(body.code).toBe('ping.gateway.device_not_found');
      expect(body.message).toContain(UNKNOWN_DEVICE);
      expect(body.retryable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/dev/:device/diff — Differential extraction
  // -------------------------------------------------------------------------

  describe('POST /v1/dev/:device/diff', () => {
    it('returns 400 when schema is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/diff`,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
      expect(body.message).toContain('schema');
      expect(body.retryable).toBe(false);
    });

    it('returns 400 when schema is null', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/diff`,
        payload: { schema: null },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
    });

    it('returns 404 when device does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dev/${UNKNOWN_DEVICE}/diff`,
        payload: { schema: { stock: '.stock-level' } },
      });

      expect(res.statusCode).toBe(404);
      const body: Any = res.json();
      expect(body.errno).toBe('ENODEV');
      expect(body.code).toBe('ping.gateway.device_not_found');
      expect(body.message).toContain(UNKNOWN_DEVICE);
      expect(body.retryable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dev/:device/discover — Schema auto-discovery
  // -------------------------------------------------------------------------

  describe('GET /v1/dev/:device/discover', () => {
    it('returns 404 when device does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/dev/${UNKNOWN_DEVICE}/discover`,
      });

      expect(res.statusCode).toBe(404);
      const body: Any = res.json();
      expect(body.errno).toBe('ENODEV');
      expect(body.code).toBe('ping.gateway.device_not_found');
      expect(body.message).toContain(UNKNOWN_DEVICE);
      expect(body.retryable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/apps/generate — PingApp generator
  // -------------------------------------------------------------------------

  describe('POST /v1/apps/generate', () => {
    it('returns 400 when url is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/apps/generate',
        payload: { description: 'An e-commerce product page' },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
      expect(body.message).toContain('url');
      expect(body.message).toContain('description');
      expect(body.retryable).toBe(false);
    });

    it('returns 400 when description is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/apps/generate',
        payload: { url: 'https://example.com' },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
      expect(body.message).toContain('url');
      expect(body.message).toContain('description');
      expect(body.retryable).toBe(false);
    });

    it('returns 400 when body is empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/apps/generate',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
      expect(body.code).toBe('ping.gateway.bad_request');
    });

    it('returns 400 when both url and description are empty strings', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/apps/generate',
        payload: { url: '', description: '' },
      });

      expect(res.statusCode).toBe(400);
      const body: Any = res.json();
      expect(body.errno).toBe('ENOSYS');
    });
  });
});
