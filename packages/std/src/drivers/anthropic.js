// @pingdev/std — Anthropic driver adapter
// Direct Anthropic API access with streaming and thinking support
import { ETIMEDOUT, EIO, EACCES } from '../errors.js';
// ---------------------------------------------------------------------------
// Anthropic Adapter
// ---------------------------------------------------------------------------
const ANTHROPIC_VERSION = '2023-06-01';
const HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 4096;
export class AnthropicAdapter {
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
            model: { id: options.model, name: options.model, provider: 'anthropic' },
        };
    }
    async health() {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
            // Anthropic doesn't have a dedicated health endpoint.
            // Send a minimal messages request to verify connectivity + auth.
            const res = await fetch(`${this.endpoint}/v1/messages`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                }),
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
            // Any 2xx or 4xx (except auth) means the API is reachable
            return {
                status: res.ok || res.status === 400 ? 'online' : 'degraded',
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
            const payload = this.buildPayload(request, false);
            const res = await fetch(`${this.endpoint}/v1/messages`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload),
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
            // Extract text and thinking from content blocks
            let text = '';
            let thinking = '';
            for (const block of body.content) {
                if (block.type === 'text' && block.text) {
                    text += block.text;
                }
                else if (block.type === 'thinking' && block.thinking) {
                    thinking += block.thinking;
                }
            }
            const usage = {
                promptTokens: body.usage.input_tokens,
                completionTokens: body.usage.output_tokens,
                totalTokens: body.usage.input_tokens + body.usage.output_tokens,
            };
            return {
                text,
                driver: this.registration.id,
                model: body.model,
                usage,
                thinking: thinking || undefined,
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
            const payload = this.buildPayload(request, true);
            const res = await fetch(`${this.endpoint}/v1/messages`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload),
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
            let thinkingText = '';
            let inputTokens = 0;
            let outputTokens = 0;
            // Track which content block types are active
            const blockTypes = new Map();
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
                        const event = safeJsonParse(data);
                        if (!event)
                            continue;
                        switch (event.type) {
                            case 'message_start':
                                inputTokens = event.message.usage.input_tokens;
                                break;
                            case 'content_block_start':
                                blockTypes.set(event.index, event.content_block.type);
                                break;
                            case 'content_block_delta': {
                                const blockType = blockTypes.get(event.index);
                                if (blockType === 'thinking' && event.delta.thinking) {
                                    thinkingText += event.delta.thinking;
                                    yield { type: 'thinking', text: event.delta.thinking };
                                }
                                else if (event.delta.text) {
                                    fullText += event.delta.text;
                                    yield { type: 'partial', text: event.delta.text };
                                }
                                break;
                            }
                            case 'content_block_stop':
                                blockTypes.delete(event.index);
                                break;
                            case 'message_delta':
                                outputTokens = event.usage.output_tokens;
                                break;
                            case 'message_stop':
                                clearTimeout(timer);
                                yield {
                                    type: 'complete',
                                    text: fullText,
                                    usage: {
                                        promptTokens: inputTokens,
                                        completionTokens: outputTokens,
                                        totalTokens: inputTokens + outputTokens,
                                    },
                                };
                                return;
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            // If we exit without message_stop, still emit complete
            clearTimeout(timer);
            yield {
                type: 'complete',
                text: fullText,
                usage: {
                    promptTokens: inputTokens,
                    completionTokens: outputTokens,
                    totalTokens: inputTokens + outputTokens,
                },
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
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    buildHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        };
    }
    buildPayload(request, stream) {
        const { system, messages } = toAnthropicMessages(request);
        const model = request.model ?? this.model;
        const payload = {
            model,
            messages,
            max_tokens: DEFAULT_MAX_TOKENS,
            stream,
        };
        if (system) {
            payload.system = system;
        }
        return payload;
    }
}
// ---------------------------------------------------------------------------
// Message conversion — PingOS → Anthropic format
// ---------------------------------------------------------------------------
function toAnthropicMessages(request) {
    let system;
    const messages = [];
    if (request.messages && request.messages.length > 0) {
        for (const msg of request.messages) {
            if (msg.role === 'system') {
                // Anthropic uses a top-level system field
                system = extractText(msg);
            }
            else if (msg.role === 'user' || msg.role === 'assistant') {
                messages.push(convertMessage(msg));
            }
            else if (msg.role === 'tool') {
                // Map tool results as user messages for Anthropic
                messages.push({
                    role: 'user',
                    content: extractText(msg),
                });
            }
        }
    }
    else {
        messages.push({ role: 'user', content: request.prompt });
    }
    // Anthropic requires at least one message
    if (messages.length === 0) {
        messages.push({ role: 'user', content: request.prompt });
    }
    return { system, messages };
}
function convertMessage(msg) {
    const role = msg.role;
    if (typeof msg.content === 'string') {
        return { role, content: msg.content };
    }
    const blocks = [];
    for (const part of msg.content) {
        switch (part.type) {
            case 'text':
                blocks.push({ type: 'text', text: part.text });
                break;
            case 'image_url':
                // Anthropic expects base64 images; pass URL as text fallback
                blocks.push({ type: 'text', text: `[Image: ${part.url}]` });
                break;
            case 'tool_call':
                blocks.push({
                    type: 'text',
                    text: typeof part.arguments === 'string'
                        ? part.arguments
                        : JSON.stringify(part.arguments),
                });
                break;
            case 'tool_result':
                blocks.push({
                    type: 'text',
                    text: typeof part.content === 'string'
                        ? part.content
                        : JSON.stringify(part.content),
                });
                break;
        }
    }
    return { role, content: blocks.length > 0 ? blocks : '' };
}
function extractText(msg) {
    if (typeof msg.content === 'string')
        return msg.content;
    return msg.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
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
//# sourceMappingURL=anthropic.js.map