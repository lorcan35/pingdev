import type { Driver, DriverRegistration, DriverHealth, DriverCapabilities, DeviceRequest, DeviceResponse, StreamChunk, ModelInfo } from '../types.js';
export interface AnthropicAdapterOptions {
    id: string;
    name: string;
    endpoint: string;
    apiKey: string;
    model: string;
    capabilities: DriverCapabilities;
    priority: number;
}
export declare class AnthropicAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly endpoint;
    private readonly apiKey;
    private readonly model;
    constructor(options: AnthropicAdapterOptions);
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels(): Promise<ModelInfo[]>;
    private buildHeaders;
    private buildPayload;
}
//# sourceMappingURL=anthropic.d.ts.map