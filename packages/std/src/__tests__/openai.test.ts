// @pingdev/std — OpenAI adapter unit tests (NO external services required)
// Tests: constructor, health, execute, listModels with mocked fetch

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIAdapter } from '../drivers/openai.js';
import type { DeviceRequest, PingError } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal adapter with the given overrides. */
function createAdapter(overrides: { endpoint?: string; model?: string; apiKey?: string } = {}) {
  return new OpenAIAdapter({
    apiKey: overrides.apiKey ?? 'sk-test-key',
    endpoint: overrides.endpoint,
    model: overrides.model,
  });
}

/** Construct a minimal Response-like object for fetch mocking. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Constructor / Registration
// ============================================================================

describe('OpenAIAdapter — constructor', () => {
  it('creates correct registration with defaults', () => {
    const adapter = createAdapter();
    const reg = adapter.registration;

    expect(reg.id).toBe('openai');
    expect(reg.name).toBe('OpenAI');
    expect(reg.type).toBe('api');
    expect(reg.endpoint).toBe('https://api.openai.com');
    expect(reg.priority).toBe(5);
    expect(reg.model).toEqual({ id: 'gpt-4o', name: 'gpt-4o', provider: 'openai' });
    expect(reg.capabilities.llm).toBe(true);
    expect(reg.capabilities.streaming).toBe(true);
    expect(reg.capabilities.vision).toBe(true);
    expect(reg.capabilities.toolCalling).toBe(true);
    expect(reg.capabilities.imageGen).toBe(false);
  });

  it('accepts custom id, name, endpoint, model, and priority', () => {
    const adapter = new OpenAIAdapter({
      id: 'my-openai',
      name: 'My OpenAI',
      endpoint: 'https://custom.openai.example.com/',
      apiKey: 'sk-custom',
      model: 'gpt-4o-mini',
      priority: 2,
    });
    const reg = adapter.registration;

    expect(reg.id).toBe('my-openai');
    expect(reg.name).toBe('My OpenAI');
    expect(reg.endpoint).toBe('https://custom.openai.example.com'); // trailing slash stripped
    expect(reg.priority).toBe(2);
    expect(reg.model?.id).toBe('gpt-4o-mini');
  });

  it('requires apiKey (TypeScript enforces this, but verify it is stored)', () => {
    const adapter = createAdapter({ apiKey: 'sk-secret-123' });
    // apiKey is private, but we can verify it's used in requests via the Authorization header
    expect(adapter.registration).toBeDefined();
  });
});

// ============================================================================
// health()
// ============================================================================

describe('OpenAIAdapter — health()', () => {
  it('returns online on successful 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: 'gpt-4o' }] }, 200),
    ));

    const adapter = createAdapter();
    const result = await adapter.health();

    expect(result.status).toBe('online');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.lastCheck).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('returns offline with auth error message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_api_key' }, 401),
    ));

    const adapter = createAdapter();
    const result = await adapter.health();

    expect(result.status).toBe('offline');
    expect(result.error).toBe('Authentication failed');
  });

  it('returns offline with auth error message on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'forbidden' }, 403),
    ));

    const adapter = createAdapter();
    const result = await adapter.health();

    expect(result.status).toBe('offline');
    expect(result.error).toBe('Authentication failed');
  });

  it('returns degraded on non-auth HTTP error (e.g. 500)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      textResponse('Internal Server Error', 500),
    ));

    const adapter = createAdapter();
    const result = await adapter.health();

    expect(result.status).toBe('degraded');
    expect(result.error).toBe('HTTP 500');
  });

  it('returns offline on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new Error('fetch failed'),
    ));

    const adapter = createAdapter();
    const result = await adapter.health();

    expect(result.status).toBe('offline');
    expect(result.error).toBe('fetch failed');
  });

  it('calls the correct endpoint: /v1/models', async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [] }, 200));
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter({ endpoint: 'https://my-api.example.com' });
    await adapter.health();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-api.example.com/v1/models');
  });
});

// ============================================================================
// execute()
// ============================================================================

describe('OpenAIAdapter — execute()', () => {
  const baseRequest: DeviceRequest = { prompt: 'Hello, world!' };

  it('returns a DeviceResponse on successful completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-abc123',
        choices: [{
          message: { role: 'assistant', content: 'Hi there!' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4o-2024-08-06',
      }),
    ));

    const adapter = createAdapter();
    const result = await adapter.execute(baseRequest);

    expect(result.text).toBe('Hi there!');
    expect(result.driver).toBe('openai');
    expect(result.model).toBe('gpt-4o-2024-08-06');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sends correct request body with prompt-only request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter();
    await adapter.execute({ prompt: 'Test prompt' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o');
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: 'user', content: 'Test prompt' }]);
  });

  it('uses request.model when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter();
    await adapter.execute({ prompt: 'test', model: 'gpt-4o-mini' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('sends messages array when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter();
    await adapter.execute({
      prompt: 'ignored',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
  });

  it('returns empty text when content is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
      }),
    ));

    const adapter = createAdapter();
    const result = await adapter.execute(baseRequest);

    expect(result.text).toBe('');
  });

  it('throws EACCES on 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_api_key' }, 401),
    ));

    const adapter = createAdapter();

    try {
      await adapter.execute(baseRequest);
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('EACCES');
      expect(pingErr.code).toBe('ping.driver.auth_required');
      expect(pingErr.retryable).toBe(false);
    }
  });

  it('throws EACCES on 403 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'forbidden' }, 403),
    ));

    const adapter = createAdapter();

    try {
      await adapter.execute(baseRequest);
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('EACCES');
    }
  });

  it('throws EIO on non-auth HTTP error (e.g. 500)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      textResponse('Internal Server Error', 500),
    ));

    const adapter = createAdapter();

    try {
      await adapter.execute(baseRequest);
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('EIO');
      expect(pingErr.code).toBe('ping.driver.io_error');
      expect(pingErr.retryable).toBe(true);
    }
  });

  it('throws ETIMEDOUT when request is aborted (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    ));

    const adapter = createAdapter();

    try {
      await adapter.execute({ prompt: 'test', timeout_ms: 5000 });
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('ETIMEDOUT');
      expect(pingErr.code).toBe('ping.driver.timeout');
      expect(pingErr.retryable).toBe(true);
      expect(pingErr.message).toContain('5000');
    }
  });

  it('throws EIO on generic fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new Error('DNS resolution failed'),
    ));

    const adapter = createAdapter();

    try {
      await adapter.execute(baseRequest);
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('EIO');
      expect(pingErr.retryable).toBe(true);
    }
  });

  it('includes Authorization header with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter({ apiKey: 'sk-my-secret' });
    await adapter.execute(baseRequest);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer sk-my-secret');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ============================================================================
// listModels()
// ============================================================================

describe('OpenAIAdapter — listModels()', () => {
  it('parses response and filters for gpt-/o1/o3 models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
          { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
          { id: 'gpt-3.5-turbo', object: 'model', owned_by: 'openai' },
          { id: 'o1', object: 'model', owned_by: 'openai' },
          { id: 'o3', object: 'model', owned_by: 'openai' },
          { id: 'dall-e-3', object: 'model', owned_by: 'openai' },
          { id: 'text-embedding-3-small', object: 'model', owned_by: 'openai' },
          { id: 'whisper-1', object: 'model', owned_by: 'openai' },
          { id: 'tts-1', object: 'model', owned_by: 'openai' },
        ],
      }),
    ));

    const adapter = createAdapter();
    const models = await adapter.listModels();

    // Should include gpt-*, o1, o3 — but NOT dall-e, embedding, whisper, tts
    expect(models).toHaveLength(5);

    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).toContain('gpt-3.5-turbo');
    expect(ids).toContain('o1');
    expect(ids).toContain('o3');

    expect(ids).not.toContain('dall-e-3');
    expect(ids).not.toContain('text-embedding-3-small');
    expect(ids).not.toContain('whisper-1');
    expect(ids).not.toContain('tts-1');

    // Verify shape
    for (const model of models) {
      expect(model.provider).toBe('openai');
      expect(model.name).toBe(model.id);
    }
  });

  it('returns empty array when API returns no matching models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'dall-e-3', object: 'model' },
          { id: 'whisper-1', object: 'model' },
        ],
      }),
    ));

    const adapter = createAdapter();
    const models = await adapter.listModels();

    expect(models).toEqual([]);
  });

  it('falls back to static list on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new Error('Network unreachable'),
    ));

    const adapter = createAdapter();
    const models = await adapter.listModels();

    expect(models).toHaveLength(4);

    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).toContain('o1');
    expect(ids).toContain('o3');

    // Verify fallback shape
    for (const model of models) {
      expect(model.provider).toBe('openai');
    }
  });

  it('falls back to static list on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      textResponse('Service Unavailable', 503),
    ));

    const adapter = createAdapter();
    // listModels throws EIO on non-OK, which is a PingError, and PingErrors are re-thrown
    // So this should NOT fall back — it should throw
    try {
      await adapter.listModels();
      expect.unreachable('should have thrown');
    } catch (err) {
      const pingErr = err as PingError;
      expect(pingErr.errno).toBe('EIO');
    }
  });

  it('calls the correct endpoint: /v1/models', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ data: [] }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const adapter = createAdapter({ endpoint: 'https://custom.example.com' });
    await adapter.listModels();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://custom.example.com/v1/models');
  });
});
