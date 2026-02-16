"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSchemas = buildSchemas;
// ── Reusable schema components ──────────────────────────────────────────────
const ErrorCodeEnum = {
    type: 'string',
    enum: [
        'BROWSER_UNAVAILABLE',
        'RELAY_NOT_ATTACHED',
        'AUTH_REQUIRED',
        'CAPTCHA_REQUIRED',
        'UI_SELECTOR_NOT_FOUND',
        'GENERATION_TIMEOUT',
        'EXTRACTION_FAILED',
        'POLICY_BLOCKED',
        'RATE_LIMITED',
        'UNKNOWN',
    ],
};
const PriorityEnum = {
    type: 'string',
    enum: ['realtime', 'normal', 'bulk'],
};
const UIStateEnum = {
    type: 'string',
    enum: ['IDLE', 'TYPING', 'GENERATING', 'DONE', 'FAILED', 'NEEDS_HUMAN'],
};
const JobStatusEnum = {
    type: 'string',
    enum: ['queued', 'precheck', 'running', 'done', 'failed', 'needs_human', 'canceled'],
};
const ShimErrorSchema = {
    type: 'object',
    properties: {
        code: ErrorCodeEnum,
        message: { type: 'string' },
        retryable: { type: 'boolean' },
        state: UIStateEnum,
        evidence: { type: 'array', items: { type: 'string' } },
        recommendedAction: { type: 'string' },
    },
    required: ['code', 'message', 'retryable'],
};
const JobTimingSchema = {
    type: 'object',
    properties: {
        queued_at: { type: 'string', format: 'date-time' },
        started_at: { type: 'string', format: 'date-time' },
        first_token_at: { type: 'string', format: 'date-time' },
        completed_at: { type: 'string', format: 'date-time' },
        total_ms: { type: 'number' },
    },
    required: ['queued_at'],
};
const StateTransitionSchema = {
    type: 'object',
    properties: {
        timestamp: { type: 'string', format: 'date-time' },
        from: UIStateEnum,
        to: UIStateEnum,
        trigger: { type: 'string' },
        details: { type: 'string' },
    },
    required: ['timestamp', 'from', 'to', 'trigger'],
};
// ── Route schemas ───────────────────────────────────────────────────────────
const jobIdParam = {
    type: 'object',
    properties: {
        id: { type: 'string', description: 'Job ID (UUID)' },
    },
    required: ['id'],
};
/** Build all route schemas from the site definition. */
function buildSchemas(site) {
    const toolSchema = site.tools && site.tools.length > 0
        ? { type: 'string', enum: site.tools }
        : { type: 'string' };
    const modeSchema = site.modes && site.modes.length > 0
        ? { type: 'string', enum: site.modes }
        : { type: 'string' };
    const substateSchema = site.substates && site.substates.length > 0
        ? { type: ['string', 'null'], enum: [...site.substates, null] }
        : { type: ['string', 'null'] };
    const toolNullableSchema = { ...toolSchema, type: ['string', 'null'] };
    const modeNullableSchema = { ...modeSchema, type: ['string', 'null'] };
    const postJobsSchema = {
        summary: 'Submit a prompt',
        description: `Enqueues a prompt for asynchronous processing by the ${site.name} worker. Returns immediately with a job_id for polling.`,
        tags: ['Jobs'],
        body: {
            type: 'object',
            required: ['prompt'],
            properties: {
                prompt: { type: 'string', minLength: 1, description: `The prompt text to send to ${site.name}` },
                idempotency_key: { type: 'string', format: 'uuid', description: 'Client-supplied UUID for deduplication. If omitted a random UUID is generated.' },
                conversation_id: { type: 'string', description: 'ID of an existing conversation to continue' },
                timeout_ms: { type: 'number', description: 'Max time in ms to wait for generation (default 120 000)' },
                priority: { ...PriorityEnum, description: 'Queue priority (realtime=1, normal=5, bulk=10)' },
                tool: { ...toolSchema, description: 'Tool to activate before sending' },
                mode: { ...modeSchema, description: 'Mode to select before sending' },
                metadata: { type: 'object', additionalProperties: true, description: 'Arbitrary client metadata stored with the job' },
            },
        },
        response: {
            202: {
                description: 'Job accepted and queued',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    status: { type: 'string', enum: ['queued'] },
                    created_at: { type: 'string', format: 'date-time' },
                },
                required: ['job_id', 'status', 'created_at'],
            },
            400: {
                description: 'Invalid request (e.g. missing prompt)',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
            429: {
                description: 'Rate limited or queue full',
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    retry_after_ms: { type: 'number' },
                    retry_after: { type: 'number' },
                    queue_depth: { type: 'number' },
                    max_queue_depth: { type: 'number' },
                },
            },
        },
    };
    const getJobSchema = {
        summary: 'Get job result',
        description: 'Returns job status, response text, errors, and enhanced metadata (thinking, timing, state history).',
        tags: ['Jobs'],
        params: jobIdParam,
        response: {
            200: {
                description: 'Job details',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    status: JobStatusEnum,
                    created_at: { type: 'string', format: 'date-time' },
                    prompt: { type: 'string' },
                    response: { type: 'string' },
                    error: ShimErrorSchema,
                    artifact_path: { type: 'string' },
                    thinking: { type: 'string' },
                    timing: JobTimingSchema,
                    state_history: { type: 'array', items: StateTransitionSchema },
                    tool_used: toolNullableSchema,
                    mode: modeNullableSchema,
                    conversation_id: { type: 'string' },
                },
                required: ['job_id', 'status', 'created_at', 'prompt'],
            },
            404: {
                description: 'Job not found',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
        },
    };
    const getJobStatusSchema = {
        summary: 'Real-time job status',
        description: 'Returns detailed live status including UI state, substates, thinking content, timing, and partial responses.',
        tags: ['Jobs'],
        params: jobIdParam,
        response: {
            200: {
                description: 'Live job status',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    bull_state: { type: 'string' },
                    ui_state: UIStateEnum,
                    substate: substateSchema,
                    elapsed_in_state_ms: { type: 'number' },
                    thinking: { type: 'string' },
                    progress_text: { type: 'string' },
                    partial_response: { type: 'string' },
                    timing: JobTimingSchema,
                    state_history: { type: 'array', items: StateTransitionSchema },
                    tool_used: toolNullableSchema,
                    mode: modeNullableSchema,
                },
            },
            404: {
                description: 'Job not found',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
        },
    };
    const getJobThinkingSchema = {
        summary: 'Get thinking content',
        description: 'Returns the thinking/reasoning content extracted from the response.',
        tags: ['Jobs'],
        params: jobIdParam,
        response: {
            200: {
                description: 'Thinking content',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    thinking: { type: 'string' },
                    tool_used: toolNullableSchema,
                    mode: modeNullableSchema,
                },
            },
            404: {
                description: 'Job not found',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
        },
    };
    const getJobStreamSchema = {
        summary: 'Stream job events (SSE)',
        description: 'Server-Sent Events stream of real-time job state changes. Events: state_change, thinking, partial_response, complete, error.',
        tags: ['Jobs'],
        params: jobIdParam,
        produces: ['text/event-stream'],
        response: {
            200: {
                description: 'SSE event stream',
                type: 'string',
            },
            404: {
                description: 'Job not found',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
        },
    };
    const postChatSchema = {
        summary: 'Synchronous chat',
        description: 'Convenience endpoint that submits a prompt and blocks until the response is ready (or timeout).',
        tags: ['Chat'],
        body: {
            type: 'object',
            required: ['prompt'],
            properties: {
                prompt: { type: 'string', minLength: 1, description: `The prompt text to send to ${site.name}` },
                idempotency_key: { type: 'string', format: 'uuid', description: 'Client-supplied UUID for deduplication' },
                conversation_id: { type: 'string', description: 'ID of an existing conversation to continue' },
                timeout_ms: { type: 'number', description: 'Max time in ms to wait (default 120 000)' },
                priority: { ...PriorityEnum, description: 'Queue priority' },
                tool: { ...toolSchema, description: 'Tool to activate before sending' },
                mode: { ...modeSchema, description: 'Mode to select before sending' },
                metadata: { type: 'object', additionalProperties: true, description: 'Arbitrary client metadata' },
            },
        },
        response: {
            200: {
                description: 'Completed chat response',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    status: JobStatusEnum,
                    response: { type: 'string' },
                    error: ShimErrorSchema,
                    artifact_path: { type: 'string' },
                    thinking: { type: 'string' },
                    timing: JobTimingSchema,
                    state_history: { type: 'array', items: StateTransitionSchema },
                    tool_used: toolNullableSchema,
                    mode: modeNullableSchema,
                    conversation_id: { type: 'string' },
                },
            },
            400: {
                description: 'Invalid request',
                type: 'object',
                properties: { error: { type: 'string' } },
            },
            429: {
                description: 'Rate limited or queue full',
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    retry_after_ms: { type: 'number' },
                    retry_after: { type: 'number' },
                    queue_depth: { type: 'number' },
                    max_queue_depth: { type: 'number' },
                },
            },
            500: {
                description: 'Job failed',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    status: { type: 'string', enum: ['failed'] },
                    error: ShimErrorSchema,
                },
            },
            504: {
                description: 'Job timed out',
                type: 'object',
                properties: {
                    job_id: { type: 'string' },
                    status: { type: 'string', enum: ['timeout'] },
                    error: ShimErrorSchema,
                },
            },
        },
    };
    const getHealthSchema = {
        summary: 'Health check',
        description: 'Returns system health including browser connection status, queue metrics, and worker state.',
        tags: ['System'],
        response: {
            200: {
                description: 'System is healthy',
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                    browser: {
                        type: 'object',
                        properties: {
                            connected: { type: 'boolean' },
                            page_loaded: { type: 'boolean' },
                        },
                    },
                    queue: {
                        type: 'object',
                        properties: {
                            waiting: { type: 'number' },
                            active: { type: 'number' },
                            completed: { type: 'number' },
                            failed: { type: 'number' },
                        },
                    },
                    worker: {
                        type: 'object',
                        properties: {
                            running: { type: 'boolean' },
                            current_job: { type: 'string' },
                        },
                    },
                    timestamp: { type: 'string', format: 'date-time' },
                },
                required: ['status', 'browser', 'queue', 'worker', 'timestamp'],
            },
            503: {
                description: 'System is degraded or unhealthy',
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                    browser: { type: 'object' },
                    queue: { type: 'object' },
                    worker: { type: 'object' },
                    timestamp: { type: 'string', format: 'date-time' },
                },
            },
        },
    };
    return {
        postJobsSchema,
        getJobSchema,
        getJobStatusSchema,
        getJobThinkingSchema,
        getJobStreamSchema,
        postChatSchema,
        getHealthSchema,
    };
}
//# sourceMappingURL=schemas.js.map