// @pingdev/std — Unit tests (NO external services required)
// Tests: registry, routing strategies, error construction, capability matching, gateway with mock driver
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { ModelRegistry } from '../registry.js';
import { createGateway } from '../gateway.js';
import { ENOENT, EACCES, EBUSY, ETIMEDOUT, EAGAIN, ENOSYS, ENODEV, EOPNOTSUPP, EIO, ECANCELED, mapErrnoToHttp, } from '../errors.js';
// ---------------------------------------------------------------------------
// Mock Driver Factory
// ---------------------------------------------------------------------------
function createMockDriver(overrides = {}) {
    const caps = {
        llm: true,
        streaming: false,
        vision: false,
        toolCalling: false,
        imageGen: false,
        search: false,
        deepResearch: false,
        thinking: false,
        ...overrides.capabilities,
    };
    const registration = {
        id: overrides.id ?? 'mock-driver',
        name: overrides.name ?? 'Mock Driver',
        type: 'api',
        capabilities: caps,
        endpoint: 'http://localhost:0',
        priority: overrides.priority ?? 1,
    };
    return {
        registration,
        async health() {
            return {
                status: overrides.healthStatus ?? 'online',
                lastCheck: Date.now(),
                latencyMs: overrides.latencyMs ?? 10,
            };
        },
        async execute(request) {
            if (overrides.shouldThrow)
                throw overrides.shouldThrow;
            return {
                text: overrides.response?.text ?? `Mock response to: ${request.prompt}`,
                driver: registration.id,
                model: overrides.response?.model ?? 'mock-model',
                durationMs: overrides.response?.durationMs ?? 5,
                ...overrides.response,
            };
        },
    };
}
// ============================================================================
// ModelRegistry
// ============================================================================
describe('ModelRegistry', () => {
    let registry;
    beforeEach(() => {
        registry = new ModelRegistry('best');
    });
    // ---- Registration ----
    describe('register / unregister / listAll', () => {
        it('registers a driver and lists it', () => {
            const driver = createMockDriver({ id: 'alpha' });
            registry.register(driver);
            const list = registry.listAll();
            expect(list).toHaveLength(1);
            expect(list[0].id).toBe('alpha');
        });
        it('registers multiple drivers', () => {
            registry.register(createMockDriver({ id: 'a' }));
            registry.register(createMockDriver({ id: 'b' }));
            registry.register(createMockDriver({ id: 'c' }));
            expect(registry.listAll()).toHaveLength(3);
        });
        it('unregisters a driver by id', () => {
            registry.register(createMockDriver({ id: 'keep' }));
            registry.register(createMockDriver({ id: 'remove' }));
            registry.unregister('remove');
            const list = registry.listAll();
            expect(list).toHaveLength(1);
            expect(list[0].id).toBe('keep');
        });
        it('unregistering non-existent id is a no-op', () => {
            registry.register(createMockDriver({ id: 'a' }));
            registry.unregister('nonexistent');
            expect(registry.listAll()).toHaveLength(1);
        });
    });
    // ---- Resolve: direct targeting ----
    describe('resolve — direct driver targeting', () => {
        it('returns the specified driver by id', () => {
            const alpha = createMockDriver({ id: 'alpha' });
            const beta = createMockDriver({ id: 'beta' });
            registry.register(alpha);
            registry.register(beta);
            const result = registry.resolve({ prompt: 'test', driver: 'beta' });
            expect(result.registration.id).toBe('beta');
        });
        it('throws ENOENT for unknown driver id', () => {
            registry.register(createMockDriver({ id: 'alpha' }));
            expect(() => {
                registry.resolve({ prompt: 'test', driver: 'nonexistent' });
            }).toThrow();
            try {
                registry.resolve({ prompt: 'test', driver: 'nonexistent' });
            }
            catch (err) {
                expect(err.errno).toBe('ENOENT');
                expect(err.code).toBe('ping.router.no_driver');
            }
        });
    });
    // ---- Resolve: capability filtering ----
    describe('resolve — capability matching', () => {
        it('filters by required capabilities', () => {
            registry.register(createMockDriver({
                id: 'basic',
                capabilities: { llm: true, vision: false },
                priority: 1,
            }));
            registry.register(createMockDriver({
                id: 'vision',
                capabilities: { llm: true, vision: true },
                priority: 2,
            }));
            const result = registry.resolve({
                prompt: 'test',
                require: { vision: true },
            });
            expect(result.registration.id).toBe('vision');
        });
        it('throws ENOENT when no driver matches required capabilities', () => {
            registry.register(createMockDriver({
                id: 'basic',
                capabilities: { llm: true, imageGen: false },
            }));
            expect(() => {
                registry.resolve({
                    prompt: 'test',
                    require: { imageGen: true },
                });
            }).toThrow();
            try {
                registry.resolve({ prompt: 'test', require: { imageGen: true } });
            }
            catch (err) {
                expect(err.errno).toBe('ENOENT');
            }
        });
        it('matches multiple capability requirements', () => {
            registry.register(createMockDriver({
                id: 'partial',
                capabilities: { llm: true, vision: true, thinking: false },
                priority: 1,
            }));
            registry.register(createMockDriver({
                id: 'full',
                capabilities: { llm: true, vision: true, thinking: true },
                priority: 2,
            }));
            const result = registry.resolve({
                prompt: 'test',
                require: { vision: true, thinking: true },
            });
            expect(result.registration.id).toBe('full');
        });
    });
    // ---- Resolve: session affinity ----
    describe('resolve — session affinity', () => {
        it('routes sticky affinity key to the same driver', () => {
            registry.register(createMockDriver({ id: 'a', priority: 1 }));
            registry.register(createMockDriver({ id: 'b', priority: 2 }));
            // First request establishes affinity
            const first = registry.resolve({
                prompt: 'test',
                affinity: { key: 'user:emile', sticky: true },
            });
            const firstId = first.registration.id;
            // Second request with same key should route to same driver
            const second = registry.resolve({
                prompt: 'test',
                affinity: { key: 'user:emile', sticky: true },
            });
            expect(second.registration.id).toBe(firstId);
        });
        it('different affinity keys can route to different drivers', () => {
            registry.register(createMockDriver({ id: 'a', priority: 1 }));
            const r1 = registry.resolve({
                prompt: 'test',
                affinity: { key: 'user:alice', sticky: true },
            });
            const r2 = registry.resolve({
                prompt: 'test',
                affinity: { key: 'user:bob', sticky: true },
            });
            // Both should succeed (may route to same driver since there's only one)
            expect(r1.registration.id).toBeDefined();
            expect(r2.registration.id).toBeDefined();
        });
    });
    // ---- findByCapability ----
    describe('findByCapability', () => {
        it('returns drivers matching a capability flag', () => {
            registry.register(createMockDriver({
                id: 'a',
                capabilities: { llm: true, vision: false },
            }));
            registry.register(createMockDriver({
                id: 'b',
                capabilities: { llm: true, vision: true },
            }));
            const visionDrivers = registry.findByCapability('vision');
            expect(visionDrivers).toHaveLength(1);
            expect(visionDrivers[0].registration.id).toBe('b');
        });
        it('returns empty array when no driver has the capability', () => {
            registry.register(createMockDriver({
                id: 'a',
                capabilities: { llm: true, deepResearch: false },
            }));
            expect(registry.findByCapability('deepResearch')).toHaveLength(0);
        });
    });
});
// ============================================================================
// Routing Strategies
// ============================================================================
describe('Routing strategies', () => {
    let registry;
    beforeEach(() => {
        registry = new ModelRegistry('best');
    });
    describe('best strategy', () => {
        it('picks the lowest-priority driver', () => {
            registry.register(createMockDriver({ id: 'expensive', priority: 10 }));
            registry.register(createMockDriver({ id: 'cheap', priority: 1 }));
            registry.register(createMockDriver({ id: 'mid', priority: 5 }));
            const result = registry.resolve({ prompt: 'test', strategy: 'best' });
            expect(result.registration.id).toBe('cheap');
        });
    });
    describe('cheapest strategy', () => {
        it('picks the lowest-priority driver', () => {
            registry.register(createMockDriver({ id: 'a', priority: 3 }));
            registry.register(createMockDriver({ id: 'b', priority: 1 }));
            registry.register(createMockDriver({ id: 'c', priority: 2 }));
            const result = registry.resolve({ prompt: 'test', strategy: 'cheapest' });
            expect(result.registration.id).toBe('b');
        });
    });
    describe('round-robin strategy', () => {
        it('rotates through drivers on successive calls', () => {
            registry.register(createMockDriver({ id: 'a', priority: 1 }));
            registry.register(createMockDriver({ id: 'b', priority: 2 }));
            registry.register(createMockDriver({ id: 'c', priority: 3 }));
            const results = [];
            for (let i = 0; i < 6; i++) {
                const r = registry.resolve({ prompt: 'test', strategy: 'round-robin' });
                results.push(r.registration.id);
            }
            // Should cycle through all 3 drivers twice
            expect(results[0]).toBe(results[3]); // same after full rotation
            expect(results[1]).toBe(results[4]);
            expect(results[2]).toBe(results[5]);
            // All 3 drivers should appear
            expect(new Set(results).size).toBe(3);
        });
    });
});
// ============================================================================
// Error Constructors
// ============================================================================
describe('Error constructors', () => {
    it('ENOENT creates correct PingError', () => {
        const err = ENOENT('test-device');
        expect(err.errno).toBe('ENOENT');
        expect(err.code).toBe('ping.router.no_driver');
        expect(err.retryable).toBe(false);
        expect(err.message).toContain('test-device');
    });
    it('EACCES creates correct PingError', () => {
        const err = EACCES('claude', 'Invalid API key');
        expect(err.errno).toBe('EACCES');
        expect(err.code).toBe('ping.driver.auth_required');
        expect(err.retryable).toBe(false);
        expect(err.message).toContain('claude');
        expect(err.message).toContain('Invalid API key');
    });
    it('EBUSY creates retryable PingError with retryAfterMs', () => {
        const err = EBUSY('gemini');
        expect(err.errno).toBe('EBUSY');
        expect(err.code).toBe('ping.driver.concurrency_exceeded');
        expect(err.retryable).toBe(true);
        expect(err.retryAfterMs).toBe(5000);
    });
    it('ETIMEDOUT creates retryable PingError', () => {
        const err = ETIMEDOUT('gemini', 30000);
        expect(err.errno).toBe('ETIMEDOUT');
        expect(err.code).toBe('ping.driver.timeout');
        expect(err.retryable).toBe(true);
        expect(err.message).toContain('30000');
    });
    it('EAGAIN creates retryable PingError with custom retryAfterMs', () => {
        const err = EAGAIN('openai', 10000);
        expect(err.errno).toBe('EAGAIN');
        expect(err.retryable).toBe(true);
        expect(err.retryAfterMs).toBe(10000);
    });
    it('ENOSYS creates non-retryable PingError', () => {
        const err = ENOSYS('ollama', 'vision');
        expect(err.errno).toBe('ENOSYS');
        expect(err.retryable).toBe(false);
        expect(err.message).toContain('vision');
    });
    it('ENODEV creates correct PingError', () => {
        const err = ENODEV('search');
        expect(err.errno).toBe('ENODEV');
        expect(err.code).toBe('ping.registry.device_not_found');
    });
    it('EOPNOTSUPP creates correct PingError', () => {
        const err = EOPNOTSUPP('ollama', 'image-gen');
        expect(err.errno).toBe('EOPNOTSUPP');
        expect(err.code).toBe('ping.driver.op_not_supported');
    });
    it('EIO creates retryable PingError with details', () => {
        const err = EIO('gemini', { statusCode: 502 });
        expect(err.errno).toBe('EIO');
        expect(err.retryable).toBe(true);
        expect(err.details).toEqual({ statusCode: 502 });
    });
    it('ECANCELED creates non-retryable PingError', () => {
        const err = ECANCELED('gemini');
        expect(err.errno).toBe('ECANCELED');
        expect(err.retryable).toBe(false);
    });
});
// ============================================================================
// errno → HTTP mapping
// ============================================================================
describe('mapErrnoToHttp', () => {
    const expected = [
        ['ENOENT', 404],
        ['ENODEV', 404],
        ['EACCES', 403],
        ['EBUSY', 409],
        ['ETIMEDOUT', 503],
        ['EAGAIN', 429],
        ['ENOSYS', 422],
        ['EOPNOTSUPP', 422],
        ['EIO', 502],
        ['ECANCELED', 499],
    ];
    for (const [errno, http] of expected) {
        it(`maps ${errno} → HTTP ${http}`, () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(mapErrnoToHttp(errno)).toBe(http);
        });
    }
});
// ============================================================================
// Gateway with Mock Driver (no external services)
// ============================================================================
describe('Gateway with mock driver', () => {
    let app;
    const PORT = 3579; // Unusual port to avoid conflicts
    beforeAll(async () => {
        const registry = new ModelRegistry('best');
        registry.register(createMockDriver({
            id: 'mock',
            response: { text: 'Hello from mock!' },
        }));
        app = await createGateway({ port: PORT, registry });
    });
    afterAll(async () => {
        if (app)
            await app.close();
    });
    it('GET /v1/health returns healthy', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('healthy');
    });
    it('GET /v1/registry returns mock driver', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/registry`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.drivers).toHaveLength(1);
        expect(body.drivers[0].id).toBe('mock');
    });
    it('POST /v1/dev/llm/prompt returns mock response', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/dev/llm/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'test' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.text).toBe('Hello from mock!');
        expect(body.driver).toBe('mock');
    });
    it('POST /v1/dev/llm/prompt returns 400 on missing prompt', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/dev/llm/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.errno).toBeDefined();
    });
    it('POST /v1/dev/llm/chat returns mock response', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/dev/llm/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'hello' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.text).toBe('Hello from mock!');
    });
    it('returns 404 ENOENT when capability not available', async () => {
        const res = await fetch(`http://localhost:${PORT}/v1/dev/llm/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: 'test',
                require: { deepResearch: true },
            }),
        });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.errno).toBe('ENOENT');
        expect(body.code).toBe('ping.router.no_driver');
        expect(body.retryable).toBe(false);
    });
});
//# sourceMappingURL=unit.test.js.map