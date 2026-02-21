import type { Driver, DriverRegistration, DriverHealth, DriverCapabilities, DeviceRequest, DeviceResponse, StreamChunk, ModelInfo } from '../types.js';
export interface LMStudioAdapterOptions {
    id?: string;
    name?: string;
    endpoint?: string;
    model?: string;
    capabilities?: DriverCapabilities;
    priority?: number;
}
export declare class LMStudioAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly endpoint;
    private readonly model;
    constructor(options?: LMStudioAdapterOptions);
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
    stream(request: DeviceRequest): AsyncIterable<StreamChunk>;
    listModels(): Promise<ModelInfo[]>;
    private toMessages;
}
//# sourceMappingURL=lmstudio.d.ts.map