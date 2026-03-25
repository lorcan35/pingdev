import { useCallback, useEffect, useMemo, useState } from 'react';
import * as gw from '../lib/gw';
import {
  HeartPulse,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Search,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type SortField = 'confidence' | 'timestamp';
type SortDir = 'asc' | 'desc';

interface CacheRow extends gw.HealCacheEntry {
  id: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SelfHealConsolePage() {
  // stats
  const [stats, setStats] = useState<gw.HealStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // cache
  const [cache, setCache] = useState<CacheRow[]>([]);
  const [loadingCache, setLoadingCache] = useState(true);

  // table controls
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterOp, setFilterOp] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Load data ────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await gw.healStats();
      setStats(res);
    } catch {
      /* ignore */
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadCache = useCallback(async () => {
    setLoadingCache(true);
    try {
      const res = await gw.healCache();
      const rows: CacheRow[] = Object.entries(res).map(([key, entry]) => ({
        id: key,
        ...entry,
      }));
      setCache(rows);
    } catch {
      /* ignore */
    } finally {
      setLoadingCache(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadCache();
  }, [loadStats, loadCache]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const successRate = stats
    ? stats.totalAttempts > 0
      ? ((stats.successes / stats.totalAttempts) * 100).toFixed(1)
      : '0.0'
    : null;

  const successRateNum = successRate ? parseFloat(successRate) : 0;

  const opTypes = useMemo(() => {
    const ops = new Set<string>();
    cache.forEach((r) => {
      if (r.op) ops.add(r.op);
    });
    return Array.from(ops).sort();
  }, [cache]);

  const filteredCache = useMemo(() => {
    let rows = [...cache];

    if (filterOp) {
      rows = rows.filter((r) => r.op === filterOp);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.original.toLowerCase().includes(q) ||
          r.healed.toLowerCase().includes(q) ||
          (r.op && r.op.toLowerCase().includes(q)),
      );
    }

    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [cache, filterOp, searchQuery, sortField, sortDir]);

  // ── Sort handler ─────────────────────────────────────────────────────────

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  // ── Stat card helper ─────────────────────────────────────────────────────

  function StatCard({
    label,
    value,
    color = 'text-fg',
  }: {
    label: string;
    value: string | number;
    color?: string;
  }) {
    return (
      <div className="rounded-lg border border-border bg-bg p-4 flex flex-col gap-1">
        <span className="text-xs text-muted uppercase tracking-wider">
          {label}
        </span>
        <span className={`text-2xl font-semibold font-mono ${color}`}>
          {value}
        </span>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-accent-cyan" />
            Self-Heal Console
          </h1>
          <p className="text-muted text-sm mt-1">
            Selector healing statistics and cache browser.
          </p>
        </div>
        <button
          onClick={() => {
            loadStats();
            loadCache();
          }}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* ── Stats Panel ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <h2 className="text-lg font-medium text-fg">Healing Stats</h2>

        {loadingStats ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading stats...
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label="Total Attempts"
                value={stats.totalAttempts.toLocaleString()}
              />
              <StatCard
                label="Successes"
                value={stats.successes.toLocaleString()}
                color="text-accent-green"
              />
              <StatCard
                label="Failures"
                value={stats.failures.toLocaleString()}
                color={stats.failures > 0 ? 'text-health-offline' : 'text-fg'}
              />
              <StatCard
                label="Cache Hits"
                value={stats.cacheHits.toLocaleString()}
                color="text-accent-cyan"
              />
              <StatCard
                label="Avg Confidence"
                value={`${(stats.avgConfidence * 100).toFixed(1)}%`}
                color="text-health-degraded"
              />
            </div>

            {/* Success rate bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Success Rate</span>
                <span
                  className={`font-mono font-semibold ${
                    successRateNum >= 80
                      ? 'text-accent-green'
                      : successRateNum >= 50
                        ? 'text-health-degraded'
                        : 'text-health-offline'
                  }`}
                >
                  {successRate}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-bg border border-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    successRateNum >= 80
                      ? 'bg-accent-green'
                      : successRateNum >= 50
                        ? 'bg-health-degraded'
                        : 'bg-health-offline'
                  }`}
                  style={{ width: `${Math.min(successRateNum, 100)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-dim py-6 text-center">
            Unable to load stats.
          </div>
        )}
      </section>

      {/* ── Cache Browser ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-medium text-fg">Heal Cache</h2>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search selectors..."
                className="rounded-lg border border-border bg-bg pl-8 pr-3 py-1.5 text-xs text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan w-48"
              />
            </div>

            {/* Op filter */}
            {opTypes.length > 0 && (
              <select
                value={filterOp}
                onChange={(e) => setFilterOp(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent-cyan"
              >
                <option value="">All ops</option>
                {opTypes.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            )}

            <span className="text-xs text-dim">
              {filteredCache.length} entries
            </span>
          </div>
        </div>

        {loadingCache ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading cache...
          </div>
        ) : cache.length === 0 ? (
          <div className="text-sm text-dim py-6 text-center">
            No cached heal entries.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted uppercase tracking-wider">
                  <th className="text-left py-2 px-3 font-medium">
                    Original Selector
                  </th>
                  <th className="text-left py-2 px-3 font-medium">
                    Healed Selector
                  </th>
                  <th className="text-left py-2 px-3 font-medium">
                    Op
                  </th>
                  <th
                    className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:text-fg transition"
                    onClick={() => toggleSort('confidence')}
                  >
                    <span className="flex items-center gap-1">
                      Confidence
                      <ArrowUpDown className="w-3 h-3" />
                      {sortField === 'confidence' && (
                        <span className="text-accent-cyan text-[10px]">
                          {sortDir === 'asc' ? 'ASC' : 'DESC'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th
                    className="text-left py-2 px-3 font-medium cursor-pointer select-none hover:text-fg transition"
                    onClick={() => toggleSort('timestamp')}
                  >
                    <span className="flex items-center gap-1">
                      Time
                      <ArrowUpDown className="w-3 h-3" />
                      {sortField === 'timestamp' && (
                        <span className="text-accent-cyan text-[10px]">
                          {sortDir === 'asc' ? 'ASC' : 'DESC'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filteredCache.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const confidencePct = (row.confidence * 100).toFixed(0);
                  const confidenceColor =
                    row.confidence >= 0.8
                      ? 'text-accent-green'
                      : row.confidence >= 0.5
                        ? 'text-health-degraded'
                        : 'text-health-offline';

                  return (
                    <tr key={row.id} className="group">
                      <td colSpan={6} className="p-0">
                        <div
                          className="flex items-center cursor-pointer hover:bg-bg/50 transition border-b border-border"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : row.id)
                          }
                        >
                          <div className="flex-1 grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center">
                            <div className="py-2.5 px-3 font-mono text-xs text-fg truncate max-w-[220px]">
                              {row.original}
                            </div>
                            <div className="py-2.5 px-3 font-mono text-xs text-accent-cyan truncate max-w-[220px]">
                              {row.healed}
                            </div>
                            <div className="py-2.5 px-3 text-xs text-muted w-20">
                              {row.op || '-'}
                            </div>
                            <div
                              className={`py-2.5 px-3 text-xs font-mono font-medium w-24 ${confidenceColor}`}
                            >
                              {confidencePct}%
                            </div>
                            <div className="py-2.5 px-3 text-xs text-dim w-36">
                              {new Date(row.timestamp).toLocaleString(
                                undefined,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </div>
                            <div className="py-2.5 px-3 w-8">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-dim group-hover:text-muted transition" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="bg-bg/50 border-b border-border px-6 py-4 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <span className="text-xs text-muted uppercase tracking-wider block mb-1">
                                  Original Selector
                                </span>
                                <code className="block text-xs font-mono text-fg bg-bg rounded p-2 break-all border border-border">
                                  {row.original}
                                </code>
                              </div>
                              <div>
                                <span className="text-xs text-muted uppercase tracking-wider block mb-1">
                                  Healed Selector
                                </span>
                                <code className="block text-xs font-mono text-accent-cyan bg-bg rounded p-2 break-all border border-border">
                                  {row.healed}
                                </code>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-4 text-xs">
                              <div>
                                <span className="text-muted">Confidence</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        row.confidence >= 0.8
                                          ? 'bg-accent-green'
                                          : row.confidence >= 0.5
                                            ? 'bg-health-degraded'
                                            : 'bg-health-offline'
                                      }`}
                                      style={{
                                        width: `${row.confidence * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <span
                                    className={`font-mono font-medium ${confidenceColor}`}
                                  >
                                    {(row.confidence * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="text-muted">Operation</span>
                                <p className="font-mono text-fg mt-1">
                                  {row.op || 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted">Timestamp</span>
                                <p className="font-mono text-fg mt-1">
                                  {new Date(row.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted">Cache Key</span>
                                <p className="font-mono text-fg mt-1 truncate">
                                  {row.id}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
