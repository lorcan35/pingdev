import { useCallback, useEffect, useRef, useState } from 'react';
import * as gw from '../lib/gw';
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Loader2,
  Radio,
  Clock,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface WatchEvent {
  ts: number;
  watchId: string;
  data: any;
}

// ── Component ────────────────────────────────────────────────────────────────

export function WatchTowerPage() {
  // devices
  const [devices, setDevices] = useState<gw.Device[]>([]);

  // watches
  const [watches, setWatches] = useState<gw.WatchInfo[]>([]);
  const [loadingWatches, setLoadingWatches] = useState(true);
  const [stoppingId, setStoppingId] = useState('');

  // new watch form
  const [showForm, setShowForm] = useState(false);
  const [formDevice, setFormDevice] = useState('');
  const [formSelector, setFormSelector] = useState('');
  const [formInterval, setFormInterval] = useState('5000');
  const [formFieldPairs, setFormFieldPairs] = useState('');
  const [creating, setCreating] = useState(false);

  // events
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const unsubs = useRef<Map<string, () => void>>(new Map());
  const eventListRef = useRef<HTMLDivElement>(null);

  // error
  const [error, setError] = useState('');

  // ── Load devices ─────────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    try {
      const res = await gw.devices();
      const devs = res.extension?.devices ?? [];
      setDevices(devs);
      if (devs.length > 0 && !formDevice) {
        setFormDevice(devs[0].deviceId);
      }
    } catch {
      /* ignore */
    }
  }, [formDevice]);

  // ── Load watches ─────────────────────────────────────────────────────────

  const loadWatches = useCallback(async () => {
    try {
      const res = await gw.listWatches();
      setWatches(res.watches ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingWatches(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    loadWatches();
  }, [loadDevices, loadWatches]);

  // ── Subscribe to watch events ────────────────────────────────────────────

  const subscribeToWatch = useCallback(
    (watchId: string) => {
      if (unsubs.current.has(watchId)) return;
      const unsub = gw.subscribeWatch(watchId, (data) => {
        setEvents((prev) => {
          const next = [
            { ts: Date.now(), watchId, data },
            ...prev,
          ];
          return next.slice(0, 200); // keep last 200
        });
      });
      unsubs.current.set(watchId, unsub);
    },
    [],
  );

  // auto-subscribe to all active watches
  useEffect(() => {
    watches.forEach((w) => subscribeToWatch(w.watchId));
  }, [watches, subscribeToWatch]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      unsubs.current.forEach((fn) => fn());
      unsubs.current.clear();
    };
  }, []);

  // ── Create watch ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!formDevice || !formSelector.trim()) return;
    setCreating(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      if (formFieldPairs.trim()) {
        formFieldPairs
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .forEach((pair) => {
            const [k, v] = pair.split('=').map((s) => s.trim());
            if (k && v) fields[k] = v;
          });
      }
      const interval = parseInt(formInterval, 10) || undefined;
      await gw.startWatch(
        formDevice,
        formSelector.trim(),
        Object.keys(fields).length > 0 ? fields : undefined,
        interval,
      );
      await loadWatches();
      setShowForm(false);
      setFormSelector('');
      setFormFieldPairs('');
      setFormInterval('5000');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Stop watch ───────────────────────────────────────────────────────────

  async function handleStop(watchId: string) {
    setStoppingId(watchId);
    try {
      // unsubscribe SSE
      const unsub = unsubs.current.get(watchId);
      if (unsub) {
        unsub();
        unsubs.current.delete(watchId);
      }
      await gw.stopWatch(watchId);
      await loadWatches();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStoppingId('');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg flex items-center gap-2">
            <Eye className="w-6 h-6 text-accent-cyan" />
            Watch Tower
          </h1>
          <p className="text-muted text-sm mt-1">
            Real-time DOM monitoring &amp; change detection.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-4 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 transition"
        >
          <Plus className="w-4 h-4" />
          New Watch
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-health-offline/30 bg-health-offline/10 px-4 py-3 text-sm text-health-offline flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── New Watch Form ────────────────────────────────────────────────── */}
      {showForm && (
        <section className="rounded-xl border border-accent-cyan/25 bg-surface p-6 space-y-4">
          <h2 className="text-lg font-medium text-fg">Create Watch</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted uppercase tracking-wider">
                Device
              </span>
              <select
                value={formDevice}
                onChange={(e) => setFormDevice(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent-cyan"
              >
                {devices.length === 0 && (
                  <option value="">No devices</option>
                )}
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.title || d.url || d.deviceId}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted uppercase tracking-wider">
                CSS Selector
              </span>
              <input
                value={formSelector}
                onChange={(e) => setFormSelector(e.target.value)}
                placeholder=".price, #stock-count"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted uppercase tracking-wider">
                Fields (key=value, comma-separated)
              </span>
              <input
                value={formFieldPairs}
                onChange={(e) => setFormFieldPairs(e.target.value)}
                placeholder="price=.price-tag, stock=.qty"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted uppercase tracking-wider">
                Interval (ms)
              </span>
              <input
                type="number"
                value={formInterval}
                onChange={(e) => setFormInterval(e.target.value)}
                placeholder="5000"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
              />
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !formDevice || !formSelector.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-green/15 border border-accent-green/30 px-5 py-2 text-sm font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              Start Watch
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-fg transition"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Active Watches ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-fg flex items-center gap-2">
            <Radio className="w-5 h-5 text-accent-green" />
            Active Watches
            {watches.length > 0 && (
              <span className="text-xs bg-accent-green/15 text-accent-green px-2 py-0.5 rounded-full">
                {watches.length}
              </span>
            )}
          </h2>
          <button
            onClick={loadWatches}
            className="text-xs text-muted hover:text-fg transition"
          >
            refresh
          </button>
        </div>

        {loadingWatches ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading watches...
          </div>
        ) : watches.length === 0 ? (
          <div className="text-sm text-dim py-6 text-center">
            No active watches. Click &quot;New Watch&quot; to create one.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {watches.map((w) => (
              <div
                key={w.watchId}
                className="rounded-lg border border-border bg-bg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-accent-cyan truncate">
                      {w.selector}
                    </p>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {w.deviceId}
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-accent-green mt-1.5 shrink-0 animate-pulse" />
                </div>

                <div className="text-xs text-dim space-y-1">
                  <p>
                    <span className="text-muted">ID:</span>{' '}
                    <span className="font-mono">{w.watchId}</span>
                  </p>
                  {w.interval && (
                    <p>
                      <span className="text-muted">Interval:</span> {w.interval}ms
                    </p>
                  )}
                  {w.fields && Object.keys(w.fields).length > 0 && (
                    <p>
                      <span className="text-muted">Fields:</span>{' '}
                      {Object.entries(w.fields)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleStop(w.watchId)}
                  disabled={stoppingId === w.watchId}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md bg-health-offline/10 border border-health-offline/25 px-3 py-1.5 text-xs font-medium text-health-offline hover:bg-health-offline/20 disabled:opacity-50 transition"
                >
                  {stoppingId === w.watchId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Event Log ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-fg flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-cyan" />
            Event Log
            {events.length > 0 && (
              <span className="text-xs bg-border text-muted px-2 py-0.5 rounded-full">
                {events.length}
              </span>
            )}
          </h2>
          {events.length > 0 && (
            <button
              onClick={() => setEvents([])}
              className="flex items-center gap-1 text-xs text-muted hover:text-fg transition"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <div
          ref={eventListRef}
          className="max-h-96 overflow-y-auto space-y-2 scrollbar-thin"
        >
          {events.length === 0 ? (
            <div className="text-sm text-dim py-6 text-center">
              Waiting for events... Watches will stream changes here.
            </div>
          ) : (
            events.map((evt, i) => (
              <div
                key={`${evt.ts}-${i}`}
                className="rounded-lg border border-border bg-bg p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-accent-cyan">
                    {evt.watchId}
                  </span>
                  <span className="text-dim">
                    {new Date(evt.ts).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <pre className="text-xs font-mono text-fg whitespace-pre-wrap overflow-auto max-h-32">
                  {typeof evt.data === 'string'
                    ? evt.data
                    : JSON.stringify(evt.data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
