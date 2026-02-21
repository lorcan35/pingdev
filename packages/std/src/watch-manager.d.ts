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
import type { ExtensionBridge } from './ext-bridge.js';
import type { WatchEvent, WatchRequest } from './types.js';
export interface ActiveWatch {
    watchId: string;
    deviceId: string;
    selector: string;
    fields?: Record<string, string>;
    interval: number;
    createdAt: number;
    lastSnapshot: Record<string, unknown> | null;
    listeners: Set<(event: WatchEvent) => void>;
    timer: ReturnType<typeof setInterval> | null;
    stopped: boolean;
}
export declare class WatchManager {
    private watches;
    private extBridge;
    constructor(extBridge: ExtensionBridge);
    /**
     * Start watching a selector on a device.
     * Returns a watchId for management and an event listener registration.
     */
    startWatch(deviceId: string, request: WatchRequest): ActiveWatch;
    /** Stop a specific watch. */
    stopWatch(watchId: string): boolean;
    /** Get a specific watch. */
    getWatch(watchId: string): ActiveWatch | undefined;
    /** List all active watches. */
    listAll(): Array<{
        watchId: string;
        deviceId: string;
        selector: string;
        interval: number;
        createdAt: number;
    }>;
    /** Add a change listener to a watch. */
    addListener(watchId: string, listener: (event: WatchEvent) => void): boolean;
    /** Remove a change listener from a watch. */
    removeListener(watchId: string, listener: (event: WatchEvent) => void): boolean;
    /** Stop all watches (cleanup). */
    stopAll(): void;
    private consecutiveErrors;
    private poll;
    private extractData;
}
//# sourceMappingURL=watch-manager.d.ts.map