// @pingdev/std — LM Studio driver adapter
// Local LM Studio server with OpenAI-compatible API
import { ETIMEDOUT, EIO } from '../errors.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_ENDPOINT = 'http://localhost:1234';
const HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 120_000;
// ---------------------------------------------------------------------------
// LM Studio Adapter
// ---------------------------------------------------------------------------
export class LMStudioAdapter {
    registration;
    endpoint;
    model;
    constructor(options = {}) {
        this.endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '');
        this.model = options.model ?? 'default';
        const capabilities = options.capabilities ?? {
            llm: true,
            streaming: true,
            vision: false,
            toolCalling: false,
            imageGen: false,
            search: false,
            deepResearch: false,
            thinking: false,
        };
        this.registration = {
            id: options.id ?? 'lmstudio',
            name: options.name ?? 'LM Studio',
            type: 'local',
            capabilities,
            endpoint: this.endpoint,
            priority: options.priority ?? 10,
            model: { id: this.model, name: this.model, provider: 'lmstudio' },
        };
    }
    async health() {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
            const res = await fetch(`${this.endpoint}/v1/models`, {
                signal: controller.signal,
            });
            clearTimeout(timer);
            const latencyMs = Date.now() - start;
            return {
                status: res.ok ? 'online' : 'degraded',
                lastCheck: Date.now(),
                latencyMs,
                error: res.ok ? undefined : `HTTP ${res.status}`,
            };
        }
        catch (err) {
            // Connection refused = LM Studio not running; graceful offline
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, stream: false }),
                signal: controller.signal,
            });
            clearTimeout(timer);
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, stream: true }),
                signal: controller.signal,
            });
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
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok)
                throw EIO(this.registration.id, `Failed to list models: HTTP ${res.status}`);
            const body = (await res.json());
            return body.data.map((m) => ({
                id: m.id,
                name: m.id,
                provider: 'lmstudio',
            }));
        }
        catch (err) {
            clearTimeout(timer);
            if (isPingError(err))
                throw err;
            // If LM Studio is not running, return empty list instead of crashing
            return [];
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
//# sourceMappingURL=lmstudio.js.map