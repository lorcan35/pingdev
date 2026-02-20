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
import type { ExtensionBridge } from './ext-bridge.js';
import type { WatchEvent, WatchRequest } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Watch Manager
// ---------------------------------------------------------------------------

export class WatchManager {
  private watches = new Map<string, ActiveWatch>();
  private extBridge: ExtensionBridge;

  constructor(extBridge: ExtensionBridge) {
    this.extBridge = extBridge;
  }

  /**
   * Start watching a selector on a device.
   * Returns a watchId for management and an event listener registration.
   */
  startWatch(deviceId: string, request: WatchRequest): ActiveWatch {
    const watchId = `w-${randomUUID().slice(0, 8)}`;
    const interval = Math.max(1000, request.interval ?? 5000);

    const watch: ActiveWatch = {
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
  stopWatch(watchId: string): boolean {
    const watch = this.watches.get(watchId);
    if (!watch) return false;
    watch.stopped = true;
    if (watch.timer) clearInterval(watch.timer);
    watch.listeners.clear();
    this.watches.delete(watchId);
    return true;
  }

  /** Get a specific watch. */
  getWatch(watchId: string): ActiveWatch | undefined {
    return this.watches.get(watchId);
  }

  /** List all active watches. */
  listAll(): Array<{ watchId: string; deviceId: string; selector: string; interval: number; createdAt: number }> {
    return Array.from(this.watches.values()).map((w) => ({
      watchId: w.watchId,
      deviceId: w.deviceId,
      selector: w.selector,
      interval: w.interval,
      createdAt: w.createdAt,
    }));
  }

  /** Add a change listener to a watch. */
  addListener(watchId: string, listener: (event: WatchEvent) => void): boolean {
    const watch = this.watches.get(watchId);
    if (!watch) return false;
    watch.listeners.add(listener);
    return true;
  }

  /** Remove a change listener from a watch. */
  removeListener(watchId: string, listener: (event: WatchEvent) => void): boolean {
    const watch = this.watches.get(watchId);
    if (!watch) return false;
    watch.listeners.delete(listener);
    // Auto-stop if no listeners remain
    if (watch.listeners.size === 0) {
      this.stopWatch(watchId);
    }
    return true;
  }

  /** Stop all watches (cleanup). */
  stopAll(): void {
    for (const watchId of this.watches.keys()) {
      this.stopWatch(watchId);
    }
  }

  // ---- internal ----

  private async poll(watch: ActiveWatch): Promise<void> {
    if (watch.stopped) return;

    try {
      const snapshot = await this.extractData(watch);
      if (!snapshot) return;

      const prev = watch.lastSnapshot;
      if (prev === null) {
        // First snapshot — set baseline, emit initial event
        watch.lastSnapshot = snapshot;
        const event: WatchEvent = {
          watchId: watch.watchId,
          timestamp: Date.now(),
          changes: [],
          snapshot,
        };
        for (const listener of watch.listeners) {
          try { listener(event); } catch { /* ignore listener errors */ }
        }
        return;
      }

      // Compute changes
      const changes: Array<{ field: string; old: string; new: string }> = [];
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
        const event: WatchEvent = {
          watchId: watch.watchId,
          timestamp: Date.now(),
          changes,
          snapshot,
        };
        for (const listener of watch.listeners) {
          try { listener(event); } catch { /* ignore listener errors */ }
        }
      }
    } catch {
      // Ignore polling errors silently
    }
  }

  private async extractData(watch: ActiveWatch): Promise<Record<string, unknown> | null> {
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
          const data = (result as Record<string, unknown>).data ?? result;
          return data as Record<string, unknown>;
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
    } catch {
      return null;
    }
  }
}
