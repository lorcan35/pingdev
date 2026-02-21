// @pingdev/std — Gateway integration tests
// Tests the Fastify gateway end-to-end with the live Gemini PingApp on :3456
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createGateway } from '../gateway.js';
import { ModelRegistry } from '../registry.js';
import { PingAppAdapter } from '../drivers/pingapp-adapter.js';
// Use ephemeral ports to avoid conflicts with other services.
const GATEWAY_PORT = 0;
let GEMINI_ENDPOINT = 'http://localhost:3456';
let BASE = '';
let app;
let registry;
let mockPingApp = null;
let mockStarted = false;
async function isGeminiUp() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 750);
    try {
        const res = await fetch(`${GEMINI_ENDPOINT}/v1/health`, { signal: controller.signal });
        return res.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}
beforeAll(async () => {
    registry = new ModelRegistry('best');
    // These tests are designed to run against a live PingApp on :3456.
    // In dev/CI environments where it's not running, start a tiny mock server
    // so the suite is self-contained.
    if (!(await isGeminiUp())) {
        mockPingApp = http.createServer(async (req, res) => {
            const url = req.url ?? '';
            if (req.method === 'GET' && url === '/v1/health') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ status: 'healthy' }));
                return;
            }
            if (req.method === 'POST' && url === '/v1/chat') {
                const chunks = [];
                for await (const chunk of req)
                    chunks.push(Buffer.from(chunk));
                const bodyText = Buffer.concat(chunks).toString('utf-8');
                const body = bodyText ? JSON.parse(bodyText) : {};
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    response: `mock:${body.prompt ?? ''}`,
                    conversation_id: body.conversation_id ?? 'mock-conv',
                    timing: { total_ms: 1 },
                }));
                return;
            }
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'not_found' }));
        });
        await new Promise((resolve, reject) => {
            mockPingApp.once('error', reject);
            mockPingApp.listen(0, '127.0.0.1', () => resolve());
        });
        const mockAddr = mockPingApp.address();
        if (mockAddr && typeof mockAddr === 'object' && 'port' in mockAddr) {
            GEMINI_ENDPOINT = `http://127.0.0.1:${mockAddr.port}`;
        }
        mockStarted = true;
    }
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
    const addr = app.server.address();
    if (addr && typeof addr === 'object' && 'port' in addr) {
        BASE = `http://localhost:${addr.port}`;
    }
    else {
        // Fallback (shouldn't happen): default dev port.
        BASE = 'http://localhost:3500';
    }
});
afterAll(async () => {
    if (app)
        await app.close();
    if (mockPingApp && mockStarted) {
        await new Promise((resolve) => mockPingApp.close(() => resolve()));
    }
});
// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe('GET /v1/health', () => {
    it('returns healthy status', async () => {
        const res = await fetch(`${BASE}/v1/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
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
        const body = await res.json();
        expect(body.drivers).toBeDefined();
        expect(Array.isArray(body.drivers)).toBe(true);
        expect(body.drivers.length).toBeGreaterThanOrEqual(1);
        const gemini = body.drivers.find((d) => d.id === 'gemini');
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
        const body = await res.json();
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
        const body = await res.json();
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
        const body = await res.json();
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
        const body = await res.json();
        expect(body.errno).toBe('ENOENT');
        expect(body.code).toBe('ping.router.no_driver');
        expect(body.retryable).toBe(false);
        expect(body.message).toBeDefined();
    });
});
//# sourceMappingURL=gateway.test.js.map