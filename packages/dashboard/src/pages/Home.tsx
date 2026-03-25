import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Eye,
  Globe,
  Heart,
  Layers,
  Monitor,
  Search,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import * as gw from '../lib/gw';

// ---------------------------------------------------------------------------
// Types for local state
// ---------------------------------------------------------------------------

interface DashState {
  health: gw.HealthResponse | null;
  healthOk: boolean;
  devices: gw.Device[];
  appCount: number;
  watchCount: number;
  healStats: gw.HealStats | null;
}

const EMPTY: DashState = {
  health: null,
  healthOk: false,
  devices: [],
  appCount: 0,
  watchCount: 0,
  healStats: null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomePage() {
  const [state, setState] = useState<DashState>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Quick-extract state
  const [selectedDevice, setSelectedDevice] = useState('');
  const [extractQuery, setExtractQuery] = useState('');
  const [extractResult, setExtractResult] = useState<unknown | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all dashboard data
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      gw.health(),
      gw.devices(),
      gw.listApps(),
      gw.listWatches(),
      gw.healStats(),
    ]);

    const h = results[0].status === 'fulfilled' ? results[0].value : null;
    const devRes = results[1].status === 'fulfilled' ? results[1].value : null;
    const apps = results[2].status === 'fulfilled' ? results[2].value : [];
    const watches = results[3].status === 'fulfilled' ? results[3].value : null;
    const heal = results[4].status === 'fulfilled' ? results[4].value : null;

    const deviceList = devRes?.extension?.devices ?? [];

    setState({
      health: h,
      healthOk: h?.status === 'healthy' || h?.status === 'ok',
      devices: deviceList,
      appCount: Array.isArray(apps) ? apps.length : ((apps as any)?.apps?.length ?? 0),
      watchCount: watches?.watches?.length ?? 0,
      healStats: heal,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  // Auto-select first device
  useEffect(() => {
    if (!selectedDevice && state.devices.length > 0) {
      setSelectedDevice(state.devices[0].deviceId);
    }
  }, [state.devices, selectedDevice]);

  // Quick extract handler
  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDevice || !extractQuery.trim()) return;
    setExtracting(true);
    setExtractResult(null);
    setExtractError('');
    try {
      const res = await gw.extractSemantic(selectedDevice, extractQuery.trim());
      setExtractResult(res);
    } catch (err: any) {
      setExtractError(err?.message ?? 'Extract failed');
    } finally {
      setExtracting(false);
    }
  }

  // Heal success rate
  const healRate =
    state.healStats && state.healStats.totalAttempts > 0
      ? Math.round((state.healStats.successes / state.healStats.totalAttempts) * 100)
      : null;

  // Favicon helper
  function faviconUrl(pageUrl: string) {
    try {
      const u = new URL(pageUrl);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            PingOS Command Center
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Real-time overview of your browser automation fleet
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.healthOk ? (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              Gateway Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-400 text-sm font-medium">
              <XCircle className="w-4 h-4" />
              {loading ? 'Connecting...' : 'Gateway Offline'}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Gateway health */}
        <StatCard
          icon={<Heart className="w-5 h-5" />}
          label="Gateway"
          value={state.healthOk ? 'Healthy' : 'Down'}
          sub={state.health?.version ? `v${state.health.version}` : undefined}
          color={state.healthOk ? 'emerald' : 'red'}
        />
        {/* Devices */}
        <StatCard
          icon={<Monitor className="w-5 h-5" />}
          label="Live Devices"
          value={String(state.devices.length)}
          sub="connected tabs"
          color="sky"
        />
        {/* PingApps */}
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          label="PingApps"
          value={String(state.appCount)}
          sub="available"
          color="violet"
        />
        {/* Watches */}
        <StatCard
          icon={<Eye className="w-5 h-5" />}
          label="Active Watches"
          value={String(state.watchCount)}
          sub="monitoring"
          color="amber"
        />
      </div>

      {/* Self-heal stats */}
      {state.healStats && state.healStats.totalAttempts > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-fuchsia-400" />
            <h2 className="font-semibold text-sm text-zinc-300">Self-Heal Engine</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <MiniStat label="Attempts" value={state.healStats.totalAttempts} />
            <MiniStat label="Successes" value={state.healStats.successes} />
            <MiniStat label="Failures" value={state.healStats.failures} />
            <MiniStat label="Cache Hits" value={state.healStats.cacheHits} />
            <MiniStat
              label="Success Rate"
              value={healRate !== null ? `${healRate}%` : '—'}
              highlight={healRate !== null && healRate >= 80}
            />
          </div>
        </div>
      )}

      {/* Device grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Live Device Grid
          </h2>
          <Link
            to="/devices"
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            All devices <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {state.devices.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <Monitor className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No devices connected</p>
            <p className="text-zinc-600 text-xs mt-1">
              Install the PingOS extension and open a browser tab
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {state.devices.map((d) => (
              <Link
                key={`${d.deviceId}-${d.tabId}`}
                to={`/devices`}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-600 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  {faviconUrl(d.url) ? (
                    <img
                      src={faviconUrl(d.url)}
                      alt=""
                      className="w-6 h-6 rounded mt-0.5 shrink-0"
                    />
                  ) : (
                    <Globe className="w-6 h-6 text-zinc-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate group-hover:text-sky-300 transition-colors">
                      {d.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{d.url}</p>
                    <p className="text-[10px] text-zinc-600 font-mono mt-1">
                      {d.deviceId}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Extract */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-sky-400" />
          <h2 className="font-semibold text-sm text-zinc-300">Quick Extract</h2>
        </div>

        <form onSubmit={handleExtract} className="flex flex-col sm:flex-row gap-3">
          <select
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-500 sm:w-52"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            {state.devices.length === 0 && (
              <option value="">No devices</option>
            )}
            {state.devices.map((d) => (
              <option key={`${d.deviceId}-${d.tabId}`} value={d.deviceId}>
                {d.title ? `${d.title.slice(0, 30)}` : d.deviceId.slice(0, 16)}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
            placeholder="e.g. Get all product names and prices"
            value={extractQuery}
            onChange={(e) => setExtractQuery(e.target.value)}
          />

          <button
            type="submit"
            disabled={extracting || !selectedDevice || !extractQuery.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {extracting ? 'Extracting...' : 'Extract'}
          </button>
        </form>

        {extractError && (
          <div className="mt-3 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-xs">
            {extractError}
          </div>
        )}

        {extractResult != null && (
          <div className="mt-3 p-3 rounded-lg bg-zinc-800 border border-zinc-700 overflow-auto max-h-64">
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap">
              {JSON.stringify(extractResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold text-sm text-zinc-400 uppercase tracking-wider flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4" />
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <QuickLink to="/devices" label="Devices" icon={<Monitor className="w-4 h-4" />} />
          <QuickLink to="/extract" label="Extract" icon={<Search className="w-4 h-4" />} />
          <QuickLink to="/apps" label="PingApps" icon={<Layers className="w-4 h-4" />} />
          <QuickLink to="/automation" label="Automation" icon={<Zap className="w-4 h-4" />} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
    sky: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    violet: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  };
  const cls = colorMap[color] ?? colorMap.sky;

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-2 opacity-80">{icon}<span className="text-xs font-medium">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className={`text-lg font-bold ${highlight ? 'text-emerald-400' : 'text-zinc-200'}`}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function QuickLink({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-750 transition-colors text-sm text-zinc-300 hover:text-zinc-100"
    >
      {icon}
      {label}
      <ArrowRight className="w-3 h-3 ml-1 opacity-40" />
    </Link>
  );
}
