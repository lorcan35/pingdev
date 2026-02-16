// @pingdev/std — OpenAI-compatible driver adapter
// Works with Ollama, LM Studio, OpenRouter, and any OpenAI-format API
import { ETIMEDOUT, EIO, EACCES } from '../errors.js';
// ---------------------------------------------------------------------------
// OpenAI-Compatible Adapter
// ---------------------------------------------------------------------------
const HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 120_000;
export class OpenAICompatAdapter {
    registration;
    endpoint;
    apiKey;
    model;
    constructor(options) {
        this.endpoint = options.endpoint.replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.registration = {
            id: options.id,
            name: options.name,
            type: 'api',
            capabilities: options.capabilities,
            endpoint: this.endpoint,
            priority: options.priority,
            model: { id: options.model, name: options.model },
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
                return {
                    status: 'offline',
                    lastCheck: Date.now(),
                    latencyMs,
                    error: 'Authentication failed',
                };
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
            const messages = toOpenAIMessages(request);
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
            const messages = toOpenAIMessages(request);
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
            if (!body) {
                throw EIO(this.registration.id, 'No response body for streaming');
            }
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
                            yield {
                                type: 'complete',
                                text: fullText,
                            };
                            return;
                        }
                        const chunk = safeJsonParse(data);
                        if (!chunk)
                            continue;
                        const delta = chunk.choices[0]?.delta;
                        if (delta?.content) {
                            fullText += delta.content;
                            yield {
                                type: 'partial',
                                text: delta.content,
                            };
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            // If we exit without [DONE], still emit complete
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
            if (!res.ok) {
                throw EIO(this.registration.id, `Failed to list models: HTTP ${res.status}`);
            }
            const body = (await res.json());
            return body.data.map((m) => ({
                id: m.id,
                name: m.id,
                provider: m.owned_by,
            }));
        }
        catch (err) {
            clearTimeout(timer);
            if (isPingError(err))
                throw err;
            throw EIO(this.registration.id, err instanceof Error ? err.message : 'Unknown error');
        }
    }
    buildHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }
}
// ---------------------------------------------------------------------------
// Message conversion — PingOS → OpenAI format
// ---------------------------------------------------------------------------
function toOpenAIMessages(request) {
    if (request.messages && request.messages.length > 0) {
        return request.messages.map(convertMessage);
    }
    return [{ role: 'user', content: request.prompt }];
}
function convertMessage(msg) {
    if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
    }
    // Convert ContentPart[] to OpenAI format
    const textParts = [];
    const toolCalls = [];
    let toolCallId;
    for (const part of msg.content) {
        switch (part.type) {
            case 'text':
                textParts.push({ type: 'text', text: part.text });
                break;
            case 'image_url':
                textParts.push({
                    type: 'image_url',
                    image_url: { url: part.url, detail: part.detail },
                });
                break;
            case 'tool_call':
                toolCalls.push({
                    id: part.id,
                    type: 'function',
                    function: {
                        name: part.name,
                        arguments: typeof part.arguments === 'string'
                            ? part.arguments
                            : JSON.stringify(part.arguments),
                    },
                });
                break;
            case 'tool_result':
                toolCallId = part.toolCallId;
                textParts.push({
                    type: 'text',
                    text: typeof part.content === 'string'
                        ? part.content
                        : JSON.stringify(part.content),
                });
                break;
        }
    }
    const result = {
        role: msg.role,
        content: textParts.length > 0 ? textParts : null,
    };
    if (toolCalls.length > 0) {
        result.tool_calls = toolCalls;
    }
    if (toolCallId) {
        result.tool_call_id = toolCallId;
    }
    return result;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isPingError(err) {
    return (err !== null &&
        typeof err === 'object' &&
        'errno' in err &&
        'code' in err &&
        'retryable' in err);
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
//# sourceMappingURL=openai-compat.js.map