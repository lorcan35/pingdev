// @pingdev/std — OpenAI Direct driver adapter
// Direct OpenAI API access with streaming support
import { ETIMEDOUT, EIO, EACCES } from '../errors.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OPENAI_ENDPOINT = 'https://api.openai.com';
const HEALTH_TIMEOUT_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = 'gpt-4o';
// ---------------------------------------------------------------------------
// OpenAI Adapter
// ---------------------------------------------------------------------------
export class OpenAIAdapter {
    registration;
    endpoint;
    apiKey;
    model;
    constructor(options) {
        this.endpoint = (options.endpoint ?? OPENAI_ENDPOINT).replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.model = options.model ?? DEFAULT_MODEL;
        const capabilities = options.capabilities ?? {
            llm: true,
            streaming: true,
            vision: true,
            toolCalling: true,
            imageGen: false,
            search: false,
            deepResearch: false,
            thinking: true,
        };
        this.registration = {
            id: options.id ?? 'openai',
            name: options.name ?? 'OpenAI',
            type: 'api',
            capabilities,
            endpoint: this.endpoint,
            priority: options.priority ?? 5,
            model: { id: this.model, name: this.model, provider: 'openai' },
        };
    }
    buildHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        };
    }
    async health() {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
            const res = await fetch(`${this.endpoint}/v1/models`, {
                headers: this.buildHeaders(),
                signal: controller.signal,
            });
            clearTimeout(timer);
            const latencyMs = Date.now() - start;
            if (res.status === 401 || res.status === 403) {
                return { status: 'offline', lastCheck: Date.now(), latencyMs, error: 'Authentication failed' };
            }
            return {
                status: res.ok ? 'online' : 'degraded',
                lastCheck: Date.now(),
                latencyMs,
                error: res.ok ? undefined : `HTTP ${res.status}`,
            };
        }
        catch (err) {
            return {
                status: 'offline',
                lastCheck: Date.now(),
                latencyMs: Date.now() - start,
                error: err instanceof Error ? err.message : 'Connection failed',
            };
        }
    }
    async execute(request) {
        const timeoutMs = request.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const start = Date.now();
        try {
            const messages = this.toMessages(request);
            const model = request.model ?? this.model;
            const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify({ model, messages, stream: false }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (res.status === 401 || res.status === 403) {
                throw EACCES(this.registration.id, 'Invalid or missing API key');
            }
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw EIO(this.registration.id, `HTTP ${res.status}: ${errBody.slice(0, 200)}`);
            }
            const body = (await res.json());
            const choice = body.choices[0];
            const usage = body.usage
                ? {
                    promptTokens: body.usage.prompt_tokens,
                    completionTokens: body.usage.completion_tokens,
                    totalTokens: body.usage.total_tokens,
                }
                : undefined;
            return {
                text: choice?.message.content ?? '',
                driver: this.registration.id,
                model: body.model ?? model,
                usage,
                durationMs: Date.now() - start,
            };
        }
        catch (err) {
            clearTimeout(timer);
            if (isPingError(err))
                throw err;
            if (isAbortError(err))
                throw ETIMEDOUT(this.registration.id, timeoutMs);
            throw EIO(this.registration.id, err instanceof Error ? err.message : 'Unknown error');
        }
    }
    async *stream(request) {
        const timeoutMs = request.timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const messages = this.toMessages(request);
            const model = request.model ?? this.model;
            const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify({ model, messages, stream: true }),
                signal: controller.signal,
            });
            if (res.status === 401 || res.status === 403) {
                throw EACCES(this.registration.id, 'Invalid or missing API key');
            }
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw EIO(this.registration.id, `HTTP ${res.status}: ${errBody.slice(0, 200)}`);
            }
            const body = res.body;
            if (!body)
                throw EIO(this.registration.id, 'No response body for streaming');
            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: '))
                            continue;
                        const data = trimmed.slice(6);
                        if (data === '[DONE]') {
                            clearTimeout(timer);
                            yield { type: 'complete', text: fullText };
                            return;
                        }
                        const chunk = safeJsonParse(data);
                        if (!chunk)
                            continue;
                        const delta = chunk.choices[0]?.delta;
                        if (delta?.content) {
                            fullText += delta.content;
                            yield { type: 'partial', text: delta.content };
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            clearTimeout(timer);
            yield { type: 'complete', text: fullText };
        }
        catch (err) {
            clearTimeout(timer);
            if (isPingError(err))
                throw err;
            if (isAbortError(err))
                throw ETIMEDOUT(this.registration.id, timeoutMs);
            throw EIO(this.registration.id, err instanceof Error ? err.message : 'Unknown error');
        }
    }
    async listModels() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        try {
            const res = await fetch(`${this.endpoint}/v1/models`, {
                headers: this.buildHeaders(),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok)
                throw EIO(this.registration.id, `Failed to list models: HTTP ${res.status}`);
            const body = (await res.json());
            // Filter for chat completion models
            return body.data
                .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
                .map((m) => ({
                id: m.id,
                name: m.id,
                provider: 'openai',
            }));
        }
        catch (err) {
            clearTimeout(timer);
            if (isPingError(err))
                throw err;
            // Fallback to static list if API call fails
            return [
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
                { id: 'o1', name: 'o1', provider: 'openai' },
                { id: 'o3', name: 'o3', provider: 'openai' },
            ];
        }
    }
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    toMessages(request) {
        if (request.messages && request.messages.length > 0) {
            return request.messages.map((m) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join(''),
            }));
        }
        return [{ role: 'user', content: request.prompt }];
    }
}
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function isPingError(err) {
    return err !== null && typeof err === 'object' && 'errno' in err && 'code' in err && 'retryable' in err;
}
function isAbortError(err) {
    return err instanceof DOMException && err.name === 'AbortError';
}
function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=openai.js.map