// @pingdev/std — LM Studio adapter unit tests
// Tests constructor, health, listModels, and execute with mocked fetch
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LMStudioAdapter } from '../drivers/lmstudio.js';
beforeEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('LMStudioAdapter — constructor', () => {
    it('creates correct registration with defaults', () => {
        const adapter = new LMStudioAdapter();
        const reg = adapter.registration;
        expect(reg.id).toBe('lmstudio');
        expect(reg.name).toBe('LM Studio');
        expect(reg.type).toBe('local');
        expect(reg.endpoint).toBe('http://localhost:1234');
        expect(reg.priority).toBe(10);
        expect(reg.model).toEqual({ id: 'default', name: 'default', provider: 'lmstudio' });
        expect(reg.capabilities).toEqual({
            llm: true,
            streaming: true,
            vision: false,
            toolCalling: false,
            imageGen: false,
            search: false,
            deepResearch: false,
            thinking: false,
        });
    });
    it('accepts custom options', () => {
        const adapter = new LMStudioAdapter({
            id: 'my-lm',
            name: 'My LM Studio',
            endpoint: 'http://192.168.1.100:8080/',
            model: 'llama-3',
            capabilities: {
                llm: true,
                streaming: false,
                vision: true,
                toolCalling: false,
                imageGen: false,
                search: false,
                deepResearch: false,
                thinking: false,
            },
            priority: 5,
        });
        const reg = adapter.registration;
        expect(reg.id).toBe('my-lm');
        expect(reg.name).toBe('My LM Studio');
        // Trailing slash should be stripped
        expect(reg.endpoint).toBe('http://192.168.1.100:8080');
        expect(reg.priority).toBe(5);
        expect(reg.model).toEqual({ id: 'llama-3', name: 'llama-3', provider: 'lmstudio' });
        expect(reg.capabilities.streaming).toBe(false);
        expect(reg.capabilities.vision).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// health()
// ---------------------------------------------------------------------------
describe('LMStudioAdapter — health()', () => {
    it('returns offline gracefully when server is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
        const adapter = new LMStudioAdapter();
        const result = await adapter.health();
        expect(result.status).toBe('offline');
        expect(result.error).toBe('Connection refused');
        expect(result.lastCheck).toBeGreaterThan(0);
        expect(typeof result.latencyMs).toBe('number');
    });
    it('returns online when server responds OK', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
        const adapter = new LMStudioAdapter();
        const result = await adapter.health();
        expect(result.status).toBe('online');
        expect(result.error).toBeUndefined();
        expect(result.lastCheck).toBeGreaterThan(0);
        expect(typeof result.latencyMs).toBe('number');
    });
    it('returns degraded when server responds with non-OK status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        const adapter = new LMStudioAdapter();
        const result = await adapter.health();
        expect(result.status).toBe('degraded');
        expect(result.error).toBe('HTTP 500');
    });
    it('calls the correct endpoint /v1/models', async () => {
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', mockFetch);
        const adapter = new LMStudioAdapter({ endpoint: 'http://myhost:9999' });
        await adapter.health();
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('http://myhost:9999/v1/models');
    });
});
// ---------------------------------------------------------------------------
// listModels()
// ---------------------------------------------------------------------------
describe('LMStudioAdapter — listModels()', () => {
    it('returns empty array when server is offline', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
        const adapter = new LMStudioAdapter();
        const models = await adapter.listModels();
        expect(models).toEqual([]);
    });
    it('parses response correctly when online', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'llama-3-8b', object: 'model', owned_by: 'meta' },
                    { id: 'mistral-7b', object: 'model', owned_by: 'mistralai' },
                ],
            }),
        }));
        const adapter = new LMStudioAdapter();
        const models = await adapter.listModels();
        expect(models).toHaveLength(2);
        expect(models[0]).toEqual({ id: 'llama-3-8b', name: 'llama-3-8b', provider: 'lmstudio' });
        expect(models[1]).toEqual({ id: 'mistral-7b', name: 'mistral-7b', provider: 'lmstudio' });
    });
    it('throws PingError when server responds with non-OK status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
        }));
        const adapter = new LMStudioAdapter();
        // EIO is a PingError so it is re-thrown rather than caught
        try {
            await adapter.listModels();
            expect.unreachable('listModels() should have thrown');
        }
        catch (err) {
            const pingErr = err;
            expect(pingErr.errno).toBe('EIO');
            expect(pingErr.code).toBe('ping.driver.io_error');
            expect(pingErr.retryable).toBe(true);
        }
    });
});
// ---------------------------------------------------------------------------
// execute()
// ---------------------------------------------------------------------------
describe('LMStudioAdapter — execute()', () => {
    it('calls correct endpoint with proper payload', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'chatcmpl-123',
                choices: [
                    {
                        message: { role: 'assistant', content: 'Hello world!' },
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 3,
                    total_tokens: 8,
                },
                model: 'llama-3-8b',
            }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const adapter = new LMStudioAdapter();
        const request = { prompt: 'Say hello' };
        const response = await adapter.execute(request);
        // Verify fetch was called with the right URL and payload
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe('http://localhost:1234/v1/chat/completions');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/json');
        const body = JSON.parse(opts.body);
        expect(body.model).toBe('default');
        expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }]);
        expect(body.stream).toBe(false);
        // Verify response
        expect(response.text).toBe('Hello world!');
        expect(response.driver).toBe('lmstudio');
        expect(response.model).toBe('llama-3-8b');
        expect(response.usage).toEqual({
            promptTokens: 5,
            completionTokens: 3,
            totalTokens: 8,
        });
        expect(typeof response.durationMs).toBe('number');
    });
    it('uses request.model when provided', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'chatcmpl-456',
                choices: [
                    {
                        message: { role: 'assistant', content: 'Hi' },
                        finish_reason: 'stop',
                    },
                ],
                model: 'custom-model',
            }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const adapter = new LMStudioAdapter();
        const request = { prompt: 'Hi', model: 'custom-model' };
        await adapter.execute(request);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe('custom-model');
    });
    it('converts messages array to OpenAI format', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'chatcmpl-789',
                choices: [
                    {
                        message: { role: 'assistant', content: 'Response' },
                        finish_reason: 'stop',
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', mockFetch);
        const adapter = new LMStudioAdapter();
        const request = {
            prompt: 'ignored when messages provided',
            messages: [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' },
            ],
        };
        await adapter.execute(request);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.messages).toEqual([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
        ]);
    });
    it('throws PingError with EIO errno on non-OK response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        }));
        const adapter = new LMStudioAdapter();
        const request = { prompt: 'Fail please' };
        try {
            await adapter.execute(request);
            expect.unreachable('execute() should have thrown');
        }
        catch (err) {
            const pingErr = err;
            expect(pingErr.errno).toBe('EIO');
            expect(pingErr.code).toBe('ping.driver.io_error');
            expect(pingErr.retryable).toBe(true);
        }
    });
    it('throws PingError with EIO errno on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
        const adapter = new LMStudioAdapter();
        const request = { prompt: 'test' };
        try {
            await adapter.execute(request);
            expect.unreachable('execute() should have thrown');
        }
        catch (err) {
            const pingErr = err;
            expect(pingErr.errno).toBe('EIO');
            expect(pingErr.code).toBe('ping.driver.io_error');
            expect(pingErr.retryable).toBe(true);
        }
    });
    it('returns empty text when choice content is null', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'chatcmpl-null',
                choices: [
                    {
                        message: { role: 'assistant', content: null },
                        finish_reason: 'stop',
                    },
                ],
            }),
        }));
        const adapter = new LMStudioAdapter();
        const response = await adapter.execute({ prompt: 'test' });
        expect(response.text).toBe('');
    });
});
//# sourceMappingURL=lmstudio.test.js.map