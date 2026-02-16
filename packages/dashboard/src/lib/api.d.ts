/** API client for PingDev dashboard — talks to each PingApp's local HTTP API. */
export interface PingAppConfig {
    name: string;
    url: string;
    port: number;
}
export interface HealthResponse {
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
export interface JobResponse {
    job_id: string;
    status: string;
    created_at: string;
    prompt: string;
    response?: string;
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    };
    thinking?: string;
    timing?: {
        queued_at: string;
        started_at?: string;
        first_token_at?: string;
        completed_at?: string;
        total_ms?: number;
    };
    state_history?: Array<{
        timestamp: string;
        from: string;
        to: string;
        trigger: string;
        details?: string;
    }>;
    tool_used?: string | null;
    mode?: string | null;
    conversation_id?: string;
    artifact_path?: string;
}
export interface JobStatusResponse {
    job_id: string;
    bull_state: string;
    ui_state: string;
    substate: string | null;
    elapsed_in_state_ms: number;
    thinking: string;
    progress_text: string;
    partial_response: string;
    timing: JobResponse['timing'];
    state_history: NonNullable<JobResponse['state_history']>;
    tool_used: string | null;
    mode: string | null;
}
export interface ChatResponse extends JobResponse {
    cached?: boolean;
}
export interface ToolsResponse {
    tools: Array<{
        name: string;
        description?: string;
    }>;
}
export declare function fetchHealth(port: number): Promise<HealthResponse>;
export declare function submitJob(port: number, prompt: string, opts?: {
    tool?: string;
    mode?: string;
    timeout_ms?: number;
}): Promise<{
    job_id: string;
    status: string;
    created_at: string;
}>;
export declare function fetchJob(port: number, jobId: string): Promise<JobResponse>;
export declare function fetchJobStatus(port: number, jobId: string): Promise<JobStatusResponse>;
export declare function sendChat(port: number, prompt: string, opts?: {
    tool?: string;
    mode?: string;
    timeout_ms?: number;
}): Promise<ChatResponse>;
export declare function fetchTools(port: number): Promise<ToolsResponse>;
/** Subscribe to SSE job stream. Returns a cleanup function. */
export declare function subscribeJobStream(port: number, jobId: string, onEvent: (type: string, data: Record<string, unknown>) => void, onError?: (err: Error) => void): () => void;
export declare function loadApps(): PingAppConfig[];
export declare function saveApps(apps: PingAppConfig[]): void;
export declare function addApp(app: PingAppConfig): PingAppConfig[];
export declare function removeApp(port: number): PingAppConfig[];
//# sourceMappingURL=api.d.ts.map