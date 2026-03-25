import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Clock,
  Eye,
  FileText,
  Heart,
  Laptop,
  Loader2,
  Radio,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Unified log entry
// ---------------------------------------------------------------------------

type LogType = 'device' | 'health' | 'heal' | 'watch' | 'recording' | 'template';

interface LogEntry {
  id: string;
  ts: number;        // epoch ms
  type: LogType;
  title: string;
  detail?: string;
  status: 'ok' | 'warn' | 'error' | 'info';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeIcon(type: LogType) {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'device':    return <Laptop className={cls} />;
    case 'health':    return <Heart className={cls} />;
    case 'heal':      return <Wrench className={cls} />;
    case 'watch':     return <Eye className={cls} />;
    case 'recording': return <Radio className={cls} />;
    case 'template':  return <FileText className={cls} />;
  }
}

function statusColor(status: LogEntry['status']) {
  switch (status) {
    case 'ok':    return 'text-emerald-400';
    case 'warn':  return 'text-amber-400';
    case 'error': return 'text-red-400';
    case 'info':  return 'text-sky-400';
  }
}

function statusDot(status: LogEntry['status']) {
  switch (status) {
    case 'ok':    return 'bg-emerald-400';
    case 'warn':  return 'bg-amber-400';
    case 'error': return 'bg-red-400';
    case 'info':  return 'bg-sky-400';
  }
}

function typeBadge(type: LogType) {
  const map: Record<LogType, string> = {
    device:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
    health:    'bg-rose-500/20 text-rose-300 border-rose-500/30',
    heal:      'bg-amber-500/20 text-amber-300 border-amber-500/30',
    watch:     'bg-sky-500/20 text-sky-300 border-sky-500/30',
    recording: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
    template:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  };
  return map[type];
}

