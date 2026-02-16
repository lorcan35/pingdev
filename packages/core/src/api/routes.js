"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const node_crypto_1 = require("node:crypto");
const adapter_js_1 = require("../browser/adapter.js");
const jobStore = __importStar(require("../worker/job-state-store.js"));
const schemas_js_1 = require("./schemas.js");
const logger_js_1 = require("../logger.js");
async function registerRoutes(app, site, options) {
    const log = (0, logger_js_1.createLogger)(site.name).child({ module: 'api' });
    const { queue, rateLimiter, idempotencyStore } = options;
    const schemas = (0, schemas_js_1.buildSchemas)(site);
    const defaultTimeoutMs = site.queue?.defaultTimeoutMs ?? 120_000;
    const maxQueueDepth = site.rateLimit?.maxQueueDepth ?? 10;
    const jobRetries = site.retry?.jobRetries ?? 2;
    /** Check rate limit and queue depth. Returns an error reply if blocked, or null if OK. */
    async function enforceRateLimits() {
        const rateLimitResult = rateLimiter.check();
        if (rateLimitResult) {
            return {
                status: 429,
                body: {
                    error: 'Rate limit exceeded',
                    retry_after_ms: rateLimitResult.retryAfterMs,
                    retry_after: Math.ceil(rateLimitResult.retryAfterMs / 1000),
                },
            };
        }
        const waiting = await queue.getWaitingCount();
        if (waiting >= maxQueueDepth) {
            return {
                status: 429,
                body: {
                    error: 'Queue full',
                    queue_depth: waiting,
                    max_queue_depth: maxQueueDepth,
                },
            };
        }
        return null;
    }
    /** POST /v1/jobs — Submit a prompt asynchronously. */
    app.post('/v1/jobs', { schema: schemas.postJobsSchema }, async (request, reply) => {
        const body = request.body;
        if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
            return reply.status(400).send({ error: 'prompt is required' });
        }
        // Idempotency check
        if (body.idempotency_key) {
            const cached = await idempotencyStore.check(body.idempotency_key, body.prompt);
            if (cached) {
                if (cached.status === 'done' || cached.status === 'failed') {
                    log.info({ jobId: cached.job_id, status: cached.status }, 'Idempotency: returning cached result');
                    return reply.status(200).send({
                        job_id: cached.job_id,
                        status: cached.status,
                        cached: true,
                        ...(cached.result ?? {}),
                    });
                }
                log.info({ jobId: cached.job_id }, 'Idempotency: returning in-progress job');
                return reply.status(202).send({
                    job_id: cached.job_id,
                    status: 'queued',
                    cached: true,
                    created_at: cached.created_at,
                });
            }
        }
        const blocked = await enforceRateLimits();
        if (blocked) {
            return reply.status(blocked.status).send(blocked.body);
        }
        const jobId = body.idempotency_key ?? (0, node_crypto_1.randomUUID)();
        const job = await queue.add(jobId, body, {
            jobId,
            priority: body.priority === 'realtime' ? 1 : body.priority === 'bulk' ? 10 : 5,
            attempts: jobRetries,
            backoff: { type: 'custom' },
        });
        if (body.idempotency_key) {
            await idempotencyStore.storePending(body.idempotency_key, body.prompt, jobId);
        }
        rateLimiter.record();
        log.info({ jobId: job.id, prompt: body.prompt.slice(0, 80) }, 'Job enqueued');
        return reply.status(202).send({
            job_id: job.id,
            status: 'queued',
            created_at: new Date().toISOString(),
        });
    });
    /** GET /v1/jobs/:id — Get job status and result with enhanced metadata. */
    app.get('/v1/jobs/:id', { schema: schemas.getJobSchema }, async (request, reply) => {
        const { id } = request.params;
        const job = await queue.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        const state = await job.getState();
        let result = null;
        if (state === 'completed' || state === 'failed') {
            const freshJob = await queue.getJob(id);
            result = freshJob?.returnvalue ?? null;
        }
        const statusMap = {
            waiting: 'queued',
            delayed: 'queued',
            active: 'running',
            completed: result?.status ?? 'done',
            failed: 'failed',
        };
        const liveState = jobStore.getJobState(id);
        return reply.send({
            job_id: id,
            status: statusMap[state] ?? state,
            created_at: new Date(job.timestamp).toISOString(),
            prompt: job.data.prompt,
            response: result?.response ?? undefined,
            error: result?.error ?? (state === 'failed' ? { code: 'UNKNOWN', message: job.failedReason ?? 'Unknown' } : undefined),
            artifact_path: result?.artifact_path ?? undefined,
            thinking: result?.thinking ?? liveState?.thinking ?? undefined,
            timing: result?.timing ?? liveState?.timing ?? undefined,
            state_history: result?.state_history ?? liveState?.state_history ?? undefined,
            tool_used: result?.tool_used ?? liveState?.tool_used ?? undefined,
            mode: result?.mode ?? liveState?.mode ?? undefined,
            conversation_id: result?.conversation_id ?? undefined,
        });
    });
    /** GET /v1/jobs/:id/status — Real-time detailed status. */
    app.get('/v1/jobs/:id/status', { schema: schemas.getJobStatusSchema }, async (request, reply) => {
        const { id } = request.params;
        const job = await queue.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        const bullState = await job.getState();
        const liveState = jobStore.getJobState(id);
        let elapsedInStateMs = 0;
        if (liveState && liveState.state_history.length > 0) {
            const lastTransition = liveState.state_history[liveState.state_history.length - 1];
            elapsedInStateMs = Date.now() - new Date(lastTransition.timestamp).getTime();
        }
        else if (liveState?.timing.started_at) {
            elapsedInStateMs = Date.now() - new Date(liveState.timing.started_at).getTime();
        }
        return reply.send({
            job_id: id,
            bull_state: bullState,
            ui_state: liveState?.state ?? (bullState === 'completed' ? 'DONE' : bullState === 'failed' ? 'FAILED' : 'IDLE'),
            substate: liveState?.substate ?? null,
            elapsed_in_state_ms: elapsedInStateMs,
            thinking: liveState?.thinking ?? '',
            progress_text: liveState?.progress_text ?? '',
            partial_response: liveState?.partial_response ?? '',
            timing: liveState?.timing ?? { queued_at: new Date(job.timestamp).toISOString() },
            state_history: liveState?.state_history ?? [],
            tool_used: liveState?.tool_used ?? null,
            mode: liveState?.mode ?? null,
        });
    });
    /** GET /v1/jobs/:id/thinking — Extract thinking/reasoning content. */
    app.get('/v1/jobs/:id/thinking', { schema: schemas.getJobThinkingSchema }, async (request, reply) => {
        const { id } = request.params;
        const job = await queue.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        const liveState = jobStore.getJobState(id);
        const result = job.returnvalue;
        return reply.send({
            job_id: id,
            thinking: result?.thinking ?? liveState?.thinking ?? '',
            tool_used: liveState?.tool_used ?? result?.tool_used ?? null,
            mode: liveState?.mode ?? result?.mode ?? null,
        });
    });
    /** POST /v1/chat — Synchronous convenience endpoint. */
    app.post('/v1/chat', { schema: schemas.postChatSchema }, async (request, reply) => {
        const body = request.body;
        if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
            return reply.status(400).send({ error: 'prompt is required' });
        }
        // Idempotency check
        if (body.idempotency_key) {
            const cached = await idempotencyStore.check(body.idempotency_key, body.prompt);
            if (cached && cached.status === 'done' && cached.result) {
                log.info({ jobId: cached.job_id }, 'Idempotency: returning cached sync result');
                return reply.send({
                    job_id: cached.job_id,
                    status: cached.result.status,
                    response: cached.result.response,
                    error: cached.result.error,
                    artifact_path: cached.result.artifact_path,
                    thinking: cached.result.thinking,
                    timing: cached.result.timing,
                    state_history: cached.result.state_history,
                    tool_used: cached.result.tool_used,
                    mode: cached.result.mode,
                    cached: true,
                });
            }
        }
        const blocked = await enforceRateLimits();
        if (blocked) {
            return reply.status(blocked.status).send(blocked.body);
        }
        const jobId = body.idempotency_key ?? (0, node_crypto_1.randomUUID)();
        const timeoutMs = body.timeout_ms ?? defaultTimeoutMs;
        const job = await queue.add(jobId, body, {
            jobId,
            priority: 1,
            attempts: jobRetries,
            backoff: { type: 'custom' },
        });
        if (body.idempotency_key) {
            await idempotencyStore.storePending(body.idempotency_key, body.prompt, jobId);
        }
        rateLimiter.record();
        log.info({ jobId: job.id }, 'Sync job enqueued, waiting for completion');
        // Poll until job completes or times out
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const state = await job.getState();
            if (state === 'completed') {
                const freshJob = await queue.getJob(jobId);
                const result = freshJob?.returnvalue;
                return reply.send({
                    job_id: job.id,
                    status: result?.status ?? 'done',
                    response: result?.response,
                    error: result?.error,
                    artifact_path: result?.artifact_path,
                    thinking: result?.thinking,
                    timing: result?.timing,
                    state_history: result?.state_history,
                    tool_used: result?.tool_used,
                    mode: result?.mode,
                    conversation_id: result?.conversation_id,
                });
            }
            if (state === 'failed') {
                return reply.status(500).send({
                    job_id: job.id,
                    status: 'failed',
                    error: { code: 'UNKNOWN', message: job.failedReason ?? 'Job failed' },
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return reply.status(504).send({
            job_id: job.id,
            status: 'timeout',
            error: { code: 'GENERATION_TIMEOUT', message: `Timed out after ${timeoutMs}ms` },
        });
    });
    /** GET /v1/jobs/:id/stream — SSE stream of job events. */
    app.get('/v1/jobs/:id/stream', { schema: schemas.getJobStreamSchema }, async (request, reply) => {
        const { id } = request.params;
        const job = await queue.getJob(id);
        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        const res = reply.raw;
        function sendEvent(type, data) {
            const payload = JSON.stringify({ ...data, timestamp: new Date().toISOString() });
            res.write(`event: ${type}\ndata: ${payload}\n\n`);
        }
        let lastState = '';
        let lastPartialLen = 0;
        let lastThinkingLen = 0;
        let lastProgress = '';
        let closed = false;
        request.raw.on('close', () => {
            closed = true;
        });
        const pollInterval = 750;
        const poll = async () => {
            while (!closed) {
                const bullState = await job.getState().catch(() => 'unknown');
                const liveState = jobStore.getJobState(id);
                const currentState = liveState?.state ?? (bullState === 'completed' ? 'DONE' : bullState === 'failed' ? 'FAILED' : 'IDLE');
                if (currentState !== lastState) {
                    sendEvent('state_change', {
                        state: currentState,
                        substate: liveState?.substate ?? null,
                        previous_state: lastState || null,
                    });
                    lastState = currentState;
                }
                const partialLen = liveState?.partial_response?.length ?? 0;
                if (partialLen > lastPartialLen) {
                    sendEvent('partial_response', {
                        text: liveState.partial_response,
                        length: partialLen,
                    });
                    lastPartialLen = partialLen;
                }
                const thinkingLen = liveState?.thinking?.length ?? 0;
                if (thinkingLen > lastThinkingLen) {
                    sendEvent('thinking', {
                        text: liveState.thinking,
                        length: thinkingLen,
                    });
                    lastThinkingLen = thinkingLen;
                }
                const progress = liveState?.progress_text ?? '';
                if (progress && progress !== lastProgress) {
                    sendEvent('progress', { text: progress });
                    lastProgress = progress;
                }
                if (bullState === 'completed') {
                    const freshJob = await queue.getJob(id);
                    const result = freshJob?.returnvalue;
                    sendEvent('complete', {
                        status: result?.status ?? 'done',
                        response: result?.response ?? liveState?.partial_response ?? '',
                        thinking: result?.thinking ?? liveState?.thinking ?? '',
                        timing: result?.timing ?? liveState?.timing ?? null,
                    });
                    res.end();
                    return;
                }
                if (bullState === 'failed') {
                    sendEvent('error', {
                        code: 'JOB_FAILED',
                        message: job.failedReason ?? 'Job failed',
                    });
                    res.end();
                    return;
                }
                if (liveState?.state === 'DONE') {
                    sendEvent('complete', {
                        status: 'done',
                        response: liveState.partial_response,
                        thinking: liveState.thinking,
                        timing: liveState.timing,
                    });
                    res.end();
                    return;
                }
                if (liveState?.state === 'FAILED') {
                    sendEvent('error', {
                        code: 'JOB_FAILED',
                        message: 'Job failed',
                    });
                    res.end();
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            res.end();
        };
        poll().catch((err) => {
            log.error({ err: String(err) }, 'SSE poll error');
            if (!closed) {
                try {
                    sendEvent('error', { code: 'STREAM_ERROR', message: String(err) });
                }
                catch { /* ignore write-after-end */ }
                res.end();
            }
        });
        return reply;
    });
    /** GET /v1/health — System health check. */
    app.get('/v1/health', { schema: schemas.getHealthSchema }, async (_request, reply) => {
        let browserConnected = false;
        let pageLoaded = false;
        try {
            const adapter = new adapter_js_1.BrowserAdapter(site.browser);
            await adapter.connect();
            browserConnected = adapter.isConnected();
            pageLoaded = adapter.page !== null;
            await adapter.disconnect();
        }
        catch {
            // Browser not available
        }
        const waiting = await queue.getWaitingCount();
        const active = await queue.getActiveCount();
        const completed = await queue.getCompletedCount();
        const failed = await queue.getFailedCount();
        const isHealthy = browserConnected && pageLoaded;
        const health = {
            status: isHealthy ? 'healthy' : browserConnected ? 'degraded' : 'unhealthy',
            browser: { connected: browserConnected, page_loaded: pageLoaded },
            queue: { waiting, active, completed, failed },
            worker: { running: active > 0, current_job: undefined },
            timestamp: new Date().toISOString(),
        };
        return reply.status(isHealthy ? 200 : 503).send(health);
    });
    log.info('API routes registered');
}
//# sourceMappingURL=routes.js.map