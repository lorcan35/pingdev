/** Shared types for @pingdev/core. */
import type { Page, Locator } from 'playwright';
/** A selector with tiered fallbacks. */
export interface SelectorDef {
    name: string;
    tiers: string[];
}
/** UI state machine states. */
export type UIState = 'IDLE' | 'TYPING' | 'GENERATING' | 'DONE' | 'FAILED' | 'NEEDS_HUMAN';
/** Job lifecycle states. */
export type JobStatus = 'queued' | 'precheck' | 'running' | 'done' | 'failed' | 'needs_human' | 'canceled';
/** Job priority levels. */
export type Priority = 'realtime' | 'normal' | 'bulk';
/** Error codes from the error taxonomy. */
export type ErrorCode = 'BROWSER_UNAVAILABLE' | 'RELAY_NOT_ATTACHED' | 'AUTH_REQUIRED' | 'CAPTCHA_REQUIRED' | 'UI_SELECTOR_NOT_FOUND' | 'GENERATION_TIMEOUT' | 'EXTRACTION_FAILED' | 'POLICY_BLOCKED' | 'RATE_LIMITED' | 'UNKNOWN';
/** Structured error with taxonomy fields. */
export interface ShimError {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    state?: UIState;
    evidence?: string[];
    recommendedAction?: string;
}
/** Job submission request body. */
export interface JobRequest {
    prompt: string;
    idempotency_key?: string;
    conversation_id?: string;
    timeout_ms?: number;
    priority?: Priority;
    /** Site-specific tool name. */
    tool?: string;
    /** Site-specific mode name. */
    mode?: string;
    metadata?: Record<string, unknown>;
}
/** Job result returned by GET /v1/jobs/:id. */
export interface JobResult {
    job_id: string;
    status: JobStatus;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    prompt: string;
    response?: string;
    error?: ShimError;
    artifact_path?: string;
    metadata?: Record<string, unknown>;
}
/** State transition event for timeline logging. */
export interface StateTransition {
    timestamp: string;
    from: UIState;
    to: UIState;
    trigger: string;
    details?: string;
}
/** Timing metadata for a job. */
export interface JobTiming {
    queued_at: string;
    started_at?: string;
    first_token_at?: string;
    completed_at?: string;
    total_ms?: number;
}
/** Substates for detailed status tracking (site-specific strings). */
export type UISubstate = string | null;
/** Live job state for observability. */
export interface LiveJobState {
    job_id: string;
    state: UIState;
    substate: UISubstate;
    timing: JobTiming;
    state_history: StateTransition[];
    thinking: string;
    partial_response: string;
    progress_text: string;
    tool_used: string | null;
    mode: string | null;
    artifact_path?: string;
}
/** Enhanced job result with full metadata. */
export interface EnhancedJobResult extends JobResult {
    thinking?: string;
    timing?: JobTiming;
    state_history?: StateTransition[];
    tool_used?: string | null;
    mode?: string | null;
    conversation_id?: string;
}
/** Health check response. */
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    browser: {
        connected: boolean;
        page_loaded: boolean;
    };
    queue: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    };
    worker: {
        running: boolean;
        current_job?: string;
    };
    timestamp: string;
}
/** SSE event types for the streaming endpoint. */
export type SSEEventType = 'state_change' | 'partial_response' | 'thinking' | 'progress' | 'complete' | 'error';
/** SSE event payload. */
export interface SSEEvent {
    type: SSEEventType;
    data: Record<string, unknown>;
    timestamp: string;
}
/** How to detect that a response is complete. */
export interface CompletionConfig {
    /** Detection method. */
    method: 'hash_stability' | 'selector_presence' | 'network_idle';
    /** Polling interval in ms. */
    pollMs: number;
    /** Number of stable polls before marking complete (for hash_stability). */
    stableCount: number;
    /** Max wait time in ms before timeout. */
    maxWaitMs: number;
}
/** Browser/CDP connection configuration. */
export interface BrowserConfig {
    /** CDP endpoint URL. */
    cdpUrl: string;
    /** Timeout for CDP connection in ms. */
    connectTimeoutMs: number;
    /** Timeout for page navigation in ms. */
    navigationTimeoutMs: number;
}
/** Action handler function signature. */
export type ActionHandler = (ctx: ActionContext) => Promise<unknown>;
/** Context passed to action handlers. */
export interface ActionContext {
    page: Page;
    selectors: Record<string, SelectorDef>;
    resolveSelector: (selectorDef: SelectorDef, timeoutMs?: number) => Promise<Locator | null>;
    log: import('pino').Logger;
    jobRequest: JobRequest;
}
/** Configuration for a site's state machine. */
export interface StateMachineConfig {
    /** Valid transitions: state → allowed next states. */
    transitions: Record<string, string[]>;
    /** Initial state (default: 'IDLE'). */
    initialState?: string;
}
/** Rate limiting configuration. */
export interface RateLimitConfig {
    maxPerMinute: number;
    minDelayMs: number;
    maxQueueDepth: number;
}
/** Redis connection configuration. */
export interface RedisConfig {
    host: string;
    port: number;
}
/** Queue configuration. */
export interface QueueConfig {
    name: string;
    concurrency: number;
    defaultTimeoutMs: number;
}
/** Retry configuration. */
export interface RetryConfig {
    actionRetries: number;
    actionBackoffMs: number[];
    jobRetries: number;
}
/** Idempotency configuration. */
export interface IdempotencyConfig {
    ttlMs: number;
    keyPrefix: string;
}
/** Conversation store configuration. */
export interface ConversationConfig {
    ttlMs: number;
    keyPrefix: string;
}
/** Complete site definition — everything needed to create a PingApp. */
export interface SiteDefinition {
    /** Short name for the site (e.g., 'chatgpt', 'claude'). */
    name: string;
    /** Base URL of the site. */
    url: string;
    /** Selector definitions for UI elements. */
    selectors: Record<string, SelectorDef>;
    /** State machine configuration. */
    states: StateMachineConfig;
    /** Named action handlers. */
    actions: {
        /** Find or create the target page/tab. Required. */
        findOrCreatePage: ActionHandler;
        /** Run preflight checks. Optional. */
        preflight?: ActionHandler;
        /** Type prompt into the input. Required. */
        typePrompt: ActionHandler;
        /** Submit the prompt. Required. */
        submit: ActionHandler;
        /** Check if the site is generating a response. Required. */
        isGenerating: ActionHandler;
        /** Check if the response is complete. Required. */
        isResponseComplete: ActionHandler;
        /** Extract the response text. Required. */
        extractResponse: ActionHandler;
        /** Extract partial response for streaming. Optional. */
        extractPartialResponse?: ActionHandler;
        /** Extract thinking/reasoning content. Optional. */
        extractThinking?: ActionHandler;
        /** Extract progress text. Optional. */
        extractProgressText?: ActionHandler;
        /** Dismiss overlays/modals. Optional. */
        dismissOverlays?: ActionHandler;
        /** Activate a site-specific tool. Optional. */
        activateTool?: ActionHandler;
        /** Deactivate a site-specific tool. Optional. */
        deactivateTool?: ActionHandler;
        /** Switch a site-specific mode. Optional. */
        switchMode?: ActionHandler;
        /** Start a new conversation. Optional. */
        newConversation?: ActionHandler;
        /** Navigate to an existing conversation. Optional. */
        navigateToConversation?: (ctx: ActionContext, url: string) => Promise<void>;
        /** Get the current page URL. Optional. */
        getCurrentUrl?: ActionHandler;
    };
    /** Response completion detection configuration. */
    completion: CompletionConfig;
    /** Browser/CDP configuration. */
    browser?: Partial<BrowserConfig>;
    /** Redis configuration. */
    redis?: Partial<RedisConfig>;
    /** Queue configuration. */
    queue?: Partial<QueueConfig>;
    /** Rate limiting configuration. */
    rateLimit?: Partial<RateLimitConfig>;
    /** Retry configuration. */
    retry?: Partial<RetryConfig>;
    /** Idempotency configuration. */
    idempotency?: Partial<IdempotencyConfig>;
    /** Conversation store configuration. */
    conversation?: Partial<ConversationConfig>;
    /** Artifact storage base directory. */
    artifactsDir?: string;
    /** Site-specific tool names (for schema documentation). */
    tools?: string[];
    /** Site-specific mode names (for schema documentation). */
    modes?: string[];
    /** Substates for detailed tracking (for schema documentation). */
    substates?: string[];
}
/** Options for creating a ShimApp. */
export interface ShimAppOptions {
    /** HTTP server port. */
    port?: number;
    /** HTTP server host. */
    host?: string;
    /** Redis configuration (overrides site config). */
    redis?: Partial<RedisConfig>;
    /** Log level. */
    logLevel?: string;
}
//# sourceMappingURL=types.d.ts.map