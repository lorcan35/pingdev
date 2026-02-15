// @pingdev/std — Gateway integration tests
// Tests the Fastify gateway end-to-end with the live Gemini PingApp on :3456

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGateway } from '../gateway.js';
import { ModelRegistry } from '../registry.js';
import { PingAppAdapter } from '../drivers/pingapp-adapter.js';

const GATEWAY_PORT = 3500;
const GEMINI_ENDPOINT = 'http://localhost:3456';
const BASE = `http://localhost:${GATEWAY_PORT}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let app: FastifyInstance;
let registry: ModelRegistry;

beforeAll(async () => {
  registry = new ModelRegistry('best');

  const gemini = new PingAppAdapter({
    id: 'gemini',
    name: 'Gemini PingApp',
    endpoint: GEMINI_ENDPOINT,
    capabilities: {
      llm: true,
      streaming: true,
      vision: true,
      toolCalling: true,
      imageGen: true,
      search: true,
      deepResearch: true,
      thinking: true,
    },
    priority: 1,
  });

  registry.register(gemini);

  app = await createGateway({ port: GATEWAY_PORT, registry });
});

afterAll(async () => {
  if (app) await app.close();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe('GET /v1/health', () => {
  it('returns healthy status', async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);

    const body: Any = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('GET /v1/registry', () => {
  it('returns drivers array with gemini registered', async () => {
    const res = await fetch(`${BASE}/v1/registry`);
    expect(res.status).toBe(200);

    const body: Any = await res.json();
    expect(body.drivers).toBeDefined();
    expect(Array.isArray(body.drivers)).toBe(true);
    expect(body.drivers.length).toBeGreaterThanOrEqual(1);

    const gemini = body.drivers.find((d: Any) => d.id === 'gemini');
    expect(gemini).toBeDefined();
    expect(gemini.type).toBe('pingapp');
    expect(gemini.capabilities.llm).toBe(true);
    expect(gemini.endpoint).toBe(GEMINI_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dev/llm/prompt — live Gemini integration
// ---------------------------------------------------------------------------

describe('POST /v1/dev/llm/prompt', () => {
  it('sends a prompt and receives a text response from Gemini', async () => {
    const res = await fetch(`${BASE}/v1/dev/llm/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Say hello' }),
    });

    expect(res.status).toBe(200);
    const body: Any = await res.json();
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.driver).toBe('gemini');
  }, 120_000); // generous timeout for live LLM

  it('returns 400 when prompt is missing', async () => {
    const res = await fetch(`${BASE}/v1/dev/llm/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body: Any = await res.json();
    expect(body.errno).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dev/llm/chat
// ---------------------------------------------------------------------------

describe('POST /v1/dev/llm/chat', () => {
  it('sends a chat prompt and receives a response', async () => {
    const res = await fetch(`${BASE}/v1/dev/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'What is 2+2?' }),
    });

    expect(res.status).toBe(200);
    const body: Any = await res.json();
    expect(body.text).toBeDefined();
    expect(typeof body.text).toBe('string');
    expect(body.driver).toBe('gemini');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Error: unsupported capability
// ---------------------------------------------------------------------------

describe('Error handling — unsupported capability', () => {
  it('returns PingError with errno when no driver matches required capabilities', async () => {
    const res = await fetch(`${BASE}/v1/dev/llm/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test',
        // Require a capability no driver has — snapshotting is optional and not set
        require: { snapshotting: true, sessionAffinity: true },
      }),
    });

    // Should return 404 (ENOENT maps to 404)
    expect(res.status).toBe(404);

    const body: Any = await res.json();
    expect(body.errno).toBe('ENOENT');
    expect(body.code).toBe('ping.router.no_driver');
    expect(body.retryable).toBe(false);
    expect(body.message).toBeDefined();
  });
});
