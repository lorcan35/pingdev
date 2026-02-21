import type { Driver, DriverRegistration, DriverHealth, DeviceRequest, DeviceResponse, StreamChunk, ModelInfo } from '../types.js';
export interface OpenRouterAdapterOptions {
    apiKey: string;
    defaultModel?: string;
    fallbackModel?: string;
    siteUrl?: string;
    siteName?: string;
    priority?: number;
}
export declare class OpenRouterAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly apiKey;
    private readonly model;
    private readonly siteUrl;
    private readonly siteName;
    constructor(options: OpenRouterAdapterOptions);
    private buildHeaders;
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels(): Promise<ModelInfo[]>;
    private toMessages;
}
//# sourceMappingURL=openrouter.d.ts.map