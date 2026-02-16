// @pingdev/std — PingApp driver adapter
// Wraps existing PingApps running on localhost ports via their HTTP API
import { ETIMEDOUT, EIO } from '../errors.js';
// ---------------------------------------------------------------------------
// PingApp Adapter
// ---------------------------------------------------------------------------
const HEALTH_TIMEOUT_MS = 5_000;
export class PingAppAdapter {
    registration;
    endpoint;
    constructor(options) {
        this.endpoint = options.endpoint.replace(/\/$/, '');
        this.registration = {
            id: options.id,
            name: options.name,
            type: 'pingapp',
            capabilities: options.capabilities,
            endpoint: this.endpoint,
            priority: options.priority,
        };
    }
    async health() {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
            const res = await fetch(`${this.endpoint}/v1/health`, {
                signal: controller.signal,
            });
            clearTimeout(timer);
            const latencyMs = Date.now() - start;
            if (!res.ok) {
                return {
                    status: 'degraded',
                    lastCheck: Date.now(),
                    latencyMs,
                    error: `Health endpoint returned HTTP ${res.status}`,
                };
            }
            const body = (await res.json());
            const statusMap = {
                healthy: 'online',
                degraded: 'degraded',
                unhealthy: 'offline',
            };
            return {
                status: statusMap[body.status] ?? 'unknown',
                lastCheck: Date.now(),
                latencyMs,
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
        const timeoutMs = request.timeout_ms ?? 120_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const start = Date.now();
        try {
            const res = await fetch(`${this.endpoint}/v1/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: request.prompt,
                    conversation_id: request.conversation_id,
                    timeout_ms: timeoutMs,
                    tool: request.tool,
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const errMsg = typeof errBody['error'] === 'string'
                    ? errBody['error']
                    : `HTTP ${res.status}`;
                throw EIO(this.registration.id, errMsg);
            }
            const body = (await res.json());
            if (body.error) {
                throw EIO(this.registration.id, body.error.message);
            }
            return {
                text: body.response ?? '',
                driver: this.registration.id,
                thinking: body.thinking,
                conversation_id: body.conversation_id,
                durationMs: body.timing?.total_ms ?? (Date.now() - start),
            };
        }
        catch (err) {
            clearTimeout(timer);
            // Re-throw PingErrors as-is
            if (isPingError(err))
                throw err;
            if (isAbortError(err)) {
                throw ETIMEDOUT(this.registration.id, timeoutMs);
            }
            throw EIO(this.registration.id, err instanceof Error ? err.message : 'Unknown error');
        }
    }
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
//# sourceMappingURL=pingapp-adapter.js.map