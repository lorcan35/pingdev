import type { Driver, DriverRegistration, DriverHealth, DriverCapabilities, DeviceRequest, DeviceResponse } from '../types.js';
export interface PingAppAdapterOptions {
    id: string;
    name: string;
    endpoint: string;
    capabilities: DriverCapabilities;
    priority: number;
}
export declare class PingAppAdapter implements Driver {
    readonly registration: DriverRegistration;
    private readonly endpoint;
    constructor(options: PingAppAdapterOptions);
    health(): Promise<DriverHealth>;
    execute(request: DeviceRequest): Promise<DeviceResponse>;
}
//# sourceMappingURL=pingapp-adapter.d.ts.map