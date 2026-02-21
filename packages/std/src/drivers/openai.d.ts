import type { Driver, DriverRegistration, DriverHealth, DriverCapabilities, DeviceRequest, DeviceResponse, StreamChunk, ModelInfo } from '../types.js';
export interface OpenAIAdapterOptions {
    id?: string;
    name?: string;
    endpoint?: string;
    apiKey: string;
    model?: string;
    capabilities?: DriverCapabilities;
    priority?: number;
}
export declare class OpenAIAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly endpoint;
    private readonly apiKey;
    private readonly model;
    constructor(options: OpenAIAdapterOptions);
    private buildHeaders;
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels(): Promise<ModelInfo[]>;
    private toMessages;
}
//# sourceMappingURL=openai.d.ts.map