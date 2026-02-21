/**
 * Real-Time Page Subscriptions — Watch Manager
 *
 * Manages active watches on page elements. Each watch monitors a selector
 * via the extension bridge and emits change events to connected SSE clients.
 *
 * Watches use MutationObserver-based detection in the content script with
 * polling fallback. The manager tracks all active watches and provides
 * lifecycle management.
 */
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Watch Manager
// ---------------------------------------------------------------------------
export class WatchManager {
    watches = new Map();
    extBridge;
    constructor(extBridge) {
        this.extBridge = extBridge;
    }
    /**
     * Start watching a selector on a device.
     * Returns a watchId for management and an event listener registration.
     */
    startWatch(deviceId, request) {
        const watchId = `w-${randomUUID().slice(0, 8)}`;
        const interval = Math.max(1000, request.interval ?? 5000);
        const watch = {
            watchId,
            deviceId,
            selector: request.selector,
            fields: request.fields,
            interval,
            createdAt: Date.now(),
            lastSnapshot: null,
            listeners: new Set(),
            timer: null,
            stopped: false,
        };
        this.watches.set(watchId, watch);
        // Start polling
        watch.timer = setInterval(() => {
            void this.poll(watch);
        }, interval);
        // Also do an immediate first poll
        void this.poll(watch);
        return watch;
    }
    /** Stop a specific watch. */
    stopWatch(watchId) {
        const watch = this.watches.get(watchId);
        if (!watch)
            return false;
        watch.stopped = true;
        if (watch.timer)
            clearInterval(watch.timer);
        watch.listeners.clear();
        this.watches.delete(watchId);
        return true;
    }
    /** Get a specific watch. */
    getWatch(watchId) {
        return this.watches.get(watchId);
    }
    /** List all active watches. */
    listAll() {
        return Array.from(this.watches.values()).map((w) => ({
            watchId: w.watchId,
            deviceId: w.deviceId,
            selector: w.selector,
            interval: w.interval,
            createdAt: w.createdAt,
        }));
    }
    /** Add a change listener to a watch. */
    addListener(watchId, listener) {
        const watch = this.watches.get(watchId);
        if (!watch)
            return false;
        watch.listeners.add(listener);
        return true;
    }
    /** Remove a change listener from a watch. */
    removeListener(watchId, listener) {
        const watch = this.watches.get(watchId);
        if (!watch)
            return false;
        watch.listeners.delete(listener);
        // Auto-stop if no listeners remain
        if (watch.listeners.size === 0) {
            this.stopWatch(watchId);
        }
        return true;
    }
    /** Stop all watches (cleanup). */
    stopAll() {
        for (const watchId of this.watches.keys()) {
            this.stopWatch(watchId);
        }
    }
    // ---- internal ----
    consecutiveErrors = new Map();
    async poll(watch) {
        if (watch.stopped)
            return;
        try {
            const snapshot = await this.extractData(watch);
            if (!snapshot) {
                // Track consecutive errors — device may have navigated
                const errCount = (this.consecutiveErrors.get(watch.watchId) ?? 0) + 1;
                this.consecutiveErrors.set(watch.watchId, errCount);
                if (errCount >= 3) {
                    // Emit a navigation/disconnected change event before stopping
                    const event = {
                        watchId: watch.watchId,
                        timestamp: Date.now(),
                        changes: [{ field: '_status', old: 'connected', new: 'disconnected' }],
                        snapshot: { _status: 'disconnected', _reason: 'Tab navigated or element removed' },
                    };
                    for (const listener of watch.listeners) {
                        try {
                            listener(event);
                        }
                        catch { /* ignore */ }
                    }
                    this.stopWatch(watch.watchId);
                }
                return;
            }
            // Reset error count on success
            this.consecutiveErrors.set(watch.watchId, 0);
            const prev = watch.lastSnapshot;
            if (prev === null) {
                // First snapshot — set baseline, emit initial event
                watch.lastSnapshot = snapshot;
                const event = {
                    watchId: watch.watchId,
                    timestamp: Date.now(),
                    changes: [],
                    snapshot,
                };
                for (const listener of watch.listeners) {
                    try {
                        listener(event);
                    }
                    catch { /* ignore listener errors */ }
                }
                return;
            }
            // Compute changes
            const changes = [];
            const allKeys = new Set([...Object.keys(prev), ...Object.keys(snapshot)]);
            for (const key of allKeys) {
                const oldVal = String(prev[key] ?? '');
                const newVal = String(snapshot[key] ?? '');
                if (oldVal !== newVal) {
                    changes.push({ field: key, old: oldVal, new: newVal });
                }
            }
            if (changes.length > 0) {
                watch.lastSnapshot = snapshot;
                const event = {
                    watchId: watch.watchId,
                    timestamp: Date.now(),
                    changes,
                    snapshot,
                };
                for (const listener of watch.listeners) {
                    try {
                        listener(event);
                    }
                    catch { /* ignore listener errors */ }
                }
            }
        }
        catch {
            // Track errors for navigation detection
            const errCount = (this.consecutiveErrors.get(watch.watchId) ?? 0) + 1;
            this.consecutiveErrors.set(watch.watchId, errCount);
            if (errCount >= 3) {
                const event = {
                    watchId: watch.watchId,
                    timestamp: Date.now(),
                    changes: [{ field: '_status', old: 'connected', new: 'disconnected' }],
                    snapshot: { _status: 'disconnected', _reason: 'Poll error — tab may have navigated' },
                };
                for (const listener of watch.listeners) {
                    try {
                        listener(event);
                    }
                    catch { /* ignore */ }
                }
                this.stopWatch(watch.watchId);
            }
        }
    }
    async extractData(watch) {
        try {
            if (watch.fields && Object.keys(watch.fields).length > 0) {
                // Multi-field extraction
                const result = await this.extBridge.callDevice({
                    deviceId: watch.deviceId,
                    op: 'extract',
                    payload: { schema: watch.fields },
                    timeoutMs: 10_000,
                });
                if (result && typeof result === 'object') {
                    const r = result;
                    const data = r.data ?? r;
                    // Unwrap nested result property from extension response
                    if (data && typeof data === 'object') {
                        const d = data;
                        return (d.result ?? data);
                    }
                    return data;
                }
                return null;
            }
            // Single selector read
            const result = await this.extBridge.callDevice({
                deviceId: watch.deviceId,
                op: 'read',
                payload: { selector: watch.selector },
                timeoutMs: 10_000,
            });
            return { value: result };
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=watch-manager.js.map