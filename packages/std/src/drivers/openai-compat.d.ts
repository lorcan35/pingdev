import type { Driver, DriverRegistration, DriverHealth, DriverCapabilities, DeviceRequest, DeviceResponse, StreamChunk, ModelInfo } from '../types.js';
export interface OpenAICompatAdapterOptions {
    id: string;
    name: string;
    endpoint: string;
    apiKey?: string;
    model: string;
    capabilities: DriverCapabilities;
    priority: number;
}
export declare class OpenAICompatAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly endpoint;
    private readonly apiKey;
    private readonly model;
    constructor(options: OpenAICompatAdapterOptions);
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels(): Promise<ModelInfo[]>;
    private buildHeaders;
}
//# sourceMappingURL=openai-compat.d.ts.map