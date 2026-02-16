/** Discriminates browser-backed PingApps from API-native and local providers. */
export type BackendType = 'pingapp' | 'api' | 'local';
/** Routing strategy for selecting among multiple capable drivers. */
export type RoutingStrategy = 'fastest' | 'cheapest' | 'best' | 'round-robin';
/** Capability flags attached to every driver registration. */
export interface DriverCapabilities {
    llm: boolean;
    streaming: boolean;
    vision: boolean;
    toolCalling: boolean;
    imageGen: boolean;
    search: boolean;
    deepResearch: boolean;
    thinking: boolean;
    snapshotting?: boolean;
    sessionAffinity?: boolean;
    maxContextTokens?: number;
    concurrency?: number;
}
export type ContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image_url';
    url: string;
    detail?: 'low' | 'high';
} | {
    type: 'tool_call';
    id: string;
    name: string;
    arguments: unknown;
} | {
    type: 'tool_result';
    toolCallId: string;
    content: unknown;
};
export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
}
export interface DriverRegistration {
    id: string;
    name: string;
    type: BackendType;
    capabilities: DriverCapabilities;
    endpoint: string;
    priority: number;
    tools?: string[];
    modes?: string[];
    model?: ModelInfo;
}
export type HealthStatus = 'online' | 'degraded' | 'offline' | 'unknown';
export interface DriverHealth {
    status: HealthStatus;
    lastCheck: number;
    latencyMs?: number;
    error?: string;
}
export interface ModelInfo {
    id: string;
    name: string;
    provider?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
}
export interface DeviceRequest {
    prompt: string;
    messages?: Message[];
    driver?: string;
    require?: Partial<DriverCapabilities>;
    strategy?: RoutingStrategy;
    mode?: 'sync' | 'async';
    affinity?: {
        key?: string;
        sticky?: boolean;
    };
    tool?: string;
    conversation_id?: string;
    timeout_ms?: number;
    stream?: boolean;
    model?: string;
}
export interface DeviceResponse {
    text: string;
    driver: string;
    model?: string;
    usage?: TokenUsage;
    thinking?: string;
    artifacts?: Artifact[];
    conversation_id?: string;
    durationMs?: number;
}
export interface TokenUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}
export interface Artifact {
    type: 'image' | 'code' | 'file' | 'json';
    data: string;
    mimeType?: string;
    filename?: string;
}
export interface StreamChunk {
    type: 'partial' | 'thinking' | 'complete';
    text?: string;
    usage?: TokenUsage;
    durationMs?: number;
}
export type PingErrno = 'ENOENT' | 'EACCES' | 'EBUSY' | 'ETIMEDOUT' | 'EAGAIN' | 'ENOSYS' | 'ENODEV' | 'EOPNOTSUPP' | 'EIO' | 'ECANCELED';
export interface PingError {
    errno: PingErrno;
    code: string;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    details?: unknown;
}
export interface Driver {
    readonly registration: DriverRegistration;
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream?(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels?(): Promise<ModelInfo[]>;
}
//# sourceMappingURL=types.d.ts.map