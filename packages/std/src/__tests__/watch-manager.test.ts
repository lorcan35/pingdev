// @pingdev/std — Tests for Real-Time Page Subscriptions (watch manager)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchManager } from '../watch-manager.js';
import type { WatchEvent } from '../types.js';

// Mock ExtensionBridge
function createMockBridge() {
  let extractCount = 0;
  const extractResults: Record<string, unknown>[] = [];

  const bridge = {
    callDevice: vi.fn(async (params: { deviceId: string; op: string; payload: unknown }) => {
      if (params.op === 'extract') {
        const idx = Math.min(extractCount, extractResults.length - 1);
        extractCount++;
        return extractResults[idx] ?? { data: { value: `data-${extractCount}` } };
      }
      if (params.op === 'read') {
        return `text-${extractCount++}`;
      }
      return { ok: true };
    }),
    _pushExtractResult(result: Record<string, unknown>) {
      extractResults.push(result);
    },
    _resetCount() {
      extractCount = 0;
    },
  };

  return bridge as any;
}

describe('WatchManager', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let manager: WatchManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = createMockBridge();
    manager = new WatchManager(bridge);
  });

  afterEach(() => {
    manager.stopAll();
    vi.useRealTimers();
  });

  describe('startWatch', () => {
    it('creates a watch with a unique ID', () => {
      const watch = manager.startWatch('tab-1', { selector: '.price' });
      expect(watch.watchId).toMatch(/^w-/);
      expect(watch.deviceId).toBe('tab-1');
      expect(watch.selector).toBe('.price');
      expect(watch.stopped).toBe(false);
    });

    it('enforces minimum 1000ms interval', () => {
      const watch = manager.startWatch('tab-1', { selector: '.price', interval: 100 });
      expect(watch.interval).toBe(1000);
    });

    it('uses default 5000ms interval', () => {
      const watch = manager.startWatch('tab-1', { selector: '.price' });
      expect(watch.interval).toBe(5000);
    });
  });

  describe('stopWatch', () => {
    it('stops and removes a watch', () => {
      const watch = manager.startWatch('tab-1', { selector: '.price' });
      expect(manager.stopWatch(watch.watchId)).toBe(true);
      expect(manager.getWatch(watch.watchId)).toBeUndefined();
    });

    it('returns false for unknown watch', () => {
      expect(manager.stopWatch('nonexistent')).toBe(false);
    });
  });

  describe('listAll', () => {
    it('returns all active watches', () => {
      manager.startWatch('tab-1', { selector: '.price' });
      manager.startWatch('tab-2', { selector: '.title' });
      const all = manager.listAll();
      expect(all).toHaveLength(2);
      expect(all[0].selector).toBe('.price');
      expect(all[1].selector).toBe('.title');
    });

    it('excludes stopped watches', () => {
      const w1 = manager.startWatch('tab-1', { selector: '.price' });
      manager.startWatch('tab-2', { selector: '.title' });
      manager.stopWatch(w1.watchId);
      expect(manager.listAll()).toHaveLength(1);
    });
  });

  describe('event emission', () => {
    it('emits initial snapshot event', async () => {
      const events: WatchEvent[] = [];
      bridge._pushExtractResult({ data: { price: '$29.99' } });

      const watch = manager.startWatch('tab-1', {
        selector: '.product',
        fields: { price: '.price' },
      });
      manager.addListener(watch.watchId, (e) => events.push(e));

      // The immediate poll runs as a microtask
      await vi.advanceTimersByTimeAsync(0);

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].watchId).toBe(watch.watchId);
      expect(events[0].changes).toEqual([]); // first snapshot, no changes
    });

    it('emits change events when data changes', async () => {
      const events: WatchEvent[] = [];
      bridge._pushExtractResult({ data: { price: '$29.99' } });
      bridge._pushExtractResult({ data: { price: '$19.99' } });

      const watch = manager.startWatch('tab-1', {
        selector: '.product',
        fields: { price: '.price' },
        interval: 1000,
      });
      manager.addListener(watch.watchId, (e) => events.push(e));

      // First poll (immediate)
      await vi.advanceTimersByTimeAsync(0);
      // Second poll (after interval)
      await vi.advanceTimersByTimeAsync(1000);

      expect(events.length).toBe(2);
      expect(events[1].changes.length).toBeGreaterThan(0);
      expect(events[1].changes[0].field).toBe('price');
      expect(events[1].changes[0].old).toBe('$29.99');
      expect(events[1].changes[0].new).toBe('$19.99');
    });

    it('does not emit when data is unchanged', async () => {
      const events: WatchEvent[] = [];
      bridge._pushExtractResult({ data: { price: '$29.99' } });
      bridge._pushExtractResult({ data: { price: '$29.99' } });

      const watch = manager.startWatch('tab-1', {
        selector: '.product',
        fields: { price: '.price' },
        interval: 1000,
      });
      manager.addListener(watch.watchId, (e) => events.push(e));

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      // Only the initial snapshot event
      expect(events.length).toBe(1);
    });
  });

  describe('listener management', () => {
    it('supports multiple listeners', async () => {
      const events1: WatchEvent[] = [];
      const events2: WatchEvent[] = [];

      const watch = manager.startWatch('tab-1', { selector: '.price' });
      manager.addListener(watch.watchId, (e) => events1.push(e));
      manager.addListener(watch.watchId, (e) => events2.push(e));

      await vi.advanceTimersByTimeAsync(0);

      expect(events1.length).toBe(1);
      expect(events2.length).toBe(1);
    });

    it('auto-stops watch when last listener is removed', () => {
      const watch = manager.startWatch('tab-1', { selector: '.price' });
      const listener = () => {};
      manager.addListener(watch.watchId, listener);
      manager.removeListener(watch.watchId, listener);
      expect(manager.getWatch(watch.watchId)).toBeUndefined();
    });
  });

  describe('stopAll', () => {
    it('stops all watches', () => {
      manager.startWatch('tab-1', { selector: '.a' });
      manager.startWatch('tab-2', { selector: '.b' });
      manager.stopAll();
      expect(manager.listAll()).toHaveLength(0);
    });
  });
});
