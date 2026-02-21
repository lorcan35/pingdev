import type { Driver, DriverCapabilities, DriverHealth, DriverRegistration, DeviceRequest, RoutingStrategy } from './types.js';
export declare class ModelRegistry {
    private drivers;
    private healthCache;
    private affinityMap;
    private routingState;
    private healthTimer;
    private defaultStrategy;
    constructor(defaultStrategy?: RoutingStrategy);
    /** Register a driver. */
    register(driver: Driver): void;
    /** Remove a driver by id. */
    unregister(id: string): void;
    /** Return all registered drivers. */
    listDrivers(): Driver[];
    /** Resolve the best driver for a request. Throws PingError (ENOENT) on failure. */
    resolve(request: DeviceRequest): Driver;
    /** Find all drivers that have a given capability flag set to true. */
    findByCapability(cap: keyof DriverCapabilities): Driver[];
    /** Get cached health for a driver. */
    getHealth(id: string): DriverHealth | undefined;
    /** Start periodic health checks for all registered drivers. */
    startHealthChecks(intervalMs: number): void;
    /** Stop periodic health checks. */
    stopHealthChecks(): void;
    /** List all registered drivers. */
    listAll(): DriverRegistration[];
    private pollAll;
}
//# sourceMappingURL=registry.d.ts.map