function formatTs(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour12: false, fractionalSecondDigits: 3 });
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ago(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Data fetcher — collects all sources into LogEntry[]
// ---------------------------------------------------------------------------

async function fetchAllLogs(
  prevDeviceIds: Set<string>,
  prevHealth: gw.HealthResponse | null,
): Promise<{ entries: LogEntry[]; deviceIds: Set<string>; health: gw.HealthResponse | null }> {
  const [devRes, healthRes, healRes, watchRes, recRes, tplRes] = await Promise.allSettled([
    gw.devices(),
    gw.health(),
    gw.healCache(),
    gw.listWatches(),
    gw.listRecordings(),
    gw.listTemplates(),
  ]);

  const entries: LogEntry[] = [];
  const now = Date.now();
  let currentDeviceIds = new Set<string>();
  let currentHealth: gw.HealthResponse | null = null;

  // -- Devices ---------------------------------------------------------------
  if (devRes.status === 'fulfilled') {
    const allDevices = devRes.value.extension?.devices ?? [];
    currentDeviceIds = new Set(allDevices.map(d => d.deviceId));

    for (const dev of allDevices) {
      const isNew = !prevDeviceIds.has(dev.deviceId);
      entries.push({
        id: `dev-${dev.deviceId}`,
        ts: now,
        type: 'device',
        title: isNew && prevDeviceIds.size > 0
          ? `Device connected: ${dev.deviceId}`
          : `Device active: ${dev.deviceId}`,
        detail: dev.title ? `${dev.title} — ${dev.url}` : dev.url,
        status: isNew && prevDeviceIds.size > 0 ? 'ok' : 'info',
      });
    }

    // Disconnected devices
    for (const oldId of prevDeviceIds) {
      if (!currentDeviceIds.has(oldId)) {
        entries.push({
          id: `dev-disc-${oldId}-${now}`,
          ts: now,
          type: 'device',
          title: `Device disconnected: ${oldId}`,
          status: 'warn',
        });
      }
    }
  }

  // -- Health ----------------------------------------------------------------
  if (healthRes.status === 'fulfilled') {
    const h = healthRes.value;
    currentHealth = h;

    entries.push({
      id: `health-${now}`,
      ts: now,
      type: 'health',
      title: `Gateway ${h.status}`,
      detail: [
        h.version && `v${h.version}`,
        h.uptime != null && `uptime ${Math.floor(h.uptime / 60)}m`,
        h.extension != null && `ext: ${h.extension ? 'connected' : 'disconnected'}`,
        h.llm != null && `llm: ${h.llm ? 'ready' : 'offline'}`,
      ].filter(Boolean).join(' | '),
      status: (h.status === 'ok' || h.status === 'healthy') ? 'ok' : h.status === 'degraded' ? 'warn' : 'error',
    });

    // Detect changes from previous health
    if (prevHealth) {
      if (prevHealth.extension !== h.extension) {
        entries.push({
          id: `health-ext-${now}`,
          ts: now,
          type: 'health',
          title: h.extension ? 'Extension reconnected' : 'Extension disconnected',
          status: h.extension ? 'ok' : 'error',
        });
      }
      if (prevHealth.llm !== h.llm) {
        entries.push({
          id: `health-llm-${now}`,
          ts: now,
          type: 'health',
          title: h.llm ? 'LLM provider online' : 'LLM provider offline',
          status: h.llm ? 'ok' : 'error',
        });
      }
    }
  }

  // -- Heal cache ------------------------------------------------------------
  if (healRes.status === 'fulfilled') {
    const cache = healRes.value;
    for (const [key, entry] of Object.entries(cache)) {
      entries.push({
        id: `heal-${key}-${entry.timestamp}`,
        ts: entry.timestamp,
        type: 'heal',
        title: `Healed selector${entry.op ? ` (${entry.op})` : ''}`,
        detail: `"${entry.original}" -> "${entry.healed}" (${(entry.confidence * 100).toFixed(0)}% confidence)`,
        status: entry.confidence >= 0.8 ? 'ok' : entry.confidence >= 0.5 ? 'warn' : 'error',
      });
    }
  }

  // -- Watches ---------------------------------------------------------------
  if (watchRes.status === 'fulfilled') {
    const watches = watchRes.value.watches ?? [];
    for (const w of watches) {
      const createdTs = w.createdAt ? new Date(w.createdAt).getTime() : now;
      entries.push({
        id: `watch-${w.watchId}`,
        ts: createdTs,
        type: 'watch',
        title: `Watch active: ${w.selector}`,
        detail: [
          `device: ${w.deviceId}`,
          w.interval && `interval: ${w.interval}ms`,
          w.fields && `fields: ${Object.keys(w.fields).join(', ')}`,
        ].filter(Boolean).join(' | '),
        status: 'info',
      });
    }
  }

  // -- Recordings ------------------------------------------------------------
  if (recRes.status === 'fulfilled') {
    const recs = recRes.value.recordings ?? [];
    for (const r of recs) {
      entries.push({
        id: `rec-${r.id}`,
        ts: r.startedAt,
        type: 'recording',
        title: `Recording: ${r.id}`,
        detail: `${r.actionCount} actions — ${r.url}`,
        status: 'info',
      });
    }
  }

  // -- Templates -------------------------------------------------------------
  if (tplRes.status === 'fulfilled') {
    const templates = tplRes.value.templates ?? [];
    for (const t of templates) {
      const learnedTs = t.learnedAt ? new Date(t.learnedAt).getTime() : now;
      entries.push({
        id: `tpl-${t.domain}`,
        ts: learnedTs,
        type: 'template',
        title: `Template: ${t.domain}`,
        detail: `fields: ${Object.keys(t.fields).join(', ')}`,
        status: 'ok',
      });
    }
  }

  // Sort newest first
  entries.sort((a, b) => b.ts - a.ts);

  return { entries, deviceIds: currentDeviceIds, health: currentHealth };
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const ALL_TYPES: LogType[] = ['device', 'health', 'heal', 'watch', 'recording', 'template'];

function FilterBar({
  active,
  toggle,
  counts,
}: {
  active: Set<LogType>;
  toggle: (t: LogType) => void;
  counts: Record<LogType, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.map(t => {
        const on = active.has(t);
        return (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border transition-all duration-150
              ${on ? typeBadge(t) : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:border-zinc-600'}
            `}
          >
            {typeIcon(t)}
            <span className="capitalize">{t}</span>
            <span className="ml-1 tabular-nums opacity-70">{counts[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<LogType>>(new Set(ALL_TYPES));
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  const deviceIdsRef = useRef<Set<string>>(new Set());
  const healthRef = useRef<gw.HealthResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchAllLogs(deviceIdsRef.current, healthRef.current);
      setEntries(result.entries);
      deviceIdsRef.current = result.deviceIds;
      healthRef.current = result.health;
      setLastRefresh(Date.now());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + interval polling
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (!paused) refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [refresh, paused]);

  const toggleType = useCallback((t: LogType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }, []);

  const filtered = entries.filter(e => activeTypes.has(e.type));

  const counts = ALL_TYPES.reduce((acc, t) => {
    acc[t] = entries.filter(e => e.type === t).length;
    return acc;
  }, {} as Record<LogType, number>);

  // Group entries by date
  const grouped = filtered.reduce<Record<string, LogEntry[]>>((acc, e) => {
    const key = formatDate(e.ts);
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-sky-400" />
            System Logs
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Unified timeline of gateway activity — auto-refreshes every 5s
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-zinc-600 tabular-nums">
            {ago(lastRefresh)}
          </span>
          <button
            onClick={() => setPaused(p => !p)}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${paused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500'}
            `}
          >
            {paused ? 'Paused' : 'Live'}
          </button>
          <button
            onClick={() => { setLoading(true); refresh(); }}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-all disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              : <RefreshCw className="w-4 h-4 text-zinc-400" />}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ALL_TYPES.map(t => (
          <div
            key={t}
            className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-4 py-3 flex items-center gap-3"
          >
            <div className={statusColor(counts[t] > 0 ? 'info' : 'warn')}>
              {typeIcon(t)}
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{counts[t]}</div>
              <div className="text-xs text-zinc-500 capitalize">{t}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar active={activeTypes} toggle={toggleType} counts={counts} />

      {/* Timeline */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          <span className="ml-3 text-zinc-500">Loading system logs...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <div className="font-medium">No log entries</div>
          <div className="text-sm mt-1">Adjust filters or wait for activity</div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm py-2 mb-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {date}
                  <span className="text-zinc-700">({items.length})</span>
                </div>
              </div>
              <div className="space-y-1">
                {items.map(entry => (
                  <div
                    key={entry.id}
                    className="group flex items-start gap-3 px-4 py-2.5 rounded-lg
                      bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 transition-all"
                  >
                    {/* Status dot */}
                    <div className="pt-1.5">
                      <div className={`w-2 h-2 rounded-full ${statusDot(entry.status)}`} />
                    </div>

                    {/* Icon */}
                    <div className={`pt-0.5 ${statusColor(entry.status)}`}>
                      {typeIcon(entry.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`
                          inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold
                          uppercase tracking-wider border ${typeBadge(entry.type)}
                        `}>
                          {entry.type}
                        </span>
                        <span className="text-sm font-medium text-zinc-200 truncate">
                          {entry.title}
                        </span>
                      </div>
                      {entry.detail && (
                        <div className="text-xs text-zinc-500 mt-0.5 truncate">
                          {entry.detail}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="text-[11px] tabular-nums text-zinc-600 shrink-0 pt-0.5">
                      {formatTs(entry.ts)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
