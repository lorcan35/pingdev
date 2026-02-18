// @pingdev/std — ModelRegistry: driver registration, lookup, health monitoring

import type {
  Driver,
  DriverCapabilities,
  DriverHealth,
  DriverRegistration,
  DeviceRequest,
  RoutingStrategy,
} from './types.js';
import { ENOENT } from './errors.js';
import { resolveStrategy, type RoutingState } from './routing/index.js';

export class ModelRegistry {
  private drivers = new Map<string, Driver>();
  private healthCache = new Map<string, DriverHealth>();
  private affinityMap = new Map<string, string>(); // affinity key → driver id
  private routingState: RoutingState = { counter: 0 };
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private defaultStrategy: RoutingStrategy;

  constructor(defaultStrategy: RoutingStrategy = 'best') {
    this.defaultStrategy = defaultStrategy;
  }

  /** Register a driver. */
  register(driver: Driver): void {
    this.drivers.set(driver.registration.id, driver);
  }

  /** Remove a driver by id. */
  unregister(id: string): void {
    this.drivers.delete(id);
    this.healthCache.delete(id);
  }

  /** Return all registered drivers. */
  listDrivers(): Driver[] {
    return Array.from(this.drivers.values());
  }

  /** Resolve the best driver for a request. Throws PingError (ENOENT) on failure. */
  resolve(request: DeviceRequest): Driver {
    // 1. If a specific driver is requested, return it directly
    if (request.driver) {
      const driver = this.drivers.get(request.driver);
      if (!driver) throw ENOENT(request.driver);
      return driver;
    }

    // 2. Build candidate list — filter by required capabilities
    let candidates = Array.from(this.drivers.values());

    if (request.require) {
      candidates = candidates.filter((d) =>
        matchesCapabilities(d.registration.capabilities, request.require!),
      );
    }

    // 3. Filter out offline drivers
    candidates = candidates.filter((d) => {
      const h = this.healthCache.get(d.registration.id);
      return !h || h.status !== 'offline';
    });

    if (candidates.length === 0) {
      throw ENOENT(request.prompt.slice(0, 40));
    }

    // 4. Sticky affinity — return the same driver for the same key
    if (request.affinity?.sticky && request.affinity.key) {
      const prevId = this.affinityMap.get(request.affinity.key);
      if (prevId) {
        const prev = candidates.find((d) => d.registration.id === prevId);
        if (prev) return prev;
      }
    }

    // 5. Apply routing strategy
    const strategy = request.strategy ?? this.defaultStrategy;
    const picked = resolveStrategy(
      strategy,
      candidates,
      this.healthCache,
      this.routingState,
    );

    // 6. Record affinity for future lookups
    if (request.affinity?.sticky && request.affinity.key) {
      this.affinityMap.set(request.affinity.key, picked.registration.id);
    }

    return picked;
  }

  /** Find all drivers that have a given capability flag set to true. */
  findByCapability(cap: keyof DriverCapabilities): Driver[] {
    return Array.from(this.drivers.values()).filter(
      (d) => d.registration.capabilities[cap],
    );
  }

  /** Get cached health for a driver. */
  getHealth(id: string): DriverHealth | undefined {
    return this.healthCache.get(id);
  }

  /** Start periodic health checks for all registered drivers. */
  startHealthChecks(intervalMs: number): void {
    this.stopHealthChecks();
    // Run immediately, then on interval
    void this.pollAll();
    this.healthTimer = setInterval(() => void this.pollAll(), intervalMs);
  }

  /** Stop periodic health checks. */
  stopHealthChecks(): void {
    if (this.healthTimer !== undefined) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  /** List all registered drivers. */
  listAll(): DriverRegistration[] {
    return Array.from(this.drivers.values()).map((d) => d.registration);
  }

  // ---- internals ----

  private async pollAll(): Promise<void> {
    const tasks = Array.from(this.drivers.entries()).map(
      async ([id, driver]) => {
        try {
          const h = await driver.health();
          this.healthCache.set(id, h);
        } catch {
          this.healthCache.set(id, {
            status: 'offline',
            lastCheck: Date.now(),
            error: 'health check failed',
          });
        }
      },
    );
    await Promise.allSettled(tasks);
  }
}

/** Check if a driver's capabilities satisfy the required partial set. */
function matchesCapabilities(
  has: DriverCapabilities,
  needs: Partial<DriverCapabilities>,
): boolean {
  for (const [key, value] of Object.entries(needs)) {
    const k = key as keyof DriverCapabilities;
    if (value === true && !has[k]) return false;
    if (typeof value === 'number' && (has[k] as number) < value) return false;
  }
  return true;
}
