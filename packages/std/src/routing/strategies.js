// @pingdev/std — Routing strategies for driver selection
/**
 * Pick the driver with the lowest latency.
 * Drivers without latency data sort to the end.
 */
function fastest(drivers, healthMap) {
    let best;
    let bestLatency = Infinity;
    for (const d of drivers) {
        const h = healthMap.get(d.registration.id);
        const latency = h?.latencyMs ?? Infinity;
        if (latency < bestLatency) {
            bestLatency = latency;
            best = d;
        }
    }
    return best ?? drivers[0];
}
/**
 * Pick the driver with the lowest priority number (priority = cost rank).
 */
function cheapest(drivers, _healthMap) {
    let best;
    let bestPriority = Infinity;
    for (const d of drivers) {
        if (d.registration.priority < bestPriority) {
            bestPriority = d.registration.priority;
            best = d;
        }
    }
    return best ?? drivers[0];
}
/**
 * Pick the lowest-priority driver that is 'online' (not degraded or worse).
 * Falls back to cheapest if none are strictly online.
 */
function best(drivers, healthMap) {
    let pick;
    let pickPriority = Infinity;
    for (const d of drivers) {
        const h = healthMap.get(d.registration.id);
        const status = h?.status ?? 'unknown';
        if (status === 'online' && d.registration.priority < pickPriority) {
            pickPriority = d.registration.priority;
            pick = d;
        }
    }
    // Fallback: if no driver is strictly online, pick cheapest overall
    return pick ?? cheapest(drivers, healthMap);
}
/**
 * Rotate through drivers using a shared counter.
 */
function roundRobin(drivers, state) {
    const idx = state.counter % drivers.length;
    state.counter++;
    return drivers[idx];
}
/**
 * Resolve a routing strategy by name and apply it to the candidate drivers.
 */
export function resolveStrategy(name, drivers, healthMap, state) {
    switch (name) {
        case 'fastest':
            return fastest(drivers, healthMap);
        case 'cheapest':
            return cheapest(drivers, healthMap);
        case 'best':
            return best(drivers, healthMap);
        case 'round-robin':
            return roundRobin(drivers, state);
    }
}
//# sourceMappingURL=strategies.js.map