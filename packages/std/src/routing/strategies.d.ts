import type { Driver, DriverHealth, RoutingStrategy } from '../types.js';
/** Mutable state for round-robin rotation. */
export interface RoutingState {
    counter: number;
}
/**
 * Resolve a routing strategy by name and apply it to the candidate drivers.
 */
export declare function resolveStrategy(name: RoutingStrategy, drivers: Driver[], healthMap: Map<string, DriverHealth>, state: RoutingState): Driver;
//# sourceMappingURL=strategies.d.ts.map